#!/bin/bash

echo "==================================="
echo "CRIAR UTILIZADORES ADMIN - PRODUÇÃO"
echo "==================================="
echo ""

cd /app/backend

# Run the Python script
python3 << 'EOF'
import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt
import uuid

async def create_users():
    # Get MongoDB URL from environment
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/emergent')
    
    print(f"Conectando ao MongoDB...")
    print(f"URL: {mongo_url.split('@')[-1] if '@' in mongo_url else mongo_url}")
    print("")
    
    try:
        client = AsyncIOMotorClient(mongo_url)
        db = client.emergent
        
        # Check existing users
        user_count = await db.users.count_documents({})
        print(f"Utilizadores existentes: {user_count}")
        print("")
        
        # Create admin users
        admins = [
            {
                "id": str(uuid.uuid4()),
                "username": "pedro.duarte@hwi.pt",
                "email": "pedro.duarte@hwi.pt",
                "full_name": "Pedro Duarte",
                "phone": "+351000000000",
                "password": bcrypt.hashpw("password123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
                "is_admin": True,
                "vacation_days": 22
            },
            {
                "id": str(uuid.uuid4()),
                "username": "miguel.moreira@hwi.pt",
                "email": "miguel.moreira@hwi.pt",
                "full_name": "Miguel Moreira",
                "phone": "+351000000001",
                "password": bcrypt.hashpw("password123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
                "is_admin": True,
                "vacation_days": 22
            }
        ]
        
        for admin in admins:
            # Check if user already exists
            existing = await db.users.find_one({"email": admin["email"]})
            if existing:
                print(f"⚠️  Utilizador já existe: {admin['email']}")
                # Update password
                await db.users.update_one(
                    {"email": admin["email"]},
                    {"$set": {"password": admin["password"]}}
                )
                print(f"   ✅ Password atualizada")
            else:
                await db.users.insert_one(admin)
                print(f"✅ Criado: {admin['email']}")
        
        print("")
        print("=================================")
        print("CREDENCIAIS ADMIN")
        print("=================================")
        print("Email: pedro.duarte@hwi.pt")
        print("Password: password123")
        print("")
        print("Email: miguel.moreira@hwi.pt")
        print("Password: password123")
        print("=================================")
        
        client.close()
        return 0
        
    except Exception as e:
        print(f"❌ ERRO: {str(e)}")
        return 1

sys.exit(asyncio.run(create_users()))
EOF

echo ""
echo "Script concluído!"
