"""
Cálculo de horas de trabalho baseado nas regras específicas da HWI
Convertido do script JavaScript fornecido
"""
import math
from datetime import datetime, date, timedelta
from typing import Dict, List, Tuple

def calcular_pascoa(ano: int) -> date:
    """Calcular data da Páscoa usando o algoritmo de Computus"""
    a = ano % 19
    b = ano // 100
    c = ano % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mes = (h + l - 7 * m + 114) // 31
    dia = ((h + l - 7 * m + 114) % 31) + 1
    
    return date(ano, mes, dia)

def feriados_portugueses(ano: int) -> set:
    """Retorna conjunto de datas de feriados portugueses para um ano"""
    pascoa = calcular_pascoa(ano)
    
    feriados = {
        date(ano, 1, 1),   # Ano Novo
        date(ano, 4, 25),  # 25 de Abril
        date(ano, 5, 1),   # Dia do Trabalhador
        date(ano, 6, 10),  # Dia de Portugal
        date(ano, 8, 15),  # Assunção de Nossa Senhora
        date(ano, 10, 5),  # Implantação da República
        date(ano, 11, 1),  # Todos os Santos
        date(ano, 12, 1),  # Restauração da Independência
        date(ano, 12, 8),  # Imaculada Conceição
        date(ano, 12, 25), # Natal
        pascoa - timedelta(days=2),  # Sexta-feira Santa
        pascoa,                       # Páscoa
        pascoa + timedelta(days=60)   # Corpo de Deus
    }
    
    return feriados

def calcular_horas_dia(total_minutos: int, dia_semana: int, is_feriado: bool) -> Dict[str, int]:
    """
    Calcular breakdown de horas para um dia
    
    Args:
        total_minutos: Total de minutos trabalhados
        dia_semana: 0=Domingo, 1=Segunda, ..., 6=Sábado
        is_feriado: Se é feriado
    
    Returns:
        Dict com minutos em cada categoria
    """
    limite_minutos = 8 * 60  # 8 horas = 480 minutos
    
    resultado = {
        "horas_normais": 0,
        "horas_extra": 0,
        "horas_especial": 0  # Sábado, Domingo e Feriado JUNTOS
    }
    
    if is_feriado or dia_semana == 0 or dia_semana == 6:  # Feriado, Domingo ou Sábado
        resultado["horas_especial"] = total_minutos
    else:  # Dias úteis (Segunda a Sexta)
        if total_minutos <= limite_minutos:
            resultado["horas_normais"] = total_minutos
        else:
            resultado["horas_normais"] = limite_minutos
            resultado["horas_extra"] = total_minutos - limite_minutos
    
    return resultado

def minutos_para_horas(minutos: int) -> float:
    """Converter minutos para horas decimais (2 casas)"""
    return round(minutos / 60, 2)

def calcular_breakdown_completo(
    start_time: datetime,
    end_time: datetime,
    data_entrada: date
) -> Dict[str, float]:
    """
    Calcular breakdown completo de horas usando as regras da HWI
    
    Returns:
        Dict com horas em formato decimal:
        - regular_hours (horas normais)
        - overtime_hours (horas extra)
        - special_hours (horas sábado/domingo/feriado JUNTAS)
    """
    # Normalizar timestamps: remover segundos antes de calcular
    start_time = start_time.replace(second=0, microsecond=0)
    end_time = end_time.replace(second=0, microsecond=0)
    
    # Calcular total de segundos (agora sempre múltiplo de 60)
    total_seconds = (end_time - start_time).total_seconds()
    
    # Converter para minutos inteiros
    total_minutos = int(total_seconds / 60)
    
    # Verificar dia da semana e se é feriado
    dia_semana = data_entrada.weekday()  # 0=Segunda, 6=Domingo (diferente do JS!)
    # Converter para formato JS: 0=Domingo, 1=Segunda, ..., 6=Sábado
    dia_semana_js = (dia_semana + 1) % 7
    
    ano = data_entrada.year
    feriados = feriados_portugueses(ano)
    is_feriado = data_entrada in feriados
    
    # Calcular breakdown em minutos
    breakdown_min = calcular_horas_dia(total_minutos, dia_semana_js, is_feriado)
    
    # Converter para horas decimais (SEM saturday_hours separado)
    return {
        "regular_hours": minutos_para_horas(breakdown_min["horas_normais"]),
        "overtime_hours": minutos_para_horas(breakdown_min["horas_extra"]),
        "special_hours": minutos_para_horas(breakdown_min["horas_especial"])
    }
