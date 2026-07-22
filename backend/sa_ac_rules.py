"""Regras puras de Subsídio de Alimentação (SA) e Ajudas de Custo (AC).

Extraído de `routes/time_entries.py` para permitir importação directa em
testes sem carregar toda a cadeia de dependências do backend
(evita `exec()` no teste `test_sa_ac_rules.py`).

Regras (Feb 2026):
- <4h trabalhadas: nenhum pagamento
- >=4h com `outside_zone=False`: SA fixo (10€)
- >=4h e <6h com `outside_zone=True`: AC parcial (50%)
- >=6h com `outside_zone=True`: AC completo (50€)
"""

SA_FULL_VALUE = 10.0
AC_FULL_VALUE = 50.0


def calcular_sa_ac(total_hours: float, outside_zone: bool):
    """Calcula (payment_type, payment_value) para o dia trabalhado.

    Devolve (None, None) se não há direito a qualquer pagamento.
    """
    if total_hours < 4:
        return (None, None)
    if outside_zone:
        if total_hours < 6:
            return ("Ajuda de Custos", round(AC_FULL_VALUE * 0.5, 2))
        return ("Ajuda de Custos", AC_FULL_VALUE)
    return ("Subsídio de Alimentação", SA_FULL_VALUE)
