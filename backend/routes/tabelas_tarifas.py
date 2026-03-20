"""
Rotas de Tabelas de Preço e Tarifas.
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from typing import Optional
from datetime import datetime, timezone
import uuid
import os
import logging
import base64

from database import db
from auth_utils import get_current_user, get_current_admin
from models import Tarifa, TarifaCreate, TarifaUpdate, TabelaPrecoConfig, TabelaPrecoCreate, TabelaPrecoConfigUpdate

router = APIRouter(tags=["Tabelas de Preço & Tarifas"])


@router.get("/tabelas-preco")
async def get_tabelas_preco(current_user: dict = Depends(get_current_user)):
    """Obter todas as tabelas de preço"""
    configs = await db.tabelas_preco.find({}, {"_id": 0}).sort("table_id", 1).to_list(length=None)
    
    # Se não existir nenhuma tabela, criar a Tabela 1 por defeito
    if not configs:
        default_config = TabelaPrecoConfig(
            table_id=1,
            valor_km=0.65,
            nome="Tabela 1"
        )
        config_dict = default_config.model_dump()
        config_dict["created_at"] = config_dict["created_at"].isoformat()
        await db.tabelas_preco.insert_one(config_dict)
        config_dict.pop("_id", None)
        configs = [config_dict]
    
    # Replace large imagem_data with a boolean flag
    for c in configs:
        if c.get("imagem_data"):
            c["has_imagem"] = True
            del c["imagem_data"]
        else:
            c["has_imagem"] = False
        c.pop("imagem_content_type", None)
    
    return configs


@router.post("/tabelas-preco")
async def create_tabela_preco(
    config_data: TabelaPrecoCreate,
    current_user: dict = Depends(get_current_admin)
):
    """Criar nova tabela de preço (admin only)"""
    # Obter o próximo table_id
    existing = await db.tabelas_preco.find({}, {"table_id": 1}).sort("table_id", -1).limit(1).to_list(length=1)
    next_table_id = (existing[0]["table_id"] + 1) if existing else 1
    
    new_config = TabelaPrecoConfig(
        table_id=next_table_id,
        valor_km=config_data.valor_km,
        valor_dieta=config_data.valor_dieta,
        nome=config_data.nome
    )
    
    config_dict = new_config.model_dump()
    config_dict["created_at"] = config_dict["created_at"].isoformat()
    
    await db.tabelas_preco.insert_one(config_dict)
    config_dict.pop("_id", None)
    
    logging.info(f"Nova Tabela de Preço criada: {config_data.nome} (ID: {next_table_id}) por {current_user['sub']}")
    return config_dict


@router.put("/tabelas-preco/{table_id}")
async def update_tabela_preco(
    table_id: int,
    config_data: TabelaPrecoConfigUpdate,
    current_user: dict = Depends(get_current_admin)
):
    """Atualizar configuração de uma tabela de preço (admin only)"""
    existing = await db.tabelas_preco.find_one({"table_id": table_id})
    
    if not existing:
        raise HTTPException(status_code=404, detail="Tabela de preço não encontrada")
    
    update_data = {k: v for k, v in config_data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.tabelas_preco.update_one(
        {"table_id": table_id},
        {"$set": update_data}
    )
    
    updated = await db.tabelas_preco.find_one({"table_id": table_id}, {"_id": 0})
    logging.info(f"Tabela de Preço {table_id} atualizada por {current_user['sub']}")
    return updated


@router.delete("/tabelas-preco/{table_id}")
async def delete_tabela_preco(
    table_id: int,
    current_user: dict = Depends(get_current_admin)
):
    """Eliminar uma tabela de preço (admin only)"""
    existing = await db.tabelas_preco.find_one({"table_id": table_id})
    
    if not existing:
        raise HTTPException(status_code=404, detail="Tabela de preço não encontrada")
    
    # Verificar se existem tarifas associadas a esta tabela
    tarifas_count = await db.tarifas.count_documents({"table_id": table_id, "ativo": True})
    if tarifas_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Não é possível eliminar esta tabela. Existem {tarifas_count} tarifas activas associadas. Elimine ou mova as tarifas primeiro."
        )
    
    await db.tabelas_preco.delete_one({"table_id": table_id})
    logging.info(f"Tabela de Preço {table_id} eliminada por {current_user['sub']}")
    return {"message": f"Tabela {table_id} eliminada com sucesso"}


@router.post("/tabelas-preco/{table_id}/imagem")
async def upload_tabela_preco_imagem(
    table_id: int,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_admin)
):
    """Upload da imagem da tabela de preços"""
    existing = await db.tabelas_preco.find_one({"table_id": table_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Tabela de preço não encontrada")
    
    content = await file.read()
    import base64
    img_b64 = base64.b64encode(content).decode('utf-8')
    
    await db.tabelas_preco.update_one(
        {"table_id": table_id},
        {"$set": {
            "imagem_data": img_b64,
            "imagem_content_type": file.content_type,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": "Imagem carregada com sucesso"}


@router.get("/tabelas-preco/{table_id}/imagem")
async def get_tabela_preco_imagem(
    table_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Obter imagem da tabela de preços"""
    from fastapi.responses import Response
    existing = await db.tabelas_preco.find_one({"table_id": table_id}, {"_id": 0})
    if not existing or not existing.get("imagem_data"):
        raise HTTPException(status_code=404, detail="Imagem não encontrada")
    
    import base64
    img_bytes = base64.b64decode(existing["imagem_data"])
    return Response(
        content=img_bytes,
        media_type=existing.get("imagem_content_type", "image/png")
    )


@router.delete("/tabelas-preco/{table_id}/imagem")
async def delete_tabela_preco_imagem(
    table_id: int,
    current_user: dict = Depends(get_current_admin)
):
    """Eliminar imagem da tabela de preços"""
    await db.tabelas_preco.update_one(
        {"table_id": table_id},
        {"$unset": {"imagem_data": "", "imagem_content_type": ""}}
    )
    return {"message": "Imagem eliminada com sucesso"}


@router.get("/tarifas")
async def get_tarifas(
    table_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """Listar todas as tarifas ativas - filtradas opcionalmente por tabela de preço"""
    query = {"ativo": True}
    if table_id is not None:
        # Para table_id=1, incluir tarifas sem table_id (migração) ou com table_id=1
        if table_id == 1:
            query["$or"] = [
                {"table_id": 1},
                {"table_id": {"$exists": False}}
            ]
        else:
            query["table_id"] = table_id
    
    tarifas = await db.tarifas.find(
        query,
        {"_id": 0}
    ).sort("nome", 1).to_list(length=None)
    
    # Adicionar table_id default se não existir (migração)
    for t in tarifas:
        if "table_id" not in t:
            t["table_id"] = 1
    
    return tarifas


@router.get("/tarifas/all")
async def get_all_tarifas(
    table_id: Optional[int] = None,
    current_user: dict = Depends(get_current_admin)
):
    """Listar todas as tarifas (admin only) - filtradas opcionalmente por tabela de preço"""
    query = {}
    if table_id is not None:
        query["table_id"] = table_id
    
    tarifas = await db.tarifas.find(
        query,
        {"_id": 0}
    ).sort("nome", 1).to_list(length=None)
    
    # Adicionar table_id default se não existir (migração)
    for t in tarifas:
        if "table_id" not in t:
            t["table_id"] = 1
    
    return tarifas


@router.post("/tarifas")
async def create_tarifa(
    tarifa_data: TarifaCreate,
    current_user: dict = Depends(get_current_admin)
):
    """Criar nova tarifa (admin only) - permite nomes duplicados"""
    # Validar table_id
    if tarifa_data.table_id not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="ID de tabela inválido. Use 1, 2 ou 3.")
    
    # Validar tipo_registo
    if tarifa_data.tipo_registo and tarifa_data.tipo_registo not in ["trabalho", "viagem", "oficina"]:
        raise HTTPException(status_code=400, detail="Tipo de registo inválido. Use 'trabalho', 'viagem', 'oficina' ou deixe vazio.")
    
    tarifa = Tarifa(
        numero=tarifa_data.numero,
        nome=tarifa_data.nome,
        valor_por_hora=tarifa_data.valor_por_hora,
        codigo=tarifa_data.codigo,
        tipo_registo=tarifa_data.tipo_registo,
        tipo_colaborador=tarifa_data.tipo_colaborador,
        table_id=tarifa_data.table_id
    )
    
    tarifa_dict = tarifa.model_dump()
    tarifa_dict["created_at"] = tarifa_dict["created_at"].isoformat()
    
    await db.tarifas.insert_one(tarifa_dict)
    tarifa_dict.pop("_id", None)
    
    logging.info(f"Tarifa criada: {tarifa.nome} - €{tarifa.valor_por_hora}/h - Código: {tarifa.codigo} - Tipo: {tarifa.tipo_registo} - Colaborador: {tarifa.tipo_colaborador} - Tabela: {tarifa.table_id} por {current_user['sub']}")
    
    return tarifa_dict


@router.put("/tarifas/{tarifa_id}")
async def update_tarifa(
    tarifa_id: str,
    tarifa_data: TarifaUpdate,
    current_user: dict = Depends(get_current_admin)
):
    """Atualizar tarifa (admin only)"""
    existing = await db.tarifas.find_one({"id": tarifa_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Tarifa não encontrada")
    
    # Only include fields that were explicitly sent by the client
    raw_data = tarifa_data.model_dump(exclude_unset=True)
    update_data = {}
    for k, v in raw_data.items():
        update_data[k] = v
    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum dado para atualizar")
    
    # Se está a mudar o número, verificar se já existe
    if "numero" in update_data and update_data["numero"] != existing.get("numero"):
        existing_numero = await db.tarifas.find_one({
            "numero": update_data["numero"], 
            "ativo": True,
            "id": {"$ne": tarifa_id}
        })
        if existing_numero:
            raise HTTPException(status_code=400, detail=f"Já existe uma tarifa com o número {update_data['numero']}")
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.tarifas.update_one(
        {"id": tarifa_id},
        {"$set": update_data}
    )
    
    updated = await db.tarifas.find_one({"id": tarifa_id}, {"_id": 0})
    
    logging.info(f"Tarifa atualizada: {tarifa_id} por {current_user['sub']}")
    
    return updated


@router.delete("/tarifas/{tarifa_id}")
async def delete_tarifa(
    tarifa_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """Desativar tarifa (admin only)"""
    existing = await db.tarifas.find_one({"id": tarifa_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Tarifa não encontrada")
    
    await db.tarifas.update_one(
        {"id": tarifa_id},
        {"$set": {"ativo": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    logging.info(f"Tarifa desativada: {tarifa_id} por {current_user['sub']}")
    
    return {"message": "Tarifa desativada com sucesso"}


