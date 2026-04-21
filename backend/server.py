from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Form, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import math
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr, field_validator
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta, date, time
import jwt
from passlib.context import CryptContext
import shutil
from io import BytesIO
import sys
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
sys.path.insert(0, str(Path(__file__).parent))
from holidays import is_overtime_day, get_holidays_for_year, get_billing_period_dates, is_holiday, is_weekend
from excel_report import generate_monthly_report
from pdf_report import generate_monthly_pdf_report
from pdf_report_simple import generate_monthly_pdf_report as generate_pdf_simple
from import_excel import parse_excel_timesheet
from import_pdf import parse_pdf_timesheet
from ot_pdf_report import generate_ot_pdf
from pc_pdf_report import generate_pc_pdf
from folha_horas_pdf import generate_folha_horas_pdf
from manual_pdf import create_manual_pdf
from notification_system import notification_loop, NotificationSystem
from hours_calculator import calcular_breakdown_completo
from cronometro_logic import segmentar_periodo
from migrations import run_migrations
from notifications_scheduler import (
    check_clock_in_status,
    check_clock_out_status,
    handle_overtime_start,
    process_authorization_decision,
    send_push_to_admins,
    send_push_notification,
    check_upcoming_services
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env', override=False)

# MongoDB connection
# Em produção, Emergent fornece via variáveis de ambiente
# Em desenvolvimento, usa .env local
mongo_url = os.environ.get('MONGO_URL', 'mongodb://mongodb:27017')
db_name = os.environ.get('DB_NAME', 'emergent')

# Log de conexão
logging.info(f"🔌 MongoDB: {mongo_url[:40]}... | DB: {db_name}")

client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
SECRET_KEY = os.environ.get('SECRET_KEY', 'hwi-timeclock-secret-key-2025')
ALGORITHM = "HS256"



# ============ Reverse Geocoding ============

async def reverse_geocode(latitude: float, longitude: float) -> dict:
    """
    Converte coordenadas GPS em endereço usando OpenStreetMap Nominatim.
    Retorna localidade, zona, município, país e endereço formatado.
    
    Prioridade para localidade:
    1. village (vila/aldeia) - ex: Fernão Ferro
    2. town (cidade pequena)
    3. suburb (subúrbio/freguesia)
    4. neighbourhood (bairro)
    5. city (cidade grande)
    6. municipality (concelho) - ex: Seixal (só se não houver outra opção)
    
    Zona específica (se existir):
    - industrial, commercial, retail, aeroway, etc.
    """
    try:
        url = f"https://nominatim.openstreetmap.org/reverse"
        params = {
            "lat": latitude,
            "lon": longitude,
            "format": "json",
            "addressdetails": 1,
            "accept-language": "pt",
            "zoom": 18  # Máxima precisão (nível de rua/edifício)
        }
        headers = {
            "User-Agent": "HWI-Ponto/1.0 (geral@hwi.pt)"  # Obrigatório para Nominatim
        }
        
        async with httpx.AsyncClient(timeout=5.0) as http_client:
            response = await http_client.get(url, params=params, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                address = data.get("address", {})
                
                # Priorizar localidade específica sobre município
                # Ordem: village > town > suburb > neighbourhood > city_district > city > municipality
                locality = (
                    address.get("village") or      # Vila/aldeia (ex: Fernão Ferro)
                    address.get("town") or         # Cidade pequena
                    address.get("suburb") or       # Subúrbio/freguesia
                    address.get("neighbourhood") or # Bairro
                    address.get("city_district") or # Distrito da cidade
                    address.get("hamlet")          # Lugar pequeno
                )
                
                # Município/Concelho (informação secundária)
                municipality = (
                    address.get("city") or         # Cidade principal
                    address.get("municipality") or # Município
                    address.get("county")          # Concelho
                )
                
                # Zona específica (parque industrial, zona comercial, etc.)
                zone = (
                    address.get("industrial") or   # Parque industrial
                    address.get("commercial") or   # Zona comercial
                    address.get("retail") or       # Zona de retalho
                    address.get("aeroway") or      # Aeroporto
                    address.get("amenity") or      # Serviço/amenidade
                    address.get("building") or     # Edifício específico
                    address.get("leisure")         # Zona de lazer
                )
                
                # Se não encontrou localidade específica, usar município
                if not locality:
                    locality = municipality
                    municipality = address.get("county") or address.get("state")
                
                result = {
                    "locality": locality,           # Localidade principal (ex: Fernão Ferro)
                    "zone": zone,                   # Zona específica (ex: Parque Industrial)
                    "municipality": municipality,   # Concelho (ex: Seixal) - secundário
                    "city": locality,               # Manter compatibilidade
                    "region": address.get("state") or address.get("county"),
                    "country": address.get("country"),
                    "country_code": address.get("country_code", "").upper(),
                    "postcode": address.get("postcode"),
                    "road": address.get("road"),
                    "house_number": address.get("house_number"),
                    "formatted": data.get("display_name"),
                    "raw_address": address
                }
                
                # Log detalhado
                location_str = locality or municipality or "Desconhecido"
                if zone:
                    location_str = f"{zone}, {location_str}"
                logging.info(f"📍 Geocoding: {location_str} ({result.get('country')})")
                
                return result
            else:
                logging.warning(f"Geocoding failed: HTTP {response.status_code}")
                return None
                
    except httpx.ConnectError:
        logging.warning("Geocoding: Sem acesso à internet externa (normal em ambiente de preview)")
        return None
    except httpx.TimeoutException:
        logging.warning("Geocoding: Timeout ao contactar servidor")
        return None
    except Exception as e:
        logging.error(f"Geocoding error: {str(e)}")
        return None


# Create the main app without a prefix
app = FastAPI()


@app.middleware("http")
async def error_logging_middleware(request, call_next):
    """Captura erros 500 e regista-os automaticamente na base de dados."""
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        path = str(request.url.path)
        context = "Sistema"
        action = f"{request.method} {path}"
        if "relatorios-tecnicos" in path:
            parts = path.split("/")
            for i, p in enumerate(parts):
                if p == "relatorios-tecnicos" and i + 1 < len(parts):
                    context = f"FS (id:{parts[i+1][:8]}...)"
                    break
            if "pdf" in path.lower():
                action = "Gerar/Download PDF"
            elif "cronometro" in path.lower():
                action = "Cronometro"
        elif "time-entries" in path:
            context = "Ponto"
        elif "pedidos-cotacao" in path:
            context = "Pedido de Cotacao"
        elif "equipamentos" in path:
            context = "Equipamentos"
        try:
            error_doc = {
                "id": str(uuid.uuid4()),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "context": context,
                "action": action,
                "error_message": str(e)[:2000],
                "details": {"traceback": tb[:1500], "path": path, "method": request.method},
                "user_id": None,
                "username": None,
                "resolved": False
            }
            await db.app_errors.insert_one(error_doc)
        except Exception:
            pass
        logging.error(f"[MIDDLEWARE ERROR] {context} | {action} | {e}")
        raise



# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ============ Root Health Endpoint for Deployment ============

@app.get("/health")
async def root_health_check():
    """Health check endpoint for deployment - at root path /health"""
    try:
        # Testar conexão com MongoDB
        await db.users.find_one({})
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)[:50]}"
    
    return {
        "status": "healthy",
        "database": db_status,
        "service": "hwi-ponto-backend"
    }


async def check_annual_vacation_reset(database):
    """
    Verificação anual de férias no startup/deploy.
    Para cada vacation_balance existente:
    - Se não tem 'year' ou é de um ano anterior ao corrente:
      - Soma 22 dias ao saldo existente (ex: 5 → 27, -10 → 12)
      - Reseta days_taken para 0
      - Atualiza year para o ano corrente
    """
    from datetime import date
    current_year = date.today().year
    
    # Iterar pelos balances existentes (cada técnico com férias configuradas)
    balances = await database.vacation_balances.find({}, {"_id": 0}).to_list(None)
    
    # Mapear usernames para logs
    users_map = {}
    users = await database.users.find({}, {"_id": 0, "id": 1, "username": 1}).to_list(None)
    for u in users:
        users_map[u["id"]] = u.get("username", u["id"][:8])
    
    updated_count = 0
    
    for balance in balances:
        user_id = balance["user_id"]
        balance_year = balance.get("year", 0)
        
        if balance_year >= current_year:
            continue
        
        # Ano anterior — transitar saldo + 22 novos dias
        old_available = balance.get("days_available", 0)
        new_available = old_available + 22
        username = users_map.get(user_id, user_id[:8])
        
        await database.vacation_balances.update_one(
            {"user_id": user_id},
            {"$set": {
                "year": current_year,
                "days_earned": 22,
                "days_taken": 0,
                "days_available": new_available,
                "updated_at": get_now_local().isoformat()
            }}
        )
        
        # Guardar log da transição para histórico
        await database.vacation_annual_log.insert_one({
            "user_id": user_id,
            "username": username,
            "from_year": balance_year if balance_year else current_year - 1,
            "to_year": current_year,
            "previous_available": old_available,
            "previous_taken": balance.get("days_taken", 0),
            "previous_earned": balance.get("days_earned", 0),
            "new_available": new_available,
            "transition_date": get_now_local().isoformat()
        })
        
        updated_count += 1
        logging.info(f"  Férias {current_year}: {username} — saldo anterior: {old_available}, novo: {new_available}")
    
    if updated_count > 0:
        logging.info(f"✅ Férias anuais: {updated_count} utilizador(es) atualizados para {current_year}")
    else:
        logging.info(f"✅ Férias anuais: todos já atualizados para {current_year}")


# ============ Startup Event ============

@app.on_event("startup")
async def startup_event():
    """Iniciar loop de notificações em background e criar admin se necessário"""
    
    # Executar migrações pendentes
    logging.info("🔄 A verificar migrações pendentes...")
    try:
        await run_migrations(db)
    except Exception as e:
        logging.error(f"❌ Erro ao executar migrações: {str(e)}")
    
    # Migração: Garantir que todos os registos têm minutos_trabalhados e horas_arredondadas consistentes
    try:
        from cronometro_logic import arredondar_horas as _arredondar_horas
        all_registos = await db.registos_tecnico_ot.find(
            {"minutos_trabalhados": None}, 
            {"_id": 0, "id": 1, "tipo": 1, "minutos_trabalhados": 1, "horas_arredondadas": 1, "hora_inicio_segmento": 1, "hora_fim_segmento": 1}
        ).to_list(None)
        updated = 0
        for r in all_registos:
            update_fields = {}
            tipo = r.get("tipo", "trabalho")
            hi = r.get("hora_inicio_segmento")
            hf = r.get("hora_fim_segmento")
            horas = r.get("horas_arredondadas", 0)
            
            if hi and hf:
                if isinstance(hi, str):
                    hi = parse_stored_datetime(hi)
                if isinstance(hf, str):
                    hf = parse_stored_datetime(hf)
                calc_mins = (hf - hi).total_seconds() / 60
                if calc_mins > 0:
                    update_fields["minutos_trabalhados"] = int(calc_mins)
                    if tipo == "viagem":
                        update_fields["horas_arredondadas"] = round(calc_mins / 60, 4)
                    else:
                        update_fields["horas_arredondadas"] = _arredondar_horas(calc_mins)
                else:
                    update_fields["minutos_trabalhados"] = 0
            elif horas > 0:
                update_fields["minutos_trabalhados"] = int(horas * 60)
            else:
                update_fields["minutos_trabalhados"] = 0
            
            if update_fields:
                await db.registos_tecnico_ot.update_one({"id": r["id"]}, {"$set": update_fields})
                updated += 1
        if updated > 0:
            logging.info(f"Migração registos: {updated} registos corrigidos (minutos + horas)")
    except Exception as e:
        logging.error(f"❌ Erro na migração de viagem: {str(e)}")
    
    # Migração: Mover relatorio_assistencia das intervenções para relatorios_assistencia
    try:
        intervs_to_migrate = await db.intervencoes_relatorio.find(
            {'relatorio_assistencia': {'$exists': True, '$ne': None, '$ne': ''}},
            {'_id': 1, 'relatorio_id': 1, 'data_intervencao': 1, 'relatorio_assistencia': 1, 'equipamento_id': 1}
        ).to_list(None)
        intervs_to_migrate = [i for i in intervs_to_migrate if i.get('relatorio_assistencia') and str(i['relatorio_assistencia']).strip()]
        migrated = 0
        for iv in intervs_to_migrate:
            texto = iv['relatorio_assistencia'].strip()
            existing = await db.relatorios_assistencia.find_one({
                'relatorio_id': iv['relatorio_id'],
                'data_intervencao': iv['data_intervencao'],
                'texto': texto
            })
            if not existing:
                equip_ids = [iv['equipamento_id']] if iv.get('equipamento_id') else []
                await db.relatorios_assistencia.insert_one({
                    'id': str(uuid.uuid4()),
                    'relatorio_id': iv['relatorio_id'],
                    'texto': texto,
                    'equipamento_ids': equip_ids,
                    'data_intervencao': iv['data_intervencao']
                })
                migrated += 1
            await db.intervencoes_relatorio.update_one({'_id': iv['_id']}, {'$set': {'relatorio_assistencia': None}})
        if migrated > 0:
            logging.info(f"Migração rel. assistência: {migrated} registos movidos para relatorios_assistencia")
        else:
            logging.info("Migração rel. assistência: nada a migrar")
    except Exception as e:
        logging.error(f"Erro na migração rel. assistência: {str(e)}")
    
    # Criar índices para melhorar performance
    logging.info("🔧 Criando índices de base de dados...")
    try:
        # Índices para relatórios técnicos
        await db.relatorios_tecnicos.create_index("numero_assistencia")
        await db.relatorios_tecnicos.create_index("status")
        await db.relatorios_tecnicos.create_index("cliente_id")
        await db.relatorios_tecnicos.create_index([("numero_assistencia", -1)])
        
        # Índices para equipamentos
        await db.equipamentos_ot.create_index("relatorio_id")
        
        # Índices para clientes
        await db.clientes.create_index("nome")
        await db.clientes.create_index("ativo")
        
        # Índices para registos de tempo
        await db.registos_tecnico_ot.create_index("relatorio_id")
        await db.registos_tecnico_ot.create_index("tecnico_id")
        
        # Índices para fotos, intervenções, assinaturas, cronómetros, materiais, despesas
        await db.fotos_ot.create_index("relatorio_id")
        await db.intervencoes.create_index("relatorio_id")
        await db.assinaturas.create_index("relatorio_id")
        await db.cronometros.create_index("relatorio_id")
        await db.materiais_ot.create_index("relatorio_id")
        await db.despesas_ot.create_index("relatorio_id")
        
        # Índices para users
        await db.users.create_index("username", unique=True)
        
        logging.info("✅ Índices criados com sucesso!")
    except Exception as e:
        logging.warning(f"⚠️ Alguns índices já existem ou erro: {str(e)}")
    
    # Verificar se existe algum usuário
    user_count = await db.users.count_documents({})
    
    if user_count == 0:
        # Criar primeiro admin automaticamente
        logging.info("⚠️ Banco vazio detectado! Criando primeiro admin...")
        
        hashed = pwd_context.hash("admin123")
        
        admin_user = User(
            username="admin",
            email="admin@hwi.pt",
            hashed_password=hashed,
            full_name="Administrador",
            phone="000000000",
            is_admin=True
        )
        
        user_dict = admin_user.dict()
        user_dict["created_at"] = user_dict["created_at"].isoformat()
        
        await db.users.insert_one(user_dict)
        
        logging.info("✅ Primeiro admin criado automaticamente!")
        logging.info("   Username: admin")
        logging.info("   Password: admin123")
        logging.info("   ⚠️ MUDE A SENHA APÓS PRIMEIRO LOGIN!")
    
    # Iniciar sistema de notificações
    asyncio.create_task(notification_loop(db))
    logging.info("Sistema de notificações iniciado (verificação a cada 15 minutos)")
    
    # ========== Verificação anual de férias ==========
    await check_annual_vacation_reset(db)
    
    # Iniciar scheduler para verificações de ponto
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger
    import pytz
    
    scheduler = AsyncIOScheduler(timezone=pytz.timezone('Europe/Lisbon'))
    
    # Obter URL base do frontend (para links nos emails)
    base_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000').rstrip('/')
    
    async def scheduled_clock_in_check():
        """Verificação das 09:30 - Utilizadores sem entrada"""
        logging.info("🕘 Executando verificação de entrada às 09:30...")
        try:
            result = await check_clock_in_status(db, base_url)
            logging.info(f"Verificação 09:30 concluída: {result.get('notified_count', 0)} notificações enviadas")
        except Exception as e:
            logging.error(f"Erro na verificação 09:30: {str(e)}")
    
    async def scheduled_clock_out_check():
        """Verificação das 18:15 - Utilizadores com ponto ativo"""
        logging.info("🕕 Executando verificação de saída às 18:15...")
        try:
            result = await check_clock_out_status(db, base_url)
            logging.info(f"Verificação 18:15 concluída: {result.get('notified_count', 0)} notificações enviadas")
        except Exception as e:
            logging.error(f"Erro na verificação 18:15: {str(e)}")
    
    # Agendar verificação das 09:30 (dias úteis)
    scheduler.add_job(
        scheduled_clock_in_check,
        CronTrigger(hour=9, minute=30, day_of_week='mon-fri'),
        id='clock_in_check',
        replace_existing=True
    )
    
    # Agendar verificação das 18:15 (dias úteis)
    scheduler.add_job(
        scheduled_clock_out_check,
        CronTrigger(hour=18, minute=15, day_of_week='mon-fri'),
        id='clock_out_check',
        replace_existing=True
    )
    
    # Verificar serviços próximos a cada 15 minutos (dias úteis, 07:00-20:00)
    async def scheduled_service_reminder():
        logging.info("🔔 Verificando serviços próximos...")
        try:
            result = await check_upcoming_services(db)
            if result.get('notified_count', 0) > 0:
                logging.info(f"Lembretes de serviço: {result.get('notified_count', 0)} enviados")
        except Exception as e:
            logging.error(f"Erro na verificação de serviços: {str(e)}")
    
    scheduler.add_job(
        scheduled_service_reminder,
        CronTrigger(minute='0,15,30,45', hour='7-20', day_of_week='mon-fri'),
        id='service_reminder_check',
        replace_existing=True
    )
    
    scheduler.start()
    logging.info("📅 Scheduler de verificações de ponto iniciado (09:30 e 18:15)")
    logging.info(f"   + Lembretes de serviço a cada 15 min (07:00-20:00)")
    logging.info(f"   Timezone: Europe/Lisbon")
    logging.info(f"   Base URL: {base_url}")

# ============ Models (importados de models.py) ============

from models import (
    User, UserCreate, UserUpdate, UserLogin, ForgotPasswordRequest, ChangePasswordRequest, Token,
    Cliente, Equipamento,
    RelatorioTecnico, RelatorioTecnicoCreate, TecnicoRelatorio, CronometroOT, RegistoTecnicoOT,
    EquipamentoOT, MaterialOT, DespesaOT, PedidoCotacao,
    IntervencaoRelatorio, RelatorioAssistencia, MaterialRelatorio, FotoRelatorio, AssinaturaRelatorio,
    EnviarEmailRequest, ReferenceToken,
    Notification, PushSubscription,
    TimeEntry, TimeEntryStart, TimeEntryEnd, TimeEntryUpdate, ManualTimeEntryCreate,
    VacationRequest, VacationRequestCreate, VacationBalance,
    Absence, AbsenceCreate,
    ServiceAppointment, ServiceAppointmentCreate, ServiceWithOTCreate, ServiceAppointmentUpdate,
    CompanyInfo, Tarifa, TarifaCreate, TarifaUpdate,
    TabelaPrecoConfig, TabelaPrecoCreate, TabelaPrecoConfigUpdate,
    FolhaHorasRequest,
    OvertimeAuthorization, DayAuthorization, OvertimeDecision,
)


# ============ Auth Functions ============

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token inválido")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

async def get_current_admin(current_user: dict = Depends(get_current_user)):
    """Verify if current user is admin"""
    user = await db.users.find_one({"id": current_user["sub"]})
    if not user or not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas administradores.")
    return current_user

import pytz

LISBON_TZ = pytz.timezone('Europe/Lisbon')


def get_now_local(client_time_str: str = None) -> datetime:
    """
    Returns current local datetime (offset-aware).
    If client_time is provided (ISO with offset), parse and use it.
    Otherwise, convert UTC now to Europe/Lisbon.
    """
    if client_time_str:
        try:
            dt = datetime.fromisoformat(client_time_str)
            if dt.tzinfo is None:
                # Naive datetime - assume Europe/Lisbon
                dt = LISBON_TZ.localize(dt)
            return dt
        except (ValueError, TypeError):
            pass
    # Fallback: use Europe/Lisbon timezone
    return datetime.now(LISBON_TZ)


def get_today_local(client_time_str: str = None) -> tuple:
    """
    Returns (today_str 'YYYY-MM-DD', today_date) in local timezone.
    """
    now = get_now_local(client_time_str)
    return now.strftime("%Y-%m-%d"), now.date()


def format_time_from_iso(iso_str: str) -> str:
    """
    Format a stored ISO datetime string to HH:MM in Lisbon timezone.
    Handles all legacy formats:
    - Naive (no TZ): treated as Europe/Lisbon local time
    - UTC (+00:00/Z): converted to Lisbon time
    - Local (+01:00 etc): converted to Lisbon time
    """
    try:
        dt = datetime.fromisoformat(str(iso_str).replace('Z', '+00:00'))
        if dt.tzinfo is None:
            # Naive datetime — assume it was already local Portuguese time
            dt = LISBON_TZ.localize(dt)
        dt = dt.astimezone(LISBON_TZ)
        return dt.strftime("%H:%M")
    except (ValueError, TypeError):
        return "00:00"


def parse_stored_datetime(iso_str: str) -> datetime:
    """
    Parse a stored datetime string and ensure it's timezone-aware.
    Handles all legacy formats:
    - Naive (no TZ): localized to Europe/Lisbon
    - UTC (+00:00/Z): kept as-is (aware)
    - Local (+01:00 etc): kept as-is (aware)
    Always returns an offset-aware datetime safe for subtraction.
    """
    dt = datetime.fromisoformat(str(iso_str).replace('Z', '+00:00'))
    if dt.tzinfo is None:
        dt = LISBON_TZ.localize(dt)
    return dt


def normalizar_tempo(dt: datetime) -> datetime:
    """
    Remove segundos e microsegundos de um datetime.
    Ex: 12:02:49 → 12:02:00, 17:11:45 → 17:11:00
    Deve ser aplicado a start_time e end_time ANTES de calcular diferenças.
    """
    return dt.replace(second=0, microsecond=0)


async def log_app_error(
    context: str,
    action: str,
    error_message: str,
    details: dict = None,
    user_id: str = None,
    username: str = None
):
    """
    Regista um erro na base de dados para análise no admin dashboard.
    
    context: Onde ocorreu (ex: "FS#356", "Ponto", "Cronómetro", "PC_001#356")
    action: O que tentava fazer (ex: "Download PDF", "Gerar PDF", "Iniciar Cronómetro")
    error_message: Mensagem de erro resumida
    details: Detalhes adicionais (traceback, dados, etc.)
    """
    try:
        error_doc = {
            "id": str(uuid.uuid4()),
            "timestamp": get_now_local().isoformat(),
            "context": context,
            "action": action,
            "error_message": str(error_message)[:2000],
            "details": details or {},
            "user_id": user_id,
            "username": username,
            "resolved": False
        }
        await db.app_errors.insert_one(error_doc)
        logging.error(f"[APP ERROR] {context} | {action} | {error_message}")
    except Exception as log_err:
        logging.error(f"Falha ao registar erro: {log_err}")


def truncar_horas_para_minutos(horas: float) -> float:
    """
    Trunca horas para minutos inteiros (sem segundos).
    """
    total_minutos = math.floor(horas * 60)
    return total_minutos / 60

def truncar_segundos_para_horas(segundos: float) -> float:
    """
    Converte segundos para horas, truncando os segundos restantes.
    """
    total_minutos = math.floor(segundos / 60)
    return total_minutos / 60

def calcular_minutos_de_entradas(entries: list) -> int:
    """
    Calcula total de minutos de uma lista de entradas, normalizando timestamps (sem segundos).
    Usa aritmética inteira para evitar erros de arredondamento em somas.
    """
    total_minutos = 0
    for e in entries:
        if e.get("start_time") and e.get("end_time"):
            start = parse_stored_datetime(str(e["start_time"]))
            end = parse_stored_datetime(str(e["end_time"]))
            start = normalizar_tempo(start)
            end = normalizar_tempo(end)
            diff = (end - start).total_seconds()
            total_minutos += int(diff / 60)
    return total_minutos

def calculate_hours_breakdown(total_hours: float, is_special_day: bool) -> dict:
    """
    FUNÇÃO DEPRECATED - Mantida para compatibilidade
    Use calcular_breakdown_completo() para novos códigos
    
    Esta função ainda é usada em alguns lugares mas será removida
    """
    # Truncar segundos
    total_minutes = math.floor(total_hours * 60)
    total_hours = total_minutes / 60
    
    if is_special_day:
        return {
            "regular_hours": round(0.0, 2),
            "overtime_hours": round(0.0, 2),
            "saturday_hours": round(0.0, 2),
            "special_hours": round(total_hours, 2)
        }
    else:
        if total_hours <= 8.0:
            return {
                "regular_hours": round(total_hours, 2),
                "overtime_hours": round(0.0, 2),
                "saturday_hours": round(0.0, 2),
                "special_hours": round(0.0, 2)
            }
        else:
            return {
                "regular_hours": round(8.0, 2),
                "overtime_hours": round(total_hours - 8.0, 2),
                "saturday_hours": round(0.0, 2),
                "special_hours": round(0.0, 2)
            }


async def send_service_email(technician_emails: List[str], service_data: dict, action_type: str):
    """Send email notification about service appointment"""
    try:
        smtp_host = os.environ.get('SMTP_HOST')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_user = os.environ.get('SMTP_USER')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        smtp_from = os.environ.get('SMTP_FROM')
        
        # Email subject based on action
        subjects = {
            "created": "Novo Serviço Agendado",
            "updated": "Serviço Atualizado",
            "cancelled": "Serviço Cancelado"
        }
        subject = subjects.get(action_type, "Notificação de Serviço")
        
        # Build email body
        time_info = f" às {service_data.get('time_slot', 'Dia inteiro')}" if service_data.get('time_slot') else " (Dia inteiro)"
        
        html_body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; color: #333;">
                <h2 style="color: #0066cc;">{subject}</h2>
                <p>Foi {action_type == 'created' and 'agendado um novo serviço' or action_type == 'updated' and 'atualizado um serviço' or 'cancelado um serviço'} para o qual foi atribuído como técnico:</p>
                
                <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; background-color: #f5f5f5; font-weight: bold;">Cliente:</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">{service_data.get('client_name', '')}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; background-color: #f5f5f5; font-weight: bold;">Localidade:</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">{service_data.get('location', '')}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; background-color: #f5f5f5; font-weight: bold;">Motivo:</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">{service_data.get('service_reason', '')}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; background-color: #f5f5f5; font-weight: bold;">Data:</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">{service_data.get('date', '')}{time_info}</td>
                    </tr>
                    {f'<tr><td style="padding: 10px; border: 1px solid #ddd; background-color: #f5f5f5; font-weight: bold;">Observações:</td><td style="padding: 10px; border: 1px solid #ddd;">{service_data.get("observations", "")}</td></tr>' if service_data.get('observations') else ''}
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; background-color: #f5f5f5; font-weight: bold;">Estado:</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">{service_data.get('status', 'scheduled')}</td>
                    </tr>
                </table>
                
                <p style="margin-top: 20px;">Aceda ao sistema de gestão para mais detalhes.</p>
                
                <p style="color: #666; font-size: 12px; margin-top: 30px;">
                    Esta é uma mensagem automática. Por favor não responda a este email.
                </p>
            </body>
        </html>
        """
        
        # Send to each technician
        for email in technician_emails:
            message = MIMEMultipart('alternative')
            message['Subject'] = subject
            message['From'] = smtp_from
            message['To'] = email
            
            html_part = MIMEText(html_body, 'html')
            message.attach(html_part)
            
            await aiosmtplib.send(
                message,
                hostname=smtp_host,
                port=smtp_port,
                username=smtp_user,
                password=smtp_password,
                start_tls=True
            )
            
        logging.info(f"Service email sent to {len(technician_emails)} technicians")
    except Exception as e:
        logging.error(f"Failed to send service email: {str(e)}")
        # Don't raise exception, just log - email failure shouldn't break service creation


async def send_reference_link_email(client_email: str, client_name: str, fs_number: int, reference_link: str):
    """Envia email ao cliente com link para inserir referência interna"""
    try:
        smtp_host = os.environ.get('SMTP_HOST')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_user = os.environ.get('SMTP_USER')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        smtp_from = os.environ.get('SMTP_FROM')

        subject = f"HWI - Referência Interna para Folha de Serviço #{fs_number}"

        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto;">
            <div style="background: #1e40af; color: white; padding: 20px; text-align: center;">
                <h2 style="margin: 0;">HWI Unipessoal, Lda</h2>
                <p style="margin: 5px 0 0; opacity: 0.9;">Referência Interna</p>
            </div>
            <div style="padding: 30px 20px;">
                <p>Exmo(a) Sr(a),</p>
                <p>Foi criada a <strong>Folha de Serviço #{fs_number}</strong> associada à vossa empresa <strong>{client_name}</strong>.</p>
                <p>Solicitamos que insira a vossa referência interna (nº encomenda, ordem de compra, etc.) através do link abaixo:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reference_link}" style="background: #1e40af; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                        Inserir Referência Interna
                    </a>
                </div>
                <p style="color: #666; font-size: 13px;">Este link é de utilização única e expira em 30 dias.</p>
                <p style="color: #666; font-size: 13px;">Se não conseguir clicar no botão, copie e cole este link no seu navegador:<br/>
                <a href="{reference_link}" style="color: #1e40af; word-break: break-all;">{reference_link}</a></p>
            </div>
            <div style="background: #f5f5f5; padding: 15px 20px; text-align: center; font-size: 12px; color: #999;">
                <p style="margin: 0;">Esta é uma mensagem automática. Por favor não responda a este email.</p>
                <p style="margin: 5px 0 0;">HWI Unipessoal, Lda</p>
            </div>
        </body>
        </html>
        """

        message = MIMEMultipart('alternative')
        message['Subject'] = subject
        message['From'] = smtp_from
        message['To'] = client_email
        message.attach(MIMEText(html_body, 'html'))

        await aiosmtplib.send(
            message,
            hostname=smtp_host,
            port=smtp_port,
            username=smtp_user,
            password=smtp_password,
            start_tls=True
        )
        logging.info(f"Reference link email sent to {client_email}")
    except Exception as e:
        logging.error(f"Failed to send reference link email: {e}")


async def send_vacation_request_email(user_name: str, user_email: str, start_date: str, end_date: str, days_requested: int):
    """Send email to team when vacation is requested"""
    try:
        smtp_host = os.environ.get('SMTP_HOST')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_user = os.environ.get('SMTP_USER')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        smtp_from = os.environ.get('SMTP_FROM', 'geral@hwi.pt')
        
        # Format dates
        start_formatted = datetime.strptime(start_date, '%Y-%m-%d').strftime('%d/%m/%Y')
        end_formatted = datetime.strptime(end_date, '%Y-%m-%d').strftime('%d/%m/%Y')
        
        subject = f"Nova Solicitação de Férias — {user_name}"
        
        html_body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                <p>Olá,</p>
                
                <p>O(a) colaborador(a) <strong>{user_name}</strong> solicitou férias pelo sistema.</p>
                
                <h3 style="color: #0066cc; margin-top: 20px;">Período solicitado:</h3>
                <table style="border-collapse: collapse; margin: 15px 0;">
                    <tr>
                        <td style="padding: 8px 15px; background-color: #f5f5f5; font-weight: bold;">Início:</td>
                        <td style="padding: 8px 15px;">{start_formatted}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 15px; background-color: #f5f5f5; font-weight: bold;">Fim:</td>
                        <td style="padding: 8px 15px;">{end_formatted}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 15px; background-color: #f5f5f5; font-weight: bold;">Dias úteis:</td>
                        <td style="padding: 8px 15px;"><strong>{days_requested}</strong> dias</td>
                    </tr>
                </table>
                
                <p style="margin-top: 25px;">Por favor, acesse o painel de administração e aprove ou recuse a solicitação.</p>
                
                <p style="margin-top: 20px;">Aguardando sua decisão.</p>
                
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
                <p style="color: #666; font-size: 12px;">
                    Sistema de Gestão de Ponto | Emergent
                </p>
            </body>
        </html>
        """
        
        message = MIMEMultipart('alternative')
        message['Subject'] = subject
        message['From'] = smtp_from
        message['To'] = smtp_from  # Send to geral@hwi.pt
        
        html_part = MIMEText(html_body, 'html')
        message.attach(html_part)
        
        await aiosmtplib.send(
            message,
            hostname=smtp_host,
            port=smtp_port,
            username=smtp_user,
            password=smtp_password,
            start_tls=True
        )
        
        logging.info(f"Vacation request email sent to {smtp_from} for {user_name}")
    except Exception as e:
        logging.error(f"Failed to send vacation request email: {str(e)}")

async def send_vacation_decision_email(user_name: str, user_email: str, start_date: str, end_date: str, approved: bool, observations: str = None):
    """Send email to user when vacation request is approved/rejected"""
    try:
        smtp_host = os.environ.get('SMTP_HOST')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_user = os.environ.get('SMTP_USER')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        smtp_from = os.environ.get('SMTP_FROM', 'geral@hwi.pt')
        
        # Format dates
        start_formatted = datetime.strptime(start_date, '%Y-%m-%d').strftime('%d/%m/%Y')
        end_formatted = datetime.strptime(end_date, '%Y-%m-%d').strftime('%d/%m/%Y')
        
        status_text = "Aprovada" if approved else "Recusada"
        status_color = "#28a745" if approved else "#dc3545"
        
        subject = f"Solicitação de Férias — {status_text}"
        
        observations_html = ""
        if observations:
            observations_html = f"""
                <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid {status_color}; margin: 20px 0;">
                    <strong>Observações:</strong><br>
                    {observations}
                </div>
            """
        
        html_body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                <p>Olá <strong>{user_name}</strong>,</p>
                
                <p>Sua solicitação de férias para o período de <strong>{start_formatted}</strong> a <strong>{end_formatted}</strong> foi <span style="color: {status_color}; font-weight: bold;">{status_text.upper()}</span> pela administração.</p>
                
                {observations_html}
                
                <p style="margin-top: 25px;">Em caso de dúvidas, entre em contato com o RH.</p>
                
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
                <p style="color: #666; font-size: 12px;">
                    Equipe HWI
                </p>
            </body>
        </html>
        """
        
        message = MIMEMultipart('alternative')
        message['Subject'] = subject
        message['From'] = smtp_from
        message['To'] = user_email
        
        html_part = MIMEText(html_body, 'html')
        message.attach(html_part)
        
        await aiosmtplib.send(
            message,
            hostname=smtp_host,
            port=smtp_port,
            username=smtp_user,
            password=smtp_password,
            start_tls=True
        )
        
        logging.info(f"Vacation decision email sent to {user_email} - Status: {status_text}")
    except Exception as e:
        logging.error(f"Failed to send vacation decision email: {str(e)}")

async def send_absence_justification_email(user_name: str, user_email: str, absence_date: str, filename: str):
    """Send email to team when justification document is uploaded"""
    try:
        smtp_host = os.environ.get('SMTP_HOST')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_user = os.environ.get('SMTP_USER')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        smtp_from = os.environ.get('SMTP_FROM', 'geral@hwi.pt')
        
        # Format date
        date_formatted = datetime.strptime(absence_date, '%Y-%m-%d').strftime('%d/%m/%Y')
        
        subject = f"Documento de Justificativa de Falta — {user_name}"
        
        html_body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                <p>Olá,</p>
                
                <p>O(a) colaborador(a) <strong>{user_name}</strong> enviou um documento para justificar uma ausência.</p>
                
                <h3 style="color: #0066cc; margin-top: 20px;">Detalhes:</h3>
                <table style="border-collapse: collapse; margin: 15px 0;">
                    <tr>
                        <td style="padding: 8px 15px; background-color: #f5f5f5; font-weight: bold;">Data da falta:</td>
                        <td style="padding: 8px 15px;">{date_formatted}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 15px; background-color: #f5f5f5; font-weight: bold;">Documento enviado:</td>
                        <td style="padding: 8px 15px;"><strong>{filename}</strong> (ver no painel)</td>
                    </tr>
                </table>
                
                <p style="margin-top: 25px;">Acesse o sistema para validar e aprovar ou recusar a justificativa.</p>
                
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
                <p style="color: #666; font-size: 12px;">
                    Sistema de Gestão de Ponto | Emergent
                </p>
            </body>
        </html>
        """
        
        message = MIMEMultipart('alternative')
        message['Subject'] = subject
        message['From'] = smtp_from
        message['To'] = smtp_from  # Send to geral@hwi.pt
        
        html_part = MIMEText(html_body, 'html')
        message.attach(html_part)
        
        await aiosmtplib.send(
            message,
            hostname=smtp_host,
            port=smtp_port,
            username=smtp_user,
            password=smtp_password,
            start_tls=True
        )
        
        logging.info(f"Absence justification email sent to {smtp_from} for {user_name}")
    except Exception as e:
        logging.error(f"Failed to send absence justification email: {str(e)}")

async def send_time_entry_edit_notification_email(
    user_name: str, 
    user_email: str, 
    entry_date: str,
    before_data: dict,
    after_data: dict
):
    """Send email to user when admin edits their time entry"""
    try:
        smtp_host = os.environ.get('SMTP_HOST')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_user = os.environ.get('SMTP_USER')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        smtp_from = os.environ.get('SMTP_FROM', 'geral@hwi.pt')
        
        # Format date
        date_formatted = datetime.strptime(entry_date, '%Y-%m-%d').strftime('%d/%m/%Y')
        
        # Format times
        def format_time(time_str):
            if not time_str:
                return "N/A"
            try:
                dt = parse_stored_datetime(time_str)
                return dt.astimezone(LISBON_TZ).strftime('%H:%M')
            except:
                return time_str
        
        before_start = format_time(before_data.get('start_time'))
        before_end = format_time(before_data.get('end_time'))
        before_obs = before_data.get('observations', 'N/A')
        before_outside = "Sim" if before_data.get('outside_residence_zone') else "Não"
        before_location = before_data.get('location_description', 'N/A')
        
        after_start = format_time(after_data.get('start_time'))
        after_end = format_time(after_data.get('end_time'))
        after_obs = after_data.get('observations', 'N/A')
        after_outside = "Sim" if after_data.get('outside_residence_zone') else "Não"
        after_location = after_data.get('location_description', 'N/A')
        
        subject = f"Alteração no seu Registo de Horas — {date_formatted}"
        
        html_body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                <p>Olá, <strong>{user_name}</strong>!</p>
                
                <p>O administrador fez uma alteração no seu registo de horas.</p>
                
                <h3 style="color: #0066cc; margin-top: 20px;">Data do Registo:</h3>
                <p style="font-size: 16px;"><strong>{date_formatted}</strong></p>
                
                <h3 style="color: #cc6600; margin-top: 20px;">ANTES da alteração:</h3>
                <table style="border-collapse: collapse; margin: 15px 0; width: 100%;">
                    <tr>
                        <td style="padding: 8px 15px; background-color: #fff3e0; font-weight: bold; width: 40%;">Início:</td>
                        <td style="padding: 8px 15px; background-color: #fff3e0;">{before_start}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 15px; background-color: #ffe0b2; font-weight: bold;">Fim:</td>
                        <td style="padding: 8px 15px; background-color: #ffe0b2;">{before_end}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 15px; background-color: #fff3e0; font-weight: bold;">Observações:</td>
                        <td style="padding: 8px 15px; background-color: #fff3e0;">{before_obs}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 15px; background-color: #ffe0b2; font-weight: bold;">Fora de Zona:</td>
                        <td style="padding: 8px 15px; background-color: #ffe0b2;">{before_outside}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 15px; background-color: #fff3e0; font-weight: bold;">Localização:</td>
                        <td style="padding: 8px 15px; background-color: #fff3e0;">{before_location}</td>
                    </tr>
                </table>
                
                <h3 style="color: #009900; margin-top: 20px;">DEPOIS da alteração:</h3>
                <table style="border-collapse: collapse; margin: 15px 0; width: 100%;">
                    <tr>
                        <td style="padding: 8px 15px; background-color: #e8f5e9; font-weight: bold; width: 40%;">Início:</td>
                        <td style="padding: 8px 15px; background-color: #e8f5e9;">{after_start}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 15px; background-color: #c8e6c9; font-weight: bold;">Fim:</td>
                        <td style="padding: 8px 15px; background-color: #c8e6c9;">{after_end}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 15px; background-color: #e8f5e9; font-weight: bold;">Observações:</td>
                        <td style="padding: 8px 15px; background-color: #e8f5e9;">{after_obs}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 15px; background-color: #c8e6c9; font-weight: bold;">Fora de Zona:</td>
                        <td style="padding: 8px 15px; background-color: #c8e6c9;">{after_outside}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 15px; background-color: #e8f5e9; font-weight: bold;">Localização:</td>
                        <td style="padding: 8px 15px; background-color: #e8f5e9;">{after_location}</td>
                    </tr>
                </table>
                
                <p style="margin-top: 20px; padding: 10px; background-color: #ffffcc; border-left: 4px solid #ffeb3b;">
                    <strong>Atenção:</strong> Se você não reconhece esta alteração, entre em contato com a administração imediatamente.
                </p>
                
                <hr style="margin-top: 30px; border: none; border-top: 1px solid #ddd;">
                <p style="color: #666; font-size: 12px;">
                    Este é um email automático. Por favor, não responda.
                </p>
            </body>
        </html>
        """
        
        await send_email(
            to_email=user_email,
            subject=subject,
            html_body=html_body,
            smtp_host=smtp_host,
            port=smtp_port,
            username=smtp_user,
            password=smtp_password,
            start_tls=True
        )
        
        logging.info(f"Time entry edit notification sent to {user_email}")
    except Exception as e:
        logging.error(f"Failed to send time entry edit notification: {str(e)}")

async def send_absence_decision_email(user_name: str, user_email: str, absence_date: str, approved: bool, observations: str = None):
    """Send email to user when absence justification is approved/rejected"""
    try:
        smtp_host = os.environ.get('SMTP_HOST')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_user = os.environ.get('SMTP_USER')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        smtp_from = os.environ.get('SMTP_FROM', 'geral@hwi.pt')
        
        # Format date
        date_formatted = datetime.strptime(absence_date, '%Y-%m-%d').strftime('%d/%m/%Y')
        
        status_text = "Aprovada" if approved else "Recusada"
        status_color = "#28a745" if approved else "#dc3545"
        
        subject = f"Justificativa de Falta — {status_text}"
        
        observations_html = ""
        if observations:
            observations_html = f"""
                <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid {status_color}; margin: 20px 0;">
                    <strong>Observações:</strong><br>
                    {observations}
                </div>
            """
        
        html_body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                <p>Olá <strong>{user_name}</strong>,</p>
                
                <p>Sua justificativa de ausência referente ao dia <strong>{date_formatted}</strong> foi <span style="color: {status_color}; font-weight: bold;">{status_text.upper()}</span>.</p>
                
                {observations_html}
                
                <p style="margin-top: 25px;">Agradecemos pela colaboração.</p>
                
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
                <p style="color: #666; font-size: 12px;">
                    Equipe HWI
                </p>
            </body>
        </html>
        """
        
        message = MIMEMultipart('alternative')
        message['Subject'] = subject
        message['From'] = smtp_from
        message['To'] = user_email
        
        html_part = MIMEText(html_body, 'html')
        message.attach(html_part)
        
        await aiosmtplib.send(
            message,
            hostname=smtp_host,
            port=smtp_port,
            username=smtp_user,
            password=smtp_password,
            start_tls=True
        )
        
        logging.info(f"Absence decision email sent to {user_email} - Status: {status_text}")
    except Exception as e:
        logging.error(f"Failed to send absence decision email: {str(e)}")

def generate_temporary_password() -> str:
    """Generate a secure random temporary password"""
    import secrets
    import string
    
    # Generate a 12-character password with letters, digits and special chars
    alphabet = string.ascii_letters + string.digits + "!@#$%&*"
    password = ''.join(secrets.choice(alphabet) for _ in range(12))
    
    # Ensure it has at least one uppercase, one lowercase, one digit, and one special char
    if (any(c.isupper() for c in password) and
        any(c.islower() for c in password) and
        any(c.isdigit() for c in password) and
        any(c in "!@#$%&*" for c in password)):
        return password
    else:
        # Recursively generate until we get a valid one
        return generate_temporary_password()

async def send_password_reset_email(user_name: str, user_email: str, temporary_password: str):
    """Send email with temporary password for password reset"""
    try:
        smtp_host = os.environ.get('SMTP_HOST')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_user = os.environ.get('SMTP_USER')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        smtp_from = os.environ.get('SMTP_FROM', 'geral@hwi.pt')
        
        subject = "Recuperação de Senha - HWI Relógio de Ponto"
        
        html_body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">Recuperação de Senha</h2>
                    
                    <p>Olá <strong>{user_name}</strong>,</p>
                    
                    <p>Recebemos uma solicitação de recuperação de senha para sua conta no sistema de Relógio de Ponto da HWI.</p>
                    
                    <div style="background-color: #f0f9ff; padding: 20px; border-left: 4px solid #2563eb; margin: 25px 0;">
                        <p style="margin: 0;"><strong>Sua senha temporária é:</strong></p>
                        <p style="font-size: 24px; font-family: 'Courier New', monospace; color: #1e40af; margin: 10px 0; font-weight: bold;">
                            {temporary_password}
                        </p>
                    </div>
                    
                    <div style="background-color: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 25px 0;">
                        <p style="margin: 0;"><strong>⚠️ Atenção:</strong></p>
                        <ul style="margin: 10px 0; padding-left: 20px;">
                            <li>Esta senha é <strong>temporária</strong></li>
                            <li>Você será <strong>obrigado a criar uma nova senha</strong> no próximo login</li>
                            <li>Por segurança, não compartilhe esta senha com ninguém</li>
                        </ul>
                    </div>
                    
                    <h3 style="color: #2563eb; margin-top: 30px;">Como fazer o login:</h3>
                    <ol style="line-height: 2;">
                        <li>Acesse o sistema de Relógio de Ponto</li>
                        <li>Use seu <strong>nome de utilizador</strong> e a <strong>senha temporária</strong> acima</li>
                        <li>Você será direcionado para criar uma nova senha</li>
                        <li>Escolha uma senha forte e segura</li>
                    </ol>
                    
                    <p style="margin-top: 30px; color: #666; font-size: 14px;">
                        Se você não solicitou esta recuperação de senha, entre em contato com o administrador imediatamente.
                    </p>
                    
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
                    <p style="color: #666; font-size: 12px;">
                        <strong>Equipe HWI Unipessoal, Lda</strong><br>
                        Sistema de Relógio de Ponto
                    </p>
                </div>
            </body>
        </html>
        """
        
        message = MIMEMultipart('alternative')
        message['Subject'] = subject
        message['From'] = smtp_from
        message['To'] = user_email
        
        html_part = MIMEText(html_body, 'html')
        message.attach(html_part)
        
        await aiosmtplib.send(
            message,
            hostname=smtp_host,
            port=smtp_port,
            username=smtp_user,
            password=smtp_password,
            start_tls=True
        )
        
        logging.info(f"Password reset email sent to {user_email}")
        return True
    except Exception as e:
        logging.error(f"Failed to send password reset email: {str(e)}")
        raise HTTPException(status_code=500, detail="Falha ao enviar email de recuperação")

def calculate_vacation_days(start_date_str: str, days_taken: int = 0) -> dict:
    """Calculate vacation days based on company start date"""
    start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
    today = date.today()
    
    # Calculate months worked
    months_worked = (today.year - start_date.year) * 12 + (today.month - start_date.month)
    if today.day < start_date.day:
        months_worked -= 1
    
    # 2 days per month, max 22 days per year
    days_earned = min(months_worked * 2, 22)
    days_available = days_earned - days_taken
    
    return {
        "days_earned": days_earned,
        "days_taken": days_taken,
        "days_available": days_available,
        "months_worked": months_worked
    }

async def create_notification(user_id: str, notification_type: str, message: str, related_id: str = None):
    """Create a notification for a user"""
    notification = Notification(
        user_id=user_id,
        type=notification_type,
        message=message,
        related_id=related_id
    )
    notif_dict = notification.model_dump()
    notif_dict['created_at'] = notif_dict['created_at'].isoformat()
    await db.notifications.insert_one(notif_dict)
    return notification


# ============ Auth Routes (movido para routes/) ============

# ============ Clientes Routes (movido para routes/clientes.py) ============



# ============ Clientes Routes (movido para routes/clientes.py) ============


# ============ Manual de Instruções ============

@api_router.get("/manual/download")
async def download_manual(current_user: dict = Depends(get_current_user)):
    """Gerar e descarregar o manual de instruções em PDF"""
    try:
        pdf_bytes = create_manual_pdf()
        
        logging.info(f"Manual de instruções descarregado por {current_user['sub']}")
        
        return StreamingResponse(
            BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=Manual_HWI_Unipessoal.pdf"}
        )
    except Exception as e:
        logging.error(f"Erro ao gerar manual: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao gerar manual: {str(e)}")



# ============ Equipamentos Routes (movido para routes/) ============

# ============ Relatórios Técnicos Routes ============

@api_router.post("/relatorios-tecnicos", response_model=RelatorioTecnico)
async def create_relatorio(
    relatorio_data: RelatorioTecnicoCreate,
    current_user: dict = Depends(get_current_user)
):
    """Criar novo relatório técnico"""
    # Buscar dados do cliente
    cliente = await db.clientes.find_one({"id": relatorio_data.cliente_id}, {"_id": 0})
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    # Buscar dados do usuário (técnico)
    user = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0})
    
    # Gerar número de assistência (último número + 1, mínimo 354)
    last_relatorio = await db.relatorios_tecnicos.find_one(
        {},
        sort=[("numero_assistencia", -1)]
    )
    last_numero = last_relatorio.get("numero_assistencia", 0) if last_relatorio else 0
    numero_assistencia = max(last_numero + 1, 354)  # Começar no mínimo em 354
    
    # Criar relatório
    relatorio = RelatorioTecnico(
        numero_assistencia=numero_assistencia,
        cliente_id=relatorio_data.cliente_id,
        created_by_id=current_user["sub"],
        cliente_nome=cliente["nome"],
        data_servico=relatorio_data.data_servico,
        data_fim=relatorio_data.data_fim,
        local_intervencao=relatorio_data.local_intervencao,
        pedido_por=relatorio_data.pedido_por,
        contacto_pedido=relatorio_data.contacto_pedido,
        ot_relacionada_id=relatorio_data.ot_relacionada_id,
        equipamento_tipologia=relatorio_data.equipamento_tipologia,
        equipamento_marca=relatorio_data.equipamento_marca,
        equipamento_modelo=relatorio_data.equipamento_modelo,
        equipamento_numero_serie=relatorio_data.equipamento_numero_serie,
        motivo_assistencia=relatorio_data.motivo_assistencia
    )
    
    relatorio_dict = relatorio.dict()
    relatorio_dict["data_criacao"] = relatorio_dict["data_criacao"].isoformat()
    relatorio_dict["data_servico"] = relatorio_dict["data_servico"].isoformat()
    if relatorio_dict.get("data_fim"):
        relatorio_dict["data_fim"] = relatorio_dict["data_fim"].isoformat()
    
    await db.relatorios_tecnicos.insert_one(relatorio_dict)
    
    # Criar/atualizar equipamento automaticamente (somente se marca e modelo forem fornecidos)
    if relatorio_data.equipamento_marca and relatorio_data.equipamento_modelo:
        equipamento_existente = await db.equipamentos.find_one({
            "cliente_id": relatorio_data.cliente_id,
            "marca": relatorio_data.equipamento_marca,
            "modelo": relatorio_data.equipamento_modelo,
            "numero_serie": relatorio_data.equipamento_numero_serie if relatorio_data.equipamento_numero_serie else None,
            "ativo": True
        })
        
        if equipamento_existente:
            # Atualizar last_used
            await db.equipamentos.update_one(
                {"id": equipamento_existente["id"]},
                {"$set": {"last_used": datetime.now(timezone.utc).isoformat()}}
            )
        else:
            # Criar novo equipamento
            novo_equipamento = Equipamento(
                cliente_id=relatorio_data.cliente_id,
                tipologia=relatorio_data.equipamento_tipologia or "",
                marca=relatorio_data.equipamento_marca,
                modelo=relatorio_data.equipamento_modelo,
                numero_serie=relatorio_data.equipamento_numero_serie,
                ano_fabrico=relatorio_data.equipamento_ano_fabrico,
                last_used=datetime.now(timezone.utc)
            )
            
            equipamento_dict = novo_equipamento.dict()
            equipamento_dict["created_at"] = equipamento_dict["created_at"].isoformat()
            equipamento_dict["last_used"] = equipamento_dict["last_used"].isoformat()
            
            await db.equipamentos.insert_one(equipamento_dict)
            logging.info(f"Equipamento criado automaticamente: {novo_equipamento.marca} {novo_equipamento.modelo}")
    
    logging.info(f"Relatório técnico criado: {numero_assistencia} por {current_user['sub']}")
    
    # Enviar email de referência interna automaticamente se cliente tiver flag ativa
    ref_email = cliente.get("email_referencia_interna") or cliente.get("email")
    if cliente.get("incluir_referencia_interna") and ref_email:
        try:
            token_str = str(uuid.uuid4())
            ref_token_doc = {
                "id": str(uuid.uuid4()),
                "token": token_str,
                "relatorio_id": relatorio.id,
                "cliente_id": relatorio_data.cliente_id,
                "used": False,
                "referencia": None,
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.reference_tokens.insert_one(ref_token_doc)
            
            frontend_url = os.environ.get('FRONTEND_URL', '').rstrip('/')
            link = f"{frontend_url}/reference/{token_str}"
            await send_reference_link_email(
                client_email=ref_email,
                client_name=cliente["nome"],
                fs_number=numero_assistencia,
                reference_link=link
            )
            logging.info(f"Email de referência interna enviado para {ref_email} (FS#{numero_assistencia})")
        except Exception as e:
            logging.error(f"Erro ao enviar email de referência interna: {e}")
    
    return relatorio


@api_router.post("/relatorios-tecnicos/{relatorio_id}/criar-fs-relacionada")
async def criar_fs_relacionada(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Criar nova FS automaticamente ligada a uma FS existente (concluída)"""
    original = await db.relatorios_tecnicos.find_one(
        {"id": relatorio_id}, {"_id": 0}
    )
    if not original:
        raise HTTPException(status_code=404, detail="FS original não encontrada")
    
    # Gerar número de assistência
    last_relatorio = await db.relatorios_tecnicos.find_one(
        {}, sort=[("numero_assistencia", -1)]
    )
    last_numero = last_relatorio.get("numero_assistencia", 0) if last_relatorio else 0
    numero_assistencia = max(last_numero + 1, 354)
    
    # Criar nova FS copiando dados relevantes da original
    nova_fs = {
        "id": str(uuid.uuid4()),
        "numero_assistencia": numero_assistencia,
        "status": "em_execucao",
        "data_criacao": datetime.now(timezone.utc).isoformat(),
        "data_servico": date.today().isoformat(),
        "data_fim": None,
        "data_conclusao": None,
        "cliente_id": original["cliente_id"],
        "created_by_id": current_user["sub"],
        "cliente_nome": original.get("cliente_nome", ""),
        "local_intervencao": original.get("local_intervencao", ""),
        "pedido_por": original.get("pedido_por", ""),
        "contacto_pedido": original.get("contacto_pedido"),
        "equipamento_tipologia": original.get("equipamento_tipologia"),
        "equipamento_marca": original.get("equipamento_marca"),
        "equipamento_modelo": original.get("equipamento_modelo"),
        "equipamento_numero_serie": original.get("equipamento_numero_serie"),
        "equipamento_ano_fabrico": original.get("equipamento_ano_fabrico"),
        "equipamento_horas_funcionamento": original.get("equipamento_horas_funcionamento"),
        "motivo_assistencia": original.get("motivo_assistencia", ""),
        "referencia_interna_cliente": original.get("referencia_interna_cliente"),
        "km_inicial": None,
        "ot_relacionada_id": relatorio_id,
        "diagnostico": None,
        "acoes_realizadas": None,
        "resolucao": None,
        "problema_resolvido": False,
        "relatorio_assistencia": None
    }
    
    await db.relatorios_tecnicos.insert_one(nova_fs)
    
    # Copiar equipamentos associados
    equipamentos_orig = await db.equipamentos_relatorio.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).to_list(100)
    for eq in equipamentos_orig:
        novo_eq = {**eq, "id": str(uuid.uuid4()), "relatorio_id": nova_fs["id"]}
        await db.equipamentos_relatorio.insert_one(novo_eq)
    
    # Audit log
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "action": "criar_fs_relacionada",
        "user_id": current_user["sub"],
        "username": current_user.get("username", ""),
        "original_fs_id": relatorio_id,
        "original_fs_numero": original.get("numero_assistencia"),
        "nova_fs_id": nova_fs["id"],
        "nova_fs_numero": numero_assistencia,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    logging.info(f"FS #{numero_assistencia} criada como relacionada da FS #{original.get('numero_assistencia')} por {current_user['sub']}")
    
    # Remove _id if present
    nova_fs.pop("_id", None)
    nova_fs["ot_relacionada_numero"] = original.get("numero_assistencia")
    return nova_fs

@api_router.get("/relatorios-tecnicos")
async def get_relatorios(
    status: Optional[str] = None,
    cliente_id: Optional[str] = None,
    limit: int = 100,
    skip: int = 0,
    current_user: dict = Depends(get_current_user)
):
    """Listar relatórios técnicos - visível para todos os utilizadores"""
    query = {}
    
    # Filtros opcionais
    if status:
        query["status"] = status
    if cliente_id:
        query["cliente_id"] = cliente_id
    
    # Buscar relatórios com paginação
    relatorios = await db.relatorios_tecnicos.find(
        query,
        {"_id": 0}
    ).sort("numero_assistencia", -1).skip(skip).limit(limit).to_list(limit)
    
    if not relatorios:
        return relatorios
    
    # Buscar contagem de equipamentos em batch (uma única query)
    relatorio_ids = [r.get("id") for r in relatorios]
    
    # Agregação para contar equipamentos por relatório
    equipamentos_pipeline = [
        {"$match": {"relatorio_id": {"$in": relatorio_ids}}},
        {"$group": {"_id": "$relatorio_id", "count": {"$sum": 1}}}
    ]
    equipamentos_counts = await db.equipamentos_ot.aggregate(equipamentos_pipeline).to_list(None)
    
    # Criar mapa de contagens
    counts_map = {item["_id"]: item["count"] for item in equipamentos_counts}
    
    # Buscar primeiro equipamento de cada OT que tem exatamente 1 equipamento na coleção
    single_equip_ids = [rid for rid in relatorio_ids if counts_map.get(rid, 0) == 1]
    single_equip_map = {}
    if single_equip_ids:
        single_equips = await db.equipamentos_ot.find(
            {"relatorio_id": {"$in": single_equip_ids}},
            {"_id": 0, "relatorio_id": 1, "tipologia": 1, "marca": 1}
        ).to_list(None)
        for eq in single_equips:
            single_equip_map[eq["relatorio_id"]] = eq
    
    # Processar relatórios
    for relatorio in relatorios:
        relatorio_id = relatorio.get("id")
        equipamentos_count = counts_map.get(relatorio_id, 0)
        
        # Verificar se tem equipamento principal (campos directos na OT)
        tem_equip_principal = bool(
            relatorio.get("equipamento_marca") or 
            relatorio.get("equipamento_tipologia") or 
            relatorio.get("equipamento_modelo")
        )
        
        # Calcular total de equipamentos
        total_equipamentos = equipamentos_count + (1 if tem_equip_principal else 0)
        
        # Definir texto a mostrar
        if total_equipamentos == 0:
            relatorio["equipamento_display"] = "Não especificado"
        elif total_equipamentos == 1:
            if tem_equip_principal:
                parts = []
                if relatorio.get("equipamento_tipologia"):
                    parts.append(relatorio["equipamento_tipologia"])
                if relatorio.get("equipamento_marca"):
                    parts.append(relatorio["equipamento_marca"])
                relatorio["equipamento_display"] = " - ".join(parts) if parts else "Equipamento"
            else:
                eq = single_equip_map.get(relatorio_id, {})
                parts = []
                if eq.get("tipologia"):
                    parts.append(eq["tipologia"])
                if eq.get("marca"):
                    parts.append(eq["marca"])
                relatorio["equipamento_display"] = " - ".join(parts) if parts else "Equipamento"
        else:
            relatorio["equipamento_display"] = "Vários"
        
        relatorio["equipamentos_count"] = total_equipamentos
    
    # Enriquecer com info de OTs relacionadas (forward + reverse)
    # Forward: esta OT tem ot_relacionada_id (aponta para OT anterior)
    # Reverse: outras OTs apontam para esta OT (OTs posteriores)
    ids_relacionadas = set()
    for r in relatorios:
        if r.get("ot_relacionada_id"):
            ids_relacionadas.add(r["ot_relacionada_id"])
    # Buscar OTs posteriores que apontam para as OTs actuais
    reverse_refs = await db.relatorios_tecnicos.find(
        {"ot_relacionada_id": {"$in": relatorio_ids}},
        {"_id": 0, "id": 1, "numero_assistencia": 1, "ot_relacionada_id": 1}
    ).to_list(None)
    reverse_map = {}
    for ref in reverse_refs:
        parent_id = ref["ot_relacionada_id"]
        if parent_id not in reverse_map:
            reverse_map[parent_id] = []
        reverse_map[parent_id].append({
            "id": ref["id"],
            "numero_assistencia": ref["numero_assistencia"]
        })
    
    # Buscar info das OTs relacionadas anteriores
    if ids_relacionadas:
        ots_relacionadas = await db.relatorios_tecnicos.find(
            {"id": {"$in": list(ids_relacionadas)}},
            {"_id": 0, "id": 1, "numero_assistencia": 1}
        ).to_list(None)
        ots_rel_map = {r["id"]: r for r in ots_relacionadas}
    else:
        ots_rel_map = {}
    
    for relatorio in relatorios:
        rid = relatorio.get("id")
        # Forward reference: OT anterior
        if relatorio.get("ot_relacionada_id") and relatorio["ot_relacionada_id"] in ots_rel_map:
            ref = ots_rel_map[relatorio["ot_relacionada_id"]]
            relatorio["ot_relacionada_numero"] = ref.get("numero_assistencia")
        # Reverse reference: OTs posteriores
        if rid in reverse_map:
            relatorio["ots_posteriores"] = reverse_map[rid]
    
    return relatorios

@api_router.get("/relatorios-tecnicos/{relatorio_id}", response_model=RelatorioTecnico)
async def get_relatorio(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obter relatório técnico específico - visível para todos os utilizadores"""
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    return relatorio

@api_router.put("/relatorios-tecnicos/{relatorio_id}", response_model=RelatorioTecnico)
async def update_relatorio(
    relatorio_id: str,
    relatorio_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar relatório técnico"""
    existing = await db.relatorios_tecnicos.find_one({"id": relatorio_id})
    
    if not existing:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Verificar permissão
    if not current_user.get("is_admin", False) and existing["tecnico_id"] != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Sem permissão para editar este relatório")
    
    # Validar mudança de status "facturado" - apenas admin
    if "status" in relatorio_data and relatorio_data["status"] == "facturado":
        if not current_user.get("is_admin", False):
            raise HTTPException(
                status_code=403, 
                detail="Apenas administradores podem marcar FS's como 'Facturado'"
            )
    
    # Remover campos que não devem ser atualizados
    relatorio_data.pop("id", None)
    relatorio_data.pop("numero_assistencia", None)
    relatorio_data.pop("data_criacao", None)
    relatorio_data.pop("created_by_id", None)
    
    await db.relatorios_tecnicos.update_one(
        {"id": relatorio_id},
        {"$set": relatorio_data}
    )
    
    updated = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    
    logging.info(f"Relatório técnico atualizado: {relatorio_id} por {current_user['sub']}")
    
    return updated

@api_router.delete("/relatorios-tecnicos/{relatorio_id}")
async def delete_relatorio(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Deletar relatório técnico (apenas admin)"""
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Apenas administradores podem deletar relatórios")
    
    result = await db.relatorios_tecnicos.delete_one({"id": relatorio_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    logging.info(f"Relatório técnico deletado: {relatorio_id} por {current_user['sub']}")
    
    return {"message": "Relatório deletado com sucesso"}

@api_router.patch("/relatorios-tecnicos/{relatorio_id}/status")
async def update_relatorio_status(
    relatorio_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar status do relatório"""
    status = data.get("status")
    valid_status = ["agendado", "orcamento", "em_execucao", "em_andamento", "concluido", "facturado", "enviado", "rascunho"]
    if status not in valid_status:
        raise HTTPException(status_code=400, detail=f"Status inválido. Use: {', '.join(valid_status)}")
    
    existing = await db.relatorios_tecnicos.find_one({"id": relatorio_id})
    
    if not existing:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Todos os utilizadores autenticados podem mudar o status
    update_data = {"status": status}
    if status == "concluido":
        update_data["data_conclusao"] = datetime.now(timezone.utc).isoformat()
    
    await db.relatorios_tecnicos.update_one(
        {"id": relatorio_id},
        {"$set": update_data}
    )
    
    return {"message": f"Status atualizado para {status}"}

# ============ Técnicos do Relatório Routes ============

@api_router.get("/relatorios-tecnicos/{relatorio_id}/tecnicos")
async def get_tecnicos_relatorio(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar técnicos atribuídos a um relatório"""
    # Verificar se relatório existe
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Buscar técnicos manuais - ordenados cronologicamente
    tecnicos = await db.tecnicos_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort([("data_trabalho", 1), ("hora_inicio", 1)]).to_list(100)
    
    return tecnicos

@api_router.post("/relatorios-tecnicos/{relatorio_id}/tecnicos")
async def add_tecnico_relatorio(
    relatorio_id: str,
    tecnico_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Adicionar técnico a um relatório com segmentação automática por código horário"""
    from cronometro_logic import segmentar_periodo, get_codigo_horario
    
    # Verificar se relatório existe
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Verificar se é o primeiro técnico - para usar km_inicial da OT
    existing_tecnicos_count = await db.tecnicos_relatorio.count_documents({"relatorio_id": relatorio_id})
    existing_registos_count = await db.registos_tecnico_ot.count_documents({"relatorio_id": relatorio_id})
    is_first_tecnico = (existing_tecnicos_count == 0 and existing_registos_count == 0)
    
    # Obter dados básicos
    tecnico_id_user = tecnico_data.get("tecnico_id", "")
    tecnico_nome = tecnico_data.get("tecnico_nome", "")
    tipo_registo = tecnico_data.get("tipo_registo", "manual")
    funcao_ot = tecnico_data.get("funcao_ot", "tecnico")
    data_trabalho_str = tecnico_data.get("data_trabalho")
    hora_inicio_str = tecnico_data.get("hora_inicio")
    hora_fim_str = tecnico_data.get("hora_fim")
    
    # Calcular kms - Se é o primeiro técnico e não tem kms_inicial definido, usar da OT
    kms_inicial = float(tecnico_data.get("kms_inicial", 0))
    if is_first_tecnico and kms_inicial == 0 and relatorio.get("km_inicial"):
        kms_inicial = float(relatorio.get("km_inicial", 0))
        logging.info(f"Usando km_inicial da OT ({kms_inicial}) para o primeiro técnico")
    
    kms_final = float(tecnico_data.get("kms_final", 0))
    kms_inicial_volta = float(tecnico_data.get("kms_inicial_volta", 0))
    kms_final_volta = float(tecnico_data.get("kms_final_volta", 0))
    kms_ida = max(0, kms_final - kms_inicial)
    kms_volta = max(0, kms_final_volta - kms_inicial_volta)
    kms_deslocacao = kms_ida + kms_volta
    
    # Se temos hora_inicio e hora_fim, fazer segmentação
    if hora_inicio_str and hora_fim_str and data_trabalho_str:
        try:
            # Parse data e horas
            if isinstance(data_trabalho_str, str):
                data_obj = datetime.strptime(data_trabalho_str.split('T')[0], "%Y-%m-%d").date()
            else:
                data_obj = data_trabalho_str
            
            hora_inicio_parts = hora_inicio_str.split(":")
            hora_fim_parts = hora_fim_str.split(":")
            
            # Criar datetime sem timezone (hora local portuguesa)
            hora_inicio = datetime.combine(
                data_obj,
                time(int(hora_inicio_parts[0]), int(hora_inicio_parts[1]))
            )
            hora_fim = datetime.combine(
                data_obj,
                time(int(hora_fim_parts[0]), int(hora_fim_parts[1]))
            )
            
            # Se hora fim <= hora início, passa para dia seguinte
            if hora_fim <= hora_inicio:
                hora_fim = hora_fim + timedelta(days=1)
            
            # Segmentar período
            segmentos = segmentar_periodo(hora_inicio, hora_fim, tipo_registo)
            
            registos_criados = []
            for i, seg in enumerate(segmentos):
                registo = {
                    "id": str(uuid.uuid4()),
                    "relatorio_id": relatorio_id,
                    "tecnico_id": tecnico_id_user,
                    "tecnico_nome": tecnico_nome,
                    "tipo": tipo_registo,
                    "funcao_ot": funcao_ot,
                    "data": seg["data"].isoformat(),
                    "hora_inicio_segmento": seg["hora_inicio_segmento"].isoformat(),
                    "hora_fim_segmento": seg["hora_fim_segmento"].isoformat(),
                    "horas_arredondadas": seg["horas_arredondadas"],
                    "minutos_trabalhados": int(seg["duracao_minutos"]),
                    "km": kms_deslocacao if i == 0 else 0,  # KMs apenas no primeiro segmento
                    "kms_inicial": kms_inicial if i == 0 else 0,
                    "kms_final": kms_final if i == 0 else 0,
                    "kms_inicial_volta": kms_inicial_volta if i == 0 else 0,
                    "kms_final_volta": kms_final_volta if i == 0 else 0,
                    "kms_deslocacao": kms_deslocacao if i == 0 else 0,
                    "codigo": seg["codigo"],
                    "origem": "manual",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                await db.registos_tecnico_ot.insert_one(registo)
                registo.pop("_id", None)
                registos_criados.append(registo)
            
            logging.info(f"Técnico adicionado com segmentação ao relatório {relatorio_id}: {tecnico_nome} - {len(registos_criados)} segmento(s)")
            
            return {"message": f"{len(registos_criados)} registo(s) criado(s)", "registos": registos_criados}
            
        except Exception as e:
            logging.error(f"Erro na segmentação: {str(e)}")
            # Fallback para registo único se segmentação falhar
    
    # Sem hora_inicio/hora_fim ou fallback - criar registo tradicional
    count = await db.tecnicos_relatorio.count_documents({"relatorio_id": relatorio_id})
    
    tecnico = TecnicoRelatorio(
        relatorio_id=relatorio_id,
        tecnico_id=tecnico_id_user,
        tecnico_nome=tecnico_nome,
        minutos_cliente=tecnico_data.get("minutos_cliente", 0),
        kms_inicial=kms_inicial,
        kms_final=kms_final,
        kms_inicial_volta=kms_inicial_volta,
        kms_final_volta=kms_final_volta,
        kms_deslocacao=kms_deslocacao,
        tipo_horario=tecnico_data.get("tipo_horario", "diurno"),
        tipo_registo=tipo_registo,
        funcao_ot=funcao_ot,
        data_trabalho=data_trabalho_str if data_trabalho_str else get_now_local().date(),
        hora_inicio=hora_inicio_str,
        hora_fim=hora_fim_str,
        incluir_pausa=tecnico_data.get("incluir_pausa", False),
        ordem=count
    )
    
    tecnico_dict = tecnico.dict()
    if isinstance(tecnico_dict.get("data_trabalho"), date):
        tecnico_dict["data_trabalho"] = tecnico_dict["data_trabalho"].isoformat()
    await db.tecnicos_relatorio.insert_one(tecnico_dict)
    
    logging.info(f"Técnico adicionado ao relatório {relatorio_id}: {tecnico_nome}")
    
    return tecnico

@api_router.put("/relatorios-tecnicos/{relatorio_id}/tecnicos/{tecnico_id}")
async def update_tecnico_relatorio(
    relatorio_id: str,
    tecnico_id: str,
    tecnico_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar dados de um técnico no relatório"""
    from cronometro_logic import arredondar_horas
    
    # Verificar se técnico existe
    existing = await db.tecnicos_relatorio.find_one({
        "id": tecnico_id,
        "relatorio_id": relatorio_id
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Técnico não encontrado")
    
    # Atualizar campos editáveis
    update_data = {}
    if "tecnico_nome" in tecnico_data:
        update_data["tecnico_nome"] = tecnico_data["tecnico_nome"]
    if "minutos_cliente" in tecnico_data:
        minutos_raw = tecnico_data["minutos_cliente"]
        tipo_reg = existing.get("tipo", "trabalho")
        horas_arred = minutos_raw / 60 if tipo_reg == "viagem" else arredondar_horas(minutos_raw)
        update_data["minutos_cliente"] = minutos_raw
        update_data["horas_arredondadas"] = horas_arred
    
    # Atualizar kms ida
    if "kms_inicial" in tecnico_data:
        update_data["kms_inicial"] = float(tecnico_data["kms_inicial"])
    if "kms_final" in tecnico_data:
        update_data["kms_final"] = float(tecnico_data["kms_final"])
    
    # Atualizar kms volta
    if "kms_inicial_volta" in tecnico_data:
        update_data["kms_inicial_volta"] = float(tecnico_data["kms_inicial_volta"])
    if "kms_final_volta" in tecnico_data:
        update_data["kms_final_volta"] = float(tecnico_data["kms_final_volta"])
    
    # Se qualquer km foi atualizado, recalcular kms_deslocacao (ida + volta)
    if any(k in tecnico_data for k in ["kms_inicial", "kms_final", "kms_inicial_volta", "kms_final_volta"]):
        kms_inicial = float(tecnico_data.get("kms_inicial", existing.get("kms_inicial", 0)))
        kms_final = float(tecnico_data.get("kms_final", existing.get("kms_final", 0)))
        kms_inicial_volta = float(tecnico_data.get("kms_inicial_volta", existing.get("kms_inicial_volta", 0)))
        kms_final_volta = float(tecnico_data.get("kms_final_volta", existing.get("kms_final_volta", 0)))
        kms_ida = max(0, kms_final - kms_inicial)
        kms_volta = max(0, kms_final_volta - kms_inicial_volta)
        update_data["kms_deslocacao"] = kms_ida + kms_volta
    
    if "tipo_horario" in tecnico_data:
        update_data["tipo_horario"] = tecnico_data["tipo_horario"]
    if "tipo_registo" in tecnico_data:
        update_data["tipo_registo"] = tecnico_data["tipo_registo"]
    if "funcao_ot" in tecnico_data:
        update_data["funcao_ot"] = tecnico_data["funcao_ot"]
    if "data_trabalho" in tecnico_data:
        # Converter para string ISO se necessário
        if isinstance(tecnico_data["data_trabalho"], str):
            update_data["data_trabalho"] = tecnico_data["data_trabalho"]
        else:
            update_data["data_trabalho"] = tecnico_data["data_trabalho"].isoformat()
    # Novos campos para Folha de Horas
    if "hora_inicio" in tecnico_data:
        update_data["hora_inicio"] = tecnico_data["hora_inicio"]
    if "hora_fim" in tecnico_data:
        update_data["hora_fim"] = tecnico_data["hora_fim"]
    
    # Recalcular minutos e aplicar arredondamento quando as horas mudam
    h_inicio = tecnico_data.get("hora_inicio", existing.get("hora_inicio"))
    h_fim = tecnico_data.get("hora_fim", existing.get("hora_fim"))
    if ("hora_inicio" in tecnico_data or "hora_fim" in tecnico_data) and h_inicio and h_fim:
        try:
            parts_ini = h_inicio.split(":")
            parts_fim = h_fim.split(":")
            mins_ini = int(parts_ini[0]) * 60 + int(parts_ini[1])
            mins_fim = int(parts_fim[0]) * 60 + int(parts_fim[1])
            if mins_fim <= mins_ini:
                mins_fim += 24 * 60
            duracao = mins_fim - mins_ini
            
            incluir_pausa = tecnico_data.get("incluir_pausa", existing.get("incluir_pausa", False))
            if incluir_pausa:
                duracao = max(0, duracao - 60)
            
            tipo_reg = existing.get("tipo", "trabalho")
            horas_arred = duracao / 60 if tipo_reg == "viagem" else arredondar_horas(duracao)
            update_data["minutos_cliente"] = duracao
            update_data["horas_arredondadas"] = horas_arred
        except Exception as e:
            logging.error(f"Erro ao recalcular horas manuais: {str(e)}")
    
    if "incluir_pausa" in tecnico_data:
        update_data["incluir_pausa"] = tecnico_data["incluir_pausa"]
    
    # Salvaguarda: garantir arredondamento consistente mesmo em edições de outros campos
    if update_data and "horas_arredondadas" not in update_data:
        mins_existentes = existing.get("minutos_cliente", 0)
        horas_arred_existentes = existing.get("horas_arredondadas", 0)
        tipo_reg = existing.get("tipo", "trabalho")
        if mins_existentes > 0:
            horas_arred_correctas = mins_existentes / 60 if tipo_reg == "viagem" else arredondar_horas(mins_existentes)
            if abs(horas_arred_existentes - horas_arred_correctas) > 0.01:
                update_data["horas_arredondadas"] = horas_arred_correctas
    
    await db.tecnicos_relatorio.update_one(
        {"id": tecnico_id, "relatorio_id": relatorio_id},
        {"$set": update_data}
    )
    
    updated = await db.tecnicos_relatorio.find_one(
        {"id": tecnico_id, "relatorio_id": relatorio_id},
        {"_id": 0}
    )
    
    logging.info(f"Técnico {tecnico_id} atualizado no relatório {relatorio_id}")
    
    return updated

@api_router.delete("/relatorios-tecnicos/{relatorio_id}/tecnicos/{tecnico_id}")
async def delete_tecnico_relatorio(
    relatorio_id: str,
    tecnico_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remover técnico de um relatório"""
    result = await db.tecnicos_relatorio.delete_one({
        "id": tecnico_id,
        "relatorio_id": relatorio_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Técnico não encontrado")
    
    logging.info(f"Técnico {tecnico_id} removido do relatório {relatorio_id}")
    
    return {"message": "Técnico removido com sucesso"}

# ============ Intervenções Routes ============

@api_router.get("/relatorios-tecnicos/{relatorio_id}/intervencoes")
async def get_intervencoes(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar intervenções de um relatório"""
    intervencoes = await db.intervencoes_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("ordem", 1).to_list(length=None)
    
    return intervencoes

@api_router.post("/relatorios-tecnicos/{relatorio_id}/intervencoes", response_model=IntervencaoRelatorio)
async def add_intervencao(
    relatorio_id: str,
    intervencao: IntervencaoRelatorio,
    current_user: dict = Depends(get_current_user)
):
    """Adicionar intervenção a um relatório"""
    # Verificar se relatório existe
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Garantir que relatorio_id está correto
    intervencao.relatorio_id = relatorio_id
    
    # Converter data para string ISO
    intervencao_dict = intervencao.dict()
    intervencao_dict["data_intervencao"] = intervencao_dict["data_intervencao"].isoformat()
    intervencao_dict["created_at"] = intervencao_dict["created_at"].isoformat()
    
    await db.intervencoes_relatorio.insert_one(intervencao_dict)
    
    logging.info(f"Intervenção adicionada ao relatório {relatorio_id}")
    
    return intervencao

@api_router.put("/relatorios-tecnicos/{relatorio_id}/intervencoes/{intervencao_id}", response_model=IntervencaoRelatorio)
async def update_intervencao(
    relatorio_id: str,
    intervencao_id: str,
    intervencao_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar intervenção"""
    existing = await db.intervencoes_relatorio.find_one({
        "id": intervencao_id,
        "relatorio_id": relatorio_id
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Intervenção não encontrada")
    
    # Remover campos que não devem ser atualizados
    intervencao_data.pop("id", None)
    intervencao_data.pop("relatorio_id", None)
    intervencao_data.pop("created_at", None)
    
    # Converter data se for string
    if "data_intervencao" in intervencao_data and isinstance(intervencao_data["data_intervencao"], str):
        intervencao_data["data_intervencao"] = intervencao_data["data_intervencao"]
    
    await db.intervencoes_relatorio.update_one(
        {"id": intervencao_id},
        {"$set": intervencao_data}
    )
    
    updated = await db.intervencoes_relatorio.find_one({"id": intervencao_id}, {"_id": 0})
    
    logging.info(f"Intervenção {intervencao_id} atualizada no relatório {relatorio_id}")
    
    return updated

@api_router.delete("/relatorios-tecnicos/{relatorio_id}/intervencoes/{intervencao_id}")
async def delete_intervencao(
    relatorio_id: str,
    intervencao_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remover intervenção de um relatório"""
    result = await db.intervencoes_relatorio.delete_one({
        "id": intervencao_id,
        "relatorio_id": relatorio_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Intervenção não encontrada")
    
    logging.info(f"Intervenção {intervencao_id} removida do relatório {relatorio_id}")
    
    return {"message": "Intervenção removida com sucesso"}

# ============ Fotografias Routes ============

@api_router.post("/relatorios-tecnicos/{relatorio_id}/fotografias")
async def upload_fotografia(
    relatorio_id: str,
    file: UploadFile = File(...),
    descricao: str = Form(""),
    intervencao_id: str = Form(""),
    current_user: dict = Depends(get_current_user)
):
    """Upload de fotografia para um relatório técnico"""
    # Verificar se relatório existe
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Validar tipo de arquivo
    allowed_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'}
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Tipo de arquivo não permitido. Use: {', '.join(allowed_extensions)}"
        )
    
    try:
        # Ler o conteúdo do arquivo
        contents = await file.read()
        
        # Comprimir imagem para reduzir tamanho e melhorar performance
        import base64
        from io import BytesIO
        try:
            from PIL import Image
            img = Image.open(BytesIO(contents))
            # Corrigir orientação EXIF
            try:
                from PIL import ExifTags
                for orientation in ExifTags.TAGS.keys():
                    if ExifTags.TAGS[orientation] == 'Orientation':
                        break
                exif = img._getexif()
                if exif and orientation in exif:
                    if exif[orientation] == 3:
                        img = img.rotate(180, expand=True)
                    elif exif[orientation] == 6:
                        img = img.rotate(270, expand=True)
                    elif exif[orientation] == 8:
                        img = img.rotate(90, expand=True)
            except Exception:
                pass
            # Redimensionar se muito grande (max 1920px no lado maior)
            max_dim = 1920
            if max(img.size) > max_dim:
                img.thumbnail((max_dim, max_dim), Image.LANCZOS)
            # Converter para RGB se necessário (RGBA/P → JPEG)
            if img.mode in ('RGBA', 'P', 'LA'):
                img = img.convert('RGB')
            # Salvar como JPEG com qualidade 80%
            buffer = BytesIO()
            img.save(buffer, format='JPEG', quality=80, optimize=True)
            compressed = buffer.getvalue()
            foto_base64 = base64.b64encode(compressed).decode('utf-8')
            content_type = 'image/jpeg'
            # Gerar thumbnail (300px) para listagem rápida
            thumb = img.copy()
            thumb.thumbnail((300, 300), Image.LANCZOS)
            thumb_buffer = BytesIO()
            thumb.save(thumb_buffer, format='JPEG', quality=60, optimize=True)
            thumb_base64 = base64.b64encode(thumb_buffer.getvalue()).decode('utf-8')
            logging.info(f"Imagem comprimida: {len(contents)} -> {len(compressed)} bytes ({int(len(compressed)/len(contents)*100)}%)")
        except Exception as e:
            logging.warning(f"Não foi possível comprimir imagem, usando original: {e}")
            foto_base64 = base64.b64encode(contents).decode('utf-8')
            thumb_base64 = None
            content_type = file.content_type
        
        # Criar documento da foto
        foto_id = str(uuid.uuid4())
        foto_doc = {
            "id": foto_id,
            "relatorio_id": relatorio_id,
            "intervencao_id": intervencao_id if intervencao_id else None,
            "foto_base64": foto_base64,
            "thumb_base64": thumb_base64,
            "descricao": descricao,
            "filename": file.filename,
            "content_type": content_type,
            "uploaded_at": datetime.now(timezone.utc),
            "uploaded_by": current_user["sub"]
        }
        
        # Salvar no banco
        await db.fotos_relatorio.insert_one(foto_doc)
        
        logging.info(f"Fotografia {foto_id} adicionada ao relatório {relatorio_id}")
        
        return {
            "id": foto_id,
            "relatorio_id": relatorio_id,
            "descricao": descricao,
            "foto_url": f"/relatorios-tecnicos/{relatorio_id}/fotografias/{foto_id}/image",
            "uploaded_at": foto_doc["uploaded_at"]
        }
    except Exception as e:
        logging.error(f"Erro ao fazer upload de fotografia: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao fazer upload: {str(e)}")


# ============ Equipamentos OT Routes ============

@api_router.post("/relatorios-tecnicos/{relatorio_id}/equipamentos")
async def add_equipamento_ot(
    relatorio_id: str,
    equipamento_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Adicionar equipamento a uma OT"""
    # Verificar se OT existe
    ot = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not ot:
        raise HTTPException(status_code=404, detail="FS não encontrada")
    
    # Se for novo equipamento, criar também na base de dados do cliente
    criar_na_base_cliente = equipamento_data.get("criar_na_base_cliente", False)
    if criar_na_base_cliente and ot.get("cliente_id"):
        cliente_id = ot["cliente_id"]
        
        # Verificar se já existe equipamento igual no cliente
        existing = await db.equipamentos.find_one({
            "cliente_id": cliente_id,
            "marca": equipamento_data["marca"],
            "modelo": equipamento_data["modelo"],
            "numero_serie": equipamento_data.get("numero_serie"),
            "ativo": True
        })
        
        if not existing:
            # Criar novo equipamento na base do cliente
            novo_equipamento = Equipamento(
                cliente_id=cliente_id,
                tipologia=equipamento_data.get("tipologia"),
                marca=equipamento_data["marca"],
                modelo=equipamento_data["modelo"],
                numero_serie=equipamento_data.get("numero_serie"),
                ano_fabrico=equipamento_data.get("ano_fabrico"),
                horas_funcionamento=equipamento_data.get("horas_funcionamento")
            )
            equip_cliente_dict = novo_equipamento.dict()
            equip_cliente_dict["created_at"] = equip_cliente_dict["created_at"].isoformat()
            await db.equipamentos.insert_one(equip_cliente_dict)
            logging.info(f"Novo equipamento criado na base do cliente {cliente_id}: {equipamento_data['marca']} {equipamento_data['modelo']}")
    
    # Se for equipamento existente do cliente, atualizar horas_funcionamento se fornecido
    equipamento_cliente_id = equipamento_data.get("equipamento_cliente_id")
    if equipamento_cliente_id and equipamento_data.get("horas_funcionamento"):
        await db.equipamentos.update_one(
            {"id": equipamento_cliente_id, "ativo": True},
            {"$set": {"horas_funcionamento": equipamento_data["horas_funcionamento"]}}
        )
        logging.info(f"Horas de funcionamento atualizadas no equipamento do cliente {equipamento_cliente_id}")
    
    # Obter ordem (último + 1)
    last = await db.equipamentos_ot.find_one(
        {"relatorio_id": relatorio_id},
        sort=[("ordem", -1)]
    )
    ordem = (last.get("ordem", -1) + 1) if last else 0
    
    # Criar equipamento na OT
    equipamento = EquipamentoOT(
        relatorio_id=relatorio_id,
        equipamento_cliente_id=equipamento_data.get("equipamento_cliente_id"),
        intervencao_id=equipamento_data.get("intervencao_id"),
        tipologia=equipamento_data["tipologia"],
        marca=equipamento_data["marca"],
        modelo=equipamento_data["modelo"],
        numero_serie=equipamento_data.get("numero_serie"),
        ano_fabrico=equipamento_data.get("ano_fabrico"),
        horas_funcionamento=equipamento_data.get("horas_funcionamento"),
        ordem=ordem
    )
    
    equip_dict = equipamento.dict()
    await db.equipamentos_ot.insert_one(equip_dict)
    
    logging.info(f"Equipamento adicionado à OT {relatorio_id}")
    
    return equipamento

@api_router.get("/relatorios-tecnicos/{relatorio_id}/equipamentos")
async def get_equipamentos_ot(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar equipamentos de uma OT"""
    equipamentos = await db.equipamentos_ot.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("ordem", 1).to_list(length=None)
    
    return equipamentos

@api_router.delete("/relatorios-tecnicos/{relatorio_id}/equipamentos/{equipamento_id}")
async def delete_equipamento_ot(
    relatorio_id: str,
    equipamento_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remover equipamento de uma OT"""
    result = await db.equipamentos_ot.delete_one({
        "id": equipamento_id,
        "relatorio_id": relatorio_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado")
    
    logging.info(f"Equipamento {equipamento_id} removido da OT {relatorio_id}")
    
    return {"message": "Equipamento removido com sucesso"}

@api_router.put("/relatorios-tecnicos/{relatorio_id}/equipamentos/{equipamento_id}")
async def update_equipamento_ot(
    relatorio_id: str,
    equipamento_id: str,
    equipamento_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar equipamento de uma OT"""
    # Verificar se existe
    existing = await db.equipamentos_ot.find_one({
        "id": equipamento_id,
        "relatorio_id": relatorio_id
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado")
    
    # Campos permitidos para atualização
    update_fields = {}
    allowed_fields = ["tipologia", "marca", "modelo", "numero_serie", "ano_fabrico", "horas_funcionamento", "intervencao_id"]
    
    for field in allowed_fields:
        if field in equipamento_data:
            update_fields[field] = equipamento_data[field]
    
    if update_fields:
        await db.equipamentos_ot.update_one(
            {"id": equipamento_id, "relatorio_id": relatorio_id},
            {"$set": update_fields}
        )
    
    # Propagar horas_funcionamento para a BD do cliente se existir link
    if "horas_funcionamento" in update_fields and update_fields["horas_funcionamento"]:
        equip_cliente_id = existing.get("equipamento_cliente_id")
        if equip_cliente_id:
            await db.equipamentos.update_one(
                {"id": equip_cliente_id, "ativo": True},
                {"$set": {"horas_funcionamento": update_fields["horas_funcionamento"]}}
            )
            logging.info(f"Horas de funcionamento propagadas para equipamento do cliente {equip_cliente_id}")
        else:
            # Tentar encontrar por marca/modelo/numero_serie na OT do cliente
            ot = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0, "cliente_id": 1})
            if ot and ot.get("cliente_id"):
                match_query = {
                    "cliente_id": ot["cliente_id"],
                    "marca": existing.get("marca"),
                    "modelo": existing.get("modelo"),
                    "ativo": True
                }
                if existing.get("numero_serie"):
                    match_query["numero_serie"] = existing["numero_serie"]
                result = await db.equipamentos.update_one(
                    match_query,
                    {"$set": {"horas_funcionamento": update_fields["horas_funcionamento"]}}
                )
                if result.modified_count > 0:
                    logging.info(f"Horas de funcionamento propagadas para equipamento do cliente (por match)")
    
    # Retornar equipamento atualizado
    updated = await db.equipamentos_ot.find_one(
        {"id": equipamento_id, "relatorio_id": relatorio_id},
        {"_id": 0}
    )
    
    logging.info(f"Equipamento {equipamento_id} atualizado na OT {relatorio_id}")
    
    return updated

@api_router.get("/relatorios-tecnicos/{relatorio_id}/fotografias")
async def get_fotografias(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar fotografias de um relatório técnico"""
    fotografias = await db.fotos_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("uploaded_at", -1).to_list(length=None)
    
    # Adicionar foto_url se não existir
    for foto in fotografias:
        if "foto_url" not in foto:
            foto["foto_url"] = f"/relatorios-tecnicos/{relatorio_id}/fotografias/{foto['id']}/image"
    
    return fotografias

@api_router.get("/relatorios-tecnicos/{relatorio_id}/fotografias/{foto_id}/image")
async def get_fotografia_image(
    relatorio_id: str,
    foto_id: str,
    thumb: bool = False
):
    """Obter imagem da fotografia - endpoint público para servir imagens"""
    # Buscar foto no MongoDB - apenas campos necessários
    projection = {"_id": 0, "content_type": 1}
    if thumb:
        projection["thumb_base64"] = 1
        projection["foto_base64"] = 1  # fallback se não houver thumbnail
    else:
        projection["foto_base64"] = 1
    
    foto = await db.fotos_relatorio.find_one({
        "id": foto_id,
        "relatorio_id": relatorio_id
    }, projection)
    
    if not foto:
        raise HTTPException(status_code=404, detail="Fotografia não encontrada")
    
    # Usar thumbnail se disponível e solicitado
    image_data = None
    if thumb and foto.get("thumb_base64"):
        image_data = foto["thumb_base64"]
    elif foto.get("foto_base64"):
        image_data = foto["foto_base64"]
    
    if not image_data:
        raise HTTPException(status_code=404, detail="Imagem não disponível")
    
    # Decodificar base64 e retornar com cache headers
    import base64
    foto_bytes = base64.b64decode(image_data)
    
    from fastapi.responses import Response
    return Response(
        content=foto_bytes,
        media_type=foto.get("content_type", "image/jpeg"),
        headers={
            "Cache-Control": "public, max-age=86400",
            "ETag": f'"{foto_id}"'
        }
    )

@api_router.get("/relatorios-tecnicos/{relatorio_id}/fotografias/{filename}")
async def get_fotografia_file(
    relatorio_id: str,
    filename: str
):
    """Obter arquivo de fotografia - endpoint público (compatibilidade)"""
    # Tentar buscar do arquivo primeiro (desenvolvimento local)
    file_path = Path(f"/app/backend/uploads/relatorios/{filename}")
    
    if file_path.exists():
        return FileResponse(file_path)
    
    # Se não existe arquivo, buscar do MongoDB (produção)
    foto = await db.fotos_relatorio.find_one({
        "relatorio_id": relatorio_id,
        "foto_path": str(file_path)
    })
    
    if not foto or not foto.get("foto_base64"):
        raise HTTPException(status_code=404, detail="Fotografia não encontrada")
    
    # Decodificar base64 e retornar
    import base64
    foto_bytes = base64.b64decode(foto["foto_base64"])
    
    from fastapi.responses import Response
    return Response(
        content=foto_bytes,
        media_type=foto.get("foto_mime_type", "image/jpeg")
    )

@api_router.delete("/relatorios-tecnicos/{relatorio_id}/fotografias/{foto_id}")
async def delete_fotografia(
    relatorio_id: str,
    foto_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remover fotografia de um relatório técnico"""
    # Buscar fotografia
    foto = await db.fotos_relatorio.find_one({
        "id": foto_id,
        "relatorio_id": relatorio_id
    })
    
    if not foto:
        raise HTTPException(status_code=404, detail="Fotografia não encontrada")
    
    # Remover do banco (foto armazenada como Base64)
    await db.fotos_relatorio.delete_one({"id": foto_id})
    
    logging.info(f"Fotografia {foto_id} removida do relatório {relatorio_id}")
    
    return {"message": "Fotografia removida com sucesso"}

@api_router.put("/relatorios-tecnicos/{relatorio_id}/fotografias/{foto_id}")
async def update_fotografia(
    relatorio_id: str,
    foto_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar descrição e/ou data de uma fotografia"""
    update_data = {}
    
    if "descricao" in data:
        update_data["descricao"] = data["descricao"]
    
    if "uploaded_at" in data and data["uploaded_at"]:
        update_data["uploaded_at"] = data["uploaded_at"]
    
    if "intervencao_id" in data:
        update_data["intervencao_id"] = data["intervencao_id"]
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum dado para atualizar")
    
    result = await db.fotos_relatorio.update_one(
        {"id": foto_id, "relatorio_id": relatorio_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Fotografia não encontrada")
    
    updated = await db.fotos_relatorio.find_one({"id": foto_id}, {"_id": 0})
    
    logging.info(f"Fotografia {foto_id} atualizada")
    
    return updated


# ============ Assinatura Routes ============

@api_router.post("/relatorios-tecnicos/{relatorio_id}/assinatura-digital")
async def salvar_assinatura_digital(
    relatorio_id: str,
    file: UploadFile = File(...),
    primeiro_nome: str = Form(""),
    ultimo_nome: str = Form(""),
    data_intervencao: str = Form(""),
    current_user: dict = Depends(get_current_user)
):
    """Salvar assinatura digital (canvas/desenho) para um relatório técnico - permite múltiplas"""
    # Verificar se relatório existe
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Criar diretório de uploads se não existir
    upload_dir = Path("/app/backend/uploads/assinaturas")
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    # Gerar nome único para o arquivo
    unique_filename = f"{uuid.uuid4()}.png"
    file_path = upload_dir / unique_filename
    
    # Ler conteúdo do arquivo
    file_content = await file.read()
    
    # Converter para base64 para MongoDB
    import base64
    assinatura_base64 = base64.b64encode(file_content).decode('utf-8')
    
    # Salvar também em arquivo local
    try:
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)
    except Exception as e:
        logging.warning(f"Não foi possível salvar arquivo localmente: {e}")
    
    # NÃO remover assinaturas anteriores - permitir múltiplas
    
    # Criar registro no banco COM BASE64
    nome_completo = f"{primeiro_nome} {ultimo_nome}".strip()
    assinatura = AssinaturaRelatorio(
        relatorio_id=relatorio_id,
        tipo="digital",
        assinatura_path=str(file_path),
        assinatura_url="",  # Será atualizado com o ID
        primeiro_nome=primeiro_nome,
        ultimo_nome=ultimo_nome,
        assinado_por=nome_completo if nome_completo else None,
        data_intervencao=data_intervencao if data_intervencao else None
    )
    
    assinatura_dict = assinatura.dict()
    # Atualizar URL com o ID da assinatura para evitar conflitos com múltiplas assinaturas
    assinatura_dict["assinatura_url"] = f"/relatorios-tecnicos/{relatorio_id}/assinaturas/{assinatura_dict['id']}/imagem"
    assinatura_dict["data_assinatura"] = assinatura_dict["data_assinatura"].isoformat()
    assinatura_dict["assinatura_base64"] = assinatura_base64  # Adicionar base64
    
    await db.assinaturas_relatorio.insert_one(assinatura_dict)
    
    logging.info(f"Assinatura digital salva para relatório {relatorio_id}")
    
    return assinatura

@api_router.post("/relatorios-tecnicos/{relatorio_id}/assinatura-manual")
async def salvar_assinatura_manual(
    relatorio_id: str,
    primeiro_nome: str = Form(...),
    ultimo_nome: str = Form(...),
    data_intervencao: str = Form(""),
    current_user: dict = Depends(get_current_user)
):
    """Salvar assinatura manual (texto) para um relatório técnico - permite múltiplas"""
    # Verificar se relatório existe
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Validar nomes
    if not primeiro_nome.strip() or not ultimo_nome.strip():
        raise HTTPException(status_code=400, detail="Primeiro e último nome são obrigatórios")
    
    # NÃO remover assinaturas anteriores - permitir múltiplas
    
    # Criar registro no banco
    nome_completo = f"{primeiro_nome} {ultimo_nome}".strip()
    assinatura = AssinaturaRelatorio(
        relatorio_id=relatorio_id,
        tipo="manual",
        primeiro_nome=primeiro_nome,
        ultimo_nome=ultimo_nome,
        assinado_por=nome_completo,
        data_intervencao=data_intervencao if data_intervencao else None
    )
    
    assinatura_dict = assinatura.dict()
    assinatura_dict["data_assinatura"] = assinatura_dict["data_assinatura"].isoformat()
    
    await db.assinaturas_relatorio.insert_one(assinatura_dict)
    
    logging.info(f"Assinatura manual salva para relatório {relatorio_id} por {nome_completo}")
    
    return assinatura

@api_router.get("/relatorios-tecnicos/{relatorio_id}/assinatura")
async def get_assinatura(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obter assinatura de um relatório técnico - retorna a primeira (compatibilidade)"""
    assinatura = await db.assinaturas_relatorio.find_one(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    )
    
    if not assinatura:
        return None
    
    return assinatura

@api_router.get("/relatorios-tecnicos/{relatorio_id}/assinaturas")
async def get_all_assinaturas(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obter todas as assinaturas de um relatório técnico"""
    assinaturas = await db.assinaturas_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("data_assinatura", 1).to_list(100)
    
    return assinaturas


@api_router.post("/relatorios-tecnicos/{relatorio_id}/refresh-assinaturas")
async def refresh_assinaturas(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Regenerar/sincronizar assinaturas - garante que base64 e ficheiros estão sincronizados"""
    import base64
    from pathlib import Path
    
    assinaturas = await db.assinaturas_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).to_list(100)
    
    updated_count = 0
    errors = []
    
    for assinatura in assinaturas:
        try:
            update_data = {}
            
            # Se tem path mas não tem base64, ler o ficheiro e criar base64
            if assinatura.get('assinatura_path') and not assinatura.get('assinatura_base64'):
                path = Path(assinatura['assinatura_path'])
                if path.exists():
                    with open(path, 'rb') as f:
                        img_data = f.read()
                        update_data['assinatura_base64'] = base64.b64encode(img_data).decode('utf-8')
            
            # Se tem base64 mas não tem path ou o ficheiro não existe, criar ficheiro
            if assinatura.get('assinatura_base64'):
                path_str = assinatura.get('assinatura_path')
                should_create_file = not path_str or not Path(path_str).exists()
                
                if should_create_file:
                    # Criar directório se não existir
                    signatures_dir = Path('/app/backend/signatures')
                    signatures_dir.mkdir(exist_ok=True)
                    
                    # Criar ficheiro
                    new_path = signatures_dir / f"{assinatura['id']}.png"
                    img_data = base64.b64decode(assinatura['assinatura_base64'])
                    with open(new_path, 'wb') as f:
                        f.write(img_data)
                    update_data['assinatura_path'] = str(new_path)
            
            # Actualizar na BD se houver mudanças
            if update_data:
                await db.assinaturas_relatorio.update_one(
                    {"id": assinatura['id']},
                    {"$set": update_data}
                )
                updated_count += 1
                
        except Exception as e:
            errors.append(f"Assinatura {assinatura.get('id', 'N/A')}: {str(e)}")
    
    logging.info(f"Refresh assinaturas OT {relatorio_id}: {updated_count} atualizadas, {len(errors)} erros")
    
    return {
        "message": f"Assinaturas sincronizadas",
        "updated": updated_count,
        "total": len(assinaturas),
        "errors": errors
    }


@api_router.patch("/relatorios-tecnicos/{relatorio_id}/assinaturas/{assinatura_id}")
async def update_assinatura(
    relatorio_id: str,
    assinatura_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar dados de uma assinatura (data_intervencao ou data_assinatura)"""
    # Verificar se a assinatura existe
    assinatura = await db.assinaturas_relatorio.find_one({
        "id": assinatura_id,
        "relatorio_id": relatorio_id
    })
    
    if not assinatura:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    
    # Campos permitidos para atualização
    update_fields = {}
    if "data_intervencao" in data:
        update_fields["data_intervencao"] = data["data_intervencao"]
    if "data_assinatura" in data:
        update_fields["data_assinatura"] = data["data_assinatura"]
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="Nenhum campo válido para atualizar")
    
    result = await db.assinaturas_relatorio.update_one(
        {"id": assinatura_id, "relatorio_id": relatorio_id},
        {"$set": update_fields}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Nenhuma alteração realizada")
    
    logging.info(f"Assinatura {assinatura_id} atualizada: {update_fields}")
    
    return {"message": "Assinatura atualizada com sucesso", "updated_fields": update_fields}


@api_router.delete("/relatorios-tecnicos/{relatorio_id}/assinaturas/{assinatura_id}")
async def delete_assinatura(
    relatorio_id: str,
    assinatura_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Eliminar uma assinatura específica"""
    result = await db.assinaturas_relatorio.delete_one({
        "id": assinatura_id,
        "relatorio_id": relatorio_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    
    logging.info(f"Assinatura {assinatura_id} eliminada do relatório {relatorio_id}")
    
    return {"message": "Assinatura eliminada com sucesso"}

@api_router.put("/relatorios-tecnicos/{relatorio_id}/assinaturas/{assinatura_id}")
async def update_assinatura(
    relatorio_id: str,
    assinatura_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar dados de uma assinatura (nome, data, etc.)"""
    # Campos permitidos para atualização
    update_fields = {}
    
    if "primeiro_nome" in data:
        update_fields["primeiro_nome"] = data["primeiro_nome"]
    if "ultimo_nome" in data:
        update_fields["ultimo_nome"] = data["ultimo_nome"]
    if "assinado_por" in data:
        update_fields["assinado_por"] = data["assinado_por"]
    if "data_assinatura" in data:
        update_fields["data_assinatura"] = data["data_assinatura"]
    if "data_intervencao" in data:
        update_fields["data_intervencao"] = data["data_intervencao"]
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
    
    result = await db.assinaturas_relatorio.update_one(
        {"id": assinatura_id, "relatorio_id": relatorio_id},
        {"$set": update_fields}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    
    logging.info(f"Assinatura {assinatura_id} atualizada no relatório {relatorio_id}")
    
    return {"message": "Assinatura atualizada com sucesso"}

@api_router.get("/relatorios-tecnicos/{relatorio_id}/assinaturas/{assinatura_id}/imagem")
async def get_assinatura_imagem_by_id(
    relatorio_id: str,
    assinatura_id: str
):
    """Obter imagem de uma assinatura específica pelo ID - endpoint público"""
    assinatura = await db.assinaturas_relatorio.find_one(
        {"relatorio_id": relatorio_id, "id": assinatura_id}
    )
    
    if not assinatura:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    
    # Headers para evitar cache
    headers = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    }
    
    # Tentar arquivo local primeiro
    file_path = Path(assinatura.get("assinatura_path", ""))
    if file_path.exists():
        return FileResponse(file_path, headers=headers)
    
    # Usar base64 do MongoDB
    if not assinatura.get("assinatura_base64"):
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    
    import base64
    from fastapi.responses import Response
    
    assinatura_bytes = base64.b64decode(assinatura["assinatura_base64"])
    return Response(content=assinatura_bytes, media_type="image/png", headers=headers)

@api_router.get("/relatorios-tecnicos/{relatorio_id}/assinatura/imagem")
async def get_assinatura_imagem(
    relatorio_id: str
):
    """Obter imagem da assinatura - endpoint público (legacy, retorna a primeira)"""
    assinatura = await db.assinaturas_relatorio.find_one(
        {"relatorio_id": relatorio_id, "tipo": "digital"}
    )
    
    if not assinatura:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    
    # Headers para evitar cache
    headers = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    }
    
    # Tentar arquivo local primeiro
    file_path = Path(assinatura.get("assinatura_path", ""))
    if file_path.exists():
        return FileResponse(file_path, headers=headers)
    
    # Usar base64 do MongoDB
    if not assinatura.get("assinatura_base64"):
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    
    import base64
    from fastapi.responses import Response
    
    assinatura_bytes = base64.b64decode(assinatura["assinatura_base64"])
    return Response(content=assinatura_bytes, media_type="image/png", headers=headers)

@api_router.delete("/relatorios-tecnicos/{relatorio_id}/assinatura")
async def delete_assinatura(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remover assinatura de um relatório técnico"""
    # Buscar assinatura
    assinatura = await db.assinaturas_relatorio.find_one({"relatorio_id": relatorio_id})
    
    if not assinatura:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    
    # Remover arquivo do disco se for assinatura digital
    if assinatura.get("tipo") == "digital" and assinatura.get("assinatura_path"):
        file_path = Path(assinatura["assinatura_path"])
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception as e:
                logging.error(f"Erro ao remover arquivo de assinatura: {e}")
    
    # Remover do banco
    await db.assinaturas_relatorio.delete_one({"relatorio_id": relatorio_id})
    
    logging.info(f"Assinatura removida do relatório {relatorio_id}")
    
    return {"message": "Assinatura removida com sucesso"}


# ============ PDF e Email Routes ============

@api_router.post("/relatorios-tecnicos/{relatorio_id}/enviar-pdf")
async def enviar_pdf_ot(
    relatorio_id: str,
    request: EnviarEmailRequest,
    current_user: dict = Depends(get_current_user)
):
    """Gerar PDFs selecionados da FS e enviar por email"""
    try:
        # Determinar documentos a enviar
        docs_selecionados = request.documentos or []
        # Retrocompatibilidade: se documentos não fornecido, usar lógica antiga
        if not docs_selecionados:
            docs_selecionados = ["relatorio"]
            if request.incluir_folha_horas:
                docs_selecionados.append("folha_horas")
        # Buscar dados do relatório
        relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
        if not relatorio:
            raise HTTPException(status_code=404, detail="Relatório não encontrado")
        
        # Enriquecer com info da OT relacionada
        if relatorio.get("ot_relacionada_id"):
            ot_rel = await db.relatorios_tecnicos.find_one(
                {"id": relatorio["ot_relacionada_id"]}, {"_id": 0, "numero_assistencia": 1}
            )
            if ot_rel:
                relatorio["ot_relacionada_numero"] = ot_rel.get("numero_assistencia")
        
        # Buscar cliente
        cliente = await db.clientes.find_one({"id": relatorio['cliente_id']}, {"_id": 0})
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")
        
        # Buscar intervenções
        intervencoes = await db.intervencoes_relatorio.find(
            {"relatorio_id": relatorio_id},
            {"_id": 0}
        ).sort([("data_trabalho", 1), ("hora_inicio_segmento", 1)]).to_list(length=None)
        
        # Buscar técnicos (registos manuais) - ordenados cronologicamente
        tecnicos = await db.tecnicos_relatorio.find(
            {"relatorio_id": relatorio_id},
            {"_id": 0}
        ).sort([("data_trabalho", 1), ("hora_inicio", 1)]).to_list(length=None)
        
        # Buscar fotografias
        fotografias = await db.fotos_relatorio.find(
            {"relatorio_id": relatorio_id},
            {"_id": 0}
        ).sort("ordem", 1).to_list(length=None)
        
        # Buscar assinaturas (todas)
        assinaturas = await db.assinaturas_relatorio.find(
            {"relatorio_id": relatorio_id},
            {"_id": 0}
        ).sort("data_assinatura", 1).to_list(length=None)
        
        # Buscar equipamentos adicionais
        equipamentos_adicionais = await db.equipamentos_ot.find(
            {"relatorio_id": relatorio_id},
            {"_id": 0}
        ).sort("ordem", 1).to_list(length=None)
        
        # Buscar materiais
        materiais = await db.materiais_ot.find(
            {"relatorio_id": relatorio_id},
            {"_id": 0}
        ).to_list(length=None)
        
        # Buscar registos de mão de obra (cronómetros)
        registos_mao_obra = await db.registos_tecnico_ot.find(
            {"relatorio_id": relatorio_id},
            {"_id": 0}
        ).sort([("data_trabalho", 1), ("hora_inicio_segmento", 1)]).to_list(length=None)
        
        # Buscar informações da empresa (para logo e dados no cabeçalho)
        company_info = await db.company_info.find_one({"id": "company_info_default"}, {"_id": 0})
        
        # Buscar relatórios de assistência
        rel_assistencia = await db.relatorios_assistencia.find(
            {"relatorio_id": relatorio_id}, {"_id": 0}
        ).sort("created_at", 1).to_list(length=None)
        
        # Gerar PDF do Relatório se selecionado
        pdf_buffer = None
        if "relatorio" in docs_selecionados:
            try:
                pdf_buffer = generate_ot_pdf(relatorio, cliente, intervencoes, tecnicos, fotografias, assinaturas, equipamentos_adicionais, materiais, registos_mao_obra, company_info, rel_assistencia)
            except Exception as e:
                logging.error(f"Erro ao gerar PDF para envio - OT {relatorio_id}: {str(e)}")
                import traceback
                logging.error(f"Traceback: {traceback.format_exc()}")
                raise HTTPException(status_code=500, detail=f"Erro ao gerar PDF: {str(e)}")
        
        # Gerar Folha de Horas se selecionado
        folha_horas_buffer = None
        if "folha_horas" in docs_selecionados:
            try:
                # Buscar registos manuais (tecnicos_relatorio)
                tecnicos_manuais = await db.tecnicos_relatorio.find(
                    {"relatorio_id": relatorio_id}, {"_id": 0}
                ).sort([("data_trabalho", 1), ("hora_inicio", 1)]).to_list(length=None)
                
                # Buscar tarifas da primeira tabela de preço activa
                tabela_config = await db.tabelas_preco.find_one({"table_id": 1}, {"_id": 0})
                valor_km = tabela_config.get("valor_km", 0.65) if tabela_config else 0.65
                valor_dieta_tabela = tabela_config.get("valor_dieta", 0) if tabela_config else 0
                
                tarifas_db = await db.tarifas.find({
                    "ativo": True, 
                    "table_id": 1,
                    "codigo": {"$nin": [None, "", "manual"]}
                }, {"_id": 0}).to_list(length=None)
                
                tarifas_por_codigo = {}
                tarifas_por_tecnico = {}
                tarifas_detalhadas_email = []
                for tarifa in tarifas_db:
                    codigo = tarifa.get('codigo')
                    if codigo and codigo != 'manual':
                        tarifas_por_codigo[codigo] = tarifa.get('valor_por_hora', 0)
                        tarifas_detalhadas_email.append({
                            'codigo': codigo,
                            'tipo_registo': tarifa.get('tipo_registo'),
                            'tipo_colaborador': tarifa.get('tipo_colaborador'),
                            'valor_por_hora': tarifa.get('valor_por_hora', 0),
                            'nome': tarifa.get('nome', '')
                        })
                
                # Buscar despesas da OT
                despesas_ot = await db.despesas_ot.find(
                    {"relatorio_id": relatorio_id}, {"_id": 0}
                ).to_list(length=None)
                
                dados_extras = {}
                despesas_ajustadas_email = []
                for desp in despesas_ot:
                    key = f"{desp['tecnico_id']}_{desp['data']}"
                    tipo = desp.get('tipo', 'outras')
                    
                    if key not in dados_extras:
                        dados_extras[key] = {'dieta': 0, 'portagens': 0, 'despesas': 0}
                    
                    if tipo == 'portagens':
                        dados_extras[key]['portagens'] += desp.get('valor', 0)
                    elif tipo == 'combustivel':
                        pass
                    else:
                        dados_extras[key]['despesas'] += desp.get('valor', 0)
                    
                    despesas_ajustadas_email.append(desp)
                
                # Aplicar dieta automática da tabela de preço a cada técnico/dia
                if valor_dieta_tabela > 0:
                    dias_tecnicos = set()
                    for reg in registos_mao_obra:
                        data_r = reg.get('data', '')
                        if isinstance(data_r, str) and 'T' in data_r:
                            data_r = data_r.split('T')[0]
                        tid = reg.get('tecnico_id', '')
                        tname = reg.get('tecnico_nome', '')
                        if tid and data_r:
                            dias_tecnicos.add((tid, tname, data_r))
                    for tec in tecnicos_manuais:
                        data_t = tec.get('data_trabalho', '')
                        if isinstance(data_t, str) and 'T' in data_t:
                            data_t = data_t.split('T')[0]
                        tid = tec.get('tecnico_id', '')
                        tname = tec.get('tecnico_nome', '')
                        if tid and data_t:
                            dias_tecnicos.add((tid, tname, data_t))
                    for tid, tname, data_d in dias_tecnicos:
                        key_id = f"{tid}_{data_d}"
                        key_nome = f"{tname}_{data_d}"
                        if key_id not in dados_extras:
                            dados_extras[key_id] = {'dieta': 0, 'portagens': 0, 'despesas': 0}
                        dados_extras[key_id]['dieta'] = valor_dieta_tabela
                        if key_nome not in dados_extras:
                            dados_extras[key_nome] = {'dieta': 0, 'portagens': 0, 'despesas': 0}
                        dados_extras[key_nome]['dieta'] = valor_dieta_tabela
                
                # Buscar imagem da tabela de preços
                tabela_preco_image_email = None
                if tabela_config and tabela_config.get("imagem_data"):
                    import base64
                    tabela_preco_image_email = base64.b64decode(tabela_config["imagem_data"])
                
                folha_horas_buffer = generate_folha_horas_pdf(
                    relatorio=relatorio,
                    cliente=cliente,
                    registos_mao_obra=registos_mao_obra,
                    tecnicos_manuais=tecnicos_manuais,
                    tarifas_por_tecnico=tarifas_por_tecnico,
                    dados_extras=dados_extras,
                    tarifas_por_codigo=tarifas_por_codigo,
                    valor_km=valor_km,
                    tarifas_detalhadas=tarifas_detalhadas_email,
                    despesas_ajustadas=despesas_ajustadas_email,
                    valor_dieta_default=valor_dieta_tabela,
                    tabela_preco_image=tabela_preco_image_email,
                )
            except Exception as e:
                logging.error(f"Erro ao gerar Folha de Horas para envio - OT {relatorio_id}: {str(e)}")
                import traceback
                logging.error(f"Traceback FH: {traceback.format_exc()}")
        
        # Gerar PDFs de PCs selecionados
        pc_buffers = []
        pc_ids_selecionados = [d.replace("pc:", "") for d in docs_selecionados if d.startswith("pc:")]
        if pc_ids_selecionados:
            from pc_pdf_report import generate_pc_pdf
            for pc_id_sel in pc_ids_selecionados:
                try:
                    pc_doc = await db.pedidos_cotacao.find_one({"id": pc_id_sel}, {"_id": 0})
                    if not pc_doc:
                        continue
                    pc_materiais = await db.materiais_ot.find({"pc_id": pc_id_sel}, {"_id": 0}).to_list(100)
                    pc_fotos = await db.fotografias_pc.find({"pc_id": pc_id_sel}, {"_id": 0}).to_list(100)
                    
                    ot_para_pc = {
                        "numero_assistencia": relatorio.get("numero_assistencia"),
                        "data_servico": relatorio.get("data_servico"),
                        "cliente_nome": cliente.get("nome", "N/A"),
                    }
                    # Buscar equipamento
                    equip = await db.equipamentos_ot.find_one({"relatorio_id": relatorio_id}, {"_id": 0})
                    if equip:
                        ot_para_pc["equipamento_tipologia"] = equip.get("tipologia", "")
                        ot_para_pc["equipamento_marca"] = equip.get("marca", "")
                        ot_para_pc["equipamento_modelo"] = equip.get("modelo", "")
                        ot_para_pc["equipamento_numero_serie"] = equip.get("numero_serie", "")
                        ot_para_pc["equipamento_ano_fabrico"] = equip.get("ano_fabrico", "")
                    
                    pc_buf = generate_pc_pdf(pc_doc, ot_para_pc, pc_materiais, pc_fotos, hide_client=request.hide_client_pcs)
                    pc_buffers.append({"buffer": pc_buf, "numero_pc": pc_doc.get("numero_pc", pc_id_sel)})
                except Exception as e:
                    logging.error(f"Erro ao gerar PDF do PC {pc_id_sel}: {e}")
        
        # Configuração SMTP
        smtp_host = os.environ.get('SMTP_HOST', 'smtp.office365.com')
        smtp_port = int(os.environ.get('SMTP_PORT', '587'))
        smtp_user = os.environ.get('SMTP_USER', '')
        smtp_password = os.environ.get('SMTP_PASSWORD', '')
        smtp_from = os.environ.get('SMTP_FROM', smtp_user)
        
        # Validar emails
        if not request.emails or len(request.emails) == 0:
            raise HTTPException(status_code=400, detail="Pelo menos um email deve ser fornecido")
        
        # Criar mensagem de email
        numero_ot = relatorio.get('numero_assistencia', 'N/A')
        status_raw = relatorio.get('status', 'em_execucao')
        status_map = {
            'em_execucao': 'Em Execução',
            'concluido': 'Concluído',
            'orcamento': 'Orçamento',
            'facturado': 'Facturado'
        }
        status = status_map.get(status_raw, status_raw)
        local_intervencao = relatorio.get('local_intervencao', '')
        subject = f"Folha de Serviço #{numero_ot} - {cliente.get('nome', '')}"
        
        from email_templates import get_fs_email_body
        body = get_fs_email_body(
            idioma=request.idioma,
            numero_ot=numero_ot,
            status=status,
            cliente_nome=cliente.get('nome', 'N/A'),
            data_servico=relatorio.get('data_servico', 'N/A'),
            local_intervencao=local_intervencao,
            ot_relacionada_numero=relatorio.get('ot_relacionada_numero'),
            referencia_interna=relatorio.get('referencia_interna_cliente')
        )
        
        # Enviar email para cada destinatário
        emails_enviados = []
        emails_falhados = []
        
        for email_dest in request.emails:
            try:
                message = MIMEMultipart()
                message['From'] = smtp_from
                message['To'] = email_dest
                message['Subject'] = subject
                
                message.attach(MIMEText(body, 'html'))
                
                # Anexar PDF do Relatório se selecionado
                if pdf_buffer:
                    pdf_attachment = MIMEBase('application', 'pdf')
                    pdf_attachment.set_payload(pdf_buffer.getvalue())
                    encoders.encode_base64(pdf_attachment)
                    pdf_attachment.add_header('Content-Disposition', f'attachment; filename="FS_{numero_ot}.pdf"')
                    message.attach(pdf_attachment)
                    pdf_buffer.seek(0)
                
                # Anexar Folha de Horas se selecionada
                if folha_horas_buffer:
                    fh_attachment = MIMEBase('application', 'pdf')
                    fh_attachment.set_payload(folha_horas_buffer.getvalue())
                    encoders.encode_base64(fh_attachment)
                    fh_attachment.add_header('Content-Disposition', f'attachment; filename="FolhaHoras_FS_{numero_ot}.pdf"')
                    message.attach(fh_attachment)
                    folha_horas_buffer.seek(0)
                
                # Anexar PDFs de PCs selecionados
                for pc_info in pc_buffers:
                    pc_attach = MIMEBase('application', 'pdf')
                    pc_attach.set_payload(pc_info["buffer"].getvalue())
                    encoders.encode_base64(pc_attach)
                    pc_attach.add_header('Content-Disposition', f'attachment; filename="{pc_info["numero_pc"]}.pdf"')
                    message.attach(pc_attach)
                    pc_info["buffer"].seek(0)
                
                # Resetar buffer para próximo email
                if pdf_buffer:
                    pdf_buffer.seek(0)
                
                # Enviar email
                await aiosmtplib.send(
                    message,
                    hostname=smtp_host,
                    port=smtp_port,
                    username=smtp_user,
                    password=smtp_password,
                    start_tls=True
                )
                
                emails_enviados.append(email_dest)
                logging.info(f"PDF da OT {numero_ot} enviado para {email_dest}")
                
            except Exception as e:
                logging.error(f"Erro ao enviar email para {email_dest}: {e}")
                emails_falhados.append(email_dest)
        
        return {
            "message": f"PDF enviado para {len(emails_enviados)} email(s)",
            "emails_enviados": emails_enviados,
            "emails_falhados": emails_falhados
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao enviar PDF: {e}")
        await log_app_error(
            context=f"FS#{numero_ot}" if 'numero_ot' in dir() else "FS",
            action="Enviar PDF por Email",
            error_message=str(e),
            details={"relatorio_id": relatorio_id if 'relatorio_id' in dir() else "?"},
            user_id=current_user.get("sub"),
            username=current_user.get("username")
        )
        raise HTTPException(status_code=500, detail=f"Erro ao enviar PDF: {str(e)}")

@api_router.get("/relatorios-tecnicos/{relatorio_id}/preview-pdf")
async def preview_pdf_ot(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Gerar preview do PDF da FS sem enviar"""
    # Buscar dados do relatório
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Enriquecer com info da OT relacionada
    if relatorio.get("ot_relacionada_id"):
        ot_rel = await db.relatorios_tecnicos.find_one(
            {"id": relatorio["ot_relacionada_id"]}, {"_id": 0, "numero_assistencia": 1}
        )
        if ot_rel:
            relatorio["ot_relacionada_numero"] = ot_rel.get("numero_assistencia")
    
    # Buscar cliente
    cliente = await db.clientes.find_one({"id": relatorio['cliente_id']}, {"_id": 0})
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    # Buscar intervenções
    intervencoes = await db.intervencoes_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("ordem", 1).to_list(length=None)
    
    # Buscar técnicos (registos manuais) - ordenados cronologicamente
    tecnicos = await db.tecnicos_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort([("data_trabalho", 1), ("hora_inicio", 1)]).to_list(length=None)
    
    # Buscar fotografias
    fotografias = await db.fotos_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("ordem", 1).to_list(length=None)
    
    # Buscar assinaturas (todas)
    assinaturas = await db.assinaturas_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("data_assinatura", 1).to_list(length=None)
    
    # Buscar equipamentos adicionais
    equipamentos_adicionais = await db.equipamentos_ot.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("ordem", 1).to_list(length=None)
    
    # Buscar materiais
    materiais = await db.materiais_ot.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).to_list(length=None)
    
    # Buscar registos de mão de obra (cronómetros) - ordenados por data e hora
    registos_mao_obra = await db.registos_tecnico_ot.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort([("data_trabalho", 1), ("hora_inicio_segmento", 1)]).to_list(length=None)
    
    # Buscar informações da empresa (para logo e dados no cabeçalho)
    company_info = await db.company_info.find_one({"id": "company_info_default"}, {"_id": 0})
    
    # Buscar relatórios de assistência
    rel_assistencia = await db.relatorios_assistencia.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(length=None)
    
    # Gerar PDF com tratamento de erros
    try:
        pdf_buffer = generate_ot_pdf(relatorio, cliente, intervencoes, tecnicos, fotografias, assinaturas, equipamentos_adicionais, materiais, registos_mao_obra, company_info, rel_assistencia)
    except Exception as e:
        logging.error(f"Erro ao gerar PDF para OT {relatorio_id}: {str(e)}")
        import traceback
        tb = traceback.format_exc()
        logging.error(f"Traceback: {tb}")
        numero_ot = relatorio.get('numero_assistencia', 'N/A')
        await log_app_error(
            context=f"FS#{numero_ot}",
            action="Gerar PDF",
            error_message=str(e),
            details={"relatorio_id": relatorio_id, "traceback": tb[:1500]},
            user_id=current_user.get("sub"),
            username=current_user.get("username")
        )
        raise HTTPException(status_code=500, detail=f"Erro ao gerar PDF: {str(e)}")
    
    # Retornar como download
    numero_ot = relatorio.get('numero_assistencia', 'N/A')
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=FS_{numero_ot}_{cliente.get('nome', 'Cliente').replace(' ', '_')}.pdf"
        }
    )





# ============ Notifications Routes (movido para routes/) ============

# ============ Holidays Routes ============

@api_router.get("/holidays/{year}")
async def get_holidays(year: int):
    """Retorna lista de feriados para um ano específico"""
    holidays = get_holidays_for_year(year)
    return {"year": year, "holidays": holidays}

@api_router.get("/holidays/check/{date}")
async def check_holiday(date: str):
    """Verifica se uma data específica é feriado ou fim de semana"""
    try:
        check_date = datetime.strptime(date, "%Y-%m-%d").date()
        is_ot, reason = is_overtime_day(check_date)
        return {
            "date": date,
            "is_overtime_day": is_ot,
            "reason": reason
        }
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de data inválido. Use YYYY-MM-DD")


# ============ SETUP TEMPORÁRIO - CRIAR PRIMEIRO ADMIN ============
@api_router.post("/setup/create-first-admin")
async def create_first_admin():
    """
    ENDPOINT TEMPORÁRIO - Criar primeiro usuário admin
    Acesse UMA VEZ em produção para criar admin inicial
    """
    # Verificar se já existe algum admin
    existing_admin = await db.users.find_one({"is_admin": True})
    if existing_admin:
        return {"message": "Admin já existe!", "username": existing_admin.get("username")}
    
    # Criar admin padrão
    hashed = pwd_context.hash("admin123")
    
    admin_user = User(
        username="admin",
        email="admin@hwi.pt",
        hashed_password=hashed,
        full_name="Administrador",
        phone="000000000",
        is_admin=True
    )
    
    user_dict = admin_user.dict()
    user_dict["created_at"] = user_dict["created_at"].isoformat()
    
    await db.users.insert_one(user_dict)
    
    logging.info("Primeiro admin criado via setup endpoint")
    
    return {
        "success": True,
        "message": "Admin criado com sucesso!",
        "username": "admin",
        "password": "admin123",
        "email": "admin@hwi.pt",
        "instrucoes": "Faça login com estas credenciais e mude a senha imediatamente!"
    }


@api_router.get("/health")
async def health_check():
    """Verificar saúde do sistema - SEM autenticação"""
    try:
        # Testar conexão com MongoDB
        await db.users.find_one({})
        db_status = "✅ Conectado"
    except Exception as e:
        db_status = f"❌ Erro: {str(e)[:100]}"
    
    return {
        "status": "running",
        "database": db_status,
        "db_name": db_name,
        "mongo_url_prefix": mongo_url[:30] + "..."
    }


# ============ Day Authorization Helper Functions ============

async def get_special_day_info(check_date: date, user_id: str):
    """
    Verifica se um dia é especial (férias, feriado, sábado, domingo)
    e retorna informações sobre o tipo de dia
    
    Returns:
        dict: {
            "is_special": bool,
            "day_type": str (ferias/feriado/sabado/domingo/normal),
            "day_type_display": str,
            "vacation_request_id": str or None
        }
    """
    today_str = check_date.strftime("%Y-%m-%d")
    
    # 1. Verificar se está de férias
    vacation_request = await db.vacation_requests.find_one({
        "user_id": user_id,
        "status": "approved",
        "start_date": {"$lte": today_str},
        "end_date": {"$gte": today_str}
    }, {"_id": 0})
    
    if vacation_request:
        return {
            "is_special": True,
            "day_type": "ferias",
            "day_type_display": "Férias",
            "vacation_request_id": vacation_request.get("id")
        }
    
    # 2. Verificar se é feriado
    is_hol, hol_name = is_holiday(check_date)
    if is_hol:
        return {
            "is_special": True,
            "day_type": "feriado",
            "day_type_display": f"Feriado: {hol_name}",
            "vacation_request_id": None
        }
    
    # 3. Verificar se é sábado
    if check_date.weekday() == 5:
        return {
            "is_special": True,
            "day_type": "sabado",
            "day_type_display": "Sábado",
            "vacation_request_id": None
        }
    
    # 4. Verificar se é domingo
    if check_date.weekday() == 6:
        return {
            "is_special": True,
            "day_type": "domingo",
            "day_type_display": "Domingo",
            "vacation_request_id": None
        }
    
    # Dia normal
    return {
        "is_special": False,
        "day_type": "normal",
        "day_type_display": "Dia útil",
        "vacation_request_id": None
    }


async def get_day_authorization(user_id: str, date_str: str):
    """
    Obtém o estado de autorização do dia para um utilizador
    
    Returns:
        dict or None: O documento de autorização do dia se existir
    """
    return await db.day_authorizations.find_one({
        "user_id": user_id,
        "date": date_str
    }, {"_id": 0})


async def create_day_authorization_request(
    user_id: str,
    user_name: str,
    date_str: str,
    day_type: str,
    day_type_display: str,
    entry_id: str,
    entry_time: str,
    vacation_request_id: str = None
):
    """
    Cria um pedido de autorização diária e envia notificação push aos admins
    
    Args:
        user_id: ID do utilizador
        user_name: Nome do utilizador
        date_str: Data no formato YYYY-MM-DD
        day_type: Tipo do dia (ferias/feriado/sabado/domingo)
        day_type_display: Descrição legível do tipo de dia
        entry_id: ID da primeira picagem
        entry_time: Hora da primeira picagem (HH:MM)
        vacation_request_id: ID do pedido de férias (se aplicável)
    
    Returns:
        dict: O documento de autorização criado
    """
    auth_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_name": user_name,
        "date": date_str,
        "day_type": day_type,
        "day_type_display": day_type_display,
        "status": "pending",
        "first_entry_id": entry_id,
        "first_entry_time": entry_time,
        "vacation_request_id": vacation_request_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "decided_by": None,
        "decided_at": None,
        "notification_sent": True
    }
    
    await db.day_authorizations.insert_one(auth_doc)
    
    # Enviar notificação push aos admins
    date_formatted = datetime.strptime(date_str, "%Y-%m-%d").strftime("%d/%m/%Y")
    
    if day_type == "ferias":
        push_title = f"⚠️ Trabalho em Férias - {user_name}"
        push_body = f"{user_name} iniciou ponto às {entry_time} em dia de férias ({date_formatted}). Se autorizado, 1 dia de férias será devolvido."
    elif day_type == "feriado":
        push_title = f"🏛️ Trabalho em Feriado - {user_name}"
        push_body = f"{user_name} iniciou ponto às {entry_time} ({day_type_display} - {date_formatted}). Autorizar trabalho?"
    else:
        push_title = f"📅 Trabalho em {day_type_display} - {user_name}"
        push_body = f"{user_name} iniciou ponto às {entry_time} ({date_formatted}). Autorizar trabalho?"
    
    await send_push_to_admins(
        db,
        push_title,
        push_body,
        "day_authorization",
        "high"
    )
    
    logging.info(f"Pedido de autorização diária criado: {user_name} em {date_str} ({day_type_display})")
    
    # Remover _id antes de retornar
    auth_doc.pop("_id", None)
    return auth_doc


# ============ Vacation Routes ============

@api_router.get("/vacations/balance")
async def get_vacation_balance(current_user: dict = Depends(get_current_user)):
    """Get current user's vacation balance"""
    balance = await db.vacation_balances.find_one({"user_id": current_user["sub"]}, {"_id": 0})
    
    if not balance:
        return {"days_earned": 0, "days_taken": 0, "days_available": 0, "year": date.today().year, "message": "Configure a data de início na empresa"}
    
    return {
        "days_earned": balance.get("days_earned", 22),
        "days_taken": balance.get("days_taken", 0),
        "days_available": balance.get("days_available", 0),
        "year": balance.get("year", date.today().year),
        "company_start_date": balance.get("company_start_date", "")
    }

@api_router.post("/vacations/request")
async def request_vacation(request_data: VacationRequestCreate, current_user: dict = Depends(get_current_user)):
    """Request vacation days"""
    # Calculate days requested
    start = datetime.strptime(request_data.start_date, "%Y-%m-%d").date()
    end = datetime.strptime(request_data.end_date, "%Y-%m-%d").date()
    
    if start > end:
        raise HTTPException(status_code=400, detail="Data de início deve ser anterior à data de fim")
    
    # Count only weekdays
    days_requested = 0
    current_date = start
    while current_date <= end:
        if current_date.weekday() < 5:  # Monday to Friday
            days_requested += 1
        current_date += timedelta(days=1)
    
    # Check if user has vacation balance configured
    balance = await db.vacation_balances.find_one({"user_id": current_user["sub"]})
    
    # Create vacation request
    vac_request = VacationRequest(
        user_id=current_user["sub"],
        username=current_user["username"],
        start_date=request_data.start_date,
        end_date=request_data.end_date,
        days_requested=days_requested,
        reason=request_data.reason,
        status="pending"
    )
    
    req_dict = vac_request.model_dump()
    req_dict['created_at'] = req_dict['created_at'].isoformat()
    await db.vacation_requests.insert_one(req_dict)
    
    # Get user details for email
    user = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0})
    user_full_name = user.get("full_name", current_user["username"])
    user_email = user.get("email", "")
    
    # Send email to team (geral@hwi.pt)
    await send_vacation_request_email(
        user_name=user_full_name,
        user_email=user_email,
        start_date=request_data.start_date,
        end_date=request_data.end_date,
        days_requested=days_requested
    )
    
    # Notify all admins
    admins = await db.users.find({"is_admin": True}, {"_id": 0, "id": 1}).to_list(100)
    for admin in admins:
        await create_notification(
            admin["id"],
            "vacation_request",
            f"Novo pedido de férias de {current_user['username']}: {days_requested} dias",
            vac_request.id
        )
    
    # Enviar PUSH notification aos admins
    await send_push_to_admins(
        db,
        f"📅 Novo Pedido de Férias",
        f"{current_user['username']} pediu {days_requested} dias de férias ({request_data.start_date} a {request_data.end_date})",
        "vacation_request",
        "high"
    )
    
    # Notificar o próprio utilizador (confirmação de submissão)
    await create_notification(
        current_user["sub"],
        "vacation_request_submitted",
        f"O seu pedido de férias de {request_data.start_date} a {request_data.end_date} ({days_requested} dias) foi submetido e aguarda aprovação.",
        vac_request.id
    )
    
    return {"message": "Pedido de férias submetido", "request_id": vac_request.id, "days_requested": days_requested}

@api_router.get("/vacations/my-requests")
async def get_my_vacation_requests(current_user: dict = Depends(get_current_user)):
    """Get current user's vacation requests"""
    requests = await db.vacation_requests.find(
        {"user_id": current_user["sub"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return requests

@api_router.get("/vacations/approved-days")
async def get_approved_vacation_days(current_user: dict = Depends(get_current_user)):
    """Get all individual approved vacation days for the current user"""
    approved_requests = await db.vacation_requests.find(
        {"user_id": current_user["sub"], "status": "approved"},
        {"_id": 0}
    ).to_list(200)
    
    # Also get cancelled days to exclude them
    cancelled = await db.cancelled_vacation_days.find(
        {"user_id": current_user["sub"]},
        {"_id": 0}
    ).to_list(500)
    cancelled_dates = set(c["date"] for c in cancelled)
    
    days = []
    for req in approved_requests:
        start = datetime.strptime(req["start_date"], "%Y-%m-%d").date()
        end = datetime.strptime(req["end_date"], "%Y-%m-%d").date()
        current = start
        while current <= end:
            if current.weekday() < 5:  # Only weekdays
                date_str = current.strftime("%Y-%m-%d")
                if date_str not in cancelled_dates:
                    days.append({
                        "date": date_str,
                        "request_id": req["id"],
                        "start_date": req["start_date"],
                        "end_date": req["end_date"]
                    })
            current += timedelta(days=1)
    
    return days

@api_router.post("/vacations/cancel-days")
async def cancel_vacation_days(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Cancel specific vacation days and refund them to the balance"""
    dates_to_cancel = data.get("dates", [])
    if not dates_to_cancel:
        raise HTTPException(status_code=400, detail="Nenhum dia selecionado")
    
    # Verify all dates belong to approved vacation requests of this user
    approved_requests = await db.vacation_requests.find(
        {"user_id": current_user["sub"], "status": "approved"},
        {"_id": 0}
    ).to_list(200)
    
    # Get already cancelled days
    cancelled = await db.cancelled_vacation_days.find(
        {"user_id": current_user["sub"]},
        {"_id": 0}
    ).to_list(500)
    already_cancelled = set(c["date"] for c in cancelled)
    
    valid_dates = []
    for date_str in dates_to_cancel:
        if date_str in already_cancelled:
            continue
        for req in approved_requests:
            start = datetime.strptime(req["start_date"], "%Y-%m-%d").date()
            end = datetime.strptime(req["end_date"], "%Y-%m-%d").date()
            cancel_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            if start <= cancel_date <= end and cancel_date.weekday() < 5:
                valid_dates.append(date_str)
                break
    
    if not valid_dates:
        raise HTTPException(status_code=400, detail="Nenhum dia válido para cancelar")
    
    # Insert cancelled days records
    for date_str in valid_dates:
        await db.cancelled_vacation_days.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": current_user["sub"],
            "date": date_str,
            "cancelled_at": datetime.now(timezone.utc).isoformat()
        })
    
    # Update vacation balance - refund the days
    days_refunded = len(valid_dates)
    await db.vacation_balances.update_one(
        {"user_id": current_user["sub"]},
        {"$inc": {
            "days_taken": -days_refunded,
            "days_available": days_refunded
        }}
    )
    
    # Notify admins
    await create_notification(
        current_user["sub"],
        "vacation_day_refunded",
        f"Cancelou {days_refunded} dia(s) de férias: {', '.join(valid_dates)}",
        None
    )
    
    return {"message": f"{days_refunded} dia(s) de férias cancelado(s) e devolvido(s)", "days_refunded": days_refunded}



@api_router.post("/vacations/update-start-date")
async def update_company_start_date(
    company_start_date: str,
    vacation_days_taken: int = 0,
    current_user: dict = Depends(get_current_user)
):
    """Update or create company start date for vacation calculation"""
    existing = await db.vacation_balances.find_one({"user_id": current_user["sub"]})
    
    calc = calculate_vacation_days(company_start_date, vacation_days_taken)
    
    if existing:
        await db.vacation_balances.update_one(
            {"user_id": current_user["sub"]},
            {"$set": {
                "company_start_date": company_start_date,
                "year": date.today().year,
                "days_taken": vacation_days_taken,
                "days_earned": calc["days_earned"],
                "days_available": calc["days_available"],
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    else:
        balance = VacationBalance(
            user_id=current_user["sub"],
            year=date.today().year,
            company_start_date=company_start_date,
            days_earned=calc["days_earned"],
            days_taken=vacation_days_taken,
            days_available=calc["days_available"]
        )
        bal_dict = balance.model_dump()
        bal_dict['updated_at'] = bal_dict['updated_at'].isoformat()
        await db.vacation_balances.insert_one(bal_dict)
    
    return {"message": "Data atualizada com sucesso", **calc}


# ============ Day Authorization Routes ============

@api_router.get("/admin/day-authorizations")
async def get_day_authorizations(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_admin)
):
    """
    Listar pedidos de autorização diária (admin only)
    
    Query params:
        status: filtrar por status (pending, authorized, rejected)
    """
    query = {}
    if status:
        query["status"] = status
    
    authorizations = await db.day_authorizations.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return authorizations


@api_router.get("/admin/day-authorizations/pending")
async def get_pending_day_authorizations(current_user: dict = Depends(get_current_admin)):
    """Listar apenas pedidos de autorização pendentes (admin only)"""
    authorizations = await db.day_authorizations.find(
        {"status": "pending"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return authorizations


@api_router.post("/admin/day-authorizations/{auth_id}/decide")
async def decide_day_authorization(
    auth_id: str,
    decision: dict,
    current_user: dict = Depends(get_current_admin)
):
    """
    Aprovar ou rejeitar autorização diária
    
    Uma aprovação desbloqueia o dia inteiro (todas as picagens seguintes são permitidas)
    Uma rejeição bloqueia todas as picagens desse dia
    
    Para dias de férias aprovados: devolve 1 dia de férias ao saldo
    
    Body:
        action: "approve" ou "reject"
    """
    action = decision.get("action")
    if action not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="Ação inválida. Use 'approve' ou 'reject'")
    
    # Buscar autorização
    auth = await db.day_authorizations.find_one({"id": auth_id}, {"_id": 0})
    if not auth:
        raise HTTPException(status_code=404, detail="Autorização não encontrada")
    
    if auth.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Autorização já foi decidida: {auth.get('status')}")
    
    new_status = "authorized" if action == "approve" else "rejected"
    admin_name = current_user.get("full_name") or current_user.get("username")
    
    # Atualizar autorização
    await db.day_authorizations.update_one(
        {"id": auth_id},
        {"$set": {
            "status": new_status,
            "decided_by": admin_name,
            "decided_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Se rejeitado, eliminar a primeira entrada de ponto
    if action == "reject":
        first_entry_id = auth.get("first_entry_id")
        if first_entry_id:
            await db.time_entries.delete_one({"id": first_entry_id})
            logging.info(f"Entrada de ponto {first_entry_id} eliminada após rejeição")
    
    # Se aprovado E é dia de férias, devolver 1 dia ao saldo
    vacation_day_returned = False
    if action == "approve" and auth.get("day_type") == "ferias":
        user_id = auth.get("user_id")
        vacation_request_id = auth.get("vacation_request_id")
        
        # Buscar saldo de férias do utilizador
        current_year = datetime.now().year
        balance = await db.vacation_balances.find_one({
            "user_id": user_id,
            "year": current_year
        })
        
        if balance:
            # Devolver 1 dia
            new_used = max(0, balance.get("used_days", 0) - 1)
            new_remaining = balance.get("total_days", 22) - new_used
            
            await db.vacation_balances.update_one(
                {"user_id": user_id, "year": current_year},
                {"$set": {
                    "used_days": new_used,
                    "remaining_days": new_remaining
                }}
            )
            
            vacation_day_returned = True
            logging.info(f"1 dia de férias devolvido ao utilizador {auth.get('user_name')}")
    
    # Atualizar status nas entradas de ponto deste utilizador/dia
    await db.time_entries.update_many(
        {
            "user_id": auth.get("user_id"),
            "date": auth.get("date")
        },
        {"$set": {
            "day_authorization_status": new_status
        }}
    )
    
    # Enviar notificação ao utilizador
    user_id = auth.get("user_id")
    day_type_display = auth.get("day_type_display", "Dia especial")
    date_formatted = datetime.strptime(auth["date"], "%Y-%m-%d").strftime("%d/%m/%Y")
    
    if action == "approve":
        if auth.get("day_type") == "ferias":
            notif_message = f"Trabalho em dia de férias ({date_formatted}) autorizado. 1 dia de férias foi devolvido ao seu saldo."
        else:
            notif_message = f"Trabalho em {day_type_display} ({date_formatted}) autorizado."
        
        await send_push_notification(
            db, user_id,
            "✅ Trabalho Autorizado",
            notif_message,
            "day_authorization_approved",
            "normal"
        )
    else:
        notif_message = f"Trabalho em {day_type_display} ({date_formatted}) não autorizado. A entrada de ponto foi eliminada."
        
        await send_push_notification(
            db, user_id,
            "❌ Trabalho Não Autorizado",
            notif_message,
            "day_authorization_rejected",
            "normal"
        )
    
    # Criar notificação interna
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": f"day_authorization_{action}d",
        "title": "Trabalho Autorizado" if action == "approve" else "Trabalho Não Autorizado",
        "message": notif_message,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read": False
    }
    await db.notifications.insert_one(notification)
    
    response = {
        "message": f"Autorização {'aprovada' if action == 'approve' else 'rejeitada'}",
        "authorization_id": auth_id,
        "status": new_status,
        "user_name": auth.get("user_name"),
        "date": auth.get("date"),
        "day_type": auth.get("day_type_display")
    }
    
    if vacation_day_returned:
        response["vacation_day_returned"] = True
        response["vacation_message"] = "1 dia de férias devolvido ao saldo"
    
    return response


@api_router.get("/day-authorization/status")
async def get_my_day_authorization_status(
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Verificar estado de autorização do dia para o utilizador atual
    
    Query params:
        date: Data no formato YYYY-MM-DD (default: hoje)
    """
    if not date:
        date = get_now_local().strftime("%Y-%m-%d")
    
    # Verificar se é dia especial
    check_date = datetime.strptime(date, "%Y-%m-%d").date()
    day_info = await get_special_day_info(check_date, current_user["sub"])
    
    if not day_info["is_special"]:
        return {
            "date": date,
            "is_special_day": False,
            "day_type": "normal",
            "can_clock_in": True
        }
    
    # Verificar autorização
    auth = await get_day_authorization(current_user["sub"], date)
    
    if not auth:
        return {
            "date": date,
            "is_special_day": True,
            "day_type": day_info["day_type"],
            "day_type_display": day_info["day_type_display"],
            "authorization_status": None,
            "can_clock_in": True,
            "message": "Primeira picagem irá criar pedido de autorização"
        }
    
    status = auth.get("status")
    can_clock_in = status in ["pending", "authorized"]
    
    return {
        "date": date,
        "is_special_day": True,
        "day_type": day_info["day_type"],
        "day_type_display": day_info["day_type_display"],
        "authorization_id": auth.get("id"),
        "authorization_status": status,
        "decided_by": auth.get("decided_by"),
        "decided_at": auth.get("decided_at"),
        "can_clock_in": can_clock_in,
        "message": "Autorizado" if status == "authorized" else ("Aguarda aprovação" if status == "pending" else "Não autorizado")
    }


# ============ Admin Routes ============

@api_router.get("/admin/users")
async def get_all_users(current_user: dict = Depends(get_current_admin)):
    """Get all users (admin only)"""
    users = await db.users.find({}, {"_id": 0, "hashed_password": 0, "password": 0}).to_list(1000)
    return users


@api_router.get("/users")
async def get_users_list(current_user: dict = Depends(get_current_user)):
    """Listar usuários para seleção em formulários (requer autenticação)"""
    users = await db.users.find(
        {},
        {"_id": 0, "hashed_password": 0}
    ).to_list(1000)
    return users


@api_router.post("/admin/users/create")
async def admin_create_user(user_data: UserCreate, current_user: dict = Depends(get_current_admin)):
    """Create a new user (admin only)"""
    # Check if user exists
    existing_user = await db.users.find_one({"username": user_data.username})
    if existing_user:
        raise HTTPException(status_code=400, detail="Utilizador já existe")
    
    # Check if email already exists
    existing_email = await db.users.find_one({"email": user_data.email})
    if existing_email:
        raise HTTPException(status_code=400, detail="Email já está registado")
    
    # Determine if user is admin
    admin_emails = ["pedro.duarte@hwi.pt", "miguel.moreira@hwi.pt"]
    is_admin = user_data.email in admin_emails
    
    # Create user
    hashed_password = get_password_hash(user_data.password)
    user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        phone=user_data.phone,
        is_admin=is_admin
    )
    
    user_dict = user.model_dump()
    user_dict['created_at'] = user_dict['created_at'].isoformat()
    user_dict['plain_password'] = user_data.password
    await db.users.insert_one(user_dict)
    
    # Create vacation balance if company start date provided
    if user_data.company_start_date:
        vacation_balance = VacationBalance(
            user_id=user.id,
            company_start_date=user_data.company_start_date,
            days_earned=0,
            days_taken=user_data.vacation_days_taken,
            days_available=0
        )
        vac_dict = vacation_balance.model_dump()
        vac_dict['updated_at'] = vac_dict['updated_at'].isoformat()
        await db.vacation_balances.insert_one(vac_dict)
    
    return {"message": "Utilizador criado com sucesso", "user_id": user.id}

@api_router.put("/admin/users/{user_id}")
async def admin_update_user(
    user_id: str,
    update_data: UserUpdate,
    current_user: dict = Depends(get_current_admin)
):
    """Update user data (admin only)"""
    user = await db.users.find_one({"id": user_id})
    
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    
    update_dict = {}
    
    if update_data.username:
        # Check if new username already exists
        existing = await db.users.find_one({"username": update_data.username, "id": {"$ne": user_id}})
        if existing:
            raise HTTPException(status_code=400, detail="Username já existe")
        update_dict["username"] = update_data.username
    
    if update_data.email:
        # Check if new email already exists
        existing = await db.users.find_one({"email": update_data.email, "id": {"$ne": user_id}})
        if existing:
            raise HTTPException(status_code=400, detail="Email já está registado")
        update_dict["email"] = update_data.email
    
    if update_data.full_name is not None:
        update_dict["full_name"] = update_data.full_name
    
    if update_data.password:
        update_dict["hashed_password"] = get_password_hash(update_data.password)
        update_dict["plain_password"] = update_data.password
    
    if update_data.is_admin is not None:
        update_dict["is_admin"] = update_data.is_admin
    
    if update_data.tipo_colaborador is not None:
        if update_data.tipo_colaborador in ("junior", "tecnico", "senior", "ajudante", ""):
            update_dict["tipo_colaborador"] = update_data.tipo_colaborador if update_data.tipo_colaborador else None
    
    if update_dict:
        await db.users.update_one({"id": user_id}, {"$set": update_dict})
    
    return {"message": "Utilizador atualizado com sucesso"}

@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, current_user: dict = Depends(get_current_admin)):
    """Delete user and all their data (admin only)"""
    user = await db.users.find_one({"id": user_id})
    
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    
    # Delete all user data
    await db.time_entries.delete_many({"user_id": user_id})
    await db.vacation_requests.delete_many({"user_id": user_id})
    await db.vacation_balances.delete_many({"user_id": user_id})
    await db.absences.delete_many({"user_id": user_id})
    await db.notifications.delete_many({"user_id": user_id})
    
    # Delete user
    await db.users.delete_one({"id": user_id})
    
    return {"message": f"Utilizador {user['username']} e todos os seus dados foram eliminados"}

@api_router.get("/admin/vacations/pending")
async def get_pending_vacation_requests(current_user: dict = Depends(get_current_admin)):
    """Get all pending vacation requests (admin only)"""
    requests = await db.vacation_requests.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return requests

@api_router.get("/admin/vacations/all-balances")
async def get_all_vacation_balances(current_user: dict = Depends(get_current_admin)):
    """Get vacation balances for all users with transition history (admin only)"""
    balances = await db.vacation_balances.find({}, {"_id": 0}).to_list(None)
    
    # Mapear dados dos users
    users = await db.users.find({}, {"_id": 0, "id": 1, "username": 1, "full_name": 1, "is_active": 1}).to_list(None)
    users_map = {u["id"]: u for u in users}
    
    # Buscar logs de transição anual
    logs = await db.vacation_annual_log.find({}, {"_id": 0}).sort("transition_date", -1).to_list(None)
    logs_by_user = {}
    for log in logs:
        uid = log["user_id"]
        if uid not in logs_by_user:
            logs_by_user[uid] = []
        logs_by_user[uid].append(log)
    
    # Buscar pedidos aprovados por user (do ano corrente)
    current_year = date.today().year
    approved_requests = await db.vacation_requests.find(
        {"status": "approved"},
        {"_id": 0}
    ).sort("start_date", -1).to_list(None)
    
    requests_by_user = {}
    for req in approved_requests:
        uid = req["user_id"]
        if uid not in requests_by_user:
            requests_by_user[uid] = []
        requests_by_user[uid].append(req)
    
    result = []
    for balance in balances:
        uid = balance["user_id"]
        user_info = users_map.get(uid, {})
        
        result.append({
            "user_id": uid,
            "username": user_info.get("username", "?"),
            "full_name": user_info.get("full_name", user_info.get("username", "?")),
            "is_active": user_info.get("is_active", True),
            "year": balance.get("year", current_year),
            "days_earned": balance.get("days_earned", 0),
            "days_taken": balance.get("days_taken", 0),
            "days_available": balance.get("days_available", 0),
            "company_start_date": balance.get("company_start_date", ""),
            "annual_transitions": logs_by_user.get(uid, []),
            "approved_requests": requests_by_user.get(uid, [])
        })
    
    # Ordenar por nome
    result.sort(key=lambda x: (x.get("full_name") or x.get("username", "")).lower())
    
    return result



@api_router.post("/admin/vacations/{request_id}/approve")
async def approve_vacation(
    request_id: str,
    approved: bool,
    current_user: dict = Depends(get_current_admin)
):
    """Approve or reject vacation request (admin only)"""
    vac_request = await db.vacation_requests.find_one({"id": request_id})
    
    if not vac_request:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    
    if vac_request["status"] != "pending":
        raise HTTPException(status_code=400, detail="Pedido já foi processado")
    
    new_status = "approved" if approved else "rejected"
    
    await db.vacation_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": new_status,
            "reviewed_by": current_user["username"],
            "reviewed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # If approved, update days taken and days available
    if approved:
        await db.vacation_balances.update_one(
            {"user_id": vac_request["user_id"]},
            {"$inc": {
                "days_taken": vac_request["days_requested"],
                "days_available": -vac_request["days_requested"]
            }}
        )
    
    # Get user details for email
    user = await db.users.find_one({"id": vac_request["user_id"]}, {"_id": 0})
    if user:
        user_full_name = user.get("full_name", vac_request["username"])
        user_email = user.get("email", "")
        
        # Send email to user
        await send_vacation_decision_email(
            user_name=user_full_name,
            user_email=user_email,
            start_date=vac_request["start_date"],
            end_date=vac_request["end_date"],
            approved=approved,
            observations=None  # Can be extended to include observations
        )
    
    # Notify user
    message = f"O seu pedido de férias foi {'aprovado' if approved else 'rejeitado'} por {current_user['username']}"
    await create_notification(
        vac_request["user_id"],
        f"vacation_{'approved' if approved else 'rejected'}",
        message,
        request_id
    )
    
    # Enviar PUSH notification ao utilizador
    push_title = f"{'✅ Férias Aprovadas' if approved else '❌ Férias Rejeitadas'}"
    push_message = f"O seu pedido de férias ({vac_request['start_date']} a {vac_request['end_date']}) foi {'aprovado' if approved else 'rejeitado'} por {current_user['username']}"
    await send_push_notification(
        db,
        vac_request["user_id"],
        push_title,
        push_message,
        f"vacation_{'approved' if approved else 'rejected'}",
        "high"
    )
    
    return {"message": f"Pedido {'aprovado' if approved else 'rejeitado'} com sucesso"}

@api_router.get("/admin/reports/all")
async def get_all_reports(
    period: str = "billing",
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: dict = Depends(get_current_admin)
):
    """Get consolidated reports for all users (admin only)"""
    now = get_now_local()
    
    # Se mês e ano foram especificados, usar esses valores
    # Período: dia 26 do mês anterior até dia 25 do mês selecionado
    if month and year:
        # Calcular mês anterior
        prev_month = month - 1
        prev_year = year
        if prev_month < 1:
            prev_month = 12
            prev_year -= 1
        
        # Data início: dia 26 do mês anterior
        start_date = f"{prev_year}-{str(prev_month).zfill(2)}-26"
        # Data fim: dia 25 do mês selecionado
        end_date = f"{year}-{str(month).zfill(2)}-25"
    elif period == "billing":
        start_dt, end_dt = get_billing_period_dates(now.date())
        start_date = start_dt.strftime("%Y-%m-%d")
        end_date = end_dt.strftime("%Y-%m-%d")
    elif period == "week":
        start_date = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        end_date = now.strftime("%Y-%m-%d")
    else:
        start_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        end_date = now.strftime("%Y-%m-%d")
    
    # Get all entries in period
    entries = await db.time_entries.find({
        "date": {"$gte": start_date, "$lte": end_date},
        "status": "completed"
    }, {"_id": 0}).to_list(10000)
    
    # Group by user
    user_stats = {}
    user_dates = {}  # Track unique dates per user
    
    # Pre-fetch user info for entries without username
    users_cache = {}
    
    for entry in entries:
        user_id = entry.get("user_id")
        if not user_id:
            continue
            
        if user_id not in user_stats:
            # Get username from entry or fetch from users collection
            username = entry.get("username")
            if not username:
                if user_id not in users_cache:
                    user_doc = await db.users.find_one({"id": user_id})
                    users_cache[user_id] = user_doc.get("username", "Unknown") if user_doc else "Unknown"
                username = users_cache[user_id]
                
            user_stats[user_id] = {
                "user_id": user_id,
                "username": username,
                "total_hours": 0,
                "regular_hours": 0,
                "overtime_hours": 0,
                "days_worked": 0
            }
            user_dates[user_id] = set()
        user_stats[user_id]["total_hours"] += entry.get("total_hours", 0)
        user_stats[user_id]["regular_hours"] += entry.get("regular_hours", 0)
        user_stats[user_id]["overtime_hours"] += entry.get("overtime_hours", 0)
        # Track unique dates
        entry_date = entry.get("date")
        if entry_date:
            user_dates[user_id].add(entry_date)
    
    # Apply truncar_horas_para_minutos (same as /reports) and count unique days
    for user_id, stats in user_stats.items():
        stats["regular_hours"] = round(truncar_horas_para_minutos(stats["regular_hours"]), 2)
        stats["overtime_hours"] = round(truncar_horas_para_minutos(stats["overtime_hours"]), 2)
        stats["total_hours"] = round(stats["total_hours"], 2)
        stats["days_worked"] = len(user_dates.get(user_id, set()))
    
    return {
        "period": period,
        "start_date": start_date,
        "end_date": end_date,
        "users": list(user_stats.values())
    }

# ============ Notifications Routes ============

@api_router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    """Get user notifications"""
    notifications = await db.notifications.find(
        {"user_id": current_user["sub"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return notifications

@api_router.post("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    """Mark notification as read"""
    await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user["sub"]},
        {"$set": {"read": True}}
    )
    return {"message": "Notificação marcada como lida"}

@api_router.get("/notifications/unread/count")
async def get_unread_count(current_user: dict = Depends(get_current_user)):
    """Get count of unread notifications"""
    count = await db.notifications.count_documents({
        "user_id": current_user["sub"],
        "read": False
    })
    return {"unread_count": count}

# ============ Absence Routes ============

# Create uploads directory
UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

@api_router.post("/absences/create")
async def create_absence(absence_data: AbsenceCreate, current_user: dict = Depends(get_current_user)):
    """Create an absence entry"""
    # Check if already has entry for this date
    existing_entry = await db.time_entries.find_one({
        "user_id": current_user["sub"],
        "date": absence_data.date
    })
    
    if existing_entry:
        raise HTTPException(status_code=400, detail="Já existe um registo de ponto para este dia")
    
    # Check if absence already exists
    existing_absence = await db.absences.find_one({
        "user_id": current_user["sub"],
        "date": absence_data.date
    })
    
    if existing_absence:
        raise HTTPException(status_code=400, detail="Já existe uma falta registada para este dia")
    
    absence = Absence(
        user_id=current_user["sub"],
        username=current_user["username"],
        date=absence_data.date,
        absence_type=absence_data.absence_type,
        hours=absence_data.hours,
        is_justified=absence_data.is_justified,
        reason=absence_data.reason,
        status="pending"
    )
    
    abs_dict = absence.model_dump()
    abs_dict['created_at'] = abs_dict['created_at'].isoformat()
    await db.absences.insert_one(abs_dict)
    
    # Notify admins
    admins = await db.users.find({"is_admin": True}, {"_id": 0, "id": 1}).to_list(100)
    for admin in admins:
        await create_notification(
            admin["id"],
            "absence_created",
            f"Nova falta registada por {current_user['username']}: {absence_data.hours}h em {absence_data.date}",
            absence.id
        )
    
    return {"message": "Falta registada com sucesso", "absence_id": absence.id}

@api_router.post("/absences/{absence_id}/upload")
async def upload_justification(
    absence_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload justification file for absence"""
    absence = await db.absences.find_one({"id": absence_id, "user_id": current_user["sub"]})
    
    if not absence:
        raise HTTPException(status_code=404, detail="Falta não encontrada")
    
    # Validate file type
    allowed_extensions = [".pdf", ".jpg", ".jpeg", ".png"]
    file_ext = Path(file.filename).suffix.lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Apenas PDF, JPG e PNG são permitidos")
    
    # Save file
    file_name = f"{absence_id}_{file.filename}"
    file_path = UPLOAD_DIR / file_name
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Update absence with filename
    await db.absences.update_one(
        {"id": absence_id},
        {"$set": {"justification_file": file_name}}
    )
    
    # Get user details for email
    user = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0})
    if user:
        user_full_name = user.get("full_name", current_user["username"])
        user_email = user.get("email", "")
        
        # Send email to team (geral@hwi.pt)
        await send_absence_justification_email(
            user_name=user_full_name,
            user_email=user_email,
            absence_date=absence["date"],
            filename=file.filename
        )
    
    return {"message": "Ficheiro carregado com sucesso", "filename": file_name}

@api_router.get("/absences/file/{filename}")
async def get_justification_file(filename: str, current_user: dict = Depends(get_current_user)):
    """Download justification file"""
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Ficheiro não encontrado")
    
    # Extract absence_id from filename
    absence_id = filename.split("_")[0]
    
    # Check if user owns this absence or is admin
    user = await db.users.find_one({"id": current_user["sub"]})
    absence = await db.absences.find_one({"id": absence_id})
    
    if not absence:
        raise HTTPException(status_code=404, detail="Falta não encontrada")
    
    if absence["user_id"] != current_user["sub"] and not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Sem permissão para aceder a este ficheiro")
    
    return FileResponse(file_path)

@api_router.get("/absences/my-absences")
async def get_my_absences(current_user: dict = Depends(get_current_user)):
    """Get current user's absences"""
    absences = await db.absences.find(
        {"user_id": current_user["sub"]},
        {"_id": 0}
    ).sort("date", -1).to_list(100)
    return absences

@api_router.get("/absences/check-late")
async def check_late_arrival(current_user: dict = Depends(get_current_user)):
    """Check if user is late (after 9am on weekday) and send notification"""
    now = get_now_local()
    today = now.strftime("%Y-%m-%d")
    current_time = now.time()
    
    # Only check on weekdays after 9am
    is_ot, _ = is_overtime_day(now.date())
    if is_ot:  # Weekend or holiday
        return {"is_late": False, "message": "Fim de semana ou feriado"}
    
    cutoff_time = time(9, 0)  # 9:00 AM
    
    if current_time < cutoff_time:
        return {"is_late": False, "message": "Ainda não passou das 9h"}
    
    # Check if already has time entry today
    entry = await db.time_entries.find_one({
        "user_id": current_user["sub"],
        "date": today
    })
    
    if entry:
        return {"is_late": False, "message": "Ponto já iniciado"}
    
    # Check if already notified today
    existing_notif = await db.notifications.find_one({
        "user_id": current_user["sub"],
        "type": "late_arrival",
        "created_at": {"$gte": today}
    })
    
    if existing_notif:
        return {"is_late": True, "message": "Já foi notificado", "already_notified": True}
    
    # Send notification
    await create_notification(
        current_user["sub"],
        "late_arrival",
        "Ainda não iniciou o ponto hoje. Se não estiver presente, por favor registe a falta.",
        None
    )
    
    return {"is_late": True, "message": "Notificação enviada", "already_notified": False}

# ============ Admin Absence Routes ============

@api_router.get("/admin/absences/all")
async def get_all_absences(current_user: dict = Depends(get_current_admin)):
    """Get all absences (admin only)"""
    absences = await db.absences.find({}, {"_id": 0}).sort("date", -1).to_list(1000)
    return absences

@api_router.post("/admin/absences/{absence_id}/review")
async def review_absence(
    absence_id: str,
    approved: bool,
    current_user: dict = Depends(get_current_admin)
):
    """Review absence (admin only)"""
    absence = await db.absences.find_one({"id": absence_id})
    
    if not absence:
        raise HTTPException(status_code=404, detail="Falta não encontrada")
    
    new_status = "approved" if approved else "rejected"
    
    await db.absences.update_one(
        {"id": absence_id},
        {"$set": {
            "status": new_status,
            "reviewed_by": current_user["username"],
            "reviewed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Get user details for email
    user = await db.users.find_one({"id": absence["user_id"]}, {"_id": 0})
    if user:
        user_full_name = user.get("full_name", absence["username"])
        user_email = user.get("email", "")
        
        # Send email to user
        await send_absence_decision_email(
            user_name=user_full_name,
            user_email=user_email,
            absence_date=absence["date"],
            approved=approved,
            observations=None  # Can be extended to include observations
        )
    
    # Notify user
    message = f"A sua falta de {absence['date']} foi {'aprovada' if approved else 'rejeitada'} por {current_user['username']}"
    await create_notification(
        absence["user_id"],
        f"absence_{'approved' if approved else 'rejected'}",
        message,
        absence_id
    )
    
    return {"message": f"Falta {'aprovada' if approved else 'rejeitada'} com sucesso"}

@api_router.post("/admin/recalculate-hours")
async def recalculate_all_hours(current_user: dict = Depends(get_current_admin)):
    """
    Recalculate overtime and special hours for all completed entries using new logic.
    Admin only endpoint.
    """
    try:
        # Get all completed entries
        entries = await db.time_entries.find({
            "status": "completed"
        }).to_list(10000)
        
        updated_count = 0
        error_count = 0
        
        for entry in entries:
            try:
                total_hours = entry.get("total_hours", 0)
                if total_hours <= 0:
                    continue
                
                # Get the date to check if it's a special day
                entry_date_str = entry.get("date")
                if not entry_date_str:
                    continue
                
                entry_date = datetime.strptime(entry_date_str, "%Y-%m-%d").date()
                is_special_day, _ = is_overtime_day(entry_date)
                
                # Calculate new breakdown
                hours_breakdown = calculate_hours_breakdown(total_hours, is_special_day)
                
                # Update entry
                await db.time_entries.update_one(
                    {"id": entry.get("id")},
                    {"$set": {
                        "regular_hours": hours_breakdown["regular_hours"],
                        "overtime_hours": hours_breakdown["overtime_hours"],
                        "special_hours": hours_breakdown["special_hours"]
                    }}
                )
                
                updated_count += 1
                
            except Exception as e:
                error_count += 1
                logging.error(f"Error recalculating entry {entry.get('id')}: {str(e)}")
                continue
        
        return {
            "message": "Recálculo concluído com sucesso",
            "total_entries": len(entries),
            "updated": updated_count,
            "errors": error_count
        }
        
    except Exception as e:
        logging.error(f"Error in recalculate_all_hours: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao recalcular horas: {str(e)}")

# ============ Service Appointment Routes ============

@api_router.post("/services")
async def create_service(service_data: ServiceAppointmentCreate, current_user: dict = Depends(get_current_admin)):
    """Create new service appointment (admin only)"""
    # Validate technicians exist
    for tech_id in service_data.technician_ids:
        tech = await db.users.find_one({"id": tech_id}, {"_id": 0})
        if not tech:
            raise HTTPException(status_code=404, detail=f"Técnico com ID {tech_id} não encontrado")
    
    service = ServiceAppointment(
        **service_data.model_dump(),
        created_by=current_user["sub"]
    )
    
    service_dict = service.model_dump()
    service_dict['created_at'] = service_dict['created_at'].isoformat()
    
    await db.service_appointments.insert_one(service_dict)
    
    # Get technician emails and send notifications
    technician_emails = []
    for tech_id in service_data.technician_ids:
        tech = await db.users.find_one({"id": tech_id}, {"_id": 0, "email": 1, "full_name": 1, "username": 1})
        if tech:
            if tech.get('email'):
                technician_emails.append(tech['email'])
            
            # Criar notificação no sino
            await create_notification(
                tech_id,
                "service_assigned",
                f"Foi atribuído ao serviço em {service_data.client_name} ({service_data.location}) no dia {service_data.date}" + (f" às {service_data.time_slot}" if service_data.time_slot else ""),
                service.id
            )
            
            # Enviar PUSH notification ao técnico
            time_info = f" às {service_data.time_slot}" if service_data.time_slot else ""
            await send_push_notification(
                db,
                tech_id,
                "📅 Novo Serviço Atribuído",
                f"{service_data.client_name} - {service_data.location}\n{service_data.date}{time_info}",
                "service_assigned",
                "high"
            )
    
    # Send email notifications
    if technician_emails:
        await send_service_email(technician_emails, service_dict, "created")
    
    return {"message": "Serviço criado com sucesso", "service": {k: v for k, v in service_dict.items() if k != '_id'}}

@api_router.post("/services/with-ot")
async def create_service_with_ot(service_data: ServiceWithOTCreate, current_user: dict = Depends(get_current_admin)):
    """Criar serviço e FS associada automaticamente"""
    from datetime import date as dt_date
    
    # Validar técnicos existem
    for tech_id in service_data.technician_ids:
        tech = await db.users.find_one({"id": tech_id}, {"_id": 0})
        if not tech:
            raise HTTPException(status_code=404, detail=f"Técnico com ID {tech_id} não encontrado")
    
    # Buscar ou criar cliente
    cliente = None
    cliente_id = service_data.client_id
    
    if cliente_id:
        cliente = await db.clientes.find_one({"id": cliente_id}, {"_id": 0})
    
    if not cliente:
        # Criar cliente temporário se não existir
        cliente_id = str(uuid.uuid4())
        cliente = {
            "id": cliente_id,
            "nome": service_data.client_name,
            "morada": service_data.location,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.clientes.insert_one(cliente)
    
    # Gerar número de assistência para OT
    last_relatorio = await db.relatorios_tecnicos.find_one(
        {},
        sort=[("numero_assistencia", -1)]
    )
    last_numero = last_relatorio.get("numero_assistencia", 0) if last_relatorio else 0
    numero_assistencia = max(last_numero + 1, 354)
    
    # Converter datas
    data_inicio = dt_date.fromisoformat(service_data.date)
    data_fim = dt_date.fromisoformat(service_data.date_end) if service_data.date_end else None
    
    # Construir motivo combinando tipo + motivo
    tipo_label = "Assistência" if service_data.service_type == "assistencia" else "Montagem"
    motivo = service_data.service_reason if service_data.service_reason else tipo_label
    if service_data.service_reason:
        motivo = f"{tipo_label}: {service_data.service_reason}"
    
    # Criar Relatório Técnico (OT)
    relatorio = RelatorioTecnico(
        numero_assistencia=numero_assistencia,
        cliente_id=cliente_id,
        created_by_id=current_user["sub"],
        cliente_nome=cliente.get("nome", service_data.client_name),
        data_servico=data_inicio,
        data_fim=data_fim,
        local_intervencao=service_data.location,
        pedido_por=service_data.client_name,
        motivo_assistencia=motivo,
        status="agendado"  # Estado especial para OTs criadas via Calendário
    )
    
    relatorio_dict = relatorio.dict()
    relatorio_dict["data_criacao"] = relatorio_dict["data_criacao"].isoformat()
    relatorio_dict["data_servico"] = relatorio_dict["data_servico"].isoformat()
    if relatorio_dict.get("data_fim"):
        relatorio_dict["data_fim"] = relatorio_dict["data_fim"].isoformat()
    
    await db.relatorios_tecnicos.insert_one(relatorio_dict)
    
    # Criar Service Appointment associado à OT
    service = ServiceAppointment(
        client_name=service_data.client_name,
        location=service_data.location,
        service_reason=motivo,
        technician_ids=service_data.technician_ids,
        date=service_data.date,
        time_slot=service_data.time_slot,
        observations=service_data.observations,
        created_by=current_user["sub"]
    )
    
    service_dict = service.model_dump()
    service_dict['created_at'] = service_dict['created_at'].isoformat()
    service_dict['ot_id'] = relatorio.id  # Link para OT
    service_dict['ot_numero'] = numero_assistencia
    
    # Se tem data fim, criar serviços para cada dia no intervalo
    if data_fim and data_fim > data_inicio:
        # Inserir serviço original
        await db.service_appointments.insert_one(service_dict)
        
        # Criar serviços adicionais para cada dia do intervalo (sem duplicar o primeiro)
        current_date = data_inicio + timedelta(days=1)
        while current_date <= data_fim:
            additional_service = {k: v for k, v in service_dict.items() if k != '_id'}
            additional_service['id'] = str(uuid.uuid4())
            additional_service['date'] = current_date.isoformat()
            await db.service_appointments.insert_one(additional_service)
            current_date += timedelta(days=1)
    else:
        await db.service_appointments.insert_one(service_dict)
    
    # Enviar notificações para técnicos
    technician_emails = []
    for tech_id in service_data.technician_ids:
        tech = await db.users.find_one({"id": tech_id}, {"_id": 0, "email": 1, "full_name": 1, "username": 1})
        if tech:
            if tech.get('email'):
                technician_emails.append(tech['email'])
            
            # Criar notificação
            date_info = f"{service_data.date}"
            if service_data.date_end:
                date_info += f" até {service_data.date_end}"
            
            await create_notification(
                tech_id,
                "service_assigned",
                f"Foi atribuído ao serviço OT-{numero_assistencia} em {service_data.client_name} ({service_data.location}) - {date_info}" + (f" às {service_data.time_slot}" if service_data.time_slot else ""),
                service.id
            )
            
            # Enviar PUSH notification
            time_info = f" às {service_data.time_slot}" if service_data.time_slot else ""
            await send_push_notification(
                db,
                tech_id,
                f"📅 Novo Serviço - OT-{numero_assistencia}",
                f"{service_data.client_name} - {service_data.location}\n{date_info}{time_info}",
                "service_assigned",
                "high"
            )
    
    # Send email notifications
    if technician_emails:
        await send_service_email(technician_emails, service_dict, "created")
    
    return {
        "message": "Serviço e FS criados com sucesso",
        "service": {k: v for k, v in service_dict.items() if k != '_id'},
        "ot": {
            "id": relatorio.id,
            "numero_assistencia": numero_assistencia,
            "data_inicio": service_data.date,
            "data_fim": service_data.date_end
        }
    }

@api_router.get("/services")
async def get_services(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all service appointments"""
    query = {}
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        query["date"] = {"$gte": start_date}
    elif end_date:
        query["date"] = {"$lte": end_date}
    
    services = await db.service_appointments.find(query, {"_id": 0}).sort("date", 1).to_list(1000)
    
    # Enrich with technician names
    for service in services:
        tech_names = []
        for tech_id in service.get("technician_ids", []):
            tech = await db.users.find_one({"id": tech_id}, {"_id": 0, "username": 1})
            if tech:
                tech_names.append(tech["username"])
        service["technician_names"] = tech_names
    
    return services

@api_router.get("/services/calendar")
async def get_calendar_data(
    month: int,
    year: int,
    current_user: dict = Depends(get_current_user)
):
    """Get calendar data including services, vacations, and FS's for a specific month"""
    from datetime import timedelta
    
    # Calculate start and end dates for the month
    start_date = f"{year}-{month:02d}-01"
    if month == 12:
        end_date = f"{year + 1}-01-01"
    else:
        end_date = f"{year}-{month + 1:02d}-01"
    
    # Get services
    services = await db.service_appointments.find({
        "date": {"$gte": start_date, "$lt": end_date}
    }, {"_id": 0}).to_list(1000)
    
    # Enrich with technician info
    for service in services:
        tech_details = []
        for tech_id in service.get("technician_ids", []):
            tech = await db.users.find_one({"id": tech_id}, {"_id": 0, "username": 1, "email": 1})
            if tech:
                tech_details.append({"id": tech_id, "username": tech["username"]})
        service["technicians"] = tech_details
    
    # Get approved vacations
    vacations = await db.vacation_requests.find({
        "status": "approved",
        "$or": [
            {"start_date": {"$lte": end_date}, "end_date": {"$gte": start_date}}
        ]
    }, {"_id": 0}).to_list(1000)
    
    # Enrich with user info
    for vacation in vacations:
        user = await db.users.find_one({"id": vacation["user_id"]}, {"_id": 0, "username": 1})
        if user:
            vacation["username"] = user["username"]
    
    # Get OTs that should appear in this month
    # 1. OTs with data_servico in this month
    # 2. OTs with data_fim that spans into this month
    # 3. OTs with intervenções in this month
    
    ots_for_calendar = []
    
    # Buscar IDs de OTs que foram criadas pelo calendário (têm service_appointment associado)
    calendar_ot_ids = set()
    calendar_services = await db.service_appointments.find(
        {"ot_id": {"$exists": True}},
        {"_id": 0, "ot_id": 1}
    ).to_list(10000)
    for svc in calendar_services:
        if svc.get("ot_id"):
            calendar_ot_ids.add(svc["ot_id"])
    
    # Buscar todas as OTs que podem aparecer neste mês
    # (data_servico no mês OU data_fim que abrange o mês)
    relatorios = await db.relatorios_tecnicos.find({
        "$or": [
            # OTs que começam neste mês
            {"data_servico": {"$gte": start_date, "$lt": end_date}},
            # OTs com data_fim que abrange este mês
            {"data_servico": {"$lt": end_date}, "data_fim": {"$gte": start_date}},
        ]
    }, {"_id": 0}).to_list(1000)
    
    # Também buscar OTs com intervenções neste mês (mesmo que data_servico seja de outro mês)
    intervencoes_mes = await db.intervencoes_relatorio.find({
        "$or": [
            {"data_intervencao": {"$gte": start_date, "$lt": end_date}},
            {"data": {"$gte": start_date, "$lt": end_date}},
        ]
    }, {"_id": 0, "relatorio_id": 1, "data_intervencao": 1, "data": 1}).to_list(10000)
    
    # Coletar IDs de OTs com intervenções no mês
    ots_com_intervencoes_mes = {}
    for interv in intervencoes_mes:
        rel_id = interv.get("relatorio_id")
        if rel_id:
            data_interv = interv.get("data_intervencao") or interv.get("data")
            if data_interv:
                if rel_id not in ots_com_intervencoes_mes:
                    ots_com_intervencoes_mes[rel_id] = set()
                try:
                    if isinstance(data_interv, str):
                        ots_com_intervencoes_mes[rel_id].add(data_interv[:10])
                    else:
                        ots_com_intervencoes_mes[rel_id].add(data_interv.strftime("%Y-%m-%d"))
                except:
                    pass
    
    # Buscar OTs adicionais que têm intervenções neste mês mas data_servico de outro mês
    relatorios_ids_ja_buscados = {r.get("id") for r in relatorios}
    ots_adicionais_ids = [rid for rid in ots_com_intervencoes_mes.keys() if rid not in relatorios_ids_ja_buscados]
    
    if ots_adicionais_ids:
        ots_adicionais = await db.relatorios_tecnicos.find({
            "id": {"$in": ots_adicionais_ids}
        }, {"_id": 0}).to_list(1000)
        relatorios.extend(ots_adicionais)
    
    for rel in relatorios:
        rel_id = rel.get("id")
        data_servico = rel.get("data_servico", "")
        data_fim = rel.get("data_fim")
        numero_ot = rel.get("numero_assistencia")
        cliente_nome = rel.get("cliente_nome", "")
        motivo = rel.get("motivo_assistencia", "")
        local = rel.get("local_intervencao", "")
        status = rel.get("status", "em_execucao")
        
        # Verificar se foi criada pelo calendário
        from_calendar = rel_id in calendar_ot_ids
        
        # Converter datas para objetos date
        try:
            data_inicio_obj = datetime.strptime(data_servico[:10], "%Y-%m-%d").date() if data_servico else None
        except:
            data_inicio_obj = None
        
        try:
            data_fim_obj = datetime.strptime(data_fim[:10], "%Y-%m-%d").date() if data_fim else None
        except:
            data_fim_obj = None
        
        # Se tem data_fim, gerar entrada para cada dia do intervalo
        if data_inicio_obj and data_fim_obj:
            current = data_inicio_obj
            while current <= data_fim_obj:
                current_str = current.strftime("%Y-%m-%d")
                # Verificar se está dentro do mês solicitado
                if start_date <= current_str < end_date:
                    ots_for_calendar.append({
                        "id": rel_id,
                        "date": current_str,
                        "numero_ot": numero_ot,
                        "cliente_nome": cliente_nome,
                        "motivo": motivo,
                        "local": local,
                        "status": status,
                        "type": "ot_range",  # OT com intervalo de datas
                        "data_inicio": data_servico,
                        "data_fim": data_fim,
                        "from_calendar": from_calendar
                    })
                current += timedelta(days=1)
        else:
            # Sem data_fim - usar datas das intervenções (já buscadas anteriormente)
            datas_intervencoes = ots_com_intervencoes_mes.get(rel_id, set())
            
            # Se não tem intervenções buscadas, fazer query individual (fallback)
            if not datas_intervencoes:
                intervencoes = await db.intervencoes_relatorio.find({
                    "relatorio_id": rel_id
                }, {"_id": 0, "data": 1, "data_intervencao": 1}).to_list(100)
                
                for interv in intervencoes:
                    data_interv = interv.get("data_intervencao") or interv.get("data")
                    if data_interv:
                        try:
                            if isinstance(data_interv, str):
                                datas_intervencoes.add(data_interv[:10])
                            else:
                                datas_intervencoes.add(data_interv.strftime("%Y-%m-%d"))
                        except:
                            pass
            
            # Adicionar a data de início se não tiver intervenções
            if not datas_intervencoes and data_inicio_obj:
                datas_intervencoes.add(data_servico[:10])
            
            # Criar entrada para cada data de intervenção dentro do mês
            for data_interv_str in datas_intervencoes:
                if start_date <= data_interv_str < end_date:
                    ots_for_calendar.append({
                        "id": rel_id,
                        "date": data_interv_str,
                        "numero_ot": numero_ot,
                        "cliente_nome": cliente_nome,
                        "motivo": motivo,
                        "local": local,
                        "status": status,
                        "type": "ot_intervention",  # OT baseada em intervenções
                        "data_inicio": data_servico,
                        "data_fim": None,
                        "from_calendar": from_calendar
                    })
    
    return {
        "services": services,
        "vacations": vacations,
        "ots": ots_for_calendar
    }

@api_router.put("/services/{service_id}")
async def update_service(
    service_id: str,
    update_data: ServiceAppointmentUpdate,
    current_user: dict = Depends(get_current_admin)
):
    """Update service appointment (admin only)"""
    service = await db.service_appointments.find_one({"id": service_id})
    
    if not service:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    if update_dict:
        # Validate technicians if being updated
        if "technician_ids" in update_dict:
            for tech_id in update_dict["technician_ids"]:
                tech = await db.users.find_one({"id": tech_id}, {"_id": 0})
                if not tech:
                    raise HTTPException(status_code=404, detail=f"Técnico com ID {tech_id} não encontrado")
        
        await db.service_appointments.update_one({"id": service_id}, {"$set": update_dict})
        
        # Get updated service
        updated_service = await db.service_appointments.find_one({"id": service_id}, {"_id": 0})
        
        # Send email notifications if technicians changed
        if "technician_ids" in update_dict:
            technician_emails = []
            for tech_id in updated_service["technician_ids"]:
                tech = await db.users.find_one({"id": tech_id}, {"_id": 0, "email": 1})
                if tech and tech.get('email'):
                    technician_emails.append(tech['email'])
            
            if technician_emails:
                await send_service_email(technician_emails, updated_service, "updated")
    
    return {"message": "Serviço atualizado com sucesso"}

@api_router.delete("/services/{service_id}")
async def delete_service(service_id: str, current_user: dict = Depends(get_current_admin)):
    """Delete/cancel service appointment (admin only)"""
    service = await db.service_appointments.find_one({"id": service_id}, {"_id": 0})
    
    if not service:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    
    # Get technician emails before deletion
    technician_emails = []
    for tech_id in service.get("technician_ids", []):
        tech = await db.users.find_one({"id": tech_id}, {"_id": 0, "email": 1})
        if tech and tech.get('email'):
            technician_emails.append(tech['email'])
    
    # Send cancellation emails
    if technician_emails:
        await send_service_email(technician_emails, service, "cancelled")
    
    # Delete the service
    result = await db.service_appointments.delete_one({"id": service_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    
    return {"message": "Serviço cancelado com sucesso"}

# ============ Cronómetro OT Routes ============

@api_router.post("/relatorios-tecnicos/{relatorio_id}/cronometro/iniciar")
async def iniciar_cronometro(
    relatorio_id: str,
    dados: dict,
    current_user: dict = Depends(get_current_user)
):
    """Iniciar cronómetro de Trabalho ou Viagem para um técnico"""
    tipo = dados.get("tipo")  # "trabalho" ou "viagem"
    tecnico_id = dados.get("tecnico_id")
    tecnico_nome = dados.get("tecnico_nome")
    funcao_ot = dados.get("funcao_ot", "tecnico")  # "junior", "tecnico" ou "senior"
    km_inicial = float(dados.get("km_inicial", 0))  # Km's iniciais para viagem
    
    if tipo not in ["trabalho", "viagem", "oficina"]:
        raise HTTPException(status_code=400, detail="Tipo deve ser 'trabalho', 'viagem' ou 'oficina'")
    
    # Verificar se já existe cronómetro ativo para este técnico nesta OT
    cronometro_ativo = await db.cronometros_ot.find_one({
        "relatorio_id": relatorio_id,
        "tecnico_id": tecnico_id,
        "tipo": tipo,
        "ativo": True
    })
    
    if cronometro_ativo:
        raise HTTPException(status_code=400, detail=f"Cronómetro de {tipo} já está ativo")
    
    # Criar novo cronómetro
    cronometro = CronometroOT(
        relatorio_id=relatorio_id,
        tecnico_id=tecnico_id,
        tecnico_nome=tecnico_nome,
        tipo=tipo,
        funcao_ot=funcao_ot,
        km_inicial=km_inicial,
        hora_inicio=get_now_local(),
        ativo=True
    )
    
    cronometro_dict = cronometro.dict()
    cronometro_dict["hora_inicio"] = cronometro_dict["hora_inicio"].isoformat()
    
    await db.cronometros_ot.insert_one(cronometro_dict)
    
    logging.info(f"Cronómetro {tipo} iniciado para {tecnico_nome} na OT {relatorio_id}")
    
    # Remover _id para evitar erro de serialização
    cronometro_dict.pop("_id", None)
    
    return {"message": f"Cronómetro de {tipo} iniciado", "cronometro": cronometro_dict}

@api_router.post("/relatorios-tecnicos/{relatorio_id}/cronometro/parar")
async def parar_cronometro(
    relatorio_id: str,
    dados: dict,
    current_user: dict = Depends(get_current_user)
):
    """Parar cronómetro e gerar registos segmentados"""
    tipo = dados.get("tipo")
    tecnico_id = dados.get("tecnico_id")
    km_final = float(dados.get("km_final", 0))
    work_km_inicial = float(dados.get("work_km_inicial", 0))
    work_km_final = float(dados.get("work_km_final", 0))
    
    # Buscar cronómetro ativo
    cronometro = await db.cronometros_ot.find_one({
        "relatorio_id": relatorio_id,
        "tecnico_id": tecnico_id,
        "tipo": tipo,
        "ativo": True
    })
    
    if not cronometro:
        raise HTTPException(status_code=404, detail="Cronómetro não encontrado ou já parado")
    
    # Hora de fim
    hora_fim = get_now_local()
    hora_inicio = parse_stored_datetime(cronometro["hora_inicio"])
    
    # Buscar OT para pegar os KM
    ot = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    km_ot = 0
    if ot:
        # Buscar técnico na OT para pegar KM
        tecnico_ot = await db.tecnicos_relatorio.find_one({
            "relatorio_id": relatorio_id,
            "tecnico_id": tecnico_id
        }, {"_id": 0})
        if tecnico_ot:
            km_ot = tecnico_ot.get("kms_deslocacao", 0)
    
    # Segmentar período
    segmentos = segmentar_periodo(hora_inicio, hora_fim, tipo)
    
    # Obter funcao_ot e km_inicial do cronómetro
    funcao_ot = cronometro.get("funcao_ot", "tecnico")
    km_inicial_crono = cronometro.get("km_inicial", 0)
    
    # Criar registos
    registos_criados = []
    for i, seg in enumerate(segmentos):
        km_segmento = 0 if tipo == "viagem" else km_ot
        
        registo = RegistoTecnicoOT(
            relatorio_id=relatorio_id,
            tecnico_id=tecnico_id,
            tecnico_nome=cronometro["tecnico_nome"],
            tipo=tipo,
            funcao_ot=funcao_ot,
            data=seg["data"],
            hora_inicio_segmento=seg["hora_inicio_segmento"],
            hora_fim_segmento=seg["hora_fim_segmento"],
            horas_arredondadas=seg["horas_arredondadas"],
            km=km_segmento,
            codigo=seg["codigo"]
        )
        
        registo_dict = registo.model_dump()
        # Guardar minutos_trabalhados (campo não está no modelo mas é necessário)
        registo_dict["minutos_trabalhados"] = int(seg["duracao_minutos"])
        registo_dict["origem"] = "cronometro"
        # Guardar km_inicial no primeiro registo de viagem
        if i == 0 and tipo == "viagem" and km_inicial_crono > 0:
            registo_dict["kms_inicial"] = km_inicial_crono
        # Guardar km_final no último registo de viagem e calcular km total
        if i == len(segmentos) - 1 and tipo == "viagem" and km_final > 0:
            registo_dict["kms_final"] = km_final
            if km_inicial_crono > 0:
                registo_dict["km"] = max(0, km_final - km_inicial_crono)
        # Deslocação durante trabalho: guardar KMs e observação
        if tipo == "trabalho" and work_km_inicial > 0 and work_km_final > 0:
            if i == 0:
                registo_dict["kms_inicial"] = work_km_inicial
                registo_dict["kms_final"] = work_km_final
                registo_dict["km"] = max(0, work_km_final - work_km_inicial)
                registo_dict["observacoes"] = "Deslocação durante Trabalho"
        registo_dict["data"] = registo_dict["data"].isoformat()
        registo_dict["hora_inicio_segmento"] = registo_dict["hora_inicio_segmento"].isoformat()
        registo_dict["hora_fim_segmento"] = registo_dict["hora_fim_segmento"].isoformat()
        registo_dict["created_at"] = registo_dict["created_at"].isoformat()
        
        await db.registos_tecnico_ot.insert_one(registo_dict)
        registo_dict.pop("_id", None)
        registos_criados.append(registo_dict)
    
    # Desativar cronómetro
    await db.cronometros_ot.update_one(
        {"id": cronometro["id"]},
        {"$set": {"ativo": False, "hora_fim": hora_fim.isoformat()}}
    )
    
    logging.info(f"Cronómetro {tipo} parado. {len(segmentos)} registos criados para {cronometro['tecnico_nome']}")
    
    return {
        "message": f"Cronómetro parado. {len(segmentos)} registo(s) criado(s)",
        "registos": registos_criados
    }

@api_router.get("/relatorios-tecnicos/{relatorio_id}/cronometros")
async def get_cronometros_ativos(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar cronómetros ativos de uma OT"""
    cronometros = await db.cronometros_ot.find(
        {"relatorio_id": relatorio_id, "ativo": True},
        {"_id": 0}
    ).to_list(length=None)
    
    return cronometros

@api_router.get("/relatorios-tecnicos/{relatorio_id}/registos-tecnicos")
async def get_registos_tecnicos(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar todos os registos de técnicos de uma OT - ordenados cronologicamente"""
    registos = await db.registos_tecnico_ot.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort([("data_trabalho", 1), ("hora_inicio_segmento", 1)]).to_list(length=None)
    
    return registos

@api_router.delete("/relatorios-tecnicos/{relatorio_id}/registos-tecnicos/{registo_id}")
async def delete_registo_tecnico(
    relatorio_id: str,
    registo_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remover um registo de técnico"""
    result = await db.registos_tecnico_ot.delete_one({
        "id": registo_id,
        "relatorio_id": relatorio_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Registo não encontrado")
    
    return {"message": "Registo removido"}


@api_router.post("/relatorios-tecnicos/{relatorio_id}/registos-tecnicos")
async def create_registo_tecnico_manual(
    relatorio_id: str,
    registo_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Criar um registo manual de técnico com segmentação automática
    
    Se o registo atravessar diferentes códigos horários, será automaticamente
    dividido em múltiplos registos.
    """
    from cronometro_logic import segmentar_periodo, verificar_sobreposicao, get_codigo_horario
    
    tecnico_id = registo_data.get("tecnico_id")
    tecnico_nome = registo_data.get("tecnico_nome")
    tipo = registo_data.get("tipo", "manual")  # trabalho, viagem, manual
    funcao_ot = registo_data.get("funcao_ot", "tecnico")  # junior, tecnico ou senior
    
    # Obter horários
    data_str = registo_data.get("data")  # YYYY-MM-DD
    hora_inicio_str = registo_data.get("hora_inicio")  # HH:MM
    hora_fim_str = registo_data.get("hora_fim")  # HH:MM
    
    if not all([tecnico_id, tecnico_nome, data_str, hora_inicio_str, hora_fim_str]):
        raise HTTPException(status_code=400, detail="Campos obrigatórios: tecnico_id, tecnico_nome, data, hora_inicio, hora_fim")
    
    # Parse data e horas
    try:
        data_obj = datetime.strptime(data_str, "%Y-%m-%d").date()
        hora_inicio_parts = hora_inicio_str.split(":")
        hora_fim_parts = hora_fim_str.split(":")
        
        # Criar datetime sem timezone (hora local portuguesa)
        hora_inicio = datetime.combine(
            data_obj,
            time(int(hora_inicio_parts[0]), int(hora_inicio_parts[1]))
        )
        hora_fim = datetime.combine(
            data_obj,
            time(int(hora_fim_parts[0]), int(hora_fim_parts[1]))
        )
        
        # Se hora fim <= hora início, assumir que passa para o dia seguinte
        if hora_fim <= hora_inicio:
            hora_fim = hora_fim + timedelta(days=1)
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Formato inválido de data/hora: {str(e)}")
    
    # Buscar registos existentes para verificar sobreposição
    registos_existentes = await db.registos_tecnico_ot.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).to_list(length=None)
    
    # Verificar sobreposição
    tem_sobreposicao = verificar_sobreposicao(registos_existentes, hora_inicio, hora_fim, tecnico_id)
    
    km = registo_data.get("km", 0)
    kms_inicial = registo_data.get("kms_inicial", 0)
    kms_final = registo_data.get("kms_final", 0)
    kms_inicial_volta = registo_data.get("kms_inicial_volta", 0)
    kms_final_volta = registo_data.get("kms_final_volta", 0)
    incluir_pausa = registo_data.get("incluir_pausa", False)
    
    # Se há sobreposição, criar registo único no fim do dia (não segmentar)
    if tem_sobreposicao:
        logging.warning(f"Registo manual com sobreposição detectada para {tecnico_nome} - será adicionado ao fim do dia")
        
        # Criar registo único com código baseado na data
        codigo = get_codigo_horario(hora_inicio)
        
        duracao_minutos = (hora_fim - hora_inicio).total_seconds() / 60
        # Aplicar desconto de pausa se selecionado
        if incluir_pausa:
            duracao_minutos = max(0, duracao_minutos - 60)
        from cronometro_logic import arredondar_horas
        horas_arredondadas = duracao_minutos / 60 if tipo == "viagem" else arredondar_horas(duracao_minutos)
        
        registo = {
            "id": str(uuid.uuid4()),
            "relatorio_id": relatorio_id,
            "tecnico_id": tecnico_id,
            "tecnico_nome": tecnico_nome,
            "tipo": tipo,
            "funcao_ot": funcao_ot,
            "data": data_obj.isoformat(),
            "hora_inicio_segmento": hora_inicio.isoformat(),
            "hora_fim_segmento": hora_fim.isoformat(),
            "horas_arredondadas": horas_arredondadas,
            "minutos_trabalhados": int(duracao_minutos),
            "km": km,
            "kms_inicial": kms_inicial,
            "kms_final": kms_final,
            "kms_inicial_volta": kms_inicial_volta,
            "kms_final_volta": kms_final_volta,
            "incluir_pausa": incluir_pausa,
            "codigo": codigo,
            "origem": "manual",
            "sobreposicao": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.registos_tecnico_ot.insert_one(registo)
        registo.pop("_id", None)
        
        return {"message": "Registo criado (com sobreposição)", "registos": [registo]}
    
    # Sem sobreposição - segmentar normalmente
    segmentos = segmentar_periodo(hora_inicio, hora_fim, tipo)
    
    # Se incluir pausa, descontar 60 minutos do primeiro segmento
    if incluir_pausa and segmentos:
        primeiro = segmentos[0]
        primeiro["duracao_minutos"] = max(0, primeiro["duracao_minutos"] - 60)
        from cronometro_logic import arredondar_horas
        primeiro["horas_arredondadas"] = primeiro["duracao_minutos"] / 60 if tipo == "viagem" else arredondar_horas(primeiro["duracao_minutos"])
    
    registos_criados = []
    for i, seg in enumerate(segmentos):
        registo = {
            "id": str(uuid.uuid4()),
            "relatorio_id": relatorio_id,
            "tecnico_id": tecnico_id,
            "tecnico_nome": tecnico_nome,
            "tipo": tipo,
            "funcao_ot": funcao_ot,
            "data": seg["data"].isoformat(),
            "hora_inicio_segmento": seg["hora_inicio_segmento"].isoformat(),
            "hora_fim_segmento": seg["hora_fim_segmento"].isoformat(),
            "horas_arredondadas": seg["horas_arredondadas"],
            "minutos_trabalhados": int(seg["duracao_minutos"]),
            "km": km if i == 0 else 0,  # KMs apenas no primeiro segmento
            "kms_inicial": kms_inicial if i == 0 else 0,
            "kms_final": kms_final if i == 0 else 0,
            "kms_inicial_volta": kms_inicial_volta if i == 0 else 0,
            "kms_final_volta": kms_final_volta if i == 0 else 0,
            "incluir_pausa": incluir_pausa if i == 0 else False,
            "codigo": seg["codigo"],
            "origem": "manual",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.registos_tecnico_ot.insert_one(registo)
        registo.pop("_id", None)
        registos_criados.append(registo)
    
    logging.info(f"Registo manual criado para {tecnico_nome}: {len(registos_criados)} segmento(s)")
    
    return {"message": f"{len(registos_criados)} registo(s) criado(s)", "registos": registos_criados}


@api_router.put("/relatorios-tecnicos/{relatorio_id}/registos-tecnicos/{registo_id}")
async def update_registo_tecnico(
    relatorio_id: str,
    registo_id: str,
    registo_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar um registo de técnico (cronómetro)"""
    from cronometro_logic import get_codigo_horario, arredondar_horas
    
    # Verificar se existe
    existing = await db.registos_tecnico_ot.find_one({
        "id": registo_id,
        "relatorio_id": relatorio_id
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Registo não encontrado")
    
    # Campos que podem ser atualizados
    update_data = {}
    
    # Atualização de horários (recalcula duração e código automaticamente)
    hora_inicio_str = registo_data.get("hora_inicio")
    hora_fim_str = registo_data.get("hora_fim")
    data_str = registo_data.get("data")
    
    if hora_inicio_str and hora_fim_str:
        try:
            # Parse data
            if data_str:
                data_obj = datetime.strptime(data_str, "%Y-%m-%d").date()
            elif existing.get("data"):
                data_obj = datetime.fromisoformat(existing["data"]).date() if isinstance(existing["data"], str) else existing["data"]
            else:
                data_obj = datetime.now().date()
            
            # Parse horas
            hora_inicio_parts = hora_inicio_str.split(":")
            hora_fim_parts = hora_fim_str.split(":")
            
            # Criar datetime sem timezone (hora local portuguesa)
            hora_inicio = datetime.combine(
                data_obj,
                time(int(hora_inicio_parts[0]), int(hora_inicio_parts[1]))
            )
            hora_fim = datetime.combine(
                data_obj,
                time(int(hora_fim_parts[0]), int(hora_fim_parts[1]))
            )
            
            # Se hora fim <= hora início, assumir que passa para o dia seguinte
            if hora_fim <= hora_inicio:
                hora_fim = hora_fim + timedelta(days=1)
            
            # Calcular duração e código
            duracao_minutos = (hora_fim - hora_inicio).total_seconds() / 60
            
            # Aplicar desconto de pausa se necessário
            incluir_pausa = registo_data.get("incluir_pausa", existing.get("incluir_pausa", False))
            if incluir_pausa:
                duracao_minutos = max(0, duracao_minutos - 60)
            
            codigo = get_codigo_horario(hora_inicio)
            tipo_reg = existing.get("tipo", registo_data.get("tipo", "trabalho"))
            horas_arredondadas = duracao_minutos / 60 if tipo_reg == "viagem" else arredondar_horas(duracao_minutos)
            
            update_data["hora_inicio_segmento"] = hora_inicio.isoformat()
            update_data["hora_fim_segmento"] = hora_fim.isoformat()
            update_data["data"] = data_obj.isoformat()
            update_data["minutos_trabalhados"] = int(duracao_minutos)
            update_data["horas_arredondadas"] = horas_arredondadas
            update_data["codigo"] = codigo
            update_data["incluir_pausa"] = incluir_pausa
            
        except Exception as e:
            logging.error(f"Erro ao processar horários: {str(e)}")
    
    # Outros campos
    if "minutos_trabalhados" in registo_data and "hora_inicio" not in registo_data:
        minutos_raw = registo_data["minutos_trabalhados"]
        tipo_reg = registo_data.get("tipo", existing.get("tipo", "trabalho"))
        horas_arred = minutos_raw / 60 if tipo_reg == "viagem" else arredondar_horas(minutos_raw)
        update_data["minutos_trabalhados"] = minutos_raw
        update_data["horas_arredondadas"] = horas_arred
    if "horas_arredondadas" in registo_data and "hora_inicio" not in registo_data and "minutos_trabalhados" not in registo_data:
        # Converter horas para minutos reais, depois arredondar
        minutos_raw = registo_data["horas_arredondadas"] * 60
        tipo_reg = registo_data.get("tipo", existing.get("tipo", "trabalho"))
        horas_arred = minutos_raw / 60 if tipo_reg == "viagem" else arredondar_horas(minutos_raw)
        update_data["horas_arredondadas"] = horas_arred
        update_data["minutos_trabalhados"] = int(minutos_raw)
    if "km" in registo_data:
        update_data["km"] = registo_data["km"]
    if "codigo" in registo_data and "hora_inicio" not in registo_data:
        update_data["codigo"] = registo_data["codigo"]
    if "tipo" in registo_data:
        update_data["tipo"] = registo_data["tipo"]
        # When entry_type changes, recalculate horas_arredondadas
        new_tipo = registo_data["tipo"]
        old_tipo = existing.get("tipo", "trabalho")
        if new_tipo != old_tipo:
            mins = update_data.get("minutos_trabalhados", existing.get("minutos_trabalhados", 0))
            update_data["horas_arredondadas"] = mins / 60 if new_tipo == "viagem" else arredondar_horas(mins)
    if "funcao_ot" in registo_data:
        update_data["funcao_ot"] = registo_data["funcao_ot"]
    
    # Novos campos de Km's Ida e Volta
    if "kms_inicial" in registo_data:
        update_data["kms_inicial"] = float(registo_data["kms_inicial"])
    if "kms_final" in registo_data:
        update_data["kms_final"] = float(registo_data["kms_final"])
    if "kms_inicial_volta" in registo_data:
        update_data["kms_inicial_volta"] = float(registo_data["kms_inicial_volta"])
    if "kms_final_volta" in registo_data:
        update_data["kms_final_volta"] = float(registo_data["kms_final_volta"])
    
    # Campo de pausa
    if "incluir_pausa" in registo_data:
        old_pausa = existing.get("incluir_pausa", False)
        new_pausa = registo_data["incluir_pausa"]
        update_data["incluir_pausa"] = new_pausa
        
        # Ajustar minutos se mudou o estado da pausa e não temos hora_inicio/hora_fim
        if "hora_inicio" not in registo_data and old_pausa != new_pausa:
            current_mins = existing.get("minutos_trabalhados", 0)
            if new_pausa and not old_pausa:
                new_mins = max(0, current_mins - 60)
            elif not new_pausa and old_pausa:
                new_mins = current_mins + 60
            else:
                new_mins = current_mins
            update_data["minutos_trabalhados"] = new_mins
            tipo_reg = existing.get("tipo", "trabalho")
            update_data["horas_arredondadas"] = new_mins / 60 if tipo_reg == "viagem" else arredondar_horas(new_mins)
    
    # Salvaguarda: garantir que horas_arredondadas está consistente com o arredondamento
    if update_data and "horas_arredondadas" not in update_data:
        mins_existentes = existing.get("minutos_trabalhados", 0)
        horas_arred_existentes = existing.get("horas_arredondadas", 0)
        tipo_reg = update_data.get("tipo", existing.get("tipo", "trabalho"))
        horas_arred_correctas = mins_existentes / 60 if tipo_reg == "viagem" else arredondar_horas(mins_existentes)
        if abs(horas_arred_existentes - horas_arred_correctas) > 0.01:
            update_data["horas_arredondadas"] = horas_arred_correctas
    
    if update_data:
        # Audit log for admin changes
        audit_changes = []
        if "tipo" in update_data and update_data["tipo"] != existing.get("tipo"):
            audit_changes.append(f"tipo: {existing.get('tipo','?')} → {update_data['tipo']}")
        if "funcao_ot" in update_data and update_data["funcao_ot"] != existing.get("funcao_ot"):
            audit_changes.append(f"funcao_ot: {existing.get('funcao_ot','?')} → {update_data['funcao_ot']}")
        if audit_changes:
            audit_entry = {
                "id": str(uuid.uuid4()),
                "registo_id": registo_id,
                "relatorio_id": relatorio_id,
                "user_id": current_user["sub"],
                "username": current_user.get("username", ""),
                "action": "update_registo",
                "changes": audit_changes,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            await db.audit_log.insert_one(audit_entry)
            logging.info(f"AUDIT: User {current_user.get('username')} updated registo {registo_id}: {', '.join(audit_changes)}")
        
        await db.registos_tecnico_ot.update_one(
            {"id": registo_id, "relatorio_id": relatorio_id},
            {"$set": update_data}
        )
    
    updated = await db.registos_tecnico_ot.find_one(
        {"id": registo_id, "relatorio_id": relatorio_id},
        {"_id": 0}
    )
    
    return updated


# ============ Material OT Routes ============

@api_router.post("/relatorios-tecnicos/{relatorio_id}/materiais")
async def add_material_ot(
    relatorio_id: str,
    material_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Adicionar material a uma OT"""
    ot = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not ot:
        raise HTTPException(status_code=404, detail="FS não encontrada")
    
    # Validar quantidade
    try:
        quantidade = float(material_data.get("quantidade", 0))
    except (ValueError, TypeError):
        quantidade = 0
    if quantidade <= 0:
        raise HTTPException(status_code=400, detail="Quantidade deve ser maior que zero")
    
    # Criar material
    material = MaterialOT(
        relatorio_id=relatorio_id,
        descricao=material_data["descricao"],
        quantidade=quantidade,
        unidade=material_data.get("unidade", "Un"),
        fornecido_por=material_data["fornecido_por"],
        data_utilizacao=material_data.get("data_utilizacao")
    )
    
    material_dict = material.dict()
    material_dict["created_at"] = material_dict["created_at"].isoformat()
    material_dict["intervencao_id"] = material_data.get("intervencao_id")
    
    # Se fornecido_por = "Cotação", criar/atualizar PC
    if material_data["fornecido_por"] == "Cotação":
        pc_id_escolhido = material_data.get("pc_id")
        equipamento_ot_ids = material_data.get("equipamento_ot_ids", [])
        
        # Buscar número da FS
        fs_numero = ot.get("numero_assistencia", "000")
        
        if pc_id_escolhido:
            # Agregar a PC existente — validar que equipamentos são compatíveis
            pc_existente = await db.pedidos_cotacao.find_one({"id": pc_id_escolhido}, {"_id": 0})
            if pc_existente:
                # Verificar se os equipamentos selecionados são compatíveis
                existing_eq_ids = set(pc_existente.get("equipamento_ot_ids", []))
                new_eq_ids = set(equipamento_ot_ids)
                
                if new_eq_ids and existing_eq_ids and new_eq_ids != existing_eq_ids:
                    raise HTTPException(
                        status_code=400,
                        detail="Para adicionar material com equipamento diferente, crie uma nova PC."
                    )
                
                material_dict["pc_id"] = pc_id_escolhido
                # Se a PC ainda não tinha equipamentos, atribuir os novos
                if not existing_eq_ids and new_eq_ids:
                    await db.pedidos_cotacao.update_one(
                        {"id": pc_id_escolhido},
                        {"$set": {"equipamento_ot_ids": list(new_eq_ids)}}
                    )
                logging.info(f"Material agregado ao PC existente {pc_existente['numero_pc']}")
        else:
            # Criar novo PC — numeração global sequencial
            # Buscar o maior número de PC existente globalmente
            last_pc = await db.pedidos_cotacao.find_one(
                {},
                {"_id": 0, "numero_pc": 1},
                sort=[("created_at", -1)]
            )
            novo_num = 1
            if last_pc and last_pc.get("numero_pc"):
                # Extrair número do formato "PC_XXX#YYY" ou "PC_XXX.N"
                try:
                    num_part = last_pc["numero_pc"].split("#")[0].replace("PC_", "").split(".")[0]
                    novo_num = int(num_part) + 1
                except (ValueError, IndexError):
                    # Fallback: contar total de PCs
                    total_pcs = await db.pedidos_cotacao.count_documents({})
                    novo_num = total_pcs + 1
            
            numero_pc = f"PC_{novo_num:03d}#{fs_numero}"
            
            novo_pc = PedidoCotacao(
                numero_pc=numero_pc,
                relatorio_id=relatorio_id,
                parent_pc_id=None,
                sub_numero=None,
                status="Em Espera",
                equipamento_ot_ids=equipamento_ot_ids,
                created_by=current_user["sub"]
            )
            pc_dict = novo_pc.dict()
            pc_dict["created_at"] = pc_dict["created_at"].isoformat()
            await db.pedidos_cotacao.insert_one(pc_dict)
            material_dict["pc_id"] = novo_pc.id
            logging.info(f"PC criado: {numero_pc} para FS #{fs_numero}")
            
            # Notificar admins
            await send_push_to_admins(
                db,
                f"Novo Pedido de Cotação",
                f"{numero_pc} criado para FS #{fs_numero}\nMaterial: {material_data.get('descricao', 'N/A')[:50]}",
                "pc_created",
                "medium"
            )
    
    await db.materiais_ot.insert_one(material_dict)
    
    # Return full dict (material model doesn't have pc_id set by the PC logic above)
    response_dict = {k: v for k, v in material_dict.items() if k != '_id'}
    return response_dict

@api_router.get("/relatorios-tecnicos/{relatorio_id}/materiais")
async def get_materiais_ot(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar materiais de uma OT"""
    materiais = await db.materiais_ot.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(length=None)
    
    return materiais

@api_router.put("/relatorios-tecnicos/{relatorio_id}/materiais/{material_id}")
async def update_material_ot(
    relatorio_id: str,
    material_id: str,
    material_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar material de uma OT"""
    # Validar quantidade
    if "quantidade" in material_data:
        try:
            material_data["quantidade"] = float(material_data["quantidade"])
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Quantidade inválida")
        if material_data["quantidade"] <= 0:
            raise HTTPException(status_code=400, detail="Quantidade deve ser maior que zero")
    
    material = await db.materiais_ot.find_one({"id": material_id, "relatorio_id": relatorio_id})
    if not material:
        raise HTTPException(status_code=404, detail="Material não encontrado")
    
    # Se mudou para "Cotação", associar ou criar PC
    if material_data.get("fornecido_por") == "Cotação" and material.get("fornecido_por") != "Cotação":
        pc_id_escolhido = material_data.get("pc_id")
        ot = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
        fs_numero = ot.get("numero_assistencia", "000") if ot else "000"
        
        if pc_id_escolhido:
            # Agregar a PC existente
            pc_existente = await db.pedidos_cotacao.find_one({"id": pc_id_escolhido}, {"_id": 0})
            if pc_existente:
                material_data["pc_id"] = pc_id_escolhido
        else:
            # Criar novo PC — numeração global sequencial
            last_pc = await db.pedidos_cotacao.find_one(
                {},
                {"_id": 0, "numero_pc": 1},
                sort=[("created_at", -1)]
            )
            novo_num = 1
            if last_pc and last_pc.get("numero_pc"):
                try:
                    num_part = last_pc["numero_pc"].split("#")[0].replace("PC_", "").split(".")[0]
                    novo_num = int(num_part) + 1
                except (ValueError, IndexError):
                    total_pcs = await db.pedidos_cotacao.count_documents({})
                    novo_num = total_pcs + 1
            
            numero_pc = f"PC_{novo_num:03d}#{fs_numero}"
            novo_pc = PedidoCotacao(
                numero_pc=numero_pc,
                relatorio_id=relatorio_id,
                parent_pc_id=None,
                sub_numero=None,
                status="Em Espera",
                created_by=current_user["sub"]
            )
            pc_dict = novo_pc.dict()
            pc_dict["created_at"] = pc_dict["created_at"].isoformat()
            await db.pedidos_cotacao.insert_one(pc_dict)
            material_data["pc_id"] = novo_pc.id
    
    await db.materiais_ot.update_one(
        {"id": material_id},
        {"$set": material_data}
    )
    
    return {"message": "Material atualizado"}

@api_router.delete("/relatorios-tecnicos/{relatorio_id}/materiais/{material_id}")
async def delete_material_ot(
    relatorio_id: str,
    material_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remover material de uma OT"""
    result = await db.materiais_ot.delete_one({"id": material_id, "relatorio_id": relatorio_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Material não encontrado")
    
    return {"message": "Material removido"}


# ============ Relatórios de Assistência Routes ============

@api_router.get("/relatorios-tecnicos/{relatorio_id}/relatorios-assistencia")
async def get_relatorios_assistencia(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar relatórios de assistência de uma OT"""
    items = await db.relatorios_assistencia.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(length=None)
    return items

@api_router.post("/relatorios-tecnicos/{relatorio_id}/relatorios-assistencia")
async def create_relatorio_assistencia(
    relatorio_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Criar novo relatório de assistência"""
    if not data.get("texto"):
        raise HTTPException(status_code=400, detail="Texto é obrigatório")
    
    item = RelatorioAssistencia(
        relatorio_id=relatorio_id,
        texto=data["texto"],
        intervencao_id=data.get("intervencao_id"),
        equipamento_ids=data.get("equipamento_ids", []),
        data_intervencao=data.get("data_intervencao")
    )
    item_dict = item.dict()
    item_dict["created_at"] = item_dict["created_at"].isoformat()
    await db.relatorios_assistencia.insert_one(item_dict)
    del item_dict["_id"]
    return item_dict

@api_router.put("/relatorios-tecnicos/{relatorio_id}/relatorios-assistencia/{item_id}")
async def update_relatorio_assistencia(
    relatorio_id: str,
    item_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar relatório de assistência"""
    update_fields = {}
    if "texto" in data:
        update_fields["texto"] = data["texto"]
    if "equipamento_ids" in data:
        update_fields["equipamento_ids"] = data["equipamento_ids"]
    if "data_intervencao" in data:
        update_fields["data_intervencao"] = data["data_intervencao"]
    
    if update_fields:
        await db.relatorios_assistencia.update_one(
            {"id": item_id, "relatorio_id": relatorio_id},
            {"$set": update_fields}
        )
    
    updated = await db.relatorios_assistencia.find_one(
        {"id": item_id, "relatorio_id": relatorio_id},
        {"_id": 0}
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Relatório de assistência não encontrado")
    return updated

@api_router.delete("/relatorios-tecnicos/{relatorio_id}/relatorios-assistencia/{item_id}")
async def delete_relatorio_assistencia(
    relatorio_id: str,
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Eliminar relatório de assistência"""
    result = await db.relatorios_assistencia.delete_one(
        {"id": item_id, "relatorio_id": relatorio_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Relatório de assistência não encontrado")
    return {"message": "Relatório de assistência removido"}


# ============ Despesas OT Routes ============

@api_router.post("/relatorios-tecnicos/{relatorio_id}/despesas")
async def create_despesa_ot(
    relatorio_id: str,
    despesa_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Criar nova despesa para uma FS"""
    from notifications_scheduler import send_push_notification
    
    # Validar campos obrigatórios
    tipo_despesa = despesa_data.get("tipo", "outras")
    if tipo_despesa not in ["outras", "combustivel", "ferramentas", "portagens"]:
        tipo_despesa = "outras"
    
    if tipo_despesa == "outras" and not despesa_data.get("descricao"):
        raise HTTPException(status_code=400, detail="Descrição é obrigatória para despesas do tipo 'Outras'")
    if not despesa_data.get("valor") or despesa_data.get("valor") <= 0:
        raise HTTPException(status_code=400, detail="Valor deve ser maior que zero")
    if not despesa_data.get("tecnico_id"):
        raise HTTPException(status_code=400, detail="Técnico é obrigatório")
    if not despesa_data.get("data"):
        raise HTTPException(status_code=400, detail="Data é obrigatória")
    
    # Verificar se OT existe
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Buscar nome do técnico
    tecnico = await db.users.find_one({"id": despesa_data["tecnico_id"]}, {"_id": 0})
    tecnico_nome = (tecnico.get("full_name") or tecnico.get("nome") or tecnico.get("username", "Desconhecido")) if tecnico else despesa_data.get("tecnico_nome", "Desconhecido")
    
    # Criar despesa
    despesa = DespesaOT(
        relatorio_id=relatorio_id,
        tipo=tipo_despesa,
        descricao=despesa_data.get("descricao", ""),
        valor=float(despesa_data["valor"]),
        tecnico_id=despesa_data["tecnico_id"],
        tecnico_nome=tecnico_nome,
        data=despesa_data["data"],
        numero_fatura=despesa_data.get("numero_fatura"),
        data_fatura=despesa_data.get("data_fatura"),
        factura_data=despesa_data.get("factura_data"),
        factura_filename=despesa_data.get("factura_filename"),
        factura_mimetype=despesa_data.get("factura_mimetype"),
        created_by=current_user["sub"]
    )
    
    despesa_dict = despesa.model_dump()
    despesa_dict["created_at"] = despesa_dict["created_at"].isoformat()
    
    await db.despesas_ot.insert_one(despesa_dict)
    
    # Enviar push notification para admins
    admins = await db.users.find({"is_admin": True}, {"_id": 0}).to_list(length=None)
    ot_numero = relatorio.get("numero", relatorio_id[:8])
    
    for admin in admins:
        try:
            await send_push_notification(
                admin["id"],
                f"💰 Nova Despesa - OT #{ot_numero}",
                f"Despesa de {despesa.valor:.2f}€ criada por {tecnico_nome}\n{despesa.descricao[:50]}",
                "despesa_created",
                "medium"
            )
        except Exception as e:
            logging.error(f"Erro ao enviar push para admin {admin['id']}: {e}")
    
    # Criar notificação in-app para admins
    for admin in admins:
        notification = Notification(
            user_id=admin["id"],
            username=admin.get("username", admin.get("nome", "Admin")),
            type="despesa_created",
            title=f"💰 Nova Despesa - OT #{ot_numero}",
            message=f"Despesa de {despesa.valor:.2f}€ criada por {tecnico_nome}",
            priority="medium"
        )
        notif_dict = notification.model_dump()
        notif_dict["created_at"] = notif_dict["created_at"].isoformat()
        notif_dict["related_id"] = relatorio_id  # Adicionar referência à OT
        await db.notifications.insert_one(notif_dict)
    
    logging.info(f"💰 Despesa criada: {despesa.valor:.2f}€ na OT {relatorio_id} por {tecnico_nome}")
    
    return despesa


@api_router.get("/relatorios-tecnicos/{relatorio_id}/despesas")
async def get_despesas_ot(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar despesas de uma OT"""
    despesas = await db.despesas_ot.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(length=None)
    
    return despesas


@api_router.get("/relatorios-tecnicos/{relatorio_id}/despesas/{despesa_id}")
async def get_despesa_ot(
    relatorio_id: str,
    despesa_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obter detalhes de uma despesa"""
    despesa = await db.despesas_ot.find_one(
        {"id": despesa_id, "relatorio_id": relatorio_id},
        {"_id": 0}
    )
    
    if not despesa:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    
    return despesa


@api_router.put("/relatorios-tecnicos/{relatorio_id}/despesas/{despesa_id}")
async def update_despesa_ot(
    relatorio_id: str,
    despesa_id: str,
    despesa_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar despesa de uma OT"""
    despesa = await db.despesas_ot.find_one({"id": despesa_id, "relatorio_id": relatorio_id})
    if not despesa:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    
    # Validar valor se fornecido
    if "valor" in despesa_data and despesa_data["valor"] <= 0:
        raise HTTPException(status_code=400, detail="Valor deve ser maior que zero")
    
    # Se mudou o técnico, buscar o nome
    if "tecnico_id" in despesa_data and despesa_data["tecnico_id"] != despesa.get("tecnico_id"):
        tecnico = await db.users.find_one({"id": despesa_data["tecnico_id"]}, {"_id": 0})
        if tecnico:
            despesa_data["tecnico_nome"] = tecnico.get("nome", tecnico.get("username", "Desconhecido"))
    
    await db.despesas_ot.update_one(
        {"id": despesa_id},
        {"$set": despesa_data}
    )
    
    return {"message": "Despesa atualizada"}


@api_router.delete("/relatorios-tecnicos/{relatorio_id}/despesas/{despesa_id}")
async def delete_despesa_ot(
    relatorio_id: str,
    despesa_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remover despesa de uma OT"""
    result = await db.despesas_ot.delete_one({"id": despesa_id, "relatorio_id": relatorio_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    
    return {"message": "Despesa removida"}



# ============ Pedidos de Cotacao Routes (movido para routes/) ============


# ============ Company Info Routes (movido para routes/) ============


# ============ Tabelas/Tarifas Routes (movido para routes/) ============

# ============ Folha de Horas Routes ============

@api_router.get("/relatorios-tecnicos/{relatorio_id}/folha-horas-data")
async def get_folha_horas_data(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Obter dados necessários para gerar a Folha de Horas
    Retorna: técnicos, registos, tarifas disponíveis
    """
    # Buscar dados do relatório
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Buscar cliente
    cliente = await db.clientes.find_one({"id": relatorio['cliente_id']}, {"_id": 0})
    
    # Buscar técnicos manuais - ordenados cronologicamente
    tecnicos = await db.tecnicos_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort([("data_trabalho", 1), ("hora_inicio", 1)]).to_list(length=None)
    
    # Buscar registos de cronómetros - ordenados cronologicamente
    registos = await db.registos_tecnico_ot.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort([("data_trabalho", 1), ("hora_inicio_segmento", 1)]).to_list(length=None)
    
    # Buscar tarifas ativas
    tarifas = await db.tarifas.find(
        {"ativo": True},
        {"_id": 0}
    ).sort("numero", 1).to_list(length=None)
    
    # Extrair lista única de técnicos
    # Para técnicos manuais, agrupamos por tecnico_id (ou nome se tecnico_id vazio)
    # Para cronómetros, usamos o 'tecnico_id'
    tecnicos_unicos = {}
    for tec in tecnicos:
        # Usar tecnico_id real, fallback para nome como agrupador
        tid = tec.get('tecnico_id') or ''
        nome = tec.get('tecnico_nome', 'N/A')
        if not tid:
            tid = f"nome_{nome}"
        if tid not in tecnicos_unicos:
            tecnicos_unicos[tid] = {
                'id': tid,
                'nome': nome
            }
    
    for reg in registos:
        tid = reg.get('tecnico_id')
        if tid and tid not in tecnicos_unicos:
            tecnicos_unicos[tid] = {
                'id': tid,
                'nome': reg.get('tecnico_nome')
            }
    
    # Extrair datas únicas por técnico E criar lista de todos os registos individuais
    datas_por_tecnico = {}
    registos_individuais = []  # Nova lista com todos os registos
    
    for reg in registos:
        tid = reg.get('tecnico_id')
        data = reg.get('data', '')
        if isinstance(data, str) and 'T' in data:
            data = data.split('T')[0]
        if tid:
            if tid not in datas_por_tecnico:
                datas_por_tecnico[tid] = set()
            datas_por_tecnico[tid].add(data)
            # Adicionar registo individual
            registos_individuais.append({
                'tecnico_id': tid,
                'tecnico_nome': reg.get('tecnico_nome'),
                'data': data,
                'tipo': reg.get('tipo', ''),
                'funcao_ot': reg.get('funcao_ot', 'tecnico'),
                'codigo': reg.get('codigo', '-'),
                'source': 'cronometro',
                'registo_id': reg.get('id'),
                'minutos': int((reg.get('horas_arredondadas', 0) or 0) * 60),
                'km': reg.get('km', 0),
                'hora_inicio': reg.get('hora_inicio_segmento') or reg.get('hora_inicio') or '',
                'hora_fim': reg.get('hora_fim_segmento') or reg.get('hora_fim') or ''
            })
    
    for tec in tecnicos:
        # Para registos manuais, usar o tecnico_id real, fallback para nome
        tid = tec.get('tecnico_id') or ''
        nome = tec.get('tecnico_nome', 'N/A')
        if not tid:
            tid = f"nome_{nome}"
        data = tec.get('data_trabalho', '')
        if isinstance(data, str) and 'T' in data:
            data = data.split('T')[0]
        if tid:
            if tid not in datas_por_tecnico:
                datas_por_tecnico[tid] = set()
            datas_por_tecnico[tid].add(data)
            # Converter tipo_horario para código
            codigo_map = {'diurno': '1', 'noturno': '2', 'sabado': 'S', 'domingo_feriado': 'D'}
            # Adicionar registo individual
            registos_individuais.append({
                'tecnico_id': tid,
                'tecnico_nome': nome,
                'data': data,
                'tipo': tec.get('tipo_registo', 'manual'),
                'funcao_ot': tec.get('funcao_ot', 'tecnico'),
                'codigo': codigo_map.get(tec.get('tipo_horario', ''), '-'),
                'source': 'manual',
                'registo_id': tec.get('id'),
                'minutos': tec.get('minutos_cliente', 0),
                'km': tec.get('kms_deslocacao', 0),
                'hora_inicio': tec.get('hora_inicio') or '',
                'hora_fim': tec.get('hora_fim') or ''
            })
    
    # Ordenar registos individuais cronologicamente: data, depois hora_inicio
    registos_individuais.sort(key=lambda x: (x['data'], x.get('hora_inicio') or 'zzz'))
    
    # Buscar despesas da OT para pré-preencher na folha de horas
    despesas = await db.despesas_ot.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).to_list(length=None)
    
    # Agrupar despesas por técnico e data, separando portagens das outras
    # NOTA: Despesas de tipo "combustivel" são EXCLUÍDAS da Folha de Horas
    # (mantidas na OT para controlo interno, mas não entram nos cálculos)
    despesas_por_tecnico_data = {}  # Para despesas (outras, ferramentas) - SEM combustivel
    portagens_por_tecnico_data = {}  # Para portagens
    
    for desp in despesas:
        key = f"{desp['tecnico_id']}_{desp['data']}"
        tipo = desp.get('tipo', 'outras')
        
        # Adicionar ao datas_por_tecnico se não existir (antes de converter para lista!)
        if desp['tecnico_id'] not in datas_por_tecnico:
            datas_por_tecnico[desp['tecnico_id']] = set()
        elif isinstance(datas_por_tecnico[desp['tecnico_id']], list):
            # Se já foi convertido para lista, converter de volta para set
            datas_por_tecnico[desp['tecnico_id']] = set(datas_por_tecnico[desp['tecnico_id']])
        datas_por_tecnico[desp['tecnico_id']].add(desp['data'])
        
        # Adicionar técnico aos tecnicos_unicos se não existir (buscar da BD)
        if desp['tecnico_id'] not in tecnicos_unicos:
            tecnico_db = await db.users.find_one({"id": desp['tecnico_id']}, {"_id": 0})
            if tecnico_db:
                tecnicos_unicos[desp['tecnico_id']] = {
                    'id': desp['tecnico_id'],
                    'nome': tecnico_db.get('full_name') or tecnico_db.get('nome') or tecnico_db.get('username', 'Técnico'),
                    'username': tecnico_db.get('username', 'Técnico')
                }
            else:
                tecnicos_unicos[desp['tecnico_id']] = {
                    'id': desp['tecnico_id'],
                    'nome': desp.get('tecnico_nome', 'Técnico'),
                    'username': desp.get('tecnico_nome', 'Técnico')
                }
        
        if tipo == 'portagens':
            if key not in portagens_por_tecnico_data:
                portagens_por_tecnico_data[key] = 0
            portagens_por_tecnico_data[key] += desp.get('valor', 0)
        elif tipo == 'combustivel':
            # EXCLUIR combustível da Folha de Horas
            # Despesa mantida na OT para controlo interno, mas não entra nos cálculos
            pass
        else:
            # outras, ferramentas vão para despesas (SEM combustivel)
            if key not in despesas_por_tecnico_data:
                despesas_por_tecnico_data[key] = 0
            despesas_por_tecnico_data[key] += desp.get('valor', 0)
    
    # Converter sets para listas ordenadas (depois de processar despesas)
    datas_por_tecnico = {k: sorted(list(v)) if isinstance(v, set) else sorted(v) for k, v in datas_por_tecnico.items()}
    
    return {
        "relatorio": relatorio,
        "cliente": cliente,
        "tecnicos": list(tecnicos_unicos.values()),
        "registos": registos,
        "tecnicos_manuais": tecnicos,
        "tarifas": tarifas,
        "datas_por_tecnico": datas_por_tecnico,
        "registos_individuais": registos_individuais,
        "despesas": despesas,
        "despesas_por_tecnico_data": despesas_por_tecnico_data,
        "portagens_por_tecnico_data": portagens_por_tecnico_data,
        "tabelas_preco": [
            {**{k: v for k, v in t.items() if k not in ('imagem_data', 'imagem_content_type')}, "has_imagem": bool(t.get('imagem_data'))}
            for t in await db.tabelas_preco.find({}, {"_id": 0}).to_list(length=None)
        ]
    }


@api_router.post("/relatorios-tecnicos/{relatorio_id}/folha-horas-pdf")
async def generate_folha_horas(
    relatorio_id: str,
    request: FolhaHorasRequest,
    current_user: dict = Depends(get_current_user)
):
    """Gerar PDF da Folha de Horas usando a tabela de preço selecionada"""
    # Buscar dados do relatório
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Enriquecer com info da OT relacionada
    if relatorio.get("ot_relacionada_id"):
        ot_rel = await db.relatorios_tecnicos.find_one(
            {"id": relatorio["ot_relacionada_id"]}, {"_id": 0, "numero_assistencia": 1}
        )
        if ot_rel:
            relatorio["ot_relacionada_numero"] = ot_rel.get("numero_assistencia")
    
    # Buscar cliente
    cliente = await db.clientes.find_one({"id": relatorio['cliente_id']}, {"_id": 0})
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    # Buscar técnicos manuais - ordenados cronologicamente
    tecnicos_manuais = await db.tecnicos_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort([("data_trabalho", 1), ("hora_inicio", 1)]).to_list(length=None)
    
    # Buscar registos de cronómetros - ordenados cronologicamente
    registos_mao_obra = await db.registos_tecnico_ot.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort([("data_trabalho", 1), ("hora_inicio_segmento", 1)]).to_list(length=None)
    
    # Obter o table_id do request (default: 1)
    table_id = request.table_id if hasattr(request, 'table_id') else 1
    
    # Buscar configuração da tabela de preço selecionada (valor por Km)
    tabela_config = await db.tabelas_preco.find_one({"table_id": table_id}, {"_id": 0})
    valor_km = tabela_config.get("valor_km", 0.65) if tabela_config else 0.65
    valor_dieta_tabela = tabela_config.get("valor_dieta", 0) if tabela_config else 0
    
    # Auto-preencher dietas da tabela de preço quando não definidas pelo admin
    dados_extras_final = dict(request.dados_extras)
    logging.info(f"Folha Horas PDF: table_id={table_id}, valor_dieta_tabela={valor_dieta_tabela}, frontend_extras_count={len(request.dados_extras)}")
    if valor_dieta_tabela > 0:
        dias_tecnicos = set()
        for reg in registos_mao_obra:
            data_r = reg.get('data', '')
            if isinstance(data_r, str) and 'T' in data_r:
                data_r = data_r.split('T')[0]
            tid = reg.get('tecnico_id', '')
            tname = reg.get('tecnico_nome', '')
            if tid and data_r:
                dias_tecnicos.add((tid, tname, data_r))
        for tec in tecnicos_manuais:
            data_t = tec.get('data_trabalho', '')
            if isinstance(data_t, str) and 'T' in data_t:
                data_t = data_t.split('T')[0]
            tid = tec.get('tecnico_id', '')
            tname = tec.get('tecnico_nome', '')
            if tid and data_t:
                dias_tecnicos.add((tid, tname, data_t))
        for tid, tname, data_d in dias_tecnicos:
            key_id = f"{tid}_{data_d}"
            key_nome = f"{tname}_{data_d}"
            # Só preencher se o admin não definiu manualmente
            existing_by_id = dados_extras_final.get(key_id, {})
            existing_by_nome = dados_extras_final.get(key_nome, {})
            dieta_admin = float(existing_by_id.get('dieta', 0) or 0) + float(existing_by_nome.get('dieta', 0) or 0)
            if dieta_admin == 0:
                if key_id not in dados_extras_final:
                    dados_extras_final[key_id] = {'dieta': 0, 'portagens': 0, 'despesas': 0}
                dados_extras_final[key_id]['dieta'] = valor_dieta_tabela
                if key_nome not in dados_extras_final:
                    dados_extras_final[key_nome] = {'dieta': 0, 'portagens': 0, 'despesas': 0}
                dados_extras_final[key_nome]['dieta'] = valor_dieta_tabela
    
    # Buscar tarifas por código DA TABELA SELECIONADA
    # Excluir tarifas com código "manual" pois são apenas para seleção manual
    tarifas_db = await db.tarifas.find({
        "ativo": True, 
        "table_id": table_id,
        "codigo": {"$nin": [None, "", "manual"]}
    }, {"_id": 0}).to_list(length=None)
    
    # Build tariff lookup: key = (codigo, tipo_registo, tipo_colaborador)
    # More specific matches take priority over generic ones
    tarifas_por_codigo = {}
    tarifas_detalhadas = []
    for tarifa in tarifas_db:
        cod = tarifa.get('codigo', '')
        if cod and cod != 'manual':
            tarifas_por_codigo[cod] = tarifa.get('valor_por_hora', 0)
            tarifas_detalhadas.append({
                'codigo': cod,
                'tipo_registo': tarifa.get('tipo_registo'),
                'tipo_colaborador': tarifa.get('tipo_colaborador'),
                'valor_por_hora': tarifa.get('valor_por_hora', 0),
                'nome': tarifa.get('nome', '')
            })
    
    # Gerar PDF com valor_km da tabela selecionada
    
    # Buscar despesas da OT e aplicar ajustes
    despesas_ot = await db.despesas_ot.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).to_list(length=None)
    
    # Aplicar ajustes de despesas (percentual e exclusões)
    despesas_ajustadas = []
    adjustments = request.despesa_adjustments or {}
    for despesa in despesas_ot:
        desp_id = despesa.get("id", "")
        adj = adjustments.get(desp_id, {})
        if adj.get("excluida", False):
            continue  # Excluída da folha de horas
        valor_original = despesa.get("valor", 0) or 0
        percentual = adj.get("percentual", 0) or 0
        valor_final = valor_original * (1 + percentual / 100)
        despesa["valor_original"] = valor_original
        despesa["valor_ajustado"] = valor_final
        despesa["percentual_aplicado"] = percentual
        despesas_ajustadas.append(despesa)
    
    # Buscar imagem da tabela de preços se existir
    tabela_preco_image = None
    if tabela_config and tabela_config.get("imagem_data"):
        import base64
        tabela_preco_image = base64.b64decode(tabela_config["imagem_data"])
    
    try:
        pdf_buffer = generate_folha_horas_pdf(
            relatorio=relatorio,
            cliente=cliente,
            registos_mao_obra=registos_mao_obra,
            tecnicos_manuais=tecnicos_manuais,
            tarifas_por_tecnico=request.tarifas_por_tecnico,
            dados_extras=dados_extras_final,
            tarifas_por_codigo=tarifas_por_codigo,
            valor_km=valor_km,
            tarifas_detalhadas=tarifas_detalhadas,
            despesas_ajustadas=despesas_ajustadas,
            valor_dieta_default=valor_dieta_tabela,
            tabela_preco_image=tabela_preco_image,
        )
    except Exception as e:
        logging.error(f"Erro ao gerar Folha de Horas para OT {relatorio_id}: {str(e)}")
        import traceback
        logging.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Erro ao gerar Folha de Horas: {str(e)}")
    
    numero_ot = relatorio.get('numero_assistencia', 'N/A')
    cliente_nome = cliente.get('nome', 'Cliente').replace(' ', '_')
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=FolhaHoras_FS{numero_ot}_{cliente_nome}.pdf"
        }
    )


# ============ Sistema de Notificações de Ponto Routes ============

@api_router.post("/notifications/check-clock-in")
async def trigger_clock_in_check(current_user: dict = Depends(get_current_admin)):
    """Executar verificação manual de entrada de ponto (apenas admin)"""
    base_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000').rstrip('/')
    
    result = await check_clock_in_status(db, base_url)
    return result


@api_router.post("/notifications/check-clock-out")
async def trigger_clock_out_check(current_user: dict = Depends(get_current_admin)):
    """Executar verificação manual de saída de ponto (apenas admin)"""
    base_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000').rstrip('/')
    
    result = await check_clock_out_status(db, base_url)
    return result


@api_router.get("/overtime/authorization/{token}")
async def get_overtime_authorization(token: str):
    """Obter detalhes de um pedido de autorização de horas extra"""
    auth_request = await db.overtime_authorizations.find_one({"id": token}, {"_id": 0})
    
    if not auth_request:
        raise HTTPException(status_code=404, detail="Pedido de autorização não encontrado")
    
    # Verificar se expirou
    expires_at = datetime.fromisoformat(auth_request.get("expires_at"))
    if datetime.now() > expires_at:
        raise HTTPException(status_code=410, detail="Este pedido de autorização expirou")
    
    return auth_request


@api_router.post("/overtime/authorization/{token}/decide")
async def decide_overtime_authorization(
    token: str,
    decision: OvertimeDecision,
    current_user: dict = Depends(get_current_admin)
):
    """Aprovar ou rejeitar pedido de autorização de horas extra"""
    # Buscar nome do admin
    admin = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0})
    admin_name = admin.get("full_name") or admin.get("username") if admin else "Admin"
    
    approved = decision.action == "approve"
    result = await process_authorization_decision(db, token, approved, admin_name)
    
    return result


@api_router.get("/overtime/authorizations")
async def list_overtime_authorizations(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_admin)
):
    """Listar todos os pedidos de autorização de horas extra (apenas admin)"""
    query = {}
    if status:
        query["status"] = status
    
    authorizations = await db.overtime_authorizations.find(
        query,
        {"_id": 0}
    ).sort("requested_at", -1).to_list(100)
    
    return authorizations

@api_router.delete("/admin/overtime-authorizations/all")
async def delete_all_overtime_authorizations(current_user: dict = Depends(get_current_admin)):
    """Remover todas as autorizações de horas extra"""
    result = await db.overtime_authorizations.delete_many({})
    return {"message": f"{result.deleted_count} autorizações removidas"}

@api_router.delete("/admin/overtime-authorizations/{auth_id}")
async def delete_overtime_authorization(auth_id: str, current_user: dict = Depends(get_current_admin)):
    """Remover uma autorização de horas extra"""
    result = await db.overtime_authorizations.delete_one({"id": auth_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Autorização não encontrada")
    return {"message": "Autorização removida"}


@api_router.get("/notifications/logs")
async def get_notification_logs(
    limit: int = 50,
    current_user: dict = Depends(get_current_admin)
):
    """Obter logs de notificações enviadas (apenas admin)"""
    logs = await db.notification_logs.find(
        {},
        {"_id": 0}
    ).sort("sent_at", -1).to_list(limit)
    
    return logs


# ===== REFERÊNCIA INTERNA DO CLIENTE (movido para routes/references.py) =====

# ============ Include Router ============

from routes.references import router as references_router
from routes.clientes import router as clientes_router
from routes.auth_routes import router as auth_router
from routes.equipamentos import router as equipamentos_router
from routes.notifications import router as notifications_router
from routes.pedidos_cotacao import router as pedidos_cotacao_router
from routes.company_info import router as company_info_router
from routes.tabelas_tarifas import router as tabelas_tarifas_router
from routes.time_entries import router as time_entries_router
api_router.include_router(references_router)
api_router.include_router(clientes_router)
api_router.include_router(auth_router)
api_router.include_router(equipamentos_router)
api_router.include_router(notifications_router)
api_router.include_router(pedidos_cotacao_router)
api_router.include_router(company_info_router)
api_router.include_router(tabelas_tarifas_router)
api_router.include_router(time_entries_router)

# ============ Admin Error Log Endpoints ============

@api_router.get("/admin/errors")
async def get_app_errors(
    limit: int = 100,
    resolved: Optional[bool] = None,
    context_filter: Optional[str] = None,
    current_user: dict = Depends(get_current_admin)
):
    """Lista erros da aplicação para o admin dashboard"""
    query = {}
    if resolved is not None:
        query["resolved"] = resolved
    if context_filter:
        query["context"] = {"$regex": context_filter, "$options": "i"}
    
    errors = await db.app_errors.find(query, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    
    # Stats
    total = await db.app_errors.count_documents({})
    unresolved = await db.app_errors.count_documents({"resolved": False})
    
    return {
        "errors": errors,
        "stats": {
            "total": total,
            "unresolved": unresolved,
            "resolved": total - unresolved
        }
    }


@api_router.put("/admin/errors/{error_id}/resolve")
async def resolve_app_error(error_id: str, current_user: dict = Depends(get_current_admin)):
    """Marcar erro como resolvido"""
    result = await db.app_errors.update_one(
        {"id": error_id},
        {"$set": {"resolved": True, "resolved_by": current_user["username"], "resolved_at": get_now_local().isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Erro não encontrado")
    return {"message": "Erro marcado como resolvido"}


@api_router.delete("/admin/errors/resolved")
async def clear_resolved_errors(current_user: dict = Depends(get_current_admin)):
    """Limpar todos os erros resolvidos"""
    result = await db.app_errors.delete_many({"resolved": True})
    return {"message": f"{result.deleted_count} erros resolvidos eliminados"}


@api_router.post("/errors/log")
async def log_frontend_error(error_data: dict, current_user: dict = Depends(get_current_user)):
    """Endpoint para o frontend reportar erros"""
    await log_app_error(
        context=error_data.get("context", "Frontend"),
        action=error_data.get("action", "Desconhecido"),
        error_message=error_data.get("error_message", "Erro desconhecido"),
        details=error_data.get("details", {}),
        user_id=current_user.get("sub"),
        username=current_user.get("username")
    )
    return {"message": "Erro registado"}



app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
