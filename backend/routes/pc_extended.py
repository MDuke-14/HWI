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
#  CANCELAR PC (Fase 6)
# =============================================================
class CancelarPCPayload(BaseModel):
    motivo: str = Field(min_length=1, max_length=500)


@router.post("/pedidos-cotacao/{pc_id}/cancelar")
async def cancelar_pc(
    pc_id: str,
    payload: CancelarPCPayload,
    current_user: dict = Depends(get_current_user),
):
    """Cancela a PC: muda status para 'Cancelado' e regista motivo no histórico."""
    pc = await db.pedidos_cotacao.find_one({"id": pc_id}, {"_id": 0})
    if not pc:
        raise HTTPException(404, "PC não encontrado")

    if pc.get("status") == "Cancelado":
        raise HTTPException(400, "PC já está cancelado")

    agora = datetime.now(timezone.utc).isoformat()
    motivo = payload.motivo.strip()

    await db.pedidos_cotacao.update_one(
        {"id": pc_id},
        {"$set": {
            "status": "Cancelado",
            "cancelado_em": agora,
            "cancelado_por": current_user.get("username"),
            "motivo_cancelamento": motivo,
            "updated_at": agora,
        }},
    )

    await record_pc_event(
        db, pc_id, "pc_cancelled",
        f"PC cancelada — motivo: {motivo}",
        current_user=current_user,
        metadata={"motivo": motivo},
    )

    return {"ok": True, "message": "PC cancelada", "cancelado_em": agora, "motivo": motivo}


# =============================================================
#  ENVIAR PEDIDO DE COTAÇÃO (Fase 4 + Fase 5 multi-fornecedor)
# =============================================================
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class EmailManualEntry(BaseModel):
    email: str
    nome: Optional[str] = None


class EnviarPedidoCotacaoPayload(BaseModel):
    material_ids: List[str] = Field(default_factory=list)  # se vazio, envia todos
    # Modo explícito de envio (Fase 5). Se omisso, é inferido de material_ids.
    envio_modo: Optional[str] = None  # "global" | "individual"
    # --- Fase 4 (individual, retro-compatível) ---
    fornecedor_id: Optional[str] = None
    fornecedor_email_custom: Optional[str] = None
    fornecedor_nome_custom: Optional[str] = None
    # --- Fase 5 (multi-fornecedor no modo global) ---
    fornecedor_ids: List[str] = Field(default_factory=list)
    emails_manuais: List[EmailManualEntry] = Field(default_factory=list)
    incluir_fs_pdf: bool = False
    # ---
    cc: List[str] = Field(default_factory=list)
    assunto: Optional[str] = None
    mensagem: Optional[str] = None
    anexos_doc_ids: List[str] = Field(default_factory=list)


def _valid_email(e: str) -> bool:
    return bool(e and EMAIL_RE.match(e.strip()))


async def _generate_fs_pdf_bytes(relatorio_id: str) -> Optional[bytes]:
    """Gera o PDF completo da FS (mesma lógica do endpoint preview-pdf).
    Corre em thread pool porque generate_ot_pdf é síncrono/CPU-bound."""
    from fastapi.concurrency import run_in_threadpool
    from ot_pdf_report import generate_ot_pdf

    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not relatorio:
        return None
    cliente = await db.clientes.find_one({"id": relatorio.get("cliente_id")}, {"_id": 0}) or {}
    intervencoes = await db.intervencoes_relatorio.find({"relatorio_id": relatorio_id}, {"_id": 0}) \
        .sort([("herdada_de_intervencao_id", -1), ("ordem", 1), ("data_intervencao", 1)]).to_list(length=None)
    tecnicos = await db.tecnicos_relatorio.find({"relatorio_id": relatorio_id}, {"_id": 0}) \
        .sort([("data_trabalho", 1), ("hora_inicio", 1)]).to_list(length=None)
    fotografias = await db.fotos_relatorio.find({"relatorio_id": relatorio_id}, {"_id": 0}) \
        .sort("ordem", 1).to_list(length=None)
    assinaturas = await db.assinaturas_relatorio.find({"relatorio_id": relatorio_id}, {"_id": 0}) \
        .sort("data_assinatura", 1).to_list(length=None)
    equipamentos_adicionais = await db.equipamentos_ot.find({"relatorio_id": relatorio_id}, {"_id": 0}) \
        .sort("ordem", 1).to_list(length=None)
    materiais_all = await db.materiais_ot.find({"relatorio_id": relatorio_id}, {"_id": 0}).to_list(length=None)
    registos_mao_obra = await db.registos_tecnico_ot.find({"relatorio_id": relatorio_id}, {"_id": 0}) \
        .sort([("data_trabalho", 1), ("hora_inicio_segmento", 1)]).to_list(length=None)
    company_info = await db.company_info.find_one({"id": "company_info_default"}, {"_id": 0})
    rel_assistencia = await db.relatorios_assistencia.find({"relatorio_id": relatorio_id}, {"_id": 0}) \
        .sort("created_at", 1).to_list(length=None)

    buf = await run_in_threadpool(
        generate_ot_pdf,
        relatorio, cliente, intervencoes, tecnicos, fotografias, assinaturas,
        equipamentos_adicionais, materiais_all, registos_mao_obra, company_info, rel_assistencia,
    )
    return buf.getvalue() if hasattr(buf, "getvalue") else buf


def _build_email_html(pc: dict, ot_num: str, cliente: str, corpo: str) -> str:
    return f"""
    <html><body style="font-family:Arial,sans-serif;color:#222;line-height:1.5;max-width:640px;margin:0 auto;">
      <div style="background:#1e40af;color:#fff;padding:14px 18px;">
        <h3 style="margin:0;">Pedido de Cotação — PC {pc.get('numero_pc','')}</h3>
        <p style="margin:4px 0 0;opacity:.9;font-size:13px;">FS #{ot_num} · {cliente}</p>
      </div>
      <div style="padding:18px;white-space:pre-wrap;">{corpo}</div>
      <div style="background:#f5f5f5;padding:12px 18px;font-size:12px;color:#666;">
        HWI Unipessoal, Lda · geral@hwi.pt
      </div>
    </body></html>
    """


def _get_smtp_config() -> dict:
    cfg = {
        "host": os.environ.get("SMTP_HOST"),
        "port": int(os.environ.get("SMTP_PORT", 587)),
        "user": os.environ.get("SMTP_USER"),
        "password": os.environ.get("SMTP_PASSWORD"),
        "sender": os.environ.get("SMTP_FROM", "geral@hwi.pt"),
    }
    if not (cfg["host"] and cfg["user"] and cfg["password"]):
        raise HTTPException(500, "SMTP não configurado no servidor")
    return cfg


async def _send_one_email(cfg: dict, to_email: str, cc_list: list, subject: str,
                         html: str, anexos: list) -> None:
    msg = MIMEMultipart()
    msg["From"] = cfg["sender"]
    msg["To"] = to_email
    if cc_list:
        msg["Cc"] = ", ".join(cc_list)
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html"))

    for a in anexos:
        try:
            part = MIMEApplication(a["content"])
            part.add_header("Content-Disposition", "attachment", filename=a["filename"])
            msg.attach(part)
        except Exception as e:
            logger.warning(f"Falha a anexar {a.get('filename')}: {e}")

    await aiosmtplib.send(
        msg,
        hostname=cfg["host"],
        port=cfg["port"],
        username=cfg["user"],
        password=cfg["password"],
        start_tls=True,
        recipients=[to_email] + cc_list,
    )


@router.post("/pedidos-cotacao/{pc_id}/enviar-cotacao")
async def enviar_pedido_cotacao(
    pc_id: str,
    payload: EnviarPedidoCotacaoPayload,
    current_user: dict = Depends(get_current_user),
):
    """Envia pedido de cotação por email associando o(s) fornecedor(es) aos
    materiais indicados. Regista tudo no histórico da PC.

    Dois modos:
      - Individual (Fase 4): 1 fornecedor OU 1 email manual → escreve
        `fornecedor_id/nome/email` no material (sobrescreve se já existia).
      - Global multi-fornecedor (Fase 5): `fornecedor_ids[]` e/ou
        `emails_manuais[]` → NÃO sobrescreve `fornecedor_id` do material;
        acrescenta uma entrada em `cotacoes_solicitadas[]` por destinatário e
        cada destinatário recebe um email separado.
    """
    pc = await db.pedidos_cotacao.find_one({"id": pc_id}, {"_id": 0})
    if not pc:
        raise HTTPException(404, "PC não encontrado")

    # --- Determinar modo (multi vs single) ---
    is_multi = bool(payload.fornecedor_ids or payload.emails_manuais)
    is_single = bool(payload.fornecedor_id or payload.fornecedor_email_custom)

    if not (is_multi or is_single):
        raise HTTPException(400, "É necessário selecionar um fornecedor ou indicar email manual")
    if is_multi and is_single:
        raise HTTPException(400, "Não é possível combinar campos legados (fornecedor_id/email_custom) com fornecedor_ids/emails_manuais")

    # --- Resolver destinatários ---
    # destinatarios: [{fornecedor_id?, nome, email}], dedup por email
    destinatarios: List[dict] = []
    seen_emails = set()

    if is_multi:
        if payload.fornecedor_ids:
            # Deduplicar ids antes de validar/pesquisar
            dedup_ids = list(dict.fromkeys(payload.fornecedor_ids))
            fdocs = await db.fornecedores.find(
                {"id": {"$in": dedup_ids}}, {"_id": 0}
            ).to_list(length=None)
            if len(fdocs) != len(dedup_ids):
                raise HTTPException(404, "Um ou mais fornecedores não encontrados")
            for f in fdocs:
                em = (f.get("email") or "").strip()
                if not _valid_email(em):
                    raise HTTPException(400, f"Fornecedor '{f.get('nome')}' não tem email válido")
                if em.lower() in seen_emails:
                    continue
                seen_emails.add(em.lower())
                destinatarios.append({"fornecedor_id": f["id"], "nome": f.get("nome"), "email": em})
        for m in payload.emails_manuais:
            em = (m.email or "").strip()
            if not _valid_email(em):
                raise HTTPException(400, f"Email manual inválido: {em}")
            if em.lower() in seen_emails:
                continue
            seen_emails.add(em.lower())
            destinatarios.append({"fornecedor_id": None, "nome": (m.nome or em).strip(), "email": em})
    else:
        # Modo individual (Fase 4)
        if payload.fornecedor_id:
            fdoc = await db.fornecedores.find_one({"id": payload.fornecedor_id}, {"_id": 0})
            if not fdoc:
                raise HTTPException(404, "Fornecedor não encontrado")
            if not _valid_email(fdoc.get("email")):
                raise HTTPException(400, f"Fornecedor '{fdoc.get('nome')}' não tem email válido")
            destinatarios.append({
                "fornecedor_id": fdoc["id"], "nome": fdoc.get("nome"),
                "email": (fdoc.get("email") or "").strip(),
            })
        else:
            if not _valid_email(payload.fornecedor_email_custom):
                raise HTTPException(400, "Email do fornecedor inválido")
            em = payload.fornecedor_email_custom.strip()
            destinatarios.append({
                "fornecedor_id": None,
                "nome": (payload.fornecedor_nome_custom or em).strip(),
                "email": em,
            })

    # --- CC ---
    cc_list = []
    for e in payload.cc:
        e = (e or "").strip()
        if not e:
            continue
        if not _valid_email(e):
            raise HTTPException(400, f"Email CC inválido: {e}")
        cc_list.append(e)

    # --- Materiais alvo ---
    if payload.material_ids:
        materiais = await db.materiais_ot.find(
            {"pc_id": pc_id, "id": {"$in": payload.material_ids}}, {"_id": 0}
        ).to_list(length=None)
        if len(materiais) != len(payload.material_ids):
            raise HTTPException(400, "Alguns materiais indicados não pertencem a esta PC")
    else:
        materiais = await db.materiais_ot.find({"pc_id": pc_id}, {"_id": 0}).to_list(length=None)

    if not materiais:
        raise HTTPException(400, "Não há materiais a incluir no envio")

    # Determinar envio_tipo: modo explícito > inferência por material_ids
    if payload.envio_modo in ("global", "individual"):
        envio_tipo = payload.envio_modo
    else:
        envio_tipo = "individual" if payload.material_ids else "global"

    # Restrição só para o modo individual real (envio de 1 material via botão da linha)
    if envio_tipo == "individual" and len(destinatarios) > 1:
        raise HTTPException(400, "Envio individual suporta apenas 1 fornecedor. Usa o envio Global para vários destinatários.")

    # --- OT (contexto) ---
    ot = await db.relatorios_tecnicos.find_one({"id": pc.get("relatorio_id")}, {"_id": 0}) or {}
    ot_num = ot.get("numero_assistencia", "N/A")
    cliente = ot.get("cliente_nome", "")

    # --- Assunto / Mensagem ---
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

    corpo = (payload.mensagem or "").strip() or (
        "Bom dia,\n\n"
        "Solicito cotação para os seguintes materiais:\n\n"
        + "\n".join(linhas_materiais)
        + "\n\nAgradeço o vosso melhor preço e prazo de entrega.\n\n"
        "Com os melhores cumprimentos,\nHWI Unipessoal, Lda"
    )
    html = _build_email_html(pc, ot_num, cliente, corpo)

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

    # --- Anexo automático: FS.pdf (opcional Fase 5) ---
    fs_pdf_incluido = False
    if payload.incluir_fs_pdf and pc.get("relatorio_id"):
        try:
            pdf_bytes = await _generate_fs_pdf_bytes(pc["relatorio_id"])
            if pdf_bytes:
                anexos.append({
                    "filename": f"FS_{ot_num}.pdf",
                    "content": pdf_bytes,
                    "content_type": "application/pdf",
                })
                fs_pdf_incluido = True
        except Exception as e:
            logger.warning(f"Falha a gerar FS.pdf para PC {pc_id}: {e}")

    # --- SMTP config ---
    smtp_cfg = _get_smtp_config()
    agora = datetime.now(timezone.utc).isoformat()

    # --- Enviar 1 email por destinatário ---
    enviados = []
    falhas = []
    for dest in destinatarios:
        try:
            await _send_one_email(smtp_cfg, dest["email"], cc_list, assunto, html, anexos)
            enviados.append(dest)
        except Exception as e:
            logger.error(f"Falha SMTP para {dest['email']} (PC {pc_id}): {e}")
            falhas.append({**dest, "erro": str(e)[:200]})

    if not enviados:
        # Ninguém recebeu — devolve 500 sem tocar na DB
        raise HTTPException(500, "Erro ao enviar email. Verifique as configurações SMTP ou tente novamente.")

    # --- Atualizar materiais ---
    mat_ids = [m["id"] for m in materiais]

    if is_single:
        # Fase 4: sobrescreve fornecedor único do material
        d = enviados[0]
        await db.materiais_ot.update_many(
            {"id": {"$in": mat_ids}, "pc_id": pc_id},
            {"$set": {
                "fornecedor_id": d["fornecedor_id"],
                "fornecedor_nome": d["nome"],
                "fornecedor_email": d["email"],
                "cotacao_status": "em_cotacao",
                "cotacao_pedida_em": agora,
                "cotacao_pedida_por": current_user.get("username"),
                "updated_at": agora,
            }},
        )
    else:
        # Fase 5: apenas acrescenta em `cotacoes_solicitadas[]` (não sobrescreve fornecedor)
        entries = [
            {
                "fornecedor_id": d["fornecedor_id"],
                "fornecedor_nome": d["nome"],
                "fornecedor_email": d["email"],
                "requested_at": agora,
                "requested_by": current_user.get("username"),
            }
            for d in enviados
        ]
        await db.materiais_ot.update_many(
            {"id": {"$in": mat_ids}, "pc_id": pc_id},
            {
                "$push": {"cotacoes_solicitadas": {"$each": entries}},
                "$set": {
                    "cotacao_status": "em_cotacao",
                    "updated_at": agora,
                },
            },
        )

    # --- Atualizar estado geral da PC (se ainda em espera) ---
    if pc.get("status") in (None, "", "Em Espera"):
        await db.pedidos_cotacao.update_one(
            {"id": pc_id},
            {"$set": {"status": "Cotação Pedida", "updated_at": agora}},
        )

    # --- Registar 1 evento por destinatário ---
    for d in enviados:
        descricao_hist = (
            f"Pedido de cotação enviado a '{d['nome']}' <{d['email']}> "
            f"para {len(materiais)} material(is) ({envio_tipo})"
        )
        await record_pc_event(
            db, pc_id, "email_sent",
            descricao_hist,
            current_user=current_user,
            fornecedor_id=d["fornecedor_id"],
            metadata={
                "envio_tipo": envio_tipo,
                "tipo": envio_tipo,  # legacy alias
                "multi": is_multi,
                "fornecedor_nome": d["nome"],
                "fornecedor_email": d["email"],
                "materiais": [{"id": m["id"], "descricao": m.get("descricao")} for m in materiais],
                "cc": cc_list,
                "assunto": assunto,
                "anexos": len(anexos),
                "fs_pdf_incluido": fs_pdf_incluido,
            },
        )

    if falhas:
        # Envio parcial — regista no histórico como aviso
        await record_pc_event(
            db, pc_id, "email_send_failed",
            f"{len(falhas)} envio(s) falhou/falharam: " + ", ".join(f["email"] for f in falhas),
            current_user=current_user,
            metadata={"falhas": falhas},
        )

    return {
        "ok": True,
        "message": f"Pedido enviado a {len(enviados)} destinatário(s), {len(materiais)} material(is)"
                   + (f" · {len(falhas)} falha(s)" if falhas else ""),
        "enviados": len(enviados),
        "falhas": len(falhas),
        "detalhes_falhas": falhas,
        "materiais_atualizados": len(materiais),
        "envio_tipo": envio_tipo,
        "fs_pdf_incluido": fs_pdf_incluido,
    }
