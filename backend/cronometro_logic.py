from datetime import datetime, timedelta, time
import math

def is_feriado(data):
    """Verifica se a data é feriado em Portugal"""
    # Feriados fixos 2025 (adicionar mais anos conforme necessário)
    feriados = [
        # 2025
        (2025, 1, 1),   # Ano Novo
        (2025, 4, 18),  # Sexta-feira Santa
        (2025, 4, 20),  # Páscoa
        (2025, 4, 25),  # Dia da Liberdade
        (2025, 5, 1),   # Dia do Trabalhador
        (2025, 6, 10),  # Dia de Portugal
        (2025, 6, 19),  # Corpo de Deus
        (2025, 8, 15),  # Assunção de Nossa Senhora
        (2025, 10, 5),  # Implantação da República
        (2025, 11, 1),  # Todos os Santos
        (2025, 12, 1),  # Restauração da Independência
        (2025, 12, 8),  # Imaculada Conceição
        (2025, 12, 25), # Natal
    ]
    
    return (data.year, data.month, data.day) in feriados

def get_codigo_periodo(dt_inicio, dt_fim, tipo):
    """
    Determina o código do período baseado no horário e dia da semana
    
    Args:
        dt_inicio: datetime de início do segmento
        dt_fim: datetime de fim do segmento
        tipo: "trabalho" ou "viagem"
    
    Returns:
        str: Código do período (1, 2, S, D ou V1, V2, VS, VD)
    """
    # Verificar dia da semana
    dia_semana = dt_inicio.weekday()  # 0=Segunda, 6=Domingo
    
    # Domingo ou Feriado
    if dia_semana == 6 or is_feriado(dt_inicio.date()):
        codigo_base = "D"
    # Sábado
    elif dia_semana == 5:
        codigo_base = "S"
    else:
        # Verificar horário (07:00-19:00 = Turno 1, resto = Turno 2)
        hora_inicio = dt_inicio.time()
        
        # Se maior parte do período está no Turno 1 (07:00-19:00)
        turno1_inicio = time(7, 0)
        turno1_fim = time(19, 0)
        
        # Ponto médio do período
        duracao_total = (dt_fim - dt_inicio).total_seconds()
        meio = dt_inicio + timedelta(seconds=duracao_total / 2)
        hora_meio = meio.time()
        
        if turno1_inicio <= hora_meio < turno1_fim:
            codigo_base = "1"
        else:
            codigo_base = "2"
    
    # Adicionar prefixo V se for viagem
    if tipo == "viagem":
        return f"V{codigo_base}"
    
    return codigo_base

def arredondar_horas(total_minutos):
    """
    Arredonda minutos conforme regra:
    - Mínimo 1h
    - 0-10min → :00
    - 11-40min → :30
    - 41-59min → próxima hora
    
    Args:
        total_minutos: Total de minutos
    
    Returns:
        float: Horas arredondadas (ex: 1.0, 1.5, 2.0)
    """
    if total_minutos < 60:
        return 1.0  # Mínimo 1h
    
    horas = int(total_minutos // 60)
    minutos = int(total_minutos % 60)
    
    # Aplicar regra de arredondamento
    if minutos <= 10:
        minutos_arredondados = 0
    elif 11 <= minutos <= 40:
        minutos_arredondados = 30
    else:  # 41-59
        minutos_arredondados = 0
        horas += 1
    
    return horas + (minutos_arredondados / 60)

def segmentar_periodo(hora_inicio, hora_fim, tipo):
    """
    Segmenta um período em múltiplos registos conforme mudanças de:
    - Turno (07:00, 19:00)
    - Dia (00:00)
    - Dia da semana (Sábado, Domingo/Feriado)
    
    Args:
        hora_inicio: datetime de início
        hora_fim: datetime de fim
        tipo: "trabalho" ou "viagem"
    
    Returns:
        list: Lista de dicts com segmentos
    """
    segmentos = []
    
    atual = hora_inicio
    
    while atual < hora_fim:
        # Determinar próximo ponto de quebra
        proxima_quebra = None
        
        # 1. Mudança de dia (00:00)
        proximo_dia = datetime.combine(
            atual.date() + timedelta(days=1),
            time(0, 0)
        )
        proximo_dia = atual.replace(
            year=proximo_dia.year,
            month=proximo_dia.month,
            day=proximo_dia.day,
            hour=0,
            minute=0,
            second=0,
            microsecond=0
        )
        if atual < proximo_dia <= hora_fim:
            if proxima_quebra is None or proximo_dia < proxima_quebra:
                proxima_quebra = proximo_dia
        
        # 2. Mudança de turno 07:00
        if atual.time() < time(7, 0):
            turno_7 = atual.replace(hour=7, minute=0, second=0, microsecond=0)
            if atual < turno_7 <= hora_fim:
                if proxima_quebra is None or turno_7 < proxima_quebra:
                    proxima_quebra = turno_7
        
        # 3. Mudança de turno 19:00
        if atual.time() < time(19, 0):
            turno_19 = atual.replace(hour=19, minute=0, second=0, microsecond=0)
            if atual < turno_19 <= hora_fim:
                if proxima_quebra is None or turno_19 < proxima_quebra:
                    proxima_quebra = turno_19
        
        # Determinar fim do segmento
        fim_segmento = proxima_quebra if proxima_quebra else hora_fim
        
        # Calcular duração e arredondar
        duracao_minutos = (fim_segmento - atual).total_seconds() / 60
        horas_arredondadas = arredondar_horas(duracao_minutos)
        
        # Determinar código
        codigo = get_codigo_periodo(atual, fim_segmento, tipo)
        
        # Adicionar segmento
        segmentos.append({
            "hora_inicio_segmento": atual,
            "hora_fim_segmento": fim_segmento,
            "duracao_minutos": duracao_minutos,
            "horas_arredondadas": horas_arredondadas,
            "codigo": codigo,
            "data": atual.date()
        })
        
        # Avançar para próximo segmento
        atual = fim_segmento
    
    return segmentos
