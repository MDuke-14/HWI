"""Testes unitários para a função `calcular_sa_ac` (regras Feb/2026).

Importa directamente do módulo puro `sa_ac_rules` (sem dependências circulares).
"""
import sys
import os

# Garantir que o path do backend está no sys.path para permitir import directo
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from sa_ac_rules import calcular_sa_ac  # noqa: E402


def test_menos_de_4h_sa_nao_recebe():
    tipo, valor = calcular_sa_ac(3.99, outside_zone=False)
    assert tipo is None and valor is None, f"<4h SA deveria ser 0, foi: {tipo}/{valor}"


def test_menos_de_4h_ac_nao_recebe():
    tipo, valor = calcular_sa_ac(3.99, outside_zone=True)
    assert tipo is None and valor is None, f"<4h AC deveria ser 0, foi: {tipo}/{valor}"


def test_4h_exatas_sa_recebe():
    tipo, valor = calcular_sa_ac(4.0, outside_zone=False)
    assert tipo == "Subsídio de Alimentação" and valor == 10.0


def test_5h_ac_metade():
    tipo, valor = calcular_sa_ac(5.0, outside_zone=True)
    assert tipo == "Ajuda de Custos" and valor == 25.0


def test_6h_ac_completo():
    tipo, valor = calcular_sa_ac(6.0, outside_zone=True)
    assert tipo == "Ajuda de Custos" and valor == 50.0


def test_8h_sa_binario():
    tipo, valor = calcular_sa_ac(8.0, outside_zone=False)
    assert tipo == "Subsídio de Alimentação" and valor == 10.0


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"✅ {name}")
