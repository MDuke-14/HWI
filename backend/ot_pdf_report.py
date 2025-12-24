from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from io import BytesIO
from datetime import datetime
from pathlib import Path

def generate_ot_pdf(relatorio, cliente, intervencoes, tecnicos, fotografias, assinatura, equipamentos_adicionais=None, materiais=None, registos_mao_obra=None):
    """
    Gera PDF completo de uma Ordem de Trabalho com espaçamento mínimo
    """
    buffer = BytesIO()
    # Margens reduzidas
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.8*cm, bottomMargin=0.8*cm, leftMargin=1*cm, rightMargin=1*cm)
    elements = []
    styles = getSampleStyleSheet()
    
    # Estilos customizados com espaçamento mínimo
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=4,
        spaceBefore=0,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.HexColor('#3b82f6'),
        spaceAfter=4,
        spaceBefore=6,
        fontName='Helvetica-Bold'
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=9,
        spaceAfter=2,
        spaceBefore=0
    )
    
    # Logo da empresa
    logo_path = Path(__file__).parent / "assets" / "hwi_logo.png"
    if logo_path.exists():
        logo = RLImage(str(logo_path), width=6*cm, height=2*cm)
        elements.append(logo)
        elements.append(Spacer(1, 0.2*cm))
    
    # Cabeçalho
    elements.append(Paragraph("ORDEM DE TRABALHO", title_style))
    elements.append(Paragraph(f"OT #{relatorio.get('numero_assistencia', 'N/A')}", title_style))
    elements.append(Spacer(1, 0.2*cm))
    
    # Status
    status_labels = {
        'orcamento': 'Orçamento',
        'em_execucao': 'Em Execução',
        'concluido': 'Concluído',
        'facturado': 'Facturado'
    }
    status_text = status_labels.get(relatorio.get('status', ''), relatorio.get('status', ''))
    elements.append(Paragraph(f"<b>Status:</b> {status_text}", normal_style))
    
    data_servico = relatorio.get('data_servico')
    if isinstance(data_servico, str):
        data_servico = datetime.fromisoformat(data_servico).strftime('%d/%m/%Y')
    elements.append(Paragraph(f"<b>Data de Serviço:</b> {data_servico}", normal_style))
    elements.append(Spacer(1, 0.2*cm))
    
    # Cliente
    elements.append(Paragraph("DADOS DO CLIENTE", heading_style))
    client_data = [
        ['Nome:', cliente.get('nome', 'N/A')],
        ['Email:', cliente.get('email', 'N/A')],
        ['Telefone:', cliente.get('telefone', 'N/A')],
        ['Morada:', cliente.get('morada', 'N/A')],
        ['NIF:', cliente.get('nif', 'N/A')],
        ['Local de Intervenção:', relatorio.get('local_intervencao', 'N/A')],
        ['Pedido por:', relatorio.get('pedido_por', 'N/A')],
    ]
    
    client_table = Table(client_data, colWidths=[4.5*cm, 13.5*cm])
    client_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e5e7eb')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    elements.append(client_table)
    elements.append(Spacer(1, 0.2*cm))
    
    # Equipamento
    elements.append(Paragraph("EQUIPAMENTO", heading_style))
    equip_data = [
        ['Tipologia:', relatorio.get('equipamento_tipologia', 'N/A')],
        ['Marca:', relatorio.get('equipamento_marca', 'N/A')],
        ['Modelo:', relatorio.get('equipamento_modelo', 'N/A')],
        ['Número de Série:', relatorio.get('equipamento_numero_serie', 'N/A')],
    ]
    
    if relatorio.get('equipamento_ano_fabrico'):
        equip_data.append(['Ano de Fabrico:', relatorio.get('equipamento_ano_fabrico')])
    
    equip_table = Table(equip_data, colWidths=[4.5*cm, 13.5*cm])
    equip_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e5e7eb')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    elements.append(equip_table)
    elements.append(Spacer(1, 0.2*cm))
    
    # Intervenções
    if intervencoes:
        elements.append(Paragraph("INTERVENÇÕES", heading_style))
        for i, interv in enumerate(intervencoes, 1):
            data_interv = interv.get('data_intervencao')
            if isinstance(data_interv, str):
                try:
                    data_interv = datetime.fromisoformat(data_interv).strftime('%d/%m/%Y')
                except:
                    pass
            
            elements.append(Paragraph(f"<b>Intervenção #{i}</b> - {data_interv}", normal_style))
            elements.append(Paragraph(f"<b>Motivo:</b> {interv.get('motivo_assistencia', 'N/A')}", normal_style))
            
            if interv.get('relatorio_assistencia'):
                elements.append(Paragraph(f"<b>Relatório:</b> {interv.get('relatorio_assistencia')}", normal_style))
            
            if i < len(intervencoes):
                elements.append(Spacer(1, 0.15*cm))
        
        elements.append(Spacer(1, 0.2*cm))
    
    # Técnicos / Mão de Obra
    if tecnicos:
        elements.append(Paragraph("MÃO DE OBRA / DESLOCAÇÃO", heading_style))
        
        tec_data = [['Técnico', 'Data', 'Horas', 'KM', 'Cód']]
        
        codigos = {
            'diurno': '1',
            'noturno': '2',
            'sabado': 'S',
            'domingo_feriado': 'D'
        }
        
        for tec in tecnicos:
            data_trab = tec.get('data_trabalho')
            if isinstance(data_trab, str):
                try:
                    data_trab = datetime.fromisoformat(data_trab).strftime('%d/%m/%Y')
                except:
                    pass
            
            tec_data.append([
                tec.get('tecnico_nome', 'N/A'),
                data_trab or 'N/A',
                f"{tec.get('horas_cliente', 0)}h",
                f"{tec.get('kms_deslocacao', 0) * 2}",
                codigos.get(tec.get('tipo_horario', ''), '-')
            ])
        
        tec_table = Table(tec_data, colWidths=[5.5*cm, 3*cm, 2*cm, 2.5*cm, 1.5*cm])
        tec_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 3),
            ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ]))
        elements.append(tec_table)
        elements.append(Spacer(1, 0.2*cm))
    
    # Fotografias (2 por linha, layout compacto)
    if fotografias:
        elements.append(Paragraph("COMPONENTES ADICIONAIS", heading_style))
        
        # Estilo para descrições pequenas
        desc_style = ParagraphStyle(
            'DescStyle',
            parent=normal_style,
            fontSize=7,
            spaceAfter=1,
            spaceBefore=1
        )
        
        # Organizar fotos em pares (2 por linha)
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
                    cell1.append(Paragraph(f"<i>(Erro ao carregar imagem: {str(e)[:30]})</i>", desc_style))
            else:
                cell1.append(Paragraph("<i>(Sem imagem)</i>", desc_style))
            cell1.append(Paragraph(f"<b>#{i+1}:</b> {foto1.get('descricao', '')[:100]}", desc_style))
            row_content.append(cell1)
            
            # Célula da foto 2 (se existir)
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
                        cell2.append(Paragraph(f"<i>(Erro ao carregar imagem: {str(e)[:30]})</i>", desc_style))
                else:
                    cell2.append(Paragraph("<i>(Sem imagem)</i>", desc_style))
                cell2.append(Paragraph(f"<b>#{i+2}:</b> {foto2.get('descricao', '')[:100]}", desc_style))
                row_content.append(cell2)
            else:
                row_content.append('')
            
            # Criar tabela com as 2 fotos
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
            
            # Espaçamento mínimo entre linhas de fotos
            if i + 2 < len(fotografias):
                elements.append(Spacer(1, 0.15*cm))
        
        elements.append(Spacer(1, 0.2*cm))
    
    # Assinatura
    if assinatura:
        elements.append(Spacer(1, 0.3*cm))
        elements.append(Paragraph("ASSINATURA DO CLIENTE", heading_style))
        
        if assinatura.get('tipo') == 'digital' and assinatura.get('assinatura_path'):
            # Incluir imagem da assinatura
            img_path = Path(assinatura['assinatura_path'])
            if img_path.exists():
                try:
                    img = RLImage(str(img_path), width=6*cm, height=3*cm, kind='proportional')
                    elements.append(img)
                except:
                    pass
        
        nome_completo = assinatura.get('assinado_por') or f"{assinatura.get('primeiro_nome', '')} {assinatura.get('ultimo_nome', '')}"
        elements.append(Paragraph(f"<b>Nome:</b> {nome_completo}", normal_style))
        
        data_assinatura = assinatura.get('data_assinatura')
        if isinstance(data_assinatura, str):
            try:
                data_assinatura = datetime.fromisoformat(data_assinatura).strftime('%d/%m/%Y %H:%M')
            except:
                pass
        elements.append(Paragraph(f"<b>Data:</b> {data_assinatura}", normal_style))
    
    # Construir PDF
    doc.build(elements)
    buffer.seek(0)
    return buffer
