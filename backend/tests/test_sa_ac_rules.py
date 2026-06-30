"""Testes unitários para a função `calcular_sa_ac` (regras Feb/2026).

Como `routes.time_entries` tem dependências circulares pesadas (server.py),
fazemos um import isolado da função usando importlib + ast para extrair só o que precisamos.
"""
import ast
import importlib.util
import os
import sys


def _load_helper():
    """Carrega apenas a função calcular_sa_ac de time_entries.py sem importar
    o módulo (que tem deps circulares com server.py)."""
    path = os.path.join(os.path.dirname(__file__), '..', 'routes', 'time_entries.py')
    with open(path, 'r', encoding='utf-8') as f:
        source = f.read()
    tree = ast.parse(source)
    snippet_nodes = []
    for node in tree.body:
        # Constantes top-level
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in ('SA_FULL_VALUE', 'AC_FULL_VALUE'):
                    snippet_nodes.append(node)
        # Função
        if isinstance(node, ast.FunctionDef) and node.name == 'calcular_sa_ac':
            snippet_nodes.append(node)
    if len(snippet_nodes) < 3:
        raise RuntimeError('Não consegui extrair os símbolos esperados')
    module_ast = ast.Module(body=snippet_nodes, type_ignores=[])
    code = compile(module_ast, path, 'exec')
    ns = {}
    exec(code, ns)
    return ns['calcular_sa_ac']


calcular_sa_ac = _load_helper()


def test_menos_de_4h_sa_nao_recebe():
    tipo, valor = calcular_sa_ac(3.99, outside_zone=False)
    assert tipo is None and valor is None, f"<4h SA deveria ser 0, foi: {tipo}/{valor}"
    print("✅ <4h sem outside_zone → sem SA")


def test_menos_de_4h_ac_nao_recebe():
    tipo, valor = calcular_sa_ac(3.99, outside_zone=True)
    assert tipo is None and valor is None, f"<4h AC deveria ser 0, foi: {tipo}/{valor}"
    print("✅ <4h com outside_zone → sem AC")


def test_4h_exactas_recebe_sa():
    tipo, valor = calcular_sa_ac(4.0, outside_zone=False)
    assert tipo == "Subsídio de Alimentação" and valor == 10.0, f"4h exact deve dar SA 10€, foi: {tipo}/{valor}"
    print("✅ 4h exact sem outside_zone → SA 10€")


def test_4h_exactas_recebe_ac_25pct():
    tipo, valor = calcular_sa_ac(4.0, outside_zone=True)
    assert tipo == "Ajuda de Custos" and valor == 12.5, f"4h exact AC deve dar 25% = 12.50€, foi: {tipo}/{valor}"
    print("✅ 4h exact com outside_zone → AC 12.50€ (25%)")


def test_5h_recebe_ac_25pct():
    tipo, valor = calcular_sa_ac(5.0, outside_zone=True)
    assert tipo == "Ajuda de Custos" and valor == 12.5, f"5h AC deve dar 25%, foi: {tipo}/{valor}"
    print("✅ 5h com outside_zone → AC 12.50€ (25%)")


def test_5h59_recebe_ac_25pct():
    tipo, valor = calcular_sa_ac(5.983, outside_zone=True)  # 5h59m
    assert tipo == "Ajuda de Custos" and valor == 12.5, f"5h59 AC deve dar 25%, foi: {tipo}/{valor}"
    print("✅ 5h59 com outside_zone → AC 12.50€ (25%)")


def test_6h_exactas_recebe_ac_100pct():
    tipo, valor = calcular_sa_ac(6.0, outside_zone=True)
    assert tipo == "Ajuda de Custos" and valor == 50.0, f"6h AC deve dar 100%, foi: {tipo}/{valor}"
    print("✅ 6h exact com outside_zone → AC 50€ (100%)")


def test_8h_recebe_ac_100pct():
    tipo, valor = calcular_sa_ac(8.0, outside_zone=True)
    assert tipo == "Ajuda de Custos" and valor == 50.0, f"8h AC deve dar 100%, foi: {tipo}/{valor}"
    print("✅ 8h com outside_zone → AC 50€ (100%)")


def test_8h_sem_outside_recebe_sa():
    tipo, valor = calcular_sa_ac(8.0, outside_zone=False)
    assert tipo == "Subsídio de Alimentação" and valor == 10.0
    print("✅ 8h sem outside_zone → SA 10€")


def test_zero_h_nao_recebe_nada():
    tipo, valor = calcular_sa_ac(0.0, outside_zone=False)
    assert tipo is None and valor is None
    tipo2, valor2 = calcular_sa_ac(0.0, outside_zone=True)
    assert tipo2 is None and valor2 is None
    print("✅ 0h → sem SA nem AC")


if __name__ == '__main__':
    test_menos_de_4h_sa_nao_recebe()
    test_menos_de_4h_ac_nao_recebe()
    test_4h_exactas_recebe_sa()
    test_4h_exactas_recebe_ac_25pct()
    test_5h_recebe_ac_25pct()
    test_5h59_recebe_ac_25pct()
    test_6h_exactas_recebe_ac_100pct()
    test_8h_recebe_ac_100pct()
    test_8h_sem_outside_recebe_sa()
    test_zero_h_nao_recebe_nada()
    print("\n🎉 Todos os 10 testes passaram!")
