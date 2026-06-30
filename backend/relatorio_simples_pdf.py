"""
Gerador de PDF para o "Relatório Simples" — versão sem fotografias, estilo Word.
Header com logo (igual aos outros documentos), nome do cliente, título,
secções de texto formatado (bold/italic/underline/listas) e opcionalmente
tabela com equipamentos (Marca | Modelo | Nº Série).
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer,
    Image as RLImage, HRFlowable, ListFlowable, ListItem,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from io import BytesIO
from datetime import datetime
import os
import re
import logging
from html.parser import HTMLParser
from xml.sax.saxutils import escape as _xml_escape


# Tags inline que o ReportLab Paragraph compreende nativamente
_RL_INLINE_TAGS = {'b', 'strong', 'i', 'em', 'u', 'br'}


class _SimpleHTMLToParagraphs(HTMLParser):
    """Converte HTML simples (do contenteditable) em chunks compatíveis com
    ReportLab Paragraph + ListFlowable.

    Suporta:
      - Texto em parágrafos (<p>, <div>, quebras de linha)
      - Negrito (<b>, <strong>), Itálico (<i>, <em>), Sublinhado (<u>)
      - Listas não ordenadas (<ul><li>) e ordenadas (<ol><li>)
      - <br> -> nova linha

    Não suporta (são ignorados): imagens, links, tabelas, scripts.
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []        # lista de blocos (paragraph dict ou list dict)
        self._current_text = ''
        self._open_inline = []  # stack de tags inline abertas
        self._list_stack = []   # stack de listas: cada item -> {'type','items','current'}

    # --- helpers ---
    def _flush_paragraph(self):
        text = self._current_text.strip()
        self._current_text = ''
        if not text:
            return
        if self._list_stack:
            self._list_stack[-1]['current'] += text
        else:
            self.blocks.append({'type': 'p', 'text': text})

    def _append_inline(self, txt):
        if self._list_stack:
            # se estamos a meio de um <li>, acumular no item corrente
            pass
        self._current_text += txt

    # --- handle tags ---
    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in ('p', 'div'):
            self._flush_paragraph()
        elif tag == 'br':
            self._current_text += '<br/>'
        elif tag in ('b', 'strong'):
            self._current_text += '<b>'
            self._open_inline.append('b')
        elif tag in ('i', 'em'):
            self._current_text += '<i>'
            self._open_inline.append('i')
        elif tag == 'u':
            self._current_text += '<u>'
            self._open_inline.append('u')
        elif tag in ('ul', 'ol'):
            self._flush_paragraph()
            self._list_stack.append({'type': tag, 'items': [], 'current': ''})
        elif tag == 'li':
            if self._list_stack:
                # fechar item anterior, abrir novo
                lst = self._list_stack[-1]
                if lst['current'].strip():
                    lst['items'].append(lst['current'].strip())
                lst['current'] = ''
                self._current_text = ''

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in ('p', 'div'):
            self._flush_paragraph()
        elif tag in ('b', 'strong'):
            self._current_text += '</b>'
            if self._open_inline and self._open_inline[-1] == 'b':
                self._open_inline.pop()
        elif tag in ('i', 'em'):
            self._current_text += '</i>'
            if self._open_inline and self._open_inline[-1] == 'i':
                self._open_inline.pop()
        elif tag == 'u':
            self._current_text += '</u>'
            if self._open_inline and self._open_inline[-1] == 'u':
                self._open_inline.pop()
        elif tag == 'li':
            if self._list_stack:
                lst = self._list_stack[-1]
                # consumir texto pendente
                pending = self._current_text.strip()
                self._current_text = ''
                full = (lst['current'] + pending).strip()
                if full:
                    lst['items'].append(full)
                lst['current'] = ''
        elif tag in ('ul', 'ol'):
            if self._list_stack:
                lst = self._list_stack.pop()
                # último item pendente?
                pending = (lst['current'] + self._current_text).strip()
                self._current_text = ''
                if pending:
                    lst['items'].append(pending)
                if lst['items']:
                    self.blocks.append({'type': 'list', 'list_type': lst['type'], 'items': lst['items']})

    def handle_data(self, data):
        # Escapar caracteres XML problemáticos APENAS no texto bruto
        # (as tags inline já foram adicionadas via handle_starttag)
        safe = _xml_escape(data)
        if self._list_stack and not self._current_text and not self._open_inline:
            # estamos dentro de uma lista mas fora de <li> abertas → acumular no current
            self._list_stack[-1]['current'] += safe
        else:
            self._current_text += safe

    def close(self):
        super().close()
        # Flush final
        self._flush_paragraph()
        # Fechar listas órfãs
        while self._list_stack:
            lst = self._list_stack.pop()
            if lst['current'].strip():
                lst['items'].append(lst['current'].strip())
            if lst['items']:
                self.blocks.append({'type': 'list', 'list_type': lst['type'], 'items': lst['items']})


def _html_to_flowables(html, body_style):
    """Converte HTML simples para uma lista de flowables ReportLab."""
    if not html or not html.strip():
        return []
    try:
        parser = _SimpleHTMLToParagraphs()
        parser.feed(html)
        parser.close()
    except Exception as exc:
        logging.warning(f"[RelatorioSimples] HTML parse falhou: {exc} — fallback texto puro")
        # Fallback: strip tags e mostrar como parágrafo único
        plain = re.sub(r'<[^>]+>', ' ', html)
        return [Paragraph(_xml_escape(plain).strip(), body_style)]

    flowables = []
    for block in parser.blocks:
        if block['type'] == 'p':
            try:
                flowables.append(Paragraph(block['text'], body_style))
                flowables.append(Spacer(1, 0.2 * cm))
            except Exception as exc:
                logging.warning(f"[RelatorioSimples] Paragraph falhou: {exc}")
                plain = re.sub(r'<[^>]+>', ' ', block['text'])
                flowables.append(Paragraph(_xml_escape(plain), body_style))
        elif block['type'] == 'list':
            list_items = []
            for item in block['items']:
                try:
                    list_items.append(ListItem(Paragraph(item, body_style), leftIndent=10))
                except Exception:
                    plain = re.sub(r'<[^>]+>', ' ', item)
                    list_items.append(ListItem(Paragraph(_xml_escape(plain), body_style), leftIndent=10))
            bullet_type = 'bullet' if block['list_type'] == 'ul' else '1'
            flowables.append(ListFlowable(list_items, bulletType=bullet_type, leftIndent=20))
            flowables.append(Spacer(1, 0.2 * cm))
    return flowables


def _load_company_logo(company_info):
    """Tenta carregar o logo da empresa (mesmo padrão do ot_pdf_report)."""
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
                    logo_element = RLImage(logo_path, width=5 * cm, height=1.44 * cm)
            except Exception as exc:
                logging.warning(f"[RelatorioSimples] erro a carregar logo: {exc}")

    if logo_element is None:
        for default_path in (
            "/app/uploads/eb50c801-bae6-4203-ab03-9d23099e8f9d_footer-logo.png",
            "/app/uploads/logo.png",
            "/app/uploads/company_logo.png",
        ):
            if os.path.exists(default_path):
                try:
                    logo_element = RLImage(default_path, width=5 * cm, height=1.44 * cm)
                    break
                except Exception:
                    continue
    return logo_element


def generate_relatorio_simples_pdf(
    relatorio_simples,
    relatorio_fs,
    cliente=None,
    equipamentos=None,
    company_info=None,
    autor_nome=None,
):
    """Gera o PDF do Relatório Simples e devolve bytes.

    Args:
        relatorio_simples: dict com {titulo, secoes:[{titulo,corpo_html}],
                                     incluir_equipamentos, equipamento_ids,
                                     updated_at, ...}
        relatorio_fs: dict com info da FS (numero_assistencia, data_servico, etc.)
        cliente: dict do cliente (nome, nif, ...)
        equipamentos: lista de dicts dos equipamentos da FS (marca, modelo, numero_serie, id)
        company_info: dict da empresa (logo_url, nome, ...)
        autor_nome: nome do utilizador que assina o relatório
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
        title=f"Relatório - FS #{relatorio_fs.get('numero_assistencia', '')}",
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'RSTitle', parent=styles['Heading1'],
        fontSize=18, alignment=TA_CENTER, spaceAfter=12,
        textColor=colors.HexColor('#1a1a1a'), fontName='Helvetica-Bold',
    )
    section_title_style = ParagraphStyle(
        'RSSectionTitle', parent=styles['Heading2'],
        fontSize=13, alignment=TA_LEFT, spaceAfter=6, spaceBefore=10,
        textColor=colors.HexColor('#222'), fontName='Helvetica-Bold',
    )
    body_style = ParagraphStyle(
        'RSBody', parent=styles['BodyText'],
        fontSize=11, alignment=TA_JUSTIFY, leading=15,
        textColor=colors.HexColor('#222'), fontName='Helvetica',
        spaceAfter=4,
    )
    meta_style = ParagraphStyle(
        'RSMeta', parent=styles['BodyText'],
        fontSize=10, alignment=TA_LEFT, textColor=colors.HexColor('#555'),
        fontName='Helvetica',
    )
    header_title_style = ParagraphStyle(
        'RSHeaderTitle', parent=styles['Heading1'],
        fontSize=15, textColor=colors.white, alignment=TA_LEFT,
        fontName='Helvetica-Bold',
    )
    header_sub_style = ParagraphStyle(
        'RSHeaderSub', parent=styles['BodyText'],
        fontSize=10, textColor=colors.HexColor('#dddddd'), alignment=TA_LEFT,
        fontName='Helvetica',
    )
    footer_style = ParagraphStyle(
        'RSFooter', parent=styles['BodyText'],
        fontSize=9, textColor=colors.HexColor('#666'), alignment=TA_CENTER,
        fontName='Helvetica',
    )

    elements = []

    # ===== CABEÇALHO COM LOGO =====
    logo_element = _load_company_logo(company_info)

    fs_numero = relatorio_fs.get('numero_assistencia') or relatorio_fs.get('numero') or 'N/A'
    data_servico = relatorio_fs.get('data_servico', '')
    if isinstance(data_servico, str) and data_servico:
        try:
            data_servico = datetime.fromisoformat(data_servico).strftime('%d/%m/%Y')
        except Exception:
            pass

    header_left_cells = [
        [Paragraph("RELATÓRIO", header_title_style)],
        [Paragraph(f"FS #{fs_numero}", header_sub_style)],
    ]
    header_right_cells = [
        [Paragraph(f"Data: {data_servico or '—'}", header_sub_style)],
    ]
    if autor_nome:
        header_right_cells.append([Paragraph(f"Técnico: {_xml_escape(autor_nome)}", header_sub_style)])

    if logo_element:
        header_table = Table(
            [[logo_element, Table(header_left_cells), Table(header_right_cells)]],
            colWidths=[5.5 * cm, 6.5 * cm, 5 * cm],
        )
    else:
        header_table = Table(
            [[Table(header_left_cells), Table(header_right_cells)]],
            colWidths=[11 * cm, 6 * cm],
        )
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#333333')),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 0.5 * cm))

    # ===== IDENTIFICAÇÃO DO CLIENTE =====
    cliente_nome = (relatorio_simples.get('cliente_nome')
                    or (cliente or {}).get('nome')
                    or 'Cliente')
    cliente_extra_bits = []
    if cliente and cliente.get('nif'):
        cliente_extra_bits.append(f"NIF: {cliente.get('nif')}")
    cliente_extra = ' · '.join(cliente_extra_bits)

    elements.append(Paragraph(f"<b>Cliente:</b> {_xml_escape(cliente_nome)}", meta_style))
    if cliente_extra:
        elements.append(Paragraph(_xml_escape(cliente_extra), meta_style))
    elements.append(Spacer(1, 0.2 * cm))
    elements.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor('#cccccc')))
    elements.append(Spacer(1, 0.5 * cm))

    # ===== TÍTULO DO RELATÓRIO =====
    titulo = relatorio_simples.get('titulo') or 'Relatório'
    elements.append(Paragraph(_xml_escape(titulo), title_style))
    elements.append(Spacer(1, 0.3 * cm))

    # ===== SECÇÕES =====
    secoes = relatorio_simples.get('secoes') or []
    if not secoes:
        elements.append(Paragraph("<i>(Sem conteúdo)</i>", body_style))
    else:
        for sec in secoes:
            sec_titulo = (sec.get('titulo') or '').strip()
            if sec_titulo:
                elements.append(Paragraph(_xml_escape(sec_titulo), section_title_style))
                elements.append(HRFlowable(
                    width="40%", thickness=0.6, color=colors.HexColor('#888'),
                    spaceAfter=4,
                ))
            body_flowables = _html_to_flowables(sec.get('corpo_html', ''), body_style)
            elements.extend(body_flowables)
            elements.append(Spacer(1, 0.3 * cm))

    # ===== EQUIPAMENTOS =====
    if relatorio_simples.get('incluir_equipamentos'):
        sel_ids = set(relatorio_simples.get('equipamento_ids') or [])
        equipamentos = equipamentos or []
        if sel_ids:
            equipamentos_filtrados = [e for e in equipamentos if e.get('id') in sel_ids]
        else:
            equipamentos_filtrados = equipamentos

        if equipamentos_filtrados:
            elements.append(Spacer(1, 0.3 * cm))
            elements.append(Paragraph("Equipamentos", section_title_style))
            elements.append(HRFlowable(
                width="40%", thickness=0.6, color=colors.HexColor('#888'), spaceAfter=4,
            ))

            header_row = ['Marca', 'Modelo', 'Nº de Série']
            rows = [header_row]
            for eq in equipamentos_filtrados:
                rows.append([
                    eq.get('marca') or '—',
                    eq.get('modelo') or '—',
                    eq.get('numero_serie') or '—',
                ])
            eq_table = Table(rows, colWidths=[5 * cm, 6 * cm, 6 * cm], hAlign='LEFT')
            eq_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#333333')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#aaa')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
            ]))
            elements.append(eq_table)
            elements.append(Spacer(1, 0.4 * cm))

    # ===== RODAPÉ =====
    elements.append(Spacer(1, 0.8 * cm))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#ddd')))
    gerado_em = datetime.now().strftime('%d/%m/%Y %H:%M')
    footer_parts = [f"Gerado em {gerado_em}"]
    if autor_nome:
        footer_parts.append(_xml_escape(autor_nome))
    elements.append(Paragraph(' · '.join(footer_parts), footer_style))

    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
