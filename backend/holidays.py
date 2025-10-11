from datetime import datetime, date
from typing import List, Dict

# Feriados fixos em Portugal
FIXED_HOLIDAYS = {
    (1, 1): "Ano Novo",
    (4, 25): "Dia da Liberdade",
    (5, 1): "Dia do Trabalhador",
    (6, 10): "Dia de Portugal",
    (8, 15): "Assunção de Nossa Senhora",
    (10, 5): "Implantação da República",
    (11, 1): "Todos os Santos",
    (12, 1): "Restauração da Independência",
    (12, 8): "Imaculada Conceição",
    (12, 25): "Natal"
}

# Feriados móveis para 2025-2027 (precisam ser calculados ou definidos manualmente)
# Páscoa e dias relacionados (Carnaval, Sexta-Feira Santa, Corpo de Deus)
MOVABLE_HOLIDAYS = {
    2025: [
        (3, 4, "Carnaval"),
        (4, 18, "Sexta-Feira Santa"),
        (4, 20, "Páscoa"),
        (6, 19, "Corpo de Deus")
    ],
    2026: [
        (2, 17, "Carnaval"),
        (4, 3, "Sexta-Feira Santa"),
        (4, 5, "Páscoa"),
        (6, 4, "Corpo de Deus")
    ],
    2027: [
        (2, 9, "Carnaval"),
        (3, 26, "Sexta-Feira Santa"),
        (3, 28, "Páscoa"),
        (5, 27, "Corpo de Deus")
    ]
}

def is_holiday(check_date: date) -> tuple[bool, str]:
    """
    Verifica se uma data é feriado em Portugal.
    Retorna (is_holiday, holiday_name)
    """
    # Verifica feriados fixos
    month_day = (check_date.month, check_date.day)
    if month_day in FIXED_HOLIDAYS:
        return True, FIXED_HOLIDAYS[month_day]
    
    # Verifica feriados móveis
    year = check_date.year
    if year in MOVABLE_HOLIDAYS:
        for month, day, name in MOVABLE_HOLIDAYS[year]:
            if check_date.month == month and check_date.day == day:
                return True, name
    
    return False, ""

def is_weekend(check_date: date) -> bool:
    """
    Verifica se uma data é fim de semana (sábado ou domingo).
    weekday: 0=Monday, 6=Sunday
    """
    return check_date.weekday() in [5, 6]  # 5=Saturday, 6=Sunday

def is_overtime_day(check_date: date) -> tuple[bool, str]:
    """
    Verifica se um dia é considerado para horas extras.
    Retorna (is_overtime, reason)
    """
    if is_weekend(check_date):
        day_name = "Sábado" if check_date.weekday() == 5 else "Domingo"
        return True, day_name
    
    is_hol, hol_name = is_holiday(check_date)
    if is_hol:
        return True, f"Feriado: {hol_name}"
    
    return False, "Dia útil"

def get_holidays_for_year(year: int) -> List[Dict]:
    """
    Retorna lista de todos os feriados para um ano específico.
    """
    holidays = []
    
    # Adiciona feriados fixos
    for (month, day), name in FIXED_HOLIDAYS.items():
        holidays.append({
            "date": f"{year}-{month:02d}-{day:02d}",
            "name": name,
            "type": "fixed"
        })
    
    # Adiciona feriados móveis
    if year in MOVABLE_HOLIDAYS:
        for month, day, name in MOVABLE_HOLIDAYS[year]:
            holidays.append({
                "date": f"{year}-{month:02d}-{day:02d}",
                "name": name,
                "type": "movable"
            })
    
    # Ordena por data
    holidays.sort(key=lambda x: x["date"])
    return holidays

def get_billing_period_dates(reference_date: date = None) -> tuple[date, date]:
    """
    Calcula o período de faturação (26 do mês anterior a 25 do mês atual).
    Se reference_date for None, usa a data atual.
    """
    if reference_date is None:
        reference_date = date.today()
    
    # Se estamos antes do dia 26, o período é do mês anterior
    if reference_date.day < 26:
        # Período termina no dia 25 do mês atual
        end_date = date(reference_date.year, reference_date.month, 25)
        
        # Início é dia 26 do mês anterior
        if reference_date.month == 1:
            start_date = date(reference_date.year - 1, 12, 26)
        else:
            # Pode haver meses com menos de 26 dias? Não, então sempre dia 26
            start_date = date(reference_date.year, reference_date.month - 1, 26)
    else:
        # Estamos no dia 26 ou depois, então o período atual já começou
        start_date = date(reference_date.year, reference_date.month, 26)
        
        # Termina no dia 25 do próximo mês
        if reference_date.month == 12:
            end_date = date(reference_date.year + 1, 1, 25)
        else:
            end_date = date(reference_date.year, reference_date.month + 1, 25)
    
    return start_date, end_date
