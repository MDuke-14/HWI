"""
Rotas de Equipamentos (CRUD + Histórico de Intervenções).
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
import logging

from database import db
from auth_utils import get_current_user
from models import Equipamento

router = APIRouter(prefix="/equipamentos", tags=["Equipamentos"])


@router.get("")
async def get_equipamentos(
    cliente_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Listar equipamentos - pode filtrar por cliente"""
    query = {"ativo": True}
    if cliente_id:
        query["cliente_id"] = cliente_id
    
    equipamentos = await db.equipamentos.find(
        query,
        {"_id": 0}
    ).sort("last_used", -1).to_list(length=None)
    
    return equipamentos

@router.get("/{equipamento_id}", response_model=Equipamento)
async def get_equipamento(
    equipamento_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obter equipamento específico"""
    equipamento = await db.equipamentos.find_one(
        {"id": equipamento_id, "ativo": True},
        {"_id": 0}
    )
    
    if not equipamento:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado")
    
    return equipamento

@router.post("", response_model=Equipamento)
async def create_equipamento(
    equipamento: Equipamento,
    current_user: dict = Depends(get_current_user)
):
    """Criar novo equipamento"""
    # Verificar se cliente existe
    cliente = await db.clientes.find_one({"id": equipamento.cliente_id, "ativo": True})
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    # Verificar se equipamento já existe (mesmo marca, modelo e número de série)
    existing = await db.equipamentos.find_one({
        "cliente_id": equipamento.cliente_id,
        "marca": equipamento.marca,
        "modelo": equipamento.modelo,
        "numero_serie": equipamento.numero_serie,
        "ativo": True
    })
    
    if existing:
        # Retornar o existente ao invés de criar duplicado
        return existing
    
    equipamento_dict = equipamento.dict()
    equipamento_dict["created_at"] = equipamento_dict["created_at"].isoformat()
    if equipamento_dict.get("last_used"):
        equipamento_dict["last_used"] = equipamento_dict["last_used"].isoformat()
    
    await db.equipamentos.insert_one(equipamento_dict)
    
    logging.info(f"Equipamento criado: {equipamento.marca} {equipamento.modelo} para cliente {equipamento.cliente_id}")
    
    return equipamento

@router.put("/{equipamento_id}", response_model=Equipamento)
async def update_equipamento(
    equipamento_id: str,
    equipamento_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar equipamento"""
    existing = await db.equipamentos.find_one({"id": equipamento_id})
    
    if not existing:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado")
    
    # Remover campos que não devem ser atualizados
    equipamento_data.pop("id", None)
    equipamento_data.pop("created_at", None)
    equipamento_data.pop("cliente_id", None)  # Cliente não pode ser mudado
    
    await db.equipamentos.update_one(
        {"id": equipamento_id},
        {"$set": equipamento_data}
    )
    
    updated = await db.equipamentos.find_one({"id": equipamento_id}, {"_id": 0})
    
    logging.info(f"Equipamento atualizado: {equipamento_id}")
    
    return updated

@router.delete("/{equipamento_id}")
async def delete_equipamento(
    equipamento_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Deletar equipamento (soft delete)"""
    result = await db.equipamentos.update_one(
        {"id": equipamento_id},
        {"$set": {"ativo": False}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado")
    
    logging.info(f"Equipamento deletado: {equipamento_id}")
    
    return {"message": "Equipamento deletado com sucesso"}

@router.get("/{equipamento_id}/intervencoes")
async def get_equipamento_intervencoes(
    equipamento_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Buscar todas as intervenções relacionadas a um equipamento do cliente"""
    equipamento = await db.equipamentos.find_one({"id": equipamento_id, "ativo": True}, {"_id": 0})
    if not equipamento:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado")
    
    # 1. Buscar OTs via equipamentos_ot (link direto equipamento_cliente_id)
    equips_ot = await db.equipamentos_ot.find(
        {"equipamento_cliente_id": equipamento_id}, {"_id": 0, "relatorio_id": 1, "id": 1}
    ).to_list(None)
    relatorio_ids_set = {e["relatorio_id"] for e in equips_ot}
    
    # 2. Buscar OTs via correspondência marca/modelo no equipamentos_ot
    marca = equipamento.get("marca", "")
    modelo = equipamento.get("modelo", "")
    serie = equipamento.get("numero_serie", "")
    if marca and modelo:
        ot_match = {"marca": marca, "modelo": modelo}
        if serie:
            ot_match["numero_serie"] = serie
        equips_ot_by_props = await db.equipamentos_ot.find(
            ot_match, {"_id": 0, "relatorio_id": 1}
        ).to_list(None)
        for e in equips_ot_by_props:
            relatorio_ids_set.add(e["relatorio_id"])
    
    # 3. Buscar OTs via correspondência marca/modelo no relatório principal
    if marca and modelo:
        match_filter = {
            "cliente_id": equipamento.get("cliente_id"),
            "equipamento_marca": marca,
            "equipamento_modelo": modelo
        }
        if serie:
            match_filter["equipamento_numero_serie"] = serie
        ots_by_match = await db.relatorios_tecnicos.find(
            match_filter, {"_id": 0, "id": 1}
        ).to_list(None)
        for ot in ots_by_match:
            relatorio_ids_set.add(ot["id"])
    
    if not relatorio_ids_set:
        return []
    
    relatorio_ids = list(relatorio_ids_set)
    
    # 3. Buscar intervenções dessas OTs
    intervencoes = await db.intervencoes_relatorio.find(
        {"relatorio_id": {"$in": relatorio_ids}}, {"_id": 0}
    ).sort([("data_intervencao", -1), ("ordem", 1)]).to_list(None)
    
    # 4. Buscar info das OTs para enriquecer (numero_assistencia, data_servico)
    ots_info = await db.relatorios_tecnicos.find(
        {"id": {"$in": relatorio_ids}},
        {"_id": 0, "id": 1, "numero_assistencia": 1, "data_servico": 1, "local_intervencao": 1, "status": 1}
    ).to_list(None)
    ots_map = {ot["id"]: ot for ot in ots_info}
    
    # 5. Enriquecer intervenções com info da OT
    result = []
    for interv in intervencoes:
        ot_info = ots_map.get(interv.get("relatorio_id"), {})
        result.append({
            "id": interv.get("id"),
            "relatorio_id": interv.get("relatorio_id"),
            "data_intervencao": str(interv.get("data_intervencao", "")),
            "motivo_assistencia": interv.get("motivo_assistencia", ""),
            "relatorio_assistencia": interv.get("relatorio_assistencia", ""),
            "equipamento_id": interv.get("equipamento_id"),
            "ordem": interv.get("ordem", 0),
            "ot_numero": ot_info.get("numero_assistencia"),
            "ot_data": str(ot_info.get("data_servico", "")),
            "ot_local": ot_info.get("local_intervencao", ""),
            "ot_status": ot_info.get("status", "")
        })
    
    return result


