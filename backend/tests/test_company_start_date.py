"""Tests for company_start_date feature in admin user endpoints."""
import os
import uuid
import pytest
import requests
from datetime import date, datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://field-clock.preview.emergentagent.com").rstrip("/")
MIGUEL_ID = "92e60254-5bae-4fd7-ad44-7b2f5f4bcc60"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"username": "miguel", "password": "Miguel123!"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def test_get_admin_users_returns_company_start_date(headers):
    r = requests.get(f"{BASE_URL}/api/admin/users", headers=headers, timeout=15)
    assert r.status_code == 200
    users = r.json()
    assert isinstance(users, list) and len(users) > 0
    for u in users:
        assert "company_start_date" in u, f"user {u.get('username')} missing csd"
    miguel = next((u for u in users if u["id"] == MIGUEL_ID), None)
    assert miguel is not None, "miguel not found"
    assert miguel["company_start_date"] == "2023-01-15", f"miguel csd={miguel['company_start_date']}"


def test_put_admin_user_updates_csd_then_reverts(headers):
    # Set to 2024-06-01
    r = requests.put(f"{BASE_URL}/api/admin/users/{MIGUEL_ID}",
                     headers=headers, json={"company_start_date": "2024-06-01"}, timeout=15)
    assert r.status_code == 200, r.text

    r = requests.get(f"{BASE_URL}/api/admin/users", headers=headers, timeout=15)
    miguel = next(u for u in r.json() if u["id"] == MIGUEL_ID)
    assert miguel["company_start_date"] == "2024-06-01"

    # Revert
    r = requests.put(f"{BASE_URL}/api/admin/users/{MIGUEL_ID}",
                     headers=headers, json={"company_start_date": "2023-01-15"}, timeout=15)
    assert r.status_code == 200
    r = requests.get(f"{BASE_URL}/api/admin/users", headers=headers, timeout=15)
    miguel = next(u for u in r.json() if u["id"] == MIGUEL_ID)
    assert miguel["company_start_date"] == "2023-01-15"


def test_put_without_csd_does_not_change_balance(headers):
    # Update only full_name; csd should remain 2023-01-15
    r = requests.put(f"{BASE_URL}/api/admin/users/{MIGUEL_ID}",
                     headers=headers, json={"full_name": "Miguel Moreira"}, timeout=15)
    assert r.status_code == 200
    r = requests.get(f"{BASE_URL}/api/admin/users", headers=headers, timeout=15)
    miguel = next(u for u in r.json() if u["id"] == MIGUEL_ID)
    assert miguel["company_start_date"] == "2023-01-15"


def _delete_user(headers, uid):
    try:
        requests.delete(f"{BASE_URL}/api/admin/users/{uid}", headers=headers, timeout=15)
    except Exception:
        pass


def test_create_user_defaults_csd_to_today(headers):
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "username": f"TEST_csd_default_{suffix}",
        "email": f"TEST_csd_default_{suffix}@example.com",
        "password": "Passw0rd!",
        "full_name": "Test CSD Default",
        "phone": "912345678",
    }
    r = requests.post(f"{BASE_URL}/api/admin/users/create",
                      headers=headers, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    uid = r.json()["user_id"]
    try:
        r = requests.get(f"{BASE_URL}/api/admin/users", headers=headers, timeout=15)
        u = next(x for x in r.json() if x["id"] == uid)
        today = date.today().strftime("%Y-%m-%d")
        assert u["company_start_date"] == today, f"got {u['company_start_date']} expected {today}"
    finally:
        _delete_user(headers, uid)


def test_create_user_with_explicit_csd(headers):
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "username": f"TEST_csd_explicit_{suffix}",
        "email": f"TEST_csd_explicit_{suffix}@example.com",
        "password": "Passw0rd!",
        "full_name": "Test CSD Explicit",
        "phone": "912345678",
        "company_start_date": "2020-05-10",
    }
    r = requests.post(f"{BASE_URL}/api/admin/users/create",
                      headers=headers, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    uid = r.json()["user_id"]
    try:
        r = requests.get(f"{BASE_URL}/api/admin/users", headers=headers, timeout=15)
        u = next(x for x in r.json() if x["id"] == uid)
        assert u["company_start_date"] == "2020-05-10"
    finally:
        _delete_user(headers, uid)
