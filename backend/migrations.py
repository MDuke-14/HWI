"""
Migrations - Scripts de migração que correm uma vez no startup do servidor
"""
import logging
from motor.motor_asyncio import AsyncIOMotorDatabase

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_migrations(db: AsyncIOMotorDatabase):
    """Executa todas as migrações pendentes"""
    
    # Migration 1: Renumerar OTs a partir de #354
    await migrate_ot_numbers(db)
    
    # Migration 2: Renomear campo telefone para nif na company_info
    await migrate_telefone_to_nif(db)
    
    # Migration 3: Segmentar registos de cronómetro por código horário
    await migrate_segmentar_registos(db)


async def migrate_ot_numbers(db: AsyncIOMotorDatabase):
    """
    Migração: Renumerar todas as OTs para começar em #354
    Esta migração só corre uma vez.
    """
    MIGRATION_KEY = "ot_renumber_354"
    
    # Verificar se migração já foi executada
    migration_done = await db.migrations.find_one({"key": MIGRATION_KEY})
    
    if migration_done:
        logger.info(f"✅ Migração '{MIGRATION_KEY}' já foi executada anteriormente.")
        return
    
    logger.info(f"🔄 A executar migração '{MIGRATION_KEY}'...")
    
    try:
        # Buscar todas as OTs ordenadas por data de criação
        ots = await db.relatorios_tecnicos.find(
            {},
            {"id": 1, "numero_assistencia": 1, "created_at": 1}
        ).sort("created_at", 1).to_list(length=None)
        
        if not ots:
            logger.info("Nenhuma OT encontrada para renumerar.")
        else:
            # Renumerar começando em 354
            NUMERO_INICIAL = 354
            updated_count = 0
            
            for i, ot in enumerate(ots):
                novo_numero = NUMERO_INICIAL + i
                
                await db.relatorios_tecnicos.update_one(
                    {"id": ot["id"]},
                    {"$set": {"numero_assistencia": novo_numero}}
                )
                
                logger.info(f"  OT {ot.get('numero_assistencia', '?')} -> #{novo_numero}")
                updated_count += 1
            
            logger.info(f"✅ {updated_count} OTs renumeradas com sucesso (#{NUMERO_INICIAL} - #{NUMERO_INICIAL + updated_count - 1})")
        
        # Marcar migração como concluída
        await db.migrations.insert_one({
            "key": MIGRATION_KEY,
            "executed_at": __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
            "description": "Renumeração de OTs para começar em #354"
        })
        
        logger.info(f"✅ Migração '{MIGRATION_KEY}' concluída e registada.")
        
    except Exception as e:
        logger.error(f"❌ Erro na migração '{MIGRATION_KEY}': {str(e)}")
        raise


async def migrate_telefone_to_nif(db: AsyncIOMotorDatabase):
    """
    Migração: Renomear campo 'telefone' para 'nif' na collection company_info
    Esta migração só corre uma vez.
    """
    MIGRATION_KEY = "company_info_telefone_to_nif"
    
    # Verificar se migração já foi executada
    migration_done = await db.migrations.find_one({"key": MIGRATION_KEY})
    
    if migration_done:
        logger.info(f"✅ Migração '{MIGRATION_KEY}' já foi executada anteriormente.")
        return
    
    logger.info(f"🔄 A executar migração '{MIGRATION_KEY}'...")
    
    try:
        # Verificar se existe company_info com campo telefone
        company_info = await db.company_info.find_one({"id": "company_info_default"})
        
        if company_info and "telefone" in company_info:
            # Renomear campo telefone para nif
            await db.company_info.update_one(
                {"id": "company_info_default"},
                {
                    "$rename": {"telefone": "nif"},
                }
            )
            logger.info("  Campo 'telefone' renomeado para 'nif'")
        else:
            logger.info("  Campo 'telefone' não encontrado ou já migrado")
        
        # Marcar migração como concluída
        await db.migrations.insert_one({
            "key": MIGRATION_KEY,
            "executed_at": __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
            "description": "Renomear campo telefone para nif em company_info"
        })
        
        logger.info(f"✅ Migração '{MIGRATION_KEY}' concluída e registada.")
        
    except Exception as e:
        logger.error(f"❌ Erro na migração '{MIGRATION_KEY}': {str(e)}")
        raise
