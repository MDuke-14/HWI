"""
Gerador de PDF para Folha de Horas
PDF em formato HORIZONTAL (landscape)
Gera uma folha individual por técnico (PDFs concatenados)
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
    """Formata datetime para HH:MM"""
    if not dt:
        return '-'
    
    if isinstance(dt, str):
        # Se já é HH:MM, retornar diretamente
        if len(dt) == 5 and ':' in dt:
            return dt
        try:
            dt = datetime.fromisoformat(dt.replace('Z', '+00:00'))
        except:
            return dt if dt else '-'
    
    return dt.strftime('%H:%M') if dt else '-'


def get_weekday_pt(date_obj):
    """Retorna o dia da semana em português"""
    weekdays = {
        0: 'Segunda-feira',
        1: 'Terça-feira',
        2: 'Quarta-feira',
        3: 'Quinta-feira',
        4: 'Sexta-feira',
        5: 'Sábado',
        6: 'Domingo'
    }
    if isinstance(date_obj, str):
        try:
            date_obj = datetime.fromisoformat(date_obj).date()
        except:
            return '-'
    return weekdays.get(date_obj.weekday(), '-')


def format_date_pt(date_obj):
    """Formata data para dd/mm/yyyy"""
    if isinstance(date_obj, str):
        try:
            date_obj = datetime.fromisoformat(date_obj).date()
        except:
            return date_obj
    return date_obj.strftime('%d/%m/%Y') if date_obj else '-'


def minutes_to_hhmm(minutes):
    """Converte minutos para formato HH:MM"""
    if not minutes:
        return '0:00'
    hours = int(minutes) // 60
    mins = int(minutes) % 60
    return f'{hours}:{mins:02d}'


def calculate_pause_time(registos_dia):
    """
    Calcula o tempo de pausa entre registos do mesmo dia
    Pausa = início do 2º registo - fim do 1º registo
    """
    if len(registos_dia) < 2:
        return 0
    
    # Ordenar por hora de início
    registos_ordenados = sorted(registos_dia, key=lambda r: r.get('hora_inicio_segmento', ''))
    
    total_pausa_minutos = 0
    for i in range(1, len(registos_ordenados)):
        fim_anterior = registos_ordenados[i-1].get('hora_fim_segmento')
        inicio_atual = registos_ordenados[i].get('hora_inicio_segmento')
        
        if fim_anterior and inicio_atual:
            try:
                if isinstance(fim_anterior, str):
                    fim_anterior = datetime.fromisoformat(fim_anterior.replace('Z', '+00:00'))
                if isinstance(inicio_atual, str):
                    inicio_atual = datetime.fromisoformat(inicio_atual.replace('Z', '+00:00'))
                
                diff = (inicio_atual - fim_anterior).total_seconds() / 60
                if diff > 0:
                    total_pausa_minutos += diff
            except:
                pass
    
    return total_pausa_minutos


def generate_folha_horas_pdf(
    relatorio,
    cliente,
    registos_mao_obra,
    tecnicos_manuais,
    tarifas_por_tecnico,  # dict: {tecnico_id: tarifa_valor} ou {tecnico_id_data_codigo: valor}
    dados_extras,  # dict: {tecnico_id_data: {dieta, portagens, despesas}}
    tarifas_por_codigo=None,  # dict: {"1": valor, "2": valor, "S": valor, "D": valor}
    valor_km=0.65,  # Valor por km da tabela de preço selecionada
    tarifas_detalhadas=None  # list: [{codigo, tipo_registo, tipo_colaborador, valor_por_hora}]
):
    """
    Gera PDF da Folha de Horas em formato horizontal (landscape)
    CADA TÉCNICO TEM SUA PRÓPRIA FOLHA (PDFs concatenados)
    
    Args:
        relatorio: dados da OT
        cliente: dados do cliente
        registos_mao_obra: registos de cronómetros (db.registos_tecnico_ot)
        tecnicos_manuais: registos manuais (db.tecnicos_relatorio)
        tarifas_por_tecnico: {tecnico_id: valor_hora} ou com chave composta
        dados_extras: {f"{tecnico_id}_{data}": {"dieta": X, "portagens": Y, "despesas": Z}}
        tarifas_por_codigo: {codigo: valor_hora} para aplicação automática
        valor_km: valor por quilómetro da tabela de preço selecionada
    """
    # Inicializar tarifas por código se não fornecido
    if tarifas_por_codigo is None:
        tarifas_por_codigo = {}
    if tarifas_detalhadas is None:
        tarifas_detalhadas = []
    
    def find_best_tariff(codigo, tipo_registo, funcao_ot, tarifas_detalhadas, tarifas_por_codigo):
        """Find the best matching tariff considering tipo_colaborador."""
        # Oficina usa a mesma tarifa que trabalho
        tipo_registo_normalizado = 'trabalho' if tipo_registo == 'oficina' else tipo_registo
        
        best_match = None
        best_score = -1
        
        for t in tarifas_detalhadas:
            if t['codigo'] != codigo:
                continue
            score = 0
            # Match tipo_registo
            if t.get('tipo_registo') and t['tipo_registo'] != tipo_registo_normalizado:
                continue
            if t.get('tipo_registo') == tipo_registo_normalizado:
                score += 2
            # Match tipo_colaborador
            if t.get('tipo_colaborador') and t['tipo_colaborador'] != funcao_ot:
                continue
            if t.get('tipo_colaborador') == funcao_ot:
                score += 4
            
            if score > best_score:
                best_score = score
                best_match = t
        
        if best_match:
            return best_match['valor_por_hora']
        return tarifas_por_codigo.get(codigo, 0)
    
    buffer = BytesIO()
    
    # PDF em formato horizontal (landscape)
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=landscape(A4), 
        topMargin=0.8*cm, 
        bottomMargin=0.8*cm, 
        leftMargin=0.8*cm, 
        rightMargin=0.8*cm
    )
    elements = []
    styles = getSampleStyleSheet()
    
    # Estilos customizados
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=14,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=4,
        spaceBefore=0,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=10,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=4,
        spaceBefore=4,
        fontName='Helvetica-Bold'
    )
    
    tecnico_heading_style = ParagraphStyle(
        'TecnicoHeading',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.HexColor('#059669'),
        spaceAfter=6,
        spaceBefore=4,
        fontName='Helvetica-Bold'
    )
    
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=8,
        spaceAfter=2,
        spaceBefore=0
    )
    
    small_style = ParagraphStyle(
        'SmallStyle',
        parent=styles['Normal'],
        fontSize=7,
        spaceAfter=1,
        spaceBefore=0
    )
    
    legend_title_style = ParagraphStyle(
        'LegendTitle',
        parent=styles['Heading3'],
        fontSize=9,
        textColor=colors.HexColor('#7c3aed'),
        spaceAfter=4,
        spaceBefore=8,
        fontName='Helvetica-Bold'
    )
    
    legend_item_style = ParagraphStyle(
        'LegendItem',
        parent=styles['Normal'],
        fontSize=8,
        spaceAfter=2,
        spaceBefore=0,
        leftIndent=10
    )
    
    # Logo path
    logo_path = Path(__file__).parent / "assets" / "hwi_logo.png"
    
    # Usar valor_km do parâmetro (da tabela de preço selecionada)
    PRECO_KM = valor_km
    
    # ==========================================
    # PASSO 1: Organizar dados por técnico
    # ==========================================
    # Estrutura: {tecnico_id: {nome, registos: [{data, codigo, tipo_registo, ...}]}}
    dados_por_tecnico = defaultdict(lambda: {'nome': 'N/A', 'registos': []})
    
    # Processar registos de cronómetros
    for reg in registos_mao_obra:
        tecnico_id = reg.get('tecnico_id', 'unknown')
        tecnico_nome = reg.get('tecnico_nome', 'N/A')
        registo_id = reg.get('id', '')
        data = reg.get('data', '')
        if isinstance(data, str) and 'T' in data:
            data = data.split('T')[0]
        codigo = reg.get('codigo', '-')
        tipo_registo = reg.get('tipo', 'trabalho')  # trabalho, viagem ou oficina
        
        dados_por_tecnico[tecnico_id]['nome'] = tecnico_nome
        dados_por_tecnico[tecnico_id]['registos'].append({
            'tipo': 'cronometro',
            'tipo_registo': tipo_registo,
            'funcao_ot': reg.get('funcao_ot', 'tecnico'),
            'hora_inicio': reg.get('hora_inicio_segmento'),
            'hora_fim': reg.get('hora_fim_segmento'),
            'minutos': int((reg.get('horas_arredondadas', 0) or 0) * 60),
            'km': reg.get('km', 0),
            'codigo': codigo,
            'data': data,
            'registo_id': registo_id,
            'tarifa_key': f"{tecnico_id}_{data}_{codigo}",
            'incluir_pausa': False,
            'observacoes': reg.get('observacoes', '')
        })
    
    # Processar registos manuais
    for tec in tecnicos_manuais:
        # Usar tecnico_id real, fallback para agrupamento por nome
        tecnico_id = tec.get('tecnico_id') or ''
        tecnico_nome = tec.get('tecnico_nome', 'N/A')
        # Se tecnico_id vazio, usar o nome como chave para agrupar corretamente
        if not tecnico_id:
            tecnico_id = f"nome_{tecnico_nome}"
        data = tec.get('data_trabalho', '')
        if isinstance(data, str) and 'T' in data:
            data = data.split('T')[0]
        
        hora_inicio_manual = tec.get('hora_inicio')
        hora_fim_manual = tec.get('hora_fim')
        tipo_registo_atual = tec.get('tipo_registo', 'manual')
        
        # Converter tipo_horario para código
        codigo = {
            'diurno': '1',
            'noturno': '2',
            'sabado': 'S',
            'domingo_feriado': 'D'
        }.get(tec.get('tipo_horario', ''), '-')
        
        dados_por_tecnico[tecnico_id]['nome'] = tecnico_nome
        # Guardar o id original do registo para lookup de tarifas
        original_id = tec.get('id', tecnico_id)
        dados_por_tecnico[tecnico_id]['registos'].append({
            'tipo': 'manual',
            'tipo_registo': tipo_registo_atual,
            'funcao_ot': tec.get('funcao_ot', 'tecnico'),
            'hora_inicio': hora_inicio_manual,
            'hora_fim': hora_fim_manual,
            'minutos': tec.get('minutos_cliente', 0),
            'km': tec.get('kms_deslocacao', 0),
            'codigo': codigo,
            'data': data,
            'registo_id': original_id,
            'tarifa_key': f"{original_id}_{data}_{codigo}",
            'tarifa_key_alt': f"{tecnico_id}_{data}_{codigo}",
            'incluir_pausa': tec.get('incluir_pausa', False)
        })
    
    # ==========================================
    # PASSO 2: Gerar PDF para cada técnico
    # ==========================================
    tecnicos_list = list(dados_por_tecnico.items())
    
    for idx_tecnico, (tecnico_id, tecnico_data) in enumerate(tecnicos_list):
        tecnico_nome = tecnico_data['nome']
        registos_tecnico = tecnico_data['registos']
        
        if not registos_tecnico:
            continue
        
        # Se não é o primeiro técnico, adicionar quebra de página
        if idx_tecnico > 0:
            elements.append(PageBreak())
        
        # ---------- CABEÇALHO ----------
        if logo_path.exists():
            logo = RLImage(str(logo_path), width=4*cm, height=1.3*cm)
            elements.append(logo)
        
        elements.append(Paragraph("FOLHA DE HORAS", title_style))
        elements.append(Paragraph(f"OT #{relatorio.get('numero_assistencia', 'N/A')}", heading_style))
        elements.append(Spacer(1, 0.2*cm))
        
        # Info do Cliente
        elements.append(Paragraph(f"<b>Cliente:</b> {cliente.get('nome', 'N/A')}", normal_style))
        elements.append(Paragraph(f"<b>Localização:</b> {relatorio.get('local_intervencao', 'N/A')}", normal_style))
        elements.append(Spacer(1, 0.2*cm))
        
        # Nome do Técnico (destaque)
        elements.append(Paragraph(f"<b>Técnico:</b> {tecnico_nome}", tecnico_heading_style))
        elements.append(Spacer(1, 0.3*cm))
        
        # ---------- AGRUPAR REGISTOS POR DATA/CÓDIGO/TIPO ----------
        # Estrutura: Cada registo individual fica na sua própria linha
        # Para não fundir registos do mesmo tipo/código que estão separados por outros registos
        registos_ordenados = []
        for reg in registos_tecnico:
            tipo_r = reg.get('tipo_registo', 'trabalho')
            funcao = reg.get('funcao_ot', 'tecnico')
            hora_inicio = reg.get('hora_inicio') or ''
            registos_ordenados.append({
                'data': reg['data'],
                'codigo': reg['codigo'],
                'tipo_registo': tipo_r,
                'funcao_ot': funcao,
                'registos': [reg],
                '_hora_inicio_min': hora_inicio
            })
        
        # Ordenar cronologicamente: data primeiro, depois hora de início
        registos_ordenados.sort(key=lambda x: (x['data'], x['_hora_inicio_min'] or 'zzz'))
        
        # ---------- TABELA (SEM COLUNA TÉCNICO) ----------
        header = [
            'Data',
            'Dia Semana',
            'Função',
            'Registo',
            'Horas',
            'Tarifa',
            'Total Valor',
            "Km's",
            'Preço/Km',
            'Total Km',
            'Início',
            'Pausa',
            'Fim',
            'Dieta',
            'Portagens',
            'Despesas',
            'Obs.'
        ]
        
        table_data = [header]
        total_geral_valor = 0
        total_geral_km_valor = 0
        total_geral_dietas = 0
        total_geral_portagens = 0
        total_geral_despesas = 0
        
        # Para legenda de totais por tarifa e tipo
        # Estrutura: {codigo_tipo: {'horas': X, 'tipo_label': Y, 'codigo_label': Z}}
        totais_por_tarifa_tipo = defaultdict(lambda: {'minutos': 0, 'tipo_label': '', 'codigo_label': ''})
        
        # REGRA DE DIETA: Apenas 1 dieta por técnico por dia
        dietas_aplicadas = set()
        
        for item in registos_ordenados:
            data = item['data']
            codigo = item['codigo']
            tipo_registo_grupo = item['tipo_registo']
            funcao_ot_grupo = item.get('funcao_ot', 'tecnico')
            registos = item['registos']
            
            tarifa_key = registos[0].get('tarifa_key', '')
            
            # Calcular totais para este grupo
            total_minutos = sum(r.get('minutos', 0) for r in registos)
            total_km = sum(r.get('km', 0) for r in registos)
            
            # Tarifa - tentar primeiro com tarifas_detalhadas (tipo_colaborador aware)
            tarifa_valor = 0
            if tarifas_detalhadas:
                tarifa_valor = find_best_tariff(codigo, tipo_registo_grupo, funcao_ot_grupo, tarifas_detalhadas, tarifas_por_codigo)
            
            # Fallback: usar chave composta com tipo: tecnico_data_codigo_tipo
            if tarifa_valor == 0:
                chave_tarifa_tipo = f"{tecnico_id}_{data}_{codigo}_{tipo_registo_grupo}"
                tarifa_valor = tarifas_por_tecnico.get(chave_tarifa_tipo, 0)
            
            if tarifa_valor == 0 and tarifa_key:
                tarifa_valor = tarifas_por_tecnico.get(tarifa_key, 0)
            
            # Tentar chave alternativa (id original do registo manual)
            if tarifa_valor == 0:
                for r in registos:
                    alt_key = r.get('tarifa_key_alt')
                    if alt_key:
                        tarifa_valor = tarifas_por_tecnico.get(f"{alt_key}_{tipo_registo_grupo}", 0) or tarifas_por_tecnico.get(alt_key, 0)
                        if tarifa_valor:
                            break
            
            if tarifa_valor == 0:
                chave_tarifa_completa = f"{tecnico_id}_{data}_{codigo}"
                tarifa_valor = tarifas_por_tecnico.get(chave_tarifa_completa, 0)
            
            if tarifa_valor == 0:
                chave_tarifa_data = f"{tecnico_id}_{data}"
                tarifa_valor = tarifas_por_tecnico.get(chave_tarifa_data, 0)
                
            if tarifa_valor == 0:
                tarifa_valor = tarifas_por_tecnico.get(tecnico_id, 0)
            
            if tarifa_valor == 0 and codigo:
                tarifa_valor = tarifas_por_codigo.get(codigo, 0)
            
            total_valor = (total_minutos / 60) * tarifa_valor
            total_geral_valor += total_valor
            
            # Km
            total_km_valor = total_km * PRECO_KM
            total_geral_km_valor += total_km_valor
            
            # Dados extras
            chave_extras = f"{tecnico_id}_{data}"
            # Também verificar com nome do técnico (formato do frontend)
            chave_extras_nome = f"{tecnico_nome}_{data}"
            extras = dados_extras.get(chave_extras, {}) or dados_extras.get(chave_extras_nome, {})
            
            if chave_extras in dietas_aplicadas or chave_extras_nome in dietas_aplicadas:
                dieta = 0
            else:
                dieta = extras.get('dieta', 0)
                if dieta > 0:
                    dietas_aplicadas.add(chave_extras)
                    dietas_aplicadas.add(chave_extras_nome)
            
            portagens = extras.get('portagens', 0)
            despesas = extras.get('despesas', 0)
            total_geral_dietas += dieta
            total_geral_portagens += portagens
            total_geral_despesas += despesas
            
            # Início e Fim
            registos_ordenados_hora = sorted(registos, key=lambda r: r.get('hora_inicio') or '')
            primeiro_inicio = registos_ordenados_hora[0].get('hora_inicio') if registos_ordenados_hora else None
            ultimo_fim = registos_ordenados_hora[-1].get('hora_fim') if registos_ordenados_hora else None
            
            # Pausa
            tem_pausa = any(r.get('incluir_pausa', False) for r in registos)
            pausa_minutos = 60 if tem_pausa else 0
            
            # Tipo de Registo - usar o tipo do grupo directamente
            tipo_map = {'trabalho': 'Trabalho', 'viagem': 'Viagem', 'manual': 'Manual', 'oficina': 'Oficina'}
            tipo_registo = tipo_map.get(tipo_registo_grupo, tipo_registo_grupo)
            
            # Acumular para legenda de totais
            for reg in registos:
                tipo_r = reg.get('tipo_registo', 'trabalho')
                tipo_label = tipo_map.get(tipo_r, tipo_r)
                codigo_r = reg.get('codigo', '-')
                chave_legenda = f"{codigo_r}_{tipo_r}"
                totais_por_tarifa_tipo[chave_legenda]['minutos'] += reg.get('minutos', 0)
                totais_por_tarifa_tipo[chave_legenda]['tipo_label'] = tipo_label
                totais_por_tarifa_tipo[chave_legenda]['codigo_label'] = codigo_r
            
            # Formatar data
            try:
                date_obj = datetime.fromisoformat(data).date() if data else None
            except:
                date_obj = None
            
            # Função label
            funcao_label = 'Técnico' if funcao_ot_grupo == 'tecnico' else 'Ajudante'
            
            # Observações do registo
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
                minutes_to_hhmm(pausa_minutos) if pausa_minutos > 0 else '-',
                format_time_hhmm(ultimo_fim),
                f'{dieta:.2f}€' if dieta else '0,00€',
                f'{portagens:.2f}€' if portagens else '0,00€',
                f'{despesas:.2f}€' if despesas else '0,00€',
                obs_text
            ]
            table_data.append(row)
        
        # Linha de totais
        table_data.append([
            '', 'TOTAIS:', '', '', '', '',
            f'{total_geral_valor:.2f}€',
            '', '',
            f'{total_geral_km_valor:.2f}€',
            '', '', '',
            f'{total_geral_dietas:.2f}€',
            f'{total_geral_portagens:.2f}€',
            f'{total_geral_despesas:.2f}€',
            ''
        ])
        
        # Grande total
        grande_total = total_geral_valor + total_geral_km_valor + total_geral_dietas + total_geral_portagens + total_geral_despesas
        table_data.append([
            '', '', '', '', '', '',
            '', '', '',
            '', '', '', '',
            f'TOTAL GERAL:',
            f'{grande_total:.2f}€',
            '', ''
        ])
        
        # Criar tabela (com coluna Função)
        col_widths = [
            1.7*cm,    # Data
            2.2*cm,    # Dia Semana
            1.6*cm,    # Função
            1.5*cm,    # Registo
            1.3*cm,    # Horas
            1.7*cm,    # Tarifa
            1.5*cm,    # Total Valor
            1.1*cm,    # Km's
            1.3*cm,    # Preço/Km
            1.4*cm,    # Total Km
            1.2*cm,    # Início
            1.1*cm,    # Pausa
            1.2*cm,    # Fim
            1.3*cm,    # Dieta
            1.4*cm,    # Portagens
            1.4*cm,    # Despesas
            1.5*cm,    # Obs.
        ]
        
        table = Table(table_data, colWidths=col_widths)
        
        # Estilo da tabela
        style = TableStyle([
            # Cabeçalho
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6b7280')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 7),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            
            # Dados
            ('FONTSIZE', (0, 1), (-1, -1), 7),
            ('ALIGN', (0, 1), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            
            # Grid
            ('GRID', (0, 0), (-1, -3), 0.5, colors.grey),
            
            # Linha de totais
            ('BACKGROUND', (0, -2), (-1, -2), colors.HexColor('#e5e7eb')),
            ('FONTNAME', (0, -2), (-1, -2), 'Helvetica-Bold'),
            
            # Grande total
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#fef3c7')),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0, -1), (-1, -1), colors.HexColor('#92400e')),
            
            # Padding
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 2),
            ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ])
        table.setStyle(style)
        
        elements.append(table)
        elements.append(Spacer(1, 0.4*cm))
        
        # ---------- LEGENDA COM TOTAIS POR TARIFA E TIPO ----------
        elements.append(Paragraph("RESUMO DE HORAS POR CÓDIGO E TIPO", legend_title_style))
        
        # Ordenar por código, depois por tipo
        codigo_ordem = {'1': 0, '2': 1, 'S': 2, 'D': 3}
        legenda_ordenada = sorted(
            totais_por_tarifa_tipo.items(),
            key=lambda x: (codigo_ordem.get(x[1]['codigo_label'], 99), x[1]['tipo_label'])
        )
        
        # Descrições dos códigos
        codigo_descricao = {
            '1': 'Diurno (07h-19h)',
            '2': 'Noturno (19h-07h)',
            'S': 'Sábado',
            'D': 'Domingo/Feriado'
        }
        
        for chave, dados in legenda_ordenada:
            if dados['minutos'] > 0:
                codigo = dados['codigo_label']
                tipo = dados['tipo_label']
                horas_str = minutes_to_hhmm(dados['minutos'])
                desc = codigo_descricao.get(codigo, '')
                
                texto_legenda = f"<b>Código {codigo}</b> – {tipo}: <b>{horas_str}</b> total"
                if desc:
                    texto_legenda += f" <font color='#6b7280' size='7'>({desc})</font>"
                
                elements.append(Paragraph(texto_legenda, legend_item_style))
        
        elements.append(Spacer(1, 0.3*cm))
        
        # Legenda de códigos
        elements.append(Paragraph(
            "<b>Legenda Códigos:</b> 1 = 07h-19h (dias úteis) | 2 = 19h-07h (noturno) | S = Sábado | D = Domingo/Feriado",
            small_style
        ))
        
        # Rodapé
        elements.append(Spacer(1, 0.3*cm))
        elements.append(Paragraph(
            f"Documento gerado em {datetime.now().strftime('%d/%m/%Y às %H:%M')}",
            small_style
        ))
    
    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    return buffer
