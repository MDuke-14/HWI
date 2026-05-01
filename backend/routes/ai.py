"""
Router para integração de IA (Claude Sonnet 4.5).

Endpoints:
- POST /api/admin/errors/{id}/ai-resolve  → análise via IA
- POST /api/admin/errors/{id}/ai-execute  → executa acção automática segura
- POST /api/relatorios-tecnicos/{id}/ai-review        → análise da FS
- POST /api/relatorios-tecnicos/{id}/ai-apply-rewrite → aplica reescrita aceite
"""
import logging
import os
import smtplib
from datetime import datetime, timezone
from email.mime.text import MIMEText
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import db
from server import get_current_user, get_current_admin, log_app_error
from services.ai_service import analyze_error, review_fs

router = APIRouter(tags=["ai"])


# ============================================================
#  Errors — IA
# ============================================================

@router.post("/admin/errors/{error_id}/ai-resolve")
async def ai_resolve_error(error_id: str, current_user: dict = Depends(get_current_admin)):
    """Analisa um erro com IA e devolve diagnóstico + sugestão. Não aplica nada."""
    err = await db.app_errors.find_one({"id": error_id}, {"_id": 0})
    if not err:
        raise HTTPException(status_code=404, detail="Erro não encontrado")

    try:
        analysis = await analyze_error(err)
    except Exception as e:
        logging.error(f"Falha ao chamar IA para erro {error_id}: {e}")
        await log_app_error(
            context="IA",
            action="Analisar erro com IA",
            error_message=f"{type(e).__name__}: {e}",
            details={"error_id": error_id},
            user_id=current_user.get("sub"),
            username=current_user.get("username"),
        )
        raise HTTPException(status_code=502, detail=f"Falha ao chamar IA: {e}")

    # Persistir análise no documento do erro para histórico
    await db.app_errors.update_one(
        {"id": error_id},
        {"$set": {
            "ai_analysis": analysis,
            "ai_analysis_at": datetime.now(timezone.utc).isoformat(),
            "ai_analysis_by": current_user.get("username"),
        }},
    )
    return analysis


class AIExecuteRequest(BaseModel):
    accao: str  # 'mark_resolved' | 'retry_email'


@router.post("/admin/errors/{error_id}/ai-execute")
async def ai_execute_action(
    error_id: str,
    payload: AIExecuteRequest,
    current_user: dict = Depends(get_current_admin),
):
    """Executa uma acção automática segura proposta pela IA."""
    err = await db.app_errors.find_one({"id": error_id}, {"_id": 0})
    if not err:
        raise HTTPException(status_code=404, detail="Erro não encontrado")

    accao = (payload.accao or "").strip()

    if accao == "mark_resolved":
        await db.app_errors.update_one(
            {"id": error_id},
            {"$set": {
                "resolved": True,
                "resolved_by": "ai",
                "resolved_at": datetime.now(timezone.utc).isoformat(),
                "resolution_note": "Resolvido automaticamente pela IA (mark_resolved)",
            }},
        )
        return {"ok": True, "accao": "mark_resolved", "message": "Erro marcado como resolvido."}

    if accao == "retry_email":
        # Tenta abrir ligação SMTP para validar credenciais actuais.
        company = await db.company_info.find_one({"id": "company_info_default"}, {"_id": 0})
        company = company or {}
        smtp_host = company.get("smtp_host") or os.environ.get("SMTP_HOST")
        smtp_port = int(company.get("smtp_port") or os.environ.get("SMTP_PORT") or 587)
        smtp_user = company.get("smtp_user") or os.environ.get("SMTP_USER")
        smtp_password = company.get("smtp_password") or os.environ.get("SMTP_PASSWORD")
        smtp_from = company.get("smtp_from") or smtp_user

        details = err.get("details") or {}
        destinatario = details.get("destinatario") or smtp_user

        if not all([smtp_host, smtp_port, smtp_user, smtp_password, destinatario]):
            raise HTTPException(
                status_code=400,
                detail="SMTP não configurado por completo. Verifica /admin/company-info.",
            )

        # Envio sincrono numa thread (smtplib) — apenas teste de credenciais.
        import asyncio
        loop = asyncio.get_event_loop()

        def _do_send():
            msg = MIMEText(
                "Teste automático após análise IA — SMTP funcional. "
                "Pode reenviar o PDF original a partir da FS.",
                "plain", "utf-8",
            )
            msg["From"] = smtp_from
            msg["To"] = destinatario
            msg["Subject"] = "[HWI] Teste SMTP — Reactivado pela IA"
            with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as s:
                s.starttls()
                s.login(smtp_user, smtp_password)
                s.sendmail(smtp_from, [destinatario], msg.as_string())

        try:
            await loop.run_in_executor(None, _do_send)
        except Exception as e:
            raise HTTPException(
                status_code=502,
                detail=f"Retry falhou: {type(e).__name__}: {e}. Verifica credenciais SMTP.",
            )

        await db.app_errors.update_one(
            {"id": error_id},
            {"$set": {
                "resolved": True,
                "resolved_by": "ai",
                "resolved_at": datetime.now(timezone.utc).isoformat(),
                "resolution_note": f"Retry SMTP bem-sucedido para {destinatario}",
            }},
        )
        return {"ok": True, "accao": "retry_email", "message": f"Email de teste enviado para {destinatario}. SMTP funcional."}

    raise HTTPException(status_code=400, detail=f"Acção desconhecida: {accao}")


# ============================================================
#  FS — IA
# ============================================================

@router.post("/relatorios-tecnicos/{relatorio_id}/ai-review")
async def ai_review_fs(relatorio_id: str, current_user: dict = Depends(get_current_user)):
    """Analisa uma FS completa com IA e devolve inconsistências + reescritas sugeridas."""
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not relatorio:
        raise HTTPException(status_code=404, detail="FS não encontrada")

    cliente = await db.clientes.find_one({"id": relatorio.get("cliente_id")}, {"_id": 0}) or {}
    intervencoes = await db.intervencoes_relatorio.find({"relatorio_id": relatorio_id}, {"_id": 0}).sort("ordem", 1).to_list(length=None)
    materiais = await db.materiais_ot.find({"relatorio_id": relatorio_id}, {"_id": 0}).to_list(length=None)
    tecnicos = await db.tecnicos_relatorio.find({"relatorio_id": relatorio_id}, {"_id": 0}).to_list(length=None)
    equipamentos = await db.equipamentos_ot.find({"relatorio_id": relatorio_id}, {"_id": 0}).to_list(length=None)
    relatorios_assist = await db.relatorios_assistencia.find({"relatorio_id": relatorio_id}, {"_id": 0}).sort("created_at", 1).to_list(length=None)

    payload = {
        "numero_assistencia": relatorio.get("numero_assistencia"),
        "cliente": {
            "nome": cliente.get("nome"),
            "morada": cliente.get("morada"),
        },
        "data_servico": relatorio.get("data_servico"),
        "local_intervencao": relatorio.get("local_intervencao"),
        "motivo": relatorio.get("motivo"),
        "intervencoes": [{
            "ordem": i.get("ordem"),
            "descricao": i.get("descricao"),
            "data": i.get("data_intervencao"),
            "horario": f"{i.get('hora_inicio') or ''}-{i.get('hora_fim') or ''}",
        } for i in intervencoes],
        "materiais": [{
            "designacao": m.get("designacao"),
            "qtd": m.get("quantidade"),
            "unidade": m.get("unidade"),
        } for m in materiais],
        "tecnicos": [{
            "nome": t.get("nome_tecnico") or t.get("username"),
            "data": t.get("data_trabalho"),
            "horas": f"{t.get('hora_inicio')}-{t.get('hora_fim')}",
        } for t in tecnicos],
        "equipamentos": [{
            "nome": e.get("nome") or e.get("designacao"),
            "marca": e.get("marca"),
            "modelo": e.get("modelo"),
        } for e in equipamentos],
        "relatorios_assistencia": [{
            "id": r.get("id"),
            "texto": r.get("texto") or r.get("descricao") or "",
        } for r in relatorios_assist],
    }

    try:
        result = await review_fs(payload)
    except Exception as e:
        logging.error(f"Falha IA review FS {relatorio_id}: {e}")
        await log_app_error(
            context=f"FS#{relatorio.get('numero_assistencia')}",
            action="Rever FS com IA",
            error_message=f"{type(e).__name__}: {e}",
            details={"relatorio_id": relatorio_id},
            user_id=current_user.get("sub"),
            username=current_user.get("username"),
        )
        raise HTTPException(status_code=502, detail=f"Falha ao chamar IA: {e}")

    return result


class ApplyRewriteRequest(BaseModel):
    relatorio_assistencia_id: str
    texto_melhorado: str


@router.post("/relatorios-tecnicos/{relatorio_id}/ai-apply-rewrite")
async def ai_apply_rewrite(
    relatorio_id: str,
    payload: ApplyRewriteRequest,
    current_user: dict = Depends(get_current_user),
):
    """Aplica uma reescrita aceite ao Relatório de Assistência."""
    ra = await db.relatorios_assistencia.find_one(
        {"id": payload.relatorio_assistencia_id, "relatorio_id": relatorio_id},
        {"_id": 0},
    )
    if not ra:
        raise HTTPException(status_code=404, detail="Relatório de assistência não encontrado")

    # Detecta automaticamente o nome do campo de texto (alguns docs usam 'texto', outros 'descricao').
    field = "texto" if "texto" in ra else ("descricao" if "descricao" in ra else "texto")

    update = {
        field: payload.texto_melhorado,
        "ai_revised_at": datetime.now(timezone.utc).isoformat(),
        "ai_revised_by": current_user.get("username"),
    }
    if field != "texto" and "texto" not in ra:
        update["texto"] = payload.texto_melhorado  # garante que é legível pelas leituras seguintes

    await db.relatorios_assistencia.update_one(
        {"id": payload.relatorio_assistencia_id},
        {"$set": update},
    )
    return {"ok": True, "id": payload.relatorio_assistencia_id, "campo_actualizado": field}
