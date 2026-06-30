"""
Tests for the new filter that hides APPROVED vacation requests from
previous years on /api/vacations/my-requests and on
/api/admin/vacations/all-balances (approved_requests array).

Non-approved (pending / rejected) requests from previous years must
remain visible. Balance endpoint must remain unchanged.
"""

import os
from datetime import date

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://field-clock.preview.emergentagent.com").rstrip("/")
CURRENT_YEAR = date.today().year

MIGUEL_USER = {"username": "miguel", "password": "Miguel123!"}


@pytest.fixture(scope="module")
def miguel_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=MIGUEL_USER, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def miguel_headers(miguel_token):
    return {"Authorization": f"Bearer {miguel_token}", "Content-Type": "application/json"}


class TestMyRequestsYearFilter:
    """GET /api/vacations/my-requests"""

    def test_my_requests_returns_list(self, miguel_headers):
        r = requests.get(f"{BASE_URL}/api/vacations/my-requests", headers=miguel_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)

    def test_no_approved_request_from_previous_years(self, miguel_headers):
        r = requests.get(f"{BASE_URL}/api/vacations/my-requests", headers=miguel_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        bad = [
            req for req in data
            if req.get("status") == "approved"
            and req.get("start_date", "9999")[:4].isdigit()
            and int(req["start_date"][:4]) < CURRENT_YEAR
        ]
        assert bad == [], f"Approved requests from previous years leaked: {bad}"

    def test_non_approved_old_requests_remain_visible(self, miguel_headers):
        """rejected/pending requests of any year must still be visible (miguel
        has a rejected 2025-10-20 entry)."""
        r = requests.get(f"{BASE_URL}/api/vacations/my-requests", headers=miguel_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        # We just assert that the filter does NOT remove non-approved old rows
        non_approved_old = [
            req for req in data
            if req.get("status") != "approved"
            and req.get("start_date", "9999")[:4].isdigit()
            and int(req["start_date"][:4]) < CURRENT_YEAR
        ]
        # miguel has rejected 2025 entry -> should be >=1
        assert len(non_approved_old) >= 1, (
            f"Expected at least one non-approved old request (e.g. miguel rejected 2025-10-20). "
            f"Got data={data}"
        )

    def test_current_year_approved_still_visible(self, miguel_headers):
        r = requests.get(f"{BASE_URL}/api/vacations/my-requests", headers=miguel_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        approved_current = [
            req for req in data
            if req.get("status") == "approved"
            and req.get("start_date", "0000")[:4].isdigit()
            and int(req["start_date"][:4]) >= CURRENT_YEAR
        ]
        assert len(approved_current) >= 1, f"Expected approved requests from {CURRENT_YEAR} for miguel; got {data}"


class TestAllBalancesYearFilter:
    """GET /api/admin/vacations/all-balances"""

    def test_endpoint_ok(self, miguel_headers):
        r = requests.get(f"{BASE_URL}/api/admin/vacations/all-balances", headers=miguel_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_no_approved_request_from_previous_years_in_any_user(self, miguel_headers):
        r = requests.get(f"{BASE_URL}/api/admin/vacations/all-balances", headers=miguel_headers, timeout=30)
        assert r.status_code == 200
        users = r.json()
        leaks = []
        for ub in users:
            for req in ub.get("approved_requests", []) or []:
                sd = req.get("start_date", "")
                if sd[:4].isdigit() and int(sd[:4]) < CURRENT_YEAR:
                    leaks.append({"user": ub.get("username"), "req": req})
        assert leaks == [], f"Approved entries from past years should not be returned: {leaks}"

    def test_miguel_has_approved_current_year_entries(self, miguel_headers):
        r = requests.get(f"{BASE_URL}/api/admin/vacations/all-balances", headers=miguel_headers, timeout=30)
        users = r.json()
        miguel = next((u for u in users if u.get("username") == "miguel"), None)
        assert miguel is not None, "miguel not in all-balances"
        ar = miguel.get("approved_requests", []) or []
        # all entries must be current year
        for req in ar:
            assert int(req["start_date"][:4]) >= CURRENT_YEAR


class TestVacationBalanceUnchanged:
    """Saldo deve continuar a refletir histórico (não é alterado pelo filtro)."""

    def test_balance_endpoint_ok(self, miguel_headers):
        r = requests.get(f"{BASE_URL}/api/vacations/balance", headers=miguel_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ("days_earned", "days_taken", "days_available", "year"):
            assert key in data, f"missing key {key} in balance response: {data}"
        assert isinstance(data["days_earned"], (int, float))
        assert isinstance(data["days_taken"], (int, float))
        assert isinstance(data["days_available"], (int, float))
