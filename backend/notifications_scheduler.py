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


async def check_upcoming_services(db) -> Dict:
    """
    Verifica serviços agendados para a próxima hora e envia lembretes aos técnicos.
    Deve ser executado a cada 15 minutos.
    """
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    current_time = now.strftime("%H:%M")
    
    # Calcular janela de tempo: próximos 45-75 minutos (para capturar ~1h antes)
    time_min = (now + timedelta(minutes=45)).strftime("%H:%M")
    time_max = (now + timedelta(minutes=75)).strftime("%H:%M")
    
    logger.info(f"Verificando serviços entre {time_min} e {time_max} para {today_str}")
    
    # Buscar serviços de hoje com horário definido
    services = await db.service_appointments.find({
        "date": today_str,
        "status": {"$in": ["scheduled", "in_progress"]},
        "time_slot": {"$exists": True, "$ne": None}
    }, {"_id": 0}).to_list(100)
    
    notified_count = 0
    
    for service in services:
        time_slot = service.get("time_slot", "")
        
        # Extrair hora de início (formato "09:00-12:00" ou "09:00")
        start_time = time_slot.split("-")[0].strip() if "-" in time_slot else time_slot.strip()
        
        if not start_time:
            continue
        
        # Verificar se está na janela de 1h antes
        if time_min <= start_time <= time_max:
            service_id = service.get("id")
            
            # Verificar se já enviámos lembrete para este serviço hoje
            existing_reminder = await db.notification_logs.find_one({
                "type": "service_reminder_1h",
                "service_id": service_id,
                "date": today_str
            })
            
            if existing_reminder:
                continue  # Já enviámos lembrete
            
            # Enviar lembrete a todos os técnicos atribuídos
            for tech_id in service.get("technician_ids", []):
                tech = await db.users.find_one({"id": tech_id}, {"_id": 0, "full_name": 1, "username": 1})
                tech_name = tech.get("full_name") or tech.get("username", "Técnico") if tech else "Técnico"
                
                # Push notification
                await send_push_notification(
                    db,
                    tech_id,
                    "⏰ Serviço em 1 hora",
                    f"{service.get('client_name')} - {service.get('location')}\nInício: {start_time}",
                    "service_reminder",
                    "high"
                )
                
                # Notificação no sino
                from uuid import uuid4
                notification = {
                    "id": str(uuid4()),
                    "user_id": tech_id,
                    "type": "service_reminder",
                    "message": f"Lembrete: Serviço em {service.get('client_name')} às {start_time}",
                    "read": False,
                    "related_id": service_id,
                    "created_at": datetime.now().isoformat()
                }
                await db.notifications.insert_one(notification)
                
                notified_count += 1
            
            # Registar que enviámos lembrete
            await db.notification_logs.insert_one({
                "type": "service_reminder_1h",
                "service_id": service_id,
                "date": today_str,
                "sent_at": datetime.now().isoformat(),
                "technician_ids": service.get("technician_ids", []),
                "success": True
            })
            
            logger.info(f"Lembrete enviado para serviço {service_id} às {start_time}")
    
    return {
        "status": "completed",
        "date": today_str,
        "time": current_time,
        "notified_count": notified_count
    }


async def handle_overtime_start(db, user_id: str, user_name: str, user_email: str, entry_id: str, base_url: str, custom_reason: str = None, vacation_request_id: str = None) -> Dict:
    """
    Quando um utilizador inicia ponto num sábado/domingo/feriado
    OU quando já tem horas extra nesse dia e inicia novamente
    OU quando está de férias aprovadas
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
    
    # Determinar tipo de pedido
    is_vacation_work = vacation_request_id is not None
    request_type = "vacation_work" if is_vacation_work else "overtime_start"
    
    admin_email = os.environ.get('SMTP_FROM', 'geral@hwi.pt')
    
    # Verificar se já existe autorização pendente para este entry específico
    existing_auth = await db.overtime_authorizations.find_one({
        "user_id": user_id,
        "entry_id": entry_id,
        "request_type": request_type,
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
        "request_type": request_type,
        "day_type": reason,
        "start_time": current_time,
        "requested_at": datetime.now().isoformat(),
        "expires_at": (datetime.now() + timedelta(hours=TOKEN_VALIDITY_HOURS)).isoformat(),
        "status": "pending",
        "decided_by": None,
        "decided_at": None,
        "decision": None,
        "vacation_request_id": vacation_request_id  # ID do pedido de férias a anular (se aplicável)
    }
    await db.overtime_authorizations.insert_one(auth_request)
    
    # Enviar PUSH notification aos admins com título específico para férias
    if is_vacation_work:
        push_title = f"⚠️ Trabalho em Férias - {user_name}"
        push_body = f"{user_name} iniciou ponto às {current_time} durante período de férias. Se autorizado, o dia de férias será devolvido."
    else:
        push_title = f"🕐 Pedido de Horas Extra - {reason}"
        push_body = f"{user_name} iniciou ponto às {current_time}. Autorize ou rejeite."
    
    await send_push_to_admins(
        db,
        push_title,
        push_body,
        "overtime_authorization",
        "high"
    )
    
    # Registar notificação
    log_type = "vacation_work_request" if is_vacation_work else "overtime_start_request"
    await db.notification_logs.insert_one({
        "type": log_type,
        "user_id": user_id,
        "user_name": user_name,
        "date": today_str,
        "day_type": reason,
        "sent_at": datetime.now().isoformat(),
        "success": True,
        "authorization_token": token,
        "vacation_request_id": vacation_request_id
    })
    
    return {
        "status": "authorization_requested",
        "token": token,
        "day_type": reason,
        "is_vacation_work": is_vacation_work,
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
        user_id = auth_request.get("user_id")
        date_str = auth_request.get("date")
        day_type = auth_request.get("day_type", "dia especial")
        
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
            
            # Criar notificação para o utilizador
            from uuid import uuid4
            notification = {
                "id": str(uuid4()),
                "user_id": user_id,
                "type": "overtime_approved",
                "message": f"As suas horas extra de {date_str} ({day_type}) foram autorizadas por {decided_by}.",
                "read": False,
                "related_id": entry_id,
                "created_at": datetime.now().isoformat()
            }
            await db.notifications.insert_one(notification)
            
            # Enviar PUSH notification ao utilizador
            await send_push_notification(
                db,
                user_id,
                "✅ Horas Extra Autorizadas",
                f"As suas horas extra de {date_str} ({day_type}) foram autorizadas por {decided_by}.",
                "overtime_approved",
                "high"
            )
            
            return {
                "status": "success",
                "decision": "approved",
                "message": "Horas extra autorizadas. O ponto continua ativo."
            }
        else:
            # Eliminar entrada de ponto
            await db.time_entries.delete_one({"id": entry_id})
            
            # Criar notificação para o utilizador
            from uuid import uuid4
            notification = {
                "id": str(uuid4()),
                "user_id": user_id,
                "type": "overtime_rejected",
                "message": f"As suas horas extra de {date_str} ({day_type}) foram rejeitadas por {decided_by}. A entrada de ponto foi eliminada.",
                "read": False,
                "related_id": entry_id,
                "created_at": datetime.now().isoformat()
            }
            await db.notifications.insert_one(notification)
            
            # Enviar PUSH notification ao utilizador
            await send_push_notification(
                db,
                user_id,
                "❌ Horas Extra Rejeitadas",
                f"As suas horas extra de {date_str} ({day_type}) foram rejeitadas. A entrada de ponto foi eliminada.",
                "overtime_rejected",
                "high"
            )
            
            return {
                "status": "success",
                "decision": "rejected",
                "message": "Horas extra não autorizadas. A entrada de ponto foi eliminada."
            }
    
    elif request_type == "vacation_work":
        # Trabalho durante período de férias aprovadas
        vacation_request_id = auth_request.get("vacation_request_id")
        user_id = auth_request.get("user_id")
        
        if approved:
            # 1. Marcar entrada como autorizada
            await db.time_entries.update_one(
                {"id": entry_id},
                {"$set": {
                    "overtime_authorized": True,
                    "overtime_authorized_by": decided_by,
                    "overtime_authorized_at": datetime.now().isoformat(),
                    "vacation_work_approved": True
                }}
            )
            
            # 2. Anular o dia de férias correspondente
            if vacation_request_id:
                vacation_request = await db.vacation_requests.find_one({"id": vacation_request_id})
                
                if vacation_request:
                    # Calcular quantos dias a anular (apenas 1 dia - o dia de trabalho)
                    days_to_refund = 1
                    
                    # Atualizar o pedido de férias para indicar que teve 1 dia anulado
                    current_voided = vacation_request.get("days_voided", 0)
                    new_voided = current_voided + days_to_refund
                    
                    await db.vacation_requests.update_one(
                        {"id": vacation_request_id},
                        {"$set": {
                            "days_voided": new_voided,
                            "voided_dates": vacation_request.get("voided_dates", []) + [date_str],
                            "last_voided_at": datetime.now().isoformat(),
                            "last_voided_reason": f"Trabalho autorizado em {date_str}"
                        }}
                    )
                    
                    # 3. Devolver o dia ao saldo de férias do utilizador
                    await db.vacation_balances.update_one(
                        {"user_id": user_id},
                        {"$inc": {"days_taken": -days_to_refund}}
                    )
                    
                    # 4. Criar notificação para o utilizador
                    from uuid import uuid4
                    notification = {
                        "id": str(uuid4()),
                        "user_id": user_id,
                        "type": "vacation_day_refunded",
                        "message": f"O seu trabalho em {date_str} foi autorizado. 1 dia de férias foi devolvido ao seu saldo.",
                        "read": False,
                        "related_id": vacation_request_id,
                        "created_at": datetime.now().isoformat()
                    }
                    await db.notifications.insert_one(notification)
                    
                    # 5. Enviar PUSH notification ao utilizador
                    await send_push_notification(
                        db,
                        user_id,
                        "✅ Trabalho em Férias Autorizado",
                        f"O seu trabalho em {date_str} foi autorizado. 1 dia de férias foi devolvido ao seu saldo.",
                        "vacation_day_refunded",
                        "high"
                    )
            
            return {
                "status": "success",
                "decision": "approved",
                "message": "Trabalho em férias autorizado. O dia de férias foi devolvido ao saldo do utilizador."
            }
        else:
            # Eliminar entrada de ponto (o dia de férias mantém-se)
            await db.time_entries.delete_one({"id": entry_id})
            
            # Notificar utilizador
            from uuid import uuid4
            notification = {
                "id": str(uuid4()),
                "user_id": user_id,
                "type": "vacation_work_rejected",
                "message": f"O seu pedido para trabalhar em {date_str} (durante férias) foi rejeitado. A entrada de ponto foi eliminada.",
                "read": False,
                "related_id": vacation_request_id,
                "created_at": datetime.now().isoformat()
            }
            await db.notifications.insert_one(notification)
            
            # Enviar PUSH notification ao utilizador
            await send_push_notification(
                db,
                user_id,
                "❌ Trabalho em Férias Rejeitado",
                f"O seu pedido para trabalhar em {date_str} foi rejeitado. A entrada de ponto foi eliminada.",
                "vacation_work_rejected",
                "high"
            )
            
            return {
                "status": "success",
                "decision": "rejected",
                "message": "Trabalho em férias não autorizado. A entrada de ponto foi eliminada."
            }
    
    elif request_type == "overtime_end":
        # Ponto não encerrado após 18:00
        user_id = auth_request.get("user_id")
        date_str = auth_request.get("date")
        
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
            
            # Criar notificação para o utilizador
            from uuid import uuid4
            notification = {
                "id": str(uuid4()),
                "user_id": user_id,
                "type": "overtime_approved",
                "message": f"As suas horas extra de {date_str} (após horário) foram autorizadas por {decided_by}.",
                "read": False,
                "related_id": entry_id,
                "created_at": datetime.now().isoformat()
            }
            await db.notifications.insert_one(notification)
            
            # Enviar PUSH notification ao utilizador
            await send_push_notification(
                db,
                user_id,
                "✅ Horas Extra Autorizadas",
                f"As suas horas extra de {date_str} (após horário) foram autorizadas por {decided_by}.",
                "overtime_approved",
                "high"
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
            
            # Criar notificação para o utilizador
            from uuid import uuid4
            notification = {
                "id": str(uuid4()),
                "user_id": user_id,
                "type": "overtime_rejected",
                "message": f"As suas horas extra de {date_str} foram rejeitadas por {decided_by}. O ponto foi encerrado às 18:00.",
                "read": False,
                "related_id": entry_id,
                "created_at": datetime.now().isoformat()
            }
            await db.notifications.insert_one(notification)
            
            # Enviar PUSH notification ao utilizador
            await send_push_notification(
                db,
                user_id,
                "❌ Horas Extra Rejeitadas",
                f"As suas horas extra de {date_str} foram rejeitadas. O ponto foi encerrado às 18:00.",
                "overtime_rejected",
                "high"
            )
            
            return {
                "status": "success",
                "decision": "rejected",
                "message": "Horas extra não autorizadas. O ponto foi encerrado às 18:00."
            }
    
    return {"status": "error", "message": "Tipo de pedido desconhecido"}
