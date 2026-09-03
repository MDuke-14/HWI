"""
Extensões PC (Fase 1) — histórico, documentos, observações, cotação status
por material. Endpoints separados do CRUD principal para evitar tocar
routes/pedidos_cotacao.py sem necessidade.
"""
import base64
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, File, Form, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from database import db
from auth_utils import get_current_user
from services.pc_history import record_pc_event

logger = logging.getLogger(__name__)
router = APIRouter(tags=["PC extras"])


# =============================================================
#  HISTÓRICO
# =============================================================
@router.get("/pedidos-cotacao/{pc_id}/historico")
async def list_pc_historico(
    pc_id: str,
    limit: int = 200,
    current_user: dict = Depends(get_current_user),
):
    pc = await db.pedidos_cotacao.find_one({"id": pc_id}, {"_id": 0, "id": 1})
    if not pc:
        raise HTTPException(404, "PC não encontrado")
    items = await db.pc_historico.find(
        {"pc_id": pc_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=limit)
    return items


# =============================================================
#  OBSERVAÇÕES (único registo por PC — sempre mais recente)
# =============================================================
class ObservacaoPayload(BaseModel):
    texto: str


@router.get("/pedidos-cotacao/{pc_id}/observacoes")
async def get_pc_observacao(pc_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.pc_observacoes.find_one(
        {"pc_id": pc_id}, {"_id": 0}, sort=[("edited_at", -1)]
    )
    return doc or {"pc_id": pc_id, "texto": "", "edited_at": None, "edited_by_name": None}


@router.put("/pedidos-cotacao/{pc_id}/observacoes")
async def set_pc_observacao(
    pc_id: str,
    payload: ObservacaoPayload,
    current_user: dict = Depends(get_current_user),
):
    pc = await db.pedidos_cotacao.find_one({"id": pc_id}, {"_id": 0, "numero_pc": 1})
    if not pc:
        raise HTTPException(404, "PC não encontrado")

    doc = {
        "id": str(uuid.uuid4()),
        "pc_id": pc_id,
        "texto": payload.texto,
        "edited_at": datetime.now(timezone.utc).isoformat(),
        "edited_by": current_user.get("sub"),
        "edited_by_name": current_user.get("username"),
    }
    await db.pc_observacoes.insert_one(doc)

    await record_pc_event(
        db, pc_id, "observacoes_updated",
        "Observações atualizadas",
        current_user=current_user,
    )
    doc.pop("_id", None)
    return doc


# =============================================================
#  DOCUMENTOS
# =============================================================
ALLOWED_DOC_MIMES = {
    "application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain", "text/csv",
    "application/zip",
}

MAX_DOC_SIZE = 20 * 1024 * 1024  # 20 MB


@router.get("/pedidos-cotacao/{pc_id}/documentos")
async def list_pc_documentos(pc_id: str, current_user: dict = Depends(get_current_user)):
    pc = await db.pedidos_cotacao.find_one({"id": pc_id}, {"_id": 0, "id": 1})
    if not pc:
        raise HTTPException(404, "PC não encontrado")
    docs = await db.pc_documentos.find(
        {"pc_id": pc_id},
        {"_id": 0, "file_base64": 0},
    ).sort("uploaded_at", -1).to_list(length=None)
    return docs


@router.post("/pedidos-cotacao/{pc_id}/documentos")
async def upload_pc_documento(
    pc_id: str,
    file: UploadFile = File(...),
    tipo: Optional[str] = Form(None),
    descricao: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    pc = await db.pedidos_cotacao.find_one({"id": pc_id}, {"_id": 0, "numero_pc": 1})
    if not pc:
        raise HTTPException(404, "PC não encontrado")

    if file.content_type and file.content_type not in ALLOWED_DOC_MIMES:
        raise HTTPException(415, f"Tipo de ficheiro não suportado: {file.content_type}")

    content = await file.read()
    if len(content) > MAX_DOC_SIZE:
        raise HTTPException(413, "Ficheiro excede 20 MB")

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "pc_id": pc_id,
        "tipo": tipo,
        "filename": f"{doc_id}_{(file.filename or 'documento').replace('/', '_')}",
        "original_name": file.filename,
        "content_type": file.content_type or "application/octet-stream",
        "size": len(content),
        "descricao": descricao,
        "file_base64": base64.b64encode(content).decode("utf-8"),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": current_user.get("sub"),
        "uploaded_by_name": current_user.get("username"),
    }
    await db.pc_documentos.insert_one(doc)

    await record_pc_event(
        db, pc_id, "document_added",
        f"Documento adicionado: {file.filename}",
        current_user=current_user,
        metadata={"tipo": tipo, "size": len(content)},
    )

    doc.pop("file_base64", None)
    doc.pop("_id", None)
    return doc


@router.get("/pedidos-cotacao/{pc_id}/documentos/{doc_id}/download")
async def download_pc_documento(
    pc_id: str,
    doc_id: str,
    current_user: dict = Depends(get_current_user),
):
    doc = await db.pc_documentos.find_one({"id": doc_id, "pc_id": pc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Documento não encontrado")
    try:
        data = base64.b64decode(doc.get("file_base64", ""))
    except Exception:
        raise HTTPException(500, "Documento corrompido")
    return Response(
        content=data,
        media_type=doc.get("content_type", "application/octet-stream"),
        headers={
            "Content-Disposition": f'attachment; filename="{doc.get("original_name") or doc.get("filename")}"'
        },
    )


@router.delete("/pedidos-cotacao/{pc_id}/documentos/{doc_id}")
async def delete_pc_documento(
    pc_id: str,
    doc_id: str,
    current_user: dict = Depends(get_current_user),
):
    doc = await db.pc_documentos.find_one({"id": doc_id, "pc_id": pc_id}, {"_id": 0, "original_name": 1})
    if not doc:
        raise HTTPException(404, "Documento não encontrado")
    await db.pc_documentos.delete_one({"id": doc_id})
    await record_pc_event(
        db, pc_id, "document_removed",
        f"Documento removido: {doc.get('original_name') or doc_id}",
        current_user=current_user,
    )
    return {"ok": True}


# =============================================================
#  MATERIAL — associar fornecedor + estado de cotação
# =============================================================
class MaterialSupplierPayload(BaseModel):
    fornecedor_id: Optional[str] = None
    fornecedor_nome: Optional[str] = None
    fornecedor_email: Optional[str] = None
    cotacao_status: Optional[str] = None  # sem_pedido|em_cotacao|cotacao_recebida|cancelada


VALID_COTACAO_STATUS = {"sem_pedido", "em_cotacao", "cotacao_recebida", "cancelada"}


@router.patch("/pedidos-cotacao/{pc_id}/materiais/{material_id}/fornecedor")
async def assign_material_fornecedor(
    pc_id: str,
    material_id: str,
    payload: MaterialSupplierPayload,
    current_user: dict = Depends(get_current_user),
):
    """Associa/atualiza o fornecedor OU o estado de cotação DUM material específico.
    Só o material passado é afetado — nunca os outros materiais da PC."""
    mat = await db.materiais_ot.find_one({"id": material_id, "pc_id": pc_id}, {"_id": 0})
    if not mat:
        raise HTTPException(404, "Material não encontrado nesta PC")

    update: dict = {}

    # Se veio fornecedor_id, resolve nome/email a partir da DB (snapshot)
    if payload.fornecedor_id:
        fdoc = await db.fornecedores.find_one({"id": payload.fornecedor_id}, {"_id": 0})
        if not fdoc:
            raise HTTPException(404, "Fornecedor não encontrado")
        update["fornecedor_id"] = payload.fornecedor_id
        update["fornecedor_nome"] = fdoc.get("nome")
        update["fornecedor_email"] = fdoc.get("email")
    elif payload.fornecedor_id == "" or payload.fornecedor_nome == "":
        # Limpar
        update["fornecedor_id"] = None
        update["fornecedor_nome"] = None
        update["fornecedor_email"] = None
    else:
        # Modo email manual (sem criar fornecedor na DB)
        if payload.fornecedor_email is not None:
            update["fornecedor_email"] = payload.fornecedor_email
            update["fornecedor_id"] = None
            update["fornecedor_nome"] = payload.fornecedor_nome or payload.fornecedor_email

    if payload.cotacao_status:
        if payload.cotacao_status not in VALID_COTACAO_STATUS:
            raise HTTPException(400, f"cotacao_status inválido")
        update["cotacao_status"] = payload.cotacao_status

    if not update:
        return {"ok": True, "message": "Nada a alterar"}

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.materiais_ot.update_one({"id": material_id}, {"$set": update})

    # Regista no histórico
    desc_parts = []
    if update.get("fornecedor_nome"):
        desc_parts.append(f"Fornecedor '{update['fornecedor_nome']}' associado ao material '{mat.get('descricao','?')}'")
    if update.get("cotacao_status"):
        desc_parts.append(f"Estado cotação → {update['cotacao_status']}")
    if desc_parts:
        await record_pc_event(
            db, pc_id, "material_fornecedor_updated",
            " · ".join(desc_parts),
            current_user=current_user,
            material_id=material_id,
            fornecedor_id=update.get("fornecedor_id"),
        )

    return {"ok": True, "material_id": material_id, "update": update}
