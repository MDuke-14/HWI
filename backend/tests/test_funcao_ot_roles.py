"""
Test suite for the new function/role system migration:
- From 2 roles (Técnico, Ajudante) to 3 roles (Téc. Júnior, Técnico, Téc. Sénior)
- Values stored: 'junior', 'tecnico', 'senior'
- Display labels: 'Téc. Júnior', 'Técnico', 'Téc. Sénior'

Tests:
1. Backend: POST /api/registos-tecnico-ot accepts funcao_ot='junior', 'tecnico', 'senior'
2. Backend: GET /api/tarifas returns tipo_colaborador='junior' for migrated records
3. Backend: POST /api/tarifas with tipo_colaborador='senior' creates tariff correctly
4. Backend: No references to 'ajudante' in API responses
"""

import pytest
import requests
import os

# Get base URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://field-clock.preview.emergentagent.com')

# Test credentials
ADMIN_USERNAME = "pedro"
ADMIN_PASSWORD = "password"

# Existing OT ID for testing
TEST_OT_ID = "6952755f-2fcf-4d34-a90d-38626782bc86"
TABLE_ID = 1


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for API requests"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Authentication failed - skipping authenticated tests")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Return auth headers for requests"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestFuncaoOtRoles:
    """Test the new 3-role system for funcao_ot"""

    def test_health_check(self):
        """Verify API is accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["healthy", "running"]
        print("✓ Health check passed")

    def test_login_admin(self):
        """Test admin login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        print("✓ Admin login successful")

    def test_get_existing_registos(self, auth_headers):
        """Get existing registos-tecnico-ot to verify funcao_ot values"""
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/registos-tecnicos",
            headers=auth_headers
        )
        assert response.status_code in [200, 404]  # 404 if OT has no registos
        if response.status_code == 200:
            registos = response.json()
            print(f"✓ Found {len(registos)} registos in OT")
            # Check that no 'ajudante' values exist
            for r in registos:
                funcao = r.get('funcao_ot', 'tecnico')
                assert funcao != 'ajudante', f"Found deprecated 'ajudante' value in registo {r.get('id')}"
                assert funcao in ['junior', 'tecnico', 'senior'], f"Invalid funcao_ot: {funcao}"
            print("✓ All registos have valid funcao_ot values (no 'ajudante')")
        else:
            print("✓ OT has no registos yet (expected)")

    def test_create_registo_with_junior(self, auth_headers):
        """Test creating a registo with funcao_ot='junior' via registos-tecnicos endpoint"""
        from datetime import datetime
        
        # First get users to get a valid tecnico_id
        users_response = requests.get(f"{BASE_URL}/api/users", headers=auth_headers)
        if users_response.status_code != 200:
            pytest.skip("Could not get users list")
        
        users = users_response.json()
        if not users:
            pytest.skip("No users available for testing")
        
        test_user = users[0]
        
        registo_data = {
            "tecnico_id": test_user["id"],
            "tecnico_nome": test_user.get("full_name", test_user["username"]),
            "tipo": "trabalho",
            "funcao_ot": "junior",  # Test junior role
            "data": datetime.now().strftime("%Y-%m-%d"),
            "hora_inicio": "09:00",
            "hora_fim": "10:00"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/registos-tecnicos",
            json=registo_data,
            headers=auth_headers
        )
        
        # API may return 200 or 201
        assert response.status_code in [200, 201], f"Failed to create registo: {response.text}"
        data = response.json()
        
        # Response format is {message: ..., registos: [...]}
        if "registos" in data:
            registos = data["registos"]
            assert len(registos) > 0, "No registos created"
            assert registos[0].get("funcao_ot") == "junior", f"funcao_ot should be 'junior', got: {registos[0].get('funcao_ot')}"
            print(f"✓ Created registo with funcao_ot='junior': {registos[0].get('id')}")
            # Clean up - delete the test registo
            for r in registos:
                if r.get("id"):
                    requests.delete(
                        f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/registos-tecnicos/{r['id']}",
                        headers=auth_headers
                    )
        elif isinstance(data, dict) and data.get("funcao_ot"):
            assert data.get("funcao_ot") == "junior"
            print(f"✓ Created registo with funcao_ot='junior': {data.get('id')}")
            if data.get("id"):
                requests.delete(
                    f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/registos-tecnicos/{data['id']}",
                    headers=auth_headers
                )
        else:
            print(f"✓ Registo creation accepted (response: {data.get('message', 'OK')})")

    def test_create_registo_with_senior(self, auth_headers):
        """Test creating a registo with funcao_ot='senior' via registos-tecnicos endpoint"""
        from datetime import datetime
        
        users_response = requests.get(f"{BASE_URL}/api/users", headers=auth_headers)
        if users_response.status_code != 200:
            pytest.skip("Could not get users list")
        
        users = users_response.json()
        if not users:
            pytest.skip("No users available for testing")
        
        test_user = users[0]
        
        registo_data = {
            "tecnico_id": test_user["id"],
            "tecnico_nome": test_user.get("full_name", test_user["username"]),
            "tipo": "trabalho",
            "funcao_ot": "senior",  # Test senior role
            "data": datetime.now().strftime("%Y-%m-%d"),
            "hora_inicio": "11:00",
            "hora_fim": "12:00"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/registos-tecnicos",
            json=registo_data,
            headers=auth_headers
        )
        
        assert response.status_code in [200, 201], f"Failed to create registo: {response.text}"
        data = response.json()
        
        # Response format is {message: ..., registos: [...]}
        if "registos" in data:
            registos = data["registos"]
            assert len(registos) > 0, "No registos created"
            assert registos[0].get("funcao_ot") == "senior", f"funcao_ot should be 'senior', got: {registos[0].get('funcao_ot')}"
            print(f"✓ Created registo with funcao_ot='senior': {registos[0].get('id')}")
            # Clean up
            for r in registos:
                if r.get("id"):
                    requests.delete(
                        f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/registos-tecnicos/{r['id']}",
                        headers=auth_headers
                    )
        elif isinstance(data, dict) and data.get("funcao_ot"):
            assert data.get("funcao_ot") == "senior"
            print(f"✓ Created registo with funcao_ot='senior': {data.get('id')}")
            if data.get("id"):
                requests.delete(
                    f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/registos-tecnicos/{data['id']}",
                    headers=auth_headers
                )
        else:
            print(f"✓ Registo creation accepted (response: {data.get('message', 'OK')})")

    def test_create_registo_with_tecnico(self, auth_headers):
        """Test creating a registo with funcao_ot='tecnico' via registos-tecnicos endpoint"""
        from datetime import datetime
        
        users_response = requests.get(f"{BASE_URL}/api/users", headers=auth_headers)
        if users_response.status_code != 200:
            pytest.skip("Could not get users list")
        
        users = users_response.json()
        if not users:
            pytest.skip("No users available for testing")
        
        test_user = users[0]
        
        registo_data = {
            "tecnico_id": test_user["id"],
            "tecnico_nome": test_user.get("full_name", test_user["username"]),
            "tipo": "trabalho",
            "funcao_ot": "tecnico",  # Test tecnico role
            "data": datetime.now().strftime("%Y-%m-%d"),
            "hora_inicio": "14:00",
            "hora_fim": "15:00"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/registos-tecnicos",
            json=registo_data,
            headers=auth_headers
        )
        
        assert response.status_code in [200, 201], f"Failed to create registo: {response.text}"
        data = response.json()
        
        # Response format is {message: ..., registos: [...]}
        if "registos" in data:
            registos = data["registos"]
            assert len(registos) > 0, "No registos created"
            assert registos[0].get("funcao_ot") == "tecnico", f"funcao_ot should be 'tecnico', got: {registos[0].get('funcao_ot')}"
            print(f"✓ Created registo with funcao_ot='tecnico': {registos[0].get('id')}")
            # Clean up
            for r in registos:
                if r.get("id"):
                    requests.delete(
                        f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/registos-tecnicos/{r['id']}",
                        headers=auth_headers
                    )
        elif isinstance(data, dict) and data.get("funcao_ot"):
            assert data.get("funcao_ot") == "tecnico"
            print(f"✓ Created registo with funcao_ot='tecnico': {data.get('id')}")
            if data.get("id"):
                requests.delete(
                    f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/registos-tecnicos/{data['id']}",
                    headers=auth_headers
                )
        else:
            print(f"✓ Registo creation accepted (response: {data.get('message', 'OK')})")



class TestTarifasWithTipoColaborador:
    """Test tarifas with the new tipo_colaborador values"""

    def test_get_tarifas_no_ajudante(self, auth_headers):
        """Verify GET /api/tarifas returns no 'ajudante' values"""
        response = requests.get(f"{BASE_URL}/api/tarifas/all", headers=auth_headers)
        assert response.status_code == 200
        
        tarifas = response.json()
        print(f"✓ Found {len(tarifas)} tarifas")
        
        for tarifa in tarifas:
            tipo_colab = tarifa.get("tipo_colaborador")
            if tipo_colab:
                assert tipo_colab != "ajudante", f"Found deprecated 'ajudante' in tarifa {tarifa.get('id')}"
                assert tipo_colab in ["junior", "tecnico", "senior"], f"Invalid tipo_colaborador: {tipo_colab}"
        
        print("✓ All tarifas have valid tipo_colaborador values (no 'ajudante')")

    def test_get_tarifas_by_table(self, auth_headers):
        """Get tarifas filtered by table_id"""
        response = requests.get(f"{BASE_URL}/api/tarifas?table_id={TABLE_ID}", headers=auth_headers)
        assert response.status_code == 200
        
        tarifas = response.json()
        print(f"✓ Found {len(tarifas)} tarifas for table_id={TABLE_ID}")
        
        # Verify all returned tarifas belong to the requested table
        for tarifa in tarifas:
            assert tarifa.get("table_id") == TABLE_ID
            # Also verify no ajudante
            tipo_colab = tarifa.get("tipo_colaborador")
            if tipo_colab:
                assert tipo_colab != "ajudante"
        
        print("✓ All tarifas are from correct table and have valid tipo_colaborador")

    def test_create_tarifa_with_junior(self, auth_headers):
        """Test creating a tarifa with tipo_colaborador='junior'"""
        tarifa_data = {
            "nome": "TEST Tarifa Junior",
            "valor_por_hora": 12.50,
            "codigo": "1",
            "tipo_registo": "trabalho",
            "tipo_colaborador": "junior",
            "table_id": TABLE_ID
        }
        
        response = requests.post(
            f"{BASE_URL}/api/tarifas",
            json=tarifa_data,
            headers=auth_headers
        )
        
        assert response.status_code in [200, 201], f"Failed to create tarifa: {response.text}"
        data = response.json()
        
        assert data.get("tipo_colaborador") == "junior"
        print(f"✓ Created tarifa with tipo_colaborador='junior': {data.get('id')}")
        
        # Clean up - delete the test tarifa
        if data.get("id"):
            requests.delete(f"{BASE_URL}/api/tarifas/{data['id']}", headers=auth_headers)

    def test_create_tarifa_with_senior(self, auth_headers):
        """Test creating a tarifa with tipo_colaborador='senior'"""
        tarifa_data = {
            "nome": "TEST Tarifa Senior",
            "valor_por_hora": 25.00,
            "codigo": "1",
            "tipo_registo": "trabalho",
            "tipo_colaborador": "senior",
            "table_id": TABLE_ID
        }
        
        response = requests.post(
            f"{BASE_URL}/api/tarifas",
            json=tarifa_data,
            headers=auth_headers
        )
        
        assert response.status_code in [200, 201], f"Failed to create tarifa: {response.text}"
        data = response.json()
        
        assert data.get("tipo_colaborador") == "senior"
        print(f"✓ Created tarifa with tipo_colaborador='senior': {data.get('id')}")
        
        # Clean up
        if data.get("id"):
            requests.delete(f"{BASE_URL}/api/tarifas/{data['id']}", headers=auth_headers)

    def test_create_tarifa_with_tecnico(self, auth_headers):
        """Test creating a tarifa with tipo_colaborador='tecnico'"""
        tarifa_data = {
            "nome": "TEST Tarifa Tecnico",
            "valor_por_hora": 18.00,
            "codigo": "1",
            "tipo_registo": "trabalho",
            "tipo_colaborador": "tecnico",
            "table_id": TABLE_ID
        }
        
        response = requests.post(
            f"{BASE_URL}/api/tarifas",
            json=tarifa_data,
            headers=auth_headers
        )
        
        assert response.status_code in [200, 201], f"Failed to create tarifa: {response.text}"
        data = response.json()
        
        assert data.get("tipo_colaborador") == "tecnico"
        print(f"✓ Created tarifa with tipo_colaborador='tecnico': {data.get('id')}")
        
        # Clean up
        if data.get("id"):
            requests.delete(f"{BASE_URL}/api/tarifas/{data['id']}", headers=auth_headers)


class TestTecnicoManualRegistration:
    """Test the tecnicos (manual) endpoint for funcao_ot support"""
    
    def test_add_tecnico_manual_with_junior(self, auth_headers):
        """Test adding a tecnico manual with funcao_ot='junior'"""
        from datetime import datetime
        
        # Get users
        users_response = requests.get(f"{BASE_URL}/api/users", headers=auth_headers)
        if users_response.status_code != 200:
            pytest.skip("Could not get users list")
        
        users = users_response.json()
        if not users:
            pytest.skip("No users available for testing")
        
        test_user = users[0]
        
        tecnico_data = {
            "tecnico_id": test_user["id"],
            "tecnico_nome": test_user.get("full_name", test_user["username"]),
            "minutos_cliente": 60,
            "kms_inicial": 0,
            "kms_final": 0,
            "tipo_horario": "diurno",
            "tipo_registo": "manual",
            "data_trabalho": datetime.now().strftime("%Y-%m-%d"),
            "hora_inicio": "09:00",
            "hora_fim": "10:00",
            "funcao_ot": "junior"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/tecnicos",
            json=tecnico_data,
            headers=auth_headers
        )
        
        assert response.status_code in [200, 201], f"Failed to add tecnico: {response.text}"
        data = response.json()
        
        # The response could be the tecnico object or a list of registos
        if isinstance(data, dict):
            if "funcao_ot" in data:
                assert data["funcao_ot"] == "junior"
            print(f"✓ Added tecnico with funcao_ot='junior'")
            # Clean up
            if data.get("id"):
                requests.delete(
                    f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/tecnicos/{data['id']}",
                    headers=auth_headers
                )
        elif isinstance(data, list):
            print(f"✓ Added tecnico (segmented into {len(data)} registos)")
            for r in data:
                if r.get("id"):
                    requests.delete(
                        f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/registos/{r['id']}",
                        headers=auth_headers
                    )
        else:
            print(f"✓ Tecnico added successfully")


class TestFolhaHorasData:
    """Test that folha-horas-data returns correct funcao_ot labels"""
    
    def test_folha_horas_data_endpoint(self, auth_headers):
        """Test GET /api/relatorios-tecnicos/{id}/folha-horas-data returns valid data"""
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/folha-horas-data",
            headers=auth_headers
        )
        
        # May return 200 or 404 if OT doesn't exist
        if response.status_code == 404:
            pytest.skip("Test OT not found")
        
        assert response.status_code == 200, f"Unexpected status: {response.status_code}, {response.text}"
        data = response.json()
        
        # Check registos for funcao_ot values
        registos = data.get("registos", [])
        registos_individuais = data.get("registos_individuais", [])
        tecnicos_manuais = data.get("tecnicos_manuais", [])
        
        all_items = registos + registos_individuais + tecnicos_manuais
        
        for item in all_items:
            funcao = item.get("funcao_ot", "tecnico")
            assert funcao != "ajudante", f"Found deprecated 'ajudante' in folha-horas-data"
            assert funcao in ["junior", "tecnico", "senior"], f"Invalid funcao_ot: {funcao}"
        
        print(f"✓ folha-horas-data returns {len(all_items)} items, all with valid funcao_ot")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
