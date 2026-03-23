"""
Test Photo Features for FS (Folha de Serviço)
- Photo upload with compression and thumbnail generation
- Photo deletion
- Photo image serving with Cache-Control headers
- Thumbnail endpoint
"""
import pytest
import requests
import os
import base64
from io import BytesIO

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_USERNAME = "pedro"
TEST_PASSWORD = "password"

# Test FS ID with 4 interventions
TEST_FS_ID = "8d3a0111-8f03-45d5-a7eb-2cbfcc96ad85"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": TEST_USERNAME,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    return data.get("access_token") or data.get("token")


@pytest.fixture(scope="module")
def authenticated_session(auth_token):
    """Session with auth header"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


@pytest.fixture(scope="module")
def test_image():
    """Create a small test PNG image"""
    # Create a simple 10x10 red PNG image
    try:
        from PIL import Image
        img = Image.new('RGB', (100, 100), color='red')
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        return buffer.getvalue()
    except ImportError:
        # Fallback: minimal valid PNG (1x1 red pixel)
        png_data = base64.b64decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
        )
        return png_data


class TestPhotoUpload:
    """Test photo upload endpoint"""
    
    def test_upload_photo_returns_correct_fields(self, authenticated_session, test_image):
        """POST /api/relatorios-tecnicos/{id}/fotografias - verify response contains id, descricao, foto_url, uploaded_at"""
        # Create multipart form data
        files = {
            'file': ('test_photo.png', test_image, 'image/png')
        }
        data = {
            'descricao': 'TEST_Photo for testing',
            'intervencao_id': ''
        }
        
        # Remove Content-Type header for multipart
        headers = dict(authenticated_session.headers)
        headers.pop('Content-Type', None)
        
        response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/fotografias",
            files=files,
            data=data,
            headers=headers
        )
        
        assert response.status_code == 200 or response.status_code == 201, f"Upload failed: {response.status_code} - {response.text}"
        
        photo_data = response.json()
        
        # Verify required fields in response
        assert "id" in photo_data, "Response missing 'id' field"
        assert "descricao" in photo_data, "Response missing 'descricao' field"
        assert "foto_url" in photo_data, "Response missing 'foto_url' field"
        assert "uploaded_at" in photo_data, "Response missing 'uploaded_at' field"
        
        # Verify values
        assert photo_data["descricao"] == "TEST_Photo for testing"
        assert photo_data["id"] is not None
        
        # Store photo ID for cleanup
        TestPhotoUpload.uploaded_photo_id = photo_data["id"]
        print(f"Uploaded photo ID: {photo_data['id']}")
        
    def test_upload_photo_with_intervencao_id(self, authenticated_session, test_image):
        """Test uploading photo with specific intervention ID"""
        # First get interventions for this FS
        response = authenticated_session.get(f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/intervencoes")
        assert response.status_code == 200
        interventions = response.json()
        
        if len(interventions) > 0:
            interv_id = interventions[0].get("id")
            
            files = {
                'file': ('test_photo_interv.png', test_image, 'image/png')
            }
            data = {
                'descricao': 'TEST_Photo with intervention',
                'intervencao_id': interv_id
            }
            
            headers = dict(authenticated_session.headers)
            headers.pop('Content-Type', None)
            
            response = requests.post(
                f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/fotografias",
                files=files,
                data=data,
                headers=headers
            )
            
            assert response.status_code in [200, 201], f"Upload with intervention failed: {response.text}"
            photo_data = response.json()
            
            # Store for cleanup
            TestPhotoUpload.uploaded_photo_with_interv_id = photo_data["id"]


class TestPhotoImageServing:
    """Test photo image serving endpoints"""
    
    def test_get_image_has_cache_control_header(self, authenticated_session):
        """GET /api/relatorios-tecnicos/{id}/fotografias/{foto_id}/image - verify Cache-Control header"""
        # First get list of photos
        response = authenticated_session.get(f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/fotografias")
        assert response.status_code == 200
        photos = response.json()
        
        if len(photos) == 0:
            pytest.skip("No photos available for testing")
        
        foto_id = photos[0]["id"]
        
        # Get image (no auth required for image serving)
        response = requests.get(f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/fotografias/{foto_id}/image")
        
        assert response.status_code == 200, f"Image fetch failed: {response.status_code}"
        
        # Verify Cache-Control header
        cache_control = response.headers.get("Cache-Control")
        assert cache_control is not None, "Missing Cache-Control header"
        assert "max-age" in cache_control, f"Cache-Control should contain max-age, got: {cache_control}"
        print(f"Cache-Control header: {cache_control}")
        
    def test_get_thumbnail_works(self, authenticated_session):
        """GET /api/relatorios-tecnicos/{id}/fotografias/{foto_id}/image?thumb=true - verify thumbnail endpoint"""
        # Get list of photos
        response = authenticated_session.get(f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/fotografias")
        assert response.status_code == 200
        photos = response.json()
        
        if len(photos) == 0:
            pytest.skip("No photos available for testing")
        
        foto_id = photos[0]["id"]
        
        # Get thumbnail
        response = requests.get(f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/fotografias/{foto_id}/image?thumb=true")
        
        assert response.status_code == 200, f"Thumbnail fetch failed: {response.status_code}"
        
        # Verify it's an image
        content_type = response.headers.get("Content-Type", "")
        assert "image" in content_type, f"Expected image content type, got: {content_type}"
        
        # Verify Cache-Control header on thumbnail too
        cache_control = response.headers.get("Cache-Control")
        assert cache_control is not None, "Missing Cache-Control header on thumbnail"
        print(f"Thumbnail Cache-Control: {cache_control}")


class TestPhotoDelete:
    """Test photo deletion endpoint"""
    
    def test_delete_photo_works(self, authenticated_session, test_image):
        """DELETE /api/relatorios-tecnicos/{id}/fotografias/{foto_id} - verify deletion works"""
        # First upload a photo to delete
        files = {
            'file': ('test_delete_photo.png', test_image, 'image/png')
        }
        data = {
            'descricao': 'TEST_Photo to delete',
            'intervencao_id': ''
        }
        
        headers = dict(authenticated_session.headers)
        headers.pop('Content-Type', None)
        
        upload_response = requests.post(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/fotografias",
            files=files,
            data=data,
            headers=headers
        )
        
        assert upload_response.status_code in [200, 201], f"Upload for delete test failed: {upload_response.text}"
        photo_id = upload_response.json()["id"]
        print(f"Uploaded photo for deletion: {photo_id}")
        
        # Now delete the photo
        delete_response = authenticated_session.delete(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/fotografias/{photo_id}"
        )
        
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.status_code} - {delete_response.text}"
        
        # Verify response message
        delete_data = delete_response.json()
        assert "message" in delete_data or "success" in str(delete_data).lower(), f"Unexpected delete response: {delete_data}"
        print(f"Delete response: {delete_data}")
        
        # Verify photo is actually deleted by trying to fetch it
        get_response = requests.get(f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/fotografias/{photo_id}/image")
        assert get_response.status_code == 404, f"Photo should be deleted but still accessible: {get_response.status_code}"
        print("Photo successfully deleted and verified not accessible")
        
    def test_delete_nonexistent_photo_returns_404(self, authenticated_session):
        """DELETE non-existent photo should return 404"""
        fake_photo_id = "nonexistent-photo-id-12345"
        
        response = authenticated_session.delete(
            f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/fotografias/{fake_photo_id}"
        )
        
        assert response.status_code == 404, f"Expected 404 for non-existent photo, got: {response.status_code}"


class TestPhotoList:
    """Test photo listing endpoint"""
    
    def test_list_photos_returns_array(self, authenticated_session):
        """GET /api/relatorios-tecnicos/{id}/fotografias - returns array of photos"""
        response = authenticated_session.get(f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/fotografias")
        
        assert response.status_code == 200
        photos = response.json()
        
        assert isinstance(photos, list), f"Expected list, got: {type(photos)}"
        print(f"Found {len(photos)} photos for FS {TEST_FS_ID}")
        
        # Verify photo structure if any exist
        if len(photos) > 0:
            photo = photos[0]
            assert "id" in photo, "Photo missing 'id' field"
            assert "foto_url" in photo, "Photo missing 'foto_url' field"
            print(f"Sample photo: id={photo['id']}, has intervencao_id={photo.get('intervencao_id')}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_uploaded_photos(self, authenticated_session):
        """Clean up any TEST_ prefixed photos"""
        response = authenticated_session.get(f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/fotografias")
        
        if response.status_code == 200:
            photos = response.json()
            for photo in photos:
                if photo.get("descricao", "").startswith("TEST_"):
                    delete_response = authenticated_session.delete(
                        f"{BASE_URL}/api/relatorios-tecnicos/{TEST_FS_ID}/fotografias/{photo['id']}"
                    )
                    print(f"Cleaned up test photo: {photo['id']} - status: {delete_response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
