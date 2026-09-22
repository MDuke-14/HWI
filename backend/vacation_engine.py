"""
Motor central de férias — ÚNICA fonte de verdade para todos os cálculos de férias.

Regras (Código do Trabalho, art. 239.º):
- Ano de admissão: 2 dias úteis por cada mês completo de contrato, até **20 dias**.
- Anos seguintes: 22 dias úteis, atribuídos a 1 de Janeiro.

Contagem de dias úteis: inclusiva no início e no fim, excluindo:
  - sábados (weekday 5)
  - domingos (weekday 6)
  - feriados portugueses (fixos + móveis via Páscoa)

Este módulo é 100% funcional (não faz IO). As rotas e serviços chamam
`compute_year_balance()` para obter o resumo por ano.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Iterable

from hours_calculator import feriados_portugueses

# ============================== Utilidades ==============================


def feriados_do_ano(year: int) -> set[date]:
    """Alias público para reuso — devolve o conjunto de feriados nacionais."""
    return feriados_portugueses(year)


def is_dia_util(d: date, feriados: set[date] | None = None) -> bool:
    """True se `d` é dia útil (segunda-sexta, não feriado)."""
    if d.weekday() >= 5:
        return False
    if feriados is None:
        feriados = feriados_portugueses(d.year)
    return d not in feriados


def dias_uteis_no_periodo(start: date, end: date) -> int:
    """Conta dias úteis entre `start` e `end`, **inclusive** ambos os extremos.

    Ignora sábados, domingos e feriados portugueses (podendo abranger vários anos).
    Se start > end devolve 0.
    """
    if start > end:
        return 0
    # Cache feriados por cada ano tocado (evita recalcular por dia)
    anos = {y for y in range(start.year, end.year + 1)}
    feriados: set[date] = set()
    for y in anos:
        feriados |= feriados_portugueses(y)
    n = 0
    d = start
    one = timedelta(days=1)
    while d <= end:
        if d.weekday() < 5 and d not in feriados:
            n += 1
        d += one
    return n


def datas_uteis_no_periodo(start: date, end: date) -> list[date]:
    """Devolve a lista de datas úteis (dias efectivos de férias) no período fechado.

    Útil para renderizar linhas "FÉRIAS" nos relatórios mensais.
    """
    if start > end:
        return []
    anos = {y for y in range(start.year, end.year + 1)}
    feriados: set[date] = set()
    for y in anos:
        feriados |= feriados_portugueses(y)
    out: list[date] = []
    d = start
    one = timedelta(days=1)
    while d <= end:
        if d.weekday() < 5 and d not in feriados:
            out.append(d)
        d += one
    return out


# ==================== Direito legal por ano ====================


def dias_vencidos_no_ano(company_start_date: date, year: int) -> int:
    """Dias de férias a que o colaborador tem direito no ano `year`,
    respeitando as regras do art. 239.º do Código do Trabalho.

    - Se `year < company_start_date.year` → 0.
    - Se `year == company_start_date.year` (ano de admissão):
        2 dias por cada mês completo de contrato, cap **20 dias**.
        Um "mês completo" conta se o dia de admissão for ≤ dia 1 do mês
        seguinte (interpretação prática: se admitido a 15/07, o mês de
        Julho **não** conta como completo; contam Ago–Dez → 5 meses × 2 = 10 dias).
    - Se `year > company_start_date.year` → 22 dias.
    """
    if year < company_start_date.year:
        return 0
    if year > company_start_date.year:
        return 22

    # Ano de admissão — cálculo pro-rata
    # Meses completos = do mês *seguinte* ao da admissão até Dezembro,
    # excepto se admitido a dia 1 (aí conta o próprio mês).
    if company_start_date.day == 1:
        first_full_month = company_start_date.month
    else:
        first_full_month = company_start_date.month + 1
    meses_completos = max(0, 12 - first_full_month + 1)
    return min(meses_completos * 2, 20)


# ==================== Saldo por ano ====================


@dataclass
class YearBalance:
    year: int
    dias_totais: int              # Direito legal do ano (22 ou pro-rata)
    dias_transitados: int         # Vindos do ano anterior + ajustes admin
    dias_gozados: int             # Aprovadas (pedidos + histórico) neste ano
    dias_pendentes: int           # Pedidos pendentes neste ano
    dias_cancelados: int          # Cancelados (informativo — não conta para saldo)
    dias_disponiveis: int         # totais + transitados - gozados - pendentes

    def to_dict(self) -> dict:
        return {
            "year": self.year,
            "dias_totais": self.dias_totais,
            "dias_transitados": self.dias_transitados,
            "dias_gozados": self.dias_gozados,
            "dias_pendentes": self.dias_pendentes,
            "dias_cancelados": self.dias_cancelados,
            "dias_disponiveis": self.dias_disponiveis,
        }


@dataclass
class VacationRequestLite:
    """Representação minimalista de um pedido para cálculo de saldo.

    Convenções:
    - `dias_uteis` já vem calculado (pela função `dias_uteis_no_periodo` no
      momento da criação/edição do pedido).
    - `start_date` determina o ano a que o pedido é atribuído. Se um pedido
      atravessa dois anos, é sempre atribuído ao ano do `start_date`
      (assumimos que pedidos são curtos — o admin fará split manual se preciso).
    - `status` ∈ {pendente, aprovada, rejeitada, cancelada}.
    - `source` ∈ {user, historic}.
    """
    id: str
    start_date: date
    end_date: date
    dias_uteis: int
    status: str
    source: str  # 'user' | 'historic'


@dataclass
class VacationAdjustment:
    """Ajuste administrativo de dias transitados (para inicialização do sistema)."""
    year: int
    dias: int  # pode ser positivo (adicionar) ou negativo (subtrair)
    reason: str = ""


def compute_year_balance(
    company_start_date: date,
    year: int,
    requests: Iterable[VacationRequestLite],
    adjustments: Iterable[VacationAdjustment] = (),
    prev_year_available: int = 0,
) -> YearBalance:
    """Calcula o saldo de férias para um determinado ano.

    - `company_start_date`: data de entrada na empresa (do perfil do utilizador)
    - `year`: ano a calcular
    - `requests`: TODOS os pedidos do utilizador (pendentes + aprovados + histórico)
      — a função filtra por ano interno.
    - `adjustments`: lista de ajustes administrativos (transitados iniciais)
      APLICÁVEIS a este ano.
    - `prev_year_available`: saldo disponível remanescente do ano anterior
      (para o carry-over automático de anos posteriores à admissão).
      No ano de admissão vale 0.

    Retorna um `YearBalance`.
    """
    dias_totais = dias_vencidos_no_ano(company_start_date, year)

    # Transitados: soma dos ajustes admin explícitos + carry-over automático
    dias_transitados = sum(a.dias for a in adjustments if a.year == year)
    dias_transitados += max(0, prev_year_available)

    reqs_ano = [r for r in requests if r.start_date.year == year]
    dias_gozados = sum(r.dias_uteis for r in reqs_ano if r.status == "aprovada")
    dias_pendentes = sum(r.dias_uteis for r in reqs_ano if r.status == "pendente")
    dias_cancelados = sum(r.dias_uteis for r in reqs_ano if r.status == "cancelada")

    dias_disponiveis = dias_totais + dias_transitados - dias_gozados - dias_pendentes

    return YearBalance(
        year=year,
        dias_totais=dias_totais,
        dias_transitados=dias_transitados,
        dias_gozados=dias_gozados,
        dias_pendentes=dias_pendentes,
        dias_cancelados=dias_cancelados,
        dias_disponiveis=dias_disponiveis,
    )


def compute_history(
    company_start_date: date,
    end_year: int,
    requests: Iterable[VacationRequestLite],
    adjustments: Iterable[VacationAdjustment] = (),
) -> list[YearBalance]:
    """Devolve o histórico anual desde o ano de admissão até `end_year`.

    O carry-over é encadeado: o `dias_disponiveis` de um ano é adicionado
    aos `dias_transitados` do ano seguinte (a somar aos ajustes admin desse ano).
    """
    requests = list(requests)
    adjustments = list(adjustments)
    out: list[YearBalance] = []
    prev_available = 0
    for y in range(company_start_date.year, end_year + 1):
        yb = compute_year_balance(
            company_start_date, y, requests, adjustments, prev_available
        )
        out.append(yb)
        # Só carry-over quando disponível é positivo (transita); negativo indica
        # já se pediu mais do que os totais e não faz sentido "transitar negativo".
        prev_available = max(0, yb.dias_disponiveis)
    return out
