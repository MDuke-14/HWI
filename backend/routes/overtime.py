"""
Overtime Authorization Routes
Extracted from server.py
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from database import db
from models import OvertimeDecision
from notifications_scheduler import process_authorization_decision
from server import get_current_user, get_current_admin

router = APIRouter()

@router.get("/overtime/authorization/{token}")
async def get_overtime_authorization(token: str):
    """Obter detalhes de um pedido de autorização de horas extra"""
    auth_request = await db.overtime_authorizations.find_one({"id": token}, {"_id": 0})
    
    if not auth_request:
        raise HTTPException(status_code=404, detail="Pedido de autorização não encontrado")
    
    # Verificar se expirou
    expires_at = datetime.fromisoformat(auth_request.get("expires_at"))
    if datetime.now() > expires_at:
        raise HTTPException(status_code=410, detail="Este pedido de autorização expirou")
    
    return auth_request


@router.post("/overtime/authorization/{token}/decide")
async def decide_overtime_authorization(
    token: str,
    decision: OvertimeDecision,
    current_user: dict = Depends(get_current_admin)
):
    """Aprovar ou rejeitar pedido de autorização de horas extra"""
    # Buscar nome do admin
    admin = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0})
    admin_name = admin.get("full_name") or admin.get("username") if admin else "Admin"
    
    approved = decision.action == "approve"
    result = await process_authorization_decision(db, token, approved, admin_name)
    
    return result


@router.get("/overtime/authorizations")
async def list_overtime_authorizations(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_admin)
):
    """Listar todos os pedidos de autorização de horas extra (apenas admin).
    
    Faz enrichment de cada autorização com:
    - `periodos`: lista de períodos de ponto do dia (formato "HH:MM - HH:MM")
    - `day_type` derivado: detecta se é Sábado/Domingo automaticamente caso
      o registo original não tenha guardado.
    """
    query = {}
    if status:
        query["status"] = status
    
    authorizations = await db.overtime_authorizations.find(
        query,
        {"_id": 0}
    ).sort("requested_at", -1).to_list(100)
    
    # Enrichment: buscar períodos de ponto do dia para cada autorização
    for auth in authorizations:
        try:
            user_id = auth.get("user_id")
            date_str = auth.get("date")
            if not user_id or not date_str:
                auth["periodos"] = []
                continue
            
            entries = await db.time_entries.find(
                {"user_id": user_id, "date": date_str},
                {"_id": 0, "start_time": 1, "end_time": 1, "status": 1}
            ).sort("start_time", 1).to_list(100)
            
            periodos = []
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
                    periodos.append(f"{s_hm} - {e_hm}")
                else:
                    periodos.append(f"{s_hm} - (ativo)")
            auth["periodos"] = periodos
            
            # Derivar day_type se não estiver guardado
            if not auth.get("day_type") and date_str:
                try:
                    d_obj = datetime.fromisoformat(date_str + "T00:00:00").date() if "T" not in date_str else datetime.fromisoformat(date_str).date()
                    wd = d_obj.weekday()  # 0=Mon, 6=Sun
                    if wd == 5:
                        auth["day_type"] = "Sábado"
                    elif wd == 6:
                        auth["day_type"] = "Domingo"
                except Exception:
                    pass
            
            # Verificar se é dia de férias (independente do day_type já guardado)
            if not auth.get("is_vacation"):
                vac = await db.vacation_requests.find_one({
                    "user_id": user_id,
                    "start_date": {"$lte": date_str},
                    "end_date": {"$gte": date_str},
                    "status": "approved"
                }, {"_id": 0, "id": 1})
                if vac:
                    auth["is_vacation"] = True
        except Exception as e:
            logging.warning(f"Erro ao enriquecer autorização {auth.get('id')}: {e}")
            auth.setdefault("periodos", [])
    
    return authorizations

@router.delete("/admin/overtime-authorizations/all")
async def delete_all_overtime_authorizations(current_user: dict = Depends(get_current_admin)):
    """Remover todas as autorizações de horas extra"""
    result = await db.overtime_authorizations.delete_many({})
    return {"message": f"{result.deleted_count} autorizações removidas"}

@router.delete("/admin/overtime-authorizations/{auth_id}")
async def delete_overtime_authorization(auth_id: str, current_user: dict = Depends(get_current_admin)):
    """Remover uma autorização de horas extra"""
    result = await db.overtime_authorizations.delete_one({"id": auth_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Autorização não encontrada")
    return {"message": "Autorização removida"}


