"""
Router para Despesas Internas (gestão administrativa de encargos da empresa).

Inclui:
- CRUD de despesas (pontuais ou recorrentes: semanal/mensal/anual)
- Geração virtual de ocorrências num intervalo (até 24 meses)
- Marcar ocorrência como paga (materializa o pagamento)
- Balanço anual (total + por mês + por despesa)
"""
import logging
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List
from calendar import monthrange

from fastapi import APIRouter, Depends, HTTPException, Query

from database import db
from server import get_current_admin
from models import (
    DespesaInterna,
    DespesaInternaCreate,
    DespesaInternaUpdate,
    DespesaInternaPagamento,
    MarcarPagoRequest,
    DespesaCategoria,
    DespesaCategoriaCreate,
)

router = APIRouter(tags=["despesas-internas"])

MAX_HORIZON_MONTHS = 24


def _adjust_day_for_month(year: int, month: int, day: int) -> date:
    """Devolve `date(year, month, day)` ajustando se o mês não tem esse dia."""
    last_day = monthrange(year, month)[1]
    return date(year, month, min(day, last_day))


def _generate_occurrences(
    despesa: dict,
    range_start: date,
    range_end: date,
) -> List[date]:
    """Gera todas as datas de ocorrência da despesa dentro do intervalo."""
    di = despesa.get("data_inicial")
    if isinstance(di, str):
        di = date.fromisoformat(di.split("T")[0])
    df = despesa.get("data_fim")
    if isinstance(df, str):
        df = date.fromisoformat(df.split("T")[0])

    tipo = despesa.get("tipo_pagamento", "pontual")
    rec = despesa.get("recorrencia")
    dates: List[date] = []

    if tipo == "pontual" or not rec:
        if di and range_start <= di <= range_end:
            if df is None or di <= df:
                dates.append(di)
        return dates

    # recorrente
    if not di:
        return []
    end_lim = min(range_end, df) if df else range_end

    if rec == "semanal":
        cur = di
        # Avançar até estar dentro do intervalo
        while cur < range_start:
            cur = cur + timedelta(days=7)
        while cur <= end_lim:
            dates.append(cur)
            cur = cur + timedelta(days=7)
        return dates

    if rec == "mensal":
        dia_mes = despesa.get("dia_mes") or di.day
        # começar pelo mês de di
        y, m = di.year, di.month
        # Avançar até o ano/mês inicial >= range_start
        while True:
            d = _adjust_day_for_month(y, m, dia_mes)
            if d > end_lim:
                break
            if d >= range_start and d >= di:
                dates.append(d)
            # próximo mês
            if m == 12:
                y += 1; m = 1
            else:
                m += 1
        return dates

    if rec == "anual":
        y = di.year
        while True:
            d = _adjust_day_for_month(y, di.month, di.day)
            if d > end_lim:
                break
            if d >= range_start and d >= di:
                dates.append(d)
            y += 1
        return dates

    return dates


def _doc_to_dict(d: dict) -> dict:
    """Limpa _id e converte date/datetime para iso strings."""
    d = {k: v for k, v in d.items() if k != "_id"}
    for k, v in list(d.items()):
        if isinstance(v, (date, datetime)):
            d[k] = v.isoformat()
    return d


# ============== CATEGORIAS ==============

DEFAULT_CATEGORIAS = [
    {"nome": "Renda", "cor": "#a855f7"},
    {"nome": "Eletricidade", "cor": "#eab308"},
    {"nome": "Internet", "cor": "#3b82f6"},
    {"nome": "Combustível", "cor": "#f97316"},
    {"nome": "Salários", "cor": "#10b981"},
    {"nome": "IVA / IRS", "cor": "#ef4444"},
    {"nome": "Seguros", "cor": "#06b6d4"},
    {"nome": "Software / SaaS", "cor": "#6366f1"},
    {"nome": "Outros", "cor": "#6b7280"},
]


async def _seed_categorias_if_empty():
    """Garante categorias predefinidas na primeira execução."""
    count = await db.despesas_categorias.count_documents({})
    if count == 0:
        import uuid as _uuid
        for c in DEFAULT_CATEGORIAS:
            await db.despesas_categorias.insert_one({
                "id": str(_uuid.uuid4()),
                "nome": c["nome"],
                "cor": c["cor"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            })


@router.get("/despesas-internas/categorias")
async def listar_categorias(current_user: dict = Depends(get_current_admin)):
    await _seed_categorias_if_empty()
    docs = await db.despesas_categorias.find({}, {"_id": 0}).sort([("nome", 1)]).to_list(length=None)
    return docs


@router.post("/despesas-internas/categorias")
async def criar_categoria(
    payload: DespesaCategoriaCreate,
    current_user: dict = Depends(get_current_admin),
):
    nome = (payload.nome or "").strip()
    if not nome:
        raise HTTPException(status_code=400, detail="Nome obrigatório")
    existing = await db.despesas_categorias.find_one(
        {"nome": {"$regex": f"^{nome}$", "$options": "i"}}, {"_id": 0, "id": 1}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Já existe uma categoria com esse nome")
    cat = DespesaCategoria(nome=nome, cor=payload.cor)
    doc = cat.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.despesas_categorias.insert_one(doc)
    return _doc_to_dict(doc)


@router.delete("/despesas-internas/categorias/{cat_id}")
async def apagar_categoria(
    cat_id: str,
    current_user: dict = Depends(get_current_admin),
):
    existing = await db.despesas_categorias.find_one({"id": cat_id}, {"_id": 0, "id": 1, "nome": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    em_uso = await db.despesas_internas.count_documents({"categoria_id": cat_id})
    if em_uso > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Não é possível apagar: a categoria '{existing.get('nome')}' está em uso por {em_uso} despesa(s).",
        )
    await db.despesas_categorias.delete_one({"id": cat_id})
    return {"message": "Categoria eliminada", "id": cat_id}


# ============== CRUD ==============

@router.post("/despesas-internas")
async def criar_despesa(
    payload: DespesaInternaCreate,
    current_user: dict = Depends(get_current_admin),
):
    if payload.tipo_pagamento not in ("pontual", "recorrente"):
        raise HTTPException(status_code=400, detail="tipo_pagamento deve ser 'pontual' ou 'recorrente'")
    if payload.tipo_pagamento == "recorrente" and payload.recorrencia not in ("semanal", "mensal", "anual"):
        raise HTTPException(status_code=400, detail="recorrencia deve ser 'semanal', 'mensal' ou 'anual'")

    # Validação anti-duplicado: mesma categoria + mesmo valor já existe (e activa)?
    if payload.categoria_id:
        existing = await db.despesas_internas.find_one(
            {
                "categoria_id": payload.categoria_id,
                "valor": float(payload.valor),
                "ativo": True,
            },
            {"_id": 0, "id": 1, "descricao": 1},
        )
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Já existe uma despesa activa com a mesma categoria e valor: '{existing.get('descricao')}'.",
            )

    despesa = DespesaInterna(
        **payload.model_dump(),
        created_by=current_user.get("username"),
    )
    doc = despesa.model_dump()
    doc["data_inicial"] = doc["data_inicial"].isoformat()
    if doc.get("data_fim"):
        doc["data_fim"] = doc["data_fim"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.despesas_internas.insert_one(doc)
    return _doc_to_dict(doc)


@router.get("/despesas-internas")
async def listar_despesas(
    ativo: Optional[bool] = Query(None),
    current_user: dict = Depends(get_current_admin),
):
    query = {}
    if ativo is not None:
        query["ativo"] = ativo
    docs = await db.despesas_internas.find(query, {"_id": 0}).sort([("descricao", 1)]).to_list(length=None)
    return docs


@router.put("/despesas-internas/{despesa_id}")
async def atualizar_despesa(
    despesa_id: str,
    payload: DespesaInternaUpdate,
    current_user: dict = Depends(get_current_admin),
):
    existing = await db.despesas_internas.find_one({"id": despesa_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")

    update_dict = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}

    # Validar duplicado se categoria_id ou valor mudaram (ou ambos)
    new_categoria = update_dict.get("categoria_id", existing.get("categoria_id"))
    new_valor = update_dict.get("valor", existing.get("valor"))
    new_ativo = update_dict.get("ativo", existing.get("ativo"))
    if new_categoria and new_ativo:
        dup = await db.despesas_internas.find_one(
            {
                "id": {"$ne": despesa_id},
                "categoria_id": new_categoria,
                "valor": float(new_valor),
                "ativo": True,
            },
            {"_id": 0, "id": 1, "descricao": 1},
        )
        if dup:
            raise HTTPException(
                status_code=400,
                detail=f"Já existe outra despesa activa com a mesma categoria e valor: '{dup.get('descricao')}'.",
            )

    for k, v in update_dict.items():
        if isinstance(v, date) and not isinstance(v, datetime):
            update_dict[k] = v.isoformat()
    if not update_dict:
        return existing
    await db.despesas_internas.update_one({"id": despesa_id}, {"$set": update_dict})
    updated = await db.despesas_internas.find_one({"id": despesa_id}, {"_id": 0})
    return updated


@router.delete("/despesas-internas/{despesa_id}")
async def apagar_despesa(
    despesa_id: str,
    current_user: dict = Depends(get_current_admin),
):
    existing = await db.despesas_internas.find_one({"id": despesa_id}, {"_id": 0, "id": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    await db.despesas_internas.delete_one({"id": despesa_id})
    await db.despesas_internas_pagamentos.delete_many({"despesa_id": despesa_id})
    return {"message": "Despesa eliminada", "id": despesa_id}


# ============== OCORRÊNCIAS / CALENDÁRIO ==============

@router.get("/despesas-internas/ocorrencias")
async def listar_ocorrencias(
    inicio: date = Query(...),
    fim: date = Query(...),
    current_user: dict = Depends(get_current_admin),
):
    """
    Devolve todas as ocorrências (planeadas + pagas) entre `inicio` e `fim`.
    Limita o intervalo a 24 meses.
    """
    if fim < inicio:
        raise HTTPException(status_code=400, detail="fim < inicio")
    if (fim - inicio).days > MAX_HORIZON_MONTHS * 31:
        raise HTTPException(status_code=400, detail="Intervalo demasiado grande (máx. 24 meses)")

    despesas = await db.despesas_internas.find(
        {"ativo": True}, {"_id": 0}
    ).to_list(length=None)
    pagamentos = await db.despesas_internas_pagamentos.find(
        {"data_prevista": {"$gte": inicio.isoformat(), "$lte": fim.isoformat()}},
        {"_id": 0},
    ).to_list(length=None)
    pagos_by_key = {(p["despesa_id"], p["data_prevista"]): p for p in pagamentos}

    ocorrencias = []
    for d in despesas:
        for ocd in _generate_occurrences(d, inicio, fim):
            key = (d["id"], ocd.isoformat())
            pago = pagos_by_key.get(key)
            ocorrencias.append({
                "despesa_id": d["id"],
                "descricao": d["descricao"],
                "valor": d["valor"],
                "data_prevista": ocd.isoformat(),
                "tipo_pagamento": d.get("tipo_pagamento"),
                "recorrencia": d.get("recorrencia"),
                "aviso_dias_antes": d.get("aviso_dias_antes", 3),
                "pago": bool(pago),
                "data_pagamento": (pago or {}).get("data_pagamento"),
                "valor_pago": (pago or {}).get("valor_pago"),
                "pagamento_id": (pago or {}).get("id"),
            })
    ocorrencias.sort(key=lambda x: x["data_prevista"])
    return ocorrencias


# ============== MARCAR / DESMARCAR PAGO ==============

@router.post("/despesas-internas/{despesa_id}/marcar-pago")
async def marcar_pago(
    despesa_id: str,
    payload: MarcarPagoRequest,
    current_user: dict = Depends(get_current_admin),
):
    despesa = await db.despesas_internas.find_one({"id": despesa_id}, {"_id": 0})
    if not despesa:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")

    # Validar que data_prevista é uma ocorrência válida
    di = despesa.get("data_inicial")
    if isinstance(di, str):
        di = date.fromisoformat(di.split("T")[0])
    # Janela larga para validar (até 24 meses para a frente)
    horizon_end = max(di, payload.data_prevista) + timedelta(days=MAX_HORIZON_MONTHS * 31)
    valid = _generate_occurrences(despesa, di or payload.data_prevista, horizon_end)
    if payload.data_prevista not in valid:
        raise HTTPException(status_code=400, detail="data_prevista não é uma ocorrência válida desta despesa")

    # Idempotente: se já existe pagamento para essa data_prevista, atualiza
    pag = DespesaInternaPagamento(
        despesa_id=despesa_id,
        data_prevista=payload.data_prevista,
        data_pagamento=payload.data_pagamento or date.today(),
        valor_pago=(payload.valor_pago if payload.valor_pago is not None else float(despesa.get("valor", 0))),
        notas=payload.notas,
        paid_by=current_user.get("username"),
    )
    doc = pag.model_dump()
    doc["data_prevista"] = doc["data_prevista"].isoformat()
    doc["data_pagamento"] = doc["data_pagamento"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()

    await db.despesas_internas_pagamentos.delete_many(
        {"despesa_id": despesa_id, "data_prevista": doc["data_prevista"]}
    )
    await db.despesas_internas_pagamentos.insert_one(doc)
    return _doc_to_dict(doc)


@router.delete("/despesas-internas/{despesa_id}/marcar-pago")
async def desmarcar_pago(
    despesa_id: str,
    data_prevista: date = Query(...),
    current_user: dict = Depends(get_current_admin),
):
    res = await db.despesas_internas_pagamentos.delete_many({
        "despesa_id": despesa_id,
        "data_prevista": data_prevista.isoformat(),
    })
    return {"message": "Pagamento removido", "deleted": res.deleted_count}


# ============== BALANÇO ANUAL ==============

@router.get("/despesas-internas/balanco/{ano}")
async def balanco_anual(
    ano: int,
    apenas_pagas: bool = Query(False),
    current_user: dict = Depends(get_current_admin),
):
    """
    Devolve o balanço anual: total geral, totais por mês, totais por despesa.
    Por defeito inclui despesas planeadas e pagas. Use apenas_pagas=true para
    contar só efectivamente pagas.
    """
    if ano < 2000 or ano > 2100:
        raise HTTPException(status_code=400, detail="Ano inválido")

    inicio = date(ano, 1, 1)
    fim = date(ano, 12, 31)
    despesas = await db.despesas_internas.find({"ativo": True}, {"_id": 0}).to_list(length=None)
    pagamentos = await db.despesas_internas_pagamentos.find(
        {"data_prevista": {"$gte": inicio.isoformat(), "$lte": fim.isoformat()}},
        {"_id": 0},
    ).to_list(length=None)
    pagos_by_key = {(p["despesa_id"], p["data_prevista"]): p for p in pagamentos}

    por_mes = {m: {"planeado": 0.0, "pago": 0.0} for m in range(1, 13)}
    por_despesa = {}
    total_planeado = 0.0
    total_pago = 0.0

    for d in despesas:
        for ocd in _generate_occurrences(d, inicio, fim):
            valor = float(d.get("valor", 0))
            pag = pagos_by_key.get((d["id"], ocd.isoformat()))
            valor_pago_real = float(pag.get("valor_pago", 0)) if pag else 0.0
            if apenas_pagas and not pag:
                continue
            mes = ocd.month
            por_mes[mes]["planeado"] += valor
            por_mes[mes]["pago"] += valor_pago_real
            total_planeado += valor
            total_pago += valor_pago_real
            key = d["id"]
            if key not in por_despesa:
                por_despesa[key] = {
                    "id": d["id"],
                    "descricao": d["descricao"],
                    "tipo_pagamento": d.get("tipo_pagamento"),
                    "recorrencia": d.get("recorrencia"),
                    "ocorrencias": 0,
                    "total_planeado": 0.0,
                    "total_pago": 0.0,
                }
            por_despesa[key]["ocorrencias"] += 1
            por_despesa[key]["total_planeado"] += valor
            por_despesa[key]["total_pago"] += valor_pago_real

    # Arredondar
    for v in por_mes.values():
        v["planeado"] = round(v["planeado"], 2)
        v["pago"] = round(v["pago"], 2)
    por_despesa_list = []
    for v in por_despesa.values():
        v["total_planeado"] = round(v["total_planeado"], 2)
        v["total_pago"] = round(v["total_pago"], 2)
        por_despesa_list.append(v)
    por_despesa_list.sort(key=lambda x: -x["total_planeado"])

    return {
        "ano": ano,
        "total_planeado": round(total_planeado, 2),
        "total_pago": round(total_pago, 2),
        "por_mes": por_mes,
        "por_despesa": por_despesa_list,
    }
