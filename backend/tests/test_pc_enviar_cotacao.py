"""
Fase 4 — PC: POST /api/pedidos-cotacao/{pc_id}/enviar-cotacao
Testa validações, envio individual, envio global, sobrescrita de fornecedor,
anexos e registo no histórico.
"""
import os
import re
import time
import uuid
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

REAL_EMAIL = "geral@hwi.pt"


# ---------------- fixtures ----------------
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
def relatorio_id(client):
    r = client.get(f"{API}/relatorios-tecnicos", timeout=60)
    assert r.status_code == 200, r.text[:300]
    items = r.json()
    assert isinstance(items, list) and items, "no relatorios available"
    return items[0]["id"]


@pytest.fixture(scope="session")
def test_pc(client, relatorio_id):
    """Cria 3 materiais de Cotação numa FS → gera nova PC. Cleanup no fim."""
    tag = uuid.uuid4().hex[:6]
    mat_ids = []
    pc_id = None
    for i in range(3):
        payload = {
            "descricao": f"TEST_MAT_{tag}_{i}",
            "quantidade": i + 1,
            "unidade": "Un",
            "fornecido_por": "Cotação",
            "codigo": f"COD{i}",
        }
        if pc_id:
            payload["pc_id"] = pc_id
        r = client.post(f"{API}/relatorios-tecnicos/{relatorio_id}/materiais", json=payload, timeout=60)
        assert r.status_code in (200, 201), f"add material failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        mid = data.get("id") or (data.get("material") or {}).get("id")
        pid = data.get("pc_id") or (data.get("material") or {}).get("pc_id") or (data.get("pc") or {}).get("id")
        assert mid, f"no material id in response: {data}"
        mat_ids.append(mid)
        if pid:
            pc_id = pid
    assert pc_id, "PC não foi criada ao adicionar material de Cotação"

    yield {"pc_id": pc_id, "material_ids": mat_ids, "relatorio_id": relatorio_id}

    # cleanup
    for mid in mat_ids:
        client.delete(f"{API}/relatorios-tecnicos/{relatorio_id}/materiais/{mid}", timeout=60)
    client.delete(f"{API}/pedidos-cotacao/{pc_id}", timeout=60)


def _get_materiais(client, pc_id):
    r = client.get(f"{API}/pedidos-cotacao/{pc_id}", timeout=60)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert "_id" not in body, "MongoDB _id leaked in PC response"
    return body, {m["id"]: m for m in body.get("materiais", [])}


def _historico(client, pc_id):
    r = client.get(f"{API}/pedidos-cotacao/{pc_id}/historico", timeout=60)
    assert r.status_code == 200, r.text[:300]
    return r.json()


# ---------------- validações ----------------
class TestValidacoes:
    def test_requires_auth(self, test_pc):
        r = requests.post(
            f"{API}/pedidos-cotacao/{test_pc['pc_id']}/enviar-cotacao",
            json={"fornecedor_email_custom": REAL_EMAIL}, timeout=30,
        )
        assert r.status_code in (401, 403), r.status_code

    def test_pc_inexistente_404(self, client):
        r = client.post(f"{API}/pedidos-cotacao/{uuid.uuid4()}/enviar-cotacao",
                        json={"fornecedor_email_custom": REAL_EMAIL}, timeout=60)
        assert r.status_code == 404, f"{r.status_code} {r.text[:200]}"

    def test_sem_fornecedor_400(self, client, test_pc):
        r = client.post(f"{API}/pedidos-cotacao/{test_pc['pc_id']}/enviar-cotacao",
                        json={}, timeout=60)
        assert r.status_code == 400, f"{r.status_code} {r.text[:200]}"
        assert "fornecedor" in r.json().get("detail", "").lower()

    def test_email_manual_invalido_400(self, client, test_pc):
        r = client.post(f"{API}/pedidos-cotacao/{test_pc['pc_id']}/enviar-cotacao",
                        json={"fornecedor_email_custom": "nao-e-email"}, timeout=60)
        assert r.status_code == 400, f"{r.status_code} {r.text[:200]}"

    def test_fornecedor_inexistente_404(self, client, test_pc):
        r = client.post(f"{API}/pedidos-cotacao/{test_pc['pc_id']}/enviar-cotacao",
                        json={"fornecedor_id": str(uuid.uuid4())}, timeout=60)
        assert r.status_code == 404, f"{r.status_code} {r.text[:200]}"

    def test_cc_invalido_400(self, client, test_pc):
        r = client.post(f"{API}/pedidos-cotacao/{test_pc['pc_id']}/enviar-cotacao",
                        json={"fornecedor_email_custom": REAL_EMAIL, "cc": ["bad-email"]}, timeout=60)
        assert r.status_code == 400, f"{r.status_code} {r.text[:200]}"
        assert "CC" in r.json().get("detail", "")

    def test_material_ids_nao_pertencem_400(self, client, test_pc):
        r = client.post(f"{API}/pedidos-cotacao/{test_pc['pc_id']}/enviar-cotacao",
                        json={"fornecedor_email_custom": REAL_EMAIL,
                              "material_ids": [str(uuid.uuid4())]}, timeout=60)
        assert r.status_code == 400, f"{r.status_code} {r.text[:200]}"

    def test_anexos_nao_pertencem_400(self, client, test_pc):
        r = client.post(f"{API}/pedidos-cotacao/{test_pc['pc_id']}/enviar-cotacao",
                        json={"fornecedor_email_custom": REAL_EMAIL,
                              "anexos_doc_ids": [str(uuid.uuid4())]}, timeout=60)
        assert r.status_code == 400, f"{r.status_code} {r.text[:200]}"

    def test_materiais_intactos_apos_validacoes(self, client, test_pc):
        """Nenhuma das validações acima pode ter alterado materiais."""
        _, mats = _get_materiais(client, test_pc["pc_id"])
        for mid in test_pc["material_ids"]:
            assert mats[mid].get("fornecedor_email") in (None, ""), mats[mid]


# ---------------- envio individual ----------------
class TestEnvioIndividual:
    def test_envio_individual(self, client, test_pc):
        pc_id = test_pc["pc_id"]
        target = test_pc["material_ids"][0]
        others = test_pc["material_ids"][1:]

        before, _ = _get_materiais(client, pc_id)
        assert before.get("status") in (None, "", "Em Espera"), before.get("status")

        r = client.post(f"{API}/pedidos-cotacao/{pc_id}/enviar-cotacao", json={
            "material_ids": [target],
            "fornecedor_email_custom": REAL_EMAIL,
            "fornecedor_nome_custom": "TEST_Fornecedor_Individual",
        }, timeout=120)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        body = r.json()
        assert body["ok"] is True
        assert body["materiais_atualizados"] == 1
        assert body["envio_tipo"] == "individual", body

        time.sleep(1)
        pc, mats = _get_materiais(client, pc_id)
        m = mats[target]
        assert m["fornecedor_email"] == REAL_EMAIL
        assert m["fornecedor_nome"] == "TEST_Fornecedor_Individual"
        assert m["cotacao_status"] == "em_cotacao"
        for o in others:
            assert mats[o].get("fornecedor_email") in (None, ""), f"material {o} foi alterado"
            assert mats[o].get("cotacao_status") in (None, "", "sem_pedido")

        assert pc.get("status") == "Cotação Pedida", pc.get("status")

        hist = _historico(client, pc_id)
        sent = [h for h in hist if h.get("action") == "email_sent"]
        assert sent, f"evento email_sent nao registado: {[h.get('action') for h in hist]}"
        meta = sent[0].get("metadata") or {}
        assert meta.get("tipo") == "individual" or meta.get("envio_tipo") == "individual", meta


# ---------------- envio global + CC + sobrescrita ----------------
class TestEnvioGlobal:
    def test_envio_global_com_cc_e_sobrescrita(self, client, test_pc):
        pc_id = test_pc["pc_id"]
        r = client.post(f"{API}/pedidos-cotacao/{pc_id}/enviar-cotacao", json={
            "material_ids": [],
            "fornecedor_email_custom": REAL_EMAIL,
            "fornecedor_nome_custom": "TEST_Fornecedor_Global",
            "cc": [REAL_EMAIL],
            "assunto": "TEST_Assunto Global",
            "mensagem": "TEST mensagem global",
        }, timeout=120)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        body = r.json()
        assert body["envio_tipo"] == "global", body
        assert body["materiais_atualizados"] == len(test_pc["material_ids"])

        time.sleep(1)
        _, mats = _get_materiais(client, pc_id)
        for mid in test_pc["material_ids"]:
            assert mats[mid]["fornecedor_nome"] == "TEST_Fornecedor_Global", mats[mid]
            assert mats[mid]["cotacao_status"] == "em_cotacao"

        hist = _historico(client, pc_id)
        sent = [h for h in hist if h.get("action") == "email_sent"]
        assert len(sent) >= 2, f"esperado >=2 eventos email_sent, obtidos {len(sent)}"
        meta = sent[0].get("metadata") or {}
        assert meta.get("cc") == [REAL_EMAIL], meta
        assert meta.get("assunto") == "TEST_Assunto Global", meta


# ---------------- anexos ----------------
class TestAnexos:
    def test_envio_com_anexo(self, client, test_pc):
        pc_id = test_pc["pc_id"]
        files = {"file": ("TEST_anexo.txt", b"conteudo de teste", "text/plain")}
        s = requests.Session()
        s.headers.update({"Authorization": client.headers["Authorization"]})
        up = s.post(f"{API}/pedidos-cotacao/{pc_id}/documentos", files=files,
                    data={"tipo": "outro", "descricao": "TEST"}, timeout=60)
        assert up.status_code in (200, 201), f"{up.status_code} {up.text[:300]}"
        doc_id = up.json()["id"]

        r = client.post(f"{API}/pedidos-cotacao/{pc_id}/enviar-cotacao", json={
            "material_ids": [test_pc["material_ids"][0]],
            "fornecedor_email_custom": REAL_EMAIL,
            "anexos_doc_ids": [doc_id],
        }, timeout=120)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"

        hist = _historico(client, pc_id)
        sent = [h for h in hist if h.get("action") == "email_sent"]
        assert (sent[0].get("metadata") or {}).get("anexos") == 1, sent[0]

        s.delete(f"{API}/pedidos-cotacao/{pc_id}/documentos/{doc_id}", timeout=60)


# ---------------- fornecedor da DB ----------------
class TestFornecedorDB:
    def test_envio_com_fornecedor_db(self, client, test_pc):
        fr = client.get(f"{API}/fornecedores?ativo=true", timeout=60)
        assert fr.status_code == 200, fr.text[:300]
        forns = [f for f in fr.json() if f.get("email")]
        if not forns:
            pytest.skip("sem fornecedores ativos com email")
        f = forns[0]
        r = client.post(f"{API}/pedidos-cotacao/{test_pc['pc_id']}/enviar-cotacao", json={
            "material_ids": [test_pc["material_ids"][1]],
            "fornecedor_id": f["id"],
        }, timeout=120)
        assert r.status_code == 200, f"envio com fornecedor DB falhou: {r.status_code} {r.text[:400]}"
        _, mats = _get_materiais(client, test_pc["pc_id"])
        m = mats[test_pc["material_ids"][1]]
        assert m["fornecedor_id"] == f["id"]
        assert m["fornecedor_nome"] == f["nome"]
