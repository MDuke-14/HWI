"""
Tests for PC (Pedido de Cotação) equipment selection + sub-PC enrichment.

Scope:
 - GET /api/pedidos-cotacao returns sub-PCs enriched with ot_numero, cliente_nome
 - PedidoCotacao model stores equipamento_ot_ids
 - POST /api/relatorios-tecnicos/{id}/materiais with fornecido_por='Cotação' accepts equipamento_ot_ids
 - GET /api/pedidos-cotacao/{id} returns equipamentos_pc list from equipamento_ot_ids
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://field-clock.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"username": "pedro", "password": "teste"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def test_setup(client):
    """Create a FS with 2 equipments. Teardown deletes everything."""
    # Get first cliente
    r = client.get(f"{API}/clientes", timeout=30)
    assert r.status_code == 200, r.text
    clientes = r.json()
    assert len(clientes) > 0
    cliente = clientes[0]

    # Create FS / relatorio tecnico
    tag = uuid.uuid4().hex[:6]
    fs_payload = {
        "cliente_id": cliente["id"],
        "cliente_nome": cliente.get("nome", "TEST"),
        "motivo_assistencia": f"TEST_PC_EQ_{tag}",
        "data_servico": "2026-01-15",
        "local_intervencao": "TEST_LOCAL",
        "pedido_por": "TEST_PEDIDO",
    }
    r = client.post(f"{API}/relatorios-tecnicos", json=fs_payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    fs = r.json()
    relatorio_id = fs["id"]

    # Add 2 equipamentos_ot
    eq_ids = []
    for i in range(2):
        payload = {
            "relatorio_id": relatorio_id,
            "tipologia": "Empilhador",
            "marca": f"TEST_MARCA_{tag}_{i}",
            "modelo": f"M{i}",
            "numero_serie": f"TESTSER_{tag}_{i}",
            "ano_fabrico": "2024",
        }
        r = client.post(f"{API}/relatorios-tecnicos/{relatorio_id}/equipamentos", json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        eq_ids.append(r.json()["id"])

    data = {"relatorio_id": relatorio_id, "eq_ids": eq_ids, "fs_numero": fs.get("numero_assistencia")}
    yield data

    # Teardown: delete PCs of this FS, then materiais, equipamentos, FS
    try:
        pcs = client.get(f"{API}/relatorios-tecnicos/{relatorio_id}/pedidos-cotacao", timeout=30).json()
        for pc in pcs:
            client.delete(f"{API}/pedidos-cotacao/{pc['id']}", timeout=30)
    except Exception:
        pass
    try:
        client.delete(f"{API}/relatorios-tecnicos/{relatorio_id}", timeout=30)
    except Exception:
        pass


def _create_material_cotacao(client, relatorio_id, eq_ot_ids, descricao, pc_id=None):
    payload = {
        "relatorio_id": relatorio_id,
        "descricao": descricao,
        "quantidade": 1,
        "unidade": "Un",
        "fornecido_por": "Cotação",
        "equipamento_ot_ids": eq_ot_ids,
    }
    if pc_id:
        payload["pc_id"] = pc_id
    r = client.post(f"{API}/relatorios-tecnicos/{relatorio_id}/materiais", json=payload, timeout=30)
    return r


class TestPCEquipmentSelection:
    def test_create_pc_with_first_equipment_only(self, client, test_setup):
        """Create a material with Cotação selecting only equipment[0] -> creates main PC."""
        relatorio_id = test_setup["relatorio_id"]
        selected = [test_setup["eq_ids"][0]]
        r = _create_material_cotacao(client, relatorio_id, selected, "TEST_MAT_EQ0")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "pc_id" in body, f"Material should have pc_id: {body}"
        pc_id = body["pc_id"]

        # GET PC detail
        r = client.get(f"{API}/pedidos-cotacao/{pc_id}", timeout=30)
        assert r.status_code == 200
        pc = r.json()
        assert pc.get("equipamento_ot_ids") == selected, f"equipamento_ot_ids mismatch: {pc.get('equipamento_ot_ids')}"
        assert "equipamentos_pc" in pc
        assert len(pc["equipamentos_pc"]) == 1
        assert pc["equipamentos_pc"][0]["id"] == selected[0]
        # Store for next tests
        test_setup["main_pc_id"] = pc_id

    def test_create_sub_pc_with_second_equipment(self, client, test_setup):
        """Create second material -> creates sub-PC (since parent exists). Select only equipment[1]."""
        relatorio_id = test_setup["relatorio_id"]
        selected = [test_setup["eq_ids"][1]]
        r = _create_material_cotacao(client, relatorio_id, selected, "TEST_MAT_EQ1")
        assert r.status_code == 200, r.text
        sub_pc_id = r.json()["pc_id"]
        assert sub_pc_id != test_setup["main_pc_id"], "Should create a new sub-PC"

        # Verify sub-PC stores the equipamento_ot_ids
        r = client.get(f"{API}/pedidos-cotacao/{sub_pc_id}", timeout=30)
        assert r.status_code == 200
        sub_pc = r.json()
        assert sub_pc.get("parent_pc_id") == test_setup["main_pc_id"], f"Should be sub-PC of main: {sub_pc}"
        assert sub_pc.get("equipamento_ot_ids") == selected
        assert len(sub_pc.get("equipamentos_pc", [])) == 1
        assert sub_pc["equipamentos_pc"][0]["id"] == selected[0]
        test_setup["sub_pc_id"] = sub_pc_id

    def test_create_pc_with_multiple_equipments(self, client, test_setup):
        """Aggregate into main PC choosing multiple equipments via equipamento_ot_ids."""
        relatorio_id = test_setup["relatorio_id"]
        selected = test_setup["eq_ids"]  # both
        # Aggregate to the main PC
        r = _create_material_cotacao(
            client, relatorio_id, selected, "TEST_MAT_BOTH", pc_id=test_setup["main_pc_id"]
        )
        assert r.status_code == 200, r.text

        r = client.get(f"{API}/pedidos-cotacao/{test_setup['main_pc_id']}", timeout=30)
        assert r.status_code == 200
        pc = r.json()
        # Should contain both ids (merged, set-style)
        got = set(pc.get("equipamento_ot_ids") or [])
        assert got == set(selected), f"Expected merged equipment ids {set(selected)}, got {got}"
        assert len(pc.get("equipamentos_pc", [])) == 2

    def test_list_pedidos_cotacao_enriches_sub_pcs(self, client, test_setup):
        """GET /api/pedidos-cotacao returns main PCs with sub_pcs enriched with ot_numero and cliente_nome."""
        r = client.get(f"{API}/pedidos-cotacao", timeout=30)
        assert r.status_code == 200, r.text
        pcs = r.json()
        main_pc = next((p for p in pcs if p["id"] == test_setup["main_pc_id"]), None)
        assert main_pc is not None, "Main PC not in listing"

        # Main has ot_numero + cliente_nome
        assert main_pc.get("ot_numero"), f"Main PC missing ot_numero: {main_pc}"
        assert main_pc.get("cliente_nome"), f"Main PC missing cliente_nome: {main_pc}"
        assert "materiais_count" in main_pc

        # sub_pcs must exist and be enriched
        sub_pcs = main_pc.get("sub_pcs", [])
        assert len(sub_pcs) >= 1, f"No sub_pcs found on main PC: {main_pc}"
        sub = sub_pcs[0]
        assert sub.get("ot_numero") == main_pc["ot_numero"], f"Sub-PC ot_numero not enriched: {sub}"
        assert sub.get("cliente_nome") == main_pc["cliente_nome"], f"Sub-PC cliente_nome not enriched: {sub}"
        assert "materiais_count" in sub, f"Sub-PC materiais_count missing: {sub}"

    def test_sub_pcs_not_in_top_level_list(self, client, test_setup):
        """Sub-PCs must not appear as top-level entries; only nested under their parent."""
        r = client.get(f"{API}/pedidos-cotacao", timeout=30)
        assert r.status_code == 200
        pcs = r.json()
        top_ids = {p["id"] for p in pcs}
        assert test_setup["sub_pc_id"] not in top_ids, "Sub-PC should not be in top-level list"

    def test_pedido_cotacao_model_persists_equipamento_ot_ids(self, client, test_setup):
        """Verify field is persisted on both main and sub PC documents."""
        for pc_id in (test_setup["main_pc_id"], test_setup["sub_pc_id"]):
            r = client.get(f"{API}/pedidos-cotacao/{pc_id}", timeout=30)
            assert r.status_code == 200
            pc = r.json()
            assert "equipamento_ot_ids" in pc, f"equipamento_ot_ids field missing on PC {pc_id}"
            assert isinstance(pc["equipamento_ot_ids"], list)
            assert len(pc["equipamento_ot_ids"]) >= 1
