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


async def refund_vacation_day(user_id: str, worked_date: str = None, reason: str = "Trabalho em dia de férias autorizado") -> bool:
    """Cancela o dia `worked_date` de uma férias aprovada e devolve-o ao saldo.

    Implementação: adiciona `worked_date` a `vacation_requests.excluded_dates`
    e decrementa `dias_uteis` em 1. O saldo do motor recalcula automaticamente.

    Retorna True se encontrou e atualizou uma férias que cobria essa data.
    """
    if not worked_date:
        return False
    vac = await db.vacation_requests.find_one({
        "user_id": user_id,
        "status": "aprovada",
        "start_date": {"$lte": worked_date},
        "end_date": {"$gte": worked_date},
    }, {"_id": 0})
    if not vac:
        return False
    excluded = list(vac.get("excluded_dates") or [])
    if worked_date in excluded:
        return False
    excluded.append(worked_date)
    new_dias = max(0, int(vac.get("dias_uteis", 0)) - 1)
    await db.vacation_requests.update_one(
        {"id": vac["id"]},
        {"$set": {"excluded_dates": excluded, "dias_uteis": new_dias}},
    )
    # Audit
    try:
        from datetime import datetime, timezone
        import uuid
        await db.vacation_audit.insert_one({
            "id": str(uuid.uuid4()),
            "entity_type": "request", "entity_id": vac["id"],
            "user_id": user_id, "action": "day_excluded",
            "actor_id": "system", "actor_name": "sistema",
            "before": {"excluded_dates": vac.get("excluded_dates") or [], "dias_uteis": vac.get("dias_uteis")},
            "after": {"excluded_dates": excluded, "dias_uteis": new_dias},
            "reason": reason,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logging.warning(f"Falha a registar audit refund_vacation_day: {e}")
    logging.info(f"1 dia de férias devolvido a {user_id} ({worked_date}) — motivo: {reason}")
    return True


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
