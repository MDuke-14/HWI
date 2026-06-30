"""Tests for the include_past query param toggle on vacation endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"


@pytest.fixture(scope="module")
def miguel_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "miguel", "password": "Miguel123!"},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(miguel_token):
    return {"Authorization": f"Bearer {miguel_token}"}


# ---- /vacations/my-requests ----

def test_my_requests_default_excludes_past_approved(headers):
    r = requests.get(f"{BASE_URL}/api/vacations/my-requests", headers=headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # No approved request older than the current year (2026) should be present
    for req in data:
        if req.get("status") == "approved":
            assert req["start_date"] >= "2026-01-01", f"Approved past-year leaked: {req}"


def test_my_requests_include_past_false_explicit(headers):
    r = requests.get(
        f"{BASE_URL}/api/vacations/my-requests",
        headers=headers,
        params={"include_past": "false"},
        timeout=15,
    )
    assert r.status_code == 200
    for req in r.json():
        if req.get("status") == "approved":
            assert req["start_date"] >= "2026-01-01"


def test_my_requests_include_past_true_count_gte(headers):
    r_default = requests.get(f"{BASE_URL}/api/vacations/my-requests", headers=headers, timeout=15)
    r_all = requests.get(
        f"{BASE_URL}/api/vacations/my-requests",
        headers=headers,
        params={"include_past": "true"},
        timeout=15,
    )
    assert r_default.status_code == 200 and r_all.status_code == 200
    assert len(r_all.json()) >= len(r_default.json()), \
        f"include_past=true should return >= default. default={len(r_default.json())} all={len(r_all.json())}"


# ---- /admin/vacations/all-balances ----

def test_all_balances_default_only_current_year_approved(headers):
    r = requests.get(f"{BASE_URL}/api/admin/vacations/all-balances", headers=headers, timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) > 0
    for entry in data:
        for req in entry.get("approved_requests", []):
            assert req["start_date"] >= "2026-01-01", \
                f"Past-year approved leaked into default all-balances: user={entry.get('user_id')} req={req}"


def test_all_balances_include_past_true_has_past_approved(headers):
    r = requests.get(
        f"{BASE_URL}/api/admin/vacations/all-balances",
        headers=headers,
        params={"include_past": "true"},
        timeout=20,
    )
    assert r.status_code == 200
    data = r.json()
    past_count = 0
    total_count = 0
    for entry in data:
        for req in entry.get("approved_requests", []):
            total_count += 1
            if req["start_date"] < "2026-01-01":
                past_count += 1
    assert past_count >= 1, f"Expected >=1 past-year approved when include_past=true; got 0 (total={total_count})"


def test_all_balances_default_vs_all_count(headers):
    r_default = requests.get(f"{BASE_URL}/api/admin/vacations/all-balances", headers=headers, timeout=20)
    r_all = requests.get(
        f"{BASE_URL}/api/admin/vacations/all-balances",
        headers=headers,
        params={"include_past": "true"},
        timeout=20,
    )
    assert r_default.status_code == 200 and r_all.status_code == 200

    def total_approved(payload):
        return sum(len(e.get("approved_requests", [])) for e in payload)

    n_default = total_approved(r_default.json())
    n_all = total_approved(r_all.json())
    assert n_all >= n_default
    assert n_all > n_default, f"Expected strictly more approved when include_past=true (default={n_default}, all={n_all})"
