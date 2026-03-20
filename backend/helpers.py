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


async def send_password_reset_email(user_name: str, user_email: str, temporary_password: str):
    """Send email with temporary password for password reset"""
    try:
        smtp_host = os.environ.get('SMTP_HOST')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_user = os.environ.get('SMTP_USER')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        smtp_from = os.environ.get('SMTP_FROM', 'geral@hwi.pt')
        
        subject = "Recuperacao de Senha - HWI Relogio de Ponto"
        
        html_body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">Recuperacao de Senha</h2>
                    <p>Ola <strong>{user_name}</strong>,</p>
                    <p>Recebemos uma solicitacao de recuperacao de senha para sua conta.</p>
                    <div style="background-color: #f0f9ff; padding: 20px; border-left: 4px solid #2563eb; margin: 25px 0;">
                        <p style="margin: 0;"><strong>Sua senha temporaria e:</strong></p>
                        <p style="font-size: 24px; font-family: 'Courier New', monospace; color: #1e40af; margin: 10px 0; font-weight: bold;">
                            {temporary_password}
                        </p>
                    </div>
                    <div style="background-color: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 25px 0;">
                        <p style="margin: 0;"><strong>Atencao:</strong></p>
                        <ul style="margin: 10px 0; padding-left: 20px;">
                            <li>Esta senha e <strong>temporaria</strong></li>
                            <li>Voce sera <strong>obrigado a criar uma nova senha</strong> no proximo login</li>
                            <li>Por seguranca, nao compartilhe esta senha com ninguem</li>
                        </ul>
                    </div>
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
                    <p style="color: #666; font-size: 12px;">
                        <strong>Equipe HWI Unipessoal, Lda</strong>
                    </p>
                </div>
            </body>
        </html>
        """
        
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
    """Calculate vacation days based on company start date"""
    start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
    today = date.today()
    months_worked = (today.year - start_date.year) * 12 + (today.month - start_date.month)
    if today.day < start_date.day:
        months_worked -= 1
    days_earned = min(months_worked * 2, 22)
    days_available = days_earned - days_taken
    return {
        "days_earned": days_earned,
        "days_taken": days_taken,
        "days_available": days_available,
        "months_worked": months_worked
    }


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
