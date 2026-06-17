"""
End-to-end backend API tests for the `faturar_viagens_curtas` feature.

Validates:
  1) GET /api/clientes/{cliente_id} returns the field (Kannegiesser => True)
  2) PUT /api/clientes/{cliente_id} accepts the field and persists it
  3) POST /api/relatorios-tecnicos/{id}/folha-horas-pdf for Kannegiesser FS
     produces a PDF without "Só KM" observation (flag ON behaviour)
  4) Regression: a newly created cliente with flag=False generates a PDF
     that contains "Só KM" for short trips (default behaviour)
"""
import os
import io
import uuid
import pytest
import requests
from PyPDF2 import PdfReader

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://field-clock.preview.emergentagent.com').rstrip('/')
ADMIN_USER = "teste@email.com"
ADMIN_PASS = "teste"
KANNEGIESSER_ID = "888e8306-7375-4765-a85e-37011cf8c136"
KANNEGIESSER_FS_ID = "9093f37f-61e8-43b2-90d3-00038e0aa0eb"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": ADMIN_USER, "password": ADMIN_PASS},
                      timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# 1) GET cliente Kannegiesser -> faturar_viagens_curtas must be True
def test_get_cliente_kannegiesser_has_flag_true(auth_headers):
    r = requests.get(f"{BASE_URL}/api/clientes/{KANNEGIESSER_ID}", headers=auth_headers, timeout=20)
    assert r.status_code == 200, f"GET cliente failed: {r.status_code} {r.text}"
    data = r.json()
    assert "faturar_viagens_curtas" in data, "Campo faturar_viagens_curtas ausente no GET cliente"
    assert data["faturar_viagens_curtas"] is True, f"Expected True, got {data['faturar_viagens_curtas']}"


# 2) PUT cliente toggles the flag and persists. We toggle to False then back to True.
def test_put_cliente_persists_flag(auth_headers):
    # Read current cliente
    r0 = requests.get(f"{BASE_URL}/api/clientes/{KANNEGIESSER_ID}", headers=auth_headers, timeout=20)
    assert r0.status_code == 200
    cliente = r0.json()
    original = cliente.get("faturar_viagens_curtas", False)

    # Toggle
    payload = {**cliente, "faturar_viagens_curtas": not original}
    # Remove server-managed keys
    for k in ("_id", "id", "criado_em", "atualizado_em"):
        payload.pop(k, None)

    r1 = requests.put(f"{BASE_URL}/api/clientes/{KANNEGIESSER_ID}", headers=auth_headers, json=payload, timeout=20)
    assert r1.status_code in (200, 201), f"PUT failed: {r1.status_code} {r1.text}"

    r2 = requests.get(f"{BASE_URL}/api/clientes/{KANNEGIESSER_ID}", headers=auth_headers, timeout=20)
    assert r2.status_code == 200
    assert r2.json().get("faturar_viagens_curtas") == (not original), "Flag não persistiu"

    # Restore original
    payload["faturar_viagens_curtas"] = original
    r3 = requests.put(f"{BASE_URL}/api/clientes/{KANNEGIESSER_ID}", headers=auth_headers, json=payload, timeout=20)
    assert r3.status_code in (200, 201)
    r4 = requests.get(f"{BASE_URL}/api/clientes/{KANNEGIESSER_ID}", headers=auth_headers, timeout=20)
    assert r4.json().get("faturar_viagens_curtas") == original, "Flag não restaurou"


def _extract_pdf_text(content: bytes) -> str:
    reader = PdfReader(io.BytesIO(content))
    return "\n".join(p.extract_text() or "" for p in reader.pages)


# 3) Folha de horas PDF for Kannegiesser FS - flag ON => no "Só KM"
def test_folha_horas_pdf_kannegiesser_no_so_km(auth_headers):
    r = requests.post(
        f"{BASE_URL}/api/relatorios-tecnicos/{KANNEGIESSER_FS_ID}/folha-horas-pdf",
        headers=auth_headers, json={"tarifas_por_tecnico": {}, "dados_extras": {}}, timeout=60,
    )
    assert r.status_code == 200, f"Status {r.status_code} body: {r.text[:300]}"
    assert r.headers.get("content-type", "").startswith("application/pdf") or r.content[:4] == b"%PDF", "Resposta não é PDF"
    text = _extract_pdf_text(r.content)
    # Save for debug
    with open("/app/test_reports/folha_horas_kannegiesser_flag_on.pdf", "wb") as f:
        f.write(r.content)
    assert "Só KM" not in text, "Com flag ON, NÃO deveria existir observação 'Só KM' no PDF"


# 4) Regression - cliente sem flag (default False): PDF deve conter 'Só KM' para viagens curtas.
#    Como criar uma FS completa via API é complexo, validamos isto temporariamente baixando
#    a flag do próprio Kannegiesser para False, gerando o PDF e restaurando.
def test_folha_horas_pdf_flag_off_contains_so_km(auth_headers):
    # 1. Ler o cliente original
    r0 = requests.get(f"{BASE_URL}/api/clientes/{KANNEGIESSER_ID}", headers=auth_headers, timeout=20)
    assert r0.status_code == 200
    cliente = r0.json()
    original = cliente.get("faturar_viagens_curtas", False)

    # 2. Forçar a False
    payload = {**cliente, "faturar_viagens_curtas": False}
    for k in ("_id", "id", "criado_em", "atualizado_em"):
        payload.pop(k, None)
    rput = requests.put(f"{BASE_URL}/api/clientes/{KANNEGIESSER_ID}", headers=auth_headers, json=payload, timeout=20)
    assert rput.status_code in (200, 201)

    try:
        # 3. Gerar PDF
        r = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{KANNEGIESSER_FS_ID}/folha-horas-pdf",
            headers=auth_headers, json={"tarifas_por_tecnico": {}, "dados_extras": {}}, timeout=60,
        )
        assert r.status_code == 200
        with open("/app/test_reports/folha_horas_kannegiesser_flag_off.pdf", "wb") as f:
            f.write(r.content)
        text = _extract_pdf_text(r.content)
        assert "Só KM" in text, "Com flag OFF, deveria conter 'Só KM' no PDF (FS com viagens curtas)"
    finally:
        # 4. Restaurar
        payload["faturar_viagens_curtas"] = original
        requests.put(f"{BASE_URL}/api/clientes/{KANNEGIESSER_ID}", headers=auth_headers, json=payload, timeout=20)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
