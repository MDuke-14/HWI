"""
Router para Indisponibilidades dos utilizadores.

Cada utilizador pode registar entradas tardias ou saídas antecipadas com:
- data, hora_inicio, hora_fim
- regressa_servico (bool)
- observações
- aviso_minutos_antes (default 60)

Admin pode listar todas (filtros), consultar histórico por user, ou verificar
conflitos antes de criar/editar uma OT no calendário.

Validações:
- hora_inicio < hora_fim
- tipo ∈ {'entrada_tardia', 'saida_antecipada'}
- Sem sobreposições para o mesmo user na mesma data
"""
import logging
from datetime import datetime, date, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query

from database import db
from server import get_current_user, get_current_admin
from models import (
    Indisponibilidade,
    IndisponibilidadeCreate,
    IndisponibilidadeUpdate,
)

router = APIRouter(tags=["indisponibilidades"])

VALID_TIPOS = ("entrada_tardia", "saida_antecipada")


def _validate_hhmm(s: str) -> str:
    s = (s or "").strip()
    try:
        datetime.strptime(s, "%H:%M")
    except Exception:
        raise HTTPException(status_code=400, detail=f"Hora inválida: '{s}' (esperado HH:MM)")
    return s


def _to_minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _intervals_overlap(a_start: str, a_end: str, b_start: str, b_end: str) -> bool:
    """True se [a_start, a_end) e [b_start, b_end) se sobrepõem (em minutos)."""
    return _to_minutes(a_start) < _to_minutes(b_end) and _to_minutes(b_start) < _to_minutes(a_end)


def _doc_clean(d: dict) -> dict:
    d = {k: v for k, v in d.items() if k != "_id"}
    for k, v in list(d.items()):
        if isinstance(v, (date, datetime)):
            d[k] = v.isoformat()
    return d


async def _check_overlap(user_id: str, data_iso: str, hora_inicio: str, hora_fim: str, exclude_id: Optional[str] = None):
    """Lança 400 se existir indisponibilidade sobreposta para o utilizador no dia."""
    query = {"user_id": user_id, "data": data_iso}
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    docs = await db.indisponibilidades.find(query, {"_id": 0}).to_list(length=None)
    for d in docs:
        if _intervals_overlap(hora_inicio, hora_fim, d["hora_inicio"], d["hora_fim"]):
            raise HTTPException(
                status_code=400,
                detail=f"Sobreposição com indisponibilidade existente {d['hora_inicio']}–{d['hora_fim']}",
            )


# ============== USER ENDPOINTS ==============

@router.post("/indisponibilidades")
async def criar_indisponibilidade(
    payload: IndisponibilidadeCreate,
    current_user: dict = Depends(get_current_user),
):
    if payload.tipo not in VALID_TIPOS:
        raise HTTPException(status_code=400, detail=f"tipo deve ser um de: {VALID_TIPOS}")
    hi = _validate_hhmm(payload.hora_inicio)
    hf = _validate_hhmm(payload.hora_fim)
    if _to_minutes(hi) >= _to_minutes(hf):
        raise HTTPException(status_code=400, detail="hora_inicio deve ser anterior a hora_fim")
    if not (0 <= int(payload.aviso_minutos_antes) <= 24 * 60):
        raise HTTPException(status_code=400, detail="aviso_minutos_antes inválido")

    data_iso = payload.data.isoformat()
    await _check_overlap(current_user["sub"], data_iso, hi, hf)

    user_doc = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0, "username": 1, "full_name": 1})
    username = (user_doc or {}).get("full_name") or (user_doc or {}).get("username") or current_user.get("username")

    ind = Indisponibilidade(
        user_id=current_user["sub"],
        username=username,
        data=payload.data,
        hora_inicio=hi,
        hora_fim=hf,
        tipo=payload.tipo,
        regressa_servico=bool(payload.regressa_servico),
        observacoes=(payload.observacoes or "").strip() or None,
        aviso_minutos_antes=int(payload.aviso_minutos_antes),
    )
    doc = ind.model_dump()
    doc["data"] = doc["data"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.indisponibilidades.insert_one(doc)
    return _doc_clean(doc)


@router.get("/indisponibilidades/me")
async def listar_minhas(
    inicio: Optional[date] = Query(None),
    fim: Optional[date] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    query = {"user_id": current_user["sub"]}
    if inicio or fim:
        d = {}
        if inicio:
            d["$gte"] = inicio.isoformat()
        if fim:
            d["$lte"] = fim.isoformat()
        query["data"] = d
    docs = await db.indisponibilidades.find(query, {"_id": 0}).sort([("data", 1), ("hora_inicio", 1)]).to_list(length=None)
    return docs


@router.put("/indisponibilidades/{ind_id}")
async def atualizar_indisponibilidade(
    ind_id: str,
    payload: IndisponibilidadeUpdate,
    current_user: dict = Depends(get_current_user),
):
    existing = await db.indisponibilidades.find_one({"id": ind_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Indisponibilidade não encontrada")
    # Owner ou admin
    if existing.get("user_id") != current_user["sub"] and not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Sem permissão")

    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if "tipo" in update and update["tipo"] not in VALID_TIPOS:
        raise HTTPException(status_code=400, detail=f"tipo deve ser um de: {VALID_TIPOS}")
    hi = _validate_hhmm(update.get("hora_inicio", existing["hora_inicio"]))
    hf = _validate_hhmm(update.get("hora_fim", existing["hora_fim"]))
    if _to_minutes(hi) >= _to_minutes(hf):
        raise HTTPException(status_code=400, detail="hora_inicio deve ser anterior a hora_fim")
    new_data = update.get("data", existing["data"])
    if isinstance(new_data, date):
        new_data = new_data.isoformat()
    update["data"] = new_data
    update["hora_inicio"] = hi
    update["hora_fim"] = hf
    # Reset notificações se mudaram horário/data
    if (
        update.get("data") != existing.get("data")
        or update.get("hora_inicio") != existing.get("hora_inicio")
        or update.get("hora_fim") != existing.get("hora_fim")
    ):
        update["notificacao_matinal_enviada"] = False
        update["notificacao_pre_evento_enviada"] = False

    await _check_overlap(existing["user_id"], new_data, hi, hf, exclude_id=ind_id)
    await db.indisponibilidades.update_one({"id": ind_id}, {"$set": update})
    updated = await db.indisponibilidades.find_one({"id": ind_id}, {"_id": 0})
    return updated


@router.delete("/indisponibilidades/{ind_id}")
async def apagar_indisponibilidade(
    ind_id: str,
    current_user: dict = Depends(get_current_user),
):
    existing = await db.indisponibilidades.find_one({"id": ind_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Indisponibilidade não encontrada")
    if existing.get("user_id") != current_user["sub"] and not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Sem permissão")
    await db.indisponibilidades.delete_one({"id": ind_id})
    return {"message": "Indisponibilidade eliminada", "id": ind_id}


# ============== ADMIN ENDPOINTS ==============

@router.get("/indisponibilidades")
async def listar_todas(
    inicio: Optional[date] = Query(None),
    fim: Optional[date] = Query(None),
    user_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_admin),
):
    query = {}
    if user_id:
        query["user_id"] = user_id
    if inicio or fim:
        d = {}
        if inicio:
            d["$gte"] = inicio.isoformat()
        if fim:
            d["$lte"] = fim.isoformat()
        query["data"] = d
    docs = await db.indisponibilidades.find(query, {"_id": 0}).sort([("data", 1), ("hora_inicio", 1)]).to_list(length=None)
    return docs


@router.get("/indisponibilidades/check")
async def check_conflitos(
    data: date = Query(...),
    user_ids: List[str] = Query(...),
    hora_inicio: Optional[str] = Query(None),
    hora_fim: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_admin),
):
    """
    Devolve indisponibilidades que entram em conflito com um serviço a criar/editar.
    - Se hora_inicio/hora_fim forem passadas, filtra por sobreposição.
    - Caso contrário, devolve todas as indisponibilidades dos user_ids no dia.
    """
    if hora_inicio:
        _validate_hhmm(hora_inicio)
    if hora_fim:
        _validate_hhmm(hora_fim)
    if hora_inicio and hora_fim and _to_minutes(hora_inicio) >= _to_minutes(hora_fim):
        raise HTTPException(status_code=400, detail="hora_inicio deve ser anterior a hora_fim")

    docs = await db.indisponibilidades.find(
        {"user_id": {"$in": user_ids}, "data": data.isoformat()},
        {"_id": 0},
    ).to_list(length=None)

    if hora_inicio and hora_fim:
        docs = [d for d in docs if _intervals_overlap(hora_inicio, hora_fim, d["hora_inicio"], d["hora_fim"])]

    return docs


@router.get("/indisponibilidades/historico/{user_id}")
async def historico_user(
    user_id: str,
    current_user: dict = Depends(get_current_admin),
):
    docs = await db.indisponibilidades.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort([("data", -1), ("hora_inicio", -1)]).to_list(length=None)
    return docs
