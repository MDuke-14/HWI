"""
Dependências comuns para todas as rotas.
Imports partilhados, funções de autenticação e acesso à base de dados.
"""
import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
import jwt

# Configuração
SECRET_KEY = os.environ.get("SECRET_KEY", "your-secret-key-here-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 dias

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security
security = HTTPBearer()

# MongoDB
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "emergent")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ============ Auth Functions ============

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
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
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido")

async def get_current_admin(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Apenas administradores podem aceder")
    return current_user

# ============ Utility Functions ============

def truncar_horas_para_minutos(horas: float) -> float:
    """Trunca as horas para a precisão de minutos (2 casas decimais arredondadas para baixo)."""
    if horas is None:
        return 0.0
    minutos_totais = int(horas * 60)
    return round(minutos_totais / 60, 2)

def truncar_segundos_para_horas(segundos: float) -> float:
    """Converte segundos para horas, truncando para minutos."""
    if segundos is None:
        return 0.0
    minutos = int(segundos / 60)
    return round(minutos / 60, 2)

# ============ Notifications ============

async def create_notification(user_id: str, notification_type: str, message: str, related_id: str = None):
    """Criar uma notificação para um utilizador."""
    import uuid
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": notification_type,
        "message": message,
        "related_id": related_id,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification)
    return notification
