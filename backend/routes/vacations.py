"""
Vacation Routes - Gestão de Férias
Extracted from server.py
"""
import logging
import uuid
from datetime import datetime, timezone, date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from database import db
from models import VacationRequest, VacationRequestCreate, VacationBalance
from server import (
    get_current_user, get_current_admin, get_now_local,
    calculate_vacation_days, send_vacation_request_email,
    send_vacation_decision_email, log_app_error,
    create_notification,
)
from helpers import calculate_vacation_days_by_year
from notifications_scheduler import send_push_to_admins, send_push_notification

router = APIRouter()


# =============================================================================
# Fonte única de verdade para o saldo de férias (Feb 2026)
# =============================================================================
# O saldo é 100% derivado a partir de:
#   1. company_start_date (guardado em vacation_balances)   -> dias GANHOS por ano
#   2. vacation_requests com status="approved"              -> dias GOZADOS (auto)
#   3. cancelled_vacation_days                              -> dias devolvidos
#   4. vacation_taken_by_year (override manual do admin)    -> importação histórica
#
# vacation_balances.days_earned/days_taken/days_available deixam de ser fonte
# de verdade — só ficam por retrocompatibilidade.
# =============================================================================


def _count_approved_days_by_year(approved_requests, cancelled_dates_set, valid_years):
    """Expande cada pedido aprovado dia-a-dia (só dias úteis, excluindo
    cancelados) e agrupa por ano. Só conta anos válidos (>= company_start_date)."""
    counts = {y: 0 for y in valid_years}
    for req in approved_requests:
        try:
            start = datetime.strptime(req["start_date"], "%Y-%m-%d").date()
            end = datetime.strptime(req["end_date"], "%Y-%m-%d").date()
        except Exception:
            continue
        current = start
        while current <= end:
            if current.weekday() < 5:  # dias úteis
                ds = current.strftime("%Y-%m-%d")
                if ds not in cancelled_dates_set and current.year in counts:
                    counts[current.year] += 1
            current += timedelta(days=1)
    return counts


def _build_year_balances(company_start_date, taken_manual_by_year, approved_requests, cancelled_dates_set):
    """Devolve lista de dicts com balanço detalhado por ano + carry-over.

    Regras:
    - days_taken efectivo por ano = max(override manual do admin, contagem auto)
    - carry-over para ano seguinte = max(0, disponível deste ano)  (negativos não passam)
    - days_available do ano corrente pode ser negativo (revela over-consumo)
    - Anos anteriores ao company_start_date são ignorados
    """
    years_calc = calculate_vacation_days_by_year(company_start_date)
    valid_years = [y["year"] for y in years_calc]
    approved_counts = _count_approved_days_by_year(approved_requests, cancelled_dates_set, valid_years)

    result = []
    carry = 0
    for y in years_calc:
        year = y["year"]
        earned = y["days_earned"]
        manual = int(taken_manual_by_year.get(year, 0))
        auto = approved_counts.get(year, 0)
        taken_effective = max(manual, auto)
        earned_effective = earned + carry
        raw_available = earned_effective - taken_effective
        result.append({
            "year": year,
            "days_earned": earned,
            "months_worked": y.get("months_worked", 0),
            "days_taken": taken_effective,
            "days_taken_manual": manual,
            "days_taken_auto": auto,
            "carry_over_prev": carry,
            "days_earned_effective": earned_effective,
            "days_available": raw_available,
        })
        carry = max(0, raw_available)
    return result


async def _fetch_user_vacation_context(user_id: str):
    """Reúne todos os dados necessários para calcular o saldo dinâmico."""
    balance = await db.vacation_balances.find_one({"user_id": user_id}, {"_id": 0}) or {}
    csd = balance.get("company_start_date")

    approved = await db.vacation_requests.find(
        {"user_id": user_id, "status": "approved"}, {"_id": 0},
    ).to_list(None)

    cancelled = await db.cancelled_vacation_days.find(
        {"user_id": user_id}, {"_id": 0, "date": 1},
    ).to_list(None)
    cancelled_set = {c["date"] for c in cancelled}

    taken_docs = await db.vacation_taken_by_year.find(
        {"user_id": user_id}, {"_id": 0, "year": 1, "days_taken": 1},
    ).to_list(None)
    taken_map = {int(d["year"]): int(d.get("days_taken") or 0) for d in taken_docs}

    return csd, taken_map, approved, cancelled_set


@router.get("/vacations/balance")
async def get_vacation_balance(current_user: dict = Depends(get_current_user)):
    """Get current user's vacation balance (fonte única de verdade dinâmica).

    Deriva earned/taken/available on-the-fly a partir de company_start_date +
    pedidos aprovados + cancelamentos + override manual por ano.
    Ver `_build_year_balances` para detalhes das regras.
    """
    current_year = date.today().year
    csd, taken_map, approved, cancelled_set = await _fetch_user_vacation_context(current_user["sub"])

    if not csd:
        return {
            "days_earned": 0,
            "days_taken": 0,
            "days_available": 0,
            "year": current_year,
            "company_start_date": "",
            "message": "Configure a data de início na empresa",
        }

    try:
        years = _build_year_balances(csd, taken_map, approved, cancelled_set)
    except Exception:
        logging.exception("Erro a calcular saldo dinâmico de férias")
        return {
            "days_earned": 0,
            "days_taken": 0,
            "days_available": 0,
            "year": current_year,
            "company_start_date": csd,
            "error": "Erro ao calcular saldo",
        }

    curr = next((y for y in years if y["year"] == current_year), None)
    if not curr:
        # Ano corrente ainda não iniciou (company_start_date no futuro)
        return {
            "days_earned": 0,
            "days_taken": 0,
            "days_available": 0,
            "year": current_year,
            "company_start_date": csd,
        }

    return {
        "days_earned": curr["days_earned_effective"],
        "days_taken": curr["days_taken"],
        "days_available": curr["days_available"],
        "year": current_year,
        "company_start_date": csd,
    }

@router.post("/vacations/request")
async def request_vacation(request_data: VacationRequestCreate, current_user: dict = Depends(get_current_user)):
    """Request vacation days"""
    # Calculate days requested
    start = datetime.strptime(request_data.start_date, "%Y-%m-%d").date()
    end = datetime.strptime(request_data.end_date, "%Y-%m-%d").date()
    
    if start > end:
        raise HTTPException(status_code=400, detail="Data de início deve ser anterior à data de fim")
    
    # Count only weekdays
    days_requested = 0
    current_date = start
    while current_date <= end:
        if current_date.weekday() < 5:  # Monday to Friday
            days_requested += 1
        current_date += timedelta(days=1)
    
    # Check if user has vacation balance configured
    balance = await db.vacation_balances.find_one({"user_id": current_user["sub"]})
    
    # Create vacation request
    vac_request = VacationRequest(
        user_id=current_user["sub"],
        username=current_user["username"],
        start_date=request_data.start_date,
        end_date=request_data.end_date,
        days_requested=days_requested,
        reason=request_data.reason,
        status="pending"
    )
    
    req_dict = vac_request.model_dump()
    req_dict['created_at'] = req_dict['created_at'].isoformat()
    await db.vacation_requests.insert_one(req_dict)
    
    # Get user details for email
    user = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0})
    user_full_name = user.get("full_name", current_user["username"])
    user_email = user.get("email", "")
    
    # Send email to team (geral@hwi.pt)
    await send_vacation_request_email(
        user_name=user_full_name,
        user_email=user_email,
        start_date=request_data.start_date,
        end_date=request_data.end_date,
        days_requested=days_requested
    )
    
    # Notify all admins
    admins = await db.users.find({"is_admin": True}, {"_id": 0, "id": 1}).to_list(100)
    for admin in admins:
        await create_notification(
            admin["id"],
            "vacation_request",
            f"Novo pedido de férias de {current_user['username']}: {days_requested} dias",
            vac_request.id
        )
    
    # Enviar PUSH notification aos admins
    await send_push_to_admins(
        db,
        f"📅 Novo Pedido de Férias",
        f"{current_user['username']} pediu {days_requested} dias de férias ({request_data.start_date} a {request_data.end_date})",
        "vacation_request",
        "high"
    )
    
    # Notificar o próprio utilizador (confirmação de submissão)
    await create_notification(
        current_user["sub"],
        "vacation_request_submitted",
        f"O seu pedido de férias de {request_data.start_date} a {request_data.end_date} ({days_requested} dias) foi submetido e aguarda aprovação.",
        vac_request.id
    )
    
    return {"message": "Pedido de férias submetido", "request_id": vac_request.id, "days_requested": days_requested}

@router.get("/vacations/my-requests")
async def get_my_vacation_requests(
    include_past: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """Get current user's vacation requests.

    Por defeito esconde pedidos APROVADOS de anos anteriores (férias já gozadas
    em anos passados não devem poluir a página). Pendentes/rejeitados de qualquer
    ano continuam visíveis.

    Use `?include_past=true` para mostrar o histórico completo.
    """
    query = {"user_id": current_user["sub"]}
    if not include_past:
        current_year = date.today().year
        query["$or"] = [
            {"status": {"$ne": "approved"}},
            {"start_date": {"$gte": f"{current_year}-01-01"}},
        ]
    requests = await db.vacation_requests.find(query, {"_id": 0}) \
        .sort("created_at", -1).to_list(500)
    return requests

@router.get("/vacations/approved-days")
async def get_approved_vacation_days(current_user: dict = Depends(get_current_user)):
    """Get all individual approved vacation days for the current user"""
    approved_requests = await db.vacation_requests.find(
        {"user_id": current_user["sub"], "status": "approved"},
        {"_id": 0}
    ).to_list(200)
    
    # Also get cancelled days to exclude them
    cancelled = await db.cancelled_vacation_days.find(
        {"user_id": current_user["sub"]},
        {"_id": 0}
    ).to_list(500)
    cancelled_dates = set(c["date"] for c in cancelled)
    
    days = []
    for req in approved_requests:
        start = datetime.strptime(req["start_date"], "%Y-%m-%d").date()
        end = datetime.strptime(req["end_date"], "%Y-%m-%d").date()
        current = start
        while current <= end:
            if current.weekday() < 5:  # Only weekdays
                date_str = current.strftime("%Y-%m-%d")
                if date_str not in cancelled_dates:
                    days.append({
                        "date": date_str,
                        "request_id": req["id"],
                        "start_date": req["start_date"],
                        "end_date": req["end_date"]
                    })
            current += timedelta(days=1)
    
    return days

@router.post("/vacations/cancel-days")
async def cancel_vacation_days(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Cancel specific vacation days and refund them to the balance"""
    dates_to_cancel = data.get("dates", [])
    if not dates_to_cancel:
        raise HTTPException(status_code=400, detail="Nenhum dia selecionado")
    
    # Verify all dates belong to approved vacation requests of this user
    approved_requests = await db.vacation_requests.find(
        {"user_id": current_user["sub"], "status": "approved"},
        {"_id": 0}
    ).to_list(200)
    
    # Get already cancelled days
    cancelled = await db.cancelled_vacation_days.find(
        {"user_id": current_user["sub"]},
        {"_id": 0}
    ).to_list(500)
    already_cancelled = set(c["date"] for c in cancelled)
    
    valid_dates = []
    for date_str in dates_to_cancel:
        if date_str in already_cancelled:
            continue
        for req in approved_requests:
            start = datetime.strptime(req["start_date"], "%Y-%m-%d").date()
            end = datetime.strptime(req["end_date"], "%Y-%m-%d").date()
            cancel_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            if start <= cancel_date <= end and cancel_date.weekday() < 5:
                valid_dates.append(date_str)
                break
    
    if not valid_dates:
        raise HTTPException(status_code=400, detail="Nenhum dia válido para cancelar")
    
    # Insert cancelled days records
    for date_str in valid_dates:
        await db.cancelled_vacation_days.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": current_user["sub"],
            "date": date_str,
            "cancelled_at": datetime.now(timezone.utc).isoformat()
        })
    
    # NOTA (Feb 2026): O saldo é derivado on-the-fly a partir de
    # vacation_requests menos cancelled_vacation_days. Não mexer em
    # vacation_balances aggregate (deprecated).
    days_refunded = len(valid_dates)
    
    # Notify admins
    await create_notification(
        current_user["sub"],
        "vacation_day_refunded",
        f"Cancelou {days_refunded} dia(s) de férias: {', '.join(valid_dates)}",
        None
    )
    
    return {"message": f"{days_refunded} dia(s) de férias cancelado(s) e devolvido(s)", "days_refunded": days_refunded}



@router.post("/vacations/update-start-date")
async def update_company_start_date(
    company_start_date: str,
    vacation_days_taken: int = 0,
    current_user: dict = Depends(get_current_user)
):
    """Update or create company start date for vacation calculation.

    NOTA (Feb 2026): O saldo é agora derivado dinamicamente. Este endpoint só
    persiste `company_start_date` em `vacation_balances`. O parâmetro
    `vacation_days_taken` é gravado como override manual do ano corrente em
    `vacation_taken_by_year` (para compatibilidade com o formulário legado).
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.vacation_balances.update_one(
        {"user_id": current_user["sub"]},
        {"$set": {
            "user_id": current_user["sub"],
            "company_start_date": company_start_date,
            "updated_at": now_iso,
        }},
        upsert=True,
    )

    if vacation_days_taken and vacation_days_taken > 0:
        await db.vacation_taken_by_year.update_one(
            {"user_id": current_user["sub"], "year": date.today().year},
            {"$set": {
                "user_id": current_user["sub"],
                "year": date.today().year,
                "days_taken": int(vacation_days_taken),
                "updated_at": now_iso,
                "updated_by": current_user["sub"],
            }},
            upsert=True,
        )

    calc = calculate_vacation_days(company_start_date, vacation_days_taken)
    return {"message": "Data atualizada com sucesso", **calc}


# ============ Day Authorization Routes ============


@router.get("/admin/vacations/pending")
async def get_pending_vacation_requests(current_user: dict = Depends(get_current_admin)):
    """Get all pending vacation requests (admin only)"""
    requests = await db.vacation_requests.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return requests

@router.get("/admin/vacations/all-balances")
async def get_all_vacation_balances(
    include_past: bool = False,
    current_user: dict = Depends(get_current_admin),
):
    """Get vacation balances for all users with transition history (admin only).

    Por defeito `approved_requests` só inclui pedidos do ano corrente. Use
    `?include_past=true` para devolver o histórico completo.
    """
    balances = await db.vacation_balances.find({}, {"_id": 0}).to_list(None)
    
    # Mapear dados dos users
    users = await db.users.find({}, {"_id": 0, "id": 1, "username": 1, "full_name": 1, "is_active": 1}).to_list(None)
    users_map = {u["id"]: u for u in users}
    
    # Buscar logs de transição anual
    logs = await db.vacation_annual_log.find({}, {"_id": 0}).sort("transition_date", -1).to_list(None)
    logs_by_user = {}
    for log in logs:
        uid = log["user_id"]
        if uid not in logs_by_user:
            logs_by_user[uid] = []
        logs_by_user[uid].append(log)
    
    # Buscar todos os pedidos APROVADOS (todos os anos, todos os utilizadores).
    # Necessário para calcular saldos com carry-over ano a ano. O filtro
    # `include_past` só afeta o array `approved_requests` devolvido no output.
    current_year = date.today().year
    all_approved = await db.vacation_requests.find(
        {"status": "approved"}, {"_id": 0},
    ).sort("start_date", -1).to_list(None)

    approved_by_user = {}
    for req in all_approved:
        approved_by_user.setdefault(req["user_id"], []).append(req)

    # Pedidos aprovados para o payload (filtrados por include_past)
    if include_past:
        display_reqs = all_approved
    else:
        display_reqs = [r for r in all_approved if (r.get("start_date") or "") >= f"{current_year}-01-01"]

    requests_by_user = {}
    for req in display_reqs:
        requests_by_user.setdefault(req["user_id"], []).append(req)

    # Cancellations by user
    all_cancelled = await db.cancelled_vacation_days.find(
        {}, {"_id": 0, "user_id": 1, "date": 1},
    ).to_list(None)
    cancelled_by_user = {}
    for c in all_cancelled:
        cancelled_by_user.setdefault(c["user_id"], set()).add(c["date"])

    # Pré-carregar overrides manuais por ano
    all_taken = await db.vacation_taken_by_year.find({}, {"_id": 0}).to_list(None)
    taken_by_user_year = {}
    for t in all_taken:
        taken_by_user_year.setdefault(t["user_id"], {})[int(t["year"])] = int(t.get("days_taken") or 0)

    result = []
    for balance in balances:
        uid = balance["user_id"]
        user_info = users_map.get(uid, {})
        csd = balance.get("company_start_date", "")

        days_earned_effective = 0
        days_taken_curr = 0
        days_available = 0
        year_breakdown = []
        if csd:
            try:
                years = _build_year_balances(
                    csd,
                    taken_by_user_year.get(uid, {}),
                    approved_by_user.get(uid, []),
                    cancelled_by_user.get(uid, set()),
                )
                year_breakdown = years
                curr = next((y for y in years if y["year"] == current_year), None)
                if curr:
                    days_earned_effective = curr["days_earned_effective"]
                    days_taken_curr = curr["days_taken"]
                    days_available = curr["days_available"]
            except Exception:
                logging.exception("Erro a calcular saldo dinâmico para %s", uid)

        result.append({
            "user_id": uid,
            "username": user_info.get("username", "?"),
            "full_name": user_info.get("full_name", user_info.get("username", "?")),
            "is_active": user_info.get("is_active", True),
            "year": current_year,
            "days_earned": days_earned_effective,
            "days_taken": days_taken_curr,
            "days_available": days_available,
            "company_start_date": csd,
            "annual_transitions": logs_by_user.get(uid, []),
            "approved_requests": requests_by_user.get(uid, []),
            "year_breakdown": year_breakdown,
        })
    
    # Ordenar por nome
    result.sort(key=lambda x: (x.get("full_name") or x.get("username", "")).lower())
    
    return result



@router.post("/admin/vacations/{request_id}/approve")
async def approve_vacation(
    request_id: str,
    approved: bool,
    current_user: dict = Depends(get_current_admin)
):
    """Approve or reject vacation request (admin only)"""
    vac_request = await db.vacation_requests.find_one({"id": request_id})
    
    if not vac_request:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    
    if vac_request["status"] != "pending":
        raise HTTPException(status_code=400, detail="Pedido já foi processado")
    
    new_status = "approved" if approved else "rejected"
    
    await db.vacation_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": new_status,
            "reviewed_by": current_user["username"],
            "reviewed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # NOTA (Feb 2026): O saldo agregado é agora 100% derivado on-the-fly a partir de
    # vacation_requests. Não mexer em `vacation_balances.days_taken/days_available`.
    # O simples facto de marcar `status="approved"` no pedido é suficiente para
    # que o cálculo dinâmico o contabilize.
    if approved:
        pass
    
    # Get user details for email
    user = await db.users.find_one({"id": vac_request["user_id"]}, {"_id": 0})
    if user:
        user_full_name = user.get("full_name", vac_request["username"])
        user_email = user.get("email", "")
        
        # Send email to user
        await send_vacation_decision_email(
            user_name=user_full_name,
            user_email=user_email,
            start_date=vac_request["start_date"],
            end_date=vac_request["end_date"],
            approved=approved,
            observations=None  # Can be extended to include observations
        )
    
    # Notify user
    message = f"O seu pedido de férias foi {'aprovado' if approved else 'rejeitado'} por {current_user['username']}"
    await create_notification(
        vac_request["user_id"],
        f"vacation_{'approved' if approved else 'rejected'}",
        message,
        request_id
    )
    
    # Enviar PUSH notification ao utilizador
    push_title = f"{'✅ Férias Aprovadas' if approved else '❌ Férias Rejeitadas'}"
    push_message = f"O seu pedido de férias ({vac_request['start_date']} a {vac_request['end_date']}) foi {'aprovado' if approved else 'rejeitado'} por {current_user['username']}"
    await send_push_notification(
        db,
        vac_request["user_id"],
        push_title,
        push_message,
        f"vacation_{'approved' if approved else 'rejected'}",
        "high"
    )
    
    return {"message": f"Pedido {'aprovado' if approved else 'rejeitado'} com sucesso"}



# ===================== Admin: dias gozados por ano =====================

@router.get("/admin/vacations/taken-by-year/{user_id}")
async def admin_get_taken_by_year(
    user_id: str,
    current_user: dict = Depends(get_current_admin),
):
    """Devolve breakdown ano-a-ano para o modal de férias do admin.

    Cada ano contém `days_taken_auto` (contagem de pedidos aprovados nesse ano,
    menos cancelados), `days_taken_manual` (override do admin) e
    `days_taken` efectivo = max(auto, manual). O admin pode editar `manual`
    para importar histórico pré-sistema; o auto é sempre calculado.
    """
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "username": 1, "full_name": 1})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")

    csd, taken_map, approved, cancelled_set = await _fetch_user_vacation_context(user_id)
    if not csd:
        return {
            "user_id": user_id,
            "username": user.get("full_name") or user.get("username"),
            "company_start_date": None,
            "years": [],
            "message": "Utilizador não tem data de entrada configurada.",
        }

    years = _build_year_balances(csd, taken_map, approved, cancelled_set)

    return {
        "user_id": user_id,
        "username": user.get("full_name") or user.get("username"),
        "company_start_date": csd,
        "years": years,
    }


@router.post("/admin/vacations/taken-by-year/{user_id}")
async def admin_set_taken_by_year(
    user_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_admin),
):
    """Grava (upsert) o override manual de dias gozados por ano.
    Body: { "years": [{"year": 2024, "days_taken": 22}, ...] }

    Nota: com o cálculo dinâmico, este override serve apenas para importar
    histórico pré-sistema (ou para casos onde o admin precise de sobrepor a
    contagem automática). O saldo agregado é sempre recalculado on-the-fly.
    """
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")

    years_data = payload.get("years") or []
    if not isinstance(years_data, list):
        raise HTTPException(status_code=400, detail="Campo 'years' inválido")

    # Só aceitar anos válidos (>= company_start_date.year)
    balance = await db.vacation_balances.find_one({"user_id": user_id}, {"_id": 0})
    csd = (balance or {}).get("company_start_date")
    min_year = None
    if csd:
        try:
            min_year = datetime.strptime(csd, "%Y-%m-%d").date().year
        except Exception:
            min_year = None

    now_iso = datetime.now(timezone.utc).isoformat()
    total_taken = 0
    for item in years_data:
        try:
            year = int(item.get("year"))
            days_taken = int(item.get("days_taken") or 0)
        except (TypeError, ValueError):
            continue
        if min_year is not None and year < min_year:
            # Anos anteriores à entrada na empresa são ignorados
            continue
        if days_taken < 0:
            days_taken = 0
        total_taken += days_taken
        await db.vacation_taken_by_year.update_one(
            {"user_id": user_id, "year": year},
            {"$set": {
                "user_id": user_id,
                "year": year,
                "days_taken": days_taken,
                "updated_at": now_iso,
                "updated_by": current_user["sub"],
            }},
            upsert=True,
        )

    # Limpar overrides de anos inválidos (ex.: 2024 para user que entrou em 2025)
    if min_year is not None:
        await db.vacation_taken_by_year.delete_many(
            {"user_id": user_id, "year": {"$lt": min_year}},
        )

    return {"message": "Dias gozados atualizados", "total": total_taken}

