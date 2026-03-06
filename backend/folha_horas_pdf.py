"""
Gerador de PDF para Folha de Horas
PDF em formato HORIZONTAL (landscape)
Gera uma folha individual por técnico (PDFs concatenados)
Tabela DESPESAS no final do documento
"""
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from io import BytesIO
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict


def format_time_hhmm(dt):
    if not dt:
        return '-'
    if isinstance(dt, str):
        if len(dt) == 5 and ':' in dt:
            return dt
        try:
            dt = datetime.fromisoformat(dt.replace('Z', '+00:00'))
        except:
            return dt if dt else '-'
    return dt.strftime('%H:%M') if dt else '-'


def get_weekday_pt(date_obj):
    weekdays = {0: 'Segunda', 1: 'Terça', 2: 'Quarta', 3: 'Quinta', 4: 'Sexta', 5: 'Sábado', 6: 'Domingo'}
    if isinstance(date_obj, str):
        try:
            date_obj = datetime.fromisoformat(date_obj).date()
        except:
            return '-'
    return weekdays.get(date_obj.weekday(), '-')


def format_date_pt(date_obj):
    if isinstance(date_obj, str):
        try:
            date_obj = datetime.fromisoformat(date_obj).date()
        except:
            return date_obj
    return date_obj.strftime('%d/%m/%Y') if date_obj else '-'


def minutes_to_hhmm(minutes):
    if not minutes:
        return '0:00'
    hours = int(minutes) // 60
    mins = int(minutes) % 60
    return f'{hours}:{mins:02d}'


def generate_folha_horas_pdf(
    relatorio,
    cliente,
    registos_mao_obra,
    tecnicos_manuais,
    tarifas_por_tecnico,
    dados_extras,
    tarifas_por_codigo=None,
    valor_km=0.65,
    tarifas_detalhadas=None,
    despesas_ajustadas=None,
    valor_dieta_default=0
):
    if tarifas_por_codigo is None:
        tarifas_por_codigo = {}
    if tarifas_detalhadas is None:
        tarifas_detalhadas = []
    if despesas_ajustadas is None:
        despesas_ajustadas = []
    
    def find_best_tariff(codigo, tipo_registo, funcao_ot, tarifas_det, tarifas_cod):
        tipo_registo_normalizado = 'trabalho' if tipo_registo == 'oficina' else tipo_registo
        best_match = None
        best_score = -1
        for t in tarifas_det:
            if t['codigo'] != codigo:
                continue
            score = 0
            if t.get('tipo_registo') and t['tipo_registo'] != tipo_registo_normalizado:
                continue
            if t.get('tipo_registo') == tipo_registo_normalizado:
                score += 2
            if t.get('tipo_colaborador') and t['tipo_colaborador'] != funcao_ot:
                continue
            if t.get('tipo_colaborador') == funcao_ot:
                score += 4
            if score > best_score:
                best_score = score
                best_match = t
        if best_match:
            return best_match['valor_por_hora']
        return tarifas_cod.get(codigo, 0)
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(A4),
        topMargin=0.8*cm, bottomMargin=0.8*cm,
        leftMargin=0.8*cm, rightMargin=0.8*cm
    )
    elements = []
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle', parent=styles['Heading1'],
        fontSize=14, textColor=colors.HexColor('#1e40af'),
        spaceAfter=4, spaceBefore=0, alignment=TA_CENTER, fontName='Helvetica-Bold'
    )
    heading_style = ParagraphStyle(
        'CustomHeading', parent=styles['Heading2'],
        fontSize=10, textColor=colors.HexColor('#1e40af'),
        spaceAfter=4, spaceBefore=4, fontName='Helvetica-Bold'
    )
    tecnico_heading_style = ParagraphStyle(
        'TecnicoHeading', parent=styles['Heading2'],
        fontSize=12, textColor=colors.HexColor('#059669'),
        spaceAfter=6, spaceBefore=4, fontName='Helvetica-Bold'
    )
    normal_style = ParagraphStyle(
        'CustomNormal', parent=styles['Normal'],
        fontSize=8, spaceAfter=2, spaceBefore=0
    )
    small_style = ParagraphStyle(
        'SmallStyle', parent=styles['Normal'],
        fontSize=7, spaceAfter=1, spaceBefore=0
    )
    legend_title_style = ParagraphStyle(
        'LegendTitle', parent=styles['Heading3'],
        fontSize=9, textColor=colors.HexColor('#7c3aed'),
        spaceAfter=4, spaceBefore=8, fontName='Helvetica-Bold'
    )
    legend_item_style = ParagraphStyle(
        'LegendItem', parent=styles['Normal'],
        fontSize=8, spaceAfter=2, spaceBefore=0, leftIndent=10
    )
    despesas_title_style = ParagraphStyle(
        'DespesasTitle', parent=styles['Heading3'],
        fontSize=11, textColor=colors.HexColor('#b45309'),
        spaceAfter=6, spaceBefore=10, fontName='Helvetica-Bold'
    )
    
    logo_path = Path(__file__).parent / "assets" / "hwi_logo.png"
    PRECO_KM = valor_km
    
    tipo_despesa_labels = {
        'combustivel': 'Combustível', 'ferramentas': 'Ferramentas',
        'portagens': 'Portagens', 'outras': 'Outras'
    }
    
    # ==========================================
    # PASSO 1: Organizar dados por técnico
    # ==========================================
    dados_por_tecnico = defaultdict(lambda: {'nome': 'N/A', 'registos': []})
    
    for reg in registos_mao_obra:
        tecnico_id = reg.get('tecnico_id', 'unknown')
        tecnico_nome = reg.get('tecnico_nome', 'N/A')
        data = reg.get('data', '')
        if isinstance(data, str) and 'T' in data:
            data = data.split('T')[0]
        codigo = reg.get('codigo', '-')
        
        dados_por_tecnico[tecnico_id]['nome'] = tecnico_nome
        dados_por_tecnico[tecnico_id]['registos'].append({
            'tipo': 'cronometro',
            'tipo_registo': reg.get('tipo', 'trabalho'),
            'funcao_ot': reg.get('funcao_ot', 'tecnico'),
            'hora_inicio': reg.get('hora_inicio_segmento'),
            'hora_fim': reg.get('hora_fim_segmento'),
            'minutos': int((reg.get('horas_arredondadas', 0) or 0) * 60),
            'km': reg.get('km', 0),
            'codigo': codigo,
            'data': data,
            'registo_id': reg.get('id', ''),
            'tarifa_key': f"{tecnico_id}_{data}_{codigo}",
            'incluir_pausa': reg.get('incluir_pausa', False),
            'observacoes': reg.get('observacoes', '')
        })
    
    for tec in tecnicos_manuais:
        tecnico_id = tec.get('tecnico_id') or ''
        tecnico_nome = tec.get('tecnico_nome', 'N/A')
        if not tecnico_id:
            tecnico_id = f"nome_{tecnico_nome}"
        data = tec.get('data_trabalho', '')
        if isinstance(data, str) and 'T' in data:
            data = data.split('T')[0]
        
        codigo = {
            'diurno': '1', 'noturno': '2', 'sabado': 'S', 'domingo_feriado': 'D'
        }.get(tec.get('tipo_horario', ''), '-')
        
        original_id = tec.get('id', tecnico_id)
        dados_por_tecnico[tecnico_id]['nome'] = tecnico_nome
        dados_por_tecnico[tecnico_id]['registos'].append({
            'tipo': 'manual',
            'tipo_registo': tec.get('tipo_registo', 'manual'),
            'funcao_ot': tec.get('funcao_ot', 'tecnico'),
            'hora_inicio': tec.get('hora_inicio'),
            'hora_fim': tec.get('hora_fim'),
            'minutos': tec.get('minutos_cliente', 0),
            'km': tec.get('kms_deslocacao', 0),
            'codigo': codigo,
            'data': data,
            'registo_id': original_id,
            'tarifa_key': f"{original_id}_{data}_{codigo}",
            'tarifa_key_alt': f"{tecnico_id}_{data}_{codigo}",
            'incluir_pausa': tec.get('incluir_pausa', False),
        })
    
    # ==========================================
    # PASSO 2: Gerar página para cada técnico
    # ==========================================
    tecnicos_list = list(dados_por_tecnico.items())
    grande_total_geral = 0  # Acumular total de todos os técnicos
    
    for idx_tecnico, (tecnico_id, tecnico_data) in enumerate(tecnicos_list):
        tecnico_nome = tecnico_data['nome']
        registos_tecnico = tecnico_data['registos']
        
        if not registos_tecnico:
            continue
        
        if idx_tecnico > 0:
            elements.append(PageBreak())
        
        # ---------- CABEÇALHO ----------
        if logo_path.exists():
            logo = RLImage(str(logo_path), width=4*cm, height=1.3*cm)
            elements.append(logo)
        
        elements.append(Paragraph("FOLHA DE HORAS", title_style))
        elements.append(Paragraph(f"OT #{relatorio.get('numero_assistencia', 'N/A')}", heading_style))
        elements.append(Spacer(1, 0.2*cm))
        elements.append(Paragraph(f"<b>Cliente:</b> {cliente.get('nome', 'N/A')}", normal_style))
        elements.append(Paragraph(f"<b>Localização:</b> {relatorio.get('local_intervencao', 'N/A')}", normal_style))
        elements.append(Spacer(1, 0.2*cm))
        elements.append(Paragraph(f"<b>Técnico:</b> {tecnico_nome}", tecnico_heading_style))
        elements.append(Spacer(1, 0.3*cm))
        
        # ---------- AGRUPAR REGISTOS ----------
        registos_ordenados = []
        for reg in registos_tecnico:
            registos_ordenados.append({
                'data': reg['data'],
                'codigo': reg['codigo'],
                'tipo_registo': reg.get('tipo_registo', 'trabalho'),
                'funcao_ot': reg.get('funcao_ot', 'tecnico'),
                'registos': [reg],
                '_hora_inicio_min': reg.get('hora_inicio') or 'zzz'
            })
        registos_ordenados.sort(key=lambda x: (x['data'], x['_hora_inicio_min']))
        
        # ---------- PRÉ-CALCULAR HORAS TOTAIS POR DIA (para regra de dieta) ----------
        minutos_por_dia = defaultdict(int)
        for item in registos_ordenados:
            minutos_por_dia[item['data']] += sum(r.get('minutos', 0) for r in item['registos'])
        
        # ---------- TABELA PRINCIPAL ----------
        header = [
            'Data', 'Dia', 'Função', 'Registo', 'Horas',
            'Tarifa', 'Total Valor', "Km's", 'Preço/Km', 'Total Km',
            'Início', 'Pausa', 'Fim', 'Dieta', 'Obs.'
        ]
        
        table_data = [header]
        total_geral_valor = 0
        total_geral_km_valor = 0
        total_geral_dietas = 0
        
        totais_por_tarifa_tipo = defaultdict(lambda: {'minutos': 0, 'tipo_label': '', 'codigo_label': ''})
        dietas_aplicadas = set()
        
        for item in registos_ordenados:
            data = item['data']
            codigo = item['codigo']
            tipo_registo_grupo = item['tipo_registo']
            funcao_ot_grupo = item.get('funcao_ot', 'tecnico')
            registos = item['registos']
            
            tarifa_key = registos[0].get('tarifa_key', '')
            total_minutos = sum(r.get('minutos', 0) for r in registos)
            total_km = sum(r.get('km', 0) for r in registos)
            
            # Tarifa
            tarifa_valor = 0
            if tarifas_detalhadas:
                tarifa_valor = find_best_tariff(codigo, tipo_registo_grupo, funcao_ot_grupo, tarifas_detalhadas, tarifas_por_codigo)
            if tarifa_valor == 0:
                chave_tarifa_tipo = f"{tecnico_id}_{data}_{codigo}_{tipo_registo_grupo}"
                tarifa_valor = tarifas_por_tecnico.get(chave_tarifa_tipo, 0)
            if tarifa_valor == 0 and tarifa_key:
                tarifa_valor = tarifas_por_tecnico.get(tarifa_key, 0)
            if tarifa_valor == 0:
                for r in registos:
                    alt_key = r.get('tarifa_key_alt')
                    if alt_key:
                        tarifa_valor = tarifas_por_tecnico.get(f"{alt_key}_{tipo_registo_grupo}", 0) or tarifas_por_tecnico.get(alt_key, 0)
                        if tarifa_valor:
                            break
            if tarifa_valor == 0:
                tarifa_valor = tarifas_por_tecnico.get(f"{tecnico_id}_{data}_{codigo}", 0)
            if tarifa_valor == 0:
                tarifa_valor = tarifas_por_tecnico.get(f"{tecnico_id}_{data}", 0)
            if tarifa_valor == 0:
                tarifa_valor = tarifas_por_tecnico.get(tecnico_id, 0)
            if tarifa_valor == 0 and codigo:
                tarifa_valor = tarifas_por_codigo.get(codigo, 0)
            
            total_valor = (total_minutos / 60) * tarifa_valor
            total_geral_valor += total_valor
            
            total_km_valor = total_km * PRECO_KM
            total_geral_km_valor += total_km_valor
            
            # Dieta - calculada com base no total de horas do dia
            # Regra: ≤4h = 0€, 4h-6h = 50%, >6h = 100%
            chave_extras_id = f"{tecnico_id}_{data}"
            chave_extras_nome = f"{tecnico_nome}_{data}"
            extras = dados_extras.get(chave_extras_id, {}) or dados_extras.get(chave_extras_nome, {})
            
            if chave_extras_id in dietas_aplicadas or chave_extras_nome in dietas_aplicadas:
                dieta = 0
            else:
                # Obter valor base da dieta (do admin ou da tabela de preço)
                dieta_base = float(extras.get('dieta', 0) or 0)
                if dieta_base == 0 and valor_dieta_default > 0:
                    dieta_base = valor_dieta_default
                
                # Aplicar regra de horas do dia
                horas_dia = minutos_por_dia.get(data, 0) / 60
                if dieta_base > 0:
                    if horas_dia <= 4:
                        dieta = 0
                    elif horas_dia <= 6:
                        dieta = dieta_base * 0.5
                    else:
                        dieta = dieta_base
                else:
                    dieta = 0
                
                if dieta > 0:
                    dietas_aplicadas.add(chave_extras_id)
                    dietas_aplicadas.add(chave_extras_nome)
            total_geral_dietas += dieta
            
            # Pausa (1h almoço)
            tem_pausa = any(r.get('incluir_pausa', False) for r in registos)
            pausa_str = '1:00' if tem_pausa else '-'
            
            # Início e Fim
            registos_ord_hora = sorted(registos, key=lambda r: r.get('hora_inicio') or '')
            primeiro_inicio = registos_ord_hora[0].get('hora_inicio') if registos_ord_hora else None
            ultimo_fim = registos_ord_hora[-1].get('hora_fim') if registos_ord_hora else None
            
            tipo_map = {'trabalho': 'Trabalho', 'viagem': 'Viagem', 'manual': 'Manual', 'oficina': 'Oficina'}
            tipo_registo = tipo_map.get(tipo_registo_grupo, tipo_registo_grupo)
            
            for reg in registos:
                tipo_r = reg.get('tipo_registo', 'trabalho')
                tipo_label = tipo_map.get(tipo_r, tipo_r)
                codigo_r = reg.get('codigo', '-')
                chave_legenda = f"{codigo_r}_{tipo_r}"
                totais_por_tarifa_tipo[chave_legenda]['minutos'] += reg.get('minutos', 0)
                totais_por_tarifa_tipo[chave_legenda]['tipo_label'] = tipo_label
                totais_por_tarifa_tipo[chave_legenda]['codigo_label'] = codigo_r
            
            try:
                date_obj = datetime.fromisoformat(data).date() if data else None
            except:
                date_obj = None
            
            funcao_label = 'Técnico' if funcao_ot_grupo == 'tecnico' else 'Ajudante'
            
            obs_text = ''
            for reg in registos:
                if reg.get('observacoes'):
                    obs_text = reg['observacoes']
                    break
            
            row = [
                format_date_pt(date_obj),
                get_weekday_pt(date_obj),
                funcao_label,
                tipo_registo,
                minutes_to_hhmm(total_minutos),
                f'{codigo} - {tarifa_valor:.2f}€/h' if tarifa_valor else f'{codigo} - -',
                f'{total_valor:.2f}€',
                f'{total_km:.1f}',
                f'{PRECO_KM:.2f}€',
                f'{total_km_valor:.2f}€',
                format_time_hhmm(primeiro_inicio),
                pausa_str,
                format_time_hhmm(ultimo_fim),
                f'{dieta:.2f}€' if dieta > 0 else '-',
                obs_text
            ]
            table_data.append(row)
        
        subtotal_tecnico = total_geral_valor + total_geral_km_valor + total_geral_dietas
        grande_total_geral += subtotal_tecnico
        
        # Linha de totais
        table_data.append([
            '', 'TOTAIS:', '', '', '', '',
            f'{total_geral_valor:.2f}€',
            '', '',
            f'{total_geral_km_valor:.2f}€',
            '', '', '',
            f'{total_geral_dietas:.2f}€',
            ''
        ])
        
        col_widths = [
            1.8*cm, 1.8*cm, 1.7*cm, 1.6*cm, 1.4*cm,
            2.0*cm, 1.6*cm, 1.2*cm, 1.4*cm, 1.5*cm,
            1.3*cm, 1.2*cm, 1.3*cm, 1.4*cm, 2.6*cm,
        ]
        
        table = Table(table_data, colWidths=col_widths)
        style = TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6b7280')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 7),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTSIZE', (0, 1), (-1, -1), 7),
            ('ALIGN', (0, 1), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -2), 0.5, colors.grey),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#e5e7eb')),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 2),
            ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ])
        table.setStyle(style)
        elements.append(table)
        elements.append(Spacer(1, 0.4*cm))
        
        # ---------- LEGENDA ----------
        elements.append(Paragraph("RESUMO DE HORAS POR CÓDIGO E TIPO", legend_title_style))
        
        codigo_ordem = {'1': 0, '2': 1, 'S': 2, 'D': 3}
        legenda_ordenada = sorted(
            totais_por_tarifa_tipo.items(),
            key=lambda x: (codigo_ordem.get(x[1]['codigo_label'], 99), x[1]['tipo_label'])
        )
        
        codigo_descricao = {
            '1': 'Diurno (07h-19h)', '2': 'Noturno (19h-07h)',
            'S': 'Sábado', 'D': 'Domingo/Feriado'
        }
        
        for chave, dados in legenda_ordenada:
            if dados['minutos'] > 0:
                codigo = dados['codigo_label']
                tipo = dados['tipo_label']
                horas_str = minutes_to_hhmm(dados['minutos'])
                desc = codigo_descricao.get(codigo, '')
                texto = f"<b>Código {codigo}</b> – {tipo}: <b>{horas_str}</b> total"
                if desc:
                    texto += f" <font color='#6b7280' size='7'>({desc})</font>"
                elements.append(Paragraph(texto, legend_item_style))
        
        elements.append(Spacer(1, 0.3*cm))
        elements.append(Paragraph(
            "<b>Legenda:</b> 1 = 07h-19h (dias úteis) | 2 = 19h-07h (noturno) | S = Sábado | D = Domingo/Feriado",
            small_style
        ))
        elements.append(Paragraph(
            f"Documento gerado em {datetime.now().strftime('%d/%m/%Y às %H:%M')}",
            small_style
        ))
    
    # ==========================================
    # PASSO 3: TABELA DESPESAS (última página)
    # ==========================================
    if despesas_ajustadas:
        elements.append(PageBreak())
        
        if logo_path.exists():
            logo = RLImage(str(logo_path), width=4*cm, height=1.3*cm)
            elements.append(logo)
        
        elements.append(Paragraph("FOLHA DE HORAS – DESPESAS", title_style))
        elements.append(Paragraph(f"OT #{relatorio.get('numero_assistencia', 'N/A')}", heading_style))
        elements.append(Spacer(1, 0.2*cm))
        elements.append(Paragraph(f"<b>Cliente:</b> {cliente.get('nome', 'N/A')}", normal_style))
        elements.append(Spacer(1, 0.4*cm))
        
        # Ordenar despesas por data e técnico
        despesas_sorted = sorted(despesas_ajustadas, key=lambda d: (d.get('data', ''), d.get('tecnico_nome', '')))
        
        desp_header = ['Técnico', 'Tipo de Despesa', 'Valor', 'Data', 'Descrição']
        desp_table_data = [desp_header]
        total_despesas = 0
        
        for desp in despesas_sorted:
            tipo_label = tipo_despesa_labels.get(desp.get('tipo', 'outras'), desp.get('tipo', 'Outras'))
            valor = desp.get('valor_ajustado', desp.get('valor', 0)) or 0
            total_despesas += valor
            
            data_desp = desp.get('data', '')
            try:
                date_obj_d = datetime.fromisoformat(data_desp).date() if data_desp else None
                data_formatada = format_date_pt(date_obj_d)
            except:
                data_formatada = data_desp
            
            descricao = desp.get('descricao', '') or ''
            if len(descricao) > 80:
                descricao = descricao[:77] + '...'
            
            desp_table_data.append([
                desp.get('tecnico_nome', 'N/A'),
                tipo_label,
                f'{valor:.2f}€',
                data_formatada,
                descricao
            ])
        
        desp_table_data.append([
            '', 'TOTAL DESPESAS:', f'{total_despesas:.2f}€', '', ''
        ])
        
        desp_col_widths = [4.0*cm, 3.5*cm, 2.5*cm, 2.5*cm, 11.3*cm]
        desp_table = Table(desp_table_data, colWidths=desp_col_widths)
        desp_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#92400e')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTSIZE', (0, 1), (-1, -1), 7),
            ('ALIGN', (0, 1), (0, -1), 'LEFT'),
            ('ALIGN', (1, 1), (1, -1), 'LEFT'),
            ('ALIGN', (2, 1), (2, -1), 'CENTER'),
            ('ALIGN', (3, 1), (3, -1), 'CENTER'),
            ('ALIGN', (4, 1), (4, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -2), 0.5, colors.grey),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#fef3c7')),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0, -1), (-1, -1), colors.HexColor('#92400e')),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(desp_table)
        
        # TOTAL GERAL (Horas + Despesas)
        elements.append(Spacer(1, 0.5*cm))
        grande_total_geral += total_despesas
        
        gt_data = [
            ['Subtotal Horas:', f'{grande_total_geral - total_despesas:.2f}€',
             'Subtotal Despesas:', f'{total_despesas:.2f}€',
             'TOTAL GERAL:', f'{grande_total_geral:.2f}€']
        ]
        gt_widths = [3.0*cm, 2.5*cm, 3.5*cm, 2.5*cm, 3.0*cm, 2.5*cm]
        gt_table = Table(gt_data, colWidths=gt_widths)
        gt_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('BACKGROUND', (4, 0), (5, 0), colors.HexColor('#fef3c7')),
            ('TEXTCOLOR', (4, 0), (5, 0), colors.HexColor('#92400e')),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.grey),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        elements.append(gt_table)
        
        elements.append(Spacer(1, 0.3*cm))
        elements.append(Paragraph(
            f"Documento gerado em {datetime.now().strftime('%d/%m/%Y às %H:%M')}",
            small_style
        ))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer
