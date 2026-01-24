"""
Gerador de PDF para Folha de Horas
PDF em formato HORIZONTAL (landscape)
"""
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
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
    tarifas_por_codigo=None  # dict: {"1": valor, "2": valor, "S": valor, "D": valor}
):
    """
    Gera PDF da Folha de Horas em formato horizontal (landscape)
    
    Args:
        relatorio: dados da OT
        cliente: dados do cliente
        registos_mao_obra: registos de cronómetros (db.registos_tecnico_ot)
        tecnicos_manuais: registos manuais (db.tecnicos_relatorio)
        tarifas_por_tecnico: {tecnico_id: valor_hora} ou com chave composta
        dados_extras: {f"{tecnico_id}_{data}": {"dieta": X, "portagens": Y, "despesas": Z}}
        tarifas_por_codigo: {codigo: valor_hora} para aplicação automática
    """
    # Inicializar tarifas por código se não fornecido
    if tarifas_por_codigo is None:
        tarifas_por_codigo = {}
    
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
    
    # Logo
    logo_path = Path(__file__).parent / "assets" / "hwi_logo.png"
    if logo_path.exists():
        logo = RLImage(str(logo_path), width=4*cm, height=1.3*cm)
        elements.append(logo)
    
    # Cabeçalho
    elements.append(Paragraph("FOLHA DE HORAS", title_style))
    elements.append(Paragraph(f"OT #{relatorio.get('numero_assistencia', 'N/A')}", heading_style))
    elements.append(Spacer(1, 0.2*cm))
    
    # Info do Cliente
    elements.append(Paragraph(f"<b>Cliente:</b> {cliente.get('nome', 'N/A')}", normal_style))
    elements.append(Paragraph(f"<b>Localização:</b> {relatorio.get('local_intervencao', 'N/A')}", normal_style))
    elements.append(Spacer(1, 0.3*cm))
    
    # Preço por km fixo
    PRECO_KM = 0.65
    
    # Organizar dados por técnico, data E código
    # Estrutura: {tecnico_id: {data: {codigo: [registos]}}}
    dados_por_tecnico_data_codigo = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    
    # Processar registos de cronómetros
    for reg in registos_mao_obra:
        tecnico_id = reg.get('tecnico_id', 'unknown')
        registo_id = reg.get('id', '')  # ID único do registo
        data = reg.get('data', '')
        if isinstance(data, str) and 'T' in data:
            data = data.split('T')[0]
        codigo = reg.get('codigo', '-')
        
        dados_por_tecnico_data_codigo[tecnico_id][data][codigo].append({
            'tipo': 'cronometro',
            'tecnico_nome': reg.get('tecnico_nome', 'N/A'),
            'tipo_cronometro': reg.get('tipo', ''),  # trabalho/viagem
            'hora_inicio': reg.get('hora_inicio_segmento'),
            'hora_fim': reg.get('hora_fim_segmento'),
            'minutos': int((reg.get('horas_arredondadas', 0) or 0) * 60),
            'km': reg.get('km', 0),
            'codigo': codigo,
            'registo_id': registo_id,
            # Chave para tarifa: tecnico_id_data_codigo (mesmo formato do frontend)
            'tarifa_key': f"{tecnico_id}_{data}_{codigo}"
        })
    
    # Processar registos manuais
    for tec in tecnicos_manuais:
        # IMPORTANTE: Usar o 'id' do registo como chave (igual ao frontend)
        tecnico_id = tec.get('id', 'manual')
        data = tec.get('data_trabalho', '')
        if isinstance(data, str) and 'T' in data:
            data = data.split('T')[0]
        
        # Obter hora_inicio e hora_fim dos registos manuais (novo campo)
        hora_inicio_manual = tec.get('hora_inicio')
        hora_fim_manual = tec.get('hora_fim')
        
        # Usar o tipo_registo atual (que pode ter sido alterado na OT)
        tipo_registo_atual = tec.get('tipo_registo', 'manual')
        
        # Converter tipo_horario para código
        codigo = {
            'diurno': '1',
            'noturno': '2',
            'sabado': 'S',
            'domingo_feriado': 'D'
        }.get(tec.get('tipo_horario', ''), '-')
        
        dados_por_tecnico_data_codigo[tecnico_id][data][codigo].append({
            'tipo': 'manual',
            'tecnico_nome': tec.get('tecnico_nome', 'N/A'),
            'tipo_cronometro': tipo_registo_atual,  # Usar tipo atual da OT
            'hora_inicio': hora_inicio_manual,  # Pode ser HH:MM ou None
            'hora_fim': hora_fim_manual,  # Pode ser HH:MM ou None
            'minutos': tec.get('minutos_cliente', 0),
            'km': tec.get('kms_deslocacao', 0),
            'incluir_pausa': tec.get('incluir_pausa', False),  # Campo de pausa
            'codigo': codigo,
            'registo_id': tecnico_id,
            # Chave para tarifa: tecnico_id_data_codigo (mesmo formato do frontend)
            'tarifa_key': f"{tecnico_id}_{data}_{codigo}"
        })
    
    # Criar linhas da tabela
    # Cabeçalho
    header = [
        'Data',
        'Dia Semana',
        'Técnico',
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
    
    # Criar lista plana de registos para ordenar por data cronológica
    # Agora cada combinação tecnico_id/data/codigo é uma linha separada
    registos_ordenados = []
    for tecnico_id, datas in dados_por_tecnico_data_codigo.items():
        for data, codigos in datas.items():
            for codigo, registos in codigos.items():
                if registos:
                    registos_ordenados.append({
                        'tecnico_id': tecnico_id,
                        'data': data,
                        'codigo': codigo,
                        'registos': registos
                    })
    
    # Ordenar por data cronológica, depois por código
    registos_ordenados.sort(key=lambda x: (x['data'], x['codigo']))
    
    # REGRA DE DIETA: Apenas 1 dieta por técnico por dia
    # Manter registo de quais técnicos/dias já tiveram dieta aplicada
    dietas_aplicadas = set()  # Set de chaves "tecnico_id_data"
    
    # Iterar pelos registos ordenados por data e código
    for item in registos_ordenados:
        tecnico_id = item['tecnico_id']
        data = item['data']
        codigo = item['codigo']
        registos = item['registos']
        
        # Pegar nome do técnico
        tecnico_nome = registos[0].get('tecnico_nome', 'N/A')
        
        # Pegar tarifa_key se existir
        tarifa_key = registos[0].get('tarifa_key', '')
        
        # Calcular totais para este grupo (tecnico/data/codigo)
        total_minutos = sum(r.get('minutos', 0) for r in registos)
        total_km = sum(r.get('km', 0) for r in registos)
        
        # Tarifa - tentar chave tarifa_key (formato frontend) primeiro
        tarifa_valor = 0
        if tarifa_key:
            tarifa_valor = tarifas_por_tecnico.get(tarifa_key, 0)
        
        if tarifa_valor == 0:
            # Fallback: tentar chave completa (tecnico_id_data_codigo)
            chave_tarifa_completa = f"{tecnico_id}_{data}_{codigo}"
            tarifa_valor = tarifas_por_tecnico.get(chave_tarifa_completa, 0)
        
        if tarifa_valor == 0:
            # Fallback: tentar só com tecnico_id_data
            chave_tarifa_data = f"{tecnico_id}_{data}"
            tarifa_valor = tarifas_por_tecnico.get(chave_tarifa_data, 0)
            
        if tarifa_valor == 0:
            # Fallback: tentar só com tecnico_id
            tarifa_valor = tarifas_por_tecnico.get(tecnico_id, 0)
        
        if tarifa_valor == 0 and codigo:
            # Fallback FINAL: usar tarifa por código (configurada no Admin Dashboard)
            tarifa_valor = tarifas_por_codigo.get(codigo, 0)
        
        total_valor = (total_minutos / 60) * tarifa_valor
        total_geral_valor += total_valor
        
        # Km
        total_km_valor = total_km * PRECO_KM
        total_geral_km_valor += total_km_valor
        
        # Dados extras (dieta, portagens, despesas)
        chave_extras = f"{tecnico_id}_{data}"
        extras = dados_extras.get(chave_extras, {})
        dieta = extras.get('dieta', 0)
        portagens = extras.get('portagens', 0)
        despesas = extras.get('despesas', 0)
        total_geral_dietas += dieta
        total_geral_portagens += portagens
        total_geral_despesas += despesas
        
        # Início e Fim (primeiro e último registo)
        registos_ordenados_hora = sorted(registos, key=lambda r: r.get('hora_inicio') or '')
        primeiro_inicio = registos_ordenados_hora[0].get('hora_inicio') if registos_ordenados_hora else None
        ultimo_fim = registos_ordenados_hora[-1].get('hora_fim') if registos_ordenados_hora else None
        
        # Pausa - Usar campo incluir_pausa de cada registo
        # Se algum registo tiver incluir_pausa=True, mostrar 1h de pausa
        tem_pausa = any(r.get('incluir_pausa', False) for r in registos)
        pausa_minutos = 60 if tem_pausa else 0
        
        # Tipo de Registo (para coluna "Registo")
        tipo_registo_list = list(set(r.get('tipo_cronometro', '') for r in registos if r.get('tipo_cronometro')))
        tipo_map = {'trabalho': 'Trabalho', 'viagem': 'Viagem', 'manual': 'Manual'}
        tipo_registo = ', '.join([tipo_map.get(t, t) for t in tipo_registo_list]) if tipo_registo_list else '-'
        
        # Observações (sem o tipo de registo - só outras observações se existirem)
        obs = ''
        
        # Formatar data
        try:
            date_obj = datetime.fromisoformat(data).date() if data else None
        except:
            date_obj = None
        
        row = [
            format_date_pt(date_obj),
            get_weekday_pt(date_obj),
            tecnico_nome,
            tipo_registo,
            minutes_to_hhmm(total_minutos),
            f'{tarifa_valor:.2f}€/h' if tarifa_valor else '-',
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
            obs
        ]
        table_data.append(row)
    
    # Linha de totais
    table_data.append([
        '', '', 'TOTAIS:', '', '', '',
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
        '', f'TOTAL GERAL:',
        f'{grande_total:.2f}€',
        ''
    ])
    
    # Criar tabela
    col_widths = [
        1.8*cm,    # Data
        2.2*cm,  # Dia Semana
        2.2*cm,  # Técnico
        1.6*cm,  # Registo (NOVA)
        1.3*cm,  # Horas
        1.6*cm,  # Tarifa
        1.6*cm,  # Total Valor
        1.1*cm,  # Km's
        1.4*cm,  # Preço/Km
        1.4*cm,  # Total Km
        1.2*cm,  # Início
        1.2*cm,  # Pausa
        1.2*cm,  # Fim
        1.4*cm,  # Dieta
        1.4*cm,  # Portagens
        1.4*cm,  # Despesas
        1.5*cm,  # Obs.
    ]
    
    table = Table(table_data, colWidths=col_widths)
    
    # Estilo da tabela
    style = TableStyle([
        # Cabeçalho
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
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
    elements.append(Spacer(1, 0.3*cm))
    
    # Legenda
    elements.append(Paragraph(
        "<b>Legenda Observações:</b> Trab. = Trabalho | Viag. = Viagem | Manual = Entrada Manual",
        small_style
    ))
    
    # Rodapé
    elements.append(Spacer(1, 0.5*cm))
    elements.append(Paragraph(
        f"Documento gerado em {datetime.now().strftime('%d/%m/%Y às %H:%M')}",
        small_style
    ))
    
    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    return buffer
