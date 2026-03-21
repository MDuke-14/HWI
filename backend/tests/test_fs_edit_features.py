"""
Test FS (Folha de Serviço) Edit Features - Iteration 25
Tests for editing photos, signatures, and moving items between interventions.

Target FS: FS#356 (id: 8d3a0111-8f03-45d5-a7eb-2cbfcc96ad85)
- 4 interventions: 6fb298f8, a657939e, adc277c5, 8aeeb431
- 3 photos, 4 signatures
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
FS_ID = "8d3a0111-8f03-45d5-a7eb-2cbfcc96ad85"  # FS#356

# Intervention IDs for FS#356
INTERVENTION_IDS = [
    "6fb298f8-2026-01-09",  # 2026-01-09
    "a657939e-2026-01-22",  # 2026-01-22
    "adc277c5-2026-01-24",  # 2026-01-24
    "8aeeb431-2026-01-24",  # 2026-01-24
]


class TestFSEditFeatures:
    """Test suite for FS editing features: photos, signatures, materials, equipment"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "pedro",
            "password": "password"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.token = token
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    # ========== Photo Tests ==========
    
    def test_get_fs_photos(self):
        """Test: GET photos for FS#356"""
        response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/fotografias")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        photos = response.json()
        assert isinstance(photos, list), "Expected list of photos"
        print(f"Found {len(photos)} photos in FS#356")
        
        # Store photo IDs for later tests
        if photos:
            self.photo_ids = [p['id'] for p in photos]
            print(f"Photo IDs: {self.photo_ids}")
        
        return photos
    
    def test_update_photo_description(self):
        """Test: PUT /fotografias/{foto_id} - update description"""
        # First get photos
        photos_response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/fotografias")
        photos = photos_response.json()
        
        if not photos:
            pytest.skip("No photos found in FS#356")
        
        photo = photos[0]
        photo_id = photo['id']
        original_desc = photo.get('descricao', '')
        
        # Update description
        new_desc = f"TEST_Updated description at {datetime.now().isoformat()}"
        response = self.session.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/fotografias/{photo_id}",
            json={"descricao": new_desc}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify update
        updated = response.json()
        assert updated.get('descricao') == new_desc, f"Description not updated: {updated.get('descricao')}"
        print(f"Photo description updated successfully: {new_desc}")
        
        # Restore original description
        self.session.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/fotografias/{photo_id}",
            json={"descricao": original_desc}
        )
    
    def test_update_photo_date(self):
        """Test: PUT /fotografias/{foto_id} - update uploaded_at date"""
        photos_response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/fotografias")
        photos = photos_response.json()
        
        if not photos:
            pytest.skip("No photos found in FS#356")
        
        photo = photos[0]
        photo_id = photo['id']
        original_date = photo.get('uploaded_at')
        
        # Update date
        new_date = "2026-01-15T10:30:00.000Z"
        response = self.session.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/fotografias/{photo_id}",
            json={"uploaded_at": new_date}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        updated = response.json()
        assert 'uploaded_at' in updated, "uploaded_at not in response"
        print(f"Photo date updated successfully")
        
        # Restore original date
        if original_date:
            self.session.put(
                f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/fotografias/{photo_id}",
                json={"uploaded_at": original_date}
            )
    
    def test_update_photo_intervencao_id(self):
        """Test: PUT /fotografias/{foto_id} - update intervencao_id (move photo)"""
        photos_response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/fotografias")
        photos = photos_response.json()
        
        if not photos:
            pytest.skip("No photos found in FS#356")
        
        # Get interventions
        interv_response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/intervencoes")
        interventions = interv_response.json()
        
        if len(interventions) < 2:
            pytest.skip("Need at least 2 interventions to test move")
        
        photo = photos[0]
        photo_id = photo['id']
        original_interv = photo.get('intervencao_id')
        
        # Pick a different intervention
        target_interv = interventions[1]['id'] if interventions[0]['id'] == original_interv else interventions[0]['id']
        
        # Move photo
        response = self.session.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/fotografias/{photo_id}",
            json={"intervencao_id": target_interv}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        updated = response.json()
        assert updated.get('intervencao_id') == target_interv, f"intervencao_id not updated"
        print(f"Photo moved to intervention {target_interv}")
        
        # Restore original
        if original_interv:
            self.session.put(
                f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/fotografias/{photo_id}",
                json={"intervencao_id": original_interv}
            )
    
    # ========== Signature Tests ==========
    
    def test_get_fs_signatures(self):
        """Test: GET signatures for FS#356"""
        response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/assinaturas")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        signatures = response.json()
        assert isinstance(signatures, list), "Expected list of signatures"
        print(f"Found {len(signatures)} signatures in FS#356")
        
        if signatures:
            for sig in signatures:
                print(f"  - {sig.get('assinado_por', 'N/A')} ({sig.get('id', 'N/A')[:8]}...)")
        
        return signatures
    
    def test_update_signature_name(self):
        """Test: PUT /assinaturas/{assinatura_id} - update primeiro_nome, ultimo_nome"""
        sigs_response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/assinaturas")
        signatures = sigs_response.json()
        
        if not signatures:
            pytest.skip("No signatures found in FS#356")
        
        sig = signatures[0]
        sig_id = sig['id']
        original_primeiro = sig.get('primeiro_nome', '')
        original_ultimo = sig.get('ultimo_nome', '')
        
        # Update name
        response = self.session.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/assinaturas/{sig_id}",
            json={
                "primeiro_nome": "TEST_João",
                "ultimo_nome": "TEST_Silva",
                "assinado_por": "TEST_João TEST_Silva"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"Signature name updated successfully")
        
        # Verify update
        verify_response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/assinaturas")
        updated_sigs = verify_response.json()
        updated_sig = next((s for s in updated_sigs if s['id'] == sig_id), None)
        
        assert updated_sig is not None, "Signature not found after update"
        assert updated_sig.get('primeiro_nome') == "TEST_João", f"primeiro_nome not updated"
        assert updated_sig.get('ultimo_nome') == "TEST_Silva", f"ultimo_nome not updated"
        
        # Restore original
        self.session.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/assinaturas/{sig_id}",
            json={
                "primeiro_nome": original_primeiro,
                "ultimo_nome": original_ultimo,
                "assinado_por": f"{original_primeiro} {original_ultimo}".strip()
            }
        )
    
    def test_update_signature_date(self):
        """Test: PUT /assinaturas/{assinatura_id} - update data_assinatura"""
        sigs_response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/assinaturas")
        signatures = sigs_response.json()
        
        if not signatures:
            pytest.skip("No signatures found in FS#356")
        
        sig = signatures[0]
        sig_id = sig['id']
        original_date = sig.get('data_assinatura')
        
        # Update date
        new_date = "2026-01-20T14:30:00.000Z"
        response = self.session.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/assinaturas/{sig_id}",
            json={"data_assinatura": new_date}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"Signature date updated successfully")
        
        # Restore original
        if original_date:
            self.session.put(
                f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/assinaturas/{sig_id}",
                json={"data_assinatura": original_date}
            )
    
    # ========== Material Tests ==========
    
    def test_get_fs_materials(self):
        """Test: GET materials for FS#356"""
        response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/materiais")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        materials = response.json()
        assert isinstance(materials, list), "Expected list of materials"
        print(f"Found {len(materials)} materials in FS#356")
        
        return materials
    
    def test_update_material_intervencao_id(self):
        """Test: PUT /materiais/{material_id} - update intervencao_id (move material)"""
        mats_response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/materiais")
        materials = mats_response.json()
        
        if not materials:
            pytest.skip("No materials found in FS#356")
        
        # Get interventions
        interv_response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/intervencoes")
        interventions = interv_response.json()
        
        if len(interventions) < 2:
            pytest.skip("Need at least 2 interventions to test move")
        
        material = materials[0]
        material_id = material['id']
        original_interv = material.get('intervencao_id')
        
        # Pick a different intervention
        target_interv = interventions[1]['id'] if interventions[0]['id'] == original_interv else interventions[0]['id']
        
        # Move material
        response = self.session.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/materiais/{material_id}",
            json={"intervencao_id": target_interv}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"Material moved to intervention {target_interv}")
        
        # Restore original
        if original_interv:
            self.session.put(
                f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/materiais/{material_id}",
                json={"intervencao_id": original_interv}
            )
    
    # ========== Equipment Tests ==========
    
    def test_get_fs_equipment(self):
        """Test: GET equipment for FS#356"""
        response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/equipamentos")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        equipment = response.json()
        assert isinstance(equipment, list), "Expected list of equipment"
        print(f"Found {len(equipment)} equipment in FS#356")
        
        return equipment
    
    def test_update_equipment_intervencao_id(self):
        """Test: PUT /equipamentos/{equipamento_id} - update intervencao_id (move equipment)"""
        equip_response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/equipamentos")
        equipment = equip_response.json()
        
        if not equipment:
            pytest.skip("No equipment found in FS#356")
        
        # Get interventions
        interv_response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/intervencoes")
        interventions = interv_response.json()
        
        if len(interventions) < 2:
            pytest.skip("Need at least 2 interventions to test move")
        
        equip = equipment[0]
        equip_id = equip['id']
        original_interv = equip.get('intervencao_id')
        
        # Pick a different intervention
        target_interv = interventions[1]['id'] if interventions[0]['id'] == original_interv else interventions[0]['id']
        
        # Move equipment
        response = self.session.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/equipamentos/{equip_id}",
            json={"intervencao_id": target_interv}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"Equipment moved to intervention {target_interv}")
        
        # Restore original
        if original_interv:
            self.session.put(
                f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/equipamentos/{equip_id}",
                json={"intervencao_id": original_interv}
            )
    
    # ========== Error Handling Tests ==========
    
    def test_update_photo_invalid_id(self):
        """Test: PUT /fotografias/{foto_id} - 404 for invalid photo ID"""
        response = self.session.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/fotografias/invalid-photo-id",
            json={"descricao": "test"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_update_signature_invalid_id(self):
        """Test: PUT /assinaturas/{assinatura_id} - 404 for invalid signature ID"""
        response = self.session.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/assinaturas/invalid-sig-id",
            json={"primeiro_nome": "test"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_update_photo_empty_data(self):
        """Test: PUT /fotografias/{foto_id} - 400 for empty update data"""
        photos_response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/fotografias")
        photos = photos_response.json()
        
        if not photos:
            pytest.skip("No photos found")
        
        response = self.session.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/fotografias/{photos[0]['id']}",
            json={}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
    
    def test_update_signature_empty_data(self):
        """Test: PUT /assinaturas/{assinatura_id} - 400 for empty update data"""
        sigs_response = self.session.get(f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/assinaturas")
        signatures = sigs_response.json()
        
        if not signatures:
            pytest.skip("No signatures found")
        
        response = self.session.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{FS_ID}/assinaturas/{signatures[0]['id']}",
            json={}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
