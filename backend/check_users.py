import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import bcrypt

load_dotenv()

async def check_and_create_users():
    # Connect to MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/emergent')
    client = AsyncIOMotorClient(mongo_url)
    db = client.emergent
    
    print(f"Conectando a: {mongo_url}")
    
    # Check existing users
    users = await db.users.find({}, {"_id": 0, "username": 1, "email": 1, "is_admin": 1}).to_list(100)
    
    print(f"\n=== UTILIZADORES EXISTENTES ({len(users)}) ===")
    for user in users:
        admin_label = "👨‍💼 ADMIN" if user.get("is_admin") else "👤 User"
        print(f"{admin_label} - {user.get('username')} ({user.get('email')})")
    
    if len(users) == 0:
        print("\n⚠️  NENHUM UTILIZADOR ENCONTRADO!")
        print("Vou criar os utilizadores admin...")
        
        # Create admin users
        import uuid
        
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
            await db.users.insert_one(admin)
            print(f"✅ Criado: {admin['username']}")
        
        print("\n=== CREDENCIAIS DE ADMIN CRIADAS ===")
        print("Email: pedro.duarte@hwi.pt")
        print("Password: password123")
        print("")
        print("Email: miguel.moreira@hwi.pt")
        print("Password: password123")
    else:
        print("\n✅ Utilizadores encontrados no banco de dados")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_and_create_users())
