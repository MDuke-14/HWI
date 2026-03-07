"""
Gerador de PDF para Folha de Horas
PDF em formato HORIZONTAL (landscape)
Estrutura:
  1. Tabela Geral de Registos (todos os registos, ordenados por data > hora_inicio > colaborador)
  2. Secção por Colaborador (tabela individual + resumo financeiro)
  3. Tabela de Despesas
  4. Nota Legal (após resumos e despesas)
  5. Imagem da Tabela de Preços (última página)
Cores: preto, cinzento e branco (aspeto profissional neutro)
"""
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
    Image as RLImage, PageBreak, KeepTogether
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from io import BytesIO
from datetime import datetime
from pathlib import Path
from collections import defaultdict


# ===================== UTILIDADES =====================

def format_time_hhmm(dt):
    if not dt:
        return '-'
    if isinstance(dt, str):
        if len(dt) == 5 and ':' in dt:
            return dt
        try:
            dt = datetime.fromisoformat(dt.replace('Z', '+00:00'))
        except Exception:
            return dt if dt else '-'
    return dt.strftime('%H:%M') if dt else '-'


def format_date_pt(date_obj):
    if isinstance(date_obj, str):
        try:
            date_obj = datetime.fromisoformat(date_obj).date()
        except Exception:
            return date_obj
    return date_obj.strftime('%d/%m/%Y') if date_obj else '-'


def minutes_to_hhmm(minutes):
    if not minutes:
        return '0:00'
    hours = int(minutes) // 60
    mins = int(minutes) % 60
    return f'{hours}:{mins:02d}'


# ===================== CORES NEUTRAS =====================
HEADER_BG = colors.HexColor('#333333')       # cinzento escuro
HEADER_TEXT = colors.white
ROW_ALT_1 = colors.HexColor('#f7f7f7')       # cinzento muito claro
ROW_ALT_2 = colors.white
GRID_COLOR = colors.HexColor('#cccccc')       # cinzento médio
TOTALS_BG = colors.HexColor('#e8e8e8')        # cinzento claro
TOTALS_TEXT = colors.HexColor('#111111')       # preto
SECTION_BG = colors.HexColor('#555555')        # cinzento médio-escuro
TEXT_BLACK = colors.HexColor('#111111')
TEXT_GREY = colors.HexColor('#666666')


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
    valor_dieta_default=0,
    tabela_preco_image=None,
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
        topMargin=0.7*cm, bottomMargin=0.7*cm,
        leftMargin=0.7*cm, rightMargin=0.7*cm
    )
    elements = []
    styles = getSampleStyleSheet()

    # ===================== ESTILOS =====================
    title_style = ParagraphStyle(
        'CustomTitle', parent=styles['Heading1'],
        fontSize=14, textColor=TEXT_BLACK,
        spaceAfter=2, spaceBefore=0, alignment=TA_CENTER, fontName='Helvetica-Bold'
    )
    subtitle_style = ParagraphStyle(
        'Subtitle', parent=styles['Normal'],
        fontSize=9, textColor=TEXT_GREY,
        spaceAfter=2, spaceBefore=0, alignment=TA_CENTER
    )
    heading_style = ParagraphStyle(
        'CustomHeading', parent=styles['Heading2'],
        fontSize=11, textColor=TEXT_BLACK,
        spaceAfter=4, spaceBefore=6, fontName='Helvetica-Bold'
    )
    normal_style = ParagraphStyle(
        'CustomNormal', parent=styles['Normal'],
        fontSize=8, spaceAfter=2, spaceBefore=0, textColor=TEXT_BLACK
    )
    small_style = ParagraphStyle(
        'SmallStyle', parent=styles['Normal'],
        fontSize=7, spaceAfter=1, spaceBefore=0, textColor=TEXT_GREY
    )
    legal_style = ParagraphStyle(
        'LegalNote', parent=styles['Normal'],
        fontSize=7, spaceAfter=2, spaceBefore=6, textColor=TEXT_GREY,
        fontName='Helvetica-Oblique', alignment=TA_LEFT
    )

    logo_path = Path(__file__).parent / "assets" / "hwi_logo.png"
    PRECO_KM = valor_km
    tipo_map = {'trabalho': 'Trabalho', 'viagem': 'Viagem', 'manual': 'Trabalho', 'oficina': 'Oficina'}
    tipo_despesa_labels = {
        'combustivel': 'Combustível', 'ferramentas': 'Ferramentas',
        'portagens': 'Portagens', 'outras': 'Outras'
    }
    NOTA_LEGAL = (
        "Nota: Este documento é apenas informativo e não constitui fatura. "
        "Aos valores indicados acresce, quando aplicável, o IVA à taxa legal em vigor."
    )

    def add_header(elems):
        if logo_path.exists():
            elems.append(RLImage(str(logo_path), width=4*cm, height=1.3*cm))
        elems.append(Paragraph("FOLHA DE HORAS", title_style))
        ot_num = relatorio.get('numero_assistencia', 'N/A')
        elems.append(Paragraph(f"OT #{ot_num}", subtitle_style))
        elems.append(Spacer(1, 0.15*cm))
        elems.append(Paragraph(f"<b>Cliente:</b> {cliente.get('nome', 'N/A')}", normal_style))
        elems.append(Paragraph(f"<b>Localização:</b> {relatorio.get('local_intervencao', 'N/A')}", normal_style))
        ot_rel_num = relatorio.get('ot_relacionada_numero')
        if ot_rel_num:
            elems.append(Paragraph(f"<b>OT Relacionada:</b> OT #{ot_rel_num}", normal_style))
        elems.append(Spacer(1, 0.2*cm))

    def make_table_style(header_bg=HEADER_BG, has_totals=True):
        s = [
            ('BACKGROUND', (0, 0), (-1, 0), header_bg),
            ('TEXTCOLOR', (0, 0), (-1, 0), HEADER_TEXT),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 6.5),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTSIZE', (0, 1), (-1, -1), 6.5),
            ('ALIGN', (0, 1), (-1, -1), 'CENTER'),
            ('ALIGN', (0, 1), (0, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.4, GRID_COLOR),
            ('TOPPADDING', (0, 0), (-1, -1), 2.5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
            ('LEFTPADDING', (0, 0), (-1, -1), 2),
            ('RIGHTPADDING', (0, 0), (-1, -1), 2),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [ROW_ALT_2, ROW_ALT_1]),
        ]
        if has_totals:
            s.append(('BACKGROUND', (0, -1), (-1, -1), TOTALS_BG))
            s.append(('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'))
            s.append(('TEXTCOLOR', (0, -1), (-1, -1), TOTALS_TEXT))
        return s

    # ==========================================
    # PASSO 1: Recolher TODOS os registos numa lista plana
    # ==========================================
    todos_registos = []

    for reg in registos_mao_obra:
        tecnico_id = reg.get('tecnico_id', 'unknown')
        tecnico_nome = reg.get('tecnico_nome', 'N/A')
        data = reg.get('data', '')
        if isinstance(data, str) and 'T' in data:
            data = data.split('T')[0]
        codigo = reg.get('codigo', '-')

        todos_registos.append({
            'tecnico_id': tecnico_id,
            'tecnico_nome': tecnico_nome,
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
            'observacoes': reg.get('observacoes', ''),
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

        todos_registos.append({
            'tecnico_id': tecnico_id,
            'tecnico_nome': tecnico_nome,
            'tipo_registo': tec.get('tipo_registo', 'trabalho'),
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
            'observacoes': '',
        })

    # ==========================================
    # PASSO 2: Ordenar: Data > Hora Início > Colaborador (alfa)
    # ==========================================
    todos_registos.sort(key=lambda r: (
        r.get('data', ''),
        format_time_hhmm(r.get('hora_inicio')) or 'zzz',
        r.get('tecnico_nome', '').lower()
    ))

    # Pré-calcular horas totais por técnico por dia (para regra de dieta)
    minutos_por_tecnico_dia = defaultdict(int)
    for reg in todos_registos:
        key = f"{reg['tecnico_id']}_{reg['data']}"
        minutos_por_tecnico_dia[key] += reg.get('minutos', 0)

    # Determinar último registo de cada técnico em cada dia
    ultimo_registo_tecnico_dia = {}
    for idx, reg in enumerate(todos_registos):
        key = f"{reg['tecnico_id']}_{reg['data']}"
        ultimo_registo_tecnico_dia[key] = idx

    # ==========================================
    # PASSO 3: Calcular tarifas e valores para cada registo
    # ==========================================
    dietas_aplicadas = set()

    for idx, reg in enumerate(todos_registos):
        tecnico_id = reg['tecnico_id']
        codigo = reg['codigo']
        tipo_registo = reg['tipo_registo']
        funcao_ot = reg.get('funcao_ot', 'tecnico')
        total_minutos = reg.get('minutos', 0)
        total_km = reg.get('km', 0) or 0
        dia = reg['data']

        # Tarifa
        tarifa_valor = 0
        if tarifas_detalhadas:
            tarifa_valor = find_best_tariff(codigo, tipo_registo, funcao_ot, tarifas_detalhadas, tarifas_por_codigo)
        if tarifa_valor == 0:
            for key_attempt in [
                f"{tecnico_id}_{dia}_{codigo}_{tipo_registo}",
                reg.get('tarifa_key', ''),
                reg.get('tarifa_key_alt', ''),
                f"{tecnico_id}_{dia}_{codigo}",
                f"{tecnico_id}_{dia}",
                tecnico_id,
            ]:
                if key_attempt:
                    tarifa_valor = tarifas_por_tecnico.get(key_attempt, 0)
                    if tarifa_valor:
                        break
        if tarifa_valor == 0 and codigo:
            tarifa_valor = tarifas_por_codigo.get(codigo, 0)

        total_valor = (total_minutos / 60) * tarifa_valor
        total_km_valor = total_km * PRECO_KM

        # Dieta
        chave_dieta = f"{tecnico_id}_{dia}"
        chave_dieta_nome = f"{reg['tecnico_nome']}_{dia}"
        extras = dados_extras.get(chave_dieta, {}) or dados_extras.get(chave_dieta_nome, {})
        is_ultimo_do_tecnico = (ultimo_registo_tecnico_dia.get(chave_dieta) == idx)

        dieta = 0
        if is_ultimo_do_tecnico and chave_dieta not in dietas_aplicadas and chave_dieta_nome not in dietas_aplicadas:
            dieta_base = float(extras.get('dieta', 0) or 0)
            if dieta_base == 0 and valor_dieta_default > 0:
                dieta_base = valor_dieta_default
            horas_tecnico_dia = minutos_por_tecnico_dia.get(chave_dieta, 0) / 60
            if dieta_base > 0:
                if horas_tecnico_dia <= 4:
                    dieta = 0
                elif horas_tecnico_dia <= 6:
                    dieta = dieta_base * 0.5
                else:
                    dieta = dieta_base
            if dieta > 0:
                dietas_aplicadas.add(chave_dieta)
                dietas_aplicadas.add(chave_dieta_nome)

        # Observações: justificar kms em registos de trabalho
        obs = reg.get('observacoes', '') or ''
        if total_km > 0 and tipo_registo in ('trabalho', 'oficina', 'manual') and not obs:
            obs = ''

        reg['tarifa_valor'] = tarifa_valor
        reg['total_valor'] = total_valor
        reg['total_km'] = total_km
        reg['total_km_valor'] = total_km_valor
        reg['dieta'] = dieta
        reg['obs_display'] = obs

    # ==========================================
    # SECÇÃO 1: TABELA GERAL DE REGISTOS
    # ==========================================
    add_header(elements)
    elements.append(Paragraph("REGISTOS GERAIS", heading_style))

    header_row = [
        'Data', 'Colaborador', 'Função', 'Registo', 'Horas',
        'Tarifa', 'Total Valor', "KM's", 'Preço/KM', 'Total KM',
        'Início', 'Fim', 'Dieta', 'Obs.'
    ]
    table_data = [header_row]

    total_valor_geral = 0
    total_km_valor_geral = 0
    total_dieta_geral = 0

    for reg in todos_registos:
        funcao_label = 'Técnico' if reg.get('funcao_ot', 'tecnico') == 'tecnico' else 'Ajudante'
        tipo_label = tipo_map.get(reg['tipo_registo'], reg['tipo_registo'])
        tarifa_valor = reg['tarifa_valor']
        codigo = reg['codigo']

        # Formatar data
        try:
            d = datetime.fromisoformat(reg['data']).date()
            data_display = d.strftime('%d/%m/%Y')
        except Exception:
            data_display = reg['data']

        row = [
            data_display,
            reg['tecnico_nome'],
            funcao_label,
            tipo_label,
            minutes_to_hhmm(reg.get('minutos', 0)),
            f"Cód.{codigo} - {tarifa_valor:.2f}€/h" if tarifa_valor else f"Cód.{codigo}",
            f"{reg['total_valor']:.2f}€",
            f"{reg['total_km']:.1f}" if reg['total_km'] else '-',
            f"{PRECO_KM:.2f}€" if reg['total_km'] else '-',
            f"{reg['total_km_valor']:.2f}€" if reg['total_km'] else '-',
            format_time_hhmm(reg.get('hora_inicio')),
            format_time_hhmm(reg.get('hora_fim')),
            f"{reg['dieta']:.2f}€" if reg['dieta'] > 0 else '-',
            Paragraph(reg.get('obs_display', '')[:60], small_style) if reg.get('obs_display') else '',
        ]
        table_data.append(row)

        total_valor_geral += reg['total_valor']
        total_km_valor_geral += reg['total_km_valor']
        total_dieta_geral += reg['dieta']

    # Linha de totais
    table_data.append([
        '', '', '', 'TOTAIS:', '', '',
        f'{total_valor_geral:.2f}€',
        '', '',
        f'{total_km_valor_geral:.2f}€',
        '', '',
        f'{total_dieta_geral:.2f}€',
        ''
    ])

    col_widths = [
        1.8*cm,  # Data
        2.8*cm,  # Colaborador
        1.4*cm,  # Função
        1.4*cm,  # Registo
        1.1*cm,  # Horas
        2.4*cm,  # Tarifa
        1.6*cm,  # Total Valor
        1.0*cm,  # KMs
        1.3*cm,  # Preço/KM
        1.4*cm,  # Total KM
        1.1*cm,  # Início
        1.0*cm,  # Fim
        1.3*cm,  # Dieta
        3.2*cm,  # Obs
    ]

    table = Table(table_data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle(make_table_style()))
    elements.append(table)

    elements.append(Spacer(1, 0.3*cm))
    grande_total_horas = total_valor_geral + total_km_valor_geral + total_dieta_geral
    elements.append(Paragraph(
        f"<b>Total Geral (Horas + KM + Dietas):</b> {grande_total_horas:.2f}€",
        normal_style
    ))

    # ==========================================
    # SECÇÃO 2: TABELA POR COLABORADOR + RESUMO
    # ==========================================
    # Agrupar registos por colaborador
    registos_por_colab = defaultdict(list)
    for reg in todos_registos:
        registos_por_colab[reg['tecnico_id']].append(reg)

    # Ordenar colaboradores por nome
    colab_ordenados = sorted(registos_por_colab.keys(), key=lambda tid: registos_por_colab[tid][0]['tecnico_nome'].lower())

    for tid in colab_ordenados:
        regs = registos_por_colab[tid]
        nome = regs[0]['tecnico_nome']
        funcao = regs[0].get('funcao_ot', 'tecnico')
        funcao_label = 'Técnico' if funcao == 'tecnico' else 'Ajudante'

        elements.append(PageBreak())
        add_header(elements)
        elements.append(Paragraph(f"REGISTOS — {nome.upper()} ({funcao_label})", heading_style))

        # Tabela de registos do colaborador
        colab_table_data = [header_row]
        colab_total_valor = 0
        colab_total_km_valor = 0
        colab_total_dieta = 0

        for reg in regs:
            fl = 'Técnico' if reg.get('funcao_ot', 'tecnico') == 'tecnico' else 'Ajudante'
            tl = tipo_map.get(reg['tipo_registo'], reg['tipo_registo'])
            tv = reg['tarifa_valor']
            cod = reg['codigo']

            try:
                d = datetime.fromisoformat(reg['data']).date()
                dd = d.strftime('%d/%m/%Y')
            except Exception:
                dd = reg['data']

            colab_table_data.append([
                dd, reg['tecnico_nome'], fl, tl,
                minutes_to_hhmm(reg.get('minutos', 0)),
                f"Cód.{cod} - {tv:.2f}€/h" if tv else f"Cód.{cod}",
                f"{reg['total_valor']:.2f}€",
                f"{reg['total_km']:.1f}" if reg['total_km'] else '-',
                f"{PRECO_KM:.2f}€" if reg['total_km'] else '-',
                f"{reg['total_km_valor']:.2f}€" if reg['total_km'] else '-',
                format_time_hhmm(reg.get('hora_inicio')),
                format_time_hhmm(reg.get('hora_fim')),
                f"{reg['dieta']:.2f}€" if reg['dieta'] > 0 else '-',
                Paragraph(reg.get('obs_display', '')[:60], small_style) if reg.get('obs_display') else '',
            ])
            colab_total_valor += reg['total_valor']
            colab_total_km_valor += reg['total_km_valor']
            colab_total_dieta += reg['dieta']

        colab_table_data.append([
            '', '', '', 'TOTAIS:', '', '',
            f'{colab_total_valor:.2f}€', '', '',
            f'{colab_total_km_valor:.2f}€', '', '',
            f'{colab_total_dieta:.2f}€', ''
        ])

        ct = Table(colab_table_data, colWidths=col_widths, repeatRows=1)
        ct.setStyle(TableStyle(make_table_style()))
        elements.append(ct)
        elements.append(Spacer(1, 0.4*cm))

        # --- Tabela Resumo Financeiro do Colaborador ---
        elements.append(Paragraph(f"RESUMO FINANCEIRO — {nome.upper()}", heading_style))

        # Acumular valores por código
        trabalho_por_cod = defaultdict(float)   # codigo -> euros
        viagem_por_cod = defaultdict(float)     # codigo -> euros
        km_total_euros = 0
        tarifa_por_cod_trab = {}
        tarifa_por_cod_viag = {}

        for reg in regs:
            cod = reg['codigo']
            tipo_norm = 'trabalho' if reg['tipo_registo'] in ('trabalho', 'oficina', 'manual') else reg['tipo_registo']
            if tipo_norm == 'viagem':
                viagem_por_cod[cod] += reg['total_valor']
                if cod not in tarifa_por_cod_viag:
                    tarifa_por_cod_viag[cod] = reg['tarifa_valor']
            else:
                trabalho_por_cod[cod] += reg['total_valor']
                if cod not in tarifa_por_cod_trab:
                    tarifa_por_cod_trab[cod] = reg['tarifa_valor']
            km_total_euros += reg['total_km_valor']

        # Build resumo header and row
        # Colunas: Colaborador | Função | Cod.1 XX€ | Cod.2 XX€ | Cod.S XX€ | Cod.D XX€ |
        #          Cod.V1 XX€ | Cod.V2 XX€ | Cod.VS XX€ | Cod.VD XX€ | KM XX€ | TOTAL
        codigos = ['1', '2', 'S', 'D']

        resumo_header = ['Colaborador', 'Função']
        for c in codigos:
            t_val = tarifa_por_cod_trab.get(c, tarifas_por_codigo.get(c, 0))
            resumo_header.append(f"Cód.{c}\n{t_val:.2f}€/h")
        for c in codigos:
            t_val = tarifa_por_cod_viag.get(c, tarifas_por_codigo.get(c, 0))
            resumo_header.append(f"Cód.V{c}\n{t_val:.2f}€/h")
        resumo_header.append(f"KM\n{PRECO_KM:.2f}€/km")
        resumo_header.append('TOTAL')

        resumo_row = [nome, funcao_label]
        total_colab = 0
        for c in codigos:
            v = trabalho_por_cod.get(c, 0)
            resumo_row.append(f"{v:.2f}€" if v > 0 else '-')
            total_colab += v
        for c in codigos:
            v = viagem_por_cod.get(c, 0)
            resumo_row.append(f"{v:.2f}€" if v > 0 else '-')
            total_colab += v
        resumo_row.append(f"{km_total_euros:.2f}€" if km_total_euros > 0 else '-')
        total_colab += km_total_euros
        total_colab += colab_total_dieta
        resumo_row.append(f"{total_colab:.2f}€")

        resumo_data = [resumo_header, resumo_row]

        resumo_col_widths = [
            2.8*cm, 1.4*cm,
            1.7*cm, 1.7*cm, 1.7*cm, 1.7*cm,
            1.7*cm, 1.7*cm, 1.7*cm, 1.7*cm,
            1.8*cm, 2.2*cm,
        ]

        rt = Table(resumo_data, colWidths=resumo_col_widths)
        rt.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), SECTION_BG),
            ('TEXTCOLOR', (0, 0), (-1, 0), HEADER_TEXT),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 6),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('ALIGN', (0, 1), (0, -1), 'LEFT'),
            ('FONTSIZE', (0, 1), (-1, -1), 7),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.4, GRID_COLOR),
            ('BACKGROUND', (-1, 1), (-1, -1), TOTALS_BG),
            ('FONTNAME', (-1, 1), (-1, -1), 'Helvetica-Bold'),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 2),
            ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ]))
        elements.append(rt)

        # Nota legal
        elements.append(Paragraph(NOTA_LEGAL, legal_style))

    # ==========================================
    # SECÇÃO 3: TABELA DE DESPESAS
    # ==========================================
    despesas_para_pdf = [d for d in despesas_ajustadas if d.get('tipo') != 'combustivel']

    if despesas_para_pdf:
        elements.append(PageBreak())
        add_header(elements)
        elements.append(Paragraph("DESPESAS", heading_style))

        despesas_sorted = sorted(despesas_para_pdf, key=lambda d: (d.get('data', ''), d.get('tecnico_nome', '')))

        desp_header = ['Tipo de Despesa', 'Valor', 'Data', 'Descrição']
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
            except Exception:
                data_formatada = data_desp

            descricao = desp.get('descricao', '') or ''
            if len(descricao) > 100:
                descricao = descricao[:97] + '...'

            desp_table_data.append([
                tipo_label,
                f'{valor:.2f}€',
                data_formatada,
                descricao
            ])

        desp_table_data.append([
            'TOTAL DESPESAS:', f'{total_despesas:.2f}€', '', ''
        ])

        desp_col_widths = [4.0*cm, 2.5*cm, 3.0*cm, 14.3*cm]
        desp_table = Table(desp_table_data, colWidths=desp_col_widths, repeatRows=1)
        desp_table.setStyle(TableStyle(make_table_style()))
        elements.append(desp_table)

        # Nota legal
        elements.append(Paragraph(NOTA_LEGAL, legal_style))

        # Total geral (horas + despesas)
        elements.append(Spacer(1, 0.4*cm))
        grande_total = grande_total_horas + total_despesas
        gt_data = [[
            'Subtotal Horas + KM + Dietas:',
            f'{grande_total_horas:.2f}€',
            'Subtotal Despesas:',
            f'{total_despesas:.2f}€',
            'TOTAL GERAL:',
            f'{grande_total:.2f}€'
        ]]
        gt_widths = [4.0*cm, 2.5*cm, 3.5*cm, 2.5*cm, 3.0*cm, 2.5*cm]
        gt_table = Table(gt_data, colWidths=gt_widths)
        gt_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('BACKGROUND', (4, 0), (5, 0), TOTALS_BG),
            ('TEXTCOLOR', (0, 0), (-1, -1), TEXT_BLACK),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('BOX', (0, 0), (-1, -1), 0.4, GRID_COLOR),
            ('INNERGRID', (0, 0), (-1, -1), 0.4, GRID_COLOR),
        ]))
        elements.append(gt_table)

    # ==========================================
    # SECÇÃO 4: IMAGEM DA TABELA DE PREÇOS (última página)
    # ==========================================
    if tabela_preco_image:
        elements.append(PageBreak())
        # Dimensões disponíveis em landscape A4 com margens (doc margins: 0.7cm each side)
        # Also account for title (~0.6cm) + spacers (~0.5cm) + footer (~0.5cm)
        page_w = landscape(A4)[0] - 1.4*cm  # ~28cm available width
        page_h = landscape(A4)[1] - 1.4*cm - 2.0*cm  # ~17cm available height for image

        try:
            from PIL import Image as PILImage
            import io
            if isinstance(tabela_preco_image, bytes):
                img_data = tabela_preco_image
            elif isinstance(tabela_preco_image, str):
                with open(tabela_preco_image, 'rb') as f:
                    img_data = f.read()
            else:
                img_data = tabela_preco_image.read()

            pil_img = PILImage.open(io.BytesIO(img_data))
            img_w, img_h = pil_img.size

            # Calcular escala para maximizar na página disponível
            scale_w = page_w / img_w
            scale_h = page_h / img_h
            scale = min(scale_w, scale_h)

            final_w = img_w * scale
            final_h = img_h * scale

            img_buffer = io.BytesIO(img_data)
            rl_img = RLImage(img_buffer, width=final_w, height=final_h)
            rl_img.hAlign = 'CENTER'

            elements.append(Spacer(1, 0.2*cm))
            elements.append(Paragraph("TABELA DE PREÇOS", title_style))
            elements.append(Spacer(1, 0.3*cm))
            elements.append(rl_img)
        except Exception:
            elements.append(Paragraph("TABELA DE PREÇOS", title_style))
            elements.append(Paragraph("[Imagem não disponível]", normal_style))

    # Rodapé final
    elements.append(Spacer(1, 0.3*cm))
    elements.append(Paragraph(
        f"Documento gerado em {datetime.now().strftime('%d/%m/%Y às %H:%M')}",
        small_style
    ))

    doc.build(elements)
    buffer.seek(0)
    return buffer
