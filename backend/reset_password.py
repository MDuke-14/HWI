#!/usr/bin/env python3
"""
Script to reset user password in MongoDB
Usage: python3 reset_password.py <username> <new_password>
"""
import asyncio
import sys
import os
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def reset_password(username, new_password):
    # Connect to MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'emergent')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print(f"Conectando a: {mongo_url}")
    print(f"Banco de dados: {db_name}")
    print(f"Username: {username}")
    
    # Check if user exists
    user = await db.users.find_one({"username": username})
    if not user:
        print(f"❌ Utilizador '{username}' não encontrado!")
        return False
    
    # Hash the new password
    hashed_password = pwd_context.hash(new_password)
    
    # Update user with new password
    result = await db.users.update_one(
        {"username": username},
        {"$set": {"hashed_password": hashed_password}}
    )
    
    if result.modified_count > 0:
        print(f"✅ Senha atualizada com sucesso para '{username}'!")
        print(f"Nova senha: {new_password}")
        return True
    else:
        print(f"⚠️  Nenhuma alteração foi feita")
        return False
    
    client.close()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python3 reset_password.py <username> <new_password>")
        print("Exemplo: python3 reset_password.py miguel NewPassword123")
        sys.exit(1)
    
    username = sys.argv[1]
    password = sys.argv[2]
    
    asyncio.run(reset_password(username, password))
