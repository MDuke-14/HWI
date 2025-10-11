from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
from passlib.context import CryptContext

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
    email: Optional[EmailStr] = None
    hashed_password: str
    full_name: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None

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
    pauses: List[dict] = []  # [{"pause_start": datetime, "pause_end": datetime}]
    status: str = "not_started"  # not_started, active, paused, completed
    observations: Optional[str] = None
    total_hours: Optional[float] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TimeEntryStart(BaseModel):
    observations: Optional[str] = None

class TimeEntryUpdate(BaseModel):
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    observations: Optional[str] = None

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

# ============ Auth Routes ============

@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate):
    # Check if user exists
    existing_user = await db.users.find_one({"username": user_data.username})
    if existing_user:
        raise HTTPException(status_code=400, detail="Utilizador já existe")
    
    # Create user
    hashed_password = get_password_hash(user_data.password)
    user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name
    )
    
    user_dict = user.model_dump()
    user_dict['created_at'] = user_dict['created_at'].isoformat()
    await db.users.insert_one(user_dict)
    
    # Create token
    access_token = create_access_token(data={"sub": user.id, "username": user.username})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user={"id": user.id, "username": user.username, "full_name": user.full_name}
    )

@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"username": credentials.username})
    if not user:
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    
    if not verify_password(credentials.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    
    access_token = create_access_token(data={"sub": user["id"], "username": user["username"]})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user={"id": user["id"], "username": user["username"], "full_name": user.get("full_name")}
    )

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    return user

# ============ Time Entry Routes ============

@api_router.post("/time-entries/start")
async def start_time_entry(entry_data: TimeEntryStart, current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Check if there's already an active entry for today
    existing_entry = await db.time_entries.find_one({
        "user_id": current_user["sub"],
        "date": today
    })
    
    if existing_entry and existing_entry["status"] != "completed":
        raise HTTPException(status_code=400, detail="Já existe um registo ativo para hoje")
    
    entry = TimeEntry(
        user_id=current_user["sub"],
        username=current_user["username"],
        date=today,
        start_time=datetime.now(timezone.utc),
        status="active",
        observations=entry_data.observations
    )
    
    entry_dict = entry.model_dump()
    entry_dict['start_time'] = entry_dict['start_time'].isoformat()
    entry_dict['created_at'] = entry_dict['created_at'].isoformat()
    
    await db.time_entries.insert_one(entry_dict)
    return {"message": "Relógio iniciado", "entry": entry_dict}

@api_router.post("/time-entries/pause/{entry_id}")
async def pause_time_entry(entry_id: str, current_user: dict = Depends(get_current_user)):
    entry = await db.time_entries.find_one({"id": entry_id, "user_id": current_user["sub"]})
    
    if not entry:
        raise HTTPException(status_code=404, detail="Registo não encontrado")
    
    if entry["status"] != "active":
        raise HTTPException(status_code=400, detail="O registo não está ativo")
    
    pauses = entry.get("pauses", [])
    pauses.append({"pause_start": datetime.now(timezone.utc).isoformat(), "pause_end": None})
    
    await db.time_entries.update_one(
        {"id": entry_id},
        {"$set": {"status": "paused", "pauses": pauses}}
    )
    
    return {"message": "Pausa iniciada", "pauses": pauses}

@api_router.post("/time-entries/resume/{entry_id}")
async def resume_time_entry(entry_id: str, current_user: dict = Depends(get_current_user)):
    entry = await db.time_entries.find_one({"id": entry_id, "user_id": current_user["sub"]})
    
    if not entry:
        raise HTTPException(status_code=404, detail="Registo não encontrado")
    
    if entry["status"] != "paused":
        raise HTTPException(status_code=400, detail="O registo não está em pausa")
    
    pauses = entry.get("pauses", [])
    if pauses and pauses[-1]["pause_end"] is None:
        pauses[-1]["pause_end"] = datetime.now(timezone.utc).isoformat()
    
    await db.time_entries.update_one(
        {"id": entry_id},
        {"$set": {"status": "active", "pauses": pauses}}
    )
    
    return {"message": "Trabalho retomado", "pauses": pauses}

@api_router.post("/time-entries/end/{entry_id}")
async def end_time_entry(entry_id: str, current_user: dict = Depends(get_current_user)):
    entry = await db.time_entries.find_one({"id": entry_id, "user_id": current_user["sub"]})
    
    if not entry:
        raise HTTPException(status_code=404, detail="Registo não encontrado")
    
    if entry["status"] == "completed":
        raise HTTPException(status_code=400, detail="O registo já foi finalizado")
    
    # If paused, close the last pause
    pauses = entry.get("pauses", [])
    if entry["status"] == "paused" and pauses and pauses[-1]["pause_end"] is None:
        pauses[-1]["pause_end"] = datetime.now(timezone.utc).isoformat()
    
    end_time = datetime.now(timezone.utc)
    start_time = datetime.fromisoformat(entry["start_time"])
    
    # Calculate total hours (excluding pauses)
    total_seconds = (end_time - start_time).total_seconds()
    
    for pause in pauses:
        if pause["pause_end"]:
            pause_start = datetime.fromisoformat(pause["pause_start"])
            pause_end = datetime.fromisoformat(pause["pause_end"])
            total_seconds -= (pause_end - pause_start).total_seconds()
    
    total_hours = round(total_seconds / 3600, 2)
    
    await db.time_entries.update_one(
        {"id": entry_id},
        {"$set": {
            "status": "completed",
            "end_time": end_time.isoformat(),
            "pauses": pauses,
            "total_hours": total_hours
        }}
    )
    
    return {"message": "Relógio finalizado", "total_hours": total_hours}

@api_router.get("/time-entries/today")
async def get_today_entry(current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    entry = await db.time_entries.find_one({
        "user_id": current_user["sub"],
        "date": today
    }, {"_id": 0})
    
    return entry

@api_router.get("/time-entries/list")
async def list_time_entries(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user["sub"]}
    
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        query["date"] = {"$gte": start_date}
    elif end_date:
        query["date"] = {"$lte": end_date}
    
    entries = await db.time_entries.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return entries

@api_router.get("/time-entries/reports")
async def get_reports(
    period: str = "week",  # week, month
    current_user: dict = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    
    if period == "week":
        start_date = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    else:  # month
        start_date = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    
    end_date = now.strftime("%Y-%m-%d")
    
    entries = await db.time_entries.find({
        "user_id": current_user["sub"],
        "date": {"$gte": start_date, "$lte": end_date},
        "status": "completed"
    }, {"_id": 0}).to_list(1000)
    
    total_hours = sum(entry.get("total_hours", 0) for entry in entries)
    total_days = len(entries)
    avg_hours = round(total_hours / total_days, 2) if total_days > 0 else 0
    
    return {
        "period": period,
        "start_date": start_date,
        "end_date": end_date,
        "total_hours": round(total_hours, 2),
        "total_days": total_days,
        "avg_hours_per_day": avg_hours,
        "entries": entries
    }

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