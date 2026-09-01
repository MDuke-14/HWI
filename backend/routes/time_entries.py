"""
Time Entry Routes - Picagem de Ponto
Extracted from server.py for better maintainability.
"""
import logging
import math
import uuid
import os
import shutil
from io import BytesIO
from pathlib import Path
from datetime import datetime, timezone, timedelta, date, time
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import StreamingResponse

from database import db
from models import TimeEntry, TimeEntryStart, TimeEntryEnd, TimeEntryUpdate, ManualTimeEntryCreate
from holidays import is_overtime_day, get_billing_period_dates
from hours_calculator import calcular_breakdown_completo
from excel_report import generate_monthly_report
from pdf_report import generate_monthly_pdf_report
from import_pdf import parse_pdf_timesheet


# ---------------------------------------------------------------------------
# Auto-detecção "Fora de Zona de Residência" a partir do reverse geocoding
# ---------------------------------------------------------------------------
# Zona de residência = distritos da grande Lisboa/Setúbal habituais.
# Se a picagem vier fora destes distritos (ou de outro país que não PT),
# o backend marca automaticamente `outside_residence_zone=True` e preenche
# uma `location_description` com a cidade/país detectados.
#
# Isto garante que mobile + desktop têm a mesma lógica (o frontend mobile
# não faz reverse geocoding local — só o backend).
# ---------------------------------------------------------------------------

_ZONA_RESIDENCIA = {"lisboa", "sintra", "setúbal", "setubal"}


def _detect_outside_residence_zone(address_info: dict):
    """Devolve (is_outside: bool, description: str | None).

    Regras:
    - Se country_code != 'PT' → fora de zona (usa cidade+país como descrição).
    - Se country_code == 'PT' e nenhum dos campos (city/municipality/county/
      region) contém "Lisboa", "Sintra" ou "Setúbal" → fora de zona.
    - Caso contrário devolve (False, None).
    """
    if not address_info:
        return False, None

    country_code = (address_info.get("country_code") or "").upper()
    country = address_info.get("country")
    locality = address_info.get("locality") or address_info.get("city")
    municipality = address_info.get("municipality")
    zone = address_info.get("zone")
    region = address_info.get("region") or address_info.get("county")

    def _fmt(city_val, county_val, country_val):
        parts = []
        if zone:
            parts.append(zone)
        if city_val:
            parts.append(city_val)
        if county_val and county_val != city_val:
            parts.append(county_val)
        if country_val and country_code != "PT":
            parts.append(country_val)
        return ", ".join([p for p in parts if p]) or country_val or "Local desconhecido"

    if country_code and country_code != "PT":
        return True, _fmt(locality or municipality, region, country)

    if country_code == "PT":
        haystack = " ".join([
            (locality or ""), (municipality or ""), (region or ""),
        ]).lower()
        in_residence = any(z in haystack for z in _ZONA_RESIDENCIA)
        if not in_residence:
            return True, _fmt(locality or municipality, region, country)

    return False, None



# ---------------------------------------------------------------------------
# Subsídio Alimentação (SA) / Ajuda de Custos (AC) — regras unificadas
# ---------------------------------------------------------------------------
# Regras (vigentes desde Feb/2026):
#   • Total de horas trabalhadas no dia (entradas confirmadas)
#   • SA (quando NÃO está outside_residence_zone):
#       - h < 4   → 0
#       - h >= 4  → SA_FULL_VALUE (10€)
#   • AC (quando está outside_residence_zone):
#       - h < 4         → 0
#       - 4 <= h < 6    → 50% (25€)
#       - h >= 6        → 100% (50€)
# Nota: a regra antiga de "dia especial só paga >=5h" foi substituída pelo
# limite universal de 4h (aplica-se a TODOS os dias).
# Regras extraídas para `sa_ac_rules.py` (pure module, sem deps) para permitir
# testes unitários sem circular imports.
from sa_ac_rules import SA_FULL_VALUE, AC_FULL_VALUE, calcular_sa_ac  # noqa: F401

import pytz
LISBON_TZ = pytz.timezone('Europe/Lisbon')

# Import shared helpers from server module
from server import (
    get_current_user, get_current_admin,
    normalizar_tempo, parse_stored_datetime,
    get_now_local, get_today_local, format_time_from_iso,
    truncar_horas_para_minutos, truncar_segundos_para_horas,
    calcular_minutos_de_entradas, calculate_hours_breakdown,
    get_special_day_info, log_app_error,
    send_time_entry_edit_notification_email,
    get_day_authorization, create_day_authorization_request,
    reverse_geocode, calculate_vacation_days,
)
from notifications_scheduler import send_push_to_admins, send_push_notification

router = APIRouter()

@router.post("/time-entries/start")
async def start_time_entry(entry_data: TimeEntryStart, current_user: dict = Depends(get_current_user)):
    """
    Iniciar picagem de ponto.
    
    Em dias especiais (férias, feriados, sábados, domingos):
    - Primeira picagem: envia pedido de autorização ao admin
    - Picagens seguintes: verificam estado do dia (autorizado/rejeitado/pendente)
    - Uma autorização desbloqueia o dia inteiro
    - Uma rejeição bloqueia todas as picagens desse dia
    """
    now_local = get_now_local(entry_data.client_time)
    today = now_local.strftime("%Y-%m-%d")
    today_date = now_local.date()
    current_time_str = now_local.strftime("%H:%M")
    
    # Check if there's already an active (not completed) entry for this user
    existing_active = await db.time_entries.find_one({
        "user_id": current_user["sub"],
        "status": "active"
    }, {"_id": 0})
    
    if existing_active:
        raise HTTPException(status_code=400, detail="Por favor finalize o registo anterior antes de iniciar um novo")
    
    # Obter informações sobre o tipo de dia
    day_info = await get_special_day_info(today_date, current_user["sub"])
    
    # Se é dia especial, verificar estado de autorização
    day_authorization = None
    authorization_status_message = None
    
    if day_info["is_special"]:
        # Verificar se já existe autorização para este dia
        day_authorization = await get_day_authorization(current_user["sub"], today)
        
        if day_authorization:
            status = day_authorization.get("status")
            
            if status == "rejected":
                # Dia rejeitado - bloquear picagem
                logging.info(f"Picagem bloqueada: {current_user['username']} em {today} (dia rejeitado)")
                raise HTTPException(
                    status_code=403, 
                    detail=f"Trabalho não autorizado para este dia ({day_info['day_type_display']}). Contacte a administração."
                )
            
            elif status == "authorized":
                # Dia autorizado - permitir picagem sem nova notificação
                logging.info(f"Picagem permitida: {current_user['username']} em {today} (dia já autorizado)")
                authorization_status_message = f"Dia autorizado ({day_info['day_type_display']})"
            
            elif status == "pending":
                # Ainda pendente - permitir picagem mas informar
                authorization_status_message = f"Aguarda autorização ({day_info['day_type_display']})"
        
        else:
            # Primeira picagem do dia - criar pedido de autorização
            logging.info(f"Primeira picagem em dia especial: {current_user['username']} em {today} ({day_info['day_type_display']})")
    
    # Verificar se já existe uma entrada hoje com "Fora de Zona de Residência" ativo
    existing_outside_zone = await db.time_entries.find_one({
        "user_id": current_user["sub"],
        "date": today,
        "outside_residence_zone": True
    }, {"_id": 0})
    
    outside_zone_value = entry_data.outside_residence_zone or False
    if existing_outside_zone:
        outside_zone_value = True
        logging.info(f"Aplicando outside_residence_zone=True automaticamente")
    
    # Criar a entrada de tempo
    is_ot, ot_reason = is_overtime_day(today_date)
    
    entry = TimeEntry(
        user_id=current_user["sub"],
        username=current_user["username"],
        date=today,
        start_time=normalizar_tempo(now_local),
        status="active",
        observations=entry_data.observations,
        is_overtime_day=is_ot,
        overtime_reason=ot_reason if is_ot else None,
        outside_residence_zone=outside_zone_value,
        location_description=entry_data.location_description if outside_zone_value else None
    )
    
    entry_dict = entry.model_dump()
    entry_dict['start_time'] = entry_dict['start_time'].isoformat()
    entry_dict['created_at'] = entry_dict['created_at'].isoformat()
    
    # Adicionar campos de autorização diária
    if day_info["is_special"]:
        entry_dict['is_special_day'] = True
        entry_dict['special_day_type'] = day_info["day_type"]
        entry_dict['special_day_display'] = day_info["day_type_display"]
        if day_authorization:
            entry_dict['day_authorization_id'] = day_authorization.get("id")
            entry_dict['day_authorization_status'] = day_authorization.get("status")
    
    # Adicionar geolocalização se disponível
    auto_outside_detected = False
    auto_location_desc = None
    if entry_data.geo_location:
        geo = entry_data.geo_location
        entry_dict['geo_location'] = geo
        logging.info(f"Geolocalização registada: lat={geo.get('latitude')}, lng={geo.get('longitude')}")

        # Fazer reverse geocoding para obter cidade/país
        if geo.get('latitude') and geo.get('longitude'):
            try:
                address_info = await reverse_geocode(geo['latitude'], geo['longitude'])
                if address_info:
                    entry_dict['geo_location']['address'] = address_info
                    logging.info(f"📍 Local: {address_info.get('city')}, {address_info.get('country')}")

                    # Auto-detecção "Fora de Zona" — respeita override manual do cliente
                    is_out, desc = _detect_outside_residence_zone(address_info)
                    if is_out:
                        auto_outside_detected = True
                        auto_location_desc = desc
            except Exception as e:
                logging.error(f"Erro no reverse geocoding: {str(e)}")

    if auto_outside_detected and not outside_zone_value:
        outside_zone_value = True
        entry_dict["outside_residence_zone"] = True
        # Só sobrepor a descrição se o cliente não enviou uma
        if not entry_data.location_description:
            entry_dict["location_description"] = auto_location_desc
        else:
            entry_dict["location_description"] = entry_data.location_description
        logging.info(f"🌍 Auto-detectado FORA DE ZONA: {auto_location_desc}")

    
    # Inserir entrada na base de dados
    await db.time_entries.insert_one(entry_dict)
    
    # Se é dia especial e é a primeira picagem, criar pedido de autorização
    authorization_created = False
    if day_info["is_special"] and not day_authorization:
        try:
            user = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0})
            user_name = user.get("full_name") or user.get("username") if user else current_user["username"]
            
            new_auth = await create_day_authorization_request(
                user_id=current_user["sub"],
                user_name=user_name,
                date_str=today,
                day_type=day_info["day_type"],
                day_type_display=day_info["day_type_display"],
                entry_id=entry_dict['id'],
                entry_time=current_time_str,
                vacation_request_id=day_info.get("vacation_request_id")
            )
            
            # Atualizar entry com referência à autorização
            await db.time_entries.update_one(
                {"id": entry_dict['id']},
                {"$set": {
                    "day_authorization_id": new_auth["id"],
                    "day_authorization_status": "pending"
                }}
            )
            
            authorization_created = True
            authorization_status_message = f"Pedido de autorização enviado ({day_info['day_type_display']})"
            
        except Exception as e:
            logging.error(f"Erro ao criar pedido de autorização diária: {str(e)}")
    
    # Preparar resposta
    response = {
        "message": "Relógio iniciado",
        "entry": {k: v for k, v in entry_dict.items() if k != '_id'}
    }

    # Aviso de saída antecipada hoje (se existir indisponibilidade)
    try:
        sa = await db.indisponibilidades.find_one(
            {"user_id": current_user["sub"], "data": today, "tipo": "saida_antecipada"},
            {"_id": 0, "hora_inicio": 1, "hora_fim": 1, "regressa_servico": 1, "observacoes": 1},
        )
        if sa:
            response["early_leave_warning"] = {
                "hora_inicio": sa["hora_inicio"],
                "hora_fim": sa["hora_fim"],
                "regressa_servico": bool(sa.get("regressa_servico")),
                "observacoes": sa.get("observacoes"),
            }
    except Exception as e:
        logging.error(f"Erro ao verificar indisponibilidade saída antecipada: {e}")
    
    if day_info["is_special"]:
        response["special_day"] = {
            "type": day_info["day_type"],
            "display": day_info["day_type_display"],
            "authorization_required": True
        }
        
        if authorization_created:
            response["authorization"] = {
                "status": "pending",
                "message": authorization_status_message
            }
        elif day_authorization:
            response["authorization"] = {
                "status": day_authorization.get("status"),
                "message": authorization_status_message
            }
    
    return response

@router.post("/time-entries/end/{entry_id}")
async def end_time_entry(
    entry_id: str, 
    end_data: TimeEntryEnd = TimeEntryEnd(),
    current_user: dict = Depends(get_current_user)
):
    entry = await db.time_entries.find_one({"id": entry_id, "user_id": current_user["sub"]})
    
    if not entry:
        raise HTTPException(status_code=404, detail="Registo não encontrado")
    
    if entry["status"] == "completed":
        raise HTTPException(status_code=400, detail="O registo já foi finalizado")
    
    end_time = normalizar_tempo(get_now_local(end_data.client_time))
    start_time = normalizar_tempo(parse_stored_datetime(entry["start_time"]))
    
    # Merge observations - keep start observations and add end observations if provided
    final_observations = entry.get("observations", "")
    if end_data.observations:
        if final_observations:
            final_observations = f"{final_observations}\n[Ao finalizar]: {end_data.observations}"
        else:
            final_observations = end_data.observations
    
    # Check if period crosses midnight
    start_date = start_time.date()
    end_date = end_time.date()
    
    if start_date != end_date:
        # Split into multiple entries
        entries_created = []
        current_start = start_time
        
        while current_start.date() < end_date:
            # Calculate end of current day (midnight) in the same timezone as the entry
            tz_info = current_start.tzinfo or LISBON_TZ
            midnight = datetime.combine(current_start.date() + timedelta(days=1), datetime.min.time(), tz_info)
            day_seconds = (midnight - current_start).total_seconds()
            
            # Calcular minutos (timestamps já normalizados, sem segundos)
            day_minutes = int(day_seconds / 60)
            day_hours = day_minutes / 60
            day_hours = round(day_hours, 2)
            
            day_date = current_start.date()
            is_ot, ot_reason = is_overtime_day(day_date)
            
            # Calculate hours breakdown using new logic
            hours_breakdown = calculate_hours_breakdown(day_hours, is_ot)
            
            # Create entry for this day
            if current_start == start_time:
                # Update the original entry
                update_data = {
                    "status": "completed",
                    "end_time": midnight.isoformat(),
                    "total_hours": day_hours,
                    "regular_hours": hours_breakdown["regular_hours"],
                    "overtime_hours": hours_breakdown["overtime_hours"],
                    "special_hours": hours_breakdown["special_hours"],
                    "observations": final_observations
                }
                # Adicionar geolocalização de fim se fornecida
                if end_data.end_geo_location:
                    update_data["end_geo_location"] = end_data.end_geo_location
                    
                await db.time_entries.update_one(
                    {"id": entry_id},
                    {"$set": update_data}
                )
                entries_created.append({"date": current_start.strftime("%Y-%m-%d"), "hours": day_hours})
            else:
                # Create new entry for additional day
                new_entry = TimeEntry(
                    user_id=current_user["sub"],
                    username=current_user["username"],
                    date=current_start.strftime("%Y-%m-%d"),
                    start_time=current_start,
                    end_time=midnight,
                    status="completed",
                    observations=f"Continuação do registo anterior",
                    is_overtime_day=is_ot,
                    overtime_reason=ot_reason if is_ot else None,
                    total_hours=day_hours,
                    regular_hours=hours_breakdown["regular_hours"],
                    overtime_hours=hours_breakdown["overtime_hours"],
                    special_hours=hours_breakdown["special_hours"],
                    outside_residence_zone=entry.get("outside_residence_zone", False),
                    location_description=entry.get("location_description")
                )
                new_dict = new_entry.model_dump()
                new_dict['start_time'] = new_dict['start_time'].isoformat()
                new_dict['end_time'] = new_dict['end_time'].isoformat()
                new_dict['created_at'] = new_dict['created_at'].isoformat()
                await db.time_entries.insert_one(new_dict)
                entries_created.append({"date": current_start.strftime("%Y-%m-%d"), "hours": day_hours})
            
            current_start = midnight
        
        # Handle final day
        final_seconds = (end_time - current_start).total_seconds()
        
        # Calcular minutos (timestamps já normalizados, sem segundos)
        final_minutes = int(final_seconds / 60)
        final_hours = final_minutes / 60
        final_hours = round(final_hours, 2)
        
        final_date = end_time.date()
        is_ot, ot_reason = is_overtime_day(final_date)
        
        # Calculate hours breakdown using new logic
        hours_breakdown = calculate_hours_breakdown(final_hours, is_ot)
        
        final_entry = TimeEntry(
            user_id=current_user["sub"],
            username=current_user["username"],
            date=end_time.strftime("%Y-%m-%d"),
            start_time=current_start,
            end_time=end_time,
            status="completed",
            observations=f"Continuação do registo anterior",
            is_overtime_day=is_ot,
            overtime_reason=ot_reason if is_ot else None,
            total_hours=final_hours,
            regular_hours=hours_breakdown["regular_hours"],
            overtime_hours=hours_breakdown["overtime_hours"],
            special_hours=hours_breakdown["special_hours"],
            outside_residence_zone=entry.get("outside_residence_zone", False),
            location_description=entry.get("location_description")
        )
        final_dict = final_entry.model_dump()
        final_dict['start_time'] = final_dict['start_time'].isoformat()
        final_dict['end_time'] = final_dict['end_time'].isoformat()
        final_dict['created_at'] = final_dict['created_at'].isoformat()
        await db.time_entries.insert_one(final_dict)
        entries_created.append({"date": end_time.strftime("%Y-%m-%d"), "hours": final_hours})
        
        total_hours = sum(e["hours"] for e in entries_created)
        
        return {
            "message": "Relógio finalizado e dividido entre dias",
            "total_hours": total_hours,
            "entries_created": entries_created
        }
    else:
        # Single day entry - USAR NOVA LÓGICA
        hours_breakdown = calcular_breakdown_completo(start_time, end_time, start_time.date())
        
        # Calcular total (timestamps já normalizados)
        total_seconds = (end_time - start_time).total_seconds()
        total_minutes = int(total_seconds / 60)
        total_hours = round(total_minutes / 60, 4)
        
        # Preparar dados de actualização
        update_data = {
            "status": "completed",
            "end_time": end_time.isoformat(),
            "total_hours": total_hours,
            "regular_hours": hours_breakdown["regular_hours"],
            "overtime_hours": hours_breakdown["overtime_hours"],
            "special_hours": hours_breakdown["special_hours"],
            "observations": final_observations
        }
        
        # Adicionar geolocalização de fim se fornecida
        if end_data.end_geo_location:
            update_data["end_geo_location"] = end_data.end_geo_location
        
        await db.time_entries.update_one(
            {"id": entry_id},
            {"$set": update_data}
        )

        # === Saída antecipada por ordem da empresa ===
        # Aplica-se apenas quando:
        #  • O dia tem >= 2 picagens completas (ou seja, esta é a saída após
        #    pelo menos uma pausa de almoço — 2ª entrada já feita).
        #  • O total trabalhado no dia (somando todas as entries) < 8h.
        #  • O utilizador marcou explicitamente a checkbox `early_leave_company_order`.
        # O ponto FECHA na mesma; é apenas criado um pedido de autorização ao
        # admin (mesmo fluxo das horas extra) que, se aprovado, credita o tempo
        # em falta para perfazer 8h.
        try:
            if end_data.early_leave_company_order:
                day_str = start_time.strftime("%Y-%m-%d")
                # Buscar todas as entries do dia para este utilizador (incl. a actual)
                day_entries = await db.time_entries.find(
                    {"user_id": current_user["sub"], "date": day_str, "status": "completed"},
                    {"_id": 0, "total_hours": 1},
                ).to_list(50)
                total_day_hours = sum(e.get("total_hours", 0) or 0 for e in day_entries)
                num_completed = len(day_entries)
                EIGHT_HOURS = 8.0

                if num_completed >= 2 and total_day_hours < EIGHT_HOURS:
                    minutes_short = max(0, int(round((EIGHT_HOURS - total_day_hours) * 60)))
                    from notifications_scheduler import create_early_leave_authorization
                    await create_early_leave_authorization(
                        db,
                        user_id=current_user["sub"],
                        entry_id=entry_id,
                        date_str=day_str,
                        worked_hours=total_day_hours,
                        hours_short_minutes=minutes_short,
                    )
                    # Marcar a entrada com a flag (mesmo antes da decisão)
                    await db.time_entries.update_one(
                        {"id": entry_id},
                        {"$set": {
                            "early_leave_company_order": True,
                            "early_leave_status": "pending",
                        }}
                    )
                # Caso não cumpra as condições, ignora silenciosamente a flag
                # (o ponto continua fechado normalmente, sem pedido).
        except Exception as exc:
            logging.warning(f"[early_leave] falha não-bloqueante: {exc}")

        return {
            "message": "Relógio finalizado",
            "total_hours": total_hours,
            "regular_hours": hours_breakdown["regular_hours"],
            "overtime_hours": hours_breakdown["overtime_hours"],
            "special_hours": hours_breakdown["special_hours"]
        }

@router.get("/time-entries/today")
async def get_today_entry(current_user: dict = Depends(get_current_user)):
    today, _ = get_today_local()
    
    # Verificar se já existe entrada hoje com "Fora de Zona de Residência" ativo
    has_outside_zone_today = await db.time_entries.find_one({
        "user_id": current_user["sub"],
        "date": today,
        "outside_residence_zone": True
    }) is not None
    
    # Get active entry (regardless of date)
    active_entry = await db.time_entries.find_one({
        "user_id": current_user["sub"],
        "status": "active"
    }, {"_id": 0})
    
    # SEMPRE buscar entradas completadas do dia (para mostrar total correto)
    today_completed_entries = await db.time_entries.find({
        "user_id": current_user["sub"],
        "date": today,
        "status": "completed"
    }, {"_id": 0}).sort("created_at", 1).to_list(100)
    
    if active_entry:
        # Retornar entrada ativa + entradas completadas do dia
        active_entry["day_has_outside_zone"] = has_outside_zone_today
        active_entry["today_completed_entries"] = today_completed_entries
        return active_entry
    
    # If no active entry, return only completed entries
    if not today_completed_entries:
        return {"entries": [], "has_active": False, "day_has_outside_zone": has_outside_zone_today}
    
    return {
        "entries": today_completed_entries, 
        "has_active": False, 
        "day_has_outside_zone": has_outside_zone_today
    }

@router.get("/admin/realtime-status")
async def get_realtime_status(current_user: dict = Depends(get_current_user)):
    """Get real-time status of all employees for today (admin only)"""
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Apenas administradores")
    
    today, today_date = get_today_local()
    
    # Get all users
    users = await db.users.find({}, {"_id": 0, "id": 1, "username": 1, "full_name": 1}).to_list(1000)
    
    # Get all today's entries (active and completed)
    # Excluir entries virtuais de crédito early_leave (não são picagens reais)
    all_entries = await db.time_entries.find({
        "date": today,
        "$or": [
            {"is_early_leave_credit": {"$exists": False}},
            {"is_early_leave_credit": False},
        ],
    }, {"_id": 0}).to_list(1000)
    
    # Get approved vacations for today
    vacation_users = set()
    vacation_requests = await db.vacation_requests.find({
        "status": "approved"
    }, {"_id": 0}).to_list(1000)
    
    for vac in vacation_requests:
        vac_start = datetime.strptime(vac["start_date"], "%Y-%m-%d").date()
        vac_end = datetime.strptime(vac["end_date"], "%Y-%m-%d").date()
        if vac_start <= today_date <= vac_end:
            vacation_users.add(vac["user_id"])
    
    # Check if today is weekend or holiday
    is_ot_day, ot_reason = is_overtime_day(today_date)
    is_weekend = today_date.weekday() >= 5
    is_holiday = is_ot_day and "Feriado" in (ot_reason or "")
    
    # Build status for each user
    user_statuses = []
    for user in users:
        user_id = user["id"]
        user_entries = [e for e in all_entries if e["user_id"] == user_id]
        
        # Processar TODAS as entradas do dia (formato novo)
        entradas_lista = []
        for entry_db in user_entries:
            if entry_db.get("entries"):
                # Formato novo - múltiplas sub-entradas
                for idx, e in enumerate(entry_db["entries"]):
                    entradas_lista.append({
                        "id": f"{entry_db['id']}_{idx}",
                        "inicio": format_time_from_iso(e["start_time"]) if e.get("start_time") else None,
                        "fim": format_time_from_iso(e["end_time"]) if e.get("end_time") else None,
                        "start_time": e.get("start_time"),
                        "end_time": e.get("end_time"),
                        "estado": "terminada" if e.get("end_time") else "ativa",
                        "geo_location": e.get("geo_location"),
                        "end_geo_location": e.get("end_geo_location")
                    })
            else:
                # Formato antigo - entrada única
                entradas_lista.append({
                    "id": entry_db["id"],
                    "inicio": format_time_from_iso(entry_db["start_time"]) if entry_db.get("start_time") else None,
                    "fim": format_time_from_iso(entry_db["end_time"]) if entry_db.get("end_time") else None,
                    "start_time": entry_db.get("start_time"),
                    "end_time": entry_db.get("end_time"),
                    "estado": "ativa" if entry_db["status"] == "active" else "terminada",
                    "geo_location": entry_db.get("geo_location"),
                    "end_geo_location": entry_db.get("end_geo_location")
                })
        
        # Find active entry
        active_entry = next((e for e in user_entries if e["status"] == "active"), None)
        completed_entries = [e for e in user_entries if e["status"] == "completed"]
        
        status_info = {
            "user_id": user_id,
            "username": user["username"],
            "full_name": user.get("full_name", user["username"]),
            "date": today,
            "entradas": entradas_lista  # ADICIONAR lista de entradas
        }
        
        if active_entry:
            # Currently working - SOMAR todas as entradas
            start_time_active = parse_stored_datetime(active_entry["start_time"])
            
            # Tempo da entrada ativa (em segundos) - use aware datetime for comparison
            now_utc = datetime.now(timezone.utc)
            elapsed_active = (now_utc - start_time_active.astimezone(timezone.utc)).total_seconds()
            
            # Tempo das entradas completadas (converter horas para segundos)
            total_completed = sum(e.get("total_hours", 0) for e in completed_entries) * 3600
            
            # TOTAL = completadas + ativa (em segundos)
            total_elapsed_seconds = total_completed + elapsed_active
            
            # TRUNCAR segundos para minutos
            elapsed_hours = truncar_segundos_para_horas(total_elapsed_seconds)
            
            status_info["status"] = "TRABALHANDO"
            status_info["status_color"] = "green"
            status_info["clock_in_time"] = format_time_from_iso(active_entry["start_time"])
            status_info["elapsed_hours"] = round(elapsed_hours, 2)  # SOMA de tudo
            status_info["outside_residence_zone"] = active_entry.get("outside_residence_zone", False)
            status_info["location"] = active_entry.get("location_description")
            
            # Adicionar geolocalização se disponível
            geo = active_entry.get("geo_location")
            if geo:
                status_info["geo_location"] = {
                    "latitude": geo.get("latitude"),
                    "longitude": geo.get("longitude"),
                    "accuracy": geo.get("accuracy"),
                    "timestamp": geo.get("timestamp"),
                    "address": geo.get("address", {})
                }
        elif completed_entries:
            # Worked today (finished)
            # Excluir entries de crédito early_leave dos cálculos de clock_in/out
            # (não são picagens reais — mas contam para o total de horas).
            real_entries = [e for e in completed_entries if not e.get("is_early_leave_credit")]
            total_hours = sum(e.get("total_hours", 0) for e in completed_entries)

            status_info["status"] = "TRABALHOU"
            status_info["status_color"] = "blue"
            status_info["total_hours"] = round(truncar_horas_para_minutos(total_hours), 2)
            status_info["outside_residence_zone"] = any(e.get("outside_residence_zone", False) for e in completed_entries)

            if real_entries:
                first_entry = min(real_entries, key=lambda x: x.get("start_time") or "")
                last_entry = max(real_entries, key=lambda x: x.get("end_time") or "")
                status_info["clock_in_time"] = format_time_from_iso(first_entry["start_time"])
                status_info["clock_out_time"] = format_time_from_iso(last_entry["end_time"])
                # Adicionar geolocalização da última entrada
                geo = last_entry.get("geo_location")
                if geo:
                    status_info["geo_location"] = {
                        "latitude": geo.get("latitude"),
                        "longitude": geo.get("longitude"),
                        "accuracy": geo.get("accuracy"),
                        "timestamp": geo.get("timestamp"),
                        "address": geo.get("address", {})
                    }
        elif is_weekend:
            # Weekend
            status_info["status"] = "FOLGA"
            status_info["status_color"] = "gray"
        elif is_holiday:
            # Holiday
            status_info["status"] = "FERIADO"
            status_info["status_color"] = "amber"
            status_info["holiday_name"] = ot_reason
        elif user_id in vacation_users:
            # On vacation
            status_info["status"] = "FÉRIAS"
            status_info["status_color"] = "purple"
        else:
            # Absence on workday
            status_info["status"] = "FALTA"
            status_info["status_color"] = "red"
        
        user_statuses.append(status_info)
    
    return {
        "date": today,
        "is_weekend": is_weekend,
        "is_holiday": is_holiday,
        "holiday_name": ot_reason if is_holiday else None,
        "users": user_statuses
    }


@router.get("/admin/user-locations/{user_id}")
async def get_user_location_history(
    user_id: str,
    start_date: str = None,
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get location history for a specific user (admin only)"""
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Apenas administradores")
    
    # Definir datas
    if not start_date:
        start_date = (get_now_local() - timedelta(days=30)).strftime("%Y-%m-%d")
    if not end_date:
        end_date = get_now_local().strftime("%Y-%m-%d")
    
    # Buscar entradas com geolocalização
    entries = await db.time_entries.find({
        "user_id": user_id,
        "date": {"$gte": start_date, "$lte": end_date},
        "geo_location": {"$exists": True, "$ne": None}
    }, {"_id": 0}).to_list(1000)
    
    # Obter dados do utilizador
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "full_name": 1, "username": 1})
    
    locations = []
    for entry in entries:
        geo = entry.get("geo_location")
        if geo and geo.get("latitude") and geo.get("longitude"):
            locations.append({
                "id": entry["id"],
                "date": entry["date"],
                "latitude": geo.get("latitude"),
                "longitude": geo.get("longitude"),
                "accuracy": geo.get("accuracy"),
                "timestamp": geo.get("timestamp") or entry.get("start_time"),
                "address": geo.get("address", {}),
                "type": "Entrada" if entry.get("status") == "active" else "Registo",
                "outside_residence_zone": entry.get("outside_residence_zone", False),
                "location_description": entry.get("location_description")
            })
    
    # Ordenar por data/timestamp
    locations.sort(key=lambda x: (x["date"], x.get("timestamp", "")), reverse=True)
    
    return {
        "user_id": user_id,
        "user_name": user.get("full_name") if user else user_id,
        "username": user.get("username") if user else "",
        "start_date": start_date,
        "end_date": end_date,
        "locations": locations,
        "total_count": len(locations)
    }


@router.get("/admin/all-current-locations")
async def get_all_current_locations(current_user: dict = Depends(get_current_user)):
    """Get current/last known locations of all users (admin only)"""
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Apenas administradores")
    
    today, _ = get_today_local()
    
    # Buscar todas as entradas de hoje com geolocalização
    entries = await db.time_entries.find({
        "date": today,
        "geo_location": {"$exists": True, "$ne": None}
    }, {"_id": 0}).to_list(1000)
    
    # Obter todos os utilizadores
    users = await db.users.find({}, {"_id": 0, "id": 1, "username": 1, "full_name": 1}).to_list(1000)
    users_map = {u["id"]: u for u in users}
    
    # Agrupar por utilizador (pegar a última entrada de cada)
    user_locations = {}
    for entry in entries:
        user_id = entry["user_id"]
        geo = entry.get("geo_location")
        
        if geo and geo.get("latitude") and geo.get("longitude"):
            entry_time = entry.get("start_time", "")
            
            # Guardar apenas a entrada mais recente de cada utilizador
            if user_id not in user_locations or entry_time > user_locations[user_id].get("timestamp", ""):
                user = users_map.get(user_id, {})
                is_active = entry.get("status") == "active"
                
                user_locations[user_id] = {
                    "user_id": user_id,
                    "userName": user.get("full_name") or user.get("username") or user_id,
                    "username": user.get("username", ""),
                    "latitude": geo.get("latitude"),
                    "longitude": geo.get("longitude"),
                    "accuracy": geo.get("accuracy"),
                    "timestamp": entry.get("start_time"),
                    "address": geo.get("address", {}).get("formatted") or geo.get("address", {}).get("city"),
                    "type": "A trabalhar" if is_active else "Último registo",
                    "color": "green" if is_active else "blue",
                    "is_active": is_active,
                    "outside_residence_zone": entry.get("outside_residence_zone", False)
                }
    
    return {
        "date": today,
        "locations": list(user_locations.values()),
        "total_users": len(user_locations)
    }

@router.get("/time-entries/my-realtime-status")
async def get_my_realtime_status(current_user: dict = Depends(get_current_user)):
    """Get user's own real-time status for today with entry details"""
    today, today_date = get_today_local()
    hora_servidor = get_now_local().strftime("%H:%M")
    user_id = current_user["sub"]
    
    # Get user's today entries
    # Excluir entries virtuais de crédito early_leave (não são picagens reais)
    entries_db = await db.time_entries.find({
        "user_id": user_id,
        "date": today,
        "$or": [
            {"is_early_leave_credit": {"$exists": False}},
            {"is_early_leave_credit": False},
        ],
    }, {"_id": 0}).to_list(1000)
    
    # Process entries
    entradas = []
    for entry_db in entries_db:
        if entry_db.get("entries"):
            # Formato novo - múltiplas entradas
            for idx, e in enumerate(entry_db["entries"]):
                entrada = {
                    "id": f"{entry_db['id']}_{idx}",
                    "inicio": format_time_from_iso(e["start_time"]) if e.get("start_time") else None,
                    "fim": format_time_from_iso(e["end_time"]) if e.get("end_time") else None,
                    "estado": "terminada" if e.get("end_time") else "ativa"
                }
                entradas.append(entrada)
        else:
            # Formato antigo
            entrada = {
                "id": entry_db["id"],
                "inicio": format_time_from_iso(entry_db["start_time"]) if entry_db.get("start_time") else None,
                "fim": format_time_from_iso(entry_db["end_time"]) if entry_db.get("end_time") else None,
                "estado": "ativa" if entry_db["status"] == "active" else "terminada"
            }
            entradas.append(entrada)
    
    # Determine status
    has_active = any(e["estado"] == "ativa" for e in entradas)
    
    if has_active:
        estado = "trabalho_iniciado"
    elif entradas:
        estado = "terminou"
    else:
        # Check vacation/weekend/holiday
        vacation_requests = await db.vacation_requests.find({
            "user_id": user_id,
            "status": "approved"
        }, {"_id": 0}).to_list(100)
        
        in_vacation = False
        for vac in vacation_requests:
            vac_start = datetime.strptime(vac["start_date"], "%Y-%m-%d").date()
            vac_end = datetime.strptime(vac["end_date"], "%Y-%m-%d").date()
            if vac_start <= today_date <= vac_end:
                in_vacation = True
                break
        
        is_ot_day, ot_reason = is_overtime_day(today_date)
        is_weekend = today_date.weekday() >= 5
        is_holiday = is_ot_day and "Feriado" in (ot_reason or "")
        
        if in_vacation:
            estado = "ferias"
        elif is_weekend:
            estado = "folga"
        elif is_holiday:
            estado = "feriado"
        else:
            estado = "falta"
    
    return {
        "id": user_id,
        "nome": current_user.get("full_name") or current_user.get("username"),
        "estado": estado,
        "hora_servidor": hora_servidor,
        "entradas": entradas
    }


# ============ Time Entry Reports Routes ============

@router.get("/time-entries/list")
async def list_time_entries(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_id: Optional[str] = None,  # Admin can view other users
    current_user: dict = Depends(get_current_user)
):
    """
    Lista entradas agrupadas por dia com total de horas somado
    Admin can pass user_id to view other users' data
    """
    # Determine which user's data to fetch
    target_user_id = current_user["sub"]  # Default to current user
    
    # If user_id provided and current user is admin, allow viewing other users
    if user_id and current_user.get("is_admin"):
        target_user_id = user_id
    
    query = {"user_id": target_user_id, "status": "completed"}
    
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        query["date"] = {"$gte": start_date}
    elif end_date:
        query["date"] = {"$lte": end_date}
    
    # Get all entries
    all_entries = await db.time_entries.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    # Group by date and aggregate
    daily_entries = {}
    for entry in all_entries:
        date = entry["date"]
        if date not in daily_entries:
            daily_entries[date] = {
                "date": date,
                "entries": [],
                "total_hours": 0,
                "regular_hours": 0,
                "overtime_hours": 0,
                "is_overtime_day": entry.get("is_overtime_day", False),
                "overtime_reason": entry.get("overtime_reason"),
                "outside_residence_zone": entry.get("outside_residence_zone", False),
                "location_description": entry.get("location_description"),
                "observations": []
            }
        
        daily_entries[date]["entries"].append(entry)
        daily_entries[date]["total_hours"] += entry.get("total_hours") or 0
        daily_entries[date]["regular_hours"] += entry.get("regular_hours") or 0
        daily_entries[date]["overtime_hours"] += entry.get("overtime_hours") or 0
        
        # Collect observations
        if entry.get("observations"):
            daily_entries[date]["observations"].append(entry["observations"])
    
    # Convert to list - recalcular minutos a partir dos timestamps
    result = []
    for date_key in sorted(daily_entries.keys(), reverse=True):
        day_data = daily_entries[date_key]
        # Recalcular total a partir dos timestamps (sem erros de arredondamento)
        total_min = calcular_minutos_de_entradas(day_data["entries"])
        day_data["total_hours"] = round(total_min / 60, 2)
        day_data["regular_hours"] = round(truncar_horas_para_minutos(day_data["regular_hours"]), 2)
        day_data["overtime_hours"] = round(truncar_horas_para_minutos(day_data["overtime_hours"]), 2)
        day_data["observations"] = " | ".join(day_data["observations"]) if day_data["observations"] else None
        
        # Get first and last entry times for the day
        day_data["start_time"] = day_data["entries"][0]["start_time"]
        day_data["end_time"] = day_data["entries"][-1]["end_time"]
        
        # Keep detailed entries for reference
        day_data["entry_count"] = len(day_data["entries"])
        
        result.append(day_data)
    
    return result

@router.get("/time-entries/overtime")
async def get_overtime_summary(current_user: dict = Depends(get_current_user)):
    """Retorna resumo de horas extras do período de faturação atual (26-25)"""
    from datetime import date
    
    # Get current billing period (26th to 25th)
    today = date.today()
    start_date, end_date = get_billing_period_dates(today)
    
    # Convert dates to strings for MongoDB query
    start_date_str = start_date.isoformat() if hasattr(start_date, 'isoformat') else start_date
    end_date_str = end_date.isoformat() if hasattr(end_date, 'isoformat') else end_date
    
    # Filter entries within current billing period
    entries = await db.time_entries.find({
        "user_id": current_user["sub"],
        "status": "completed",
        "date": {"$gte": start_date_str, "$lte": end_date_str}
    }, {"_id": 0}).to_list(1000)
    
    total_overtime = sum(entry.get("overtime_hours", 0) for entry in entries)
    total_special = sum(entry.get("special_hours", 0) for entry in entries)
    overtime_entries = [e for e in entries if e.get("is_overtime_day", False)]
    
    return {
        "total_overtime_hours": round(truncar_horas_para_minutos(total_overtime), 2),
        "total_special_hours": round(truncar_horas_para_minutos(total_special), 2),
        "total_overtime_days": len(overtime_entries),
        "billing_period_start": start_date_str,
        "billing_period_end": end_date_str,
        "entries": overtime_entries
    }

@router.get("/time-entries/reports")
async def get_reports(
    period: str = "billing",  # billing, week, month
    current_user: dict = Depends(get_current_user)
):
    now = get_now_local()
    
    if period == "billing":
        # Período de faturação: 26 a 25
        start_dt, end_dt = get_billing_period_dates(now.date())
        start_date = start_dt.strftime("%Y-%m-%d")
        end_date = end_dt.strftime("%Y-%m-%d")
    elif period == "week":
        start_date = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        end_date = now.strftime("%Y-%m-%d")
    else:  # month
        start_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        end_date = now.strftime("%Y-%m-%d")
    
    entries = await db.time_entries.find({
        "user_id": current_user["sub"],
        "date": {"$gte": start_date, "$lte": end_date},
        "status": "completed"
    }, {"_id": 0}).to_list(1000)
    
    # Calcular totais a partir dos timestamps (sem erros de arredondamento)
    total_minutes_all = calcular_minutos_de_entradas(entries)
    total_hours = total_minutes_all / 60
    regular_hours = sum(entry.get("regular_hours") or 0 for entry in entries)
    overtime_hours = sum(entry.get("overtime_hours") or 0 for entry in entries)
    special_hours = sum(entry.get("special_hours") or 0 for entry in entries)
    total_days = len(entries)
    
    avg_hours = round(total_hours / total_days, 2) if total_days > 0 else 0
    
    return {
        "period": period,
        "start_date": start_date,
        "end_date": end_date,
        "total_hours": round(total_hours, 2),
        "regular_hours": round(truncar_horas_para_minutos(regular_hours), 2),
        "overtime_hours": round(truncar_horas_para_minutos(overtime_hours), 2),
        "special_hours": round(truncar_horas_para_minutos(special_hours), 2),
        "total_days": total_days,
        "avg_hours_per_day": avg_hours,
        "entries": entries
    }

@router.get("/admin/users/list")
async def list_all_users(current_user: dict = Depends(get_current_admin)):
    """List all users (admin only) for reports"""
    users = await db.users.find(
        {},
        {"_id": 0, "id": 1, "username": 1, "full_name": 1, "email": 1}
    ).sort("full_name", 1).to_list(1000)
    
    return users

@router.get("/time-entries/reports/custom-range")
async def get_custom_range_report(
    start_date_str: str,
    end_date_str: str,
    user_id: Optional[str] = None,  # Admin can view other users
    current_user: dict = Depends(get_current_user)
):
    """
    Relatório personalizado por intervalo de datas
    Admin can pass user_id to view other users' reports
    Params: start_date_str and end_date_str in format YYYY-MM-DD
    """
    # Parse dates
    try:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de data inválido. Use YYYY-MM-DD")
    
    # Validate date range
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="Data inicial não pode ser posterior à data final")
    
    # Check if range is too large (max 365 days)
    if (end_date - start_date).days > 365:
        raise HTTPException(status_code=400, detail="Intervalo máximo de 365 dias")
    
    # Determine which user's data to fetch
    target_user_id = current_user["sub"]  # Default to current user
    if user_id and current_user.get("is_admin"):
        target_user_id = user_id
    
    # Get user data for report
    user = await db.users.find_one({"id": target_user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    
    username = user.get("username", "user")
    full_name = user.get("full_name", username)
    
    # Get all time entries for the period
    entries_by_date = {}
    entries = await db.time_entries.find({
        "user_id": target_user_id,
        "date": {"$gte": start_date.strftime("%Y-%m-%d"), "$lte": end_date.strftime("%Y-%m-%d")},
        "status": "completed"
    }, {"_id": 0}).sort("date", 1).to_list(1000)
    
    for entry in entries:
        date_key = entry["date"]
        if date_key not in entries_by_date:
            entries_by_date[date_key] = []
        entries_by_date[date_key].append(entry)
    
    # Get approved vacation requests for the period
    vacation_dates = set()
    vacation_requests = await db.vacation_requests.find({
        "user_id": target_user_id,
        "status": "approved"
    }, {"_id": 0}).to_list(1000)
    
    for vac in vacation_requests:
        vac_start = datetime.strptime(vac["start_date"], "%Y-%m-%d").date()
        vac_end = datetime.strptime(vac["end_date"], "%Y-%m-%d").date()
        current_vac_date = vac_start
        while current_vac_date <= vac_end:
            if start_date <= current_vac_date <= end_date:
                vacation_dates.add(current_vac_date.strftime("%Y-%m-%d"))
            current_vac_date += timedelta(days=1)
    
    # Get manual day status overrides
    manual_statuses = {}
    status_overrides = await db.day_status_overrides.find({
        "user_id": target_user_id,
        "date": {
            "$gte": start_date.strftime("%Y-%m-%d"),
            "$lte": end_date.strftime("%Y-%m-%d")
        }
    }, {"_id": 0}).to_list(1000)
    
    for override in status_overrides:
        manual_statuses[override["date"]] = override["status"]
    
    # Faltas v2 — carregar do novo helper (fonte partilhada com /admin/absences/v2/*)
    from routes.absences_v2 import fetch_absences_for_month
    absences_by_date = await fetch_absences_for_month(
        target_user_id,
        start_date.strftime("%Y-%m-%d"),
        end_date.strftime("%Y-%m-%d"),
    )

    # Build daily records for entire period
    daily_records = []
    current_date = start_date
    total_worked_minutes = 0
    total_overtime_minutes = 0
    total_special_minutes = 0
    days_with_meal_allowance = 0
    days_with_travel_allowance = 0
    
    while current_date <= end_date:
        date_str = current_date.strftime("%Y-%m-%d")
        day_entries = entries_by_date.get(date_str, [])
        
        is_weekend = current_date.weekday() >= 5
        is_ot_day, ot_reason = is_overtime_day(current_date)
        is_holiday = is_ot_day and "Feriado" in (ot_reason or "")
        
        day_data = {
            "date": date_str,
            "day_of_week": current_date.strftime("%A"),
            "day_number": current_date.day,
            "is_weekend": is_weekend,
            "is_holiday": is_holiday,
            "holiday_name": ot_reason if is_holiday else None
        }
        
        if day_entries:
            # Calcular total de minutos do dia a partir dos timestamps (sem segundos)
            total_minutos_dia = calcular_minutos_de_entradas(day_entries)
            total_hours = total_minutos_dia / 60
            
            # RECALCULAR breakdown baseado no TOTAL do dia
            from hours_calculator import calcular_horas_dia, feriados_portugueses, minutos_para_horas
            
            dia_semana_py = current_date.weekday()
            dia_semana_js = (dia_semana_py + 1) % 7
            ano = current_date.year
            feriados = feriados_portugueses(ano)
            is_feriado = current_date in feriados
            
            breakdown_min = calcular_horas_dia(total_minutos_dia, dia_semana_js, is_feriado)
            
            overtime_hours = minutos_para_horas(breakdown_min["horas_extra"])
            special_hours = minutos_para_horas(breakdown_min["horas_especial"])
            
            outside_zone = any(e.get("outside_residence_zone", False) for e in day_entries)
            location = next((e.get("location_description") for e in day_entries if e.get("location_description")), None)
            
            day_data["status"] = "TRABALHADO"
            day_data["entries"] = [{
                "id": e.get("id"),
                "start_time": e.get("start_time"),
                "end_time": e.get("end_time"),
                "total_hours": e.get("total_hours"),
                "observations": e.get("observations")
            } for e in sorted(day_entries, key=lambda x: x.get("start_time") or "")]
            day_data["total_hours"] = round(total_hours, 2)
            day_data["overtime_hours"] = round(overtime_hours, 2)
            day_data["special_hours"] = round(special_hours, 2)
            day_data["outside_residence_zone"] = outside_zone
            day_data["location"] = location
            
            # Payment calculation — novas regras Feb/2026 (SA binário, AC tiered)
            payment_type, payment_value = calcular_sa_ac(total_hours, outside_zone)
            day_data["payment_type"] = payment_type
            day_data["payment_value"] = payment_value
            if payment_type == "Ajuda de Custos":
                days_with_travel_allowance += 1
            elif payment_type == "Subsídio de Alimentação":
                days_with_meal_allowance += 1
            
            total_worked_minutes += total_minutos_dia
            total_overtime_minutes += breakdown_min["horas_extra"]
            total_special_minutes += breakdown_min["horas_especial"]
        else:
            # Not worked - determine status
            manual = manual_statuses.get(date_str)
            # Regra: nunca marcar FÉRIAS em fim-de-semana ou feriado
            if manual == "FÉRIAS" and (is_weekend or is_holiday):
                manual = None
            if manual:
                day_data["status"] = manual
            elif is_weekend:
                day_data["status"] = "FOLGA"
            elif is_holiday:
                day_data["status"] = "FERIADO"
            elif date_str in vacation_dates:
                day_data["status"] = "FÉRIAS"
            else:
                day_data["status"] = "SEM REGISTO"
            
            day_data["entries"] = []
            day_data["total_hours"] = 0
            day_data["overtime_hours"] = 0
            day_data["special_hours"] = 0
            day_data["payment_type"] = None
            day_data["payment_value"] = 0
        
        # Injectar informação de falta (novo sistema v2). Fonte partilhada
        # com /admin/absences/v2/* — mesma lógica de cor/observações.
        abs_info = absences_by_date.get(date_str)
        if abs_info:
            day_data["absence"] = abs_info
            if not abs_info.get("is_partial") and float(abs_info.get("hours") or 0) >= 7.5:
                if abs_info["state"] == "injustificada":
                    day_data["status"] = "FALTA INJUSTIFICADA"
                elif abs_info["state"] == "aprovada":
                    day_data["status"] = "FALTA JUSTIFICADA"
                elif abs_info["state"] == "rejeitada":
                    day_data["status"] = "JUSTIFICAÇÃO REJEITADA"
                elif abs_info["state"] == "pendente_documento":
                    day_data["status"] = "PENDENTE DOCUMENTO"
                elif abs_info["state"] == "pendente":
                    day_data["status"] = "FALTA PENDENTE"
            prev_obs = (day_data.get("observations") or "").strip()
            new_obs = abs_info.get("obs") or ""
            if prev_obs and new_obs and new_obs not in prev_obs:
                day_data["observations"] = f"{prev_obs} · {new_obs}"
            elif new_obs:
                day_data["observations"] = new_obs
        
        daily_records.append(day_data)
        current_date += timedelta(days=1)
    
    # Calculate vacation days used up to the end date
    vacation_days_used = 0
    all_vacation_requests = await db.vacation_requests.find({
        "user_id": target_user_id,
        "status": "approved"
    }, {"_id": 0}).to_list(1000)
    
    for vac in all_vacation_requests:
        vac_start = datetime.strptime(vac["start_date"], "%Y-%m-%d").date()
        vac_end = datetime.strptime(vac["end_date"], "%Y-%m-%d").date()
        actual_end = min(vac_end, end_date)
        if vac_start <= end_date:
            current = vac_start
            while current <= actual_end:
                if current.weekday() < 5:
                    vacation_days_used += 1
                current += timedelta(days=1)
    
    vacation_entitlement = user.get("vacation_days_per_year", 22)
    vacation_days_available = vacation_entitlement - vacation_days_used
    
    return {
        "username": username,
        "full_name": full_name,
        "start_date": start_date.strftime("%Y-%m-%d"),
        "end_date": end_date.strftime("%Y-%m-%d"),
        "report_type": "custom_range",
        "daily_records": daily_records,
        "summary": {
            "total_worked_hours": round(total_worked_minutes / 60, 2),
            "total_overtime_hours": round(total_overtime_minutes / 60, 2),
            "total_special_hours": round(total_special_minutes / 60, 2),
            "days_with_meal_allowance": days_with_meal_allowance,
            "days_with_travel_allowance": days_with_travel_allowance,
            "total_meal_allowance_value": days_with_meal_allowance * 10.0,
            "total_travel_allowance_value": days_with_travel_allowance * 50.0,
            "vacation_days_used": vacation_days_used,
            "vacation_days_available": vacation_days_available,
            "vacation_entitlement": vacation_entitlement
        }
    }

@router.get("/time-entries/reports/monthly-detailed")
async def get_monthly_detailed_report(
    month: Optional[int] = None,
    year: Optional[int] = None,
    user_id: Optional[str] = None,  # Admin can view other users
    current_user: dict = Depends(get_current_user)
):
    """
    Relatório mensal detalhado para contabilidade (26 do mês anterior até 25)
    Admin can pass user_id to view other users' reports
    """
    now = get_now_local()
    
    # Use current month/year if not provided
    if not month or not year:
        month = now.month
        year = now.year
    
    # Determine which user's data to fetch
    target_user_id = current_user["sub"]  # Default to current user
    if user_id and current_user.get("is_admin"):
        target_user_id = user_id
    
    # Get user data for report
    user = await db.users.find_one({"id": target_user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    
    username = user.get("username", "user")
    full_name = user.get("full_name", username)
    
    # Get billing period dates (26th to 25th)
    start_date, end_date = get_billing_period_dates(date(year, month, 1))
    
    # Get all time entries for the period
    entries_by_date = {}
    entries = await db.time_entries.find({
        "user_id": target_user_id,
        "date": {"$gte": start_date.strftime("%Y-%m-%d"), "$lte": end_date.strftime("%Y-%m-%d")},
        "status": "completed"
    }, {"_id": 0}).sort("date", 1).to_list(1000)
    
    for entry in entries:
        date_key = entry["date"]
        if date_key not in entries_by_date:
            entries_by_date[date_key] = []
        entries_by_date[date_key].append(entry)
    
    # Get approved vacation requests for the period
    vacation_dates = set()
    vacation_requests = await db.vacation_requests.find({
        "user_id": target_user_id,
        "status": "approved"
    }, {"_id": 0}).to_list(1000)
    
    for vac in vacation_requests:
        vac_start = datetime.strptime(vac["start_date"], "%Y-%m-%d").date()
        vac_end = datetime.strptime(vac["end_date"], "%Y-%m-%d").date()
        current_vac_date = vac_start
        while current_vac_date <= vac_end:
            # Only add if within our reporting period
            if start_date <= current_vac_date <= end_date:
                vacation_dates.add(current_vac_date.strftime("%Y-%m-%d"))
            current_vac_date += timedelta(days=1)
    
    # Get manual day status overrides (admin-set statuses)
    manual_statuses = {}
    status_overrides = await db.day_status_overrides.find({
        "user_id": target_user_id,
        "date": {
            "$gte": start_date.strftime("%Y-%m-%d"),
            "$lte": end_date.strftime("%Y-%m-%d")
        }
    }, {"_id": 0}).to_list(1000)
    
    for override in status_overrides:
        manual_statuses[override["date"]] = override["status"]
    
    # Build daily records for entire period
    daily_records = []
    current_date = start_date
    total_worked_minutes_m = 0
    total_overtime_minutes_m = 0
    total_special_minutes_m = 0
    days_with_meal_allowance = 0
    days_with_travel_allowance = 0
    
    dias_semana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
    
    # Faltas v2 — carregar do novo helper (fonte partilhada com /admin/absences/v2/*)
    from routes.absences_v2 import fetch_absences_for_month
    absences_by_date = await fetch_absences_for_month(
        target_user_id,
        start_date.strftime("%Y-%m-%d"),
        end_date.strftime("%Y-%m-%d"),
    )
    
    while current_date <= end_date:
        date_str = current_date.strftime("%Y-%m-%d")
        day_of_week = dias_semana[current_date.weekday()]
        is_weekend = current_date.weekday() >= 5
        is_ot_day, ot_reason = is_overtime_day(current_date)
        is_holiday = is_ot_day and "Feriado" in (ot_reason or "")
        
        day_data = {
            "date": date_str,
            "day_of_week": day_of_week,
            "day_number": current_date.day,
            "is_weekend": is_weekend,
            "is_holiday": is_holiday,
            "holiday_name": ot_reason if is_holiday else None
        }
        
        # Check if worked this day
        if date_str in entries_by_date:
            day_entries = entries_by_date[date_str]
            
            # Calcular total de minutos do dia a partir dos timestamps (sem segundos)
            total_minutos_dia = calcular_minutos_de_entradas(day_entries)
            total_hours = total_minutos_dia / 60
            
            # RECALCULAR breakdown baseado no TOTAL do dia
            from hours_calculator import calcular_horas_dia, feriados_portugueses, minutos_para_horas
            
            dia_semana_py = current_date.weekday()
            dia_semana_js = (dia_semana_py + 1) % 7
            ano = current_date.year
            feriados = feriados_portugueses(ano)
            is_feriado = current_date in feriados
            
            breakdown_min = calcular_horas_dia(total_minutos_dia, dia_semana_js, is_feriado)
            
            overtime_hours = minutos_para_horas(breakdown_min["horas_extra"])
            special_hours = minutos_para_horas(breakdown_min["horas_especial"])
            
            # Check payment type
            outside_zone = any(e.get("outside_residence_zone", False) for e in day_entries)
            location = next((e.get("location_description") for e in day_entries if e.get("location_description")), None)
            
            day_data["status"] = "TRABALHADO"
            day_data["entries"] = [{
                "id": e.get("id"),  # IMPORTANTE: incluir o ID para edição
                "start_time": e.get("start_time"),
                "end_time": e.get("end_time"),
                "total_hours": e.get("total_hours"),
                "observations": e.get("observations"),
                "is_early_leave_credit": e.get("is_early_leave_credit", False),
                "authorized_by": e.get("authorized_by"),
            } for e in sorted(day_entries, key=lambda x: x.get("start_time") or "")]
            day_data["total_hours"] = round(total_hours, 2)
            day_data["overtime_hours"] = round(overtime_hours, 2)
            day_data["special_hours"] = round(special_hours, 2)
            day_data["outside_residence_zone"] = outside_zone
            day_data["location"] = location
            
            # Payment calculation — novas regras Feb/2026 (SA binário, AC tiered)
            payment_type, payment_value = calcular_sa_ac(total_hours, outside_zone)
            day_data["payment_type"] = payment_type
            day_data["payment_value"] = payment_value
            if payment_type == "Ajuda de Custos":
                days_with_travel_allowance += 1
            elif payment_type == "Subsídio de Alimentação":
                days_with_meal_allowance += 1
            
            total_worked_minutes_m += total_minutos_dia
            total_overtime_minutes_m += breakdown_min["horas_extra"]
            total_special_minutes_m += breakdown_min["horas_especial"]
        else:
            # Not worked - determine status
            # First check if admin set a manual status
            manual = manual_statuses.get(date_str)
            # Regra: nunca marcar FÉRIAS em fim-de-semana ou feriado
            if manual == "FÉRIAS" and (is_weekend or is_holiday):
                manual = None
            if manual:
                day_data["status"] = manual
            elif is_weekend:
                day_data["status"] = "FOLGA"
            elif is_holiday:
                day_data["status"] = "FERIADO"
            elif date_str in vacation_dates:
                day_data["status"] = "FÉRIAS"
            else:
                # Dia útil sem registo — mostra "Sem Registo" (só passa a FALTA
                # quando o admin/utilizador criar um pedido em /absences).
                day_data["status"] = "SEM REGISTO"
            
            day_data["entries"] = []
            day_data["total_hours"] = 0
            day_data["overtime_hours"] = 0
            day_data["special_hours"] = 0
            day_data["payment_type"] = None
            day_data["payment_value"] = 0
        
        # Injectar informação de falta (novo sistema v2). Fonte partilhada
        # com /admin/absences/v2/* — mesma lógica de cor/observações.
        abs_info = absences_by_date.get(date_str)
        if abs_info:
            day_data["absence"] = abs_info
            if not abs_info.get("is_partial") and float(abs_info.get("hours") or 0) >= 7.5:
                if abs_info["state"] == "injustificada":
                    day_data["status"] = "FALTA INJUSTIFICADA"
                elif abs_info["state"] == "aprovada":
                    day_data["status"] = "FALTA JUSTIFICADA"
                elif abs_info["state"] == "rejeitada":
                    day_data["status"] = "JUSTIFICAÇÃO REJEITADA"
                elif abs_info["state"] == "pendente_documento":
                    day_data["status"] = "PENDENTE DOCUMENTO"
                elif abs_info["state"] == "pendente":
                    day_data["status"] = "FALTA PENDENTE"
            prev_obs = (day_data.get("observations") or "").strip()
            new_obs = abs_info.get("obs") or ""
            if prev_obs and new_obs and new_obs not in prev_obs:
                day_data["observations"] = f"{prev_obs} · {new_obs}"
            elif new_obs:
                day_data["observations"] = new_obs
        
        daily_records.append(day_data)
        current_date += timedelta(days=1)
    
    # Buscar dados de férias — usa o NOVO motor legal (vacation_engine).
    # Fonte única de verdade partilhada com /vacations e /admin/vacations/*.
    # Import tardio para evitar ciclos.
    from routes.vacations_v2 import _fetch_saldo_ctx, _breakdown_from_ctx
    vacation_breakdown_v2 = None  # dict com year_breakdown legal
    try:
        cfg, approved, cancelled_set = await _fetch_saldo_ctx(target_user_id)
        vb = _breakdown_from_ctx(cfg, approved, cancelled_set, include_after=0)
        if not vb.get("error"):
            vacation_breakdown_v2 = vb
    except Exception:
        logging.exception("Erro a calcular férias (novo motor) para relatório mensal")

    if vacation_breakdown_v2 and vacation_breakdown_v2.get("year_breakdown"):
        yb = vacation_breakdown_v2["year_breakdown"]
        # Totais para retrocompat de campos legacy (para não partir clientes antigos)
        vacation_entitlement = sum(y["dias_vencidos"] for y in yb)
        vacation_days_used = sum(y["dias_gozados"] for y in yb)
        vacation_days_available = sum(y["dias_disponiveis"] for y in yb)
    else:
        vacation_entitlement = user.get("vacation_days_per_year", 22)
        vacation_days_used = 0
        vacation_days_available = vacation_entitlement
    
    return {
        "username": username,
        "full_name": full_name,
        "start_date": start_date.strftime("%Y-%m-%d"),
        "end_date": end_date.strftime("%Y-%m-%d"),
        "month": month,
        "year": year,
        "daily_records": daily_records,
        "summary": {
            "total_worked_hours": round(total_worked_minutes_m / 60, 2),
            "total_overtime_hours": round(total_overtime_minutes_m / 60, 2),
            "total_special_hours": round(total_special_minutes_m / 60, 2),
            "days_with_meal_allowance": days_with_meal_allowance,
            "days_with_travel_allowance": days_with_travel_allowance,
            "total_meal_allowance_value": days_with_meal_allowance * 10.0,
            "total_travel_allowance_value": days_with_travel_allowance * 50.0,
            # Legacy (mantido só para clientes antigos — a tabela nova usa `vacation_breakdown_v2`)
            "vacation_days_used": vacation_days_used,
            "vacation_days_available": vacation_days_available,
            "vacation_entitlement": vacation_entitlement,
            # NOVO motor — fonte única partilhada com o sistema de férias
            "vacation_breakdown_v2": vacation_breakdown_v2,
        }
    }

@router.get("/time-entries/reports/monthly-pdf")
async def download_monthly_pdf_report(
    month: Optional[int] = None,
    year: Optional[int] = None,
    user_id: Optional[str] = None,  # Admin can view other users
    current_user: dict = Depends(get_current_user)
):
    """
    Generate and download PDF monthly detailed report for accounting
    Admin can pass user_id to download other users' reports
    """
    now = get_now_local()
    
    # Use current month/year if not provided
    if not month or not year:
        month = now.month
        year = now.year
    
    # Determine which user's data to fetch
    target_user_id = current_user["sub"]  # Default to current user
    if user_id and current_user.get("is_admin"):
        target_user_id = user_id
    
    logging.info(f"Gerando PDF para user_id={target_user_id}, month={month}, year={year}")

    
    # Get user data for report
    user = await db.users.find_one({"id": target_user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    
    username = user.get("username", "user")
    full_name = user.get("full_name", username)
    
    # Get the detailed monthly report data (reuse the same logic)
    start_date, end_date = get_billing_period_dates(date(year, month, 1))
    
    # Get all time entries for the period
    entries_by_date = {}
    entries = await db.time_entries.find({
        "user_id": target_user_id,
        "date": {"$gte": start_date.strftime("%Y-%m-%d"), "$lte": end_date.strftime("%Y-%m-%d")},
        "status": "completed"
    }, {"_id": 0}).sort("date", 1).to_list(1000)
    
    for entry in entries:
        date_key = entry["date"]
        if date_key not in entries_by_date:
            entries_by_date[date_key] = []
        entries_by_date[date_key].append(entry)
    
    # Get approved vacation requests for the period
    vacation_dates = set()
    vacation_requests = await db.vacation_requests.find({
        "user_id": target_user_id,
        "status": "approved"
    }, {"_id": 0}).to_list(1000)
    
    for vac_req in vacation_requests:
        vac_start = datetime.strptime(vac_req["start_date"], "%Y-%m-%d").date()
        vac_end = datetime.strptime(vac_req["end_date"], "%Y-%m-%d").date()
        current_vac_date = vac_start
        while current_vac_date <= vac_end:
            # Only add if within our reporting period
            if start_date <= current_vac_date <= end_date:
                vacation_dates.add(current_vac_date.strftime("%Y-%m-%d"))
            current_vac_date += timedelta(days=1)
    
    # Buscar TODAS as justificações para incluir nas observações do dia
    # Inclui férias, folgas, cancelamentos (vacation_requests) e faltas (absences)
    justifications_map = {}
    
    # Buscar vacation_requests (férias, folgas, cancelamentos)
    all_vacation_requests = await db.vacation_requests.find({
        "user_id": target_user_id,
        "$or": [
            {"start_date": {"$gte": start_date.strftime("%Y-%m-%d"), "$lte": end_date.strftime("%Y-%m-%d")}},
            {"end_date": {"$gte": start_date.strftime("%Y-%m-%d"), "$lte": end_date.strftime("%Y-%m-%d")}},
            {"start_date": {"$lte": start_date.strftime("%Y-%m-%d")}, "end_date": {"$gte": end_date.strftime("%Y-%m-%d")}}
        ]
    }, {"_id": 0}).to_list(500)
    
    for vac in all_vacation_requests:
        vac_type = vac.get("type", "vacation")
        vac_start = vac.get("start_date")
        vac_end = vac.get("end_date", vac_start)
        
        if vac_start:
            try:
                start_dt = datetime.strptime(vac_start, "%Y-%m-%d")
                end_dt = datetime.strptime(vac_end, "%Y-%m-%d") if vac_end else start_dt
                current_dt = start_dt
                while current_dt <= end_dt:
                    date_str = current_dt.strftime("%Y-%m-%d")
                    if date_str >= start_date.strftime("%Y-%m-%d") and date_str <= end_date.strftime("%Y-%m-%d"):
                        if vac_type == "folga":
                            justifications_map[date_str] = "Folga justificada pelo admin"
                        elif vac_type == "cancelamento_ferias":
                            justifications_map[date_str] = "Férias canceladas pelo admin"
                        else:
                            justifications_map[date_str] = "Férias"
                    current_dt += timedelta(days=1)
            except (ValueError, KeyError):
                pass
    
    # Buscar faltas (absences)
    absences = await db.absences.find({
        "user_id": target_user_id,
        "date": {"$gte": start_date.strftime("%Y-%m-%d"), "$lte": end_date.strftime("%Y-%m-%d")}
    }, {"_id": 0}).to_list(500)
    
    for absence in absences:
        absence_date = absence.get("date")
        if absence_date:
            # Deixamos vazio aqui — o observations final é injectado por absences_v2 (ver `abs_info.obs`)
            justifications_map.setdefault(absence_date, "")
    
    # Get manual day status overrides (admin-set statuses)
    manual_statuses = {}
    status_overrides = await db.day_status_overrides.find({
        "user_id": target_user_id,
        "date": {
            "$gte": start_date.strftime("%Y-%m-%d"),
            "$lte": end_date.strftime("%Y-%m-%d")
        }
    }, {"_id": 0}).to_list(1000)
    
    for override in status_overrides:
        manual_statuses[override["date"]] = override["status"]
    
    # Build daily records for entire period
    daily_records = []
    current_date = start_date
    total_worked_minutes_p = 0
    total_overtime_minutes_p = 0
    total_special_minutes_p = 0
    days_with_meal_allowance = 0
    days_with_travel_allowance = 0
    
    dias_semana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
    
    # Faltas v2 — mesma fonte usada pelo endpoint JSON
    from routes.absences_v2 import fetch_absences_for_month
    absences_by_date = await fetch_absences_for_month(
        target_user_id,
        start_date.strftime("%Y-%m-%d"),
        end_date.strftime("%Y-%m-%d"),
    )
    
    while current_date <= end_date:
        date_str = current_date.strftime("%Y-%m-%d")
        day_of_week = dias_semana[current_date.weekday()]
        is_weekend = current_date.weekday() >= 5
        is_ot_day, ot_reason = is_overtime_day(current_date)
        is_holiday = is_ot_day and "Feriado" in (ot_reason or "")
        
        day_data = {
            "date": date_str,
            "day_of_week": day_of_week,
            "day_number": current_date.day,
            "is_weekend": is_weekend,
            "is_holiday": is_holiday,
            "holiday_name": ot_reason if is_holiday else None,
            "justification": justifications_map.get(date_str)
        }
        
        # Check if worked this day
        if date_str in entries_by_date:
            day_entries = entries_by_date[date_str]
            
            # Calcular total de minutos do dia a partir dos timestamps (sem segundos)
            total_minutos_dia = calcular_minutos_de_entradas(day_entries)
            total_hours = total_minutos_dia / 60
            
            # RECALCULAR breakdown baseado no TOTAL do dia (não somar individuais!)
            from hours_calculator import calcular_horas_dia, feriados_portugueses, minutos_para_horas
            
            # Verificar dia da semana e feriado
            dia_semana_py = current_date.weekday()  # 0=Segunda, 6=Domingo
            dia_semana_js = (dia_semana_py + 1) % 7  # Converter para JS: 0=Domingo, 6=Sábado
            
            ano = current_date.year
            feriados = feriados_portugueses(ano)
            is_feriado = current_date in feriados
            
            # Calcular breakdown correto
            breakdown_min = calcular_horas_dia(total_minutos_dia, dia_semana_js, is_feriado)
            
            overtime_hours = minutos_para_horas(breakdown_min["horas_extra"])
            special_hours = minutos_para_horas(breakdown_min["horas_especial"])
            
            # Check payment type
            outside_zone = any(e.get("outside_residence_zone", False) for e in day_entries)
            
            # Buscar localização - primeiro location_description, depois geo_location.address
            location = next((e.get("location_description") for e in day_entries if e.get("location_description")), None)
            if not location:
                # Tentar buscar do geo_location.address
                for e in day_entries:
                    geo = e.get("geo_location")
                    if geo and geo.get("address"):
                        addr = geo["address"]
                        location = addr.get("locality") or addr.get("city") or addr.get("formatted")
                        if location:
                            break
            
            day_data["status"] = "TRABALHADO"
            day_data["entries"] = [{
                "id": e.get("id"),  # IMPORTANTE: incluir o ID para edição
                "start_time": e.get("start_time"),
                "end_time": e.get("end_time"),
                "total_hours": e.get("total_hours"),
                "observations": e.get("observations"),
                "is_early_leave_credit": e.get("is_early_leave_credit", False),
                "outside_residence_zone": e.get("outside_residence_zone", False),
            } for e in sorted(day_entries, key=lambda x: x.get("start_time") or "")]
            day_data["total_hours"] = round(total_hours, 2)
            day_data["overtime_hours"] = round(overtime_hours, 2)
            day_data["special_hours"] = round(special_hours, 2)
            day_data["outside_residence_zone"] = outside_zone
            day_data["location"] = location
            
            # Payment calculation — novas regras Feb/2026 (SA binário, AC tiered)
            payment_type, payment_value = calcular_sa_ac(total_hours, outside_zone)
            day_data["payment_type"] = payment_type
            day_data["payment_value"] = payment_value
            if payment_type == "Ajuda de Custos":
                days_with_travel_allowance += 1
            elif payment_type == "Subsídio de Alimentação":
                days_with_meal_allowance += 1
            
            total_worked_minutes_p += total_minutos_dia
            total_overtime_minutes_p += breakdown_min["horas_extra"]
            total_special_minutes_p += breakdown_min["horas_especial"]
        else:
            # Not worked - determine status
            # First check if admin set a manual status
            manual = manual_statuses.get(date_str)
            # Regra: nunca marcar FÉRIAS em fim-de-semana ou feriado
            if manual == "FÉRIAS" and (is_weekend or is_holiday):
                manual = None
            if manual:
                day_data["status"] = manual
            elif is_weekend:
                day_data["status"] = "FOLGA"
            elif is_holiday:
                day_data["status"] = "FERIADO"
            elif date_str in vacation_dates:
                day_data["status"] = "FÉRIAS"
            else:
                # Dia útil sem registo — mostra "Sem Registo" (só passa a FALTA
                # quando o admin/utilizador criar um pedido em /absences).
                day_data["status"] = "SEM REGISTO"
            
            day_data["entries"] = []
            day_data["total_hours"] = 0
            day_data["overtime_hours"] = 0
            day_data["special_hours"] = 0
            day_data["payment_type"] = None
            day_data["payment_value"] = 0
        
        # Injectar informação de falta (novo sistema v2). Fonte partilhada
        # com /admin/absences/v2/* — mesma lógica de cor/observações.
        abs_info = absences_by_date.get(date_str)
        if abs_info:
            day_data["absence"] = abs_info
            if not abs_info.get("is_partial") and float(abs_info.get("hours") or 0) >= 7.5:
                if abs_info["state"] == "injustificada":
                    day_data["status"] = "FALTA INJUSTIFICADA"
                elif abs_info["state"] == "aprovada":
                    day_data["status"] = "FALTA JUSTIFICADA"
                elif abs_info["state"] == "rejeitada":
                    day_data["status"] = "JUSTIFICAÇÃO REJEITADA"
                elif abs_info["state"] == "pendente_documento":
                    day_data["status"] = "PENDENTE DOCUMENTO"
                elif abs_info["state"] == "pendente":
                    day_data["status"] = "FALTA PENDENTE"
            prev_obs = (day_data.get("observations") or "").strip()
            new_obs = abs_info.get("obs") or ""
            if prev_obs and new_obs and new_obs not in prev_obs:
                day_data["observations"] = f"{prev_obs} · {new_obs}"
            elif new_obs:
                day_data["observations"] = new_obs
        
        daily_records.append(day_data)
        current_date += timedelta(days=1)
    
    # Buscar dados de férias — usa o NOVO motor legal (vacation_engine),
    # partilhado com /vacations e /admin/vacations/*.
    from routes.vacations_v2 import _fetch_saldo_ctx, _breakdown_from_ctx
    vacation_breakdown_v2 = None
    try:
        cfg, approved, cancelled_set = await _fetch_saldo_ctx(target_user_id)
        vb = _breakdown_from_ctx(cfg, approved, cancelled_set, include_after=0)
        if not vb.get("error"):
            vacation_breakdown_v2 = vb
    except Exception:
        logging.exception("Erro a calcular férias (novo motor) para PDF")

    if vacation_breakdown_v2 and vacation_breakdown_v2.get("year_breakdown"):
        yb = vacation_breakdown_v2["year_breakdown"]
        vacation_entitlement = sum(y["dias_vencidos"] for y in yb)
        vacation_days_used = sum(y["dias_gozados"] for y in yb)
        vacation_days_available = sum(y["dias_disponiveis"] for y in yb)
    else:
        vacation_days_used = 0
        vacation_days_available = 22
        vacation_entitlement = 22
    
    # Buscar observações do relatório mensal (justificações de dias, etc.)
    monthly_report = await db.monthly_reports.find_one({
        "user_id": target_user_id,
        "month": month,
        "year": year
    }, {"_id": 0})
    
    observations_text = ""
    if monthly_report and monthly_report.get("observations"):
        observations_text = monthly_report.get("observations", "")
    
    report_data = {
        "username": username,
        "full_name": full_name,
        "start_date": start_date.strftime("%Y-%m-%d"),
        "end_date": end_date.strftime("%Y-%m-%d"),
        "month": month,
        "year": year,
        "daily_records": daily_records,
        "observations": observations_text,
        "summary": {
            "total_worked_hours": round(total_worked_minutes_p / 60, 2),
            "total_overtime_hours": round(total_overtime_minutes_p / 60, 2),
            "total_special_hours": round(total_special_minutes_p / 60, 2),
            "days_with_meal_allowance": days_with_meal_allowance,
            "days_with_travel_allowance": days_with_travel_allowance,
            "total_meal_allowance_value": days_with_meal_allowance * 10.0,
            "total_travel_allowance_value": days_with_travel_allowance * 50.0,
            "vacation_days_used": vacation_days_used,
            "vacation_days_available": vacation_days_available,
            "vacation_entitlement": vacation_entitlement,
            "vacation_breakdown_v2": vacation_breakdown_v2,
        }
    }
    
    # Generate PDF
    try:
        pdf_buffer = generate_monthly_pdf_report(report_data)  # USAR VERSÃO COMPLETA
        logging.info(f"PDF gerado: {len(pdf_buffer.getvalue())} bytes")
    except Exception as e:
        logging.error(f"Erro PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    # Return PDF
    filename = f"Relatorio_Mensal_{username}_{month:02d}_{year}.pdf"
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )



@router.post("/admin/time-entries/{entry_id}/adjust-to-8h")
async def adjust_entry_to_8hours(
    entry_id: str,
    data: Optional[dict] = None,
    current_user: dict = Depends(get_current_admin)
):
    """
    Ajustar automaticamente uma entrada para totalizar 8h no dia
    Admin only
    """
    try:
        # Buscar a entrada específica
        entry = await db.time_entries.find_one({"id": entry_id})
        if not entry:
            raise HTTPException(status_code=404, detail="Entrada não encontrada")
        
        # Verificar se tem start_time e end_time
        if not entry.get("start_time") or not entry.get("end_time"):
            raise HTTPException(status_code=400, detail="Entrada não tem horários definidos")
        
        # Buscar TODAS as entradas deste dia
        all_day_entries = await db.time_entries.find({
            "user_id": entry["user_id"],
            "date": entry["date"]
        }).to_list(None)
        
        # Calcular total de horas do dia (excluindo a entrada atual)
        total_seconds_other = 0
        for e in all_day_entries:
            if e["id"] == entry_id:
                continue  # Pular a entrada que vamos ajustar
            
            if e.get("start_time") and e.get("end_time"):
                start = normalizar_tempo(parse_stored_datetime(e["start_time"]))
                end = normalizar_tempo(parse_stored_datetime(e["end_time"]))
                total_seconds_other += (end - start).total_seconds()
        
        # Converter para horas
        import math
        total_minutes_other = int(total_seconds_other / 60)
        hours_other = total_minutes_other / 60
        
        # Verificar quanto falta para 8h
        target_hours = 8.0
        hours_needed = target_hours - hours_other
        
        if hours_needed <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Este dia já tem {hours_other:.2f}h sem contar esta entrada. Não precisa ajuste."
            )
        
        # Calcular nova hora de saída
        start_time = normalizar_tempo(parse_stored_datetime(entry["start_time"]))
        minutes_needed = round(hours_needed * 60)
        new_end_time = start_time + timedelta(minutes=minutes_needed)
        
        # Guardar hora original em observations
        original_end_str = format_time_from_iso(entry["end_time"])
        
        new_observations = entry.get("observations", "")
        adjustment_note = f"[Ajustado para 8h - Original: {original_end_str}]"
        
        if new_observations:
            new_observations = f"{new_observations} {adjustment_note}"
        else:
            new_observations = adjustment_note
        
        # Calcular novo total de horas desta entrada
        new_total_seconds = (new_end_time - start_time).total_seconds()
        new_total_minutes = int(new_total_seconds / 60)
        new_total_hours = round(new_total_minutes / 60, 4)
        
        # Atualizar entrada
        await db.time_entries.update_one(
            {"id": entry_id},
            {"$set": {
                "end_time": new_end_time.isoformat(),
                "total_hours": new_total_hours,
                "observations": new_observations
            }}
        )
        
        # Registar alteração no relatório mensal
        entry_date = entry["date"]
        await register_admin_observation(
            user_id=entry["user_id"],
            date=entry_date,
            observation=f"AJUSTAR PARA 8H: Dia {entry_date} ajustado de {original_end_str} para {new_end_time.strftime('%H:%M')} pelo admin {current_user.get('username', 'admin')}",
            admin_user=current_user
        )
        
        logging.info(f"Entrada {entry_id} ajustada para 8h totais no dia")
        
        return {
            "message": "Entrada ajustada com sucesso",
            "original_end_time": original_end_str,
            "new_end_time": new_end_time.strftime("%H:%M"),
            "hours_needed": round(hours_needed, 2),
            "total_day_hours": target_hours
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao ajustar entrada para 8h: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Função auxiliar para registar observações no relatório mensal
async def register_admin_observation(user_id: str, date: str, observation: str, admin_user: dict):
    """Registar uma observação de admin no relatório mensal do utilizador"""
    try:
        # Extrair mês e ano da data
        date_obj = datetime.strptime(date, "%Y-%m-%d")
        month = date_obj.month
        year = date_obj.year
        
        # Verificar se já existe um relatório mensal para este utilizador/mês
        existing_report = await db.monthly_reports.find_one({
            "user_id": user_id,
            "month": month,
            "year": year
        })
        
        timestamp = get_now_local().strftime("%d/%m/%Y %H:%M")
        full_observation = f"[{timestamp}] {observation}"
        
        if existing_report:
            # Adicionar à observação existente
            current_obs = existing_report.get("observations", "") or ""
            if current_obs:
                new_obs = f"{current_obs}\n{full_observation}"
            else:
                new_obs = full_observation
            
            await db.monthly_reports.update_one(
                {"_id": existing_report["_id"]},
                {"$set": {"observations": new_obs}}
            )
        else:
            # Criar novo relatório mensal com a observação
            import uuid
            new_report = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "month": month,
                "year": year,
                "observations": full_observation,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.monthly_reports.insert_one(new_report)
        
        logging.info(f"Observação registada no relatório mensal: {observation[:50]}...")
    except Exception as e:
        logging.error(f"Erro ao registar observação no relatório mensal: {e}")


@router.post("/admin/time-entries/justify-day")
async def justify_day(
    data: dict,
    current_user: dict = Depends(get_current_admin)
):
    """
    Justificar um dia específico de um utilizador
    Tipos: ferias, dar_dia, folga, falta, cancelamento_ferias
    Admin only
    """
    user_id = data.get("user_id")
    date_str = data.get("date")
    justification_type = data.get("justification_type")
    
    if not user_id or not date_str or not justification_type:
        raise HTTPException(status_code=400, detail="user_id, date e justification_type são obrigatórios")
    
    valid_types = ["ferias", "dar_dia", "folga", "falta", "cancelamento_ferias"]
    if justification_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Tipo inválido. Válidos: {valid_types}")
    
    try:
        # Buscar utilizador
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="Utilizador não encontrado")
        
        user_name = user.get("full_name") or user.get("username")
        date_formatted = datetime.strptime(date_str, "%Y-%m-%d").strftime("%d/%m/%Y")
        admin_name = current_user.get("username", "admin")
        
        message = ""
        observation_text = ""
        
        if justification_type == "ferias":
            # Marcar dia como férias
            import uuid
            vacation_entry = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "type": "vacation",
                "start_date": date_str,
                "end_date": date_str,
                "status": "approved",
                "approved_by": current_user.get("sub"),
                "approved_at": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "reason": f"Justificado pelo admin {admin_name}"
            }
            await db.vacation_requests.insert_one(vacation_entry)
            message = f"Dia {date_formatted} marcado como Férias"
            observation_text = f"FÉRIAS: {date_formatted} - Justificado pelo admin {admin_name}"
            
        elif justification_type == "dar_dia":
            # Criar duas entradas: 09:00-13:00 e 14:00-18:00
            import uuid
            
            # Remover entradas existentes desse dia
            await db.time_entries.delete_many({"user_id": user_id, "date": date_str})
            
            # Criar entrada da manhã (09:00-13:00)
            morning_start = datetime.strptime(f"{date_str} 09:00:00", "%Y-%m-%d %H:%M:%S")
            morning_end = datetime.strptime(f"{date_str} 13:00:00", "%Y-%m-%d %H:%M:%S")
            morning_entry = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "date": date_str,
                "start_time": morning_start.isoformat(),
                "end_time": morning_end.isoformat(),
                "total_hours": 4.0,
                "status": "completed",
                "observations": f"[Dia oferecido pelo admin {admin_name}]",
                "created_by_admin": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.time_entries.insert_one(morning_entry)
            
            # Criar entrada da tarde (14:00-18:00)
            afternoon_start = datetime.strptime(f"{date_str} 14:00:00", "%Y-%m-%d %H:%M:%S")
            afternoon_end = datetime.strptime(f"{date_str} 18:00:00", "%Y-%m-%d %H:%M:%S")
            afternoon_entry = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "date": date_str,
                "start_time": afternoon_start.isoformat(),
                "end_time": afternoon_end.isoformat(),
                "total_hours": 4.0,
                "status": "completed",
                "observations": f"[Dia oferecido pelo admin {admin_name}]",
                "created_by_admin": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.time_entries.insert_one(afternoon_entry)
            
            message = f"Dia {date_formatted} oferecido (8h: 09:00-13:00 + 14:00-18:00)"
            observation_text = f"DAR DIA: {date_formatted} - 8h criadas automaticamente (09:00-13:00 + 14:00-18:00) pelo admin {admin_name}"
            
        elif justification_type == "folga":
            # Marcar dia como folga (tipo especial)
            import uuid
            folga_entry = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "type": "folga",
                "start_date": date_str,
                "end_date": date_str,
                "status": "approved",
                "approved_by": current_user.get("sub"),
                "approved_at": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "reason": f"Folga justificada pelo admin {admin_name}"
            }
            await db.vacation_requests.insert_one(folga_entry)
            message = f"Dia {date_formatted} marcado como Folga"
            observation_text = f"FOLGA: {date_formatted} - Justificado pelo admin {admin_name}"
            
        elif justification_type == "falta":
            # Marcar dia como falta
            import uuid
            falta_entry = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "type": "absence",
                "date": date_str,
                "status": "registered",
                "registered_by": current_user.get("sub"),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "reason": f"Falta registada pelo admin {admin_name}"
            }
            await db.absences.insert_one(falta_entry)
            message = f"Dia {date_formatted} marcado como Falta"
            observation_text = f"FALTA: {date_formatted} - Registada pelo admin {admin_name}"
            
        elif justification_type == "cancelamento_ferias":
            # Cancelar férias desse dia
            result = await db.vacation_requests.delete_many({
                "user_id": user_id,
                "$or": [
                    {"start_date": date_str, "end_date": date_str},
                    {"start_date": {"$lte": date_str}, "end_date": {"$gte": date_str}}
                ]
            })
            
            # Criar registo de cancelamento para mostrar no UI
            import uuid
            cancel_entry = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "type": "cancelamento_ferias",
                "date": date_str,
                "start_date": date_str,
                "end_date": date_str,
                "status": "cancelled",
                "cancelled_by": current_user.get("sub"),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "reason": f"Férias canceladas pelo admin {admin_name}"
            }
            await db.vacation_requests.insert_one(cancel_entry)
            
            if result.deleted_count > 0:
                message = f"Férias canceladas para o dia {date_formatted}"
                observation_text = f"CANCELAMENTO FÉRIAS: {date_formatted} - Cancelado pelo admin {admin_name}"
            else:
                message = f"Dia {date_formatted} marcado como cancelamento de férias"
                observation_text = f"CANCELAMENTO FÉRIAS: {date_formatted} - Registado pelo admin {admin_name}"
        
        # Registar observação no relatório mensal
        await register_admin_observation(
            user_id=user_id,
            date=date_str,
            observation=observation_text,
            admin_user=current_user
        )
        
        logging.info(f"Dia justificado: {justification_type} para {user_name} em {date_str} por {admin_name}")
        
        return {
            "message": message,
            "justification_type": justification_type,
            "date": date_str,
            "user_id": user_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao justificar dia: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/time-entries/reports/custom-range-pdf")
async def download_custom_range_pdf(
    start_date_str: str,
    end_date_str: str,
    user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Download PDF report for custom date range"""
    # Use the custom range endpoint to get data
    report_data_response = await get_custom_range_report(
        start_date_str=start_date_str,
        end_date_str=end_date_str,
        user_id=user_id,
        current_user=current_user
    )
    
    # Generate PDF
    pdf_buffer = generate_monthly_pdf_report(report_data_response)
    
    # Generate filename with date range
    username = report_data_response["username"]
    start_formatted = start_date_str.replace("-", "")
    end_formatted = end_date_str.replace("-", "")
    filename = f"Relatorio_{username}_{start_formatted}_a_{end_formatted}.pdf"
    
    # Return as streaming response
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/time-entries/reports/excel")
async def download_excel_report(
    user_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Generate and download Excel report for billing period
    - Admins can specify user_id to get reports for any user
    - Regular users can only get their own reports
    - If no dates provided, uses current billing period (26th to 25th)
    """
    # Determine target user
    target_user_id = user_id if user_id and current_user.get("is_admin") else current_user["sub"]
    
    # Get user data
    user_data = await db.users.find_one({"id": target_user_id}, {"_id": 0})
    if not user_data:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    
    # Determine date range
    now = get_now_local()
    if not start_date or not end_date:
        # Use current billing period
        start_dt, end_dt = get_billing_period_dates(now.date())
        start_date = start_dt.strftime("%Y-%m-%d")
        end_date = end_dt.strftime("%Y-%m-%d")
    
    # Get time entries for the period
    entries = await db.time_entries.find({
        "user_id": target_user_id,
        "date": {"$gte": start_date, "$lte": end_date},
        "status": "completed"
    }, {"_id": 0}).sort("date", 1).to_list(1000)
    
    # Buscar dados de férias — usa NOVO motor legal partilhado com /vacations
    from routes.vacations_v2 import _fetch_saldo_ctx, _breakdown_from_ctx
    vacation_data = {}
    try:
        cfg, approved, cancelled_set = await _fetch_saldo_ctx(target_user_id)
        vb = _breakdown_from_ctx(cfg, approved, cancelled_set, include_after=0)
        if not vb.get("error"):
            vacation_data = {"vacation_breakdown_v2": vb}
    except Exception:
        logging.exception("Erro a calcular férias (novo motor) para Excel")
        vacation_data = {}
    
    # Determine month and year from start_date for report title
    start_dt_obj = datetime.fromisoformat(start_date)
    month = start_dt_obj.month
    year = start_dt_obj.year
    
    # Generate Excel workbook
    wb = generate_monthly_report(user_data, entries, vacation_data, month, year)
    
    # Save to BytesIO
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    
    # Generate filename
    filename = f"Folha_Ponto_{user_data.get('username', 'user')}_{month}_{year}.xlsx"
    
    # Return as streaming response
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.put("/time-entries/{entry_id}")
async def update_time_entry(
    entry_id: str,
    update_data: TimeEntryUpdate,
    current_user: dict = Depends(get_current_user)
):
    # Only admins can edit entries
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Apenas administradores podem editar registos")
    
    entry = await db.time_entries.find_one({"id": entry_id})
    
    if not entry:
        raise HTTPException(status_code=404, detail="Registo não encontrado")
    
    # Store original data for email notification (BEFORE changes)
    before_data = {
        "start_time": entry.get("start_time"),
        "end_time": entry.get("end_time"),
        "observations": entry.get("observations"),
        "outside_residence_zone": entry.get("outside_residence_zone", False),
        "location_description": entry.get("location_description", "")
    }
    
    update_dict = {}
    recalculate_hours = False
    
    # Track if times are being updated
    if update_data.start_time:
        update_dict["start_time"] = update_data.start_time.isoformat()
        recalculate_hours = True
    if update_data.end_time:
        update_dict["end_time"] = update_data.end_time.isoformat()
        recalculate_hours = True
    if update_data.observations is not None:
        update_dict["observations"] = update_data.observations
    if update_data.outside_residence_zone is not None:
        update_dict["outside_residence_zone"] = update_data.outside_residence_zone
    if update_data.location_description is not None:
        update_dict["location_description"] = update_data.location_description
    
    # If start or end time changed, recalculate hours
    if recalculate_hours:
        # Get the updated times (use new if provided, else keep old)
        start_time_str = update_dict.get("start_time", entry.get("start_time"))
        end_time_str = update_dict.get("end_time", entry.get("end_time"))
        
        if start_time_str and end_time_str:
            # Parse times
            start_time = normalizar_tempo(parse_stored_datetime(start_time_str))
            end_time = normalizar_tempo(parse_stored_datetime(end_time_str))
            
            # Calculate total hours (timestamps normalizados, sem segundos)
            total_seconds = (end_time - start_time).total_seconds()
            total_minutes = int(total_seconds / 60)
            total_hours = total_minutes / 60
            total_hours = round(total_hours, 4)
            
            # Get entry date to check if it's overtime day
            entry_date_str = entry.get("date")
            if entry_date_str:
                entry_date = datetime.strptime(entry_date_str, "%Y-%m-%d").date()
                is_ot, ot_reason = is_overtime_day(entry_date)
                
                # Calculate hours breakdown
                hours_breakdown = calculate_hours_breakdown(total_hours, is_ot)
                
                # Update all hour fields
                update_dict["total_hours"] = total_hours
                update_dict["regular_hours"] = hours_breakdown["regular_hours"]
                update_dict["overtime_hours"] = hours_breakdown["overtime_hours"]
                update_dict["special_hours"] = hours_breakdown["special_hours"]
                update_dict["is_overtime_day"] = is_ot
                update_dict["overtime_reason"] = ot_reason if is_ot else None
    
    if update_dict:
        await db.time_entries.update_one({"id": entry_id}, {"$set": update_dict})
        
        # Send email notification if entry was edited by admin (different user)
        entry_owner_id = entry.get("user_id")
        editor_id = current_user["sub"]
        
        if entry_owner_id != editor_id:
            # This is an admin editing another user's entry - send notification
            try:
                # Get user info
                user = await db.users.find_one({"id": entry_owner_id})
                if user and user.get("email"):
                    # Prepare after_data with updated values
                    after_data = {
                        "start_time": update_dict.get("start_time", entry.get("start_time")),
                        "end_time": update_dict.get("end_time", entry.get("end_time")),
                        "observations": update_dict.get("observations", entry.get("observations", "")),
                        "outside_residence_zone": update_dict.get("outside_residence_zone", entry.get("outside_residence_zone", False)),
                        "location_description": update_dict.get("location_description", entry.get("location_description", ""))
                    }
                    
                    # Send email notification
                    await send_time_entry_edit_notification_email(
                        user_name=user.get("full_name", user.get("username")),
                        user_email=user.get("email"),
                        entry_date=entry.get("date"),
                        before_data=before_data,
                        after_data=after_data
                    )
            except Exception as e:
                logging.error(f"Failed to send edit notification email: {str(e)}")
                # Don't fail the update if email fails
    
    return {"message": "Registo atualizado com sucesso"}

@router.delete("/time-entries/{entry_id}")
async def delete_time_entry(entry_id: str, current_user: dict = Depends(get_current_user)):
    # Only admins can delete entries
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Apenas administradores podem eliminar registos")
    
    result = await db.time_entries.delete_one({"id": entry_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Registo não encontrado")
    
    return {"message": "Registo eliminado com sucesso"}

@router.delete("/admin/time-entries/date/{user_id}/{date}")
async def delete_all_entries_for_date(
    user_id: str,
    date: str,
    current_user: dict = Depends(get_current_admin)
):
    """Delete all time entries for a specific user and date (Admin only)"""
    result = await db.time_entries.delete_many({
        "user_id": user_id,
        "date": date,
        "status": "completed"
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Nenhum registo encontrado para esta data")
    
    return {
        "message": f"{result.deleted_count} registo(s) eliminado(s) com sucesso",
        "deleted_count": result.deleted_count
    }

@router.get("/admin/time-entries/status-report")
async def get_status_report(current_user: dict = Depends(get_current_admin)):
    """Analyze time entries status distribution (Admin only)"""
    try:
        # Count entries by status
        pipeline = [
            {
                "$group": {
                    "_id": "$status",
                    "count": {"$sum": 1}
                }
            }
        ]
        
        status_counts = await db.time_entries.aggregate(pipeline).to_list(None)
        
        # Get sample entries with invalid status
        invalid_entries = await db.time_entries.find({
            "status": {"$nin": ["completed", "active"]}
        }).limit(10).to_list(10)
        
        # Get old active entries (more than 48 hours old)
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=48)
        old_active_entries = await db.time_entries.find({
            "status": "active",
            "start_time": {"$lt": cutoff_time.isoformat()}
        }).limit(10).to_list(10)
        
        return {
            "status_distribution": {item["_id"]: item["count"] for item in status_counts},
            "invalid_entries_sample": [
                {
                    "id": e.get("id"),
                    "user": e.get("username"),
                    "date": e.get("date"),
                    "status": e.get("status"),
                    "start_time": e.get("start_time")
                } for e in invalid_entries
            ],
            "old_active_entries_sample": [
                {
                    "id": e.get("id"),
                    "user": e.get("username"),
                    "date": e.get("date"),
                    "start_time": e.get("start_time")
                } for e in old_active_entries
            ]
        }
    except Exception as e:
        logging.error(f"Error getting status report: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/time-entries/fix-invalid-status")
async def fix_invalid_status(current_user: dict = Depends(get_current_admin)):
    """Fix entries with invalid status (Admin only)"""
    try:
        # Fix entries with invalid status (not 'completed' or 'active')
        result_invalid = await db.time_entries.update_many(
            {"status": {"$nin": ["completed", "active"]}},
            {"$set": {"status": "completed"}}
        )
        
        # Fix old active entries (more than 48 hours old) - assume they should be completed
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=48)
        result_old_active = await db.time_entries.update_many(
            {
                "status": "active",
                "start_time": {"$lt": cutoff_time.isoformat()}
            },
            {"$set": {"status": "completed"}}
        )
        
        return {
            "message": "Entradas corrigidas com sucesso",
            "invalid_status_fixed": result_invalid.modified_count,
            "old_active_fixed": result_old_active.modified_count,
            "total_fixed": result_invalid.modified_count + result_old_active.modified_count
        }
    except Exception as e:
        logging.error(f"Error fixing invalid status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/admin/time-entries/delete-invalid")
async def delete_invalid_entries(current_user: dict = Depends(get_current_admin)):
    """Delete entries with invalid status (Admin only)"""
    try:
        # Delete entries with invalid status (not 'completed' or 'active')
        result = await db.time_entries.delete_many({
            "status": {"$nin": ["completed", "active"]}
        })
        
        return {
            "message": f"{result.deleted_count} entradas inválidas eliminadas",
            "deleted_count": result.deleted_count
        }
    except Exception as e:
        logging.error(f"Error deleting invalid entries: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/users/{user_id}/recalculate-hours")
async def recalculate_user_hours(
    user_id: str,
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: dict = Depends(get_current_admin)
):
    """
    Recalcular e verificar todas as horas de um usuário para um período de faturação
    Admin only
    """
    try:
        # Se não especificou mês/ano, usar período atual
        if not month or not year:
            reference_date = None  # Usará data atual
        else:
            # Criar uma data de referência dentro do mês especificado
            reference_date = date(year, month, 15)  # Dia 15 do mês especificado
        
        # Obter datas do período de faturação (26 do mês anterior ao 25 do mês atual)
        start_date, end_date = get_billing_period_dates(reference_date)
        
        # Buscar usuário
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="Utilizador não encontrado")
        
        # Buscar todas as entradas do período
        entries = await db.time_entries.find({
            "user_id": user_id,
            "date": {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        }).to_list(length=None)
        
        # Estatísticas
        stats = {
            "user_id": user_id,
            "username": user.get("username"),
            "full_name": user.get("full_name"),
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
                "month": month if month else start_date.month,
                "year": year if year else start_date.year
            },
            "totals": {
                "regular_hours": 0,
                "overtime_hours": 0,
                "special_hours": 0,
                "total_hours": 0,
                "days_worked": 0
            },
            "entries_checked": 0,
            "entries_updated": 0,
            "issues_found": []
        }
        
        # Processar cada entrada
        for entry in entries:
            stats["entries_checked"] += 1
            
            if entry.get("status") != "completed":
                # Ignorar entradas não completadas
                continue
            
            total_seconds = 0
            has_time_data = False
            
            # FORMATO NOVO: Array de entries
            if entry.get("entries") and len(entry["entries"]) > 0:
                has_time_data = True
                for e in entry["entries"]:
                    if e.get("start_time") and e.get("end_time"):
                        start = normalizar_tempo(parse_stored_datetime(e["start_time"]))
                        end = normalizar_tempo(parse_stored_datetime(e["end_time"]))
                        total_seconds += (end - start).total_seconds()
            
            # FORMATO ANTIGO: start_time e end_time diretos
            elif entry.get("start_time") and entry.get("end_time"):
                has_time_data = True
                start = normalizar_tempo(parse_stored_datetime(entry["start_time"]))
                end = normalizar_tempo(parse_stored_datetime(entry["end_time"]))
                total_seconds = (end - start).total_seconds()
            
            if not has_time_data:
                # Entrada sem dados de horários
                stats["issues_found"].append({
                    "date": entry["date"],
                    "issue": "Entrada sem detalhes de horários",
                    "action": "Ignorada"
                })
                continue
            
            # Usar start_time para calcular breakdown (precisa de datetime)
            if entry.get("entries") and len(entry["entries"]) > 0:
                first_start = normalizar_tempo(parse_stored_datetime(entry["entries"][0]["start_time"]))
                last_end = normalizar_tempo(parse_stored_datetime(entry["entries"][-1]["end_time"]))
            else:
                first_start = normalizar_tempo(parse_stored_datetime(entry["start_time"]))
                last_end = normalizar_tempo(parse_stored_datetime(entry["end_time"]))
            
            # Usar a NOVA LÓGICA do script fornecido
            date_obj = datetime.strptime(entry["date"], "%Y-%m-%d").date()
            hours_breakdown = calcular_breakdown_completo(first_start, last_end, date_obj)
            
            # Calcular total (timestamps normalizados, sem segundos)
            total_minutes = int(total_seconds / 60)
            total_hours = round(total_minutes / 60, 4)
            
            # Verificar se os valores mudaram
            old_regular = entry.get("regular_hours", 0)
            old_overtime = entry.get("overtime_hours", 0)
            old_special = entry.get("special_hours", 0)
            old_total = entry.get("total_hours", 0)
            
            new_regular = hours_breakdown["regular_hours"]
            new_overtime = hours_breakdown["overtime_hours"]
            new_special = hours_breakdown["special_hours"]
            new_total = total_hours
            
            # Se houver diferença, atualizar
            if (abs(old_regular - new_regular) > 0.01 or 
                abs(old_overtime - new_overtime) > 0.01 or
                abs(old_special - new_special) > 0.01 or
                abs(old_total - new_total) > 0.01):
                
                # Atualizar entrada
                await db.time_entries.update_one(
                    {"user_id": user_id, "date": entry["date"]},
                    {"$set": {
                        "regular_hours": new_regular,
                        "overtime_hours": new_overtime,
                        "special_hours": new_special,
                        "total_hours": new_total
                    }}
                )
                
                stats["entries_updated"] += 1
                stats["issues_found"].append({
                    "date": entry["date"],
                    "issue": f"Horas recalculadas: {old_total:.2f}h → {new_total:.2f}h",
                    "action": "Atualizado",
                    "old_values": {
                        "regular": round(old_regular, 2),
                        "overtime": round(old_overtime, 2),
                        "special": round(old_special, 2),
                        "total": round(old_total, 2)
                    },
                    "new_values": {
                        "regular": new_regular,
                        "overtime": new_overtime,
                        "special": new_special,
                        "total": new_total
                    }
                })
            
            # Somar aos totais (usar valores atualizados)
            stats["totals"]["regular_hours"] += new_regular
            stats["totals"]["overtime_hours"] += new_overtime
            stats["totals"]["special_hours"] += new_special
            stats["totals"]["total_hours"] += new_total
            
            if new_total > 0:
                stats["totals"]["days_worked"] += 1
        
        # Arredondar totais
        stats["totals"]["regular_hours"] = round(stats["totals"]["regular_hours"], 2)
        stats["totals"]["overtime_hours"] = round(stats["totals"]["overtime_hours"], 2)
        stats["totals"]["special_hours"] = round(stats["totals"]["special_hours"], 2)
        stats["totals"]["total_hours"] = round(stats["totals"]["total_hours"], 2)
        
        logging.info(f"Verificação completa para {user.get('username')}: {stats['entries_checked']} entradas verificadas, {stats['entries_updated']} atualizadas")
        
        return stats
        
    except Exception as e:
        logging.error(f"Erro ao recalcular horas: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/day-status/set")
async def set_day_status(
    status_data: dict,
    current_user: dict = Depends(get_current_admin)
):
    """
    Set manual status for a specific day (FALTA, FÉRIAS, FOLGA)
    Admin only - this overrides automatic detection
    """
    user_id = status_data.get("user_id")
    date_str = status_data.get("date")
    status = status_data.get("status")  # FALTA, FÉRIAS, FOLGA, or None to clear
    
    if not user_id or not date_str:
        raise HTTPException(status_code=400, detail="user_id e date são obrigatórios")
    
    # Validate status
    valid_statuses = ["FALTA", "FÉRIAS", "FOLGA", None]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status inválido. Use: FALTA, FÉRIAS, FOLGA, ou null para limpar")
    
    # Check if user exists
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    
    # Store or update day status override
    if status is None:
        # Remove override
        await db.day_status_overrides.delete_one({
            "user_id": user_id,
            "date": date_str
        })
        return {"message": "Status manual removido"}
    else:
        # Set/update override
        await db.day_status_overrides.update_one(
            {"user_id": user_id, "date": date_str},
            {"$set": {
                "user_id": user_id,
                "date": date_str,
                "status": status,
                "set_by": current_user["sub"],
                "set_at": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )
        return {"message": f"Dia marcado como {status}"}

@router.post("/admin/time-entries/manual")
async def create_manual_time_entry(
    entry_data: ManualTimeEntryCreate,
    current_user: dict = Depends(get_current_admin)
):
    """
    Create manual time entries for a specific user and date (Admin only)
    Can create multiple start/end pairs for the same day
    """
    try:
        # Get user
        user = await db.users.find_one({"id": entry_data.user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=404, detail="Utilizador não encontrado")
        
        # Validate that we have at least one time entry
        if not entry_data.time_entries or len(entry_data.time_entries) == 0:
            raise HTTPException(status_code=400, detail="Deve fornecer pelo menos um par de horários")
        
        # Parse date
        entry_date = datetime.strptime(entry_data.date, "%Y-%m-%d").date()
        
        # Check if it's a special day (weekend/holiday)
        is_special_day, overtime_reason = is_overtime_day(entry_date)
        
        # Check if entries already exist for this date
        existing_entries = await db.time_entries.find({
            "user_id": entry_data.user_id,
            "date": entry_data.date,
            "status": "completed"
        }).to_list(100)
        
        # Calculate existing hours for the day
        existing_hours = sum(e.get("total_hours", 0) for e in existing_entries)
        
        created_entries = []
        total_day_hours = existing_hours  # Start with existing hours
        
        # Process each time entry
        for idx, time_pair in enumerate(entry_data.time_entries):
            start_time_str = time_pair.get("start_time")
            end_time_str = time_pair.get("end_time")
            
            if not start_time_str or not end_time_str:
                raise HTTPException(status_code=400, detail=f"Entrada {idx+1}: horários de início e fim são obrigatórios")
            
            # Parse times
            start_time_parts = start_time_str.split(":")
            end_time_parts = end_time_str.split(":")
            
            # Create datetime objects WITHOUT timezone (will be treated as local time)
            # The frontend sends local time (HH:MM), we keep it as is
            start_datetime = datetime.combine(entry_date, datetime.min.time()).replace(
                hour=int(start_time_parts[0]),
                minute=int(start_time_parts[1])
            )
            end_datetime = datetime.combine(entry_date, datetime.min.time()).replace(
                hour=int(end_time_parts[0]),
                minute=int(end_time_parts[1])
            )
            
            # Check if time crosses midnight (end < start means next day)
            if end_datetime <= start_datetime:
                # Entry crosses midnight - move end_datetime to next day
                end_datetime = end_datetime + timedelta(days=1)
            
            # Now check if entry spans multiple days (after correcting for midnight)
            if start_datetime.date() != end_datetime.date():
                # Split entry at midnight
                midnight = datetime.combine(start_datetime.date() + timedelta(days=1), datetime.min.time())
                
                # First part: start_time to midnight
                first_part_end = midnight - timedelta(seconds=1)
                # Calcular duração usando midnight (não first_part_end que tem -1s)
                first_minutes = int((midnight - start_datetime).total_seconds() / 60)
                first_hours = first_minutes / 60
                first_hours = round(first_hours, 4)
                
                # Determine if first day is special
                first_is_special, first_ot_reason = is_overtime_day(start_datetime.date())
                first_breakdown = calculate_hours_breakdown(first_hours, first_is_special)
                
                first_entry = TimeEntry(
                    user_id=entry_data.user_id,
                    username=user.get("username", ""),
                    date=start_datetime.strftime("%Y-%m-%d"),
                    start_time=start_datetime,
                    end_time=first_part_end,
                    status="completed",
                    observations=entry_data.observations or f"Entrada manual {idx+1}/{len(entry_data.time_entries)} (Parte 1) pelo administrador",
                    is_overtime_day=first_is_special,
                    overtime_reason=first_ot_reason if first_is_special else None,
                    total_hours=first_hours,
                    regular_hours=first_breakdown["regular_hours"],
                    overtime_hours=first_breakdown["overtime_hours"],
                    special_hours=first_breakdown["special_hours"],
                    outside_residence_zone=entry_data.outside_residence_zone,
                    location_description=entry_data.location_description
                )
                created_entries.append(first_entry)
                total_day_hours += first_hours
                
                # Second part: 00:00:00 to end_time
                second_minutes = int((end_datetime - midnight).total_seconds() / 60)
                second_hours = second_minutes / 60
                second_hours = round(second_hours, 4)
                
                # Determine if second day is special
                second_is_special, second_ot_reason = is_overtime_day(end_datetime.date())
                second_breakdown = calculate_hours_breakdown(second_hours, second_is_special)
                
                second_entry = TimeEntry(
                    user_id=entry_data.user_id,
                    username=user.get("username", ""),
                    date=end_datetime.strftime("%Y-%m-%d"),
                    start_time=midnight,
                    end_time=end_datetime,
                    status="completed",
                    observations="Continuação do registo anterior",
                    is_overtime_day=second_is_special,
                    overtime_reason=second_ot_reason if second_is_special else None,
                    total_hours=second_hours,
                    regular_hours=second_breakdown["regular_hours"],
                    overtime_hours=second_breakdown["overtime_hours"],
                    special_hours=second_breakdown["special_hours"],
                    outside_residence_zone=entry_data.outside_residence_zone,
                    location_description=entry_data.location_description
                )
                created_entries.append(second_entry)
                total_day_hours += second_hours
                
            else:
                # Single day entry (no midnight crossing)
                entry_minutes = int((end_datetime - start_datetime).total_seconds() / 60)
                entry_hours = entry_minutes / 60
                entry_hours = round(entry_hours, 4)
                
                total_day_hours += entry_hours
                
                # Create entry
                time_entry = TimeEntry(
                    user_id=entry_data.user_id,
                    username=user.get("username", ""),
                    date=entry_data.date,
                    start_time=start_datetime,
                    end_time=end_datetime,
                    status="completed",
                    observations=entry_data.observations or f"Entrada manual {idx+1}/{len(entry_data.time_entries)} pelo administrador",
                    is_overtime_day=is_special_day,
                    overtime_reason=overtime_reason if is_special_day else None,
                    total_hours=entry_hours,
                    regular_hours=0,  # Will calculate after all entries
                    overtime_hours=0,
                    special_hours=0,
                    outside_residence_zone=entry_data.outside_residence_zone,
                    location_description=entry_data.location_description
                )
                
                created_entries.append(time_entry)
        
        # Calculate hours breakdown for entries that don't have it yet (single-day entries)
        # Entries that crossed midnight already have their breakdowns calculated
        entries_needing_breakdown = [e for e in created_entries if e.regular_hours == 0 and e.overtime_hours == 0 and e.special_hours == 0]
        
        hours_breakdown = {"regular_hours": 0, "overtime_hours": 0, "special_hours": 0}
        
        if entries_needing_breakdown:
            # Get total hours for these entries only
            new_entries_hours = sum(e.total_hours for e in entries_needing_breakdown)
            
            # Calculate breakdown considering existing hours
            # First 8 hours are regular, rest are overtime (if not special day)
            if is_special_day:
                # All hours on special day are special/overtime
                hours_breakdown = {
                    "regular_hours": 0,
                    "overtime_hours": new_entries_hours,
                    "special_hours": new_entries_hours
                }
            else:
                # Regular hours are capped at 8h minus existing regular hours
                existing_regular = sum(e.get("regular_hours", 0) for e in existing_entries)
                remaining_regular = max(0, 8 - existing_regular)
                
                new_regular = min(new_entries_hours, remaining_regular)
                new_overtime = max(0, new_entries_hours - remaining_regular)
                
                hours_breakdown = {
                    "regular_hours": round(new_regular, 2),
                    "overtime_hours": round(new_overtime, 2),
                    "special_hours": 0
                }
            
            # Distribute the hours proportionally across entries needing breakdown
            for entry in entries_needing_breakdown:
                proportion = entry.total_hours / new_entries_hours if new_entries_hours > 0 else 0
                entry.regular_hours = round(hours_breakdown["regular_hours"] * proportion, 2)
                entry.overtime_hours = round(hours_breakdown["overtime_hours"] * proportion, 2)
                entry.special_hours = round(hours_breakdown["special_hours"] * proportion, 2)
        
        # Save all entries to database
        for entry in created_entries:
            entry_dict = entry.model_dump()
            entry_dict['created_at'] = entry_dict['created_at'].isoformat()
            entry_dict['start_time'] = entry_dict['start_time'].isoformat()
            entry_dict['end_time'] = entry_dict['end_time'].isoformat()
            await db.time_entries.insert_one(entry_dict)
        
        return {
            "message": f"{len(created_entries)} entrada(s) criada(s) com sucesso",
            "entries_created": len(created_entries),
            "total_hours": total_day_hours,
            "regular_hours": hours_breakdown["regular_hours"],
            "overtime_hours": hours_breakdown["overtime_hours"],
            "special_hours": hours_breakdown["special_hours"]
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Formato de data/hora inválido: {str(e)}")
    except Exception as e:
        logging.error(f"Error creating manual entry: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao criar entrada: {str(e)}")

# ============ Admin Clock Control Endpoints ============

@router.post("/admin/time-entries/start/{user_id}")
async def admin_start_clock(
    user_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """Admin inicia o relógio para um utilizador"""
    # Verificar se o utilizador existe
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    
    now_local = get_now_local()
    today = now_local.strftime("%Y-%m-%d")
    
    # Verificar se já existe uma entrada ativa
    existing_active = await db.time_entries.find_one({
        "user_id": user_id,
        "status": "active"
    }, {"_id": 0})
    
    if existing_active:
        raise HTTPException(status_code=400, detail="Este utilizador já tem um relógio ativo")
    
    # Verificar se é dia de horas extras
    today_date = now_local.date()
    is_ot, ot_reason = is_overtime_day(today_date)
    
    entry = TimeEntry(
        user_id=user_id,
        username=user.get("username", ""),
        date=today,
        start_time=normalizar_tempo(now_local),
        status="active",
        observations=f"[Iniciado por admin: {current_user['username']}]",
        is_overtime_day=is_ot,
        overtime_reason=ot_reason if is_ot else None,
        outside_residence_zone=False,
        location_description=None
    )
    
    entry_dict = entry.model_dump()
    entry_dict['start_time'] = entry_dict['start_time'].isoformat()
    entry_dict['created_at'] = entry_dict['created_at'].isoformat()
    
    await db.time_entries.insert_one(entry_dict)
    
    return {"message": f"Relógio iniciado para {user.get('username', user_id)}", "entry_id": entry.id}

@router.post("/admin/time-entries/end/{user_id}")
async def admin_end_clock(
    user_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """Admin finaliza o relógio de um utilizador"""
    # Verificar se o utilizador existe
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    
    # Buscar entrada ativa
    entry = await db.time_entries.find_one({
        "user_id": user_id,
        "status": "active"
    })
    
    if not entry:
        raise HTTPException(status_code=404, detail="Nenhum relógio ativo encontrado para este utilizador")
    
    end_time = normalizar_tempo(get_now_local())
    start_time = normalizar_tempo(parse_stored_datetime(entry["start_time"]))
    
    # Calcular horas (timestamps normalizados)
    total_seconds = (end_time - start_time).total_seconds()
    total_minutes = int(total_seconds / 60)
    total_hours = total_minutes / 60
    
    # Calcular horas normais e extras (máximo 8h normais por dia)
    regular_hours = min(total_hours, 8)
    overtime_hours = max(0, total_hours - 8)
    
    # Se for dia especial, tudo é hora extra
    if entry.get("is_overtime_day"):
        overtime_hours = total_hours
        regular_hours = 0
    
    # Adicionar observação do admin
    observations = entry.get("observations", "")
    if observations:
        observations = f"{observations}\n[Finalizado por admin: {current_user['username']}]"
    else:
        observations = f"[Finalizado por admin: {current_user['username']}]"
    
    # Atualizar entrada
    await db.time_entries.update_one(
        {"id": entry["id"]},
        {
            "$set": {
                "end_time": end_time.isoformat(),
                "status": "completed",
                "total_hours": round(total_hours, 2),
                "regular_hours": round(regular_hours, 2),
                "overtime_hours": round(overtime_hours, 2),
                "observations": observations
            }
        }
    )
    
    return {
        "message": f"Relógio finalizado para {user.get('username', user_id)}",
        "total_hours": round(total_hours, 2)
    }

@router.post("/admin/time-entries/import-pdf")
async def import_pdf_timesheet(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    current_user: dict = Depends(get_current_admin)
):
    """
    Import time entries from PDF generated by our app (Admin only)
    PDFs from our app ALWAYS overwrite existing data - the PDF is the source of truth
    
    Handles all day statuses: TRABALHADO, FOLGA, FÉRIAS, FALTA, FERIADO
    """
    try:
        # Validate file is PDF
        if not file.filename.endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Apenas ficheiros PDF (.pdf) são permitidos")
        
        # Save uploaded file temporarily
        temp_dir = Path("/tmp/timetracker_imports")
        temp_dir.mkdir(exist_ok=True)
        temp_file = temp_dir / f"{uuid.uuid4()}_{file.filename}"
        
        with open(temp_file, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Parse PDF
        logging.info(f"📄 Parsing PDF file: {file.filename}")
        result = parse_pdf_timesheet(str(temp_file))
        
        # Clean up temp file
        temp_file.unlink()
        
        if not result['success']:
            raise HTTPException(status_code=400, detail=f"Erro ao processar ficheiro: {result.get('error', 'Erro desconhecido')}")
        
        entries_data = result['entries']
        
        if not entries_data:
            raise HTTPException(status_code=400, detail="Nenhuma entrada válida encontrada no ficheiro")
        
        # Validate user exists
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=404, detail="Utilizador não encontrado")
        
        username = user.get("username", "")
        
        # Import entries - PDF ALWAYS overwrites existing data
        imported_count = 0
        replaced_count = 0
        skipped_count = 0
        error_count = 0
        
        for entry_data in entries_data:
            try:
                entry_date_str = entry_data['date']
                entry_status = entry_data.get('status', 'TRABALHADO')
                time_entries = entry_data.get('time_entries', [])
                
                # DELETE any existing entries for this date - PDF is the source of truth
                existing_count = await db.time_entries.count_documents({
                    "user_id": user_id,
                    "date": entry_date_str
                })
                
                if existing_count > 0:
                    await db.time_entries.delete_many({
                        "user_id": user_id,
                        "date": entry_date_str
                    })
                    replaced_count += 1
                    logging.info(f"  🔄 Replaced {existing_count} entries for {entry_date_str}")
                
                # Skip non-working days (FOLGA, FERIADO) - don't create entries
                if entry_status in ['FOLGA', 'FERIADO', 'NÃO TRABALHADO']:
                    skipped_count += 1
                    logging.info(f"  ⏭️ Skipped {entry_date_str} ({entry_status})")
                    continue
                
                # Handle FÉRIAS - create vacation request if not exists
                if entry_status == 'FÉRIAS':
                    # Check if vacation already registered
                    existing_vacation = await db.vacation_requests.find_one({
                        "user_id": user_id,
                        "start_date": {"$lte": entry_date_str},
                        "end_date": {"$gte": entry_date_str},
                        "status": "approved"
                    })
                    if not existing_vacation:
                        logging.info(f"  🏖️ Vacation day {entry_date_str} - not creating time entry")
                    skipped_count += 1
                    continue
                
                # Handle FALTA - skip (no time entry needed)
                if entry_status == 'FALTA':
                    skipped_count += 1
                    logging.info(f"  ⚠️ Absence day {entry_date_str} - skipping")
                    continue
                
                # Process TRABALHADO entries
                if not time_entries:
                    logging.warning(f"  ⚠️ No time entries for worked day {entry_date_str}")
                    skipped_count += 1
                    continue
                
                entry_date = datetime.strptime(entry_date_str, "%Y-%m-%d").date()
                is_special_day, overtime_reason = is_overtime_day(entry_date)
                
                total_day_hours = 0
                created_entries = []
                
                # Get observations from PDF
                pdf_observations = entry_data.get('observations', '')
                
                for idx, time_pair in enumerate(time_entries):
                    start_time_str = time_pair['start_time']
                    end_time_str = time_pair['end_time']
                    
                    # Parse times
                    start_parts = start_time_str.split(":")
                    end_parts = end_time_str.split(":")
                    
                    # Create datetime objects (hora local portuguesa)
                    start_datetime = datetime.combine(entry_date, datetime.min.time()).replace(
                        hour=int(start_parts[0]),
                        minute=int(start_parts[1])
                    )
                    end_datetime = datetime.combine(entry_date, datetime.min.time()).replace(
                        hour=int(end_parts[0]),
                        minute=int(end_parts[1])
                    )
                    
                    # Calculate hours (timestamps já em HH:MM, sem segundos)
                    entry_minutes = int((end_datetime - start_datetime).total_seconds() / 60)
                    entry_hours = entry_minutes / 60
                    entry_hours = round(entry_hours, 4)
                    
                    total_day_hours += entry_hours
                    
                    # Build observations
                    obs_parts = []
                    if pdf_observations and pdf_observations != '-':
                        obs_parts.append(pdf_observations)
                    obs_parts.append(f"Importado de PDF (entrada {idx+1}/{len(time_entries)})")
                    observations_text = ' | '.join(obs_parts)
                    
                    # Create entry
                    time_entry = TimeEntry(
                        user_id=user_id,
                        username=username,
                        date=entry_date_str,
                        start_time=start_datetime,
                        end_time=end_datetime,
                        status="completed",
                        observations=observations_text,
                        is_overtime_day=is_special_day,
                        overtime_reason=overtime_reason if is_special_day else None,
                        total_hours=entry_hours,
                        regular_hours=0,
                        overtime_hours=0,
                        special_hours=0,
                        outside_residence_zone=entry_data.get('outside_residence_zone', False),
                        location_description=entry_data.get('location_description')
                    )
                    
                    created_entries.append(time_entry)
                
                # Calculate hours breakdown for the entire day
                if total_day_hours > 0:
                    hours_breakdown = calculate_hours_breakdown(total_day_hours, is_special_day)
                    
                    # Distribute proportionally
                    for entry in created_entries:
                        proportion = entry.total_hours / total_day_hours if total_day_hours > 0 else 0
                        entry.regular_hours = round(hours_breakdown["regular_hours"] * proportion, 2)
                        entry.overtime_hours = round(hours_breakdown["overtime_hours"] * proportion, 2)
                        entry.special_hours = round(hours_breakdown["special_hours"] * proportion, 2)
                
                # Save all entries
                for entry in created_entries:
                    entry_dict = entry.model_dump()
                    entry_dict['created_at'] = entry_dict['created_at'].isoformat()
                    entry_dict['start_time'] = entry_dict['start_time'].isoformat()
                    entry_dict['end_time'] = entry_dict['end_time'].isoformat()
                    await db.time_entries.insert_one(entry_dict)
                
                imported_count += 1
                logging.info(f"  ✅ Imported {len(created_entries)} entries for {entry_date_str} ({total_day_hours:.2f}h)")
                
            except Exception as e:
                logging.error(f"  ❌ Error importing entry for {entry_data.get('date')}: {str(e)}")
                error_count += 1
                continue
        
        # Build response message
        message = f"Importação concluída: {imported_count} dias trabalhados importados"
        if replaced_count > 0:
            message += f", {replaced_count} dias substituídos"
        if skipped_count > 0:
            message += f", {skipped_count} dias não-trabalho ignorados"
        
        logging.info(f"📊 Import complete: {imported_count} imported, {replaced_count} replaced, {skipped_count} skipped, {error_count} errors")
        
        return {
            "message": message,
            "imported": imported_count,
            "replaced": replaced_count,
            "skipped": skipped_count,
            "errors": error_count,
            "total_in_file": len(entries_data),
            "metadata": result.get('metadata', {})
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"❌ Error in import endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao importar: {str(e)}")


@router.get("/admin/user/{user_id}/time-entries")
async def get_user_time_entries(user_id: str, current_user: dict = Depends(get_current_admin)):
    """Get all time entries for a specific user (admin only)"""
    entries = await db.time_entries.find({"user_id": user_id}, {"_id": 0}).sort("date", -1).to_list(1000)
    return entries

@router.get("/admin/time-entries/user/{user_id}")
async def get_user_time_entries_by_month(
    user_id: str,
    month: int = None,
    year: int = None,
    date_from: str = None,
    date_to: str = None,
    current_user: dict = Depends(get_current_admin)
):
    """Get time entries for a specific user by date range or billing period (admin only)"""
    from datetime import datetime
    
    # Se date_from e date_to forem fornecidos, usar esses valores
    if date_from and date_to:
        start_date = date_from
        end_date = date_to
    else:
        # Usar período de faturação 26-25 por defeito
        if not month:
            month = datetime.now().month
        if not year:
            year = datetime.now().year
        
        # Período de faturação: dia 26 do mês anterior até dia 25 do mês atual
        # Para Janeiro, por exemplo: 26 de Dezembro a 25 de Janeiro
        if month == 1:
            start_date = f"{year - 1}-12-26"
        else:
            start_date = f"{year}-{month - 1:02d}-26"
        
        end_date = f"{year}-{month:02d}-25"
    
    entries = await db.time_entries.find({
        "user_id": user_id,
        "date": {"$gte": start_date, "$lte": end_date}
    }, {"_id": 0}).sort("date", -1).to_list(1000)
    
    # Buscar férias e folgas (vacation_requests) para o período
    vacation_requests = await db.vacation_requests.find({
        "user_id": user_id,
        "$or": [
            {"start_date": {"$gte": start_date, "$lte": end_date}},
            {"end_date": {"$gte": start_date, "$lte": end_date}},
            {"start_date": {"$lte": start_date}, "end_date": {"$gte": end_date}}
        ]
    }, {"_id": 0}).to_list(500)
    
    # Buscar faltas (absences) para o período
    absences = await db.absences.find({
        "user_id": user_id,
        "date": {"$gte": start_date, "$lte": end_date}
    }, {"_id": 0}).to_list(500)
    
    # Criar mapa de justificações por data
    justifications = {}
    
    # Processar férias e folgas
    for vac in vacation_requests:
        vac_type = vac.get("type", "vacation")
        vac_start = vac.get("start_date")
        vac_end = vac.get("end_date", vac_start)
        
        if vac_start:
            # Gerar todas as datas no intervalo
            try:
                start_dt = datetime.strptime(vac_start, "%Y-%m-%d")
                end_dt = datetime.strptime(vac_end, "%Y-%m-%d") if vac_end else start_dt
                current_dt = start_dt
                while current_dt <= end_dt:
                    date_str = current_dt.strftime("%Y-%m-%d")
                    if date_str >= start_date and date_str <= end_date:
                        if vac_type == "folga":
                            justifications[date_str] = {"type": "folga", "label": "Dia de Folga"}
                        elif vac_type == "cancelamento_ferias":
                            justifications[date_str] = {"type": "cancelamento_ferias", "label": "Férias Canceladas"}
                        else:
                            justifications[date_str] = {"type": "ferias", "label": "Dia de Férias"}
                    current_dt += timedelta(days=1)
            except (ValueError, KeyError):
                pass
    
    # Processar faltas
    for absence in absences:
        absence_date = absence.get("date")
        if absence_date:
            justifications[absence_date] = {"type": "falta", "label": "Falta"}
    
    return {
        "entries": entries, 
        "month": month, 
        "year": year, 
        "date_from": start_date, 
        "date_to": end_date,
        "justifications": justifications
    }

@router.get("/admin/time-entries/{entry_id}")
async def admin_get_time_entry(
    entry_id: str,
    current_user: dict = Depends(get_current_admin),
):
    """Devolve uma única picagem por id. Usado pelo link
    `/admin/time-entries?entry_id=...` incluído nos emails de autorização
    para o admin poder saltar directamente para a picagem em causa."""
    entry = await db.time_entries.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada não encontrada")
    return entry


@router.put("/admin/time-entries/{entry_id}")
async def admin_update_time_entry(
    entry_id: str,
    update_data: dict,
    current_user: dict = Depends(get_current_admin)
):
    """Update a time entry (admin only)"""
    from datetime import datetime
    
    # Find entry
    entry = await db.time_entries.find_one({"id": entry_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada não encontrada")
    
    # Calculate total hours if times are provided
    if "start_time" in update_data and "end_time" in update_data:
        start = normalizar_tempo(parse_stored_datetime(update_data["start_time"]))
        end = normalizar_tempo(parse_stored_datetime(update_data["end_time"]))
        total_minutes = int((end - start).total_seconds() / 60)
        update_data["total_hours"] = total_minutes / 60
    
    # Update entry
    await db.time_entries.update_one(
        {"id": entry_id},
        {"$set": update_data}
    )
    
    logging.info(f"Admin {current_user['sub']} updated time entry {entry_id}")
    
    return {"message": "Entrada atualizada com sucesso"}

@router.delete("/admin/time-entries/{entry_id}")
async def admin_delete_time_entry(
    entry_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """Delete a time entry (admin only)"""
    result = await db.time_entries.delete_one({"id": entry_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entrada não encontrada")
    
    logging.info(f"Admin {current_user['sub']} deleted time entry {entry_id}")
    
    return {"message": "Entrada eliminada com sucesso"}

@router.post("/admin/time-entries")
async def admin_create_time_entry(
    entry_data: dict,
    current_user: dict = Depends(get_current_admin)
):
    """Create a time entry for any user (admin only)"""
    from datetime import datetime
    import uuid
    
    user_id = entry_data.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id é obrigatório")
    
    # Verify user exists
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    
    # Parse times
    start_time = normalizar_tempo(parse_stored_datetime(entry_data["start_time"]))
    end_time = normalizar_tempo(parse_stored_datetime(entry_data["end_time"]))
    
    # Calculate total hours (sem segundos)
    total_minutes = int((end_time - start_time).total_seconds() / 60)
    total_hours = total_minutes / 60
    
    # Create entry
    new_entry = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "date": entry_data["date"],
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "total_hours": total_hours,
        "status": "completed",
        "observations": entry_data.get("observations", ""),
        "outside_residence_zone": entry_data.get("outside_residence_zone", False),
        "location_description": entry_data.get("location_description", ""),
        "created_at": datetime.now().isoformat(),
        "created_by_admin": current_user["sub"]
    }
    
    await db.time_entries.insert_one(new_entry)
    
    logging.info(f"Admin {current_user['sub']} created time entry for user {user_id}")
    
    return {"message": "Entrada criada com sucesso", "entry_id": new_entry["id"]}

