"""Tests for admin vacations taken-by-year endpoints."""
import os
import pytest
import requests
from datetime import date

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:3000").rstrip("/")
MIGUEL_ID = "92e60254-5bae-4fd7-ad44-7b2f5f4bcc60"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "miguel", "password": "Miguel123!"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def non_admin_headers():
    # find any non-admin user credentials. Otherwise skip 403 test.
    # We'll create/attempt using known test users if any. For simplicity, skip
    # by returning None if we can't authenticate a non-admin.
    return None


def test_get_taken_by_year_miguel(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/vacations/taken-by-year/{MIGUEL_ID}", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user_id"] == MIGUEL_ID
    assert data["company_start_date"] == "2025-02-14"
    years = {y["year"]: y for y in data["years"]}
    assert 2025 in years and 2026 in years
    y25 = years[2025]
    assert y25["months_worked"] == 10
    assert y25["days_earned"] == 20
    y26 = years[2026]
    # 2026 depends on current month
    assert y26["days_earned"] == min(date.today().month * 2, 22)
    for y in data["years"]:
        assert "days_taken" in y and "days_available" in y


def test_get_taken_by_year_user_without_start_date(admin_headers):
    # Find a user without company_start_date
    import pymongo
    from urllib.parse import urlparse
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("Mongo env missing")
    client = pymongo.MongoClient(mongo_url)
    dbh = client[db_name]
    # any user without balance or balance without company_start_date
    users = list(dbh.users.find({}, {"_id": 0, "id": 1}).limit(50))
    target = None
    for u in users:
        b = dbh.vacation_balances.find_one({"user_id": u["id"]})
        if not b or not b.get("company_start_date"):
            target = u["id"]
            break
    if not target:
        pytest.skip("No user without company_start_date found")
    r = requests.get(f"{BASE_URL}/api/admin/vacations/taken-by-year/{target}", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["years"] == []
    assert "não tem data" in data.get("message", "").lower() or "message" in data


def test_post_taken_by_year_and_persistence(admin_headers):
    payload = {"years": [{"year": 2025, "days_taken": 22}, {"year": 2026, "days_taken": 5}]}
    r = requests.post(
        f"{BASE_URL}/api/admin/vacations/taken-by-year/{MIGUEL_ID}",
        json=payload, headers=admin_headers, timeout=15,
    )
    assert r.status_code == 200, r.text

    # GET verify
    r2 = requests.get(f"{BASE_URL}/api/admin/vacations/taken-by-year/{MIGUEL_ID}", headers=admin_headers, timeout=15)
    assert r2.status_code == 200
    years = {y["year"]: y for y in r2.json()["years"]}
    assert years[2025]["days_taken"] == 22
    assert years[2026]["days_taken"] == 5
    assert years[2026]["days_available"] == max(0, years[2026]["days_earned"] - 5)

    # Check db.vacation_taken_by_year docs
    import pymongo
    client = pymongo.MongoClient(os.environ.get("MONGO_URL"))
    dbh = client[os.environ.get("DB_NAME")]
    docs = list(dbh.vacation_taken_by_year.find({"user_id": MIGUEL_ID}))
    doc_years = {d["year"]: d["days_taken"] for d in docs}
    assert doc_years.get(2025) == 22
    assert doc_years.get(2026) == 5

    # Check vacation_balances: days_taken should match current year (2026)
    bal = dbh.vacation_balances.find_one({"user_id": MIGUEL_ID})
    assert bal is not None
    assert bal["days_taken"] == 5
    assert bal["days_available"] == max(0, bal["days_earned"] - 5)


def test_negative_days_taken_clamped(admin_headers):
    payload = {"years": [{"year": 2025, "days_taken": -5}]}
    r = requests.post(
        f"{BASE_URL}/api/admin/vacations/taken-by-year/{MIGUEL_ID}",
        json=payload, headers=admin_headers, timeout=15,
    )
    assert r.status_code == 200
    r2 = requests.get(f"{BASE_URL}/api/admin/vacations/taken-by-year/{MIGUEL_ID}", headers=admin_headers, timeout=15)
    years = {y["year"]: y for y in r2.json()["years"]}
    assert years[2025]["days_taken"] == 0


def test_non_admin_forbidden():
    # Try login with a non-admin - grab any non-admin from db
    import pymongo
    client = pymongo.MongoClient(os.environ.get("MONGO_URL"))
    dbh = client[os.environ.get("DB_NAME")]
    non_admin = dbh.users.find_one({"is_admin": {"$ne": True}, "is_active": True}, {"_id": 0, "username": 1})
    if not non_admin:
        pytest.skip("No non-admin user available")
    # Try common test passwords
    tokens = None
    for pwd in ["Test123!", "test123", "123456", "Password1!", "password"]:
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": non_admin["username"], "password": pwd}, timeout=10)
        if r.status_code == 200:
            tokens = r.json()["access_token"]
            break
    if not tokens:
        pytest.skip(f"Cannot login as non-admin {non_admin['username']}")
    h = {"Authorization": f"Bearer {tokens}"}
    r_get = requests.get(f"{BASE_URL}/api/admin/vacations/taken-by-year/{MIGUEL_ID}", headers=h, timeout=15)
    r_post = requests.post(f"{BASE_URL}/api/admin/vacations/taken-by-year/{MIGUEL_ID}", json={"years": []}, headers=h, timeout=15)
    assert r_get.status_code == 403
    assert r_post.status_code == 403


def test_zzz_revert_state(admin_headers):
    """Revert vacations to 0 to not affect state."""
    payload = {"years": [{"year": 2025, "days_taken": 0}, {"year": 2026, "days_taken": 0}]}
    r = requests.post(
        f"{BASE_URL}/api/admin/vacations/taken-by-year/{MIGUEL_ID}",
        json=payload, headers=admin_headers, timeout=15,
    )
    assert r.status_code == 200
