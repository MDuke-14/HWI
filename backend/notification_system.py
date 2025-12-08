import asyncio
from datetime import datetime, timezone, timedelta, time
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

class NotificationSystem:
    def __init__(self, db):
        self.db = db
        self.smtp_host = os.environ.get('SMTP_HOST', 'smtp.office365.com')
        self.smtp_port = int(os.environ.get('SMTP_PORT', '587'))
        self.smtp_user = os.environ.get('SMTP_USER', '')
        self.smtp_password = os.environ.get('SMTP_PASSWORD', '')
        self.smtp_from = os.environ.get('SMTP_FROM', self.smtp_user)
    
    async def check_morning_clock_in(self):
        """Verificar se usuários iniciaram ponto às 9h (segunda a sexta)"""
        now = datetime.now(timezone.utc)
        today = now.date()
        
        # Apenas em dias úteis (segunda a sexta)
        if now.weekday() >= 5:  # 5=sábado, 6=domingo
            return []
        
        # Verificar apenas entre 9h00 e 9h30
        current_time = now.time()
        if not (time(9, 0) <= current_time <= time(9, 30)):
            return []
        
        # Buscar todos os usuários não-admin
        users = await self.db.users.find({"is_admin": {"$ne": True}}).to_list(length=None)
        
        notifications = []
        for user in users:
            # Verificar se tem entrada de hoje
            entry = await self.db.time_entries.find_one({
                "user_id": user["id"],
                "date": today.isoformat()
            })
            
            if not entry or not entry.get("entries") or len(entry["entries"]) == 0:
                # Usuário não iniciou ponto hoje
                notifications.append({
                    "user_id": user["id"],
                    "username": user["username"],
                    "type": "missing_clock_in",
                    "title": "Lembrete de Ponto",
                    "message": "Não se esqueça de iniciar o seu ponto de trabalho!",
                    "priority": "high"
                })
        
        return notifications
    
    async def check_long_breaks(self):
        """Verificar se há pausas superiores a 1h00 entre entradas"""
        now = datetime.now(timezone.utc)
        today = now.date()
        
        # Buscar entradas ativas (com última entrada terminada)
        entries = await self.db.time_entries.find({
            "date": today.isoformat(),
            "status": "active"
        }).to_list(length=None)
        
        notifications = []
        for entry in entries:
            if not entry.get("entries") or len(entry["entries"]) < 1:
                continue
            
            # Pegar última entrada que tem end_time
            last_completed = None
            for e in entry["entries"]:
                if e.get("end_time"):
                    last_completed = e
            
            if last_completed:
                end_time = datetime.fromisoformat(last_completed["end_time"])
                time_since_end = now - end_time
                
                # Se passou mais de 1h desde o último fim e não há entrada ativa
                if time_since_end > timedelta(hours=1):
                    # Verificar se há entrada sem end_time (ativa)
                    has_active = any(not e.get("end_time") for e in entry["entries"])
                    
                    if not has_active:
                        notifications.append({
                            "user_id": entry["user_id"],
                            "username": entry["username"],
                            "type": "long_break",
                            "title": "Pausa Longa Detectada",
                            "message": f"Já passou {int(time_since_end.total_seconds() / 3600)}h desde o último registo. Esqueceu-se de iniciar o ponto?",
                            "priority": "medium"
                        })
        
        return notifications
    
    async def check_overtime_work(self):
        """Verificar se usuários ultrapassaram 8h20 de trabalho"""
        now = datetime.now(timezone.utc)
        today = now.date()
        
        # Buscar entradas de hoje
        entries = await self.db.time_entries.find({
            "date": today.isoformat()
        }).to_list(length=None)
        
        notifications = []
        admin_emails = []
        
        for entry in entries:
            if not entry.get("entries"):
                continue
            
            # Calcular total de horas trabalhadas
            total_hours = 0
            has_active_entry = False
            
            for e in entry["entries"]:
                if e.get("start_time") and e.get("end_time"):
                    start = datetime.fromisoformat(e["start_time"])
                    end = datetime.fromisoformat(e["end_time"])
                    total_hours += (end - start).total_seconds() / 3600
                elif e.get("start_time") and not e.get("end_time"):
                    # Entrada ativa
                    start = datetime.fromisoformat(e["start_time"])
                    total_hours += (now - start).total_seconds() / 3600
                    has_active_entry = True
            
            # Se passou 8h20 (8.33h) e tem entrada ativa
            if total_hours >= 8.33 and has_active_entry:
                # Notificação para o usuário
                notifications.append({
                    "user_id": entry["user_id"],
                    "username": entry["username"],
                    "type": "overtime_alert",
                    "title": "Horas Extras",
                    "message": f"Já trabalhou {total_hours:.1f} horas hoje. Já terminou o seu dia de trabalho?",
                    "priority": "high"
                })
                
                # Preparar email para admins
                admin_emails.append({
                    "user_id": entry["user_id"],
                    "username": entry["username"],
                    "full_name": entry.get("full_name", entry["username"]),
                    "hours": total_hours
                })
        
        # Enviar email para admins se houver usuários em horas extras
        if admin_emails:
            await self.send_overtime_email_to_admins(admin_emails)
        
        return notifications
        
        # Enviar push notifications
        if notifications:
            await self.send_push_notifications(notifications)

    
    async def send_overtime_email_to_admins(self, users_overtime):
        """Enviar email para admins sobre usuários em horas extras"""
        try:
            # Buscar admins
            admins = await self.db.users.find({"is_admin": True}).to_list(length=None)
            
            if not admins:
                return
            
            # Criar corpo do email
            users_list = ""
            for user in users_overtime:
                users_list += f"<li><b>{user['full_name']}</b> ({user['username']}) - {user['hours']:.1f} horas trabalhadas</li>"
            
            subject = f"⚠️ Alerta de Horas Extras - {datetime.now().strftime('%d/%m/%Y')}"
            
            body = f"""
            <html>
            <body style="font-family: Arial, sans-serif;">
                <h2 style="color: #dc2626;">Alerta de Horas Extras</h2>
                <p>Os seguintes colaboradores ultrapassaram 8h20 de trabalho e ainda têm ponto ativo:</p>
                <ul>
                    {users_list}
                </ul>
                <p><small>Este email é enviado automaticamente quando um colaborador ultrapassa 8h20 de trabalho.</small></p>
                <br>
                <p>Sistema de Relógio de Ponto - HWI Unipessoal, Lda</p>
            </body>
            </html>
            """
            
            # Enviar para cada admin
            for admin in admins:
                if not admin.get("email"):
                    continue
                
                try:
                    message = MIMEMultipart()
                    message['From'] = self.smtp_from
                    message['To'] = admin["email"]
                    message['Subject'] = subject
                    
                    message.attach(MIMEText(body, 'html'))
                    
                    await aiosmtplib.send(
                        message,
                        hostname=self.smtp_host,
                        port=self.smtp_port,
                        username=self.smtp_user,
                        password=self.smtp_password,
    
    async def send_push_notifications(self, notifications):
        """Enviar push notifications para os browsers dos usuários"""
        try:
            from pywebpush import webpush
            import os
            
            vapid_private = os.environ.get('VAPID_PRIVATE_KEY')
            vapid_public = os.environ.get('VAPID_PUBLIC_KEY')
            vapid_email = os.environ.get('VAPID_CLAIM_EMAIL', 'geral@hwi.pt')
            
            if not vapid_private or not vapid_public:
                logging.warning("VAPID keys não configuradas - push notifications desabilitadas")
                return
            
            # Agrupar notificações por user_id
            notifs_by_user = {}
            for notif in notifications:
                user_id = notif["user_id"]
                if user_id not in notifs_by_user:
                    notifs_by_user[user_id] = []
                notifs_by_user[user_id].append(notif)
            
            # Enviar push para cada usuário
            for user_id, user_notifs in notifs_by_user.items():
                # Buscar subscriptions do usuário
                subscriptions = await self.db.push_subscriptions.find({"user_id": user_id}).to_list(None)
                
                if not subscriptions:
                    continue
                
                # Enviar para cada subscription (pode ter múltiplos dispositivos)
                for sub in subscriptions:
                    for notif in user_notifs:
                        try:
                            # Criar payload da notificação
                            import json
                            payload = json.dumps({
                                "title": notif["title"],
                                "message": notif["message"],
                                "type": notif["type"],
                                "priority": notif["priority"],
                                "id": notif.get("id", "")
                            })
                            
                            # Enviar push
                            webpush(
                                subscription_info={
                                    "endpoint": sub["endpoint"],
                                    "keys": sub["keys"]
                                },
                                data=payload,
                                vapid_private_key=vapid_private,
                                vapid_claims={
                                    "sub": f"mailto:{vapid_email}"
                                }
                            )
                            
                            logging.info(f"Push notification enviada para {user_id}: {notif['title']}")
                            
                        except Exception as e:
                            logging.error(f"Erro ao enviar push para {user_id}: {e}")
                            # Se subscription inválida, remover
                            if "410" in str(e) or "404" in str(e):
                                await self.db.push_subscriptions.delete_one({"_id": sub["_id"]})
                                logging.info(f"Subscription inválida removida para {user_id}")
        
        except Exception as e:
            logging.error(f"Erro ao enviar push notifications: {e}")

                        start_tls=True
                    )
                    
                    logging.info(f"Email de horas extras enviado para admin: {admin['email']}")
                    
                except Exception as e:
                    logging.error(f"Erro ao enviar email para admin {admin.get('email')}: {e}")
        
        except Exception as e:
            logging.error(f"Erro ao enviar emails de horas extras: {e}")
    
    async def run_checks(self):
        """Executar todas as verificações"""
        try:
            notifications = []
            
            # Verificar picagem de manhã
            morning_notifications = await self.check_morning_clock_in()
            notifications.extend(morning_notifications)
            
            # Verificar pausas longas
            break_notifications = await self.check_long_breaks()
            notifications.extend(break_notifications)
            
            # Verificar horas extras
            overtime_notifications = await self.check_overtime_work()
            notifications.extend(overtime_notifications)
            
            # Salvar notificações no banco para serem buscadas pelo frontend
            if notifications:
                for notif in notifications:
                    notif["created_at"] = datetime.now(timezone.utc).isoformat()
                    notif["read"] = False
                    
                    # Verificar se já existe notificação similar nos últimos 15min para evitar duplicatas
                    existing = await self.db.notifications.find_one({
                        "user_id": notif["user_id"],
                        "type": notif["type"],
                        "created_at": {"$gte": (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()}
                    })
                    
                    if not existing:
                        await self.db.notifications.insert_one(notif)
                        logging.info(f"Notificação criada: {notif['type']} para {notif['username']}")
            
            return len(notifications)
        
        except Exception as e:
            logging.error(f"Erro ao executar verificações: {e}")
            return 0

async def notification_loop(db):
    """Loop principal que executa verificações a cada 15 minutos"""
    notification_system = NotificationSystem(db)
    
    while True:
        try:
            count = await notification_system.run_checks()
            logging.info(f"Verificação de notificações executada: {count} notificações criadas")
        except Exception as e:
            logging.error(f"Erro no loop de notificações: {e}")
        
        # Aguardar 15 minutos
        await asyncio.sleep(15 * 60)
