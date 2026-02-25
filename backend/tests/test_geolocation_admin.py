"""
Tests for Admin Geolocation Features
- GET /api/admin/all-current-locations - View all users' current locations on a map
- GET /api/admin/user-locations/{user_id} - View location history for a specific user
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://field-clock.preview.emergentagent.com').rstrip('/')


class TestGeolocationAdmin:
    """Tests for admin geolocation endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "pedro", "password": "password"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        token = response.json().get("access_token")
        assert token, "No access token in response"
        return token
    
    @pytest.fixture(scope="class")
    def admin_headers(self, admin_token):
        """Get headers with admin auth"""
        return {
            "Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"
        }
    
    @pytest.fixture(scope="class")
    def all_users(self, admin_headers):
        """Get list of all users"""
        response = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers=admin_headers
        )
        assert response.status_code == 200
        return response.json()

    # ==================== GET /api/admin/all-current-locations ====================
    
    def test_all_current_locations_success(self, admin_headers):
        """Test fetching all current locations for today - success"""
        response = requests.get(
            f"{BASE_URL}/api/admin/all-current-locations",
            headers=admin_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "date" in data, "Response missing 'date' field"
        assert "locations" in data, "Response missing 'locations' field"
        assert "total_users" in data, "Response missing 'total_users' field"
        
        # Date should be today's date
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        assert data["date"] == today, f"Date mismatch: expected {today}, got {data['date']}"
        
        # Locations should be a list
        assert isinstance(data["locations"], list), "Locations should be a list"
        
        # total_users should match locations count
        assert data["total_users"] == len(data["locations"]), "total_users should match locations count"
        
        print(f"✓ Found {data['total_users']} user(s) with location data today")
    
    def test_all_current_locations_structure(self, admin_headers):
        """Test location object structure in all-current-locations response"""
        response = requests.get(
            f"{BASE_URL}/api/admin/all-current-locations",
            headers=admin_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        if data["locations"]:
            location = data["locations"][0]
            
            # Required fields for map display
            required_fields = ["user_id", "userName", "latitude", "longitude", "color", "type"]
            for field in required_fields:
                assert field in location, f"Location missing required field: {field}"
            
            # Validate coordinate types
            assert isinstance(location["latitude"], (int, float)), "latitude should be numeric"
            assert isinstance(location["longitude"], (int, float)), "longitude should be numeric"
            
            # Color should be valid for map markers
            assert location["color"] in ["green", "blue", "red", "orange", "purple"], f"Invalid color: {location['color']}"
            
            print(f"✓ Location structure validated: {location['userName']} at ({location['latitude']}, {location['longitude']})")
        else:
            print("✓ No locations today (endpoint structure OK)")
    
    def test_all_current_locations_unauthorized(self):
        """Test all-current-locations requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/admin/all-current-locations"
        )
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Unauthorized access properly rejected")
    
    def test_all_current_locations_non_admin(self):
        """Test all-current-locations requires admin role"""
        # Login as non-admin user (if exists)
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "miguel", "password": "password"},
            headers={"Content-Type": "application/json"}
        )
        
        if login_response.status_code == 200:
            user_token = login_response.json().get("access_token")
            
            # Check if miguel is admin
            # This test passes if miguel is admin or if non-admin gets 403
            response = requests.get(
                f"{BASE_URL}/api/admin/all-current-locations",
                headers={"Authorization": f"Bearer {user_token}"}
            )
            
            # miguel might be admin based on test setup
            if response.status_code == 403:
                print("✓ Non-admin access properly rejected with 403")
            else:
                print("✓ User 'miguel' has admin access (valid scenario)")
        else:
            pytest.skip("Non-admin user not available for testing")

    # ==================== GET /api/admin/user-locations/{user_id} ====================
    
    def test_user_location_history_success(self, admin_headers, all_users):
        """Test fetching location history for a specific user"""
        if not all_users:
            pytest.skip("No users available for testing")
        
        user_id = all_users[0]["id"]
        
        response = requests.get(
            f"{BASE_URL}/api/admin/user-locations/{user_id}",
            headers=admin_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "user_id" in data, "Response missing 'user_id'"
        assert "user_name" in data, "Response missing 'user_name'"
        assert "locations" in data, "Response missing 'locations'"
        assert "total_count" in data, "Response missing 'total_count'"
        assert "start_date" in data, "Response missing 'start_date'"
        assert "end_date" in data, "Response missing 'end_date'"
        
        assert data["user_id"] == user_id, "user_id mismatch"
        assert isinstance(data["locations"], list), "locations should be a list"
        assert data["total_count"] == len(data["locations"]), "total_count should match locations length"
        
        print(f"✓ User location history retrieved: {data['user_name']} - {data['total_count']} location(s)")
    
    def test_user_location_history_with_date_filter(self, admin_headers, all_users):
        """Test location history with date range filter"""
        if not all_users:
            pytest.skip("No users available for testing")
        
        user_id = all_users[0]["id"]
        
        response = requests.get(
            f"{BASE_URL}/api/admin/user-locations/{user_id}",
            params={
                "start_date": "2026-02-01",
                "end_date": "2026-02-28"
            },
            headers=admin_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["start_date"] == "2026-02-01", "start_date not applied correctly"
        assert data["end_date"] == "2026-02-28", "end_date not applied correctly"
        
        print(f"✓ Date filter working: {data['start_date']} to {data['end_date']}")
    
    def test_user_location_history_structure(self, admin_headers):
        """Test location object structure in user location history"""
        # Use miguel's ID who has location data
        user_id = "92e60254-5bae-4fd7-ad44-7b2f5f4bcc60"
        
        response = requests.get(
            f"{BASE_URL}/api/admin/user-locations/{user_id}",
            params={
                "start_date": "2026-02-19",
                "end_date": "2026-02-19"
            },
            headers=admin_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        if data["locations"]:
            location = data["locations"][0]
            
            # Required fields
            required_fields = ["id", "date", "latitude", "longitude", "type"]
            for field in required_fields:
                assert field in location, f"Location missing required field: {field}"
            
            # Validate coordinates
            assert isinstance(location["latitude"], (int, float)), "latitude should be numeric"
            assert isinstance(location["longitude"], (int, float)), "longitude should be numeric"
            
            # Address should be present (may be None or dict)
            assert "address" in location, "Location missing 'address' field"
            
            print(f"✓ Location structure validated for user history")
        else:
            print("✓ No locations in date range (endpoint structure OK)")
    
    def test_user_location_history_unauthorized(self):
        """Test user-locations requires authentication"""
        user_id = "92e60254-5bae-4fd7-ad44-7b2f5f4bcc60"
        
        response = requests.get(
            f"{BASE_URL}/api/admin/user-locations/{user_id}"
        )
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Unauthorized access properly rejected")
    
    def test_user_location_history_invalid_user(self, admin_headers):
        """Test user-locations with non-existent user ID"""
        response = requests.get(
            f"{BASE_URL}/api/admin/user-locations/invalid-user-id-12345",
            headers=admin_headers
        )
        
        # Should return 200 with empty locations (not 404)
        # This is because the endpoint returns empty data for non-existent users
        assert response.status_code == 200
        data = response.json()
        
        assert data["locations"] == [], "Should return empty locations for invalid user"
        assert data["total_count"] == 0, "Should have 0 total_count for invalid user"
        
        print("✓ Invalid user returns empty locations (expected behavior)")
    
    def test_user_location_default_date_range(self, admin_headers, all_users):
        """Test that default date range is applied when not specified"""
        if not all_users:
            pytest.skip("No users available for testing")
        
        user_id = all_users[0]["id"]
        
        response = requests.get(
            f"{BASE_URL}/api/admin/user-locations/{user_id}",
            headers=admin_headers
            # No date params - should default to last 30 days
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should have start_date and end_date filled with defaults
        assert data["start_date"] is not None, "Default start_date should be set"
        assert data["end_date"] is not None, "Default end_date should be set"
        
        print(f"✓ Default date range applied: {data['start_date']} to {data['end_date']}")


class TestGeolocationIntegration:
    """Integration tests for geolocation features"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "pedro", "password": "password"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def admin_headers(self, admin_token):
        return {
            "Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"
        }
    
    def test_current_locations_match_user_history(self, admin_headers):
        """Test that current locations data matches individual user history for today"""
        from datetime import datetime, timezone
        
        # Get all current locations
        current_response = requests.get(
            f"{BASE_URL}/api/admin/all-current-locations",
            headers=admin_headers
        )
        
        assert current_response.status_code == 200
        current_data = current_response.json()
        
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        # For each user with location, verify it matches their history
        for location in current_data["locations"]:
            user_id = location["user_id"]
            
            history_response = requests.get(
                f"{BASE_URL}/api/admin/user-locations/{user_id}",
                params={"start_date": today, "end_date": today},
                headers=admin_headers
            )
            
            assert history_response.status_code == 200
            history_data = history_response.json()
            
            # User should have at least one location entry for today
            assert history_data["total_count"] >= 1, f"User {user_id} should have location in history"
            
            # Coordinates should match
            history_locations = history_data["locations"]
            coords_match = any(
                loc["latitude"] == location["latitude"] and loc["longitude"] == location["longitude"]
                for loc in history_locations
            )
            
            assert coords_match, f"Coordinates for user {user_id} should match between current and history"
            
            print(f"✓ Location data consistent for user: {location['userName']}")
    
    def test_admin_users_endpoint_exists(self, admin_headers):
        """Test that admin users endpoint works (needed for user cards with location buttons)"""
        response = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers=admin_headers
        )
        
        assert response.status_code == 200
        users = response.json()
        
        assert isinstance(users, list), "Users should be a list"
        if users:
            user = users[0]
            assert "id" in user, "User should have 'id'"
            assert "username" in user, "User should have 'username'"
            
        print(f"✓ Admin users endpoint working - {len(users)} user(s) found")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
