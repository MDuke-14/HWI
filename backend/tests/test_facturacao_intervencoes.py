"""
Tests for Faturação de Intervenções feature:
- GET /api/relatorios-tecnicos/{id}/faturacao/disponibilidade
- POST /api/relatorios-tecnicos/{id}/intervencoes/{intervencao_id}/facturar
- DELETE /api/relatorios-tecnicos/{id}/intervencoes/{intervencao_id}/facturar
- GET /api/relatorios-tecnicos/{id}/faturacao
- POST /api/relatorios-tecnicos/{id}/folha-horas-pdf with intervencao_ids
- preview-pdf shows FACTURADA when intervention is facturada
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://field-clock.preview.emergentagent.com").rstrip("/")
TEST_FS_ID = "8d3a0111-8f03-45d5-a7eb-2cbfcc96ad85"


@pytest.fixture(scope="session")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "teste@email.com", "password": "teste"},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def intervencoes(headers):
    r = requests.get(
        f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/intervencoes",
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 2, "Need at least 2 intervencoes for tests"
    return data


@pytest.fixture(scope="session")
def disponibilidade_baseline(headers):
    """Snapshot before any test mutates state."""
    r = requests.get(
        f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/faturacao/disponibilidade",
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200
    return r.json()


@pytest.fixture(autouse=True, scope="module")
def cleanup_facturacoes(request):
    """After all tests, remove any facturacao left for the test FS."""
    yield
    # Teardown: clear all facturacoes on test FS
    headers_local = None
    try:
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "teste@email.com", "password": "teste"},
            timeout=10,
        )
        if r.status_code == 200:
            tk = r.json()["access_token"]
            headers_local = {"Authorization": f"Bearer {tk}"}
            interv_r = requests.get(
                f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/intervencoes",
                headers=headers_local,
                timeout=10,
            )
            for it in interv_r.json():
                requests.delete(
                    f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/intervencoes/{it['id']}/facturar",
                    headers=headers_local,
                    timeout=10,
                )
    except Exception as e:
        print(f"Cleanup error: {e}")


# ---------- Disponibilidade ----------
class TestDisponibilidade:
    def test_disponibilidade_returns_lines(self, headers, disponibilidade_baseline):
        data = disponibilidade_baseline
        assert "linhas" in data
        assert isinstance(data["linhas"], list)
        assert len(data["linhas"]) > 0
        sample = data["linhas"][0]
        for k in ("tecnico_id", "tecnico_nome", "codigo",
                  "registado_trabalho", "registado_viagem", "registado_oficina", "registado_km",
                  "ja_facturado_trabalho", "disponivel_trabalho", "disponivel_viagem",
                  "disponivel_oficina", "disponivel_km"):
            assert k in sample, f"Missing field {k}"

    def test_disponibilidade_404_for_unknown_fs(self, headers):
        r = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/non-existent-id/faturacao/disponibilidade",
            headers=headers, timeout=10,
        )
        assert r.status_code == 404

    def test_disponibilidade_with_intervencao_id_no_existing(self, headers, intervencoes):
        r = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/faturacao/disponibilidade",
            params={"intervencao_id": intervencoes[0]["id"]},
            headers=headers, timeout=10,
        )
        assert r.status_code == 200
        body = r.json()
        assert "linhas" in body
        assert "alocacao_existente" in body


# ---------- Facturar / Validation / Substitute / Delete ----------
class TestFacturar:
    def _miguel_codigo1(self, baseline):
        for ln in baseline["linhas"]:
            if ln["tecnico_nome"].startswith("Miguel") and ln["codigo"] == "1":
                return ln
        pytest.skip("Miguel Moreira código 1 não encontrado nos dados de teste")

    def test_facturar_success(self, headers, intervencoes, disponibilidade_baseline):
        miguel = self._miguel_codigo1(disponibilidade_baseline)
        interv_id = intervencoes[0]["id"]
        # Clean first
        requests.delete(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/intervencoes/{interv_id}/facturar",
            headers=headers, timeout=10,
        )
        payload = {"alocacoes": [{
            "tecnico_id": miguel["tecnico_id"],
            "tecnico_nome": miguel["tecnico_nome"],
            "funcao_ot": miguel["funcao_ot"],
            "codigo": miguel["codigo"],
            "horas_trabalho": 2.0,
            "horas_viagem": 0.5,
            "horas_oficina": 0.0,
            "km": 0.0,
        }]}
        r = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/intervencoes/{interv_id}/facturar",
            headers=headers, json=payload, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "faturacao" in body
        assert body["faturacao"]["intervencao_id"] == interv_id
        assert len(body["faturacao"]["alocacoes"]) == 1

        # Verify intervencao marked facturada=true
        ir = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/intervencoes",
            headers=headers, timeout=10,
        )
        target = next(i for i in ir.json() if i["id"] == interv_id)
        assert target.get("facturada") is True

        # Verify disponibilidade decreased
        dr = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/faturacao/disponibilidade",
            headers=headers, timeout=10,
        )
        line = next(ln for ln in dr.json()["linhas"]
                    if ln["tecnico_id"] == miguel["tecnico_id"] and ln["codigo"] == "1")
        assert line["ja_facturado_trabalho"] >= 2.0
        assert line["disponivel_trabalho"] == round(miguel["registado_trabalho"] - 2.0, 2)

    def test_facturar_excede_disponivel_returns_400(self, headers, intervencoes, disponibilidade_baseline):
        miguel = self._miguel_codigo1(disponibilidade_baseline)
        interv_id = intervencoes[1]["id"]
        # Try to bill MORE than total registered (should fail because some already billed in test_facturar_success)
        excessive = miguel["registado_trabalho"] + 10
        payload = {"alocacoes": [{
            "tecnico_id": miguel["tecnico_id"],
            "tecnico_nome": miguel["tecnico_nome"],
            "funcao_ot": miguel["funcao_ot"],
            "codigo": miguel["codigo"],
            "horas_trabalho": excessive,
            "horas_viagem": 0,
            "horas_oficina": 0,
            "km": 0,
        }]}
        r = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/intervencoes/{interv_id}/facturar",
            headers=headers, json=payload, timeout=15,
        )
        assert r.status_code == 400
        assert "excedem disponível" in r.text or "excedem disponivel" in r.text.lower() or "exced" in r.text.lower()

        # Confirm intervention B was NOT marked facturada
        ir = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/intervencoes",
            headers=headers, timeout=10,
        )
        target = next(i for i in ir.json() if i["id"] == interv_id)
        assert not target.get("facturada"), "Intervention should NOT be facturada after 400"

    def test_facturar_substitui_nao_dobra(self, headers, intervencoes, disponibilidade_baseline):
        """Calling POST 2x on same intervention substitutes (not duplicates)."""
        miguel = self._miguel_codigo1(disponibilidade_baseline)
        interv_id = intervencoes[2]["id"]
        # Clean first
        requests.delete(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/intervencoes/{interv_id}/facturar",
            headers=headers, timeout=10,
        )
        # First call: bill 1h
        payload1 = {"alocacoes": [{
            "tecnico_id": miguel["tecnico_id"],
            "tecnico_nome": miguel["tecnico_nome"],
            "funcao_ot": miguel["funcao_ot"],
            "codigo": miguel["codigo"],
            "horas_trabalho": 1.0,
            "horas_viagem": 0,
            "horas_oficina": 0,
            "km": 0,
        }]}
        r1 = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/intervencoes/{interv_id}/facturar",
            headers=headers, json=payload1, timeout=15,
        )
        assert r1.status_code == 200

        # Second call: bill 2h (should REPLACE, not stack)
        payload2 = {"alocacoes": [{
            "tecnico_id": miguel["tecnico_id"],
            "tecnico_nome": miguel["tecnico_nome"],
            "funcao_ot": miguel["funcao_ot"],
            "codigo": miguel["codigo"],
            "horas_trabalho": 2.0,
            "horas_viagem": 0,
            "horas_oficina": 0,
            "km": 0,
        }]}
        r2 = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/intervencoes/{interv_id}/facturar",
            headers=headers, json=payload2, timeout=15,
        )
        assert r2.status_code == 200

        # GET facturacao list — should have only 1 doc for this intervencao
        lr = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/faturacao",
            headers=headers, timeout=10,
        )
        assert lr.status_code == 200
        docs_for_interv = [d for d in lr.json() if d["intervencao_id"] == interv_id]
        assert len(docs_for_interv) == 1, f"Expected 1 doc, got {len(docs_for_interv)}"
        assert docs_for_interv[0]["alocacoes"][0]["horas_trabalho"] == 2.0

    def test_desfacturar(self, headers, intervencoes, disponibilidade_baseline):
        miguel = self._miguel_codigo1(disponibilidade_baseline)
        interv_id = intervencoes[3]["id"]
        # Bill first
        payload = {"alocacoes": [{
            "tecnico_id": miguel["tecnico_id"],
            "tecnico_nome": miguel["tecnico_nome"],
            "funcao_ot": miguel["funcao_ot"],
            "codigo": miguel["codigo"],
            "horas_trabalho": 0.5,
            "horas_viagem": 0,
            "horas_oficina": 0,
            "km": 0,
        }]}
        r = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/intervencoes/{interv_id}/facturar",
            headers=headers, json=payload, timeout=15,
        )
        assert r.status_code == 200

        # Desfacturar
        dr = requests.delete(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/intervencoes/{interv_id}/facturar",
            headers=headers, timeout=10,
        )
        assert dr.status_code == 200

        # Verify intervencao.facturada=False
        ir = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/intervencoes",
            headers=headers, timeout=10,
        )
        target = next(i for i in ir.json() if i["id"] == interv_id)
        assert target.get("facturada") is False

        # Verify facturacao doc removed
        lr = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/faturacao",
            headers=headers, timeout=10,
        )
        docs_for_interv = [d for d in lr.json() if d["intervencao_id"] == interv_id]
        assert len(docs_for_interv) == 0


# ---------- Folha de Horas PDF ----------
class TestFolhaHorasPDF:
    def test_folha_horas_with_intervencao_ids(self, headers, intervencoes):
        """Generate FH PDF using only allocations of selected intervencoes."""
        # Use intervention 0 which we billed in test_facturar_success
        interv_id = intervencoes[0]["id"]
        payload = {
            "table_id": 1,
            "dados_extras": {},
            "tarifas_por_tecnico": {},
            "intervencao_ids": [interv_id],
        }
        r = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/folha-horas-pdf",
            headers=headers, json=payload, timeout=30,
        )
        assert r.status_code == 200, f"Status {r.status_code}: {r.text[:300]}"
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 1000
        assert r.content[:4] == b"%PDF"
        with open("/app/test_reports/folha_horas_facturada.pdf", "wb") as f:
            f.write(r.content)

    def test_folha_horas_without_intervencao_ids_regression(self, headers):
        """Regression: endpoint without intervencao_ids works as before."""
        payload = {"table_id": 1, "dados_extras": {}, "tarifas_por_tecnico": {}}
        r = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/folha-horas-pdf",
            headers=headers, json=payload, timeout=30,
        )
        assert r.status_code == 200, f"Status {r.status_code}: {r.text[:300]}"
        assert r.content[:4] == b"%PDF"

    def test_folha_horas_with_null_intervencao_ids(self, headers):
        """Null intervencao_ids should also work."""
        payload = {"table_id": 1, "dados_extras": {}, "tarifas_por_tecnico": {}, "intervencao_ids": None}
        r = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/folha-horas-pdf",
            headers=headers, json=payload, timeout=30,
        )
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"


# ---------- Preview PDF (FACTURADA marker) ----------
class TestPreviewPDF:
    def test_preview_pdf_generates_when_facturada(self, headers, intervencoes):
        """When at least one intervention is facturada, preview-pdf still generates."""
        r = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/preview-pdf",
            headers=headers, timeout=30,
        )
        assert r.status_code == 200, f"Status {r.status_code}: {r.text[:300]}"
        assert r.content[:4] == b"%PDF"
        # Save for inspection
        with open("/app/test_reports/preview_facturada.pdf", "wb") as f:
            f.write(r.content)
