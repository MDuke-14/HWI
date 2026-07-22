"""Fixtures partilhadas para todos os testes do backend.

Credenciais são lidas de variáveis de ambiente (ou dos defaults da pod de
preview em `/app/memory/test_credentials.md`). NUNCA hard-coded em ficheiros.

Para correr localmente sem sobrepor:
    export TEST_ADMIN_EMAIL=teste@email.com
    export TEST_ADMIN_PASSWORD=Admin123!
    export TEST_USER_USERNAME=miguel
    export TEST_USER_PASSWORD=Miguel123!
"""
import os
import pytest


def _env(name: str, default: str) -> str:
    val = os.environ.get(name)
    return val if val else default


@pytest.fixture(scope="session")
def admin_credentials():
    return {
        "username": _env("TEST_ADMIN_EMAIL", "teste@email.com"),
        "password": _env("TEST_ADMIN_PASSWORD", "Admin123!"),
    }


@pytest.fixture(scope="session")
def user_credentials():
    return {
        "username": _env("TEST_USER_USERNAME", "miguel"),
        "password": _env("TEST_USER_PASSWORD", "Miguel123!"),
    }


@pytest.fixture(scope="session")
def api_base_url():
    return _env("TEST_API_BASE_URL", "http://localhost:8001/api")
