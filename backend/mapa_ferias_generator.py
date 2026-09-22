"""
Gerador do Mapa de Férias — usa o template Excel fornecido pela empresa.

Estratégia:
- Carrega `templates/mapa_ferias_template.xlsx` (ficheiro de referência).
- Define o ano em I15 (as fórmulas do template recalculam automaticamente).
- Preenche B23/B24/B25 com os primeiros 3 utilizadores (limite do template).
- Para cada dia de férias aprovada, escreve "F{yy}" na célula correspondente.

Limitações conhecidas:
- Template suporta 3 colaboradores por página. Se houver mais utilizadores,
  são geradas páginas adicionais ("Calendar 2026 (2)", etc).
"""
from __future__ import annotations

import io
import copy
from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet

TEMPLATE_PATH = Path(__file__).parent / "templates" / "mapa_ferias_template.xlsx"

# Mapping mês → linha de início do bloco no template
MONTH_BLOCK_ROW = {
    1: 20, 2: 28, 3: 36, 4: 44, 5: 52, 6: 60,
    7: 68, 8: 76, 9: 84, 10: 92, 11: 100, 12: 108,
}
# Dentro do bloco: linhas +3, +4, +5 = 3 employee slots (23,24,25 para Jan)
EMPLOYEE_ROW_OFFSETS = [3, 4, 5]
# Colunas dos dias: C(3) até AR(44) = 42 slots (6 semanas × 7 dias)
FIRST_DAY_COL = 3   # coluna C
LAST_DAY_COL = 44   # coluna AR


def _day_column(target_date: date) -> int:
    """Devolve o índice de coluna onde a fórmula do template coloca esse dia.

    Layout do template: cada linha do mês tem 42 colunas (C..AR) organizadas
    em 6 semanas de 7 dias, começando ao Domingo. A coluna do dia 1 é
    determinada pelo `weekday()` desse dia (Excel: Sun=1, Sat=7).
    """
    first = target_date.replace(day=1)
    # Excel WEEKDAY(x,1) → Dom=1, Seg=2, ..., Sáb=7. Python weekday(): Seg=0..Dom=6.
    excel_wd = (first.weekday() + 1) % 7 + 1  # Sun=1..Sat=7
    day_offset = (excel_wd - 1) + (target_date.day - 1)
    return FIRST_DAY_COL + day_offset


def _mark_vacation(ws: Worksheet, month: int, employee_row_offset: int, day: date, code: str):
    """Marca "F{yy}" na célula correspondente ao dia."""
    block_start = MONTH_BLOCK_ROW.get(month)
    if block_start is None:
        return
    row = block_start + employee_row_offset
    col = _day_column(day)
    if col > LAST_DAY_COL:
        return
    ws.cell(row=row, column=col, value=code)


def _iter_vacation_days(vac: dict, year: int):
    """Itera pelos dias de férias aprovada dentro do ano dado, excluindo
    `excluded_dates` e datas fora do ano."""
    try:
        s = datetime.strptime(vac["start_date"], "%Y-%m-%d").date()
        e = datetime.strptime(vac["end_date"], "%Y-%m-%d").date()
    except Exception:
        return
    excluded = set(vac.get("excluded_dates") or [])
    from datetime import timedelta
    d = s
    while d <= e:
        if d.year == year and d.strftime("%Y-%m-%d") not in excluded:
            yield d
        d += timedelta(days=1)


def _clear_employee_row_marks(ws: Worksheet, employee_row_offset: int):
    """Limpa marcas F26/F25/DFT/DD/Ex remanescentes do template nesse slot."""
    for m in range(1, 13):
        block_start = MONTH_BLOCK_ROW[m]
        row = block_start + employee_row_offset
        for col in range(FIRST_DAY_COL, LAST_DAY_COL + 1):
            cell = ws.cell(row=row, column=col)
            v = cell.value
            if isinstance(v, str) and v.strip() and not v.startswith("="):
                # Marcas conhecidas do template
                if v.strip() in ("F24", "F25", "F26", "F27", "F28", "DD", "DFT", "B", "C", "Ex"):
                    cell.value = None


def _apply_user_data(ws: Worksheet, employee_row_offset: int, user_name: str,
                     vacations: list[dict], year: int):
    """Preenche o nome e as férias de UM utilizador num dos 3 slots do template."""
    # Nome vai em B23/B24/B25 (só B23 para Jan; os outros meses referenciam)
    jan_name_row = MONTH_BLOCK_ROW[1] + employee_row_offset  # 23,24,25
    ws.cell(row=jan_name_row, column=2, value=user_name)

    # Limpar marcas antigas antes de preencher
    _clear_employee_row_marks(ws, employee_row_offset)

    yy = str(year)[-2:]  # e.g. "26"
    code = f"F{yy}"

    for vac in vacations:
        if vac.get("status") != "aprovada":
            continue
        for day in _iter_vacation_days(vac, year):
            _mark_vacation(ws, day.month, employee_row_offset, day, code)


def _duplicate_year_sheet(wb, source_sheet_name: str, new_name: str) -> Worksheet:
    """Cria uma cópia da sheet source (mantém fórmulas, formatação, merges)."""
    src = wb[source_sheet_name]
    new_ws = wb.copy_worksheet(src)
    new_ws.title = new_name
    return new_ws


async def generate_mapa_ferias_xlsx(db, year: int) -> bytes:
    """Gera o Mapa de Férias em XLSX para o ano indicado.

    Suporta N utilizadores criando páginas adicionais com sufixo (2), (3)…
    """
    wb = load_workbook(TEMPLATE_PATH)

    # Escolher sheet base — usar "Calendar {year}" se existir, senão a mais próxima
    base_sheet_name = None
    for name in wb.sheetnames:
        if str(year) in name:
            base_sheet_name = name
            break
    if not base_sheet_name:
        base_sheet_name = wb.sheetnames[-1]

    # Remover a outra sheet (Calendar 2025) para não confundir
    for name in list(wb.sheetnames):
        if name != base_sheet_name:
            del wb[name]

    # Definir o ano no I15 (fórmulas recalculam automaticamente ao abrir no Excel)
    base_ws = wb[base_sheet_name]
    base_ws["I15"] = year
    base_ws.title = f"Mapa {year}"

    # Buscar todos os utilizadores com role != admin (opcional — incluir todos)
    users = await db.users.find({}, {"_id": 0}).sort("full_name", 1).to_list(None)
    # Filtrar utilizadores ativos (ignore admin-only users if desired)
    users = [u for u in users if u.get("username")]

    # Buscar TODAS as férias aprovadas
    vacs = await db.vacation_requests.find(
        {"status": "aprovada"}, {"_id": 0}
    ).to_list(length=None)
    vacs_by_user: dict[str, list] = {}
    for v in vacs:
        vacs_by_user.setdefault(v["user_id"], []).append(v)

    # Distribuir utilizadores por sheets de 3 em 3
    chunks = [users[i:i+3] for i in range(0, len(users), 3)]
    if not chunks:
        chunks = [[]]

    for idx, chunk in enumerate(chunks):
        if idx == 0:
            ws = base_ws
        else:
            new_name = f"Mapa {year} ({idx + 1})"
            ws = _duplicate_year_sheet(wb, base_ws.title, new_name)
            ws["I15"] = year

        for slot, user in enumerate(chunk):
            display_name = user.get("full_name") or user.get("username", "")
            user_vacs = vacs_by_user.get(user["id"], [])
            _apply_user_data(ws, EMPLOYEE_ROW_OFFSETS[slot], display_name, user_vacs, year)

        # Slots vazios: limpar nome + marcas antigas do template
        for slot in range(len(chunk), 3):
            jan_row = MONTH_BLOCK_ROW[1] + EMPLOYEE_ROW_OFFSETS[slot]
            ws.cell(row=jan_row, column=2, value="")
            _clear_employee_row_marks(ws, EMPLOYEE_ROW_OFFSETS[slot])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()
