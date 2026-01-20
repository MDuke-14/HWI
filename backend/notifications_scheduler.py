"""
Sistema de Notificações por Email e Push - Regras de Ponto e Autorizações
"""
import os
import logging
import secrets
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import aiosmtplib
from holidays import is_holiday, is_weekend, is_overtime_day
from pywebpush import webpush, WebPushException
import json

# Configuração de horários
WORK_START_TIME = "09:00"
WORK_END_TIME = "18:00"
CHECK_CLOCK_IN_TIME = "09:30"
CHECK_CLOCK_OUT_TIME = "18:15"
TOKEN_VALIDITY_HOURS = 24

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def send_push_notification(db, user_id: str, title: str, message: str, notification_type: str = "info", priority: str = "medium") -> bool:
    """Envia push notification para um utilizador"""
    try:
        vapid_private = os.environ.get('VAPID_PRIVATE_KEY')
        vapid_email = os.environ.get('VAPID_CLAIM_EMAIL', 'geral@hwi.pt')
        
        if not vapid_private:
            logger.warning("VAPID private key não configurada")
            return False
        
        subscriptions = await db.push_subscriptions.find({"user_id": user_id}).to_list(None)
        
        if not subscriptions:
            logger.info(f"Nenhuma subscription push para utilizador {user_id}")
            return False
        
        sent_count = 0
        for sub in subscriptions:
            try:
                payload = json.dumps({
                    "title": title,
                    "message": message,
                    "type": notification_type,
                    "priority": priority
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
                sent_count += 1
                logger.info(f"Push enviada para {user_id}: {title}")
                
            except WebPushException as e:
                logger.error(f"Erro push para {user_id}: {e}")
                if e.response and e.response.status_code in [403, 404, 410]:
                    await db.push_subscriptions.delete_one({"_id": sub["_id"]})
            except Exception as e:
                logger.error(f"Erro inesperado push: {e}")
        
        return sent_count > 0
    except Exception as e:
        logger.error(f"Erro ao enviar push notification: {e}")
        return False


async def send_push_to_admins(db, title: str, message: str, notification_type: str = "admin_alert", priority: str = "high") -> int:
    """Envia push notification para todos os administradores"""
    try:
        admins = await db.users.find({"is_admin": True}).to_list(None)
        sent_count = 0
        
        for admin in admins:
            admin_id = admin.get("id")
            success = await send_push_notification(db, admin_id, title, message, notification_type, priority)
            if success:
                sent_count += 1
        
        logger.info(f"Push enviada para {sent_count} admins: {title}")
        return sent_count
    except Exception as e:
        logger.error(f"Erro ao enviar push para admins: {e}")
        return 0


async def send_notification_email(
    to_email: str,
    subject: str,
    html_content: str,
    cc_email: str = None
) -> bool:
    """Envia email de notificação via SMTP"""
    try:
        smtp_host = os.environ.get('SMTP_HOST')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_user = os.environ.get('SMTP_USER')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        smtp_from = os.environ.get('SMTP_FROM', 'geral@hwi.pt')

        if not all([smtp_host, smtp_user, smtp_password]):
            logger.error("SMTP credentials not configured")
            return False

        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = smtp_from
        message["To"] = to_email
        if cc_email:
            message["Cc"] = cc_email

        html_part = MIMEText(html_content, "html")
        message.attach(html_part)

        await aiosmtplib.send(
            message,
            hostname=smtp_host,
            port=smtp_port,
            username=smtp_user,
            password=smtp_password,
            start_tls=True
        )
        
        logger.info(f"Email sent to {to_email}: {subject}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        return False


def generate_authorization_token() -> str:
    """Gera token seguro para autorização"""
    return secrets.token_urlsafe(32)


def get_authorization_email_html(
    user_name: str,
    date_str: str,
    time_str: str,
    day_type: str,
    token: str,
    base_url: str,
    request_type: str  # "overtime_start" or "overtime_end"
) -> str:
    """Gera HTML do email de pedido de autorização de horas extra"""
    
    authorize_url = f"{base_url}/authorize/{token}?action=approve"
    reject_url = f"{base_url}/authorize/{token}?action=reject"
    
    if request_type == "overtime_start":
        title = "Pedido de Autorização – Início de Trabalho"
        description = f"O utilizador <strong>{user_name}</strong> iniciou o ponto num dia especial."
    else:
        title = "Pedido de Autorização – Horas Extra"
        description = f"O utilizador <strong>{user_name}</strong> ainda tem o ponto ativo após as 18:00."
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }}
            .container {{ max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            .header {{ background: linear-gradient(135deg, #1e3a5f 0%, #2c5282 100%); color: white; padding: 30px; text-align: center; }}
            .header h1 {{ margin: 0; font-size: 24px; }}
            .content {{ padding: 30px; }}
            .info-box {{ background: #f8f9fa; border-left: 4px solid #3182ce; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }}
            .info-row {{ display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }}
            .info-row:last-child {{ border-bottom: none; }}
            .info-label {{ color: #718096; font-weight: 500; }}
            .info-value {{ color: #2d3748; font-weight: 600; }}
            .buttons {{ display: flex; gap: 15px; margin-top: 30px; justify-content: center; }}
            .btn {{ display: inline-block; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; text-align: center; }}
            .btn-approve {{ background: #38a169; color: white; }}
            .btn-reject {{ background: #e53e3e; color: white; }}
            .footer {{ background: #f8f9fa; padding: 20px; text-align: center; color: #718096; font-size: 12px; }}
            .warning {{ background: #fffbeb; border: 1px solid #f6e05e; padding: 15px; border-radius: 8px; margin-top: 20px; }}
            .warning-text {{ color: #744210; font-size: 14px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🕐 {title}</h1>
            </div>
            <div class="content">
                <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
                    {description}
                </p>
                
                <div class="info-box">
                    <div class="info-row">
                        <span class="info-label">👤 Utilizador:</span>
                        <span class="info-value">{user_name}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">📅 Data:</span>
                        <span class="info-value">{date_str}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">⏰ Hora:</span>
                        <span class="info-value">{time_str}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">📌 Tipo de Dia:</span>
                        <span class="info-value">{day_type}</span>
                    </div>
                </div>
                
                <div class="buttons">
                    <a href="{authorize_url}" class="btn btn-approve">✅ Autorizar</a>
                    <a href="{reject_url}" class="btn btn-reject">❌ Não Autorizar</a>
                </div>
                
                <div class="warning">
                    <p class="warning-text">
                        <strong>⚠️ Atenção:</strong> Esta autorização é válida por {TOKEN_VALIDITY_HOURS} horas. 
                        Após esse período, será necessário um novo pedido.
                    </p>
                </div>
            </div>
            <div class="footer">
                <p>Este é um email automático do Sistema de Gestão de Ponto HWI.</p>
                <p>© {datetime.now().year} HWI - Todos os direitos reservados</p>
            </div>
        </div>
    </body>
    </html>
    """


def get_clock_in_reminder_email_html(user_name: str, date_str: str) -> str:
    """Gera HTML do email de lembrete de entrada"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }}
            .container {{ max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            .header {{ background: linear-gradient(135deg, #c53030 0%, #e53e3e 100%); color: white; padding: 30px; text-align: center; }}
            .header h1 {{ margin: 0; font-size: 24px; }}
            .content {{ padding: 30px; }}
            .alert-box {{ background: #fff5f5; border-left: 4px solid #e53e3e; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }}
            .footer {{ background: #f8f9fa; padding: 20px; text-align: center; color: #718096; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>⚠️ Não Iniciou o Ponto</h1>
            </div>
            <div class="content">
                <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
                    Olá <strong>{user_name}</strong>,
                </p>
                
                <div class="alert-box">
                    <p style="color: #c53030; margin: 0; font-size: 16px;">
                        <strong>📅 Data:</strong> {date_str}<br><br>
                        Verificámos que ainda não iniciou o registo de ponto hoje.
                        Por favor, regularize a situação o mais rapidamente possível.
                    </p>
                </div>
                
                <p style="color: #718096; font-size: 14px; margin-top: 20px;">
                    Se está de férias, tem falta justificada ou existe algum motivo para esta ausência, 
                    por favor ignore este email.
                </p>
            </div>
            <div class="footer">
                <p>Este é um email automático do Sistema de Gestão de Ponto HWI.</p>
                <p>© {datetime.now().year} HWI - Todos os direitos reservados</p>
            </div>
        </div>
    </body>
    </html>
    """


def get_clock_out_reminder_email_html(user_name: str, date_str: str, clock_in_time: str) -> str:
    """Gera HTML do email de lembrete de saída para o utilizador"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }}
            .container {{ max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            .header {{ background: linear-gradient(135deg, #dd6b20 0%, #ed8936 100%); color: white; padding: 30px; text-align: center; }}
            .header h1 {{ margin: 0; font-size: 24px; }}
            .content {{ padding: 30px; }}
            .alert-box {{ background: #fffaf0; border-left: 4px solid #ed8936; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }}
            .info-row {{ padding: 8px 0; }}
            .footer {{ background: #f8f9fa; padding: 20px; text-align: center; color: #718096; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🕐 Não Parou o Ponto</h1>
            </div>
            <div class="content">
                <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
                    Olá <strong>{user_name}</strong>,
                </p>
                
                <div class="alert-box">
                    <p style="color: #c05621; margin: 0; font-size: 16px;">
                        <strong>📅 Data:</strong> {date_str}<br>
                        <strong>⏰ Entrada registada:</strong> {clock_in_time}<br><br>
                        O seu ponto ainda está ativo após o horário normal de trabalho (18:00).
                        Por favor, encerre o ponto o mais rapidamente possível.
                    </p>
                </div>
                
                <p style="color: #718096; font-size: 14px; margin-top: 20px;">
                    Se está a fazer horas extra autorizadas, aguarde a confirmação da administração.
                </p>
            </div>
            <div class="footer">
                <p>Este é um email automático do Sistema de Gestão de Ponto HWI.</p>
                <p>© {datetime.now().year} HWI - Todos os direitos reservados</p>
            </div>
        </div>
    </body>
    </html>
    """


def get_admin_clock_out_alert_html(
    user_name: str,
    user_email: str,
    date_str: str,
    current_time: str,
    clock_in_time: str,
    token: str,
    base_url: str
) -> str:
    """Gera HTML do email de alerta para admin sobre ponto não encerrado"""
    
    authorize_url = f"{base_url}/authorize/{token}?action=approve"
    reject_url = f"{base_url}/authorize/{token}?action=reject"
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }}
            .container {{ max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            .header {{ background: linear-gradient(135deg, #744210 0%, #975a16 100%); color: white; padding: 30px; text-align: center; }}
            .header h1 {{ margin: 0; font-size: 24px; }}
            .content {{ padding: 30px; }}
            .info-box {{ background: #f8f9fa; border-left: 4px solid #975a16; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }}
            .info-row {{ display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }}
            .info-row:last-child {{ border-bottom: none; }}
            .info-label {{ color: #718096; font-weight: 500; }}
            .info-value {{ color: #2d3748; font-weight: 600; }}
            .status-badge {{ background: #ed8936; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }}
            .buttons {{ display: flex; gap: 15px; margin-top: 30px; justify-content: center; }}
            .btn {{ display: inline-block; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; text-align: center; }}
            .btn-approve {{ background: #38a169; color: white; }}
            .btn-reject {{ background: #e53e3e; color: white; }}
            .footer {{ background: #f8f9fa; padding: 20px; text-align: center; color: #718096; font-size: 12px; }}
            .decision-info {{ background: #ebf8ff; border: 1px solid #90cdf4; padding: 15px; border-radius: 8px; margin-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>⚠️ Utilizador sem Encerramento de Ponto</h1>
            </div>
            <div class="content">
                <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
                    O seguinte utilizador tem o ponto ativo após o horário normal de trabalho:
                </p>
                
                <div class="info-box">
                    <div class="info-row">
                        <span class="info-label">👤 Utilizador:</span>
                        <span class="info-value">{user_name}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">📧 Email:</span>
                        <span class="info-value">{user_email}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">📅 Data:</span>
                        <span class="info-value">{date_str}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">⏰ Entrada:</span>
                        <span class="info-value">{clock_in_time}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">🕐 Hora Atual:</span>
                        <span class="info-value">{current_time}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">📌 Estado:</span>
                        <span class="status-badge">PONTO ATIVO</span>
                    </div>
                </div>
                
                <div class="decision-info">
                    <p style="color: #2b6cb0; margin: 0; font-size: 14px;">
                        <strong>ℹ️ Decisão necessária:</strong><br><br>
                        <strong>✅ Autorizar Horas Extra:</strong> O ponto continua ativo e as horas serão contadas como horas extra.<br><br>
                        <strong>❌ Não Autorizar:</strong> O ponto será encerrado automaticamente às 18:00 e o tempo adicional será ignorado.
                    </p>
                </div>
                
                <div class="buttons">
                    <a href="{authorize_url}" class="btn btn-approve">✅ Autorizar Horas Extra</a>
                    <a href="{reject_url}" class="btn btn-reject">❌ Não Autorizar</a>
                </div>
            </div>
            <div class="footer">
                <p>Este é um email automático do Sistema de Gestão de Ponto HWI.</p>
                <p>© {datetime.now().year} HWI - Todos os direitos reservados</p>
            </div>
        </div>
    </body>
    </html>
    """


async def check_clock_in_status(db, base_url: str) -> Dict:
    """
    Verificação das 09:30 - Utilizadores que não iniciaram o ponto
    Retorna lista de utilizadores notificados
    """
    today = date.today()
    today_str = today.strftime("%Y-%m-%d")
    today_formatted = today.strftime("%d/%m/%Y")
    
    # Verificar se hoje é dia útil
    if is_weekend(today):
        return {"status": "skipped", "reason": "Fim de semana", "notified": []}
    
    is_hol, hol_name = is_holiday(today)
    if is_hol:
        return {"status": "skipped", "reason": f"Feriado: {hol_name}", "notified": []}
    
    notified_users = []
    
    # Buscar todos os utilizadores ativos (não admin)
    users = await db.users.find({"role": {"$ne": "disabled"}, "is_admin": {"$ne": True}}, {"_id": 0}).to_list(1000)
    
    for user in users:
        user_id = user.get("id")
        user_name = user.get("full_name") or user.get("username")
        user_email = user.get("email")
        
        # Verificar se tem entrada de ponto hoje
        has_entry = await db.time_entries.find_one({
            "user_id": user_id,
            "date": today_str
        })
        
        if has_entry:
            continue  # Já tem ponto, não notificar
        
        # Verificar se tem férias aprovadas
        has_vacation = await db.vacation_requests.find_one({
            "user_id": user_id,
            "status": "approved",
            "start_date": {"$lte": today_str},
            "end_date": {"$gte": today_str}
        })
        
        if has_vacation:
            continue  # Está de férias
        
        # Verificar se tem falta justificada
        has_absence = await db.absences.find_one({
            "user_id": user_id,
            "date": today_str,
            "status": "approved"
        })
        
        if has_absence:
            continue  # Tem falta justificada
        
        # Enviar PUSH notification ao utilizador
        await send_push_notification(
            db,
            user_id,
            "⚠️ Não Iniciou o Ponto",
            f"Ainda não registou entrada hoje ({today_formatted}). Por favor, regularize a situação.",
            "clock_in_reminder",
            "high"
        )
        
        # Email desativado - apenas notificações push
        # if user_email:
        #     html_content = get_clock_in_reminder_email_html(user_name, today_formatted)
        #     await send_notification_email(
        #         to_email=user_email,
        #         subject=f"⚠️ Não Iniciou o Ponto - {today_formatted}",
        #         html_content=html_content
        #     )
        
        notified_users.append({
            "user_id": user_id,
            "user_name": user_name,
            "email": user_email
        })
        
        # Registar notificação
        await db.notification_logs.insert_one({
            "type": "clock_in_reminder",
                "user_id": user_id,
                "user_name": user_name,
                "date": today_str,
                "sent_at": datetime.now().isoformat(),
                "success": True
            })
    
    return {
        "status": "completed",
        "date": today_str,
        "notified_count": len(notified_users),
        "notified": notified_users
    }


async def check_clock_out_status(db, base_url: str) -> Dict:
    """
    Verificação das 18:15 - Utilizadores com ponto ativo
    Envia notificação ao utilizador e pedido de autorização ao admin
    """
    today = date.today()
    today_str = today.strftime("%Y-%m-%d")
    today_formatted = today.strftime("%d/%m/%Y")
    current_time = datetime.now().strftime("%H:%M")
    
    # Verificar se hoje é dia útil
    if is_weekend(today):
        return {"status": "skipped", "reason": "Fim de semana", "notified": []}
    
    is_hol, hol_name = is_holiday(today)
    if is_hol:
        return {"status": "skipped", "reason": f"Feriado: {hol_name}", "notified": []}
    
    notified_users = []
    admin_email = os.environ.get('SMTP_FROM', 'geral@hwi.pt')
    
    # Buscar entradas ativas (sem end_time)
    active_entries = await db.time_entries.find({
        "date": today_str,
        "end_time": None
    }).to_list(1000)
    
    for entry in active_entries:
        user_id = entry.get("user_id")
        
        # Buscar dados do utilizador
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            continue
        
        # Não notificar admins sobre eles próprios
        if user.get("is_admin"):
            continue
        
        user_name = user.get("full_name") or user.get("username")
        user_email = user.get("email")
        clock_in_time = datetime.fromisoformat(entry.get("start_time")).strftime("%H:%M") if entry.get("start_time") else "N/A"
        
        # Verificar se já existe autorização pendente para hoje
        existing_auth = await db.overtime_authorizations.find_one({
            "user_id": user_id,
            "date": today_str,
            "request_type": "overtime_end",
            "status": "pending"
        })
        
        if existing_auth:
            continue  # Já tem pedido pendente
        
        # Gerar token de autorização
        token = generate_authorization_token()
        
        # Guardar pedido de autorização
        auth_request = {
            "id": token,
            "user_id": user_id,
            "user_name": user_name,
            "user_email": user_email,
            "entry_id": entry.get("id"),
            "date": today_str,
            "request_type": "overtime_end",
            "clock_in_time": clock_in_time,
            "requested_at": datetime.now().isoformat(),
            "expires_at": (datetime.now() + timedelta(hours=TOKEN_VALIDITY_HOURS)).isoformat(),
            "status": "pending",
            "decided_by": None,
            "decided_at": None,
            "decision": None
        }
        await db.overtime_authorizations.insert_one(auth_request)
        
        # Enviar PUSH notification ao utilizador
        await send_push_notification(
            db,
            user_id,
            "🕐 Não Parou o Ponto",
            f"O seu ponto está ativo após as 18:00. Entrada: {clock_in_time}. Aguarde autorização de horas extra.",
            "clock_out_reminder",
            "high"
        )
        
        # Enviar PUSH notification aos admins
        await send_push_to_admins(
            db,
            "⚠️ Pedido de Horas Extra",
            f"{user_name} ainda tem o ponto ativo. Autorize ou rejeite as horas extra.",
            "overtime_authorization",
            "high"
        )
        
        # Emails desativados - apenas notificações push
        # if user_email:
        #     user_html = get_clock_out_reminder_email_html(user_name, today_formatted, clock_in_time)
        #     await send_notification_email(
        #         to_email=user_email,
        #         subject=f"🕐 Não Parou o Ponto - {today_formatted}",
        #         html_content=user_html
        #     )
        
        # admin_html = get_admin_clock_out_alert_html(
        #     user_name=user_name,
        #     user_email=user_email or "N/A",
        #     date_str=today_formatted,
        #     current_time=current_time,
        #     clock_in_time=clock_in_time,
        #     token=token,
        #     base_url=base_url
        # )
        # await send_notification_email(
        #     to_email=admin_email,
        #     subject=f"⚠️ Utilizador sem encerramento de ponto - {user_name}",
        #     html_content=admin_html
        # )
        
        notified_users.append({
            "user_id": user_id,
            "user_name": user_name,
            "email": user_email,
            "token": token
        })
        
        # Registar notificação
        await db.notification_logs.insert_one({
            "type": "clock_out_reminder",
            "user_id": user_id,
            "user_name": user_name,
            "date": today_str,
            "sent_at": datetime.now().isoformat(),
            "success": True,
            "authorization_token": token
        })
    
    return {
        "status": "completed",
        "date": today_str,
        "notified_count": len(notified_users),
        "notified": notified_users
    }


async def handle_overtime_start(db, user_id: str, user_name: str, user_email: str, entry_id: str, base_url: str, custom_reason: str = None) -> Dict:
    """
    Quando um utilizador inicia ponto num sábado/domingo/feriado
    OU quando já tem horas extra nesse dia e inicia novamente
    Envia pedido de autorização ao admin
    """
    today = date.today()
    today_str = today.strftime("%Y-%m-%d")
    today_formatted = today.strftime("%d/%m/%Y")
    current_time = datetime.now().strftime("%H:%M")
    
    # Determinar tipo de dia - usar custom_reason se fornecido
    if custom_reason:
        reason = custom_reason
    else:
        is_ot, reason = is_overtime_day(today)
        if not is_ot:
            return {"status": "not_overtime_day", "reason": reason}
    
    admin_email = os.environ.get('SMTP_FROM', 'geral@hwi.pt')
    
    # Verificar se já existe autorização pendente para este entry específico
    existing_auth = await db.overtime_authorizations.find_one({
        "user_id": user_id,
        "entry_id": entry_id,
        "request_type": "overtime_start",
        "status": "pending"
    })
    
    if existing_auth:
        return {"status": "already_pending", "token": existing_auth.get("id")}
    
    # Gerar token
    token = generate_authorization_token()
    
    # Guardar pedido de autorização
    auth_request = {
        "id": token,
        "user_id": user_id,
        "user_name": user_name,
        "user_email": user_email,
        "entry_id": entry_id,
        "date": today_str,
        "request_type": "overtime_start",
        "day_type": reason,
        "start_time": current_time,
        "requested_at": datetime.now().isoformat(),
        "expires_at": (datetime.now() + timedelta(hours=TOKEN_VALIDITY_HOURS)).isoformat(),
        "status": "pending",
        "decided_by": None,
        "decided_at": None,
        "decision": None
    }
    await db.overtime_authorizations.insert_one(auth_request)
    
    # Enviar PUSH notification aos admins
    await send_push_to_admins(
        db,
        f"🕐 Pedido de Horas Extra - {reason}",
        f"{user_name} iniciou ponto às {current_time}. Autorize ou rejeite.",
        "overtime_authorization",
        "high"
    )
    
    # Email desativado - apenas notificações push
    # admin_html = get_authorization_email_html(
    #     user_name=user_name,
    #     date_str=today_formatted,
    #     time_str=current_time,
    #     day_type=reason,
    #     token=token,
    #     base_url=base_url,
    #     request_type="overtime_start"
    # )
    # 
    # success = await send_notification_email(
    #     to_email=admin_email,
    #     subject=f"🕐 Pedido de Autorização – Horas Extra ({reason}) - {user_name}",
    #     html_content=admin_html
    # )
    
    # Registar notificação
    await db.notification_logs.insert_one({
        "type": "overtime_start_request",
        "user_id": user_id,
        "user_name": user_name,
        "date": today_str,
        "day_type": reason,
        "sent_at": datetime.now().isoformat(),
        "success": True,
        "authorization_token": token
    })
    
    return {
        "status": "authorization_requested",
        "token": token,
        "day_type": reason,
        "push_sent": True
    }


async def process_authorization_decision(
    db,
    token: str,
    approved: bool,
    decided_by: str
) -> Dict:
    """
    Processa a decisão de autorização (aprovar ou rejeitar)
    """
    # Buscar pedido de autorização
    auth_request = await db.overtime_authorizations.find_one({"id": token})
    
    if not auth_request:
        return {"status": "error", "message": "Token inválido ou expirado"}
    
    # Verificar se já foi decidido
    if auth_request.get("status") != "pending":
        return {
            "status": "already_decided",
            "decision": auth_request.get("decision"),
            "decided_at": auth_request.get("decided_at")
        }
    
    # Verificar validade do token
    expires_at = datetime.fromisoformat(auth_request.get("expires_at"))
    if datetime.now() > expires_at:
        return {"status": "error", "message": "Token expirado"}
    
    entry_id = auth_request.get("entry_id")
    request_type = auth_request.get("request_type")
    date_str = auth_request.get("date")
    
    decision = "approved" if approved else "rejected"
    
    # Atualizar pedido de autorização
    await db.overtime_authorizations.update_one(
        {"id": token},
        {"$set": {
            "status": decision,
            "decision": decision,
            "decided_by": decided_by,
            "decided_at": datetime.now().isoformat()
        }}
    )
    
    if request_type == "overtime_start":
        # Início de ponto em dia especial
        if approved:
            # Marcar entrada como autorizada
            await db.time_entries.update_one(
                {"id": entry_id},
                {"$set": {
                    "overtime_authorized": True,
                    "overtime_authorized_by": decided_by,
                    "overtime_authorized_at": datetime.now().isoformat()
                }}
            )
            return {
                "status": "success",
                "decision": "approved",
                "message": "Horas extra autorizadas. O ponto continua ativo."
            }
        else:
            # Eliminar entrada de ponto
            await db.time_entries.delete_one({"id": entry_id})
            return {
                "status": "success",
                "decision": "rejected",
                "message": "Horas extra não autorizadas. A entrada de ponto foi eliminada."
            }
    
    elif request_type == "overtime_end":
        # Ponto não encerrado após 18:00
        if approved:
            # Marcar como horas extra autorizadas
            await db.time_entries.update_one(
                {"id": entry_id},
                {"$set": {
                    "overtime_authorized": True,
                    "overtime_authorized_by": decided_by,
                    "overtime_authorized_at": datetime.now().isoformat()
                }}
            )
            return {
                "status": "success",
                "decision": "approved",
                "message": "Horas extra autorizadas. As horas serão contabilizadas."
            }
        else:
            # Encerrar ponto às 18:00
            entry = await db.time_entries.find_one({"id": entry_id})
            if entry:
                # Definir hora de saída como 18:00 do dia
                end_datetime = datetime.strptime(f"{date_str} 18:00:00", "%Y-%m-%d %H:%M:%S")
                start_time = datetime.fromisoformat(entry.get("start_time"))
                
                # Calcular total de minutos
                total_minutes = int((end_datetime - start_time).total_seconds() / 60)
                if total_minutes < 0:
                    total_minutes = 0
                
                await db.time_entries.update_one(
                    {"id": entry_id},
                    {"$set": {
                        "end_time": end_datetime.isoformat(),
                        "total_minutes": total_minutes,
                        "overtime_authorized": False,
                        "overtime_rejected_by": decided_by,
                        "overtime_rejected_at": datetime.now().isoformat(),
                        "auto_closed_at_18": True
                    }}
                )
            
            return {
                "status": "success",
                "decision": "rejected",
                "message": "Horas extra não autorizadas. O ponto foi encerrado às 18:00."
            }
    
    return {"status": "error", "message": "Tipo de pedido desconhecido"}
