"""Tests for vacation carry-over logic in taken-by-year endpoints and balance sync."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
MIGUEL_ID = "92e60254-5bae-4fd7-ad44-7b2f5f4bcc60"


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "miguel", "password": "Miguel123!"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _post_years(admin_headers, years):
    r = requests.post(
        f"{BASE_URL}/api/admin/vacations/taken-by-year/{MIGUEL_ID}",
        json={"years": years}, headers=admin_headers, timeout=15,
    )
    assert r.status_code == 200, r.text


def _get_years(admin_headers):
    r = requests.get(
        f"{BASE_URL}/api/admin/vacations/taken-by-year/{MIGUEL_ID}",
        headers=admin_headers, timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    return data, {y["year"]: y for y in data["years"]}


def test_response_has_carry_over_fields(admin_headers):
    _post_years(admin_headers, [{"year": 2025, "days_taken": 0}, {"year": 2026, "days_taken": 0}])
    _, ybyr = _get_years(admin_headers)
    y26 = ybyr[2026]
    assert "days_earned_effective" in y26
    assert "carry_over_prev" in y26


def test_scenario_A_no_leftover(admin_headers):
    """2025: taken=20 (all consumed) → 2026 carry=0, effective=earned, available=earned-8."""
    _post_years(admin_headers, [{"year": 2025, "days_taken": 20}, {"year": 2026, "days_taken": 8}])
    _, y = _get_years(admin_headers)
    assert y[2025]["days_available"] == 0
    earned_26 = y[2026]["days_earned"]
    assert y[2026]["carry_over_prev"] == 0
    assert y[2026]["days_earned_effective"] == earned_26
    assert y[2026]["days_taken"] == 8
    assert y[2026]["days_available"] == max(0, earned_26 - 8)


def test_scenario_B_with_carry(admin_headers):
    """2025: taken=15 (5 leftover) → carries into 2026."""
    _post_years(admin_headers, [{"year": 2025, "days_taken": 15}, {"year": 2026, "days_taken": 8}])
    _, y = _get_years(admin_headers)
    assert y[2025]["days_available"] == 5
    earned_26 = y[2026]["days_earned"]
    assert y[2026]["carry_over_prev"] == 5
    assert y[2026]["days_earned_effective"] == earned_26 + 5
    assert y[2026]["days_taken"] == 8
    assert y[2026]["days_available"] == max(0, (earned_26 + 5) - 8)


def test_scenario_C_over_consumption_clamp(admin_headers):
    _post_years(admin_headers, [{"year": 2025, "days_taken": 15}, {"year": 2026, "days_taken": 100}])
    _, y = _get_years(admin_headers)
    assert y[2025]["days_available"] == 5
    assert y[2026]["days_available"] == 0


def test_balance_reflects_carry(admin_headers):
    """Após cenário B, /vacations/balance com token miguel deve refletir earned effective."""
    _post_years(admin_headers, [{"year": 2025, "days_taken": 15}, {"year": 2026, "days_taken": 8}])
    # miguel is admin — get his balance using his own token (admin_headers is miguel's)
    r = requests.get(f"{BASE_URL}/api/vacations/balance", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    b = r.json()
    # Expected: earned_26 + 5 (carry from 2025)
    _, y = _get_years(admin_headers)
    earned_26 = y[2026]["days_earned"]
    assert b["days_earned"] == earned_26 + 5, f"Expected {earned_26+5}, got {b['days_earned']}"
    assert b["days_taken"] == 8
    assert b["days_available"] == max(0, (earned_26 + 5) - 8)


def test_zzz_revert_state(admin_headers):
    _post_years(admin_headers, [{"year": 2025, "days_taken": 0}, {"year": 2026, "days_taken": 0}])
    _, y = _get_years(admin_headers)
    assert y[2025]["days_taken"] == 0
    assert y[2026]["days_taken"] == 0
