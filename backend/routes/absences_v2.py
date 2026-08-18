"""
Sistema de Faltas v2 — Código do Trabalho arts. 248.º–257.º
============================================================

Extensão do módulo existente `/absences/*` com:
- Estados separados do tipo (Pendente | Aprovada | Rejeitada |
  Pendente de Documento | Injustificada).
- Faltas parciais com hora início/fim reais (nunca assume 8h).
- Audit trail imutável em `absence_audit` (before/after/admin/motivo).
- Cruzamento com pontos e integração no Relatório Mensal via helpers.

Mantém compatibilidade retroactiva:
- A coleção continua a ser `absences`.
- Documentos legacy (com `status="approved"/"rejected"/"pending"` e sem
  `state` novo) são normalizados on-the-fly para o novo modelo de estados.
- O endpoint legacy `POST /absences/create` continua a funcionar.
"""
from __future__ import annotations
import logging
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from database import db
from server import get_current_user, get_current_admin, create_notification, UPLOAD_DIR

router = APIRouter()

# ---------------------------------------------------------------------------
# Estados canónicos e mapeamento legacy → novo
# ---------------------------------------------------------------------------
STATE_PENDING = "pendente"
STATE_APPROVED = "aprovada"
STATE_REJECTED = "rejeitada"
STATE_PENDING_DOC = "pendente_documento"
STATE_UNJUSTIFIED = "injustificada"

VALID_STATES = {STATE_PENDING, STATE_APPROVED, STATE_REJECTED, STATE_PENDING_DOC, STATE_UNJUSTIFIED}

STATE_LABELS = {
    STATE_PENDING: "Pendente",
    STATE_APPROVED: "Aprovada",
    STATE_REJECTED: "Rejeitada",
    STATE_PENDING_DOC: "Pendente de Documento",
    STATE_UNJUSTIFIED: "Injustificada",
}


def normalize_state(absence: dict) -> str:
    """Devolve o estado v2 canónico, migrando o `status` legacy quando preciso.

    - Se `state` já existe, usa-o.
    - Se não, mapeia legacy `status`:
        pending → pendente
        approved → aprovada
        rejected → rejeitada  (NOTA: não é injustificada — a lei distingue)
    - Se legacy `is_justified=False` + `status=approved` → injustificada.
    """
    if absence.get("state") in VALID_STATES:
        return absence["state"]
    status = (absence.get("status") or "").lower()
    is_just = absence.get("is_justified", True)
    if status == "approved":
        return STATE_UNJUSTIFIED if not is_just else STATE_APPROVED
    if status == "rejected":
        return STATE_REJECTED
    return STATE_PENDING


def color_for_state(state: str) -> str:
    """Cor de UI/PDF para cada estado do dia no Relatório Mensal.
    - vermelho: INJUSTIFICADA
    - azul: Aprovada (justificada)
    - laranja: Rejeitada ou Pendente de Documento
    - (pendente = neutro)
    """
    if state == STATE_UNJUSTIFIED:
        return "red"
    if state == STATE_APPROVED:
        return "blue"
    if state in (STATE_REJECTED, STATE_PENDING_DOC):
        return "orange"
    return None


def format_hours_label(hours: float) -> str:
    """Formata horas em '2h' ou '2h30' etc. Ignora minutos se == 0."""
    try:
        total_min = int(round(float(hours) * 60))
    except (TypeError, ValueError):
        return ""
    h = total_min // 60
    m = total_min % 60
    if m == 0:
        return f"{h}h"
    return f"{h}h{m:02d}"


def observations_label(absence: dict) -> str:
    """Texto a colocar em Observações do dia no Relatório Mensal.

    Regras (spec do utilizador):
    - Falta injustificada 8h → "FALTA INJUSTIFICADA"
    - Falta injustificada parcial (Xh) → "Xh Falta Injustificada"
    - Falta aprovada (Xh) → "Xh Falta Justificada"
    - Falta rejeitada (Xh) → "Xh Justificação Rejeitada"
    - Pendente documento (Xh) → "Xh Pendente de Documento"
    - Pendente (Xh) → "Xh Falta Pendente"
    """
    state = normalize_state(absence)
    hours = float(absence.get("hours") or 0)
    is_partial = bool(absence.get("is_partial")) or (0 < hours < 8)
    label_hours = format_hours_label(hours)
    if state == STATE_UNJUSTIFIED:
        if is_partial:
            return f"{label_hours} Falta Injustificada"
        return "FALTA INJUSTIFICADA"
    if state == STATE_APPROVED:
        return f"{label_hours} Falta Justificada"
    if state == STATE_REJECTED:
        return f"{label_hours} Justificação Rejeitada"
    if state == STATE_PENDING_DOC:
        return f"{label_hours} Pendente de Documento"
    if state == STATE_PENDING:
        return f"{label_hours} Falta Pendente"
    return ""


# ---------------------------------------------------------------------------
# Audit trail
# ---------------------------------------------------------------------------

async def _audit(
    absence_id: str, user_id: str, action: str,
    before_state: Optional[str], after_state: str,
    motivo: str, admin: dict,
):
    entry = {
        "id": str(uuid.uuid4()),
        "absence_id": absence_id,
        "user_id": user_id,
        "action": action,
        "before_state": before_state,
        "after_state": after_state,
        "motivo": motivo or "",
        "admin_id": admin.get("sub"),
        "admin_username": admin.get("username"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.absence_audit.insert_one(entry)


# ---------------------------------------------------------------------------
# Registo pelo utilizador (v2 — com faltas parciais reais)
# ---------------------------------------------------------------------------

@router.post("/absences/v2/create")
async def create_absence_v2(
    data: dict, current_user: dict = Depends(get_current_user),
):
    """Registo de uma falta (v2).

    Body:
      date: "YYYY-MM-DD"
      absence_type: str (ex: "Falta 8h Justificada", "Falta Parcial", ...)
      is_partial: bool
      start_time: "HH:MM"  (só se is_partial)
      end_time: "HH:MM"    (só se is_partial)
      hours: float         (calculado no cliente se parcial; obrigatório)
      reason: str
    """
    date = (data.get("date") or "").strip()
    absence_type = (data.get("absence_type") or "").strip()
    if not date or not absence_type:
        raise HTTPException(400, "date e absence_type são obrigatórios")

    is_partial = bool(data.get("is_partial"))
    start_time = data.get("start_time") if is_partial else None
    end_time = data.get("end_time") if is_partial else None
    hours = data.get("hours")
    if is_partial:
        if not start_time or not end_time:
            raise HTTPException(400, "start_time e end_time obrigatórios em falta parcial")
        # Calcular horas a partir do intervalo se não veio
        try:
            sh, sm = map(int, start_time.split(":"))
            eh, em = map(int, end_time.split(":"))
            mins = (eh * 60 + em) - (sh * 60 + sm)
            if mins <= 0:
                raise ValueError
            hours = round(mins / 60, 2)
        except (TypeError, ValueError):
            raise HTTPException(400, "start_time/end_time inválidos")
    else:
        if hours is None:
            hours = 8.0
        try:
            hours = float(hours)
        except (TypeError, ValueError):
            raise HTTPException(400, "hours inválido")

    # Não permitir duplicado
    if await db.absences.find_one({"user_id": current_user["sub"], "date": date}):
        raise HTTPException(400, "Já existe uma falta registada para este dia")

    # is_justified — só false quando o próprio user marca como injustificada
    # (raro; normalmente pende de justificação → is_justified=True + state=pendente)
    is_justified = data.get("is_justified", True)

    absence_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": absence_id,
        "user_id": current_user["sub"],
        "username": current_user.get("username"),
        "date": date,
        "absence_type": absence_type,
        "hours": hours,
        "is_partial": is_partial,
        "start_time": start_time,
        "end_time": end_time,
        "is_justified": is_justified,
        "reason": data.get("reason") or "",
        "justification_file": None,
        "state": STATE_PENDING,
        "status": "pending",  # legacy
        "reviewed_by": None,
        "reviewed_at": None,
        "created_at": now_iso,
    }
    await db.absences.insert_one(doc)
    await _audit(absence_id, current_user["sub"], "created", None, STATE_PENDING, "", current_user)

    # Notify admins
    admins = await db.users.find({"is_admin": True}, {"_id": 0, "id": 1}).to_list(100)
    hlabel = format_hours_label(hours) or f"{hours}h"
    for admin in admins:
        await create_notification(
            admin["id"], "absence_created_v2",
            f"Nova falta de {current_user.get('username')}: {hlabel} em {date} ({absence_type})",
            absence_id,
        )
    doc.pop("_id", None)
    return {"success": True, "absence": doc}


@router.post("/absences/v2/{absence_id}/upload")
async def upload_v2(
    absence_id: str, file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    absence = await db.absences.find_one({"id": absence_id, "user_id": current_user["sub"]})
    if not absence:
        raise HTTPException(404, "Falta não encontrada")
    allowed = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, "Apenas PDF/JPG/PNG/WEBP")
    fname = f"{absence_id}_{file.filename}"
    fpath = UPLOAD_DIR / fname
    with open(fpath, "wb") as buf:
        shutil.copyfileobj(file.file, buf)
    # Se estava "pendente_documento", volta a "pendente" (documento agora existe)
    prev_state = normalize_state(absence)
    updates = {"justification_file": fname}
    if prev_state == STATE_PENDING_DOC:
        updates["state"] = STATE_PENDING
        updates["status"] = "pending"
        await _audit(absence_id, absence["user_id"], "document_uploaded", prev_state, STATE_PENDING,
                     "Documento carregado pelo trabalhador", current_user)
    await db.absences.update_one({"id": absence_id}, {"$set": updates})
    return {"success": True, "filename": fname}


# ---------------------------------------------------------------------------
# Admin: mudar estado + audit
# ---------------------------------------------------------------------------

@router.put("/admin/absences/v2/{absence_id}/state")
async def admin_set_state(
    absence_id: str, data: dict, current_user: dict = Depends(get_current_admin),
):
    """Body: { state: <STATE>, motivo?: str }
    Requer motivo se state ∈ {rejeitada, injustificada}."""
    new_state = (data.get("state") or "").strip().lower()
    motivo = (data.get("motivo") or "").strip()
    if new_state not in VALID_STATES:
        raise HTTPException(400, f"Estado inválido. Válidos: {sorted(VALID_STATES)}")
    if new_state in (STATE_REJECTED, STATE_UNJUSTIFIED) and not motivo:
        raise HTTPException(400, "Motivo obrigatório em Rejeitada/Injustificada")

    absence = await db.absences.find_one({"id": absence_id})
    if not absence:
        raise HTTPException(404, "Falta não encontrada")
    prev_state = normalize_state(absence)

    # Reflectir também no legacy `status` (para o dashboard antigo não partir)
    legacy_map = {
        STATE_PENDING: "pending", STATE_APPROVED: "approved",
        STATE_REJECTED: "rejected", STATE_PENDING_DOC: "pending",
        STATE_UNJUSTIFIED: "approved",  # injustificada = decidida — legacy "approved" para não desaparecer da lista antiga
    }
    is_justified_new = new_state != STATE_UNJUSTIFIED

    await db.absences.update_one(
        {"id": absence_id},
        {"$set": {
            "state": new_state,
            "status": legacy_map[new_state],
            "is_justified": is_justified_new,
            "reviewed_by": current_user.get("username"),
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
            "admin_reason": motivo if motivo else absence.get("admin_reason"),
        }},
    )
    await _audit(absence_id, absence["user_id"], "state_change", prev_state, new_state, motivo, current_user)

    # Notify user
    await create_notification(
        absence["user_id"], f"absence_state_{new_state}",
        f"A sua falta de {absence['date']} passou a: {STATE_LABELS[new_state]}"
        + (f" — {motivo}" if motivo else ""),
        absence_id,
    )
    return {"success": True, "state": new_state}


# ---------------------------------------------------------------------------
# Listagem admin com filtros + audit
# ---------------------------------------------------------------------------

@router.get("/admin/absences/v2/list")
async def admin_list(
    year: Optional[int] = Query(None), month: Optional[int] = Query(None),
    user_id: Optional[str] = Query(None), absence_type: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    current_user: dict = Depends(get_current_admin),
):
    q: dict = {}
    if user_id:
        q["user_id"] = user_id
    if absence_type:
        q["absence_type"] = absence_type
    if year and month:
        # date é ISO YYYY-MM-DD — usar regex
        q["date"] = {"$regex": f"^{year:04d}-{month:02d}-"}
    elif year:
        q["date"] = {"$regex": f"^{year:04d}-"}
    items = await db.absences.find(q, {"_id": 0}).sort("date", -1).limit(limit).to_list(limit)
    # normalizar estado e filtrar por estado se pedido
    out = []
    for a in items:
        s = normalize_state(a)
        a["state"] = s
        a["state_label"] = STATE_LABELS.get(s, s)
        if state and s != state:
            continue
        out.append(a)
    return {"items": out, "count": len(out)}


@router.get("/admin/absences/v2/{absence_id}/audit")
async def admin_get_audit(
    absence_id: str, current_user: dict = Depends(get_current_admin),
):
    entries = await db.absence_audit.find(
        {"absence_id": absence_id}, {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    return {"entries": entries}


# ---------------------------------------------------------------------------
# Helper público — usado pelo Relatório Mensal
# ---------------------------------------------------------------------------

async def fetch_absences_for_month(user_id: str, start_iso: str, end_iso: str) -> dict:
    """Devolve dict { "YYYY-MM-DD": {state, color, obs, hours, is_partial, ...} }
    para todos os dias com falta no período (inclusive)."""
    docs = await db.absences.find(
        {"user_id": user_id, "date": {"$gte": start_iso, "$lte": end_iso}}, {"_id": 0},
    ).to_list(200)
    out = {}
    for a in docs:
        s = normalize_state(a)
        out[a["date"]] = {
            "state": s,
            "state_label": STATE_LABELS.get(s, s),
            "color": color_for_state(s),
            "obs": observations_label(a),
            "hours": float(a.get("hours") or 0),
            "is_partial": bool(a.get("is_partial")),
            "absence_type": a.get("absence_type"),
            "start_time": a.get("start_time"),
            "end_time": a.get("end_time"),
        }
    return out


# ---------------------------------------------------------------------------
# Scan semanal (Domingo 23:59) — dias úteis sem registo
# ---------------------------------------------------------------------------

async def _admin_email(db_) -> str:
    """Email do admin (geral@hwi.pt por defeito, override via env)."""
    import os
    return os.environ.get("ADMIN_ALERT_EMAIL", "geral@hwi.pt")


async def weekly_missing_records_scan(db_, base_url: str = "") -> int:
    """Procura dias úteis (Seg-Sex, excluindo feriados PT) da semana que
    terminou HOJE (Domingo) em que o utilizador não tem:
      - qualquer registo de ponto (`time_entries`)
      - nem qualquer falta registada (`absences`)
      - nem férias aprovadas (`vacation_requests` status=approved)
      - nem folga em `day_status_overrides`.

    Para cada utilizador com dias em falta, envia 1 email ao próprio (se
    tiver `email`) e 1 email ao admin (`geral@hwi.pt`) a pedir para definir
    o tipo de falta em /absences.
    """
    import logging
    from datetime import date, timedelta
    from server import send_notification_email
    from vacation_engine import feriados_do_ano

    today = date.today()
    # Semana que terminou hoje (assumimos correr ao Domingo 23:59) —
    # se por qualquer razão correr noutro dia, calcula a última Seg-Dom.
    # weekday(): Mon=0..Sun=6
    days_since_sunday = (today.weekday() + 1) % 7  # Sun=0, Mon=1..Sat=6
    last_sunday = today - timedelta(days=days_since_sunday)
    last_monday = last_sunday - timedelta(days=6)

    feriados = set()
    for y in {last_monday.year, last_sunday.year}:
        feriados |= feriados_do_ano(y)

    users = await db_.users.find(
        {"is_active": True}, {"_id": 0, "id": 1, "email": 1, "full_name": 1, "username": 1},
    ).to_list(1000)

    emails_sent = 0
    admin_batches: list = []
    admin_target = await _admin_email(db_)

    for u in users:
        # Dias úteis da semana passada
        missing = []
        d = last_monday
        while d <= last_sunday:
            if d.weekday() < 5 and d not in feriados:
                ds = d.isoformat()
                # Regista se tem AO MENOS uma ausência justificada? — verifica
                # cada fonte em paralelo (curto-circuito ao primeiro hit)
                found = False
                if await db_.time_entries.find_one(
                    {"user_id": u["id"], "date": ds}, {"_id": 1}):
                    found = True
                if not found and await db_.absences.find_one(
                    {"user_id": u["id"], "date": ds}, {"_id": 1}):
                    found = True
                if not found and await db_.day_status_overrides.find_one(
                    {"user_id": u["id"], "date": ds}, {"_id": 1}):
                    found = True
                if not found:
                    # Verificar férias aprovadas que abrangem esse dia
                    vac = await db_.vacation_requests.find_one({
                        "user_id": u["id"], "status": "approved",
                        "start_date": {"$lte": ds},
                        "end_date": {"$gte": ds},
                    }, {"_id": 1})
                    if vac:
                        found = True
                if not found:
                    missing.append(ds)
            d += timedelta(days=1)

        if not missing:
            continue

        # Envia email ao utilizador
        name = u.get("full_name") or u.get("username") or "colaborador"
        days_html = "".join(f"<li>{ds}</li>" for ds in missing)
        subject_u = f"[HWI] Faltam registos da semana {last_monday.isoformat()} a {last_sunday.isoformat()}"
        body_u = f"""
        <html><body style='font-family:Arial,sans-serif;color:#222'>
        <h2 style='color:#b45309'>Registos em falta</h2>
        <p>Olá {name},</p>
        <p>O sistema detectou que os seguintes dias úteis não têm registo de ponto,
        falta, férias ou folga:</p>
        <ul>{days_html}</ul>
        <p>Por favor, entre em <b>{base_url}/absences</b> e defina o tipo de falta
        para cada um dos dias.</p>
        <p style='color:#666;font-size:12px;margin-top:16px'>Aviso automático do sistema HWI.</p>
        </body></html>
        """
        if u.get("email"):
            try:
                if await send_notification_email(u["email"], subject_u, body_u):
                    emails_sent += 1
            except Exception as e:
                logging.warning(f"Falha ao enviar aviso semanal a {u.get('username')}: {e}")

        admin_batches.append({
            "name": name, "username": u.get("username"), "days": missing,
        })

    # 1 email consolidado ao admin
    if admin_batches and admin_target:
        rows_html = "".join(
            f"<tr><td style='padding:6px;border:1px solid #ddd'>{b['name']}</td>"
            f"<td style='padding:6px;border:1px solid #ddd'>{', '.join(b['days'])}</td></tr>"
            for b in admin_batches
        )
        subject_a = f"[HWI] Colaboradores com registos em falta ({last_monday.isoformat()} → {last_sunday.isoformat()})"
        body_a = f"""
        <html><body style='font-family:Arial,sans-serif;color:#222'>
        <h2 style='color:#b45309'>Registos em falta — semana passada</h2>
        <p>Estes colaboradores têm dias úteis sem qualquer registo (ponto,
        falta, férias ou folga). Peça-lhes para definir o tipo de falta em
        <b>{base_url}/absences</b>:</p>
        <table style='border-collapse:collapse;width:100%'>
            <thead><tr>
                <th style='padding:6px;border:1px solid #ddd;background:#f3f4f6;text-align:left'>Colaborador</th>
                <th style='padding:6px;border:1px solid #ddd;background:#f3f4f6;text-align:left'>Dias em falta</th>
            </tr></thead>
            <tbody>{rows_html}</tbody>
        </table>
        <p style='color:#666;font-size:12px;margin-top:16px'>Aviso automático semanal do sistema HWI.</p>
        </body></html>
        """
        try:
            if await send_notification_email(admin_target, subject_a, body_a):
                emails_sent += 1
        except Exception as e:
            logging.warning(f"Falha ao enviar consolidado ao admin: {e}")

    return emails_sent
