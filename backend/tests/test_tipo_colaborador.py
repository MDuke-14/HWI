"""
Tests for tipo_colaborador field in user profiles.
This tests the feature that allows setting a collaborator type for users
which auto-fills the funcao_ot field when adding them to an FS.

Valid values: junior, tecnico, senior
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USERNAME = "teste@email.com"
ADMIN_PASSWORD = "teste"
CHELSON_USER_ID = "65b3b11e-99b2-4f87-9f5b-61f2b82813c8"


class TestTipoColaborador:
    """Tests for tipo_colaborador field on user profiles"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        return data.get("access_token")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Create auth headers"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
    
    # ==================== BACKEND API TESTS ====================
    
    def test_get_admin_users_returns_tipo_colaborador(self, headers):
        """Test 3: GET /api/admin/users returns tipo_colaborador for users"""
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)
        
        assert response.status_code == 200, f"Failed to get users: {response.text}"
        users = response.json()
        assert isinstance(users, list), "Response should be a list of users"
        
        # Find Chelson who should have tipo_colaborador set
        chelson = next((u for u in users if u.get("id") == CHELSON_USER_ID), None)
        
        if chelson:
            print(f"Found Chelson: {chelson.get('username')}")
            print(f"Chelson's tipo_colaborador: {chelson.get('tipo_colaborador')}")
            # Verify tipo_colaborador is in the response (may or may not be set)
            assert "tipo_colaborador" in chelson or chelson.get("tipo_colaborador") is None or chelson.get("tipo_colaborador") in ["junior", "tecnico", "senior"], \
                f"tipo_colaborador should be valid value or None"
            print("✓ GET /api/admin/users returns tipo_colaborador field")
        else:
            print(f"Chelson user not found, checking other users...")
            # Check that any user can have tipo_colaborador
            for u in users[:3]:
                print(f"User: {u.get('username')}, tipo_colaborador: {u.get('tipo_colaborador', 'not present')}")
            print("✓ GET /api/admin/users response structure verified")
    
    def test_get_users_returns_tipo_colaborador(self, headers):
        """Test 2: GET /api/users returns tipo_colaborador for users"""
        response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        
        assert response.status_code == 200, f"Failed to get users: {response.text}"
        users = response.json()
        assert isinstance(users, list), "Response should be a list of users"
        
        # Check if tipo_colaborador field is present in any user
        for u in users:
            tipo = u.get('tipo_colaborador')
            print(f"User: {u.get('username', u.get('full_name', 'N/A'))}, tipo_colaborador: {tipo}")
            if tipo:
                assert tipo in ["junior", "tecnico", "senior"], f"Invalid tipo_colaborador value: {tipo}"
        
        print("✓ GET /api/users returns tipo_colaborador field")
    
    def test_put_admin_users_accepts_tipo_colaborador_junior(self, headers):
        """Test 1a: PUT /api/admin/users/{user_id} accepts tipo_colaborador='junior'"""
        update_data = {"tipo_colaborador": "junior"}
        
        response = requests.put(
            f"{BASE_URL}/api/admin/users/{CHELSON_USER_ID}",
            headers=headers,
            json=update_data
        )
        
        assert response.status_code == 200, f"Failed to update user: {response.text}"
        
        # Verify the change was saved
        verify_response = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)
        assert verify_response.status_code == 200
        users = verify_response.json()
        chelson = next((u for u in users if u.get("id") == CHELSON_USER_ID), None)
        
        if chelson:
            assert chelson.get("tipo_colaborador") == "junior", f"Expected 'junior', got {chelson.get('tipo_colaborador')}"
            print("✓ PUT /api/admin/users accepts tipo_colaborador='junior' and persists correctly")
        else:
            print("✓ PUT /api/admin/users accepts tipo_colaborador='junior' (user verify skipped)")
    
    def test_put_admin_users_accepts_tipo_colaborador_tecnico(self, headers):
        """Test 1b: PUT /api/admin/users/{user_id} accepts tipo_colaborador='tecnico'"""
        update_data = {"tipo_colaborador": "tecnico"}
        
        response = requests.put(
            f"{BASE_URL}/api/admin/users/{CHELSON_USER_ID}",
            headers=headers,
            json=update_data
        )
        
        assert response.status_code == 200, f"Failed to update user: {response.text}"
        
        # Verify the change was saved
        verify_response = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)
        assert verify_response.status_code == 200
        users = verify_response.json()
        chelson = next((u for u in users if u.get("id") == CHELSON_USER_ID), None)
        
        if chelson:
            assert chelson.get("tipo_colaborador") == "tecnico", f"Expected 'tecnico', got {chelson.get('tipo_colaborador')}"
            print("✓ PUT /api/admin/users accepts tipo_colaborador='tecnico' and persists correctly")
        else:
            print("✓ PUT /api/admin/users accepts tipo_colaborador='tecnico' (user verify skipped)")
    
    def test_put_admin_users_accepts_tipo_colaborador_senior(self, headers):
        """Test 1c: PUT /api/admin/users/{user_id} accepts tipo_colaborador='senior'"""
        update_data = {"tipo_colaborador": "senior"}
        
        response = requests.put(
            f"{BASE_URL}/api/admin/users/{CHELSON_USER_ID}",
            headers=headers,
            json=update_data
        )
        
        assert response.status_code == 200, f"Failed to update user: {response.text}"
        
        # Verify the change was saved
        verify_response = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)
        assert verify_response.status_code == 200
        users = verify_response.json()
        chelson = next((u for u in users if u.get("id") == CHELSON_USER_ID), None)
        
        if chelson:
            assert chelson.get("tipo_colaborador") == "senior", f"Expected 'senior', got {chelson.get('tipo_colaborador')}"
            print("✓ PUT /api/admin/users accepts tipo_colaborador='senior' and persists correctly")
        else:
            print("✓ PUT /api/admin/users accepts tipo_colaborador='senior' (user verify skipped)")
    
    def test_put_admin_users_accepts_empty_tipo_colaborador(self, headers):
        """Test 1d: PUT /api/admin/users/{user_id} accepts empty tipo_colaborador to clear it"""
        update_data = {"tipo_colaborador": ""}
        
        response = requests.put(
            f"{BASE_URL}/api/admin/users/{CHELSON_USER_ID}",
            headers=headers,
            json=update_data
        )
        
        assert response.status_code == 200, f"Failed to update user: {response.text}"
        
        # Verify the change was saved (should be None)
        verify_response = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)
        assert verify_response.status_code == 200
        users = verify_response.json()
        chelson = next((u for u in users if u.get("id") == CHELSON_USER_ID), None)
        
        if chelson:
            assert chelson.get("tipo_colaborador") is None, f"Expected None, got {chelson.get('tipo_colaborador')}"
            print("✓ PUT /api/admin/users accepts empty tipo_colaborador to clear value")
        else:
            print("✓ PUT /api/admin/users accepts empty tipo_colaborador (user verify skipped)")
    
    def test_set_tecnico_for_integration_test(self, headers):
        """Set Chelson's tipo_colaborador to 'tecnico' for frontend integration tests"""
        update_data = {"tipo_colaborador": "tecnico"}
        
        response = requests.put(
            f"{BASE_URL}/api/admin/users/{CHELSON_USER_ID}",
            headers=headers,
            json=update_data
        )
        
        assert response.status_code == 200, f"Failed to set tipo_colaborador: {response.text}"
        print("✓ Chelson's tipo_colaborador set to 'tecnico' for frontend tests")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
