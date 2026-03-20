"""
Rotas de Pedidos de Cotação (PC) + Faturas.
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form, Body
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import datetime, timezone
import uuid
import os
import io
import logging

from database import db
from auth_utils import get_current_user
from models import PedidoCotacao

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
    
    # Enriquecer com informações da OT e sub-PCs
    for pc in pcs:
        ot = await db.relatorios_tecnicos.find_one({"id": pc["relatorio_id"]}, {"_id": 0})
        if ot:
            pc["ot_numero"] = ot.get("numero_assistencia", "N/A")
            pc["cliente_nome"] = ot.get("cliente_nome", "N/A")
        
        # Contar materiais associados
        materiais_count = await db.materiais_ot.count_documents({"pc_id": pc["id"]})
        pc["materiais_count"] = materiais_count
        
        # Listar sub-PCs se for um PC principal
        if not pc.get("parent_pc_id"):
            sub_pcs = await db.pedidos_cotacao.find(
                {"parent_pc_id": pc["id"]}, {"_id": 0}
            ).sort("sub_numero", 1).to_list(100)
            for sub in sub_pcs:
                sub["materiais_count"] = await db.materiais_ot.count_documents({"pc_id": sub["id"]})
            pc["sub_pcs"] = sub_pcs
    
    # Filtrar apenas PCs principais (sem parent) para a lista
    pcs = [pc for pc in pcs if not pc.get("parent_pc_id")]
    
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
        
        primeiro = await db.materiais_ot.find_one({"pc_id": pc["id"]}, {"_id": 0, "descricao": 1})
        pc["primeiro_material"] = primeiro["descricao"] if primeiro else None
    
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
        
        # Verificar se dados do equipamento existem na OT directamente
        equip_marca = ot.get("equipamento_marca")
        equip_tipologia = ot.get("equipamento_tipologia")
        
        # Se não, buscar da coleção equipamentos_ot
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
    
    # Buscar materiais associados
    materiais = await db.materiais_ot.find(
        {"pc_id": pc_id},
        {"_id": 0}
    ).to_list(length=None)
    
    pc["materiais"] = materiais
    
    # Buscar fotografias do PC
    fotos = await db.fotos_pc.find(
        {"pc_id": pc_id},
        {"_id": 0}
    ).sort("uploaded_at", -1).to_list(length=None)
    
    for foto in fotos:
        if "foto_url" not in foto:
            foto["foto_url"] = f"/pedidos-cotacao/{pc_id}/fotografias/{foto['id']}/image"
    
    pc["fotografias"] = fotos
    
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
    
    await db.pedidos_cotacao.update_one(
        {"id": pc_id},
        {"$set": update_data}
    )
    
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
    
    # Atualizar materiais para remover referência ao PC
    await db.materiais_ot.update_many(
        {"pc_id": pc_id},
        {"$unset": {"pc_id": ""}}
    )
    
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

@router.get("/pedidos-cotacao/{pc_id}/fotografias")
async def get_fotografias_pc(
    pc_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Listar fotografias de um PC"""
    fotografias = await db.fotos_pc.find(
        {"pc_id": pc_id},
        {"_id": 0}
    ).sort("uploaded_at", -1).to_list(length=None)
    
    for foto in fotografias:
        if "foto_url" not in foto:
            foto["foto_url"] = f"/pedidos-cotacao/{pc_id}/fotografias/{foto['id']}/image"
    
    return fotografias

@router.get("/pedidos-cotacao/{pc_id}/fotografias/{foto_id}/image")
async def get_fotografia_pc_image(
    pc_id: str,
    foto_id: str
):
    """Obter imagem da fotografia de um PC"""
    foto = await db.fotos_pc.find_one({
        "id": foto_id,
        "pc_id": pc_id
    }, {"_id": 0})
    
    if not foto:
        raise HTTPException(status_code=404, detail="Fotografia não encontrada")
    
    if not foto.get("foto_base64"):
        raise HTTPException(status_code=404, detail="Imagem não disponível")
    
    import base64
    foto_bytes = base64.b64decode(foto["foto_base64"])
    
    from fastapi.responses import Response
    return Response(
        content=foto_bytes,
        media_type=foto.get("content_type", "image/jpeg")
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
    from fastapi.responses import Response
    
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
    
    # Enriquecer OT com dados do equipamento se não estiverem nos campos directos
    if not ot.get("equipamento_marca") and not ot.get("equipamento_tipologia"):
        # Buscar equipamento associado na coleção equipamentos_ot (dados inline)
        equip_ot = await db.equipamentos_ot.find_one({"relatorio_id": pc["relatorio_id"]}, {"_id": 0})
        if equip_ot:
            ot["equipamento_tipologia"] = equip_ot.get("tipologia", "")
            ot["equipamento_marca"] = equip_ot.get("marca", "")
            ot["equipamento_modelo"] = equip_ot.get("modelo", "")
            ot["equipamento_numero_serie"] = equip_ot.get("numero_serie", "")
            ot["equipamento_ano_fabrico"] = equip_ot.get("ano_fabrico", "")
    
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
    pdf_buffer = generate_pc_pdf(pc, ot, materiais, fotografias, hide_client=hide_client)
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=PC_{pc['numero_pc']}.pdf"}
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
    
    # Enriquecer OT com dados do equipamento se não estiverem nos campos directos
    if not ot.get("equipamento_marca") and not ot.get("equipamento_tipologia"):
        equip_ot = await db.equipamentos_ot.find_one({"relatorio_id": pc["relatorio_id"]}, {"_id": 0})
        if equip_ot:
            ot["equipamento_tipologia"] = equip_ot.get("tipologia", "")
            ot["equipamento_marca"] = equip_ot.get("marca", "")
            ot["equipamento_modelo"] = equip_ot.get("modelo", "")
            ot["equipamento_numero_serie"] = equip_ot.get("numero_serie", "")
            ot["equipamento_ano_fabrico"] = equip_ot.get("ano_fabrico", "")
    
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
    pdf_buffer = generate_pc_pdf(pc, ot, materiais, fotografias, hide_client=hide_client)
    
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
        msg['Subject'] = f"Pedido de Cotação {pc['numero_pc']} - FS #{ot.get('numero_assistencia', 'N/A')}"
        
        # URL do frontend para link direto
        frontend_url = os.environ.get('FRONTEND_URL', '')
        pc_status_link = f"{frontend_url}/pc/{pc_id}/status"
        
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
        raise HTTPException(status_code=500, detail=f"Erro ao enviar email: {str(e)}")

