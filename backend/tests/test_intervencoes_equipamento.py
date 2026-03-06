"""
Tests for the new Ver Intervenções feature:
- GET /api/equipamentos/{equipamento_id}/intervencoes endpoint
- Verifies that interventions are returned with OT information
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://field-clock.preview.emergentagent.com').rstrip('/')

# Test equipment ID provided in requirements
TEST_EQUIPMENT_ID = "db7feed4-6bae-44d7-8b79-c2de54862f3d"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for pedro/password"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "pedro",
        "password": "password"
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Authentication failed - skipping tests")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Return headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestEquipamentoIntervencoes:
    """Test GET /api/equipamentos/{id}/intervencoes endpoint"""
    
    def test_get_intervencoes_returns_200(self, auth_headers):
        """Test that endpoint returns 200 status"""
        response = requests.get(
            f"{BASE_URL}/api/equipamentos/{TEST_EQUIPMENT_ID}/intervencoes",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    def test_get_intervencoes_returns_list(self, auth_headers):
        """Test that endpoint returns a list"""
        response = requests.get(
            f"{BASE_URL}/api/equipamentos/{TEST_EQUIPMENT_ID}/intervencoes",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Expected a list of interventions"
    
    def test_intervencoes_have_required_fields(self, auth_headers):
        """Test that each intervention has the required fields for display"""
        response = requests.get(
            f"{BASE_URL}/api/equipamentos/{TEST_EQUIPMENT_ID}/intervencoes",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have at least one intervention based on test data
        assert len(data) > 0, "Expected at least one intervention for test equipment"
        
        # Check first intervention has required fields
        first = data[0]
        required_fields = ["id", "relatorio_id", "data_intervencao", "motivo_assistencia", "ot_numero"]
        for field in required_fields:
            assert field in first, f"Missing required field: {field}"
    
    def test_intervencoes_ot_numero_format(self, auth_headers):
        """Test that ot_numero is an integer (for display as OT #XXX)"""
        response = requests.get(
            f"{BASE_URL}/api/equipamentos/{TEST_EQUIPMENT_ID}/intervencoes",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Filter out interventions that have ot_numero
        interventions_with_ot = [i for i in data if i.get("ot_numero") is not None]
        assert len(interventions_with_ot) > 0, "Expected some interventions with ot_numero"
        
        for interv in interventions_with_ot:
            assert isinstance(interv["ot_numero"], int), f"ot_numero should be int, got {type(interv['ot_numero'])}"
    
    def test_intervencoes_have_relatorio_assistencia(self, auth_headers):
        """Test that relatorio_assistencia field is present"""
        response = requests.get(
            f"{BASE_URL}/api/equipamentos/{TEST_EQUIPMENT_ID}/intervencoes",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check relatorio_assistencia field exists (can be null)
        for interv in data:
            assert "relatorio_assistencia" in interv, "Missing relatorio_assistencia field"
    
    def test_invalid_equipment_id_returns_404(self, auth_headers):
        """Test that invalid equipment ID returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/equipamentos/invalid-nonexistent-id/intervencoes",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_unauthenticated_request_returns_401_or_403(self):
        """Test that unauthenticated requests are rejected"""
        response = requests.get(
            f"{BASE_URL}/api/equipamentos/{TEST_EQUIPMENT_ID}/intervencoes"
        )
        assert response.status_code in [401, 403], f"Expected 401/403 for unauthenticated request, got {response.status_code}"


class TestOTRelacionadaStillWorks:
    """Verify OT Relacionada feature still works (regression test)"""
    
    def test_relatorios_have_ot_relacionada_fields(self, auth_headers):
        """Test that OTs still include ot_relacionada_id and ot_relacionada_numero"""
        response = requests.get(f"{BASE_URL}/api/relatorios-tecnicos", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Find OT #361 which should have ot_relacionada_id
        ot361 = None
        for ot in data:
            if ot.get("numero_assistencia") == 361:
                ot361 = ot
                break
        
        if ot361:
            # Verify OT #361 references OT #356
            assert "ot_relacionada_id" in ot361, "OT #361 should have ot_relacionada_id field"
            assert ot361.get("ot_relacionada_numero") == 356, "OT #361 should reference OT #356"
            print(f"✓ OT #361 correctly references OT #{ot361.get('ot_relacionada_numero')}")
        else:
            print("Note: OT #361 not found in data (may have been deleted)")
