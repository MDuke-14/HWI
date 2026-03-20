"""
Rotas de Autenticacao (register, login, forgot-password, change-password).
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import os
import logging

from database import db
from auth_utils import get_current_user, create_access_token, verify_password, get_password_hash, pwd_context
from models import User, UserCreate, UserLogin, Token, ForgotPasswordRequest, ChangePasswordRequest, VacationBalance
from helpers import generate_temporary_password, send_password_reset_email, create_notification, calculate_vacation_days

router = APIRouter(tags=["Auth"])


@router.post("/auth/register")
async def register(user: UserCreate, current_user: dict = Depends(get_current_user)):
    """Registar novo utilizador - apenas admin"""
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Apenas administradores podem registar utilizadores")
    
    existing_user = await db.users.find_one({"username": user.username})
    if existing_user:
        raise HTTPException(status_code=400, detail="Nome de utilizador já existe")
    
    existing_email = await db.users.find_one({"email": user.email})
    if existing_email:
        raise HTTPException(status_code=400, detail="Email já existe")
    
    new_user = User(
        username=user.username,
        email=user.email,
        hashed_password=get_password_hash(user.password),
        full_name=user.full_name,
        phone=user.phone,
        must_change_password=True
    )
    
    user_dict = new_user.dict()
    user_dict["created_at"] = user_dict["created_at"].isoformat()
    
    await db.users.insert_one(user_dict)
    
    if user.company_start_date:
        vacation_info = calculate_vacation_days(user.company_start_date, user.vacation_days_taken)
        balance = VacationBalance(
            user_id=new_user.id,
            company_start_date=user.company_start_date,
            days_earned=vacation_info["days_earned"],
            days_taken=user.vacation_days_taken,
            days_available=vacation_info["days_available"]
        )
        balance_dict = balance.dict()
        balance_dict["updated_at"] = balance_dict["updated_at"].isoformat()
        await db.vacation_balances.insert_one(balance_dict)
    
    logging.info(f"Novo utilizador registado: {user.username} por {current_user.get('username')}")
    return {"message": "Utilizador registado com sucesso", "user_id": new_user.id}


@router.post("/auth/login", response_model=Token)
async def login(user_login: UserLogin):
    """Login de utilizador"""
    user = await db.users.find_one({"username": user_login.username}, {"_id": 0})
    
    if not user:
        user = await db.users.find_one({"email": user_login.username}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    
    if not verify_password(user_login.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    
    token_data = {
        "sub": user["id"],
        "username": user["username"],
        "email": user.get("email", ""),
        "is_admin": user.get("is_admin", False),
        "must_change_password": user.get("must_change_password", False)
    }
    
    access_token = create_access_token(token_data)
    
    logging.info(f"Login: {user['username']}")
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user={
            "id": user["id"],
            "username": user["username"],
            "email": user.get("email", ""),
            "full_name": user.get("full_name"),
            "phone": user.get("phone"),
            "is_admin": user.get("is_admin", False),
            "must_change_password": user.get("must_change_password", False),
            "tipo_colaborador": user.get("tipo_colaborador", "tecnico")
        }
    )


@router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Obter dados do utilizador autenticado"""
    user = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    return user


@router.post("/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    """Recuperar password - gera password temporária e envia por email"""
    user = await db.users.find_one({
        "$or": [
            {"email": request.email},
            {"username": request.email}
        ]
    })
    
    if not user:
        return {"message": "Se o email estiver registado, receberá um email com a nova senha temporária"}
    
    temp_password = generate_temporary_password()
    hashed = get_password_hash(temp_password)
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "hashed_password": hashed,
            "must_change_password": True
        }}
    )
    
    await send_password_reset_email(
        user_name=user.get("full_name") or user["username"],
        user_email=user["email"],
        temporary_password=temp_password
    )
    
    logging.info(f"Password reset for {user['username']}")
    
    return {"message": "Se o email estiver registado, receberá um email com a nova senha temporária"}


@router.post("/auth/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user)
):
    """Alterar password (usado tanto para alteração normal quanto para forçar mudança após reset)"""
    user = await db.users.find_one({"id": current_user["sub"]})
    
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    
    if not verify_password(request.old_password, user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Password atual incorreta")
    
    if len(request.new_password) < 4:
        raise HTTPException(status_code=400, detail="A nova password deve ter pelo menos 4 caracteres")
    
    new_hashed = get_password_hash(request.new_password)
    
    await db.users.update_one(
        {"id": current_user["sub"]},
        {"$set": {
            "hashed_password": new_hashed,
            "must_change_password": False
        }}
    )
    
    logging.info(f"Password alterada por {current_user['username']}")
    
    return {"message": "Password alterada com sucesso"}
