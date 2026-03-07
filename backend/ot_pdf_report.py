from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage, PageBreak, KeepTogether, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from io import BytesIO
from datetime import datetime
from pathlib import Path
import base64
import os
from collections import defaultdict

def generate_ot_pdf(relatorio, cliente, intervencoes, tecnicos, fotografias, assinaturas, equipamentos_adicionais=None, materiais=None, registos_mao_obra=None, company_info=None, relatorios_assistencia=None):
    """
    Gera PDF completo de uma Folha de Serviço
    Layout baseado na visualização HTML, organizado por data de intervenção
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.6*cm, bottomMargin=0.6*cm, leftMargin=0.8*cm, rightMargin=0.8*cm)
    elements = []
    styles = getSampleStyleSheet()
    
    # ========== ESTILOS ==========
    
    # Cabeçalho principal (fundo cinza escuro)
    header_title_style = ParagraphStyle(
        'HeaderTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.white,
        spaceAfter=2,
        spaceBefore=0,
        alignment=TA_LEFT,
        fontName='Helvetica-Bold'
    )
    
    header_subtitle_style = ParagraphStyle(
        'HeaderSubtitle',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.HexColor('#d1d5db'),  # gray-300
        spaceAfter=0,
        spaceBefore=0
    )
    
    # Títulos de secção
    section_title_style = ParagraphStyle(
        'SectionTitle',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.HexColor('#1f2937'),  # gray-800
        spaceAfter=6,
        spaceBefore=0,
        fontName='Helvetica-Bold'
    )
    
    # Título de intervenção (fundo azul)
    intervention_title_style = ParagraphStyle(
        'InterventionTitle',
        parent=styles['Heading2'],
        fontSize=11,
        textColor=colors.white,
        spaceAfter=0,
        spaceBefore=0,
        fontName='Helvetica-Bold'
    )
    
    # Texto normal
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=9,
        spaceAfter=2,
        spaceBefore=0,
        textColor=colors.HexColor('#374151')  # gray-700
    )
    
    # Labels
    label_style = ParagraphStyle(
        'LabelStyle',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#6b7280'),  # gray-500
        fontName='Helvetica-Bold'
    )
    
    # Valores
    value_style = ParagraphStyle(
        'ValueStyle',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#1f2937'),  # gray-800
    )
    
    # Descrição de foto
    foto_desc_style = ParagraphStyle(
        'FotoDescStyle',
        parent=styles['Normal'],
        fontSize=7,
        textColor=colors.HexColor('#4b5563'),
        spaceAfter=1
    )
    
    # ========== HELPERS ==========
    
    def normalize_date(date_str):
        """Converte diferentes formatos de data para YYYY-MM-DD"""
        if not date_str:
            return None
        # Se for um objeto datetime, converter diretamente
        if isinstance(date_str, datetime):
            return date_str.strftime('%Y-%m-%d')
        if isinstance(date_str, str):
            try:
                dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                return dt.strftime('%Y-%m-%d')
            except:
                try:
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
    
    def create_section_box(content_elements, title=None, allow_split=True):
        """Cria uma caixa de secção - SEMPRE permite split para evitar erro 'too large'"""
        # NUNCA usar tabela envolvente - sempre permitir quebra de página
        result = []
        if title:
            result.append(Paragraph(title, section_title_style))
            result.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#d1d5db'), spaceAfter=6))
        result.extend(content_elements)
        result.append(Spacer(1, 0.3*cm))
        return result
    
    def add_section_to_elements(elements, section):
        """Adiciona secção aos elementos (sempre é lista agora)"""
        if isinstance(section, list):
            elements.extend(section)
        else:
            elements.append(section)
    
    # ========== CABEÇALHO COM LOGO ==========
    
    # Tentar carregar logo da empresa
    logo_element = None
    if company_info:
        logo_url = company_info.get('logo_url')
        if logo_url:
            try:
                # Se for URL relativa, construir caminho completo
                if logo_url.startswith('/uploads/'):
                    logo_path = f"/app{logo_url}"
                elif not logo_url.startswith('http'):
                    logo_path = f"/app/uploads/{logo_url}"
                else:
                    logo_path = logo_url
                
                if os.path.exists(logo_path):
                    # Usar imagem sem modificação de tamanho
                    logo_element = RLImage(logo_path)
            except Exception as e:
                print(f"Erro ao carregar logo: {e}")
    
    # Se não houver logo configurado, tentar usar logo padrão
    if logo_element is None:
        default_logo_paths = [
            "/app/uploads/eb50c801-bae6-4203-ab03-9d23099e8f9d_footer-logo.png",
            "/app/uploads/logo.png",
            "/app/uploads/company_logo.png"
        ]
        for logo_path in default_logo_paths:
            if os.path.exists(logo_path):
                try:
                    # Usar imagem sem modificação de tamanho
                    logo_element = RLImage(logo_path)
                    break
                except:
                    continue
    
    # Formatar data de serviço
    data_servico = relatorio.get('data_servico', '')
    if isinstance(data_servico, str) and data_servico:
        try:
            data_servico = datetime.fromisoformat(data_servico).strftime('%d/%m/%Y')
        except:
            pass
    
    status_labels = {
        'pendente': 'Pendente',
        'agendado': 'Agendado',
        'orcamento': 'Orçamento',
        'em_execucao': 'Em Execução',
        'concluido': 'Concluído',
        'facturado': 'Facturado'
    }
    status_text = status_labels.get(relatorio.get('status', ''), relatorio.get('status', ''))
    
    # Construir cabeçalho com logo centrado
    if logo_element:
        # Cabeçalho com logo centrado no topo
        logo_row = Table([[logo_element]], colWidths=[18*cm])
        logo_row.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, 0), 'CENTER'),
            ('VALIGN', (0, 0), (0, 0), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (0, 0), 10),
            ('BOTTOMPADDING', (0, 0), (0, 0), 10),
        ]))
        elements.append(logo_row)
        elements.append(Spacer(1, 0.3*cm))
    
    # Cabeçalho do relatório técnico (sem nome da empresa)
    header_left = [
        [Paragraph("RELATÓRIO TÉCNICO", header_title_style)],
        [Paragraph(f"Folha de Serviço #{relatorio.get('numero_assistencia', 'N/A')}", header_subtitle_style)]
    ]
    
    header_right = [
        [Paragraph(f"Data: {data_servico}", header_subtitle_style)],
        [Paragraph(f"Estado: {status_text}", header_subtitle_style)]
    ]
    
    header_table = Table([
        [Table(header_left), Table(header_right)]
    ], colWidths=[12*cm, 6*cm])
    
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1f2937')),  # gray-800
        ('TOPPADDING', (0, 0), (-1, -1), 15),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
        ('LEFTPADDING', (0, 0), (-1, -1), 15),
        ('RIGHTPADDING', (0, 0), (-1, -1), 15),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (-1, 0), (-1, 0), 'RIGHT'),
    ]))
    
    elements.append(header_table)
    elements.append(Spacer(1, 0.4*cm))
    
    # ========== INFORMAÇÕES DO CLIENTE ==========
    
    client_grid = [
        [Paragraph("Cliente:", label_style), Paragraph(cliente.get('nome', 'N/A'), value_style),
         Paragraph("Pedido por:", label_style), Paragraph(relatorio.get('pedido_por', '-') or '-', value_style)],
        [Paragraph("Local:", label_style), Paragraph(relatorio.get('local_intervencao', '-') or '-', value_style),
         Paragraph("", label_style), Paragraph("", value_style)],
    ]
    
    # Adicionar FS Relacionada se existir
    ot_rel_numero = relatorio.get('ot_relacionada_numero')
    if ot_rel_numero:
        client_grid.append([
            Paragraph("FS Relacionada:", label_style),
            Paragraph(f"FS #{ot_rel_numero}", ParagraphStyle('OTRelLink', parent=value_style, textColor=colors.HexColor('#2563eb'))),
            Paragraph("", label_style), Paragraph("", value_style)
        ])
    
    client_table = Table(client_grid, colWidths=[2*cm, 7*cm, 2.5*cm, 6.5*cm])
    client_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    
    client_section = create_section_box([client_table], "INFORMAÇÕES DO CLIENTE")
    add_section_to_elements(elements, client_section)
    elements.append(Spacer(1, 0.3*cm))
    
    # ========== EQUIPAMENTOS ==========
    
    def format_ano_fabrico(ano_str):
        """Formata o ano de fabrico para exibição"""
        if not ano_str:
            return None
        # Pode vir como AAAA, MM-AAAA, MM/AAAA, DD-MM-AAAA, etc.
        return ano_str
    
    def create_equipment_card(tipologia, marca, modelo, numero_serie, ano_fabrico, horas_funcionamento=None, is_principal=False):
        """Cria um card de equipamento com campos separados"""
        equip_data = []
        
        if tipologia:
            equip_data.append([
                Paragraph("<b>Tipo:</b>", label_style),
                Paragraph(tipologia, value_style)
            ])
        
        if marca:
            equip_data.append([
                Paragraph("<b>Marca:</b>", label_style),
                Paragraph(marca, value_style)
            ])
        
        if modelo:
            equip_data.append([
                Paragraph("<b>Modelo:</b>", label_style),
                Paragraph(modelo, value_style)
            ])
        
        # Nº Série aparece sempre
        equip_data.append([
            Paragraph("<b>Nº Série:</b>", label_style),
            Paragraph(numero_serie if numero_serie else "Sem Dados", value_style)
        ])
        
        if ano_fabrico:
            equip_data.append([
                Paragraph("<b>Ano:</b>", label_style),
                Paragraph(format_ano_fabrico(ano_fabrico), value_style)
            ])
        
        if horas_funcionamento:
            equip_data.append([
                Paragraph("<b>Horas:</b>", label_style),
                Paragraph(str(horas_funcionamento), value_style)
            ])
        
        if not equip_data:
            return None
        
        # Criar tabela com campos organizados
        eq_table = Table(equip_data, colWidths=[4*cm, 13.5*cm])
        eq_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f9fafb')),  # gray-50
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
        ]))
        
        return eq_table
    
    todos_equipamentos = []
    
    # Equipamento principal
    if relatorio.get('equipamento_tipologia') or relatorio.get('equipamento_marca') or relatorio.get('equipamento_modelo') or relatorio.get('equipamento_numero_serie'):
        equip_card = create_equipment_card(
            tipologia=relatorio.get('equipamento_tipologia'),
            marca=relatorio.get('equipamento_marca'),
            modelo=relatorio.get('equipamento_modelo'),
            numero_serie=relatorio.get('equipamento_numero_serie'),
            ano_fabrico=relatorio.get('equipamento_ano_fabrico'),
            horas_funcionamento=relatorio.get('equipamento_horas_funcionamento'),
            is_principal=True
        )
        if equip_card:
            todos_equipamentos.append(equip_card)
    
    # Equipamentos adicionais
    if equipamentos_adicionais:
        for equip in equipamentos_adicionais:
            equip_card = create_equipment_card(
                tipologia=equip.get('tipologia'),
                marca=equip.get('marca'),
                modelo=equip.get('modelo'),
                numero_serie=equip.get('numero_serie'),
                ano_fabrico=equip.get('ano_fabrico'),
                horas_funcionamento=equip.get('horas_funcionamento'),
                is_principal=False
            )
            if equip_card:
                todos_equipamentos.append(equip_card)
    
    if todos_equipamentos:
        equip_content = []
        for eq_table in todos_equipamentos:
            equip_content.append(eq_table)
            equip_content.append(Spacer(1, 0.2*cm))
        
        equip_section = create_section_box(equip_content, "EQUIPAMENTOS")
        add_section_to_elements(elements, equip_section)
        elements.append(Spacer(1, 0.3*cm))
    
    # ========== ORGANIZAR DADOS POR DATA DE INTERVENÇÃO ==========
    
    all_dates = set()
    
    # Recolher todas as datas
    if intervencoes:
        for interv in intervencoes:
            date = normalize_date(interv.get('data_intervencao'))
            if date:
                all_dates.add(date)
    
    if registos_mao_obra:
        for reg in registos_mao_obra:
            date = normalize_date(reg.get('data'))
            if date:
                all_dates.add(date)
    
    if tecnicos:
        for tec in tecnicos:
            date = normalize_date(tec.get('data_trabalho'))
            if date:
                all_dates.add(date)
    
    if fotografias:
        for foto in fotografias:
            date = normalize_date(foto.get('uploaded_at'))
            if date:
                all_dates.add(date)
    
    if materiais:
        for mat in materiais:
            date = normalize_date(mat.get('data_utilizacao'))
            if date:
                all_dates.add(date)
    
    # Assinaturas por data de assinatura
    assinaturas_list = []
    if assinaturas:
        if isinstance(assinaturas, dict):
            assinaturas_list = [assinaturas]
        else:
            assinaturas_list = assinaturas if assinaturas else []
    
    for assin in assinaturas_list:
        date = normalize_date(assin.get('data_assinatura'))
        if date:
            all_dates.add(date)
    
    sorted_dates = sorted(all_dates) if all_dates else [None]
    
    # Códigos
    codigos_map = {
        'diurno': '1',
        'noturno': '2',
        'sabado': 'S',
        'domingo_feriado': 'D'
    }
    
    # ========== GERAR BLOCOS POR DATA ==========
    
    for intervention_num, date in enumerate(sorted_dates, 1):
        # Cabeçalho da intervenção (fundo azul)
        if date:
            date_display = format_date_display(date)
            date_header_text = f"INTERVENÇÃO #{intervention_num} - {date_display}"
        else:
            date_header_text = f"INTERVENÇÃO #{intervention_num} - Sem Data Específica"
        
        date_header = Table([[Paragraph(date_header_text, intervention_title_style)]], colWidths=[18.4*cm])
        date_header.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#2563eb')),  # blue-600
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ]))
        elements.append(date_header)
        elements.append(Spacer(1, 0.2*cm))
        
        # ---- Intervenções desta data ----
        date_intervencoes = []
        if intervencoes:
            for interv in intervencoes:
                interv_date = normalize_date(interv.get('data_intervencao'))
                if interv_date == date or (date is None and not interv_date):
                    date_intervencoes.append(interv)
        
        if date_intervencoes:
            interv_content = []
            for interv in date_intervencoes:
                interv_content_items = []
                
                # Equipamento relacionado
                if interv.get('equipamento_id') and equipamentos_adicionais:
                    equip_rel = next((e for e in equipamentos_adicionais if e.get('id') == interv.get('equipamento_id')), None)
                    if equip_rel:
                        equip_desc = f"{equip_rel.get('tipologia', '')} - {equip_rel.get('marca', '')} {equip_rel.get('modelo', '')}"
                        interv_content_items.append(Paragraph(f"<b>Equipamento:</b> {equip_desc}", normal_style))
                
                if interv.get('motivo_assistencia'):
                    motivo_text = interv.get('motivo_assistencia', '').replace('\n', '<br/>')
                    interv_content_items.append(Paragraph(f"<b>Motivo:</b> {motivo_text}", normal_style))
                
                if interv_content_items:
                    for item in interv_content_items:
                        interv_content.append(item)
                    interv_content.append(Spacer(1, 0.2*cm))
            
            if interv_content:
                interv_section = create_section_box(interv_content, "DETALHES DA INTERVENÇÃO")
                add_section_to_elements(elements, interv_section)
                elements.append(Spacer(1, 0.2*cm))
        
        # ---- Mão de Obra / Registos desta data ----
        date_mao_obra = []
        
        if tecnicos:
            for tec in tecnicos:
                tec_date = normalize_date(tec.get('data_trabalho'))
                if tec_date == date or (date is None and not tec_date):
                    date_mao_obra.append({
                        'tecnico_nome': tec.get('tecnico_nome', 'N/A'),
                        'funcao_ot': tec.get('funcao_ot', 'tecnico'),
                        'hora_inicio': tec.get('hora_inicio', ''),
                        'hora_fim': tec.get('hora_fim', ''),
                        'minutos': tec.get('minutos_cliente', 0),
                        'km': tec.get('kms_deslocacao', 0) or (max(0, (tec.get('kms_final', 0) or 0) - (tec.get('kms_inicial', 0) or 0))),
                        'tipo': tec.get('tipo_registo', 'trabalho'),
                        'codigo': codigos_map.get(tec.get('tipo_horario', ''), '-'),
                    })
        
        if registos_mao_obra:
            for reg in registos_mao_obra:
                reg_date = normalize_date(reg.get('data'))
                if reg_date == date or (date is None and not reg_date):
                    minutos_total = reg.get('minutos_trabalhados') or int((reg.get('horas_arredondadas', 0) or 0) * 60)
                    
                    hora_inicio_str = ''
                    hora_fim_str = ''
                    
                    if reg.get('hora_inicio_segmento'):
                        try:
                            dt = datetime.fromisoformat(str(reg['hora_inicio_segmento']).replace('Z', '+00:00'))
                            hora_inicio_str = dt.strftime('%H:%M')
                        except:
                            pass
                    
                    if reg.get('hora_fim_segmento'):
                        try:
                            dt = datetime.fromisoformat(str(reg['hora_fim_segmento']).replace('Z', '+00:00'))
                            hora_fim_str = dt.strftime('%H:%M')
                        except:
                            pass
                    
                    date_mao_obra.append({
                        'tecnico_nome': reg.get('tecnico_nome', 'N/A'),
                        'funcao_ot': reg.get('funcao_ot', 'tecnico'),
                        'hora_inicio': hora_inicio_str,
                        'hora_fim': hora_fim_str,
                        'minutos': minutos_total,
                        'km': reg.get('km', 0) or 0,
                        'tipo': reg.get('tipo', 'trabalho'),
                        'codigo': reg.get('codigo', '-'),
                    })
        
        if date_mao_obra:
            # Ordenar registos por hora de início (cronologicamente)
            date_mao_obra.sort(key=lambda x: (x.get('hora_inicio', '') or '99:99', x.get('tecnico_nome', '')))
            
            # Cabeçalho da tabela
            mao_obra_header = [['Colaborador', 'Tipo', 'Cód.', 'Início', 'Fim', 'Horas', 'KM']]
            
            for reg in date_mao_obra:
                minutos_total = reg.get('minutos', 0)
                horas = minutos_total // 60
                mins = minutos_total % 60
                tempo_formatado = f"{horas}h{mins:02d}"
                
                km_value = reg.get('km', 0)
                km_formatado = f"{km_value} km" if km_value else "-"
                
                # Tipo: T (Trabalho) ou V (Viagem)
                tipo_raw = reg.get('tipo', '-')
                if tipo_raw == 'trabalho':
                    tipo_display = 'T'
                elif tipo_raw == 'viagem':
                    tipo_display = 'V'
                elif tipo_raw == 'oficina':
                    tipo_display = 'O'
                else:
                    tipo_display = tipo_raw[:1].upper() if tipo_raw else '-'
                
                # Função: Júnior, Técnico ou Sénior
                funcao = reg.get('funcao_ot', 'tecnico')
                funcao_labels = {'junior': 'Téc. Júnior', 'tecnico': 'Técnico', 'senior': 'Téc. Sénior'}
                funcao_label = funcao_labels.get(funcao, 'Técnico')
                nome_display = f"{reg.get('tecnico_nome', 'N/A')} ({funcao_label})"
                
                mao_obra_header.append([
                    nome_display,
                    tipo_display,
                    reg.get('codigo', '-'),
                    reg.get('hora_inicio', '') or '-',
                    reg.get('hora_fim', '') or '-',
                    tempo_formatado,
                    km_formatado
                ])
            
            mao_obra_table = Table(mao_obra_header, colWidths=[5*cm, 1.5*cm, 1.5*cm, 2*cm, 2*cm, 1.5*cm, 2.5*cm])
            mao_obra_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e5e7eb')),  # gray-200
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#374151')),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('ALIGN', (0, 1), (0, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                # Linhas alternadas
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f9fafb'), colors.white]),
            ]))
            
            mao_obra_keep = [
                Paragraph("MÃO DE OBRA / DESLOCAÇÃO", section_title_style),
                HRFlowable(width="100%", thickness=1, color=colors.HexColor('#d1d5db'), spaceAfter=6),
                mao_obra_table,
                Spacer(1, 0.3*cm),
            ]
            elements.append(KeepTogether(mao_obra_keep))
            elements.append(Spacer(1, 0.2*cm))
        
        # ---- Materiais desta data ----
        date_materiais = []
        if materiais:
            first_date = sorted_dates[0] if sorted_dates else None
            for mat in materiais:
                mat_date = normalize_date(mat.get('data_utilizacao'))
                if mat_date == date:
                    date_materiais.append(mat)
                elif not mat_date and (date == first_date):
                    # Materiais sem data aparecem na primeira data
                    date_materiais.append(mat)
        
        if date_materiais:
            mat_header = [['Descrição', 'Quantidade', 'Fornecido por']]
            
            for mat in date_materiais:
                qty = mat.get('quantidade', 0)
                unit = mat.get('unidade', 'Un')
                mat_header.append([
                    mat.get('descricao', 'N/A'),
                    f"{qty} {unit}",
                    mat.get('fornecido_por', '-') or '-'
                ])
            
            mat_table = Table(mat_header, colWidths=[10*cm, 3*cm, 4.5*cm])
            mat_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e5e7eb')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#374151')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('ALIGN', (1, 0), (1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f9fafb'), colors.white]),
            ]))
            
            mat_keep = [
                Paragraph("MATERIAIS UTILIZADOS", section_title_style),
                HRFlowable(width="100%", thickness=1, color=colors.HexColor('#d1d5db'), spaceAfter=6),
                mat_table,
                Spacer(1, 0.3*cm),
            ]
            elements.append(KeepTogether(mat_keep))
            elements.append(Spacer(1, 0.2*cm))
        
        # ---- Relatório de Assistência desta data (após Materiais) ----
        date_rel_assist = []
        if relatorios_assistencia:
            date_rel_assist = [ra for ra in relatorios_assistencia if normalize_date(ra.get('data_intervencao')) == date]
        if date_rel_assist:
            ra_content = []
            for ra in date_rel_assist:
                equip_names = []
                for eq_id in (ra.get('equipamento_ids') or []):
                    if eq_id == 'principal':
                        name = f"{relatorio.get('equipamento_tipologia', '')} {relatorio.get('equipamento_marca', '')} {relatorio.get('equipamento_modelo', '')}".strip()
                        if name:
                            equip_names.append(name)
                    else:
                        eq = next((e for e in (equipamentos_adicionais or []) if e.get('id') == eq_id), None)
                        if eq:
                            name = f"{eq.get('tipologia', '')} {eq.get('marca', '')} {eq.get('modelo', '')}".strip()
                            equip_names.append(name)
                if equip_names:
                    ra_content.append(Paragraph(f"<b>Equipamento(s):</b> {', '.join(equip_names)}", normal_style))
                ra_text = ra.get('texto', '').replace('\n', '<br/>')
                ra_content.append(Paragraph(ra_text, normal_style))
                ra_content.append(Spacer(1, 0.2*cm))
            if ra_content:
                ra_section = create_section_box(ra_content, "RELATÓRIO DE ASSISTÊNCIA")
                add_section_to_elements(elements, ra_section)
                elements.append(Spacer(1, 0.2*cm))
        
        # ---- Fotografias desta data ----
        date_fotografias = []
        if fotografias:
            for foto in fotografias:
                foto_date = normalize_date(foto.get('uploaded_at'))
                if foto_date == date or (date is None and not foto_date):
                    date_fotografias.append(foto)
        
        if date_fotografias:
            foto_content = []
            
            for i in range(0, len(date_fotografias), 2):
                foto1 = date_fotografias[i]
                foto2 = date_fotografias[i + 1] if i + 1 < len(date_fotografias) else None
                
                row_content = []
                
                # Foto 1
                cell1 = []
                img1_added = False
                # Tentar primeiro carregar do caminho do ficheiro
                if foto1.get('foto_path'):
                    img_path = Path(foto1['foto_path'])
                    if img_path.exists():
                        try:
                            img = RLImage(str(img_path), width=7.5*cm, height=5*cm, kind='proportional')
                            cell1.append(img)
                            img1_added = True
                        except:
                            pass
                # Fallback para base64
                if not img1_added and foto1.get('foto_base64'):
                    try:
                        foto_bytes = base64.b64decode(foto1['foto_base64'])
                        foto_buffer = BytesIO(foto_bytes)
                        img = RLImage(foto_buffer, width=7.5*cm, height=5*cm, kind='proportional')
                        cell1.append(img)
                        img1_added = True
                    except:
                        cell1.append(Paragraph("<i>(Erro ao carregar)</i>", foto_desc_style))
                if not img1_added:
                    cell1.append(Paragraph("<i>(Sem imagem)</i>", foto_desc_style))
                
                if foto1.get('descricao'):
                    cell1.append(Paragraph(foto1.get('descricao', '')[:100], foto_desc_style))
                
                row_content.append(cell1)
                
                # Foto 2
                if foto2:
                    cell2 = []
                    img2_added = False
                    # Tentar primeiro carregar do caminho do ficheiro
                    if foto2.get('foto_path'):
                        img_path = Path(foto2['foto_path'])
                        if img_path.exists():
                            try:
                                img = RLImage(str(img_path), width=7.5*cm, height=5*cm, kind='proportional')
                                cell2.append(img)
                                img2_added = True
                            except:
                                pass
                    # Fallback para base64
                    if not img2_added and foto2.get('foto_base64'):
                        try:
                            foto_bytes = base64.b64decode(foto2['foto_base64'])
                            foto_buffer = BytesIO(foto_bytes)
                            img = RLImage(foto_buffer, width=7.5*cm, height=5*cm, kind='proportional')
                            cell2.append(img)
                            img2_added = True
                        except:
                            cell2.append(Paragraph("<i>(Erro ao carregar)</i>", foto_desc_style))
                    if not img2_added:
                        cell2.append(Paragraph("<i>(Sem imagem)</i>", foto_desc_style))
                    
                    if foto2.get('descricao'):
                        cell2.append(Paragraph(foto2.get('descricao', '')[:100], foto_desc_style))
                    
                    row_content.append(cell2)
                else:
                    row_content.append('')
                
                foto_row_table = Table([row_content], colWidths=[8.7*cm, 8.7*cm])
                foto_row_table.setStyle(TableStyle([
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('BOX', (0, 0), (0, 0), 0.5, colors.HexColor('#e5e7eb')),
                    ('BOX', (1, 0), (1, 0), 0.5, colors.HexColor('#e5e7eb')),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ]))
                foto_content.append(foto_row_table)
                foto_content.append(Spacer(1, 0.1*cm))
            
            foto_section = create_section_box(foto_content, "FOTOGRAFIAS")
            add_section_to_elements(elements, foto_section)
            elements.append(Spacer(1, 0.2*cm))
        
        # ---- Assinaturas desta data (por data_assinatura) ----
        date_assinaturas = []
        for assin in assinaturas_list:
            assin_date = normalize_date(assin.get('data_assinatura'))
            if assin_date == date or (date is None and not assin_date):
                date_assinaturas.append(assin)
        
        if date_assinaturas:
            assin_content = []
            
            # Estilo centrado para nome e data
            assin_name_style = ParagraphStyle(
                'AssinNameStyle',
                parent=styles['Normal'],
                fontSize=10,
                textColor=colors.HexColor('#1f2937'),
                alignment=TA_CENTER,
                fontName='Helvetica-Bold',
                spaceAfter=2
            )
            
            assin_data_style = ParagraphStyle(
                'AssinDataStyle',
                parent=styles['Normal'],
                fontSize=8,
                textColor=colors.HexColor('#6b7280'),
                alignment=TA_CENTER,
                spaceAfter=0
            )
            
            for assinatura in date_assinaturas:
                assin_elements = []
                
                # Imagem da assinatura - AUMENTADA e CENTRADA
                img_added = False
                if assinatura.get('assinatura_path'):
                    img_path = Path(assinatura['assinatura_path'])
                    if img_path.exists():
                        try:
                            # Imagem maior: 8cm x 4cm
                            img = RLImage(str(img_path), width=8*cm, height=4*cm, kind='proportional')
                            assin_elements.append(img)
                            img_added = True
                        except:
                            pass
                
                if not img_added and assinatura.get('assinatura_base64'):
                    try:
                        img_data = base64.b64decode(assinatura['assinatura_base64'])
                        img_buffer = BytesIO(img_data)
                        # Imagem maior: 8cm x 4cm
                        img = RLImage(img_buffer, width=8*cm, height=4*cm, kind='proportional')
                        assin_elements.append(img)
                        img_added = True
                    except:
                        assin_elements.append(Paragraph("<i>Assinatura não disponível</i>", assin_data_style))
                elif not img_added:
                    assin_elements.append(Paragraph("<i>Assinatura não disponível</i>", assin_data_style))
                
                # Linha separadora fina
                assin_elements.append(Spacer(1, 0.15*cm))
                assin_elements.append(HRFlowable(width="60%", thickness=0.5, color=colors.HexColor('#d1d5db'), spaceBefore=0, spaceAfter=0.1*cm))
                
                # Dados da assinatura - POR BAIXO e CENTRADOS
                nome_completo = assinatura.get('assinado_por') or f"{assinatura.get('primeiro_nome', '')} {assinatura.get('ultimo_nome', '')}".strip()
                
                data_assinatura_display = ''
                if assinatura.get('data_assinatura'):
                    try:
                        dt = datetime.fromisoformat(str(assinatura['data_assinatura']).replace('Z', '+00:00'))
                        data_assinatura_display = dt.strftime('%d/%m/%Y %H:%M')
                    except:
                        data_assinatura_display = str(assinatura['data_assinatura'])
                
                if nome_completo:
                    assin_elements.append(Paragraph(nome_completo, assin_name_style))
                if data_assinatura_display:
                    assin_elements.append(Paragraph(data_assinatura_display, assin_data_style))
                
                # Tabela com layout centrado - SEM FUNDO VERDE
                assin_table = Table([[assin_elements]], colWidths=[17*cm])
                assin_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), colors.white),
                    ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#e5e7eb')),  # gray-200 border
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('TOPPADDING', (0, 0), (-1, -1), 12),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
                    ('LEFTPADDING', (0, 0), (-1, -1), 10),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                ]))
                assin_content.append(assin_table)
                assin_content.append(Spacer(1, 0.15*cm))
            
            assin_keep = [
                Paragraph("ASSINATURAS", section_title_style),
                HRFlowable(width="100%", thickness=1, color=colors.HexColor('#d1d5db'), spaceAfter=6),
            ]
            assin_keep.extend(assin_content)
            assin_keep.append(Spacer(1, 0.3*cm))
            elements.append(KeepTogether(assin_keep))
            elements.append(Spacer(1, 0.2*cm))
        
        elements.append(Spacer(1, 0.3*cm))
    
    # ========== FOTOGRAFIAS NÃO ASSOCIADAS A DATAS (FALLBACK) ==========
    # Se houver fotografias que não foram incluídas nos blocos de data, mostrar aqui
    if fotografias:
        # Verificar quais fotografias não foram incluídas
        fotos_incluidas = set()
        for date in sorted_dates:
            for foto in fotografias:
                foto_date = normalize_date(foto.get('uploaded_at'))
                if foto_date == date or (date is None and not foto_date):
                    fotos_incluidas.add(foto.get('id') or id(foto))
        
        fotos_nao_incluidas = [f for f in fotografias if (f.get('id') or id(f)) not in fotos_incluidas]
        
        if fotos_nao_incluidas:
            foto_content = []
            
            for i in range(0, len(fotos_nao_incluidas), 2):
                foto1 = fotos_nao_incluidas[i]
                foto2 = fotos_nao_incluidas[i + 1] if i + 1 < len(fotos_nao_incluidas) else None
                
                row_content = []
                
                # Foto 1
                cell1 = []
                img1_added = False
                if foto1.get('foto_path'):
                    img_path = Path(foto1['foto_path'])
                    if img_path.exists():
                        try:
                            img = RLImage(str(img_path), width=7.5*cm, height=5*cm, kind='proportional')
                            cell1.append(img)
                            img1_added = True
                        except:
                            pass
                if not img1_added and foto1.get('foto_base64'):
                    try:
                        foto_bytes = base64.b64decode(foto1['foto_base64'])
                        foto_buffer = BytesIO(foto_bytes)
                        img = RLImage(foto_buffer, width=7.5*cm, height=5*cm, kind='proportional')
                        cell1.append(img)
                        img1_added = True
                    except:
                        cell1.append(Paragraph("<i>(Erro ao carregar)</i>", foto_desc_style))
                if not img1_added:
                    cell1.append(Paragraph("<i>(Sem imagem)</i>", foto_desc_style))
                
                if foto1.get('descricao'):
                    cell1.append(Paragraph(foto1.get('descricao', '')[:100], foto_desc_style))
                
                row_content.append(cell1)
                
                # Foto 2
                if foto2:
                    cell2 = []
                    img2_added = False
                    if foto2.get('foto_path'):
                        img_path = Path(foto2['foto_path'])
                        if img_path.exists():
                            try:
                                img = RLImage(str(img_path), width=7.5*cm, height=5*cm, kind='proportional')
                                cell2.append(img)
                                img2_added = True
                            except:
                                pass
                    if not img2_added and foto2.get('foto_base64'):
                        try:
                            foto_bytes = base64.b64decode(foto2['foto_base64'])
                            foto_buffer = BytesIO(foto_bytes)
                            img = RLImage(foto_buffer, width=7.5*cm, height=5*cm, kind='proportional')
                            cell2.append(img)
                            img2_added = True
                        except:
                            cell2.append(Paragraph("<i>(Erro ao carregar)</i>", foto_desc_style))
                    if not img2_added:
                        cell2.append(Paragraph("<i>(Sem imagem)</i>", foto_desc_style))
                    
                    if foto2.get('descricao'):
                        cell2.append(Paragraph(foto2.get('descricao', '')[:100], foto_desc_style))
                    
                    row_content.append(cell2)
                else:
                    row_content.append('')
                
                foto_row_table = Table([row_content], colWidths=[8.7*cm, 8.7*cm])
                foto_row_table.setStyle(TableStyle([
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('BOX', (0, 0), (0, 0), 0.5, colors.HexColor('#e5e7eb')),
                    ('BOX', (1, 0), (1, 0), 0.5, colors.HexColor('#e5e7eb')),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ]))
                foto_content.append(foto_row_table)
                foto_content.append(Spacer(1, 0.1*cm))
            
            foto_section = create_section_box(foto_content, "FOTOGRAFIAS")
            add_section_to_elements(elements, foto_section)
            elements.append(Spacer(1, 0.3*cm))
    
    # ========== LEGENDA ==========
    
    legenda_content = []
    
    legenda_data = [
        ['Tipo de Registo', 'Código Horário'],
        ['T = Trabalho', '1 = Dias úteis (07h-19h)'],
        ['V = Viagem/Deslocação', '2 = Dias úteis (19h-07h)'],
        ['O = Oficina', 'S = Sábado'],
        ['', 'D = Domingos/Feriados'],
    ]
    
    legenda_table = Table(legenda_data, colWidths=[6*cm, 8*cm])
    legenda_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f4f6')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    legenda_content.append(legenda_table)
    
    nota_style = ParagraphStyle(
        'NotaStyle',
        parent=normal_style,
        fontSize=7,
        textColor=colors.HexColor('#6b7280'),
        fontName='Helvetica-Oblique'
    )
    legenda_content.append(Spacer(1, 0.1*cm))
    legenda_content.append(Paragraph("Nota: Aos quilómetros de ida já contabilizados, serão adicionados os quilómetros de volta após assinatura deste relatório.", nota_style))
    
    legenda_section = create_section_box(legenda_content, "LEGENDA")
    add_section_to_elements(elements, legenda_section)
    
    # ========== RODAPÉ ==========
    
    elements.append(Spacer(1, 0.3*cm))
    footer_style = ParagraphStyle(
        'FooterStyle',
        parent=normal_style,
        fontSize=8,
        textColor=colors.HexColor('#9ca3af'),
        alignment=TA_CENTER
    )
    elements.append(Paragraph(f"Documento gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')}", footer_style))
    
    # Construir PDF
    doc.build(elements)
    buffer.seek(0)
    return buffer
