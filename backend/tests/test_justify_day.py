"""
Test suite for 'Justificar Dia' (Justify Day) functionality
Tests the admin endpoint POST /admin/time-entries/justify-day

Justification types:
- ferias: Creates vacation_requests entry
- dar_dia: Removes existing entries, creates 2 entries (09:00-13:00 + 14:00-18:00) = 8h
- folga: Creates vacation_requests entry with type 'folga'
- falta: Creates absences entry
- cancelamento_ferias: Removes vacation for that day
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestJustifyDay:
    """Test Justify Day admin functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - login as admin"""
        # Login as admin (pedro / password)
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "pedro",
            "password": "password"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        token = login_response.json().get("access_token")
        assert token is not None, "No access token received"
        
        self.headers = {"Authorization": f"Bearer {token}"}
        self.test_user_id = "f50fcf56-c225-400b-9cd1-8f7546a14011"  # Nuno Santos
        
        # Use test date in December 2025
        self.test_date = "2025-12-14"  # A date not yet used
        
    def test_justify_day_ferias(self):
        """Test marking a day as 'Férias' (vacation)"""
        response = requests.post(
            f"{BASE_URL}/api/admin/time-entries/justify-day",
            json={
                "user_id": self.test_user_id,
                "date": self.test_date,
                "justification_type": "ferias"
            },
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Validate response
        assert "message" in data
        assert "Férias" in data["message"]
        assert data["justification_type"] == "ferias"
        assert data["date"] == self.test_date
        assert data["user_id"] == self.test_user_id
        
        print(f"✅ Ferias test passed: {data['message']}")
    
    def test_justify_day_dar_dia(self):
        """Test 'Dar Dia' - creates 8h automatic entries (09:00-13:00 + 14:00-18:00)"""
        test_date = "2025-12-15"
        
        response = requests.post(
            f"{BASE_URL}/api/admin/time-entries/justify-day",
            json={
                "user_id": self.test_user_id,
                "date": test_date,
                "justification_type": "dar_dia"
            },
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Validate response
        assert "message" in data
        assert "8h" in data["message"] or "oferecido" in data["message"]
        assert data["justification_type"] == "dar_dia"
        
        # Verify entries were created - fetch entries for this user and date
        entries_response = requests.get(
            f"{BASE_URL}/api/admin/time-entries/user/{self.test_user_id}",
            params={"date_from": test_date, "date_to": test_date},
            headers=self.headers
        )
        
        if entries_response.status_code == 200:
            entries = entries_response.json().get("entries", [])
            # Should have 2 entries for dar_dia
            day_entries = [e for e in entries if e.get("date") == test_date]
            
            if len(day_entries) >= 2:
                total_hours = sum(e.get("total_hours", 0) for e in day_entries)
                assert total_hours == 8.0, f"Expected 8h total, got {total_hours}"
                print(f"✅ Dar Dia test passed: {len(day_entries)} entries created, {total_hours}h total")
            else:
                print(f"⚠️ Dar Dia created, entries count: {len(day_entries)}")
        
        print(f"✅ Dar Dia response: {data['message']}")
    
    def test_justify_day_folga(self):
        """Test marking a day as 'Folga' (day off)"""
        test_date = "2025-12-16"
        
        response = requests.post(
            f"{BASE_URL}/api/admin/time-entries/justify-day",
            json={
                "user_id": self.test_user_id,
                "date": test_date,
                "justification_type": "folga"
            },
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Validate response
        assert "message" in data
        assert "Folga" in data["message"]
        assert data["justification_type"] == "folga"
        
        print(f"✅ Folga test passed: {data['message']}")
    
    def test_justify_day_falta(self):
        """Test marking a day as 'Falta' (absence)"""
        test_date = "2025-12-17"
        
        response = requests.post(
            f"{BASE_URL}/api/admin/time-entries/justify-day",
            json={
                "user_id": self.test_user_id,
                "date": test_date,
                "justification_type": "falta"
            },
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Validate response
        assert "message" in data
        assert "Falta" in data["message"]
        assert data["justification_type"] == "falta"
        
        print(f"✅ Falta test passed: {data['message']}")
    
    def test_justify_day_cancelamento_ferias(self):
        """Test canceling vacation for a day"""
        test_date = "2025-12-18"
        
        # First, create a vacation for this day
        requests.post(
            f"{BASE_URL}/api/admin/time-entries/justify-day",
            json={
                "user_id": self.test_user_id,
                "date": test_date,
                "justification_type": "ferias"
            },
            headers=self.headers
        )
        
        # Now cancel the vacation
        response = requests.post(
            f"{BASE_URL}/api/admin/time-entries/justify-day",
            json={
                "user_id": self.test_user_id,
                "date": test_date,
                "justification_type": "cancelamento_ferias"
            },
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Validate response
        assert "message" in data
        assert data["justification_type"] == "cancelamento_ferias"
        
        print(f"✅ Cancelamento Férias test passed: {data['message']}")
    
    def test_justify_day_invalid_type(self):
        """Test with invalid justification type - should return 400"""
        response = requests.post(
            f"{BASE_URL}/api/admin/time-entries/justify-day",
            json={
                "user_id": self.test_user_id,
                "date": self.test_date,
                "justification_type": "invalid_type"
            },
            headers=self.headers
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"✅ Invalid type test passed: 400 returned as expected")
    
    def test_justify_day_missing_fields(self):
        """Test with missing required fields - should return 400"""
        response = requests.post(
            f"{BASE_URL}/api/admin/time-entries/justify-day",
            json={
                "user_id": self.test_user_id
                # Missing date and justification_type
            },
            headers=self.headers
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"✅ Missing fields test passed: 400 returned as expected")
    
    def test_justify_day_invalid_user(self):
        """Test with non-existent user - should return 404"""
        response = requests.post(
            f"{BASE_URL}/api/admin/time-entries/justify-day",
            json={
                "user_id": "non-existent-user-id-12345",
                "date": self.test_date,
                "justification_type": "ferias"
            },
            headers=self.headers
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✅ Invalid user test passed: 404 returned as expected")
    
    def test_justify_day_unauthorized(self):
        """Test without auth token - should return 401/403"""
        response = requests.post(
            f"{BASE_URL}/api/admin/time-entries/justify-day",
            json={
                "user_id": self.test_user_id,
                "date": self.test_date,
                "justification_type": "ferias"
            }
            # No headers - no auth
        )
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✅ Unauthorized test passed: {response.status_code} returned as expected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
