from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage, PageBreak, KeepTogether, KeepInFrame
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from io import BytesIO
from datetime import datetime
from pathlib import Path
import base64
from collections import defaultdict

def generate_ot_pdf(relatorio, cliente, intervencoes, tecnicos, fotografias, assinaturas, equipamentos_adicionais=None, materiais=None, registos_mao_obra=None):
    """
    Gera PDF completo de uma Ordem de Trabalho ORGANIZADO POR DATA DE INTERVENÇÃO
    Cada intervenção aparece como bloco independente com os dados correspondentes a essa data.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.8*cm, bottomMargin=0.8*cm, leftMargin=1*cm, rightMargin=1*cm)
    elements = []
    styles = getSampleStyleSheet()
    
    # Estilos customizados
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
    
    subheading_style = ParagraphStyle(
        'CustomSubHeading',
        parent=styles['Heading3'],
        fontSize=10,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=3,
        spaceBefore=4,
        fontName='Helvetica-Bold'
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=9,
        spaceAfter=2,
        spaceBefore=0
    )
    
    date_header_style = ParagraphStyle(
        'DateHeader',
        parent=styles['Heading2'],
        fontSize=11,
        textColor=colors.white,
        spaceAfter=4,
        spaceBefore=8,
        fontName='Helvetica-Bold',
        backColor=colors.HexColor('#3b82f6')
    )
    
    # Helper para normalizar datas
    def normalize_date(date_str):
        """Converte diferentes formatos de data para YYYY-MM-DD"""
        if not date_str:
            return None
        if isinstance(date_str, str):
            try:
                # Tenta formato ISO
                dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                return dt.strftime('%Y-%m-%d')
            except:
                try:
                    # Tenta formato DD/MM/YYYY
                    dt = datetime.strptime(date_str, '%d/%m/%Y')
                    return dt.strftime('%Y-%m-%d')
                except:
                    return date_str[:10] if len(date_str) >= 10 else date_str
        return None
    
    def format_date_display(date_str):
        """Formata data para exibição DD/MM/YYYY"""
        if not date_str:
            return 'N/A'
        try:
            dt = datetime.strptime(date_str, '%Y-%m-%d')
            return dt.strftime('%d/%m/%Y')
        except:
            return date_str
    
    # ========== CABEÇALHO DO DOCUMENTO ==========
    
    # Logo da empresa
    logo_path = Path(__file__).parent / "assets" / "hwi_logo.png"
    if logo_path.exists():
        logo = RLImage(str(logo_path), width=6*cm, height=2*cm)
        elements.append(logo)
        elements.append(Spacer(1, 0.2*cm))
    
    # Título
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
        try:
            data_servico = datetime.fromisoformat(data_servico).strftime('%d/%m/%Y')
        except:
            pass
    elements.append(Paragraph(f"<b>Data de Serviço:</b> {data_servico}", normal_style))
    elements.append(Spacer(1, 0.2*cm))
    
    # ========== DADOS DO CLIENTE ==========
    client_section = []
    client_section.append(Paragraph("DADOS DO CLIENTE", heading_style))
    client_data = [
        ['Nome:', cliente.get('nome', 'N/A')],
        ['Email:', cliente.get('email', 'N/A')],
        ['Telefone:', cliente.get('telefone', 'N/A')],
        ['Morada:', cliente.get('morada', 'N/A')],
        ['NIF:', cliente.get('nif', 'N/A')],
        ['Local de Intervenção:', relatorio.get('local_intervencao', 'N/A')],
        ['Pedido por:', relatorio.get('pedido_por', 'N/A')],
        ['Contacto:', relatorio.get('contacto_pedido', 'N/A') or 'N/A'],
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
    client_section.append(client_table)
    client_section.append(Spacer(1, 0.2*cm))
    elements.append(KeepTogether(client_section))
    
    # ========== MOTIVO DA ASSISTÊNCIA ==========
    motivo_section = []
    motivo_section.append(Paragraph("MOTIVO DA ASSISTÊNCIA", heading_style))
    motivo_text = relatorio.get('motivo_assistencia', 'N/A')
    motivo_section.append(Paragraph(motivo_text, normal_style))
    motivo_section.append(Spacer(1, 0.2*cm))
    elements.append(KeepTogether(motivo_section))
    
    # ========== EQUIPAMENTOS (TODOS) ==========
    equip_section = []
    equip_section.append(Paragraph("EQUIPAMENTOS", heading_style))
    
    todos_equipamentos = []
    
    # Equipamento principal
    if relatorio.get('equipamento_tipologia') or relatorio.get('equipamento_marca') or relatorio.get('equipamento_modelo'):
        todos_equipamentos.append({
            'id': 'principal',
            'tipologia': relatorio.get('equipamento_tipologia', ''),
            'marca': relatorio.get('equipamento_marca', ''),
            'modelo': relatorio.get('equipamento_modelo', ''),
            'numero_serie': relatorio.get('equipamento_numero_serie', ''),
            'ano_fabrico': relatorio.get('equipamento_ano_fabrico', '')
        })
    
    # Equipamentos adicionais
    if equipamentos_adicionais:
        for equip in equipamentos_adicionais:
            todos_equipamentos.append({
                'id': equip.get('id', ''),
                'tipologia': equip.get('tipologia', ''),
                'marca': equip.get('marca', ''),
                'modelo': equip.get('modelo', ''),
                'numero_serie': equip.get('numero_serie', ''),
                'ano_fabrico': equip.get('ano_fabrico', '')
            })
    
    if todos_equipamentos:
        equip_header = [['#', 'Tipologia', 'Marca', 'Modelo', 'Nº Série', 'Ano']]
        
        for idx, equip in enumerate(todos_equipamentos, 1):
            equip_header.append([
                str(idx),
                equip.get('tipologia', 'N/A') or 'N/A',
                equip.get('marca', 'N/A') or 'N/A',
                equip.get('modelo', 'N/A') or 'N/A',
                equip.get('numero_serie', 'N/A') or 'N/A',
                equip.get('ano_fabrico', '-') or '-'
            ])
        
        equip_table = Table(equip_header, colWidths=[1*cm, 3.5*cm, 3.5*cm, 4*cm, 4*cm, 2*cm])
        equip_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6b7280')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        equip_section.append(equip_table)
    else:
        equip_section.append(Paragraph("Nenhum equipamento registado", normal_style))
    
    equip_section.append(Spacer(1, 0.3*cm))
    elements.append(KeepTogether(equip_section))
    
    # ========== ORGANIZAR DADOS POR DATA DE INTERVENÇÃO ==========
    
    # Recolher todas as datas únicas
    all_dates = set()
    
    # Datas das intervenções
    if intervencoes:
        for interv in intervencoes:
            date = normalize_date(interv.get('data_intervencao'))
            if date:
                all_dates.add(date)
    
    # Datas dos registos de mão de obra
    if registos_mao_obra:
        for reg in registos_mao_obra:
            date = normalize_date(reg.get('data'))
            if date:
                all_dates.add(date)
    
    # Datas dos técnicos (registos manuais)
    if tecnicos:
        for tec in tecnicos:
            date = normalize_date(tec.get('data_trabalho'))
            if date:
                all_dates.add(date)
    
    # Datas dos componentes/fotografias
    if fotografias:
        for foto in fotografias:
            date = normalize_date(foto.get('uploaded_at'))
            if date:
                all_dates.add(date)
    
    # Datas dos materiais
    if materiais:
        for mat in materiais:
            date = normalize_date(mat.get('data_utilizacao'))
            if date:
                all_dates.add(date)
    
    # Datas das assinaturas
    assinaturas_list = []
    if assinaturas:
        if isinstance(assinaturas, dict):
            assinaturas_list = [assinaturas]
        else:
            assinaturas_list = assinaturas if assinaturas else []
    
    for assin in assinaturas_list:
        date = normalize_date(assin.get('data_intervencao'))
        if date:
            all_dates.add(date)
    
    # Ordenar datas cronologicamente
    sorted_dates = sorted(all_dates) if all_dates else []
    
    # Se não há datas, criar um bloco único "Sem Data"
    if not sorted_dates:
        sorted_dates = [None]
    
    # Mapas de códigos e tipos
    codigos = {
        'diurno': '1',
        'noturno': '2',
        'sabado': 'S',
        'domingo_feriado': 'D'
    }
    
    tipos_label = {
        'trabalho': 'Trab.',
        'viagem': 'Viag.',
        'manual': 'Manual'
    }
    
    desc_style = ParagraphStyle(
        'DescStyle',
        parent=normal_style,
        fontSize=7,
        spaceAfter=1,
        spaceBefore=1
    )
    
    # ========== GERAR BLOCOS POR DATA ==========
    
    elements.append(Paragraph("INTERVENÇÕES POR DATA", heading_style))
    elements.append(Spacer(1, 0.2*cm))
    
    for intervention_num, date in enumerate(sorted_dates, 1):
        date_section = []
        
        # Cabeçalho da data
        if date:
            date_display = format_date_display(date)
            date_header_text = f"INTERVENÇÃO #{intervention_num} - {date_display}"
        else:
            date_header_text = f"INTERVENÇÃO #{intervention_num} - Sem Data Específica"
        
        # Criar tabela para o cabeçalho da data (para ter fundo colorido)
        date_header_table = Table([[date_header_text]], colWidths=[18*cm])
        date_header_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        date_section.append(date_header_table)
        date_section.append(Spacer(1, 0.2*cm))
        
        # ---- Intervenções desta data ----
        date_intervencoes = []
        if intervencoes:
            for interv in intervencoes:
                interv_date = normalize_date(interv.get('data_intervencao'))
                if interv_date == date or (date is None and not interv_date):
                    date_intervencoes.append(interv)
        
        if date_intervencoes:
            date_section.append(Paragraph("<b>Detalhes da Intervenção:</b>", normal_style))
            for interv in date_intervencoes:
                # Equipamento relacionado
                if interv.get('equipamento_id') and equipamentos_adicionais:
                    equip_rel = next((e for e in equipamentos_adicionais if e.get('id') == interv.get('equipamento_id')), None)
                    if equip_rel:
                        equip_desc = f"{equip_rel.get('tipologia', '')} - {equip_rel.get('marca', '')} {equip_rel.get('modelo', '')}"
                        date_section.append(Paragraph(f"<b>Equipamento:</b> {equip_desc}", normal_style))
                
                date_section.append(Paragraph(f"<b>Motivo:</b> {interv.get('motivo_assistencia', 'N/A')}", normal_style))
                
                if interv.get('relatorio_assistencia'):
                    date_section.append(Paragraph(f"<b>Relatório:</b> {interv.get('relatorio_assistencia')}", normal_style))
            
            date_section.append(Spacer(1, 0.15*cm))
        
        # ---- Horas / Mão de Obra desta data ----
        date_mao_obra = []
        
        # Registos manuais de técnicos
        if tecnicos:
            for tec in tecnicos:
                tec_date = normalize_date(tec.get('data_trabalho'))
                if tec_date == date or (date is None and not tec_date):
                    date_mao_obra.append({
                        'tecnico_nome': tec.get('tecnico_nome', 'N/A'),
                        'hora_inicio': tec.get('hora_inicio', ''),
                        'hora_fim': tec.get('hora_fim', ''),
                        'minutos': tec.get('minutos_cliente', 0),
                        'km': tec.get('kms_deslocacao', 0) or (max(0, (tec.get('kms_final', 0) or 0) - (tec.get('kms_inicial', 0) or 0))),
                        'tipo': tec.get('tipo_registo', 'manual'),
                        'codigo': codigos.get(tec.get('tipo_horario', ''), '-'),
                    })
        
        # Registos de cronómetros
        if registos_mao_obra:
            for reg in registos_mao_obra:
                reg_date = normalize_date(reg.get('data'))
                if reg_date == date or (date is None and not reg_date):
                    minutos_total = reg.get('minutos_trabalhados') or int((reg.get('horas_arredondadas', 0) or 0) * 60)
                    
                    hora_inicio_str = ''
                    hora_fim_str = ''
                    
                    hora_inicio_seg = reg.get('hora_inicio_segmento', '')
                    hora_fim_seg = reg.get('hora_fim_segmento', '')
                    
                    if hora_inicio_seg:
                        try:
                            if isinstance(hora_inicio_seg, str):
                                dt = datetime.fromisoformat(hora_inicio_seg.replace('Z', '+00:00'))
                            else:
                                dt = hora_inicio_seg
                            hora_inicio_str = dt.strftime('%H:%M')
                        except:
                            pass
                    
                    if hora_fim_seg:
                        try:
                            if isinstance(hora_fim_seg, str):
                                dt = datetime.fromisoformat(hora_fim_seg.replace('Z', '+00:00'))
                            else:
                                dt = hora_fim_seg
                            hora_fim_str = dt.strftime('%H:%M')
                        except:
                            pass
                    
                    date_mao_obra.append({
                        'tecnico_nome': reg.get('tecnico_nome', 'N/A'),
                        'hora_inicio': hora_inicio_str,
                        'hora_fim': hora_fim_str,
                        'minutos': minutos_total,
                        'km': reg.get('km', 0) or 0,
                        'tipo': reg.get('tipo', '-'),
                        'codigo': reg.get('codigo', '-'),
                    })
        
        if date_mao_obra:
            date_section.append(Paragraph("<b>Mão de Obra / Deslocação:</b>", normal_style))
            
            mao_obra_data = [['Técnico', 'Tipo', 'Início', 'Fim', 'Horas', 'KM', 'Cód']]
            
            for reg in date_mao_obra:
                minutos_total = reg.get('minutos', 0)
                horas = minutos_total // 60
                mins = minutos_total % 60
                tempo_formatado = f"{horas}h{mins:02d}"
                
                km_value = reg.get('km', 0)
                km_formatado = f"{km_value}" if km_value else "-"
                
                mao_obra_data.append([
                    reg.get('tecnico_nome', 'N/A'),
                    tipos_label.get(reg.get('tipo', ''), reg.get('tipo', '-')),
                    reg.get('hora_inicio', '') or '-',
                    reg.get('hora_fim', '') or '-',
                    tempo_formatado,
                    km_formatado,
                    reg.get('codigo', '-')
                ])
            
            mao_obra_table = Table(mao_obra_data, colWidths=[3.5*cm, 1.6*cm, 1.6*cm, 1.6*cm, 1.8*cm, 1.6*cm, 1.2*cm])
            mao_obra_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#9ca3af')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            date_section.append(mao_obra_table)
            date_section.append(Spacer(1, 0.15*cm))
        
        # ---- Materiais desta data ----
        date_materiais = []
        if materiais:
            for mat in materiais:
                mat_date = normalize_date(mat.get('data_utilizacao'))
                if mat_date == date or (date is None and not mat_date):
                    date_materiais.append(mat)
        
        if date_materiais:
            date_section.append(Paragraph("<b>Materiais Utilizados:</b>", normal_style))
            
            mat_data = [['#', 'Descrição', 'Qtd', 'Fornecido Por']]
            
            for idx, mat in enumerate(date_materiais, 1):
                mat_data.append([
                    str(idx),
                    mat.get('descricao', 'N/A'),
                    str(mat.get('quantidade', 0)),
                    mat.get('fornecido_por', '-') or '-'
                ])
            
            mat_table = Table(mat_data, colWidths=[1*cm, 8*cm, 1.5*cm, 3*cm])
            mat_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#9ca3af')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('ALIGN', (1, 1), (1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            date_section.append(mat_table)
            date_section.append(Spacer(1, 0.15*cm))
        
        # ---- Componentes/Fotografias desta data ----
        date_fotografias = []
        if fotografias:
            for foto in fotografias:
                foto_date = normalize_date(foto.get('uploaded_at'))
                if foto_date == date or (date is None and not foto_date):
                    date_fotografias.append(foto)
        
        if date_fotografias:
            date_section.append(Paragraph("<b>Componentes Adicionais:</b>", normal_style))
            
            for i in range(0, len(date_fotografias), 2):
                foto1 = date_fotografias[i]
                foto2 = date_fotografias[i + 1] if i + 1 < len(date_fotografias) else None
                
                row_content = []
                
                # Célula da foto 1
                cell1 = []
                if foto1.get('foto_base64'):
                    try:
                        foto_bytes = base64.b64decode(foto1['foto_base64'])
                        foto_buffer = BytesIO(foto_bytes)
                        img = RLImage(foto_buffer, width=6*cm, height=4.5*cm, kind='proportional')
                        cell1.append(img)
                    except Exception as e:
                        cell1.append(Paragraph(f"<i>(Erro ao carregar imagem)</i>", desc_style))
                else:
                    cell1.append(Paragraph("<i>(Sem imagem)</i>", desc_style))
                cell1.append(Paragraph(f"<b>#{i+1}:</b> {foto1.get('descricao', '')[:80]}", desc_style))
                row_content.append(cell1)
                
                # Célula da foto 2
                if foto2:
                    cell2 = []
                    if foto2.get('foto_base64'):
                        try:
                            foto_bytes = base64.b64decode(foto2['foto_base64'])
                            foto_buffer = BytesIO(foto_bytes)
                            img = RLImage(foto_buffer, width=6*cm, height=4.5*cm, kind='proportional')
                            cell2.append(img)
                        except Exception as e:
                            cell2.append(Paragraph(f"<i>(Erro ao carregar imagem)</i>", desc_style))
                    else:
                        cell2.append(Paragraph("<i>(Sem imagem)</i>", desc_style))
                    cell2.append(Paragraph(f"<b>#{i+2}:</b> {foto2.get('descricao', '')[:80]}", desc_style))
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
                date_section.append(foto_table)
            
            date_section.append(Spacer(1, 0.15*cm))
        
        # ---- Assinaturas desta data ----
        date_assinaturas = []
        for assin in assinaturas_list:
            assin_date = normalize_date(assin.get('data_intervencao'))
            if assin_date == date or (date is None and not assin_date):
                date_assinaturas.append(assin)
        
        if date_assinaturas:
            date_section.append(Paragraph("<b>Assinatura do Cliente:</b>", normal_style))
            date_section.append(Paragraph("<i>Declaro que aceito os trabalhos acima descritos e que tudo foi efetuado de acordo com a folha de assistência.</i>", desc_style))
            
            for assinatura in date_assinaturas:
                if assinatura.get('tipo') == 'digital':
                    img_added = False
                    
                    if assinatura.get('assinatura_path'):
                        img_path = Path(assinatura['assinatura_path'])
                        if img_path.exists():
                            try:
                                img = RLImage(str(img_path), width=5*cm, height=2.5*cm, kind='proportional')
                                date_section.append(img)
                                img_added = True
                            except:
                                pass
                    
                    if not img_added and assinatura.get('assinatura_base64'):
                        try:
                            img_data = base64.b64decode(assinatura['assinatura_base64'])
                            img_buffer = BytesIO(img_data)
                            img = RLImage(img_buffer, width=5*cm, height=2.5*cm, kind='proportional')
                            date_section.append(img)
                        except:
                            pass
                
                nome_completo = assinatura.get('assinado_por') or f"{assinatura.get('primeiro_nome', '')} {assinatura.get('ultimo_nome', '')}"
                date_section.append(Paragraph(f"<b>Nome:</b> {nome_completo}", normal_style))
                
                data_assinatura = assinatura.get('data_assinatura')
                if isinstance(data_assinatura, str):
                    try:
                        data_assinatura = datetime.fromisoformat(data_assinatura).strftime('%d/%m/%Y %H:%M')
                    except:
                        pass
                date_section.append(Paragraph(f"<b>Data de Assinatura:</b> {data_assinatura}", normal_style))
        
        # Separador entre intervenções
        date_section.append(Spacer(1, 0.4*cm))
        
        # Adicionar secção da data como bloco
        elements.extend(date_section)
    
    # ========== RESUMO FINAL / DIAGNÓSTICO ==========
    has_diagnostico = relatorio.get('diagnostico') or relatorio.get('acoes_realizadas') or relatorio.get('resolucao') or relatorio.get('relatorio_assistencia')
    if has_diagnostico:
        diag_section = []
        diag_section.append(Paragraph("DIAGNÓSTICO E RESOLUÇÃO", heading_style))
        
        if relatorio.get('diagnostico'):
            diag_section.append(Paragraph(f"<b>Diagnóstico:</b> {relatorio.get('diagnostico')}", normal_style))
        
        if relatorio.get('acoes_realizadas'):
            diag_section.append(Paragraph(f"<b>Ações Realizadas:</b> {relatorio.get('acoes_realizadas')}", normal_style))
        
        if relatorio.get('resolucao'):
            diag_section.append(Paragraph(f"<b>Resolução:</b> {relatorio.get('resolucao')}", normal_style))
        
        if relatorio.get('relatorio_assistencia'):
            diag_section.append(Paragraph(f"<b>Relatório de Assistência:</b> {relatorio.get('relatorio_assistencia')}", normal_style))
        
        problema_resolvido = relatorio.get('problema_resolvido', False)
        status_prob = "✓ Sim" if problema_resolvido else "✗ Não"
        diag_section.append(Paragraph(f"<b>Problema Resolvido:</b> {status_prob}", normal_style))
        
        diag_section.append(Spacer(1, 0.2*cm))
        elements.append(KeepTogether(diag_section))
    
    # ========== LEGENDA ==========
    legenda_section = []
    legenda_style = ParagraphStyle(
        'LegendaStyle',
        parent=normal_style,
        fontSize=7,
        textColor=colors.HexColor('#6b7280')
    )
    legenda_section.append(Paragraph("<b>Legenda Códigos:</b> 1 = Dias úteis (07h-19h) | 2 = Dias úteis (19h-07h) | S = Sábado | D = Domingos/Feriados", legenda_style))
    legenda_section.append(Paragraph("<i>Aos kms de ida já adicionados iremos adicionar os kms de volta após assinatura deste relatório.</i>", legenda_style))
    elements.append(KeepTogether(legenda_section))
    
    # Construir PDF
    doc.build(elements)
    buffer.seek(0)
    return buffer
