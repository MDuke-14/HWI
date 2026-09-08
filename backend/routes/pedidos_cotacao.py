"""
Rotas de Pedidos de Cotação (PC) + Faturas.
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form, Body
from fastapi.responses import StreamingResponse, Response
from typing import Optional
from datetime import datetime, timezone
import uuid
import os
import io
import logging

from database import db
from auth_utils import get_current_user
from models import PedidoCotacao
from pc_pdf_report import generate_pc_pdf

router = APIRouter(tags=["Pedidos de Cotacao"])


def _get_send_email_pc():
    """Lazy import to avoid circular dependencies"""
    try:
        import server
        return server.send_email_pc
    except (ImportError, AttributeError):
        async def noop(*args, **kwargs): pass
        return noop


@router.get("/pedidos-cotacao")
async def get_all_pedidos_cotacao(
    current_user: dict = Depends(get_current_user)
):
    """Listar TODOS os PCs do sistema"""
    pcs = await db.pedidos_cotacao.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).to_list(length=None)
    
    # Enriquecer com informações da OT
    for pc in pcs:
        ot = await db.relatorios_tecnicos.find_one({"id": pc["relatorio_id"]}, {"_id": 0})
        if ot:
            pc["ot_numero"] = ot.get("numero_assistencia", "N/A")
            pc["cliente_nome"] = ot.get("cliente_nome", "N/A")

        # Equipamento — marca + modelo (Fase 2 UI)
        eq_ot_ids = pc.get("equipamento_ot_ids", [])
        equip_ot = None
        if eq_ot_ids:
            equip_ot = await db.equipamentos_ot.find_one({"id": eq_ot_ids[0]}, {"_id": 0})
        if not equip_ot:
            equip_ot = await db.equipamentos_ot.find_one({"relatorio_id": pc.get("relatorio_id")}, {"_id": 0})
        if equip_ot:
            pc["equipamento_marca"] = equip_ot.get("marca") or ""
            pc["equipamento_modelo"] = equip_ot.get("modelo") or ""
            pc["equipamento_tipologia"] = equip_ot.get("tipologia") or ""

        # Contar materiais associados
        materiais_count = await db.materiais_ot.count_documents({"pc_id": pc["id"]})
        pc["materiais_count"] = materiais_count

        primeiro = await db.materiais_ot.find_one({"pc_id": pc["id"]}, {"_id": 0, "descricao": 1, "posicao": 1, "codigo": 1})
        pc["primeiro_material"] = primeiro["descricao"] if primeiro else None
        pc["primeiro_material_posicao"] = primeiro.get("posicao") if primeiro else None
        pc["primeiro_material_codigo"] = primeiro.get("codigo") if primeiro else None
    
    return pcs

@router.get("/relatorios-tecnicos/{relatorio_id}/pedidos-cotacao")
async def get_pedidos_cotacao_ot(
    relatorio_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar PCs de uma FS - lista plana com descrição do primeiro material"""
    pcs = await db.pedidos_cotacao.find(
        {"relatorio_id": relatorio_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(length=None)
    
    # Enriquecer cada PC com contagem de materiais e descrição do primeiro
    for pc in pcs:
        materiais_count = await db.materiais_ot.count_documents({"pc_id": pc["id"]})
        pc["materiais_count"] = materiais_count
        
        primeiro = await db.materiais_ot.find_one({"pc_id": pc["id"]}, {"_id": 0, "descricao": 1, "posicao": 1, "codigo": 1})
        pc["primeiro_material"] = primeiro["descricao"] if primeiro else None
        pc["primeiro_material_posicao"] = primeiro.get("posicao") if primeiro else None
        pc["primeiro_material_codigo"] = primeiro.get("codigo") if primeiro else None
    
    return pcs

@router.get("/pedidos-cotacao/{pc_id}")
async def get_pedido_cotacao(
    pc_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obter detalhes de um PC"""
    pc = await db.pedidos_cotacao.find_one({"id": pc_id}, {"_id": 0})
    
    if not pc:
        raise HTTPException(status_code=404, detail="PC não encontrado")
    
    # Buscar OT associada para obter dados do cliente e máquina
    ot = await db.relatorios_tecnicos.find_one({"id": pc.get("relatorio_id")}, {"_id": 0})
    if ot:
        pc["numero_ot"] = ot.get("numero_assistencia", "N/A")
        pc["cliente_nome"] = ot.get("cliente_nome", "N/A")
        pc["data_fs"] = ot.get("data_intervencao") or ot.get("created_at")

        # Contactos do cliente (email, telefone) — enriquecer para o modal Fase 6
        if ot.get("cliente_id"):
            cli = await db.clientes.find_one(
                {"id": ot["cliente_id"]},
                {"_id": 0, "email": 1, "telefone": 1, "morada": 1, "nif": 1},
            )
            if cli:
                pc["cliente_email"] = cli.get("email")
                pc["cliente_telefone"] = cli.get("telefone")
                pc["cliente_morada"] = cli.get("morada")
                pc["cliente_nif"] = cli.get("nif")
        
        # Buscar equipamentos associados à PC via equipamento_ot_ids
        eq_ot_ids = pc.get("equipamento_ot_ids", [])
        equipamentos_pc = []
        
        if eq_ot_ids:
            for eq_id in eq_ot_ids:
                equip_ot = await db.equipamentos_ot.find_one({"id": eq_id}, {"_id": 0})
                if equip_ot:
                    equipamentos_pc.append(equip_ot)
        
        if not equipamentos_pc:
            # Fallback: buscar da OT directamente ou primeiro equipamento
            equip_marca = ot.get("equipamento_marca")
            equip_tipologia = ot.get("equipamento_tipologia")
            
            if not equip_marca and not equip_tipologia:
                equip_ot = await db.equipamentos_ot.find_one({"relatorio_id": pc.get("relatorio_id")}, {"_id": 0})
                if equip_ot:
                    equip_tipologia = equip_ot.get("tipologia", "")
                    equip_marca = equip_ot.get("marca", "")
                    ot["equipamento_modelo"] = equip_ot.get("modelo", "")
                    ot["equipamento_numero_serie"] = equip_ot.get("numero_serie", "")
                    ot["equipamento_ano_fabrico"] = equip_ot.get("ano_fabrico", "")
            
            pc["equipamento_tipologia"] = equip_tipologia
            pc["equipamento_marca"] = equip_marca
            pc["equipamento_modelo"] = ot.get("equipamento_modelo")
            pc["equipamento_numero_serie"] = ot.get("equipamento_numero_serie")
            pc["equipamento_ano_fabrico"] = ot.get("equipamento_ano_fabrico", "")
        else:
            # Usar dados dos equipamentos selecionados
            primeiro = equipamentos_pc[0]
            pc["equipamento_tipologia"] = primeiro.get("tipologia", "")
            pc["equipamento_marca"] = primeiro.get("marca", "")
            pc["equipamento_modelo"] = primeiro.get("modelo", "")
            pc["equipamento_numero_serie"] = primeiro.get("numero_serie", "")
            pc["equipamento_ano_fabrico"] = primeiro.get("ano_fabrico", "")
        
        pc["equipamentos_pc"] = equipamentos_pc
    
    # Buscar materiais associados
    materiais = await db.materiais_ot.find(
        {"pc_id": pc_id},
        {"_id": 0}
    ).to_list(length=None)
    
    pc["materiais"] = materiais
    
    # Buscar fotografias do PC (SEM foto_base64 para evitar payload gigante)
    fotos = await db.fotos_pc.find(
        {"pc_id": pc_id},
        {"_id": 0, "foto_base64": 0}
    ).sort("uploaded_at", -1).to_list(length=None)
    
    for foto in fotos:
        foto["foto_url"] = f"/pedidos-cotacao/{pc_id}/fotografias/{foto['id']}/image"
    
    pc["fotografias"] = fotos
    
    # Nome do responsável (utilizador que criou a PC) — Fase 6 modal
    if pc.get("created_by") and not pc.get("criado_por_nome"):
        user_doc = await db.users.find_one(
            {"id": pc["created_by"]},
            {"_id": 0, "full_name": 1, "username": 1},
        )
        if user_doc:
            pc["criado_por_nome"] = user_doc.get("full_name") or user_doc.get("username")
    
    return pc

@router.put("/pedidos-cotacao/{pc_id}")
async def update_pedido_cotacao(
    pc_id: str,
    pc_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar PC (qualquer utilizador pode editar)"""
    pc = await db.pedidos_cotacao.find_one({"id": pc_id})
    
    if not pc:
        raise HTTPException(status_code=404, detail="PC não encontrado")
    
    update_data = {k: v for k, v in pc_data.items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    # Se o status mudou, registar no histórico (mas não permitir "Cancelado"
    # por aqui — usar o endpoint dedicado /cancelar que exige motivo).
    status_antigo = pc.get("status")
    status_novo = update_data.get("status")
    if status_novo and status_novo == "Cancelado":
        raise HTTPException(
            status_code=400,
            detail="Para cancelar uma PC use o endpoint dedicado /cancelar (motivo obrigatório)",
        )

    await db.pedidos_cotacao.update_one(
        {"id": pc_id},
        {"$set": update_data}
    )

    if status_novo and status_novo != status_antigo:
        try:
            from services.pc_history import record_pc_event
            await record_pc_event(
                db, pc_id, "status_changed",
                f"Estado alterado de '{status_antigo or '—'}' para '{status_novo}'",
                current_user=current_user,
                metadata={"from": status_antigo, "to": status_novo},
            )
        except Exception as e:
            logging.warning(f"Falha a registar mudança de status da PC {pc_id}: {e}")

    return {"message": "PC atualizado"}

@router.delete("/pedidos-cotacao/{pc_id}")
async def delete_pedido_cotacao(
    pc_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Eliminar um PC e todos os dados associados"""
    # Verificar se PC existe
    pc = await db.pedidos_cotacao.find_one({"id": pc_id})
    if not pc:
        raise HTTPException(status_code=404, detail="PC não encontrado")
    
    # Eliminar fotografias do PC
    await db.fotos_pc.delete_many({"pc_id": pc_id})
    
    # Eliminar faturas do PC
    await db.faturas_pc.delete_many({"pc_id": pc_id})
    
    # Eliminar materiais associados ao PC
    await db.materiais_ot.delete_many({"pc_id": pc_id})
    
    # Eliminar o PC
    await db.pedidos_cotacao.delete_one({"id": pc_id})
    
    return {"message": "PC eliminado com sucesso"}

@router.post("/pedidos-cotacao/{pc_id}/fotografias")
async def add_fotografia_pc(
    pc_id: str,
    file: UploadFile = File(...),
    descricao: str = Form(""),
    current_user: dict = Depends(get_current_user)
):
    """Adicionar fotografia a um PC"""
    try:
        contents = await file.read()
        
        import base64
        foto_base64 = base64.b64encode(contents).decode('utf-8')
        
        foto_id = str(uuid.uuid4())
        foto_doc = {
            "id": foto_id,
            "pc_id": pc_id,
            "foto_base64": foto_base64,
            "descricao": descricao,
            "filename": file.filename,
            "content_type": file.content_type,
            "uploaded_at": datetime.now(timezone.utc),
            "uploaded_by": current_user["sub"]
        }
        
        await db.fotos_pc.insert_one(foto_doc)
        
        return {
            "id": foto_id,
            "pc_id": pc_id,
            "descricao": descricao,
            "foto_url": f"/pedidos-cotacao/{pc_id}/fotografias/{foto_id}/image",
            "uploaded_at": foto_doc["uploaded_at"]
        }
    except Exception as e:
        logging.error(f"Erro ao fazer upload de fotografia: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao fazer upload: {str(e)}")


@router.patch("/pedidos-cotacao/{pc_id}/fotografias/{foto_id}/onedrive-link")
async def link_pc_fotografia_onedrive(
    pc_id: str,
    foto_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    """Guarda metadata do OneDrive na fotografia do PC (mirror best-effort).
    Payload aceite: { onedrive_item_id, onedrive_web_url, onedrive_path, sync_status }
    """
    allowed = {"onedrive_item_id", "onedrive_web_url", "onedrive_path", "sync_status"}
    update = {k: v for k, v in (payload or {}).items() if k in allowed}
    if not update:
        raise HTTPException(status_code=400, detail="Nada a atualizar")

    result = await db.fotos_pc.update_one(
        {"id": foto_id, "pc_id": pc_id},
        {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Fotografia não encontrada")
    return {"message": "OneDrive link actualizado", "updated": update}

@router.get("/pedidos-cotacao/{pc_id}/fotografias")
async def get_fotografias_pc(
    pc_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar fotografias de um PC (apenas metadados - sem base64 para evitar OOM)"""
    fotografias = await db.fotos_pc.find(
        {"pc_id": pc_id},
        {"_id": 0, "foto_base64": 0}
    ).sort("uploaded_at", -1).to_list(length=None)
    
    for foto in fotografias:
        foto["foto_url"] = f"/pedidos-cotacao/{pc_id}/fotografias/{foto['id']}/image"
    
    return fotografias

@router.get("/pedidos-cotacao/{pc_id}/fotografias/{foto_id}/image")
async def get_fotografia_pc_image(
    pc_id: str,
    foto_id: str,
    thumb: bool = False,
):
    """Obter imagem da fotografia de um PC. Projection mínima + thread pool."""
    if thumb:
        projection = {"_id": 0, "content_type": 1, "thumb_base64": 1}
    else:
        projection = {"_id": 0, "content_type": 1, "foto_base64": 1}
    
    foto = await db.fotos_pc.find_one(
        {"id": foto_id, "pc_id": pc_id},
        projection,
    )
    
    if not foto:
        raise HTTPException(status_code=404, detail="Fotografia não encontrada")
    
    image_data = foto.get("thumb_base64") if thumb else foto.get("foto_base64")
    
    # Fallback se thumb pedido mas não existir
    if not image_data and thumb:
        foto_full = await db.fotos_pc.find_one(
            {"id": foto_id, "pc_id": pc_id},
            {"_id": 0, "foto_base64": 1, "content_type": 1},
        )
        if foto_full:
            image_data = foto_full.get("foto_base64")
            foto["content_type"] = foto.get("content_type") or foto_full.get("content_type")
    
    if not image_data:
        raise HTTPException(status_code=404, detail="Imagem não disponível")
    
    import base64
    from fastapi.concurrency import run_in_threadpool
    foto_bytes = await run_in_threadpool(base64.b64decode, image_data)
    
    
    return Response(
        content=foto_bytes,
        media_type=foto.get("content_type", "image/jpeg"),
        headers={
            "Cache-Control": "public, max-age=86400",
            "ETag": f'"{foto_id}-{"t" if thumb else "f"}"',
        },
    )

@router.delete("/pedidos-cotacao/{pc_id}/fotografias/{foto_id}")
async def delete_fotografia_pc(
    pc_id: str,
    foto_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remover fotografia de um PC"""
    foto = await db.fotos_pc.find_one({"id": foto_id, "pc_id": pc_id})
    
    if not foto:
        raise HTTPException(status_code=404, detail="Fotografia não encontrada")
    
    await db.fotos_pc.delete_one({"id": foto_id})
    
    return {"message": "Fotografia removida"}

@router.post("/pedidos-cotacao/{pc_id}/faturas")
async def upload_fatura_pc(
    pc_id: str,
    file: UploadFile = File(...),
    descricao: str = Form(""),
    current_user: dict = Depends(get_current_user)
):
    """Upload de fatura para um PC"""
    # Verificar se PC existe
    pc = await db.pedidos_cotacao.find_one({"id": pc_id})
    if not pc:
        raise HTTPException(status_code=404, detail="PC não encontrado")
    
    # Ler conteúdo do arquivo
    content = await file.read()
    
    # Converter para base64
    import base64
    file_base64 = base64.b64encode(content).decode('utf-8')
    
    # Determinar tipo de arquivo
    content_type = file.content_type or 'application/octet-stream'
    
    fatura_id = str(uuid.uuid4())
    fatura = {
        "id": fatura_id,
        "pc_id": pc_id,
        "nome_ficheiro": file.filename,
        "descricao": descricao,
        "content_type": content_type,
        "file_base64": file_base64,
        "file_size": len(content),
        "uploaded_by": current_user.get("username", ""),
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.faturas_pc.insert_one(fatura)
    
    return {
        "message": "Fatura carregada com sucesso",
        "id": fatura_id,
        "nome_ficheiro": file.filename,
        "fatura_url": f"/pedidos-cotacao/{pc_id}/faturas/{fatura_id}/file"
    }

@router.get("/pedidos-cotacao/{pc_id}/faturas")
async def get_faturas_pc(
    pc_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar faturas de um PC"""
    faturas = await db.faturas_pc.find(
        {"pc_id": pc_id},
        {"_id": 0, "file_base64": 0}  # Não incluir o conteúdo na listagem
    ).to_list(100)
    
    for fatura in faturas:
        fatura["fatura_url"] = f"/pedidos-cotacao/{pc_id}/faturas/{fatura['id']}/file"
    
    return faturas

@router.get("/pedidos-cotacao/{pc_id}/faturas/{fatura_id}/file")
async def get_fatura_file(
    pc_id: str,
    fatura_id: str
):
    """Obter arquivo da fatura"""
    fatura = await db.faturas_pc.find_one({"id": fatura_id, "pc_id": pc_id})
    
    if not fatura:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")
    
    import base64
    
    
    file_bytes = base64.b64decode(fatura["file_base64"])
    
    return Response(
        content=file_bytes,
        media_type=fatura.get("content_type", "application/octet-stream"),
        headers={
            "Content-Disposition": f"inline; filename=\"{fatura.get('nome_ficheiro', 'fatura')}\""
        }
    )

@router.delete("/pedidos-cotacao/{pc_id}/faturas/{fatura_id}")
async def delete_fatura_pc(
    pc_id: str,
    fatura_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remover fatura de um PC"""
    fatura = await db.faturas_pc.find_one({"id": fatura_id, "pc_id": pc_id})
    
    if not fatura:
        raise HTTPException(status_code=404, detail="Fatura não encontrada")
    
    await db.faturas_pc.delete_one({"id": fatura_id})
    
    return {"message": "Fatura removida"}

@router.get("/pedidos-cotacao/{pc_id}/preview-pdf")
async def preview_pdf_pc(
    pc_id: str,
    hide_client: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Gerar preview do PDF do PC"""
    # Buscar PC
    pc = await db.pedidos_cotacao.find_one({"id": pc_id}, {"_id": 0})
    if not pc:
        raise HTTPException(status_code=404, detail="PC não encontrado")
    
    # Buscar OT associada
    ot = await db.relatorios_tecnicos.find_one({"id": pc["relatorio_id"]}, {"_id": 0})
    if not ot:
        raise HTTPException(status_code=404, detail="FS não encontrada")

    # Determinar quais equipamentos incluir no PDF do PC:
    # 1) Se o PC tem equipamento_ot_ids explícitos → carrega esses.
    # 2) Caso contrário, todos os equipamentos_ot da FS.
    # 3) Fallback final: os campos "raiz" (retrocompatibilidade).
    pc_equip_ids = pc.get("equipamento_ot_ids") or []
    equipamentos = []
    if pc_equip_ids:
        equipamentos = await db.equipamentos_ot.find(
            {"id": {"$in": pc_equip_ids}}, {"_id": 0}
        ).sort("ordem", 1).to_list(length=None)
    if not equipamentos:
        equipamentos = await db.equipamentos_ot.find(
            {"relatorio_id": pc["relatorio_id"]}, {"_id": 0}
        ).sort("ordem", 1).to_list(length=None)

    # Enriquecer OT com o primeiro equipamento (retrocompatibilidade para o layout antigo)
    if equipamentos and not ot.get("equipamento_tipologia") and not ot.get("equipamento_marca"):
        first = equipamentos[0]
        ot["equipamento_tipologia"] = first.get("tipologia", "")
        ot["equipamento_marca"] = first.get("marca", "")
        ot["equipamento_modelo"] = first.get("modelo", "")
        ot["equipamento_numero_serie"] = first.get("numero_serie", "")
        ot["equipamento_ano_fabrico"] = first.get("ano_fabrico", "")

    # Buscar materiais do PC
    materiais = await db.materiais_ot.find(
        {"pc_id": pc_id},
        {"_id": 0}
    ).to_list(length=None)
    
    # Buscar fotografias do PC
    fotografias = await db.fotos_pc.find(
        {"pc_id": pc_id},
        {"_id": 0}
    ).to_list(length=None)
    
    # Gerar PDF
    pdf_buffer = generate_pc_pdf(pc, ot, materiais, fotografias, hide_client=hide_client, equipamentos=equipamentos)

    # Response com Content-Length fixo — evita truncamento em Cloudflare
    pdf_bytes = pdf_buffer.getvalue() if hasattr(pdf_buffer, 'getvalue') else pdf_buffer
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=PC_{pc['numero_pc']}.pdf",
            "Content-Length": str(len(pdf_bytes)),
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache, no-store, must-revalidate",
        }
    )

@router.post("/pedidos-cotacao/{pc_id}/send-email")
async def send_email_pc(
    pc_id: str,
    email_destinatario: str,
    hide_client: bool = False,
    idioma: str = "pt",
    current_user: dict = Depends(get_current_user)
):
    """Enviar PDF do PC por email"""
    # Validar email
    emails_validos = ["geral@hwi.pt", "pedro.duarte@hwi.pt", "miguel.moreira@hwi.pt"]
    if email_destinatario not in emails_validos:
        raise HTTPException(status_code=400, detail="Email não autorizado")
    
    # Buscar PC
    pc = await db.pedidos_cotacao.find_one({"id": pc_id}, {"_id": 0})
    if not pc:
        raise HTTPException(status_code=404, detail="PC não encontrado")
    
    # Buscar OT associada
    ot = await db.relatorios_tecnicos.find_one({"id": pc["relatorio_id"]}, {"_id": 0})
    if not ot:
        raise HTTPException(status_code=404, detail="FS não encontrada")

    # Equipamentos: mesma regra do endpoint /pdf (equipamento_ot_ids > todos da FS > root fields)
    pc_equip_ids = pc.get("equipamento_ot_ids") or []
    equipamentos = []
    if pc_equip_ids:
        equipamentos = await db.equipamentos_ot.find(
            {"id": {"$in": pc_equip_ids}}, {"_id": 0}
        ).sort("ordem", 1).to_list(length=None)
    if not equipamentos:
        equipamentos = await db.equipamentos_ot.find(
            {"relatorio_id": pc["relatorio_id"]}, {"_id": 0}
        ).sort("ordem", 1).to_list(length=None)
    if equipamentos and not ot.get("equipamento_tipologia") and not ot.get("equipamento_marca"):
        first = equipamentos[0]
        ot["equipamento_tipologia"] = first.get("tipologia", "")
        ot["equipamento_marca"] = first.get("marca", "")
        ot["equipamento_modelo"] = first.get("modelo", "")
        ot["equipamento_numero_serie"] = first.get("numero_serie", "")
        ot["equipamento_ano_fabrico"] = first.get("ano_fabrico", "")

    # Buscar materiais e fotografias
    materiais = await db.materiais_ot.find(
        {"pc_id": pc_id},
        {"_id": 0}
    ).to_list(length=None)
    
    fotografias = await db.fotos_pc.find(
        {"pc_id": pc_id},
        {"_id": 0}
    ).to_list(length=None)
    
    # Gerar PDF
    pdf_buffer = generate_pc_pdf(pc, ot, materiais, fotografias, hide_client=hide_client, equipamentos=equipamentos)
    
    # Enviar email
    try:
        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText
        from email.mime.application import MIMEApplication
        
        # Configurações SMTP do ambiente
        smtp_server = os.environ.get('SMTP_HOST')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_user = os.environ.get('SMTP_USER')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        smtp_from = os.environ.get('SMTP_FROM', 'geral@hwi.pt')
        
        msg = MIMEMultipart()
        msg['From'] = smtp_from
        msg['To'] = email_destinatario

        # URL do frontend para link direto
        frontend_url = os.environ.get('FRONTEND_URL', '').rstrip('/')
        link_pc = f"{frontend_url}/technical-reports?pc={pc_id}" if frontend_url else ""
        pc_status_link = f"{frontend_url}/pc/{pc_id}/status" if frontend_url else ""

        # Fase 8: PT usa template editável da DB. Outros idiomas mantêm
        # email_templates.py (multi-idioma). Assim o admin pode alterar o corpo PT.
        subject = None
        body = None
        if idioma == 'pt':
            from routes.email_templates import get_template, render as render_template
            tpl = await get_template("pc_pdf_email")
            if tpl:
                cliente_html = "" if hide_client else f"<p>Cliente: <b>{ot.get('cliente_nome', 'N/A')}</b></p>"
                variables = {
                    "numero_pc": pc['numero_pc'],
                    "numero_fs": ot.get('numero_assistencia', 'N/A'),
                    "cliente_nome": "" if hide_client else ot.get('cliente_nome', 'N/A'),
                    "cliente_html": cliente_html,
                    "status": pc.get('status', 'Em Espera'),
                    "link_pc": link_pc,
                }
                subject, body = render_template(tpl, variables)

        if not subject:
            # Fallback (idiomas EN/FR/etc ou template em falta)
            subject = f"Pedido de Cotação {pc['numero_pc']} - FS #{ot.get('numero_assistencia', 'N/A')}"
            from email_templates import get_pc_email_body
            body = get_pc_email_body(
                idioma=idioma,
                numero_pc=pc['numero_pc'],
                numero_fs=ot.get('numero_assistencia', 'N/A'),
                cliente_nome=ot.get('cliente_nome', 'N/A'),
                status=pc.get('status', 'Em Espera'),
                hide_client=hide_client,
                pc_status_link=pc_status_link
            )

        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html'))
        
        # Anexar PDF
        pdf_attachment = MIMEApplication(pdf_buffer.read(), _subtype="pdf")
        pdf_attachment.add_header('Content-Disposition', 'attachment', filename=f"PC_{pc['numero_pc']}.pdf")
        msg.attach(pdf_attachment)
        
        # Enviar
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
        
        logging.info(f"Email enviado para {email_destinatario}: PC {pc['numero_pc']}")
        
        return {"message": f"Email enviado com sucesso para {email_destinatario}"}
        
    except Exception as e:
        logging.error(f"Erro ao enviar email: {str(e)}")
        from server import log_app_error
        import asyncio
        await log_app_error(
            context=f"PC {pc.get('numero_pc', '?')}" if 'pc' in dir() else "PC",
            action="Enviar Email PC",
            error_message=str(e),
            user_id=current_user.get("sub"),
            username=current_user.get("username")
        )
        raise HTTPException(status_code=500, detail=f"Erro ao enviar email: {str(e)}")

