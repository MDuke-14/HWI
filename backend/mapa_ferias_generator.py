"""
Gerador do Mapa de Férias — layout próprio, simples e completo.

Estrutura:
  - 1 folha por ano ("Mapa {year}")
  - 12 tabelas empilhadas verticalmente (uma por mês)
  - Cada tabela: cabeçalho com dias 1..31, uma linha por utilizador com
    o nome na 1ª coluna e "F" nos dias de férias aprovada.

Cores:
  - Verde: dia de férias
  - Cinza claro: sábado/domingo
  - Amarelo suave: feriado nacional PT
"""
from __future__ import annotations

import io
import calendar
from datetime import date, datetime, timedelta

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from hours_calculator import feriados_portugueses

MONTH_NAMES_PT = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]
WEEKDAY_LABELS_PT = ["S", "T", "Q", "Q", "S", "S", "D"]  # Mon..Sun

# Paleta
COLOR_HEADER_BG = "1F4E78"       # azul escuro
COLOR_HEADER_FG = "FFFFFF"
COLOR_MONTH_BG = "305496"        # azul mais escuro para linha do mês
COLOR_WEEKEND_BG = "E7E6E6"      # cinza claro
COLOR_HOLIDAY_BG = "FFF2CC"      # amarelo suave
COLOR_VACATION_BG = "C6EFCE"     # verde
COLOR_VACATION_FG = "006100"
COLOR_BORDER = "BFBFBF"
COLOR_ROW_ALT = "F5F5F5"         # zebra rows para melhor leitura

thin_border = Border(
    left=Side(style="thin", color=COLOR_BORDER),
    right=Side(style="thin", color=COLOR_BORDER),
    top=Side(style="thin", color=COLOR_BORDER),
    bottom=Side(style="thin", color=COLOR_BORDER),
)


def _iter_vacation_days(vac: dict, year: int, month: int):
    """Itera pelos dias de férias aprovada no (year, month), excluindo excluded_dates."""
    try:
        s = datetime.strptime(vac["start_date"], "%Y-%m-%d").date()
        e = datetime.strptime(vac["end_date"], "%Y-%m-%d").date()
    except Exception:
        return
    excluded = set(vac.get("excluded_dates") or [])
    month_start = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    month_end = date(year, month, last_day)
    d = max(s, month_start)
    end = min(e, month_end)
    while d <= end:
        if d.strftime("%Y-%m-%d") not in excluded:
            yield d
        d += timedelta(days=1)


def _apply_border(ws, row_start, col_start, row_end, col_end):
    for r in range(row_start, row_end + 1):
        for c in range(col_start, col_end + 1):
            ws.cell(row=r, column=c).border = thin_border


async def generate_mapa_ferias_xlsx(db, year: int) -> bytes:
    """Gera o Mapa de Férias do `year` para todos os utilizadores do sistema."""
    wb = Workbook()
    ws = wb.active
    ws.title = f"Mapa {year}"

    # Buscar utilizadores ordenados por full_name (ou username)
    users = await db.users.find({}, {"_id": 0}).to_list(None)
    users = [u for u in users if u.get("username")]
    users.sort(key=lambda u: (u.get("full_name") or u.get("username") or "").lower())

    if not users:
        ws["A1"] = "Nenhum utilizador no sistema."
        buf = io.BytesIO(); wb.save(buf); buf.seek(0)
        return buf.getvalue()

    # Buscar todas as férias aprovadas do ano
    vacs = await db.vacation_requests.find(
        {"status": "aprovada",
         "start_date": {"$lte": f"{year}-12-31"},
         "end_date": {"$gte": f"{year}-01-01"}},
        {"_id": 0},
    ).to_list(None)
    vacs_by_user: dict[str, list] = {}
    for v in vacs:
        vacs_by_user.setdefault(v["user_id"], []).append(v)

    # Título global
    ws["A1"] = f"MAPA DE FÉRIAS — {year}"
    ws["A1"].font = Font(bold=True, size=16, color="1F4E78")
    ws["A1"].alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 28

    # Legenda (linha 2)
    ws["A2"] = "Legenda:"
    ws["A2"].font = Font(bold=True, size=10)
    legenda = [
        ("F  — Férias", COLOR_VACATION_BG, COLOR_VACATION_FG),
        ("Fim de semana", COLOR_WEEKEND_BG, "000000"),
        ("Feriado", COLOR_HOLIDAY_BG, "000000"),
    ]
    col = 2
    for text, bg, fg in legenda:
        c = ws.cell(row=2, column=col, value=text)
        c.fill = PatternFill("solid", fgColor=bg)
        c.font = Font(color=fg, size=10)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = thin_border
        col += 2

    NAME_COL_WIDTH = 32
    DAY_COL_WIDTH = 3.5
    MAX_DAYS = 31

    # Coluna A = nome (largura 32); B..AF = dias 1..31
    ws.column_dimensions["A"].width = NAME_COL_WIDTH
    for i in range(1, MAX_DAYS + 1):
        ws.column_dimensions[get_column_letter(1 + i)].width = DAY_COL_WIDTH

    current_row = 4  # começar depois de título+legenda+espaço

    for month in range(1, 13):
        month_days = calendar.monthrange(year, month)[1]
        feriados = feriados_portugueses(year)

        # -------- Linha do nome do mês (banda azul) --------
        month_row = current_row
        cell = ws.cell(row=month_row, column=1, value=f"{MONTH_NAMES_PT[month-1]} {year}")
        cell.font = Font(bold=True, color="FFFFFF", size=12)
        cell.fill = PatternFill("solid", fgColor=COLOR_MONTH_BG)
        cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
        # merge sobre os dias do mês
        ws.merge_cells(start_row=month_row, start_column=1, end_row=month_row, end_column=1 + month_days)
        # Preencher a merge com a mesma cor (openpyxl exige)
        for c in range(2, 1 + month_days + 1):
            ws.cell(row=month_row, column=c).fill = PatternFill("solid", fgColor=COLOR_MONTH_BG)
        ws.row_dimensions[month_row].height = 22

        # -------- Linha de weekday (S T Q Q S S D) --------
        wd_row = month_row + 1
        ws.cell(row=wd_row, column=1, value="").font = Font(bold=True)
        for d in range(1, month_days + 1):
            weekday = date(year, month, d).weekday()  # 0=Mon..6=Sun
            wd_cell = ws.cell(row=wd_row, column=1 + d, value=WEEKDAY_LABELS_PT[weekday])
            wd_cell.font = Font(bold=True, size=8, color="595959")
            wd_cell.alignment = Alignment(horizontal="center")
        ws.row_dimensions[wd_row].height = 14

        # -------- Cabeçalho de dias (1..N) --------
        header_row = month_row + 2
        name_hdr = ws.cell(row=header_row, column=1, value="Colaborador")
        name_hdr.font = Font(bold=True, color=COLOR_HEADER_FG)
        name_hdr.fill = PatternFill("solid", fgColor=COLOR_HEADER_BG)
        name_hdr.alignment = Alignment(horizontal="left", vertical="center", indent=1)
        name_hdr.border = thin_border
        for d in range(1, month_days + 1):
            c = ws.cell(row=header_row, column=1 + d, value=d)
            c.font = Font(bold=True, color=COLOR_HEADER_FG, size=10)
            c.fill = PatternFill("solid", fgColor=COLOR_HEADER_BG)
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border = thin_border
        ws.row_dimensions[header_row].height = 18

        # -------- Linhas por utilizador --------
        for idx, user in enumerate(users):
            urow = header_row + 1 + idx
            display = user.get("full_name") or user.get("username", "")
            zebra = idx % 2 == 1

            name_cell = ws.cell(row=urow, column=1, value=display)
            name_cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
            name_cell.font = Font(size=10)
            name_cell.border = thin_border
            if zebra:
                name_cell.fill = PatternFill("solid", fgColor=COLOR_ROW_ALT)

            # Marcar dias de férias para este utilizador
            user_vac_days: set[int] = set()
            for v in vacs_by_user.get(user["id"], []):
                for d in _iter_vacation_days(v, year, month):
                    user_vac_days.add(d.day)

            for d in range(1, month_days + 1):
                cell = ws.cell(row=urow, column=1 + d)
                cell.alignment = Alignment(horizontal="center", vertical="center")
                cell.font = Font(size=9)
                cell.border = thin_border

                is_vac = d in user_vac_days
                is_holiday = date(year, month, d) in feriados
                is_weekend = date(year, month, d).weekday() >= 5

                if is_vac:
                    cell.value = "F"
                    cell.font = Font(bold=True, size=10, color=COLOR_VACATION_FG)
                    cell.fill = PatternFill("solid", fgColor=COLOR_VACATION_BG)
                elif is_holiday:
                    cell.fill = PatternFill("solid", fgColor=COLOR_HOLIDAY_BG)
                elif is_weekend:
                    cell.fill = PatternFill("solid", fgColor=COLOR_WEEKEND_BG)
                elif zebra:
                    cell.fill = PatternFill("solid", fgColor=COLOR_ROW_ALT)
            ws.row_dimensions[urow].height = 18

        # -------- Linha total --------
        total_row = header_row + 1 + len(users)
        total_cell = ws.cell(row=total_row, column=1, value="TOTAL / dia")
        total_cell.font = Font(bold=True, italic=True, size=9, color="595959")
        total_cell.alignment = Alignment(horizontal="left", indent=1)
        total_cell.border = thin_border
        for d in range(1, month_days + 1):
            first_user_row = header_row + 1
            last_user_row = header_row + len(users)
            col_letter = get_column_letter(1 + d)
            formula = f'=COUNTIF({col_letter}{first_user_row}:{col_letter}{last_user_row},"F")'
            tc = ws.cell(row=total_row, column=1 + d, value=formula)
            tc.alignment = Alignment(horizontal="center")
            tc.font = Font(bold=True, size=9, color="595959")
            tc.border = thin_border
        ws.row_dimensions[total_row].height = 16

        current_row = total_row + 2  # espaço entre meses

    # Congelar primeira linha e primeira coluna
    ws.freeze_panes = "B4"

    # Print area por página (paisagem, ajustar ao papel)
    ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins.left = 0.4
    ws.page_margins.right = 0.4
    ws.page_margins.top = 0.5
    ws.page_margins.bottom = 0.5

    # Total geral no fim
    grand_row = current_row + 1
    ws.cell(row=grand_row, column=1, value=f"Total de dias de férias aprovadas em {year}:")
    ws.cell(row=grand_row, column=1).font = Font(bold=True)
    total_all = sum(
        sum(1 for _ in _iter_vacation_days(v, year, m))
        for m in range(1, 13)
        for u in users
        for v in vacs_by_user.get(u["id"], [])
    )
    ws.cell(row=grand_row, column=6, value=total_all).font = Font(bold=True, color=COLOR_VACATION_FG, size=12)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()
