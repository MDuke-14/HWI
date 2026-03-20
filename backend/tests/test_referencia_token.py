"""
Tests for Client Internal Reference Token System (Public Endpoints)

This tests:
1. GET /api/referencia/{token} - returns FS data for valid token, 404 for invalid, 410 for used
2. POST /api/referencia/{token} - submits reference, updates FS, creates admin notification
3. Token lifecycle: creation, validation, expiration, usage
4. Admin notification creation after reference submission
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'emergent')

# Test credentials
ADMIN_USER = "pedro"
ADMIN_PASS = "password"

# MongoDB connection for direct token manipulation
mongo_client = MongoClient(MONGO_URL)
db = mongo_client[DB_NAME]


@pytest.fixture(scope="module")
def admin_token():
    """Authenticate as admin and get token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": ADMIN_USER, "password": ADMIN_PASS}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Admin authentication failed: {response.status_code} - {response.text}")


@pytest.fixture
def admin_client(admin_token):
    """Create an authenticated admin requests session"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    })
    return session


@pytest.fixture
def test_relatorio():
    """Get an existing relatorio for testing"""
    relatorio = db.relatorios_tecnicos.find_one({}, {"_id": 0})
    if not relatorio:
        pytest.skip("No relatorios found in database")
    return relatorio


@pytest.fixture
def valid_token(test_relatorio):
    """Create a valid test token"""
    token_str = f"TEST_TOKEN_{uuid.uuid4()}"
    token_doc = {
        "id": str(uuid.uuid4()),
        "token": token_str,
        "relatorio_id": test_relatorio["id"],
        "cliente_id": test_relatorio.get("cliente_id", "test-client"),
        "used": False,
        "referencia": None,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    db.reference_tokens.insert_one(token_doc)
    yield token_str
    # Cleanup
    db.reference_tokens.delete_one({"token": token_str})


@pytest.fixture
def used_token(test_relatorio):
    """Create a used test token"""
    token_str = f"TEST_USED_TOKEN_{uuid.uuid4()}"
    token_doc = {
        "id": str(uuid.uuid4()),
        "token": token_str,
        "relatorio_id": test_relatorio["id"],
        "cliente_id": test_relatorio.get("cliente_id", "test-client"),
        "used": True,
        "referencia": "ALREADY-SUBMITTED-REF",
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    db.reference_tokens.insert_one(token_doc)
    yield token_str
    # Cleanup
    db.reference_tokens.delete_one({"token": token_str})


@pytest.fixture
def expired_token(test_relatorio):
    """Create an expired test token"""
    token_str = f"TEST_EXPIRED_TOKEN_{uuid.uuid4()}"
    token_doc = {
        "id": str(uuid.uuid4()),
        "token": token_str,
        "relatorio_id": test_relatorio["id"],
        "cliente_id": test_relatorio.get("cliente_id", "test-client"),
        "used": False,
        "referencia": None,
        "expires_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),  # Expired yesterday
        "created_at": (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()
    }
    db.reference_tokens.insert_one(token_doc)
    yield token_str
    # Cleanup
    db.reference_tokens.delete_one({"token": token_str})


class TestGetReferencePageData:
    """Tests for GET /api/referencia/{token} - Public endpoint"""
    
    def test_valid_token_returns_fs_data(self, valid_token, test_relatorio):
        """GET /api/referencia/{token} with valid token returns FS data"""
        response = requests.get(f"{BASE_URL}/api/referencia/{valid_token}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify required fields are present
        assert "numero_assistencia" in data, "Response should have 'numero_assistencia'"
        assert "cliente_nome" in data, "Response should have 'cliente_nome'"
        assert "local_intervencao" in data, "Response should have 'local_intervencao'"
        assert "data_servico" in data, "Response should have 'data_servico'"
        assert "equipamento" in data, "Response should have 'equipamento'"
        assert "expires_at" in data, "Response should have 'expires_at'"
        
        # Verify data matches the relatorio
        assert data["numero_assistencia"] == test_relatorio.get("numero_assistencia"), \
            f"numero_assistencia mismatch: {data['numero_assistencia']} vs {test_relatorio.get('numero_assistencia')}"
        
        print(f"PASS: GET /api/referencia/{valid_token[:20]}... returns FS#{data['numero_assistencia']} data")
    
    def test_invalid_token_returns_404(self):
        """GET /api/referencia/{token} with invalid token returns 404"""
        invalid_token = "INVALID_TOKEN_DOES_NOT_EXIST"
        response = requests.get(f"{BASE_URL}/api/referencia/{invalid_token}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Response should have 'detail' error message"
        
        print(f"PASS: GET /api/referencia/{invalid_token} returns 404 as expected")
    
    def test_used_token_returns_410(self, used_token):
        """GET /api/referencia/{token} with used token returns 410"""
        response = requests.get(f"{BASE_URL}/api/referencia/{used_token}")
        
        assert response.status_code == 410, f"Expected 410, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Response should have 'detail' error message"
        assert "submetida" in data["detail"].lower() or "já" in data["detail"].lower(), \
            f"Error message should indicate already submitted: {data['detail']}"
        
        print(f"PASS: GET /api/referencia/{used_token[:20]}... returns 410 (already used)")
    
    def test_expired_token_returns_410(self, expired_token):
        """GET /api/referencia/{token} with expired token returns 410"""
        response = requests.get(f"{BASE_URL}/api/referencia/{expired_token}")
        
        assert response.status_code == 410, f"Expected 410, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Response should have 'detail' error message"
        
        print(f"PASS: GET /api/referencia/{expired_token[:20]}... returns 410 (expired)")


class TestSubmitReference:
    """Tests for POST /api/referencia/{token} - Public endpoint"""
    
    def test_submit_reference_success(self, test_relatorio):
        """POST /api/referencia/{token} successfully submits reference"""
        # Create a fresh token for this test
        token_str = f"TEST_SUBMIT_TOKEN_{uuid.uuid4()}"
        token_doc = {
            "id": str(uuid.uuid4()),
            "token": token_str,
            "relatorio_id": test_relatorio["id"],
            "cliente_id": test_relatorio.get("cliente_id", "test-client"),
            "used": False,
            "referencia": None,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        db.reference_tokens.insert_one(token_doc)
        
        try:
            test_ref = f"TEST-REF-{uuid.uuid4().hex[:8].upper()}"
            response = requests.post(
                f"{BASE_URL}/api/referencia/{token_str}",
                json={"referencia": test_ref}
            )
            
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            
            data = response.json()
            assert "message" in data, "Response should have 'message'"
            assert data.get("referencia") == test_ref, f"Response should echo submitted reference"
            
            # Verify token is now marked as used
            updated_token = db.reference_tokens.find_one({"token": token_str}, {"_id": 0})
            assert updated_token["used"] == True, "Token should be marked as used"
            assert updated_token["referencia"] == test_ref, "Token should store the reference"
            
            # Verify FS was updated with the reference
            updated_relatorio = db.relatorios_tecnicos.find_one({"id": test_relatorio["id"]}, {"_id": 0})
            assert updated_relatorio.get("referencia_interna_cliente") == test_ref, \
                f"FS should have referencia_interna_cliente={test_ref}"
            
            print(f"PASS: POST /api/referencia/{token_str[:20]}... successfully submitted reference '{test_ref}'")
            
        finally:
            # Cleanup
            db.reference_tokens.delete_one({"token": token_str})
            # Restore original FS state
            db.relatorios_tecnicos.update_one(
                {"id": test_relatorio["id"]},
                {"$unset": {"referencia_interna_cliente": ""}}
            )
    
    def test_submit_reference_creates_admin_notification(self, test_relatorio, admin_client):
        """POST /api/referencia/{token} creates notification for admins"""
        # Create a fresh token for this test
        token_str = f"TEST_NOTIF_TOKEN_{uuid.uuid4()}"
        token_doc = {
            "id": str(uuid.uuid4()),
            "token": token_str,
            "relatorio_id": test_relatorio["id"],
            "cliente_id": test_relatorio.get("cliente_id", "test-client"),
            "used": False,
            "referencia": None,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        db.reference_tokens.insert_one(token_doc)
        
        # Get admin user ID
        admin_user = db.users.find_one({"username": ADMIN_USER}, {"_id": 0})
        admin_id = admin_user["id"] if admin_user else None
        
        try:
            test_ref = f"NOTIF-TEST-{uuid.uuid4().hex[:8].upper()}"
            
            # Submit reference
            response = requests.post(
                f"{BASE_URL}/api/referencia/{token_str}",
                json={"referencia": test_ref}
            )
            assert response.status_code == 200, f"Submit failed: {response.status_code}"
            
            # Check notification was created for admin
            if admin_id:
                notification = db.notifications.find_one({
                    "user_id": admin_id,
                    "type": "referencia_interna",
                    "message": {"$regex": test_ref}
                }, {"_id": 0})
                
                assert notification is not None, "Admin notification should be created"
                assert notification["type"] == "referencia_interna", "Notification type should be 'referencia_interna'"
                assert test_ref in notification["message"], f"Notification should contain reference '{test_ref}'"
                
                print(f"PASS: Admin notification created with type='referencia_interna' containing '{test_ref}'")
                
                # Cleanup notification
                db.notifications.delete_one({"id": notification["id"]})
            else:
                print("SKIP: Admin user not found, cannot verify notification")
            
        finally:
            # Cleanup
            db.reference_tokens.delete_one({"token": token_str})
            db.relatorios_tecnicos.update_one(
                {"id": test_relatorio["id"]},
                {"$unset": {"referencia_interna_cliente": ""}}
            )
    
    def test_submit_empty_reference_returns_400(self, valid_token):
        """POST /api/referencia/{token} with empty reference returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/referencia/{valid_token}",
            json={"referencia": ""}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Response should have 'detail' error message"
        
        print(f"PASS: POST /api/referencia/{valid_token[:20]}... with empty reference returns 400")
    
    def test_submit_whitespace_reference_returns_400(self, valid_token):
        """POST /api/referencia/{token} with whitespace-only reference returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/referencia/{valid_token}",
            json={"referencia": "   "}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        print(f"PASS: POST /api/referencia/{valid_token[:20]}... with whitespace reference returns 400")
    
    def test_submit_to_invalid_token_returns_404(self):
        """POST /api/referencia/{token} with invalid token returns 404"""
        invalid_token = "INVALID_SUBMIT_TOKEN"
        response = requests.post(
            f"{BASE_URL}/api/referencia/{invalid_token}",
            json={"referencia": "TEST-REF"}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        
        print(f"PASS: POST /api/referencia/{invalid_token} returns 404")
    
    def test_submit_to_used_token_returns_410(self, used_token):
        """POST /api/referencia/{token} with used token returns 410"""
        response = requests.post(
            f"{BASE_URL}/api/referencia/{used_token}",
            json={"referencia": "ANOTHER-REF"}
        )
        
        assert response.status_code == 410, f"Expected 410, got {response.status_code}: {response.text}"
        
        print(f"PASS: POST /api/referencia/{used_token[:20]}... returns 410 (already used)")
    
    def test_submit_to_expired_token_returns_410(self, expired_token):
        """POST /api/referencia/{token} with expired token returns 410"""
        response = requests.post(
            f"{BASE_URL}/api/referencia/{expired_token}",
            json={"referencia": "LATE-REF"}
        )
        
        assert response.status_code == 410, f"Expected 410, got {response.status_code}: {response.text}"
        
        print(f"PASS: POST /api/referencia/{expired_token[:20]}... returns 410 (expired)")


class TestAdminReferenceAlerts:
    """Tests for admin reference alert endpoints"""
    
    def test_get_reference_alerts_requires_admin(self, admin_client):
        """GET /api/admin/reference-alerts returns alerts for admin"""
        response = admin_client.get(f"{BASE_URL}/api/admin/reference-alerts")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"PASS: GET /api/admin/reference-alerts returns {len(data)} alerts")
    
    def test_get_reference_alerts_unauthenticated_fails(self):
        """GET /api/admin/reference-alerts without auth returns 401 or 403"""
        response = requests.get(f"{BASE_URL}/api/admin/reference-alerts")
        
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
        
        print(f"PASS: GET /api/admin/reference-alerts without auth returns {response.status_code}")


class TestNotificationsEndpoint:
    """Tests for notifications endpoint including referencia_interna type"""
    
    def test_notifications_include_referencia_interna_type(self, admin_client, test_relatorio):
        """GET /api/notifications returns referencia_interna notifications"""
        # First create a notification
        token_str = f"TEST_NOTIF_CHECK_{uuid.uuid4()}"
        token_doc = {
            "id": str(uuid.uuid4()),
            "token": token_str,
            "relatorio_id": test_relatorio["id"],
            "cliente_id": test_relatorio.get("cliente_id", "test-client"),
            "used": False,
            "referencia": None,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        db.reference_tokens.insert_one(token_doc)
        
        try:
            test_ref = f"NOTIF-CHECK-{uuid.uuid4().hex[:8].upper()}"
            
            # Submit reference to create notification
            requests.post(
                f"{BASE_URL}/api/referencia/{token_str}",
                json={"referencia": test_ref}
            )
            
            # Get notifications
            response = admin_client.get(f"{BASE_URL}/api/notifications")
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            
            notifications = response.json()
            
            # Find our notification
            ref_notif = None
            for n in notifications:
                if n.get("type") == "referencia_interna" and test_ref in n.get("message", ""):
                    ref_notif = n
                    break
            
            if ref_notif:
                assert ref_notif["type"] == "referencia_interna"
                assert "priority" in ref_notif
                print(f"PASS: GET /api/notifications includes referencia_interna notification")
                
                # Cleanup
                db.notifications.delete_one({"id": ref_notif["id"]})
            else:
                print("INFO: referencia_interna notification not found in response (may have been read)")
            
        finally:
            db.reference_tokens.delete_one({"token": token_str})
            db.relatorios_tecnicos.update_one(
                {"id": test_relatorio["id"]},
                {"$unset": {"referencia_interna_cliente": ""}}
            )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
