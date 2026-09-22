"""
Rotas de Férias (novo módulo Feb 2026).

Fonte única de verdade:
  - Coleção `vacation_requests` (pedidos + histórico manual)
  - Coleção `vacation_adjustments` (transitados iniciais / ajustes admin)
  - Coleção `vacation_audit` (log imutável)

Todas as funções de cálculo delegam em `vacation_engine.py`.
"""
from __future__ import annotations

import os
import secrets
import logging
from datetime import datetime, date, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

from models import VacationRequest, VacationAdjustment, VacationAudit
from vacation_engine import (
    dias_uteis_no_periodo,
    compute_history,
    VacationRequestLite,
    VacationAdjustment as EngineAdj,
)
from mapa_ferias_generator import generate_mapa_ferias_xlsx

# ============ DB / Auth ============
mongo_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = mongo_client[os.environ["DB_NAME"]]

# get_current_user vem do server.py — import tardio para evitar ciclo
def _get_deps():
    from server import get_current_user, get_current_admin  # type: ignore
    return get_current_user, get_current_admin

router = APIRouter(tags=["vacations"])


# ============ Helpers ============

def _parse_iso_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


async def _audit(
    entity_type: str, entity_id: str, user_id: str, action: str,
    actor_id: str, actor_name: Optional[str] = None,
    before: Optional[dict] = None, after: Optional[dict] = None,
    reason: Optional[str] = None,
):
    doc = VacationAudit(
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=user_id,
        action=action,
        actor_id=actor_id,
        actor_name=actor_name,
        before=before,
        after=after,
        reason=reason,
    ).model_dump()
    await db.vacation_audit.insert_one(doc)


async def _get_user_or_404(user_id: str) -> dict:
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "Utilizador não encontrado")
    return user


async def _get_company_start_date(user: dict) -> date:
    """Data de entrada na empresa. Guardada em `users.company_start_date`.
    Se não existir, assume hoje (sistema calcula 0 dias, admin ajusta depois).
    """
    csd = user.get("company_start_date")
    if not csd:
        return date.today()
    try:
        return _parse_iso_date(csd)
    except Exception:
        return date.today()


async def _fetch_saldo_context(user_id: str):
    """Devolve (company_start_date, requests_lite, adjustments_lite)."""
    user = await _get_user_or_404(user_id)
    csd = await _get_company_start_date(user)

    reqs_raw = await db.vacation_requests.find(
        {"user_id": user_id}, {"_id": 0}
    ).to_list(length=None)
    reqs = []
    for r in reqs_raw:
        try:
            reqs.append(VacationRequestLite(
                id=r["id"],
                start_date=_parse_iso_date(r["start_date"]),
                end_date=_parse_iso_date(r["end_date"]),
                dias_uteis=int(r.get("dias_uteis", 0)),
                status=r.get("status", "pendente"),
                source=r.get("source", "user"),
            ))
        except Exception as e:
            logging.warning("Skipping malformed vacation_request %s: %s", r.get("id"), e)

    adj_raw = await db.vacation_adjustments.find(
        {"user_id": user_id}, {"_id": 0}
    ).to_list(length=None)
    adjs = [EngineAdj(year=int(a["year"]), dias=int(a["dias"]), reason=a.get("reason") or "") for a in adj_raw]
    return csd, reqs, adjs


# ============ Modelos de request ============

class CalcDaysReq(BaseModel):
    start_date: str
    end_date: str


class CreateVacationReq(BaseModel):
    start_date: str
    end_date: str
    observacao: Optional[str] = None


class CreateHistoricReq(BaseModel):
    user_id: str
    start_date: str
    end_date: str
    year: Optional[int] = None
    dias_override: Optional[int] = None
    observacao: Optional[str] = None


class DecisionReq(BaseModel):
    action: str  # approve | reject
    reason: Optional[str] = None


class CancelReq(BaseModel):
    reason: Optional[str] = None


class AdjustmentReq(BaseModel):
    user_id: str
    year: int
    dias: int
    reason: Optional[str] = None


class UpdateConfigReq(BaseModel):
    company_start_date: str  # ISO YYYY-MM-DD


# ============ Utilitário ============

@router.post("/vacations/calculate-days")
async def api_calculate_days(payload: CalcDaysReq):
    """Devolve o número de dias úteis entre 2 datas (inclusive)."""
    try:
        s = _parse_iso_date(payload.start_date)
        e = _parse_iso_date(payload.end_date)
    except Exception:
        raise HTTPException(400, "Datas inválidas (YYYY-MM-DD)")
    if e < s:
        raise HTTPException(400, "Data final anterior à inicial")
    return {"dias_uteis": dias_uteis_no_periodo(s, e)}


# ============ Utilizador ============

@router.get("/vacations/saldo")
async def get_my_saldo(current_user: dict = Depends(_get_deps()[0])):
    """Saldo histórico completo do utilizador autenticado (do ano de admissão até hoje)."""
    user_id = current_user["sub"]
    return await _saldo_response(user_id)


@router.get("/vacations/my-requests")
async def get_my_requests(current_user: dict = Depends(_get_deps()[0])):
    """Lista os meus pedidos, ordenados por data de início desc."""
    user_id = current_user["sub"]
    docs = await db.vacation_requests.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("start_date", -1).to_list(length=None)
    return docs


@router.post("/vacations/requests")
async def create_my_request(
    payload: CreateVacationReq,
    current_user: dict = Depends(_get_deps()[0]),
):
    """Colaborador cria um pedido pendente."""
    try:
        s = _parse_iso_date(payload.start_date)
        e = _parse_iso_date(payload.end_date)
    except Exception:
        raise HTTPException(400, "Datas inválidas")
    if e < s:
        raise HTTPException(400, "Data final anterior à inicial")
    dias = dias_uteis_no_periodo(s, e)
    if dias <= 0:
        raise HTTPException(400, "O período selecionado não contém dias úteis")

    user_id = current_user["sub"]
    user = await _get_user_or_404(user_id)
    req = VacationRequest(
        user_id=user_id,
        username=user.get("username", ""),
        start_date=s.isoformat(),
        end_date=e.isoformat(),
        dias_uteis=dias,
        year=s.year,
        status="pendente",
        source="user",
        observacao=payload.observacao,
        approval_token=secrets.token_urlsafe(24),
        created_by=user_id,
        created_by_name=user.get("full_name") or user.get("username"),
    )
    await db.vacation_requests.insert_one(req.model_dump())
    await _audit(
        "request", req.id, user_id, "create",
        actor_id=user_id, actor_name=user.get("full_name") or user.get("username"),
        after=req.model_dump(),
    )
    # Notificar admin(s) — in-app + email one-click
    try:
        from helpers import create_notification
        admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(None)
        for a in admins:
            await create_notification(
                a["id"],
                "vacation_pending",
                f"Novo pedido de férias de {user.get('username')} ({s.strftime('%d/%m/%Y')} → {e.strftime('%d/%m/%Y')}, {dias} dias úteis)",
                req.id,
            )
    except Exception as e:
        logging.warning("Falha ao notificar admins de novo pedido de férias: %s", e)

    # Email one-click ao admin (geral@hwi.pt) — não bloqueia se falhar
    try:
        await _send_vacation_request_email(
            user_name=user.get("full_name") or user.get("username", ""),
            start_date=s.strftime("%d/%m/%Y"),
            end_date=e.strftime("%d/%m/%Y"),
            dias=dias,
            observacao=payload.observacao or "",
            approval_token=req.approval_token,
        )
    except Exception as ex:
        logging.warning("Falha a enviar email de novo pedido de férias: %s", ex)

    return req.model_dump()


@router.post("/vacations/requests/{request_id}/cancel")
async def cancel_my_request(
    request_id: str,
    current_user: dict = Depends(_get_deps()[0]),
):
    """Utilizador cancela um pedido próprio (só pendente ou aprovada futura)."""
    user_id = current_user["sub"]
    doc = await db.vacation_requests.find_one({"id": request_id, "user_id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Pedido não encontrado")
    if doc["status"] in ("rejeitada", "cancelada"):
        raise HTTPException(400, f"Pedido já está {doc['status']}")

    before = dict(doc)
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.vacation_requests.update_one(
        {"id": request_id},
        {"$set": {"status": "cancelada", "decided_at": now_iso, "decided_by": user_id}},
    )
    doc.update({"status": "cancelada", "decided_at": now_iso, "decided_by": user_id})
    await _audit(
        "request", request_id, user_id, "cancel",
        actor_id=user_id, actor_name=current_user.get("username"),
        before=before, after=doc, reason="Cancelamento pelo próprio",
    )
    return {"message": "Pedido cancelado", "request": doc}


# ============ Admin ============

@router.get("/admin/vacations/pending")
async def admin_list_pending(current_user: dict = Depends(_get_deps()[1])):
    """Lista todos os pedidos pendentes de todos os utilizadores."""
    docs = await db.vacation_requests.find(
        {"status": "pendente"}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=None)
    return docs


@router.get("/admin/vacations/all")
async def admin_list_all(current_user: dict = Depends(_get_deps()[1])):
    """Todos os pedidos (para dashboards admin). Sem filtro de status."""
    docs = await db.vacation_requests.find({}, {"_id": 0}).sort("start_date", -1).to_list(length=None)
    return docs


@router.get("/admin/vacations/user/{user_id}/saldo")
async def admin_get_user_saldo(user_id: str, current_user: dict = Depends(_get_deps()[1])):
    return await _saldo_response(user_id)


@router.get("/admin/vacations/user/{user_id}/requests")
async def admin_get_user_requests(user_id: str, current_user: dict = Depends(_get_deps()[1])):
    docs = await db.vacation_requests.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("start_date", -1).to_list(length=None)
    return docs


@router.get("/admin/vacations/user/{user_id}/audit")
async def admin_get_user_audit(user_id: str, current_user: dict = Depends(_get_deps()[1])):
    docs = await db.vacation_audit.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("timestamp", -1).to_list(length=None)
    return docs


@router.post("/admin/vacations/requests/{request_id}/decide")
async def admin_decide_request(
    request_id: str,
    payload: DecisionReq,
    current_user: dict = Depends(_get_deps()[1]),
):
    if payload.action not in ("approve", "reject"):
        raise HTTPException(400, "Ação inválida")
    doc = await db.vacation_requests.find_one({"id": request_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Pedido não encontrado")
    if doc["status"] != "pendente":
        raise HTTPException(400, f"Pedido já não está pendente (estado: {doc['status']})")

    before = dict(doc)
    new_status = "aprovada" if payload.action == "approve" else "rejeitada"
    now_iso = datetime.now(timezone.utc).isoformat()
    actor_id = current_user["sub"]
    actor_name = current_user.get("username")

    await db.vacation_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": new_status,
            "decided_at": now_iso,
            "decided_by": actor_id,
            "decided_by_name": actor_name,
            "decision_reason": payload.reason,
        }},
    )
    doc.update({
        "status": new_status, "decided_at": now_iso,
        "decided_by": actor_id, "decided_by_name": actor_name,
        "decision_reason": payload.reason,
    })
    await _audit(
        "request", request_id, doc["user_id"], new_status,
        actor_id=actor_id, actor_name=actor_name,
        before=before, after=doc, reason=payload.reason,
    )
    # Notificar utilizador
    try:
        from helpers import create_notification
        s_fmt = _parse_iso_date(doc["start_date"]).strftime("%d/%m/%Y")
        e_fmt = _parse_iso_date(doc["end_date"]).strftime("%d/%m/%Y")
        msg = (
            f"Férias {s_fmt} → {e_fmt} "
            f"{'aprovadas' if new_status == 'aprovada' else 'rejeitadas'} pelo admin."
        )
        await create_notification(doc["user_id"], f"vacation_{new_status}", msg, request_id)
    except Exception as e:
        logging.warning("Falha ao notificar utilizador da decisão de férias: %s", e)

    return {"message": f"Pedido {new_status}", "request": doc}


@router.post("/admin/vacations/requests/{request_id}/cancel")
async def admin_cancel_request(
    request_id: str,
    payload: CancelReq = CancelReq(),
    current_user: dict = Depends(_get_deps()[1]),
):
    """Admin cancela uma férias já aprovada (ex.: colaborador não gozou)."""
    doc = await db.vacation_requests.find_one({"id": request_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Pedido não encontrado")
    if doc["status"] not in ("aprovada", "pendente"):
        raise HTTPException(400, f"Não é possível cancelar (estado: {doc['status']})")

    before = dict(doc)
    now_iso = datetime.now(timezone.utc).isoformat()
    actor_id = current_user["sub"]
    actor_name = current_user.get("username")
    await db.vacation_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "cancelada",
            "decided_at": now_iso,
            "decided_by": actor_id,
            "decided_by_name": actor_name,
            "decision_reason": payload.reason or "Cancelamento pelo admin",
        }},
    )
    doc.update({
        "status": "cancelada", "decided_at": now_iso,
        "decided_by": actor_id, "decided_by_name": actor_name,
        "decision_reason": payload.reason or "Cancelamento pelo admin",
    })
    await _audit(
        "request", request_id, doc["user_id"], "cancel",
        actor_id=actor_id, actor_name=actor_name,
        before=before, after=doc, reason=payload.reason,
    )
    return {"message": "Pedido cancelado", "request": doc}


@router.post("/admin/vacations/historic")
async def admin_add_historic(
    payload: CreateHistoricReq,
    current_user: dict = Depends(_get_deps()[1]),
):
    """Admin cria uma entrada de histórico (férias anteriores gozadas)."""
    user = await _get_user_or_404(payload.user_id)
    try:
        s = _parse_iso_date(payload.start_date)
        e = _parse_iso_date(payload.end_date)
    except Exception:
        raise HTTPException(400, "Datas inválidas")
    if e < s:
        raise HTTPException(400, "Data final anterior à inicial")

    dias_calc = dias_uteis_no_periodo(s, e)
    dias = payload.dias_override if payload.dias_override is not None else dias_calc
    if dias <= 0:
        raise HTTPException(400, "Número de dias inválido")

    actor_id = current_user["sub"]
    actor_name = current_user.get("username")
    now_iso = datetime.now(timezone.utc).isoformat()

    req = VacationRequest(
        user_id=payload.user_id,
        username=user.get("username", ""),
        start_date=s.isoformat(),
        end_date=e.isoformat(),
        dias_uteis=int(dias),
        year=int(payload.year or s.year),
        status="aprovada",
        source="historic",
        observacao=payload.observacao,
        decided_by=actor_id,
        decided_by_name=actor_name,
        decided_at=now_iso,
        created_by=actor_id,
        created_by_name=actor_name,
    )
    await db.vacation_requests.insert_one(req.model_dump())
    await _audit(
        "request", req.id, payload.user_id, "create_historic",
        actor_id=actor_id, actor_name=actor_name,
        after=req.model_dump(),
        reason=f"Histórico manual (calc={dias_calc}, gravado={dias})",
    )
    return req.model_dump()


@router.post("/admin/vacations/adjustments")
async def admin_add_adjustment(
    payload: AdjustmentReq,
    current_user: dict = Depends(_get_deps()[1]),
):
    """Ajuste administrativo de dias transitados."""
    await _get_user_or_404(payload.user_id)
    if payload.dias == 0:
        raise HTTPException(400, "Ajuste com 0 dias não faz sentido")
    actor_id = current_user["sub"]
    actor_name = current_user.get("username")
    adj = VacationAdjustment(
        user_id=payload.user_id,
        year=payload.year,
        dias=payload.dias,
        reason=payload.reason,
        created_by=actor_id,
        created_by_name=actor_name,
    )
    await db.vacation_adjustments.insert_one(adj.model_dump())
    await _audit(
        "adjustment", adj.id, payload.user_id, "create",
        actor_id=actor_id, actor_name=actor_name,
        after=adj.model_dump(), reason=payload.reason,
    )
    return adj.model_dump()


@router.get("/admin/vacations/user/{user_id}/adjustments")
async def admin_get_user_adjustments(user_id: str, current_user: dict = Depends(_get_deps()[1])):
    docs = await db.vacation_adjustments.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("year", -1).to_list(length=None)
    return docs


@router.get("/admin/vacations/mapa-ferias.xlsx")
async def admin_download_mapa_ferias(
    year: int | None = None,  # noqa: ARG001 — mantido por compatibilidade; ignorado
    current_user: dict = Depends(_get_deps()[1]),
):
    """Gera o Mapa de Férias em XLSX com uma folha por cada ano existente na BD.

    Os anos são detectados automaticamente a partir dos pedidos aprovados.
    """
    try:
        xlsx_bytes = await generate_mapa_ferias_xlsx(db, None)
    except Exception as e:
        logging.exception("Erro a gerar Mapa de Férias")
        raise HTTPException(500, f"Erro a gerar Mapa: {e}")

    filename = "Mapa_Ferias.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(xlsx_bytes)),
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


@router.delete("/admin/vacations/adjustments/{adj_id}")
async def admin_delete_adjustment(adj_id: str, current_user: dict = Depends(_get_deps()[1])):
    doc = await db.vacation_adjustments.find_one({"id": adj_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Ajuste não encontrado")
    await db.vacation_adjustments.delete_one({"id": adj_id})
    await _audit(
        "adjustment", adj_id, doc["user_id"], "delete",
        actor_id=current_user["sub"], actor_name=current_user.get("username"),
        before=doc,
    )
    return {"message": "Ajuste removido"}


@router.patch("/admin/vacations/user/{user_id}/config")
async def admin_update_user_config(
    user_id: str,
    payload: UpdateConfigReq,
    current_user: dict = Depends(_get_deps()[1]),
):
    """Atualiza a Data de Entrada na Empresa (base do cálculo)."""
    user = await _get_user_or_404(user_id)
    try:
        _parse_iso_date(payload.company_start_date)
    except Exception:
        raise HTTPException(400, "Data inválida")

    before = {"company_start_date": user.get("company_start_date")}
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"company_start_date": payload.company_start_date}},
    )
    after = {"company_start_date": payload.company_start_date}
    await _audit(
        "config", user_id, user_id, "update",
        actor_id=current_user["sub"], actor_name=current_user.get("username"),
        before=before, after=after,
    )
    return {"message": "Data de entrada atualizada", "company_start_date": payload.company_start_date}


# ============ Cálculo partilhado ============

async def _saldo_response(user_id: str) -> dict:
    csd, requests, adjustments = await _fetch_saldo_context(user_id)
    end_year = max(date.today().year, csd.year)
    history = compute_history(csd, end_year, requests, adjustments)
    current = next((h for h in history if h.year == date.today().year), None)
    return {
        "user_id": user_id,
        "company_start_date": csd.isoformat(),
        "current_year": date.today().year,
        "current": current.to_dict() if current else None,
        "history": [yb.to_dict() for yb in history],
    }


async def _send_vacation_request_email(
    user_name: str, start_date: str, end_date: str,
    dias: int, observacao: str, approval_token: str,
):
    """Envia email one-click ao admin (geral@hwi.pt) com botões Aprovar/Rejeitar."""
    import aiosmtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", 587))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_password = os.environ.get("SMTP_PASSWORD")
    smtp_from = os.environ.get("SMTP_FROM", "geral@hwi.pt")
    if not all([smtp_host, smtp_user, smtp_password]):
        logging.info("SMTP não configurado — a saltar envio de email de férias")
        return

    base = os.environ.get("PUBLIC_BASE_URL", "https://timesync-app-2.emergent.host")
    approve_url = f"{base}/auth-decide/{approval_token}?action=approve"
    reject_url = f"{base}/auth-decide/{approval_token}?action=reject"

    obs_html = ""
    if observacao:
        safe = (observacao or "").replace("<", "&lt;").replace(">", "&gt;")
        obs_html = (
            f"<tr><td style='padding:8px 15px;background:#f5f5f5;font-weight:bold;'>Observação:</td>"
            f"<td style='padding:8px 15px;'>{safe}</td></tr>"
        )

    html = f"""
    <html><body style="font-family:Arial,sans-serif;color:#333;line-height:1.6;">
      <p>Olá,</p>
      <p>O(a) colaborador(a) <strong>{user_name}</strong> submeteu um pedido de férias.</p>
      <table style="border-collapse:collapse;margin:15px 0;">
        <tr><td style='padding:8px 15px;background:#f5f5f5;font-weight:bold;'>Início:</td><td style='padding:8px 15px;'>{start_date}</td></tr>
        <tr><td style='padding:8px 15px;background:#f5f5f5;font-weight:bold;'>Fim:</td><td style='padding:8px 15px;'>{end_date}</td></tr>
        <tr><td style='padding:8px 15px;background:#f5f5f5;font-weight:bold;'>Dias úteis:</td><td style='padding:8px 15px;'><strong>{dias}</strong></td></tr>
        {obs_html}
      </table>
      <div style="margin:25px 0;text-align:center;">
        <a href="{approve_url}" style="background:#16a34a;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;margin-right:10px;display:inline-block;">✅ APROVAR</a>
        <a href="{reject_url}" style="background:#dc2626;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">❌ REJEITAR</a>
      </div>
      <p style="text-align:center;color:#666;font-size:12px;">Link válido enquanto o pedido estiver pendente.</p>
      <hr style="margin:30px 0;border:none;border-top:1px solid #ddd;">
      <p style="color:#666;font-size:12px;">Sistema HWI — Gestão de Férias</p>
    </body></html>
    """

    message = MIMEMultipart("alternative")
    message["Subject"] = f"Novo pedido de férias — {user_name}"
    message["From"] = smtp_from
    message["To"] = smtp_from
    message.attach(MIMEText(html, "html"))

    await aiosmtplib.send(
        message, hostname=smtp_host, port=smtp_port,
        username=smtp_user, password=smtp_password, start_tls=True,
    )
    logging.info(f"Email de novo pedido de férias enviado para {smtp_from} ({user_name})")
