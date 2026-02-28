"""
Generate PDF monthly report for accounting
PDF em formato HORIZONTAL (landscape)
"""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from io import BytesIO
from datetime import datetime
import re


def _extrair_localizacao_e_limpar_obs(entries):
    """
    Extrai localização das observações e limpa texto de sistema.
    Retorna (location, observacoes_limpas)
    """
    location = None
    obs_unicas = set()
    
    for entry in entries:
        obs = entry.get('observations') or ''
        
        # Extrair localização do padrão: \nn LOCATION | ou -\nn LOCATION |
        loc_match = re.search(r'\\?n\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]+?)\s*\|', obs)
        if not loc_match:
            loc_match = re.search(r'\nn\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]+?)\s*\|', obs)
        if loc_match and not location:
            location = loc_match.group(1).strip()
        
        # Remover todos os textos automáticos do sistema
        cleaned = obs
        # Remover padrão de localização
        cleaned = re.sub(r'-?\s*\\?n\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]+?\s*\|', '', cleaned)
        cleaned = re.sub(r'\nn\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]+?\s*\|', '', cleaned)
        # Remover textos de importação
        cleaned = re.sub(r'Importado de (PDF|Excel) \(entrada \d+/\d+\)', '', cleaned)
        # Remover textos de mobile
        cleaned = re.sub(r'Entrada via mobile', '', cleaned)
        cleaned = re.sub(r'\[Ao finalizar\]:\s*Saída via mobile', '', cleaned)
        cleaned = re.sub(r'Saída via mobile', '', cleaned)
        # Remover textos de admin
        cleaned = re.sub(r'\[Iniciado por admin:.*?\]', '', cleaned)
        cleaned = re.sub(r'\[Finalizado por admin.*?\]', '', cleaned)
        cleaned = re.sub(r'\[Finalizado por admnin.*?\]', '', cleaned)
        cleaned = re.sub(r'\[Dia oferecido pelo admin.*?\]', '', cleaned)
        cleaned = re.sub(r'Entrada manual \d+/\d+ pelo administrador', '', cleaned)
        # Remover "Teste geolocalização"
        cleaned = re.sub(r'Teste geolocalização.*', '', cleaned)
        # Limpar separadores e espaços
        cleaned = re.sub(r'\s*\|\s*', ' ', cleaned)
        cleaned = re.sub(r'\s*-\s*$', '', cleaned)
        cleaned = re.sub(r'^\s*-\s*', '', cleaned)
        cleaned = re.sub(r'\n+', ' ', cleaned)
        cleaned = cleaned.strip()
        
        # Tratar "Ajustado por admin"
        ajuste = re.search(r'Ajustado por admin \((\d{2}:\d{2})\)', cleaned)
        if ajuste:
            cleaned = f"Ajustado por admin ({ajuste.group(1)})"
        
        # Tratar "Continuação do registo anterior"
        if 'Continuação do registo anterior' in cleaned:
            cleaned = 'Continuação do registo anterior'
        
        # Tratar "Férias"
        if cleaned == 'Férias':
            cleaned = ''
        
        if cleaned:
            obs_unicas.add(cleaned)
    
    # Remover observações vazias
    obs_limpas = [o for o in obs_unicas if o]
    return location, ' | '.join(obs_limpas) if obs_limpas else '-'


def generate_monthly_pdf_report(report_data):
    """
    Generate PDF report from monthly detailed data - LANDSCAPE
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        rightMargin=1*cm,
        leftMargin=1*cm,
        topMargin=1*cm,
        bottomMargin=1*cm
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle', parent=styles['Heading1'],
        fontSize=16, textColor=colors.HexColor('#1a1a1a'),
        spaceAfter=20, alignment=1
    )
    subtitle_style = ParagraphStyle(
        'CustomSubtitle', parent=styles['Normal'],
        fontSize=10, textColor=colors.HexColor('#666666'),
        spaceAfter=10, alignment=1
    )
    user_style = ParagraphStyle(
        'UserStyle', parent=styles['Normal'],
        fontSize=12, textColor=colors.HexColor('#2d3748'),
        spaceAfter=15, alignment=1, fontName='Helvetica-Bold'
    )
    
    # Logo
    from pathlib import Path
    from reportlab.platypus import Image as RLImage
    
    logo_path = Path(__file__).parent / "assets" / "hwi_logo.png"
    if logo_path.exists():
        logo = RLImage(str(logo_path), width=6*cm, height=2*cm)
        elements.append(logo)
        elements.append(Spacer(1, 0.3*cm))
    
    # Header
    start_date = datetime.strptime(report_data['start_date'], '%Y-%m-%d').strftime('%d/%m/%Y')
    end_date = datetime.strptime(report_data['end_date'], '%Y-%m-%d').strftime('%d/%m/%Y')
    full_name = report_data.get('full_name', report_data.get('username', 'Utilizador'))
    
    elements.append(Paragraph("RELATÓRIO MENSAL DE HORAS", title_style))
    elements.append(Paragraph(f"<b>Colaborador:</b> {full_name}", user_style))
    elements.append(Paragraph(f"Período: {start_date} - {end_date}", subtitle_style))
    elements.append(Spacer(1, 0.3*cm))
    
    # Summary table
    summary = report_data['summary']
    summary_data = [
        ['RESUMO MENSAL', ''],
        ['Total Horas Trabalhadas', format_hours(summary['total_worked_hours'])],
        ['Trabalho Suplementar (Dias Úteis)', format_hours(summary['total_overtime_hours'])],
        ['Trabalho Suplementar (Sáb/Dom/Feriados)', format_hours(summary.get('total_special_hours', 0))],
        ['SA (Subsídio de Alimentação)', f"{summary['days_with_meal_allowance']} dias"],
        ['ADC (Ajuda de Custos)', f"{summary['days_with_travel_allowance']} dias"],
        ['', ''],
        ['GESTÃO DE FÉRIAS', ''],
        ['Dias de Férias Gozados (até {})'.format(report_data['end_date']), f"{summary.get('vacation_days_used', 0)} dias"],
        ['Dias de Férias Disponíveis', f"{summary.get('vacation_days_available', 0)} dias"],
        ['Total Anual de Férias', f"{summary.get('vacation_entitlement', 22)} dias"],
    ]
    
    summary_table = Table(summary_data, colWidths=[14*cm, 8*cm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6b7280')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f7fafc')),
        ('BACKGROUND', (0, 7), (-1, 7), colors.HexColor('#6b7280')),
        ('TEXTCOLOR', (0, 7), (-1, 7), colors.white),
        ('FONTNAME', (0, 7), (-1, 7), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#cbd5e0')),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    
    elements.append(summary_table)
    elements.append(Spacer(1, 0.7*cm))
    
    # Daily records header
    elements.append(Paragraph("REGISTO DIÁRIO DETALHADO", title_style))
    elements.append(Spacer(1, 0.3*cm))
    
    # Daily table
    daily_data = [
        ['Data', 'Dia', 'Entradas/Saídas', 'Total', 'Trab.Supl.', 'Observações', 'Pagamento']
    ]
    
    for day in report_data['daily_records']:
        date_obj = datetime.strptime(day['date'], '%Y-%m-%d')
        date_str = date_obj.strftime('%d/%m')
        day_of_week = day['day_of_week']
        justification = day.get('justification')
        
        # Default values for non-worked days
        entries_text = '-'
        observations_text = justification if justification else '-'
        
        if day['status'] == 'FOLGA':
            entries_text = 'FOLGA'
        elif day['status'] == 'FERIADO':
            entries_text = 'FERIADO'
        elif day['status'] == 'FÉRIAS':
            entries_text = 'FÉRIAS'
        elif day['status'] == 'FALTA':
            entries_text = 'FALTA'
        elif day['status'] == 'NÃO TRABALHADO':
            entries_text = 'N/T'
        elif day['status'] == 'TRABALHADO' and day.get('entries'):
            entries_list = []
            for entry in day['entries']:
                if entry.get('start_time') and entry.get('end_time'):
                    start = datetime.fromisoformat(entry['start_time']).strftime('%H:%M')
                    end = datetime.fromisoformat(entry['end_time']).strftime('%H:%M')
                    entries_list.append(f"{start}-{end}")
            
            entries_text = '\n'.join(entries_list) if entries_list else '-'
            
            # Extrair localização das obs e limpar observações
            extracted_location, clean_obs = _extrair_localizacao_e_limpar_obs(day['entries'])
            observations_text = clean_obs
        
        # Total / Overtime
        total_text = format_hours(day['total_hours']) if day.get('total_hours', 0) > 0 else '-'
        ot = (day.get('overtime_hours', 0) or 0) + (day.get('saturday_hours', 0) or 0)
        overtime_text = format_hours(ot) if ot > 0 else '-'
        
        # Pagamento: SA ou ADC + localização (município)
        payment_parts = []
        if day.get('payment_type'):
            label = 'ADC' if day['payment_type'] == 'Ajuda de Custos' else 'SA'
            payment_parts.append(label)
        
        # Localização: primeiro day.location, depois extraída das observações
        loc = day.get('location')
        if loc:
            municipio = loc.split(',')[0].strip()
            payment_parts.append(municipio)
        elif day['status'] == 'TRABALHADO' and day.get('entries'):
            extracted_location, _ = _extrair_localizacao_e_limpar_obs(day['entries'])
            if extracted_location:
                payment_parts.append(extracted_location)
        
        payment_text = '\n'.join(payment_parts) if payment_parts else '-'
        
        daily_data.append([
            date_str, day_of_week, entries_text, total_text,
            overtime_text, observations_text, payment_text
        ])
    
    # Column widths for landscape (~27.7cm usable)
    daily_table = Table(daily_data, colWidths=[1.5*cm, 2*cm, 5*cm, 2*cm, 2*cm, 9*cm, 4*cm])
    
    table_style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6b7280')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ALIGN', (0, 1), (1, -1), 'CENTER'),
        ('ALIGN', (3, 1), (4, -1), 'CENTER'),
        ('ALIGN', (6, 0), (6, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f7fafc')]),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 1), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 4),
    ]
    
    # Color rows by status
    for idx, day in enumerate(report_data['daily_records'], start=1):
        if day['status'] == 'FOLGA':
            table_style.append(('BACKGROUND', (0, idx), (-1, idx), colors.HexColor('#e2e8f0')))
        elif day['status'] == 'FERIADO':
            table_style.append(('BACKGROUND', (0, idx), (-1, idx), colors.HexColor('#fef3c7')))
        elif day['status'] == 'FÉRIAS':
            table_style.append(('BACKGROUND', (0, idx), (-1, idx), colors.HexColor('#dbeafe')))
        elif day['status'] == 'FALTA':
            table_style.append(('BACKGROUND', (0, idx), (-1, idx), colors.HexColor('#fee2e2')))
        elif day['status'] == 'TRABALHADO':
            table_style.append(('BACKGROUND', (0, idx), (-1, idx), colors.HexColor('#d1fae5')))
    
    daily_table.setStyle(TableStyle(table_style))
    elements.append(daily_table)
    
    doc.build(elements)
    buffer.seek(0)
    return buffer


def format_hours(decimal_hours):
    if not decimal_hours:
        return '0h00m'
    hours = int(decimal_hours)
    minutes = round((decimal_hours - hours) * 60)
    return f"{hours}h{minutes:02d}m"
