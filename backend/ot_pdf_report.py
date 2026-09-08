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
import logging
import pytz
from collections import defaultdict
from xml.sax.saxutils import escape as _xml_escape

LISBON_TZ = pytz.timezone('Europe/Lisbon')


def _pe(text):
    """Paragraph-escape: escapa caracteres XML problemáticos para ReportLab Paragraph.
    
    ReportLab usa mini-XML internamente. Sem escape, caracteres `<`, `>`, `&`
    digitados pelo utilizador (ex: "AC&DC", "5 < 10 horas", "<urgente>") fazem
    a geração do PDF rebentar com `ParaParser syntax error`.
    
    NÃO escapa `\\n` → mantém-se "<br/>" se for chamado APÓS o replace.
    """
    if text is None:
        return ''
    if not isinstance(text, str):
        text = str(text)
    # escape() escapa &, <, > — não toca em "<br/>" se chamado antes do replace
    # Por isso fazemos: 1) escape, 2) restaurar <br/> se existir
    escaped = _xml_escape(text)
    # Permitir tags whitelisted (<br/>, <b>, </b>, <i>, </i>) caso o caller queira
    # Convertemos &lt;br/&gt; → <br/> só se foi escapado por nós
    # SIMPLES: o caller que quiser <br/> chama replace('\n', '<br/>') APÓS este escape
    return escaped


def _pe_with_nl(text):
    """Como _pe mas converte \\n → <br/>. Uso típico em campos multi-linha (motivo, relatórios)."""
    if text is None:
        return ''
    if not isinstance(text, str):
        text = str(text)
    return _xml_escape(text).replace('\n', '<br/>').replace('\r', '')


try:
    from PIL import Image as PILImage
    _PIL_OK = True
except Exception:
    _PIL_OK = False


# Limite acima do qual uma foto é comprimida antes de ser embutida no PDF.
# A 7.5cm × 5cm no PDF final, 1400px já é mais que suficiente para impressão de alta qualidade.
# Threshold baixo (500KB) garante PDFs leves e geração rápida mesmo em pods com pouca RAM —
# CRÍTICO: estes PDFs vão para clientes anexados às faturas, não podem falhar nem ser pesados.
# ============================================================================
# Thumbnails 200x200 para fotos no PDF (todas as FS — qualquer tamanho).
# Decisão de produto: as fotos do PDF são thumbnails de referência rápida.
# Fotos em HD continuam acessíveis via ZIP separado em FS huge_fs (>50 fotos).
# Impacto: pico de memória cai radicalmente (~15MB total para 95 fotos vs 1GB).
# ============================================================================
PHOTO_COMPRESS_THRESHOLD_BYTES = 100 * 1024  # 100 KB
PHOTO_THUMB_MAX_DIMENSION_PX = 200  # tamanho fixo dos thumbnails no PDF
PHOTO_THUMB_JPEG_QUALITY = 75
# Tier "huge" mantém-se SÓ para activar o ZIP wrapper com fotos HD originais.
HUGE_FS_PHOTO_COUNT = 50


def _safe_image_from_base64(b64_str, width_cm, height_cm, context="photo", large_fs=False, huge_fs=False):
    """
    Cria um RLImage thumbnail (200x200) a partir de base64.
    - Sempre 200px max + JPEG q75 (decisão de produto: PDF usa thumbnails)
    - Fotos HD continuam acessíveis no ZIP separado em FS huge_fs
    - Devolve None se qualquer coisa falhar (nunca rebenta)
    """
    if not b64_str or not _PIL_OK:
        return None
    max_dim = PHOTO_THUMB_MAX_DIMENSION_PX
    quality = PHOTO_THUMB_JPEG_QUALITY
    try:
        # 1. Decode base64 (pode ter prefixo "data:image/...;base64,")
        if isinstance(b64_str, str) and "," in b64_str[:64] and b64_str.lstrip().startswith("data:"):
            b64_str = b64_str.split(",", 1)[1]
        raw = base64.b64decode(b64_str, validate=False)
        if not raw or len(raw) < 100:
            logging.warning(f"[PDF] Foto {context}: bytes vazios/muito pequenos ({len(raw)} bytes) — skip")
            return None
        # 2. Validar com PIL
        img = PILImage.open(BytesIO(raw))
        img.verify()  # detecta corrupção
        # Reabrir porque verify() fecha
        img = PILImage.open(BytesIO(raw))
        try:
            from PIL import ImageOps
            img = ImageOps.exif_transpose(img)
        except Exception:
            pass
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")
        elif img.mode != "RGB":
            img = img.convert("RGB")
        # 3. Redimensionar se muito grande OU se ficheiro > 500KB
        should_resize = (
            max(img.size) > max_dim
            or len(raw) > PHOTO_COMPRESS_THRESHOLD_BYTES
        )
        if should_resize:
            w, h = img.size
            m = max(w, h)
            if m > max_dim:
                scale = max_dim / m
                img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), PILImage.LANCZOS)
        # 4. Re-encode sempre como JPEG optimizado
        out = BytesIO()
        img.save(out, format="JPEG", quality=quality, optimize=True)
        out.seek(0)
        final_bytes = out.getvalue()
        if should_resize:
            logging.info(
                f"[PDF] Foto {context}: {len(raw)/1024:.0f}KB → {len(final_bytes)/1024:.0f}KB"
                + (" (huge_fs)" if huge_fs else (" (large_fs)" if large_fs else ""))
            )
        # Libertar referências grandes antes de retornar
        try:
            img.close()
        except Exception:
            pass
        del img, raw, out
        # 5. Criar RLImage
        return RLImage(BytesIO(final_bytes), width=width_cm, height=height_cm, kind='proportional')
    except Exception as e:
        logging.warning(f"[PDF] Foto {context}: falhou ({type(e).__name__}: {e}) — skip")
        return None


def _safe_image_from_path(path, width_cm, height_cm, context="photo"):
    """RLImage a partir de path em disco, 100% seguro."""
    try:
        p = Path(path) if path else None
        if not p or not p.exists() or p.stat().st_size < 100:
            return None
        return RLImage(str(p), width=width_cm, height=height_cm, kind='proportional')
    except Exception as e:
        logging.warning(f"[PDF] Foto path {context}: falhou ({type(e).__name__}: {e}) — skip")
        return None


def generate_ot_pdf(relatorio, cliente, intervencoes, tecnicos, fotografias, assinaturas, equipamentos_adicionais=None, materiais=None, registos_mao_obra=None, company_info=None, relatorios_assistencia=None, output_file=None):
    """
    Gera PDF completo de uma Folha de Serviço
    Layout baseado na visualização HTML, organizado por data de intervenção

    Args:
        output_file: opcional. Se fornecido (path string ou file-like),
            ReportLab escreve directamente nesse destino (permite streaming
            via tempfile). Se None (default), devolve um BytesIO em memória.
    """
    import gc as _gc

    # Detectar FS "enorme" — apenas para activar o ZIP wrapper externo com
    # fotos HD originais. As thumbnails no PDF têm sempre 200px (decisão de
    # produto), pelo que o pico de memória já é baixo independentemente do
    # número de fotos.
    _n_fotos = len(fotografias) if fotografias else 0
    _is_huge_fs = _n_fotos >= HUGE_FS_PHOTO_COUNT
    _is_large_fs = _is_huge_fs  # legado: passado para _safe_image_from_base64 mas sem efeito agora
    if _is_huge_fs:
        logging.info(f"[PDF] FS com {_n_fotos} fotos — PDF terá thumbnails 200px + ZIP separado com HD")
    elif _n_fotos >= 20:
        logging.info(f"[PDF] FS com {_n_fotos} fotos — usar thumbnails 200px no PDF")
    if output_file is not None:
        buffer = None
        doc_target = output_file
    else:
        buffer = BytesIO()
        doc_target = buffer
    doc = SimpleDocTemplate(doc_target, pagesize=A4, topMargin=0.6*cm, bottomMargin=0.6*cm, leftMargin=0.8*cm, rightMargin=0.8*cm)
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
        textColor=colors.HexColor('#cccccc'),  # gray-300
        spaceAfter=0,
        spaceBefore=0
    )
    
    # Títulos de secção
    section_title_style = ParagraphStyle(
        'SectionTitle',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.HexColor('#111111'),  # gray-800
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
        textColor=colors.HexColor('#111111')  # gray-700
    )
    
    # Labels
    label_style = ParagraphStyle(
        'LabelStyle',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#666666'),  # gray-500
        fontName='Helvetica-Bold'
    )
    
    # Valores
    value_style = ParagraphStyle(
        'ValueStyle',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#111111'),  # gray-800
    )
    
    # Descrição de foto
    foto_desc_style = ParagraphStyle(
        'FotoDescStyle',
        parent=styles['Normal'],
        fontSize=7,
        textColor=colors.HexColor('#666666'),
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
            except Exception:
                try:
                    dt = datetime.strptime(date_str, '%d/%m/%Y')
                    return dt.strftime('%Y-%m-%d')
                except Exception:
                    return date_str[:10] if len(date_str) >= 10 else date_str
        return None
    
    def format_date_display(date_str):
        """Formata data para exibição DD/MM/YYYY"""
        if not date_str:
            return 'N/A'
        try:
            dt = datetime.strptime(date_str, '%Y-%m-%d')
            return dt.strftime('%d/%m/%Y')
        except Exception:
            return date_str
    
    def create_section_box(content_elements, title=None, allow_split=True):
        """Cria uma caixa de secção - SEMPRE permite split para evitar erro 'too large'"""
        # NUNCA usar tabela envolvente - sempre permitir quebra de página
        result = []
        if title:
            result.append(Paragraph(title, section_title_style))
            result.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#cccccc'), spaceAfter=6))
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
                if logo_url.startswith('/uploads/'):
                    logo_path = f"/app{logo_url}"
                elif not logo_url.startswith('http'):
                    logo_path = f"/app/uploads/{logo_url}"
                else:
                    logo_path = logo_url
                
                if os.path.exists(logo_path):
                    logo_element = RLImage(logo_path, width=5*cm, height=1.44*cm)
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
                    logo_element = RLImage(logo_path, width=5*cm, height=1.44*cm)
                    break
                except Exception:
                    continue
    
    # Formatar data de serviço
    data_servico = relatorio.get('data_servico', '')
    if isinstance(data_servico, str) and data_servico:
        try:
            data_servico = datetime.fromisoformat(data_servico).strftime('%d/%m/%Y')
        except Exception:
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
    
    # Construir cabeçalho unificado com logo no fundo escuro
    header_left = [
        [Paragraph("RELATÓRIO TÉCNICO", header_title_style)],
        [Paragraph(f"Folha de Serviço #{relatorio.get('numero_assistencia', 'N/A')}", header_subtitle_style)]
    ]
    
    header_right = [
        [Paragraph(f"Data: {data_servico}", header_subtitle_style)],
        [Paragraph(f"Estado: {status_text}", header_subtitle_style)]
    ]
    
    if logo_element:
        # Logo à esquerda, título ao centro, info à direita
        header_table = Table([
            [logo_element, Table(header_left), Table(header_right)]
        ], colWidths=[5.5*cm, 7.5*cm, 5*cm])
    else:
        header_table = Table([
            [Table(header_left), Table(header_right)]
        ], colWidths=[12*cm, 6*cm])
    
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#333333')),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (-1, 0), (-1, 0), 'RIGHT'),
    ]))
    
    elements.append(header_table)
    elements.append(Spacer(1, 0.4*cm))
    
    # ========== INFORMAÇÕES DO CLIENTE ==========
    
    client_grid = [
        [Paragraph("Cliente:", label_style), Paragraph(_pe(cliente.get('nome', 'N/A')), value_style),
         Paragraph("Pedido por:", label_style), Paragraph(_pe(relatorio.get('pedido_por', '-') or '-'), value_style)],
        [Paragraph("Local:", label_style), Paragraph(_pe(relatorio.get('local_intervencao', '-') or '-'), value_style),
         Paragraph("", label_style), Paragraph("", value_style)],
    ]
    
    # Referência interna do cliente
    ref_interna = relatorio.get('referencia_interna_cliente')
    if ref_interna:
        client_grid.append([
            Paragraph("Ref. Interna:", label_style),
            Paragraph(_pe(ref_interna), ParagraphStyle('RefInternaStyle', parent=value_style, fontName='Helvetica-Bold')),
            Paragraph("", label_style), Paragraph("", value_style)
        ])
    
    # Adicionar FS Relacionada se existir
    ot_rel_numero = relatorio.get('ot_relacionada_numero')
    if ot_rel_numero:
        client_grid.append([
            Paragraph("FS Relacionada:", label_style),
            Paragraph(f"FS #{_pe(ot_rel_numero)}", ParagraphStyle('OTRelLink', parent=value_style, textColor=colors.HexColor('#555555'))),
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
                Paragraph(_pe(tipologia), value_style)
            ])
        
        if marca:
            equip_data.append([
                Paragraph("<b>Marca:</b>", label_style),
                Paragraph(_pe(marca), value_style)
            ])
        
        if modelo:
            equip_data.append([
                Paragraph("<b>Modelo:</b>", label_style),
                Paragraph(_pe(modelo), value_style)
            ])
        
        # Nº Série aparece sempre
        equip_data.append([
            Paragraph("<b>Nº Série:</b>", label_style),
            Paragraph(_pe(numero_serie) if numero_serie else "Sem Dados", value_style)
        ])
        
        if ano_fabrico:
            equip_data.append([
                Paragraph("<b>Ano:</b>", label_style),
                Paragraph(_pe(format_ano_fabrico(ano_fabrico)), value_style)
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
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f7f7f7')),  # gray-50
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
        ]))
        
        return eq_table
    
    # ========== PREPARAR DADOS AUXILIARES ==========
    
    assinaturas_list = []
    if assinaturas:
        if isinstance(assinaturas, dict):
            assinaturas_list = [assinaturas]
        else:
            assinaturas_list = assinaturas if assinaturas else []
    
    # ========== GERAR BLOCOS POR INTERVENÇÃO (ABA) ==========
    
    # Se não houver intervenções, criar uma intervenção genérica
    if not intervencoes:
        intervencoes = [{"data_intervencao": relatorio.get("data_servico"), "motivo_assistencia": relatorio.get("motivo_assistencia", "")}]
    
    for intervention_num, interv in enumerate(intervencoes, 1):
        interv_date = normalize_date(interv.get('data_intervencao'))
        date_display = format_date_display(interv_date) if interv_date else 'Sem Data'
        
        # Cabeçalho da intervenção (fundo cinza escuro, ou vermelho se herdada)
        is_herdada = bool(interv.get('herdada_de_intervencao_id'))
        herdada_fs = interv.get('herdada_de_fs_numero')
        if is_herdada:
            extra = f' &nbsp;|&nbsp; <font color="#FFFFFF">HERDADA DE FS #{herdada_fs}</font>' if herdada_fs else ' &nbsp;|&nbsp; <font color="#FFFFFF">HERDADA</font>'
        else:
            extra = ''
        date_header_text = f"INTERVENÇÃO #{intervention_num} - {date_display}{extra}"
        
        bg_color = '#dc2626' if is_herdada else '#555555'
        date_header = Table([[Paragraph(date_header_text, intervention_title_style)]], colWidths=[18.4*cm])
        date_header.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(bg_color)),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ]))
        elements.append(date_header)
        elements.append(Spacer(1, 0.2*cm))
        
        # ---- Calcular Relatórios de Assistência desta intervenção (usados para equipamentos e texto) ----
        interv_id = interv.get('id')
        date_rel_assist = []
        if relatorios_assistencia:
            for ra in relatorios_assistencia:
                ra_interv_id = ra.get('intervencao_id')
                if ra_interv_id and interv_id:
                    if ra_interv_id == interv_id:
                        date_rel_assist.append(ra)
                elif not ra_interv_id:
                    # Fallback por data para relatórios antigos
                    if normalize_date(ra.get('data_intervencao')) == interv_date:
                        date_rel_assist.append(ra)
        
        # ---- Equipamentos desta intervenção (antes de Motivo e Relatório de Assistência) ----
        # Mesma lógica do card "Equipamento" no frontend:
        #  1) `activeEq` — equipamento apontado por `interv.equipamento_id`.
        #  2) `intervEqs` — restantes em `equipamentos_adicionais` com
        #     `intervencao_id == interv.id` (excluindo o principal).
        #  3) `unassignedEqs` — equipamentos sem `intervencao_id` são mostrados
        #     APENAS na primeira intervenção.
        interv_equip_cards = []
        seen_equip_keys = set()

        def _add_card(eq_obj, is_principal=False):
            card = create_equipment_card(
                tipologia=eq_obj.get('tipologia'),
                marca=eq_obj.get('marca'),
                modelo=eq_obj.get('modelo'),
                numero_serie=eq_obj.get('numero_serie'),
                ano_fabrico=eq_obj.get('ano_fabrico'),
                horas_funcionamento=eq_obj.get('horas_funcionamento'),
                is_principal=is_principal,
            )
            if card:
                interv_equip_cards.append(card)

        interv_id_local = interv.get('id')
        active_eq_id = interv.get('equipamento_id')

        # 1) Equipamento principal desta intervenção
        if active_eq_id and equipamentos_adicionais:
            active_eq = next((e for e in equipamentos_adicionais if e.get('id') == active_eq_id), None)
            if active_eq:
                _add_card(active_eq)
                seen_equip_keys.add(active_eq.get('id'))

        # 2) Equipamentos associados por intervencao_id (excluindo o principal)
        for eq in (equipamentos_adicionais or []):
            if eq.get('id') in seen_equip_keys:
                continue
            if eq.get('intervencao_id') == interv_id_local and interv_id_local:
                _add_card(eq)
                seen_equip_keys.add(eq.get('id'))

        # 3) Só na 1ª intervenção: mostrar equipamentos sem intervencao_id.
        #    Inclui também o equipamento "principal" da FS (campos raiz) para não
        #    perder dados de FS antigas que só o guardam aí.
        if intervention_num == 1:
            # Equipamento raiz (principal da FS)
            root_serial = relatorio.get('equipamento_numero_serie')
            root_marca = relatorio.get('equipamento_marca')
            root_modelo = relatorio.get('equipamento_modelo')
            root_tipologia = relatorio.get('equipamento_tipologia')
            if any([root_serial, root_marca, root_modelo, root_tipologia]):
                # Evita duplicado se já foi adicionado por número de série
                already = any(
                    (root_serial and (e.get('numero_serie') == root_serial))
                    for e in (equipamentos_adicionais or [])
                    if e.get('id') in seen_equip_keys
                )
                if not already:
                    _add_card({
                        'tipologia': root_tipologia,
                        'marca': root_marca,
                        'modelo': root_modelo,
                        'numero_serie': root_serial,
                        'ano_fabrico': relatorio.get('equipamento_ano_fabrico'),
                        'horas_funcionamento': relatorio.get('equipamento_horas_funcionamento'),
                    }, is_principal=True)

            # Equipamentos_adicionais sem intervencao_id
            for eq in (equipamentos_adicionais or []):
                if eq.get('id') in seen_equip_keys:
                    continue
                if not eq.get('intervencao_id'):
                    _add_card(eq)
                    seen_equip_keys.add(eq.get('id'))
        
        if interv_equip_cards:
            equip_block = []
            for card in interv_equip_cards:
                equip_block.append(card)
                equip_block.append(Spacer(1, 0.15*cm))
            equip_section = create_section_box(equip_block, "EQUIPAMENTO(S)")
            add_section_to_elements(elements, equip_section)
            elements.append(Spacer(1, 0.2*cm))
        
        # ---- Detalhes da intervenção ----
        interv_content = []
        
        # Equipamento relacionado
        if interv.get('equipamento_id') and equipamentos_adicionais:
            equip_rel = next((e for e in equipamentos_adicionais if e.get('id') == interv.get('equipamento_id')), None)
            if equip_rel:
                equip_desc = f"{equip_rel.get('tipologia', '')} - {equip_rel.get('marca', '')} {equip_rel.get('modelo', '')}"
                if equip_rel.get('numero_serie'):
                    equip_desc += f" (S/N: {equip_rel.get('numero_serie')})"
                interv_content.append(Paragraph(f"<b>Equipamento:</b> {_pe(equip_desc)}", normal_style))
        
        if interv.get('motivo_assistencia'):
            motivo_text = _pe_with_nl(interv.get('motivo_assistencia', ''))
            interv_content.append(Paragraph(f"<b>Motivo:</b> {motivo_text}", normal_style))
        
        if interv_content:
            interv_section = create_section_box(interv_content, "DETALHES DA INTERVENÇÃO")
            add_section_to_elements(elements, interv_section)
            elements.append(Spacer(1, 0.2*cm))
        
        # ---- Materiais desta intervenção ----
        interv_id = interv.get('id')
        date_materiais = []
        if materiais:
            for mat in materiais:
                mat_interv_id = mat.get('intervencao_id')
                if mat_interv_id and interv_id:
                    if mat_interv_id == interv_id:
                        date_materiais.append(mat)
                elif not mat_interv_id:
                    # Fallback por data para materiais antigos
                    mat_date = normalize_date(mat.get('data_utilizacao'))
                    first_interv_date = normalize_date(intervencoes[0].get('data_intervencao')) if intervencoes else None
                    if mat_date == interv_date:
                        date_materiais.append(mat)
                    elif not mat_date and (interv_date == first_interv_date) and intervention_num == 1:
                        date_materiais.append(mat)
        
        if date_materiais:
            mat_header = [['Descrição', 'Quantidade', 'Fornecido por']]
            
            for mat in date_materiais:
                qty = mat.get('quantidade', 0)
                unit = mat.get('unidade', 'Un')
                # Descrição como Paragraph para permitir quebra de linha e suportar caracteres especiais
                desc_para = Paragraph(_pe(mat.get('descricao', 'N/A')), normal_style)
                fornecido_para = Paragraph(_pe(mat.get('fornecido_por', '-') or '-'), normal_style)
                mat_header.append([
                    desc_para,
                    f"{qty} {unit}",
                    fornecido_para
                ])
            
            mat_table = Table(mat_header, colWidths=[10*cm, 3*cm, 4.5*cm])
            mat_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#333333')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('ALIGN', (1, 0), (1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f7f7f7'), colors.white]),
            ]))
            
            mat_keep = [
                Paragraph("MATERIAIS UTILIZADOS", section_title_style),
                HRFlowable(width="100%", thickness=1, color=colors.HexColor('#cccccc'), spaceAfter=6),
                mat_table,
                Spacer(1, 0.3*cm),
            ]
            elements.append(KeepTogether(mat_keep))
            elements.append(Spacer(1, 0.2*cm))
        
        # ---- Relatório de Assistência desta intervenção (texto) ----
        # Nota: date_rel_assist já foi calculado acima, no início desta intervenção.
        if date_rel_assist:
            ra_content = []
            for ra in date_rel_assist:
                ra_text = _pe_with_nl(ra.get('texto', ''))
                ra_content.append(Paragraph(ra_text, normal_style))
                # Assinatura do registo (apenas para registos novos com created_by_name)
                created_by_name = ra.get('created_by_name')
                if created_by_name:
                    created_at_raw = ra.get('created_at')
                    data_str = ''
                    hora_str = ''
                    if created_at_raw:
                        try:
                            from datetime import datetime as _dt
                            if isinstance(created_at_raw, str):
                                dt_obj = _dt.fromisoformat(created_at_raw.replace('Z', '+00:00'))
                            else:
                                dt_obj = created_at_raw
                            # Converter para hora local Europe/Lisbon
                            try:
                                dt_local = dt_obj.astimezone(LISBON_TZ) if dt_obj.tzinfo else LISBON_TZ.localize(dt_obj)
                            except Exception:
                                dt_local = dt_obj
                            data_str = dt_local.strftime('%d/%m/%Y')
                            hora_str = dt_local.strftime('%H:%M')
                        except Exception:
                            pass
                    meta_parts = [f"<b>Adicionado por:</b> {_pe(created_by_name)}"]
                    if data_str:
                        meta_parts.append(f"<b>Data:</b> {data_str}")
                    if hora_str:
                        meta_parts.append(f"<b>Hora:</b> {hora_str}")
                    meta_html = " &nbsp;·&nbsp; ".join(meta_parts)
                    ra_content.append(Paragraph(f"<font size='7' color='#666666'>{meta_html}</font>", normal_style))
                ra_content.append(Spacer(1, 0.2*cm))
            if ra_content:
                ra_section = create_section_box(ra_content, "RELATÓRIO DE ASSISTÊNCIA")
                add_section_to_elements(elements, ra_section)
                elements.append(Spacer(1, 0.2*cm))
        
        # ---- Fotografias desta intervenção ----
        interv_id = interv.get('id')
        date_fotografias = []
        if fotografias:
            for foto in fotografias:
                foto_interv_id = foto.get('intervencao_id')
                if foto_interv_id and interv_id:
                    # Match directo por intervencao_id
                    if foto_interv_id == interv_id:
                        date_fotografias.append(foto)
                elif not foto_interv_id:
                    # Foto antiga sem intervencao_id — fallback por data
                    foto_date = normalize_date(foto.get('uploaded_at'))
                    if foto_date == interv_date or (interv_date is None and not foto_date):
                        date_fotografias.append(foto)
        
        if date_fotografias:
            foto_content = []
            
            for i in range(0, len(date_fotografias), 2):
                foto1 = date_fotografias[i]
                foto2 = date_fotografias[i + 1] if i + 1 < len(date_fotografias) else None
                
                row_content = []
                
                # Foto 1 — preferir thumb_base64 (já pequeno) sobre foto_base64 (HD)
                cell1 = []
                img1_obj = _safe_image_from_path(foto1.get('foto_path'), 7.5*cm, 5*cm, f"foto1-path rel={foto1.get('relatorio_id','')[:8]}")
                if img1_obj is None:
                    img1_obj = _safe_image_from_base64(foto1.get('thumb_base64') or foto1.get('foto_base64'), 7.5*cm, 5*cm, f"foto1 rel={foto1.get('relatorio_id','')[:8]}", large_fs=_is_large_fs, huge_fs=_is_huge_fs)
                # Libertar base64 grande imediatamente após uso (redução crítica de memória)
                foto1.pop('foto_base64', None)
                foto1.pop('thumb_base64', None)
                if img1_obj is not None:
                    cell1.append(img1_obj)
                else:
                    cell1.append(Paragraph("<i>(Sem imagem)</i>", foto_desc_style))
                
                if foto1.get('descricao'):
                    cell1.append(Paragraph(_pe(foto1.get('descricao', '')[:100]), foto_desc_style))
                
                row_content.append(cell1)
                
                # Foto 2 — preferir thumb_base64
                if foto2:
                    cell2 = []
                    img2_obj = _safe_image_from_path(foto2.get('foto_path'), 7.5*cm, 5*cm, f"foto2-path rel={foto2.get('relatorio_id','')[:8]}")
                    if img2_obj is None:
                        img2_obj = _safe_image_from_base64(foto2.get('thumb_base64') or foto2.get('foto_base64'), 7.5*cm, 5*cm, f"foto2 rel={foto2.get('relatorio_id','')[:8]}", large_fs=_is_large_fs, huge_fs=_is_huge_fs)
                    foto2.pop('foto_base64', None)
                    foto2.pop('thumb_base64', None)
                    if img2_obj is not None:
                        cell2.append(img2_obj)
                    else:
                        cell2.append(Paragraph("<i>(Sem imagem)</i>", foto_desc_style))
                    
                    if foto2.get('descricao'):
                        cell2.append(Paragraph(_pe(foto2.get('descricao', '')[:100]), foto_desc_style))
                    
                    row_content.append(cell2)
                else:
                    row_content.append('')
                
                foto_row_table = Table([row_content], colWidths=[8.7*cm, 8.7*cm])
                foto_row_table.setStyle(TableStyle([
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('BOX', (0, 0), (0, 0), 0.5, colors.HexColor('#cccccc')),
                    ('BOX', (1, 0), (1, 0), 0.5, colors.HexColor('#cccccc')),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ]))
                foto_content.append(foto_row_table)
                foto_content.append(Spacer(1, 0.1*cm))
                # Libertação agressiva de memória:
                # - FS huge (>50 fotos): gc após CADA par de fotos
                # - FS large (20-50): gc a cada 4 pares
                if _is_huge_fs:
                    _gc.collect()
                elif _is_large_fs and (i // 2) % 4 == 3:
                    _gc.collect()
            
            foto_section = create_section_box(foto_content, "FOTOGRAFIAS")
            add_section_to_elements(elements, foto_section)
            elements.append(Spacer(1, 0.2*cm))
        
        # ---- Assinaturas desta intervenção (por data) ----
        date_assinaturas = []
        for assin in assinaturas_list:
            assin_date = normalize_date(assin.get('data_assinatura'))
            if assin_date == interv_date or (interv_date is None and not assin_date):
                date_assinaturas.append(assin)
        
        if date_assinaturas:
            assin_content = []
            
            # Estilo centrado para nome e data
            assin_name_style = ParagraphStyle(
                'AssinNameStyle',
                parent=styles['Normal'],
                fontSize=10,
                textColor=colors.HexColor('#111111'),
                alignment=TA_CENTER,
                fontName='Helvetica-Bold',
                spaceAfter=2
            )
            
            assin_data_style = ParagraphStyle(
                'AssinDataStyle',
                parent=styles['Normal'],
                fontSize=8,
                textColor=colors.HexColor('#666666'),
                alignment=TA_CENTER,
                spaceAfter=0
            )
            
            for assinatura in date_assinaturas:
                assin_elements = []
                
                # Imagem da assinatura - AUMENTADA e CENTRADA
                img_obj = _safe_image_from_path(assinatura.get('assinatura_path'), 8*cm, 4*cm, f"assin-path")
                if img_obj is None:
                    img_obj = _safe_image_from_base64(assinatura.get('assinatura_base64'), 8*cm, 4*cm, f"assin")
                if img_obj is not None:
                    assin_elements.append(img_obj)
                else:
                    assin_elements.append(Paragraph("<i>Assinatura não disponível</i>", assin_data_style))
                
                # Linha separadora fina
                assin_elements.append(Spacer(1, 0.15*cm))
                assin_elements.append(HRFlowable(width="60%", thickness=0.5, color=colors.HexColor('#cccccc'), spaceBefore=0, spaceAfter=0.1*cm))
                
                # Dados da assinatura - POR BAIXO e CENTRADOS
                nome_completo = assinatura.get('assinado_por') or f"{assinatura.get('primeiro_nome', '')} {assinatura.get('ultimo_nome', '')}".strip()
                
                data_assinatura_display = ''
                if assinatura.get('data_assinatura'):
                    try:
                        dt = datetime.fromisoformat(str(assinatura['data_assinatura']).replace('Z', '+00:00'))
                        data_assinatura_display = dt.strftime('%d/%m/%Y %H:%M')
                    except Exception:
                        data_assinatura_display = str(assinatura['data_assinatura'])
                
                if nome_completo:
                    assin_elements.append(Paragraph(_pe(nome_completo), assin_name_style))
                if data_assinatura_display:
                    assin_elements.append(Paragraph(_pe(data_assinatura_display), assin_data_style))
                
                # Tabela com layout centrado - SEM FUNDO VERDE
                assin_table = Table([[assin_elements]], colWidths=[17*cm])
                assin_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), colors.white),
                    ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#cccccc')),  # gray-200 border
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
                HRFlowable(width="100%", thickness=1, color=colors.HexColor('#cccccc'), spaceAfter=6),
            ]
            assin_keep.extend(assin_content)
            assin_keep.append(Spacer(1, 0.3*cm))
            elements.append(KeepTogether(assin_keep))
            elements.append(Spacer(1, 0.2*cm))
        
        elements.append(Spacer(1, 0.3*cm))
    
    # ========== FOTOGRAFIAS NÃO ASSOCIADAS A DATAS (FALLBACK) ==========
    # Se houver fotografias que não foram incluídas nos blocos de data, mostrar aqui
    if fotografias:
        # Verificar quais fotografias não foram incluídas nos blocos de intervenção
        fotos_incluidas = set()
        
        for interv in (intervencoes or []):
            interv_id = interv.get('id')
            interv_d = normalize_date(interv.get('data_intervencao'))
            for foto in fotografias:
                foto_key = foto.get('id') or id(foto)
                foto_interv_id = foto.get('intervencao_id')
                if foto_interv_id and interv_id and foto_interv_id == interv_id:
                    fotos_incluidas.add(foto_key)
                elif not foto_interv_id:
                    foto_date = normalize_date(foto.get('uploaded_at'))
                    if foto_date == interv_d or (interv_d is None and not foto_date):
                        fotos_incluidas.add(foto_key)
        
        fotos_nao_incluidas = [f for f in fotografias if (f.get('id') or id(f)) not in fotos_incluidas]
        
        if fotos_nao_incluidas:
            foto_content = []
            
            for i in range(0, len(fotos_nao_incluidas), 2):
                foto1 = fotos_nao_incluidas[i]
                foto2 = fotos_nao_incluidas[i + 1] if i + 1 < len(fotos_nao_incluidas) else None
                
                row_content = []
                
                # Foto 1 — preferir thumb_base64
                cell1 = []
                img1_obj = _safe_image_from_path(foto1.get('foto_path'), 7.5*cm, 5*cm, f"fotoA-path rel={foto1.get('relatorio_id','')[:8]}")
                if img1_obj is None:
                    img1_obj = _safe_image_from_base64(foto1.get('thumb_base64') or foto1.get('foto_base64'), 7.5*cm, 5*cm, f"fotoA rel={foto1.get('relatorio_id','')[:8]}", large_fs=_is_large_fs, huge_fs=_is_huge_fs)
                foto1.pop('foto_base64', None)
                foto1.pop('thumb_base64', None)
                if img1_obj is not None:
                    cell1.append(img1_obj)
                else:
                    cell1.append(Paragraph("<i>(Sem imagem)</i>", foto_desc_style))
                
                if foto1.get('descricao'):
                    cell1.append(Paragraph(_pe(foto1.get('descricao', '')[:100]), foto_desc_style))
                
                row_content.append(cell1)
                
                # Foto 2 — preferir thumb_base64
                if foto2:
                    cell2 = []
                    img2_obj = _safe_image_from_path(foto2.get('foto_path'), 7.5*cm, 5*cm, f"fotoB-path rel={foto2.get('relatorio_id','')[:8]}")
                    if img2_obj is None:
                        img2_obj = _safe_image_from_base64(foto2.get('thumb_base64') or foto2.get('foto_base64'), 7.5*cm, 5*cm, f"fotoB rel={foto2.get('relatorio_id','')[:8]}", large_fs=_is_large_fs, huge_fs=_is_huge_fs)
                    foto2.pop('foto_base64', None)
                    foto2.pop('thumb_base64', None)
                    if img2_obj is not None:
                        cell2.append(img2_obj)
                    else:
                        cell2.append(Paragraph("<i>(Sem imagem)</i>", foto_desc_style))
                    
                    if foto2.get('descricao'):
                        cell2.append(Paragraph(_pe(foto2.get('descricao', '')[:100]), foto_desc_style))
                    
                    row_content.append(cell2)
                else:
                    row_content.append('')
                
                foto_row_table = Table([row_content], colWidths=[8.7*cm, 8.7*cm])
                foto_row_table.setStyle(TableStyle([
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('BOX', (0, 0), (0, 0), 0.5, colors.HexColor('#cccccc')),
                    ('BOX', (1, 0), (1, 0), 0.5, colors.HexColor('#cccccc')),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ]))
                foto_content.append(foto_row_table)
                foto_content.append(Spacer(1, 0.1*cm))
            
            foto_section = create_section_box(foto_content, "FOTOGRAFIAS")
            add_section_to_elements(elements, foto_section)
            elements.append(Spacer(1, 0.3*cm))
    
    # (Secção LEGENDA removida a pedido do cliente — Feb 2026)

    # ========== RODAPÉ ==========
    
    elements.append(Spacer(1, 0.3*cm))
    footer_style = ParagraphStyle(
        'FooterStyle',
        parent=normal_style,
        fontSize=8,
        textColor=colors.HexColor('#666666'),
        alignment=TA_CENTER
    )
    elements.append(Paragraph(f"Documento gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')}", footer_style))
    
    # Construir PDF — captura defensiva para que falhas de rendering (imagens,
    # layout demasiado grande, etc.) sejam reportadas de forma clara em vez de
    # fazerem o worker morrer. Se rebentar, faz fallback removendo todas as
    # imagens problemáticas e tentando de novo.
    # Forçar libertação de memória antes do build (FS grandes consomem muito).
    if _is_large_fs or _is_huge_fs:
        _gc.collect()
    try:
        doc.build(elements)
    except Exception as e:
        logging.error(f"[PDF] doc.build() FALHOU: {type(e).__name__}: {e}")
        # Fallback: remover todos os RLImage dos elementos e tentar de novo
        # Isto garante que mesmo com imagens problemáticas o PDF textual é gerado.
        if output_file is not None:
            # Truncar o ficheiro/objecto de saída antes do retry
            if hasattr(output_file, 'truncate'):
                try:
                    output_file.seek(0)
                    output_file.truncate(0)
                except Exception:
                    pass
            doc = SimpleDocTemplate(output_file, pagesize=A4, topMargin=0.6*cm, bottomMargin=0.6*cm, leftMargin=0.8*cm, rightMargin=0.8*cm)
        else:
            buffer = BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.6*cm, bottomMargin=0.6*cm, leftMargin=0.8*cm, rightMargin=0.8*cm)
        cleaned = _strip_images_from_elements(elements)
        try:
            doc.build(cleaned)
            logging.warning("[PDF] Gerado em modo fallback SEM imagens")
        except Exception as e2:
            logging.error(f"[PDF] Fallback também falhou: {type(e2).__name__}: {e2}")
            raise
    if output_file is not None:
        # Caller é responsável por ler o ficheiro de output. Não devolvemos buffer.
        return None
    buffer.seek(0)
    return buffer


def _strip_images_from_elements(elements):
    """Percorre a árvore de elementos e remove RLImage, substituindo por placeholder."""
    from reportlab.platypus import Paragraph as _P
    cleaned = []
    for e in elements:
        if isinstance(e, RLImage):
            continue  # skip image
        if isinstance(e, Table):
            # Substituir células que sejam RLImage ou lists contendo RLImage
            try:
                new_data = []
                for row in e._cellvalues:
                    new_row = []
                    for cell in row:
                        if isinstance(cell, RLImage):
                            new_row.append(_P("<i>(Imagem removida)</i>", ParagraphStyle('tmp', fontSize=7)))
                        elif isinstance(cell, list):
                            new_row.append([c for c in cell if not isinstance(c, RLImage)])
                        else:
                            new_row.append(cell)
                    new_data.append(new_row)
                new_table = Table(new_data, colWidths=e._colWidths)
                new_table.setStyle(e._bkgrndcmds if hasattr(e, '_bkgrndcmds') else TableStyle([]))
                cleaned.append(new_table)
            except Exception:
                cleaned.append(e)
        else:
            cleaned.append(e)
    return cleaned
