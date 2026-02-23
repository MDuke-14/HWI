"""
Test Suite for Tabela de Preço (Price Table) System
Tests: 
- GET /api/tabelas-preco - List 3 price tables
- PUT /api/tabelas-preco/{table_id} - Update price table config (valor_km)
- GET /api/tarifas - List active tarifas
- GET /api/tarifas/all - List all tarifas (admin)
- POST /api/tarifas - Create new tarifa
- PUT /api/tarifas/{tarifa_id} - Update tarifa
- DELETE /api/tarifas/{tarifa_id} - Deactivate tarifa
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "pedro",
            "password": "password"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}"}


class TestTabelasPreco(TestAuth):
    """Tabelas de Preço (Price Tables) API Tests"""
    
    def test_get_tabelas_preco(self, auth_headers):
        """GET /api/tabelas-preco should return 3 price tables"""
        response = requests.get(f"{BASE_URL}/api/tabelas-preco", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) == 3, "Should have exactly 3 price tables"
        
        # Verify each table has required fields
        for tabela in data:
            assert "table_id" in tabela, "Table should have table_id"
            assert "valor_km" in tabela, "Table should have valor_km"
            assert "nome" in tabela, "Table should have nome"
            assert tabela["table_id"] in [1, 2, 3], f"Invalid table_id: {tabela['table_id']}"
        
        # Verify tables are ordered by table_id
        table_ids = [t["table_id"] for t in data]
        assert table_ids == [1, 2, 3], f"Tables should be ordered 1, 2, 3. Got: {table_ids}"
        
        print(f"✓ Found {len(data)} price tables: {[t['nome'] for t in data]}")
        return data
    
    def test_update_tabela_preco(self, auth_headers):
        """PUT /api/tabelas-preco/{table_id} should update table config"""
        table_id = 1
        new_valor_km = 0.75
        new_nome = "TEST_Tabela Standard"
        
        # Update table 1
        response = requests.put(
            f"{BASE_URL}/api/tabelas-preco/{table_id}",
            headers=auth_headers,
            json={"valor_km": new_valor_km, "nome": new_nome}
        )
        assert response.status_code == 200, f"Failed to update: {response.text}"
        
        updated = response.json()
        assert updated["valor_km"] == new_valor_km, f"valor_km mismatch: {updated['valor_km']}"
        assert updated["nome"] == new_nome, f"nome mismatch: {updated['nome']}"
        
        # Verify persistence - GET to confirm
        get_response = requests.get(f"{BASE_URL}/api/tabelas-preco", headers=auth_headers)
        assert get_response.status_code == 200
        
        tables = get_response.json()
        table_1 = next((t for t in tables if t["table_id"] == 1), None)
        assert table_1 is not None, "Table 1 not found"
        assert table_1["valor_km"] == new_valor_km, "Update not persisted"
        
        print(f"✓ Updated Table {table_id}: valor_km={new_valor_km}, nome={new_nome}")
        
        # Cleanup - restore original value
        requests.put(
            f"{BASE_URL}/api/tabelas-preco/{table_id}",
            headers=auth_headers,
            json={"valor_km": 0.65, "nome": "Tabela 1"}
        )
    
    def test_update_invalid_table_id(self, auth_headers):
        """PUT /api/tabelas-preco/{invalid_id} should return 400"""
        response = requests.put(
            f"{BASE_URL}/api/tabelas-preco/999",
            headers=auth_headers,
            json={"valor_km": 0.50}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Invalid table_id correctly rejected")


class TestTarifas(TestAuth):
    """Tarifas (Rates) API Tests"""
    
    created_tarifa_id = None
    
    def test_get_tarifas(self, auth_headers):
        """GET /api/tarifas should return active tarifas"""
        response = requests.get(f"{BASE_URL}/api/tarifas", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # All returned tarifas should be active (ativo=True)
        for tarifa in data:
            assert tarifa.get("ativo", True) is True, "Only active tarifas should be returned"
            assert "table_id" in tarifa, "Tarifa should have table_id"
        
        print(f"✓ Found {len(data)} active tarifas")
        return data
    
    def test_get_tarifas_filtered_by_table(self, auth_headers):
        """GET /api/tarifas?table_id=X should filter by table"""
        response = requests.get(f"{BASE_URL}/api/tarifas?table_id=1", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        for tarifa in data:
            assert tarifa.get("table_id", 1) == 1, f"Tarifa should be from table 1, got {tarifa.get('table_id')}"
        
        print(f"✓ Filtered tarifas: {len(data)} from table 1")
    
    def test_get_all_tarifas(self, auth_headers):
        """GET /api/tarifas/all should return all tarifas (admin)"""
        response = requests.get(f"{BASE_URL}/api/tarifas/all", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ Admin: Found {len(data)} total tarifas (active + inactive)")
        return data
    
    def test_create_tarifa(self, auth_headers):
        """POST /api/tarifas should create new tarifa"""
        unique_name = f"TEST_Tarifa_{uuid.uuid4().hex[:8]}"
        
        new_tarifa = {
            "nome": unique_name,
            "valor_por_hora": 45.50,
            "codigo": "1",  # Diurno
            "table_id": 2   # Create in table 2
        }
        
        response = requests.post(
            f"{BASE_URL}/api/tarifas",
            headers=auth_headers,
            json=new_tarifa
        )
        assert response.status_code == 200, f"Failed to create tarifa: {response.text}"
        
        created = response.json()
        assert created["nome"] == unique_name
        assert created["valor_por_hora"] == 45.50
        assert created["codigo"] == "1"
        assert created["table_id"] == 2
        assert "id" in created
        
        # Store for cleanup/further tests
        TestTarifas.created_tarifa_id = created["id"]
        
        # Verify persistence
        get_response = requests.get(f"{BASE_URL}/api/tarifas?table_id=2", headers=auth_headers)
        assert get_response.status_code == 200
        tarifas = get_response.json()
        found = any(t["id"] == created["id"] for t in tarifas)
        assert found, "Created tarifa not found in GET response"
        
        print(f"✓ Created tarifa: {unique_name} (id={created['id']}) in Table 2")
        return created
    
    def test_create_tarifa_invalid_table(self, auth_headers):
        """POST /api/tarifas with invalid table_id should fail"""
        response = requests.post(
            f"{BASE_URL}/api/tarifas",
            headers=auth_headers,
            json={
                "nome": "TEST_Invalid",
                "valor_por_hora": 10.00,
                "table_id": 999
            }
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Invalid table_id correctly rejected for tarifa creation")
    
    def test_update_tarifa(self, auth_headers):
        """PUT /api/tarifas/{id} should update tarifa"""
        tarifa_id = TestTarifas.created_tarifa_id
        if not tarifa_id:
            pytest.skip("No tarifa created in previous test")
        
        update_data = {
            "nome": "TEST_Tarifa_Updated",
            "valor_por_hora": 55.00
        }
        
        response = requests.put(
            f"{BASE_URL}/api/tarifas/{tarifa_id}",
            headers=auth_headers,
            json=update_data
        )
        assert response.status_code == 200, f"Failed to update tarifa: {response.text}"
        
        updated = response.json()
        assert updated["nome"] == "TEST_Tarifa_Updated"
        assert updated["valor_por_hora"] == 55.00
        
        print(f"✓ Updated tarifa {tarifa_id}")
    
    def test_delete_tarifa(self, auth_headers):
        """DELETE /api/tarifas/{id} should deactivate tarifa"""
        tarifa_id = TestTarifas.created_tarifa_id
        if not tarifa_id:
            pytest.skip("No tarifa created in previous test")
        
        response = requests.delete(
            f"{BASE_URL}/api/tarifas/{tarifa_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to delete tarifa: {response.text}"
        
        # Verify tarifa is now inactive (should not appear in GET /api/tarifas)
        get_response = requests.get(f"{BASE_URL}/api/tarifas", headers=auth_headers)
        tarifas = get_response.json()
        found_active = any(t["id"] == tarifa_id for t in tarifas)
        assert not found_active, "Deactivated tarifa should not appear in active list"
        
        # But should still exist in /tarifas/all
        all_response = requests.get(f"{BASE_URL}/api/tarifas/all", headers=auth_headers)
        all_tarifas = all_response.json()
        found = any(t["id"] == tarifa_id for t in all_tarifas)
        assert found, "Deactivated tarifa should still exist in database"
        
        print(f"✓ Deactivated (soft deleted) tarifa {tarifa_id}")


class TestFolhaHorasEndpoint(TestAuth):
    """Folha de Horas data endpoint tests"""
    
    def test_folha_horas_data_endpoint_exists(self, auth_headers):
        """Verify /api/ots/{id}/folha-horas-data endpoint exists"""
        # First get a valid OT ID
        response = requests.get(f"{BASE_URL}/api/ots", headers=auth_headers)
        if response.status_code == 200 and len(response.json()) > 0:
            ot_id = response.json()[0]["id"]
            
            # Test the folha-horas-data endpoint
            fh_response = requests.get(
                f"{BASE_URL}/api/ots/{ot_id}/folha-horas-data",
                headers=auth_headers
            )
            assert fh_response.status_code == 200, f"Failed: {fh_response.text}"
            
            data = fh_response.json()
            # Should contain tarifas list
            assert "tarifas" in data, "Response should contain tarifas list"
            print(f"✓ Folha Horas data endpoint working for OT {ot_id}")
        else:
            pytest.skip("No OTs found to test folha-horas-data endpoint")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
