"""
Tests for equipment management improvements:
1. GET /api/equipamentos?cliente_id=X returns equipment sorted by marca (brand) alphabetically
2. POST /api/equipamentos with duplicate numero_serie returns 409 with descriptive error
3. PUT /api/equipamentos/{id} with duplicate numero_serie returns 409 error
4. POST with unique / empty numero_serie works normally
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
TEST_TAG = "TEST_MARCA_" + uuid.uuid4().hex[:6].upper()


# ============ Fixtures ============
@pytest.fixture(scope="module")
def auth_headers():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "pedro", "password": "teste"
    })
    if resp.status_code != 200:
        pytest.skip(f"Login failed: {resp.status_code} {resp.text}")
    token = resp.json().get("access_token")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def client_ids(auth_headers):
    """Return two distinct client IDs for multi-client tests."""
    resp = requests.get(f"{BASE_URL}/api/clientes", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    clientes = resp.json()
    assert len(clientes) >= 2, "Need at least 2 clients for tests"
    return clientes[0]["id"], clientes[1]["id"]


@pytest.fixture(scope="module")
def created_equip_ids(auth_headers):
    """Track created equipments so they can be soft-deleted after."""
    ids = []
    yield ids
    for eid in ids:
        try:
            requests.delete(f"{BASE_URL}/api/equipamentos/{eid}", headers=auth_headers, timeout=10)
        except Exception:
            pass


# ============ Helpers ============
def _create_equip(headers, cliente_id, marca, modelo, numero_serie=None, tipologia="TEST_TIPO"):
    payload = {
        "cliente_id": cliente_id,
        "tipologia": tipologia,
        "marca": marca,
        "modelo": modelo,
    }
    if numero_serie is not None:
        payload["numero_serie"] = numero_serie
    return requests.post(f"{BASE_URL}/api/equipamentos", headers=headers, json=payload)


# ============ Sorting by marca ============
class TestEquipamentoSortByMarca:
    """GET /api/equipamentos?cliente_id=X sorted by marca asc, modelo asc."""

    def test_get_sorted_by_marca_alphabetically(self, auth_headers, client_ids, created_equip_ids):
        cliente_id = client_ids[0]
        # Insert deliberately out of alphabetical order
        marcas_modelos = [
            ("ZebraBrand", "Z1"),
            ("AlphaBrand", "A1"),
            ("MikeBrand", "M1"),
            ("AlphaBrand", "A2"),  # same marca, different modelo
        ]
        for m, mod in marcas_modelos:
            r = _create_equip(auth_headers, cliente_id,
                              f"{TEST_TAG}_{m}", f"{TEST_TAG}_{mod}",
                              numero_serie=f"{TEST_TAG}_{m}_{mod}")
            assert r.status_code == 200, r.text
            created_equip_ids.append(r.json()["id"])

        resp = requests.get(
            f"{BASE_URL}/api/equipamentos?cliente_id={cliente_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        lst = resp.json()
        # Filter to our test equipments only
        ours = [e for e in lst if e.get("marca", "").startswith(TEST_TAG)]
        assert len(ours) == 4

        # Verify sort order by (marca, modelo) ascending
        marcas_seq = [e["marca"] for e in ours]
        assert marcas_seq == sorted(marcas_seq), f"Not sorted by marca: {marcas_seq}"

        # For AlphaBrand entries, verify modelo also sorted
        alpha = [e for e in ours if "AlphaBrand" in e["marca"]]
        modelos_seq = [e["modelo"] for e in alpha]
        assert modelos_seq == sorted(modelos_seq), f"Modelo not sorted within marca: {modelos_seq}"


# ============ Duplicate Serial Number (POST) ============
class TestEquipamentoDuplicateSeriePOST:

    def test_create_unique_serie_success(self, auth_headers, client_ids, created_equip_ids):
        cliente_id = client_ids[0]
        serie = f"{TEST_TAG}_UNIQUE_{uuid.uuid4().hex[:6]}"
        r = _create_equip(auth_headers, cliente_id,
                          f"{TEST_TAG}_UMarca", f"{TEST_TAG}_UModelo",
                          numero_serie=serie)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["numero_serie"] == serie
        created_equip_ids.append(data["id"])

    def test_create_empty_serie_allowed(self, auth_headers, client_ids, created_equip_ids):
        cliente_id = client_ids[0]
        # Empty string
        r1 = _create_equip(auth_headers, cliente_id,
                           f"{TEST_TAG}_EmptyA", f"{TEST_TAG}_EmptyAM",
                           numero_serie="")
        assert r1.status_code == 200, r1.text
        created_equip_ids.append(r1.json()["id"])

        # Second empty-serie should still be allowed
        r2 = _create_equip(auth_headers, cliente_id,
                           f"{TEST_TAG}_EmptyB", f"{TEST_TAG}_EmptyBM",
                           numero_serie="")
        assert r2.status_code == 200, r2.text
        created_equip_ids.append(r2.json()["id"])

        # None (omitted) also allowed
        r3 = _create_equip(auth_headers, cliente_id,
                           f"{TEST_TAG}_EmptyC", f"{TEST_TAG}_EmptyCM",
                           numero_serie=None)
        assert r3.status_code == 200, r3.text
        created_equip_ids.append(r3.json()["id"])

    def test_duplicate_serie_same_client_returns_409(self, auth_headers, client_ids, created_equip_ids):
        cliente_id = client_ids[0]
        serie = f"{TEST_TAG}_DUP_{uuid.uuid4().hex[:6]}"

        r1 = _create_equip(auth_headers, cliente_id,
                           f"{TEST_TAG}_DupM1", f"{TEST_TAG}_DupMod1",
                           numero_serie=serie)
        assert r1.status_code == 200, r1.text
        created_equip_ids.append(r1.json()["id"])

        r2 = _create_equip(auth_headers, cliente_id,
                           f"{TEST_TAG}_DupM2", f"{TEST_TAG}_DupMod2",
                           numero_serie=serie)
        assert r2.status_code == 409, f"Expected 409, got {r2.status_code}: {r2.text}"
        detail = r2.json().get("detail", "")
        assert serie in detail, f"Error must mention the serial: {detail}"
        assert f"{TEST_TAG}_DupM1" in detail, f"Error must mention existing marca: {detail}"
        assert "Cliente:" in detail, f"Error must mention client name: {detail}"

    def test_duplicate_serie_different_client_returns_409(self, auth_headers, client_ids, created_equip_ids):
        """Serial uniqueness is GLOBAL across all clients."""
        c1, c2 = client_ids
        serie = f"{TEST_TAG}_GDUP_{uuid.uuid4().hex[:6]}"

        r1 = _create_equip(auth_headers, c1,
                           f"{TEST_TAG}_GM1", f"{TEST_TAG}_GMod1",
                           numero_serie=serie)
        assert r1.status_code == 200, r1.text
        created_equip_ids.append(r1.json()["id"])

        r2 = _create_equip(auth_headers, c2,
                           f"{TEST_TAG}_GM2", f"{TEST_TAG}_GMod2",
                           numero_serie=serie)
        assert r2.status_code == 409, f"Expected 409 globally, got {r2.status_code}: {r2.text}"
        detail = r2.json().get("detail", "")
        assert serie in detail

    def test_whitespace_trimmed_duplicate_detected(self, auth_headers, client_ids, created_equip_ids):
        cliente_id = client_ids[0]
        serie = f"{TEST_TAG}_WS_{uuid.uuid4().hex[:6]}"

        r1 = _create_equip(auth_headers, cliente_id,
                           f"{TEST_TAG}_WSM1", f"{TEST_TAG}_WSMod1",
                           numero_serie=serie)
        assert r1.status_code == 200, r1.text
        created_equip_ids.append(r1.json()["id"])

        # Same serie but with surrounding spaces — should be treated as duplicate after strip
        r2 = _create_equip(auth_headers, cliente_id,
                           f"{TEST_TAG}_WSM2", f"{TEST_TAG}_WSMod2",
                           numero_serie=f"  {serie}  ")
        assert r2.status_code == 409, f"Expected 409 for whitespace-dup, got {r2.status_code}: {r2.text}"


# ============ Duplicate Serial Number (PUT) ============
class TestEquipamentoDuplicateSeriePUT:

    def test_put_duplicate_serie_returns_409(self, auth_headers, client_ids, created_equip_ids):
        cliente_id = client_ids[0]
        serie_a = f"{TEST_TAG}_PUT_A_{uuid.uuid4().hex[:6]}"
        serie_b = f"{TEST_TAG}_PUT_B_{uuid.uuid4().hex[:6]}"

        ra = _create_equip(auth_headers, cliente_id,
                           f"{TEST_TAG}_PUTMA", f"{TEST_TAG}_PUTModA",
                           numero_serie=serie_a)
        assert ra.status_code == 200, ra.text
        id_a = ra.json()["id"]
        created_equip_ids.append(id_a)

        rb = _create_equip(auth_headers, cliente_id,
                           f"{TEST_TAG}_PUTMB", f"{TEST_TAG}_PUTModB",
                           numero_serie=serie_b)
        assert rb.status_code == 200, rb.text
        id_b = rb.json()["id"]
        created_equip_ids.append(id_b)

        # Try to update B's serie to match A's
        r_upd = requests.put(
            f"{BASE_URL}/api/equipamentos/{id_b}",
            headers=auth_headers,
            json={"numero_serie": serie_a}
        )
        assert r_upd.status_code == 409, f"Expected 409, got {r_upd.status_code}: {r_upd.text}"
        detail = r_upd.json().get("detail", "")
        assert serie_a in detail

    def test_put_same_serie_on_same_equipment_allowed(self, auth_headers, client_ids, created_equip_ids):
        """Updating an equipment with its OWN serial should not trigger 409."""
        cliente_id = client_ids[0]
        serie = f"{TEST_TAG}_SELF_{uuid.uuid4().hex[:6]}"
        r = _create_equip(auth_headers, cliente_id,
                          f"{TEST_TAG}_SelfM", f"{TEST_TAG}_SelfMod",
                          numero_serie=serie)
        assert r.status_code == 200, r.text
        eid = r.json()["id"]
        created_equip_ids.append(eid)

        r_upd = requests.put(
            f"{BASE_URL}/api/equipamentos/{eid}",
            headers=auth_headers,
            json={"numero_serie": serie, "modelo": f"{TEST_TAG}_SelfMod_v2"}
        )
        assert r_upd.status_code == 200, f"Self-update should succeed: {r_upd.status_code} {r_upd.text}"
        assert r_upd.json()["modelo"] == f"{TEST_TAG}_SelfMod_v2"

    def test_put_unique_new_serie_succeeds(self, auth_headers, client_ids, created_equip_ids):
        cliente_id = client_ids[0]
        serie_orig = f"{TEST_TAG}_ORIG_{uuid.uuid4().hex[:6]}"
        serie_new = f"{TEST_TAG}_NEW_{uuid.uuid4().hex[:6]}"
        r = _create_equip(auth_headers, cliente_id,
                          f"{TEST_TAG}_PUTNewM", f"{TEST_TAG}_PUTNewMod",
                          numero_serie=serie_orig)
        assert r.status_code == 200
        eid = r.json()["id"]
        created_equip_ids.append(eid)

        r_upd = requests.put(
            f"{BASE_URL}/api/equipamentos/{eid}",
            headers=auth_headers,
            json={"numero_serie": serie_new}
        )
        assert r_upd.status_code == 200, r_upd.text
        assert r_upd.json()["numero_serie"] == serie_new
