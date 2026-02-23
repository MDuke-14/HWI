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

# ============ Models ============

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    email: EmailStr
    hashed_password: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    is_admin: bool = False
    must_change_password: bool = False  # Flag for password reset
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    username: str
    password: str
    email: EmailStr
    phone: str  # Required contact field
    full_name: Optional[str] = None
    company_start_date: Optional[str] = None  # YYYY-MM-DD
    vacation_days_taken: int = 0

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    is_admin: Optional[bool] = None

class UserLogin(BaseModel):
    username: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str  # Can be email or username

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class Cliente(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nome: str
    email: Optional[str] = None
    telefone: Optional[str] = None
    morada: Optional[str] = None
    nif: Optional[str] = None
    emails_adicionais: Optional[str] = None  # Separados por vírgula
    ativo: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Equipamento(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    cliente_id: str
    tipologia: Optional[str] = None
    marca: str
    modelo: str
    numero_serie: Optional[str] = None
    ano_fabrico: Optional[str] = None  # Ano de fabricação (aceita: AAAA, MM-AAAA, MM/AAAA)
    ativo: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_used: Optional[datetime] = None  # Última vez usado em OT

class RelatorioTecnico(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero_assistencia: Optional[int] = None  # Auto-incrementado pelo backend
    referencia_assistencia: Optional[str] = None
    status: str = "em_execucao"  # agendado, orcamento, em_execucao, concluido, facturado
    
    # Datas
    data_criacao: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    data_servico: date  # Data de início
    data_fim: Optional[date] = None  # Data "Até" - opcional, para OTs de múltiplos dias
    data_conclusao: Optional[datetime] = None
    
    @field_validator('data_fim', mode='before')
    @classmethod
    def validate_data_fim(cls, v):
        """Converter string vazia para None"""
        if v == '' or v is None:
            return None
        return v
    
    # Relações
    cliente_id: str
    created_by_id: str
    
    # Dados do cliente (snapshot)
    cliente_nome: str
    local_intervencao: str
    pedido_por: str
    contacto_pedido: Optional[str] = None
    
    # Equipamento
    equipamento_tipologia: Optional[str] = None
    equipamento_marca: Optional[str] = None
    equipamento_modelo: Optional[str] = None
    equipamento_numero_serie: Optional[str] = None
    equipamento_ano_fabrico: Optional[str] = None  # Aceita: AAAA, MM-AAAA, MM/AAAA
    
    # Motivo (mudou de "descricao_problema")
    motivo_assistencia: str
    
    # Relatório
    diagnostico: Optional[str] = None
    acoes_realizadas: Optional[str] = None
    resolucao: Optional[str] = None
    problema_resolvido: bool = False
    relatorio_assistencia: Optional[str] = None  # Descrição do trabalho realizado

class TecnicoRelatorio(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    tecnico_id: Optional[str] = None  # Opcional - pode ser nome livre
    tecnico_nome: str
    minutos_cliente: int = 0  # Tempo em minutos
    kms_inicial: float = 0  # Km's iniciais
    kms_final: float = 0  # Km's finais
    kms_inicial_volta: float = 0  # Km's iniciais volta
    kms_final_volta: float = 0  # Km's finais volta
    kms_deslocacao: float = 0  # Calculado automaticamente (kms_final - kms_inicial + volta)
    tipo_horario: str  # "diurno", "noturno", "sabado", "domingo_feriado"
    tipo_registo: str = "manual"  # "manual", "trabalho", "viagem"
    data_trabalho: date  # Data em que o técnico trabalhou nesta OT
    hora_inicio: Optional[str] = None  # Hora de início (HH:MM) para Folha de Horas
    hora_fim: Optional[str] = None  # Hora de fim (HH:MM) para Folha de Horas
    incluir_pausa: bool = False  # Se deve descontar 1h de pausa
    ordem: int = 0

class CronometroOT(BaseModel):
    """Cronómetro ativo de Trabalho ou Viagem"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    tecnico_id: str
    tecnico_nome: str
    tipo: str  # "trabalho" ou "viagem"
    hora_inicio: datetime
    ativo: bool = True

class RegistoTecnicoOT(BaseModel):
    """Registo de tempo segmentado (gerado automaticamente ao parar cronómetro)"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    tecnico_id: str
    tecnico_nome: str
    tipo: str  # "trabalho" ou "viagem"
    data: date
    hora_inicio_segmento: datetime
    hora_fim_segmento: datetime
    horas_arredondadas: float
    km: float  # Viagem sempre 0, Trabalho usa km da OT
    codigo: str  # 1, 2, S, D, V1, V2, VS, VD
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EquipamentoOT(BaseModel):
    """Equipamento associado a uma OT"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    tipologia: str
    marca: str
    modelo: str
    numero_serie: Optional[str] = None
    ano_fabrico: Optional[str] = None
    ordem: int = 0  # Para ordenação na lista

class MaterialOT(BaseModel):
    """Material associado a uma OT"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    descricao: str
    quantidade: int
    fornecido_por: str  # "Cliente", "HWI", "Cotação"
    data_utilizacao: Optional[str] = None  # Data de utilização/aplicação do material (YYYY-MM-DD)
    pc_id: Optional[str] = None  # ID do Pedido de Cotação (se fornecido_por = Cotação)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DespesaOT(BaseModel):
    """Despesa associada a uma OT"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    tipo: str = "outras"  # "outras", "combustivel", "ferramentas", "portagens"
    descricao: str
    valor: float
    tecnico_id: str  # ID do técnico que pagou
    tecnico_nome: str  # Nome do técnico
    data: str  # Data da despesa (YYYY-MM-DD)
    factura_data: Optional[str] = None  # Base64 da factura
    factura_filename: Optional[str] = None
    factura_mimetype: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str  # User ID de quem criou


class PedidoCotacao(BaseModel):
    """Pedido de Cotação (PC)"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero_pc: str  # PC-001, PC-002, etc.
    relatorio_id: str  # OT associada
    status: str = "Em Espera"  # Em Espera, Cotação Pedida, A Caminho, Em Armazém
    observacoes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None
    created_by: str

class IntervencaoRelatorio(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    data_intervencao: date
    motivo_assistencia: str
    relatorio_assistencia: Optional[str] = None
    equipamento_id: Optional[str] = None  # ID do equipamento relacionado
    ordem: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MaterialRelatorio(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    designacao: str
    quantidade: float
    tipo: str  # "usado" ou "para_orcamento"
    ordem: int = 0

class FotoRelatorio(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    foto_path: str
    foto_url: Optional[str] = None
    descricao: Optional[str] = None
    ordem: int = 0
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AssinaturaRelatorio(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    tipo: str  # "digital" ou "manual"
    # Para assinatura digital
    assinatura_path: Optional[str] = None
    assinatura_url: Optional[str] = None
    assinatura_base64: Optional[str] = None
    # Para assinatura manual
    primeiro_nome: Optional[str] = None
    ultimo_nome: Optional[str] = None
    # Comum
    assinado_por: Optional[str] = None  # Nome completo
    data_assinatura: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    data_intervencao: Optional[str] = None  # Data da intervenção (editável pelo user)


class EnviarEmailRequest(BaseModel):
    emails: List[str]


class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    username: str
    type: str  # "missing_clock_in", "long_break", "overtime_alert"
    title: str
    message: str
    priority: str  # "low", "medium", "high"
    read: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PushSubscription(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    endpoint: str
    keys: dict
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RelatorioTecnicoCreate(BaseModel):
    cliente_id: str
    data_servico: date  # Data de início
    data_fim: Optional[date] = None  # Data "Até" - opcional
    local_intervencao: str
    pedido_por: str
    contacto_pedido: Optional[str] = None
    equipamento_tipologia: Optional[str] = None
    equipamento_marca: Optional[str] = None
    equipamento_modelo: Optional[str] = None
    equipamento_numero_serie: Optional[str] = None
    equipamento_ano_fabrico: Optional[str] = None  # Aceita: AAAA, MM-AAAA, MM/AAAA
    motivo_assistencia: str  # Mudou de "descricao_problema"

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class TimeEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    username: str
    date: str  # YYYY-MM-DD format
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: str = "not_started"  # not_started, active, completed
    observations: Optional[str] = None
    is_overtime_day: bool = False
    overtime_reason: Optional[str] = None  # "Sábado", "Domingo", "Feriado: Nome"
    regular_hours: Optional[float] = None
    overtime_hours: Optional[float] = None  # Hours above 8h on regular days
    special_hours: Optional[float] = None  # All hours on weekends/holidays
    total_hours: Optional[float] = None
    outside_residence_zone: bool = False  # True if working outside residence zone
    location_description: Optional[str] = None  # Location when outside residence zone
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TimeEntryStart(BaseModel):
    observations: Optional[str] = None
    outside_residence_zone: Optional[bool] = False
    location_description: Optional[str] = None
    geo_location: Optional[dict] = None  # {latitude, longitude, accuracy, timestamp}

class TimeEntryEnd(BaseModel):
    observations: Optional[str] = None
    end_geo_location: Optional[dict] = None  # {latitude, longitude, accuracy, timestamp}

class TimeEntryUpdate(BaseModel):
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    observations: Optional[str] = None
    outside_residence_zone: Optional[bool] = None
    location_description: Optional[str] = None

class ManualTimeEntryCreate(BaseModel):
    user_id: str
    date: str  # YYYY-MM-DD
    time_entries: List[dict]  # [{"start_time": "09:00", "end_time": "13:00"}, {"start_time": "14:00", "end_time": "18:00"}]
    observations: Optional[str] = None
    outside_residence_zone: Optional[bool] = False
    location_description: Optional[str] = None

class VacationRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    username: str
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    days_requested: int
    reason: Optional[str] = None
    status: str = "pending"  # pending, approved, rejected
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class VacationRequestCreate(BaseModel):
    start_date: str
    end_date: str
    reason: Optional[str] = None

class VacationBalance(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    company_start_date: str  # YYYY-MM-DD
    days_earned: float
    days_taken: int
    days_available: float
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    type: str  # vacation_request, vacation_approved, vacation_rejected, late_arrival, absence_reminder
    message: str
    read: bool = False
    related_id: Optional[str] = None  # ID of vacation request or absence
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Absence(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    username: str
    date: str  # YYYY-MM-DD
    absence_type: str  # full_justified, full_unjustified, partial
    hours: float  # 8 for full day, or specific hours for partial
    is_justified: bool
    reason: Optional[str] = None
    justification_file: Optional[str] = None  # filename
    status: str = "pending"  # pending, approved, rejected (for admin review)
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AbsenceCreate(BaseModel):
    date: str
    absence_type: str  # full_justified, full_unjustified, partial
    hours: float = 8.0
    is_justified: bool = True
    reason: Optional[str] = None

class ServiceAppointment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    location: str
    service_reason: str
    technician_ids: List[str]  # List of user IDs
    date: str  # YYYY-MM-DD
    time_slot: Optional[str] = None  # Optional time like "09:00-12:00"
    observations: Optional[str] = None
    status: str = "scheduled"  # scheduled, in_progress, completed, cancelled
    created_by: str  # Admin user ID
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ServiceAppointmentCreate(BaseModel):
    client_name: str
    location: str
    service_reason: Optional[str] = None  # Agora opcional
    technician_ids: List[str]
    date: str
    time_slot: Optional[str] = None
    observations: Optional[str] = None

class ServiceWithOTCreate(BaseModel):
    """Modelo para criar serviço que gera OT automaticamente"""
    client_name: str
    client_id: Optional[str] = None  # ID do cliente para criar OT
    location: str
    service_type: str = "assistencia"  # 'assistencia' ou 'montagem'
    service_reason: Optional[str] = None  # Opcional
    technician_ids: List[str]
    date: str  # Data início
    date_end: Optional[str] = None  # Data fim (Até)
    time_slot: Optional[str] = None
    observations: Optional[str] = None

class ServiceAppointmentUpdate(BaseModel):
    client_name: Optional[str] = None
    location: Optional[str] = None
    service_reason: Optional[str] = None
    technician_ids: Optional[List[str]] = None
    date: Optional[str] = None
    time_slot: Optional[str] = None
    observations: Optional[str] = None
    status: Optional[str] = None

class CompanyInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default="company_info_default")
    nome_empresa: str = "HWI UNIPESSOAL LDA"
    nif: str = "518176657"
    telemovel: str = "+351 913008138"
    website: str = "www.hwi.pt"
    email: str = "geral@hwi.pt"
    morada_linha1: str = "Rua Mário Pereira 7 RC ESQ"
    morada_linha2: str = "2830-493 Barreiro, PT"
    iban: str = "PT50 0007 0000 0074 9942 1152 3"
    logo_url: Optional[str] = None  # URL ou caminho do logo da empresa
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None


class Tarifa(BaseModel):
    """Tarifas para cálculo de valores na Folha de Horas - associadas a uma Tabela de Preço"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero: Optional[int] = None  # Opcional - mantido para compatibilidade
    nome: str  # Ex: "Viagem Tarifa 1", "Mão de Obra"
    valor_por_hora: float  # Valor em euros por hora
    codigo: Optional[str] = None  # "1" (diurno), "2" (noturno), "S" (sábado), "D" (domingo/feriado), None (todos)
    tipo_registo: Optional[str] = None  # "trabalho", "viagem", ou None (ambos)
    table_id: int = 1  # ID da tabela de preço (1, 2, ou 3)
    ativo: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None


class TarifaCreate(BaseModel):
    nome: str
    valor_por_hora: float
    numero: Optional[int] = None  # Opcional
    codigo: Optional[str] = None  # "1", "2", "S", "D" ou None
    tipo_registo: Optional[str] = None  # "trabalho", "viagem", ou None (ambos)
    table_id: int = 1  # ID da tabela de preço (1, 2, ou 3)


class TarifaUpdate(BaseModel):
    numero: Optional[int] = None
    nome: Optional[str] = None
    valor_por_hora: Optional[float] = None
    codigo: Optional[str] = None
    tipo_registo: Optional[str] = None
    table_id: Optional[int] = None
    ativo: Optional[bool] = None


class TabelaPrecoConfig(BaseModel):
    """Configuração da Tabela de Preço (valor por Km)"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    table_id: int  # ID da tabela de preço (auto-incrementado)
    valor_km: float = 0.65  # Valor por quilómetro em euros
    nome: str = ""  # Nome customizado da tabela
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None


class TabelaPrecoCreate(BaseModel):
    nome: str  # Nome da tabela (obrigatório)
    valor_km: float = 0.65  # Valor por Km (default 0.65)


class TabelaPrecoConfigUpdate(BaseModel):
    valor_km: Optional[float] = None
    nome: Optional[str] = None


class FolhaHorasRequest(BaseModel):
    """Request para gerar PDF da Folha de Horas"""
    tarifas_por_tecnico: dict  # {tecnico_id: tarifa_valor}
    dados_extras: dict  # {f"{tecnico_id}_{data}": {"dieta": X, "portagens": Y, "despesas": Z}}
    table_id: int = 1  # ID da tabela de preço a usar


class OvertimeAuthorization(BaseModel):
    """Pedido de autorização de horas extra"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    user_email: Optional[str] = None
    entry_id: Optional[str] = None
    date: str
    request_type: str  # "overtime_start", "overtime_end", "vacation_work"
    day_type: Optional[str] = None  # "Sábado", "Domingo", "Feriado: X", "Férias"
    start_time: Optional[str] = None
    clock_in_time: Optional[str] = None
    requested_at: str
    expires_at: str
    status: str = "pending"  # "pending", "approved", "rejected"
    decided_by: Optional[str] = None
    decided_at: Optional[str] = None
    decision: Optional[str] = None
    vacation_request_id: Optional[str] = None  # ID do pedido de férias a anular


class DayAuthorization(BaseModel):
    """
    Estado de autorização diária para dias especiais (férias, feriados, fins de semana)
    Uma decisão desbloqueia ou bloqueia o dia inteiro
    """
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    date: str  # YYYY-MM-DD
    day_type: str  # "ferias", "feriado", "sabado", "domingo"
    day_type_display: str  # "Férias", "Feriado: Natal", "Sábado", "Domingo"
    status: str = "pending"  # "pending", "authorized", "rejected"
    first_entry_id: str  # ID da primeira picagem que gerou o pedido
    first_entry_time: str  # Hora da primeira picagem (HH:MM)
    vacation_request_id: Optional[str] = None  # ID do pedido de férias (se aplicável)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    decided_by: Optional[str] = None
    decided_at: Optional[str] = None
    notification_sent: bool = False


class OvertimeDecision(BaseModel):
    """Decisão sobre autorização de horas extra"""
    action: str  # "approve" or "reject"


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

def truncar_horas_para_minutos(horas: float) -> float:
    """
    Trunca horas para minutos inteiros (sem segundos).
    Ex: 8.6833... (8:41:00) -> 8.68 (8:40:48 arredondado para baixo)
    Ex: 8.6999... (8:41:59) -> 8.68 (8:41:00 truncado)
    
    Processo:
    1. Converte para minutos totais
    2. Trunca (floor) para minutos inteiros
    3. Converte de volta para horas decimais
    """
    total_minutos = math.floor(horas * 60)
    return total_minutos / 60

def truncar_segundos_para_horas(segundos: float) -> float:
    """
    Converte segundos para horas, truncando os segundos restantes.
    Ex: 31259 segundos (8:41:59) -> 8.68h (8:41)
    """
    total_minutos = math.floor(segundos / 60)
    return total_minutos / 60

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
                dt = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
                return dt.strftime('%H:%M')
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
    days_available = max(0, days_earned - days_taken)
    
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

# ============ Auth Routes ============

@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate):
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
    
    # Create token
    access_token = create_access_token(data={"sub": user.id, "username": user.username, "is_admin": is_admin})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user={"id": user.id, "username": user.username, "full_name": user.full_name, "is_admin": is_admin}
    )

@api_router.get("/debug/db-info")
async def debug_db_info():
    """Debug endpoint to check database connection"""
    try:
        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/emergent')
        db_name = os.environ.get('DB_NAME', 'emergent')
        # Hide password in URL
        safe_url = mongo_url.split('@')[-1] if '@' in mongo_url else mongo_url
        
        # Count users
        user_count = await db.users.count_documents({})
        
        # Get sample user fields (no sensitive data)
        sample_user = await db.users.find_one({}, {"_id": 0, "username": 1, "email": 1, "is_admin": 1})
        
        # Check specific admin users
        admin_users = []
        for username in ["pedro.duarte", "miguel.moreira", "admin", "pedro", "miguel"]:
            user = await db.users.find_one({"username": username})
            if user:
                has_password = "hashed_password" in user or "password" in user
                password_field = "hashed_password" if "hashed_password" in user else "password" if "password" in user else "none"
                admin_users.append({
                    "username": username,
                    "exists": True,
                    "has_password_field": has_password,
                    "password_field_name": password_field,
                    "is_admin": user.get("is_admin", False),
                    "user_id": user.get("id", "no-id")
                })
            else:
                admin_users.append({
                    "username": username,
                    "exists": False
                })
        
        return {
            "mongo_url": safe_url,
            "database_name": db_name,
            "user_count": user_count,
            "sample_user": sample_user,
            "admin_users": admin_users,
            "environment": "production" if "preview" not in safe_url else "preview"
        }
    except Exception as e:
        return {"error": str(e), "error_type": type(e).__name__}

@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    logging.info(f"LOGIN ATTEMPT: username={credentials.username}")
    
    # Find user
    user = await db.users.find_one({"username": credentials.username})
    logging.info(f"USER FOUND: {user is not None}")
    
    if not user:
        logging.error("User not found in database")
        raise HTTPException(
            status_code=401, 
            detail="Credenciais inválidas - utilizador não encontrado"
        )
    
    # Check for password field - support both field names
    stored_password = user.get("hashed_password") or user.get("password")
    password_field_name = "hashed_password" if user.get("hashed_password") else "password" if user.get("password") else None
    logging.info(f"STORED PASSWORD EXISTS: {stored_password is not None}, FIELD: {password_field_name}")
    
    if not stored_password:
        logging.error(f"No password field found. Available fields: {list(user.keys())}")
        raise HTTPException(
            status_code=401, 
            detail="Credenciais inválidas - campo de senha não encontrado no utilizador"
        )
    
    # Verify password
    try:
        password_valid = verify_password(credentials.password, stored_password)
        logging.info(f"PASSWORD VALID: {password_valid}, input_len={len(credentials.password)}, hash_len={len(stored_password)}")
    except Exception as e:
        logging.error(f"Password verification exception: {type(e).__name__}: {str(e)}")
        password_valid = False
    
    if not password_valid:
        logging.error("Password verification failed")
        raise HTTPException(
            status_code=401, 
            detail="Credenciais inválidas - senha incorreta"
        )
    
    # Create access token
    access_token = create_access_token(data={"sub": user["id"], "username": user["username"], "is_admin": user.get("is_admin", False)})
    
    logging.info(f"LOGIN SUCCESS: {user['username']}")
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user={
            "id": user["id"], 
            "username": user["username"], 
            "full_name": user.get("full_name"), 
            "is_admin": user.get("is_admin", False),
            "must_change_password": user.get("must_change_password", False)
        }
    )

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    return user

@api_router.post("/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    """
    Request password reset - generates temporary password and sends via email
    Can use either email or username
    """
    logging.info(f"PASSWORD RESET REQUEST: {request.email}")
    
    # Try to find user by email or username
    user = await db.users.find_one({
        "$or": [
            {"email": request.email},
            {"username": request.email}
        ]
    })
    
    if not user:
        # For security, don't reveal if user exists or not
        logging.warning(f"Password reset requested for non-existent user: {request.email}")
        return {
            "message": "Se o utilizador existir, um email será enviado com instruções para recuperação de senha."
        }
    
    # Generate temporary password
    temp_password = generate_temporary_password()
    hashed_temp_password = pwd_context.hash(temp_password)
    
    # Update user with temporary password and set must_change_password flag
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {
                "hashed_password": hashed_temp_password,
                "must_change_password": True,
                "password_reset_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Send email with temporary password
    try:
        await send_password_reset_email(
            user_name=user.get("full_name", user["username"]),
            user_email=user["email"],
            temporary_password=temp_password
        )
        
        logging.info(f"Password reset successful for user: {user['username']}")
        
        return {
            "message": "Email enviado com sucesso! Verifique sua caixa de entrada para a senha temporária."
        }
    except Exception as e:
        logging.error(f"Failed to send reset email: {str(e)}")
        # Revert the password change if email fails
        raise HTTPException(
            status_code=500,
            detail="Erro ao enviar email de recuperação. Por favor, tente novamente ou contacte o administrador."
        )

@api_router.post("/auth/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Change user password (requires being logged in)
    """
    user = await db.users.find_one({"id": current_user["sub"]})
    
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    
    # Verify old password
    stored_password = user.get("hashed_password") or user.get("password")
    if not verify_password(request.old_password, stored_password):
        raise HTTPException(
            status_code=401,
            detail="Senha atual incorreta"
        )
    
    # Validate new password
    if len(request.new_password) < 6:
        raise HTTPException(
            status_code=400,
            detail="A nova senha deve ter no mínimo 6 caracteres"
        )
    
    # Hash and update new password
    new_hashed_password = pwd_context.hash(request.new_password)
    
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {
                "hashed_password": new_hashed_password,
                "must_change_password": False,  # Clear the flag after successful change
                "password_changed_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    logging.info(f"Password changed successfully for user: {user['username']}")
    
    return {
        "message": "Senha alterada com sucesso!",
        "must_change_password": False
    }

# ============ Clientes Routes ============

@api_router.post("/clientes", response_model=Cliente)
async def create_cliente(cliente: Cliente, current_user: dict = Depends(get_current_user)):
    """Criar novo cliente"""
    cliente_dict = cliente.dict()
    cliente_dict["created_at"] = cliente_dict["created_at"].isoformat()
    
    await db.clientes.insert_one(cliente_dict)
    
    logging.info(f"Cliente criado: {cliente.nome} por {current_user['sub']}")
    return cliente

@api_router.get("/clientes")
async def get_clientes(current_user: dict = Depends(get_current_user)):
    """Listar todos os clientes ativos"""
    clientes = await db.clientes.find(
        {"ativo": True},
        {"_id": 0}
    ).sort("nome", 1).to_list(1000)
    
    return clientes

@api_router.get("/clientes/{cliente_id}", response_model=Cliente)
async def get_cliente(cliente_id: str, current_user: dict = Depends(get_current_user)):
    """Obter cliente específico"""
    cliente = await db.clientes.find_one({"id": cliente_id, "ativo": True}, {"_id": 0})
    
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    return cliente

@api_router.put("/clientes/{cliente_id}", response_model=Cliente)
async def update_cliente(
    cliente_id: str,
    cliente_data: Cliente,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar cliente"""
    existing_cliente = await db.clientes.find_one({"id": cliente_id})
    
    if not existing_cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    update_data = cliente_data.dict(exclude={"id", "created_at"})
    
    await db.clientes.update_one(
        {"id": cliente_id},
        {"$set": update_data}
    )
    
    updated_cliente = await db.clientes.find_one({"id": cliente_id}, {"_id": 0})
    
    logging.info(f"Cliente atualizado: {cliente_id} por {current_user['sub']}")
    
    return updated_cliente

@api_router.delete("/clientes/{cliente_id}")
async def delete_cliente(cliente_id: str, current_user: dict = Depends(get_current_user)):
    """Deletar cliente (soft delete - marca como inativo) - Apenas admin"""
    # Verificar permissão (admin)
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Apenas administradores podem eliminar clientes")
    
    result = await db.clientes.update_one(
        {"id": cliente_id},
        {"$set": {"ativo": False}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    logging.info(f"Cliente deletado: {cliente_id} por {current_user['sub']}")
    
    return {"message": "Cliente deletado com sucesso"}

@api_router.get("/clientes/export/pdf")
async def export_clientes_pdf(current_user: dict = Depends(get_current_user)):
    """Exportar lista de clientes para PDF - Apenas admin"""
    # Verificar permissão (admin)
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Apenas administradores podem exportar lista de clientes")
    
    # Buscar todos os clientes ativos
    clientes = await db.clientes.find(
        {"ativo": True},
        {"_id": 0}
    ).sort("nome", 1).to_list(length=None)
    
    # Gerar PDF
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    import io
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        spaceAfter=30,
        alignment=1  # Center
    )
    
    elements = []
    
    # Título
    elements.append(Paragraph("Lista de Clientes", title_style))
    elements.append(Spacer(1, 20))
    
    # Data de exportação
    from datetime import datetime
    date_style = ParagraphStyle(
        'DateStyle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.gray,
        alignment=1
    )
    elements.append(Paragraph(f"Exportado em: {datetime.now().strftime('%d/%m/%Y às %H:%M')}", date_style))
    elements.append(Spacer(1, 30))
    
    # Tabela de clientes
    if clientes:
        # Estilo para células com wrap de texto
        cell_style = ParagraphStyle(
            'CellStyle',
            parent=styles['Normal'],
            fontSize=9,
            leading=11,
            wordWrap='CJK'
        )
        header_cell_style = ParagraphStyle(
            'HeaderCellStyle',
            parent=styles['Normal'],
            fontSize=10,
            leading=12,
            textColor=colors.white,
            fontName='Helvetica-Bold'
        )
        
        data = [[
            Paragraph("#", header_cell_style),
            Paragraph("Nome", header_cell_style),
            Paragraph("Email", header_cell_style),
            Paragraph("NIF", header_cell_style)
        ]]
        for i, cliente in enumerate(clientes, 1):
            data.append([
                Paragraph(str(i), cell_style),
                Paragraph(cliente.get("nome", "") or "", cell_style),
                Paragraph(cliente.get("email", "") or "", cell_style),
                Paragraph(cliente.get("nif", "") or "", cell_style)
            ])
        
        table = Table(data, colWidths=[1.2*cm, 6*cm, 7*cm, 3*cm])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
            ('TOPPADDING', (0, 1), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.gray),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
        ]))
        elements.append(table)
        
        # Total
        elements.append(Spacer(1, 20))
        total_style = ParagraphStyle(
            'TotalStyle',
            parent=styles['Normal'],
            fontSize=10,
            textColor=colors.gray
        )
        elements.append(Paragraph(f"Total: {len(clientes)} cliente(s)", total_style))
    else:
        elements.append(Paragraph("Nenhum cliente encontrado.", styles['Normal']))
    
    doc.build(elements)
    buffer.seek(0)
    
    logging.info(f"Lista de clientes exportada para PDF por {current_user['sub']}")
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=lista_clientes.pdf"}
    )


@api_router.get("/clientes/export/emails-pdf")
async def export_clientes_emails_pdf(current_user: dict = Depends(get_current_user)):
    """Exportar lista de emails dos clientes para PDF - Apenas admin
    
    Gera um PDF com todos os emails dos clientes, separados por ';',
    pronto para copiar/colar no campo 'PARA' de um email.
    """
    # Verificar permissão (admin)
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Apenas administradores podem exportar emails")
    
    # Buscar todos os clientes ativos
    clientes = await db.clientes.find(
        {"ativo": True},
        {"_id": 0, "email": 1, "emails_adicionais": 1}
    ).to_list(length=None)
    
    # Recolher todos os emails
    all_emails = set()  # Usar set para remover duplicados automaticamente
    
    for cliente in clientes:
        # Email principal
        email = cliente.get("email", "")
        if email and "@" in email:
            all_emails.add(email.strip().lower())
        
        # Emails adicionais (podem estar separados por ; ou ,)
        emails_adicionais = cliente.get("emails_adicionais", "")
        if emails_adicionais:
            for e in emails_adicionais.replace(",", ";").split(";"):
                e = e.strip().lower()
                if e and "@" in e:
                    all_emails.add(e)
    
    # Ordenar alfabeticamente
    sorted_emails = sorted(all_emails)
    
    # Concatenar com ;
    emails_string = ";".join(sorted_emails)
    
    # Gerar PDF
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Flowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    import io
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm, leftMargin=2*cm, rightMargin=2*cm)
    
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        spaceAfter=20,
        alignment=1  # Center
    )
    
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.gray,
        alignment=1,
        spaceAfter=30
    )
    
    # Estilo para a caixa de emails - fonte monoespaçada para facilitar cópia
    email_box_style = ParagraphStyle(
        'EmailBox',
        parent=styles['Normal'],
        fontSize=9,
        fontName='Courier',
        leading=14,
        textColor=colors.HexColor('#1a1a1a'),
        backColor=colors.HexColor('#f5f5f5'),
        borderColor=colors.HexColor('#cccccc'),
        borderWidth=1,
        borderPadding=10,
        wordWrap='CJK'
    )
    
    info_style = ParagraphStyle(
        'Info',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.gray,
        spaceBefore=20
    )
    
    elements = []
    
    # Título
    elements.append(Paragraph("Lista de Emails - Clientes", title_style))
    
    # Data
    from datetime import datetime
    elements.append(Paragraph(f"Gerado em: {datetime.now().strftime('%d/%m/%Y às %H:%M')}", subtitle_style))
    
    # Instruções
    elements.append(Paragraph(
        "<b>Instruções:</b> Copie o bloco abaixo e cole diretamente no campo 'PARA' do seu email.",
        info_style
    ))
    elements.append(Spacer(1, 15))
    
    # Caixa com emails
    if emails_string:
        # Criar uma caixa visual com fundo
        from reportlab.platypus import Table, TableStyle
        
        email_paragraph = Paragraph(emails_string, email_box_style)
        
        # Wrap em tabela para criar efeito de caixa
        table_data = [[email_paragraph]]
        email_table = Table(table_data, colWidths=[16*cm])
        email_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f9f9f9')),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#cccccc')),
            ('TOPPADDING', (0, 0), (-1, -1), 15),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
            ('LEFTPADDING', (0, 0), (-1, -1), 15),
            ('RIGHTPADDING', (0, 0), (-1, -1), 15),
        ]))
        elements.append(email_table)
    else:
        elements.append(Paragraph("Nenhum email encontrado.", styles['Normal']))
    
    # Estatísticas
    elements.append(Spacer(1, 25))
    elements.append(Paragraph(f"<b>Total:</b> {len(sorted_emails)} email(s) únicos", info_style))
    elements.append(Paragraph(f"<b>Clientes analisados:</b> {len(clientes)}", info_style))
    
    doc.build(elements)
    buffer.seek(0)
    
    logging.info(f"Lista de emails de clientes exportada para PDF por {current_user['sub']} ({len(sorted_emails)} emails)")
    
    # Nome do ficheiro: Emails_Clientes_DD-MM-AAAA.pdf
    filename = f"Emails_Clientes_{datetime.now().strftime('%d-%m-%Y')}.pdf"
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


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


# ============ Equipamentos Routes ============

@api_router.get("/equipamentos")
async def get_equipamentos(
    cliente_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Listar equipamentos - pode filtrar por cliente"""
    query = {"ativo": True}
    if cliente_id:
        query["cliente_id"] = cliente_id
    
    equipamentos = await db.equipamentos.find(
        query,
        {"_id": 0}
    ).sort("last_used", -1).to_list(length=None)
    
    return equipamentos

@api_router.get("/equipamentos/{equipamento_id}", response_model=Equipamento)
async def get_equipamento(
    equipamento_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obter equipamento específico"""
    equipamento = await db.equipamentos.find_one(
        {"id": equipamento_id, "ativo": True},
        {"_id": 0}
    )
    
    if not equipamento:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado")
    
    return equipamento

@api_router.post("/equipamentos", response_model=Equipamento)
async def create_equipamento(
    equipamento: Equipamento,
    current_user: dict = Depends(get_current_user)
):
    """Criar novo equipamento"""
    # Verificar se cliente existe
    cliente = await db.clientes.find_one({"id": equipamento.cliente_id, "ativo": True})
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    # Verificar se equipamento já existe (mesmo marca, modelo e número de série)
    existing = await db.equipamentos.find_one({
        "cliente_id": equipamento.cliente_id,
        "marca": equipamento.marca,
        "modelo": equipamento.modelo,
        "numero_serie": equipamento.numero_serie,
        "ativo": True
    })
    
    if existing:
        # Retornar o existente ao invés de criar duplicado
        return existing
    
    equipamento_dict = equipamento.dict()
    equipamento_dict["created_at"] = equipamento_dict["created_at"].isoformat()
    if equipamento_dict.get("last_used"):
        equipamento_dict["last_used"] = equipamento_dict["last_used"].isoformat()
    
    await db.equipamentos.insert_one(equipamento_dict)
    
    logging.info(f"Equipamento criado: {equipamento.marca} {equipamento.modelo} para cliente {equipamento.cliente_id}")
    
    return equipamento

@api_router.put("/equipamentos/{equipamento_id}", response_model=Equipamento)
async def update_equipamento(
    equipamento_id: str,
    equipamento_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar equipamento"""
    existing = await db.equipamentos.find_one({"id": equipamento_id})
    
    if not existing:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado")
    
    # Remover campos que não devem ser atualizados
    equipamento_data.pop("id", None)
    equipamento_data.pop("created_at", None)
    equipamento_data.pop("cliente_id", None)  # Cliente não pode ser mudado
    
    await db.equipamentos.update_one(
        {"id": equipamento_id},
        {"$set": equipamento_data}
    )
    
    updated = await db.equipamentos.find_one({"id": equipamento_id}, {"_id": 0})
    
    logging.info(f"Equipamento atualizado: {equipamento_id}")
    
    return updated

@api_router.delete("/equipamentos/{equipamento_id}")
async def delete_equipamento(
    equipamento_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Deletar equipamento (soft delete)"""
    result = await db.equipamentos.update_one(
        {"id": equipamento_id},
        {"$set": {"ativo": False}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado")
    
    logging.info(f"Equipamento deletado: {equipamento_id}")
    
    return {"message": "Equipamento deletado com sucesso"}

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
    return relatorio

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
    
    # Processar relatórios (sem queries adicionais no loop)
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
        
        # Definir texto a mostrar (sem queries adicionais)
        if total_equipamentos == 0:
            relatorio["equipamento_display"] = "Não especificado"
        elif total_equipamentos == 1:
            if tem_equip_principal:
                parts = []
                if relatorio.get("equipamento_tipologia"):
                    parts.append(relatorio["equipamento_tipologia"])
                if relatorio.get("equipamento_marca"):
                    parts.append(relatorio["equipamento_marca"])
                if relatorio.get("equipamento_modelo"):
                    parts.append(relatorio["equipamento_modelo"])
                relatorio["equipamento_display"] = " • ".join(parts) if parts else "Equipamento"
            else:
                # Se não tem principal, mostra "Equipamento" (sem query adicional)
                relatorio["equipamento_display"] = "Equipamento"
        else:
            relatorio["equipamento_display"] = "Vários"
        
        relatorio["equipamentos_count"] = total_equipamentos
    
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
                detail="Apenas administradores podem marcar OTs como 'Facturado'"
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
    
    # Obter dados básicos
    tecnico_id_user = tecnico_data.get("tecnico_id", "")
    tecnico_nome = tecnico_data.get("tecnico_nome", "")
    tipo_registo = tecnico_data.get("tipo_registo", "manual")
    data_trabalho_str = tecnico_data.get("data_trabalho")
    hora_inicio_str = tecnico_data.get("hora_inicio")
    hora_fim_str = tecnico_data.get("hora_fim")
    
    # Calcular kms
    kms_inicial = float(tecnico_data.get("kms_inicial", 0))
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
        data_trabalho=data_trabalho_str if data_trabalho_str else datetime.now(timezone.utc).date(),
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
        update_data["minutos_cliente"] = tecnico_data["minutos_cliente"]
    
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
    if "incluir_pausa" in tecnico_data:
        update_data["incluir_pausa"] = tecnico_data["incluir_pausa"]
    
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
        
        # Converter para base64
        import base64
        foto_base64 = base64.b64encode(contents).decode('utf-8')
        
        # Criar documento da foto
        foto_id = str(uuid.uuid4())
        foto_doc = {
            "id": foto_id,
            "relatorio_id": relatorio_id,
            "foto_base64": foto_base64,
            "descricao": descricao,
            "filename": file.filename,
            "content_type": file.content_type,
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
        raise HTTPException(status_code=404, detail="OT não encontrada")
    
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
                ano_fabrico=equipamento_data.get("ano_fabrico")
            )
            equip_cliente_dict = novo_equipamento.dict()
            equip_cliente_dict["created_at"] = equip_cliente_dict["created_at"].isoformat()
            await db.equipamentos.insert_one(equip_cliente_dict)
            logging.info(f"Novo equipamento criado na base do cliente {cliente_id}: {equipamento_data['marca']} {equipamento_data['modelo']}")
    
    # Obter ordem (último + 1)
    last = await db.equipamentos_ot.find_one(
        {"relatorio_id": relatorio_id},
        sort=[("ordem", -1)]
    )
    ordem = (last.get("ordem", -1) + 1) if last else 0
    
    # Criar equipamento na OT
    equipamento = EquipamentoOT(
        relatorio_id=relatorio_id,
        tipologia=equipamento_data["tipologia"],
        marca=equipamento_data["marca"],
        modelo=equipamento_data["modelo"],
        numero_serie=equipamento_data.get("numero_serie"),
        ano_fabrico=equipamento_data.get("ano_fabrico"),
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
    allowed_fields = ["tipologia", "marca", "modelo", "numero_serie", "ano_fabrico"]
    
    for field in allowed_fields:
        if field in equipamento_data:
            update_fields[field] = equipamento_data[field]
    
    if update_fields:
        await db.equipamentos_ot.update_one(
            {"id": equipamento_id, "relatorio_id": relatorio_id},
            {"$set": update_fields}
        )
    
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
    foto_id: str
):
    """Obter imagem da fotografia - endpoint público para servir imagens"""
    # Buscar foto no MongoDB
    foto = await db.fotos_relatorio.find_one({
        "id": foto_id,
        "relatorio_id": relatorio_id
    }, {"_id": 0})
    
    if not foto:
        raise HTTPException(status_code=404, detail="Fotografia não encontrada")
    
    if not foto.get("foto_base64"):
        raise HTTPException(status_code=404, detail="Imagem não disponível")
    
    # Decodificar base64 e retornar
    import base64
    foto_bytes = base64.b64decode(foto["foto_base64"])
    
    from fastapi.responses import Response
    return Response(
        content=foto_bytes,
        media_type=foto.get("content_type", "image/jpeg")
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
    """Gerar PDF da OT e enviar por email"""
    try:
        # Buscar dados do relatório
        relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
        if not relatorio:
            raise HTTPException(status_code=404, detail="Relatório não encontrado")
        
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
        
        # Gerar PDF
        pdf_buffer = generate_ot_pdf(relatorio, cliente, intervencoes, tecnicos, fotografias, assinaturas, equipamentos_adicionais, materiais, registos_mao_obra, company_info)
        
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
        subject = f"Ordem de Trabalho #{numero_ot} - {cliente.get('nome', '')}"
        
        body = f"""
        <html>
        <body style="font-family: Arial, sans-serif;">
            <h2 style="color: #1e40af;">Ordem de Trabalho #{numero_ot}</h2>
            <p>Exmo(a) Sr(a),</p>
            <p>Segue em anexo a Ordem de Trabalho #{numero_ot} referente ao serviço realizado.</p>
            <p><strong>Cliente:</strong> {cliente.get('nome', 'N/A')}</p>
            <p><strong>Data de Serviço:</strong> {relatorio.get('data_servico', 'N/A')}</p>
            <p><strong>Equipamento:</strong> {relatorio.get('equipamento_marca', '')} {relatorio.get('equipamento_modelo', '')}</p>
            <br>
            <p>Com os melhores cumprimentos,</p>
            <p><strong>HWI Unipessoal, Lda</strong></p>
        </body>
        </html>
        """
        
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
                
                # Anexar PDF
                pdf_attachment = MIMEBase('application', 'pdf')
                pdf_attachment.set_payload(pdf_buffer.getvalue())
                encoders.encode_base64(pdf_attachment)
                pdf_attachment.add_header('Content-Disposition', f'attachment; filename="OT_{numero_ot}.pdf"')
                message.attach(pdf_attachment)
                
                # Resetar buffer para próximo email
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
        raise HTTPException(status_code=500, detail=f"Erro ao enviar PDF: {str(e)}")

@api_router.get("/relatorios-tecnicos/{relatorio_id}/preview-pdf")
async def preview_pdf_ot(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Gerar preview do PDF da OT sem enviar"""
    # Buscar dados do relatório
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
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
    
    # Gerar PDF
    pdf_buffer = generate_ot_pdf(relatorio, cliente, intervencoes, tecnicos, fotografias, assinaturas, equipamentos_adicionais, materiais, registos_mao_obra, company_info)
    
    # Retornar como download
    numero_ot = relatorio.get('numero_assistencia', 'N/A')
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=OT_{numero_ot}_{cliente.get('nome', 'Cliente').replace(' ', '_')}.pdf"
        }
    )




# ============ Notifications Routes ============

@api_router.get("/notifications")
async def get_notifications(
    unread_only: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Buscar notificações do usuário"""
    query = {"user_id": current_user["sub"]}
    
    if unread_only:
        query["read"] = False
    
    notifications = await db.notifications.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(length=None)
    
    return notifications

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Marcar notificação como lida"""
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user["sub"]},
        {"$set": {"read": True}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")
    
    return {"message": "Notificação marcada como lida"}

@api_router.post("/notifications/subscribe")
async def subscribe_push(
    subscription: dict,
    current_user: dict = Depends(get_current_user)
):
    """Registrar subscription de push notifications"""
    from pywebpush import webpush, WebPushException
    
    # Validar dados da subscription
    endpoint = subscription.get("endpoint", "")
    keys = subscription.get("keys", {})
    
    if not endpoint or not keys.get("p256dh") or not keys.get("auth"):
        raise HTTPException(status_code=400, detail="Subscription inválida: endpoint ou keys em falta")
    
    # Verificar se as VAPID keys estão configuradas
    vapid_private = os.environ.get('VAPID_PRIVATE_KEY')
    vapid_public = os.environ.get('VAPID_PUBLIC_KEY')
    
    if not vapid_private or not vapid_public:
        raise HTTPException(status_code=500, detail="VAPID keys não configuradas no servidor")
    
    # Remover subscription antiga do usuário
    await db.push_subscriptions.delete_many({"user_id": current_user["sub"]})
    
    # Criar nova subscription
    push_sub = PushSubscription(
        user_id=current_user["sub"],
        endpoint=endpoint,
        keys=keys
    )
    
    sub_dict = push_sub.dict()
    sub_dict["created_at"] = sub_dict["created_at"].isoformat()
    # Guardar também a chave pública usada para criar esta subscription
    sub_dict["vapid_public_key_hash"] = hash(vapid_public) % 10000  # Hash curto para comparação
    
    await db.push_subscriptions.insert_one(sub_dict)
    
    logging.info(f"Push subscription registrada para usuário {current_user['sub']} (endpoint: {endpoint[:50]}...)")
    
    return {"message": "Subscription registrada com sucesso", "status": "active"}


@api_router.get("/notifications/vapid-public-key")
async def get_vapid_public_key():
    """Retorna a chave pública VAPID para o frontend usar"""
    vapid_public = os.environ.get('VAPID_PUBLIC_KEY')
    if not vapid_public:
        raise HTTPException(status_code=500, detail="VAPID public key não configurada")
    return {"publicKey": vapid_public}


@api_router.get("/notifications/push-status")
async def get_push_status(current_user: dict = Depends(get_current_user)):
    """Verificar estado da subscription de push do usuário"""
    subscription = await db.push_subscriptions.find_one({"user_id": current_user["sub"]})
    
    if not subscription:
        return {"status": "not_subscribed", "message": "Nenhuma subscription encontrada"}
    
    # Verificar se a subscription foi criada com a chave VAPID atual
    vapid_public = os.environ.get('VAPID_PUBLIC_KEY')
    current_hash = hash(vapid_public) % 10000 if vapid_public else 0
    stored_hash = subscription.get("vapid_public_key_hash", 0)
    
    if stored_hash != 0 and stored_hash != current_hash:
        return {
            "status": "key_mismatch",
            "message": "A subscription foi criada com chaves VAPID diferentes. Por favor, reative as notificações.",
            "needs_resubscribe": True
        }
    
    return {
        "status": "active",
        "endpoint": subscription["endpoint"][:50] + "...",
        "created_at": subscription.get("created_at"),
        "needs_resubscribe": False
    }


async def send_push_to_user(user_id: str, title: str, message: str, notification_type: str = "info", priority: str = "medium"):
    """Função utilitária para enviar push notification para um usuário"""
    from pywebpush import webpush, WebPushException
    import json
    
    vapid_private = os.environ.get('VAPID_PRIVATE_KEY')
    vapid_public = os.environ.get('VAPID_PUBLIC_KEY')
    vapid_email = os.environ.get('VAPID_CLAIM_EMAIL', 'geral@hwi.pt')
    
    if not vapid_private or not vapid_public:
        logging.warning("VAPID keys não configuradas")
        return False
    
    subscriptions = await db.push_subscriptions.find({"user_id": user_id}).to_list(None)
    
    if not subscriptions:
        logging.info(f"Nenhuma subscription encontrada para usuário {user_id}")
        return False
    
    sent_count = 0
    for sub in subscriptions:
        try:
            payload = json.dumps({
                "title": title,
                "message": message,
                "type": notification_type,
                "priority": priority
            })
            
            webpush(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": sub["keys"]
                },
                data=payload,
                vapid_private_key=vapid_private,
                vapid_claims={"sub": f"mailto:{vapid_email}"}
            )
            sent_count += 1
            logging.info(f"Push notification enviada para {user_id}")
            
        except WebPushException as e:
            logging.error(f"Erro ao enviar push: {e}")
            # Se a subscription expirou, é inválida ou as chaves VAPID não correspondem, remover
            if e.response and e.response.status_code in [403, 404, 410]:
                await db.push_subscriptions.delete_one({"_id": sub["_id"]})
                logging.info(f"Subscription inválida/expirada removida para {user_id} (status: {e.response.status_code})")
        except Exception as e:
            logging.error(f"Erro inesperado ao enviar push: {e}")
    
    return sent_count > 0


@api_router.post("/notifications/test-push")
async def test_push_notification(
    current_user: dict = Depends(get_current_user)
):
    """Enviar notificação push de teste para o usuário atual"""
    success = await send_push_to_user(
        current_user["sub"],
        "Teste de Notificação",
        "Esta é uma notificação de teste. Se você está vendo isto, as notificações push estão funcionando!",
        "test",
        "medium"
    )
    
    if success:
        return {"message": "Notificação de teste enviada com sucesso!"}
    else:
        raise HTTPException(status_code=400, detail="Não foi possível enviar a notificação. Verifique se as notificações push estão ativadas.")


@api_router.post("/notifications/test-clock-in-reminder")
async def test_clock_in_reminder(
    current_user: dict = Depends(get_current_user)
):
    """Testar notificação de lembrete de clock-in (apenas para admins)"""
    user = await db.users.find_one({"id": current_user["sub"]})
    if not user or not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Apenas administradores podem testar esta funcionalidade")
    
    from notifications_scheduler import send_push_notification
    from datetime import date
    
    today_formatted = date.today().strftime("%d/%m/%Y")
    
    success = await send_push_notification(
        db,
        current_user["sub"],
        "⚠️ Não Iniciou o Ponto",
        f"Ainda não registou entrada hoje ({today_formatted}). Por favor, regularize a situação.",
        "clock_in_reminder",
        "high"
    )
    
    if success:
        return {"message": "Notificação de lembrete de entrada enviada!"}
    else:
        raise HTTPException(status_code=400, detail="Não foi possível enviar a notificação.")


@api_router.post("/notifications/test-clock-out-reminder")
async def test_clock_out_reminder(
    current_user: dict = Depends(get_current_user)
):
    """Testar notificação de lembrete de clock-out (apenas para admins)"""
    user = await db.users.find_one({"id": current_user["sub"]})
    if not user or not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Apenas administradores podem testar esta funcionalidade")
    
    from notifications_scheduler import send_push_notification
    
    success = await send_push_notification(
        db,
        current_user["sub"],
        "🕐 Não Parou o Ponto",
        "O seu ponto está ativo após as 18:00. Entrada: 09:00. Aguarde autorização de horas extra.",
        "clock_out_reminder",
        "high"
    )
    
    if success:
        return {"message": "Notificação de lembrete de saída enviada!"}
    else:
        raise HTTPException(status_code=400, detail="Não foi possível enviar a notificação.")


@api_router.post("/notifications/test-overtime-admin")
async def test_overtime_admin_notification(
    current_user: dict = Depends(get_current_user)
):
    """Testar notificação de horas extra para admin (apenas para admins)"""
    user = await db.users.find_one({"id": current_user["sub"]})
    if not user or not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Apenas administradores podem testar esta funcionalidade")
    
    from notifications_scheduler import send_push_to_admins
    
    count = await send_push_to_admins(
        db,
        "⚠️ Pedido de Horas Extra",
        "Utilizador Teste ainda tem o ponto ativo. Autorize ou rejeite as horas extra.",
        "overtime_authorization",
        "high"
    )
    
    return {"message": f"Notificação enviada para {count} administrador(es)!"}


@api_router.delete("/notifications/all")
async def delete_all_notifications(
    current_user: dict = Depends(get_current_user)
):
    """Deletar todas as notificações do usuário"""
    result = await db.notifications.delete_many({"user_id": current_user["sub"]})
    
    return {"message": f"{result.deleted_count} notificações removidas"}

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


# ============ Time Entry Routes ============

@api_router.post("/time-entries/start")
async def start_time_entry(entry_data: TimeEntryStart, current_user: dict = Depends(get_current_user)):
    """
    Iniciar picagem de ponto.
    
    Em dias especiais (férias, feriados, sábados, domingos):
    - Primeira picagem: envia pedido de autorização ao admin
    - Picagens seguintes: verificam estado do dia (autorizado/rejeitado/pendente)
    - Uma autorização desbloqueia o dia inteiro
    - Uma rejeição bloqueia todas as picagens desse dia
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_date = datetime.now(timezone.utc).date()
    current_time_str = datetime.now(timezone.utc).strftime("%H:%M")
    
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
        start_time=datetime.now(timezone.utc),
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
            except Exception as e:
                logging.error(f"Erro no reverse geocoding: {str(e)}")
    
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

@api_router.post("/time-entries/end/{entry_id}")
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
    
    end_time = datetime.now(timezone.utc)
    start_time = datetime.fromisoformat(entry["start_time"])
    
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
            # Calculate end of current day (midnight)
            midnight = datetime.combine(current_start.date() + timedelta(days=1), datetime.min.time(), timezone.utc)
            day_seconds = (midnight - current_start).total_seconds()
            
            # TRUNCAR segundos (não arredondar)
            day_minutes = math.floor(day_seconds / 60)
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
        
        # TRUNCAR segundos (não arredondar)
        final_minutes = math.floor(final_seconds / 60)
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
        
        # Calcular total truncando segundos
        total_seconds = (end_time - start_time).total_seconds()
        total_minutes = math.floor(total_seconds / 60)
        total_hours = round(total_minutes / 60, 2)
        
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
        
        return {
            "message": "Relógio finalizado",
            "total_hours": total_hours,
            "regular_hours": hours_breakdown["regular_hours"],
            "overtime_hours": hours_breakdown["overtime_hours"],
            "special_hours": hours_breakdown["special_hours"]
        }

@api_router.get("/time-entries/today")
async def get_today_entry(current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
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
    
    if active_entry:
        # Adicionar flag de outside_zone do dia
        active_entry["day_has_outside_zone"] = has_outside_zone_today
        return active_entry
    
    # If no active entry, get today's completed entries aggregated
    today_entries = await db.time_entries.find({
        "user_id": current_user["sub"],
        "date": today,
        "status": "completed"
    }, {"_id": 0}).sort("created_at", 1).to_list(100)
    
    if not today_entries:
        return {"entries": [], "has_active": False, "day_has_outside_zone": has_outside_zone_today}
    
    return {
        "entries": today_entries, 
        "has_active": False, 
        "day_has_outside_zone": has_outside_zone_today
    }

@api_router.get("/admin/realtime-status")
async def get_realtime_status(current_user: dict = Depends(get_current_user)):
    """Get real-time status of all employees for today (admin only)"""
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Apenas administradores")
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_date = datetime.now(timezone.utc).date()
    
    # Get all users
    users = await db.users.find({}, {"_id": 0, "id": 1, "username": 1, "full_name": 1}).to_list(1000)
    
    # Get all today's entries (active and completed)
    all_entries = await db.time_entries.find({
        "date": today
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
                        "inicio": datetime.fromisoformat(e["start_time"]).strftime("%H:%M") if e.get("start_time") else None,
                        "fim": datetime.fromisoformat(e["end_time"]).strftime("%H:%M") if e.get("end_time") else None,
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
                    "inicio": datetime.fromisoformat(entry_db["start_time"]).strftime("%H:%M") if entry_db.get("start_time") else None,
                    "fim": datetime.fromisoformat(entry_db["end_time"]).strftime("%H:%M") if entry_db.get("end_time") else None,
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
            start_time_active = datetime.fromisoformat(active_entry["start_time"])
            
            # Tempo da entrada ativa (em segundos)
            elapsed_active = (datetime.now(timezone.utc) - start_time_active).total_seconds()
            
            # Tempo das entradas completadas (converter horas para segundos)
            total_completed = sum(e.get("total_hours", 0) for e in completed_entries) * 3600
            
            # TOTAL = completadas + ativa (em segundos)
            total_elapsed_seconds = total_completed + elapsed_active
            
            # TRUNCAR segundos para minutos
            elapsed_hours = truncar_segundos_para_horas(total_elapsed_seconds)
            
            status_info["status"] = "TRABALHANDO"
            status_info["status_color"] = "green"
            status_info["clock_in_time"] = start_time_active.strftime("%H:%M")
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
            total_hours = sum(e.get("total_hours", 0) for e in completed_entries)
            first_entry = min(completed_entries, key=lambda x: x.get("start_time", ""))
            last_entry = max(completed_entries, key=lambda x: x.get("end_time", ""))
            
            status_info["status"] = "TRABALHOU"
            status_info["status_color"] = "blue"
            status_info["clock_in_time"] = datetime.fromisoformat(first_entry["start_time"]).strftime("%H:%M")
            status_info["clock_out_time"] = datetime.fromisoformat(last_entry["end_time"]).strftime("%H:%M")
            status_info["total_hours"] = round(truncar_horas_para_minutos(total_hours), 2)
            status_info["outside_residence_zone"] = any(e.get("outside_residence_zone", False) for e in completed_entries)
            
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
        elif user_id in vacation_users:
            # On vacation
            status_info["status"] = "FÉRIAS"
            status_info["status_color"] = "purple"
        elif is_weekend:
            # Weekend
            status_info["status"] = "FOLGA"
            status_info["status_color"] = "gray"
        elif is_holiday:
            # Holiday
            status_info["status"] = "FERIADO"
            status_info["status_color"] = "amber"
            status_info["holiday_name"] = ot_reason
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


@api_router.get("/admin/user-locations/{user_id}")
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
        start_date = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    if not end_date:
        end_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
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


@api_router.get("/admin/all-current-locations")
async def get_all_current_locations(current_user: dict = Depends(get_current_user)):
    """Get current/last known locations of all users (admin only)"""
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Apenas administradores")
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
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
async def get_my_realtime_status(current_user: dict = Depends(get_current_user)):
    """Get user's own real-time status for today with entry details"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_date = datetime.now(timezone.utc).date()
    hora_servidor = datetime.now(timezone.utc).strftime("%H:%M")
    user_id = current_user["sub"]
    
    # Get user's today entries
    entries_db = await db.time_entries.find({
        "user_id": user_id,
        "date": today
    }, {"_id": 0}).to_list(1000)
    
    # Process entries
    entradas = []
    for entry_db in entries_db:
        if entry_db.get("entries"):
            # Formato novo - múltiplas entradas
            for idx, e in enumerate(entry_db["entries"]):
                entrada = {
                    "id": f"{entry_db['id']}_{idx}",
                    "inicio": datetime.fromisoformat(e["start_time"]).strftime("%H:%M") if e.get("start_time") else None,
                    "fim": datetime.fromisoformat(e["end_time"]).strftime("%H:%M") if e.get("end_time") else None,
                    "estado": "terminada" if e.get("end_time") else "ativa"
                }
                entradas.append(entrada)
        else:
            # Formato antigo
            entrada = {
                "id": entry_db["id"],
                "inicio": datetime.fromisoformat(entry_db["start_time"]).strftime("%H:%M") if entry_db.get("start_time") else None,
                "fim": datetime.fromisoformat(entry_db["end_time"]).strftime("%H:%M") if entry_db.get("end_time") else None,
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
# ============ Time Entry Reports Routes ============
    total_hours = sum(e.get("total_hours", 0) for e in today_entries)
    regular_hours = sum(e.get("regular_hours", 0) for e in today_entries)
    overtime_hours = sum(e.get("overtime_hours", 0) for e in today_entries)
    special_hours = sum(e.get("special_hours", 0) for e in today_entries)
    
    return {
        "entries": today_entries,
        "has_active": False,
        "daily_summary": {
            "date": today,
            "total_hours": round(truncar_horas_para_minutos(total_hours), 2),
            "regular_hours": round(truncar_horas_para_minutos(regular_hours), 2),
            "overtime_hours": round(truncar_horas_para_minutos(overtime_hours), 2),
            "special_hours": round(truncar_horas_para_minutos(special_hours), 2),
            "entry_count": len(today_entries)
        }
    }

@api_router.get("/time-entries/list")
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
        daily_entries[date]["total_hours"] += entry.get("total_hours", 0)
        daily_entries[date]["regular_hours"] += entry.get("regular_hours", 0)
        daily_entries[date]["overtime_hours"] += entry.get("overtime_hours", 0)
        
        # Collect observations
        if entry.get("observations"):
            daily_entries[date]["observations"].append(entry["observations"])
    
    # Convert to list and truncate hours (sem segundos)
    result = []
    for date_key in sorted(daily_entries.keys(), reverse=True):
        day_data = daily_entries[date_key]
        day_data["total_hours"] = round(truncar_horas_para_minutos(day_data["total_hours"]), 2)
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

@api_router.get("/time-entries/overtime")
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

@api_router.get("/time-entries/reports")
async def get_reports(
    period: str = "billing",  # billing, week, month
    current_user: dict = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    
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
    
    total_hours = sum(entry.get("total_hours", 0) for entry in entries)
    regular_hours = sum(entry.get("regular_hours", 0) for entry in entries)
    overtime_hours = sum(entry.get("overtime_hours", 0) for entry in entries)
    special_hours = sum(entry.get("special_hours", 0) for entry in entries)
    total_days = len(entries)
    
    # Truncar horas para minutos
    total_hours = truncar_horas_para_minutos(total_hours)
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

@api_router.get("/admin/users/list")
async def list_all_users(current_user: dict = Depends(get_current_admin)):
    """List all users (admin only) for reports"""
    users = await db.users.find(
        {},
        {"_id": 0, "id": 1, "username": 1, "full_name": 1, "email": 1}
    ).sort("full_name", 1).to_list(1000)
    
    return users

@api_router.get("/time-entries/reports/custom-range")
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
    
    # Build daily records for entire period
    daily_records = []
    current_date = start_date
    total_worked_hours = 0
    total_overtime_hours = 0
    total_special_hours = 0
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
            # Calculate total hours for the day
            total_hours = sum(e.get("total_hours", 0) for e in day_entries)
            
            # RECALCULAR breakdown baseado no TOTAL do dia (TRUNCANDO segundos)
            from hours_calculator import calcular_horas_dia, feriados_portugueses, minutos_para_horas
            import math
            
            # Truncar para minutos inteiros
            total_hours = truncar_horas_para_minutos(total_hours)
            total_minutos = math.floor(total_hours * 60)
            dia_semana_py = current_date.weekday()
            dia_semana_js = (dia_semana_py + 1) % 7
            ano = current_date.year
            feriados = feriados_portugueses(ano)
            is_feriado = current_date in feriados
            
            breakdown_min = calcular_horas_dia(total_minutos, dia_semana_js, is_feriado)
            
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
            } for e in sorted(day_entries, key=lambda x: x.get("start_time", ""))]
            day_data["total_hours"] = round(total_hours, 2)
            day_data["overtime_hours"] = round(overtime_hours, 2)
            day_data["special_hours"] = round(special_hours, 2)
            day_data["outside_residence_zone"] = outside_zone
            day_data["location"] = location
            
            # Payment calculation
            is_special_day = is_weekend or is_holiday
            qualifies_for_payment = True
            
            if is_special_day and total_hours < 5.0:
                qualifies_for_payment = False
            
            if qualifies_for_payment:
                if outside_zone:
                    day_data["payment_type"] = "Ajuda de Custos"
                    day_data["payment_value"] = 50.0
                    days_with_travel_allowance += 1
                else:
                    day_data["payment_type"] = "Subsídio de Alimentação"
                    day_data["payment_value"] = 10.0
                    days_with_meal_allowance += 1
            else:
                day_data["payment_type"] = None
                day_data["payment_value"] = None
            
            total_worked_hours += total_hours
            total_overtime_hours += overtime_hours
            total_special_hours += special_hours
        else:
            # Not worked - determine status
            if date_str in manual_statuses:
                day_data["status"] = manual_statuses[date_str]
            elif date_str in vacation_dates:
                day_data["status"] = "FÉRIAS"
            elif is_weekend:
                day_data["status"] = "FOLGA"
            elif is_holiday:
                day_data["status"] = "FERIADO"
            else:
                day_data["status"] = "FALTA"
            
            day_data["entries"] = []
            day_data["total_hours"] = 0
            day_data["overtime_hours"] = 0
            day_data["special_hours"] = 0
            day_data["payment_type"] = None
            day_data["payment_value"] = 0
        
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
    vacation_days_available = max(0, vacation_entitlement - vacation_days_used)
    
    return {
        "username": username,
        "full_name": full_name,
        "start_date": start_date.strftime("%Y-%m-%d"),
        "end_date": end_date.strftime("%Y-%m-%d"),
        "report_type": "custom_range",
        "daily_records": daily_records,
        "summary": {
            "total_worked_hours": round(truncar_horas_para_minutos(total_worked_hours), 2),
            "total_overtime_hours": round(truncar_horas_para_minutos(total_overtime_hours), 2),
            "total_special_hours": round(truncar_horas_para_minutos(total_special_hours), 2),
            "days_with_meal_allowance": days_with_meal_allowance,
            "days_with_travel_allowance": days_with_travel_allowance,
            "total_meal_allowance_value": days_with_meal_allowance * 10.0,
            "total_travel_allowance_value": days_with_travel_allowance * 50.0,
            "vacation_days_used": vacation_days_used,
            "vacation_days_available": vacation_days_available,
            "vacation_entitlement": vacation_entitlement
        }
    }

@api_router.get("/time-entries/reports/monthly-detailed")
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
    now = datetime.now(timezone.utc)
    
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
    total_worked_hours = 0
    total_overtime_hours = 0
    total_special_hours = 0
    days_with_meal_allowance = 0
    days_with_travel_allowance = 0
    
    dias_semana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
    
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
            
            # Calculate total hours for the day (sum all entries) - TRUNCAR segundos
            total_hours = truncar_horas_para_minutos(sum(e.get("total_hours", 0) for e in day_entries))
            
            # RECALCULAR breakdown baseado no TOTAL do dia
            from hours_calculator import calcular_horas_dia, feriados_portugueses, minutos_para_horas
            import math
            
            total_minutos = math.floor(total_hours * 60)
            dia_semana_py = current_date.weekday()
            dia_semana_js = (dia_semana_py + 1) % 7
            ano = current_date.year
            feriados = feriados_portugueses(ano)
            is_feriado = current_date in feriados
            
            breakdown_min = calcular_horas_dia(total_minutos, dia_semana_js, is_feriado)
            
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
                "observations": e.get("observations")
            } for e in sorted(day_entries, key=lambda x: x.get("start_time", ""))]
            day_data["total_hours"] = round(total_hours, 2)
            day_data["overtime_hours"] = round(overtime_hours, 2)
            day_data["special_hours"] = round(special_hours, 2)
            day_data["outside_residence_zone"] = outside_zone
            day_data["location"] = location
            
            # Verificar se tem direito a subsídio/ajuda de custos
            # Em dias especiais (fins de semana/feriados), só paga subsídio se trabalhar >= 5h
            is_special_day = is_weekend or is_holiday
            qualifies_for_payment = True
            
            if is_special_day and total_hours < 5.0:
                qualifies_for_payment = False
            
            if qualifies_for_payment:
                if outside_zone:
                    day_data["payment_type"] = "Ajuda de Custos"
                    day_data["payment_value"] = 50.0
                    days_with_travel_allowance += 1
                else:
                    day_data["payment_type"] = "Subsídio de Alimentação"
                    day_data["payment_value"] = 10.0
                    days_with_meal_allowance += 1
            else:
                day_data["payment_type"] = None
                day_data["payment_value"] = None
            
            total_worked_hours += total_hours
            total_overtime_hours += overtime_hours
            total_special_hours += special_hours
        else:
            # Not worked - determine status
            # First check if admin set a manual status
            if date_str in manual_statuses:
                day_data["status"] = manual_statuses[date_str]
            elif date_str in vacation_dates:
                day_data["status"] = "FÉRIAS"
            elif is_weekend:
                day_data["status"] = "FOLGA"
            elif is_holiday:
                day_data["status"] = "FERIADO"
            else:
                # Dia útil sem registo = FALTA
                day_data["status"] = "FALTA"
            
            day_data["entries"] = []
            day_data["total_hours"] = 0
            day_data["overtime_hours"] = 0
            day_data["special_hours"] = 0
            day_data["payment_type"] = None
            day_data["payment_value"] = 0
        
        daily_records.append(day_data)
        current_date += timedelta(days=1)
    
    # Calculate vacation days used up to the end date of this report
    vacation_days_used = 0
    all_vacation_requests = await db.vacation_requests.find({
        "user_id": target_user_id,
        "status": "approved"
    }, {"_id": 0}).to_list(1000)
    
    for vac in all_vacation_requests:
        vac_start = datetime.strptime(vac["start_date"], "%Y-%m-%d").date()
        vac_end = datetime.strptime(vac["end_date"], "%Y-%m-%d").date()
        
        # Only count vacation days up to the end of this billing period
        actual_end = min(vac_end, end_date)
        if vac_start <= end_date:
            # Count working days (exclude weekends)
            current = vac_start
            while current <= actual_end:
                if current.weekday() < 5:  # Monday to Friday
                    vacation_days_used += 1
                current += timedelta(days=1)
    
    # Get user's vacation entitlement (default 22 days per year in Portugal)
    vacation_entitlement = user.get("vacation_days_per_year", 22)
    vacation_days_available = max(0, vacation_entitlement - vacation_days_used)
    
    return {
        "username": username,
        "full_name": full_name,
        "start_date": start_date.strftime("%Y-%m-%d"),
        "end_date": end_date.strftime("%Y-%m-%d"),
        "month": month,
        "year": year,
        "daily_records": daily_records,
        "summary": {
            "total_worked_hours": round(truncar_horas_para_minutos(total_worked_hours), 2),
            "total_overtime_hours": round(truncar_horas_para_minutos(total_overtime_hours), 2),
            "total_special_hours": round(truncar_horas_para_minutos(total_special_hours), 2),
            "days_with_meal_allowance": days_with_meal_allowance,
            "days_with_travel_allowance": days_with_travel_allowance,
            "total_meal_allowance_value": days_with_meal_allowance * 10.0,
            "total_travel_allowance_value": days_with_travel_allowance * 50.0,
            "vacation_days_used": vacation_days_used,
            "vacation_days_available": vacation_days_available,
            "vacation_entitlement": vacation_entitlement
        }
    }

@api_router.get("/time-entries/reports/monthly-pdf")
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
    now = datetime.now(timezone.utc)
    
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
            except:
                pass
    
    # Buscar faltas (absences)
    absences = await db.absences.find({
        "user_id": target_user_id,
        "date": {"$gte": start_date.strftime("%Y-%m-%d"), "$lte": end_date.strftime("%Y-%m-%d")}
    }, {"_id": 0}).to_list(500)
    
    for absence in absences:
        absence_date = absence.get("date")
        if absence_date:
            justifications_map[absence_date] = "Falta registada pelo admin"
    
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
    total_worked_hours = 0
    total_overtime_hours = 0
    total_special_hours = 0
    days_with_meal_allowance = 0
    days_with_travel_allowance = 0
    
    dias_semana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
    
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
            
            # Calculate total hours for the day (sum all entries) - TRUNCAR segundos
            total_hours = truncar_horas_para_minutos(sum(e.get("total_hours", 0) for e in day_entries))
            
            # RECALCULAR breakdown baseado no TOTAL do dia (não somar individuais!)
            # Usar a função correta de cálculo
            from hours_calculator import calcular_horas_dia, feriados_portugueses, minutos_para_horas
            import math
            
            # Converter total para minutos (já está truncado)
            total_minutos = math.floor(total_hours * 60)
            
            # Verificar dia da semana e feriado
            dia_semana_py = current_date.weekday()  # 0=Segunda, 6=Domingo
            dia_semana_js = (dia_semana_py + 1) % 7  # Converter para JS: 0=Domingo, 6=Sábado
            
            ano = current_date.year
            feriados = feriados_portugueses(ano)
            is_feriado = current_date in feriados
            
            # Calcular breakdown correto
            breakdown_min = calcular_horas_dia(total_minutos, dia_semana_js, is_feriado)
            
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
                "observations": e.get("observations")
            } for e in sorted(day_entries, key=lambda x: x.get("start_time", ""))]
            day_data["total_hours"] = round(total_hours, 2)
            day_data["overtime_hours"] = round(overtime_hours, 2)
            day_data["special_hours"] = round(special_hours, 2)
            day_data["outside_residence_zone"] = outside_zone
            day_data["location"] = location
            
            # Verificar se tem direito a subsídio/ajuda de custos
            # Em dias especiais (fins de semana/feriados), só paga subsídio se trabalhar >= 5h
            is_special_day = is_weekend or is_holiday
            qualifies_for_payment = True
            
            if is_special_day and total_hours < 5.0:
                qualifies_for_payment = False
            
            if qualifies_for_payment:
                if outside_zone:
                    day_data["payment_type"] = "Ajuda de Custos"
                    day_data["payment_value"] = 50.0
                    days_with_travel_allowance += 1
                else:
                    day_data["payment_type"] = "Subsídio de Alimentação"
                    day_data["payment_value"] = 10.0
                    days_with_meal_allowance += 1
            else:
                day_data["payment_type"] = None
                day_data["payment_value"] = None
            
            total_worked_hours += total_hours
            total_overtime_hours += overtime_hours
            total_special_hours += special_hours
        else:
            # Not worked - determine status
            # First check if admin set a manual status
            if date_str in manual_statuses:
                day_data["status"] = manual_statuses[date_str]
            elif date_str in vacation_dates:
                day_data["status"] = "FÉRIAS"
            elif is_weekend:
                day_data["status"] = "FOLGA"
            elif is_holiday:
                day_data["status"] = "FERIADO"
            else:
                # Dia útil sem registo = FALTA
                day_data["status"] = "FALTA"
            
            day_data["entries"] = []
            day_data["total_hours"] = 0
            day_data["overtime_hours"] = 0
            day_data["special_hours"] = 0
            day_data["payment_type"] = None
            day_data["payment_value"] = 0
        
        daily_records.append(day_data)
        current_date += timedelta(days=1)
    
    # Buscar dados de férias do sistema de férias (usa vacation_balances)
    vacation_balance = await db.vacation_balances.find_one({"user_id": target_user_id}, {"_id": 0})
    
    
    if vacation_balance:
        vacation_calc = calculate_vacation_days(
            vacation_balance["company_start_date"],
            vacation_balance.get("days_taken", 0)
        )
        vacation_days_used = vacation_balance.get("days_taken", 0)
        vacation_days_available = vacation_calc["days_available"]
        vacation_entitlement = vacation_calc["days_earned"]
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
            "total_worked_hours": round(truncar_horas_para_minutos(total_worked_hours), 2),
            "total_overtime_hours": round(truncar_horas_para_minutos(total_overtime_hours), 2),
            "total_special_hours": round(truncar_horas_para_minutos(total_special_hours), 2),
            "days_with_meal_allowance": days_with_meal_allowance,
            "days_with_travel_allowance": days_with_travel_allowance,
            "total_meal_allowance_value": days_with_meal_allowance * 10.0,
            "total_travel_allowance_value": days_with_travel_allowance * 50.0,
            "vacation_days_used": vacation_days_used,
            "vacation_days_available": vacation_days_available,
            "vacation_entitlement": vacation_entitlement
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



@api_router.post("/admin/time-entries/{entry_id}/adjust-to-8h")
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
                start = datetime.fromisoformat(e["start_time"])
                end = datetime.fromisoformat(e["end_time"])
                total_seconds_other += (end - start).total_seconds()
        
        # Converter para horas
        import math
        total_minutes_other = math.floor(total_seconds_other / 60)
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
        start_time = datetime.fromisoformat(entry["start_time"])
        minutes_needed = round(hours_needed * 60)
        new_end_time = start_time + timedelta(minutes=minutes_needed)
        
        # Guardar hora original em observations
        original_end = datetime.fromisoformat(entry["end_time"])
        original_end_str = original_end.strftime("%H:%M")
        
        new_observations = entry.get("observations", "")
        adjustment_note = f"[Ajustado para 8h - Original: {original_end_str}]"
        
        if new_observations:
            new_observations = f"{new_observations} {adjustment_note}"
        else:
            new_observations = adjustment_note
        
        # Calcular novo total de horas desta entrada
        new_total_seconds = (new_end_time - start_time).total_seconds()
        new_total_minutes = math.floor(new_total_seconds / 60)
        new_total_hours = round(new_total_minutes / 60, 2)
        
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
        
        timestamp = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M")
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


@api_router.post("/admin/time-entries/justify-day")
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

@api_router.get("/time-entries/reports/custom-range-pdf")
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

@api_router.get("/time-entries/reports/excel")
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
    now = datetime.now(timezone.utc)
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
    
    # Get vacation data
    vacation_data = await db.vacations.find_one({"user_id": target_user_id}, {"_id": 0})
    
    # Determine month and year from start_date for report title
    start_dt_obj = datetime.fromisoformat(start_date)
    month = start_dt_obj.month
    year = start_dt_obj.year
    
    # Generate Excel workbook
    wb = generate_monthly_report(user_data, entries, vacation_data or {}, month, year)
    
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

@api_router.put("/time-entries/{entry_id}")
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
            start_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
            end_time = datetime.fromisoformat(end_time_str.replace('Z', '+00:00'))
            
            # Calculate total hours - TRUNCAR segundos
            total_seconds = (end_time - start_time).total_seconds()
            total_minutes = math.floor(total_seconds / 60)
            total_hours = total_minutes / 60
            total_hours = round(total_hours, 2)
            
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

@api_router.delete("/time-entries/{entry_id}")
async def delete_time_entry(entry_id: str, current_user: dict = Depends(get_current_user)):
    # Only admins can delete entries
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Apenas administradores podem eliminar registos")
    
    result = await db.time_entries.delete_one({"id": entry_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Registo não encontrado")
    
    return {"message": "Registo eliminado com sucesso"}

@api_router.delete("/admin/time-entries/date/{user_id}/{date}")
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

@api_router.get("/admin/time-entries/status-report")
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

@api_router.post("/admin/time-entries/fix-invalid-status")
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

@api_router.delete("/admin/time-entries/delete-invalid")
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


@api_router.post("/admin/users/{user_id}/recalculate-hours")
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
                        start = datetime.fromisoformat(e["start_time"])
                        end = datetime.fromisoformat(e["end_time"])
                        total_seconds += (end - start).total_seconds()
            
            # FORMATO ANTIGO: start_time e end_time diretos
            elif entry.get("start_time") and entry.get("end_time"):
                has_time_data = True
                start = datetime.fromisoformat(entry["start_time"])
                end = datetime.fromisoformat(entry["end_time"])
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
                first_start = datetime.fromisoformat(entry["entries"][0]["start_time"])
                last_end = datetime.fromisoformat(entry["entries"][-1]["end_time"])
            else:
                first_start = datetime.fromisoformat(entry["start_time"])
                last_end = datetime.fromisoformat(entry["end_time"])
            
            # Usar a NOVA LÓGICA do script fornecido
            date_obj = datetime.strptime(entry["date"], "%Y-%m-%d").date()
            hours_breakdown = calcular_breakdown_completo(first_start, last_end, date_obj)
            
            # Calcular total truncando segundos
            total_minutes = math.floor(total_seconds / 60)
            total_hours = round(total_minutes / 60, 2)
            
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
                        "saturday": round(old_saturday, 2),
                        "special": round(old_special, 2),
                        "total": round(old_total, 2)
                    },
                    "new_values": {
                        "regular": new_regular,
                        "overtime": new_overtime,
                        "saturday": new_saturday,
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

@api_router.post("/admin/day-status/set")
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

@api_router.post("/admin/time-entries/manual")
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
                
                # First part: start_time to 23:59:59
                first_part_end = midnight - timedelta(seconds=1)
                first_seconds = (first_part_end - start_datetime).total_seconds()
                
                # TRUNCAR segundos
                first_minutes = math.floor(first_seconds / 60)
                first_hours = first_minutes / 60
                first_hours = round(first_hours, 2)
                
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
                second_seconds = (end_datetime - midnight).total_seconds()
                
                # TRUNCAR segundos
                second_minutes = math.floor(second_seconds / 60)
                second_hours = second_minutes / 60
                second_hours = round(second_hours, 2)
                
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
                total_seconds = (end_datetime - start_datetime).total_seconds()
                
                # TRUNCAR segundos
                entry_minutes = math.floor(total_seconds / 60)
                entry_hours = entry_minutes / 60
                entry_hours = round(entry_hours, 2)
                
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

@api_router.post("/admin/time-entries/start/{user_id}")
async def admin_start_clock(
    user_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """Admin inicia o relógio para um utilizador"""
    # Verificar se o utilizador existe
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Verificar se já existe uma entrada ativa
    existing_active = await db.time_entries.find_one({
        "user_id": user_id,
        "status": "active"
    }, {"_id": 0})
    
    if existing_active:
        raise HTTPException(status_code=400, detail="Este utilizador já tem um relógio ativo")
    
    # Verificar se é dia de horas extras
    today_date = datetime.now(timezone.utc).date()
    is_ot, ot_reason = is_overtime_day(today_date)
    
    entry = TimeEntry(
        user_id=user_id,
        username=user.get("username", ""),
        date=today,
        start_time=datetime.now(timezone.utc),
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

@api_router.post("/admin/time-entries/end/{user_id}")
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
    
    end_time = datetime.now(timezone.utc)
    start_time = datetime.fromisoformat(entry["start_time"])
    
    # Calcular horas
    total_seconds = (end_time - start_time).total_seconds()
    total_hours = total_seconds / 3600
    
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

@api_router.post("/admin/time-entries/import-pdf")
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
                    
                    # Calculate hours
                    total_seconds = (end_datetime - start_datetime).total_seconds()
                    entry_minutes = math.floor(total_seconds / 60)
                    entry_hours = entry_minutes / 60
                    entry_hours = round(entry_hours, 2)
                    
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

# ============ Vacation Routes ============

@api_router.get("/vacations/balance")
async def get_vacation_balance(current_user: dict = Depends(get_current_user)):
    """Get current user's vacation balance"""
    balance = await db.vacation_balances.find_one({"user_id": current_user["sub"]}, {"_id": 0})
    
    if not balance:
        return {"days_earned": 0, "days_taken": 0, "days_available": 0, "message": "Configure a data de início na empresa"}
    
    # Recalculate based on current date
    calc = calculate_vacation_days(balance["company_start_date"], balance.get("days_taken", 0))
    
    # Update in database
    await db.vacation_balances.update_one(
        {"user_id": current_user["sub"]},
        {"$set": {
            "days_earned": calc["days_earned"],
            "days_available": calc["days_available"],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {**balance, **calc}

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
    
    # Check available days
    balance = await db.vacation_balances.find_one({"user_id": current_user["sub"]})
    if balance:
        calc = calculate_vacation_days(balance["company_start_date"], balance.get("days_taken", 0))
        if days_requested > calc["days_available"]:
            raise HTTPException(status_code=400, detail=f"Dias insuficientes. Disponível: {calc['days_available']} dias")
    
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
                "days_taken": vacation_days_taken,
                "days_earned": calc["days_earned"],
                "days_available": calc["days_available"],
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    else:
        balance = VacationBalance(
            user_id=current_user["sub"],
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
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
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
    users = await db.users.find({}, {"_id": 0, "hashed_password": 0}).to_list(1000)
    return users


@api_router.get("/users")
async def get_users_list(current_user: dict = Depends(get_current_user)):
    """Listar usuários para seleção em formulários (requer autenticação)"""
    users = await db.users.find(
        {},
        {"_id": 0, "hashed_password": 0}
    ).to_list(1000)
    return users


@api_router.get("/admin/user/{user_id}/time-entries")
async def get_user_time_entries(user_id: str, current_user: dict = Depends(get_current_admin)):
    """Get all time entries for a specific user (admin only)"""
    entries = await db.time_entries.find({"user_id": user_id}, {"_id": 0}).sort("date", -1).to_list(1000)
    return entries

@api_router.get("/admin/time-entries/user/{user_id}")
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
            except:
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

@api_router.put("/admin/time-entries/{entry_id}")
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
        start = datetime.fromisoformat(update_data["start_time"].replace("Z", ""))
        end = datetime.fromisoformat(update_data["end_time"].replace("Z", ""))
        total_seconds = (end - start).total_seconds()
        update_data["total_hours"] = total_seconds / 3600
    
    # Update entry
    await db.time_entries.update_one(
        {"id": entry_id},
        {"$set": update_data}
    )
    
    logging.info(f"Admin {current_user['sub']} updated time entry {entry_id}")
    
    return {"message": "Entrada atualizada com sucesso"}

@api_router.delete("/admin/time-entries/{entry_id}")
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

@api_router.post("/admin/time-entries")
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
    start_time = datetime.fromisoformat(entry_data["start_time"].replace("Z", ""))
    end_time = datetime.fromisoformat(entry_data["end_time"].replace("Z", ""))
    
    # Calculate total hours
    total_seconds = (end_time - start_time).total_seconds()
    total_hours = total_seconds / 3600
    
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
    
    if update_data.is_admin is not None:
        update_dict["is_admin"] = update_data.is_admin
    
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
    
    # If approved, update days taken
    if approved:
        await db.vacation_balances.update_one(
            {"user_id": vac_request["user_id"]},
            {"$inc": {"days_taken": vac_request["days_requested"]}}
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
    now = datetime.now(timezone.utc)
    
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
        user_stats[user_id]["total_hours"] += entry.get("total_hours", 0)
        user_stats[user_id]["regular_hours"] += entry.get("regular_hours", 0)
        user_stats[user_id]["overtime_hours"] += entry.get("overtime_hours", 0)
        user_stats[user_id]["days_worked"] += 1
    
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
    now = datetime.now(timezone.utc)
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
    """Criar serviço e OT associada automaticamente"""
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
        "message": "Serviço e OT criados com sucesso",
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
    """Get calendar data including services, vacations, and OTs for a specific month"""
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
    
    for rel in relatorios:
        rel_id = rel.get("id")
        data_servico = rel.get("data_servico", "")
        data_fim = rel.get("data_fim")
        numero_ot = rel.get("numero_assistencia")
        cliente_nome = rel.get("cliente_nome", "")
        motivo = rel.get("motivo_assistencia", "")
        local = rel.get("local_intervencao", "")
        status = rel.get("status", "em_execucao")
        
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
                        "data_fim": data_fim
                    })
                current += timedelta(days=1)
        else:
            # Sem data_fim - buscar datas das intervenções
            intervencoes = await db.intervencoes_relatorio.find({
                "relatorio_id": rel_id
            }, {"_id": 0, "data": 1}).to_list(100)
            
            # Coletar datas únicas das intervenções
            datas_intervencoes = set()
            for interv in intervencoes:
                data_interv = interv.get("data")
                if data_interv:
                    try:
                        # Pode ser string ou date
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
                        "data_fim": None
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
    
    if tipo not in ["trabalho", "viagem"]:
        raise HTTPException(status_code=400, detail="Tipo deve ser 'trabalho' ou 'viagem'")
    
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
        hora_inicio=datetime.now(timezone.utc),
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
    hora_fim = datetime.now(timezone.utc)
    hora_inicio = datetime.fromisoformat(cronometro["hora_inicio"])
    
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
    
    # Criar registos
    registos_criados = []
    for seg in segmentos:
        km_segmento = 0 if tipo == "viagem" else km_ot
        
        registo = RegistoTecnicoOT(
            relatorio_id=relatorio_id,
            tecnico_id=tecnico_id,
            tecnico_nome=cronometro["tecnico_nome"],
            tipo=tipo,
            data=seg["data"],
            hora_inicio_segmento=seg["hora_inicio_segmento"],
            hora_fim_segmento=seg["hora_fim_segmento"],
            horas_arredondadas=seg["horas_arredondadas"],
            km=km_segmento,
            codigo=seg["codigo"]
        )
        
        registo_dict = registo.dict()
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
        horas_arredondadas = arredondar_horas(duracao_minutos)
        
        registo = {
            "id": str(uuid.uuid4()),
            "relatorio_id": relatorio_id,
            "tecnico_id": tecnico_id,
            "tecnico_nome": tecnico_nome,
            "tipo": tipo,
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
        primeiro["horas_arredondadas"] = arredondar_horas(primeiro["duracao_minutos"])
    
    registos_criados = []
    for i, seg in enumerate(segmentos):
        registo = {
            "id": str(uuid.uuid4()),
            "relatorio_id": relatorio_id,
            "tecnico_id": tecnico_id,
            "tecnico_nome": tecnico_nome,
            "tipo": tipo,
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
            horas_arredondadas = arredondar_horas(duracao_minutos)
            
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
        update_data["minutos_trabalhados"] = registo_data["minutos_trabalhados"]
        update_data["horas_arredondadas"] = registo_data["minutos_trabalhados"] / 60
    if "horas_arredondadas" in registo_data and "hora_inicio" not in registo_data:
        update_data["horas_arredondadas"] = registo_data["horas_arredondadas"]
        update_data["minutos_trabalhados"] = int(registo_data["horas_arredondadas"] * 60)
    if "km" in registo_data:
        update_data["km"] = registo_data["km"]
    if "codigo" in registo_data and "hora_inicio" not in registo_data:
        update_data["codigo"] = registo_data["codigo"]
    if "tipo" in registo_data:
        update_data["tipo"] = registo_data["tipo"]
    
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
                # Adicionou pausa - desconta 60 min
                update_data["minutos_trabalhados"] = max(0, current_mins - 60)
                update_data["horas_arredondadas"] = max(0, current_mins - 60) / 60
            elif not new_pausa and old_pausa:
                # Removeu pausa - adiciona 60 min
                update_data["minutos_trabalhados"] = current_mins + 60
                update_data["horas_arredondadas"] = (current_mins + 60) / 60
    
    if update_data:
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
        raise HTTPException(status_code=404, detail="OT não encontrada")
    
    # Validar quantidade
    quantidade = material_data.get("quantidade", 0)
    if quantidade <= 0:
        raise HTTPException(status_code=400, detail="Quantidade deve ser maior que zero")
    
    # Criar material
    material = MaterialOT(
        relatorio_id=relatorio_id,
        descricao=material_data["descricao"],
        quantidade=quantidade,
        fornecido_por=material_data["fornecido_por"],
        data_utilizacao=material_data.get("data_utilizacao")
    )
    
    material_dict = material.dict()
    material_dict["created_at"] = material_dict["created_at"].isoformat()
    
    # Se fornecido_por = "Cotação", criar/atualizar PC automaticamente
    if material_data["fornecido_por"] == "Cotação":
        # Buscar PC existente para esta OT com status "Em Espera"
        pc_existente = await db.pedidos_cotacao.find_one({
            "relatorio_id": relatorio_id,
            "status": "Em Espera"
        }, {"_id": 0})
        
        if pc_existente:
            # Usar PC existente
            material_dict["pc_id"] = pc_existente["id"]
            logging.info(f"Material associado ao PC existente {pc_existente['numero_pc']}")
        else:
            # Criar novo PC
            # Gerar número único de PC
            last_pc = await db.pedidos_cotacao.find_one({}, {"_id": 0}, sort=[("numero_pc", -1)])
            if last_pc and last_pc.get("numero_pc"):
                # Extrair número do último PC
                ultimo_num = int(last_pc["numero_pc"].split("-")[1])
                novo_num = ultimo_num + 1
            else:
                novo_num = 1
            
            numero_pc = f"PC-{novo_num:03d}"
            
            novo_pc = PedidoCotacao(
                numero_pc=numero_pc,
                relatorio_id=relatorio_id,
                status="Em Espera",
                created_by=current_user["sub"]
            )
            
            pc_dict = novo_pc.dict()
            pc_dict["created_at"] = pc_dict["created_at"].isoformat()
            await db.pedidos_cotacao.insert_one(pc_dict)
            
            material_dict["pc_id"] = novo_pc.id
            logging.info(f"PC criado automaticamente: {numero_pc} para OT {relatorio_id}")
            
            # Notificar admins sobre novo PC
            await send_push_to_admins(
                db,
                f"📋 Novo Pedido de Cotação",
                f"{numero_pc} criado para OT {relatorio_id}\nMaterial: {material_data.get('descricao', 'N/A')[:50]}",
                "pc_created",
                "medium"
            )
    
    await db.materiais_ot.insert_one(material_dict)
    
    return material

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
    if "quantidade" in material_data and material_data["quantidade"] <= 0:
        raise HTTPException(status_code=400, detail="Quantidade deve ser maior que zero")
    
    material = await db.materiais_ot.find_one({"id": material_id, "relatorio_id": relatorio_id})
    if not material:
        raise HTTPException(status_code=404, detail="Material não encontrado")
    
    # Se mudou para "Cotação", associar ou criar PC
    if material_data.get("fornecido_por") == "Cotação" and material.get("fornecido_por") != "Cotação":
        pc_existente = await db.pedidos_cotacao.find_one({
            "relatorio_id": relatorio_id,
            "status": "Em Espera"
        }, {"_id": 0})
        
        if pc_existente:
            material_data["pc_id"] = pc_existente["id"]
        else:
            # Criar novo PC
            last_pc = await db.pedidos_cotacao.find_one({}, {"_id": 0}, sort=[("numero_pc", -1)])
            if last_pc and last_pc.get("numero_pc"):
                ultimo_num = int(last_pc["numero_pc"].split("-")[1])
                novo_num = ultimo_num + 1
            else:
                novo_num = 1
            
            numero_pc = f"PC-{novo_num:03d}"
            
            novo_pc = PedidoCotacao(
                numero_pc=numero_pc,
                relatorio_id=relatorio_id,
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


# ============ Despesas OT Routes ============

@api_router.post("/relatorios-tecnicos/{relatorio_id}/despesas")
async def create_despesa_ot(
    relatorio_id: str,
    despesa_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Criar nova despesa para uma OT"""
    from notifications_scheduler import send_push_notification
    
    # Validar campos obrigatórios
    if not despesa_data.get("descricao"):
        raise HTTPException(status_code=400, detail="Descrição é obrigatória")
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
    tecnico_nome = tecnico.get("nome", tecnico.get("username", "Desconhecido")) if tecnico else despesa_data.get("tecnico_nome", "Desconhecido")
    
    # Criar despesa
    tipo_despesa = despesa_data.get("tipo", "outras")
    if tipo_despesa not in ["outras", "combustivel", "ferramentas", "portagens"]:
        tipo_despesa = "outras"
    
    despesa = DespesaOT(
        relatorio_id=relatorio_id,
        tipo=tipo_despesa,
        descricao=despesa_data["descricao"],
        valor=float(despesa_data["valor"]),
        tecnico_id=despesa_data["tecnico_id"],
        tecnico_nome=tecnico_nome,
        data=despesa_data["data"],
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


# ============ Pedidos de Cotação Routes ============

@api_router.get("/pedidos-cotacao")
async def get_all_pedidos_cotacao(
    current_user: dict = Depends(get_current_user)
):
    """Listar TODOS os PCs do sistema"""
    pcs = await db.pedidos_cotacao.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).to_list(length=None)
    
    # Enriquecer com informações da OT
    for pc in pcs:
        ot = await db.relatorios_tecnicos.find_one({"id": pc["relatorio_id"]}, {"_id": 0})
        if ot:
            pc["ot_numero"] = ot.get("numero_assistencia", "N/A")
            pc["cliente_nome"] = ot.get("cliente_nome", "N/A")
        
        # Contar materiais associados
        materiais_count = await db.materiais_ot.count_documents({"pc_id": pc["id"]})
        pc["materiais_count"] = materiais_count
    
    return pcs

@api_router.get("/relatorios-tecnicos/{relatorio_id}/pedidos-cotacao")
async def get_pedidos_cotacao_ot(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar PCs de uma OT"""
    pcs = await db.pedidos_cotacao.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(length=None)
    
    return pcs

@api_router.get("/pedidos-cotacao/{pc_id}")
async def get_pedido_cotacao(
    pc_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obter detalhes de um PC"""
    pc = await db.pedidos_cotacao.find_one({"id": pc_id}, {"_id": 0})
    
    if not pc:
        raise HTTPException(status_code=404, detail="PC não encontrado")
    
    # Buscar OT associada para obter dados do cliente e máquina
    ot = await db.relatorios_tecnicos.find_one({"id": pc.get("relatorio_id")}, {"_id": 0})
    if ot:
        pc["numero_ot"] = ot.get("numero_assistencia", "N/A")
        pc["cliente_nome"] = ot.get("cliente_nome", "N/A")
        pc["equipamento_tipologia"] = ot.get("equipamento_tipologia")
        pc["equipamento_marca"] = ot.get("equipamento_marca")
        pc["equipamento_modelo"] = ot.get("equipamento_modelo")
        pc["equipamento_numero_serie"] = ot.get("equipamento_numero_serie")
    
    # Buscar materiais associados
    materiais = await db.materiais_ot.find(
        {"pc_id": pc_id},
        {"_id": 0}
    ).to_list(length=None)
    
    pc["materiais"] = materiais
    
    # Buscar fotografias do PC
    fotos = await db.fotos_pc.find(
        {"pc_id": pc_id},
        {"_id": 0}
    ).sort("uploaded_at", -1).to_list(length=None)
    
    for foto in fotos:
        if "foto_url" not in foto:
            foto["foto_url"] = f"/pedidos-cotacao/{pc_id}/fotografias/{foto['id']}/image"
    
    pc["fotografias"] = fotos
    
    return pc

@api_router.put("/pedidos-cotacao/{pc_id}")
async def update_pedido_cotacao(
    pc_id: str,
    pc_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar PC (qualquer utilizador pode editar)"""
    pc = await db.pedidos_cotacao.find_one({"id": pc_id})
    
    if not pc:
        raise HTTPException(status_code=404, detail="PC não encontrado")
    
    update_data = {k: v for k, v in pc_data.items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.pedidos_cotacao.update_one(
        {"id": pc_id},
        {"$set": update_data}
    )
    
    return {"message": "PC atualizado"}

@api_router.delete("/pedidos-cotacao/{pc_id}")
async def delete_pedido_cotacao(
    pc_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Eliminar um PC e todos os dados associados"""
    # Verificar se PC existe
    pc = await db.pedidos_cotacao.find_one({"id": pc_id})
    if not pc:
        raise HTTPException(status_code=404, detail="PC não encontrado")
    
    # Eliminar fotografias do PC
    await db.fotos_pc.delete_many({"pc_id": pc_id})
    
    # Eliminar faturas do PC
    await db.faturas_pc.delete_many({"pc_id": pc_id})
    
    # Atualizar materiais para remover referência ao PC
    await db.materiais_ot.update_many(
        {"pc_id": pc_id},
        {"$unset": {"pc_id": ""}}
    )
    
    # Eliminar o PC
    await db.pedidos_cotacao.delete_one({"id": pc_id})
    
    return {"message": "PC eliminado com sucesso"}

@api_router.post("/pedidos-cotacao/{pc_id}/fotografias")
async def add_fotografia_pc(
    pc_id: str,
    file: UploadFile = File(...),
    descricao: str = Form(""),
    current_user: dict = Depends(get_current_user)
):
    """Adicionar fotografia a um PC"""
    try:
        contents = await file.read()
        
        import base64
        foto_base64 = base64.b64encode(contents).decode('utf-8')
        
        foto_id = str(uuid.uuid4())
        foto_doc = {
            "id": foto_id,
            "pc_id": pc_id,
            "foto_base64": foto_base64,
            "descricao": descricao,
            "filename": file.filename,
            "content_type": file.content_type,
            "uploaded_at": datetime.now(timezone.utc),
            "uploaded_by": current_user["sub"]
        }
        
        await db.fotos_pc.insert_one(foto_doc)
        
        return {
            "id": foto_id,
            "pc_id": pc_id,
            "descricao": descricao,
            "foto_url": f"/pedidos-cotacao/{pc_id}/fotografias/{foto_id}/image",
            "uploaded_at": foto_doc["uploaded_at"]
        }
    except Exception as e:
        logging.error(f"Erro ao fazer upload de fotografia: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao fazer upload: {str(e)}")

@api_router.get("/pedidos-cotacao/{pc_id}/fotografias")
async def get_fotografias_pc(
    pc_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar fotografias de um PC"""
    fotografias = await db.fotos_pc.find(
        {"pc_id": pc_id},
        {"_id": 0}
    ).sort("uploaded_at", -1).to_list(length=None)
    
    for foto in fotografias:
        if "foto_url" not in foto:
            foto["foto_url"] = f"/pedidos-cotacao/{pc_id}/fotografias/{foto['id']}/image"
    
    return fotografias

@api_router.get("/pedidos-cotacao/{pc_id}/fotografias/{foto_id}/image")
async def get_fotografia_pc_image(
    pc_id: str,
    foto_id: str
):
    """Obter imagem da fotografia de um PC"""
    foto = await db.fotos_pc.find_one({
        "id": foto_id,
        "pc_id": pc_id
    }, {"_id": 0})
    
    if not foto:
        raise HTTPException(status_code=404, detail="Fotografia não encontrada")
    
    if not foto.get("foto_base64"):
        raise HTTPException(status_code=404, detail="Imagem não disponível")
    
    import base64
    foto_bytes = base64.b64decode(foto["foto_base64"])
    
    from fastapi.responses import Response
    return Response(
        content=foto_bytes,
        media_type=foto.get("content_type", "image/jpeg")
    )

@api_router.delete("/pedidos-cotacao/{pc_id}/fotografias/{foto_id}")
async def delete_fotografia_pc(
    pc_id: str,
    foto_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remover fotografia de um PC"""
    foto = await db.fotos_pc.find_one({"id": foto_id, "pc_id": pc_id})
    
    if not foto:
        raise HTTPException(status_code=404, detail="Fotografia não encontrada")
    
    await db.fotos_pc.delete_one({"id": foto_id})
    
    return {"message": "Fotografia removida"}

# ============ Faturas PC Endpoints ============

@api_router.post("/pedidos-cotacao/{pc_id}/faturas")
async def upload_fatura_pc(
    pc_id: str,
    file: UploadFile = File(...),
    descricao: str = Form(""),
    current_user: dict = Depends(get_current_user)
):
    """Upload de fatura para um PC"""
    # Verificar se PC existe
    pc = await db.pedidos_cotacao.find_one({"id": pc_id})
    if not pc:
        raise HTTPException(status_code=404, detail="PC não encontrado")
    
    # Ler conteúdo do arquivo
    content = await file.read()
    
    # Converter para base64
    import base64
    file_base64 = base64.b64encode(content).decode('utf-8')
    
    # Determinar tipo de arquivo
    content_type = file.content_type or 'application/octet-stream'
    
    fatura_id = str(uuid.uuid4())
    fatura = {
        "id": fatura_id,
        "pc_id": pc_id,
        "nome_ficheiro": file.filename,
        "descricao": descricao,
        "content_type": content_type,
        "file_base64": file_base64,
        "file_size": len(content),
        "uploaded_by": current_user.get("username", ""),
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.faturas_pc.insert_one(fatura)
    
    return {
        "message": "Fatura carregada com sucesso",
        "id": fatura_id,
        "nome_ficheiro": file.filename,
        "fatura_url": f"/pedidos-cotacao/{pc_id}/faturas/{fatura_id}/file"
    }

@api_router.get("/pedidos-cotacao/{pc_id}/faturas")
async def get_faturas_pc(
    pc_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar faturas de um PC"""
    faturas = await db.faturas_pc.find(
        {"pc_id": pc_id},
        {"_id": 0, "file_base64": 0}  # Não incluir o conteúdo na listagem
    ).to_list(100)
    
    for fatura in faturas:
        fatura["fatura_url"] = f"/pedidos-cotacao/{pc_id}/faturas/{fatura['id']}/file"
    
    return faturas

@api_router.get("/pedidos-cotacao/{pc_id}/faturas/{fatura_id}/file")
async def get_fatura_file(
    pc_id: str,
    fatura_id: str
):
    """Obter arquivo da fatura"""
    fatura = await db.faturas_pc.find_one({"id": fatura_id, "pc_id": pc_id})
    
    if not fatura:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")
    
    import base64
    from fastapi.responses import Response
    
    file_bytes = base64.b64decode(fatura["file_base64"])
    
    return Response(
        content=file_bytes,
        media_type=fatura.get("content_type", "application/octet-stream"),
        headers={
            "Content-Disposition": f"inline; filename=\"{fatura.get('nome_ficheiro', 'fatura')}\""
        }
    )

@api_router.delete("/pedidos-cotacao/{pc_id}/faturas/{fatura_id}")
async def delete_fatura_pc(
    pc_id: str,
    fatura_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remover fatura de um PC"""
    fatura = await db.faturas_pc.find_one({"id": fatura_id, "pc_id": pc_id})
    
    if not fatura:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")
    
    await db.faturas_pc.delete_one({"id": fatura_id})
    
    return {"message": "Fatura removida"}

@api_router.get("/pedidos-cotacao/{pc_id}/preview-pdf")
async def preview_pdf_pc(
    pc_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Gerar preview do PDF do PC"""
    # Buscar PC
    pc = await db.pedidos_cotacao.find_one({"id": pc_id}, {"_id": 0})
    if not pc:
        raise HTTPException(status_code=404, detail="PC não encontrado")
    
    # Buscar OT associada
    ot = await db.relatorios_tecnicos.find_one({"id": pc["relatorio_id"]}, {"_id": 0})
    if not ot:
        raise HTTPException(status_code=404, detail="OT não encontrada")
    
    # Buscar materiais do PC
    materiais = await db.materiais_ot.find(
        {"pc_id": pc_id},
        {"_id": 0}
    ).to_list(length=None)
    
    # Buscar fotografias do PC
    fotografias = await db.fotos_pc.find(
        {"pc_id": pc_id},
        {"_id": 0}
    ).to_list(length=None)
    
    # Gerar PDF
    pdf_buffer = generate_pc_pdf(pc, ot, materiais, fotografias)
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=PC_{pc['numero_pc']}.pdf"}
    )

@api_router.post("/pedidos-cotacao/{pc_id}/send-email")
async def send_email_pc(
    pc_id: str,
    email_destinatario: str,
    current_user: dict = Depends(get_current_user)
):
    """Enviar PDF do PC por email"""
    # Validar email
    emails_validos = ["geral@hwi.pt", "pedro.duarte@hwi.pt", "miguel.moreira@hwi.pt"]
    if email_destinatario not in emails_validos:
        raise HTTPException(status_code=400, detail="Email não autorizado")
    
    # Buscar PC
    pc = await db.pedidos_cotacao.find_one({"id": pc_id}, {"_id": 0})
    if not pc:
        raise HTTPException(status_code=404, detail="PC não encontrado")
    
    # Buscar OT associada
    ot = await db.relatorios_tecnicos.find_one({"id": pc["relatorio_id"]}, {"_id": 0})
    if not ot:
        raise HTTPException(status_code=404, detail="OT não encontrada")
    
    # Buscar materiais e fotografias
    materiais = await db.materiais_ot.find(
        {"pc_id": pc_id},
        {"_id": 0}
    ).to_list(length=None)
    
    fotografias = await db.fotos_pc.find(
        {"pc_id": pc_id},
        {"_id": 0}
    ).to_list(length=None)
    
    # Gerar PDF
    pdf_buffer = generate_pc_pdf(pc, ot, materiais, fotografias)
    
    # Enviar email
    try:
        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText
        from email.mime.application import MIMEApplication
        
        # Configurações SMTP do ambiente
        smtp_server = os.environ.get('SMTP_HOST')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_user = os.environ.get('SMTP_USER')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        smtp_from = os.environ.get('SMTP_FROM', 'geral@hwi.pt')
        
        msg = MIMEMultipart()
        msg['From'] = smtp_from
        msg['To'] = email_destinatario
        msg['Subject'] = f"Pedido de Cotação {pc['numero_pc']} - OT #{ot.get('numero_assistencia', 'N/A')}"
        
        body = f"""
        <html>
        <body style="font-family: Arial, sans-serif;">
            <h2>Pedido de Cotação</h2>
            <p>Segue em anexo o Pedido de Cotação <b>{pc['numero_pc']}</b> referente à Ordem de Trabalho <b>#{ot.get('numero_assistencia', 'N/A')}</b>.</p>
            <p><b>Cliente:</b> {ot.get('cliente_nome', 'N/A')}</p>
            <p><b>Status:</b> {pc.get('status', 'Em Espera')}</p>
            <hr>
            <p style="color: #666; font-size: 12px;">Este é um email automático. Por favor, não responda.</p>
            <p style="color: #666; font-size: 12px;">HWI Unipessoal, Lda.</p>
        </body>
        </html>
        """
        
        msg.attach(MIMEText(body, 'html'))
        
        # Anexar PDF
        pdf_attachment = MIMEApplication(pdf_buffer.read(), _subtype="pdf")
        pdf_attachment.add_header('Content-Disposition', 'attachment', filename=f"PC_{pc['numero_pc']}.pdf")
        msg.attach(pdf_attachment)
        
        # Enviar
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
        
        logging.info(f"Email enviado para {email_destinatario}: PC {pc['numero_pc']}")
        
        return {"message": f"Email enviado com sucesso para {email_destinatario}"}
        
    except Exception as e:
        logging.error(f"Erro ao enviar email: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao enviar email: {str(e)}")

# ============ Company Info Routes ============

@api_router.get("/company-info")
async def get_company_info():
    """Get company information (public)"""
    company_info = await db.company_info.find_one({"id": "company_info_default"}, {"_id": 0})
    
    if not company_info:
        # Retornar valores padrão se não existir
        default_info = CompanyInfo()
        return default_info.dict()
    
    return company_info

@api_router.put("/company-info")
async def update_company_info(
    company_data: CompanyInfo,
    current_user: dict = Depends(get_current_admin)
):
    """Update company information (admin only)"""
    # Adicionar metadados de atualização
    update_dict = company_data.dict()
    update_dict["updated_at"] = datetime.now(timezone.utc)
    update_dict["updated_by"] = current_user["sub"]
    
    # Upsert (insert ou update)
    await db.company_info.update_one(
        {"id": "company_info_default"},
        {"$set": update_dict},
        upsert=True
    )
    
    logging.info(f"Informações da empresa atualizadas por {current_user['sub']}")
    
    return {"message": "Informações da empresa atualizadas com sucesso"}


@api_router.post("/company-info/logo")
async def upload_company_logo(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_admin)
):
    """Upload logo da empresa (admin only)"""
    # Validar tipo de ficheiro
    allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Tipo de ficheiro não permitido. Use PNG, JPEG ou WebP.")
    
    # Gerar nome único para o ficheiro
    file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'png'
    unique_filename = f"company_logo_{uuid.uuid4()}.{file_extension}"
    file_path = f"/app/uploads/{unique_filename}"
    
    # Guardar ficheiro
    try:
        contents = await file.read()
        with open(file_path, 'wb') as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao guardar ficheiro: {str(e)}")
    
    # Actualizar company_info com o novo logo
    logo_url = f"/uploads/{unique_filename}"
    await db.company_info.update_one(
        {"id": "company_info_default"},
        {
            "$set": {
                "logo_url": logo_url,
                "updated_at": datetime.now(timezone.utc),
                "updated_by": current_user["sub"]
            }
        },
        upsert=True
    )
    
    logging.info(f"Logo da empresa actualizado por {current_user['sub']}: {logo_url}")
    
    return {"message": "Logo actualizado com sucesso", "logo_url": logo_url}


# ============ Tabelas de Preço Routes ============

@api_router.get("/tabelas-preco")
async def get_tabelas_preco(current_user: dict = Depends(get_current_user)):
    """Obter configurações das 3 tabelas de preço"""
    configs = await db.tabelas_preco.find({}, {"_id": 0}).to_list(length=None)
    
    # Garantir que existem as 3 tabelas com valores default
    existing_ids = {c.get("table_id") for c in configs}
    default_configs = []
    
    for table_id in [1, 2, 3]:
        if table_id not in existing_ids:
            default_config = TabelaPrecoConfig(
                table_id=table_id,
                valor_km=0.65,
                nome=f"Tabela {table_id}"
            )
            config_dict = default_config.model_dump()
            config_dict["created_at"] = config_dict["created_at"].isoformat()
            await db.tabelas_preco.insert_one(config_dict)
            config_dict.pop("_id", None)
            default_configs.append(config_dict)
    
    # Re-fetch todas as configs
    configs = await db.tabelas_preco.find({}, {"_id": 0}).sort("table_id", 1).to_list(length=None)
    return configs


@api_router.put("/tabelas-preco/{table_id}")
async def update_tabela_preco(
    table_id: int,
    config_data: TabelaPrecoConfigUpdate,
    current_user: dict = Depends(get_current_admin)
):
    """Atualizar configuração de uma tabela de preço (admin only)"""
    if table_id not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="ID de tabela inválido. Use 1, 2 ou 3.")
    
    existing = await db.tabelas_preco.find_one({"table_id": table_id})
    
    update_data = {k: v for k, v in config_data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    if existing:
        await db.tabelas_preco.update_one(
            {"table_id": table_id},
            {"$set": update_data}
        )
    else:
        # Criar nova config se não existir
        new_config = TabelaPrecoConfig(
            table_id=table_id,
            valor_km=config_data.valor_km or 0.65,
            nome=config_data.nome or f"Tabela {table_id}"
        )
        config_dict = new_config.model_dump()
        config_dict["created_at"] = config_dict["created_at"].isoformat()
        config_dict.update(update_data)
        await db.tabelas_preco.insert_one(config_dict)
    
    updated = await db.tabelas_preco.find_one({"table_id": table_id}, {"_id": 0})
    logging.info(f"Tabela de Preço {table_id} atualizada por {current_user['sub']}")
    return updated


# ============ Tarifas Routes ============

@api_router.get("/tarifas")
async def get_tarifas(
    table_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """Listar todas as tarifas ativas - filtradas opcionalmente por tabela de preço"""
    query = {"ativo": True}
    if table_id is not None:
        # Para table_id=1, incluir tarifas sem table_id (migração) ou com table_id=1
        if table_id == 1:
            query["$or"] = [
                {"table_id": 1},
                {"table_id": {"$exists": False}}
            ]
        else:
            query["table_id"] = table_id
    
    tarifas = await db.tarifas.find(
        query,
        {"_id": 0}
    ).sort("nome", 1).to_list(length=None)
    
    # Adicionar table_id default se não existir (migração)
    for t in tarifas:
        if "table_id" not in t:
            t["table_id"] = 1
    
    return tarifas


@api_router.get("/tarifas/all")
async def get_all_tarifas(
    table_id: Optional[int] = None,
    current_user: dict = Depends(get_current_admin)
):
    """Listar todas as tarifas (admin only) - filtradas opcionalmente por tabela de preço"""
    query = {}
    if table_id is not None:
        query["table_id"] = table_id
    
    tarifas = await db.tarifas.find(
        query,
        {"_id": 0}
    ).sort("nome", 1).to_list(length=None)
    
    # Adicionar table_id default se não existir (migração)
    for t in tarifas:
        if "table_id" not in t:
            t["table_id"] = 1
    
    return tarifas


@api_router.post("/tarifas")
async def create_tarifa(
    tarifa_data: TarifaCreate,
    current_user: dict = Depends(get_current_admin)
):
    """Criar nova tarifa (admin only) - permite nomes duplicados"""
    # Validar table_id
    if tarifa_data.table_id not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="ID de tabela inválido. Use 1, 2 ou 3.")
    
    # Validar tipo_registo
    if tarifa_data.tipo_registo and tarifa_data.tipo_registo not in ["trabalho", "viagem"]:
        raise HTTPException(status_code=400, detail="Tipo de registo inválido. Use 'trabalho', 'viagem' ou deixe vazio.")
    
    tarifa = Tarifa(
        numero=tarifa_data.numero,
        nome=tarifa_data.nome,
        valor_por_hora=tarifa_data.valor_por_hora,
        codigo=tarifa_data.codigo,
        tipo_registo=tarifa_data.tipo_registo,
        table_id=tarifa_data.table_id
    )
    
    tarifa_dict = tarifa.model_dump()
    tarifa_dict["created_at"] = tarifa_dict["created_at"].isoformat()
    
    await db.tarifas.insert_one(tarifa_dict)
    tarifa_dict.pop("_id", None)
    
    logging.info(f"Tarifa criada: {tarifa.nome} - €{tarifa.valor_por_hora}/h - Código: {tarifa.codigo} - Tipo: {tarifa.tipo_registo} - Tabela: {tarifa.table_id} por {current_user['sub']}")
    
    return tarifa_dict


@api_router.put("/tarifas/{tarifa_id}")
async def update_tarifa(
    tarifa_id: str,
    tarifa_data: TarifaUpdate,
    current_user: dict = Depends(get_current_admin)
):
    """Atualizar tarifa (admin only)"""
    existing = await db.tarifas.find_one({"id": tarifa_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Tarifa não encontrada")
    
    update_data = {k: v for k, v in tarifa_data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum dado para atualizar")
    
    # Se está a mudar o número, verificar se já existe
    if "numero" in update_data and update_data["numero"] != existing.get("numero"):
        existing_numero = await db.tarifas.find_one({
            "numero": update_data["numero"], 
            "ativo": True,
            "id": {"$ne": tarifa_id}
        })
        if existing_numero:
            raise HTTPException(status_code=400, detail=f"Já existe uma tarifa com o número {update_data['numero']}")
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.tarifas.update_one(
        {"id": tarifa_id},
        {"$set": update_data}
    )
    
    updated = await db.tarifas.find_one({"id": tarifa_id}, {"_id": 0})
    
    logging.info(f"Tarifa atualizada: {tarifa_id} por {current_user['sub']}")
    
    return updated


@api_router.delete("/tarifas/{tarifa_id}")
async def delete_tarifa(
    tarifa_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """Desativar tarifa (admin only)"""
    existing = await db.tarifas.find_one({"id": tarifa_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Tarifa não encontrada")
    
    await db.tarifas.update_one(
        {"id": tarifa_id},
        {"$set": {"ativo": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    logging.info(f"Tarifa desativada: {tarifa_id} por {current_user['sub']}")
    
    return {"message": "Tarifa desativada com sucesso"}


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
    # Para técnicos manuais, usamos o 'id' do registo como identificador único
    # Para cronómetros, usamos o 'tecnico_id'
    tecnicos_unicos = {}
    for tec in tecnicos:
        # Para registos manuais, usar o 'id' do registo como chave
        tid = tec.get('id')
        if tid and tid not in tecnicos_unicos:
            tecnicos_unicos[tid] = {
                'id': tid,
                'nome': tec.get('tecnico_nome')
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
                'codigo': reg.get('codigo', '-'),
                'source': 'cronometro',
                'registo_id': reg.get('id'),
                'minutos': int((reg.get('horas_arredondadas', 0) or 0) * 60),
                'km': reg.get('km', 0)
            })
    
    for tec in tecnicos:
        # Para registos manuais, usar o tecnico_id do registo
        tid = tec.get('tecnico_id') or tec.get('id')
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
                'tecnico_nome': tec.get('tecnico_nome'),
                'data': data,
                'tipo': tec.get('tipo_registo', 'manual'),
                'codigo': codigo_map.get(tec.get('tipo_horario', ''), '-'),
                'source': 'manual',
                'registo_id': tec.get('id'),
                'minutos': tec.get('minutos_cliente', 0),
                'km': tec.get('kms_deslocacao', 0)
            })
    
    # Ordenar registos individuais por data
    registos_individuais.sort(key=lambda x: x['data'])
    
    # Buscar despesas da OT para pré-preencher na folha de horas
    despesas = await db.despesas_ot.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).to_list(length=None)
    
    # Agrupar despesas por técnico e data, separando portagens das outras
    despesas_por_tecnico_data = {}  # Para despesas (outras, combustivel, ferramentas)
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
        else:
            # outras, combustivel, ferramentas vão para despesas
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
        "portagens_por_tecnico_data": portagens_por_tecnico_data
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
    
    # Buscar tarifas por código DA TABELA SELECIONADA
    # Excluir tarifas com código "manual" pois são apenas para seleção manual
    tarifas_db = await db.tarifas.find({
        "ativo": True, 
        "table_id": table_id,
        "codigo": {"$nin": [None, "", "manual"]}
    }, {"_id": 0}).to_list(length=None)
    
    tarifas_por_codigo = {}
    for tarifa in tarifas_db:
        if tarifa.get('codigo') and tarifa.get('codigo') != 'manual':
            tarifas_por_codigo[tarifa['codigo']] = tarifa.get('valor_por_hora', 0)
    
    # Gerar PDF com valor_km da tabela selecionada
    pdf_buffer = generate_folha_horas_pdf(
        relatorio=relatorio,
        cliente=cliente,
        registos_mao_obra=registos_mao_obra,
        tecnicos_manuais=tecnicos_manuais,
        tarifas_por_tecnico=request.tarifas_por_tecnico,
        dados_extras=request.dados_extras,
        tarifas_por_codigo=tarifas_por_codigo,
        valor_km=valor_km
    )
    
    numero_ot = relatorio.get('numero_assistencia', 'N/A')
    cliente_nome = cliente.get('nome', 'Cliente').replace(' ', '_')
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=FolhaHoras_OT{numero_ot}_{cliente_nome}.pdf"
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


# ============ Include Router ============

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
