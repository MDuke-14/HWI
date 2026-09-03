"""
Extensões PC (Fase 1) — histórico, documentos, observações, cotação status
por material. Endpoints separados do CRUD principal para evitar tocar
routes/pedidos_cotacao.py sem necessidade.
"""
import base64
import os
import re
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, File, Form, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication

import aiosmtplib

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


# =============================================================
#  ENVIAR PEDIDO DE COTAÇÃO (Fase 4)
# =============================================================
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class EnviarPedidoCotacaoPayload(BaseModel):
    material_ids: List[str] = Field(default_factory=list)  # se vazio, envia todos
    fornecedor_id: Optional[str] = None
    fornecedor_email_custom: Optional[str] = None
    fornecedor_nome_custom: Optional[str] = None
    cc: List[str] = Field(default_factory=list)
    assunto: Optional[str] = None
    mensagem: Optional[str] = None
    anexos_doc_ids: List[str] = Field(default_factory=list)


def _valid_email(e: str) -> bool:
    return bool(e and EMAIL_RE.match(e.strip()))


@router.post("/pedidos-cotacao/{pc_id}/enviar-cotacao")
async def enviar_pedido_cotacao(
    pc_id: str,
    payload: EnviarPedidoCotacaoPayload,
    current_user: dict = Depends(get_current_user),
):
    """Envia pedido de cotação por email associando o fornecedor selecionado
    aos materiais indicados. Regista tudo no histórico da PC."""
    pc = await db.pedidos_cotacao.find_one({"id": pc_id}, {"_id": 0})
    if not pc:
        raise HTTPException(404, "PC não encontrado")

    # --- Resolver fornecedor (DB ou email manual) ---
    fornecedor_id = None
    fornecedor_nome = None
    fornecedor_email = None

    if payload.fornecedor_id:
        fdoc = await db.fornecedores.find_one({"id": payload.fornecedor_id}, {"_id": 0})
        if not fdoc:
            raise HTTPException(404, "Fornecedor não encontrado")
        if not fdoc.get("email") or not _valid_email(fdoc.get("email")):
            raise HTTPException(400, f"Fornecedor '{fdoc.get('nome')}' não tem email válido")
        fornecedor_id = fdoc["id"]
        fornecedor_nome = fdoc.get("nome")
        fornecedor_email = fdoc.get("email")
    elif payload.fornecedor_email_custom:
        if not _valid_email(payload.fornecedor_email_custom):
            raise HTTPException(400, "Email do fornecedor inválido")
        fornecedor_email = payload.fornecedor_email_custom.strip()
        fornecedor_nome = (payload.fornecedor_nome_custom or fornecedor_email).strip()
    else:
        raise HTTPException(400, "É necessário selecionar um fornecedor ou indicar email manual")

    # --- Validar CC ---
    cc_list = []
    for e in payload.cc:
        e = (e or "").strip()
        if not e:
            continue
        if not _valid_email(e):
            raise HTTPException(400, f"Email CC inválido: {e}")
        cc_list.append(e)

    # --- Buscar materiais alvo ---
    if payload.material_ids:
        materiais = await db.materiais_ot.find(
            {"pc_id": pc_id, "id": {"$in": payload.material_ids}}, {"_id": 0}
        ).to_list(length=None)
        if len(materiais) != len(payload.material_ids):
            raise HTTPException(400, "Alguns materiais indicados não pertencem a esta PC")
        # Se material_ids foi fornecido explicitamente, é envio individual
        # (mesmo que o utilizador tenha selecionado todos os materiais)
        envio_tipo = "individual"
    else:
        materiais = await db.materiais_ot.find({"pc_id": pc_id}, {"_id": 0}).to_list(length=None)
        envio_tipo = "global"

    if not materiais:
        raise HTTPException(400, "Não há materiais a incluir no envio")

    # --- Buscar OT (para contexto) ---
    ot = await db.relatorios_tecnicos.find_one({"id": pc.get("relatorio_id")}, {"_id": 0}) or {}

    # --- Assunto / Mensagem padrão ---
    assunto = (payload.assunto or "").strip() or f"Pedido de Cotação - PC {pc.get('numero_pc', pc_id[:8])}"

    linhas_materiais = []
    for m in materiais:
        qtd = m.get("quantidade")
        un = m.get("unidade", "Un")
        desc = m.get("descricao", "")
        cod = m.get("codigo")
        pos = m.get("posicao")
        extras = []
        if cod:
            extras.append(f"Cód: {cod}")
        if pos:
            extras.append(f"Pos: {pos}")
        suffix = f" ({'; '.join(extras)})" if extras else ""
        linhas_materiais.append(f"- {qtd} {un} · {desc}{suffix}")

    corpo_padrao = (payload.mensagem or "").strip() or (
        "Bom dia,\n\n"
        "Solicito cotação para os seguintes materiais:\n\n"
        + "\n".join(linhas_materiais)
        + "\n\nAgradeço o vosso melhor preço e prazo de entrega.\n\n"
        "Com os melhores cumprimentos,\nHWI Unipessoal, Lda"
    )

    # --- Construir mensagem HTML simples ---
    ot_num = ot.get("numero_assistencia", "N/A")
    cliente = ot.get("cliente_nome", "")
    html = f"""
    <html><body style="font-family:Arial,sans-serif;color:#222;line-height:1.5;max-width:640px;margin:0 auto;">
      <div style="background:#1e40af;color:#fff;padding:14px 18px;">
        <h3 style="margin:0;">Pedido de Cotação — PC {pc.get('numero_pc','')}</h3>
        <p style="margin:4px 0 0;opacity:.9;font-size:13px;">FS #{ot_num} · {cliente}</p>
      </div>
      <div style="padding:18px;white-space:pre-wrap;">{corpo_padrao}</div>
      <div style="background:#f5f5f5;padding:12px 18px;font-size:12px;color:#666;">
        HWI Unipessoal, Lda · geral@hwi.pt
      </div>
    </body></html>
    """

    # --- Anexos: documentos do PC ---
    anexos = []
    if payload.anexos_doc_ids:
        docs = await db.pc_documentos.find(
            {"pc_id": pc_id, "id": {"$in": payload.anexos_doc_ids}}, {"_id": 0}
        ).to_list(length=None)
        if len(docs) != len(payload.anexos_doc_ids):
            raise HTTPException(400, "Alguns anexos indicados não pertencem a esta PC")
        for d in docs:
            try:
                anexos.append({
                    "filename": d.get("original_name") or d.get("filename") or "anexo",
                    "content": base64.b64decode(d.get("file_base64", "")),
                    "content_type": d.get("content_type") or "application/octet-stream",
                })
            except Exception as e:
                logger.warning(f"Falha a descodificar anexo {d.get('id')}: {e}")

    # --- Enviar email via SMTP ---
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", 587))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_password = os.environ.get("SMTP_PASSWORD")
    smtp_from = os.environ.get("SMTP_FROM", "geral@hwi.pt")

    if not (smtp_host and smtp_user and smtp_password):
        raise HTTPException(500, "SMTP não configurado no servidor")

    msg = MIMEMultipart()
    msg["From"] = smtp_from
    msg["To"] = fornecedor_email
    if cc_list:
        msg["Cc"] = ", ".join(cc_list)
    msg["Subject"] = assunto
    msg.attach(MIMEText(html, "html"))

    for a in anexos:
        try:
            part = MIMEApplication(a["content"])
            part.add_header("Content-Disposition", "attachment", filename=a["filename"])
            msg.attach(part)
        except Exception as e:
            logger.warning(f"Falha a anexar {a.get('filename')}: {e}")

    recipients = [fornecedor_email] + cc_list

    try:
        await aiosmtplib.send(
            msg,
            hostname=smtp_host,
            port=smtp_port,
            username=smtp_user,
            password=smtp_password,
            start_tls=True,
            recipients=recipients,
        )
    except Exception as e:
        logger.error(f"Falha SMTP no envio de cotação PC {pc_id}: {e}")
        raise HTTPException(500, "Erro ao enviar email. Verifique as configurações SMTP ou tente novamente.")

    # --- Associar fornecedor aos materiais + atualizar estado cotação ---
    agora = datetime.now(timezone.utc).isoformat()
    update_mat = {
        "fornecedor_id": fornecedor_id,
        "fornecedor_nome": fornecedor_nome,
        "fornecedor_email": fornecedor_email,
        "cotacao_status": "em_cotacao",
        "cotacao_pedida_em": agora,
        "cotacao_pedida_por": current_user.get("username"),
        "updated_at": agora,
    }
    mat_ids = [m["id"] for m in materiais]
    await db.materiais_ot.update_many(
        {"id": {"$in": mat_ids}, "pc_id": pc_id},
        {"$set": update_mat},
    )

    # --- Atualizar estado geral da PC (se ainda em espera) ---
    if pc.get("status") in (None, "", "Em Espera"):
        await db.pedidos_cotacao.update_one(
            {"id": pc_id},
            {"$set": {"status": "Cotação Pedida", "updated_at": agora}},
        )

    # --- Registar evento no histórico ---
    descricao_hist = (
        f"Pedido de cotação enviado a '{fornecedor_nome}' <{fornecedor_email}> "
        f"para {len(materiais)} material(is) ({envio_tipo})"
    )
    await record_pc_event(
        db, pc_id, "email_sent",
        descricao_hist,
        current_user=current_user,
        fornecedor_id=fornecedor_id,
        metadata={
            "envio_tipo": envio_tipo,
            "tipo": envio_tipo,  # legacy alias
            "fornecedor_nome": fornecedor_nome,
            "fornecedor_email": fornecedor_email,
            "materiais": [{"id": m["id"], "descricao": m.get("descricao")} for m in materiais],
            "cc": cc_list,
            "assunto": assunto,
            "anexos": len(anexos),
        },
    )

    return {
        "ok": True,
        "message": f"Pedido enviado a {fornecedor_email} ({len(materiais)} material(is))",
        "materiais_atualizados": len(materiais),
        "envio_tipo": envio_tipo,
    }
