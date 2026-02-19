"""
Rotas de Autenticação.
Login, registo, gestão de passwords.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid
import logging

from .dependencies import (
    db, verify_password, get_password_hash, create_access_token,
    get_current_user, get_current_admin
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

# ============ Models ============

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    phone: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

# ============ Routes ============

@router.post("/register", response_model=Token)
async def register(user_data: UserCreate):
    """Registar novo utilizador."""
    # Verificar se username já existe
    existing_user = await db.users.find_one({"username": user_data.username})
    if existing_user:
        raise HTTPException(status_code=400, detail="Username já existe")
    
    # Verificar se email já existe
    existing_email = await db.users.find_one({"email": user_data.email})
    if existing_email:
        raise HTTPException(status_code=400, detail="Email já registado")
    
    # Criar utilizador
    user_id = str(uuid.uuid4())
    hashed_password = get_password_hash(user_data.password)
    
    user_dict = {
        "id": user_id,
        "username": user_data.username,
        "email": user_data.email,
        "hashed_password": hashed_password,
        "full_name": user_data.full_name,
        "phone": user_data.phone,
        "is_admin": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    from datetime import datetime, timezone
    await db.users.insert_one(user_dict)
    
    # Criar token
    access_token = create_access_token(data={
        "sub": user_id,
        "username": user_data.username,
        "is_admin": False
    })
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin):
    """Login de utilizador."""
    user = await db.users.find_one({"username": credentials.username})
    if not user:
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    
    if not verify_password(credentials.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    
    access_token = create_access_token(data={
        "sub": user["id"],
        "username": user["username"],
        "is_admin": user.get("is_admin", False),
        "full_name": user.get("full_name"),
        "email": user.get("email")
    })
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Obter dados do utilizador atual."""
    user = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    return user


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user)
):
    """Alterar password do utilizador atual."""
    user = await db.users.find_one({"id": current_user["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    
    if not verify_password(request.current_password, user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Password atual incorreta")
    
    new_hashed = get_password_hash(request.new_password)
    await db.users.update_one(
        {"id": current_user["sub"]},
        {"$set": {"hashed_password": new_hashed}}
    )
    
    return {"message": "Password alterada com sucesso"}
