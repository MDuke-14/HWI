"""
Test for auth login fix (Feb 2026):
- Duplicate user with email teste@email.com removed
- Password reset to Admin123! (bcrypt) for admin user c145d94b-bb5f-4fe1-b05d-6fa1034db968
"""
import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://field-clock.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "teste@email.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "Admin123!")
EXPECTED_USER_ID = "c145d94b-bb5f-4fe1-b05d-6fa1034db968"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login", json={
        "username": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
    })
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    return data["access_token"]


# 1. Login com credenciais correctas
def test_login_success(session):
    r = session.post(f"{BASE_URL}/api/auth/login", json={
        "username": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
    })
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    assert "access_token" in data, "Missing access_token"
    assert isinstance(data["access_token"], str) and len(data["access_token"]) > 20
    # user data may be nested in 'user'
    user = data.get("user") or data
    assert user.get("is_admin") is True, f"Expected is_admin=True, got {user.get('is_admin')}"
    assert user.get("email") == ADMIN_EMAIL or user.get("username") == ADMIN_EMAIL


# 2. Login com password incorrecta
def test_login_wrong_password(session):
    r = session.post(f"{BASE_URL}/api/auth/login", json={
        "username": ADMIN_EMAIL,
        "password": "wrong",
    })
    assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"


# 3. GET /api/auth/me com o token
def test_auth_me(session, admin_token):
    r = session.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    me = r.json()
    assert me.get("id") == EXPECTED_USER_ID, f"Expected user id {EXPECTED_USER_ID}, got {me.get('id')}"
    assert me.get("is_admin") is True


# 4. Não existem duplicados na collection users
def test_no_duplicate_users_in_db():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "emergent")
    client = MongoClient(mongo_url)
    db = client[db_name]
    by_email = list(db.users.find({"email": ADMIN_EMAIL}))
    assert len(by_email) == 1, f"Expected 1 user with email {ADMIN_EMAIL}, found {len(by_email)}: ids={[u.get('id') for u in by_email]}"
    user = by_email[0]
    assert user.get("id") == EXPECTED_USER_ID
    assert user.get("hashed_password"), "hashed_password field missing/empty"
    assert user["hashed_password"].startswith("$2"), "hashed_password is not bcrypt"


# 5. Endpoints existentes continuam a funcionar
def test_relatorios_tecnicos_with_token(session, admin_token):
    r = session.get(
        f"{BASE_URL}/api/relatorios-tecnicos",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    assert isinstance(data, list), f"Expected list, got {type(data).__name__}"


# 6. Login sem token -> 401 em endpoint protegido
def test_relatorios_tecnicos_unauthorized(session):
    r = session.get(f"{BASE_URL}/api/relatorios-tecnicos")
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"
