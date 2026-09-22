"""
Funções auxiliares partilhadas por todas as rotas.
"""
import os
import logging
import secrets
import string
from datetime import datetime, date, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import HTTPException
import aiosmtplib

from database import db
from models import Notification


def generate_temporary_password() -> str:
    """Generate a secure random temporary password"""
    alphabet = string.ascii_letters + string.digits + "!@#$%&*"
    password = ''.join(secrets.choice(alphabet) for _ in range(12))
    if (any(c.isupper() for c in password) and
        any(c.islower() for c in password) and
        any(c.isdigit() for c in password) and
        any(c in "!@#$%&*" for c in password)):
        return password
    return generate_temporary_password()


async def refund_vacation_day(user_id: str, reason: str = "Trabalho em dia de férias autorizado") -> bool:
    """Removido (Feb 2026): módulo de férias eliminado. No-op para
    compatibilidade com call sites remanescentes."""
    return False


async def send_password_reset_email(user_name: str, user_email: str, temporary_password: str):
    """Send email with temporary password for password reset (Fase 7B/8: usa template `password_reset` da DB)."""
    try:
        smtp_host = os.environ.get('SMTP_HOST')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_user = os.environ.get('SMTP_USER')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        smtp_from = os.environ.get('SMTP_FROM', 'geral@hwi.pt')

        # Fase 8: usar template editável do admin (com fallback ao corpo default)
        from routes.email_templates import get_template, render as render_template
        tpl = await get_template("password_reset")
        variables = {"user_name": user_name, "temporary_password": temporary_password}
        if tpl:
            subject, html_body = render_template(tpl, variables)
        else:
            subject = "Recuperacao de Senha - HWI Relogio de Ponto"
            html_body = (
                f"<p>Ola {user_name},</p>"
                f"<p>A tua nova palavra-passe temporaria e:</p>"
                f"<p style='font-family:monospace;font-size:18px;'><b>{temporary_password}</b></p>"
                "<p>Cumprimentos,<br/>HWI Unipessoal, Lda</p>"
            )

        message = MIMEMultipart('alternative')
        message['Subject'] = subject
        message['From'] = smtp_from
        message['To'] = user_email
        message.attach(MIMEText(html_body, 'html'))
        
        await aiosmtplib.send(
            message,
            hostname=smtp_host,
            port=smtp_port,
            username=smtp_user,
            password=smtp_password,
            start_tls=True
        )
        logging.info(f"Password reset email sent to {user_email}")
        return True
    except Exception as e:
        logging.error(f"Failed to send password reset email: {str(e)}")
        raise HTTPException(status_code=500, detail="Falha ao enviar email de recuperacao")


def calculate_vacation_days(start_date_str: str, days_taken: int = 0) -> dict:
    """Removido (Feb 2026): stub."""
    return {"days_earned": 0, "days_taken": 0, "days_available": 0, "months_worked": 0}


def calculate_vacation_days_by_year(start_date_str: str) -> list:
    """Removido (Feb 2026): stub."""
    return []




async def create_notification(user_id: str, notification_type: str, message: str, related_id: str = None, **kwargs):
    """Create a notification for a user"""
    notif = Notification(
        user_id=user_id,
        type=notification_type,
        message=message,
        related_id=related_id,
        **kwargs,
    )
    notif_dict = notif.model_dump()
    notif_dict['created_at'] = notif_dict['created_at'].isoformat()
    await db.notifications.insert_one(notif_dict)
    return notif
