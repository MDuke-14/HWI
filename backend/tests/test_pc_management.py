"""
Test Pedidos de Cotação (PC) Management System

Tests cover:
- Creating PC when adding material with fornecido_por='Cotação' (no PCs exist → creates PC_XXX#YYY)
- Creating sub-PC when PCs already exist (PC_001.2, PC_001.3)
- Aggregating material to existing PC with pc_id
- GET /api/relatorios-tecnicos/{id}/pedidos-cotacao returns grouped PCs with sub_pcs
- GET /api/pedidos-cotacao returns all PCs system-wide with sub_pcs
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test FS ID from agent context
FS_ID = "b5f7c19a-5b3d-43b2-9783-af090df28f8f"
FS_NUMBER = "363"

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token using admin credentials"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "pedro",
        "password": "password"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]

@pytest.fixture
def auth_headers(auth_token):
    """Authenticated headers"""
    return {"Authorization": f"Bearer {auth_token}"}

class TestPCCreation:
    """Test PC creation when adding material with 'Cotação'"""
    
    def test_get_fs_exists(self, auth_headers):
        """Verify FS #363 exists and is accessible"""
        response = requests.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}", headers=auth_headers)
        assert response.status_code == 200, f"FS not found: {response.text}"
        
        data = response.json()
        assert data["numero_assistencia"] == int(FS_NUMBER), f"Expected FS #{FS_NUMBER}, got #{data['numero_assistencia']}"
        print(f"✓ FS #{FS_NUMBER} exists (ID: {FS_ID})")
    
    def test_get_existing_pcs_for_fs(self, auth_headers):
        """Check existing PCs for FS #363"""
        response = requests.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/pedidos-cotacao", headers=auth_headers)
        assert response.status_code == 200
        
        pcs = response.json()
        print(f"✓ Found {len(pcs)} PCs for FS #{FS_NUMBER}")
        
        for pc in pcs:
            print(f"  - {pc['numero_pc']} (status: {pc['status']}, materiais: {pc.get('materiais_count', 0)})")
            if pc.get('sub_pcs'):
                for sub in pc['sub_pcs']:
                    print(f"    └─ {sub['numero_pc']} (status: {sub['status']}, materiais: {sub.get('materiais_count', 0)})")
    
    def test_add_material_cotacao_creates_pc(self, auth_headers):
        """Test adding material with fornecido_por='Cotação' creates a new PC"""
        # Add material with Cotação
        material_data = {
            "descricao": "TEST_PC_Material_New",
            "quantidade": 1,
            "unidade": "Un",
            "fornecido_por": "Cotação"
            # No pc_id = creates new PC
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/materiais",
            json=material_data,
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to add material: {response.text}"
        
        result = response.json()
        assert "pc_id" in result, "Expected pc_id in response when fornecido_por='Cotação'"
        assert result["pc_id"] is not None, "pc_id should not be None"
        
        print(f"✓ Material created with pc_id: {result['pc_id']}")
        
        # Verify PC was created with correct naming
        pcs_response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/pedidos-cotacao",
            headers=auth_headers
        )
        assert pcs_response.status_code == 200
        
        pcs = pcs_response.json()
        pc_ids = [pc["id"] for pc in pcs]
        sub_pc_ids = [sub["id"] for pc in pcs for sub in pc.get("sub_pcs", [])]
        all_pc_ids = pc_ids + sub_pc_ids
        
        assert result["pc_id"] in all_pc_ids, "Created PC should be in the FS's PC list"
        
        # Find the PC to verify naming
        for pc in pcs:
            if pc["id"] == result["pc_id"]:
                assert f"#{FS_NUMBER}" in pc["numero_pc"], f"PC number should contain #{FS_NUMBER}, got {pc['numero_pc']}"
                print(f"✓ PC created with correct naming: {pc['numero_pc']}")
                break
            for sub in pc.get("sub_pcs", []):
                if sub["id"] == result["pc_id"]:
                    # Sub-PCs don't have # but should have parent base
                    print(f"✓ Sub-PC created: {sub['numero_pc']}")
                    break

    def test_add_material_cotacao_creates_subpc_when_pcs_exist(self, auth_headers):
        """Test adding material when PCs exist creates a sub-PC"""
        # First, get existing PCs count
        pcs_before = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/pedidos-cotacao",
            headers=auth_headers
        ).json()
        
        total_before = sum(1 + len(pc.get("sub_pcs", [])) for pc in pcs_before)
        print(f"Before: {total_before} total PCs/sub-PCs")
        
        # Add another material with Cotação (no pc_id)
        material_data = {
            "descricao": "TEST_PC_Material_SubPC",
            "quantidade": 2,
            "unidade": "Un",
            "fornecido_por": "Cotação"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/materiais",
            json=material_data,
            headers=auth_headers
        )
        assert response.status_code == 200
        
        result = response.json()
        assert "pc_id" in result
        
        # Verify a new sub-PC was created
        pcs_after = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/pedidos-cotacao",
            headers=auth_headers
        ).json()
        
        total_after = sum(1 + len(pc.get("sub_pcs", [])) for pc in pcs_after)
        print(f"After: {total_after} total PCs/sub-PCs")
        
        assert total_after > total_before, "A new sub-PC should have been created"
        print(f"✓ Sub-PC created. Total PCs increased from {total_before} to {total_after}")

    def test_add_material_aggregate_to_existing_pc(self, auth_headers):
        """Test adding material with pc_id aggregates to existing PC"""
        # Get existing PCs
        pcs = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/pedidos-cotacao",
            headers=auth_headers
        ).json()
        
        assert len(pcs) > 0, "Should have at least one PC to aggregate to"
        
        target_pc = pcs[0]
        target_pc_id = target_pc["id"]
        materials_before = target_pc.get("materiais_count", 0)
        
        print(f"Aggregating to PC: {target_pc['numero_pc']} (current materials: {materials_before})")
        
        # Add material with explicit pc_id
        material_data = {
            "descricao": "TEST_PC_Material_Aggregated",
            "quantidade": 3,
            "unidade": "Un",
            "fornecido_por": "Cotação",
            "pc_id": target_pc_id  # Aggregate to existing PC
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/materiais",
            json=material_data,
            headers=auth_headers
        )
        assert response.status_code == 200
        
        result = response.json()
        assert result["pc_id"] == target_pc_id, "Material should be aggregated to the specified PC"
        
        # Verify materials count increased
        pcs_after = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/pedidos-cotacao",
            headers=auth_headers
        ).json()
        
        target_pc_after = next((pc for pc in pcs_after if pc["id"] == target_pc_id), None)
        assert target_pc_after is not None
        
        materials_after = target_pc_after.get("materiais_count", 0)
        assert materials_after > materials_before, f"Materials count should increase. Before: {materials_before}, After: {materials_after}"
        
        print(f"✓ Material aggregated to {target_pc['numero_pc']}. Materials: {materials_before} → {materials_after}")


class TestPCGrouping:
    """Test PC endpoints return grouped data with sub_pcs"""
    
    def test_get_pcs_for_fs_returns_grouped_data(self, auth_headers):
        """GET /api/relatorios-tecnicos/{id}/pedidos-cotacao returns PCs with sub_pcs array"""
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/pedidos-cotacao",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        pcs = response.json()
        print(f"✓ Got {len(pcs)} parent PCs for FS #{FS_NUMBER}")
        
        for pc in pcs:
            # Verify required fields
            assert "id" in pc
            assert "numero_pc" in pc
            assert "status" in pc
            assert "materiais_count" in pc
            
            # Check if sub_pcs array exists for parent PCs
            if not pc.get("parent_pc_id"):
                assert "sub_pcs" in pc, f"Parent PC {pc['numero_pc']} should have sub_pcs array"
                print(f"  Parent PC: {pc['numero_pc']} - {len(pc['sub_pcs'])} sub-PCs, {pc['materiais_count']} materials")
                
                for sub in pc.get("sub_pcs", []):
                    assert "id" in sub
                    assert "numero_pc" in sub
                    assert "materiais_count" in sub
                    print(f"    └─ {sub['numero_pc']} - {sub['materiais_count']} materials")
    
    def test_get_all_pcs_system_wide(self, auth_headers):
        """GET /api/pedidos-cotacao returns all PCs system-wide with grouping"""
        response = requests.get(f"{BASE_URL}/api/pedidos-cotacao", headers=auth_headers)
        assert response.status_code == 200
        
        all_pcs = response.json()
        print(f"✓ Got {len(all_pcs)} parent PCs system-wide")
        
        # Verify each PC has required fields
        for pc in all_pcs:
            assert "id" in pc
            assert "numero_pc" in pc
            assert "relatorio_id" in pc
            assert "ot_numero" in pc or "numero_ot" in pc, "Should have OT number"
            assert "cliente_nome" in pc, "Should have client name"
            assert "materiais_count" in pc
            
            # Parent PCs should have sub_pcs array
            if not pc.get("parent_pc_id"):
                assert "sub_pcs" in pc, f"Parent PC {pc['numero_pc']} should have sub_pcs array"
        
        # Find PCs for our test FS
        fs_pcs = [pc for pc in all_pcs if pc.get("relatorio_id") == FS_ID]
        print(f"✓ Found {len(fs_pcs)} PCs for FS #{FS_NUMBER} in system-wide list")


class TestCleanup:
    """Clean up test materials and PCs"""
    
    def test_cleanup_test_materials(self, auth_headers):
        """Delete test materials created during tests"""
        # Get all materials for the FS
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/materiais",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        materials = response.json()
        test_materials = [m for m in materials if m.get("descricao", "").startswith("TEST_PC_")]
        
        print(f"Cleaning up {len(test_materials)} test materials...")
        
        for material in test_materials:
            delete_response = requests.delete(
                f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/materiais/{material['id']}",
                headers=auth_headers
            )
            if delete_response.status_code == 200:
                print(f"  ✓ Deleted material: {material['descricao']}")
            else:
                print(f"  ✗ Failed to delete: {material['descricao']}")
        
        print(f"✓ Cleanup complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
