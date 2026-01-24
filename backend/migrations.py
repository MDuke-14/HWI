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


async def migrate_segmentar_registos(db: AsyncIOMotorDatabase):
    """
    Migração: Segmentar registos de cronómetro existentes por código horário
    
    Registos que atravessam diferentes códigos (ex: 07:00 ou 19:00) serão
    divididos em múltiplos registos.
    
    Esta migração só corre uma vez.
    """
    from datetime import datetime, timezone, time, timedelta
    from cronometro_logic import segmentar_periodo, get_codigo_horario
    import uuid
    
    MIGRATION_KEY = "segmentar_registos_codigo_horario"
    
    # Verificar se migração já foi executada
    migration_done = await db.migrations.find_one({"key": MIGRATION_KEY})
    
    if migration_done:
        logger.info(f"✅ Migração '{MIGRATION_KEY}' já foi executada anteriormente.")
        return
    
    logger.info(f"🔄 A executar migração '{MIGRATION_KEY}'...")
    
    try:
        # Buscar todos os registos existentes
        registos = await db.registos_tecnico_ot.find({}).to_list(length=None)
        
        if not registos:
            logger.info("  Nenhum registo encontrado para migrar.")
        else:
            registos_processados = 0
            registos_criados = 0
            registos_removidos = 0
            
            for reg in registos:
                hora_inicio_str = reg.get("hora_inicio_segmento")
                hora_fim_str = reg.get("hora_fim_segmento")
                
                if not hora_inicio_str or not hora_fim_str:
                    continue
                
                # Parse datetimes
                try:
                    if isinstance(hora_inicio_str, str):
                        hora_inicio = datetime.fromisoformat(hora_inicio_str.replace('Z', '+00:00'))
                    else:
                        hora_inicio = hora_inicio_str
                    
                    if isinstance(hora_fim_str, str):
                        hora_fim = datetime.fromisoformat(hora_fim_str.replace('Z', '+00:00'))
                    else:
                        hora_fim = hora_fim_str
                        
                except Exception as e:
                    logger.warning(f"  Erro ao parsear datas do registo {reg.get('id')}: {e}")
                    continue
                
                # Garantir timezone
                if hora_inicio.tzinfo is None:
                    hora_inicio = hora_inicio.replace(tzinfo=timezone.utc)
                if hora_fim.tzinfo is None:
                    hora_fim = hora_fim.replace(tzinfo=timezone.utc)
                
                # Segmentar
                tipo = reg.get("tipo", "manual")
                segmentos = segmentar_periodo(hora_inicio, hora_fim, tipo)
                
                # Se resultou em mais de 1 segmento, precisamos substituir o registo original
                if len(segmentos) > 1:
                    logger.info(f"  Registo {reg.get('id')[:8]}... será dividido em {len(segmentos)} segmentos")
                    
                    # Criar novos registos
                    for i, seg in enumerate(segmentos):
                        novo_registo = {
                            "id": str(uuid.uuid4()),
                            "relatorio_id": reg.get("relatorio_id"),
                            "tecnico_id": reg.get("tecnico_id"),
                            "tecnico_nome": reg.get("tecnico_nome"),
                            "tipo": tipo,
                            "data": seg["data"].isoformat(),
                            "hora_inicio_segmento": seg["hora_inicio_segmento"].isoformat(),
                            "hora_fim_segmento": seg["hora_fim_segmento"].isoformat(),
                            "horas_arredondadas": seg["horas_arredondadas"],
                            "minutos_trabalhados": int(seg["duracao_minutos"]),
                            "km": reg.get("km", 0),
                            "codigo": seg["codigo"],
                            "origem": reg.get("origem", "cronometro"),
                            "created_at": reg.get("created_at", datetime.now(timezone.utc).isoformat()),
                            "migrated_from": reg.get("id")
                        }
                        
                        await db.registos_tecnico_ot.insert_one(novo_registo)
                        registos_criados += 1
                    
                    # Remover registo original
                    await db.registos_tecnico_ot.delete_one({"_id": reg["_id"]})
                    registos_removidos += 1
                    
                elif len(segmentos) == 1:
                    # Apenas 1 segmento - atualizar código se necessário
                    novo_codigo = segmentos[0]["codigo"]
                    codigo_atual = reg.get("codigo")
                    
                    if novo_codigo != codigo_atual:
                        await db.registos_tecnico_ot.update_one(
                            {"_id": reg["_id"]},
                            {"$set": {"codigo": novo_codigo}}
                        )
                        logger.info(f"  Registo {reg.get('id')[:8]}... código atualizado: {codigo_atual} -> {novo_codigo}")
                
                registos_processados += 1
            
            logger.info(f"  Processados: {registos_processados} registos")
            logger.info(f"  Criados: {registos_criados} novos segmentos")
            logger.info(f"  Removidos: {registos_removidos} registos originais")
        
        # Marcar migração como concluída
        await db.migrations.insert_one({
            "key": MIGRATION_KEY,
            "executed_at": datetime.now(timezone.utc).isoformat(),
            "description": "Segmentação de registos de cronómetro por código horário"
        })
        
        logger.info(f"✅ Migração '{MIGRATION_KEY}' concluída e registada.")
        
    except Exception as e:
        logger.error(f"❌ Erro na migração '{MIGRATION_KEY}': {str(e)}")
        raise
