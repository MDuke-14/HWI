"""
Smoke-import test for all route modules.

Motivação:
Durante o refactor do `server.py` → `routes/*.py`, vários símbolos
(modelos, helpers, bibliotecas stdlib) foram usados sem terem sido
importados nos novos ficheiros. Como o Python só resolve estes nomes
quando a função é chamada, os erros `NameError` só apareciam em
produção quando o utilizador clicava num endpoint afectado.

Este teste verifica estaticamente que cada router não tem nomes por
resolver no seu namespace global, e assim apanha estes bugs antes
do deploy.
"""
import ast
import builtins
import importlib
import os
import pytest

ROUTES_DIR = os.path.join(os.path.dirname(__file__), "..", "routes")


def _collect_unresolved(path: str) -> set:
    with open(path) as f:
        src = f.read()
    tree = ast.parse(src)

    used = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
            used.add(node.id)

    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                imported.add(a.asname or a.name.split(".")[0])
        if isinstance(node, ast.ImportFrom):
            for a in node.names:
                imported.add(a.asname or a.name)

    defined = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            defined.add(node.name)
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name):
                    defined.add(t.id)
                if isinstance(t, ast.Tuple):
                    for e in t.elts:
                        if isinstance(e, ast.Name):
                            defined.add(e.id)
        if isinstance(node, (ast.For, ast.AsyncFor, ast.comprehension)):
            if isinstance(node.target, ast.Name):
                defined.add(node.target.id)
            if isinstance(node.target, ast.Tuple):
                for e in node.target.elts:
                    if isinstance(e, ast.Name):
                        defined.add(e.id)
        if isinstance(node, ast.arguments):
            for a in node.args + node.kwonlyargs + node.posonlyargs:
                defined.add(a.arg)
            if node.vararg:
                defined.add(node.vararg.arg)
            if node.kwarg:
                defined.add(node.kwarg.arg)
        if isinstance(node, (ast.With, ast.AsyncWith)):
            for it in node.items:
                if it.optional_vars and isinstance(it.optional_vars, ast.Name):
                    defined.add(it.optional_vars.id)
        if isinstance(node, ast.ExceptHandler) and node.name:
            defined.add(node.name)
        if isinstance(node, ast.Lambda):
            for a in node.args.args:
                defined.add(a.arg)
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            defined.add(node.target.id)

    builts = set(dir(builtins)) | {
        "self", "cls", "True", "False", "None", "__name__", "__file__",
    }
    return used - imported - defined - builts


ROUTE_FILES = sorted(
    f for f in os.listdir(ROUTES_DIR)
    if f.endswith(".py") and f != "__init__.py"
)


@pytest.mark.parametrize("fname", ROUTE_FILES)
def test_router_has_no_unresolved_names(fname):
    """Nenhum router deve ter nomes usados no módulo que não estejam importados."""
    path = os.path.join(ROUTES_DIR, fname)
    unresolved = _collect_unresolved(path)
    # Only flag names that look like they should be resolvable
    # (capitalized identifiers and well-known stdlib names).
    suspects = sorted(
        n for n in unresolved
        if n and (n[0].isupper() or n in {"shutil", "Path", "BytesIO", "pytz"})
    )
    assert not suspects, (
        f"{fname}: nomes não importados detectados: {suspects}. "
        f"Adiciona o import no topo do ficheiro."
    )
