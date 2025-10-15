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
    is_admin: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    username: str
    password: str
    email: EmailStr
    full_name: Optional[str] = None
    company_start_date: Optional[str] = None  # YYYY-MM-DD
    vacation_days_taken: int = 0

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_admin: Optional[bool] = None

class UserLogin(BaseModel):
    username: str
    password: str

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

@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"username": credentials.username})
    if not user:
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    
    if not verify_password(credentials.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    
    access_token = create_access_token(data={"sub": user["id"], "username": user["username"], "is_admin": user.get("is_admin", False)})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user={"id": user["id"], "username": user["username"], "full_name": user.get("full_name"), "is_admin": user.get("is_admin", False)}
    )

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    return user

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
    current_user: dict = Depends(get_current_user)
):
    """
    Lista entradas agrupadas por dia com total de horas somado
    """
    query = {"user_id": current_user["sub"], "status": "completed"}
    
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
    """Retorna resumo de todas as horas extras"""
    entries = await db.time_entries.find({
        "user_id": current_user["sub"],
        "status": "completed"
    }, {"_id": 0}).to_list(1000)
    
    total_overtime = sum(entry.get("overtime_hours", 0) for entry in entries)
    overtime_entries = [e for e in entries if e.get("is_overtime_day", False)]
    
    return {
        "total_overtime_hours": round(total_overtime, 2),
        "total_overtime_days": len(overtime_entries),
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

@api_router.get("/time-entries/reports/monthly-detailed")
async def get_monthly_detailed_report(
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Relatório mensal detalhado para contabilidade (26 do mês anterior até 25)
    """
    now = datetime.now(timezone.utc)
    
    # Use current month/year if not provided
    if not month or not year:
        month = now.month
        year = now.year
    
    # Get user data for report
    user = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    
    username = user.get("username", "user")
    full_name = user.get("full_name", username)
    
    # Get billing period dates (26th to 25th)
    start_date, end_date = get_billing_period_dates(date(year, month, 1))
    
    # Get all time entries for the period
    entries_by_date = {}
    entries = await db.time_entries.find({
        "user_id": current_user["sub"],
        "date": {"$gte": start_date.strftime("%Y-%m-%d"), "$lte": end_date.strftime("%Y-%m-%d")},
        "status": "completed"
    }, {"_id": 0}).sort("date", 1).to_list(1000)
    
    for entry in entries:
        date_key = entry["date"]
        if date_key not in entries_by_date:
            entries_by_date[date_key] = []
        entries_by_date[date_key].append(entry)
    
    # Build daily records for entire period
    daily_records = []
    current_date = start_date
    total_worked_hours = 0
    total_overtime_hours = 0
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
            
            # Check payment type
            outside_zone = any(e.get("outside_residence_zone", False) for e in day_entries)
            location = next((e.get("location_description") for e in day_entries if e.get("location_description")), None)
            
            day_data["status"] = "TRABALHADO"
            day_data["entries"] = [{
                "start_time": e.get("start_time"),
                "end_time": e.get("end_time"),
                "observations": e.get("observations")
            } for e in day_entries]
            day_data["total_hours"] = round(total_hours, 2)
            day_data["overtime_hours"] = round(overtime_hours, 2)
            day_data["outside_residence_zone"] = outside_zone
            day_data["location"] = location
            
            if outside_zone:
                day_data["payment_type"] = "Ajuda de Custos"
                day_data["payment_value"] = 50.0
                days_with_travel_allowance += 1
            else:
                day_data["payment_type"] = "Subsídio de Alimentação"
                day_data["payment_value"] = 10.0
                days_with_meal_allowance += 1
            
            total_worked_hours += total_hours
            total_overtime_hours += overtime_hours
        else:
            # Not worked
            if is_weekend:
                day_data["status"] = "FOLGA"
            elif is_holiday:
                day_data["status"] = "FERIADO"
            else:
                day_data["status"] = "NÃO TRABALHADO"
            
            day_data["entries"] = []
            day_data["total_hours"] = 0
            day_data["overtime_hours"] = 0
            day_data["payment_type"] = None
            day_data["payment_value"] = 0
        
        daily_records.append(day_data)
        current_date += timedelta(days=1)
    
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
            "days_with_meal_allowance": days_with_meal_allowance,
            "days_with_travel_allowance": days_with_travel_allowance,
            "total_meal_allowance_value": days_with_meal_allowance * 10.0,
            "total_travel_allowance_value": days_with_travel_allowance * 50.0
        }
    }

@api_router.get("/time-entries/reports/monthly-pdf")
async def download_monthly_pdf_report(
    month: Optional[int] = None,
    year: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Generate and download PDF monthly detailed report for accounting
    """
    now = datetime.now(timezone.utc)
    
    # Use current month/year if not provided
    if not month or not year:
        month = now.month
        year = now.year
    
    # Get user data for report
    user = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    
    username = user.get("username", "user")
    full_name = user.get("full_name", username)
    
    # Get the detailed monthly report data (reuse the same logic)
    start_date, end_date = get_billing_period_dates(date(year, month, 1))
    
    # Get all time entries for the period
    entries_by_date = {}
    entries = await db.time_entries.find({
        "user_id": current_user["sub"],
        "date": {"$gte": start_date.strftime("%Y-%m-%d"), "$lte": end_date.strftime("%Y-%m-%d")},
        "status": "completed"
    }, {"_id": 0}).sort("date", 1).to_list(1000)
    
    for entry in entries:
        date_key = entry["date"]
        if date_key not in entries_by_date:
            entries_by_date[date_key] = []
        entries_by_date[date_key].append(entry)
    
    # Build daily records for entire period
    daily_records = []
    current_date = start_date
    total_worked_hours = 0
    total_overtime_hours = 0
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
            
            # Check payment type
            outside_zone = any(e.get("outside_residence_zone", False) for e in day_entries)
            location = next((e.get("location_description") for e in day_entries if e.get("location_description")), None)
            
            day_data["status"] = "TRABALHADO"
            day_data["entries"] = [{
                "start_time": e.get("start_time"),
                "end_time": e.get("end_time"),
                "observations": e.get("observations")
            } for e in day_entries]
            day_data["total_hours"] = round(total_hours, 2)
            day_data["overtime_hours"] = round(overtime_hours, 2)
            day_data["outside_residence_zone"] = outside_zone
            day_data["location"] = location
            
            if outside_zone:
                day_data["payment_type"] = "Ajuda de Custos"
                day_data["payment_value"] = 50.0
                days_with_travel_allowance += 1
            else:
                day_data["payment_type"] = "Subsídio de Alimentação"
                day_data["payment_value"] = 10.0
                days_with_meal_allowance += 1
            
            total_worked_hours += total_hours
            total_overtime_hours += overtime_hours
        else:
            # Not worked
            if is_weekend:
                day_data["status"] = "FOLGA"
            elif is_holiday:
                day_data["status"] = "FERIADO"
            else:
                day_data["status"] = "NÃO TRABALHADO"
            
            day_data["entries"] = []
            day_data["total_hours"] = 0
            day_data["overtime_hours"] = 0
            day_data["payment_type"] = None
            day_data["payment_value"] = 0
        
        daily_records.append(day_data)
        current_date += timedelta(days=1)
    
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
            "days_with_meal_allowance": days_with_meal_allowance,
            "days_with_travel_allowance": days_with_travel_allowance,
            "total_meal_allowance_value": days_with_meal_allowance * 10.0,
            "total_travel_allowance_value": days_with_travel_allowance * 50.0
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
    entry = await db.time_entries.find_one({"id": entry_id, "user_id": current_user["sub"]})
    
    if not entry:
        raise HTTPException(status_code=404, detail="Registo não encontrado")
    
    update_dict = {}
    if update_data.start_time:
        update_dict["start_time"] = update_data.start_time.isoformat()
    if update_data.end_time:
        update_dict["end_time"] = update_data.end_time.isoformat()
    if update_data.observations is not None:
        update_dict["observations"] = update_data.observations
    
    if update_dict:
        await db.time_entries.update_one({"id": entry_id}, {"$set": update_dict})
    
    return {"message": "Registo atualizado com sucesso"}

@api_router.delete("/time-entries/{entry_id}")
async def delete_time_entry(entry_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.time_entries.delete_one({"id": entry_id, "user_id": current_user["sub"]})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Registo não encontrado")
    
    return {"message": "Registo eliminado com sucesso"}

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
    
    # Notify user
    message = f"A sua falta de {absence['date']} foi {'aprovada' if approved else 'rejeitada'} por {current_user['username']}"
    await create_notification(
        absence["user_id"],
        f"absence_{'approved' if approved else 'rejected'}",
        message,
        absence_id
    )
    
    return {"message": f"Falta {'aprovada' if approved else 'rejeitada'} com sucesso"}

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
