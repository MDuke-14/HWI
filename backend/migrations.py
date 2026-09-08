"""
Migrations - Scripts de migração que correm uma vez no startup do servidor
"""
import logging
from datetime import timezone

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

    # Migration 4: Corrigir entries de crédito early_leave sem start_time/end_time
    await migrate_early_leave_credit_times(db)

    # Migration 5: Remover entries fantasma em vacation_taken_by_year para
    # anos anteriores ao company_start_date de cada user (Feb 2026)
    await migrate_cleanup_orphan_taken_by_year(db)


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


async def migrate_early_leave_credit_times(db: AsyncIOMotorDatabase):
    """Atribui start_time/end_time virtuais a entries de crédito early_leave
    que ficaram com None (criadas antes do fix).

    Para cada entry de crédito sem horas, calcula:
      start_time = end_time da última picagem REAL desse dia
      end_time   = start_time + credit_minutes
    """
    MIGRATION_KEY = "early_leave_credit_virtual_times_v1"

    migration_done = await db.migrations.find_one({"key": MIGRATION_KEY})
    if migration_done:
        logger.info(f"✅ Migração '{MIGRATION_KEY}' já foi executada.")
        return

    logger.info(f"🔄 A executar migração '{MIGRATION_KEY}'…")

    try:
        from datetime import datetime, timedelta

        bad = await db.time_entries.find(
            {
                "is_early_leave_credit": True,
                "$or": [
                    {"start_time": None},
                    {"start_time": {"$exists": False}},
                ],
            },
            {"_id": 0, "id": 1, "user_id": 1, "date": 1,
             "credit_minutes": 1, "total_hours": 1},
        ).to_list(2000)

        if not bad:
            logger.info("  Nenhuma entry de crédito sem horas — nada a corrigir.")
        else:
            logger.info(f"  Encontradas {len(bad)} entries de crédito sem horas.")

        fixed = 0
        skipped = 0
        for c in bad:
            try:
                date_str = c.get("date")
                uid = c.get("user_id")
                mins = c.get("credit_minutes")
                if not mins:
                    mins = int(round((c.get("total_hours") or 0) * 60))
                if not date_str or not uid or not mins:
                    skipped += 1
                    continue

                # Buscar end_time da última picagem REAL desse dia
                day_entries = await db.time_entries.find(
                    {"user_id": uid, "date": date_str, "status": "completed"},
                    {"_id": 0, "end_time": 1, "is_early_leave_credit": 1},
                ).to_list(50)
                real_ends = [
                    e.get("end_time") for e in day_entries
                    if e.get("end_time") and not e.get("is_early_leave_credit")
                ]
                if not real_ends:
                    skipped += 1
                    continue

                latest = datetime.fromisoformat(max(real_ends))
                vstart = latest.isoformat()
                vend = (latest + timedelta(minutes=int(mins))).isoformat()
                await db.time_entries.update_one(
                    {"id": c["id"]},
                    {"$set": {"start_time": vstart, "end_time": vend}},
                )
                fixed += 1
            except Exception as exc:
                logger.warning(f"  skip entry {c.get('id')}: {exc}")
                skipped += 1

        logger.info(f"  Resultado: {fixed} corrigidas, {skipped} ignoradas.")

        # Registar migração como executada
        await db.migrations.insert_one({
            "key": MIGRATION_KEY,
            "executed_at": datetime.now(timezone.utc).isoformat(),
            "fixed_count": fixed,
            "skipped_count": skipped,
        })
        logger.info(f"✅ Migração '{MIGRATION_KEY}' concluída.")

    except Exception as exc:
        logger.error(f"❌ Erro na migração '{MIGRATION_KEY}': {exc}")
        # Não fazer raise — migration não-crítica, server pode arrancar


async def migrate_cleanup_orphan_taken_by_year(db: AsyncIOMotorDatabase):
    """Remove entries em vacation_taken_by_year para anos < company_start_date
    de cada utilizador. Estes valores fantasma polúiam a lógica de carry-over.
    """
    MIGRATION_KEY = "cleanup_orphan_vacation_taken_by_year_v1"

    migration_done = await db.migrations.find_one({"key": MIGRATION_KEY})
    if migration_done:
        logger.info(f"✅ Migração '{MIGRATION_KEY}' já foi executada.")
        return

    logger.info(f"🔄 A executar migração '{MIGRATION_KEY}'…")

    try:
        from datetime import datetime as _dt

        balances = await db.vacation_balances.find({}, {"_id": 0}).to_list(None)
        total_removed = 0
        for b in balances:
            csd = b.get("company_start_date")
            if not csd:
                continue
            try:
                min_y = _dt.strptime(csd, "%Y-%m-%d").date().year
            except Exception:
                continue
            r = await db.vacation_taken_by_year.delete_many(
                {"user_id": b["user_id"], "year": {"$lt": min_y}}
            )
            total_removed += r.deleted_count or 0

        await db.migrations.insert_one({
            "key": MIGRATION_KEY,
            "executed_at": _dt.now().isoformat(),
            "removed_count": total_removed,
        })
        logger.info(f"✅ Migração '{MIGRATION_KEY}' concluída — {total_removed} entries removidas.")
    except Exception as exc:
        logger.error(f"❌ Erro na migração '{MIGRATION_KEY}': {exc}")
