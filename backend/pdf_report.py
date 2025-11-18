"""
Generate PDF monthly report for accounting
"""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from io import BytesIO
from datetime import datetime

def generate_monthly_pdf_report(report_data):
    """
    Generate PDF report from monthly detailed data
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=1*cm, leftMargin=1*cm, topMargin=1*cm, bottomMargin=1*cm)
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Title style
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#1a1a1a'),
        spaceAfter=20,
        alignment=1  # Center
    )
    
    # Subtitle style
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#666666'),
        spaceAfter=10,
        alignment=1
    )
    
    # User info style
    user_style = ParagraphStyle(
        'UserStyle',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.HexColor('#2d3748'),
        spaceAfter=15,
        alignment=1,
        fontName='Helvetica-Bold'
    )
    
    # Add title
    start_date = datetime.strptime(report_data['start_date'], '%Y-%m-%d').strftime('%d/%m/%Y')
    end_date = datetime.strptime(report_data['end_date'], '%Y-%m-%d').strftime('%d/%m/%Y')
    
    # Get user info
    full_name = report_data.get('full_name', report_data.get('username', 'Utilizador'))
    
    elements.append(Paragraph("RELATÓRIO MENSAL DE HORAS", title_style))
    elements.append(Paragraph(f"<b>Colaborador:</b> {full_name}", user_style))
    elements.append(Paragraph(f"Período: {start_date} - {end_date}", subtitle_style))
    elements.append(Spacer(1, 0.5*cm))
    
    # Summary table
    summary = report_data['summary']
    summary_data = [
        ['RESUMO MENSAL', ''],
        ['Total Horas Trabalhadas', format_hours(summary['total_worked_hours'])],
        ['Horas Extras (Dias Úteis)', format_hours(summary['total_overtime_hours'])],
        ['Horas Especiais (Feriados/Fins Semana)', format_hours(summary.get('total_special_hours', 0))],
        ['Subsídio de Alimentação', f"{summary['days_with_meal_allowance']} dias"],
        ['Ajuda de Custos', f"{summary['days_with_travel_allowance']} dias"],
    ]
    
    summary_table = Table(summary_data, colWidths=[10*cm, 8*cm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4a5568')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f7fafc')),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#cbd5e0')),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    
    elements.append(summary_table)
    elements.append(Spacer(1, 0.7*cm))
    
    # Daily records header
    elements.append(Paragraph("REGISTO DIÁRIO DETALHADO", title_style))
    elements.append(Spacer(1, 0.3*cm))
    
    # Daily table headers
    daily_data = [
        ['Data', 'Dia', 'Entradas/Saídas', 'Total', 'H.Extra', 'H.Especiais', 'Pagamento']
    ]
    
    # Add daily records
    for day in report_data['daily_records']:
        date_obj = datetime.strptime(day['date'], '%Y-%m-%d')
        date_str = date_obj.strftime('%d/%m')
        day_of_week = day['day_of_week']
        
        # Status/Entries column
        if day['status'] == 'FOLGA':
            entries_text = '🏖️ FOLGA'
        elif day['status'] == 'FERIADO':
            entries_text = f"🎉 {day.get('holiday_name', 'FERIADO')}"
        elif day['status'] == 'NÃO TRABALHADO':
            entries_text = '❌ Não Trabalhado'
        elif day['status'] == 'TRABALHADO' and day.get('entries'):
            entries_list = []
            for entry in day['entries']:
                if entry.get('start_time') and entry.get('end_time'):
                    start = datetime.fromisoformat(entry['start_time']).strftime('%H:%M')
                    end = datetime.fromisoformat(entry['end_time']).strftime('%H:%M')
                    entries_list.append(f"{start}-{end}")
            entries_text = '\n'.join(entries_list) if entries_list else '-'
        else:
            entries_text = '-'
        
        # Total hours
        total_text = format_hours(day['total_hours']) if day['total_hours'] > 0 else '-'
        
        # Overtime hours (dias úteis)
        overtime_text = format_hours(day['overtime_hours']) if day['overtime_hours'] > 0 else '0h00m'
        
        # Special hours (fins de semana/feriados)
        special_text = format_hours(day.get('special_hours', 0)) if day.get('special_hours', 0) > 0 else '0h00m'
        
        # Payment
        if day.get('payment_type'):
            payment_text = f"{day['payment_type']}\n{day['payment_value']:.0f}€"
            if day.get('location'):
                payment_text += f"\n({day['location']})"
        else:
            payment_text = '-'
        
        daily_data.append([
            date_str,
            day_of_week,
            entries_text,
            total_text,
            overtime_text,
            special_text,
            payment_text
        ])
    
    # Create table with appropriate column widths
    daily_table = Table(daily_data, colWidths=[1.5*cm, 2*cm, 5*cm, 2*cm, 2*cm, 2*cm, 3.5*cm])
    
    # Style the table
    table_style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2d3748')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ALIGN', (0, 1), (1, -1), 'CENTER'),
        ('ALIGN', (3, 1), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f7fafc')]),
    ]
    
    # Color code rows based on status
    for idx, day in enumerate(report_data['daily_records'], start=1):
        if day['status'] == 'FOLGA':
            table_style.append(('BACKGROUND', (0, idx), (-1, idx), colors.HexColor('#e2e8f0')))
        elif day['status'] == 'FERIADO':
            table_style.append(('BACKGROUND', (0, idx), (-1, idx), colors.HexColor('#fef3c7')))
        elif day['status'] == 'TRABALHADO':
            table_style.append(('BACKGROUND', (0, idx), (-1, idx), colors.HexColor('#d1fae5')))
    
    daily_table.setStyle(TableStyle(table_style))
    elements.append(daily_table)
    
    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    return buffer

def format_hours(decimal_hours):
    """Format decimal hours as HH:MM string"""
    if not decimal_hours:
        return '0h00m'
    hours = int(decimal_hours)
    minutes = round((decimal_hours - hours) * 60)
    return f"{hours}h{minutes:02d}m"
