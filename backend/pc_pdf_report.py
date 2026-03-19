from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from io import BytesIO
from pathlib import Path
from datetime import datetime

def generate_pc_pdf(pc, ot, materiais, fotografias):
    """
    Gera PDF do Pedido de Cotação
    
    Args:
        pc: Pedido de Cotação
        ot: Folha de Serviço associada
        materiais: Lista de materiais para cotação
        fotografias: Lista de fotografias anexadas ao PC
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.5*cm,
        leftMargin=1.5*cm,
        topMargin=1*cm,
        bottomMargin=1*cm
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Estilos customizados
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=6,
        alignment=TA_LEFT,
        fontName='Helvetica-Bold'
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=9,
        leading=12
    )
    
    # Logo e Cabeçalho
    logo_path = Path("/app/backend/assets/hwi_logo.png")
    if logo_path.exists():
        try:
            logo = RLImage(str(logo_path), width=3*cm, height=3*cm, kind='proportional')
            
            # Tabela de cabeçalho com logo e info
            header_data = [
                [logo, Paragraph(f"<b>PEDIDO DE COTAÇÃO</b><br/>{pc['numero_pc']}", 
                                ParagraphStyle('HeaderRight', fontSize=14, alignment=TA_CENTER, textColor=colors.HexColor('#1e40af'), fontName='Helvetica-Bold'))]
            ]
            
            header_table = Table(header_data, colWidths=[4*cm, 14*cm])
            header_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ALIGN', (1, 0), (1, 0), 'CENTER'),
            ]))
            
            elements.append(header_table)
            elements.append(Spacer(1, 0.3*cm))
        except Exception as e:
            print(f"Erro ao carregar logo: {e}")
    
    # Linha separadora
    line_table = Table([['']], colWidths=[18*cm])
    line_table.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, 0), 2, colors.HexColor('#1e40af')),
    ]))
    elements.append(line_table)
    elements.append(Spacer(1, 0.3*cm))
    
    # Informações da FS
    elements.append(Paragraph("INFORMAÇÕES DA FOLHA DE SERVIÇO", heading_style))
    
    ot_data = [
        ['Número FS:', f"#{ot.get('numero_assistencia', 'N/A')}", 'Data:', ot.get('data_servico', 'N/A')],
        ['Cliente:', ot.get('cliente_nome', 'N/A'), 'Status PC:', pc.get('status', 'Em Espera')]
    ]
    
    ot_table = Table(ot_data, colWidths=[3.5*cm, 6*cm, 3.5*cm, 5*cm])
    ot_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f3f4f6')),
        ('BACKGROUND', (2, 0), (2, -1), colors.HexColor('#f3f4f6')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(ot_table)
    elements.append(Spacer(1, 0.4*cm))
    
    # Dados da Máquina
    elements.append(Paragraph("DADOS DA MÁQUINA", heading_style))
    
    maquina_data = [
        ['Tipologia:', ot.get('equipamento_tipologia', '') or 'N/A', 'Marca:', ot.get('equipamento_marca', '') or 'N/A'],
        ['Modelo:', ot.get('equipamento_modelo', '') or 'N/A', 'Nº Série:', ot.get('equipamento_numero_serie', '') or 'N/A'],
        ['Ano:', ot.get('equipamento_ano_fabrico', '') or 'N/A', '', ''],
    ]
    
    maquina_table = Table(maquina_data, colWidths=[3.5*cm, 6*cm, 3.5*cm, 5*cm])
    maquina_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f3f4f6')),
        ('BACKGROUND', (2, 0), (2, -1), colors.HexColor('#f3f4f6')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(maquina_table)
    elements.append(Spacer(1, 0.4*cm))
    
    # Lista de Material para Cotação
    elements.append(Paragraph("MATERIAL PARA COTAÇÃO", heading_style))
    
    material_rows = [['#', 'Descrição', 'Qtd.']]
    
    for idx, mat in enumerate(materiais, 1):
        material_rows.append([
            str(idx),
            mat.get('descricao', ''),
            str(mat.get('quantidade', 0))
        ])
    
    material_table = Table(material_rows, colWidths=[1.5*cm, 14*cm, 2.5*cm])
    material_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6b7280')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('ALIGN', (1, 1), (1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
    ]))
    elements.append(material_table)
    elements.append(Spacer(1, 0.4*cm))
    
    # Fotografias (2 por linha)
    if fotografias:
        elements.append(Paragraph("FOTOGRAFIAS ANEXADAS", heading_style))
        
        desc_style = ParagraphStyle(
            'DescStyle',
            parent=normal_style,
            fontSize=7,
            spaceAfter=1,
            spaceBefore=1
        )
        
        for i in range(0, len(fotografias), 2):
            foto1 = fotografias[i]
            foto2 = fotografias[i + 1] if i + 1 < len(fotografias) else None
            
            row_content = []
            
            # Célula da foto 1
            cell1 = []
            if foto1.get('foto_base64'):
                try:
                    import base64
                    foto_bytes = base64.b64decode(foto1['foto_base64'])
                    foto_buffer = BytesIO(foto_bytes)
                    img = RLImage(foto_buffer, width=8*cm, height=6*cm, kind='proportional')
                    cell1.append(img)
                except Exception as e:
                    cell1.append(Paragraph(f"<i>(Erro ao carregar imagem)</i>", desc_style))
            else:
                cell1.append(Paragraph("<i>(Sem imagem)</i>", desc_style))
            cell1.append(Paragraph(f"<b>#{i+1}:</b> {foto1.get('descricao', '')[:100]}", desc_style))
            row_content.append(cell1)
            
            # Célula da foto 2
            if foto2:
                cell2 = []
                if foto2.get('foto_base64'):
                    try:
                        import base64
                        foto_bytes = base64.b64decode(foto2['foto_base64'])
                        foto_buffer = BytesIO(foto_bytes)
                        img = RLImage(foto_buffer, width=8*cm, height=6*cm, kind='proportional')
                        cell2.append(img)
                    except Exception as e:
                        cell2.append(Paragraph(f"<i>(Erro ao carregar imagem)</i>", desc_style))
                else:
                    cell2.append(Paragraph("<i>(Sem imagem)</i>", desc_style))
                cell2.append(Paragraph(f"<b>#{i+2}:</b> {foto2.get('descricao', '')[:100]}", desc_style))
                row_content.append(cell2)
            else:
                row_content.append('')
            
            foto_table = Table([row_content], colWidths=[9*cm, 9*cm])
            foto_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('LEFTPADDING', (0, 0), (-1, -1), 2),
                ('RIGHTPADDING', (0, 0), (-1, -1), 2),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ]))
            
            elements.append(foto_table)
            
            if i + 2 < len(fotografias):
                elements.append(Spacer(1, 0.15*cm))
        
        elements.append(Spacer(1, 0.3*cm))
    
    # Observações
    if pc.get('observacoes'):
        elements.append(Paragraph("OBSERVAÇÕES", heading_style))
        obs_text = pc['observacoes'].replace('\n', '<br/>')
        elements.append(Paragraph(obs_text, normal_style))
        elements.append(Spacer(1, 0.3*cm))
    
    # Footer
    footer_text = f"""
    <para alignment="center" fontSize="8" textColor="#6b7280">
    HWI Unipessoal, Lda. | Documento gerado em {datetime.now().strftime('%d/%m/%Y às %H:%M')}
    </para>
    """
    elements.append(Spacer(1, 0.5*cm))
    elements.append(Paragraph(footer_text, styles['Normal']))
    
    # Build PDF
    doc.build(elements)
    
    buffer.seek(0)
    return buffer
