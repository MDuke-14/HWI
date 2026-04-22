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
from notifications_scheduler import send_push_to_admins, send_push_notification

router = APIRouter()

@router.get("/vacations/balance")
async def get_vacation_balance(current_user: dict = Depends(get_current_user)):
    """Get current user's vacation balance"""
    balance = await db.vacation_balances.find_one({"user_id": current_user["sub"]}, {"_id": 0})
    
    if not balance:
        return {"days_earned": 0, "days_taken": 0, "days_available": 0, "year": date.today().year, "message": "Configure a data de início na empresa"}
    
    return {
        "days_earned": balance.get("days_earned", 22),
        "days_taken": balance.get("days_taken", 0),
        "days_available": balance.get("days_available", 0),
        "year": balance.get("year", date.today().year),
        "company_start_date": balance.get("company_start_date", "")
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
async def get_my_vacation_requests(current_user: dict = Depends(get_current_user)):
    """Get current user's vacation requests"""
    requests = await db.vacation_requests.find(
        {"user_id": current_user["sub"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
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
    
    # Update vacation balance - refund the days
    days_refunded = len(valid_dates)
    await db.vacation_balances.update_one(
        {"user_id": current_user["sub"]},
        {"$inc": {
            "days_taken": -days_refunded,
            "days_available": days_refunded
        }}
    )
    
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
    """Update or create company start date for vacation calculation"""
    existing = await db.vacation_balances.find_one({"user_id": current_user["sub"]})
    
    calc = calculate_vacation_days(company_start_date, vacation_days_taken)
    
    if existing:
        await db.vacation_balances.update_one(
            {"user_id": current_user["sub"]},
            {"$set": {
                "company_start_date": company_start_date,
                "year": date.today().year,
                "days_taken": vacation_days_taken,
                "days_earned": calc["days_earned"],
                "days_available": calc["days_available"],
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    else:
        balance = VacationBalance(
            user_id=current_user["sub"],
            year=date.today().year,
            company_start_date=company_start_date,
            days_earned=calc["days_earned"],
            days_taken=vacation_days_taken,
            days_available=calc["days_available"]
        )
        bal_dict = balance.model_dump()
        bal_dict['updated_at'] = bal_dict['updated_at'].isoformat()
        await db.vacation_balances.insert_one(bal_dict)
    
    return {"message": "Data atualizada com sucesso", **calc}


# ============ Day Authorization Routes ============


@router.get("/admin/vacations/pending")
async def get_pending_vacation_requests(current_user: dict = Depends(get_current_admin)):
    """Get all pending vacation requests (admin only)"""
    requests = await db.vacation_requests.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return requests

@router.get("/admin/vacations/all-balances")
async def get_all_vacation_balances(current_user: dict = Depends(get_current_admin)):
    """Get vacation balances for all users with transition history (admin only)"""
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
    
    # Buscar pedidos aprovados por user (do ano corrente)
    current_year = date.today().year
    approved_requests = await db.vacation_requests.find(
        {"status": "approved"},
        {"_id": 0}
    ).sort("start_date", -1).to_list(None)
    
    requests_by_user = {}
    for req in approved_requests:
        uid = req["user_id"]
        if uid not in requests_by_user:
            requests_by_user[uid] = []
        requests_by_user[uid].append(req)
    
    result = []
    for balance in balances:
        uid = balance["user_id"]
        user_info = users_map.get(uid, {})
        
        result.append({
            "user_id": uid,
            "username": user_info.get("username", "?"),
            "full_name": user_info.get("full_name", user_info.get("username", "?")),
            "is_active": user_info.get("is_active", True),
            "year": balance.get("year", current_year),
            "days_earned": balance.get("days_earned", 0),
            "days_taken": balance.get("days_taken", 0),
            "days_available": balance.get("days_available", 0),
            "company_start_date": balance.get("company_start_date", ""),
            "annual_transitions": logs_by_user.get(uid, []),
            "approved_requests": requests_by_user.get(uid, [])
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
    
    # If approved, update days taken and days available
    if approved:
        await db.vacation_balances.update_one(
            {"user_id": vac_request["user_id"]},
            {"$inc": {
                "days_taken": vac_request["days_requested"],
                "days_available": -vac_request["days_requested"]
            }}
        )
    
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

