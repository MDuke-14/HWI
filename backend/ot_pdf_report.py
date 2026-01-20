from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage, PageBreak, KeepTogether, KeepInFrame
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from io import BytesIO
from datetime import datetime
from pathlib import Path

def generate_ot_pdf(relatorio, cliente, intervencoes, tecnicos, fotografias, assinaturas, equipamentos_adicionais=None, materiais=None, registos_mao_obra=None):
    """
    Gera PDF completo de uma Ordem de Trabalho com espaçamento mínimo
    assinaturas: pode ser uma lista de assinaturas ou uma única assinatura (compatibilidade)
    """
    buffer = BytesIO()
    # Margens reduzidas - allowSplitting=False para evitar divisão de elementos
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
    
    # Cliente - KeepTogether
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
    
    # Motivo da Assistência - KeepTogether
    motivo_section = []
    motivo_section.append(Paragraph("MOTIVO DA ASSISTÊNCIA", heading_style))
    motivo_text = relatorio.get('motivo_assistencia', 'N/A')
    motivo_section.append(Paragraph(motivo_text, normal_style))
    motivo_section.append(Spacer(1, 0.2*cm))
    elements.append(KeepTogether(motivo_section))
    
    # Equipamentos - KeepTogether
    equip_section = []
    equip_section.append(Paragraph("EQUIPAMENTOS", heading_style))
    
    # Criar lista de todos os equipamentos
    todos_equipamentos = []
    
    # Equipamento principal (se tiver dados)
    if relatorio.get('equipamento_tipologia') or relatorio.get('equipamento_marca') or relatorio.get('equipamento_modelo'):
        todos_equipamentos.append({
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
                'tipologia': equip.get('tipologia', ''),
                'marca': equip.get('marca', ''),
                'modelo': equip.get('modelo', ''),
                'numero_serie': equip.get('numero_serie', ''),
                'ano_fabrico': equip.get('ano_fabrico', '')
            })
    
    if todos_equipamentos:
        # Tabela com todos os equipamentos
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
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3b82f6')),
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
    
    equip_section.append(Spacer(1, 0.2*cm))
    elements.append(KeepTogether(equip_section))
    
    # Intervenções - KeepTogether
    if intervencoes:
        interv_section = []
        interv_section.append(Paragraph("INTERVENÇÕES", heading_style))
        for i, interv in enumerate(intervencoes, 1):
            data_interv = interv.get('data_intervencao')
            if isinstance(data_interv, str):
                try:
                    data_interv = datetime.fromisoformat(data_interv).strftime('%d/%m/%Y')
                except:
                    pass
            
            interv_section.append(Paragraph(f"<b>Intervenção #{i}</b> - {data_interv}", normal_style))
            
            # Equipamento relacionado (se existir)
            if interv.get('equipamento_id') and equipamentos_adicionais:
                equip_rel = next((e for e in equipamentos_adicionais if e.get('id') == interv.get('equipamento_id')), None)
                if equip_rel:
                    equip_desc = f"{equip_rel.get('tipologia', '')} - {equip_rel.get('marca', '')} {equip_rel.get('modelo', '')}"
                    interv_section.append(Paragraph(f"<b>Equipamento:</b> {equip_desc}", normal_style))
            
            interv_section.append(Paragraph(f"<b>Motivo:</b> {interv.get('motivo_assistencia', 'N/A')}", normal_style))
            
            if interv.get('relatorio_assistencia'):
                interv_section.append(Paragraph(f"<b>Relatório:</b> {interv.get('relatorio_assistencia')}", normal_style))
            
            if i < len(intervencoes):
                interv_section.append(Spacer(1, 0.15*cm))
        
        interv_section.append(Spacer(1, 0.2*cm))
        elements.append(KeepTogether(interv_section))
    
    # Técnicos / Mão de Obra - KeepTogether
    has_mao_obra = tecnicos or registos_mao_obra
    if has_mao_obra:
        mao_obra_section = []
        mao_obra_section.append(Paragraph("MÃO DE OBRA / DESLOCAÇÃO", heading_style))
        
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
        
        # Criar tabela unificada com todos os registos (incluindo KM)
        mao_obra_data = [['Técnico', 'Data', 'Horas', 'KM', 'Tipo', 'Cód']]
        
        # Combinar todos os registos e ordenar cronologicamente
        todos_registos = []
        
        # Adicionar registos manuais de técnicos (se existirem)
        if tecnicos:
            for tec in tecnicos:
                data_trab = tec.get('data_trabalho', '')
                todos_registos.append({
                    'tecnico_nome': tec.get('tecnico_nome', 'N/A'),
                    'data': data_trab,
                    'minutos': tec.get('minutos_cliente', 0),
                    'km': tec.get('kms_deslocacao', 0) or (max(0, (tec.get('kms_final', 0) or 0) - (tec.get('kms_inicial', 0) or 0))),
                    'tipo': tec.get('tipo_registo', 'manual'),
                    'codigo': codigos.get(tec.get('tipo_horario', ''), '-'),
                    'source': 'tecnico'
                })
        
        # Adicionar registos de cronómetros
        if registos_mao_obra:
            for reg in registos_mao_obra:
                minutos_total = reg.get('minutos_trabalhados') or int((reg.get('horas_arredondadas', 0) or 0) * 60)
                todos_registos.append({
                    'tecnico_nome': reg.get('tecnico_nome', 'N/A'),
                    'data': reg.get('data', ''),
                    'minutos': minutos_total,
                    'km': reg.get('km', 0) or 0,
                    'tipo': reg.get('tipo', '-'),
                    'codigo': reg.get('codigo', '-'),
                    'source': 'cronometro'
                })
        
        # Ordenar cronologicamente
        todos_registos.sort(key=lambda x: x.get('data', '') or '')
        
        # Preencher tabela
        for reg in todos_registos:
            data_reg = reg.get('data', '')
            if isinstance(data_reg, str) and data_reg:
                try:
                    data_reg = datetime.fromisoformat(data_reg).strftime('%d/%m/%Y')
                except:
                    pass
            
            # Converter minutos para formato hh:mm
            minutos_total = reg.get('minutos', 0)
            horas = minutos_total // 60
            mins = minutos_total % 60
            tempo_formatado = f"{horas}h {mins}min"
            
            # KM formatado
            km_value = reg.get('km', 0)
            km_formatado = f"{km_value} km" if km_value else "-"
            
            mao_obra_data.append([
                reg.get('tecnico_nome', 'N/A'),
                data_reg or 'N/A',
                tempo_formatado,
                km_formatado,
                tipos_label.get(reg.get('tipo', ''), reg.get('tipo', '-')),
                reg.get('codigo', '-')
            ])
        
        mao_obra_table = Table(mao_obra_data, colWidths=[4.5*cm, 2.5*cm, 2.5*cm, 2*cm, 2*cm, 1.5*cm])
        mao_obra_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#8b5cf6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        mao_obra_section.append(mao_obra_table)
        mao_obra_section.append(Spacer(1, 0.1*cm))
        
        # Legenda de códigos
        legenda_style = ParagraphStyle(
            'LegendaStyle',
            parent=normal_style,
            fontSize=7,
            textColor=colors.HexColor('#6b7280')
        )
        mao_obra_section.append(Paragraph("<b>Legenda:</b> 1 = Dias úteis (07h-19h) | 2 = Dias úteis (19h-07h) | S = Sábado | D = Domingos/Feriados", legenda_style))
        
        # Nota sobre Kms
        nota_kms_style = ParagraphStyle(
            'NotaKmsStyle',
            parent=normal_style,
            fontSize=7,
            textColor=colors.HexColor('#3b82f6'),
            spaceBefore=4
        )
        mao_obra_section.append(Paragraph("<i>Aos kms de ida já adicionados iremos adicionar os kms de volta após assinatura deste relatório.</i>", nota_kms_style))
        mao_obra_section.append(Spacer(1, 0.2*cm))
        elements.append(KeepTogether(mao_obra_section))
    
    # Materiais - KeepTogether
    if materiais:
        mat_section = []
        mat_section.append(Paragraph("MATERIAIS", heading_style))
        
        mat_data = [['#', 'Descrição', 'Qtd', 'Fornecido Por']]
        
        for idx, mat in enumerate(materiais, 1):
            mat_data.append([
                str(idx),
                mat.get('descricao', 'N/A'),
                str(mat.get('quantidade', 0)),
                mat.get('fornecido_por', '-') or '-'
            ])
        
        mat_table = Table(mat_data, colWidths=[1*cm, 10*cm, 2*cm, 5*cm])
        mat_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f59e0b')),
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
        mat_section.append(mat_table)
        mat_section.append(Spacer(1, 0.2*cm))
        elements.append(KeepTogether(mat_section))
    
    # Diagnóstico / Ações / Resolução - se existirem
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
    
    # Fotografias (2 por linha, layout compacto) - cada par KeepTogether
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
            foto_pair = []
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
            
            foto_pair.append(foto_table)
            if i + 2 < len(fotografias):
                foto_pair.append(Spacer(1, 0.15*cm))
            
            elements.append(KeepTogether(foto_pair))
        
        elements.append(Spacer(1, 0.2*cm))
    
    # Assinaturas - Suporta múltiplas
    # Converter para lista se for uma única assinatura (compatibilidade)
    if assinaturas:
        if isinstance(assinaturas, dict):
            assinaturas_list = [assinaturas]
        else:
            assinaturas_list = assinaturas if assinaturas else []
        
        if assinaturas_list:
            assin_section = []
            assin_section.append(Spacer(1, 0.3*cm))
            assin_section.append(Paragraph("ASSINATURAS DO CLIENTE", heading_style))
            assin_section.append(Paragraph("Declaro que aceito os trabalhos acima descritos e que tudo foi efetuado de acordo com a folha de assistência.", normal_style))
            assin_section.append(Spacer(1, 0.2*cm))
            
            for idx, assinatura in enumerate(assinaturas_list, 1):
                if len(assinaturas_list) > 1:
                    assin_section.append(Paragraph(f"<b>Assinatura {idx}</b>", normal_style))
                
                # Data da intervenção (editável)
                data_intervencao = assinatura.get('data_intervencao')
                if data_intervencao:
                    assin_section.append(Paragraph(f"<b>Data da Intervenção:</b> {data_intervencao}", normal_style))
                
                if assinatura.get('tipo') == 'digital' and assinatura.get('assinatura_path'):
                    # Incluir imagem da assinatura
                    img_path = Path(assinatura['assinatura_path'])
                    if img_path.exists():
                        try:
                            img = RLImage(str(img_path), width=6*cm, height=3*cm, kind='proportional')
                            assin_section.append(img)
                        except:
                            pass
                
                nome_completo = assinatura.get('assinado_por') or f"{assinatura.get('primeiro_nome', '')} {assinatura.get('ultimo_nome', '')}"
                assin_section.append(Paragraph(f"<b>Nome:</b> {nome_completo}", normal_style))
                
                data_assinatura = assinatura.get('data_assinatura')
                if isinstance(data_assinatura, str):
                    try:
                        data_assinatura = datetime.fromisoformat(data_assinatura).strftime('%d/%m/%Y %H:%M')
                    except:
                        pass
                assin_section.append(Paragraph(f"<b>Data de Assinatura:</b> {data_assinatura}", normal_style))
                
                if idx < len(assinaturas_list):
                    assin_section.append(Spacer(1, 0.3*cm))
            
            elements.append(KeepTogether(assin_section))
    
    # Construir PDF
    doc.build(elements)
    buffer.seek(0)
    return buffer
