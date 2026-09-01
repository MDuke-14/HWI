"""
Relatórios Técnicos (Folhas de Serviço) Routes
CRUD, técnicos, intervenções, fotografias, equipamentos, assinaturas, PDF, email
Extracted from server.py
"""
import logging
import uuid
import base64
import io
import os
import aiosmtplib
from io import BytesIO
from pathlib import Path
from datetime import datetime, timezone, date, time, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import Response, StreamingResponse, FileResponse
from typing import Optional

from database import db
from models import (
    RelatorioTecnico, RelatorioTecnicoCreate, IntervencaoRelatorio,
    EquipamentoOT, EnviarEmailRequest, Equipamento,
    TecnicoRelatorio, AssinaturaRelatorio,
    FaturacaoAlocacao, FaturacaoIntervencao, FaturacaoIntervencaoRequest,
    CriarContinuidadeRequest,
)
from server import (
    get_current_user, get_now_local, log_app_error,
    send_reference_link_email,
)
from ot_pdf_report import generate_ot_pdf
from folha_horas_pdf import generate_folha_horas_pdf

router = APIRouter()


# ============================================================================
# Streaming helper para PDFs grandes (FS com muitas fotos)
# ----------------------------------------------------------------------------
# Em vez de aguardar a geração completa em memória e só depois enviar o PDF
# para o cliente, escrevemos directamente para um ficheiro temporário num
# thread separado e fazemos "tail-read" desse ficheiro à medida que ele
# cresce. Isto faz com que o gateway (Cloudflare / K8s ingress) receba bytes
# de forma contínua durante a geração — evitando o timeout de inactividade
# (~100s) que corta a ligação em FS com 20+ fotografias.
# ============================================================================
async def stream_pdf_via_tempfile(generate_fn, *args, **kwargs):
    """Gera PDF num thread escrevendo num tempfile; produz chunks em streaming."""
    import asyncio
    import tempfile
    import threading
    import os as _os

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".pdf", prefix="fs_pdf_")
    _os.close(tmp_fd)

    done_event = threading.Event()
    error_holder: list = []

    def _worker():
        try:
            # generate_fn DEVE aceitar output_file= (path string)
            generate_fn(*args, output_file=tmp_path, **kwargs)
        except Exception as e:
            error_holder.append(e)
        finally:
            done_event.set()

    # Lançar a geração em background thread
    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()

    position = 0
    CHUNK_SIZE = 64 * 1024  # 64 KB
    POLL_INTERVAL = 0.4     # segundos entre poll do ficheiro

    try:
        while True:
            try:
                current_size = _os.path.getsize(tmp_path)
            except FileNotFoundError:
                current_size = 0

            if current_size > position:
                # Há novos bytes para enviar
                with open(tmp_path, "rb") as f:
                    f.seek(position)
                    while True:
                        chunk = f.read(CHUNK_SIZE)
                        if not chunk:
                            break
                        position += len(chunk)
                        yield chunk

            if done_event.is_set():
                # Geração terminou — verificar se há bytes finais
                try:
                    final_size = _os.path.getsize(tmp_path)
                except FileNotFoundError:
                    final_size = 0
                if final_size > position:
                    with open(tmp_path, "rb") as f:
                        f.seek(position)
                        while True:
                            chunk = f.read(CHUNK_SIZE)
                            if not chunk:
                                break
                            position += len(chunk)
                            yield chunk
                if error_holder:
                    # Algo falhou no worker — propaga
                    raise error_holder[0]
                break

            await asyncio.sleep(POLL_INTERVAL)
    finally:
        try:
            _os.unlink(tmp_path)
        except Exception:
            pass

@router.post("/relatorios-tecnicos", response_model=RelatorioTecnico)
async def create_relatorio(
    relatorio_data: RelatorioTecnicoCreate,
    current_user: dict = Depends(get_current_user)
):
    """Criar novo relatório técnico"""
    # Buscar dados do cliente
    cliente = await db.clientes.find_one({"id": relatorio_data.cliente_id}, {"_id": 0})
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    # Buscar dados do usuário (técnico)
    user = await db.users.find_one({"id": current_user["sub"]}, {"_id": 0})
    
    # Gerar número de assistência (último número + 1, mínimo 354)
    last_relatorio = await db.relatorios_tecnicos.find_one(
        {},
        sort=[("numero_assistencia", -1)]
    )
    last_numero = last_relatorio.get("numero_assistencia", 0) if last_relatorio else 0
    numero_assistencia = max(last_numero + 1, 354)  # Começar no mínimo em 354
    
    # Criar relatório
    relatorio = RelatorioTecnico(
        numero_assistencia=numero_assistencia,
        cliente_id=relatorio_data.cliente_id,
        created_by_id=current_user["sub"],
        cliente_nome=cliente["nome"],
        data_servico=relatorio_data.data_servico,
        data_fim=relatorio_data.data_fim,
        local_intervencao=relatorio_data.local_intervencao,
        pedido_por=relatorio_data.pedido_por,
        contacto_pedido=relatorio_data.contacto_pedido,
        ot_relacionada_id=relatorio_data.ot_relacionada_id,
        equipamento_tipologia=relatorio_data.equipamento_tipologia,
        equipamento_marca=relatorio_data.equipamento_marca,
        equipamento_modelo=relatorio_data.equipamento_modelo,
        equipamento_numero_serie=relatorio_data.equipamento_numero_serie,
        motivo_assistencia=relatorio_data.motivo_assistencia
    )
    
    relatorio_dict = relatorio.dict()
    relatorio_dict["data_criacao"] = relatorio_dict["data_criacao"].isoformat()
    relatorio_dict["data_servico"] = relatorio_dict["data_servico"].isoformat()
    if relatorio_dict.get("data_fim"):
        relatorio_dict["data_fim"] = relatorio_dict["data_fim"].isoformat()
    
    await db.relatorios_tecnicos.insert_one(relatorio_dict)
    
    # Criar/atualizar equipamento automaticamente (somente se marca e modelo forem fornecidos)
    if relatorio_data.equipamento_marca and relatorio_data.equipamento_modelo:
        equipamento_existente = await db.equipamentos.find_one({
            "cliente_id": relatorio_data.cliente_id,
            "marca": relatorio_data.equipamento_marca,
            "modelo": relatorio_data.equipamento_modelo,
            "numero_serie": relatorio_data.equipamento_numero_serie if relatorio_data.equipamento_numero_serie else None,
            "ativo": True
        })
        
        if equipamento_existente:
            # Atualizar last_used
            await db.equipamentos.update_one(
                {"id": equipamento_existente["id"]},
                {"$set": {"last_used": datetime.now(timezone.utc).isoformat()}}
            )
        else:
            # Criar novo equipamento
            novo_equipamento = Equipamento(
                cliente_id=relatorio_data.cliente_id,
                tipologia=relatorio_data.equipamento_tipologia or "",
                marca=relatorio_data.equipamento_marca,
                modelo=relatorio_data.equipamento_modelo,
                numero_serie=relatorio_data.equipamento_numero_serie,
                ano_fabrico=relatorio_data.equipamento_ano_fabrico,
                last_used=datetime.now(timezone.utc)
            )
            
            equipamento_dict = novo_equipamento.dict()
            equipamento_dict["created_at"] = equipamento_dict["created_at"].isoformat()
            equipamento_dict["last_used"] = equipamento_dict["last_used"].isoformat()
            
            await db.equipamentos.insert_one(equipamento_dict)
            logging.info(f"Equipamento criado automaticamente: {novo_equipamento.marca} {novo_equipamento.modelo}")
    
    logging.info(f"Relatório técnico criado: {numero_assistencia} por {current_user['sub']}")
    
    # Enviar email de referência interna automaticamente se cliente tiver flag ativa
    ref_email = cliente.get("email_referencia_interna") or cliente.get("email")
    if cliente.get("incluir_referencia_interna") and ref_email:
        try:
            token_str = str(uuid.uuid4())
            ref_token_doc = {
                "id": str(uuid.uuid4()),
                "token": token_str,
                "relatorio_id": relatorio.id,
                "cliente_id": relatorio_data.cliente_id,
                "used": False,
                "referencia": None,
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.reference_tokens.insert_one(ref_token_doc)
            
            frontend_url = os.environ.get('FRONTEND_URL', '').rstrip('/')
            link = f"{frontend_url}/reference/{token_str}"
            await send_reference_link_email(
                client_email=ref_email,
                client_name=cliente["nome"],
                fs_number=numero_assistencia,
                reference_link=link
            )
            logging.info(f"Email de referência interna enviado para {ref_email} (FS#{numero_assistencia})")
        except Exception as e:
            logging.error(f"Erro ao enviar email de referência interna: {e}")
    
    return relatorio


@router.post("/relatorios-tecnicos/{relatorio_id}/criar-fs-relacionada")
async def criar_fs_relacionada(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Criar nova FS automaticamente ligada a uma FS existente (concluída)"""
    original = await db.relatorios_tecnicos.find_one(
        {"id": relatorio_id}, {"_id": 0}
    )
    if not original:
        raise HTTPException(status_code=404, detail="FS original não encontrada")
    
    # Gerar número de assistência
    last_relatorio = await db.relatorios_tecnicos.find_one(
        {}, sort=[("numero_assistencia", -1)]
    )
    last_numero = last_relatorio.get("numero_assistencia", 0) if last_relatorio else 0
    numero_assistencia = max(last_numero + 1, 354)
    
    # Criar nova FS copiando dados relevantes da original
    nova_fs = {
        "id": str(uuid.uuid4()),
        "numero_assistencia": numero_assistencia,
        "status": "em_execucao",
        "data_criacao": datetime.now(timezone.utc).isoformat(),
        "data_servico": date.today().isoformat(),
        "data_fim": None,
        "data_conclusao": None,
        "cliente_id": original["cliente_id"],
        "created_by_id": current_user["sub"],
        "cliente_nome": original.get("cliente_nome", ""),
        "local_intervencao": original.get("local_intervencao", ""),
        "pedido_por": original.get("pedido_por", ""),
        "contacto_pedido": original.get("contacto_pedido"),
        "equipamento_tipologia": original.get("equipamento_tipologia"),
        "equipamento_marca": original.get("equipamento_marca"),
        "equipamento_modelo": original.get("equipamento_modelo"),
        "equipamento_numero_serie": original.get("equipamento_numero_serie"),
        "equipamento_ano_fabrico": original.get("equipamento_ano_fabrico"),
        "equipamento_horas_funcionamento": original.get("equipamento_horas_funcionamento"),
        "motivo_assistencia": original.get("motivo_assistencia", ""),
        "referencia_interna_cliente": original.get("referencia_interna_cliente"),
        "km_inicial": None,
        "ot_relacionada_id": relatorio_id,
        "diagnostico": None,
        "acoes_realizadas": None,
        "resolucao": None,
        "problema_resolvido": False,
        "relatorio_assistencia": None
    }
    
    await db.relatorios_tecnicos.insert_one(nova_fs)
    
    # Copiar equipamentos associados
    equipamentos_orig = await db.equipamentos_relatorio.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).to_list(100)
    for eq in equipamentos_orig:
        novo_eq = {**eq, "id": str(uuid.uuid4()), "relatorio_id": nova_fs["id"]}
        await db.equipamentos_relatorio.insert_one(novo_eq)
    
    # Audit log
    await db.audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "action": "criar_fs_relacionada",
        "user_id": current_user["sub"],
        "username": current_user.get("username", ""),
        "original_fs_id": relatorio_id,
        "original_fs_numero": original.get("numero_assistencia"),
        "nova_fs_id": nova_fs["id"],
        "nova_fs_numero": numero_assistencia,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    logging.info(f"FS #{numero_assistencia} criada como relacionada da FS #{original.get('numero_assistencia')} por {current_user['sub']}")
    
    # Remove _id if present
    nova_fs.pop("_id", None)
    nova_fs["ot_relacionada_numero"] = original.get("numero_assistencia")
    return nova_fs

@router.get("/relatorios-tecnicos")
async def get_relatorios(
    status: Optional[str] = None,
    cliente_id: Optional[str] = None,
    limit: int = 100,
    skip: int = 0,
    current_user: dict = Depends(get_current_user)
):
    """Listar relatórios técnicos - visível para todos os utilizadores"""
    query = {}
    
    # Filtros opcionais
    if status:
        query["status"] = status
    if cliente_id:
        query["cliente_id"] = cliente_id
    
    # Buscar relatórios com paginação
    relatorios = await db.relatorios_tecnicos.find(
        query,
        {"_id": 0}
    ).sort("numero_assistencia", -1).skip(skip).limit(limit).to_list(limit)
    
    if not relatorios:
        return relatorios
    
    # Buscar contagem de equipamentos em batch (uma única query)
    relatorio_ids = [r.get("id") for r in relatorios]
    
    # Agregação para contar equipamentos por relatório
    equipamentos_pipeline = [
        {"$match": {"relatorio_id": {"$in": relatorio_ids}}},
        {"$group": {"_id": "$relatorio_id", "count": {"$sum": 1}}}
    ]
    equipamentos_counts = await db.equipamentos_ot.aggregate(equipamentos_pipeline).to_list(None)
    
    # Criar mapa de contagens
    counts_map = {item["_id"]: item["count"] for item in equipamentos_counts}
    
    # Buscar primeiro equipamento de cada OT que tem exatamente 1 equipamento na coleção
    single_equip_ids = [rid for rid in relatorio_ids if counts_map.get(rid, 0) == 1]
    single_equip_map = {}
    if single_equip_ids:
        single_equips = await db.equipamentos_ot.find(
            {"relatorio_id": {"$in": single_equip_ids}},
            {"_id": 0, "relatorio_id": 1, "tipologia": 1, "marca": 1}
        ).to_list(None)
        for eq in single_equips:
            single_equip_map[eq["relatorio_id"]] = eq
    
    # Processar relatórios
    for relatorio in relatorios:
        relatorio_id = relatorio.get("id")
        equipamentos_count = counts_map.get(relatorio_id, 0)
        
        # Verificar se tem equipamento principal (campos directos na OT)
        tem_equip_principal = bool(
            relatorio.get("equipamento_marca") or 
            relatorio.get("equipamento_tipologia") or 
            relatorio.get("equipamento_modelo")
        )
        
        # Calcular total de equipamentos
        total_equipamentos = equipamentos_count + (1 if tem_equip_principal else 0)
        
        # Definir texto a mostrar
        if total_equipamentos == 0:
            relatorio["equipamento_display"] = "Não especificado"
        elif total_equipamentos == 1:
            if tem_equip_principal:
                parts = []
                if relatorio.get("equipamento_tipologia"):
                    parts.append(relatorio["equipamento_tipologia"])
                if relatorio.get("equipamento_marca"):
                    parts.append(relatorio["equipamento_marca"])
                relatorio["equipamento_display"] = " - ".join(parts) if parts else "Equipamento"
            else:
                eq = single_equip_map.get(relatorio_id, {})
                parts = []
                if eq.get("tipologia"):
                    parts.append(eq["tipologia"])
                if eq.get("marca"):
                    parts.append(eq["marca"])
                relatorio["equipamento_display"] = " - ".join(parts) if parts else "Equipamento"
        else:
            relatorio["equipamento_display"] = "Vários"
        
        relatorio["equipamentos_count"] = total_equipamentos
    
    # Enriquecer com info de OTs relacionadas (forward + reverse)
    # Forward: esta OT tem ot_relacionada_id (aponta para OT anterior)
    # Reverse: outras OTs apontam para esta OT (OTs posteriores)
    ids_relacionadas = set()
    for r in relatorios:
        if r.get("ot_relacionada_id"):
            ids_relacionadas.add(r["ot_relacionada_id"])
    # Buscar OTs posteriores que apontam para as OTs actuais
    reverse_refs = await db.relatorios_tecnicos.find(
        {"ot_relacionada_id": {"$in": relatorio_ids}},
        {"_id": 0, "id": 1, "numero_assistencia": 1, "ot_relacionada_id": 1}
    ).to_list(None)
    reverse_map = {}
    for ref in reverse_refs:
        parent_id = ref["ot_relacionada_id"]
        if parent_id not in reverse_map:
            reverse_map[parent_id] = []
        reverse_map[parent_id].append({
            "id": ref["id"],
            "numero_assistencia": ref["numero_assistencia"]
        })
    
    # Buscar info das OTs relacionadas anteriores
    if ids_relacionadas:
        ots_relacionadas = await db.relatorios_tecnicos.find(
            {"id": {"$in": list(ids_relacionadas)}},
            {"_id": 0, "id": 1, "numero_assistencia": 1}
        ).to_list(None)
        ots_rel_map = {r["id"]: r for r in ots_relacionadas}
    else:
        ots_rel_map = {}
    
    for relatorio in relatorios:
        rid = relatorio.get("id")
        # Forward reference: OT anterior
        if relatorio.get("ot_relacionada_id") and relatorio["ot_relacionada_id"] in ots_rel_map:
            ref = ots_rel_map[relatorio["ot_relacionada_id"]]
            relatorio["ot_relacionada_numero"] = ref.get("numero_assistencia")
        # Reverse reference: OTs posteriores
        if rid in reverse_map:
            relatorio["ots_posteriores"] = reverse_map[rid]
    
    return relatorios

@router.get("/relatorios-tecnicos/{relatorio_id}", response_model=RelatorioTecnico)
async def get_relatorio(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obter relatório técnico específico - visível para todos os utilizadores"""
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    return relatorio

@router.put("/relatorios-tecnicos/{relatorio_id}", response_model=RelatorioTecnico)
async def update_relatorio(
    relatorio_id: str,
    relatorio_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar relatório técnico"""
    existing = await db.relatorios_tecnicos.find_one({"id": relatorio_id})
    
    if not existing:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Verificar permissão
    if not current_user.get("is_admin", False) and existing["tecnico_id"] != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Sem permissão para editar este relatório")
    
    # Validar mudança de status "facturado" - apenas admin
    if "status" in relatorio_data and relatorio_data["status"] == "facturado":
        if not current_user.get("is_admin", False):
            raise HTTPException(
                status_code=403, 
                detail="Apenas administradores podem marcar FS's como 'Facturado'"
            )
    
    # Remover campos que não devem ser atualizados
    relatorio_data.pop("id", None)
    relatorio_data.pop("numero_assistencia", None)
    relatorio_data.pop("data_criacao", None)
    relatorio_data.pop("created_by_id", None)
    
    await db.relatorios_tecnicos.update_one(
        {"id": relatorio_id},
        {"$set": relatorio_data}
    )
    
    updated = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    
    logging.info(f"Relatório técnico atualizado: {relatorio_id} por {current_user['sub']}")
    
    return updated

@router.delete("/relatorios-tecnicos/{relatorio_id}")
async def delete_relatorio(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Deletar relatório técnico (apenas admin)"""
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Apenas administradores podem deletar relatórios")
    
    result = await db.relatorios_tecnicos.delete_one({"id": relatorio_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    logging.info(f"Relatório técnico deletado: {relatorio_id} por {current_user['sub']}")
    
    return {"message": "Relatório deletado com sucesso"}

@router.patch("/relatorios-tecnicos/{relatorio_id}/status")
async def update_relatorio_status(
    relatorio_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar status do relatório"""
    status = data.get("status")
    valid_status = ["agendado", "orcamento", "em_execucao", "em_andamento", "concluido", "facturado", "enviado", "rascunho"]
    if status not in valid_status:
        raise HTTPException(status_code=400, detail=f"Status inválido. Use: {', '.join(valid_status)}")
    
    existing = await db.relatorios_tecnicos.find_one({"id": relatorio_id})
    
    if not existing:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Todos os utilizadores autenticados podem mudar o status
    update_data = {"status": status}
    if status == "concluido":
        update_data["data_conclusao"] = datetime.now(timezone.utc).isoformat()
    
    await db.relatorios_tecnicos.update_one(
        {"id": relatorio_id},
        {"$set": update_data}
    )
    
    return {"message": f"Status atualizado para {status}"}

# ============ Técnicos do Relatório Routes ============

@router.get("/relatorios-tecnicos/{relatorio_id}/tecnicos")
async def get_tecnicos_relatorio(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar técnicos atribuídos a um relatório"""
    # Verificar se relatório existe
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Buscar técnicos manuais - ordenados cronologicamente
    tecnicos = await db.tecnicos_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort([("data_trabalho", 1), ("hora_inicio", 1)]).to_list(100)
    
    return tecnicos

@router.post("/relatorios-tecnicos/{relatorio_id}/tecnicos")
async def add_tecnico_relatorio(
    relatorio_id: str,
    tecnico_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Adicionar técnico a um relatório com segmentação automática por código horário"""
    from cronometro_logic import segmentar_periodo, get_codigo_horario
    
    # Verificar se relatório existe
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Verificar se é o primeiro técnico - para usar km_inicial da OT
    existing_tecnicos_count = await db.tecnicos_relatorio.count_documents({"relatorio_id": relatorio_id})
    existing_registos_count = await db.registos_tecnico_ot.count_documents({"relatorio_id": relatorio_id})
    is_first_tecnico = (existing_tecnicos_count == 0 and existing_registos_count == 0)
    
    # Obter dados básicos
    tecnico_id_user = tecnico_data.get("tecnico_id", "")
    tecnico_nome = tecnico_data.get("tecnico_nome", "")
    tipo_registo = tecnico_data.get("tipo_registo", "manual")
    funcao_ot = tecnico_data.get("funcao_ot", "tecnico")
    data_trabalho_str = tecnico_data.get("data_trabalho")
    hora_inicio_str = tecnico_data.get("hora_inicio")
    hora_fim_str = tecnico_data.get("hora_fim")
    
    # Calcular kms - Se é o primeiro técnico e não tem kms_inicial definido, usar da OT
    kms_inicial = float(tecnico_data.get("kms_inicial", 0))
    if is_first_tecnico and kms_inicial == 0 and relatorio.get("km_inicial"):
        kms_inicial = float(relatorio.get("km_inicial", 0))
        logging.info(f"Usando km_inicial da OT ({kms_inicial}) para o primeiro técnico")
    
    kms_final = float(tecnico_data.get("kms_final", 0))
    kms_inicial_volta = float(tecnico_data.get("kms_inicial_volta", 0))
    kms_final_volta = float(tecnico_data.get("kms_final_volta", 0))
    kms_ida = max(0, kms_final - kms_inicial)
    kms_volta = max(0, kms_final_volta - kms_inicial_volta)
    kms_deslocacao = kms_ida + kms_volta
    
    # Se temos hora_inicio e hora_fim, fazer segmentação
    if hora_inicio_str and hora_fim_str and data_trabalho_str:
        try:
            # Parse data e horas
            if isinstance(data_trabalho_str, str):
                data_obj = datetime.strptime(data_trabalho_str.split('T')[0], "%Y-%m-%d").date()
            else:
                data_obj = data_trabalho_str
            
            hora_inicio_parts = hora_inicio_str.split(":")
            hora_fim_parts = hora_fim_str.split(":")
            
            # Criar datetime sem timezone (hora local portuguesa)
            hora_inicio = datetime.combine(
                data_obj,
                time(int(hora_inicio_parts[0]), int(hora_inicio_parts[1]))
            )
            hora_fim = datetime.combine(
                data_obj,
                time(int(hora_fim_parts[0]), int(hora_fim_parts[1]))
            )
            
            # Se hora fim <= hora início, passa para dia seguinte
            if hora_fim <= hora_inicio:
                hora_fim = hora_fim + timedelta(days=1)
            
            # Segmentar período
            segmentos = segmentar_periodo(hora_inicio, hora_fim, tipo_registo)
            
            registos_criados = []
            for i, seg in enumerate(segmentos):
                registo = {
                    "id": str(uuid.uuid4()),
                    "relatorio_id": relatorio_id,
                    "tecnico_id": tecnico_id_user,
                    "tecnico_nome": tecnico_nome,
                    "tipo": tipo_registo,
                    "funcao_ot": funcao_ot,
                    "data": seg["data"].isoformat(),
                    "hora_inicio_segmento": seg["hora_inicio_segmento"].isoformat(),
                    "hora_fim_segmento": seg["hora_fim_segmento"].isoformat(),
                    "horas_arredondadas": seg["horas_arredondadas"],
                    "minutos_trabalhados": int(seg["duracao_minutos"]),
                    "km": kms_deslocacao if i == 0 else 0,  # KMs apenas no primeiro segmento
                    "kms_inicial": kms_inicial if i == 0 else 0,
                    "kms_final": kms_final if i == 0 else 0,
                    "kms_inicial_volta": kms_inicial_volta if i == 0 else 0,
                    "kms_final_volta": kms_final_volta if i == 0 else 0,
                    "kms_deslocacao": kms_deslocacao if i == 0 else 0,
                    "codigo": seg["codigo"],
                    "origem": "manual",
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                await db.registos_tecnico_ot.insert_one(registo)
                registo.pop("_id", None)
                registos_criados.append(registo)
            
            logging.info(f"Técnico adicionado com segmentação ao relatório {relatorio_id}: {tecnico_nome} - {len(registos_criados)} segmento(s)")
            
            return {"message": f"{len(registos_criados)} registo(s) criado(s)", "registos": registos_criados}
            
        except Exception as e:
            logging.error(f"Erro na segmentação: {str(e)}")
            # Fallback para registo único se segmentação falhar
    
    # Sem hora_inicio/hora_fim ou fallback - criar registo tradicional
    count = await db.tecnicos_relatorio.count_documents({"relatorio_id": relatorio_id})
    
    tecnico = TecnicoRelatorio(
        relatorio_id=relatorio_id,
        tecnico_id=tecnico_id_user,
        tecnico_nome=tecnico_nome,
        minutos_cliente=tecnico_data.get("minutos_cliente", 0),
        kms_inicial=kms_inicial,
        kms_final=kms_final,
        kms_inicial_volta=kms_inicial_volta,
        kms_final_volta=kms_final_volta,
        kms_deslocacao=kms_deslocacao,
        tipo_horario=tecnico_data.get("tipo_horario", "diurno"),
        tipo_registo=tipo_registo,
        funcao_ot=funcao_ot,
        data_trabalho=data_trabalho_str if data_trabalho_str else get_now_local().date(),
        hora_inicio=hora_inicio_str,
        hora_fim=hora_fim_str,
        incluir_pausa=tecnico_data.get("incluir_pausa", False),
        ordem=count
    )
    
    tecnico_dict = tecnico.dict()
    if isinstance(tecnico_dict.get("data_trabalho"), date):
        tecnico_dict["data_trabalho"] = tecnico_dict["data_trabalho"].isoformat()
    await db.tecnicos_relatorio.insert_one(tecnico_dict)
    
    logging.info(f"Técnico adicionado ao relatório {relatorio_id}: {tecnico_nome}")
    
    return tecnico

@router.put("/relatorios-tecnicos/{relatorio_id}/tecnicos/{tecnico_id}")
async def update_tecnico_relatorio(
    relatorio_id: str,
    tecnico_id: str,
    tecnico_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar dados de um técnico no relatório"""
    from cronometro_logic import arredondar_horas
    
    # Verificar se técnico existe
    existing = await db.tecnicos_relatorio.find_one({
        "id": tecnico_id,
        "relatorio_id": relatorio_id
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Técnico não encontrado")
    
    # Atualizar campos editáveis
    update_data = {}
    if "tecnico_nome" in tecnico_data:
        update_data["tecnico_nome"] = tecnico_data["tecnico_nome"]
    if "minutos_cliente" in tecnico_data:
        minutos_raw = tecnico_data["minutos_cliente"]
        tipo_reg = existing.get("tipo", "trabalho")
        horas_arred = minutos_raw / 60 if tipo_reg == "viagem" else arredondar_horas(minutos_raw)
        update_data["minutos_cliente"] = minutos_raw
        update_data["horas_arredondadas"] = horas_arred
    
    # Atualizar kms ida
    if "kms_inicial" in tecnico_data:
        update_data["kms_inicial"] = float(tecnico_data["kms_inicial"])
    if "kms_final" in tecnico_data:
        update_data["kms_final"] = float(tecnico_data["kms_final"])
    
    # Atualizar kms volta
    if "kms_inicial_volta" in tecnico_data:
        update_data["kms_inicial_volta"] = float(tecnico_data["kms_inicial_volta"])
    if "kms_final_volta" in tecnico_data:
        update_data["kms_final_volta"] = float(tecnico_data["kms_final_volta"])
    
    # Se qualquer km foi atualizado, recalcular kms_deslocacao (ida + volta)
    if any(k in tecnico_data for k in ["kms_inicial", "kms_final", "kms_inicial_volta", "kms_final_volta"]):
        kms_inicial = float(tecnico_data.get("kms_inicial", existing.get("kms_inicial", 0)))
        kms_final = float(tecnico_data.get("kms_final", existing.get("kms_final", 0)))
        kms_inicial_volta = float(tecnico_data.get("kms_inicial_volta", existing.get("kms_inicial_volta", 0)))
        kms_final_volta = float(tecnico_data.get("kms_final_volta", existing.get("kms_final_volta", 0)))
        kms_ida = max(0, kms_final - kms_inicial)
        kms_volta = max(0, kms_final_volta - kms_inicial_volta)
        update_data["kms_deslocacao"] = kms_ida + kms_volta
    
    if "tipo_horario" in tecnico_data:
        update_data["tipo_horario"] = tecnico_data["tipo_horario"]
    if "tipo_registo" in tecnico_data:
        update_data["tipo_registo"] = tecnico_data["tipo_registo"]
    if "funcao_ot" in tecnico_data:
        update_data["funcao_ot"] = tecnico_data["funcao_ot"]
    if "data_trabalho" in tecnico_data:
        # Converter para string ISO se necessário
        if isinstance(tecnico_data["data_trabalho"], str):
            update_data["data_trabalho"] = tecnico_data["data_trabalho"]
        else:
            update_data["data_trabalho"] = tecnico_data["data_trabalho"].isoformat()
    # Novos campos para Folha de Horas
    if "hora_inicio" in tecnico_data:
        update_data["hora_inicio"] = tecnico_data["hora_inicio"]
    if "hora_fim" in tecnico_data:
        update_data["hora_fim"] = tecnico_data["hora_fim"]
    
    # Recalcular minutos e aplicar arredondamento quando as horas mudam
    h_inicio = tecnico_data.get("hora_inicio", existing.get("hora_inicio"))
    h_fim = tecnico_data.get("hora_fim", existing.get("hora_fim"))
    if ("hora_inicio" in tecnico_data or "hora_fim" in tecnico_data) and h_inicio and h_fim:
        try:
            parts_ini = h_inicio.split(":")
            parts_fim = h_fim.split(":")
            mins_ini = int(parts_ini[0]) * 60 + int(parts_ini[1])
            mins_fim = int(parts_fim[0]) * 60 + int(parts_fim[1])
            if mins_fim <= mins_ini:
                mins_fim += 24 * 60
            duracao = mins_fim - mins_ini
            
            incluir_pausa = tecnico_data.get("incluir_pausa", existing.get("incluir_pausa", False))
            if incluir_pausa:
                duracao = max(0, duracao - 60)
            
            tipo_reg = existing.get("tipo", "trabalho")
            horas_arred = duracao / 60 if tipo_reg == "viagem" else arredondar_horas(duracao)
            update_data["minutos_cliente"] = duracao
            update_data["horas_arredondadas"] = horas_arred
        except Exception as e:
            logging.error(f"Erro ao recalcular horas manuais: {str(e)}")
    
    if "incluir_pausa" in tecnico_data:
        update_data["incluir_pausa"] = tecnico_data["incluir_pausa"]
    
    # Salvaguarda: garantir arredondamento consistente mesmo em edições de outros campos
    if update_data and "horas_arredondadas" not in update_data:
        mins_existentes = existing.get("minutos_cliente", 0)
        horas_arred_existentes = existing.get("horas_arredondadas", 0)
        tipo_reg = existing.get("tipo", "trabalho")
        if mins_existentes > 0:
            horas_arred_correctas = mins_existentes / 60 if tipo_reg == "viagem" else arredondar_horas(mins_existentes)
            if abs(horas_arred_existentes - horas_arred_correctas) > 0.01:
                update_data["horas_arredondadas"] = horas_arred_correctas
    
    await db.tecnicos_relatorio.update_one(
        {"id": tecnico_id, "relatorio_id": relatorio_id},
        {"$set": update_data}
    )
    
    updated = await db.tecnicos_relatorio.find_one(
        {"id": tecnico_id, "relatorio_id": relatorio_id},
        {"_id": 0}
    )
    
    logging.info(f"Técnico {tecnico_id} atualizado no relatório {relatorio_id}")
    
    return updated

@router.delete("/relatorios-tecnicos/{relatorio_id}/tecnicos/{tecnico_id}")
async def delete_tecnico_relatorio(
    relatorio_id: str,
    tecnico_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remover técnico de um relatório"""
    result = await db.tecnicos_relatorio.delete_one({
        "id": tecnico_id,
        "relatorio_id": relatorio_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Técnico não encontrado")
    
    logging.info(f"Técnico {tecnico_id} removido do relatório {relatorio_id}")
    
    return {"message": "Técnico removido com sucesso"}

# ============ Intervenções Routes ============

@router.get("/relatorios-tecnicos/{relatorio_id}/intervencoes")
async def get_intervencoes(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar intervenções de um relatório"""
    intervencoes = await db.intervencoes_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("ordem", 1).to_list(length=None)
    
    return intervencoes

@router.post("/relatorios-tecnicos/{relatorio_id}/intervencoes", response_model=IntervencaoRelatorio)
async def add_intervencao(
    relatorio_id: str,
    intervencao: IntervencaoRelatorio,
    current_user: dict = Depends(get_current_user)
):
    """Adicionar intervenção a um relatório"""
    # Verificar se relatório existe
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Garantir que relatorio_id está correto
    intervencao.relatorio_id = relatorio_id
    
    # Converter data para string ISO
    intervencao_dict = intervencao.dict()
    intervencao_dict["data_intervencao"] = intervencao_dict["data_intervencao"].isoformat()
    intervencao_dict["created_at"] = intervencao_dict["created_at"].isoformat()
    
    await db.intervencoes_relatorio.insert_one(intervencao_dict)
    
    logging.info(f"Intervenção adicionada ao relatório {relatorio_id}")
    
    return intervencao

@router.put("/relatorios-tecnicos/{relatorio_id}/intervencoes/{intervencao_id}", response_model=IntervencaoRelatorio)
async def update_intervencao(
    relatorio_id: str,
    intervencao_id: str,
    intervencao_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar intervenção"""
    existing = await db.intervencoes_relatorio.find_one({
        "id": intervencao_id,
        "relatorio_id": relatorio_id
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Intervenção não encontrada")
    
    # Remover campos que não devem ser atualizados
    intervencao_data.pop("id", None)
    intervencao_data.pop("relatorio_id", None)
    intervencao_data.pop("created_at", None)
    
    # Converter data se for string
    if "data_intervencao" in intervencao_data and isinstance(intervencao_data["data_intervencao"], str):
        intervencao_data["data_intervencao"] = intervencao_data["data_intervencao"]
    
    await db.intervencoes_relatorio.update_one(
        {"id": intervencao_id},
        {"$set": intervencao_data}
    )
    
    updated = await db.intervencoes_relatorio.find_one({"id": intervencao_id}, {"_id": 0})
    
    logging.info(f"Intervenção {intervencao_id} atualizada no relatório {relatorio_id}")
    
    return updated

@router.delete("/relatorios-tecnicos/{relatorio_id}/intervencoes/{intervencao_id}")
async def delete_intervencao(
    relatorio_id: str,
    intervencao_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remover intervenção de um relatório"""
    result = await db.intervencoes_relatorio.delete_one({
        "id": intervencao_id,
        "relatorio_id": relatorio_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Intervenção não encontrada")
    
    logging.info(f"Intervenção {intervencao_id} removida do relatório {relatorio_id}")
    
    return {"message": "Intervenção removida com sucesso"}

# ============ Fotografias Routes ============

@router.post("/relatorios-tecnicos/{relatorio_id}/fotografias")
async def upload_fotografia(
    relatorio_id: str,
    file: UploadFile = File(...),
    descricao: str = Form(""),
    intervencao_id: str = Form(""),
    current_user: dict = Depends(get_current_user)
):
    """Upload de fotografia para um relatório técnico"""
    # Verificar se relatório existe
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Validar tipo de arquivo
    allowed_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'}
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Tipo de arquivo não permitido. Use: {', '.join(allowed_extensions)}"
        )
    
    try:
        # Ler o conteúdo do arquivo
        contents = await file.read()
        
        # Comprimir imagem para reduzir tamanho e melhorar performance
        import base64
        from io import BytesIO
        try:
            from PIL import Image
            # Registar decoder HEIC/HEIF (fotos iPhone) — no-op se já registado
            try:
                import pillow_heif
                pillow_heif.register_heif_opener()
            except Exception:
                pass
            img = Image.open(BytesIO(contents))
            # Corrigir orientação EXIF
            try:
                from PIL import ExifTags
                for orientation in ExifTags.TAGS.keys():
                    if ExifTags.TAGS[orientation] == 'Orientation':
                        break
                exif = img._getexif()
                if exif and orientation in exif:
                    if exif[orientation] == 3:
                        img = img.rotate(180, expand=True)
                    elif exif[orientation] == 6:
                        img = img.rotate(270, expand=True)
                    elif exif[orientation] == 8:
                        img = img.rotate(90, expand=True)
            except Exception:
                pass
            # Redimensionar se muito grande (max 1920px no lado maior)
            max_dim = 1920
            if max(img.size) > max_dim:
                img.thumbnail((max_dim, max_dim), Image.LANCZOS)
            # Converter para RGB se necessário (RGBA/P → JPEG)
            if img.mode in ('RGBA', 'P', 'LA'):
                img = img.convert('RGB')
            # Salvar como JPEG com qualidade 80%
            buffer = BytesIO()
            img.save(buffer, format='JPEG', quality=80, optimize=True)
            compressed = buffer.getvalue()
            foto_base64 = base64.b64encode(compressed).decode('utf-8')
            content_type = 'image/jpeg'
            # Gerar thumbnail (200px) para listagem rápida e PDF
            thumb = img.copy()
            thumb.thumbnail((200, 200), Image.LANCZOS)
            thumb_buffer = BytesIO()
            thumb.save(thumb_buffer, format='JPEG', quality=60, optimize=True)
            thumb_base64 = base64.b64encode(thumb_buffer.getvalue()).decode('utf-8')
            logging.info(f"Imagem comprimida: {len(contents)} -> {len(compressed)} bytes ({int(len(compressed)/len(contents)*100)}%)")
        except Exception as e:
            logging.warning(f"Não foi possível comprimir imagem, usando original: {e}")
            foto_base64 = base64.b64encode(contents).decode('utf-8')
            thumb_base64 = None
            content_type = file.content_type
        
        # Criar documento da foto
        foto_id = str(uuid.uuid4())
        # Ordem = último + 1 (fotos novas vão para o fim). Sem "ordem" ainda? assume -1.
        last = await db.fotos_relatorio.find_one(
            {"relatorio_id": relatorio_id},
            sort=[("ordem", -1)],
            projection={"ordem": 1},
        )
        ordem_val = int(last.get("ordem", -1)) + 1 if last else 0
        foto_doc = {
            "id": foto_id,
            "relatorio_id": relatorio_id,
            "intervencao_id": intervencao_id if intervencao_id else None,
            "foto_base64": foto_base64,
            "thumb_base64": thumb_base64,
            "descricao": descricao,
            "filename": file.filename,
            "content_type": content_type,
            "uploaded_at": datetime.now(timezone.utc),
            "uploaded_by": current_user["sub"],
            "ordem": ordem_val,
        }
        
        # Salvar no banco
        await db.fotos_relatorio.insert_one(foto_doc)
        
        logging.info(f"Fotografia {foto_id} adicionada ao relatório {relatorio_id}")
        
        return {
            "id": foto_id,
            "relatorio_id": relatorio_id,
            "descricao": descricao,
            "foto_url": f"/relatorios-tecnicos/{relatorio_id}/fotografias/{foto_id}/image",
            "uploaded_at": foto_doc["uploaded_at"]
        }
    except Exception as e:
        logging.error(f"Erro ao fazer upload de fotografia: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao fazer upload: {str(e)}")


# ============ Equipamentos OT Routes ============

@router.post("/relatorios-tecnicos/{relatorio_id}/equipamentos")
async def add_equipamento_ot(
    relatorio_id: str,
    equipamento_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Adicionar equipamento a uma OT"""
    # Verificar se OT existe
    ot = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not ot:
        raise HTTPException(status_code=404, detail="FS não encontrada")
    
    # Se for novo equipamento, criar também na base de dados do cliente
    criar_na_base_cliente = equipamento_data.get("criar_na_base_cliente", False)
    if criar_na_base_cliente and ot.get("cliente_id"):
        cliente_id = ot["cliente_id"]
        
        # Verificar se já existe equipamento igual no cliente
        existing = await db.equipamentos.find_one({
            "cliente_id": cliente_id,
            "marca": equipamento_data["marca"],
            "modelo": equipamento_data["modelo"],
            "numero_serie": equipamento_data.get("numero_serie"),
            "ativo": True
        })
        
        if not existing:
            # Criar novo equipamento na base do cliente
            novo_equipamento = Equipamento(
                cliente_id=cliente_id,
                tipologia=equipamento_data.get("tipologia"),
                marca=equipamento_data["marca"],
                modelo=equipamento_data["modelo"],
                numero_serie=equipamento_data.get("numero_serie"),
                ano_fabrico=equipamento_data.get("ano_fabrico"),
                horas_funcionamento=equipamento_data.get("horas_funcionamento")
            )
            equip_cliente_dict = novo_equipamento.dict()
            equip_cliente_dict["created_at"] = equip_cliente_dict["created_at"].isoformat()
            await db.equipamentos.insert_one(equip_cliente_dict)
            logging.info(f"Novo equipamento criado na base do cliente {cliente_id}: {equipamento_data['marca']} {equipamento_data['modelo']}")
    
    # Se for equipamento existente do cliente, atualizar horas_funcionamento se fornecido
    equipamento_cliente_id = equipamento_data.get("equipamento_cliente_id")
    if equipamento_cliente_id and equipamento_data.get("horas_funcionamento"):
        await db.equipamentos.update_one(
            {"id": equipamento_cliente_id, "ativo": True},
            {"$set": {"horas_funcionamento": equipamento_data["horas_funcionamento"]}}
        )
        logging.info(f"Horas de funcionamento atualizadas no equipamento do cliente {equipamento_cliente_id}")
    
    # Obter ordem (último + 1)
    last = await db.equipamentos_ot.find_one(
        {"relatorio_id": relatorio_id},
        sort=[("ordem", -1)]
    )
    ordem = (last.get("ordem", -1) + 1) if last else 0
    
    # Criar equipamento na OT
    equipamento = EquipamentoOT(
        relatorio_id=relatorio_id,
        equipamento_cliente_id=equipamento_data.get("equipamento_cliente_id"),
        intervencao_id=equipamento_data.get("intervencao_id"),
        tipologia=equipamento_data["tipologia"],
        marca=equipamento_data["marca"],
        modelo=equipamento_data["modelo"],
        numero_serie=equipamento_data.get("numero_serie"),
        ano_fabrico=equipamento_data.get("ano_fabrico"),
        horas_funcionamento=equipamento_data.get("horas_funcionamento"),
        ordem=ordem
    )
    
    equip_dict = equipamento.dict()
    await db.equipamentos_ot.insert_one(equip_dict)
    
    logging.info(f"Equipamento adicionado à OT {relatorio_id}")
    
    return equipamento

@router.get("/relatorios-tecnicos/{relatorio_id}/equipamentos")
async def get_equipamentos_ot(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar equipamentos de uma OT"""
    equipamentos = await db.equipamentos_ot.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("ordem", 1).to_list(length=None)
    
    return equipamentos

@router.delete("/relatorios-tecnicos/{relatorio_id}/equipamentos/{equipamento_id}")
async def delete_equipamento_ot(
    relatorio_id: str,
    equipamento_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remover equipamento de uma OT"""
    result = await db.equipamentos_ot.delete_one({
        "id": equipamento_id,
        "relatorio_id": relatorio_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado")
    
    logging.info(f"Equipamento {equipamento_id} removido da OT {relatorio_id}")
    
    return {"message": "Equipamento removido com sucesso"}

@router.put("/relatorios-tecnicos/{relatorio_id}/equipamentos/{equipamento_id}")
async def update_equipamento_ot(
    relatorio_id: str,
    equipamento_id: str,
    equipamento_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar equipamento de uma OT"""
    # Verificar se existe
    existing = await db.equipamentos_ot.find_one({
        "id": equipamento_id,
        "relatorio_id": relatorio_id
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado")
    
    # Campos permitidos para atualização
    update_fields = {}
    allowed_fields = ["tipologia", "marca", "modelo", "numero_serie", "ano_fabrico", "horas_funcionamento", "intervencao_id"]
    
    for field in allowed_fields:
        if field in equipamento_data:
            update_fields[field] = equipamento_data[field]
    
    if update_fields:
        await db.equipamentos_ot.update_one(
            {"id": equipamento_id, "relatorio_id": relatorio_id},
            {"$set": update_fields}
        )
    
    # Propagar horas_funcionamento para a BD do cliente se existir link
    if "horas_funcionamento" in update_fields and update_fields["horas_funcionamento"]:
        equip_cliente_id = existing.get("equipamento_cliente_id")
        if equip_cliente_id:
            await db.equipamentos.update_one(
                {"id": equip_cliente_id, "ativo": True},
                {"$set": {"horas_funcionamento": update_fields["horas_funcionamento"]}}
            )
            logging.info(f"Horas de funcionamento propagadas para equipamento do cliente {equip_cliente_id}")
        else:
            # Tentar encontrar por marca/modelo/numero_serie na OT do cliente
            ot = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0, "cliente_id": 1})
            if ot and ot.get("cliente_id"):
                match_query = {
                    "cliente_id": ot["cliente_id"],
                    "marca": existing.get("marca"),
                    "modelo": existing.get("modelo"),
                    "ativo": True
                }
                if existing.get("numero_serie"):
                    match_query["numero_serie"] = existing["numero_serie"]
                result = await db.equipamentos.update_one(
                    match_query,
                    {"$set": {"horas_funcionamento": update_fields["horas_funcionamento"]}}
                )
                if result.modified_count > 0:
                    logging.info(f"Horas de funcionamento propagadas para equipamento do cliente (por match)")
    
    # Retornar equipamento atualizado
    updated = await db.equipamentos_ot.find_one(
        {"id": equipamento_id, "relatorio_id": relatorio_id},
        {"_id": 0}
    )
    
    logging.info(f"Equipamento {equipamento_id} atualizado na OT {relatorio_id}")
    
    return updated

@router.get("/relatorios-tecnicos/{relatorio_id}/fotografias")
async def get_fotografias(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar fotografias de um relatório técnico.
    
    CRÍTICO: Retorna apenas metadados (sem `foto_base64` e `thumb_base64`) para
    evitar OOM/timeout em produção quando há muitas fotos. O frontend deve usar
    o endpoint `/image?thumb=true` para carregar imagens individualmente (lazy).
    """
    projection = {
        "_id": 0,
        "foto_base64": 0,
        "thumb_base64": 0,
    }
    fotografias = await db.fotos_relatorio.find(
        {"relatorio_id": relatorio_id},
        projection
    ).sort([("ordem", 1), ("uploaded_at", -1)]).to_list(length=None)
    
    # Adicionar foto_url para cada foto (usado pelo frontend para carregar a imagem sob demanda)
    for foto in fotografias:
        foto["foto_url"] = f"/relatorios-tecnicos/{relatorio_id}/fotografias/{foto['id']}/image"
    
    return fotografias

@router.get("/relatorios-tecnicos/{relatorio_id}/fotografias/{foto_id}/image")
async def get_fotografia_image(
    relatorio_id: str,
    foto_id: str,
    thumb: bool = False
):
    """Obter imagem da fotografia - endpoint público para servir imagens.
    
    CRÍTICO (2026-06): A projection é estritamente separada para evitar OOM em
    produção. Quando o frontend pede thumb, NÃO carregamos `foto_base64`
    (potencialmente 5-10MB por imagem); só carregamos a foto completa se o
    thumbnail não existir (fallback raro). Isto reduz o uso de memória de
    ~150MB para ~3MB ao carregar 15 thumbs em paralelo.
    """
    # Passo 1: tentar APENAS o campo solicitado (sem carregar a foto inteira)
    if thumb:
        projection = {"_id": 0, "content_type": 1, "thumb_base64": 1, "foto_path": 1}
    else:
        projection = {"_id": 0, "content_type": 1, "foto_base64": 1, "foto_path": 1}
    
    foto = await db.fotos_relatorio.find_one(
        {"id": foto_id, "relatorio_id": relatorio_id},
        projection,
    )
    
    if not foto:
        raise HTTPException(status_code=404, detail="Fotografia não encontrada")
    
    image_data = foto.get("thumb_base64") if thumb else foto.get("foto_base64")
    
    # Fallback: se thumb solicitado mas não existe, buscar a foto completa
    # (segunda query — só acontece para fotos antigas sem thumb gerado)
    if not image_data and thumb:
        foto_full = await db.fotos_relatorio.find_one(
            {"id": foto_id, "relatorio_id": relatorio_id},
            {"_id": 0, "foto_base64": 1, "content_type": 1, "foto_path": 1},
        )
        if foto_full:
            image_data = foto_full.get("foto_base64")
            foto["content_type"] = foto.get("content_type") or foto_full.get("content_type")
            foto["foto_path"] = foto.get("foto_path") or foto_full.get("foto_path")
    
    # Fallback final: ficheiro em disco (fotos legadas armazenadas em /app/backend/uploads)
    if not image_data:
        foto_path_str = foto.get("foto_path")
        if foto_path_str:
            from pathlib import Path
            fp = Path(foto_path_str)
            if fp.exists() and fp.is_file():
                return FileResponse(
                    fp,
                    media_type=foto.get("content_type", "image/jpeg"),
                    headers={
                        "Cache-Control": "public, max-age=86400",
                        "ETag": f'"{foto_id}-disk"',
                    },
                )
        raise HTTPException(status_code=404, detail="Imagem não disponível")
    
    # Decodificar base64 num thread pool para não bloquear o event loop.
    # 15 imagens em paralelo × decode CPU-bound pode bloquear o worker.
    from fastapi.concurrency import run_in_threadpool
    foto_bytes = await run_in_threadpool(base64.b64decode, image_data)
    
    return Response(
        content=foto_bytes,
        media_type=foto.get("content_type", "image/jpeg"),
        headers={
            "Cache-Control": "public, max-age=86400",
            "ETag": f'"{foto_id}-{"t" if thumb else "f"}"',
        }
    )

@router.get("/relatorios-tecnicos/{relatorio_id}/fotografias/{filename}")
async def get_fotografia_file(
    relatorio_id: str,
    filename: str
):
    """Obter arquivo de fotografia - endpoint público (compatibilidade)"""
    # Tentar buscar do arquivo primeiro (desenvolvimento local)
    file_path = Path(f"/app/backend/uploads/relatorios/{filename}")
    
    if file_path.exists():
        return FileResponse(file_path)
    
    # Se não existe arquivo, buscar do MongoDB (produção)
    foto = await db.fotos_relatorio.find_one({
        "relatorio_id": relatorio_id,
        "foto_path": str(file_path)
    })
    
    if not foto or not foto.get("foto_base64"):
        raise HTTPException(status_code=404, detail="Fotografia não encontrada")
    
    # Decodificar base64 e retornar
    import base64
    foto_bytes = base64.b64decode(foto["foto_base64"])
    
    from fastapi.responses import Response
    return Response(
        content=foto_bytes,
        media_type=foto.get("foto_mime_type", "image/jpeg")
    )

@router.delete("/relatorios-tecnicos/{relatorio_id}/fotografias/{foto_id}")
async def delete_fotografia(
    relatorio_id: str,
    foto_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remover fotografia de um relatório técnico"""
    # Buscar fotografia
    foto = await db.fotos_relatorio.find_one({
        "id": foto_id,
        "relatorio_id": relatorio_id
    })
    
    if not foto:
        raise HTTPException(status_code=404, detail="Fotografia não encontrada")
    
    # Remover do banco (foto armazenada como Base64)
    await db.fotos_relatorio.delete_one({"id": foto_id})
    
    logging.info(f"Fotografia {foto_id} removida do relatório {relatorio_id}")
    
    return {"message": "Fotografia removida com sucesso"}

@router.put("/relatorios-tecnicos/{relatorio_id}/fotografias/reorder")
async def reorder_fotografias(
    relatorio_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Reordenar fotografias de um relatório.

    Aceita `{"foto_ids": ["id1", "id2", ...]}` — o índice na lista passa a ser
    o campo `ordem` de cada foto. IDs não pertencentes ao relatório são
    ignorados. Esta rota é declarada ANTES da rota `{foto_id}` para não ser
    capturada como `foto_id="reorder"`.
    """
    foto_ids = data.get("foto_ids") or []
    if not isinstance(foto_ids, list) or not foto_ids:
        raise HTTPException(status_code=400, detail="foto_ids obrigatório (lista não vazia)")

    if not await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Relatório não encontrado")

    updated = 0
    for idx, fid in enumerate(foto_ids):
        result = await db.fotos_relatorio.update_one(
            {"id": fid, "relatorio_id": relatorio_id},
            {"$set": {"ordem": idx}},
        )
        if result.matched_count:
            updated += 1

    logging.info(f"Reordenadas {updated}/{len(foto_ids)} fotos do relatório {relatorio_id}")
    return {"updated": updated, "total_requested": len(foto_ids)}


@router.put("/relatorios-tecnicos/{relatorio_id}/fotografias/{foto_id}")
async def update_fotografia(
    relatorio_id: str,
    foto_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar descrição e/ou data de uma fotografia"""
    update_data = {}
    
    if "descricao" in data:
        update_data["descricao"] = data["descricao"]
    
    if "uploaded_at" in data and data["uploaded_at"]:
        update_data["uploaded_at"] = data["uploaded_at"]
    
    if "intervencao_id" in data:
        update_data["intervencao_id"] = data["intervencao_id"]
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum dado para atualizar")
    
    result = await db.fotos_relatorio.update_one(
        {"id": foto_id, "relatorio_id": relatorio_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Fotografia não encontrada")
    
    updated = await db.fotos_relatorio.find_one({"id": foto_id}, {"_id": 0})
    
    logging.info(f"Fotografia {foto_id} atualizada")
    
    return updated


# ============ Assinatura Routes ============

@router.post("/relatorios-tecnicos/{relatorio_id}/assinatura-digital")
async def salvar_assinatura_digital(
    relatorio_id: str,
    file: UploadFile = File(...),
    primeiro_nome: str = Form(""),
    ultimo_nome: str = Form(""),
    data_intervencao: str = Form(""),
    current_user: dict = Depends(get_current_user)
):
    """Salvar assinatura digital (canvas/desenho) para um relatório técnico - permite múltiplas"""
    # Verificar se relatório existe
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Criar diretório de uploads se não existir
    upload_dir = Path("/app/backend/uploads/assinaturas")
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    # Gerar nome único para o arquivo
    unique_filename = f"{uuid.uuid4()}.png"
    file_path = upload_dir / unique_filename
    
    # Ler conteúdo do arquivo
    file_content = await file.read()
    
    # Converter para base64 para MongoDB
    import base64
    assinatura_base64 = base64.b64encode(file_content).decode('utf-8')
    
    # Salvar também em arquivo local
    try:
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)
    except Exception as e:
        logging.warning(f"Não foi possível salvar arquivo localmente: {e}")
    
    # NÃO remover assinaturas anteriores - permitir múltiplas
    
    # Criar registro no banco COM BASE64
    nome_completo = f"{primeiro_nome} {ultimo_nome}".strip()
    assinatura = AssinaturaRelatorio(
        relatorio_id=relatorio_id,
        tipo="digital",
        assinatura_path=str(file_path),
        assinatura_url="",  # Será atualizado com o ID
        primeiro_nome=primeiro_nome,
        ultimo_nome=ultimo_nome,
        assinado_por=nome_completo if nome_completo else None,
        data_intervencao=data_intervencao if data_intervencao else None
    )
    
    assinatura_dict = assinatura.dict()
    # Atualizar URL com o ID da assinatura para evitar conflitos com múltiplas assinaturas
    assinatura_dict["assinatura_url"] = f"/relatorios-tecnicos/{relatorio_id}/assinaturas/{assinatura_dict['id']}/imagem"
    assinatura_dict["data_assinatura"] = assinatura_dict["data_assinatura"].isoformat()
    assinatura_dict["assinatura_base64"] = assinatura_base64  # Adicionar base64
    
    await db.assinaturas_relatorio.insert_one(assinatura_dict)
    
    logging.info(f"Assinatura digital salva para relatório {relatorio_id}")
    
    return assinatura

@router.post("/relatorios-tecnicos/{relatorio_id}/assinatura-manual")
async def salvar_assinatura_manual(
    relatorio_id: str,
    primeiro_nome: str = Form(...),
    ultimo_nome: str = Form(...),
    data_intervencao: str = Form(""),
    current_user: dict = Depends(get_current_user)
):
    """Salvar assinatura manual (texto) para um relatório técnico - permite múltiplas"""
    # Verificar se relatório existe
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Validar nomes
    if not primeiro_nome.strip() or not ultimo_nome.strip():
        raise HTTPException(status_code=400, detail="Primeiro e último nome são obrigatórios")
    
    # NÃO remover assinaturas anteriores - permitir múltiplas
    
    # Criar registro no banco
    nome_completo = f"{primeiro_nome} {ultimo_nome}".strip()
    assinatura = AssinaturaRelatorio(
        relatorio_id=relatorio_id,
        tipo="manual",
        primeiro_nome=primeiro_nome,
        ultimo_nome=ultimo_nome,
        assinado_por=nome_completo,
        data_intervencao=data_intervencao if data_intervencao else None
    )
    
    assinatura_dict = assinatura.dict()
    assinatura_dict["data_assinatura"] = assinatura_dict["data_assinatura"].isoformat()
    
    await db.assinaturas_relatorio.insert_one(assinatura_dict)
    
    logging.info(f"Assinatura manual salva para relatório {relatorio_id} por {nome_completo}")
    
    return assinatura

@router.get("/relatorios-tecnicos/{relatorio_id}/assinatura")
async def get_assinatura(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obter assinatura de um relatório técnico - retorna a primeira (compatibilidade)"""
    assinatura = await db.assinaturas_relatorio.find_one(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    )
    
    if not assinatura:
        return None
    
    return assinatura

@router.get("/relatorios-tecnicos/{relatorio_id}/assinaturas")
async def get_all_assinaturas(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obter todas as assinaturas de um relatório técnico"""
    assinaturas = await db.assinaturas_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("data_assinatura", 1).to_list(100)
    
    return assinaturas


@router.post("/relatorios-tecnicos/{relatorio_id}/refresh-assinaturas")
async def refresh_assinaturas(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Regenerar/sincronizar assinaturas - garante que base64 e ficheiros estão sincronizados"""
    import base64
    from pathlib import Path
    
    assinaturas = await db.assinaturas_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).to_list(100)
    
    updated_count = 0
    errors = []
    
    for assinatura in assinaturas:
        try:
            update_data = {}
            
            # Se tem path mas não tem base64, ler o ficheiro e criar base64
            if assinatura.get('assinatura_path') and not assinatura.get('assinatura_base64'):
                path = Path(assinatura['assinatura_path'])
                if path.exists():
                    with open(path, 'rb') as f:
                        img_data = f.read()
                        update_data['assinatura_base64'] = base64.b64encode(img_data).decode('utf-8')
            
            # Se tem base64 mas não tem path ou o ficheiro não existe, criar ficheiro
            if assinatura.get('assinatura_base64'):
                path_str = assinatura.get('assinatura_path')
                should_create_file = not path_str or not Path(path_str).exists()
                
                if should_create_file:
                    # Criar directório se não existir
                    signatures_dir = Path('/app/backend/signatures')
                    signatures_dir.mkdir(exist_ok=True)
                    
                    # Criar ficheiro
                    new_path = signatures_dir / f"{assinatura['id']}.png"
                    img_data = base64.b64decode(assinatura['assinatura_base64'])
                    with open(new_path, 'wb') as f:
                        f.write(img_data)
                    update_data['assinatura_path'] = str(new_path)
            
            # Actualizar na BD se houver mudanças
            if update_data:
                await db.assinaturas_relatorio.update_one(
                    {"id": assinatura['id']},
                    {"$set": update_data}
                )
                updated_count += 1
                
        except Exception as e:
            errors.append(f"Assinatura {assinatura.get('id', 'N/A')}: {str(e)}")
    
    logging.info(f"Refresh assinaturas OT {relatorio_id}: {updated_count} atualizadas, {len(errors)} erros")
    
    return {
        "message": f"Assinaturas sincronizadas",
        "updated": updated_count,
        "total": len(assinaturas),
        "errors": errors
    }


@router.patch("/relatorios-tecnicos/{relatorio_id}/assinaturas/{assinatura_id}")
async def update_assinatura(
    relatorio_id: str,
    assinatura_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar dados de uma assinatura (data_intervencao ou data_assinatura)"""
    # Verificar se a assinatura existe
    assinatura = await db.assinaturas_relatorio.find_one({
        "id": assinatura_id,
        "relatorio_id": relatorio_id
    })
    
    if not assinatura:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    
    # Campos permitidos para atualização
    update_fields = {}
    if "data_intervencao" in data:
        update_fields["data_intervencao"] = data["data_intervencao"]
    if "data_assinatura" in data:
        update_fields["data_assinatura"] = data["data_assinatura"]
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="Nenhum campo válido para atualizar")
    
    result = await db.assinaturas_relatorio.update_one(
        {"id": assinatura_id, "relatorio_id": relatorio_id},
        {"$set": update_fields}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Nenhuma alteração realizada")
    
    logging.info(f"Assinatura {assinatura_id} atualizada: {update_fields}")
    
    return {"message": "Assinatura atualizada com sucesso", "updated_fields": update_fields}


@router.delete("/relatorios-tecnicos/{relatorio_id}/assinaturas/{assinatura_id}")
async def delete_assinatura(
    relatorio_id: str,
    assinatura_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Eliminar uma assinatura específica"""
    result = await db.assinaturas_relatorio.delete_one({
        "id": assinatura_id,
        "relatorio_id": relatorio_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    
    logging.info(f"Assinatura {assinatura_id} eliminada do relatório {relatorio_id}")
    
    return {"message": "Assinatura eliminada com sucesso"}

@router.put("/relatorios-tecnicos/{relatorio_id}/assinaturas/{assinatura_id}")
async def update_assinatura_put(
    relatorio_id: str,
    assinatura_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar dados de uma assinatura (nome, data, etc.)"""
    # Campos permitidos para atualização
    update_fields = {}
    
    if "primeiro_nome" in data:
        update_fields["primeiro_nome"] = data["primeiro_nome"]
    if "ultimo_nome" in data:
        update_fields["ultimo_nome"] = data["ultimo_nome"]
    if "assinado_por" in data:
        update_fields["assinado_por"] = data["assinado_por"]
    if "data_assinatura" in data:
        update_fields["data_assinatura"] = data["data_assinatura"]
    if "data_intervencao" in data:
        update_fields["data_intervencao"] = data["data_intervencao"]
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
    
    result = await db.assinaturas_relatorio.update_one(
        {"id": assinatura_id, "relatorio_id": relatorio_id},
        {"$set": update_fields}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    
    logging.info(f"Assinatura {assinatura_id} atualizada no relatório {relatorio_id}")
    
    return {"message": "Assinatura atualizada com sucesso"}

@router.get("/relatorios-tecnicos/{relatorio_id}/assinaturas/{assinatura_id}/imagem")
async def get_assinatura_imagem_by_id(
    relatorio_id: str,
    assinatura_id: str
):
    """Obter imagem de uma assinatura específica pelo ID - endpoint público"""
    # Projection mínima: só os campos necessários para servir a imagem.
    # Sem isto, o documento inteiro (incluindo metadados) é carregado.
    assinatura = await db.assinaturas_relatorio.find_one(
        {"relatorio_id": relatorio_id, "id": assinatura_id},
        {"_id": 0, "assinatura_path": 1, "assinatura_base64": 1},
    )
    
    if not assinatura:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    
    # Headers para evitar cache
    headers = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    }
    
    # Tentar arquivo local primeiro
    file_path = Path(assinatura.get("assinatura_path", ""))
    if file_path.exists():
        return FileResponse(file_path, headers=headers)
    
    # Usar base64 do MongoDB
    if not assinatura.get("assinatura_base64"):
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    
    from fastapi.concurrency import run_in_threadpool
    
    # Decode em thread pool (evita bloquear o event loop quando há muitas
    # assinaturas a serem servidas em paralelo)
    assinatura_bytes = await run_in_threadpool(base64.b64decode, assinatura["assinatura_base64"])
    return Response(content=assinatura_bytes, media_type="image/png", headers=headers)

@router.get("/relatorios-tecnicos/{relatorio_id}/assinatura/imagem")
async def get_assinatura_imagem(
    relatorio_id: str
):
    """Obter imagem da assinatura - endpoint público (legacy, retorna a primeira)"""
    assinatura = await db.assinaturas_relatorio.find_one(
        {"relatorio_id": relatorio_id, "tipo": "digital"}
    )
    
    if not assinatura:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    
    # Headers para evitar cache
    headers = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
    }
    
    # Tentar arquivo local primeiro
    file_path = Path(assinatura.get("assinatura_path", ""))
    if file_path.exists():
        return FileResponse(file_path, headers=headers)
    
    # Usar base64 do MongoDB
    if not assinatura.get("assinatura_base64"):
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    
    import base64
    from fastapi.responses import Response
    
    assinatura_bytes = base64.b64decode(assinatura["assinatura_base64"])
    return Response(content=assinatura_bytes, media_type="image/png", headers=headers)

@router.delete("/relatorios-tecnicos/{relatorio_id}/assinatura")
async def delete_assinatura_relatorio(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remover TODAS as assinaturas de um relatório técnico (endpoint legado)"""
    # Buscar assinatura
    assinatura = await db.assinaturas_relatorio.find_one({"relatorio_id": relatorio_id})
    
    if not assinatura:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    
    # Remover arquivo do disco se for assinatura digital
    if assinatura.get("tipo") == "digital" and assinatura.get("assinatura_path"):
        file_path = Path(assinatura["assinatura_path"])
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception as e:
                logging.error(f"Erro ao remover arquivo de assinatura: {e}")
    
    # Remover do banco
    await db.assinaturas_relatorio.delete_one({"relatorio_id": relatorio_id})
    
    logging.info(f"Assinatura removida do relatório {relatorio_id}")
    
    return {"message": "Assinatura removida com sucesso"}


# ============ PDF e Email Routes ============

@router.post("/relatorios-tecnicos/{relatorio_id}/enviar-pdf")
async def enviar_pdf_ot(
    relatorio_id: str,
    request: EnviarEmailRequest,
    current_user: dict = Depends(get_current_user)
):
    """Enfileira a geração + envio de PDFs em background para evitar timeout 520.
    
    Retorna 200 imediatamente. O trabalho pesado (gerar PDFs + enviar SMTP) corre
    numa task assíncrona. Erros são registados em `app_errors` (visíveis em
    `/admin/erros`). Frontend não precisa esperar o SMTP.
    """
    # Validações rápidas (síncronas) - podem rejeitar cedo
    if not request.emails or len(request.emails) == 0:
        raise HTTPException(status_code=400, detail="Pelo menos um email deve ser fornecido")
    
    relatorio_exists = await db.relatorios_tecnicos.find_one(
        {"id": relatorio_id}, {"_id": 0, "numero_assistencia": 1}
    )
    if not relatorio_exists:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Enfileirar trabalho em background (não bloqueia a resposta HTTP)
    import asyncio as _asyncio
    _asyncio.create_task(_enviar_pdf_worker(
        relatorio_id=relatorio_id,
        request=request,
        current_user=current_user,
    ))
    
    numero_ot = relatorio_exists.get('numero_assistencia', 'N/A')
    logging.info(f"[enviar-pdf] FS#{numero_ot} enfileirada para envio a {len(request.emails)} email(s)")
    
    # Resposta imediata mantendo forma compatível com o frontend
    return {
        "message": f"Envio em processamento para {len(request.emails)} email(s). Notificaremos o resultado em /admin/erros se falhar.",
        "emails_enviados": list(request.emails),  # otimista: frontend mostra sucesso
        "emails_falhados": [],
        "queued": True,
    }


async def _enviar_pdf_worker(
    relatorio_id: str,
    request: EnviarEmailRequest,
    current_user: dict,
):
    """Worker assíncrono: gera os PDFs selecionados e envia por email.
    
    Roda em background (asyncio.create_task). Qualquer erro é registado em
    `app_errors` via `log_app_error` para aparecer em `/admin/erros`.
    """
    numero_ot = "?"
    user_id_from_req = current_user.get("sub", "") if current_user else ""
    username_from_req = current_user.get("username", "") if current_user else ""
    try:
        # Determinar documentos a enviar
        docs_selecionados = request.documentos or []
        # Retrocompatibilidade: se documentos não fornecido, usar lógica antiga
        if not docs_selecionados:
            docs_selecionados = ["relatorio"]
            if request.incluir_folha_horas:
                docs_selecionados.append("folha_horas")
        # Buscar dados do relatório
        relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
        if not relatorio:
            raise HTTPException(status_code=404, detail="Relatório não encontrado")

        # LOGGING PROATIVO: regista "STARTED" ANTES de qualquer trabalho pesado.
        # Se o pod for morto por OOM durante a geração do PDF, esta entrada
        # fica em /admin/errors e indica QUE FS estava a ser processada.
        # Será removida automaticamente em caso de sucesso.
        _job_started_id = None
        try:
            from server import log_app_error  # lazy import (evita circular)
            _job_started_id = await log_app_error(
                context=f"FS#{relatorio.get('numero_assistencia', 'N/A')}",
                action="Enviar FS por email — STARTED",
                error_message="Geração de PDF iniciada (este registo é apagado em caso de sucesso; se ficar visível, indica que o processo morreu antes de concluir — provável OOM)",
                details={
                    "relatorio_id": relatorio_id,
                    "n_fotos_db": None,  # preenchido abaixo
                    "destinatarios": (request.emails or [])[:5],
                    "docs": docs_selecionados,
                },
                severity="info",
                user_id=user_id_from_req,
                username=username_from_req,
            )
        except Exception as _log_err:
            logging.warning(f"[enviar-pdf] falha ao registar STARTED: {_log_err}")
        
        # Enriquecer com info da OT relacionada
        if relatorio.get("ot_relacionada_id"):
            ot_rel = await db.relatorios_tecnicos.find_one(
                {"id": relatorio["ot_relacionada_id"]}, {"_id": 0, "numero_assistencia": 1}
            )
            if ot_rel:
                relatorio["ot_relacionada_numero"] = ot_rel.get("numero_assistencia")
        
        # Buscar cliente
        cliente = await db.clientes.find_one({"id": relatorio['cliente_id']}, {"_id": 0})
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")
        
        # Buscar intervenções
        intervencoes = await db.intervencoes_relatorio.find(
            {"relatorio_id": relatorio_id},
            {"_id": 0}
        ).sort([("data_trabalho", 1), ("hora_inicio_segmento", 1)]).to_list(length=None)
        
        # Buscar técnicos (registos manuais) - ordenados cronologicamente
        tecnicos = await db.tecnicos_relatorio.find(
            {"relatorio_id": relatorio_id},
            {"_id": 0}
        ).sort([("data_trabalho", 1), ("hora_inicio", 1)]).to_list(length=None)
        
        # Buscar fotografias
        fotografias = await db.fotos_relatorio.find(
            {"relatorio_id": relatorio_id},
            {"_id": 0}
        ).sort("ordem", 1).to_list(length=None)
        
        # Buscar assinaturas (todas)
        assinaturas = await db.assinaturas_relatorio.find(
            {"relatorio_id": relatorio_id},
            {"_id": 0}
        ).sort("data_assinatura", 1).to_list(length=None)
        
        # Buscar equipamentos adicionais
        equipamentos_adicionais = await db.equipamentos_ot.find(
            {"relatorio_id": relatorio_id},
            {"_id": 0}
        ).sort("ordem", 1).to_list(length=None)
        
        # Buscar materiais
        materiais = await db.materiais_ot.find(
            {"relatorio_id": relatorio_id},
            {"_id": 0}
        ).to_list(length=None)
        
        # Buscar registos de mão de obra (cronómetros)
        registos_mao_obra = await db.registos_tecnico_ot.find(
            {"relatorio_id": relatorio_id},
            {"_id": 0}
        ).sort([("data_trabalho", 1), ("hora_inicio_segmento", 1)]).to_list(length=None)
        
        # Buscar informações da empresa (para logo e dados no cabeçalho)
        company_info = await db.company_info.find_one({"id": "company_info_default"}, {"_id": 0})
        
        # Buscar relatórios de assistência
        rel_assistencia = await db.relatorios_assistencia.find(
            {"relatorio_id": relatorio_id}, {"_id": 0}
        ).sort("created_at", 1).to_list(length=None)
        
        # Gerar PDF do Relatório se selecionado — thread pool para não bloquear o loop
        pdf_buffer = None
        if "relatorio" in docs_selecionados:
            try:
                import asyncio as _asyncio
                loop = _asyncio.get_event_loop()
                pdf_buffer = await loop.run_in_executor(
                    None,
                    generate_ot_pdf,
                    relatorio, cliente, intervencoes, tecnicos, fotografias, assinaturas,
                    equipamentos_adicionais, materiais, registos_mao_obra, company_info, rel_assistencia,
                )
            except Exception as e:
                logging.error(f"Erro ao gerar PDF para envio - OT {relatorio_id}: {str(e)}")
                import traceback
                logging.error(f"Traceback: {traceback.format_exc()}")
                raise HTTPException(status_code=500, detail=f"Erro ao gerar PDF: {str(e)}")
        
        # Gerar Folha de Horas se selecionado
        folha_horas_buffer = None
        if "folha_horas" in docs_selecionados:
            try:
                # Buscar registos manuais (tecnicos_relatorio)
                tecnicos_manuais = await db.tecnicos_relatorio.find(
                    {"relatorio_id": relatorio_id}, {"_id": 0}
                ).sort([("data_trabalho", 1), ("hora_inicio", 1)]).to_list(length=None)
                
                # Buscar tarifas da tabela de preço escolhida pelo utilizador (paridade c/ preview)
                # Se não passou table_id explícito, usa a tabela marcada como padrão em /admin
                from routes.tabelas_tarifas import get_default_table_id
                _table_id = request.table_id if request.table_id else await get_default_table_id()
                tabela_config = await db.tabelas_preco.find_one({"table_id": _table_id}, {"_id": 0})
                valor_km = tabela_config.get("valor_km", 0.65) if tabela_config else 0.65
                valor_dieta_tabela = tabela_config.get("valor_dieta", 0) if tabela_config else 0
                
                tarifas_db = await db.tarifas.find({
                    "ativo": True, 
                    "table_id": _table_id,
                    "codigo": {"$nin": [None, "", "manual"]}
                }, {"_id": 0}).to_list(length=None)
                
                # Fallback: se a tabela escolhida não tem tarifas, usar qualquer outra
                # tabela ativa (evita PDF com valores €0 quando o utilizador não passou table_id)
                if not tarifas_db:
                    tarifas_db = await db.tarifas.find({
                        "ativo": True,
                        "codigo": {"$nin": [None, "", "manual"]}
                    }, {"_id": 0}).to_list(length=None)
                    if tarifas_db:
                        fallback_table_id = tarifas_db[0].get('table_id')
                        logging.warning(
                            f"[enviar-pdf] FS#{numero_ot}: tabela {_table_id} sem tarifas — fallback para tabela {fallback_table_id}"
                        )
                        if not tabela_config:
                            tabela_config = await db.tabelas_preco.find_one(
                                {"table_id": fallback_table_id}, {"_id": 0}
                            )
                            if tabela_config:
                                valor_km = tabela_config.get("valor_km", 0.65)
                                valor_dieta_tabela = tabela_config.get("valor_dieta", 0)
                
                tarifas_por_codigo = {}
                # tarifas_por_tecnico vem do frontend (overrides manuais por colaborador/dia)
                tarifas_por_tecnico = request.tarifas_por_tecnico or {}
                tarifas_detalhadas_email = []
                for tarifa in tarifas_db:
                    codigo = tarifa.get('codigo')
                    if codigo and codigo != 'manual':
                        tarifas_por_codigo[codigo] = tarifa.get('valor_por_hora', 0)
                        tarifas_detalhadas_email.append({
                            'codigo': codigo,
                            'tipo_registo': tarifa.get('tipo_registo'),
                            'tipo_colaborador': tarifa.get('tipo_colaborador'),
                            'valor_por_hora': tarifa.get('valor_por_hora', 0),
                            'nome': tarifa.get('nome', '')
                        })
                
                # Buscar despesas da OT (com ajustes vindos do frontend)
                despesas_ot = await db.despesas_ot.find(
                    {"relatorio_id": relatorio_id}, {"_id": 0}
                ).to_list(length=None)
                
                # Aplicar despesa_adjustments do frontend (LEGADO — mantido por compat).
                # A regra atual: cada despesa já traz `valor_final` (Valor × (1 + Percentagem/100))
                # gravado pelo admin no popup da FS. Se ausente, cai em `valor`.
                _adjustments = request.despesa_adjustments or {}
                dados_extras = {}
                despesas_ajustadas_email = []
                for desp in despesas_ot:
                    desp_id = desp.get("id", "")
                    adj = _adjustments.get(desp_id, {})
                    if adj.get("excluida", False):
                        continue
                    valor_original = desp.get("valor", 0) or 0
                    # Prioridade: adjustment do frontend → valor_final persistido → valor
                    if "percentual" in adj and adj.get("percentual") is not None:
                        percentual = adj.get("percentual") or 0
                        valor_final = valor_original * (1 + percentual / 100)
                    elif desp.get("valor_final") is not None:
                        valor_final = float(desp.get("valor_final") or 0)
                        percentual = float(desp.get("percentagem") or 0)
                    else:
                        valor_final = valor_original
                        percentual = 0
                    desp["valor_original"] = valor_original
                    desp["valor_ajustado"] = valor_final
                    desp["percentual_aplicado"] = percentual
                    
                    key = f"{desp['tecnico_id']}_{desp['data']}"
                    tipo = desp.get('tipo', 'outras')
                    
                    if key not in dados_extras:
                        dados_extras[key] = {'dieta': 0, 'portagens': 0, 'despesas': 0}
                    
                    if tipo == 'portagens':
                        dados_extras[key]['portagens'] += valor_final
                    elif tipo == 'combustivel':
                        pass
                    else:
                        dados_extras[key]['despesas'] += valor_final
                    
                    despesas_ajustadas_email.append(desp)
                
                # Mesclar dados_extras vindos do frontend (dieta/portagens manuais por dia)
                _frontend_extras = request.dados_extras or {}
                for k, v in _frontend_extras.items():
                    if k not in dados_extras:
                        dados_extras[k] = {'dieta': 0, 'portagens': 0, 'despesas': 0}
                    if 'dieta' in v:
                        dados_extras[k]['dieta'] = float(v.get('dieta', 0) or 0)
                    if 'portagens' in v:
                        dados_extras[k]['portagens'] = float(v.get('portagens', 0) or 0)
                    if 'despesas' in v:
                        dados_extras[k]['despesas'] = float(v.get('despesas', 0) or 0)
                
                # Aplicar dieta automática da tabela de preço a cada técnico/dia
                if valor_dieta_tabela > 0:
                    dias_tecnicos = set()
                    for reg in registos_mao_obra:
                        data_r = reg.get('data', '')
                        if isinstance(data_r, str) and 'T' in data_r:
                            data_r = data_r.split('T')[0]
                        tid = reg.get('tecnico_id', '')
                        tname = reg.get('tecnico_nome', '')
                        if tid and data_r:
                            dias_tecnicos.add((tid, tname, data_r))
                    for tec in tecnicos_manuais:
                        data_t = tec.get('data_trabalho', '')
                        if isinstance(data_t, str) and 'T' in data_t:
                            data_t = data_t.split('T')[0]
                        tid = tec.get('tecnico_id', '')
                        tname = tec.get('tecnico_nome', '')
                        if tid and data_t:
                            dias_tecnicos.add((tid, tname, data_t))
                    for tid, tname, data_d in dias_tecnicos:
                        key_id = f"{tid}_{data_d}"
                        key_nome = f"{tname}_{data_d}"
                        if key_id not in dados_extras:
                            dados_extras[key_id] = {'dieta': 0, 'portagens': 0, 'despesas': 0}
                        dados_extras[key_id]['dieta'] = valor_dieta_tabela
                        if key_nome not in dados_extras:
                            dados_extras[key_nome] = {'dieta': 0, 'portagens': 0, 'despesas': 0}
                        dados_extras[key_nome]['dieta'] = valor_dieta_tabela
                
                # Buscar imagem da tabela de preços
                tabela_preco_image_email = None
                if tabela_config and tabela_config.get("imagem_data"):
                    import base64
                    tabela_preco_image_email = base64.b64decode(tabela_config["imagem_data"])
                
                # Geração em thread pool para não bloquear o event loop
                import asyncio as _asyncio
                from functools import partial as _partial
                _loop = _asyncio.get_event_loop()
                folha_horas_buffer = await _loop.run_in_executor(
                    None,
                    _partial(
                        generate_folha_horas_pdf,
                        relatorio=relatorio,
                        cliente=cliente,
                        registos_mao_obra=registos_mao_obra,
                        tecnicos_manuais=tecnicos_manuais,
                        tarifas_por_tecnico=tarifas_por_tecnico,
                        dados_extras=dados_extras,
                        tarifas_por_codigo=tarifas_por_codigo,
                        valor_km=valor_km,
                        tarifas_detalhadas=tarifas_detalhadas_email,
                        despesas_ajustadas=despesas_ajustadas_email,
                        valor_dieta_default=valor_dieta_tabela,
                        tabela_preco_image=tabela_preco_image_email,
                        faturar_viagens_curtas=bool(cliente.get('faturar_viagens_curtas', False)),
                    ),
                )
            except Exception as e:
                logging.error(f"Erro ao gerar Folha de Horas para envio - OT {relatorio_id}: {str(e)}")
                import traceback
                logging.error(f"Traceback FH: {traceback.format_exc()}")
        
        # Gerar PDFs de PCs selecionados
        pc_buffers = []
        pc_ids_selecionados = [d.replace("pc:", "") for d in docs_selecionados if d.startswith("pc:")]
        if pc_ids_selecionados:
            from pc_pdf_report import generate_pc_pdf
            import asyncio as _asyncio
            for pc_id_sel in pc_ids_selecionados:
                try:
                    pc_doc = await db.pedidos_cotacao.find_one({"id": pc_id_sel}, {"_id": 0})
                    if not pc_doc:
                        continue
                    pc_materiais = await db.materiais_ot.find({"pc_id": pc_id_sel}, {"_id": 0}).to_list(100)
                    pc_fotos = await db.fotografias_pc.find({"pc_id": pc_id_sel}, {"_id": 0}).to_list(100)
                    
                    ot_para_pc = {
                        "numero_assistencia": relatorio.get("numero_assistencia"),
                        "data_servico": relatorio.get("data_servico"),
                        "cliente_nome": cliente.get("nome", "N/A"),
                    }
                    # Buscar equipamento
                    equip = await db.equipamentos_ot.find_one({"relatorio_id": relatorio_id}, {"_id": 0})
                    if equip:
                        ot_para_pc["equipamento_tipologia"] = equip.get("tipologia", "")
                        ot_para_pc["equipamento_marca"] = equip.get("marca", "")
                        ot_para_pc["equipamento_modelo"] = equip.get("modelo", "")
                        ot_para_pc["equipamento_numero_serie"] = equip.get("numero_serie", "")
                        ot_para_pc["equipamento_ano_fabrico"] = equip.get("ano_fabrico", "")
                    
                    pc_buf = await _asyncio.get_event_loop().run_in_executor(
                        None,
                        generate_pc_pdf,
                        pc_doc, ot_para_pc, pc_materiais, pc_fotos, request.hide_client_pcs,
                    )
                    pc_buffers.append({"buffer": pc_buf, "numero_pc": pc_doc.get("numero_pc", pc_id_sel)})
                except Exception as e:
                    logging.error(f"Erro ao gerar PDF do PC {pc_id_sel}: {e}")
        
        # Configuração SMTP
        smtp_host = os.environ.get('SMTP_HOST', 'smtp.office365.com')
        smtp_port = int(os.environ.get('SMTP_PORT', '587'))
        smtp_user = os.environ.get('SMTP_USER', '')
        smtp_password = os.environ.get('SMTP_PASSWORD', '')
        smtp_from = os.environ.get('SMTP_FROM', smtp_user)
        
        # Validar emails
        if not request.emails or len(request.emails) == 0:
            raise HTTPException(status_code=400, detail="Pelo menos um email deve ser fornecido")
        
        # Criar mensagem de email
        numero_ot = relatorio.get('numero_assistencia', 'N/A')
        status_raw = relatorio.get('status', 'em_execucao')
        status_map = {
            'em_execucao': 'Em Execução',
            'concluido': 'Concluído',
            'orcamento': 'Orçamento',
            'facturado': 'Facturado'
        }
        status = status_map.get(status_raw, status_raw)
        local_intervencao = relatorio.get('local_intervencao', '')
        subject = f"Folha de Serviço #{numero_ot} - {cliente.get('nome', '')}"
        
        from email_templates import get_fs_email_body
        body = get_fs_email_body(
            idioma=request.idioma,
            numero_ot=numero_ot,
            status=status,
            cliente_nome=cliente.get('nome', 'N/A'),
            data_servico=relatorio.get('data_servico', 'N/A'),
            local_intervencao=local_intervencao,
            ot_relacionada_numero=relatorio.get('ot_relacionada_numero'),
            referencia_interna=relatorio.get('referencia_interna_cliente')
        )
        
        # Normalizar lista de destinatários — dedupe, lowercase, strip vazios
        # Isto resolve casos onde o cliente.email e emails_adicionais contêm o mesmo endereço
        seen = set()
        destinatarios = []
        for raw in request.emails or []:
            e = (raw or "").strip()
            if not e:
                continue
            ek = e.lower()
            if ek in seen:
                continue
            seen.add(ek)
            destinatarios.append(e)
        
        if not destinatarios:
            logging.warning(f"[enviar-pdf][bg] FS#{numero_ot}: nenhum destinatário válido após normalização")
            return
        
        # ENVIO EM LOTE: uma única mensagem com TODOS os destinatários no campo To.
        # Vantagens vs. loop por email:
        #   • Uma única conexão SMTP (evita rate limiting do servidor de email)
        #   • Mais rápido (1 build de mensagem vs. N)
        #   • Garante que todos recebem ou todos falham juntos (transação atómica)
        emails_enviados = []
        emails_falhados = []
        
        try:
            message = MIMEMultipart()
            message['From'] = smtp_from
            message['To'] = ", ".join(destinatarios)
            message['Subject'] = subject
            message.attach(MIMEText(body, 'html'))
            
            # Anexar PDF do Relatório se selecionado
            if pdf_buffer:
                pdf_attachment = MIMEBase('application', 'pdf')
                pdf_attachment.set_payload(pdf_buffer.getvalue())
                encoders.encode_base64(pdf_attachment)
                pdf_attachment.add_header('Content-Disposition', f'attachment; filename="FS_{numero_ot}.pdf"')
                message.attach(pdf_attachment)
            
            # Anexar Folha de Horas se selecionada
            if folha_horas_buffer:
                fh_attachment = MIMEBase('application', 'pdf')
                fh_attachment.set_payload(folha_horas_buffer.getvalue())
                encoders.encode_base64(fh_attachment)
                fh_attachment.add_header('Content-Disposition', f'attachment; filename="FolhaHoras_FS_{numero_ot}.pdf"')
                message.attach(fh_attachment)
            
            # Anexar PDFs de PCs selecionados
            for pc_info in pc_buffers:
                pc_attach = MIMEBase('application', 'pdf')
                pc_attach.set_payload(pc_info["buffer"].getvalue())
                encoders.encode_base64(pc_attach)
                pc_attach.add_header('Content-Disposition', f'attachment; filename="{pc_info["numero_pc"]}.pdf"')
                message.attach(pc_attach)
            
            # Enviar para todos os destinatários numa única transação SMTP
            await aiosmtplib.send(
                message,
                hostname=smtp_host,
                port=smtp_port,
                username=smtp_user,
                password=smtp_password,
                start_tls=True,
                recipients=destinatarios,
            )
            
            emails_enviados = list(destinatarios)
            logging.info(
                f"[enviar-pdf][bg] FS#{numero_ot}: enviado em lote para {len(destinatarios)} destinatário(s): {', '.join(destinatarios)}"
            )
            
        except aiosmtplib.SMTPRecipientsRefused as e:
            # `e.recipients` é uma list de SMTPRecipientRefused com .recipient/.code/.message
            rejected_map = {}
            try:
                for r in getattr(e, 'recipients', []) or []:
                    addr = getattr(r, 'recipient', None) or str(r)
                    msg = f"{getattr(r, 'code', '')} {getattr(r, 'message', str(r))}"
                    rejected_map[(addr or '').strip().lower()] = msg
            except Exception as parse_err:
                logging.warning(f"[enviar-pdf][bg] FS#{numero_ot}: erro a parsear SMTPRecipientsRefused: {parse_err}")
            
            for d in destinatarios:
                if d.lower() in rejected_map:
                    emails_falhados.append({"email": d, "error": rejected_map[d.lower()][:500]})
                else:
                    emails_enviados.append(d)
            logging.warning(
                f"[enviar-pdf][bg] FS#{numero_ot}: SMTPRecipientsRefused — "
                f"aceites={len(emails_enviados)}, recusados={len(emails_falhados)}"
            )
            # Logar falhas em app_errors
            if emails_falhados:
                await log_app_error(
                    context=f"FS#{numero_ot}",
                    action="Enviar PDF por Email (SMTP)",
                    error_message=f"SMTPRecipientsRefused: {len(emails_falhados)} destinatário(s) recusado(s)",
                    details={
                        "destinatarios": destinatarios,
                        "recusados": emails_falhados,
                        "aceites": emails_enviados,
                    },
                    user_id=current_user.get("sub"),
                    username=current_user.get("username"),
                )
            
        except Exception as e:
            import traceback as _tb
            tb_str = _tb.format_exc()
            logging.error(f"[enviar-pdf][bg] FS#{numero_ot}: falha geral no envio em lote: {e}")
            for d in destinatarios:
                emails_falhados.append({"email": d, "error": str(e)[:500]})
            await log_app_error(
                context=f"FS#{numero_ot}",
                action="Enviar PDF por Email (SMTP em lote)",
                error_message=f"{type(e).__name__}: {e}",
                details={
                    "destinatarios": destinatarios,
                    "smtp_host": smtp_host,
                    "smtp_port": smtp_port,
                    "smtp_user_present": bool(smtp_user),
                    "smtp_password_present": bool(smtp_password),
                    "relatorio_id": relatorio_id,
                    "documentos": docs_selecionados,
                    "traceback": tb_str[:1500],
                },
                user_id=current_user.get("sub"),
                username=current_user.get("username"),
            )
        
        # Background task: logar resumo final
        if request.emails and not emails_enviados:
            # Todos falharam — log principal já criado por destinatário
            logging.error(
                f"[enviar-pdf][bg] FS#{numero_ot}: TODOS os {len(request.emails)} emails falharam"
            )
            await log_app_error(
                context=f"FS#{numero_ot}",
                action="Enviar PDF por Email (background)",
                error_message=(
                    f"Falha total no envio: {len(request.emails)} destinatário(s) não receberam. "
                    f"Primeiro erro: {emails_falhados[0].get('error') if emails_falhados else 'sem detalhes'}"
                ),
                details={
                    "relatorio_id": relatorio_id,
                    "documentos": docs_selecionados,
                    "destinatarios": request.emails,
                    "falhas": emails_falhados,
                },
                user_id=current_user.get("sub"),
                username=current_user.get("username"),
            )
        else:
            logging.info(
                f"[enviar-pdf][bg] FS#{numero_ot}: enviados={len(emails_enviados)}, "
                f"falhados={len(emails_falhados)}"
            )
        # Sucesso completo (ou parcial) — apaga o registo STARTED para não poluir.
        if _job_started_id:
            try:
                await db.app_errors.delete_one({"id": _job_started_id})
            except Exception:
                pass
        return
        
    except Exception as e:
        import traceback as _tb
        logging.error(f"[enviar-pdf][bg] Erro no worker para FS#{numero_ot}: {e}\n{_tb.format_exc()}")
        try:
            await log_app_error(
                context=f"FS#{numero_ot}",
                action="Enviar PDF por Email (background)",
                error_message=f"{type(e).__name__}: {e}",
                details={
                    "relatorio_id": relatorio_id,
                    "traceback": _tb.format_exc()[:1500],
                },
                user_id=current_user.get("sub"),
                username=current_user.get("username"),
            )
        except Exception:
            pass
        return

@router.get("/relatorios-tecnicos/{relatorio_id}/preview-pdf")
async def preview_pdf_ot(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Gerar preview do PDF da FS sem enviar"""
    # Buscar dados do relatório
    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    
    # Enriquecer com info da OT relacionada
    if relatorio.get("ot_relacionada_id"):
        ot_rel = await db.relatorios_tecnicos.find_one(
            {"id": relatorio["ot_relacionada_id"]}, {"_id": 0, "numero_assistencia": 1}
        )
        if ot_rel:
            relatorio["ot_relacionada_numero"] = ot_rel.get("numero_assistencia")
    
    # Buscar cliente
    cliente = await db.clientes.find_one({"id": relatorio['cliente_id']}, {"_id": 0})
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    # Buscar intervenções
    intervencoes = await db.intervencoes_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("ordem", 1).to_list(length=None)
    
    # Buscar técnicos (registos manuais) - ordenados cronologicamente
    tecnicos = await db.tecnicos_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort([("data_trabalho", 1), ("hora_inicio", 1)]).to_list(length=None)
    
    # Buscar fotografias
    fotografias = await db.fotos_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("ordem", 1).to_list(length=None)
    
    # Buscar assinaturas (todas)
    assinaturas = await db.assinaturas_relatorio.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("data_assinatura", 1).to_list(length=None)
    
    # Buscar equipamentos adicionais
    equipamentos_adicionais = await db.equipamentos_ot.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("ordem", 1).to_list(length=None)
    
    # Buscar materiais
    materiais = await db.materiais_ot.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).to_list(length=None)
    
    # Buscar registos de mão de obra (cronómetros) - ordenados por data e hora
    registos_mao_obra = await db.registos_tecnico_ot.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort([("data_trabalho", 1), ("hora_inicio_segmento", 1)]).to_list(length=None)
    
    # Buscar informações da empresa (para logo e dados no cabeçalho)
    company_info = await db.company_info.find_one({"id": "company_info_default"}, {"_id": 0})
    
    # Buscar relatórios de assistência
    rel_assistencia = await db.relatorios_assistencia.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(length=None)
    
    # Gerar PDF em STREAMING — escreve para tempfile num thread separado e
    # transmite os bytes em chunks ao cliente à medida que vão sendo escritos.
    # Isto mantém a ligação activa para o gateway durante a geração e evita
    # timeouts 520/524 em FS com muitas fotos.
    import time as _time
    t0 = _time.time()
    numero_ot = relatorio.get('numero_assistencia', 'N/A')

    async def _pdf_stream():
        try:
            async for chunk in stream_pdf_via_tempfile(
                generate_ot_pdf,
                relatorio, cliente, intervencoes, tecnicos, fotografias, assinaturas,
                equipamentos_adicionais, materiais, registos_mao_obra, company_info, rel_assistencia,
            ):
                yield chunk
            duration = _time.time() - t0
            if duration > 15:
                logging.warning(f"[PDF] Geração lenta FS#{numero_ot}: {duration:.1f}s")
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            logging.error(f"Erro ao gerar PDF para OT {relatorio_id}: {str(e)}\nTraceback: {tb}")
            try:
                await log_app_error(
                    context=f"FS#{numero_ot}",
                    action="Gerar PDF (stream)",
                    error_message=str(e),
                    details={"relatorio_id": relatorio_id, "traceback": tb[:1500], "duration_s": round(_time.time()-t0, 1)},
                    user_id=current_user.get("sub"),
                    username=current_user.get("username"),
                )
            except Exception:
                pass
            # Sem forma de devolver 500 após bytes terem começado a fluir.
            # A response simplesmente fecha — o cliente apanha o erro.
            return

    return StreamingResponse(
        _pdf_stream(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=FS_{numero_ot}_{cliente.get('nome', 'Cliente').replace(' ', '_')}.pdf",
            "X-Accel-Buffering": "no",  # Desliga buffering NGINX (faz streaming real)
            "Cache-Control": "no-cache, no-store, must-revalidate",
        }
    )


# ============================================================================
# PDF Jobs Async — para FS com muitas fotos (40+)
# ----------------------------------------------------------------------------
# Estado mantido EM DISCO (não em memória) para suportar múltiplos workers
# uvicorn em produção. Cada job tem 2 ficheiros em /tmp/fs_pdfjobs/:
#   - {job_id}.meta.json  → metadados (status, filename, user, etc.)
#   - {job_id}.pdf        → PDF gerado
#
# Endpoints:
#   1. POST /api/relatorios-tecnicos/{id}/preview-pdf-async
#   2. GET  /api/pdf-jobs/{job_id}
#   3. GET  /api/pdf-jobs/{job_id}/download
# ============================================================================
import uuid as _uuid
import os as _os
import time as _job_time
import json as _job_json
from threading import Thread as _JobThread

_PDF_JOBS_TMP_DIR = "/tmp/fs_pdfjobs"  # apenas para geração temporária (não partilhado entre pods)
_PDF_JOB_TTL_SECONDS = 30 * 60  # 30 minutos

_os.makedirs(_PDF_JOBS_TMP_DIR, exist_ok=True)


def _job_local_pdf_path(job_id: str) -> str:
    """Path LOCAL ao pod para gerar o PDF. Após geração é uploaded para GridFS."""
    return _os.path.join(_PDF_JOBS_TMP_DIR, f"{job_id}.pdf")


async def _read_job_meta_async(job_id: str):
    """Lê metadados de um job da MongoDB (partilhado entre todos os pods)."""
    doc = await db.pdf_jobs.find_one({"id": job_id}, {"_id": 0})
    return doc


async def _write_job_meta_async(job_id: str, meta: dict) -> None:
    """Escreve/atualiza metadados na MongoDB (upsert atómico)."""
    meta = {**meta, "id": job_id}
    await db.pdf_jobs.update_one({"id": job_id}, {"$set": meta}, upsert=True)


async def _cleanup_old_pdf_jobs_async() -> None:
    """Remove jobs antigos (>TTL) + os respectivos ficheiros em GridFS."""
    from motor.motor_asyncio import AsyncIOMotorGridFSBucket
    cutoff = _job_time.time() - _PDF_JOB_TTL_SECONDS
    cursor = db.pdf_jobs.find({"started_at": {"$lt": cutoff}}, {"id": 1, "gridfs_id": 1})
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="pdf_files")
    async for doc in cursor:
        gid = doc.get("gridfs_id")
        if gid:
            try:
                from bson import ObjectId
                await bucket.delete(ObjectId(gid) if isinstance(gid, str) else gid)
            except Exception:
                pass
        await db.pdf_jobs.delete_one({"id": doc["id"]})


async def _delete_pdf_job_async(job_id: str) -> None:
    """Remove um job + ficheiro GridFS associado."""
    from motor.motor_asyncio import AsyncIOMotorGridFSBucket
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="pdf_files")
    doc = await db.pdf_jobs.find_one({"id": job_id}, {"gridfs_id": 1})
    if doc and doc.get("gridfs_id"):
        try:
            from bson import ObjectId
            gid = doc["gridfs_id"]
            await bucket.delete(ObjectId(gid) if isinstance(gid, str) else gid)
        except Exception:
            pass
    await db.pdf_jobs.delete_one({"id": job_id})


def _build_fs_zip_with_photos(pdf_path: str, fotografias: list, zip_path: str, filename_pdf: str, numero_ot: str):
    """Cria um ZIP contendo o PDF + uma pasta /fotos/ com TODAS as fotos em HD.
    
    Usado para FS huge_fs (>50 fotos): PDF tem thumbnails, ZIP tem fotos HD.
    """
    import zipfile as _zip
    import base64 as _b64

    with _zip.ZipFile(zip_path, "w", _zip.ZIP_DEFLATED, allowZip64=True) as zf:
        # 1. PDF principal
        zf.write(pdf_path, arcname=filename_pdf)
        # 2. Pasta de fotos HD
        folder_name = f"FS_{numero_ot}_fotos"
        for idx, foto in enumerate(fotografias or [], 1):
            b64 = foto.get("foto_base64") or foto.get("thumb_base64")
            if not b64:
                continue
            try:
                if isinstance(b64, str) and "," in b64[:64] and b64.lstrip().startswith("data:"):
                    b64 = b64.split(",", 1)[1]
                raw = _b64.b64decode(b64, validate=False)
                if not raw or len(raw) < 100:
                    continue
                # Detectar extensão (PIL é overkill aqui — assumimos jpg)
                ext = "jpg"
                if raw[:8].startswith(b"\x89PNG"):
                    ext = "png"
                arc = f"{folder_name}/foto_{idx:03d}.{ext}"
                zf.writestr(arc, raw)
                # Libertar base64 após processar — crítico para evitar OOM
                foto["foto_base64"] = None
                foto["thumb_base64"] = None
            except Exception as e:
                import logging as _log
                _log.warning(f"[zip-fotos] FS#{numero_ot} foto idx={idx}: {e} — skip")


def _run_pdf_generation_job(
    job_id: str,
    relatorio, cliente, intervencoes, tecnicos, fotografias, assinaturas,
    equipamentos_adicionais, materiais, registos_mao_obra, company_info, rel_assistencia,
    loop=None, user_sub: str = "", username: str = "", relatorio_id: str = "", numero_ot: str = "",
    started_error_id: str = None,
):
    """Worker síncrono que corre em thread separada.
    
    1. Gera PDF para tempfile local (memory-efficient via output_file).
    2. Se huge_fs (>50 fotos), também cria ZIP com PDF + fotos HD.
    3. Faz upload para GridFS (partilhado entre pods).
    4. Atualiza meta na collection pdf_jobs.
    5. Apaga tempfiles locais.
    """
    tmp_path = _job_local_pdf_path(job_id)
    zip_path = tmp_path.replace(".pdf", ".zip")
    is_huge = (len(fotografias) if fotografias else 0) >= 50  # mantém-se em sync com HUGE_FS_PHOTO_COUNT
    try:
        # Guardar cópia das fotos PARA o ZIP (antes do PDF as consumir/pop)
        fotos_para_zip = []
        if is_huge:
            for f in (fotografias or []):
                fotos_para_zip.append({
                    "foto_base64": f.get("foto_base64"),
                    "thumb_base64": f.get("thumb_base64"),
                })

        generate_ot_pdf(
            relatorio, cliente, intervencoes, tecnicos, fotografias, assinaturas,
            equipamentos_adicionais, materiais, registos_mao_obra, company_info, rel_assistencia,
            output_file=tmp_path,
        )
        try:
            size_pdf = _os.path.getsize(tmp_path)
        except OSError:
            size_pdf = 0

        # Para huge_fs: criar ZIP com PDF + fotos HD
        upload_path = tmp_path
        upload_filename_suffix = "pdf"
        if is_huge and size_pdf > 0:
            try:
                filename_pdf_inside = f"FS_{numero_ot}.pdf"
                _build_fs_zip_with_photos(tmp_path, fotos_para_zip, zip_path, filename_pdf_inside, numero_ot)
                if _os.path.exists(zip_path) and _os.path.getsize(zip_path) > 0:
                    upload_path = zip_path
                    upload_filename_suffix = "zip"
                    try:
                        _os.unlink(tmp_path)  # apagar PDF original (já está dentro do ZIP)
                    except OSError:
                        pass
            except Exception as zip_err:
                logging.error(f"[pdf-job] ZIP creation falhou job={job_id}: {zip_err}")
                # Continua com upload do PDF sem ZIP
        # Libertar referências grandes
        fotos_para_zip = None
        try:
            size = _os.path.getsize(upload_path)
        except OSError:
            size = 0

        # Upload do PDF/ZIP para GridFS via coroutine_threadsafe (worker é síncrono)
        gridfs_id = None
        if loop is not None and size > 0:
            try:
                import asyncio as _async_upload
                from motor.motor_asyncio import AsyncIOMotorGridFSBucket

                async def _upload():
                    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="pdf_files")
                    with open(upload_path, "rb") as fin:
                        oid = await bucket.upload_from_stream(
                            f"{job_id}.{upload_filename_suffix}",
                            fin,
                            metadata={"job_id": job_id, "relatorio_id": relatorio_id, "type": upload_filename_suffix},
                        )
                    return str(oid)

                fut = _async_upload.run_coroutine_threadsafe(_upload(), loop)
                gridfs_id = fut.result(timeout=120)
            except Exception as up_err:
                logging.error(f"[pdf-job] upload GridFS falhou job={job_id}: {up_err}")
                raise

        # Update meta com sucesso
        if loop is not None:
            try:
                import asyncio as _async_done
                _async_done.run_coroutine_threadsafe(
                    _write_job_meta_async(job_id, {
                        "status": "done",
                        "finished_at": _job_time.time(),
                        "size_bytes": size,
                        "gridfs_id": gridfs_id,
                        "output_type": upload_filename_suffix,  # "pdf" ou "zip"
                    }),
                    loop,
                ).result(timeout=30)
            except Exception as meta_err:
                logging.error(f"[pdf-job] meta done update falhou job={job_id}: {meta_err}")

        # Sucesso — apagar STARTED log se existir
        if started_error_id and loop is not None:
            try:
                import asyncio as _async_ok
                _async_ok.run_coroutine_threadsafe(
                    db.app_errors.delete_one({"id": started_error_id}),
                    loop,
                )
            except Exception:
                pass
    except Exception as e:
        import traceback as _tb
        tb_text = _tb.format_exc()
        logging.error(f"[pdf-job] FALHA job={job_id}: {e}\n{tb_text}")
        if loop is not None:
            try:
                import asyncio as _async_err
                _async_err.run_coroutine_threadsafe(
                    _write_job_meta_async(job_id, {
                        "status": "error",
                        "finished_at": _job_time.time(),
                        "error": f"{type(e).__name__}: {e}",
                    }),
                    loop,
                ).result(timeout=15)
            except Exception:
                pass

        # Apagar tempfile local
        try:
            _os.unlink(tmp_path)
        except OSError:
            pass

        # Registar no log de erros admin para análise posterior
        if loop is not None:
            try:
                import asyncio as _async_log
                _async_log.run_coroutine_threadsafe(
                    log_app_error(
                        context=f"FS#{numero_ot}",
                        action="Gerar PDF (job-async)",
                        error_message=f"{type(e).__name__}: {e}",
                        details={
                            "job_id": job_id,
                            "relatorio_id": relatorio_id,
                            "n_fotos": len(fotografias) if fotografias else 0,
                            "n_intervencoes": len(intervencoes) if intervencoes else 0,
                            "traceback": tb_text[:1500],
                        },
                        severity="error",
                        user_id=user_sub,
                        username=username,
                    ),
                    loop,
                )
            except Exception as log_err:
                logging.error(f"[pdf-job] falha ao registar erro em app_errors: {log_err}")
        return

    # Sucesso — apagar tempfile(s) local(is)
    for _p in (tmp_path, zip_path):
        try:
            _os.unlink(_p)
        except OSError:
            pass


@router.post("/relatorios-tecnicos/{relatorio_id}/preview-pdf-async")
async def start_pdf_generation_job(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Inicia geração de PDF em background. Devolve job_id de imediato."""
    import asyncio as _asyncio_local
    await _cleanup_old_pdf_jobs_async()

    relatorio = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not relatorio:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")

    if relatorio.get("ot_relacionada_id"):
        ot_rel = await db.relatorios_tecnicos.find_one(
            {"id": relatorio["ot_relacionada_id"]}, {"_id": 0, "numero_assistencia": 1}
        )
        if ot_rel:
            relatorio["ot_relacionada_numero"] = ot_rel.get("numero_assistencia")

    cliente = await db.clientes.find_one({"id": relatorio['cliente_id']}, {"_id": 0})
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    intervencoes = await db.intervencoes_relatorio.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).sort("ordem", 1).to_list(length=None)

    tecnicos = await db.tecnicos_relatorio.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).sort([("data_trabalho", 1), ("hora_inicio", 1)]).to_list(length=None)

    fotografias = await db.fotos_relatorio.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).sort("ordem", 1).to_list(length=None)

    assinaturas = await db.assinaturas_relatorio.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).sort("data_assinatura", 1).to_list(length=None)

    equipamentos_adicionais = await db.equipamentos_ot.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).sort("ordem", 1).to_list(length=None)

    materiais = await db.materiais_ot.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).to_list(length=None)

    registos_mao_obra = await db.registos_tecnico_ot.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).sort([("data_trabalho", 1), ("hora_inicio_segmento", 1)]).to_list(length=None)

    company_info = await db.company_info.find_one({"id": "company_info_default"}, {"_id": 0})

    rel_assistencia = await db.relatorios_assistencia.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(length=None)

    job_id = _uuid.uuid4().hex
    numero_ot = relatorio.get('numero_assistencia', 'N/A')
    cliente_nome = (cliente.get('nome') or 'Cliente').replace(' ', '_')
    filename = f"FS_{numero_ot}_{cliente_nome}.pdf"

    await _write_job_meta_async(job_id, {
        "status": "pending",
        "filename": filename,
        "started_at": _job_time.time(),
        "finished_at": None,
        "size_bytes": 0,
        "user_sub": current_user.get("sub", ""),
        "error": None,
        "gridfs_id": None,
    })

    # LOGGING PROATIVO: regista STARTED ANTES de lançar a thread. Se o pod
    # morrer durante a geração (ex: OOM), esta entrada persiste em
    # /admin/errors com identificação da FS para investigação.
    # Apagada em caso de sucesso pelo download endpoint.
    _started_error_id = None
    try:
        _started_error_id = await log_app_error(
            context=f"FS#{numero_ot}",
            action="Gerar PDF (job-async) — STARTED",
            error_message=(
                "Geração de PDF iniciada. Se este registo permanecer visível "
                "após alguns minutos, significa que o processo foi terminado "
                "pelo sistema (provável OOM em FS com muitas fotografias)."
            ),
            details={
                "relatorio_id": relatorio_id,
                "job_id": job_id,
                "n_fotos": len(fotografias) if fotografias else 0,
                "n_intervencoes": len(intervencoes) if intervencoes else 0,
            },
            severity="info",
            user_id=current_user.get("sub"),
            username=current_user.get("username"),
        )
    except Exception as _log_err:
        logging.warning(f"[pdf-job] falha STARTED log: {_log_err}")

    thread = _JobThread(
        target=_run_pdf_generation_job,
        args=(
            job_id, relatorio, cliente, intervencoes, tecnicos, fotografias, assinaturas,
            equipamentos_adicionais, materiais, registos_mao_obra, company_info, rel_assistencia,
        ),
        kwargs={
            "loop": _asyncio_local.get_event_loop(),
            "user_sub": current_user.get("sub", ""),
            "username": current_user.get("username", ""),
            "relatorio_id": relatorio_id,
            "numero_ot": str(numero_ot),
            "started_error_id": _started_error_id,
        },
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id, "filename": filename}


@router.get("/pdf-jobs/{job_id}")
async def get_pdf_job_status(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Devolve estado do job de geração de PDF."""
    meta = await _read_job_meta_async(job_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Job não encontrado ou expirado")
    if meta.get("user_sub") and meta["user_sub"] != current_user.get("sub", ""):
        raise HTTPException(status_code=403, detail="Sem permissão para este job")

    elapsed = _job_time.time() - meta.get("started_at", _job_time.time())
    return {
        "job_id": job_id,
        "status": meta.get("status", "pending"),
        "filename": meta.get("filename", "FS.pdf"),
        "size_bytes": meta.get("size_bytes", 0),
        "elapsed_seconds": round(elapsed, 1),
        "error": meta.get("error"),
    }


@router.get("/pdf-jobs/{job_id}/download")
async def download_pdf_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Faz stream do PDF gerado. Após sucesso, o job e os ficheiros são removidos."""
    meta = await _read_job_meta_async(job_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Job não encontrado ou expirado")
    if meta.get("user_sub") and meta["user_sub"] != current_user.get("sub", ""):
        raise HTTPException(status_code=403, detail="Sem permissão para este job")
    if meta.get("status") == "pending":
        raise HTTPException(status_code=425, detail="PDF ainda em geração")
    if meta.get("status") == "error":
        raise HTTPException(status_code=500, detail=meta.get("error") or "Erro na geração")

    gridfs_id = meta.get("gridfs_id")
    if not gridfs_id:
        raise HTTPException(status_code=410, detail="Ficheiro expirou ou ainda não foi gerado")

    filename = meta.get("filename", "FS.pdf")
    output_type = meta.get("output_type", "pdf")
    # Se foi gerado ZIP (huge_fs), troca a extensão do filename
    if output_type == "zip" and filename.lower().endswith(".pdf"):
        filename = filename[:-4] + ".zip"
    size = meta.get("size_bytes", 0)
    media_type = "application/zip" if output_type == "zip" else "application/pdf"

    from motor.motor_asyncio import AsyncIOMotorGridFSBucket
    from bson import ObjectId
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="pdf_files")
    try:
        gridfs_oid = ObjectId(gridfs_id) if isinstance(gridfs_id, str) else gridfs_id
    except Exception:
        raise HTTPException(status_code=500, detail="gridfs_id inválido")

    async def _stream_file():
        try:
            grid_out = await bucket.open_download_stream(gridfs_oid)
            while True:
                chunk = await grid_out.readchunk()
                if not chunk:
                    break
                yield chunk
        finally:
            await _delete_pdf_job_async(job_id)

    return StreamingResponse(
        _stream_file(),
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Length": str(size),
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache, no-store, must-revalidate",
        }
    )





# ============ Notifications Routes (movido para routes/) ============

# ============ Holidays Routes ============


# ============ Faturação de Intervenções (Tabs) ============

def _norm_codigo(c) -> str:
    """Normaliza código horário para chave consistente."""
    if c is None:
        return ""
    return str(c).strip().upper()


async def _build_disponibilidade(relatorio_id: str):
    """
    Calcula totais registados (de cronómetros + manuais) e o que já foi
    facturado em outras intervenções, retornando o saldo disponível por
    técnico × código.
    """
    # Registos de cronómetros
    registos = await db.registos_tecnico_ot.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).to_list(length=None)

    # Registos manuais
    tecnicos_manuais = await db.tecnicos_relatorio.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).to_list(length=None)

    # Estrutura: chave = (tecnico_id, codigo) → totais
    totais = {}

    def _key(tid, codigo):
        return (tid or "", _norm_codigo(codigo))

    def _ensure(tid, nome, funcao, codigo):
        k = _key(tid, codigo)
        if k not in totais:
            totais[k] = {
                "tecnico_id": tid or "",
                "tecnico_nome": nome or "",
                "funcao_ot": funcao or "tecnico",
                "codigo": _norm_codigo(codigo),
                "registado_trabalho": 0.0,
                "registado_viagem": 0.0,
                "registado_oficina": 0.0,
                "registado_km": 0.0,
                "ja_facturado_trabalho": 0.0,
                "ja_facturado_viagem": 0.0,
                "ja_facturado_oficina": 0.0,
                "ja_facturado_km": 0.0,
            }
        return totais[k]

    for r in registos:
        tid = r.get("tecnico_id") or ""
        nome = r.get("tecnico_nome") or ""
        funcao = r.get("funcao_ot") or "tecnico"
        codigo = r.get("codigo")
        tipo = (r.get("tipo") or "").lower()
        horas = float(r.get("horas_arredondadas") or 0)
        km = float(r.get("km") or 0)
        item = _ensure(tid, nome, funcao, codigo)
        if tipo == "trabalho":
            item["registado_trabalho"] += horas
        elif tipo == "viagem":
            item["registado_viagem"] += horas
        elif tipo == "oficina":
            item["registado_oficina"] += horas
        item["registado_km"] += km

    for t in tecnicos_manuais:
        tid = t.get("tecnico_id") or ""
        nome = t.get("tecnico_nome") or ""
        funcao = t.get("funcao_ot") or "tecnico"
        codigo = t.get("codigo")
        tipo = (t.get("tipo") or "trabalho").lower()
        horas = float(t.get("horas_arredondadas") or t.get("horas") or 0)
        km = float(t.get("kms_deslocacao") or t.get("km") or 0)
        item = _ensure(tid, nome, funcao, codigo)
        if tipo == "trabalho":
            item["registado_trabalho"] += horas
        elif tipo == "viagem":
            item["registado_viagem"] += horas
        elif tipo == "oficina":
            item["registado_oficina"] += horas
        item["registado_km"] += km

    # Já facturado em qualquer intervenção desta FS
    facturadas = await db.faturacao_intervencoes.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).to_list(length=None)
    for f in facturadas:
        for a in f.get("alocacoes", []) or []:
            tid = a.get("tecnico_id") or ""
            nome = a.get("tecnico_nome") or ""
            funcao = a.get("funcao_ot") or "tecnico"
            codigo = a.get("codigo")
            item = _ensure(tid, nome, funcao, codigo)
            item["ja_facturado_trabalho"] += float(a.get("horas_trabalho") or 0)
            item["ja_facturado_viagem"] += float(a.get("horas_viagem") or 0)
            item["ja_facturado_oficina"] += float(a.get("horas_oficina") or 0)
            item["ja_facturado_km"] += float(a.get("km") or 0)

    # Calcular disponível e arredondar para 2 casas
    out = []
    for v in totais.values():
        v["disponivel_trabalho"] = round(
            max(0.0, v["registado_trabalho"] - v["ja_facturado_trabalho"]), 2
        )
        v["disponivel_viagem"] = round(
            max(0.0, v["registado_viagem"] - v["ja_facturado_viagem"]), 2
        )
        v["disponivel_oficina"] = round(
            max(0.0, v["registado_oficina"] - v["ja_facturado_oficina"]), 2
        )
        v["disponivel_km"] = round(
            max(0.0, v["registado_km"] - v["ja_facturado_km"]), 2
        )
        for k_round in (
            "registado_trabalho", "registado_viagem", "registado_oficina", "registado_km",
            "ja_facturado_trabalho", "ja_facturado_viagem", "ja_facturado_oficina", "ja_facturado_km",
        ):
            v[k_round] = round(v[k_round], 2)
        # Esconder linhas todas a zero
        if any([
            v["registado_trabalho"], v["registado_viagem"], v["registado_oficina"], v["registado_km"],
        ]):
            out.append(v)

    # Ordenar por nome técnico, depois código
    out.sort(key=lambda x: (x["tecnico_nome"], x["codigo"]))
    return out


@router.get("/relatorios-tecnicos/{relatorio_id}/faturacao/disponibilidade")
async def get_faturacao_disponibilidade(
    relatorio_id: str,
    intervencao_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """
    Retorna por técnico × código: registado, já facturado, disponível e km.

    Se `intervencao_id` for fornecido, soma de volta os valores que JÁ estão
    nessa intervenção (para o admin poder editar a facturação existente sem
    perder o saldo dela própria).
    """
    rel = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0, "id": 1})
    if not rel:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")

    disp = await _build_disponibilidade(relatorio_id)

    # Se já existir facturação para esta intervenção, devolver para edição e
    # somar essas horas ao "disponível" (são reversíveis).
    existente = None
    if intervencao_id:
        existente = await db.faturacao_intervencoes.find_one(
            {"relatorio_id": relatorio_id, "intervencao_id": intervencao_id},
            {"_id": 0},
        )
        if existente:
            for a in existente.get("alocacoes", []) or []:
                tid = a.get("tecnico_id") or ""
                cod = _norm_codigo(a.get("codigo"))
                for item in disp:
                    if item["tecnico_id"] == tid and item["codigo"] == cod:
                        item["disponivel_trabalho"] = round(
                            item["disponivel_trabalho"] + float(a.get("horas_trabalho") or 0), 2)
                        item["disponivel_viagem"] = round(
                            item["disponivel_viagem"] + float(a.get("horas_viagem") or 0), 2)
                        item["disponivel_oficina"] = round(
                            item["disponivel_oficina"] + float(a.get("horas_oficina") or 0), 2)
                        item["disponivel_km"] = round(
                            item["disponivel_km"] + float(a.get("km") or 0), 2)
                        break

    return {
        "linhas": disp,
        "alocacao_existente": existente,
    }


@router.post("/relatorios-tecnicos/{relatorio_id}/intervencoes/{intervencao_id}/facturar")
async def facturar_intervencao(
    relatorio_id: str,
    intervencao_id: str,
    request: FaturacaoIntervencaoRequest,
    current_user: dict = Depends(get_current_user),
):
    """Marca uma intervenção como facturada com as alocações fornecidas."""
    interv = await db.intervencoes_relatorio.find_one(
        {"id": intervencao_id, "relatorio_id": relatorio_id}, {"_id": 0}
    )
    if not interv:
        raise HTTPException(status_code=404, detail="Intervenção não encontrada")

    # Validar saldo: somar alocações já existentes em OUTRAS intervenções +
    # as novas, e exigir que não excedam o registado.
    disp = await _build_disponibilidade(relatorio_id)
    by_key = {(d["tecnico_id"], d["codigo"]): d for d in disp}

    # Subtrair facturação ANTERIOR desta mesma intervenção (se existir),
    # porque vai ser substituída.
    anterior = await db.faturacao_intervencoes.find_one(
        {"relatorio_id": relatorio_id, "intervencao_id": intervencao_id}, {"_id": 0}
    )
    if anterior:
        for a in anterior.get("alocacoes", []) or []:
            k = (a.get("tecnico_id") or "", _norm_codigo(a.get("codigo")))
            if k in by_key:
                by_key[k]["disponivel_trabalho"] = round(
                    by_key[k]["disponivel_trabalho"] + float(a.get("horas_trabalho") or 0), 2)
                by_key[k]["disponivel_viagem"] = round(
                    by_key[k]["disponivel_viagem"] + float(a.get("horas_viagem") or 0), 2)
                by_key[k]["disponivel_oficina"] = round(
                    by_key[k]["disponivel_oficina"] + float(a.get("horas_oficina") or 0), 2)
                by_key[k]["disponivel_km"] = round(
                    by_key[k]["disponivel_km"] + float(a.get("km") or 0), 2)

    # Validar pedido
    erros = []
    for a in request.alocacoes:
        k = (a.tecnico_id or "", _norm_codigo(a.codigo))
        d = by_key.get(k)
        if not d:
            erros.append(
                f"{a.tecnico_nome} (código {a.codigo}): sem registos disponíveis nesta FS."
            )
            continue
        if a.horas_trabalho < 0 or a.horas_viagem < 0 or a.horas_oficina < 0 or a.km < 0:
            erros.append(f"{a.tecnico_nome}: valores negativos não permitidos.")
            continue
        # Tolerância de 0.01h para arredondamentos
        tol = 0.011
        if a.horas_trabalho > d["disponivel_trabalho"] + tol:
            erros.append(
                f"{a.tecnico_nome} ({a.codigo}): horas de trabalho a facturar ({a.horas_trabalho}h) excedem disponível ({d['disponivel_trabalho']}h)."
            )
        if a.horas_viagem > d["disponivel_viagem"] + tol:
            erros.append(
                f"{a.tecnico_nome} ({a.codigo}): horas de viagem a facturar ({a.horas_viagem}h) excedem disponível ({d['disponivel_viagem']}h)."
            )
        if a.horas_oficina > d["disponivel_oficina"] + tol:
            erros.append(
                f"{a.tecnico_nome} ({a.codigo}): horas de oficina a facturar ({a.horas_oficina}h) excedem disponível ({d['disponivel_oficina']}h)."
            )
        if a.km > d["disponivel_km"] + tol:
            erros.append(
                f"{a.tecnico_nome} ({a.codigo}): km a facturar ({a.km}) excedem disponível ({d['disponivel_km']})."
            )

    if erros:
        raise HTTPException(status_code=400, detail=" | ".join(erros))

    # Filtrar alocações vazias (todas a zero)
    alocacoes_finais = [
        a.model_dump() for a in request.alocacoes
        if (a.horas_trabalho + a.horas_viagem + a.horas_oficina + a.km) > 0
    ]

    fat = FaturacaoIntervencao(
        relatorio_id=relatorio_id,
        intervencao_id=intervencao_id,
        alocacoes=[FaturacaoAlocacao(**a) for a in alocacoes_finais],
        created_by=current_user.get("sub"),
        created_by_name=current_user.get("username"),
    )
    fat_dict = fat.model_dump()
    fat_dict["created_at"] = fat_dict["created_at"].isoformat()

    # Upsert: substitui o documento desta intervenção
    await db.faturacao_intervencoes.delete_many(
        {"relatorio_id": relatorio_id, "intervencao_id": intervencao_id}
    )
    await db.faturacao_intervencoes.insert_one(fat_dict)

    # Marcar a intervenção como facturada
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.intervencoes_relatorio.update_one(
        {"id": intervencao_id, "relatorio_id": relatorio_id},
        {"$set": {
            "facturada": True,
            "facturada_at": now_iso,
            "facturada_by": current_user.get("username"),
        }},
    )

    fat_dict.pop("_id", None)
    logging.info(
        f"Intervenção {intervencao_id} facturada por {current_user.get('username')} "
        f"({len(alocacoes_finais)} alocações)"
    )
    return {"message": "Intervenção marcada como facturada", "faturacao": fat_dict}


@router.delete("/relatorios-tecnicos/{relatorio_id}/intervencoes/{intervencao_id}/facturar")
async def desfacturar_intervencao(
    relatorio_id: str,
    intervencao_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Remove a marcação 'facturada' e liberta as horas alocadas."""
    interv = await db.intervencoes_relatorio.find_one(
        {"id": intervencao_id, "relatorio_id": relatorio_id}, {"_id": 0}
    )
    if not interv:
        raise HTTPException(status_code=404, detail="Intervenção não encontrada")

    # Bloquear se já existir continuidade gerada a partir desta intervenção
    continuidade = await db.intervencoes_relatorio.find_one(
        {"herdada_de_intervencao_id": intervencao_id}, {"_id": 0, "id": 1, "relatorio_id": 1}
    )
    if continuidade:
        fs_continuidade = await db.relatorios_tecnicos.find_one(
            {"id": continuidade.get("relatorio_id")}, {"_id": 0, "numero_assistencia": 1}
        )
        fs_num = fs_continuidade.get("numero_assistencia") if fs_continuidade else "?"
        raise HTTPException(
            status_code=400,
            detail=f"Não é possível desfacturar: esta intervenção já gerou continuidade na FS #{fs_num}. Apaga primeiro a FS de continuidade ou a intervenção herdada.",
        )

    await db.faturacao_intervencoes.delete_many(
        {"relatorio_id": relatorio_id, "intervencao_id": intervencao_id}
    )
    await db.intervencoes_relatorio.update_one(
        {"id": intervencao_id, "relatorio_id": relatorio_id},
        {"$set": {"facturada": False, "facturada_at": None, "facturada_by": None}},
    )
    logging.info(
        f"Intervenção {intervencao_id} desfacturada por {current_user.get('username')}"
    )
    return {"message": "Facturação removida", "intervencao_id": intervencao_id}


@router.get("/relatorios-tecnicos/{relatorio_id}/faturacao")
async def listar_faturacao(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Lista todas as facturações de uma FS, agrupadas por intervenção."""
    docs = await db.faturacao_intervencoes.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).to_list(length=None)
    return docs


@router.get("/relatorios-tecnicos/{relatorio_id}/cadeia")
async def obter_cadeia_relacionadas(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Retorna a cadeia completa de FSs relacionadas à dada (via `ot_relacionada_id`).

    Sobe até à raiz (FS sem ot_relacionada_id) e depois desce recursivamente
    por todos os filhos. Devolve a lista ordenada cronologicamente, marcando
    qual é a actual.
    """
    rel = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not rel:
        raise HTTPException(status_code=404, detail="FS não encontrada")

    # 1) Subir até à raiz
    raiz_id = rel["id"]
    visited = set()
    while True:
        if raiz_id in visited:
            break
        visited.add(raiz_id)
        cur = await db.relatorios_tecnicos.find_one(
            {"id": raiz_id}, {"_id": 0, "id": 1, "ot_relacionada_id": 1}
        )
        if not cur or not cur.get("ot_relacionada_id"):
            break
        raiz_id = cur["ot_relacionada_id"]

    # 2) Descer recursivamente a partir da raiz
    chain = []
    seen = set()

    async def walk(node_id):
        if node_id in seen:
            return
        seen.add(node_id)
        node = await db.relatorios_tecnicos.find_one(
            {"id": node_id},
            {
                "_id": 0,
                "id": 1,
                "numero_assistencia": 1,
                "data_servico": 1,
                "data_criacao": 1,
                "status": 1,
                "ot_relacionada_id": 1,
                "cliente_nome": 1,
            },
        )
        if not node:
            return
        chain.append({
            "id": node.get("id"),
            "numero_assistencia": node.get("numero_assistencia"),
            "data_servico": node.get("data_servico"),
            "data_criacao": node.get("data_criacao"),
            "status": node.get("status"),
            "ot_relacionada_id": node.get("ot_relacionada_id"),
            "cliente_nome": node.get("cliente_nome"),
            "is_atual": node.get("id") == relatorio_id,
        })
        # Filhos: outras FSs cujo ot_relacionada_id == node_id
        filhos = await db.relatorios_tecnicos.find(
            {"ot_relacionada_id": node_id},
            {"_id": 0, "id": 1, "numero_assistencia": 1, "data_servico": 1},
        ).sort([("numero_assistencia", 1)]).to_list(length=None)
        for f in filhos:
            await walk(f["id"])

    await walk(raiz_id)

    return {
        "atual_id": relatorio_id,
        "raiz_id": raiz_id,
        "cadeia": chain,
        "total": len(chain),
    }

@router.post("/relatorios-tecnicos/{relatorio_id}/criar-continuidade")
async def criar_fs_continuidade(
    relatorio_id: str,
    request: CriarContinuidadeRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Cria uma nova FS herdada da actual.

    Para cada intervenção selecionada na FS origem:
      1. Aloca todo o saldo disponível (registado − já facturado noutras
         intervenções) à intervenção, marcando-a como facturada.
      2. Duplica para a nova FS:
         - Intervenção (com herdada_de_*)
         - Equipamentos OT relacionados
         - Materiais
         - Relatórios de assistência
         - Fotografias (mantendo binário)
         - Assinaturas
    Os registos de mão-de-obra ficam só na FS origem.
    """
    if not request.intervencao_ids:
        raise HTTPException(status_code=400, detail="Indica pelo menos uma intervenção a transitar.")

    # Validar FS origem
    origem = await db.relatorios_tecnicos.find_one({"id": relatorio_id}, {"_id": 0})
    if not origem:
        raise HTTPException(status_code=404, detail="FS origem não encontrada")

    # Validar intervenções
    intervs_origem = await db.intervencoes_relatorio.find(
        {"id": {"$in": request.intervencao_ids}, "relatorio_id": relatorio_id},
        {"_id": 0},
    ).to_list(length=None)
    if len(intervs_origem) != len(request.intervencao_ids):
        raise HTTPException(status_code=400, detail="Algumas intervenções não pertencem a esta FS.")

    # 1) Facturar todo o disponível nas intervenções selecionadas
    disp = await _build_disponibilidade(relatorio_id)
    by_key = {(d["tecnico_id"], d["codigo"]): d for d in disp}

    # Obter qualquer facturação anterior nas intervenções alvo, para "devolver" ao saldo
    facturas_anteriores = await db.faturacao_intervencoes.find(
        {"relatorio_id": relatorio_id, "intervencao_id": {"$in": request.intervencao_ids}},
        {"_id": 0},
    ).to_list(length=None)
    for fa in facturas_anteriores:
        for a in fa.get("alocacoes", []) or []:
            k = (a.get("tecnico_id") or "", _norm_codigo(a.get("codigo")))
            if k in by_key:
                by_key[k]["disponivel_trabalho"] += float(a.get("horas_trabalho") or 0)
                by_key[k]["disponivel_viagem"] += float(a.get("horas_viagem") or 0)
                by_key[k]["disponivel_oficina"] += float(a.get("horas_oficina") or 0)
                by_key[k]["disponivel_km"] += float(a.get("km") or 0)

    # Distribuir disponível pelas intervenções: começa pela primeira selecionada,
    # vai consumindo até zerar. (Estratégia simples — reproduz o que o admin faria.)
    saldos = {k: dict(v) for k, v in by_key.items()}
    alocacoes_por_interv = {iid: [] for iid in request.intervencao_ids}
    for iid in request.intervencao_ids:
        for k, s in saldos.items():
            ht = round(max(0.0, s["disponivel_trabalho"]), 2)
            hv = round(max(0.0, s["disponivel_viagem"]), 2)
            ho = round(max(0.0, s["disponivel_oficina"]), 2)
            km = round(max(0.0, s["disponivel_km"]), 2)
            if ht + hv + ho + km <= 0:
                continue
            alocacoes_por_interv[iid].append({
                "tecnico_id": s["tecnico_id"],
                "tecnico_nome": s["tecnico_nome"],
                "funcao_ot": s.get("funcao_ot") or "tecnico",
                "codigo": s["codigo"],
                "horas_trabalho": ht,
                "horas_viagem": hv,
                "horas_oficina": ho,
                "km": km,
            })
            s["disponivel_trabalho"] = 0
            s["disponivel_viagem"] = 0
            s["disponivel_oficina"] = 0
            s["disponivel_km"] = 0
        # Após primeira intervenção consumir tudo, as restantes recebem alocações vazias.

    now_iso = datetime.now(timezone.utc).isoformat()
    # Substituir facturações anteriores e marcar as intervenções origem como facturadas
    for iid in request.intervencao_ids:
        await db.faturacao_intervencoes.delete_many(
            {"relatorio_id": relatorio_id, "intervencao_id": iid}
        )
        if alocacoes_por_interv[iid]:
            fat = FaturacaoIntervencao(
                relatorio_id=relatorio_id,
                intervencao_id=iid,
                alocacoes=[FaturacaoAlocacao(**a) for a in alocacoes_por_interv[iid]],
                created_by=current_user.get("sub"),
                created_by_name=current_user.get("username"),
            )
            d = fat.model_dump()
            d["created_at"] = d["created_at"].isoformat()
            await db.faturacao_intervencoes.insert_one(d)
        await db.intervencoes_relatorio.update_one(
            {"id": iid, "relatorio_id": relatorio_id},
            {"$set": {
                "facturada": True,
                "facturada_at": now_iso,
                "facturada_by": current_user.get("username"),
            }},
        )

    # 2) Criar nova FS herdada
    last_relatorio = await db.relatorios_tecnicos.find_one(
        {}, sort=[("numero_assistencia", -1)]
    )
    last_numero = last_relatorio.get("numero_assistencia", 0) if last_relatorio else 0
    novo_numero = max(last_numero + 1, 354)

    nova = RelatorioTecnico(
        numero_assistencia=novo_numero,
        cliente_id=origem["cliente_id"],
        created_by_id=current_user["sub"],
        cliente_nome=origem.get("cliente_nome", ""),
        data_servico=date.today(),
        local_intervencao=origem.get("local_intervencao", ""),
        pedido_por=origem.get("pedido_por", ""),
        contacto_pedido=origem.get("contacto_pedido"),
        ot_relacionada_id=origem["id"],
        equipamento_tipologia=origem.get("equipamento_tipologia"),
        equipamento_marca=origem.get("equipamento_marca"),
        equipamento_modelo=origem.get("equipamento_modelo"),
        equipamento_numero_serie=origem.get("equipamento_numero_serie"),
        equipamento_ano_fabrico=origem.get("equipamento_ano_fabrico"),
        equipamento_horas_funcionamento=origem.get("equipamento_horas_funcionamento"),
        motivo_assistencia=origem.get("motivo_assistencia", ""),
        referencia_interna_cliente=origem.get("referencia_interna_cliente"),
    )
    nova_dict = nova.dict()
    nova_dict["data_criacao"] = nova_dict["data_criacao"].isoformat()
    nova_dict["data_servico"] = nova_dict["data_servico"].isoformat()
    if nova_dict.get("data_fim"):
        nova_dict["data_fim"] = nova_dict["data_fim"].isoformat()
    await db.relatorios_tecnicos.insert_one(nova_dict)
    nova_id = nova.id

    # 3) Para cada intervenção origem: duplicar tudo (sem registos de mão-de-obra)
    novo_intervs_count = 0
    origem_numero = origem.get("numero_assistencia")
    # Mapa intervencao origem -> nova intervencao
    map_intervs = {}
    for io_orig in intervs_origem:
        nova_interv_id = str(uuid.uuid4())
        map_intervs[io_orig["id"]] = nova_interv_id
        novo_intervs_count += 1
        ni = {
            "id": nova_interv_id,
            "relatorio_id": nova_id,
            "data_intervencao": io_orig.get("data_intervencao"),
            "motivo_assistencia": io_orig.get("motivo_assistencia", ""),
            "relatorio_assistencia": io_orig.get("relatorio_assistencia"),
            "equipamento_id": io_orig.get("equipamento_id"),
            "ordem": io_orig.get("ordem", 0),
            "facturada": False,
            "facturada_at": None,
            "facturada_by": None,
            "herdada_de_intervencao_id": io_orig["id"],
            "herdada_de_fs_id": origem["id"],
            "herdada_de_fs_numero": origem_numero,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.intervencoes_relatorio.insert_one(ni)

    # 4) Duplicar Equipamentos OT relacionados
    eqs_origem = await db.equipamentos_ot.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).to_list(length=None)
    map_eqs = {}
    for eq in eqs_origem:
        # Só replicar equipamentos referenciados pelas intervenções transitadas, ou globais
        eq_iid = eq.get("intervencao_id")
        if eq_iid and eq_iid not in map_intervs:
            continue
        novo_eq_id = str(uuid.uuid4())
        map_eqs[eq.get("id")] = novo_eq_id
        novo = {**eq, "id": novo_eq_id, "relatorio_id": nova_id}
        if eq_iid and eq_iid in map_intervs:
            novo["intervencao_id"] = map_intervs[eq_iid]
        novo.pop("_id", None)
        await db.equipamentos_ot.insert_one(novo)

    # 5) Duplicar Materiais (apenas das intervenções transitadas)
    mats = await db.materiais_ot.find(
        {"relatorio_id": relatorio_id, "intervencao_id": {"$in": list(map_intervs.keys())}},
        {"_id": 0},
    ).to_list(length=None)
    for m in mats:
        novo = {**m, "id": str(uuid.uuid4()), "relatorio_id": nova_id}
        if m.get("intervencao_id") in map_intervs:
            novo["intervencao_id"] = map_intervs[m["intervencao_id"]]
        novo.pop("_id", None)
        # Limpar PC/Cotação para que fique limpa na nova FS
        novo.pop("pedido_cotacao_id", None)
        novo.pop("pc_numero", None)
        novo.pop("posicao", None)
        novo.pop("codigo", None)
        await db.materiais_ot.insert_one(novo)

    # 6) Duplicar Relatórios de Assistência
    ras = await db.relatorios_assistencia.find(
        {"relatorio_id": relatorio_id, "intervencao_id": {"$in": list(map_intervs.keys())}},
        {"_id": 0},
    ).to_list(length=None)
    for ra in ras:
        novo = {**ra, "id": str(uuid.uuid4()), "relatorio_id": nova_id}
        if ra.get("intervencao_id") in map_intervs:
            novo["intervencao_id"] = map_intervs[ra["intervencao_id"]]
        novo.pop("_id", None)
        # Atualizar equipamento_ids para os novos IDs duplicados (quando aplicável)
        eq_ids = ra.get("equipamento_ids") or []
        novo["equipamento_ids"] = [map_eqs.get(e, e) for e in eq_ids]
        await db.relatorios_assistencia.insert_one(novo)

    # 7) Duplicar Fotografias
    fotos = await db.fotos_relatorio.find(
        {"relatorio_id": relatorio_id, "intervencao_id": {"$in": list(map_intervs.keys())}},
        {"_id": 0},
    ).to_list(length=None)
    for f in fotos:
        novo = {**f, "id": str(uuid.uuid4()), "relatorio_id": nova_id}
        if f.get("intervencao_id") in map_intervs:
            novo["intervencao_id"] = map_intervs[f["intervencao_id"]]
        novo.pop("_id", None)
        await db.fotos_relatorio.insert_one(novo)

    # 8) Duplicar Assinaturas associadas às intervenções
    assins = await db.assinaturas_relatorio.find(
        {"relatorio_id": relatorio_id}, {"_id": 0}
    ).to_list(length=None)
    for a in assins:
        a_iid = a.get("intervencao_id")
        # Só duplicar assinaturas globais ou das intervenções transitadas
        if a_iid and a_iid not in map_intervs:
            continue
        novo = {**a, "id": str(uuid.uuid4()), "relatorio_id": nova_id}
        if a_iid and a_iid in map_intervs:
            novo["intervencao_id"] = map_intervs[a_iid]
        novo.pop("_id", None)
        await db.assinaturas_relatorio.insert_one(novo)

    logging.info(
        f"FS de continuidade criada: #{novo_numero} (origem #{origem_numero}) "
        f"com {novo_intervs_count} intervenções herdadas, por {current_user.get('username')}"
    )

    return {
        "message": "FS de continuidade criada com sucesso",
        "new_fs_id": nova_id,
        "new_fs_numero": novo_numero,
        "intervencoes_herdadas": novo_intervs_count,
    }


