"""
Motor de Férias — Código do Trabalho Português (arts. 237.º–246.º, 264.º)
========================================================================

Fonte única de cálculo do saldo de férias por utilizador e por ano.
Substitui a lógica FIFO anterior (helpers.calculate_vacation_days_by_year +
routes/vacations._build_year_balances) por um modelo separado e explícito:

- **Dias Vencidos**: dias ganhos NESTE ano (regra Art. 239.º / 240.º).
- **Dias Transitados**: dias que sobraram do ano anterior (Art. 244.º).
- **Dias Gozados**: dias úteis (excluindo feriados) marcados COM
  status="approved" cuja start_date esteja no ano em causa, menos
  cancelamentos. Também soma o override manual `dias_gozados_anteriores`
  (importação de histórico pré-sistema).
- **Dias Marcados** (futuros): pedidos "approved" cujo período ainda não
  chegou (usado para reservar saldo). Também expõe `periodos` (lista de
  {start, end}).
- **Dias Disponíveis**: vencidos + transitados - gozados - marcados.

Feriados excluídos: nacionais (fixos + móveis) + municipais Barreiro,
Setúbal, Lisboa.

Regras aplicadas:
- Art. 239.º (ano de admissão): 2 dias úteis por mês trabalhado, máximo 20,
  gozáveis SÓ APÓS 6 MESES completos de contrato.
- Art. 240.º (anos seguintes): 22 dias úteis vencidos a 1 de Janeiro.
- Art. 243.º: interrupção por doença (não trata automaticamente).
- Art. 244.º: acumulação para o ano seguinte (transitados).
- Art. 264.º: subsídio de férias (só metadados, não conta em dias).
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Dict, List, Set, Optional

# =============================================================================
# Feriados
# =============================================================================
# Feriados nacionais (fixos + móveis) — usa a lista de holidays.py.
# Municipais adicionados: Barreiro (22 Julho — Nossa Sra. do Rosário),
# Setúbal (15 Setembro — Nossa Sra. da Piedade), Lisboa (13 Junho — Sto António).

_MUNICIPIOS_FIXOS = {
    (7, 22),   # Barreiro
    (9, 15),   # Setúbal
    (6, 13),   # Lisboa
}


def _feriados_nacionais_set(year: int) -> Set[date]:
    """Devolve feriados nacionais (fixos + móveis) do ano como set[date]."""
    from holidays import FIXED_HOLIDAYS, MOVABLE_HOLIDAYS
    out: Set[date] = set()
    for (m, d) in FIXED_HOLIDAYS.keys():
        try:
            out.add(date(year, m, d))
        except ValueError:
            pass
    for m, d, _name in MOVABLE_HOLIDAYS.get(year, []):
        try:
            out.add(date(year, m, d))
        except ValueError:
            pass
    return out


def feriados_do_ano(year: int) -> Set[date]:
    """Feriados nacionais + municipais Barreiro/Setúbal/Lisboa."""
    out = _feriados_nacionais_set(year)
    for (m, d) in _MUNICIPIOS_FIXOS:
        try:
            out.add(date(year, m, d))
        except ValueError:
            pass
    return out


def is_dia_util(d: date, feriados_set: Optional[Set[date]] = None) -> bool:
    """Dia útil = segunda a sexta E não é feriado."""
    if d.weekday() >= 5:
        return False
    if feriados_set is None:
        feriados_set = feriados_do_ano(d.year)
    return d not in feriados_set


def dias_uteis_no_periodo(start: date, end: date) -> int:
    """Conta dias úteis (Seg-Sex, excluindo feriados) entre start e end (inclusive)."""
    if start > end:
        return 0
    total = 0
    cur = start
    # Cache feriados por ano visto
    cache: Dict[int, Set[date]] = {}
    while cur <= end:
        if cur.year not in cache:
            cache[cur.year] = feriados_do_ano(cur.year)
        if is_dia_util(cur, cache[cur.year]):
            total += 1
        cur += timedelta(days=1)
    return total


# =============================================================================
# Cálculo de dias vencidos por ano
# =============================================================================

def calcular_dias_vencidos(admissao_date: date, year: int) -> Dict:
    """Dias que vencem NUM ano específico.

    Ano de admissão (Art. 239.º):
    - 2 dias úteis por mês completo trabalhado, máx 20.
    - Só gozáveis após 6 meses completos de contrato.
    - Se admissão a 1 do mês, esse mês conta. Caso contrário, começa a
      contar no mês seguinte (mais uniforme e sem ambiguidade).

    Anos seguintes: 22 dias úteis, vencem a 1 Janeiro.

    Devolve:
        {
          "year": int,
          "dias_vencidos": int,
          "meses_trabalhados": int,
          "data_disponibilidade": ISO date or None,  # a partir de quando pode gozar
          "regra": "admissao" | "anual",
          "notas": str,
        }
    """
    if year < admissao_date.year:
        return {
            "year": year,
            "dias_vencidos": 0,
            "meses_trabalhados": 0,
            "data_disponibilidade": None,
            "regra": "pre_admissao",
            "notas": "Antes da data de admissão.",
        }

    if year == admissao_date.year:
        # Ano de admissão — pró-rata
        # Meses trabalhados = do mês seguinte à admissão (ou o mesmo se dia 1) até Dezembro
        first_full_month = admissao_date.month if admissao_date.day == 1 else admissao_date.month + 1
        if first_full_month > 12:
            meses = 0
        else:
            meses = 12 - first_full_month + 1
        dias = min(meses * 2, 20)
        # Disponibilidade: 6 meses após admissão
        data_disp = admissao_date + timedelta(days=182)  # ~6 meses (usar 182 dias para robustez)
        return {
            "year": year,
            "dias_vencidos": dias,
            "meses_trabalhados": meses,
            "data_disponibilidade": data_disp.isoformat(),
            "regra": "admissao",
            "notas": f"Art. 239.º — 2 dias/mês × {meses} meses, máx 20. Gozáveis após {data_disp.isoformat()}.",
        }

    # Anos seguintes ao de admissão — 22 dias úteis a 1 Janeiro
    return {
        "year": year,
        "dias_vencidos": 22,
        "meses_trabalhados": 12,
        "data_disponibilidade": date(year, 1, 1).isoformat(),
        "regra": "anual",
        "notas": "Art. 240.º — 22 dias úteis vencidos a 1 Janeiro.",
    }


# =============================================================================
# Contagem de dias efectivamente gozados a partir dos pedidos aprovados
# =============================================================================

def _expand_periodo_para_dias_uteis(
    start: date, end: date, cancelled: Set[str],
) -> List[date]:
    """Expande [start, end] em lista de dias úteis (excluindo feriados),
    ignorando datas em `cancelled` (formato ISO YYYY-MM-DD)."""
    if start > end:
        return []
    result = []
    cache: Dict[int, Set[date]] = {}
    cur = start
    while cur <= end:
        if cur.year not in cache:
            cache[cur.year] = feriados_do_ano(cur.year)
        if is_dia_util(cur, cache[cur.year]) and cur.isoformat() not in cancelled:
            result.append(cur)
        cur += timedelta(days=1)
    return result


# =============================================================================
# Saldo completo por ano
# =============================================================================

@dataclass
class YearBalance:
    year: int
    dias_vencidos: int = 0
    dias_transitados: int = 0        # sobra do ano anterior
    dias_gozados: int = 0            # dias úteis já gozados neste ano
    dias_marcados: int = 0           # dias úteis marcados/aprovados futuros neste ano
    dias_disponiveis: int = 0        # vencidos + transitados - gozados - marcados
    periodos: List[Dict] = field(default_factory=list)  # [{start,end,days,status}]
    dias_gozados_anteriores_override: int = 0
    regra: str = "anual"
    data_disponibilidade: Optional[str] = None
    notas: str = ""

    def as_dict(self) -> Dict:
        return {
            "year": self.year,
            "dias_vencidos": self.dias_vencidos,
            "dias_transitados": self.dias_transitados,
            "dias_gozados": self.dias_gozados,
            "dias_marcados": self.dias_marcados,
            "dias_disponiveis": self.dias_disponiveis,
            "periodos": self.periodos,
            "dias_gozados_anteriores_override": self.dias_gozados_anteriores_override,
            "regra": self.regra,
            "data_disponibilidade": self.data_disponibilidade,
            "notas": self.notas,
        }


def calcular_saldo_completo(
    admissao_date: date,
    approved_requests: List[Dict],
    cancelled_dates: Set[str],
    dias_gozados_anteriores: Dict[int, int],
    today: Optional[date] = None,
    include_years_after: Optional[int] = 0,
) -> List[Dict]:
    """Devolve breakdown completo por ano (do ano de admissão até `today.year`).

    - `approved_requests`: lista de dicts com pelo menos start_date/end_date
      (strings ISO). Assume-se todos aprovados.
    - `cancelled_dates`: set de dias ISO cancelados.
    - `dias_gozados_anteriores`: {year: dias_extra_gozados_no_ano} — override
      manual do admin para importar histórico pré-sistema.
    - `include_years_after`: quantos anos EXTRA depois do ano corrente
      incluir no output (por defeito 0, para mostrar planeamento futuro pode
      passar 1).

    A cada ano:
    - `dias_gozados` = dias úteis dos pedidos aprovados nesse ano que já
      chegaram (fim ≤ hoje), + `dias_gozados_anteriores[year]` override.
    - `dias_marcados` = dias úteis dos pedidos aprovados FUTUROS nesse ano
      (start > hoje ou período em curso).
    - `dias_transitados`: cascata FIFO — sobra positiva de vencidos+transitados
      -gozados-marcados do ano anterior; nunca negativa (a lei permite acumular).
    - `dias_disponiveis` = vencidos + transitados - gozados - marcados
      (pode ser negativo se over-marcaram — sinaliza no notas).
    """
    if today is None:
        today = date.today()

    year_start = admissao_date.year
    year_end = today.year + (include_years_after or 0)

    # 1) Pré-expandir todos os pedidos aprovados em lista de datas úteis por ano
    dias_por_ano_gozados: Dict[int, int] = {}
    dias_por_ano_marcados: Dict[int, int] = {}
    periodos_por_ano: Dict[int, List[Dict]] = {}

    for req in approved_requests:
        try:
            s = datetime.strptime(req["start_date"], "%Y-%m-%d").date()
            e = datetime.strptime(req["end_date"], "%Y-%m-%d").date()
        except (KeyError, TypeError, ValueError):
            continue
        dias = _expand_periodo_para_dias_uteis(s, e, cancelled_dates)
        # Agrupar por ano (baseado no ano de cada dia)
        anos_do_periodo = sorted({d.year for d in dias})
        for y in anos_do_periodo:
            dias_do_ano = [d for d in dias if d.year == y]
            gozados = [d for d in dias_do_ano if d <= today]
            marcados_futuros = [d for d in dias_do_ano if d > today]
            dias_por_ano_gozados[y] = dias_por_ano_gozados.get(y, 0) + len(gozados)
            dias_por_ano_marcados[y] = dias_por_ano_marcados.get(y, 0) + len(marcados_futuros)
        # Registar o período no ano do start_date (para a coluna "Períodos")
        anchor_year = s.year
        periodos_por_ano.setdefault(anchor_year, []).append({
            "start": s.isoformat(),
            "end": e.isoformat(),
            "days": len(dias),
            "status": req.get("status", "approved"),
        })

    # 2) Iterar anos e construir cascata
    saldos: List[YearBalance] = []
    transitados_next = 0

    for year in range(year_start, year_end + 1):
        vencidos_info = calcular_dias_vencidos(admissao_date, year)
        yb = YearBalance(
            year=year,
            dias_vencidos=vencidos_info["dias_vencidos"],
            dias_transitados=transitados_next,
            regra=vencidos_info["regra"],
            data_disponibilidade=vencidos_info["data_disponibilidade"],
            notas=vencidos_info["notas"],
        )
        # Override manual (importado do histórico pré-sistema)
        override = int((dias_gozados_anteriores or {}).get(year, 0) or 0)
        yb.dias_gozados_anteriores_override = override

        gozados_auto = int(dias_por_ano_gozados.get(year, 0))
        marcados_auto = int(dias_por_ano_marcados.get(year, 0))
        # Somamos o override diretamente aos gozados (é histórico gozado)
        yb.dias_gozados = gozados_auto + override
        yb.dias_marcados = marcados_auto
        yb.periodos = periodos_por_ano.get(year, [])

        yb.dias_disponiveis = (
            yb.dias_vencidos + yb.dias_transitados - yb.dias_gozados - yb.dias_marcados
        )

        # Cascata: sobra positiva transita para o próximo ano (Art. 244.º)
        sobra = yb.dias_disponiveis
        transitados_next = max(0, sobra) if year < year_end else 0

        saldos.append(yb)

    return [s.as_dict() for s in saldos]


# =============================================================================
# Utilities usadas pelas rotas / relatórios
# =============================================================================

def totais_do_saldo(saldos: List[Dict]) -> Dict:
    """Devolve totais agregados (soma de todos os anos do breakdown)."""
    return {
        "total_vencidos": sum(s["dias_vencidos"] for s in saldos),
        "total_transitados": sum(s["dias_transitados"] for s in saldos),
        "total_gozados": sum(s["dias_gozados"] for s in saldos),
        "total_marcados": sum(s["dias_marcados"] for s in saldos),
        "total_disponiveis": sum(s["dias_disponiveis"] for s in saldos),
    }
