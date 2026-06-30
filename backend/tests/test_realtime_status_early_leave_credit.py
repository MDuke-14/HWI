"""
Tests for the realtime-status endpoints when virtual early_leave_credit entries exist.

Bug: GET /api/admin/realtime-status returned 500 because:
  - completed_entries included virtual credit entries with start_time=None / end_time=None
  - min(...)/max(...) on these compared str with None -> TypeError

Fix verified:
  (a) Mongo query excludes is_early_leave_credit=true entries from all_entries
  (b) min/max uses `x.get("start_time") or ""` defensive key
  (c) clock_in/out + geo computed only over real_entries (non-credit)

Same exclusion applied in /time-entries/my-realtime-status.
"""
import os
import pytest
import requests
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL", "")
# Backend URL must come from env: read frontend/.env if not present
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
                break

BASE_URL = BASE_URL.rstrip("/")

MIGUEL_ID = "92e60254-5bae-4fd7-ad44-7b2f5f4bcc60"
MIGUEL_USER = "miguel"
MIGUEL_PASS = "Miguel123!"

TEST_OBS = "Test credit"


@pytest.fixture(scope="module")
def miguel_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": MIGUEL_USER, "password": MIGUEL_PASS},
        timeout=20,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(miguel_token):
    return {"Authorization": f"Bearer {miguel_token}"}


def _today():
    return datetime.now().strftime("%Y-%m-%d")


def test_admin_realtime_status_with_credit_returns_200(headers):
    """Endpoint must return 200 even when miguel has a virtual credit entry today."""
    r = requests.get(f"{BASE_URL}/api/admin/realtime-status", headers=headers, timeout=20)
    assert r.status_code == 200, f"Expected 200 but got {r.status_code}: {r.text[:500]}"
    data = r.json()
    assert "users" in data, f"Response missing 'users': {data}"
    assert isinstance(data["users"], list)
    assert data.get("date") == _today()


def test_admin_realtime_status_miguel_credit_not_in_entradas(headers):
    """Credit entry (no start/end times) must NOT appear in miguel's 'entradas' array."""
    r = requests.get(f"{BASE_URL}/api/admin/realtime-status", headers=headers, timeout=20)
    assert r.status_code == 200
    miguel = next((u for u in r.json()["users"] if u["user_id"] == MIGUEL_ID), None)
    assert miguel is not None, "Miguel not found in users array"

    entradas = miguel.get("entradas", [])
    # Every entry in 'entradas' must have valid inicio/start_time (not from credit)
    for e in entradas:
        # Credit entries had start_time=None; if a None one slipped through, fail
        assert e.get("start_time") is not None or e.get("inicio") is not None, \
            f"Credit entry leaked into entradas: {e}"


def test_admin_realtime_status_miguel_clock_in_out_from_real_entries(headers):
    """clock_in_time / clock_out_time should come from REAL entries (not credit)."""
    r = requests.get(f"{BASE_URL}/api/admin/realtime-status", headers=headers, timeout=20)
    assert r.status_code == 200
    miguel = next((u for u in r.json()["users"] if u["user_id"] == MIGUEL_ID), None)
    assert miguel is not None

    # Miguel has both real entries and credit entries today => status TRABALHOU
    assert miguel["status"] in ("TRABALHOU", "TRABALHANDO"), f"Unexpected status: {miguel}"
    # When status TRABALHOU, clock_in_time should exist (real entries available)
    if miguel["status"] == "TRABALHOU":
        assert miguel.get("clock_in_time") is not None, \
            f"clock_in_time should be from real entries, got: {miguel}"
        assert miguel.get("clock_out_time") is not None, \
            f"clock_out_time should be from real entries, got: {miguel}"
        # NOTE: current implementation excludes credit from all_entries entirely (via Mongo $or),
        # so credit 0.5h does NOT contribute to total_hours in realtime-status. This is consistent
        # with not showing it in entradas. The clock_in/out is correctly derived from real entries.
        assert isinstance(miguel.get("total_hours", 0), (int, float))


def test_my_realtime_status_excludes_credit_entry(headers):
    """GET /api/time-entries/my-realtime-status must not include credit entries."""
    r = requests.get(f"{BASE_URL}/api/time-entries/my-realtime-status", headers=headers, timeout=20)
    assert r.status_code == 200, f"Expected 200 but got {r.status_code}: {r.text[:500]}"
    data = r.json()
    assert "entradas" in data
    for e in data["entradas"]:
        # All entries from credit have inicio/fim == None; assert real entries only
        assert e.get("inicio") is not None, f"Credit entry leaked: {e}"


def test_my_realtime_status_returns_200(headers):
    r = requests.get(f"{BASE_URL}/api/time-entries/my-realtime-status", headers=headers, timeout=20)
    assert r.status_code == 200


def test_monthly_detailed_regression_miguel(headers):
    """Regression: monthly-detailed must still work for miguel (previous fix)."""
    today = datetime.now()
    r = requests.get(
        f"{BASE_URL}/api/time-entries/reports/monthly-detailed",
        params={"year": today.year, "month": today.month, "user_id": MIGUEL_ID},
        headers=headers,
        timeout=30,
    )
    assert r.status_code == 200, f"monthly-detailed regressed: {r.status_code} {r.text[:500]}"


def test_monthly_detailed_regression_teste(headers):
    """Regression: monthly-detailed for second admin too."""
    # Use miguel's admin token to fetch teste's report
    teste_id = "c145d94b-bb5f-4fe1-b05d-6fa1034db968"
    today = datetime.now()
    r = requests.get(
        f"{BASE_URL}/api/time-entries/reports/monthly-detailed",
        params={"year": today.year, "month": today.month, "user_id": teste_id},
        headers=headers,
        timeout=30,
    )
    assert r.status_code == 200, f"monthly-detailed (teste) failed: {r.status_code} {r.text[:500]}"


def test_admin_realtime_status_after_deleting_credit(headers):
    """Edge: delete the test credit entry, re-call endpoint => 200, no regression.

    This test is run AFTER the previous tests so the credit entry still exists during them.
    It uses direct DB cleanup, then verifies endpoint still responds 200.
    """
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")

    async def cleanup_and_check():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        res = await db.time_entries.delete_many({
            "user_id": MIGUEL_ID,
            "date": _today(),
            "is_early_leave_credit": True,
            "observations": TEST_OBS,
        })
        client.close()
        return res.deleted_count

    deleted = asyncio.run(cleanup_and_check())
    assert deleted >= 1, f"Expected to delete >=1 credit entry, deleted {deleted}"

    # Now re-call admin endpoint
    r = requests.get(f"{BASE_URL}/api/admin/realtime-status", headers=headers, timeout=20)
    assert r.status_code == 200, f"After credit deletion, endpoint failed: {r.status_code} {r.text[:500]}"
    miguel = next((u for u in r.json()["users"] if u["user_id"] == MIGUEL_ID), None)
    assert miguel is not None
    # Now total_hours should NOT include the 0.5 credit anymore (real entries only)
    if miguel.get("status") == "TRABALHOU":
        # real entries are all 0h total => total_hours could be 0
        assert miguel.get("clock_in_time") is not None


def test_admin_realtime_status_no_entries_user_status_falta(headers):
    """Edge: a user with NO entries today should have status FALTA / FOLGA / FERIADO / FÉRIAS."""
    r = requests.get(f"{BASE_URL}/api/admin/realtime-status", headers=headers, timeout=20)
    assert r.status_code == 200
    data = r.json()
    valid_no_entry_statuses = {"FALTA", "FOLGA", "FERIADO", "FÉRIAS"}
    no_entry_users = [
        u for u in data["users"]
        if not u.get("entradas") and u.get("status") in valid_no_entry_statuses
    ]
    # At least the non-active users should yield a sensible status
    for u in data["users"]:
        if not u.get("entradas"):
            assert u.get("status") in valid_no_entry_statuses, \
                f"User {u['username']} has no entradas but unexpected status {u.get('status')}"
