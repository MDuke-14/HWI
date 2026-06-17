"""
Testa a flag `faturar_viagens_curtas` no gerador da Folha de Horas.
- Quando False (default): viagens <30min têm total_valor = 0€ (só KM)
- Quando True (ex: Kannegiesser): viagens <30min têm total_valor = horas × tarifa
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from folha_horas_pdf import generate_folha_horas_pdf
from io import BytesIO
from PyPDF2 import PdfReader


def make_fake_data():
    relatorio = {
        'id': 'test-fs-id',
        'numero_assistencia': 999,
        'local_intervencao': 'Test Lab',
    }
    cliente = {'nome': 'Cliente Teste'}
    registos = [
        # Viagem curta: 15min, Cód.1
        {
            'id': 'r1', 'tecnico_id': 't1', 'tecnico_nome': 'João Tester',
            'tipo': 'viagem', 'funcao_ot': 'tecnico',
            'data': '2026-02-25', 'codigo': '1',
            'hora_inicio_segmento': '08:00', 'hora_fim_segmento': '08:15',
            'horas_arredondadas': 0.25, 'km': 10,
        },
        # Viagem longa: 60min, Cód.1
        {
            'id': 'r2', 'tecnico_id': 't1', 'tecnico_nome': 'João Tester',
            'tipo': 'viagem', 'funcao_ot': 'tecnico',
            'data': '2026-02-25', 'codigo': '1',
            'hora_inicio_segmento': '08:15', 'hora_fim_segmento': '09:15',
            'horas_arredondadas': 1.0, 'km': 20,
        },
        # Trabalho 2h
        {
            'id': 'r3', 'tecnico_id': 't1', 'tecnico_nome': 'João Tester',
            'tipo': 'trabalho', 'funcao_ot': 'tecnico',
            'data': '2026-02-25', 'codigo': '1',
            'hora_inicio_segmento': '09:15', 'hora_fim_segmento': '11:15',
            'horas_arredondadas': 2.0, 'km': 0,
        },
    ]
    tarifas_por_codigo = {'1': 40.0}
    tarifas_detalhadas = [
        {'codigo': '1', 'tipo_registo': 'viagem', 'tipo_colaborador': 'tecnico', 'valor_por_hora': 30.0},
        {'codigo': '1', 'tipo_registo': 'trabalho', 'tipo_colaborador': 'tecnico', 'valor_por_hora': 40.0},
    ]
    return relatorio, cliente, registos, tarifas_por_codigo, tarifas_detalhadas


def extract_text(buf):
    buf.seek(0)
    reader = PdfReader(buf)
    text = ''
    for page in reader.pages:
        text += page.extract_text() + '\n'
    return text


def test_default_behavior_viagem_curta_zero():
    """Comportamento padrão: viagem <30min -> total_valor=0 (só KM)"""
    relatorio, cliente, registos, t_cod, t_det = make_fake_data()
    pdf = generate_folha_horas_pdf(
        relatorio=relatorio, cliente=cliente,
        registos_mao_obra=registos, tecnicos_manuais=[],
        tarifas_por_tecnico={}, dados_extras={},
        tarifas_por_codigo=t_cod, valor_km=0.5,
        tarifas_detalhadas=t_det,
        faturar_viagens_curtas=False,
    )
    text = extract_text(pdf)
    # Subtotais esperados:
    # Trabalho: 2h × 40€ = 80€
    # Viagem: 1h × 30€ = 30€ (viagem curta de 15min = 0€)
    # KM: (10+20) × 0.5 = 15€
    assert 'Só KM' in text, "Deveria conter 'Só KM' para viagem <30min"
    assert '80.00€' in text, "Subtotal Trabalho deveria ser 80€"
    assert '30.00€' in text, "Subtotal Viagem deveria ser 30€ (sem a viagem curta)"
    print("✅ test_default_behavior_viagem_curta_zero PASSOU")


def test_faturar_tudo_viagem_curta_cobrada():
    """faturar_viagens_curtas=True: viagem <30min também cobra horas"""
    relatorio, cliente, registos, t_cod, t_det = make_fake_data()
    pdf = generate_folha_horas_pdf(
        relatorio=relatorio, cliente=cliente,
        registos_mao_obra=registos, tecnicos_manuais=[],
        tarifas_por_tecnico={}, dados_extras={},
        tarifas_por_codigo=t_cod, valor_km=0.5,
        tarifas_detalhadas=t_det,
        faturar_viagens_curtas=True,
    )
    text = extract_text(pdf)
    # Subtotais esperados com flag ON:
    # Trabalho: 2h × 40€ = 80€
    # Viagem: 0.25h × 30€ + 1h × 30€ = 7.50 + 30 = 37.50€
    assert 'Só KM' not in text, "NÃO deveria conter 'Só KM' quando flag ativa"
    assert '80.00€' in text, "Subtotal Trabalho deveria ser 80€"
    assert '37.50€' in text, "Subtotal Viagem deveria ser 37.50€ (incluindo viagem curta)"
    print("✅ test_faturar_tudo_viagem_curta_cobrada PASSOU")


if __name__ == '__main__':
    test_default_behavior_viagem_curta_zero()
    test_faturar_tudo_viagem_curta_cobrada()
    print("\n🎉 Todos os testes passaram!")
