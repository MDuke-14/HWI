import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import bcrypt

load_dotenv()

async def test_login():
    # Connect to MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/emergent')
    client = AsyncIOMotorClient(mongo_url)
    db = client.emergent
    
    print(f"Testando login...")
    print(f"MongoDB: {mongo_url}\n")
    
    # Test credentials
    test_email = "pedro.duarte@hwi.pt"
    test_password = "password123"
    
    print(f"Tentando login com:")
    print(f"Email: {test_email}")
    print(f"Password: {test_password}\n")
    
    # Find user
    user = await db.users.find_one({"email": test_email}, {"_id": 0})
    
    if not user:
        print("❌ ERRO: Utilizador não encontrado!")
        return
    
    print(f"✅ Utilizador encontrado: {user.get('username')}")
    print(f"   Admin: {user.get('is_admin')}")
    print(f"   Full name: {user.get('full_name')}\n")
    
    # Test password
    stored_password = user.get("password")
    print(f"Password hash no banco: {stored_password[:50]}...")
    
    try:
        # Test bcrypt verification
        password_match = bcrypt.checkpw(
            test_password.encode('utf-8'),
            stored_password.encode('utf-8')
        )
        
        if password_match:
            print("✅ PASSWORD CORRETA!")
            print("\n=== LOGIN DEVERIA FUNCIONAR ===")
        else:
            print("❌ PASSWORD INCORRETA!")
            print("\n=== PROBLEMA: Password não coincide ===")
    except Exception as e:
        print(f"❌ ERRO ao verificar password: {str(e)}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(test_login())
