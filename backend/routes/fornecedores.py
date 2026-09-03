"""
CRUD Fornecedores — módulo Pedidos de Cotação (Fase 1).
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone

from database import db
from auth_utils import get_current_user
from models import Fornecedor, FornecedorUpdate

router = APIRouter(tags=["Fornecedores"])


@router.get("/fornecedores")
async def list_fornecedores(
    ativo: Optional[bool] = None,
    q: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Lista fornecedores. Filtros: `ativo`, `q` (texto em nome/email/nif)."""
    query = {}
    if ativo is not None:
        query["ativo"] = ativo
    if q:
        query["$or"] = [
            {"nome": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
            {"nif": {"$regex": q, "$options": "i"}},
        ]
    items = await db.fornecedores.find(query, {"_id": 0}).sort("nome", 1).to_list(length=None)
    return items


@router.get("/fornecedores/{fornecedor_id}")
async def get_fornecedor(fornecedor_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.fornecedores.find_one({"id": fornecedor_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Fornecedor não encontrado")
    return doc


@router.post("/fornecedores")
async def create_fornecedor(payload: Fornecedor, current_user: dict = Depends(get_current_user)):
    # Impedir duplicados por nome+email (case-insensitive)
    existing = await db.fornecedores.find_one({
        "nome": {"$regex": f"^{payload.nome.strip()}$", "$options": "i"},
    })
    if existing:
        raise HTTPException(409, f"Já existe um fornecedor com o nome '{payload.nome}'")

    doc = payload.model_dump()
    doc["nome"] = payload.nome.strip()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["created_by"] = current_user.get("sub")
    await db.fornecedores.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/fornecedores/{fornecedor_id}")
async def update_fornecedor(
    fornecedor_id: str,
    payload: FornecedorUpdate,
    current_user: dict = Depends(get_current_user),
):
    existing = await db.fornecedores.find_one({"id": fornecedor_id})
    if not existing:
        raise HTTPException(404, "Fornecedor não encontrado")

    update = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not update:
        return {"ok": True, "message": "Nada a alterar"}

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = current_user.get("sub")
    await db.fornecedores.update_one({"id": fornecedor_id}, {"$set": update})

    # Se o nome ou email mudaram, propagar snapshot nos materiais que referenciam este fornecedor
    if "nome" in update or "email" in update:
        snap_update = {}
        if "nome" in update:
            snap_update["fornecedor_nome"] = update["nome"]
        if "email" in update:
            snap_update["fornecedor_email"] = update["email"]
        if snap_update:
            await db.materiais_ot.update_many(
                {"fornecedor_id": fornecedor_id},
                {"$set": snap_update},
            )

    doc = await db.fornecedores.find_one({"id": fornecedor_id}, {"_id": 0})
    return doc


@router.delete("/fornecedores/{fornecedor_id}")
async def delete_fornecedor(fornecedor_id: str, current_user: dict = Depends(get_current_user)):
    """Soft delete — marca como inativo. Não apaga fisicamente para preservar
    referências históricas em materiais."""
    existing = await db.fornecedores.find_one({"id": fornecedor_id})
    if not existing:
        raise HTTPException(404, "Fornecedor não encontrado")

    # Contar quantos materiais referenciam este fornecedor
    ref_count = await db.materiais_ot.count_documents({"fornecedor_id": fornecedor_id})
    await db.fornecedores.update_one(
        {"id": fornecedor_id},
        {"$set": {
            "ativo": False,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user.get("sub"),
        }},
    )
    return {"ok": True, "message": "Fornecedor desativado", "referencias_em_materiais": ref_count}
