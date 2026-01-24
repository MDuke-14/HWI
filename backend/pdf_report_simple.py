"""
PDF Mensal SIMPLIFICADO - Geração garantida
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from io import BytesIO
from datetime import datetime
from pathlib import Path

def format_hours_simple(hours):
    """Converter horas para formato HhMM"""
    if hours == 0:
        return "0h00m"
    h = int(hours)
    m = int((hours - h) * 60)
    return f"{h}h{m:02d}m"

def generate_monthly_pdf_report(report_data):
    """Gerar PDF mensal simples e funcional"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=1*cm, bottomMargin=1*cm, leftMargin=1*cm, rightMargin=1*cm)
    elements = []
    styles = getSampleStyleSheet()
    
    # Logo
    logo_path = Path(__file__).parent / "assets" / "hwi_logo.png"
    if logo_path.exists():
        try:
            from reportlab.platypus import Image as RLImage
            logo = RLImage(str(logo_path), width=6*cm, height=2*cm)
            elements.append(logo)
            elements.append(Spacer(1, 0.3*cm))
        except:
            pass
    
    # Título
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=16, alignment=1)
    elements.append(Paragraph("RELATÓRIO MENSAL DE HORAS", title_style))
    
    # Nome
    nome = report_data.get('full_name') or report_data.get('username', 'Utilizador')
    elements.append(Paragraph(f"<b>Colaborador:</b> {nome}", styles['Normal']))
    
    # Período
    start = datetime.strptime(report_data['start_date'], '%Y-%m-%d').strftime('%d/%m/%Y')
    end = datetime.strptime(report_data['end_date'], '%Y-%m-%d').strftime('%d/%m/%Y')
    elements.append(Paragraph(f"<b>Período:</b> {start} - {end}", styles['Normal']))
    elements.append(Spacer(1, 0.5*cm))
    
    # Resumo
    summary = report_data['summary']
    summary_data = [
        ['RESUMO MENSAL', ''],
        ['Total Horas', format_hours_simple(summary.get('total_worked_hours', 0))],
        ['Horas Extras (Dias Úteis)', format_hours_simple(summary.get('total_overtime_hours', 0))],
        ['Horas Sábados', format_hours_simple(summary.get('total_saturday_hours', 0))],
        ['Horas Domingos/Feriados', format_hours_simple(summary.get('total_special_hours', 0))],
        ['Subsídio Alimentação', f"{summary.get('days_with_meal_allowance', 0)} dias"],
        ['Ajuda Custos', f"{summary.get('days_with_travel_allowance', 0)} dias"]
    ]
    
    summary_table = Table(summary_data, colWidths=[8*cm, 6*cm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6b7280')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 0.5*cm))
    
    # Tabela diária
    daily_data = [['Data', 'Dia', 'Horas', 'Status']]
    
    for day in report_data['daily_records']:
        try:
            date_obj = datetime.strptime(day['date'], '%Y-%m-%d')
            date_str = date_obj.strftime('%d/%m')
            day_week = day.get('day_of_week', '')
            
            if day['status'] == 'TRABALHADO':
                hours = format_hours_simple(day.get('total_hours', 0))
                status = 'Trabalhou'
            else:
                hours = '-'
                status = day['status']
            
            daily_data.append([date_str, day_week, hours, status])
        except:
            continue
    
    daily_table = Table(daily_data, colWidths=[2*cm, 3*cm, 3*cm, 6*cm])
    daily_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    elements.append(daily_table)
    
    # Construir PDF
    doc.build(elements)
    buffer.seek(0)
    return buffer
