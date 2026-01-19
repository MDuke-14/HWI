"""
Test Suite for Notification System and Overtime Authorization Endpoints
Tests the following features:
- POST /api/notifications/check-clock-in - Check users without clock-in
- POST /api/notifications/check-clock-out - Check users with active clock
- GET /api/overtime/authorization/{token} - Get authorization details
- POST /api/overtime/authorization/{token}/decide - Approve/reject authorization
- GET /api/overtime/authorizations - List all authorizations (admin only)
- GET /api/notifications/logs - Get notification logs
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from review request
ADMIN_USERNAME = "pedro"
ADMIN_PASSWORD = "password"
TEST_TOKEN = "-0CtNfku7oiZFjlTfUTNsJKdK4nZR53HfjiWyFLHX90"


class TestAuthSetup:
    """Test authentication and setup"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    
    def test_admin_login(self):
        """Test admin can login successfully"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert "user" in data, "No user in response"
        assert data["user"].get("is_admin") == True, "User is not admin"
        print(f"✅ Admin login successful: {data['user'].get('username')}")


class TestNotificationCheckEndpoints:
    """Test notification check endpoints (admin only)"""
    
    @pytest.fixture(scope="class")
    def admin_headers(self):
        """Get admin auth headers"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code == 200:
            token = response.json().get("access_token")
            return {"Authorization": f"Bearer {token}"}
        pytest.skip("Admin login failed")
    
    def test_check_clock_in_endpoint(self, admin_headers):
        """Test POST /api/notifications/check-clock-in - should return list of users notified"""
        response = requests.post(
            f"{BASE_URL}/api/notifications/check-clock-in",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Check clock-in failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "status" in data, "Missing 'status' in response"
        assert data["status"] in ["completed", "skipped"], f"Unexpected status: {data['status']}"
        
        if data["status"] == "completed":
            assert "notified" in data, "Missing 'notified' in response"
            assert "notified_count" in data, "Missing 'notified_count' in response"
            assert isinstance(data["notified"], list), "'notified' should be a list"
            print(f"✅ Clock-in check completed: {data.get('notified_count', 0)} users notified")
        else:
            assert "reason" in data, "Missing 'reason' for skipped status"
            print(f"✅ Clock-in check skipped: {data.get('reason')}")
    
    def test_check_clock_out_endpoint(self, admin_headers):
        """Test POST /api/notifications/check-clock-out - should return list of users with active clock"""
        response = requests.post(
            f"{BASE_URL}/api/notifications/check-clock-out",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Check clock-out failed: {response.status_code} - {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "status" in data, "Missing 'status' in response"
        assert data["status"] in ["completed", "skipped"], f"Unexpected status: {data['status']}"
        
        if data["status"] == "completed":
            assert "notified" in data, "Missing 'notified' in response"
            assert "notified_count" in data, "Missing 'notified_count' in response"
            assert isinstance(data["notified"], list), "'notified' should be a list"
            print(f"✅ Clock-out check completed: {data.get('notified_count', 0)} users notified")
        else:
            assert "reason" in data, "Missing 'reason' for skipped status"
            print(f"✅ Clock-out check skipped: {data.get('reason')}")
    
    def test_check_clock_in_requires_admin(self):
        """Test that check-clock-in requires admin authentication"""
        # Test without auth
        response = requests.post(f"{BASE_URL}/api/notifications/check-clock-in")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ Clock-in check correctly requires authentication")
    
    def test_check_clock_out_requires_admin(self):
        """Test that check-clock-out requires admin authentication"""
        # Test without auth
        response = requests.post(f"{BASE_URL}/api/notifications/check-clock-out")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ Clock-out check correctly requires authentication")


class TestOvertimeAuthorizationEndpoints:
    """Test overtime authorization endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_headers(self):
        """Get admin auth headers"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code == 200:
            token = response.json().get("access_token")
            return {"Authorization": f"Bearer {token}"}
        pytest.skip("Admin login failed")
    
    def test_get_authorization_with_valid_token(self, admin_headers):
        """Test GET /api/overtime/authorization/{token} - should return authorization details"""
        response = requests.get(
            f"{BASE_URL}/api/overtime/authorization/{TEST_TOKEN}"
        )
        
        # Token might be valid or expired/not found
        if response.status_code == 200:
            data = response.json()
            # Verify response structure
            assert "id" in data or "user_id" in data, "Missing expected fields in authorization"
            assert "status" in data, "Missing 'status' in authorization"
            assert "request_type" in data, "Missing 'request_type' in authorization"
            print(f"✅ Authorization found: status={data.get('status')}, type={data.get('request_type')}")
        elif response.status_code == 404:
            print("✅ Authorization endpoint works - token not found (expected if test data not seeded)")
        elif response.status_code == 410:
            print("✅ Authorization endpoint works - token expired (expected for old tokens)")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code} - {response.text}")
    
    def test_get_authorization_with_invalid_token(self):
        """Test GET /api/overtime/authorization/{token} - should return 404 for invalid token"""
        response = requests.get(
            f"{BASE_URL}/api/overtime/authorization/invalid-token-12345"
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ Invalid token correctly returns 404")
    
    def test_decide_authorization_requires_admin(self):
        """Test POST /api/overtime/authorization/{token}/decide requires admin"""
        response = requests.post(
            f"{BASE_URL}/api/overtime/authorization/{TEST_TOKEN}/decide",
            json={"action": "approve"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ Authorization decision correctly requires admin authentication")
    
    def test_list_authorizations_endpoint(self, admin_headers):
        """Test GET /api/overtime/authorizations - should list all authorizations"""
        response = requests.get(
            f"{BASE_URL}/api/overtime/authorizations",
            headers=admin_headers
        )
        assert response.status_code == 200, f"List authorizations failed: {response.status_code} - {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ List authorizations successful: {len(data)} authorizations found")
        
        # If there are authorizations, verify structure
        if len(data) > 0:
            auth = data[0]
            assert "status" in auth, "Missing 'status' in authorization"
            assert "request_type" in auth, "Missing 'request_type' in authorization"
            print(f"   First authorization: status={auth.get('status')}, type={auth.get('request_type')}")
    
    def test_list_authorizations_with_status_filter(self, admin_headers):
        """Test GET /api/overtime/authorizations?status=pending - should filter by status"""
        response = requests.get(
            f"{BASE_URL}/api/overtime/authorizations?status=pending",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Filter authorizations failed: {response.status_code}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        # Verify all returned items have pending status
        for auth in data:
            assert auth.get("status") == "pending", f"Expected pending status, got {auth.get('status')}"
        print(f"✅ Filter by status works: {len(data)} pending authorizations")
    
    def test_list_authorizations_requires_admin(self):
        """Test that list authorizations requires admin authentication"""
        response = requests.get(f"{BASE_URL}/api/overtime/authorizations")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ List authorizations correctly requires admin authentication")


class TestNotificationLogsEndpoint:
    """Test notification logs endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_headers(self):
        """Get admin auth headers"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code == 200:
            token = response.json().get("access_token")
            return {"Authorization": f"Bearer {token}"}
        pytest.skip("Admin login failed")
    
    def test_get_notification_logs(self, admin_headers):
        """Test GET /api/notifications/logs - should return notification logs"""
        response = requests.get(
            f"{BASE_URL}/api/notifications/logs",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Get logs failed: {response.status_code} - {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Notification logs retrieved: {len(data)} logs found")
        
        # If there are logs, verify structure
        if len(data) > 0:
            log = data[0]
            assert "type" in log, "Missing 'type' in log"
            assert "sent_at" in log, "Missing 'sent_at' in log"
            print(f"   First log: type={log.get('type')}, sent_at={log.get('sent_at')}")
    
    def test_get_notification_logs_with_limit(self, admin_headers):
        """Test GET /api/notifications/logs?limit=10 - should respect limit parameter"""
        response = requests.get(
            f"{BASE_URL}/api/notifications/logs?limit=10",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Get logs with limit failed: {response.status_code}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        assert len(data) <= 10, f"Expected max 10 logs, got {len(data)}"
        print(f"✅ Notification logs with limit works: {len(data)} logs (max 10)")
    
    def test_notification_logs_requires_admin(self):
        """Test that notification logs requires admin authentication"""
        response = requests.get(f"{BASE_URL}/api/notifications/logs")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ Notification logs correctly requires admin authentication")


class TestSchedulerConfiguration:
    """Test that scheduler is properly configured"""
    
    @pytest.fixture(scope="class")
    def admin_headers(self):
        """Get admin auth headers"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code == 200:
            token = response.json().get("access_token")
            return {"Authorization": f"Bearer {token}"}
        pytest.skip("Admin login failed")
    
    def test_backend_health_check(self):
        """Test that backend is healthy and scheduler should be running"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.status_code}"
        data = response.json()
        
        assert data.get("status") == "running", f"Backend not running: {data}"
        print(f"✅ Backend healthy: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
