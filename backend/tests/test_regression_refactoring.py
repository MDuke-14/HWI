"""
Regression Test Suite for Backend Refactoring
Tests all major endpoints after extracting:
- models.py (Pydantic models)
- database.py (DB connection)
- auth_utils.py (auth helpers)
- routes/clientes.py (client CRUD)
- routes/references.py (internal reference system)

This ensures no regression was introduced during the refactoring.
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USERNAME = "pedro"
ADMIN_PASSWORD = "password"
NON_ADMIN_USERNAME = "teste@email.com"
NON_ADMIN_PASSWORD = "teste"


class TestAuthEndpoints:
    """Test authentication endpoints - still in server.py"""
    
    def test_login_admin_success(self):
        """POST /api/auth/login - Admin login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["is_admin"] == True
        print(f"✓ Admin login successful: {data['user']['username']}")
    
    def test_login_invalid_credentials(self):
        """POST /api/auth/login - Invalid credentials return 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "invalid_user",
            "password": "wrong_password"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected")
    
    def test_auth_me_with_token(self):
        """GET /api/auth/me - Returns user info with valid token"""
        # First login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        token = login_resp.json()["access_token"]
        
        # Then get me
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "username" in data
        assert "email" in data
        print(f"✓ Auth me endpoint works: {data['username']}")
    
    def test_auth_me_without_token(self):
        """GET /api/auth/me - Returns 403 without token"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 403
        print("✓ Auth me correctly requires authentication")


class TestClientesEndpoints:
    """Test client CRUD endpoints - now in routes/clientes.py"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_clientes_list(self, auth_token):
        """GET /api/clientes - Returns list of active clients"""
        response = requests.get(
            f"{BASE_URL}/api/clientes",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get clientes list works: {len(data)} clients found")
    
    def test_get_clientes_requires_auth(self):
        """GET /api/clientes - Requires authentication"""
        response = requests.get(f"{BASE_URL}/api/clientes")
        assert response.status_code == 403
        print("✓ Get clientes correctly requires authentication")
    
    def test_create_cliente(self, auth_token):
        """POST /api/clientes - Create new client works"""
        test_cliente = {
            "id": str(uuid.uuid4()),
            "nome": f"TEST_Cliente_Regression_{uuid.uuid4().hex[:8]}",
            "email": f"test_{uuid.uuid4().hex[:8]}@test.com",
            "telefone": "123456789",
            "morada": "Test Address",
            "nif": "123456789",
            "ativo": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/clientes",
            json=test_cliente,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert data["nome"] == test_cliente["nome"]
        print(f"✓ Create cliente works: {data['nome']}")
        
        # Cleanup - soft delete
        requests.delete(
            f"{BASE_URL}/api/clientes/{data['id']}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_get_cliente_by_id(self, auth_token):
        """GET /api/clientes/{id} - Get specific client"""
        # First get list to find an existing client
        list_resp = requests.get(
            f"{BASE_URL}/api/clientes",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        clientes = list_resp.json()
        
        if clientes:
            cliente_id = clientes[0]["id"]
            response = requests.get(
                f"{BASE_URL}/api/clientes/{cliente_id}",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == cliente_id
            print(f"✓ Get cliente by ID works: {data['nome']}")
        else:
            pytest.skip("No clients in database to test")
    
    def test_update_cliente(self, auth_token):
        """PUT /api/clientes/{id} - Update client works"""
        # Create a test client first
        test_cliente = {
            "id": str(uuid.uuid4()),
            "nome": f"TEST_Update_Cliente_{uuid.uuid4().hex[:8]}",
            "email": f"update_{uuid.uuid4().hex[:8]}@test.com",
            "ativo": True
        }
        
        create_resp = requests.post(
            f"{BASE_URL}/api/clientes",
            json=test_cliente,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        created = create_resp.json()
        
        # Update the client
        updated_data = {
            "id": created["id"],
            "nome": f"TEST_Updated_{uuid.uuid4().hex[:8]}",
            "email": created.get("email"),
            "ativo": True
        }
        
        response = requests.put(
            f"{BASE_URL}/api/clientes/{created['id']}",
            json=updated_data,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Update failed: {response.text}"
        data = response.json()
        assert data["nome"] == updated_data["nome"]
        print(f"✓ Update cliente works: {data['nome']}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/clientes/{created['id']}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_delete_cliente_soft_delete(self, auth_token):
        """DELETE /api/clientes/{id} - Soft delete client works"""
        # Create a test client first
        test_cliente = {
            "id": str(uuid.uuid4()),
            "nome": f"TEST_Delete_Cliente_{uuid.uuid4().hex[:8]}",
            "email": f"delete_{uuid.uuid4().hex[:8]}@test.com",
            "ativo": True
        }
        
        create_resp = requests.post(
            f"{BASE_URL}/api/clientes",
            json=test_cliente,
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        created = create_resp.json()
        
        # Delete the client
        response = requests.delete(
            f"{BASE_URL}/api/clientes/{created['id']}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        print(f"✓ Delete cliente (soft delete) works")


class TestRelatoriosTecnicosEndpoints:
    """Test FS (Folha de Serviço) endpoints - still in server.py"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_relatorios_tecnicos_list(self, auth_token):
        """GET /api/relatorios-tecnicos - Returns list of FS"""
        response = requests.get(
            f"{BASE_URL}/api/relatorios-tecnicos",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "relatorios" in data or isinstance(data, list)
        print(f"✓ Get relatorios-tecnicos list works")
    
    def test_get_relatorios_requires_auth(self):
        """GET /api/relatorios-tecnicos - Requires authentication"""
        response = requests.get(f"{BASE_URL}/api/relatorios-tecnicos")
        assert response.status_code == 403
        print("✓ Get relatorios correctly requires authentication")


class TestReferenceTokenEndpoints:
    """Test reference token endpoints - now in routes/references.py"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_admin_reference_tokens(self, auth_token):
        """GET /api/admin/reference-tokens - Returns list of reference tokens"""
        response = requests.get(
            f"{BASE_URL}/api/admin/reference-tokens",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get admin reference tokens works: {len(data)} tokens found")
    
    def test_get_reference_tokens_requires_admin(self):
        """GET /api/admin/reference-tokens - Requires admin auth"""
        response = requests.get(f"{BASE_URL}/api/admin/reference-tokens")
        assert response.status_code == 403
        print("✓ Get reference tokens correctly requires admin auth")
    
    def test_public_reference_invalid_token(self):
        """GET /api/referencia/{token} - Invalid token returns 404"""
        response = requests.get(f"{BASE_URL}/api/referencia/invalid-token-12345")
        assert response.status_code == 404
        print("✓ Public reference endpoint correctly returns 404 for invalid token")
    
    def test_submit_reference_invalid_token(self):
        """POST /api/referencia/{token} - Invalid token returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/referencia/invalid-token-12345",
            json={"referencia": "TEST123"}
        )
        assert response.status_code == 404
        print("✓ Submit reference correctly returns 404 for invalid token")


class TestNotificationsEndpoints:
    """Test notifications endpoints - still in server.py"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_notifications(self, auth_token):
        """GET /api/notifications - Returns user notifications"""
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get notifications works: {len(data)} notifications found")
    
    def test_notifications_requires_auth(self):
        """GET /api/notifications - Requires authentication"""
        response = requests.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 403
        print("✓ Get notifications correctly requires authentication")


class TestTimeEntriesEndpoints:
    """Test time entries endpoints - still in server.py"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_time_entries_today(self, auth_token):
        """GET /api/time-entries/today - Returns today's time entries"""
        response = requests.get(
            f"{BASE_URL}/api/time-entries/today",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        print("✓ Get time entries today works")
    
    def test_time_entries_requires_auth(self):
        """GET /api/time-entries/today - Requires authentication"""
        response = requests.get(f"{BASE_URL}/api/time-entries/today")
        assert response.status_code == 403
        print("✓ Get time entries correctly requires authentication")


class TestServicesEndpoints:
    """Test calendar services endpoints - still in server.py"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_services(self, auth_token):
        """GET /api/services - Returns calendar services"""
        response = requests.get(
            f"{BASE_URL}/api/services",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get services works: {len(data)} services found")
    
    def test_services_requires_auth(self):
        """GET /api/services - Requires authentication"""
        response = requests.get(f"{BASE_URL}/api/services")
        assert response.status_code == 403
        print("✓ Get services correctly requires authentication")


class TestPedidosCotacaoEndpoints:
    """Test PC (Pedido de Cotação) endpoints - still in server.py"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_pedidos_cotacao(self, auth_token):
        """GET /api/pedidos-cotacao - Returns list of PCs"""
        response = requests.get(
            f"{BASE_URL}/api/pedidos-cotacao",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get pedidos-cotacao works: {len(data)} PCs found")
    
    def test_pedidos_cotacao_requires_auth(self):
        """GET /api/pedidos-cotacao - Requires authentication"""
        response = requests.get(f"{BASE_URL}/api/pedidos-cotacao")
        assert response.status_code == 403
        print("✓ Get pedidos-cotacao correctly requires authentication")


class TestHealthEndpoint:
    """Test health check endpoint"""
    
    def test_health_check(self):
        """GET /api/health - Returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "running"
        print(f"✓ Health check works: {data}")


class TestUsersEndpoints:
    """Test users management endpoints - still in server.py"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_users_list(self, auth_token):
        """GET /api/users - Returns list of users (admin only)"""
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get users list works: {len(data)} users found")


class TestEquipamentosEndpoints:
    """Test equipamentos endpoints - still in server.py"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_equipamentos(self, auth_token):
        """GET /api/equipamentos - Returns list of equipamentos"""
        response = requests.get(
            f"{BASE_URL}/api/equipamentos",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Get equipamentos works: {len(data)} equipamentos found")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
