"""
Rotas de gestão do Relatório Simples (sem fotografias, estilo Word).

Uma única versão por FS — upsert por `relatorio_id`.
Endpoints:
  GET    /api/relatorios-simples/by-fs/{relatorio_id}
  POST   /api/relatorios-simples/by-fs/{relatorio_id}    (upsert)
  DELETE /api/relatorios-simples/by-fs/{relatorio_id}
  GET    /api/relatorios-simples/by-fs/{relatorio_id}/pdf
"""
import io
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse

from database import db
from auth_utils import get_current_user
from models import RelatorioSimples, RelatorioSimplesUpsert
from relatorio_simples_pdf import generate_relatorio_simples_pdf


router = APIRouter(prefix="/relatorios-simples", tags=["Relatórios Simples"])


async def _load_fs(relatorio_id: str) -> dict:
    fs = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not fs:
        raise HTTPException(status_code=404, detail="FS não encontrada")
    return fs


async def _load_cliente(cliente_id: str | None) -> dict | None:
    if not cliente_id:
        return None
    return await db.clientes.find_one({"id": cliente_id}, {"_id": 0})


async def _load_equipamentos_da_fs(relatorio_id: str) -> list:
    """Carrega todos os equipamentos associados a uma FS, incluindo o equipamento
    principal do relatório e os equipamentos adicionados via intervenções."""
    equipamentos: dict[str, dict] = {}

    # 1. Equipamento principal do relatório (se houver)
    fs = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if fs and fs.get('equipamento_id'):
        eq = await db.equipamentos.find_one({"id": fs['equipamento_id']}, {"_id": 0})
        if eq:
            equipamentos[eq['id']] = eq

    # 2. Equipamentos adicionais (collection equipamentos_ot)
    extra = await db.equipamentos_ot.find({"relatorio_id": relatorio_id}, {"_id": 0}).to_list(1000)
    for e in extra:
        # equipamentos_ot guarda referência ao equipamento real (via equipamento_id)
        # OU pode guardar campos inline (marca/modelo/numero_serie)
        eq_id = e.get('equipamento_id') or e.get('id')
        if e.get('equipamento_id'):
            real = await db.equipamentos.find_one({"id": e['equipamento_id']}, {"_id": 0})
            if real:
                equipamentos[real['id']] = real
                continue
        # fallback: usar dados inline
        equipamentos[eq_id] = {
            'id': eq_id,
            'marca': e.get('marca') or '—',
            'modelo': e.get('modelo') or '—',
            'numero_serie': e.get('numero_serie') or e.get('serial') or '—',
        }

    return list(equipamentos.values())


@router.get("/by-fs/{relatorio_id}")
async def get_relatorio_simples(relatorio_id: str, current_user: dict = Depends(get_current_user)):
    """Devolve o Relatório Simples da FS (ou null se não existir)."""
    await _load_fs(relatorio_id)
    doc = await db.relatorios_simples.find_one({"relatorio_id": relatorio_id}, {"_id": 0})
    return doc  # pode ser None


@router.get("/by-fs/{relatorio_id}/equipamentos")
async def get_equipamentos_disponiveis(relatorio_id: str, current_user: dict = Depends(get_current_user)):
    """Lista equipamentos disponíveis para incluir no Relatório Simples (associados à FS)."""
    await _load_fs(relatorio_id)
    equipamentos = await _load_equipamentos_da_fs(relatorio_id)
    return [
        {
            'id': eq.get('id'),
            'marca': eq.get('marca') or '',
            'modelo': eq.get('modelo') or '',
            'numero_serie': eq.get('numero_serie') or '',
        }
        for eq in equipamentos
    ]


@router.post("/by-fs/{relatorio_id}")
async def upsert_relatorio_simples(
    relatorio_id: str,
    payload: RelatorioSimplesUpsert,
    current_user: dict = Depends(get_current_user),
):
    """Cria ou atualiza o Relatório Simples desta FS (substitui a última versão)."""
    fs = await _load_fs(relatorio_id)
    cliente = await _load_cliente(fs.get('cliente_id'))

    now = datetime.now(timezone.utc)
    existing = await db.relatorios_simples.find_one({"relatorio_id": relatorio_id}, {"_id": 0})

    if existing:
        update_doc = {
            'titulo': payload.titulo,
            'secoes': [s.dict() for s in payload.secoes],
            'incluir_equipamentos': payload.incluir_equipamentos,
            'equipamento_ids': payload.equipamento_ids,
            'cliente_id': fs.get('cliente_id'),
            'cliente_nome': (cliente or {}).get('nome') or fs.get('cliente_nome'),
            'updated_at': now.isoformat(),
            'updated_by': current_user.get('sub'),
        }
        await db.relatorios_simples.update_one(
            {"relatorio_id": relatorio_id},
            {"$set": update_doc},
        )
        result = {**existing, **update_doc}
    else:
        doc = RelatorioSimples(
            relatorio_id=relatorio_id,
            cliente_id=fs.get('cliente_id'),
            cliente_nome=(cliente or {}).get('nome') or fs.get('cliente_nome'),
            titulo=payload.titulo,
            secoes=payload.secoes,
            incluir_equipamentos=payload.incluir_equipamentos,
            equipamento_ids=payload.equipamento_ids,
            created_by=current_user.get('sub'),
            updated_by=current_user.get('sub'),
        )
        doc_dict = doc.dict()
        doc_dict['created_at'] = doc_dict['created_at'].isoformat()
        doc_dict['updated_at'] = doc_dict['updated_at'].isoformat()
        await db.relatorios_simples.insert_one(doc_dict)
        result = doc_dict

    logging.info(f"RelatorioSimples upsert FS={relatorio_id} por {current_user.get('sub')}")
    result.pop('_id', None)
    return result


@router.delete("/by-fs/{relatorio_id}")
async def delete_relatorio_simples(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Remove o Relatório Simples desta FS."""
    res = await db.relatorios_simples.delete_one({"relatorio_id": relatorio_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Relatório simples não encontrado")
    return {"ok": True}


@router.get("/by-fs/{relatorio_id}/pdf")
async def download_relatorio_simples_pdf(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Gera e devolve o PDF do Relatório Simples."""
    fs = await _load_fs(relatorio_id)
    rs = await db.relatorios_simples.find_one({"relatorio_id": relatorio_id}, {"_id": 0})
    if not rs:
        raise HTTPException(
            status_code=404,
            detail="Ainda não há Relatório Simples para esta FS. Crie um primeiro.",
        )

    cliente = await _load_cliente(fs.get('cliente_id'))
    equipamentos = await _load_equipamentos_da_fs(relatorio_id) if rs.get('incluir_equipamentos') else []

    company_info = await db.company_info.find_one({}, {"_id": 0})

    # Carregar dados completos do utilizador para obter o nome (current_user só tem 'sub')
    user_doc = await db.users.find_one(
        {"id": current_user.get('sub')},
        {"_id": 0, "full_name": 1, "username": 1, "email": 1},
    )
    autor_nome = (user_doc or {}).get('full_name') \
        or (user_doc or {}).get('username') \
        or current_user.get('sub')

    try:
        pdf_bytes = generate_relatorio_simples_pdf(
            relatorio_simples=rs,
            relatorio_fs=fs,
            cliente=cliente,
            equipamentos=equipamentos,
            company_info=company_info,
            autor_nome=autor_nome,
        )
    except Exception as exc:
        logging.exception(f"[RelatorioSimples] Falha ao gerar PDF FS={relatorio_id}: {exc}")
        raise HTTPException(status_code=500, detail=f"Erro ao gerar PDF: {exc}") from exc

    filename = f"Relatorio_FS_{fs.get('numero_assistencia', relatorio_id)}.pdf"
    # Response com Content-Length fixo — evita truncamento em Cloudflare
    from fastapi.responses import Response
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    )
