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
    """Devolve 1 dia de férias ao saldo do utilizador.

    Usada por `POST /admin/day-authorizations/{id}/decide` e pelo link público
    de aprovação `routes/public_authorizations.py`. Extraída para evitar
    import circular entre `server.py` e `routes/public_authorizations.py`.

    Retorna True se atualizou o saldo, False se o utilizador não tinha balance.
    """
    current_year = datetime.now(timezone.utc).year
    balance = await db.vacation_balances.find_one({
        "user_id": user_id,
        "year": current_year,
    })
    if not balance:
        return False

    new_used = max(0, balance.get("used_days", 0) - 1)
    new_remaining = balance.get("total_days", 22) - new_used
    await db.vacation_balances.update_one(
        {"user_id": user_id, "year": current_year},
        {"$set": {"used_days": new_used, "remaining_days": new_remaining}},
    )
    logging.info(f"1 dia de férias devolvido ao utilizador {user_id} ({reason})")
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


def calculate_vacation_days_by_year(start_date_str: str) -> list:
    """Devolve lista de dicts (um por cada ano desde company_start_date até ao ano corrente)
    com o número de dias de férias GANHOS nesse ano.

    Regras (lei portuguesa aplicada pela empresa):
    - Ano de admissão: pró-rata (2 dias por mês trabalhado, máx 22).
      Se `start_date.day > 1`, o mês da admissão não conta.
    - Anos posteriores ao de admissão: **22 dias completos**, atribuídos
      logo a 1 de Janeiro (mesmo que o ano corrente ainda esteja a decorrer).
    """
    start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
    today = date.today()
    result = []
    for year in range(start_date.year, today.year + 1):
        if year == start_date.year:
            # Ano de admissão — pró-rata
            if start_date.year == today.year:
                months = today.month - start_date.month
                if today.day < start_date.day:
                    months -= 1
            else:
                months = 12 - start_date.month + 1
                if start_date.day > 1:
                    months -= 1
            months = max(0, months)
            earned = min(months * 2, 22)
            result.append({"year": year, "days_earned": earned, "months_worked": months})
        else:
            # Ano posterior ao de admissão — 22 dias completos
            result.append({"year": year, "days_earned": 22, "months_worked": 12})
    return result




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
