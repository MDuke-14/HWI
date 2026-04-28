"""
Backend tests for FS de Continuidade feature.

Covers:
  - POST /api/relatorios-tecnicos/{id}/criar-continuidade (happy path + validations)
  - DELETE /api/relatorios-tecnicos/{id}/intervencoes/{interv_id}/facturar bloqueio
  - PDF preview for inherited intervention header (red banner)
  - Cleanup of created continuity FS at the end
"""
import os
import pytest
import requests
from pathlib import Path

# Load REACT_APP_BACKEND_URL from frontend/.env
def _load_backend_url():
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    val = os.environ.get("REACT_APP_BACKEND_URL")
    if val:
        return val.rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_backend_url()
ORIG_FS_ID = "8d3a0111-8f03-45d5-a7eb-2cbfcc96ad85"

# ---------- fixtures ----------

@pytest.fixture(scope="session")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "teste@email.com", "password": "teste"},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def client(auth_token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
    })
    return s


@pytest.fixture(scope="session")
def origin_fs(client):
    r = client.get(f"{BASE_URL}/api/relatorios-tecnicos/{ORIG_FS_ID}", timeout=30)
    assert r.status_code == 200, f"origin FS not found: {r.status_code} {r.text[:200]}"
    return r.json()


@pytest.fixture(scope="session")
def origin_intervs(client):
    r = client.get(
        f"{BASE_URL}/api/relatorios-tecnicos/{ORIG_FS_ID}/intervencoes", timeout=30
    )
    assert r.status_code == 200
    intervs = r.json()
    # filter only NOT facturada and NOT herdada (only those can transition)
    avail = [
        i for i in intervs
        if not i.get("facturada") and not i.get("herdada_de_intervencao_id")
    ]
    return intervs, avail


# Track created FS ids for cleanup
_created_fs_ids: list[str] = []


@pytest.fixture(scope="session", autouse=True)
def cleanup(client):
    yield
    # Teardown: delete the continuity FS using direct mongo cleanup endpoint
    # Fallback: use DELETE FS endpoint if available
    for fs_id in _created_fs_ids:
        try:
            r = client.delete(f"{BASE_URL}/api/relatorios-tecnicos/{fs_id}", timeout=30)
            print(f"Cleanup DELETE {fs_id}: {r.status_code}")
        except Exception as e:
            print(f"Cleanup error for {fs_id}: {e}")


# ---------- validation tests ----------

class TestCriarContinuidadeValidacoes:
    def test_intervencao_ids_vazio(self, client):
        r = client.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{ORIG_FS_ID}/criar-continuidade",
            json={"intervencao_ids": []},
            timeout=30,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"

    def test_intervencao_ids_invalido(self, client):
        r = client.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{ORIG_FS_ID}/criar-continuidade",
            json={"intervencao_ids": ["00000000-0000-0000-0000-000000000000"]},
            timeout=30,
        )
        assert r.status_code == 400

    def test_fs_origem_inexistente(self, client):
        r = client.post(
            f"{BASE_URL}/api/relatorios-tecnicos/00000000-0000-0000-0000-000000000000/criar-continuidade",
            json={"intervencao_ids": ["xxx"]},
            timeout=30,
        )
        assert r.status_code in (400, 404)


# ---------- happy path test ----------

class TestCriarContinuidadeHappyPath:
    def test_criar_continuidade_full_flow(self, client, origin_fs, origin_intervs):
        all_intervs, available = origin_intervs
        if not available:
            pytest.skip("No available intervencao to transition")

        chosen = available[0]
        chosen_id = chosen["id"]

        # Snapshot origin counts of related collections (before)
        # via materiais and RAs endpoints
        r_mats_origem = client.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{ORIG_FS_ID}/materiais", timeout=30
        )
        assert r_mats_origem.status_code == 200
        mats_origem = [m for m in r_mats_origem.json() if m.get("intervencao_id") == chosen_id]

        # Call criar-continuidade
        r = client.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{ORIG_FS_ID}/criar-continuidade",
            json={"intervencao_ids": [chosen_id]},
            timeout=60,
        )
        assert r.status_code == 200, f"continuidade failed: {r.status_code} {r.text[:400]}"
        data = r.json()
        assert "new_fs_id" in data
        assert "new_fs_numero" in data
        assert data["intervencoes_herdadas"] == 1
        new_fs_id = data["new_fs_id"]
        new_fs_numero = data["new_fs_numero"]
        _created_fs_ids.append(new_fs_id)

        # Validate new FS metadata
        r_new = client.get(f"{BASE_URL}/api/relatorios-tecnicos/{new_fs_id}", timeout=30)
        assert r_new.status_code == 200
        new_fs = r_new.json()
        assert new_fs.get("ot_relacionada_id") == ORIG_FS_ID, "ot_relacionada_id missing"
        assert new_fs.get("cliente_id") == origin_fs.get("cliente_id")
        assert new_fs.get("local_intervencao") == origin_fs.get("local_intervencao")
        assert new_fs.get("pedido_por") == origin_fs.get("pedido_por")
        assert new_fs.get("referencia_interna_cliente") == origin_fs.get("referencia_interna_cliente")
        assert new_fs.get("numero_assistencia") == new_fs_numero
        assert new_fs_numero > origin_fs.get("numero_assistencia", 0)

        # Validate inherited intervencao
        r_intervs_new = client.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{new_fs_id}/intervencoes", timeout=30
        )
        assert r_intervs_new.status_code == 200
        intervs_new = r_intervs_new.json()
        assert len(intervs_new) == 1
        ni = intervs_new[0]
        assert ni.get("herdada_de_intervencao_id") == chosen_id
        assert ni.get("herdada_de_fs_id") == ORIG_FS_ID
        assert ni.get("herdada_de_fs_numero") == origin_fs.get("numero_assistencia")
        assert ni.get("data_intervencao") == chosen.get("data_intervencao")
        assert ni.get("motivo_assistencia") == chosen.get("motivo_assistencia")
        assert ni.get("facturada") in (False, None)

        # Validate origem intervencao now facturada=True
        r_intervs_orig = client.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{ORIG_FS_ID}/intervencoes", timeout=30
        )
        oi = next((i for i in r_intervs_orig.json() if i["id"] == chosen_id), None)
        assert oi is not None
        assert oi.get("facturada") is True, "origem intervencao should be facturada"

        # Validate materiais duplicados
        r_mats_new = client.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{new_fs_id}/materiais", timeout=30
        )
        assert r_mats_new.status_code == 200
        mats_new = r_mats_new.json()
        # mats_new should have same count as mats_origem and have distinct IDs
        assert len(mats_new) == len(mats_origem), (
            f"materiais count mismatch: origem={len(mats_origem)} nova={len(mats_new)}"
        )
        if mats_new:
            old_ids = {m["id"] for m in mats_origem}
            new_ids = {m["id"] for m in mats_new}
            assert old_ids.isdisjoint(new_ids), "materiais devem ter novos IDs"
            for m in mats_new:
                assert m.get("relatorio_id") == new_fs_id
                # PC fields should be cleared
                assert not m.get("pedido_cotacao_id")
                assert not m.get("pc_numero")

        # Validate mao-de-obra NÃO duplicada (registos_tecnico_ot endpoint)
        r_mo_new = client.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{new_fs_id}/mao-obra", timeout=30
        )
        # This endpoint may or may not exist; tolerate 404
        if r_mo_new.status_code == 200:
            mo = r_mo_new.json()
            # Must be empty / no registos
            if isinstance(mo, list):
                assert len(mo) == 0, "mão-de-obra não deve existir na FS continuidade"
            elif isinstance(mo, dict):
                assert not mo.get("registos"), "mão-de-obra não deve existir na FS continuidade"


# ---------- bloqueio desfacturar ----------

class TestBloqueioDesfacturar:
    def test_desfacturar_bloqueado_apos_continuidade(self, client, origin_intervs):
        # The first happy path already used available[0]. Use that same intervencao.
        all_intervs, available = origin_intervs
        # find an intervencao that is now facturada AND has continuidade
        # (any one where we already created continuity in previous test)
        if not _created_fs_ids:
            pytest.skip("no continuity fs was created previously")

        # Re-fetch intervencoes of origin
        r = client.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{ORIG_FS_ID}/intervencoes", timeout=30
        )
        intervs = r.json()
        # Pick one that became facturada and matches a herdada_de in our new fs
        new_fs_id = _created_fs_ids[0]
        r_new_intervs = client.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{new_fs_id}/intervencoes", timeout=30
        )
        herdada_origens = {ni["herdada_de_intervencao_id"] for ni in r_new_intervs.json()}
        target = next((i for i in intervs if i["id"] in herdada_origens), None)
        assert target is not None, "no facturada intervencao with continuity found"

        r_del = client.delete(
            f"{BASE_URL}/api/relatorios-tecnicos/{ORIG_FS_ID}/intervencoes/{target['id']}/facturar",
            timeout=30,
        )
        assert r_del.status_code == 400, (
            f"desfacturar should be blocked: {r_del.status_code} {r_del.text[:300]}"
        )
        msg = r_del.text
        # message must reference the FS de continuidade numero
        new_numero = None
        r_fs = client.get(f"{BASE_URL}/api/relatorios-tecnicos/{new_fs_id}", timeout=30)
        if r_fs.status_code == 200:
            new_numero = r_fs.json().get("numero_assistencia")
        if new_numero is not None:
            assert str(new_numero) in msg, f"expected #{new_numero} in detail, got {msg[:300]}"


# ---------- PDF preview ----------

class TestPDFContinuidade:
    def test_preview_pdf_nova_fs(self, client):
        if not _created_fs_ids:
            pytest.skip("no continuity fs was created")
        new_fs_id = _created_fs_ids[0]
        r = client.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{new_fs_id}/preview-pdf", timeout=60
        )
        assert r.status_code == 200, f"preview-pdf failed: {r.status_code} {r.text[:200]}"
        ctype = r.headers.get("content-type", "")
        assert "pdf" in ctype.lower(), f"expected pdf content-type, got {ctype}"
        assert len(r.content) > 1000, "pdf seems empty"
        # Save for inspection
        out = "/app/test_reports/continuidade_preview.pdf"
        with open(out, "wb") as f:
            f.write(r.content)
        print(f"saved preview pdf to {out} ({len(r.content)} bytes)")
