"""
Lógica de segmentação de cronómetros para OTs
"""
from datetime import datetime, timedelta, time, date
import math
import logging

# Feriados portugueses (fixos e móveis para 2025-2027)
FERIADOS_PORTUGAL = {
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
    # 2026
    (2026, 1, 1),   # Ano Novo
    (2026, 4, 3),   # Sexta-feira Santa
    (2026, 4, 5),   # Páscoa
    (2026, 4, 25),  # Dia da Liberdade
    (2026, 5, 1),   # Dia do Trabalhador
    (2026, 6, 4),   # Corpo de Deus
    (2026, 6, 10),  # Dia de Portugal
    (2026, 8, 15),  # Assunção de Nossa Senhora
    (2026, 10, 5),  # Implantação da República
    (2026, 11, 1),  # Todos os Santos
    (2026, 12, 1),  # Restauração da Independência
    (2026, 12, 8),  # Imaculada Conceição
    (2026, 12, 25), # Natal
    # 2027
    (2027, 1, 1),   # Ano Novo
    (2027, 3, 26),  # Sexta-feira Santa
    (2027, 3, 28),  # Páscoa
    (2027, 4, 25),  # Dia da Liberdade
    (2027, 5, 1),   # Dia do Trabalhador
    (2027, 5, 27),  # Corpo de Deus
    (2027, 6, 10),  # Dia de Portugal
    (2027, 8, 15),  # Assunção de Nossa Senhora
    (2027, 10, 5),  # Implantação da República
    (2027, 11, 1),  # Todos os Santos
    (2027, 12, 1),  # Restauração da Independência
    (2027, 12, 8),  # Imaculada Conceição
    (2027, 12, 25), # Natal
}


def is_feriado(data):
    """Verifica se a data é feriado em Portugal"""
    if isinstance(data, datetime):
        data = data.date()
    return (data.year, data.month, data.day) in FERIADOS_PORTUGAL


def get_codigo_horario(dt, is_weekend_or_holiday=None):
    """
    Determina o código horário para um dado momento
    
    Códigos:
    - 1: Dias úteis 07:00-19:00
    - 2: Dias úteis noturno 19:00-07:00
    - S: Sábados (todo o dia)
    - D: Domingos e Feriados (todo o dia)
    
    Args:
        dt: datetime do momento
        is_weekend_or_holiday: Se já sabemos se é fim de semana/feriado (optimização)
    
    Returns:
        str: Código do período (1, 2, S, D)
    """
    if isinstance(dt, datetime):
        data = dt.date()
        hora = dt.time()
    else:
        data = dt
        hora = time(12, 0)  # Meio dia como default
    
    dia_semana = data.weekday()  # 0=Segunda, 6=Domingo
    
    # Domingo ou Feriado = código D (todo o dia)
    if dia_semana == 6 or is_feriado(data):
        return "D"
    
    # Sábado = código S (todo o dia)
    if dia_semana == 5:
        return "S"
    
    # Dias úteis - verificar horário
    turno1_inicio = time(7, 0)
    turno1_fim = time(19, 0)
    
    if turno1_inicio <= hora < turno1_fim:
        return "1"
    else:
        return "2"


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
    Segmenta um período em múltiplos registos conforme mudanças de código horário.
    
    Regras:
    - Sábados (S) e Domingos/Feriados (D): código único para todo o dia
    - Dias úteis: segmentar em 07:00 e 19:00 (códigos 1 e 2)
    - Sempre segmentar à meia-noite (mudança de dia)
    
    Args:
        hora_inicio: datetime de início
        hora_fim: datetime de fim
        tipo: "trabalho", "viagem" ou "oficina"
    
    Returns:
        list: Lista de dicts com segmentos
    """
    segmentos = []
    atual = hora_inicio
    
    # Garantir que temos datetimes com timezone
    if atual.tzinfo is None:
        from datetime import timezone as tz
        atual = atual.replace(tzinfo=tz.utc)
    if hora_fim.tzinfo is None:
        from datetime import timezone as tz
        hora_fim = hora_fim.replace(tzinfo=tz.utc)
    
    while atual < hora_fim:
        data_atual = atual.date()
        dia_semana = data_atual.weekday()
        eh_feriado = is_feriado(data_atual)
        
        # Determinar pontos de quebra para este dia
        pontos_quebra = []
        
        # Sempre adicionar meia-noite do próximo dia
        meia_noite_proxima = datetime.combine(
            data_atual + timedelta(days=1),
            time(0, 0),
            tzinfo=atual.tzinfo
        )
        pontos_quebra.append(meia_noite_proxima)
        
        # Se é dia útil (não sábado, domingo ou feriado), adicionar quebras às 07:00 e 19:00
        if dia_semana < 5 and not eh_feriado:
            # Quebra às 07:00
            quebra_07 = datetime.combine(data_atual, time(7, 0), tzinfo=atual.tzinfo)
            if atual < quebra_07 < hora_fim:
                pontos_quebra.append(quebra_07)
            
            # Quebra às 19:00
            quebra_19 = datetime.combine(data_atual, time(19, 0), tzinfo=atual.tzinfo)
            if atual < quebra_19 < hora_fim:
                pontos_quebra.append(quebra_19)
        
        # Ordenar pontos de quebra
        pontos_quebra.sort()
        
        # Encontrar próxima quebra válida
        proxima_quebra = hora_fim
        for pq in pontos_quebra:
            if atual < pq <= hora_fim:
                proxima_quebra = pq
                break
        
        # Determinar fim do segmento
        fim_segmento = min(proxima_quebra, hora_fim)
        
        # Calcular duração
        duracao_segundos = (fim_segmento - atual).total_seconds()
        duracao_minutos = duracao_segundos / 60
        
        # Só criar segmento se tiver duração positiva
        if duracao_minutos > 0:
            # Determinar código horário
            codigo = get_codigo_horario(atual)
            
            # Arredondar horas
            horas_arredondadas = arredondar_horas(duracao_minutos)
            
            segmentos.append({
                "hora_inicio_segmento": atual,
                "hora_fim_segmento": fim_segmento,
                "duracao_minutos": duracao_minutos,
                "horas_arredondadas": horas_arredondadas,
                "codigo": codigo,
                "data": data_atual,
                "tipo": tipo
            })
        
        # Avançar para próximo segmento
        atual = fim_segmento
    
    return segmentos


def verificar_sobreposicao(registos_existentes, novo_inicio, novo_fim, tecnico_id):
    """
    Verifica se um novo registo sobrepõe com registos existentes
    
    Args:
        registos_existentes: Lista de registos existentes
        novo_inicio: datetime do início do novo registo
        novo_fim: datetime do fim do novo registo
        tecnico_id: ID do técnico
    
    Returns:
        bool: True se há sobreposição, False caso contrário
    """
    # Normalizar novo_inicio e novo_fim para naive (remover timezone se existir)
    if novo_inicio.tzinfo is not None:
        novo_inicio = novo_inicio.replace(tzinfo=None)
    if novo_fim.tzinfo is not None:
        novo_fim = novo_fim.replace(tzinfo=None)
    
    for reg in registos_existentes:
        if reg.get("tecnico_id") != tecnico_id:
            continue
        
        # Obter horários do registo existente
        reg_inicio = reg.get("hora_inicio_segmento")
        reg_fim = reg.get("hora_fim_segmento")
        
        if isinstance(reg_inicio, str):
            reg_inicio = datetime.fromisoformat(reg_inicio.replace('Z', '+00:00'))
        if isinstance(reg_fim, str):
            reg_fim = datetime.fromisoformat(reg_fim.replace('Z', '+00:00'))
        
        if reg_inicio is None or reg_fim is None:
            continue
        
        # Normalizar para naive (remover timezone)
        if reg_inicio.tzinfo is not None:
            reg_inicio = reg_inicio.replace(tzinfo=None)
        if reg_fim.tzinfo is not None:
            reg_fim = reg_fim.replace(tzinfo=None)
        
        # Verificar sobreposição
        # Há sobreposição se: novo_inicio < reg_fim AND novo_fim > reg_inicio
        if novo_inicio < reg_fim and novo_fim > reg_inicio:
            return True
    
    return False


def ordenar_registos_cronologicamente(registos):
    """
    Ordena registos cronologicamente por data → hora início → hora fim
    
    Args:
        registos: Lista de registos
    
    Returns:
        list: Registos ordenados
    """
    def get_sort_key(reg):
        data = reg.get("data")
        hora_inicio = reg.get("hora_inicio_segmento")
        hora_fim = reg.get("hora_fim_segmento")
        
        # Converter strings para datetime se necessário
        if isinstance(data, str):
            data = datetime.fromisoformat(data).date() if 'T' in data else datetime.strptime(data, "%Y-%m-%d").date()
        if isinstance(hora_inicio, str):
            hora_inicio = datetime.fromisoformat(hora_inicio.replace('Z', '+00:00'))
        if isinstance(hora_fim, str):
            hora_fim = datetime.fromisoformat(hora_fim.replace('Z', '+00:00'))
        
        # Criar chave de ordenação
        if isinstance(data, date):
            data_key = data
        else:
            data_key = date.min
        
        if isinstance(hora_inicio, datetime):
            inicio_key = hora_inicio
        else:
            inicio_key = datetime.min
        
        if isinstance(hora_fim, datetime):
            fim_key = hora_fim
        else:
            fim_key = datetime.min
        
        return (data_key, inicio_key, fim_key)
    
    return sorted(registos, key=get_sort_key)
