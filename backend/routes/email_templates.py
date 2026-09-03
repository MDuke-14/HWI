"""Módulo de Email Templates — permite gerir corpos de email da app.

Cada template tem uma `key` estável (ex.: `pc_cotacao_request`) usada no
código para lookup. O corpo suporta placeholders no formato ``{variavel}`` que
são substituídos em runtime pelas variáveis passadas ao helper `render()`.

Templates novos podem ser adicionados via seed (`ensure_default_templates`) sem
sobrescrever alterações feitas pelo admin.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import db
from auth_utils import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Email Templates"])


class EmailTemplate(BaseModel):
    key: str
    nome: str
    descricao: Optional[str] = None
    assunto: str
    corpo_html: str
    variaveis: List[str] = Field(default_factory=list)  # nomes usados no corpo
    editavel: bool = True  # false = template infra que não deve ser removido
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None


class EmailTemplateUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    assunto: Optional[str] = None
    corpo_html: Optional[str] = None


# ---------------------------------------------------------------
#  DEFAULTS — templates seed. NÃO sobrescrevem alterações do admin.
# ---------------------------------------------------------------
DEFAULT_TEMPLATES: List[dict] = [
    {
        "key": "pc_cotacao_request",
        "nome": "Pedido de Cotação — pedido a fornecedor",
        "descricao": "Email enviado ao fornecedor quando se envia um pedido de cotação (Fase 4/5).",
        "assunto": "Pedido de Cotação - PC {numero_pc}",
        "corpo_html": (
            "<p>Bom dia,</p>"
            "<p>Solicito cotação para os seguintes materiais:</p>"
            "<pre style='font-family:inherit;white-space:pre-wrap;background:#f5f5f5;padding:10px;border-radius:6px;'>{lista_materiais}</pre>"
            "<p>Agradeço o vosso melhor preço e prazo de entrega.</p>"
            "<p style='margin:20px 0;'>"
            "<a href='{link_pc}' style='display:inline-block;background:#1e40af;color:#ffffff;"
            "text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;'>Ver Pedido de Cotação</a>"
            "</p>"
            "<p>Com os melhores cumprimentos,<br/>HWI Unipessoal, Lda</p>"
        ),
        "variaveis": ["numero_pc", "numero_fs", "cliente_nome", "lista_materiais", "fornecedor_nome", "link_pc"],
    },
    {
        "key": "pc_pdf_email",
        "nome": "Pedido de Cotação — envio do PDF ao cliente",
        "descricao": "Email de envio do PDF gerado da PC ao cliente/comercial.",
        "assunto": "Pedido de Cotação {numero_pc} - FS #{numero_fs}",
        "corpo_html": (
            "<p>Bom dia,</p>"
            "<p>Junto envio o Pedido de Cotação <b>{numero_pc}</b> "
            "referente à FS <b>#{numero_fs}</b>.</p>"
            "<p>Cliente: {cliente_nome}</p>"
            "<p>Com os melhores cumprimentos,<br/>HWI Unipessoal, Lda</p>"
        ),
        "variaveis": ["numero_pc", "numero_fs", "cliente_nome"],
    },
    {
        "key": "password_reset",
        "nome": "Reposição de palavra-passe",
        "descricao": "Envio de nova palavra-passe temporária ao utilizador.",
        "assunto": "HWI — Nova palavra-passe temporária",
        "corpo_html": (
            "<p>Olá {user_name},</p>"
            "<p>A tua palavra-passe foi reposta. A nova palavra-passe temporária é:</p>"
            "<p style='font-family:monospace;font-size:18px;background:#f5f5f5;padding:8px;'>{temporary_password}</p>"
            "<p>Recomenda-se que a alteres no primeiro login.</p>"
            "<p>Cumprimentos,<br/>HWI Unipessoal, Lda</p>"
        ),
        "variaveis": ["user_name", "temporary_password"],
    },
    {
        "key": "vacation_decision",
        "nome": "Férias — decisão (aprovada/rejeitada)",
        "descricao": "Notificação ao trabalhador quando o admin decide sobre o pedido de férias.",
        "assunto": "Decisão sobre o pedido de férias — {estado}",
        "corpo_html": (
            "<p>Olá {user_name},</p>"
            "<p>O teu pedido de férias de <b>{data_inicio}</b> a <b>{data_fim}</b> "
            "foi <b>{estado}</b>.</p>"
            "<p>{observacao}</p>"
            "<p>Cumprimentos,<br/>HWI Unipessoal, Lda</p>"
        ),
        "variaveis": ["user_name", "data_inicio", "data_fim", "estado", "observacao"],
    },
    {
        "key": "service_notification",
        "nome": "Notificação de Serviço (FS)",
        "descricao": "Email a técnicos ao criar/atualizar uma folha de serviço.",
        "assunto": "Serviço {numero_fs} — {tipo_acao}",
        "corpo_html": (
            "<p>Olá,</p>"
            "<p>{mensagem}</p>"
            "<p>Cliente: <b>{cliente_nome}</b><br/>"
            "Local: {local_intervencao}<br/>"
            "Data: {data_servico}</p>"
            "<p>Cumprimentos,<br/>HWI Unipessoal, Lda</p>"
        ),
        "variaveis": ["numero_fs", "tipo_acao", "mensagem", "cliente_nome", "local_intervencao", "data_servico"],
    },
]


async def ensure_default_templates() -> None:
    """Cria os templates default que ainda não existam. Nunca sobrescreve
    templates existentes, MAS adiciona variáveis novas ao array `variaveis`
    para o Admin ver os placeholders disponíveis."""
    now = datetime.now(timezone.utc).isoformat()
    for tpl in DEFAULT_TEMPLATES:
        exists = await db.email_templates.find_one({"key": tpl["key"]}, {"_id": 0})
        if exists:
            # Merge de variáveis novas sem tocar no corpo/assunto editado pelo admin
            missing_vars = [v for v in tpl.get("variaveis", []) if v not in (exists.get("variaveis") or [])]
            if missing_vars:
                merged = list(exists.get("variaveis") or []) + missing_vars
                await db.email_templates.update_one(
                    {"key": tpl["key"]},
                    {"$set": {"variaveis": merged}},
                )
                logger.info(f"[email_templates] Novas variáveis adicionadas a '{tpl['key']}': {missing_vars}")
            continue
        doc = {**tpl, "editavel": True, "updated_at": now, "updated_by": "system"}
        await db.email_templates.insert_one(doc)
        logger.info(f"[email_templates] Seed: '{tpl['key']}'")


def render(template: dict, variables: dict) -> tuple[str, str]:
    """Substitui placeholders {chave} no assunto e corpo. Chaves em falta
    ficam como literal (evita KeyError)."""
    class SafeDict(dict):
        def __missing__(self, key):  # type: ignore[override]
            return "{" + key + "}"

    safe = SafeDict(**{k: ("" if v is None else str(v)) for k, v in variables.items()})
    return (
        template.get("assunto", "").format_map(safe),
        template.get("corpo_html", "").format_map(safe),
    )


async def get_template(key: str) -> Optional[dict]:
    return await db.email_templates.find_one({"key": key}, {"_id": 0})


# ---------------------------------------------------------------
#  ENDPOINTS
# ---------------------------------------------------------------
def _require_admin(current_user: dict) -> None:
    if not current_user.get("is_admin"):
        raise HTTPException(403, "Só administradores podem gerir templates de email")


@router.get("/email-templates")
async def list_email_templates(current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    docs = await db.email_templates.find({}, {"_id": 0}).sort("nome", 1).to_list(length=None)
    return docs


@router.get("/email-templates/{key}")
async def get_email_template(key: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    doc = await db.email_templates.find_one({"key": key}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Template não encontrado")
    return doc


@router.put("/email-templates/{key}")
async def update_email_template(
    key: str,
    payload: EmailTemplateUpdate,
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    doc = await db.email_templates.find_one({"key": key}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Template não encontrado")

    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        return doc
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = current_user.get("username")
    await db.email_templates.update_one({"key": key}, {"$set": update})
    return await db.email_templates.find_one({"key": key}, {"_id": 0})


@router.post("/email-templates/{key}/reset")
async def reset_email_template(key: str, current_user: dict = Depends(get_current_user)):
    """Restaura o template para o valor default do código."""
    _require_admin(current_user)
    default = next((t for t in DEFAULT_TEMPLATES if t["key"] == key), None)
    if not default:
        raise HTTPException(404, "Template default não encontrado")
    now = datetime.now(timezone.utc).isoformat()
    await db.email_templates.update_one(
        {"key": key},
        {"$set": {**default, "editavel": True, "updated_at": now, "updated_by": current_user.get("username")}},
        upsert=True,
    )
    return await db.email_templates.find_one({"key": key}, {"_id": 0})
