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
    """Listar todos os pedidos de autorização de horas extra (apenas admin)"""
    query = {}
    if status:
        query["status"] = status
    
    authorizations = await db.overtime_authorizations.find(
        query,
        {"_id": 0}
    ).sort("requested_at", -1).to_list(100)
    
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


