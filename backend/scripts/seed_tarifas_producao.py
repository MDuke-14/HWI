"""
Seed das 24 tarifas detalhadas de PRODUÇÃO para a table_id=1 no preview.
- Limpa tarifas existentes em table_id=1
- Insere as 24 tarifas exatas tal como aparecem em produção
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load env
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


# Tarifas de produção: (codigo, tipo_registo, tipo_colaborador, nome, valor)
TARIFAS = [
    # Código 1 - Dias úteis 07h-19h (Diurno)
    ("1", "trabalho", "junior",  "1 Trab Junior",    30.00),
    ("1", "trabalho", "senior",  "1 Trab Senior",    46.00),
    ("1", "trabalho", "tecnico", "1 Trab Tecnico",   40.00),
    ("1", "viagem",   "junior",  "1 Viagem Junior",  16.00),
    ("1", "viagem",   "senior",  "1 Viagem Senior",  30.00),
    ("1", "viagem",   "tecnico", "1 Viagem Tecnico", 26.00),
    # Código 2 - Dias úteis 19h-07h (Noturno)
    ("2", "trabalho", "junior",  "2 Trab Junior",    42.00),
    ("2", "trabalho", "senior",  "2 Trab Senior",    62.00),
    ("2", "trabalho", "tecnico", "2 Trab Tecnico",   54.00),
    ("2", "viagem",   "junior",  "2 Viagem Junior",  19.00),
    ("2", "viagem",   "senior",  "2 Viagem Senior",  36.00),
    ("2", "viagem",   "tecnico", "2 Viagem Tecnico", 31.00),
    # Código S - Sábados
    ("S", "trabalho", "junior",  "S Trab Junior",    48.00),
    ("S", "trabalho", "senior",  "S Trab Senior",    70.00),
    ("S", "trabalho", "tecnico", "S Trab Tecnico",   61.00),
    ("S", "viagem",   "junior",  "S Viagem Junior",  21.00),
    ("S", "viagem",   "senior",  "S Viagem Senior",  39.00),
    ("S", "viagem",   "tecnico", "S Viagem Tecnico", 34.00),
    # Código D - Domingos/Feriados
    ("D", "trabalho", "junior",  "D Trab Junior",    54.00),
    ("D", "trabalho", "senior",  "D Trab Senior",    79.00),
    ("D", "trabalho", "tecnico", "D Trab Técnico",   69.00),
    ("D", "viagem",   "junior",  "D Viagem Junior",  22.00),
    ("D", "viagem",   "senior",  "D Viagem Senior",  42.00),
    ("D", "viagem",   "tecnico", "D Viagem Tecnico", 37.00),
]


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    coll = db.tarifas

    # 1) Limpar todas as tarifas table_id=1 e as antigas sem table_id
    res_t1 = await coll.delete_many({"table_id": 1})
    res_no = await coll.delete_many({"table_id": {"$exists": False}})
    print(f"Removidas: table_id=1 → {res_t1.deleted_count} | sem table_id → {res_no.deleted_count}")

    # 2) Inserir as 24 tarifas de produção
    now_iso = datetime.now(timezone.utc).isoformat()
    docs = []
    for codigo, tipo_reg, tipo_col, nome, valor in TARIFAS:
        docs.append({
            "id": str(uuid.uuid4()),
            "numero": None,
            "nome": nome,
            "valor_por_hora": valor,
            "codigo": codigo,
            "tipo_registo": tipo_reg,
            "tipo_colaborador": tipo_col,
            "table_id": 1,
            "ativo": True,
            "created_at": now_iso,
        })
    result = await coll.insert_many(docs)
    print(f"Inseridas: {len(result.inserted_ids)} tarifas table_id=1")

    # 3) Verificar
    cnt = await coll.count_documents({"table_id": 1})
    print(f"Total atual em table_id=1: {cnt}")
    # Listar por código
    for c in ["1", "2", "S", "D"]:
        docs_c = await coll.find({"table_id": 1, "codigo": c}, {"_id": 0, "nome": 1, "valor_por_hora": 1, "tipo_registo": 1, "tipo_colaborador": 1}).sort("tipo_registo", 1).to_list(length=None)
        print(f"\n  Cód.{c}:")
        for d in docs_c:
            print(f"    {d['tipo_registo']:8s} {d['tipo_colaborador']:7s} → {d['valor_por_hora']:.2f}€/h  ({d['nome']})")


if __name__ == "__main__":
    asyncio.run(main())
