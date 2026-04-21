"""
Chronometer Routes - Cronómetros de FS
Extracted from server.py
"""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from database import db
from models import CronometroOT
from server import get_current_user, get_now_local, parse_stored_datetime, log_app_error
from cronometro_logic import segmentar_periodo

router = APIRouter()

@router.post("/relatorios-tecnicos/{relatorio_id}/cronometro/iniciar")
async def iniciar_cronometro(
    relatorio_id: str,
    dados: dict,
    current_user: dict = Depends(get_current_user)
):
    """Iniciar cronómetro de Trabalho ou Viagem para um técnico"""
    tipo = dados.get("tipo")  # "trabalho" ou "viagem"
    tecnico_id = dados.get("tecnico_id")
    tecnico_nome = dados.get("tecnico_nome")
    funcao_ot = dados.get("funcao_ot", "tecnico")  # "junior", "tecnico" ou "senior"
    km_inicial = float(dados.get("km_inicial", 0))  # Km's iniciais para viagem
    
    if tipo not in ["trabalho", "viagem", "oficina"]:
        raise HTTPException(status_code=400, detail="Tipo deve ser 'trabalho', 'viagem' ou 'oficina'")
    
    # Verificar se já existe cronómetro ativo para este técnico nesta OT
    cronometro_ativo = await db.cronometros_ot.find_one({
        "relatorio_id": relatorio_id,
        "tecnico_id": tecnico_id,
        "tipo": tipo,
        "ativo": True
    })
    
    if cronometro_ativo:
        raise HTTPException(status_code=400, detail=f"Cronómetro de {tipo} já está ativo")
    
    # Criar novo cronómetro
    cronometro = CronometroOT(
        relatorio_id=relatorio_id,
        tecnico_id=tecnico_id,
        tecnico_nome=tecnico_nome,
        tipo=tipo,
        funcao_ot=funcao_ot,
        km_inicial=km_inicial,
        hora_inicio=get_now_local(),
        ativo=True
    )
    
    cronometro_dict = cronometro.dict()
    cronometro_dict["hora_inicio"] = cronometro_dict["hora_inicio"].isoformat()
    
    await db.cronometros_ot.insert_one(cronometro_dict)
    
    logging.info(f"Cronómetro {tipo} iniciado para {tecnico_nome} na OT {relatorio_id}")
    
    # Remover _id para evitar erro de serialização
    cronometro_dict.pop("_id", None)
    
    return {"message": f"Cronómetro de {tipo} iniciado", "cronometro": cronometro_dict}

@router.post("/relatorios-tecnicos/{relatorio_id}/cronometro/parar")
async def parar_cronometro(
    relatorio_id: str,
    dados: dict,
    current_user: dict = Depends(get_current_user)
):
    """Parar cronómetro e gerar registos segmentados"""
    tipo = dados.get("tipo")
    tecnico_id = dados.get("tecnico_id")
    km_final = float(dados.get("km_final", 0))
    work_km_inicial = float(dados.get("work_km_inicial", 0))
    work_km_final = float(dados.get("work_km_final", 0))
    
    # Buscar cronómetro ativo
    cronometro = await db.cronometros_ot.find_one({
        "relatorio_id": relatorio_id,
        "tecnico_id": tecnico_id,
        "tipo": tipo,
        "ativo": True
    })
    
    if not cronometro:
        raise HTTPException(status_code=404, detail="Cronómetro não encontrado ou já parado")
    
    # Hora de fim
    hora_fim = get_now_local()
    hora_inicio = parse_stored_datetime(cronometro["hora_inicio"])
    
    # Buscar OT para pegar os KM
    ot = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    km_ot = 0
    if ot:
        # Buscar técnico na OT para pegar KM
        tecnico_ot = await db.tecnicos_relatorio.find_one({
            "relatorio_id": relatorio_id,
            "tecnico_id": tecnico_id
        }, {"_id": 0})
        if tecnico_ot:
            km_ot = tecnico_ot.get("kms_deslocacao", 0)
    
    # Segmentar período
    segmentos = segmentar_periodo(hora_inicio, hora_fim, tipo)
    
    # Obter funcao_ot e km_inicial do cronómetro
    funcao_ot = cronometro.get("funcao_ot", "tecnico")
    km_inicial_crono = cronometro.get("km_inicial", 0)
    
    # Criar registos
    registos_criados = []
    for i, seg in enumerate(segmentos):
        km_segmento = 0 if tipo == "viagem" else km_ot
        
        registo = RegistoTecnicoOT(
            relatorio_id=relatorio_id,
            tecnico_id=tecnico_id,
            tecnico_nome=cronometro["tecnico_nome"],
            tipo=tipo,
            funcao_ot=funcao_ot,
            data=seg["data"],
            hora_inicio_segmento=seg["hora_inicio_segmento"],
            hora_fim_segmento=seg["hora_fim_segmento"],
            horas_arredondadas=seg["horas_arredondadas"],
            km=km_segmento,
            codigo=seg["codigo"]
        )
        
        registo_dict = registo.model_dump()
        # Guardar minutos_trabalhados (campo não está no modelo mas é necessário)
        registo_dict["minutos_trabalhados"] = int(seg["duracao_minutos"])
        registo_dict["origem"] = "cronometro"
        # Guardar km_inicial no primeiro registo de viagem
        if i == 0 and tipo == "viagem" and km_inicial_crono > 0:
            registo_dict["kms_inicial"] = km_inicial_crono
        # Guardar km_final no último registo de viagem e calcular km total
        if i == len(segmentos) - 1 and tipo == "viagem" and km_final > 0:
            registo_dict["kms_final"] = km_final
            if km_inicial_crono > 0:
                registo_dict["km"] = max(0, km_final - km_inicial_crono)
        # Deslocação durante trabalho: guardar KMs e observação
        if tipo == "trabalho" and work_km_inicial > 0 and work_km_final > 0:
            if i == 0:
                registo_dict["kms_inicial"] = work_km_inicial
                registo_dict["kms_final"] = work_km_final
                registo_dict["km"] = max(0, work_km_final - work_km_inicial)
                registo_dict["observacoes"] = "Deslocação durante Trabalho"
        registo_dict["data"] = registo_dict["data"].isoformat()
        registo_dict["hora_inicio_segmento"] = registo_dict["hora_inicio_segmento"].isoformat()
        registo_dict["hora_fim_segmento"] = registo_dict["hora_fim_segmento"].isoformat()
        registo_dict["created_at"] = registo_dict["created_at"].isoformat()
        
        await db.registos_tecnico_ot.insert_one(registo_dict)
        registo_dict.pop("_id", None)
        registos_criados.append(registo_dict)
    
    # Desativar cronómetro
    await db.cronometros_ot.update_one(
        {"id": cronometro["id"]},
        {"$set": {"ativo": False, "hora_fim": hora_fim.isoformat()}}
    )
    
    logging.info(f"Cronómetro {tipo} parado. {len(segmentos)} registos criados para {cronometro['tecnico_nome']}")
    
    return {
        "message": f"Cronómetro parado. {len(segmentos)} registo(s) criado(s)",
        "registos": registos_criados
    }

@router.get("/relatorios-tecnicos/{relatorio_id}/cronometros")
async def get_cronometros_ativos(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar cronómetros ativos de uma OT"""
    cronometros = await db.cronometros_ot.find(
        {"relatorio_id": relatorio_id, "ativo": True},
        {"_id": 0}
    ).to_list(length=None)
    
    return cronometros

