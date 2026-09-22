"""
Public Authorization Decide Routes — NÃO requer autenticação.

Permite ao admin aprovar/rejeitar pedidos de autorização (horas extras,
trabalho em dia especial, etc.) diretamente do email, sem precisar de
fazer login. O token UUID é único, opaco e expira em 7 dias.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request

from database import db


router = APIRouter()


async def _find_auth_by_token(token: str):
    """Procura o pedido pelo approval_token em collections suportadas.

    Retorna (auth_doc, kind) onde kind ∈ {'day', 'overtime'}.
    Módulo de férias removido em Feb 2026.
    """
    doc = await db.day_authorizations.find_one({"approval_token": token}, {"_id": 0})
    if doc:
        return doc, "day"
    doc = await db.overtime_authorizations.find_one({"approval_token": token}, {"_id": 0})
    if doc:
        return doc, "overtime"
    return None, None


def _is_token_expired(auth: dict) -> bool:
    exp = auth.get("token_expires_at")
    if not exp:
        # Backward-compat: tokens antigos sem expiração são aceites
        return False
    try:
        if isinstance(exp, str):
            exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
        else:
            exp_dt = exp
        if exp_dt.tzinfo is None:
            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) > exp_dt
    except Exception:
        return False


@router.get("/public/authorizations/{token}")
async def get_public_authorization(token: str):
    """Devolve informação resumida do pedido para a página /auth-decide/:token
    (sem dados sensíveis)."""
    auth, kind = await _find_auth_by_token(token)
    if not auth:
        raise HTTPException(status_code=404, detail="Pedido de autorização não encontrado.")
    if _is_token_expired(auth):
        raise HTTPException(status_code=410, detail="Este link de autorização expirou (validade 7 dias).")

    # Períodos de ponto do dia (mesmo enrichment usado no admin) — só para
    # autorizações day/overtime; ferias mostra período completo.
    user_id = auth.get("user_id")
    date_str = auth.get("date") or auth.get("start_date")
    periodos = []
    tipo_colab = None
    user_full_name = auth.get("user_name") or auth.get("username")
    try:
        if kind in ("day", "overtime"):
            entries = await db.time_entries.find(
                {"user_id": user_id, "date": date_str},
                {"_id": 0, "start_time": 1, "end_time": 1, "status": 1}
            ).sort("start_time", 1).to_list(100)
            entries = []
        for e in entries:
            s = e.get("start_time")
            ed = e.get("end_time")
            try:
                s_hm = datetime.fromisoformat(s).strftime("%H:%M") if s else "??:??"
            except Exception:
                s_hm = "??:??"
            if ed and e.get("status") != "active":
                try:
                    e_hm = datetime.fromisoformat(ed).strftime("%H:%M")
                except Exception:
                    e_hm = "??:??"
                periodos.append(f"{s_hm} – {e_hm}")
            else:
                periodos.append(f"{s_hm} – (em trabalho)")
        u = await db.users.find_one({"id": user_id}, {"_id": 0, "tipo_colaborador": 1, "full_name": 1})
        if u:
            tipo_colab = u.get("tipo_colaborador")
            user_full_name = u.get("full_name") or user_full_name
    except Exception as enrich_err:
        logging.warning(f"[public-auth] enrichment falhou: {enrich_err}")

    result = {
        "kind": kind,
        "user_name": user_full_name,
        "tipo_colaborador": tipo_colab,
        "date": date_str,
        "day_type": auth.get("day_type") or auth.get("day_type_display"),
        "request_type": auth.get("request_type"),
        "status": auth.get("status"),
        "periodos": periodos,
        "decided_by_name": auth.get("decided_by_name"),
        "decided_at": auth.get("decided_at"),
    }
    return result


@router.post("/public/authorizations/{token}/decide")
async def decide_public_authorization(
    token: str,
    request: Request,
    action: str = Query(..., description="approve ou reject"),
):
    """Aplica a decisão (approve/reject) num pedido de autorização via token.

    Não requer login. O token único + expiração de 7 dias servem como autenticação.
    """
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Acção inválida. Use approve ou reject.")

    auth, kind = await _find_auth_by_token(token)
    if not auth:
        raise HTTPException(status_code=404, detail="Pedido de autorização não encontrado.")
    if _is_token_expired(auth):
        raise HTTPException(status_code=410, detail="Este link de autorização expirou.")
    if auth.get("status") in ("authorized", "approved", "rejected"):
        return {
            "status": "already_decided",
            "current_status": auth.get("status"),
            "decided_by_name": auth.get("decided_by_name"),
            "decided_at": auth.get("decided_at"),
            "message": f"Este pedido já foi {('aprovado' if auth.get('status') in ('authorized', 'approved') else 'rejeitado')} anteriormente.",
        }

    # IP / user-agent para auditoria
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent", "")[:200]
    decided_at = datetime.now(timezone.utc).isoformat()

    if kind == "day":
        # Day authorization tem o seu próprio fluxo (server.py decide_day_authorization)
        # Replicamos a lógica essencial aqui
        new_status = "authorized" if action == "approve" else "rejected"
        await db.day_authorizations.update_one(
            {"approval_token": token},
            {"$set": {
                "status": new_status,
                "decision": new_status,
                "decided_by": "email-link",
                "decided_by_name": "geral@hwi.pt (via email)",
                "decided_at": decided_at,
                "decided_via": "email-link",
                "decided_from_ip": client_ip,
                "decided_user_agent": user_agent,
            }}
        )
        # Módulo de férias removido (Feb 2026) — sem retorno de dia de férias.

        msg = "Autorização concedida" if new_status == "authorized" else "Pedido rejeitado"
        return {
            "status": new_status,
            "message": msg,
            "decided_by_name": "geral@hwi.pt (via email)",
            "decided_at": decided_at,
        }
    else:  # overtime
        approved = action == "approve"
        from notifications_scheduler import process_authorization_decision  # type: ignore
        result = await process_authorization_decision(
            db, auth["id"], approved, "geral@hwi.pt (via email)"
        )
        # Marcar metadados adicionais
        await db.overtime_authorizations.update_one(
            {"approval_token": token},
            {"$set": {
                "decided_by_name": "geral@hwi.pt (via email)",
                "decided_via": "email-link",
                "decided_from_ip": client_ip,
                "decided_user_agent": user_agent,
            }}
        )
        return {
            "status": result.get("decision") or ("approved" if approved else "rejected"),
            "message": result.get("message") or ("Autorização concedida" if approved else "Pedido rejeitado"),
            "decided_by_name": "geral@hwi.pt (via email)",
            "decided_at": decided_at,
        }
