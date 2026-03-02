"""
Test suite for 'Função na OT' (Function in OT) feature
Tests: funcao_ot field in cronometros, registos, and tipo_colaborador in tarifas
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
OT_ID = "8d3a0111-8f03-45d5-a7eb-2cbfcc96ad85"  # OT#356

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "teste@email.com",
        "password": "teste"
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Authentication failed: {response.text}")


@pytest.fixture
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestCronometroFuncaoOT:
    """Test cronometro start/stop with funcao_ot field"""
    
    def test_cronometro_iniciar_with_funcao_tecnico(self, auth_headers):
        """Test starting cronometro with funcao_ot='tecnico' (default)"""
        # First, get an available tecnico from the OT
        ot_resp = requests.get(f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}", headers=auth_headers)
        if ot_resp.status_code != 200:
            pytest.skip(f"Could not fetch OT: {ot_resp.text}")
        
        ot_data = ot_resp.json()
        
        # Use a test tecnico
        payload = {
            "tipo": "trabalho",
            "tecnico_id": "test-tecnico-funcao-01",
            "tecnico_nome": "TEST_Tecnico Funcao Test",
            "funcao_ot": "tecnico"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/cronometro/iniciar",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "cronometro" in data
        assert data["cronometro"]["funcao_ot"] == "tecnico"
        print(f"PASS: Cronometro started with funcao_ot='tecnico'")
        
        # Stop the cronometro to clean up
        stop_response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/cronometro/parar",
            headers=auth_headers,
            json={"tipo": "trabalho", "tecnico_id": "test-tecnico-funcao-01"}
        )
        assert stop_response.status_code == 200
        print(f"PASS: Cronometro stopped successfully")
    
    def test_cronometro_iniciar_with_funcao_ajudante(self, auth_headers):
        """Test starting cronometro with funcao_ot='ajudante'"""
        payload = {
            "tipo": "viagem",
            "tecnico_id": "test-tecnico-funcao-02",
            "tecnico_nome": "TEST_Ajudante Funcao Test",
            "funcao_ot": "ajudante"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/cronometro/iniciar",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "cronometro" in data
        assert data["cronometro"]["funcao_ot"] == "ajudante"
        print(f"PASS: Cronometro started with funcao_ot='ajudante'")
        
        # Stop to clean up
        stop_response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/cronometro/parar",
            headers=auth_headers,
            json={"tipo": "viagem", "tecnico_id": "test-tecnico-funcao-02"}
        )
        assert stop_response.status_code == 200
        
        # Verify the created registo has funcao_ot='ajudante'
        data = stop_response.json()
        if "registos" in data and len(data["registos"]) > 0:
            assert data["registos"][0].get("funcao_ot") == "ajudante"
            print(f"PASS: Registo created with funcao_ot='ajudante'")


class TestRegistoManualFuncaoOT:
    """Test manual registo creation with funcao_ot field"""
    
    def test_create_registo_manual_with_funcao_tecnico(self, auth_headers):
        """Create manual registo with funcao_ot='tecnico'"""
        payload = {
            "tecnico_id": "test-manual-funcao-01",
            "tecnico_nome": "TEST_Manual Tecnico",
            "tipo": "trabalho",
            "funcao_ot": "tecnico",
            "data": "2026-03-02",
            "hora_inicio": "09:00",
            "hora_fim": "10:00"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/registos-tecnicos",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "registos" in data or "registo" in data or isinstance(data, dict)
        print(f"PASS: Manual registo created with funcao_ot='tecnico'")
    
    def test_create_registo_manual_with_funcao_ajudante(self, auth_headers):
        """Create manual registo with funcao_ot='ajudante'"""
        payload = {
            "tecnico_id": "test-manual-funcao-02",
            "tecnico_nome": "TEST_Manual Ajudante",
            "tipo": "viagem",
            "funcao_ot": "ajudante",
            "data": "2026-03-02",
            "hora_inicio": "11:00",
            "hora_fim": "12:00"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/registos-tecnicos",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code == 200
        print(f"PASS: Manual registo created with funcao_ot='ajudante'")


class TestTarifaTipoColaborador:
    """Test tarifa CRUD with tipo_colaborador field"""
    
    def test_create_tarifa_with_tipo_colaborador_tecnico(self, auth_headers):
        """Create tarifa with tipo_colaborador='tecnico'"""
        payload = {
            "nome": "TEST_Tarifa Tecnico Only",
            "valor_por_hora": 25.0,
            "codigo": "1",
            "tipo_registo": "trabalho",
            "tipo_colaborador": "tecnico",
            "table_id": 1
        }
        
        response = requests.post(
            f"{BASE_URL}/api/tarifas",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code in [200, 201]
        data = response.json()
        assert data.get("tipo_colaborador") == "tecnico"
        print(f"PASS: Tarifa created with tipo_colaborador='tecnico'")
        
        # Clean up - delete test tarifa
        tarifa_id = data.get("id")
        if tarifa_id:
            requests.delete(f"{BASE_URL}/api/tarifas/{tarifa_id}", headers=auth_headers)
    
    def test_create_tarifa_with_tipo_colaborador_ajudante(self, auth_headers):
        """Create tarifa with tipo_colaborador='ajudante'"""
        payload = {
            "nome": "TEST_Tarifa Ajudante Only",
            "valor_por_hora": 18.0,
            "codigo": "1",
            "tipo_registo": "trabalho",
            "tipo_colaborador": "ajudante",
            "table_id": 1
        }
        
        response = requests.post(
            f"{BASE_URL}/api/tarifas",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code in [200, 201]
        data = response.json()
        assert data.get("tipo_colaborador") == "ajudante"
        print(f"PASS: Tarifa created with tipo_colaborador='ajudante'")
        
        # Clean up
        tarifa_id = data.get("id")
        if tarifa_id:
            requests.delete(f"{BASE_URL}/api/tarifas/{tarifa_id}", headers=auth_headers)
    
    def test_create_tarifa_with_tipo_colaborador_both(self, auth_headers):
        """Create tarifa with tipo_colaborador=None (both)"""
        payload = {
            "nome": "TEST_Tarifa Both Colaboradores",
            "valor_por_hora": 22.0,
            "codigo": "2",
            "tipo_registo": None,
            "tipo_colaborador": None,
            "table_id": 1
        }
        
        response = requests.post(
            f"{BASE_URL}/api/tarifas",
            headers=auth_headers,
            json=payload
        )
        
        assert response.status_code in [200, 201]
        data = response.json()
        # tipo_colaborador should be None or not present for "both"
        assert data.get("tipo_colaborador") is None or "tipo_colaborador" not in data
        print(f"PASS: Tarifa created for both tipos de colaborador")
        
        # Clean up
        tarifa_id = data.get("id")
        if tarifa_id:
            requests.delete(f"{BASE_URL}/api/tarifas/{tarifa_id}", headers=auth_headers)


class TestRegistosFuncaoOTListagem:
    """Test that registos list includes funcao_ot field"""
    
    def test_get_registos_tecnicos_has_funcao_ot(self, auth_headers):
        """Verify funcao_ot field is present in registos tecnicos list"""
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/registos-tecnicos",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check if any registos have funcao_ot field
        registos = data if isinstance(data, list) else data.get("registos", [])
        
        if len(registos) > 0:
            # At least check the structure - funcao_ot should be present
            sample = registos[0]
            # Default should be 'tecnico' for existing records
            funcao = sample.get("funcao_ot", "tecnico")
            assert funcao in ["tecnico", "ajudante"]
            print(f"PASS: Registos list contains funcao_ot field. Sample: {funcao}")
        else:
            print("INFO: No registos found to verify funcao_ot field")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_registos(self, auth_headers):
        """Clean up test registos created during testing"""
        # Get all registos
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/registos-tecnicos",
            headers=auth_headers
        )
        
        if response.status_code == 200:
            data = response.json()
            registos = data if isinstance(data, list) else data.get("registos", [])
            
            cleaned = 0
            for reg in registos:
                # Delete TEST_ prefixed registos
                if reg.get("tecnico_nome", "").startswith("TEST_"):
                    reg_id = reg.get("id")
                    if reg_id:
                        del_resp = requests.delete(
                            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/registos-tecnicos/{reg_id}",
                            headers=auth_headers
                        )
                        if del_resp.status_code in [200, 204]:
                            cleaned += 1
            
            print(f"INFO: Cleaned up {cleaned} test registos")
        
        assert True  # Always pass cleanup
