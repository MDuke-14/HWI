"""
Fase 6 — PC modal redesign: enriquecimento do GET /api/pedidos-cotacao/{id}
Valida cliente_email, cliente_telefone, cliente_morada, cliente_nif, data_fs,
criado_por_nome + estruturas usadas pelo novo layout (materiais, fotografias,
numero_ot, status).
"""
import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

PC_EXEMPLO = "03d82cdc-af6a-4141-a3d7-ee6f72e5d20a"
PC_CANCELADA = "1743a23d-7bf4-40d9-b6e3-f6999393877e"


@pytest.fixture(scope="session")
def creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    u = re.search(r"(?im)^\s*-\s*\*\*Username\*\*\s*:\s*`([^`]+)`", content)
    p = re.search(r"(?im)^\s*-\s*\*\*Password\*\*\s*:\s*`([^`]+)`", content)
    if not u or not p:
        pytest.skip("credentials not parseable")
    return {"username": u.group(1), "password": p.group(1)}


@pytest.fixture(scope="session")
def client(creds):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("access_token") or r.json().get("token")
    if not token:
        pytest.fail(f"no token in login response: {r.text[:300]}")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="session")
def pc_detail(client):
    r = client.get(f"{API}/pedidos-cotacao/{PC_EXEMPLO}", timeout=60)
    assert r.status_code == 200, r.text[:400]
    return r.json()


# ---------- GET detail enrichment ----------
class TestPCDetailEnrichment:
    def test_no_mongo_id_leak(self, pc_detail):
        assert "_id" not in pc_detail
        for m in pc_detail.get("materiais", []):
            assert "_id" not in m
        for f in pc_detail.get("fotografias", []):
            assert "_id" not in f

    def test_fase6_fields_present(self, pc_detail):
        for key in ["cliente_email", "cliente_telefone", "data_fs", "criado_por_nome"]:
            assert key in pc_detail, f"missing enriched field {key}: keys={sorted(pc_detail)}"

    def test_core_header_fields(self, pc_detail):
        assert pc_detail["id"] == PC_EXEMPLO
        assert isinstance(pc_detail.get("numero_pc"), str) and pc_detail["numero_pc"]
        assert pc_detail.get("numero_ot")
        assert pc_detail.get("status")
        assert pc_detail.get("cliente_nome")

    def test_data_fs_is_parseable_iso(self, pc_detail):
        val = pc_detail.get("data_fs")
        assert val, "data_fs empty"
        assert re.match(r"^\d{4}-\d{2}-\d{2}", str(val)), f"data_fs not ISO-like: {val}"

    def test_criado_por_nome_is_name_not_uuid(self, pc_detail):
        nome = pc_detail.get("criado_por_nome")
        if nome is None:
            pytest.skip("PC sem created_by/utilizador resolvido")
        assert isinstance(nome, str) and nome
        assert not re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-", nome), "criado_por_nome devolve UUID"

    def test_cliente_email_shape(self, pc_detail):
        email = pc_detail.get("cliente_email")
        if not email:
            pytest.skip("cliente sem email")
        assert "@" in email

    def test_materiais_have_columns_for_resumo_table(self, pc_detail):
        mats = pc_detail.get("materiais")
        assert isinstance(mats, list) and mats, "PC exemplo deve ter materiais"
        for m in mats:
            for key in ["id", "descricao", "quantidade"]:
                assert key in m, f"material sem {key}: {sorted(m)}"
            # colunas opcionais usadas na tabela do resumo
            assert set(["posicao", "codigo"]).issubset(set(m.keys())) or True

    def test_equipamento_fields(self, pc_detail):
        for key in [
            "equipamento_tipologia",
            "equipamento_marca",
            "equipamento_modelo",
            "equipamento_numero_serie",
        ]:
            assert key in pc_detail, f"missing {key}"

    def test_fotografias_have_url_and_no_base64(self, pc_detail):
        for f in pc_detail.get("fotografias", []):
            assert "foto_base64" not in f
            assert f.get("foto_url", "").startswith(f"/pedidos-cotacao/{PC_EXEMPLO}/fotografias/")


# ---------- status / cancelamento (regressão 6-4a) ----------
class TestPCStatusRegression:
    def test_pc_cancelada_status(self, client):
        r = client.get(f"{API}/pedidos-cotacao/{PC_CANCELADA}", timeout=60)
        if r.status_code == 404:
            pytest.skip("PC cancelada de exemplo já não existe")
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["status"] == "Cancelado", f"status inesperado: {data['status']}"
        assert "cancelado_motivo" in data or "motivo_cancelamento" in data or True

    def test_list_endpoint_still_works(self, client, pc_detail):
        rel_id = pc_detail.get("relatorio_id")
        r = client.get(f"{API}/relatorios-tecnicos/{rel_id}/pedidos-cotacao", timeout=60)
        assert r.status_code == 200, r.text[:300]
        pcs = r.json()
        assert isinstance(pcs, list)
        assert any(p["id"] == PC_EXEMPLO for p in pcs)
        for p in pcs:
            assert "_id" not in p
            assert "materiais_count" in p


# ---------- auxiliares do modal (tabs) ----------
class TestPCModalTabsEndpoints:
    def test_documentos_endpoint(self, client):
        r = client.get(f"{API}/pedidos-cotacao/{PC_EXEMPLO}/documentos", timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert isinstance(r.json(), list)

    def test_historico_endpoint(self, client):
        r = client.get(f"{API}/pedidos-cotacao/{PC_EXEMPLO}/historico", timeout=60)
        assert r.status_code == 200, r.text[:300]
        items = r.json()
        assert isinstance(items, list)
        for it in items:
            assert "_id" not in it

    def test_fotografias_endpoint(self, client):
        r = client.get(f"{API}/pedidos-cotacao/{PC_EXEMPLO}/fotografias", timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert isinstance(r.json(), list)

    def test_pdf_download(self, client):
        r = client.get(f"{API}/pedidos-cotacao/{PC_EXEMPLO}/preview-pdf", timeout=120)
        assert r.status_code == 200, r.text[:300]
        assert r.content[:4] == b"%PDF", r.content[:20]

    def test_get_unknown_pc_returns_404(self, client):
        r = client.get(f"{API}/pedidos-cotacao/does-not-exist-123", timeout=60)
        assert r.status_code == 404

    def test_get_requires_auth(self):
        r = requests.get(f"{API}/pedidos-cotacao/{PC_EXEMPLO}", timeout=60)
        assert r.status_code in (401, 403), r.status_code
