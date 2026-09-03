"""
Fase 5 — PC: POST /api/pedidos-cotacao/{pc_id}/enviar-cotacao
Multi-fornecedor (fornecedor_ids[] + emails_manuais[]), anexo FS.pdf opcional,
validações novas, dedup por email e retro-compatibilidade Fase 4.
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
REAL_EMAIL_2 = "miguel.moreira@hwi.pt"


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


def _make_pc(client, relatorio_id, n=3):
    tag = uuid.uuid4().hex[:6]
    mat_ids, pc_id = [], None
    for i in range(n):
        payload = {
            "descricao": f"TEST_F5_{tag}_{i}",
            "quantidade": i + 1,
            "unidade": "Un",
            "fornecido_por": "Cotação",
            "codigo": f"C{i}",
        }
        if pc_id:
            payload["pc_id"] = pc_id
        r = client.post(f"{API}/relatorios-tecnicos/{relatorio_id}/materiais", json=payload, timeout=60)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:300]}"
        data = r.json()
        mid = data.get("id") or (data.get("material") or {}).get("id")
        pid = data.get("pc_id") or (data.get("material") or {}).get("pc_id") or (data.get("pc") or {}).get("id")
        assert mid, data
        mat_ids.append(mid)
        if pid:
            pc_id = pid
    assert pc_id, "PC não criada"
    return {"pc_id": pc_id, "material_ids": mat_ids, "relatorio_id": relatorio_id}


def _cleanup_pc(client, ctx):
    for mid in ctx["material_ids"]:
        client.delete(f"{API}/relatorios-tecnicos/{ctx['relatorio_id']}/materiais/{mid}", timeout=60)
    client.delete(f"{API}/pedidos-cotacao/{ctx['pc_id']}", timeout=60)


@pytest.fixture(scope="class")
def pc_ctx(client, relatorio_id):
    ctx = _make_pc(client, relatorio_id, 3)
    yield ctx
    _cleanup_pc(client, ctx)


@pytest.fixture(scope="session")
def fornecedores_com_email(client):
    r = client.get(f"{API}/fornecedores?ativo=true", timeout=60)
    assert r.status_code == 200, r.text[:300]
    forns = [f for f in r.json() if f.get("email")]
    if len(forns) < 1:
        pytest.skip("sem fornecedores com email")
    return forns


def _materiais(client, pc_id):
    r = client.get(f"{API}/pedidos-cotacao/{pc_id}", timeout=60)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert "_id" not in body, "MongoDB _id leaked"
    return body, {m["id"]: m for m in body.get("materiais", [])}


def _historico(client, pc_id):
    r = client.get(f"{API}/pedidos-cotacao/{pc_id}/historico", timeout=60)
    assert r.status_code == 200, r.text[:300]
    return r.json()


# ---------------- Validações Fase 5 ----------------
class TestValidacoesFase5:
    def test_mix_legacy_e_novo_400(self, client, pc_ctx, fornecedores_com_email):
        r = client.post(f"{API}/pedidos-cotacao/{pc_ctx['pc_id']}/enviar-cotacao", json={
            "fornecedor_email_custom": REAL_EMAIL,
            "emails_manuais": [{"email": REAL_EMAIL_2}],
        }, timeout=60)
        assert r.status_code == 400, f"{r.status_code} {r.text[:300]}"
        assert "combinar" in r.json().get("detail", "").lower()

    def test_individual_com_2_destinatarios_400(self, client, pc_ctx):
        r = client.post(f"{API}/pedidos-cotacao/{pc_ctx['pc_id']}/enviar-cotacao", json={
            "material_ids": [pc_ctx["material_ids"][0]],
            "emails_manuais": [{"email": REAL_EMAIL}, {"email": REAL_EMAIL_2}],
        }, timeout=60)
        assert r.status_code == 400, f"{r.status_code} {r.text[:300]}"

    def test_email_manual_invalido_400(self, client, pc_ctx):
        r = client.post(f"{API}/pedidos-cotacao/{pc_ctx['pc_id']}/enviar-cotacao", json={
            "emails_manuais": [{"email": "nao-e-email"}],
        }, timeout=60)
        assert r.status_code == 400, f"{r.status_code} {r.text[:300]}"

    def test_fornecedor_ids_inexistente_404(self, client, pc_ctx):
        r = client.post(f"{API}/pedidos-cotacao/{pc_ctx['pc_id']}/enviar-cotacao", json={
            "fornecedor_ids": [str(uuid.uuid4())],
        }, timeout=60)
        assert r.status_code == 404, f"{r.status_code} {r.text[:300]}"

    def test_anexos_nao_pertencem_400(self, client, pc_ctx):
        r = client.post(f"{API}/pedidos-cotacao/{pc_ctx['pc_id']}/enviar-cotacao", json={
            "emails_manuais": [{"email": REAL_EMAIL}],
            "anexos_doc_ids": [str(uuid.uuid4())],
        }, timeout=60)
        assert r.status_code == 400, f"{r.status_code} {r.text[:300]}"

    def test_fornecedor_sem_email_400(self, client, pc_ctx):
        r = client.get(f"{API}/fornecedores", timeout=60)
        assert r.status_code == 200
        sem = [f for f in r.json() if not (f.get("email") or "").strip()]
        if not sem:
            pytest.skip("nenhum fornecedor sem email na DB")
        rr = client.post(f"{API}/pedidos-cotacao/{pc_ctx['pc_id']}/enviar-cotacao", json={
            "fornecedor_ids": [sem[0]["id"]],
        }, timeout=60)
        assert rr.status_code == 400, f"{rr.status_code} {rr.text[:300]}"

    def test_materiais_intactos_apos_validacoes(self, client, pc_ctx):
        _, mats = _materiais(client, pc_ctx["pc_id"])
        for mid in pc_ctx["material_ids"]:
            assert not mats[mid].get("cotacoes_solicitadas"), mats[mid]
            assert mats[mid].get("fornecedor_email") in (None, ""), mats[mid]


# ---------------- Multi global ----------------
class TestMultiGlobal:
    def test_multi_forn_db_mais_manual(self, client, pc_ctx, fornecedores_com_email):
        pc_id = pc_ctx["pc_id"]
        f = fornecedores_com_email[0]
        r = client.post(f"{API}/pedidos-cotacao/{pc_id}/enviar-cotacao", json={
            "material_ids": [],
            "fornecedor_ids": [f["id"]],
            "emails_manuais": [{"email": REAL_EMAIL, "nome": "TEST_Manual_F5"}],
            "assunto": "TEST_F5 multi",
            "mensagem": "TEST_F5 corpo",
        }, timeout=180)
        assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
        body = r.json()
        assert body["enviados"] == 2, body
        assert body["falhas"] == 0, body
        assert body["detalhes_falhas"] == [], body
        assert body["envio_tipo"] == "global", body
        assert body["fs_pdf_incluido"] is False, body
        assert body["materiais_atualizados"] == 3, body

        time.sleep(1)
        _, mats = _materiais(client, pc_id)
        for mid in pc_ctx["material_ids"]:
            m = mats[mid]
            cs = m.get("cotacoes_solicitadas") or []
            assert len(cs) == 2, f"esperado 2 cotacoes_solicitadas, obtido {cs}"
            emails = sorted(c["fornecedor_email"].lower() for c in cs)
            assert emails == sorted([f["email"].lower(), REAL_EMAIL.lower()]), emails
            # não sobrescreve fornecedor "vencedor"
            assert m.get("fornecedor_id") in (None, ""), m
            assert m.get("fornecedor_nome") in (None, ""), m
            assert m.get("cotacao_status") == "em_cotacao", m

        hist = _historico(client, pc_id)
        sent = [h for h in hist if h.get("action") == "email_sent"]
        assert len(sent) == 2, f"esperado 2 eventos email_sent, obtido {len(sent)}"
        for h in sent:
            meta = h.get("metadata") or {}
            assert meta.get("envio_tipo") == "global", meta
            assert meta.get("multi") is True, meta
        assert not [h for h in hist if h.get("action") == "email_send_failed"]

    def test_dedup_por_email(self, client, pc_ctx, fornecedores_com_email):
        """Mesmo email em fornecedor_ids e emails_manuais → 1 envio só."""
        pc_id = pc_ctx["pc_id"]
        f = fornecedores_com_email[0]
        r = client.post(f"{API}/pedidos-cotacao/{pc_id}/enviar-cotacao", json={
            "material_ids": [],
            "fornecedor_ids": [f["id"]],
            "emails_manuais": [{"email": f["email"].upper(), "nome": "TEST_DUP"}],
        }, timeout=180)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        body = r.json()
        assert body["enviados"] == 1, f"dedup falhou: {body}"

    def test_multi_parcial_materiais_1_destinatario(self, client, relatorio_id):
        """Global com subset de materiais + 1 destinatário → cotacoes_solicitadas
        apenas nesse material, envio_tipo individual."""
        ctx = _make_pc(client, relatorio_id, 2)
        try:
            target = ctx["material_ids"][0]
            other = ctx["material_ids"][1]
            r = client.post(f"{API}/pedidos-cotacao/{ctx['pc_id']}/enviar-cotacao", json={
                "material_ids": [target],
                "emails_manuais": [{"email": REAL_EMAIL, "nome": "TEST_PARCIAL"}],
            }, timeout=180)
            assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
            body = r.json()
            assert body["enviados"] == 1, body
            assert body["materiais_atualizados"] == 1, body
            time.sleep(1)
            _, mats = _materiais(client, ctx["pc_id"])
            assert len(mats[target].get("cotacoes_solicitadas") or []) == 1
            assert not (mats[other].get("cotacoes_solicitadas") or [])
            # não sobrescreve
            assert mats[target].get("fornecedor_email") in (None, "")
        finally:
            _cleanup_pc(client, ctx)


# ---------------- FS PDF ----------------
class TestFsPdf:
    def test_incluir_fs_pdf_true(self, client, relatorio_id):
        ctx = _make_pc(client, relatorio_id, 1)
        try:
            r = client.post(f"{API}/pedidos-cotacao/{ctx['pc_id']}/enviar-cotacao", json={
                "material_ids": [],
                "emails_manuais": [{"email": REAL_EMAIL, "nome": "TEST_FSPDF"}],
                "incluir_fs_pdf": True,
            }, timeout=240)
            assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
            body = r.json()
            assert body["fs_pdf_incluido"] is True, body
            assert body["enviados"] == 1, body
            hist = _historico(client, ctx["pc_id"])
            sent = [h for h in hist if h.get("action") == "email_sent"]
            assert sent, hist
            meta = sent[0].get("metadata") or {}
            assert meta.get("fs_pdf_incluido") is True, meta
            assert meta.get("anexos", 0) >= 1, meta
        finally:
            _cleanup_pc(client, ctx)

    def test_default_sem_fs_pdf(self, client, relatorio_id):
        ctx = _make_pc(client, relatorio_id, 1)
        try:
            r = client.post(f"{API}/pedidos-cotacao/{ctx['pc_id']}/enviar-cotacao", json={
                "material_ids": [],
                "emails_manuais": [{"email": REAL_EMAIL}],
            }, timeout=180)
            assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
            assert r.json()["fs_pdf_incluido"] is False
            hist = _historico(client, ctx["pc_id"])
            sent = [h for h in hist if h.get("action") == "email_sent"]
            assert (sent[0].get("metadata") or {}).get("anexos") == 0, sent[0]
        finally:
            _cleanup_pc(client, ctx)


# ---------------- Retro-compat Fase 4 ----------------
class TestRetroCompatFase4:
    def test_single_email_custom_sobrescreve(self, client, relatorio_id):
        ctx = _make_pc(client, relatorio_id, 2)
        try:
            target = ctx["material_ids"][0]
            r = client.post(f"{API}/pedidos-cotacao/{ctx['pc_id']}/enviar-cotacao", json={
                "material_ids": [target],
                "fornecedor_email_custom": REAL_EMAIL,
                "fornecedor_nome_custom": "TEST_F4_Retro",
            }, timeout=180)
            assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
            body = r.json()
            assert body["envio_tipo"] == "individual", body
            assert body["enviados"] == 1, body
            assert body["fs_pdf_incluido"] is False, body
            time.sleep(1)
            pc, mats = _materiais(client, ctx["pc_id"])
            m = mats[target]
            assert m["fornecedor_email"] == REAL_EMAIL
            assert m["fornecedor_nome"] == "TEST_F4_Retro"
            assert m["cotacao_status"] == "em_cotacao"
            assert not (m.get("cotacoes_solicitadas") or []), "single não devia usar cotacoes_solicitadas"
            assert pc.get("status") == "Cotação Pedida"
            hist = _historico(client, ctx["pc_id"])
            sent = [h for h in hist if h.get("action") == "email_sent"]
            assert len(sent) == 1, len(sent)
            assert (sent[0].get("metadata") or {}).get("multi") is False
        finally:
            _cleanup_pc(client, ctx)

    def test_single_fornecedor_db(self, client, relatorio_id, fornecedores_com_email):
        ctx = _make_pc(client, relatorio_id, 1)
        f = fornecedores_com_email[0]
        try:
            r = client.post(f"{API}/pedidos-cotacao/{ctx['pc_id']}/enviar-cotacao", json={
                "material_ids": [ctx["material_ids"][0]],
                "fornecedor_id": f["id"],
            }, timeout=180)
            assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
            time.sleep(1)
            _, mats = _materiais(client, ctx["pc_id"])
            m = mats[ctx["material_ids"][0]]
            assert m["fornecedor_id"] == f["id"]
            assert m["fornecedor_nome"] == f["nome"]
            assert m["cotacao_status"] == "em_cotacao"
        finally:
            _cleanup_pc(client, ctx)


# ---------------- Envio parcial (SMTP falha p/ 1 destinatário) ----------------
class TestEnvioParcial:
    def test_parcial_com_dominio_invalido(self, client, relatorio_id):
        """1 destinatário válido + 1 domínio inexistente. Se o SMTP relay
        aceitar tudo, o teste é informativo (skip)."""
        ctx = _make_pc(client, relatorio_id, 1)
        try:
            r = client.post(f"{API}/pedidos-cotacao/{ctx['pc_id']}/enviar-cotacao", json={
                "material_ids": [],
                "emails_manuais": [
                    {"email": REAL_EMAIL, "nome": "TEST_OK"},
                    {"email": f"nobody-{uuid.uuid4().hex[:6]}@dominio-que-nao-existe-hwi.invalid", "nome": "TEST_FAIL"},
                ],
            }, timeout=240)
            assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
            body = r.json()
            assert body["enviados"] >= 1, body
            if body["falhas"] == 0:
                pytest.skip(f"SMTP relay aceitou o domínio inválido — parcial não reproduzível: {body}")
            assert body["detalhes_falhas"], body
            hist = _historico(client, ctx["pc_id"])
            failed = [h for h in hist if h.get("action") == "email_send_failed"]
            assert failed, [h.get("action") for h in hist]
        finally:
            _cleanup_pc(client, ctx)
