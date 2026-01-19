"""
Test Equipment Dropdown Feature for OT (Ordem de Trabalho)
Tests the new functionality where:
1. When adding equipment to an OT, a dropdown appears with client's existing equipment
2. First option is "Criar novo equipamento" (Create new equipment)
3. Selecting existing equipment auto-fills the form fields
4. Creating new equipment also saves it to the client's equipment database
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestEquipmentDropdownFeature:
    """Test suite for equipment dropdown in OT modal"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with admin credentials
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "pedro",
            "password": "password"
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
        
        token = login_response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Store test data for cleanup
        self.created_equipment_ids = []
        self.created_ot_ids = []
        
        yield
        
        # Cleanup - delete test data
        for eq_id in self.created_equipment_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/equipamentos/{eq_id}")
            except:
                pass
    
    def test_01_get_clientes_list(self):
        """Test that we can get list of clients"""
        response = self.session.get(f"{BASE_URL}/api/clientes")
        assert response.status_code == 200, f"Failed to get clients: {response.text}"
        
        clients = response.json()
        assert isinstance(clients, list), "Response should be a list"
        print(f"✓ Found {len(clients)} clients")
        
        if len(clients) > 0:
            self.test_client = clients[0]
            print(f"  Using client: {self.test_client.get('nome')} (ID: {self.test_client.get('id')})")
    
    def test_02_get_client_equipment(self):
        """Test GET /api/equipamentos?cliente_id=... returns client's equipment"""
        # First get a client
        clients_response = self.session.get(f"{BASE_URL}/api/clientes")
        assert clients_response.status_code == 200
        
        clients = clients_response.json()
        if len(clients) == 0:
            pytest.skip("No clients available for testing")
        
        client_id = clients[0]["id"]
        
        # Get equipment for this client
        response = self.session.get(f"{BASE_URL}/api/equipamentos?cliente_id={client_id}")
        assert response.status_code == 200, f"Failed to get equipment: {response.text}"
        
        equipment = response.json()
        assert isinstance(equipment, list), "Response should be a list"
        print(f"✓ Client has {len(equipment)} equipment(s)")
        
        # Verify equipment structure if any exist
        if len(equipment) > 0:
            eq = equipment[0]
            assert "id" in eq, "Equipment should have id"
            assert "marca" in eq, "Equipment should have marca"
            assert "modelo" in eq, "Equipment should have modelo"
            print(f"  Sample equipment: {eq.get('marca')} {eq.get('modelo')}")
    
    def test_03_get_ot_list(self):
        """Test that we can get list of OTs (Ordens de Trabalho)"""
        response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos")
        assert response.status_code == 200, f"Failed to get OTs: {response.text}"
        
        ots = response.json()
        assert isinstance(ots, list), "Response should be a list"
        print(f"✓ Found {len(ots)} OTs")
        
        if len(ots) > 0:
            ot = ots[0]
            print(f"  Sample OT: #{ot.get('numero_assistencia')} - {ot.get('cliente_nome')}")
    
    def test_04_get_ot_equipment(self):
        """Test GET /api/relatorios-tecnicos/{id}/equipamentos returns OT's equipment"""
        # Get an OT first
        ots_response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos")
        assert ots_response.status_code == 200
        
        ots = ots_response.json()
        if len(ots) == 0:
            pytest.skip("No OTs available for testing")
        
        ot_id = ots[0]["id"]
        
        # Get equipment for this OT
        response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{ot_id}/equipamentos")
        assert response.status_code == 200, f"Failed to get OT equipment: {response.text}"
        
        equipment = response.json()
        assert isinstance(equipment, list), "Response should be a list"
        print(f"✓ OT has {len(equipment)} equipment(s)")
    
    def test_05_add_existing_equipment_to_ot(self):
        """Test adding an existing equipment to OT (criar_na_base_cliente=False)"""
        # Get an OT
        ots_response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos")
        ots = ots_response.json()
        if len(ots) == 0:
            pytest.skip("No OTs available for testing")
        
        ot = ots[0]
        ot_id = ot["id"]
        
        # Add equipment (simulating selecting existing equipment - no criar_na_base_cliente flag)
        equipment_data = {
            "tipologia": "TEST_Impressora",
            "marca": "TEST_HP",
            "modelo": "TEST_LaserJet Pro",
            "numero_serie": "TEST_SN123456",
            "ano_fabrico": "2023",
            "criar_na_base_cliente": False  # Existing equipment, don't create in client DB
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{ot_id}/equipamentos",
            json=equipment_data
        )
        
        assert response.status_code == 200, f"Failed to add equipment: {response.text}"
        
        result = response.json()
        assert result.get("marca") == "TEST_HP", "Equipment marca should match"
        assert result.get("modelo") == "TEST_LaserJet Pro", "Equipment modelo should match"
        print(f"✓ Added existing equipment to OT #{ot.get('numero_assistencia')}")
        
        # Verify it was added to OT
        ot_equipment = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{ot_id}/equipamentos")
        assert ot_equipment.status_code == 200
        
        equipment_list = ot_equipment.json()
        found = any(eq.get("marca") == "TEST_HP" and eq.get("modelo") == "TEST_LaserJet Pro" for eq in equipment_list)
        assert found, "Equipment should be in OT's equipment list"
        print(f"✓ Equipment verified in OT's equipment list")
    
    def test_06_add_new_equipment_to_ot_and_client_db(self):
        """Test adding NEW equipment to OT with criar_na_base_cliente=True"""
        # Get an OT with a client
        ots_response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos")
        ots = ots_response.json()
        if len(ots) == 0:
            pytest.skip("No OTs available for testing")
        
        ot = ots[0]
        ot_id = ot["id"]
        client_id = ot.get("cliente_id")
        
        if not client_id:
            pytest.skip("OT has no client_id")
        
        # Get current client equipment count
        before_response = self.session.get(f"{BASE_URL}/api/equipamentos?cliente_id={client_id}")
        before_count = len(before_response.json()) if before_response.status_code == 200 else 0
        
        # Add NEW equipment with criar_na_base_cliente=True
        unique_serial = f"TEST_NEW_SN_{os.urandom(4).hex()}"
        equipment_data = {
            "tipologia": "TEST_Servidor",
            "marca": "TEST_Dell",
            "modelo": "TEST_PowerEdge R740",
            "numero_serie": unique_serial,
            "ano_fabrico": "2024",
            "criar_na_base_cliente": True  # NEW equipment, should create in client DB
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{ot_id}/equipamentos",
            json=equipment_data
        )
        
        assert response.status_code == 200, f"Failed to add new equipment: {response.text}"
        print(f"✓ Added new equipment to OT #{ot.get('numero_assistencia')}")
        
        # Verify it was also added to client's equipment database
        after_response = self.session.get(f"{BASE_URL}/api/equipamentos?cliente_id={client_id}")
        assert after_response.status_code == 200
        
        after_equipment = after_response.json()
        after_count = len(after_equipment)
        
        # Check if the new equipment exists in client's database
        found_in_client_db = any(
            eq.get("marca") == "TEST_Dell" and 
            eq.get("modelo") == "TEST_PowerEdge R740" and
            eq.get("numero_serie") == unique_serial
            for eq in after_equipment
        )
        
        assert found_in_client_db, "New equipment should be saved in client's equipment database"
        print(f"✓ New equipment verified in client's equipment database")
        print(f"  Client equipment count: {before_count} -> {after_count}")
    
    def test_07_equipment_fields_structure(self):
        """Test that equipment has all required fields for dropdown display"""
        # Get a client with equipment
        clients_response = self.session.get(f"{BASE_URL}/api/clientes")
        clients = clients_response.json()
        
        for client in clients:
            eq_response = self.session.get(f"{BASE_URL}/api/equipamentos?cliente_id={client['id']}")
            if eq_response.status_code == 200:
                equipment = eq_response.json()
                if len(equipment) > 0:
                    eq = equipment[0]
                    
                    # Verify required fields for dropdown
                    assert "id" in eq, "Equipment must have 'id' for dropdown value"
                    assert "marca" in eq, "Equipment must have 'marca' for dropdown display"
                    assert "modelo" in eq, "Equipment must have 'modelo' for dropdown display"
                    
                    # Optional fields
                    has_numero_serie = "numero_serie" in eq
                    has_tipologia = "tipologia" in eq
                    has_ano_fabrico = "ano_fabrico" in eq
                    
                    print(f"✓ Equipment structure verified:")
                    print(f"  - id: {eq.get('id')[:8]}...")
                    print(f"  - marca: {eq.get('marca')}")
                    print(f"  - modelo: {eq.get('modelo')}")
                    print(f"  - numero_serie: {eq.get('numero_serie', 'N/A')}")
                    print(f"  - tipologia: {eq.get('tipologia', 'N/A')}")
                    print(f"  - ano_fabrico: {eq.get('ano_fabrico', 'N/A')}")
                    return
        
        print("⚠ No equipment found to verify structure (test passed but no data)")


class TestEquipmentDropdownEdgeCases:
    """Edge case tests for equipment dropdown"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "pedro",
            "password": "password"
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        token = login_response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_empty_client_equipment_list(self):
        """Test that API handles clients with no equipment gracefully"""
        # Use a non-existent client ID
        response = self.session.get(f"{BASE_URL}/api/equipamentos?cliente_id=non_existent_id")
        assert response.status_code == 200, "Should return 200 even for non-existent client"
        
        equipment = response.json()
        assert equipment == [], "Should return empty list for non-existent client"
        print("✓ Empty equipment list handled correctly")
    
    def test_duplicate_equipment_prevention(self):
        """Test that duplicate equipment is not created in client DB"""
        # Get an OT
        ots_response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos")
        ots = ots_response.json()
        if len(ots) == 0:
            pytest.skip("No OTs available")
        
        ot = ots[0]
        ot_id = ot["id"]
        client_id = ot.get("cliente_id")
        
        if not client_id:
            pytest.skip("OT has no client_id")
        
        # Add same equipment twice with criar_na_base_cliente=True
        equipment_data = {
            "tipologia": "TEST_Duplicate",
            "marca": "TEST_DuplicateBrand",
            "modelo": "TEST_DuplicateModel",
            "numero_serie": "TEST_DUP_SN001",
            "ano_fabrico": "2024",
            "criar_na_base_cliente": True
        }
        
        # First add
        self.session.post(f"{BASE_URL}/api/relatorios-tecnicos/{ot_id}/equipamentos", json=equipment_data)
        
        # Get count after first add
        after_first = self.session.get(f"{BASE_URL}/api/equipamentos?cliente_id={client_id}")
        count_after_first = len([eq for eq in after_first.json() if eq.get("marca") == "TEST_DuplicateBrand"])
        
        # Second add (same equipment)
        self.session.post(f"{BASE_URL}/api/relatorios-tecnicos/{ot_id}/equipamentos", json=equipment_data)
        
        # Get count after second add
        after_second = self.session.get(f"{BASE_URL}/api/equipamentos?cliente_id={client_id}")
        count_after_second = len([eq for eq in after_second.json() if eq.get("marca") == "TEST_DuplicateBrand"])
        
        # Should not create duplicate in client DB
        assert count_after_second == count_after_first, "Should not create duplicate equipment in client DB"
        print(f"✓ Duplicate prevention working (count stayed at {count_after_first})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
