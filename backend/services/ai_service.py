"""
Serviço de IA — Claude Sonnet 4.5 via Emergent Universal LLM Key.

Duas funções principais:
- analyze_error(): analisa um registo de log_app_error e devolve causa,
  solução, possível auto-correcção e código sugerido.
- review_fs(): analisa uma FS completa, devolve inconsistências, dados em
  falta, e reescritas sugeridas para os Relatórios de Assistência.
"""
import json
import logging
import os
import uuid
import re
from typing import Any, Dict, List, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
MODEL_PROVIDER = "anthropic"
MODEL_NAME = "claude-sonnet-4-5-20250929"


def _build_chat(system_message: str) -> LlmChat:
    if not LLM_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY ausente em backend/.env")
    return LlmChat(
        api_key=LLM_KEY,
        session_id=f"hwi-{uuid.uuid4()}",
        system_message=system_message,
    ).with_model(MODEL_PROVIDER, MODEL_NAME)


def _extract_json(text: str) -> Dict[str, Any]:
    """Extrai o primeiro objecto JSON encontrado no texto (robusto a ```json fences)."""
    if not text:
        return {}
    # Remover code fences
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        candidate = fenced.group(1)
    else:
        # primeiro { ... } balanceado
        start = text.find("{")
        if start == -1:
            return {"raw_response": text[:1500]}
        depth = 0
        end = -1
        for i, c in enumerate(text[start:], start):
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end == -1:
            return {"raw_response": text[:1500]}
        candidate = text[start:end]
    try:
        return json.loads(candidate)
    except Exception:
        # Retentativa básica: remover trailing commas
        cleaned = re.sub(r",\s*([}\]])", r"\1", candidate)
        try:
            return json.loads(cleaned)
        except Exception as e:
            logging.error(f"Falha a fazer parse do JSON da IA: {e}; raw={candidate[:300]}")
            return {"raw_response": candidate[:1500]}


# ============================================================
#  1) Análise de erros
# ============================================================

ERROR_SYSTEM = (
    "És um assistente de DevOps especializado em FastAPI + React + MongoDB. "
    "Recebes registos de erros aplicacionais e devolves SEMPRE um único objecto JSON, "
    "sem texto fora do JSON, sem markdown. Em PORTUGUÊS de Portugal."
)


def _truncate(s: Any, n: int) -> str:
    s = str(s or "")
    return s if len(s) <= n else s[:n] + "…"


async def analyze_error(error_doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analisa um documento de erro e devolve diagnóstico estruturado.

    Output schema:
    {
      "causa_provavel": str,
      "explicacao": str,
      "solucao_sugerida": str,
      "pode_auto_corrigir": bool,
      "accao_auto_segura": str|null,   # 'mark_resolved' | 'retry_email' | null
      "accao_descricao": str|null,
      "patch_sugerido": {
        "ficheiro": str|null,
        "snippet_atual": str|null,
        "snippet_proposto": str|null,
        "explicacao": str|null
      }|null,
      "severidade": str   # 'baixa'|'média'|'alta'
    }
    """
    payload = {
        "context": _truncate(error_doc.get("context"), 200),
        "action": _truncate(error_doc.get("action"), 200),
        "error_message": _truncate(error_doc.get("error_message"), 1500),
        "details": error_doc.get("details", {}),
        "severity": error_doc.get("severity", "error"),
    }

    user_text = (
        "Analisa o seguinte erro registado pela aplicação HWI (FastAPI+React+MongoDB) "
        "e devolve APENAS um JSON com este schema exacto:\n\n"
        "{\n"
        '  "causa_provavel": "string curta",\n'
        '  "explicacao": "string até 600 chars",\n'
        '  "solucao_sugerida": "string accionável até 600 chars",\n'
        '  "pode_auto_corrigir": true|false,\n'
        '  "accao_auto_segura": "mark_resolved" | "retry_email" | null,\n'
        '  "accao_descricao": "string ou null",\n'
        '  "patch_sugerido": null OR { "ficheiro": "...", "snippet_atual": "...", "snippet_proposto": "...", "explicacao": "..." },\n'
        '  "severidade": "baixa" | "média" | "alta"\n'
        "}\n\n"
        "Regras:\n"
        '- Usa "accao_auto_segura": "retry_email" se o erro for SMTP/email e o action contiver "Email"/"PDF".\n'
        '- Usa "accao_auto_segura": "mark_resolved" se o erro for transitório/já não relevante (ex: 404 de algo entretanto recriado).\n'
        '- Patch só se identificares claramente o ficheiro e o problema no código (ex: NameError, ImportError, typo).\n'
        "- Não inventes ficheiros. Se não tens certeza, patch_sugerido = null.\n\n"
        f"ERRO:\n{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )

    chat = _build_chat(ERROR_SYSTEM)
    response = await chat.send_message(UserMessage(text=user_text))
    parsed = _extract_json(response or "")

    # Defaults defensivos
    parsed.setdefault("causa_provavel", "—")
    parsed.setdefault("explicacao", "")
    parsed.setdefault("solucao_sugerida", "")
    parsed.setdefault("pode_auto_corrigir", False)
    parsed.setdefault("accao_auto_segura", None)
    parsed.setdefault("accao_descricao", None)
    parsed.setdefault("patch_sugerido", None)
    parsed.setdefault("severidade", "média")
    return parsed


# ============================================================
#  2) Análise de FS
# ============================================================

FS_SYSTEM = (
    "És um assistente técnico especializado em Folhas de Serviço (FS) de manutenção "
    "industrial. Avalias estrutura e qualidade dos dados e melhoras a redação dos "
    "Relatórios de Assistência mantendo factos. NUNCA inventas factos. "
    "Devolves SEMPRE um único objecto JSON em PORTUGUÊS de Portugal, sem markdown."
)


async def review_fs(fs_payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analisa uma FS completa.
    Input: dict com numero_assistencia, cliente, intervencoes, materiais,
           tecnicos, equipamentos, relatorios_assistencia[{id, texto}].
    Output:
    {
      "resumo": str,
      "inconsistencias": [{"campo": "...", "problema": "...", "sugestao": "..."}],
      "dados_em_falta": ["..."],
      "relatorios_melhorados": [
        {"id": "...", "texto_original": "...", "texto_melhorado": "...", "alteracoes_principais": "..."}
      ],
      "score_qualidade": 0..100
    }
    """
    user_text = (
        "Analisa esta FS e devolve APENAS um JSON com este schema:\n\n"
        "{\n"
        '  "resumo": "1-2 frases",\n'
        '  "inconsistencias": [{"campo": "...", "problema": "...", "sugestao": "..."}],\n'
        '  "dados_em_falta": ["..."],\n'
        '  "relatorios_melhorados": [{"id": "...", "texto_original": "...", "texto_melhorado": "...", "alteracoes_principais": "..."}],\n'
        '  "score_qualidade": 0\n'
        "}\n\n"
        "ESTRUTURA DOS DADOS:\n"
        "- Cada intervenção em `intervencoes[]` tem o campo `tem_relatorio_associado`: True se há texto descritivo (em `relatorios_assistencia_textos[]` OU em `relatorio_assistencia_intervencao`).\n"
        "- SÓ flag como inconsistência uma intervenção sem texto se `tem_relatorio_associado` for FALSE.\n"
        "- Textos consolidados de uma intervenção: usa `relatorios_assistencia_textos[]` (lista de strings já filtradas por `intervencao_id`).\n"
        "- Cada intervenção pode também ter `motivo_assistencia` próprio.\n"
        "- Equipamento principal vem em `equipamento_principal` (campos directos). `equipamentos_adicionais` é opcional.\n"
        "- `equipamento_principal=null` é VÁLIDO quando `tem_equipamentos_adicionais=true` (manutenção de vários equipamentos sem prioridade). NÃO flag como inconsistência neste caso.\n"
        "- Técnicos: podem vir de `tecnicos_cronometro[]` (automático via cronómetro) OU `tecnicos_manuais[]`. Basta UM array ter registos válidos.\n"
        "- Cada técnico tem `nome`, `data`, `hora_inicio`, `hora_fim`, `tipo`. Se `nome` ou `data` estiver null em TODOS os registos, é uma inconsistência REAL de dados. Se houver registos mistos (alguns OK, alguns null), reporta apenas os null.\n"
        "- Materiais usam `descricao` (não `designacao`). Unidade pode ser 'Un', 'm', 'kg', etc.\n\n"
        "REGRAS:\n"
        "- IDs no array `relatorios_melhorados` DEVEM ser os `id` dos objectos em `relatorios_assistencia[]` do input — não inventes.\n"
        "- Reescreve cada `texto` com tom técnico-profissional, em PT-PT, claro e estruturado (problema, intervenção, resultado).\n"
        "- NÃO inventes factos novos — só reorganiza/melhora redação do que já existe.\n"
        "- Se um texto já estiver bem, devolve-o com texto_melhorado IGUAL ao original e alteracoes_principais='Sem alterações necessárias'.\n"
        "- Inconsistências REAIS: cliente/data ausentes; intervenção com `tem_relatorio_associado=false`; material sem descricao; 0 técnicos válidos em AMBOS os arrays; equipamento principal e adicionais AMBOS vazios.\n"
        "- NÃO marcar como inconsistência: equipamento principal null quando há adicionais; horários em HH:MM nos técnicos; equipamento por intervenção opcional.\n"
        "- score_qualidade: 0=incompleto, 100=excelente.\n\n"
        f"FS:\n{json.dumps(fs_payload, ensure_ascii=False, indent=2)[:18000]}"
    )

    chat = _build_chat(FS_SYSTEM)
    response = await chat.send_message(UserMessage(text=user_text))
    parsed = _extract_json(response or "")

    parsed.setdefault("resumo", "")
    parsed.setdefault("inconsistencias", [])
    parsed.setdefault("dados_em_falta", [])
    parsed.setdefault("relatorios_melhorados", [])
    parsed.setdefault("score_qualidade", 0)
    return parsed


# ============================================================
#  3) Melhoria de UM único Relatório de Assistência
# ============================================================

REL_ASSIST_SYSTEM = (
    "És um técnico industrial experiente a escrever um Relatório de Assistência para "
    "arquivo interno e envio ao cliente. Reescreves textos técnicos mantendo TODOS os "
    "factos originais, com tom natural, profissional, direto e em PORTUGUÊS de "
    "Portugal. Escreves como se fosses tu, o técnico, a redigir — não como um "
    "assistente. NUNCA inventes factos. NUNCA uses markdown, asteriscos, hashtags, "
    "sublinhados de ênfase, emojis nem qualquer caractere decorativo. Apenas texto "
    "corrido, com pontuação normal. Devolves SEMPRE um único objecto JSON válido, "
    "sem texto fora do JSON."
)


def _strip_markdown(text: str) -> str:
    """Remove formatação markdown residual (*, _, #, `, >, listas) preservando o conteúdo."""
    if not text:
        return ""
    # negritos/itálicos: **x**, *x*, __x__, _x_
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"__([^_]+)__", r"\1", text)
    text = re.sub(r"\*([^*\n]+)\*", r"\1", text)
    text = re.sub(r"(?<!\w)_([^_\n]+)_(?!\w)", r"\1", text)
    # cabeçalhos # em início de linha
    text = re.sub(r"^\s{0,3}#{1,6}\s+", "", text, flags=re.MULTILINE)
    # bullets " - " / " * " / " + " no início de linha → "- "
    text = re.sub(r"^\s*[*+]\s+", "- ", text, flags=re.MULTILINE)
    # blockquote ">"
    text = re.sub(r"^\s*>\s?", "", text, flags=re.MULTILINE)
    # crases de código inline `x`
    text = re.sub(r"`([^`]+)`", r"\1", text)
    # múltiplas linhas em branco → 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


async def improve_relatorio_assistencia(texto: str, contexto: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Recebe o texto atual dum Relatório de Assistência e devolve uma versão
    profissional em texto corrido (sem markdown/asteriscos).

    Output:
      { "texto_melhorado": str, "alteracoes_principais": str }
    """
    if not texto or not texto.strip():
        return {"texto_melhorado": "", "alteracoes_principais": "Texto vazio — nada a melhorar."}

    contexto_str = ""
    if contexto:
        # Só incluímos pistas relevantes: equipamento, cliente, data
        pistas = {k: v for k, v in contexto.items() if v}
        if pistas:
            contexto_str = "\nCONTEXTO (apenas para referência, não citar):\n" + json.dumps(pistas, ensure_ascii=False, indent=2) + "\n"

    user_text = (
        "Reescreve o TEXTO abaixo de um Relatório de Assistência com tom técnico-"
        "profissional, claro, direto e em PT-PT. Estrutura implícita: problema/"
        "situação encontrada, intervenção realizada, resultado. Mantém todos os "
        "factos, medidas e nomes originais. Não inventes.\n\n"
        "REGRAS OBRIGATÓRIAS:\n"
        "- Texto corrido em parágrafos normais.\n"
        "- NÃO usar asteriscos (*, **), hashtags (#), sublinhados de ênfase (_), "
        "  emojis, ou qualquer caractere de formatação markdown.\n"
        "- Podes usar listas simples com hífen ('- ') no início da linha se ajudar "
        "  a leitura, mas nunca com negrito ou itálico.\n"
        "- Deve parecer escrito pelo técnico, não por uma IA (evita frases como "
        "  'foi realizada uma intervenção pela equipa técnica'; prefere 'realizei/"
        "  procedi a...' quando aplicável). Se o original estiver na 3ª pessoa, "
        "  mantém a 3ª pessoa.\n"
        "- Se o texto já estiver bem, devolve-o quase igual ao original em "
        "  'texto_melhorado' e escreve 'Sem alterações significativas' em "
        "  'alteracoes_principais'.\n\n"
        "Devolve APENAS este JSON:\n"
        "{\n"
        '  "texto_melhorado": "string",\n'
        '  "alteracoes_principais": "string curta (1-2 frases)"\n'
        "}\n\n"
        f"{contexto_str}"
        f"TEXTO ORIGINAL:\n{texto}"
    )

    chat = _build_chat(REL_ASSIST_SYSTEM)
    response = await chat.send_message(UserMessage(text=user_text))
    parsed = _extract_json(response or "")

    melhorado = _strip_markdown(parsed.get("texto_melhorado") or "")
    alteracoes = _strip_markdown(parsed.get("alteracoes_principais") or "")

    # Se a IA devolveu vazio, mantém o original
    if not melhorado:
        return {
            "texto_melhorado": texto,
            "alteracoes_principais": "A IA não devolveu conteúdo válido; texto original mantido.",
        }

    return {
        "texto_melhorado": melhorado,
        "alteracoes_principais": alteracoes or "Reescrita profissional aplicada.",
    }
