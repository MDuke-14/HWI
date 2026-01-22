"""
Gerador de Manual de Instruções do Sistema HWI Unipessoal
"""

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, ListFlowable, ListItem
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from io import BytesIO
from datetime import datetime


def create_manual_pdf():
    """Gera o PDF do manual de instruções"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    # Estilos
    styles = getSampleStyleSheet()
    
    # Estilo para título principal
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=28,
        spaceAfter=30,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#1e40af'),
        fontName='Helvetica-Bold'
    )
    
    # Estilo para subtítulo
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=14,
        spaceAfter=20,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#64748b')
    )
    
    # Estilo para cabeçalhos de secção
    section_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading1'],
        fontSize=18,
        spaceBefore=20,
        spaceAfter=12,
        textColor=colors.HexColor('#1e40af'),
        fontName='Helvetica-Bold',
        borderPadding=5,
        backColor=colors.HexColor('#eff6ff')
    )
    
    # Estilo para subsecções
    subsection_style = ParagraphStyle(
        'SubsectionHeader',
        parent=styles['Heading2'],
        fontSize=14,
        spaceBefore=15,
        spaceAfter=8,
        textColor=colors.HexColor('#1e3a8a'),
        fontName='Helvetica-Bold'
    )
    
    # Estilo para texto normal
    body_style = ParagraphStyle(
        'CustomBody',
        parent=styles['Normal'],
        fontSize=11,
        spaceAfter=8,
        alignment=TA_JUSTIFY,
        leading=14
    )
    
    # Estilo para notas/dicas
    tip_style = ParagraphStyle(
        'TipStyle',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=10,
        leftIndent=20,
        textColor=colors.HexColor('#059669'),
        backColor=colors.HexColor('#ecfdf5'),
        borderPadding=8
    )
    
    # Estilo para avisos
    warning_style = ParagraphStyle(
        'WarningStyle',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=10,
        leftIndent=20,
        textColor=colors.HexColor('#d97706'),
        backColor=colors.HexColor('#fffbeb'),
        borderPadding=8
    )
    
    # Estilo para lista
    list_style = ParagraphStyle(
        'ListStyle',
        parent=styles['Normal'],
        fontSize=11,
        spaceAfter=4,
        leftIndent=20,
        bulletIndent=10
    )
    
    # Conteúdo
    story = []
    
    # ===== CAPA =====
    story.append(Spacer(1, 3*cm))
    story.append(Paragraph("Manual de Instruções", title_style))
    story.append(Paragraph("Sistema de Gestão HWI Unipessoal", subtitle_style))
    story.append(Spacer(1, 1*cm))
    story.append(Paragraph("Sistema de Relógio de Ponto e Ordens de Trabalho", subtitle_style))
    story.append(Spacer(1, 3*cm))
    
    # Data de geração
    story.append(Paragraph(f"Versão: Janeiro 2026", body_style))
    story.append(Paragraph(f"Gerado em: {datetime.now().strftime('%d/%m/%Y às %H:%M')}", body_style))
    story.append(PageBreak())
    
    # ===== ÍNDICE =====
    story.append(Paragraph("Índice", section_style))
    story.append(Spacer(1, 0.5*cm))
    
    indice = [
        "1. Introdução",
        "2. Acesso ao Sistema",
        "3. Dashboard - Relógio de Ponto",
        "4. Ordens de Trabalho (OTs)",
        "5. Calendário",
        "6. Painel de Administração",
        "7. Notificações",
        "8. Sistema de Ajuda",
        "9. Perguntas Frequentes"
    ]
    
    for item in indice:
        story.append(Paragraph(f"• {item}", list_style))
    
    story.append(PageBreak())
    
    # ===== 1. INTRODUÇÃO =====
    story.append(Paragraph("1. Introdução", section_style))
    story.append(Paragraph(
        "O Sistema de Gestão HWI Unipessoal é uma aplicação web completa para gestão de tempo e ordens de trabalho. "
        "Permite aos colaboradores registar as suas horas de trabalho e aos administradores gerir toda a operação da empresa.",
        body_style
    ))
    story.append(Spacer(1, 0.3*cm))
    
    story.append(Paragraph("Principais Funcionalidades:", subsection_style))
    features = [
        "Relógio de ponto digital com geolocalização",
        "Gestão de Ordens de Trabalho (OTs)",
        "Cronómetros de trabalho e viagem",
        "Sistema de férias e faltas",
        "Geração de relatórios PDF",
        "Folha de horas com tarifário",
        "Sistema de despesas",
        "Calendário de serviços",
        "Notificações push"
    ]
    for f in features:
        story.append(Paragraph(f"• {f}", list_style))
    
    story.append(PageBreak())
    
    # ===== 2. ACESSO AO SISTEMA =====
    story.append(Paragraph("2. Acesso ao Sistema", section_style))
    
    story.append(Paragraph("2.1 Login", subsection_style))
    story.append(Paragraph(
        "Para aceder ao sistema, utilize as suas credenciais fornecidas pelo administrador:",
        body_style
    ))
    story.append(Paragraph("• Insira o seu nome de utilizador", list_style))
    story.append(Paragraph("• Insira a sua palavra-passe", list_style))
    story.append(Paragraph("• Clique em 'Entrar'", list_style))
    
    story.append(Paragraph("2.2 Registo", subsection_style))
    story.append(Paragraph(
        "Se ainda não tem conta, pode registar-se clicando no separador 'Registar'. "
        "Após o registo, um administrador deve aprovar a sua conta.",
        body_style
    ))
    
    story.append(Paragraph("2.3 Recuperação de Password", subsection_style))
    story.append(Paragraph(
        "Se esqueceu a sua palavra-passe, clique em 'Esqueci a senha' e siga as instruções. "
        "Contacte o administrador se necessitar de ajuda adicional.",
        body_style
    ))
    
    story.append(PageBreak())
    
    # ===== 3. DASHBOARD =====
    story.append(Paragraph("3. Dashboard - Relógio de Ponto", section_style))
    
    story.append(Paragraph("3.1 Iniciar Ponto", subsection_style))
    story.append(Paragraph(
        "O botão principal 'Iniciar Ponto' permite registar o início do seu dia de trabalho. "
        "Ao clicar, o sistema captura automaticamente:",
        body_style
    ))
    story.append(Paragraph("• Data e hora atual", list_style))
    story.append(Paragraph("• Localização GPS (se autorizado)", list_style))
    story.append(Paragraph("• Cidade e país (via reverse geocoding)", list_style))
    
    story.append(Paragraph(
        "<b>Dica:</b> Se estiver fora de Portugal, o sistema marca automaticamente 'Fora de Zona de Residência'.",
        tip_style
    ))
    
    story.append(Paragraph("3.2 Pausar e Retomar", subsection_style))
    story.append(Paragraph(
        "Durante o dia pode pausar o ponto (por exemplo, para almoço) e retomar posteriormente. "
        "O tempo de pausa não é contabilizado nas horas trabalhadas.",
        body_style
    ))
    
    story.append(Paragraph("3.3 Parar Ponto", subsection_style))
    story.append(Paragraph(
        "No final do dia, clique em 'Parar Ponto' para encerrar o registo. "
        "Se parar depois das 18:00, o sistema enviará um pedido de autorização de horas extra ao administrador.",
        body_style
    ))
    
    story.append(Paragraph(
        "<b>Aviso:</b> Trabalho após as 18:00 requer autorização do administrador.",
        warning_style
    ))
    
    story.append(Paragraph("3.4 Indicadores no Dashboard", subsection_style))
    story.append(Paragraph("O dashboard mostra informações úteis:", body_style))
    story.append(Paragraph("• Tempo trabalhado hoje", list_style))
    story.append(Paragraph("• Total de horas do mês", list_style))
    story.append(Paragraph("• Dias de férias disponíveis", list_style))
    story.append(Paragraph("• Estado online/offline", list_style))
    story.append(Paragraph("• Localização atual (com link para mapa)", list_style))
    
    story.append(PageBreak())
    
    # ===== 4. ORDENS DE TRABALHO =====
    story.append(Paragraph("4. Ordens de Trabalho (OTs)", section_style))
    
    story.append(Paragraph("4.1 O que é uma OT?", subsection_style))
    story.append(Paragraph(
        "Uma Ordem de Trabalho (OT) é o documento principal que regista toda a informação de uma assistência técnica. "
        "Inclui dados do cliente, equipamento, intervenções realizadas, materiais utilizados, tempo de trabalho e assinaturas.",
        body_style
    ))
    
    story.append(Paragraph("4.2 Criar Nova OT", subsection_style))
    story.append(Paragraph("Para criar uma nova OT:", body_style))
    story.append(Paragraph("1. Clique no botão 'Nova OT'", list_style))
    story.append(Paragraph("2. Selecione ou crie um cliente", list_style))
    story.append(Paragraph("3. Preencha os dados do equipamento", list_style))
    story.append(Paragraph("4. Defina o tipo de serviço (Garantia, Manutenção, etc.)", list_style))
    story.append(Paragraph("5. Clique em 'Criar OT'", list_style))
    
    story.append(Paragraph(
        "<b>Dica:</b> Após criar a OT, aparece um modal para iniciar cronómetro imediatamente.",
        tip_style
    ))
    
    story.append(Paragraph("4.3 Secções da OT", subsection_style))
    
    # Técnicos
    story.append(Paragraph("<b>Técnicos</b>", body_style))
    story.append(Paragraph(
        "Adicione os técnicos que trabalharam nesta OT. Os técnicos adicionados aparecem no PDF e podem ser selecionados na Folha de Horas.",
        body_style
    ))
    
    # Intervenções
    story.append(Paragraph("<b>Intervenções</b>", body_style))
    story.append(Paragraph(
        "Registe todas as intervenções/trabalhos realizados. Seja específico e detalhado para facilitar a compreensão do cliente.",
        body_style
    ))
    
    # Fotografias
    story.append(Paragraph("<b>Fotografias</b>", body_style))
    story.append(Paragraph(
        "Adicione fotografias para documentar o estado do equipamento. Recomenda-se fotos de antes, durante e depois da intervenção.",
        body_style
    ))
    
    # Equipamentos
    story.append(Paragraph("<b>Equipamentos</b>", body_style))
    story.append(Paragraph(
        "Registe os equipamentos intervencionados. Inclua tipologia, marca, modelo e número de série.",
        body_style
    ))
    
    # Materiais
    story.append(Paragraph("<b>Materiais</b>", body_style))
    story.append(Paragraph(
        "Registe os materiais e peças utilizados. Indique a quantidade e quem forneceu (Cliente, HWI ou Cotação). "
        "Se selecionar 'Cotação', é criado automaticamente um Pedido de Cotação.",
        body_style
    ))
    
    story.append(PageBreak())
    
    # Despesas
    story.append(Paragraph("<b>Despesas</b>", body_style))
    story.append(Paragraph(
        "Registe despesas associadas à OT (combustível, portagens, ferramentas, etc.). "
        "Pode anexar facturas/recibos. Os valores são automaticamente preenchidos na Folha de Horas:",
        body_style
    ))
    story.append(Paragraph("• Despesas do tipo 'Portagens' vão para a coluna 'Portagens'", list_style))
    story.append(Paragraph("• Outras despesas vão para a coluna 'Despesas'", list_style))
    
    # Cronómetros
    story.append(Paragraph("<b>Cronómetros</b>", body_style))
    story.append(Paragraph(
        "Registe o tempo de trabalho de cada técnico. Pode usar cronómetro em tempo real ou inserir horas manualmente. "
        "Os códigos horários são:",
        body_style
    ))
    story.append(Paragraph("• 1 = Dias úteis (07h-19h)", list_style))
    story.append(Paragraph("• 2 = Noturno (19h-07h)", list_style))
    story.append(Paragraph("• S = Sábado", list_style))
    story.append(Paragraph("• D = Domingo/Feriado", list_style))
    
    # Assinaturas
    story.append(Paragraph("<b>Assinaturas</b>", body_style))
    story.append(Paragraph(
        "Obtenha a assinatura do cliente para validar o trabalho. A assinatura aparece no PDF como comprovativo.",
        body_style
    ))
    story.append(Paragraph(
        "<b>Dica:</b> Se a assinatura não aparecer no PDF, use o botão 'Refresh' para sincronizar.",
        tip_style
    ))
    
    story.append(Paragraph("4.4 Gerar PDF da OT", subsection_style))
    story.append(Paragraph(
        "Clique no botão 'Gerar PDF' para criar o documento da OT. O PDF inclui todos os dados, "
        "fotografias, materiais e assinaturas. Pode visualizar antes de descarregar.",
        body_style
    ))
    
    story.append(Paragraph("4.5 Folha de Horas", subsection_style))
    story.append(Paragraph(
        "A Folha de Horas é um documento separado que resume o tempo e custos da OT:",
        body_style
    ))
    story.append(Paragraph("1. Clique em 'Folha de Horas'", list_style))
    story.append(Paragraph("2. Selecione os técnicos a incluir", list_style))
    story.append(Paragraph("3. Defina tarifas por técnico (ou deixe automático)", list_style))
    story.append(Paragraph("4. Verifique dietas, portagens e despesas (pré-preenchidas)", list_style))
    story.append(Paragraph("5. Clique em 'Gerar PDF'", list_style))
    
    story.append(PageBreak())
    
    # ===== 5. CALENDÁRIO =====
    story.append(Paragraph("5. Calendário", section_style))
    
    story.append(Paragraph("5.1 Vista Mensal", subsection_style))
    story.append(Paragraph(
        "O calendário mostra uma visão geral dos serviços e disponibilidade da equipa. "
        "Use as setas para navegar entre meses.",
        body_style
    ))
    
    story.append(Paragraph("5.2 Legenda de Cores", subsection_style))
    story.append(Paragraph("• Azul: Serviços agendados", list_style))
    story.append(Paragraph("• Roxo: Férias de colaboradores", list_style))
    story.append(Paragraph("• Âmbar: Feriados nacionais", list_style))
    story.append(Paragraph("• Verde: Dia atual", list_style))
    
    story.append(Paragraph("5.3 Criar Serviço (Admin)", subsection_style))
    story.append(Paragraph(
        "Administradores podem criar novos serviços clicando em 'Novo Serviço'. "
        "Os técnicos selecionados recebem notificação automática.",
        body_style
    ))
    
    story.append(Paragraph("5.4 Detalhes do Dia", subsection_style))
    story.append(Paragraph(
        "Clique em qualquer dia para ver detalhes dos serviços, férias e feriados nesse dia.",
        body_style
    ))
    
    story.append(PageBreak())
    
    # ===== 6. ADMINISTRAÇÃO =====
    story.append(Paragraph("6. Painel de Administração", section_style))
    story.append(Paragraph(
        "O Painel de Administração está disponível apenas para utilizadores com privilégios de administrador.",
        body_style
    ))
    
    story.append(Paragraph("6.1 Férias", subsection_style))
    story.append(Paragraph("Nesta secção pode:", body_style))
    story.append(Paragraph("• Aprovar ou rejeitar pedidos de férias", list_style))
    story.append(Paragraph("• Gerir pedidos de 'Trabalho em Férias'", list_style))
    story.append(Paragraph("• Ver histórico de decisões", list_style))
    
    story.append(Paragraph(
        "<b>Trabalho em Férias:</b> Se aprovar, 1 dia de férias é devolvido ao colaborador. Se rejeitar, a entrada de ponto é eliminada.",
        warning_style
    ))
    
    story.append(Paragraph("6.2 Faltas", subsection_style))
    story.append(Paragraph(
        "Visualize e aprove faltas justificadas e injustificadas. Pode descarregar documentos comprovativos anexados.",
        body_style
    ))
    
    story.append(Paragraph("6.3 Utilizadores", subsection_style))
    story.append(Paragraph("Gestão completa de utilizadores:", body_style))
    story.append(Paragraph("• Criar novos utilizadores", list_style))
    story.append(Paragraph("• Editar dados e privilégios", list_style))
    story.append(Paragraph("• Eliminar utilizadores", list_style))
    story.append(Paragraph("• Verificar e recalcular horas", list_style))
    story.append(Paragraph("• Adicionar entradas manuais", list_style))
    
    story.append(Paragraph("6.4 Notificações", subsection_style))
    story.append(Paragraph(
        "Gerencie o sistema de notificações automáticas e pedidos de autorização de horas extra. "
        "Pode executar verificações manuais e testar notificações push.",
        body_style
    ))
    
    story.append(Paragraph("6.5 Tarifas", subsection_style))
    story.append(Paragraph("Configure as tarifas horárias para a Folha de Horas:", body_style))
    story.append(Paragraph("• Criar novas tarifas com nome e valor por hora", list_style))
    story.append(Paragraph("• Associar a códigos (1, 2, S, D) para aplicação automática", list_style))
    story.append(Paragraph("• Opção 'Manual' para tarifas de seleção manual apenas", list_style))
    
    story.append(Paragraph("6.6 Relatórios", subsection_style))
    story.append(Paragraph(
        "Visualize estatísticas consolidadas de todos os colaboradores. "
        "O período de faturação vai do dia 26 do mês anterior ao dia 25 do mês selecionado.",
        body_style
    ))
    
    story.append(PageBreak())
    
    # ===== 7. NOTIFICAÇÕES =====
    story.append(Paragraph("7. Notificações", section_style))
    
    story.append(Paragraph("7.1 Sino de Notificações", subsection_style))
    story.append(Paragraph(
        "O ícone do sino no canto superior direito mostra o número de notificações não lidas. "
        "Clique para ver todas as notificações.",
        body_style
    ))
    
    story.append(Paragraph("7.2 Tipos de Notificações", subsection_style))
    story.append(Paragraph("• Férias aprovadas/rejeitadas", list_style))
    story.append(Paragraph("• Horas extra autorizadas/rejeitadas", list_style))
    story.append(Paragraph("• Novos serviços atribuídos", list_style))
    story.append(Paragraph("• Lembretes de serviços", list_style))
    story.append(Paragraph("• Novas despesas (admins)", list_style))
    story.append(Paragraph("• Pedidos de cotação (admins)", list_style))
    
    story.append(Paragraph("7.3 Notificações Push", subsection_style))
    story.append(Paragraph(
        "Para receber notificações no seu dispositivo, ative as notificações push clicando no sino e "
        "autorizando quando o browser perguntar.",
        body_style
    ))
    
    story.append(PageBreak())
    
    # ===== 8. SISTEMA DE AJUDA =====
    story.append(Paragraph("8. Sistema de Ajuda", section_style))
    story.append(Paragraph(
        "Em toda a aplicação encontra ícones de ajuda (i) junto aos títulos das secções. "
        "Clique no ícone para abrir uma janela com explicação detalhada da funcionalidade.",
        body_style
    ))
    
    story.append(Paragraph("8.1 Onde Encontrar Ajuda", subsection_style))
    story.append(Paragraph("• Página de OTs: Todos os cards têm ajuda contextual", list_style))
    story.append(Paragraph("• Calendário: Ajuda geral e gestão de serviços", list_style))
    story.append(Paragraph("• Painel Admin: Todos os separadores têm ajuda", list_style))
    
    story.append(Paragraph("8.2 Este Manual", subsection_style))
    story.append(Paragraph(
        "Este manual pode ser descarregado a qualquer momento através do botão 'Manual de Instruções' no Dashboard.",
        body_style
    ))
    
    story.append(PageBreak())
    
    # ===== 9. PERGUNTAS FREQUENTES =====
    story.append(Paragraph("9. Perguntas Frequentes", section_style))
    
    story.append(Paragraph("<b>P: Esqueci a minha password. O que faço?</b>", body_style))
    story.append(Paragraph(
        "R: Contacte o administrador para repor a sua password.",
        body_style
    ))
    story.append(Spacer(1, 0.3*cm))
    
    story.append(Paragraph("<b>P: Não consigo iniciar o ponto. O que fazer?</b>", body_style))
    story.append(Paragraph(
        "R: Verifique a sua ligação à internet. Se o problema persistir, tente atualizar a página ou contacte o suporte.",
        body_style
    ))
    story.append(Spacer(1, 0.3*cm))
    
    story.append(Paragraph("<b>P: As minhas horas extra não aparecem. Porquê?</b>", body_style))
    story.append(Paragraph(
        "R: Horas extra após as 18:00 requerem autorização do administrador. Verifique se o seu pedido foi aprovado.",
        body_style
    ))
    story.append(Spacer(1, 0.3*cm))
    
    story.append(Paragraph("<b>P: Como pedir férias?</b>", body_style))
    story.append(Paragraph(
        "R: No Dashboard, vá à secção de férias, selecione as datas pretendidas e submeta o pedido. Um administrador irá aprovar.",
        body_style
    ))
    story.append(Spacer(1, 0.3*cm))
    
    story.append(Paragraph("<b>P: A assinatura não aparece no PDF da OT.</b>", body_style))
    story.append(Paragraph(
        "R: Use o botão 'Refresh' (ícone de atualização) junto às assinaturas para sincronizar. Depois gere novamente o PDF.",
        body_style
    ))
    story.append(Spacer(1, 0.3*cm))
    
    story.append(Paragraph("<b>P: Como adicionar uma despesa?</b>", body_style))
    story.append(Paragraph(
        "R: Na página da OT, vá ao card 'Despesas', preencha os campos (tipo, descrição, valor, técnico) e clique em 'Adicionar Despesa'.",
        body_style
    ))
    story.append(Spacer(1, 0.3*cm))
    
    story.append(Paragraph("<b>P: Não recebo notificações push.</b>", body_style))
    story.append(Paragraph(
        "R: Verifique se ativou as notificações no sino. Também confirme que o seu browser permite notificações para este site.",
        body_style
    ))
    
    story.append(Spacer(1, 2*cm))
    
    # Rodapé final
    story.append(Paragraph(
        "— Fim do Manual —",
        ParagraphStyle('Footer', parent=styles['Normal'], fontSize=10, alignment=TA_CENTER, textColor=colors.gray)
    ))
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph(
        "HWI Unipessoal, Lda. © 2026 - Todos os direitos reservados",
        ParagraphStyle('Footer2', parent=styles['Normal'], fontSize=9, alignment=TA_CENTER, textColor=colors.gray)
    ))
    
    # Build PDF
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
