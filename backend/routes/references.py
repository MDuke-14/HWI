"""
Rotas de Referência Interna do Cliente.
Endpoints públicos e admin para gestão de referências internas.
"""
from fastapi import APIRouter, HTTPException, Depends, Body
from typing import Optional
from datetime import datetime, timezone
import uuid
import os
import logging

from database import db
from auth_utils import get_current_user

router = APIRouter(tags=["Referências Internas"])


# ===== Endpoints Públicos =====

@router.get("/referencia/{token}")
async def get_reference_page_data(token: str):
    """Endpoint público — retorna dados da FS para a página de referência do cliente"""
    ref_token = await db.reference_tokens.find_one({"token": token}, {"_id": 0})
    if not ref_token:
        raise HTTPException(status_code=404, detail="Link inválido ou expirado")
    
    if ref_token.get("used"):
        raise HTTPException(status_code=410, detail="Esta referência já foi submetida")
    
    expires_at = ref_token.get("expires_at")
    if expires_at:
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status_code=410, detail="Este link expirou")
    
    relatorio = await db.relatorios_tecnicos.find_one(
        {"id": ref_token["relatorio_id"]}, {"_id": 0}
    )
    if not relatorio:
        raise HTTPException(status_code=404, detail="Folha de Serviço não encontrada")
    
    equip = await db.equipamentos_ot.find_one(
        {"relatorio_id": ref_token["relatorio_id"]}, {"_id": 0}
    )
    
    return {
        "numero_assistencia": relatorio.get("numero_assistencia"),
        "local_intervencao": relatorio.get("local_intervencao", ""),
        "cliente_nome": relatorio.get("cliente_nome", ""),
        "data_servico": relatorio.get("data_servico", ""),
        "equipamento": {
            "tipologia": equip.get("tipologia", "") if equip else relatorio.get("equipamento_tipologia", ""),
            "marca": equip.get("marca", "") if equip else relatorio.get("equipamento_marca", ""),
            "modelo": equip.get("modelo", "") if equip else relatorio.get("equipamento_modelo", ""),
            "numero_serie": equip.get("numero_serie", "") if equip else relatorio.get("equipamento_numero_serie", ""),
        },
        "expires_at": ref_token.get("expires_at"),
    }


@router.post("/referencia/{token}")
async def submit_reference(token: str, body: dict = Body(...)):
    """Endpoint público — cliente submete a referência interna"""
    ref_token = await db.reference_tokens.find_one({"token": token}, {"_id": 0})
    if not ref_token:
        raise HTTPException(status_code=404, detail="Link inválido ou expirado")
    
    if ref_token.get("used"):
        raise HTTPException(status_code=410, detail="Esta referência já foi submetida")
    
    expires_at = ref_token.get("expires_at")
    if expires_at:
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status_code=410, detail="Este link expirou")
    
    referencia = body.get("referencia", "").strip()
    if not referencia:
        raise HTTPException(status_code=400, detail="Referência não pode estar vazia")
    
    await db.relatorios_tecnicos.update_one(
        {"id": ref_token["relatorio_id"]},
        {"$set": {"referencia_interna_cliente": referencia}}
    )
    
    await db.reference_tokens.update_one(
        {"token": token},
        {"$set": {"used": True, "referencia": referencia}}
    )
    
    relatorio = await db.relatorios_tecnicos.find_one(
        {"id": ref_token["relatorio_id"]}, {"_id": 0, "numero_assistencia": 1, "cliente_nome": 1}
    )
    numero = relatorio.get("numero_assistencia", "?") if relatorio else "?"
    cliente = relatorio.get("cliente_nome", "?") if relatorio else "?"
    
    admins = await db.users.find({"is_admin": True}, {"_id": 0}).to_list(100)
    for admin in admins:
        notif = {
            "id": str(uuid.uuid4()),
            "user_id": admin["id"],
            "username": admin.get("username", ""),
            "type": "referencia_interna",
            "title": "Referencia Interna Inserida",
            "message": f"O cliente {cliente} inseriu a referencia interna \"{referencia}\" na FS#{numero}.",
            "priority": "high",
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.notifications.insert_one(notif)
    
    return {"message": "Referência submetida com sucesso", "referencia": referencia}


# ===== Endpoints Admin =====

@router.get("/admin/reference-alerts")
async def get_reference_alerts(current_user: dict = Depends(get_current_user)):
    """Retorna notificações de referências internas não lidas para o admin"""
    if not current_user.get("is_admin"):
        return []
    
    alerts = await db.notifications.find(
        {"user_id": current_user["sub"], "type": "referencia_interna", "read": False},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    return alerts


@router.put("/admin/reference-alerts/{alert_id}/read")
async def mark_reference_alert_read(alert_id: str, current_user: dict = Depends(get_current_user)):
    """Marca alerta de referência como lido"""
    await db.notifications.update_one(
        {"id": alert_id, "user_id": current_user["sub"]},
        {"$set": {"read": True}}
    )
    return {"message": "Alerta marcado como lido"}


@router.get("/admin/reference-tokens")
async def get_all_reference_tokens(
    status: Optional[str] = None,
    cliente_filter: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Lista todos os tokens de referência interna (admin only)"""
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    query = {}
    if status == "pendente":
        query["used"] = False
    elif status == "submetido":
        query["used"] = True
    
    tokens = await db.reference_tokens.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    
    result = []
    for t in tokens:
        rel = await db.relatorios_tecnicos.find_one(
            {"id": t.get("relatorio_id")}, {"_id": 0, "numero_assistencia": 1, "cliente_nome": 1, "local_intervencao": 1}
        )
        
        is_expired = False
        exp = t.get("expires_at")
        if exp:
            if isinstance(exp, str):
                try:
                    exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
                    is_expired = datetime.now(timezone.utc) > exp_dt
                except Exception:
                    pass
        
        entry = {
            "id": t.get("id"),
            "token": t.get("token"),
            "relatorio_id": t.get("relatorio_id"),
            "cliente_id": t.get("cliente_id"),
            "used": t.get("used", False),
            "referencia": t.get("referencia"),
            "expires_at": t.get("expires_at"),
            "created_at": t.get("created_at"),
            "expired": is_expired,
            "numero_assistencia": rel.get("numero_assistencia") if rel else None,
            "cliente_nome": rel.get("cliente_nome", "") if rel else "",
            "local_intervencao": rel.get("local_intervencao", "") if rel else "",
        }
        
        if cliente_filter and cliente_filter.lower() not in entry["cliente_nome"].lower():
            continue
        
        result.append(entry)
    
    return result


@router.delete("/admin/reference-tokens/{token_id}")
async def delete_reference_token(token_id: str, current_user: dict = Depends(get_current_user)):
    """Remove um token de referência (admin only)"""
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Acesso negado")
    r = await db.reference_tokens.delete_one({"id": token_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Token não encontrado")
    return {"message": "Token removido"}


@router.post("/admin/resend-reference-email/{token_id}")
async def resend_reference_email(token_id: str, current_user: dict = Depends(get_current_user)):
    """Reenvia email de referência interna (admin only)"""
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    ref_token = await db.reference_tokens.find_one({"id": token_id}, {"_id": 0})
    if not ref_token:
        raise HTTPException(status_code=404, detail="Token não encontrado")
    if ref_token.get("used"):
        raise HTTPException(status_code=400, detail="Esta referência já foi submetida")
    
    rel = await db.relatorios_tecnicos.find_one({"id": ref_token["relatorio_id"]}, {"_id": 0})
    if not rel:
        raise HTTPException(status_code=404, detail="FS não encontrada")
    
    cliente = await db.clientes.find_one({"id": ref_token["cliente_id"]}, {"_id": 0})
    ref_email = cliente.get("email_referencia_interna") or cliente.get("email") if cliente else None
    if not cliente or not ref_email:
        raise HTTPException(status_code=400, detail="Cliente sem email configurado")
    
    frontend_url = os.environ.get('FRONTEND_URL', '').rstrip('/')
    link = f"{frontend_url}/reference/{ref_token['token']}"
    
    # Import here to avoid circular dependency
    from server import send_reference_link_email
    await send_reference_link_email(
        client_email=ref_email,
        client_name=cliente.get("nome", ""),
        fs_number=rel.get("numero_assistencia", 0),
        reference_link=link
    )
    
    return {"message": f"Email reenviado para {ref_email}"}
