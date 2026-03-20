"""
Conexão à base de dados MongoDB - Singleton partilhado por todo o backend.
"""
import os
import logging
from motor.motor_asyncio import AsyncIOMotorClient

mongo_url = os.environ.get('MONGO_URL', 'mongodb://mongodb:27017')
db_name = os.environ.get('DB_NAME', 'emergent')

logging.info(f"🔌 MongoDB: {mongo_url[:40]}... | DB: {db_name}")

client = AsyncIOMotorClient(mongo_url)
db = client[db_name]
