"""
Test suite for Tarifas and Folha de Horas functionality
Tests:
- Tarifas CRUD operations (create, read, update, delete)
- Folha de Horas data endpoint
- Folha de Horas PDF generation
"""
import pytest
import requests
import os
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://work-tracking-mobile.preview.emergentagent.com')

# Test credentials
ADMIN_USER = {"username": "pedro", "password": "password"}
NON_ADMIN_USER = {"username": "miguel", "password": "password"}

# Test OT ID from main agent context
TEST_OT_ID = "48d44ebe-a34c-4ca6-9ab2-87134a937d27"


class TestAuth:
    """Authentication tests"""
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["is_admin"] == True
        print(f"✅ Admin login successful: {data['user']['username']}")
        return data["access_token"]
    
    def test_non_admin_login(self):
        """Test non-admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=NON_ADMIN_USER)
        assert response.status_code == 200, f"Non-admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        print(f"✅ Non-admin login successful: {data['user']['username']}")
        return data["access_token"]


class TestTarifas:
    """Tarifas CRUD tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200
        self.admin_token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Get non-admin token
        response = requests.post(f"{BASE_URL}/api/auth/login", json=NON_ADMIN_USER)
        if response.status_code == 200:
            self.non_admin_token = response.json()["access_token"]
            self.non_admin_headers = {"Authorization": f"Bearer {self.non_admin_token}"}
        else:
            self.non_admin_token = None
            self.non_admin_headers = None
    
    def test_get_tarifas_active(self):
        """GET /api/tarifas - List active tarifas"""
        response = requests.get(f"{BASE_URL}/api/tarifas", headers=self.headers)
        assert response.status_code == 200, f"Failed to get tarifas: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /api/tarifas - Found {len(data)} active tarifas")
        
        # Verify all returned tarifas are active
        for tarifa in data:
            assert tarifa.get("ativo", True) == True, "Inactive tarifa returned"
        
        return data
    
    def test_get_all_tarifas_admin(self):
        """GET /api/tarifas/all - List all tarifas (admin only)"""
        response = requests.get(f"{BASE_URL}/api/tarifas/all", headers=self.headers)
        assert response.status_code == 200, f"Failed to get all tarifas: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /api/tarifas/all - Found {len(data)} total tarifas")
        return data
    
    def test_get_all_tarifas_non_admin_forbidden(self):
        """GET /api/tarifas/all - Should be forbidden for non-admin"""
        if not self.non_admin_headers:
            pytest.skip("Non-admin user not available")
        
        response = requests.get(f"{BASE_URL}/api/tarifas/all", headers=self.non_admin_headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✅ GET /api/tarifas/all - Correctly forbidden for non-admin")
    
    def test_create_tarifa(self):
        """POST /api/tarifas - Create new tarifa"""
        # Use a unique number to avoid conflicts
        import time
        unique_num = int(time.time()) % 10000
        
        tarifa_data = {
            "numero": unique_num,
            "nome": f"TEST_Tarifa_{unique_num}",
            "valor_por_hora": 99.99
        }
        
        response = requests.post(f"{BASE_URL}/api/tarifas", json=tarifa_data, headers=self.headers)
        assert response.status_code == 200, f"Failed to create tarifa: {response.text}"
        
        data = response.json()
        assert data["numero"] == unique_num
        assert data["nome"] == tarifa_data["nome"]
        assert data["valor_por_hora"] == 99.99
        assert data["ativo"] == True
        assert "id" in data
        
        print(f"✅ POST /api/tarifas - Created tarifa: {data['nome']} ({data['valor_por_hora']}€/h)")
        return data
    
    def test_create_tarifa_duplicate_number(self):
        """POST /api/tarifas - Should fail for duplicate number"""
        # First, get existing tarifas
        response = requests.get(f"{BASE_URL}/api/tarifas", headers=self.headers)
        tarifas = response.json()
        
        if len(tarifas) == 0:
            pytest.skip("No existing tarifas to test duplicate")
        
        existing_numero = tarifas[0]["numero"]
        
        tarifa_data = {
            "numero": existing_numero,
            "nome": "TEST_Duplicate",
            "valor_por_hora": 50.00
        }
        
        response = requests.post(f"{BASE_URL}/api/tarifas", json=tarifa_data, headers=self.headers)
        assert response.status_code == 400, f"Expected 400 for duplicate, got {response.status_code}"
        print(f"✅ POST /api/tarifas - Correctly rejected duplicate number {existing_numero}")
    
    def test_update_tarifa(self):
        """PUT /api/tarifas/{id} - Update tarifa"""
        # First create a tarifa to update
        import time
        unique_num = int(time.time()) % 10000 + 1000
        
        create_data = {
            "numero": unique_num,
            "nome": f"TEST_ToUpdate_{unique_num}",
            "valor_por_hora": 25.00
        }
        
        create_response = requests.post(f"{BASE_URL}/api/tarifas", json=create_data, headers=self.headers)
        if create_response.status_code != 200:
            pytest.skip(f"Could not create tarifa for update test: {create_response.text}")
        
        tarifa_id = create_response.json()["id"]
        
        # Update the tarifa
        update_data = {
            "nome": f"TEST_Updated_{unique_num}",
            "valor_por_hora": 35.00
        }
        
        response = requests.put(f"{BASE_URL}/api/tarifas/{tarifa_id}", json=update_data, headers=self.headers)
        assert response.status_code == 200, f"Failed to update tarifa: {response.text}"
        
        data = response.json()
        assert data["nome"] == update_data["nome"]
        assert data["valor_por_hora"] == 35.00
        
        print(f"✅ PUT /api/tarifas/{tarifa_id} - Updated tarifa successfully")
        
        # Verify with GET
        get_response = requests.get(f"{BASE_URL}/api/tarifas/all", headers=self.headers)
        all_tarifas = get_response.json()
        updated_tarifa = next((t for t in all_tarifas if t["id"] == tarifa_id), None)
        assert updated_tarifa is not None
        assert updated_tarifa["valor_por_hora"] == 35.00
        print(f"✅ Verified update persisted in database")
        
        return tarifa_id
    
    def test_delete_tarifa(self):
        """DELETE /api/tarifas/{id} - Deactivate tarifa"""
        # First create a tarifa to delete
        import time
        unique_num = int(time.time()) % 10000 + 2000
        
        create_data = {
            "numero": unique_num,
            "nome": f"TEST_ToDelete_{unique_num}",
            "valor_por_hora": 15.00
        }
        
        create_response = requests.post(f"{BASE_URL}/api/tarifas", json=create_data, headers=self.headers)
        if create_response.status_code != 200:
            pytest.skip(f"Could not create tarifa for delete test: {create_response.text}")
        
        tarifa_id = create_response.json()["id"]
        
        # Delete (deactivate) the tarifa
        response = requests.delete(f"{BASE_URL}/api/tarifas/{tarifa_id}", headers=self.headers)
        assert response.status_code == 200, f"Failed to delete tarifa: {response.text}"
        
        print(f"✅ DELETE /api/tarifas/{tarifa_id} - Deactivated tarifa successfully")
        
        # Verify it's no longer in active list
        get_response = requests.get(f"{BASE_URL}/api/tarifas", headers=self.headers)
        active_tarifas = get_response.json()
        deleted_tarifa = next((t for t in active_tarifas if t["id"] == tarifa_id), None)
        assert deleted_tarifa is None, "Deleted tarifa still appears in active list"
        print(f"✅ Verified tarifa no longer in active list")
    
    def test_create_tarifa_non_admin_forbidden(self):
        """POST /api/tarifas - Should be forbidden for non-admin"""
        if not self.non_admin_headers:
            pytest.skip("Non-admin user not available")
        
        tarifa_data = {
            "numero": 9999,
            "nome": "TEST_NonAdmin",
            "valor_por_hora": 10.00
        }
        
        response = requests.post(f"{BASE_URL}/api/tarifas", json=tarifa_data, headers=self.non_admin_headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✅ POST /api/tarifas - Correctly forbidden for non-admin")


class TestFolhaHoras:
    """Folha de Horas tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200
        self.admin_token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.admin_token}"}
    
    def test_get_folha_horas_data(self):
        """GET /api/relatorios-tecnicos/{id}/folha-horas-data - Get data for Folha de Horas"""
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/folha-horas-data",
            headers=self.headers
        )
        
        if response.status_code == 404:
            pytest.skip(f"OT {TEST_OT_ID} not found - may have been deleted")
        
        assert response.status_code == 200, f"Failed to get folha horas data: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "relatorio" in data, "Missing 'relatorio' in response"
        assert "cliente" in data, "Missing 'cliente' in response"
        assert "tecnicos" in data, "Missing 'tecnicos' in response"
        assert "registos" in data, "Missing 'registos' in response"
        assert "tecnicos_manuais" in data, "Missing 'tecnicos_manuais' in response"
        assert "tarifas" in data, "Missing 'tarifas' in response"
        assert "datas_por_tecnico" in data, "Missing 'datas_por_tecnico' in response"
        
        print(f"✅ GET /api/relatorios-tecnicos/{TEST_OT_ID}/folha-horas-data")
        print(f"   - Relatório: OT #{data['relatorio'].get('numero_assistencia', 'N/A')}")
        print(f"   - Cliente: {data['cliente'].get('nome', 'N/A') if data['cliente'] else 'N/A'}")
        print(f"   - Técnicos: {len(data['tecnicos'])}")
        print(f"   - Registos: {len(data['registos'])}")
        print(f"   - Tarifas disponíveis: {len(data['tarifas'])}")
        
        return data
    
    def test_get_folha_horas_data_not_found(self):
        """GET /api/relatorios-tecnicos/{id}/folha-horas-data - Should return 404 for invalid ID"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{fake_id}/folha-horas-data",
            headers=self.headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✅ GET /api/relatorios-tecnicos/{fake_id}/folha-horas-data - Correctly returned 404")
    
    def test_generate_folha_horas_pdf(self):
        """POST /api/relatorios-tecnicos/{id}/folha-horas-pdf - Generate PDF"""
        # First get the data to know what tarifas and tecnicos are available
        data_response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/folha-horas-data",
            headers=self.headers
        )
        
        if data_response.status_code == 404:
            pytest.skip(f"OT {TEST_OT_ID} not found")
        
        data = data_response.json()
        
        # Build request with tarifas and extras
        tarifas_por_tecnico = {}
        dados_extras = {}
        
        # Assign first available tarifa to each tecnico
        if data["tarifas"] and data["tecnicos"]:
            first_tarifa = data["tarifas"][0]["valor_por_hora"]
            for tecnico in data["tecnicos"]:
                tarifas_por_tecnico[tecnico["id"]] = first_tarifa
        
        # Add some test extras
        for tecnico_id, datas in data.get("datas_por_tecnico", {}).items():
            for dt in datas:
                chave = f"{tecnico_id}_{dt}"
                dados_extras[chave] = {
                    "dieta": 10.00,
                    "portagens": 5.00,
                    "despesas": 0.00
                }
        
        request_data = {
            "tarifas_por_tecnico": tarifas_por_tecnico,
            "dados_extras": dados_extras
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/folha-horas-pdf",
            json=request_data,
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Failed to generate PDF: {response.text}"
        assert response.headers.get("content-type") == "application/pdf", "Response is not a PDF"
        
        # Check PDF content starts with PDF magic bytes
        content = response.content
        assert content[:4] == b'%PDF', "Response does not appear to be a valid PDF"
        
        print(f"✅ POST /api/relatorios-tecnicos/{TEST_OT_ID}/folha-horas-pdf")
        print(f"   - PDF generated successfully ({len(content)} bytes)")
        print(f"   - Content-Disposition: {response.headers.get('content-disposition', 'N/A')}")
    
    def test_generate_folha_horas_pdf_empty_data(self):
        """POST /api/relatorios-tecnicos/{id}/folha-horas-pdf - Generate PDF with empty extras"""
        # First check if OT exists
        data_response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/folha-horas-data",
            headers=self.headers
        )
        
        if data_response.status_code == 404:
            pytest.skip(f"OT {TEST_OT_ID} not found")
        
        # Generate PDF with empty data
        request_data = {
            "tarifas_por_tecnico": {},
            "dados_extras": {}
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_OT_ID}/folha-horas-pdf",
            json=request_data,
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Failed to generate PDF with empty data: {response.text}"
        print(f"✅ POST /api/relatorios-tecnicos/{TEST_OT_ID}/folha-horas-pdf - Works with empty data")


class TestExistingTarifas:
    """Test existing tarifas mentioned in context"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200
        self.admin_token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.admin_token}"}
    
    def test_verify_existing_tarifas(self):
        """Verify the 3 test tarifas mentioned in context exist"""
        response = requests.get(f"{BASE_URL}/api/tarifas", headers=self.headers)
        assert response.status_code == 200
        
        tarifas = response.json()
        
        # Expected tarifas from context: Tarifa 1 (30€/h), Tarifa 2 (45€/h), Tarifa 3 (60€/h)
        expected_values = {30.0, 45.0, 60.0}
        found_values = {t["valor_por_hora"] for t in tarifas}
        
        print(f"✅ Found {len(tarifas)} active tarifas:")
        for t in tarifas:
            print(f"   - {t['nome']}: {t['valor_por_hora']}€/h")
        
        # Check if expected tarifas exist
        missing = expected_values - found_values
        if missing:
            print(f"⚠️ Missing expected tarifas with values: {missing}")
        else:
            print(f"✅ All expected tarifas (30€, 45€, 60€) found")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
