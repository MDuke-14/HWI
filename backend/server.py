from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
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
sys.path.insert(0, str(Path(__file__).parent))
from holidays import is_overtime_day, get_holidays_for_year, get_billing_period_dates
from excel_report import generate_monthly_report
from pdf_report import generate_monthly_pdf_report
from import_excel import parse_excel_timesheet
from import_pdf import parse_pdf_timesheet

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
SECRET_KEY = os.environ.get('SECRET_KEY', 'hwi-timeclock-secret-key-2025')
ALGORITHM = "HS256"

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

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
    tipologia: str
    marca: str
    modelo: str
    numero_serie: Optional[str] = None
    ativo: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_used: Optional[datetime] = None  # Última vez usado em OT

class RelatorioTecnico(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero_assistencia: Optional[int] = None  # Auto-incrementado pelo backend
    referencia_assistencia: Optional[str] = None
    status: str = "orcamento"  # orcamento, em_execucao, concluido, facturado
    
    # Datas
    data_criacao: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    data_servico: date
    data_conclusao: Optional[datetime] = None
    
    # Relações
    cliente_id: str
    created_by_id: str
    
    # Dados do cliente (snapshot)
    cliente_nome: str
    local_intervencao: str
    pedido_por: str
    contacto_pedido: Optional[str] = None
    
    # Equipamento
    equipamento_tipologia: str
    equipamento_marca: str
    equipamento_modelo: str
    equipamento_numero_serie: Optional[str] = None
    
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
    tecnico_id: str
    tecnico_nome: str
    horas_cliente: float = 0
    kms_deslocacao: float = 0  # Será multiplicado por 2 no frontend
    tipo_horario: str  # "diurno", "noturno", "sabado", "domingo_feriado"
    data_trabalho: date  # Data em que o técnico trabalhou nesta OT
    ordem: int = 0

class IntervencaoRelatorio(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    relatorio_id: str
    data_intervencao: date
    motivo_assistencia: str
    relatorio_assistencia: Optional[str] = None
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

class RelatorioTecnicoCreate(BaseModel):
    cliente_id: str
    data_servico: date
    local_intervencao: str
    pedido_por: str
    contacto_pedido: Optional[str] = None
    equipamento_tipologia: str
    equipamento_marca: str
    equipamento_modelo: str
    equipamento_numero_serie: Optional[str] = None
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

class TimeEntryEnd(BaseModel):
    observations: Optional[str] = None

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
    service_reason: str
    technician_ids: List[str]
    date: str
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

def calculate_hours_breakdown(total_hours: float, is_special_day: bool) -> dict:
    """
    Calculate regular, overtime, and special hours based on new rules:
    - Regular hours: First 8h on regular days
    - Overtime hours: Hours above 8h on regular days
    - Special hours: All hours on weekends/holidays
    """
    if is_special_day:
        # All hours on weekends/holidays are special hours
        return {
            "regular_hours": 0.0,
            "overtime_hours": 0.0,
            "special_hours": total_hours
        }
    else:
        # Regular day: first 8h are regular, rest is overtime
        if total_hours <= 8.0:
            return {
                "regular_hours": total_hours,
                "overtime_hours": 0.0,
                "special_hours": 0.0
            }
        else:
            return {
                "regular_hours": 8.0,
                "overtime_hours": total_hours - 8.0,
                "special_hours": 0.0
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
    password_valid = verify_password(credentials.password, stored_password)
    logging.info(f"PASSWORD VALID: {password_valid}")
    
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
    
    # Gerar número de assistência (último número + 1)
    last_relatorio = await db.relatorios_tecnicos.find_one(
        {},
        sort=[("numero_assistencia", -1)]
    )
    numero_assistencia = (last_relatorio.get("numero_assistencia", 0) + 1) if last_relatorio else 1
    
    # Criar relatório
    relatorio = RelatorioTecnico(
        numero_assistencia=numero_assistencia,
        cliente_id=relatorio_data.cliente_id,
        created_by_id=current_user["sub"],
        cliente_nome=cliente["nome"],
        data_servico=relatorio_data.data_servico,
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
    
    await db.relatorios_tecnicos.insert_one(relatorio_dict)
    
    # Criar/atualizar equipamento automaticamente
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
            tipologia=relatorio_data.equipamento_tipologia,
            marca=relatorio_data.equipamento_marca,
            modelo=relatorio_data.equipamento_modelo,
            numero_serie=relatorio_data.equipamento_numero_serie,
            last_used=datetime.now(timezone.utc)
        )
        
        equipamento_dict = novo_equipamento.dict()
        equipamento_dict["created_at"] = equipamento_dict["created_at"].isoformat()
        equipamento_dict["last_used"] = equipamento_dict["last_used"].isoformat()
        
        await db.equipamentos.insert_one(equipamento_dict)
        logging.info(f"Equipamento criado automaticamente: {novo_equipamento.marca} {novo_equipamento.modelo}")
    
    # Adicionar técnico criador automaticamente
    tecnico = TecnicoRelatorio(
        relatorio_id=relatorio.id,
        tecnico_id=current_user["sub"],
        tecnico_nome=user.get("full_name", user["username"]),
        horas_cliente=0.0,
        kms_deslocacao=0.0,
        tipo_horario="diurno",
        data_trabalho=relatorio_data.data_servico,  # Data do serviço como data de trabalho inicial
        ordem=0
    )
    
    tecnico_dict = tecnico.dict()
    tecnico_dict["data_trabalho"] = tecnico_dict["data_trabalho"].isoformat()
    await db.tecnicos_relatorio.insert_one(tecnico_dict)
    
    logging.info(f"Relatório técnico criado: {numero_assistencia} por {current_user['sub']}")
    return relatorio

@api_router.get("/relatorios-tecnicos")
async def get_relatorios(
    status: Optional[str] = None,
    cliente_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Listar relatórios técnicos"""
    query = {}
    
    # Filtros opcionais
    if status:
        query["status"] = status
    if cliente_id:
        query["cliente_id"] = cliente_id
    
    # Se não for admin, mostrar apenas seus relatórios
    if not current_user.get("is_admin", False):
        query["tecnico_id"] = current_user["sub"]
    
    relatorios = await db.relatorios_tecnicos.find(
        query,
        {"_id": 0}
    ).sort("numero_assistencia", -1).to_list(1000)
    
    return relatorios

@api_router.get("/relatorios-tecnicos/{relatorio_id}", response_model=RelatorioTecnico)
async def get_relatorio(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obter relatório técnico específico"""
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Verificar permissão (admin ou técnico do relatório)
    if not current_user.get("is_admin", False) and relatorio["tecnico_id"] != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Sem permissão para ver este relatório")
    
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
    status: str,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar status do relatório"""
    valid_status = ["rascunho", "em_andamento", "concluido", "enviado"]
    if status not in valid_status:
        raise HTTPException(status_code=400, detail=f"Status inválido. Use: {', '.join(valid_status)}")
    
    existing = await db.relatorios_tecnicos.find_one({"id": relatorio_id})
    
    if not existing:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Verificar permissão
    if not current_user.get("is_admin", False) and existing["tecnico_id"] != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Sem permissão")
    
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
    
    # Buscar técnicos ordenados
    tecnicos = await db.tecnicos_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("ordem", 1).to_list(100)
    
    return tecnicos

@api_router.post("/relatorios-tecnicos/{relatorio_id}/tecnicos")
async def add_tecnico_relatorio(
    relatorio_id: str,
    tecnico_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Adicionar técnico a um relatório"""
    # Verificar se relatório existe
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Contar técnicos existentes para ordem
    count = await db.tecnicos_relatorio.count_documents({"relatorio_id": relatorio_id})
    
    # Criar técnico
    tecnico = TecnicoRelatorio(
        relatorio_id=relatorio_id,
        tecnico_id="",  # Se não tiver user_id
        tecnico_nome=tecnico_data.get("tecnico_nome", ""),
        horas_cliente=tecnico_data.get("horas_cliente", 0),
        kms_deslocacao=tecnico_data.get("kms_deslocacao", 0),
        tipo_horario=tecnico_data.get("tipo_horario", "diurno"),
        data_trabalho=tecnico_data.get("data_trabalho", datetime.now(timezone.utc).date()),
        ordem=count
    )
    
    tecnico_dict = tecnico.dict()
    # Converter data para string ISO
    if isinstance(tecnico_dict.get("data_trabalho"), date):
        tecnico_dict["data_trabalho"] = tecnico_dict["data_trabalho"].isoformat()
    await db.tecnicos_relatorio.insert_one(tecnico_dict)
    
    logging.info(f"Técnico adicionado ao relatório {relatorio_id}: {tecnico_data.get('tecnico_nome')}")
    
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
    if "horas_cliente" in tecnico_data:
        update_data["horas_cliente"] = tecnico_data["horas_cliente"]
    if "kms_deslocacao" in tecnico_data:
        update_data["kms_deslocacao"] = tecnico_data["kms_deslocacao"]
    if "tipo_horario" in tecnico_data:
        update_data["tipo_horario"] = tecnico_data["tipo_horario"]
    if "data_trabalho" in tecnico_data:
        # Converter para string ISO se necessário
        if isinstance(tecnico_data["data_trabalho"], str):
            update_data["data_trabalho"] = tecnico_data["data_trabalho"]
        else:
            update_data["data_trabalho"] = tecnico_data["data_trabalho"].isoformat()
    
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

# ============ Time Entry Routes ============

@api_router.post("/time-entries/start")
async def start_time_entry(entry_data: TimeEntryStart, current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Check if there's already an active (not completed) entry for this user
    existing_active = await db.time_entries.find_one({
        "user_id": current_user["sub"],
        "status": "active"
    }, {"_id": 0})
    
    if existing_active:
        raise HTTPException(status_code=400, detail="Por favor finalize o registo anterior antes de iniciar um novo")
    
    # Check if today is overtime day
    today_date = datetime.now(timezone.utc).date()
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
        outside_residence_zone=entry_data.outside_residence_zone or False,
        location_description=entry_data.location_description if entry_data.outside_residence_zone else None
    )
    
    entry_dict = entry.model_dump()
    entry_dict['start_time'] = entry_dict['start_time'].isoformat()
    entry_dict['created_at'] = entry_dict['created_at'].isoformat()
    
    await db.time_entries.insert_one(entry_dict)
    
    # Return entry without MongoDB's _id field
    return {"message": "Relógio iniciado", "entry": {k: v for k, v in entry_dict.items() if k != '_id'}}

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
            day_hours = round(day_seconds / 3600, 2)
            
            day_date = current_start.date()
            is_ot, ot_reason = is_overtime_day(day_date)
            
            # Calculate hours breakdown using new logic
            hours_breakdown = calculate_hours_breakdown(day_hours, is_ot)
            
            # Create entry for this day
            if current_start == start_time:
                # Update the original entry
                await db.time_entries.update_one(
                    {"id": entry_id},
                    {"$set": {
                        "status": "completed",
                        "end_time": midnight.isoformat(),
                        "total_hours": day_hours,
                        "regular_hours": hours_breakdown["regular_hours"],
                        "overtime_hours": hours_breakdown["overtime_hours"],
                        "special_hours": hours_breakdown["special_hours"],
                        "observations": final_observations
                    }}
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
        final_hours = round(final_seconds / 3600, 2)
        
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
        # Single day entry
        total_seconds = (end_time - start_time).total_seconds()
        total_hours = round(total_seconds / 3600, 2)
        
        is_ot = entry.get("is_overtime_day", False)
        
        # Calculate hours breakdown using new logic
        hours_breakdown = calculate_hours_breakdown(total_hours, is_ot)
        
        await db.time_entries.update_one(
            {"id": entry_id},
            {"$set": {
                "status": "completed",
                "end_time": end_time.isoformat(),
                "total_hours": total_hours,
                "regular_hours": hours_breakdown["regular_hours"],
                "overtime_hours": hours_breakdown["overtime_hours"],
                "special_hours": hours_breakdown["special_hours"],
                "observations": final_observations
            }}
        )
        
        return {
            "message": "Relógio finalizado",
            "total_hours": total_hours,
            "regular_hours": hours_breakdown["regular_hours"],
            "overtime_hours": hours_breakdown["overtime_hours"],
            "special_hours": hours_breakdown["special_hours"],
            "is_overtime_day": is_ot
        }

@api_router.get("/time-entries/today")
async def get_today_entry(current_user: dict = Depends(get_current_user)):
    # Get active entry (regardless of date)
    active_entry = await db.time_entries.find_one({
        "user_id": current_user["sub"],
        "status": "active"
    }, {"_id": 0})
    
    if active_entry:
        return active_entry
    
    # If no active entry, get today's completed entries aggregated
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_entries = await db.time_entries.find({
        "user_id": current_user["sub"],
        "date": today,
        "status": "completed"
    }, {"_id": 0}).sort("created_at", 1).to_list(100)
    
    if not today_entries:
        return {"entries": [], "has_active": False}

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
        
        # Find active entry
        active_entry = next((e for e in user_entries if e["status"] == "active"), None)
        completed_entries = [e for e in user_entries if e["status"] == "completed"]
        
        status_info = {
            "user_id": user_id,
            "username": user["username"],
            "full_name": user.get("full_name", user["username"]),
            "date": today
        }
        
        if active_entry:
            # Currently working
            start_time = datetime.fromisoformat(active_entry["start_time"])
            elapsed_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
            elapsed_hours = round(elapsed_seconds / 3600, 2)
            
            status_info["status"] = "TRABALHANDO"
            status_info["status_color"] = "green"
            status_info["clock_in_time"] = start_time.strftime("%H:%M")
            status_info["elapsed_hours"] = elapsed_hours
            status_info["outside_residence_zone"] = active_entry.get("outside_residence_zone", False)
            status_info["location"] = active_entry.get("location_description")
        elif completed_entries:
            # Worked today (finished)
            total_hours = sum(e.get("total_hours", 0) for e in completed_entries)
            first_entry = min(completed_entries, key=lambda x: x.get("start_time", ""))
            last_entry = max(completed_entries, key=lambda x: x.get("end_time", ""))
            
            status_info["status"] = "TRABALHOU"
            status_info["status_color"] = "blue"
            status_info["clock_in_time"] = datetime.fromisoformat(first_entry["start_time"]).strftime("%H:%M")
            status_info["clock_out_time"] = datetime.fromisoformat(last_entry["end_time"]).strftime("%H:%M")
            status_info["total_hours"] = round(total_hours, 2)
            status_info["outside_residence_zone"] = any(e.get("outside_residence_zone", False) for e in completed_entries)
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
    
    # Aggregate today's entries
    total_hours = sum(e.get("total_hours", 0) for e in today_entries)
    regular_hours = sum(e.get("regular_hours", 0) for e in today_entries)
    overtime_hours = sum(e.get("overtime_hours", 0) for e in today_entries)
    special_hours = sum(e.get("special_hours", 0) for e in today_entries)
    
    return {
        "entries": today_entries,
        "has_active": False,
        "daily_summary": {
            "date": today,
            "total_hours": round(total_hours, 2),
            "regular_hours": round(regular_hours, 2),
            "overtime_hours": round(overtime_hours, 2),
            "special_hours": round(special_hours, 2),
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
    
    # Convert to list and round hours
    result = []
    for date_key in sorted(daily_entries.keys(), reverse=True):
        day_data = daily_entries[date_key]
        day_data["total_hours"] = round(day_data["total_hours"], 2)
        day_data["regular_hours"] = round(day_data["regular_hours"], 2)
        day_data["overtime_hours"] = round(day_data["overtime_hours"], 2)
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
        "total_overtime_hours": round(total_overtime, 2),
        "total_special_hours": round(total_special, 2),
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
    avg_hours = round(total_hours / total_days, 2) if total_days > 0 else 0
    
    return {
        "period": period,
        "start_date": start_date,
        "end_date": end_date,
        "total_hours": round(total_hours, 2),
        "regular_hours": round(regular_hours, 2),
        "overtime_hours": round(overtime_hours, 2),
        "special_hours": round(special_hours, 2),
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
            total_hours = sum(e.get("total_hours", 0) for e in day_entries)
            overtime_hours = sum(e.get("overtime_hours", 0) for e in day_entries)
            special_hours = sum(e.get("special_hours", 0) for e in day_entries)
            
            outside_zone = any(e.get("outside_residence_zone", False) for e in day_entries)
            location = next((e.get("location_description") for e in day_entries if e.get("location_description")), None)
            
            day_data["status"] = "TRABALHADO"
            day_data["entries"] = [{
                "id": e.get("id"),
                "start_time": e.get("start_time"),
                "end_time": e.get("end_time"),
                "total_hours": e.get("total_hours"),
                "observations": e.get("observations")
            } for e in day_entries]
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
            "total_worked_hours": round(total_worked_hours, 2),
            "total_overtime_hours": round(total_overtime_hours, 2),
            "total_special_hours": round(total_special_hours, 2),
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
            
            # Calculate totals
            total_hours = sum(e.get("total_hours", 0) for e in day_entries)
            regular_hours = sum(e.get("regular_hours", 0) for e in day_entries)
            overtime_hours = sum(e.get("overtime_hours", 0) for e in day_entries)
            special_hours = sum(e.get("special_hours", 0) for e in day_entries)
            
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
            } for e in day_entries]
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
            "total_worked_hours": round(total_worked_hours, 2),
            "total_overtime_hours": round(total_overtime_hours, 2),
            "total_special_hours": round(total_special_hours, 2),
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
            
            # Calculate totals
            total_hours = sum(e.get("total_hours", 0) for e in day_entries)
            overtime_hours = sum(e.get("overtime_hours", 0) for e in day_entries)
            special_hours = sum(e.get("special_hours", 0) for e in day_entries)
            
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
            } for e in day_entries]
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
    
    # Get user's vacation entitlement
    user_data = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0})
    vacation_entitlement = user_data.get("vacation_days_per_year", 22) if user_data else 22
    vacation_days_available = max(0, vacation_entitlement - vacation_days_used)
    
    report_data = {
        "username": username,
        "full_name": full_name,
        "start_date": start_date.strftime("%Y-%m-%d"),
        "end_date": end_date.strftime("%Y-%m-%d"),
        "month": month,
        "year": year,
        "daily_records": daily_records,
        "summary": {
            "total_worked_hours": round(total_worked_hours, 2),
            "total_overtime_hours": round(total_overtime_hours, 2),
            "total_special_hours": round(total_special_hours, 2),
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
    pdf_buffer = generate_monthly_pdf_report(report_data)
    
    # Generate filename
    filename = f"Relatorio_Mensal_{username}_{month:02d}_{year}.pdf"
    
    # Return as streaming response
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

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
            
            # Calculate total hours
            total_seconds = (end_time - start_time).total_seconds()
            total_hours = round(total_seconds / 3600, 2)
            
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
        
        if existing_entries:
            raise HTTPException(
                status_code=400,
                detail=f"Já existem {len(existing_entries)} entrada(s) para este dia. Use a opção 'Eliminar Dia Completo' primeiro ou elimine as entradas individualmente no histórico."
            )
        
        created_entries = []
        total_day_hours = 0
        
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
                first_hours = round(first_seconds / 3600, 2)
                
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
                second_hours = round(second_seconds / 3600, 2)
                
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
                entry_hours = round(total_seconds / 3600, 2)
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
        
        if entries_needing_breakdown:
            # Get total hours for these entries only
            breakdown_total_hours = sum(e.total_hours for e in entries_needing_breakdown)
            hours_breakdown = calculate_hours_breakdown(breakdown_total_hours, is_special_day)
            
            # Distribute the hours proportionally across entries needing breakdown
            for entry in entries_needing_breakdown:
                proportion = entry.total_hours / breakdown_total_hours if breakdown_total_hours > 0 else 0
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

@api_router.post("/admin/time-entries/import-excel")
async def import_excel_timesheet(
    file: UploadFile = File(...),
    user_id: str = None,
    current_user: dict = Depends(get_current_admin)
):
    """
    Import time entries from Excel or PDF format (Admin only)
    """
    try:
        # Validate file is Excel or PDF
        if not file.filename.endswith(('.xlsx', '.xls', '.pdf')):
            raise HTTPException(status_code=400, detail="Apenas ficheiros Excel (.xlsx, .xls) ou PDF (.pdf) são permitidos")
        
        is_pdf = file.filename.endswith('.pdf')
        
        # Save uploaded file temporarily
        temp_dir = Path("/tmp/timetracker_imports")
        temp_dir.mkdir(exist_ok=True)
        temp_file = temp_dir / f"{uuid.uuid4()}_{file.filename}"
        
        with open(temp_file, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Parse file based on type
        if is_pdf:
            logging.info(f"Parsing PDF file: {file.filename}")
            result = parse_pdf_timesheet(str(temp_file))
        else:
            logging.info(f"Parsing Excel file: {file.filename}")
            result = parse_excel_timesheet(str(temp_file))
        
        # Clean up temp file
        temp_file.unlink()
        
        if not result['success']:
            raise HTTPException(status_code=400, detail=f"Erro ao processar ficheiro: {result.get('error', 'Erro desconhecido')}")
        
        entries_data = result['entries']
        
        if not entries_data:
            raise HTTPException(status_code=400, detail="Nenhuma entrada válida encontrada no ficheiro")
        
        # If no user_id provided, try to find "Miguel Moreira"
        if not user_id:
            user = await db.users.find_one({
                "$or": [
                    {"username": {"$regex": "miguel", "$options": "i"}},
                    {"full_name": {"$regex": "miguel.*moreira", "$options": "i"}}
                ]
            }, {"_id": 0})
            
            if not user:
                raise HTTPException(status_code=404, detail="Utilizador Miguel Moreira não encontrado. Especifique user_id.")
            
            user_id = user["id"]
        else:
            # Validate user exists
            user = await db.users.find_one({"id": user_id}, {"_id": 0})
            if not user:
                raise HTTPException(status_code=404, detail="Utilizador não encontrado")
        
        username = user.get("username", "")
        
        # Import entries
        imported_count = 0
        skipped_count = 0
        error_count = 0
        
        for entry_data in entries_data:
            try:
                # Check if entries already exist for this date
                existing = await db.time_entries.find_one({
                    "user_id": user_id,
                    "date": entry_data['date'],
                    "status": "completed"
                })
                
                if existing:
                    skipped_count += 1
                    continue
                
                # Process time entries
                entry_date = datetime.strptime(entry_data['date'], "%Y-%m-%d").date()
                is_special_day, overtime_reason = is_overtime_day(entry_date)
                
                total_day_hours = 0
                created_entries = []
                
                for idx, time_pair in enumerate(entry_data['time_entries']):
                    start_time_str = time_pair['start_time']
                    end_time_str = time_pair['end_time']
                    
                    # Parse times
                    start_parts = start_time_str.split(":")
                    end_parts = end_time_str.split(":")
                    
                    # Create datetime objects
                    start_datetime = datetime.combine(entry_date, datetime.min.time()).replace(
                        hour=int(start_parts[0]),
                        minute=int(start_parts[1]),
                        tzinfo=timezone.utc
                    )
                    end_datetime = datetime.combine(entry_date, datetime.min.time()).replace(
                        hour=int(end_parts[0]),
                        minute=int(end_parts[1]),
                        tzinfo=timezone.utc
                    )
                    
                    # Calculate hours
                    total_seconds = (end_datetime - start_datetime).total_seconds()
                    entry_hours = round(total_seconds / 3600, 2)
                    total_day_hours += entry_hours
                    
                    # Create entry
                    time_entry = TimeEntry(
                        user_id=user_id,
                        username=username,
                        date=entry_data['date'],
                        start_time=start_datetime,
                        end_time=end_datetime,
                        status="completed",
                        observations=f"Importado de {'PDF' if is_pdf else 'Excel'} (entrada {idx+1}/{len(entry_data['time_entries'])})",
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
                
            except Exception as e:
                logging.error(f"Error importing entry for {entry_data.get('date')}: {str(e)}")
                error_count += 1
                continue
        
        return {
            "message": "Importação concluída",
            "imported": imported_count,
            "skipped": skipped_count,
            "errors": error_count,
            "total_in_file": len(entries_data)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error in import endpoint: {str(e)}")
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

# ============ Admin Routes ============

@api_router.get("/admin/users")
async def get_all_users(current_user: dict = Depends(get_current_admin)):
    """Get all users (admin only)"""
    users = await db.users.find({}, {"_id": 0, "hashed_password": 0}).to_list(1000)
    return users

@api_router.get("/admin/user/{user_id}/time-entries")
async def get_user_time_entries(user_id: str, current_user: dict = Depends(get_current_admin)):
    """Get all time entries for a specific user (admin only)"""
    entries = await db.time_entries.find({"user_id": user_id}, {"_id": 0}).sort("date", -1).to_list(1000)
    return entries

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
    
    return {"message": f"Pedido {'aprovado' if approved else 'rejeitado'} com sucesso"}

@api_router.get("/admin/reports/all")
async def get_all_reports(
    period: str = "billing",
    current_user: dict = Depends(get_current_admin)
):
    """Get consolidated reports for all users (admin only)"""
    now = datetime.now(timezone.utc)
    
    if period == "billing":
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
    for entry in entries:
        user_id = entry["user_id"]
        if user_id not in user_stats:
            user_stats[user_id] = {
                "username": entry["username"],
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
    
    # Get technician emails for notification
    technician_emails = []
    for tech_id in service_data.technician_ids:
        tech = await db.users.find_one({"id": tech_id}, {"_id": 0, "email": 1})
        if tech and tech.get('email'):
            technician_emails.append(tech['email'])
    
    # Send email notifications
    if technician_emails:
        await send_service_email(technician_emails, service_dict, "created")
    
    return {"message": "Serviço criado com sucesso", "service": {k: v for k, v in service_dict.items() if k != '_id'}}

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
    """Get calendar data including services and vacations for a specific month"""
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
    
    return {
        "services": services,
        "vacations": vacations
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
