"""
Gerador do Mapa de Férias — uma folha por ano com registos.

Regras:
- Uma folha por cada ano que tenha férias aprovadas na BD.
- Cada folha tem 12 tabelas mensais (Jan..Dez).
- Dias de férias marcados com "F" na cor do respectivo ano.
- Título "MAPA DE FÉRIAS" (sem ano).
- Legenda numa zona própria — não sobrepõe nomes/dias.

Paleta por ano (rolagem para anos futuros):
- 2025 → Laranja | 2026 → Verde | 2027 → Azul | 2028 → Roxo
- 2029 → Amarelo | 2030 → Rosa   | 2031 → Ciano| 2032 → Vermelho
"""
from __future__ import annotations

import io
import calendar
from datetime import date, datetime, timedelta

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from hours_calculator import feriados_portugueses
from vacation_engine import (
    VacationRequestLite,
    VacationAdjustment as EngineAdj,
    compute_history,
    is_dia_util,
)

MONTH_NAMES_PT = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]
WEEKDAY_LABELS_PT = ["S", "T", "Q", "Q", "S", "S", "D"]  # Mon..Sun

# Paleta neutra da estrutura
COLOR_HEADER_BG = "1F4E78"
COLOR_HEADER_FG = "FFFFFF"
COLOR_MONTH_BG = "305496"
COLOR_WEEKEND_BG = "E7E6E6"
COLOR_HOLIDAY_BG = "FFF2CC"
COLOR_BORDER = "BFBFBF"
COLOR_ROW_ALT = "F5F5F5"

# Paleta de cor por ano (BG, FG para o "F")
YEAR_COLOR_PALETTE = [
    ("FFD8A8", "8A4B00"),  # 2025 Laranja
    ("C6EFCE", "006100"),  # 2026 Verde
    ("BDD7EE", "1F3864"),  # 2027 Azul
    ("E4B8F3", "5B2C7A"),  # 2028 Roxo
    ("FFF2A8", "7A5C00"),  # 2029 Amarelo
    ("F8CBD9", "8A2751"),  # 2030 Rosa
    ("B7E3E4", "0E5C60"),  # 2031 Ciano
    ("F4B7B7", "8A1D1D"),  # 2032 Vermelho
]

# Ano de referência para começar a paleta
YEAR_PALETTE_ANCHOR = 2025


def year_colors(year: int) -> tuple[str, str]:
    """Devolve (BG, FG) para o `year` respeitando a rotação da paleta."""
    idx = (year - YEAR_PALETTE_ANCHOR) % len(YEAR_COLOR_PALETTE)
    return YEAR_COLOR_PALETTE[idx]


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


def _compute_day_source_year(
    year: int,
    user_id: str,
    user_vacs: list[dict],
    csd: date,
    all_reqs: list,
    adjs: list,
) -> dict[date, int]:
    """Devolve dict {data_util: ano_de_origem_do_saldo} para as férias
    aprovadas do utilizador no `year`.

    Alocação (regra prática): as férias gozadas no ano Y consomem primeiro
    os `dias_transitados` (vindos do ano Y-1) — os primeiros N dias
    (ordem cronológica) recebem a cor do ano Y-1; os restantes recebem
    a cor do ano Y.
    """
    # 1) Saldo transitado para este ano
    end_year = max(date.today().year, year, csd.year)
    history = compute_history(csd, end_year, all_reqs, adjs)
    yb = next((h for h in history if h.year == year), None)
    transitados = yb.dias_transitados if yb else 0

    # 2) Recolher todas as datas úteis das férias aprovadas no ano `year`
    #    Ordenadas cronologicamente. Cada data é um dia útil (não FDS/feriado).
    feriados = feriados_portugueses(year)
    all_days: list[date] = []
    for v in user_vacs:
        if v.get("status") != "aprovada":
            continue
        try:
            s = datetime.strptime(v["start_date"], "%Y-%m-%d").date()
            e = datetime.strptime(v["end_date"], "%Y-%m-%d").date()
        except Exception:
            continue
        excluded = set(v.get("excluded_dates") or [])
        d = s
        while d <= e:
            if d.year == year:
                if d.weekday() < 5 and d not in feriados and d.strftime("%Y-%m-%d") not in excluded:
                    all_days.append(d)
            d += timedelta(days=1)
    all_days.sort()

    # 3) Alocar: primeiros `transitados` dias → ano-1; resto → ano
    source: dict[date, int] = {}
    prev_year = year - 1
    for i, d in enumerate(all_days):
        source[d] = prev_year if i < transitados else year
    return source


def _build_year_sheet(
    ws,
    year: int,
    users: list[dict],
    vacs_by_user: dict[str, list],
    years_present: list[int],
    day_source_by_user: dict[str, dict[date, int]],
):
    """Constrói uma folha completa para o `year`.

    `day_source_by_user[user_id][date]` = ano de origem do saldo consumido
    naquele dia (usado para determinar a cor).
    """
    NAME_COL_WIDTH = 32
    DAY_COL_WIDTH = 3.5
    MAX_DAYS = 31

    year_bg, year_fg = year_colors(year)

    # Detectar anos-fonte adicionais presentes nesta folha (transitados de anos anteriores)
    source_years_in_sheet: set[int] = {year}
    for u in users:
        for src_y in day_source_by_user.get(u["id"], {}).values():
            source_years_in_sheet.add(src_y)
    source_years_sorted = sorted(source_years_in_sheet)

    # Larguras
    ws.column_dimensions["A"].width = NAME_COL_WIDTH
    for i in range(1, MAX_DAYS + 1):
        ws.column_dimensions[get_column_letter(1 + i)].width = DAY_COL_WIDTH

    # ---------- Título global (linha 1) ----------
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=1 + MAX_DAYS)
    t = ws.cell(row=1, column=1, value="MAPA DE FÉRIAS")
    t.font = Font(bold=True, size=18, color=COLOR_HEADER_BG)
    t.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 32

    # ---------- Subtítulo do ano (linha 2) ----------
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=1 + MAX_DAYS)
    sub = ws.cell(row=2, column=1, value=f"Ano {year}")
    sub.font = Font(bold=True, size=12, color="595959")
    sub.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[2].height = 20

    # ---------- Legenda (linhas 4..5) — zona própria, cabeçalho + valores ----------
    LEGEND_ROW_HDR = 4
    LEGEND_ROW_VAL = 5
    # Itens: uma cor por cada ano-fonte presente + FDS + Feriado
    items: list[tuple[str, str, str]] = []
    for src_y in source_years_sorted:
        yb, yf = year_colors(src_y)
        label = f"Férias {src_y}" if src_y != year else f"Férias {year}"
        items.append((label, yb, yf))
    items.append(("Fim de semana", COLOR_WEEKEND_BG, "000000"))
    items.append(("Feriado", COLOR_HOLIDAY_BG, "000000"))

    # Cabeçalho "Legenda"
    ws.merge_cells(start_row=LEGEND_ROW_HDR, start_column=1, end_row=LEGEND_ROW_HDR, end_column=1 + MAX_DAYS)
    lh = ws.cell(row=LEGEND_ROW_HDR, column=1, value="Legenda")
    lh.font = Font(bold=True, size=11, color=COLOR_HEADER_FG)
    lh.fill = PatternFill("solid", fgColor=COLOR_HEADER_BG)
    lh.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[LEGEND_ROW_HDR].height = 18

    # Cada item ocupa 5 dias/colunas com merge
    ITEM_SPAN = 5
    col = 2
    for text, bg, fg in items:
        end_col = min(col + ITEM_SPAN - 1, 1 + MAX_DAYS)
        ws.merge_cells(start_row=LEGEND_ROW_VAL, start_column=col, end_row=LEGEND_ROW_VAL, end_column=end_col)
        c = ws.cell(row=LEGEND_ROW_VAL, column=col, value=text)
        c.fill = PatternFill("solid", fgColor=bg)
        c.font = Font(color=fg, size=10, bold=True)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = thin_border
        # Preencher fill nas células mescladas
        for cc in range(col, end_col + 1):
            ws.cell(row=LEGEND_ROW_VAL, column=cc).fill = PatternFill("solid", fgColor=bg)
            ws.cell(row=LEGEND_ROW_VAL, column=cc).border = thin_border
        col = end_col + 2  # espaço entre itens
        if col > 1 + MAX_DAYS:
            break
    ws.row_dimensions[LEGEND_ROW_VAL].height = 22

    # ---------- Tabelas mensais (a partir da linha 7 — deixa 1 linha branca) ----------
    current_row = 7
    feriados = feriados_portugueses(year)

    for month in range(1, 13):
        month_days = calendar.monthrange(year, month)[1]

        # Linha do nome do mês
        month_row = current_row
        cell = ws.cell(row=month_row, column=1, value=f"{MONTH_NAMES_PT[month-1]} {year}")
        cell.font = Font(bold=True, color="FFFFFF", size=12)
        cell.fill = PatternFill("solid", fgColor=COLOR_MONTH_BG)
        cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
        ws.merge_cells(start_row=month_row, start_column=1, end_row=month_row, end_column=1 + month_days)
        for c in range(2, 1 + month_days + 1):
            ws.cell(row=month_row, column=c).fill = PatternFill("solid", fgColor=COLOR_MONTH_BG)
        ws.row_dimensions[month_row].height = 22

        # Linha de weekday
        wd_row = month_row + 1
        for d in range(1, month_days + 1):
            weekday = date(year, month, d).weekday()
            wd_cell = ws.cell(row=wd_row, column=1 + d, value=WEEKDAY_LABELS_PT[weekday])
            wd_cell.font = Font(bold=True, size=8, color="595959")
            wd_cell.alignment = Alignment(horizontal="center")
        ws.row_dimensions[wd_row].height = 14

        # Cabeçalho dos dias
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

        # Linhas por utilizador
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

            user_vac_days: set[int] = set()
            for v in vacs_by_user.get(user["id"], []):
                for d in _iter_vacation_days(v, year, month):
                    user_vac_days.add(d.day)

            user_day_source = day_source_by_user.get(user["id"], {})

            for d in range(1, month_days + 1):
                cell = ws.cell(row=urow, column=1 + d)
                cell.alignment = Alignment(horizontal="center", vertical="center")
                cell.font = Font(size=9)
                cell.border = thin_border

                day_obj = date(year, month, d)
                is_holiday = day_obj in feriados
                is_weekend = day_obj.weekday() >= 5
                # Só marca "F" em dias úteis dentro de férias — FDS e feriados
                # não são consumidos e ficam com a sua cor própria.
                is_vac = d in user_vac_days and not is_weekend and not is_holiday

                if is_vac:
                    src_y = user_day_source.get(day_obj, year)
                    d_bg, d_fg = year_colors(src_y)
                    cell.value = "F"
                    cell.font = Font(bold=True, size=10, color=d_fg)
                    cell.fill = PatternFill("solid", fgColor=d_bg)
                elif is_holiday:
                    cell.fill = PatternFill("solid", fgColor=COLOR_HOLIDAY_BG)
                elif is_weekend:
                    cell.fill = PatternFill("solid", fgColor=COLOR_WEEKEND_BG)
                elif zebra:
                    cell.fill = PatternFill("solid", fgColor=COLOR_ROW_ALT)
            ws.row_dimensions[urow].height = 18

        # Linha total
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

    # Congelar cabeçalho
    ws.freeze_panes = "B7"

    # Impressão
    ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins.left = 0.4
    ws.page_margins.right = 0.4
    ws.page_margins.top = 0.5
    ws.page_margins.bottom = 0.5

    # Total geral do ano no fim
    grand_row = current_row + 1
    ws.cell(row=grand_row, column=1, value=f"Total de dias de férias aprovadas em {year}:")
    ws.cell(row=grand_row, column=1).font = Font(bold=True)
    total_all = sum(
        sum(1 for _ in _iter_vacation_days(v, year, m))
        for m in range(1, 13)
        for u in users
        for v in vacs_by_user.get(u["id"], [])
    )
    tot_cell = ws.cell(row=grand_row, column=6, value=total_all)
    tot_cell.font = Font(bold=True, color=year_fg, size=12)


async def generate_mapa_ferias_xlsx(db, year: int | None = None) -> bytes:
    """Gera o Mapa de Férias com uma folha por cada ano existente na BD.

    O parâmetro `year` é ignorado — mantido apenas por compatibilidade.
    O ficheiro terá uma folha por cada ano com pelo menos uma férias aprovada.

    Cada dia de férias é colorido de acordo com o ano de origem do saldo
    consumido (transitados vs ano corrente).
    """
    wb = Workbook()
    default_sheet = wb.active

    # Utilizadores
    users = await db.users.find({}, {"_id": 0}).to_list(None)
    users = [u for u in users if u.get("username")]
    users.sort(key=lambda u: (u.get("full_name") or u.get("username") or "").lower())

    # Todas as férias (aprovadas + pendentes + canceladas — para cálculo do saldo)
    all_vacs_raw = await db.vacation_requests.find({}, {"_id": 0}).to_list(None)
    # Todos os ajustes admin
    all_adjs_raw = await db.vacation_adjustments.find({}, {"_id": 0}).to_list(None)

    # Filtro para o mapa: apenas aprovadas
    vacs = [v for v in all_vacs_raw if v.get("status") == "aprovada"]

    # Descobrir anos com registos aprovados
    years_set: set[int] = set()
    for v in vacs:
        try:
            s = datetime.strptime(v["start_date"], "%Y-%m-%d").date()
            e = datetime.strptime(v["end_date"], "%Y-%m-%d").date()
        except Exception:
            continue
        for y in range(s.year, e.year + 1):
            years_set.add(y)
    years_sorted = sorted(years_set)

    if not users or not years_sorted:
        ws = default_sheet
        ws.title = "Mapa"
        ws["A1"] = "MAPA DE FÉRIAS"
        ws["A1"].font = Font(bold=True, size=18, color=COLOR_HEADER_BG)
        ws["A3"] = "Sem registos de férias aprovadas."
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return buf.getvalue()

    # Agrupar férias aprovadas por utilizador (para render)
    vacs_by_user: dict[str, list] = {}
    for v in vacs:
        vacs_by_user.setdefault(v["user_id"], []).append(v)

    # Preparar contexto por utilizador (todos os pedidos + ajustes)
    reqs_by_user: dict[str, list[VacationRequestLite]] = {}
    for v in all_vacs_raw:
        try:
            r = VacationRequestLite(
                id=v["id"],
                start_date=datetime.strptime(v["start_date"], "%Y-%m-%d").date(),
                end_date=datetime.strptime(v["end_date"], "%Y-%m-%d").date(),
                dias_uteis=int(v.get("dias_uteis", 0)),
                status=v.get("status", "pendente"),
                source=v.get("source", "user"),
            )
        except Exception:
            continue
        reqs_by_user.setdefault(v["user_id"], []).append(r)

    adjs_by_user: dict[str, list[EngineAdj]] = {}
    for a in all_adjs_raw:
        try:
            adj = EngineAdj(
                year=int(a["year"]),
                dias=int(a["dias"]),
                reason=a.get("reason") or "",
            )
        except Exception:
            continue
        adjs_by_user.setdefault(a["user_id"], []).append(adj)

    # Data de entrada por utilizador
    csd_by_user: dict[str, date] = {}
    for u in users:
        raw = u.get("company_start_date")
        try:
            csd_by_user[u["id"]] = datetime.strptime(raw, "%Y-%m-%d").date() if raw else date.today()
        except Exception:
            csd_by_user[u["id"]] = date.today()

    # Uma folha por ano
    for i, y in enumerate(years_sorted):
        if i == 0:
            ws = default_sheet
            ws.title = f"Mapa {y}"
        else:
            ws = wb.create_sheet(title=f"Mapa {y}")

        # Pré-computar o mapa {data → ano-fonte} para cada utilizador neste ano
        day_source_by_user: dict[str, dict[date, int]] = {}
        for u in users:
            uid = u["id"]
            if uid not in vacs_by_user:
                continue
            day_source_by_user[uid] = _compute_day_source_year(
                y,
                uid,
                vacs_by_user[uid],
                csd_by_user.get(uid, date.today()),
                reqs_by_user.get(uid, []),
                adjs_by_user.get(uid, []),
            )

        _build_year_sheet(ws, y, users, vacs_by_user, years_sorted, day_source_by_user)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()
