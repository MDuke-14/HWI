"""
Test suite for Mão de Obra (Labor) Records - Creation and Pause Feature
Tests:
1. Creating new labor records via POST /api/relatorios-tecnicos/{id}/registos-tecnicos
2. Edit modal with pause checkbox (incluir_pausa)
3. Adding pause (deducts 60 minutes from total)
4. Removing pause (adds 60 minutes to total)
5. Timezone overlap verification fix
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://work-order-touch.preview.emergentagent.com').rstrip('/')
OT_ID = "8d3a0111-8f03-45d5-a7eb-2cbfcc96ad85"  # 560Lab OT for testing

class TestMaoObraRegistos:
    """Test suite for labor record creation and pause feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "pedro",
            "password": "password"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["access_token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        self.user_id = response.json()["user"]["id"]
        self.user_name = response.json()["user"]["full_name"] or response.json()["user"]["username"]
        
    def test_01_get_ot_exists(self):
        """Verify the test OT exists"""
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}",
            headers=self.headers
        )
        assert response.status_code == 200, f"OT not found: {response.text}"
        data = response.json()
        print(f"OT found: #{data.get('numero_assistencia')} - {data.get('cliente_nome')}")
        
    def test_02_get_existing_registos(self):
        """Get existing registos for the OT"""
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/registos-tecnicos",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed to get registos: {response.text}"
        registos = response.json()
        print(f"Found {len(registos)} existing registos")
        for r in registos[:3]:  # Show first 3
            print(f"  - {r.get('tecnico_nome')}: {r.get('minutos_trabalhados')} min, pausa={r.get('incluir_pausa', False)}")
        return registos
        
    def test_03_create_new_registo_without_pause(self):
        """Create a new labor record WITHOUT pause"""
        # Use tomorrow's date to avoid overlap
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        payload = {
            "tecnico_id": self.user_id,
            "tecnico_nome": self.user_name,
            "tipo": "trabalho",
            "data": tomorrow,
            "hora_inicio": "09:00",
            "hora_fim": "18:00",  # 9 hours
            "km": 0,
            "kms_inicial": 0,
            "kms_final": 0,
            "kms_inicial_volta": 0,
            "kms_final_volta": 0,
            "incluir_pausa": False
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/registos-tecnicos",
            headers=self.headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Failed to create registo: {response.text}"
        data = response.json()
        registos = data.get("registos", [])
        assert len(registos) >= 1, "No registos created"
        
        # Check first registo
        first = registos[0]
        print(f"Created registo: {first.get('id')}")
        print(f"  Minutes: {first.get('minutos_trabalhados')}")
        print(f"  Pause: {first.get('incluir_pausa')}")
        
        # 9 hours = 540 minutes (without pause)
        total_mins = sum(r.get('minutos_trabalhados', 0) for r in registos)
        assert total_mins == 540, f"Expected 540 minutes, got {total_mins}"
        
        # Store for cleanup
        self.created_registo_id = first.get('id')
        return first
        
    def test_04_create_new_registo_with_pause(self):
        """Create a new labor record WITH pause (should deduct 60 min)"""
        # Use day after tomorrow to avoid overlap
        day_after = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        
        payload = {
            "tecnico_id": self.user_id,
            "tecnico_nome": self.user_name,
            "tipo": "trabalho",
            "data": day_after,
            "hora_inicio": "08:00",
            "hora_fim": "18:00",  # 10 hours
            "km": 0,
            "kms_inicial": 0,
            "kms_final": 0,
            "kms_inicial_volta": 0,
            "kms_final_volta": 0,
            "incluir_pausa": True  # Should deduct 60 min
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/registos-tecnicos",
            headers=self.headers,
            json=payload
        )
        
        assert response.status_code == 200, f"Failed to create registo with pause: {response.text}"
        data = response.json()
        registos = data.get("registos", [])
        assert len(registos) >= 1, "No registos created"
        
        # Check total minutes (10h = 600min - 60min pause = 540min)
        total_mins = sum(r.get('minutos_trabalhados', 0) for r in registos)
        print(f"Created registo with pause: {total_mins} minutes (expected 540)")
        
        # First segment should have pause deducted
        first = registos[0]
        assert first.get('incluir_pausa') == True, "incluir_pausa should be True"
        
        # Total should be 540 (600 - 60)
        assert total_mins == 540, f"Expected 540 minutes (10h - 1h pause), got {total_mins}"
        
        self.created_registo_with_pause_id = first.get('id')
        return first
        
    def test_05_update_registo_add_pause(self):
        """Update existing registo to ADD pause (should deduct 60 min)"""
        # First get existing registos
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/registos-tecnicos",
            headers=self.headers
        )
        registos = response.json()
        
        # Find a registo without pause
        registo_to_update = None
        for r in registos:
            if not r.get('incluir_pausa', False) and r.get('minutos_trabalhados', 0) > 60:
                registo_to_update = r
                break
        
        if not registo_to_update:
            pytest.skip("No suitable registo found without pause")
            
        original_mins = registo_to_update.get('minutos_trabalhados', 0)
        registo_id = registo_to_update.get('id')
        
        print(f"Updating registo {registo_id}: {original_mins} min -> adding pause")
        
        # Update to add pause
        response = requests.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/registos-tecnicos/{registo_id}",
            headers=self.headers,
            json={"incluir_pausa": True}
        )
        
        assert response.status_code == 200, f"Failed to update registo: {response.text}"
        updated = response.json()
        
        new_mins = updated.get('minutos_trabalhados', 0)
        expected_mins = max(0, original_mins - 60)
        
        print(f"After adding pause: {new_mins} min (expected {expected_mins})")
        assert new_mins == expected_mins, f"Expected {expected_mins} min after adding pause, got {new_mins}"
        assert updated.get('incluir_pausa') == True, "incluir_pausa should be True"
        
        # Store for next test
        self.registo_with_added_pause = updated
        return updated
        
    def test_06_update_registo_remove_pause(self):
        """Update existing registo to REMOVE pause (should add 60 min)"""
        # Use the registo we just added pause to
        if not hasattr(self, 'registo_with_added_pause'):
            # Find a registo with pause
            response = requests.get(
                f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/registos-tecnicos",
                headers=self.headers
            )
            registos = response.json()
            
            registo_to_update = None
            for r in registos:
                if r.get('incluir_pausa', False):
                    registo_to_update = r
                    break
            
            if not registo_to_update:
                pytest.skip("No registo with pause found")
        else:
            registo_to_update = self.registo_with_added_pause
            
        original_mins = registo_to_update.get('minutos_trabalhados', 0)
        registo_id = registo_to_update.get('id')
        
        print(f"Updating registo {registo_id}: {original_mins} min -> removing pause")
        
        # Update to remove pause
        response = requests.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/registos-tecnicos/{registo_id}",
            headers=self.headers,
            json={"incluir_pausa": False}
        )
        
        assert response.status_code == 200, f"Failed to update registo: {response.text}"
        updated = response.json()
        
        new_mins = updated.get('minutos_trabalhados', 0)
        expected_mins = original_mins + 60
        
        print(f"After removing pause: {new_mins} min (expected {expected_mins})")
        assert new_mins == expected_mins, f"Expected {expected_mins} min after removing pause, got {new_mins}"
        assert updated.get('incluir_pausa') == False, "incluir_pausa should be False"
        
        return updated
        
    def test_07_timezone_overlap_verification(self):
        """Test that timezone overlap verification works (bug fix test)"""
        # This tests the fix in cronometro_logic.py verificar_sobreposicao
        # The bug was: "can't compare offset-naive and offset-aware datetimes"
        
        # Create a registo that might trigger timezone comparison
        test_date = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
        
        payload = {
            "tecnico_id": self.user_id,
            "tecnico_nome": self.user_name,
            "tipo": "trabalho",
            "data": test_date,
            "hora_inicio": "07:00",
            "hora_fim": "19:00",  # Full day
            "km": 0,
            "incluir_pausa": False
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/registos-tecnicos",
            headers=self.headers,
            json=payload
        )
        
        # Should not fail with timezone error
        assert response.status_code == 200, f"Timezone bug may still exist: {response.text}"
        print("Timezone overlap verification passed - no datetime comparison errors")
        
        # Try to create overlapping registo (should still work but with warning)
        payload2 = {
            "tecnico_id": self.user_id,
            "tecnico_nome": self.user_name,
            "tipo": "trabalho",
            "data": test_date,
            "hora_inicio": "10:00",
            "hora_fim": "15:00",  # Overlaps with previous
            "km": 0,
            "incluir_pausa": False
        }
        
        response2 = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/registos-tecnicos",
            headers=self.headers,
            json=payload2
        )
        
        # Should succeed (overlap is allowed but flagged)
        assert response2.status_code == 200, f"Overlap handling failed: {response2.text}"
        data = response2.json()
        
        # Check if overlap was detected
        registos = data.get("registos", [])
        if registos and registos[0].get("sobreposicao"):
            print("Overlap correctly detected and handled")
        else:
            print("Registo created (may have been segmented)")
            
    def test_08_validate_required_fields(self):
        """Test that required fields are validated"""
        # Missing tecnico_id
        payload = {
            "tecnico_nome": "Test",
            "tipo": "trabalho",
            "data": "2026-01-25",
            "hora_inicio": "09:00",
            "hora_fim": "18:00"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/registos-tecnicos",
            headers=self.headers,
            json=payload
        )
        
        assert response.status_code == 400, f"Should fail with missing tecnico_id: {response.status_code}"
        print("Required field validation working correctly")


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "pedro",
            "password": "password"
        })
        self.token = response.json()["access_token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
    def test_cleanup_test_registos(self):
        """Clean up test registos created during testing"""
        # Get all registos
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/registos-tecnicos",
            headers=self.headers
        )
        
        if response.status_code != 200:
            print("Could not get registos for cleanup")
            return
            
        registos = response.json()
        
        # Find registos created in the future (test data)
        today = datetime.now().date()
        deleted_count = 0
        
        for r in registos:
            data_str = r.get('data', '')
            if data_str:
                try:
                    registo_date = datetime.fromisoformat(data_str.replace('Z', '')).date()
                    if registo_date > today:
                        # Delete future registos (test data)
                        del_response = requests.delete(
                            f"{BASE_URL}/api/relatorios-tecnicos/{OT_ID}/registos-tecnicos/{r['id']}",
                            headers=self.headers
                        )
                        if del_response.status_code in [200, 204]:
                            deleted_count += 1
                except:
                    pass
                    
        print(f"Cleaned up {deleted_count} test registos")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
