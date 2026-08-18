"""
Rotas do novo sistema de Férias (Código do Trabalho arts. 237.º–246.º, 264.º)
=============================================================================

Complementa `routes/vacations.py`. Não substitui — mantém retro-compat com
os pedidos existentes (`vacation_requests`) e apenas adiciona:

- `vacation_configs` — config permanente do colaborador (admissão, gozados anteriores)
- `vacation_audit`   — histórico de todas as alterações
- `vacation_mapa`    — snapshots do mapa de férias publicado

Endpoints:
- GET /admin/vacations/config/{user_id}
- PUT /admin/vacations/config/{user_id}
- GET /admin/vacations/breakdown/{user_id}
- GET /admin/vacations/audit/{user_id}
- GET /vacations/breakdown            (para o próprio)
- GET /admin/vacations/mapa?year=
- GET /admin/vacations/mapa/excel?year=
- POST /admin/vacations/mapa/publicar?year=
"""
from __future__ import annotations
import io
import logging
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from database import db
from server import get_current_user, get_current_admin, create_notification
from vacation_engine import (
    calcular_saldo_completo, totais_do_saldo, dias_uteis_no_periodo,
)

router = APIRouter()


# =============================================================================
# Helpers internos
# =============================================================================

async def _get_config(user_id: str) -> dict:
    """Devolve config do user (novo modelo, apenas admissão). Se não existir
    mas houver vacation_balances com company_start_date, faz upsert-lazy
    migrando esse campo para preservar histórico."""
    cfg = await db.vacation_configs.find_one({"user_id": user_id}, {"_id": 0})
    if cfg:
        return cfg

    # Migração lazy: se existir company_start_date em vacation_balances, cria config
    legacy = await db.vacation_balances.find_one({"user_id": user_id}, {"_id": 0})
    if legacy and legacy.get("company_start_date"):
        cfg = {
            "user_id": user_id,
            "admissao_date": legacy["company_start_date"],
            "admissao_date_set_at": datetime.now(timezone.utc).isoformat(),
            "admissao_date_set_by": "migration_v1",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.vacation_configs.insert_one({**cfg})  # insert fresh dict
        logging.info(f"vacation_configs criada (lazy migration) para user={user_id}")
        return cfg

    # Sem qualquer histórico — devolve config vazia (admissão em falta)
    return {
        "user_id": user_id,
        "admissao_date": None,
        "admissao_date_set_at": None,
        "admissao_date_set_by": None,
    }


async def _audit(
    user_id: str, action: str, before: dict, after: dict, motivo: str, admin: dict
):
    """Persiste 1 entrada no audit trail (sem apagar dados anteriores)."""
    entry = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "action": action,
        "before": before,
        "after": after,
        "motivo": motivo or "",
        "admin_id": admin.get("sub"),
        "admin_username": admin.get("username"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.vacation_audit.insert_one(entry)


async def _fetch_saldo_ctx(user_id: str):
    """Devolve tudo o que o engine precisa para calcular."""
    cfg = await _get_config(user_id)
    approved = await db.vacation_requests.find(
        {"user_id": user_id, "status": "approved"}, {"_id": 0},
    ).to_list(None)
    cancelled = await db.cancelled_vacation_days.find(
        {"user_id": user_id}, {"_id": 0, "date": 1},
    ).to_list(None)
    cancelled_set = {c["date"] for c in cancelled}
    return cfg, approved, cancelled_set


def _breakdown_from_ctx(cfg, approved, cancelled_set, include_after=1):
    """Constrói o breakdown legal. Falha se admissao_date não estiver definida."""
    if not cfg.get("admissao_date"):
        return {
            "error": "admissao_date_missing",
            "message": "Data de admissão em falta — configure em /admin › Férias › Gerir.",
        }
    try:
        adm = datetime.strptime(cfg["admissao_date"], "%Y-%m-%d").date()
    except ValueError:
        return {"error": "admissao_date_invalid", "message": "Data de admissão inválida."}
    saldos = calcular_saldo_completo(
        admissao_date=adm,
        approved_requests=approved,
        cancelled_dates=cancelled_set,
        dias_gozados_anteriores={},
        include_years_after=include_after,
    )
    totais = totais_do_saldo(saldos)
    return {
        "admissao_date": cfg["admissao_date"],
        "year_breakdown": saldos,
        "totais": totais,
    }


# =============================================================================
# Admin: GET / PUT config
# =============================================================================

@router.get("/admin/vacations/config/{user_id}")
async def admin_get_vacation_config(user_id: str, current_user: dict = Depends(get_current_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise HTTPException(404, "Utilizador não encontrado")
    cfg = await _get_config(user_id)
    return {"user": user, "config": cfg}


@router.put("/admin/vacations/config/{user_id}")
async def admin_put_vacation_config(
    user_id: str, data: dict, current_user: dict = Depends(get_current_admin),
):
    """Actualiza config permanente do colaborador.

    Body: {
      admissao_date: "YYYY-MM-DD"  (obrigatório, gravado permanentemente)
    }
    """
    if not await db.users.find_one({"id": user_id}, {"_id": 1}):
        raise HTTPException(404, "Utilizador não encontrado")

    adm_new = (data.get("admissao_date") or "").strip()
    if not adm_new:
        raise HTTPException(400, "admissao_date é obrigatório")
    try:
        datetime.strptime(adm_new, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "admissao_date com formato inválido (YYYY-MM-DD)")

    existing = await _get_config(user_id)

    now = datetime.now(timezone.utc).isoformat()
    new_doc = {
        "user_id": user_id,
        "admissao_date": adm_new,
        "admissao_date_set_at": existing.get("admissao_date_set_at") or now,
        "admissao_date_set_by": existing.get("admissao_date_set_by") or current_user.get("username"),
        "created_at": existing.get("created_at") or now,
        "updated_at": now,
    }
    # Também limpa quaisquer campos legados (subsidio, dias_gozados_anteriores)
    await db.vacation_configs.update_one(
        {"user_id": user_id},
        {
            "$set": new_doc,
            "$unset": {"dias_gozados_anteriores": "", "subsidio_ferias_valor": ""},
        },
        upsert=True,
    )

    # Retro-compat: também guarda em vacation_balances.company_start_date
    # (para não partir código legado enquanto migração completa não acaba)
    await db.vacation_balances.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "company_start_date": adm_new}},
        upsert=True,
    )

    # Audit
    await _audit(
        user_id,
        action="update_config",
        before={"admissao_date": existing.get("admissao_date")},
        after={"admissao_date": new_doc.get("admissao_date")},
        motivo="",
        admin=current_user,
    )
    return {"success": True, "config": new_doc}


# =============================================================================
# Breakdown (Admin + próprio)
# =============================================================================

@router.get("/admin/vacations/breakdown/{user_id}")
async def admin_get_breakdown(
    user_id: str,
    include_years_after: int = Query(1, ge=0, le=3),
    current_user: dict = Depends(get_current_admin),
):
    cfg, approved, cancelled_set = await _fetch_saldo_ctx(user_id)
    result = _breakdown_from_ctx(cfg, approved, cancelled_set, include_years_after)
    result["user_id"] = user_id
    return result


@router.get("/vacations/breakdown")
async def user_get_breakdown(current_user: dict = Depends(get_current_user)):
    cfg, approved, cancelled_set = await _fetch_saldo_ctx(current_user["sub"])
    result = _breakdown_from_ctx(cfg, approved, cancelled_set, include_after=1)
    result["user_id"] = current_user["sub"]
    return result


@router.get("/admin/vacations/audit/{user_id}")
async def admin_get_audit(
    user_id: str,
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_admin),
):
    entries = await db.vacation_audit.find(
        {"user_id": user_id}, {"_id": 0},
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return {"entries": entries}


@router.post("/admin/vacations/cleanup-configs")
async def admin_cleanup_vacation_configs(current_user: dict = Depends(get_current_admin)):
    """Faz limpeza da colecção `vacation_configs`:

    1. Remove documentos duplicados por `user_id` (mantém o que tem
       `admissao_date` definida e com `updated_at`/`created_at` mais recente).
    2. Remove os campos legados `dias_gozados_anteriores` e
       `subsidio_ferias_valor` de todos os documentos.

    Retorna estatísticas da operação.
    """
    # 1) Deduplicação
    pipeline = [
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}, "ids": {"$push": "$_id"}}},
        {"$match": {"count": {"$gt": 1}}},
    ]
    dups = await db.vacation_configs.aggregate(pipeline).to_list(None)
    removed_dups = 0
    dedup_details = []
    for d in dups:
        user_id = d["_id"]
        docs = await db.vacation_configs.find({"user_id": user_id}).to_list(None)

        def _score(doc):
            has_adm = 1 if doc.get("admissao_date") else 0
            updated = doc.get("updated_at") or doc.get("created_at") or ""
            return (has_adm, updated)

        docs.sort(key=_score, reverse=True)
        keep = docs[0]
        to_remove_ids = [doc["_id"] for doc in docs[1:]]
        if to_remove_ids:
            res = await db.vacation_configs.delete_many({"_id": {"$in": to_remove_ids}})
            removed_dups += res.deleted_count
            dedup_details.append({
                "user_id": user_id,
                "kept_admissao_date": keep.get("admissao_date"),
                "removed": res.deleted_count,
            })

    # 2) Strip campos legados
    strip_res = await db.vacation_configs.update_many(
        {"$or": [
            {"dias_gozados_anteriores": {"$exists": True}},
            {"subsidio_ferias_valor": {"$exists": True}},
        ]},
        {"$unset": {"dias_gozados_anteriores": "", "subsidio_ferias_valor": ""}},
    )

    return {
        "success": True,
        "duplicates_removed": removed_dups,
        "duplicates_detail": dedup_details,
        "legacy_fields_stripped_docs": strip_res.modified_count,
    }



# =============================================================================
# Mapa de Férias
# =============================================================================

@router.get("/admin/vacations/mapa")
async def admin_get_mapa(
    year: int = Query(...),
    current_user: dict = Depends(get_current_admin),
):
    """Devolve o mapa de férias do ano (colaborador × períodos)."""
    users = await db.users.find(
        # Trata `is_active` ausente como ativo (users legacy em produção não
        # têm este campo). Ficam excluídos apenas os explicitamente inativos.
        {"is_active": {"$ne": False}}, {"_id": 0, "hashed_password": 0},
    ).to_list(1000)
    rows = []
    for u in users:
        approved = await db.vacation_requests.find(
            {"user_id": u["id"], "status": "approved"}, {"_id": 0},
        ).to_list(None)
        # filtra períodos que se intersectam com o ano
        periodos = []
        for req in approved:
            try:
                s = datetime.strptime(req["start_date"], "%Y-%m-%d").date()
                e = datetime.strptime(req["end_date"], "%Y-%m-%d").date()
            except (KeyError, ValueError):
                continue
            if e.year < year or s.year > year:
                continue
            periodos.append({
                "start": max(s, date(year, 1, 1)).isoformat(),
                "end": min(e, date(year, 12, 31)).isoformat(),
                "days_uteis": dias_uteis_no_periodo(
                    max(s, date(year, 1, 1)),
                    min(e, date(year, 12, 31)),
                ),
                "status": req.get("status"),
            })
        # Ordenar por start
        periodos.sort(key=lambda p: p["start"])
        rows.append({
            "user_id": u["id"],
            "username": u.get("username"),
            "full_name": u.get("full_name") or u.get("username"),
            "periodos": periodos,
            "total_dias": sum(p["days_uteis"] for p in periodos),
        })
    # Snapshot publicado (se existir)
    publicado = await db.vacation_mapa.find_one({"year": year}, {"_id": 0})
    return {
        "year": year,
        "rows": rows,
        "publicado": publicado,
    }


@router.get("/admin/vacations/mapa/excel")
async def admin_get_mapa_excel(
    year: int = Query(...),
    current_user: dict = Depends(get_current_admin),
):
    """Exporta o mapa em formato calendário anual (12 meses × 31 dias por
    colaborador), com **diferença visual** entre dias de férias do ano anterior
    (transitados — cor amarela) e do ano corrente (cor verde).

    - Cada colaborador ocupa 12 linhas (uma por mês) + linha em branco.
    - Colunas: MÊS, ANO, e 31 dias.
    - Célula preenchida = dia de férias aprovado. Cor amarela = do ano N-1
      (F<N-1>); cor verde = do ano N (F<N>).
    """
    from openpyxl import Workbook
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
    from datetime import date, timedelta
    import calendar as _cal
    from vacation_engine import (
        feriados_do_ano, is_dia_util,
        calcular_saldo_completo,
    )

    year_prev = year - 1
    label_prev = f"F{str(year_prev)[-2:]}"  # ex: F25
    label_curr = f"F{str(year)[-2:]}"       # ex: F26

    users = await db.users.find(
        # Trata `is_active` ausente como ativo (users legacy em produção não
        # têm este campo). Ficam excluídos apenas os explicitamente inativos.
        {"is_active": {"$ne": False}}, {"_id": 0, "hashed_password": 0},
    ).to_list(1000)

    wb = Workbook()
    ws = wb.active
    ws.title = f"Mapa Ferias {year}"

    fill_prev = PatternFill("solid", fgColor="FFF2A8")   # amarelo claro
    fill_curr = PatternFill("solid", fgColor="A8E6A3")   # verde claro
    fill_holiday = PatternFill("solid", fgColor="E5E7EB")
    fill_weekend = PatternFill("solid", fgColor="F3F4F6")
    fill_header = PatternFill("solid", fgColor="374151")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    bold_font = Font(bold=True)
    center = Alignment(horizontal="center", vertical="center")
    thin = Side(style="thin", color="D1D5DB")
    box = Border(left=thin, right=thin, top=thin, bottom=thin)

    meses_pt = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

    # Cabeçalho global
    ws.cell(row=1, column=1, value=f"Mapa de Férias — {year}").font = Font(bold=True, size=14)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=8)

    # Legenda
    ws.cell(row=2, column=1, value="Legenda:").font = bold_font
    ws.cell(row=2, column=2, value=label_prev).fill = fill_prev
    ws.cell(row=2, column=3, value=f"Férias do ano anterior ({year_prev})")
    ws.cell(row=2, column=4, value=label_curr).fill = fill_curr
    ws.cell(row=2, column=5, value=f"Férias do ano corrente ({year})")

    header_row = 4
    # Cabeçalho da tabela
    ws.cell(row=header_row, column=1, value="Colaborador").font = header_font
    ws.cell(row=header_row, column=1).fill = fill_header
    ws.cell(row=header_row, column=2, value="Mês").font = header_font
    ws.cell(row=header_row, column=2).fill = fill_header
    for d in range(1, 32):
        c = ws.cell(row=header_row, column=2 + d, value=d)
        c.font = header_font
        c.fill = fill_header
        c.alignment = center
        c.border = box
    for c in ws[header_row]:
        c.alignment = center

    feriados = feriados_do_ano(year)
    row = header_row + 1

    for u in users:
        # Fetch pedidos aprovados que intersectam o ano
        approved = await db.vacation_requests.find(
            {"user_id": u["id"], "status": "approved"}, {"_id": 0},
        ).to_list(None)
        # Config para saber transitados do ano
        cfg = await db.vacation_configs.find_one({"user_id": u["id"]}, {"_id": 0}) or {}
        adm_str = cfg.get("admissao_date")
        remaining_prev = 0
        if adm_str:
            try:
                adm = datetime.strptime(adm_str, "%Y-%m-%d").date()
                saldos = calcular_saldo_completo(
                    adm, approved, set(), {}, include_years_after=0,
                )
                for s in saldos:
                    if s["year"] == year:
                        remaining_prev = int(s.get("dias_transitados") or 0)
                        break
            except ValueError:
                remaining_prev = 0

        # Coleccionar dias úteis de férias no ano, ordenados
        vac_days = []
        for req in approved:
            try:
                s = datetime.strptime(req["start_date"], "%Y-%m-%d").date()
                e = datetime.strptime(req["end_date"], "%Y-%m-%d").date()
            except (KeyError, ValueError):
                continue
            if e.year < year or s.year > year:
                continue
            cur = max(s, date(year, 1, 1))
            end_c = min(e, date(year, 12, 31))
            while cur <= end_c:
                if is_dia_util(cur, feriados):
                    vac_days.append(cur)
                cur += timedelta(days=1)
        vac_days.sort()

        # FIFO: primeiros N dias consomem transitados (F_prev), restantes F_curr
        day_source: dict = {}  # date → 'prev' | 'curr'
        used_prev = 0
        for d in vac_days:
            if used_prev < remaining_prev:
                day_source[d] = 'prev'
                used_prev += 1
            else:
                day_source[d] = 'curr'

        # Escrever 12 linhas — 1 por mês
        for month_i in range(1, 13):
            ws.cell(row=row, column=1, value=(u.get('full_name') or u.get('username')) if month_i == 1 else '')
            if month_i == 1:
                ws.cell(row=row, column=1).font = bold_font
            ws.cell(row=row, column=2, value=meses_pt[month_i - 1])
            ws.cell(row=row, column=2).font = bold_font
            _, ndays = _cal.monthrange(year, month_i)
            for d in range(1, 32):
                col = 2 + d
                cell = ws.cell(row=row, column=col)
                if d > ndays:
                    cell.value = ''
                    continue
                the_date = date(year, month_i, d)
                src = day_source.get(the_date)
                if src == 'prev':
                    cell.value = label_prev
                    cell.fill = fill_prev
                elif src == 'curr':
                    cell.value = label_curr
                    cell.fill = fill_curr
                elif the_date in feriados:
                    cell.fill = fill_holiday
                elif the_date.weekday() >= 5:
                    cell.fill = fill_weekend
                cell.border = box
                cell.alignment = center
            row += 1
        # Linha em branco entre colaboradores
        row += 1

    # Larguras
    from openpyxl.utils import get_column_letter
    ws.column_dimensions['A'].width = 26
    ws.column_dimensions['B'].width = 12
    for i in range(1, 32):
        ws.column_dimensions[get_column_letter(2 + i)].width = 4

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"Mapa_Ferias_{year}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/admin/vacations/mapa/publicar")
async def admin_publicar_mapa(
    year: int = Query(...),
    current_user: dict = Depends(get_current_admin),
):
    """Publica um snapshot do mapa de férias do ano.

    Cria um documento em `vacation_mapa` com o snapshot actual + notifica
    todos os colaboradores activos. Deadline legal: 15 Abril.
    """
    mapa = await admin_get_mapa(year=year, current_user=current_user)
    snapshot = {
        "year": year,
        "published_at": datetime.now(timezone.utc).isoformat(),
        "published_by_id": current_user.get("sub"),
        "published_by_name": current_user.get("username"),
        "rows": mapa["rows"],
    }
    await db.vacation_mapa.update_one(
        {"year": year}, {"$set": snapshot}, upsert=True,
    )
    # Notifica utilizadores
    users = await db.users.find(
        {"is_active": {"$ne": False}}, {"_id": 0, "id": 1, "full_name": 1, "username": 1},
    ).to_list(1000)
    for u in users:
        try:
            await create_notification(
                u["id"], "mapa_ferias_publicado",
                f"O mapa de férias de {year} foi publicado. Consulte em /vacations.",
                None,
            )
        except Exception as e:
            logging.warning(f"Falha ao notificar mapa a {u.get('username')}: {e}")
    return {"success": True, "year": year, "notified": len(users)}
