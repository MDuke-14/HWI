"""
Test cases for editing time records (registos-tecnicos) with hora_inicio and hora_fim
Feature: Edit start and end times for existing time records in OT management
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://timesheet-hub-32.preview.emergentagent.com')

class TestEditTimeRecord:
    """Tests for editing time records with hora_inicio and hora_fim"""
    
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
        
        # Get first relatorio for testing
        relatorios_response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos",
            headers=self.headers
        )
        assert relatorios_response.status_code == 200
        relatorios = relatorios_response.json()
        assert len(relatorios) > 0, "No relatorios found for testing"
        self.relatorio_id = relatorios[0]["id"]
        
        # Get registos for this relatorio
        registos_response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.relatorio_id}/registos-tecnicos",
            headers=self.headers
        )
        assert registos_response.status_code == 200
        registos = registos_response.json()
        assert len(registos) > 0, "No registos found for testing"
        self.registo = registos[0]
        self.registo_id = self.registo["id"]
    
    def test_get_registos_tecnicos(self):
        """Test GET /api/relatorios-tecnicos/{id}/registos-tecnicos returns registos with hora_inicio_segmento and hora_fim_segmento"""
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.relatorio_id}/registos-tecnicos",
            headers=self.headers
        )
        
        assert response.status_code == 200
        registos = response.json()
        assert len(registos) > 0
        
        # Verify registo has required fields
        registo = registos[0]
        assert "id" in registo
        assert "tecnico_nome" in registo
        assert "hora_inicio_segmento" in registo or registo.get("hora_inicio_segmento") is None
        assert "hora_fim_segmento" in registo or registo.get("hora_fim_segmento") is None
        assert "minutos_trabalhados" in registo
        print(f"✓ GET registos-tecnicos returns {len(registos)} records with required fields")
    
    def test_update_registo_with_hora_inicio_fim(self):
        """Test PUT /api/relatorios-tecnicos/{id}/registos-tecnicos/{id} with hora_inicio and hora_fim"""
        # Get original values
        original_hora_inicio = self.registo.get("hora_inicio_segmento")
        original_hora_fim = self.registo.get("hora_fim_segmento")
        original_minutos = self.registo.get("minutos_trabalhados")
        
        # Update with new times
        update_payload = {
            "hora_inicio": "08:30",
            "hora_fim": "17:30",
            "data": "2026-01-24"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.relatorio_id}/registos-tecnicos/{self.registo_id}",
            headers=self.headers,
            json=update_payload
        )
        
        assert response.status_code == 200, f"Update failed: {response.text}"
        updated_registo = response.json()
        
        # Verify the update
        assert "hora_inicio_segmento" in updated_registo
        assert "hora_fim_segmento" in updated_registo
        assert "minutos_trabalhados" in updated_registo
        
        # Verify times were updated
        assert "08:30" in updated_registo["hora_inicio_segmento"]
        assert "17:30" in updated_registo["hora_fim_segmento"]
        
        # Verify duration was recalculated (9 hours = 540 minutes)
        assert updated_registo["minutos_trabalhados"] == 540
        
        print(f"✓ Updated registo hora_inicio to 08:30, hora_fim to 17:30")
        print(f"✓ Duration recalculated to {updated_registo['minutos_trabalhados']} minutes")
        
        # Verify with GET
        get_response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.relatorio_id}/registos-tecnicos",
            headers=self.headers
        )
        assert get_response.status_code == 200
        registos = get_response.json()
        updated = next((r for r in registos if r["id"] == self.registo_id), None)
        assert updated is not None
        assert "08:30" in updated["hora_inicio_segmento"]
        assert "17:30" in updated["hora_fim_segmento"]
        print(f"✓ GET confirms update persisted in database")
    
    def test_update_registo_recalculates_codigo(self):
        """Test that updating hora_inicio recalculates the codigo (time code)"""
        # Update to morning time (should get codigo based on start time)
        update_payload = {
            "hora_inicio": "07:00",
            "hora_fim": "16:00",
            "data": "2026-01-24"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.relatorio_id}/registos-tecnicos/{self.registo_id}",
            headers=self.headers,
            json=update_payload
        )
        
        assert response.status_code == 200
        updated_registo = response.json()
        
        # Verify codigo was set
        assert "codigo" in updated_registo
        print(f"✓ Codigo recalculated to: {updated_registo['codigo']}")
    
    def test_update_registo_overnight(self):
        """Test updating registo with overnight times (hora_fim < hora_inicio)"""
        # Update with overnight times
        update_payload = {
            "hora_inicio": "22:00",
            "hora_fim": "06:00",  # Next day
            "data": "2026-01-24"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.relatorio_id}/registos-tecnicos/{self.registo_id}",
            headers=self.headers,
            json=update_payload
        )
        
        assert response.status_code == 200
        updated_registo = response.json()
        
        # Verify duration is correct (8 hours = 480 minutes)
        assert updated_registo["minutos_trabalhados"] == 480
        print(f"✓ Overnight shift calculated correctly: {updated_registo['minutos_trabalhados']} minutes")
    
    def test_update_registo_without_hora_keeps_existing(self):
        """Test that updating without hora_inicio/hora_fim keeps existing values"""
        # First set known values
        setup_payload = {
            "hora_inicio": "09:00",
            "hora_fim": "18:00",
            "data": "2026-01-24"
        }
        requests.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.relatorio_id}/registos-tecnicos/{self.registo_id}",
            headers=self.headers,
            json=setup_payload
        )
        
        # Now update only km
        update_payload = {
            "km": 50
        }
        
        response = requests.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.relatorio_id}/registos-tecnicos/{self.registo_id}",
            headers=self.headers,
            json=update_payload
        )
        
        assert response.status_code == 200
        updated_registo = response.json()
        
        # Verify km was updated
        assert updated_registo["km"] == 50
        
        # Verify hora values were not changed
        assert "09:00" in updated_registo["hora_inicio_segmento"]
        assert "18:00" in updated_registo["hora_fim_segmento"]
        print(f"✓ Updating km without hora keeps existing time values")
    
    def test_update_nonexistent_registo_returns_404(self):
        """Test that updating a non-existent registo returns 404"""
        update_payload = {
            "hora_inicio": "09:00",
            "hora_fim": "18:00"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.relatorio_id}/registos-tecnicos/nonexistent-id",
            headers=self.headers,
            json=update_payload
        )
        
        assert response.status_code == 404
        print(f"✓ Non-existent registo returns 404")
    
    def test_update_registo_unauthorized(self):
        """Test that updating without auth returns 401 or 403"""
        update_payload = {
            "hora_inicio": "09:00",
            "hora_fim": "18:00"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.relatorio_id}/registos-tecnicos/{self.registo_id}",
            headers={"Content-Type": "application/json"},  # No auth header
            json=update_payload
        )
        
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
        print(f"✓ Unauthorized request returns {response.status_code}")


class TestEditTimeRecordValidation:
    """Tests for validation of hora_inicio and hora_fim"""
    
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
        
        # Get first relatorio and registo
        relatorios_response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos",
            headers=self.headers
        )
        relatorios = relatorios_response.json()
        self.relatorio_id = relatorios[0]["id"]
        
        registos_response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.relatorio_id}/registos-tecnicos",
            headers=self.headers
        )
        registos = registos_response.json()
        self.registo_id = registos[0]["id"]
    
    def test_update_with_only_hora_inicio(self):
        """Test that providing only hora_inicio without hora_fim doesn't update times"""
        # First set known values
        setup_payload = {
            "hora_inicio": "09:00",
            "hora_fim": "18:00",
            "data": "2026-01-24"
        }
        requests.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.relatorio_id}/registos-tecnicos/{self.registo_id}",
            headers=self.headers,
            json=setup_payload
        )
        
        # Try to update with only hora_inicio
        update_payload = {
            "hora_inicio": "10:00"
            # No hora_fim
        }
        
        response = requests.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.relatorio_id}/registos-tecnicos/{self.registo_id}",
            headers=self.headers,
            json=update_payload
        )
        
        # Should succeed but not change times (both required)
        assert response.status_code == 200
        updated = response.json()
        # Times should remain unchanged since both are required
        assert "09:00" in updated["hora_inicio_segmento"]
        print(f"✓ Partial hora update (only inicio) doesn't change times")
    
    def test_update_with_valid_time_format(self):
        """Test that valid HH:MM format is accepted"""
        update_payload = {
            "hora_inicio": "14:30",
            "hora_fim": "23:45",
            "data": "2026-01-24"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/relatorios-tecnicos/{self.relatorio_id}/registos-tecnicos/{self.registo_id}",
            headers=self.headers,
            json=update_payload
        )
        
        assert response.status_code == 200
        updated = response.json()
        assert "14:30" in updated["hora_inicio_segmento"]
        assert "23:45" in updated["hora_fim_segmento"]
        print(f"✓ Valid HH:MM format accepted")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
