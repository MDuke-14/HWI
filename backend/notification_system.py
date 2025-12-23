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
        
        if now.weekday() >= 5:
            return []
        
        current_time = now.time()
        if not (time(9, 0) <= current_time <= time(9, 30)):
            return []
        
        users = await self.db.users.find({"is_admin": {"$ne": True}}).to_list(length=None)
        
        notifications = []
        for user in users:
            entry = await self.db.time_entries.find_one({
                "user_id": user["id"],
                "date": today.isoformat()
            })
            
            if not entry or not entry.get("entries") or len(entry["entries"]) == 0:
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
        
        entries = await self.db.time_entries.find({
            "date": today.isoformat(),
            "status": "active"
        }).to_list(length=None)
        
        notifications = []
        for entry in entries:
            if not entry.get("entries") or len(entry["entries"]) < 1:
                continue
            
            last_completed = None
            for e in entry["entries"]:
                if e.get("end_time"):
                    last_completed = e
            
            if last_completed:
                end_time = datetime.fromisoformat(last_completed["end_time"])
                time_since_end = now - end_time
                
                if time_since_end > timedelta(hours=1):
                    has_active = any(not e.get("end_time") for e in entry["entries"])
                    
                    if not has_active:
                        notifications.append({
                            "user_id": entry["user_id"],
                            "username": entry["username"],
                            "type": "long_break",
                            "title": "Pausa Longa Detectada",
                            "message": f"Já passou {int(time_since_end.total_seconds() / 3600)}h desde o último registo.",
                            "priority": "medium"
                        })
        
        return notifications
    
    async def check_overtime_work(self):
        """Verificar se usuários ultrapassaram 8h20 de trabalho"""
        now = datetime.now(timezone.utc)
        today = now.date()
        
        entries = await self.db.time_entries.find({
            "date": today.isoformat()
        }).to_list(length=None)
        
        notifications = []
        
        for entry in entries:
            if not entry.get("entries"):
                continue
            
            total_hours = 0
            has_active_entry = False
            
            for e in entry["entries"]:
                if e.get("start_time") and e.get("end_time"):
                    start = datetime.fromisoformat(e["start_time"])
                    end = datetime.fromisoformat(e["end_time"])
                    total_hours += (end - start).total_seconds() / 3600
                elif e.get("start_time") and not e.get("end_time"):
                    start = datetime.fromisoformat(e["start_time"])
                    total_hours += (now - start).total_seconds() / 3600
                    has_active_entry = True
            
            if total_hours >= 8.33 and has_active_entry:
                notifications.append({
                    "user_id": entry["user_id"],
                    "username": entry["username"],
                    "type": "overtime_alert",
                    "title": "Horas Extras",
                    "message": f"Já trabalhou {total_hours:.1f} horas hoje.",
                    "priority": "high"
                })
        
        return notifications
    
    async def send_push_notifications(self, notifications):
        """Enviar push notifications"""
        try:
            from pywebpush import webpush
            
            vapid_private = os.environ.get('VAPID_PRIVATE_KEY')
            vapid_public = os.environ.get('VAPID_PUBLIC_KEY')
            vapid_email = os.environ.get('VAPID_CLAIM_EMAIL', 'geral@hwi.pt')
            
            if not vapid_private or not vapid_public:
                logging.warning("VAPID keys não configuradas")
                return
            
            notifs_by_user = {}
            for notif in notifications:
                user_id = notif["user_id"]
                if user_id not in notifs_by_user:
                    notifs_by_user[user_id] = []
                notifs_by_user[user_id].append(notif)
            
            for user_id, user_notifs in notifs_by_user.items():
                subscriptions = await self.db.push_subscriptions.find({"user_id": user_id}).to_list(None)
                
                if not subscriptions:
                    continue
                
                for sub in subscriptions:
                    for notif in user_notifs:
                        try:
                            import json
                            payload = json.dumps({
                                "title": notif["title"],
                                "message": notif["message"],
                                "type": notif["type"],
                                "priority": notif["priority"],
                                "id": notif.get("id", "")
                            })
                            
                            webpush(
                                subscription_info={
                                    "endpoint": sub["endpoint"],
                                    "keys": sub["keys"]
                                },
                                data=payload,
                                vapid_private_key=vapid_private,
                                vapid_claims={"sub": f"mailto:{vapid_email}"}
                            )
                            
                        except Exception as e:
                            logging.error(f"Erro ao enviar push: {e}")
                            if "410" in str(e) or "404" in str(e):
                                await self.db.push_subscriptions.delete_one({"_id": sub["_id"]})
        
        except Exception as e:
            logging.error(f"Erro ao enviar push notifications: {e}")

    async def run_checks(self):
        """Executa todas as verificações e retorna o número de notificações criadas"""
        try:
            notifications = []
            
            morning_notifications = await self.check_morning_clock_in()
            notifications.extend(morning_notifications)
            
            break_notifications = await self.check_long_breaks()
            notifications.extend(break_notifications)
            
            overtime_notifications = await self.check_overtime_work()
            notifications.extend(overtime_notifications)
            
            if notifications:
                for notif in notifications:
                    notif["created_at"] = datetime.now(timezone.utc).isoformat()
                    notif["read"] = False
                    
                    existing = await self.db.notifications.find_one({
                        "user_id": notif["user_id"],
                        "type": notif["type"],
                        "created_at": {"$gte": (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()}
                    })
                    
                    if not existing:
                        await self.db.notifications.insert_one(notif)
                        logging.info(f"Notificação criada: {notif['type']} para {notif['username']}")
                
                await self.send_push_notifications(notifications)
            
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
            logging.info(f"Verificação de notificações: {count} criadas")
        except Exception as e:
            logging.error(f"Erro no loop de notificações: {e}")
        
        await asyncio.sleep(15 * 60)
