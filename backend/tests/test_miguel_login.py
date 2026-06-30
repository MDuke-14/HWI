"""
Tests for password reset of user 'miguel' (Miguel Moreira).
Validates login via username and email, plus negative + /auth/me.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
MIGUEL_ID = "92e60254-5bae-4fd7-ad44-7b2f5f4bcc60"
LEGACY_ADMIN_USER = "teste@email.com"
LEGACY_ADMIN_PASS = "Admin123!"


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# Login miguel by username
def test_login_miguel_by_username(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"username": "miguel", "password": "Miguel123!"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data and isinstance(data["access_token"], str) and len(data["access_token"]) > 0
    assert data.get("token_type") == "bearer"
    user = data["user"]
    assert user["id"] == MIGUEL_ID
    assert user["username"] == "miguel"
    assert user["is_admin"] is True


# Login miguel by email
def test_login_miguel_by_email(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"username": "miguel.moreira@hwi.pt", "password": "Miguel123!"})
    assert r.status_code == 200, r.text
    data = r.json()
    user = data["user"]
    assert user["id"] == MIGUEL_ID
    assert user["username"] == "miguel"
    assert user["is_admin"] is True


# Wrong password -> 401
def test_login_miguel_wrong_password(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"username": "miguel", "password": "errada"})
    assert r.status_code == 401


# /auth/me with miguel token
def test_auth_me_for_miguel(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"username": "miguel", "password": "Miguel123!"})
    assert r.status_code == 200
    token = r.json()["access_token"]
    me = api.get(f"{BASE_URL}/api/auth/me",
                 headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    body = me.json()
    assert body["id"] == MIGUEL_ID
    assert body["username"] == "miguel"
    # hashed_password must not be exposed
    assert "hashed_password" not in body
    assert "_id" not in body


# Legacy admin should still work
def test_legacy_admin_login_still_works(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"username": LEGACY_ADMIN_USER, "password": LEGACY_ADMIN_PASS})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["is_admin"] is True
