"""
Rotas de gestão de Clientes.
CRUD + Exportação PDF de clientes.
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import datetime
import io
import logging

from database import db
from auth_utils import get_current_user
from models import Cliente

router = APIRouter(prefix="/clientes", tags=["Clientes"])


@router.post("", response_model=Cliente)
async def create_cliente(cliente: Cliente, current_user: dict = Depends(get_current_user)):
    """Criar novo cliente"""
    cliente_dict = cliente.dict()
    cliente_dict["created_at"] = cliente_dict["created_at"].isoformat()
    
    await db.clientes.insert_one(cliente_dict)
    
    logging.info(f"Cliente criado: {cliente.nome} por {current_user['sub']}")
    return cliente


@router.get("")
async def get_clientes(current_user: dict = Depends(get_current_user)):
    """Listar todos os clientes ativos"""
    clientes = await db.clientes.find(
        {"ativo": True},
        {"_id": 0}
    ).sort("nome", 1).to_list(1000)
    
    return clientes


@router.get("/export/pdf")
async def export_clientes_pdf(current_user: dict = Depends(get_current_user)):
    """Exportar lista de clientes para PDF - Apenas admin"""
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Apenas administradores podem exportar lista de clientes")
    
    clientes = await db.clientes.find(
        {"ativo": True},
        {"_id": 0}
    ).sort("nome", 1).to_list(length=None)
    
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        spaceAfter=30,
        alignment=1
    )
    
    elements = []
    elements.append(Paragraph("Lista de Clientes", title_style))
    elements.append(Spacer(1, 20))
    
    date_style = ParagraphStyle(
        'DateStyle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.gray,
        alignment=1
    )
    elements.append(Paragraph(f"Exportado em: {datetime.now().strftime('%d/%m/%Y às %H:%M')}", date_style))
    elements.append(Spacer(1, 30))
    
    if clientes:
        cell_style = ParagraphStyle(
            'CellStyle',
            parent=styles['Normal'],
            fontSize=9,
            leading=11,
            wordWrap='CJK'
        )
        header_cell_style = ParagraphStyle(
            'HeaderCellStyle',
            parent=styles['Normal'],
            fontSize=10,
            leading=12,
            textColor=colors.white,
            fontName='Helvetica-Bold'
        )
        
        data = [[
            Paragraph("#", header_cell_style),
            Paragraph("Nome", header_cell_style),
            Paragraph("Email", header_cell_style),
            Paragraph("NIF", header_cell_style)
        ]]
        for i, cliente in enumerate(clientes, 1):
            data.append([
                Paragraph(str(i), cell_style),
                Paragraph(cliente.get("nome", "") or "", cell_style),
                Paragraph(cliente.get("email", "") or "", cell_style),
                Paragraph(cliente.get("nif", "") or "", cell_style)
            ])
        
        table = Table(data, colWidths=[1.2*cm, 6*cm, 7*cm, 3*cm])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
            ('TOPPADDING', (0, 1), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.gray),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
        ]))
        elements.append(table)
        
        elements.append(Spacer(1, 20))
        total_style = ParagraphStyle(
            'TotalStyle',
            parent=styles['Normal'],
            fontSize=10,
            textColor=colors.gray
        )
        elements.append(Paragraph(f"Total: {len(clientes)} cliente(s)", total_style))
    else:
        elements.append(Paragraph("Nenhum cliente encontrado.", styles['Normal']))
    
    doc.build(elements)
    buffer.seek(0)
    
    logging.info(f"Lista de clientes exportada para PDF por {current_user['sub']}")
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=lista_clientes.pdf"}
    )


@router.get("/export/emails-pdf")
async def export_clientes_emails_pdf(current_user: dict = Depends(get_current_user)):
    """Exportar lista de emails dos clientes para PDF"""
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Apenas administradores podem exportar")
    
    clientes = await db.clientes.find(
        {"ativo": True, "email": {"$ne": None, "$ne": ""}},
        {"_id": 0, "nome": 1, "email": 1, "emails_adicionais": 1}
    ).sort("nome", 1).to_list(length=None)
    
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontSize=16, spaceAfter=20, alignment=1)
    
    elements = []
    elements.append(Paragraph("Lista de Emails de Clientes", title_style))
    elements.append(Spacer(1, 15))
    
    all_emails = []
    for c in clientes:
        if c.get("email"):
            all_emails.append(c["email"])
        if c.get("emails_adicionais"):
            for e in c["emails_adicionais"].split(","):
                e = e.strip()
                if e:
                    all_emails.append(e)
    
    all_emails = list(dict.fromkeys(all_emails))
    
    email_str = "; ".join(all_emails)
    email_style = ParagraphStyle('EmailStyle', parent=styles['Normal'], fontSize=9, leading=14, textColor=colors.HexColor('#333333'))
    elements.append(Paragraph(email_str, email_style))
    elements.append(Spacer(1, 20))
    
    total_style = ParagraphStyle('TotalStyle', parent=styles['Normal'], fontSize=10, textColor=colors.gray)
    elements.append(Paragraph(f"Total: {len(all_emails)} email(s) de {len(clientes)} cliente(s)", total_style))
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"emails_clientes_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
    
    logging.info(f"Lista de emails exportada para PDF por {current_user['sub']}")
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/{cliente_id}", response_model=Cliente)
async def get_cliente(cliente_id: str, current_user: dict = Depends(get_current_user)):
    """Obter cliente específico"""
    cliente = await db.clientes.find_one({"id": cliente_id, "ativo": True}, {"_id": 0})
    
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    return cliente


@router.put("/{cliente_id}", response_model=Cliente)
async def update_cliente(
    cliente_id: str,
    cliente_data: Cliente,
    current_user: dict = Depends(get_current_user)
):
    """Atualizar cliente"""
    existing_cliente = await db.clientes.find_one({"id": cliente_id})
    
    if not existing_cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    update_data = cliente_data.dict(exclude={"id", "created_at"})
    
    await db.clientes.update_one(
        {"id": cliente_id},
        {"$set": update_data}
    )
    
    updated_cliente = await db.clientes.find_one({"id": cliente_id}, {"_id": 0})
    
    logging.info(f"Cliente atualizado: {cliente_id} por {current_user['sub']}")
    
    return updated_cliente


@router.delete("/{cliente_id}")
async def delete_cliente(cliente_id: str, current_user: dict = Depends(get_current_user)):
    """Deletar cliente (soft delete) - Apenas admin"""
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Apenas administradores podem eliminar clientes")
    
    result = await db.clientes.update_one(
        {"id": cliente_id},
        {"$set": {"ativo": False}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    logging.info(f"Cliente deletado: {cliente_id} por {current_user['sub']}")
    
    return {"message": "Cliente deletado com sucesso"}
