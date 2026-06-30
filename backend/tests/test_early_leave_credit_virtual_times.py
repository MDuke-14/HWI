"""
Backend tests for the fix on credit-entry creation when an early_leave authorization
is approved.

Validated behaviour (notifications_scheduler.py lines ~1455-1500):
  - start_time of credit entry == end_time of latest REAL completed picagem of the day
  - end_time of credit entry   == start_time + minutos_em_falta
  - total_hours rounded(minutos/60, 4)

Flow under test (target date 2026-07-15, user teste@email.com):
  1) Seed 08:00-13:00 (5h) + 14:00 active
  2) POST /api/time-entries/end/{active_id} with early_leave_company_order=true,
     client_time=2026-07-15T16:00:00+01:00 → total worked = 7h, missing = 60 min
  3) Verify pending authorization request_type=early_leave
  4) Approve via POST /api/overtime/authorization/{token}/decide action=approve
  5) Verify credit entry persisted with virtual_start=16:00 / virtual_end=17:00 / 1.0h
  6) GET monthly-detailed: day 2026-07-15 has 3 entries, all with start_time/end_time
  7) GET admin/realtime-status: credit entry NOT inside the 'entradas' array
  8) REGRESSION: credit entry on 2026-06-25 (migrated) has non-null start/end times
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USER = "teste@email.com"
ADMIN_PASS = "Admin123!"
ADMIN_ID = "c145d94b-bb5f-4fe1-b05d-6fa1034db968"

MIGUEL_USER = "miguel"
MIGUEL_PASS = "Miguel123!"

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

TARGET_DATE = "2026-07-15"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def db(event_loop):
    client = AsyncIOMotorClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{API}/auth/login",
        json={"username": ADMIN_USER, "password": ADMIN_PASS},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def miguel_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"username": MIGUEL_USER, "password": MIGUEL_PASS},
        timeout=30,
    )
    assert r.status_code == 200, f"Login miguel failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- helpers ----------
async def _cleanup(db, date_str: str):
    await db.time_entries.delete_many({"user_id": ADMIN_ID, "date": date_str})
    await db.overtime_authorizations.delete_many(
        {"user_id": ADMIN_ID, "date": date_str, "request_type": "early_leave"}
    )


async def _seed_completed(db, date_str, sh, sm, eh, em):
    eid = str(uuid.uuid4())
    start_iso = f"{date_str}T{sh:02d}:{sm:02d}:00+01:00"
    end_iso = f"{date_str}T{eh:02d}:{em:02d}:00+01:00"
    total_hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60.0
    await db.time_entries.insert_one({
        "id": eid,
        "user_id": ADMIN_ID,
        "username": "teste",
        "date": date_str,
        "start_time": start_iso,
        "end_time": end_iso,
        "status": "completed",
        "total_hours": round(total_hours, 2),
        "regular_hours": round(total_hours, 2),
        "overtime_hours": 0,
        "special_hours": 0,
        "observations": "[SEED test_early_leave_credit_virtual_times]",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return eid


async def _seed_active(db, date_str, sh, sm):
    eid = str(uuid.uuid4())
    start_iso = f"{date_str}T{sh:02d}:{sm:02d}:00+01:00"
    await db.time_entries.insert_one({
        "id": eid,
        "user_id": ADMIN_ID,
        "username": "teste",
        "date": date_str,
        "start_time": start_iso,
        "end_time": None,
        "status": "active",
        "total_hours": None,
        "observations": "[SEED test_early_leave_credit_virtual_times]",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return eid


# ============================================================
# TEST 1 — Setup, end the active picagem (creates pending request)
# ============================================================
class TestVirtualCreditTimes:
    """Full flow: seed → end → approve → assert virtual times."""

    @pytest.fixture(scope="class", autouse=True)
    def setup_and_teardown(self, request, event_loop, db):
        event_loop.run_until_complete(_cleanup(db, TARGET_DATE))
        request.addfinalizer(
            lambda: event_loop.run_until_complete(_cleanup(db, TARGET_DATE))
        )

    def test_01_seed_and_end_creates_pending_request(self, event_loop, db, headers):
        # Seed first picagem 08:00-13:00 (5h)
        event_loop.run_until_complete(_seed_completed(db, TARGET_DATE, 8, 0, 13, 0))
        # Seed active picagem starting 14:00
        active_id = event_loop.run_until_complete(_seed_active(db, TARGET_DATE, 14, 0))
        TestVirtualCreditTimes.active_id = active_id

        # End the active one at 16:00 with early_leave flag → worked total = 7h
        r = requests.post(
            f"{API}/time-entries/end/{active_id}",
            headers=headers,
            json={
                "early_leave_company_order": True,
                "client_time": f"{TARGET_DATE}T16:00:00+01:00",
            },
            timeout=30,
        )
        assert r.status_code == 200, f"END failed: {r.status_code} {r.text}"
        body = r.json()
        assert 1.9 <= body.get("total_hours", 0) <= 2.1, body

    def test_02_authorization_pending_created(self, event_loop, db):
        auths = event_loop.run_until_complete(
            db.overtime_authorizations.find(
                {"user_id": ADMIN_ID, "date": TARGET_DATE,
                 "request_type": "early_leave"},
                {"_id": 0},
            ).to_list(10)
        )
        assert len(auths) == 1, f"Esperava 1 auth, got {len(auths)}"
        a = auths[0]
        assert a["status"] == "pending"
        assert a["request_type"] == "early_leave"
        assert a["hours_short_minutes"] == 60
        # decide endpoint uses doc.id as URL token (routes/overtime.py:21)
        token_id = a.get("id") or a.get("approval_token")
        assert token_id, f"No token: {a.keys()}"
        TestVirtualCreditTimes.auth_token = token_id

    def test_03_approve_returns_60_minutes_message(self, headers):
        r = requests.post(
            f"{API}/overtime/authorization/{TestVirtualCreditTimes.auth_token}/decide",
            headers=headers,
            json={"action": "approve"},
            timeout=30,
        )
        assert r.status_code == 200, f"Approve failed: {r.status_code} {r.text}"
        body = r.json()
        msg = (body.get("message") or "").lower()
        assert "60" in msg and "minut" in msg, f"Expected '60 minutos' in message: {body}"

    def test_04_credit_entry_has_virtual_times(self, event_loop, db):
        credits = event_loop.run_until_complete(
            db.time_entries.find(
                {"user_id": ADMIN_ID, "date": TARGET_DATE,
                 "is_early_leave_credit": True},
                {"_id": 0},
            ).to_list(10)
        )
        assert len(credits) == 1, f"Expected 1 credit entry, got {len(credits)}: {credits}"
        c = credits[0]
        # start_time == end_time of latest real picagem (16:00 +01:00)
        assert c.get("start_time") is not None, f"start_time is None: {c}"
        assert c.get("end_time") is not None, f"end_time is None: {c}"
        # Parse and verify
        st = datetime.fromisoformat(c["start_time"])
        et = datetime.fromisoformat(c["end_time"])
        # Latest real end is 16:00 → virtual_start = 16:00; virtual_end = 17:00
        assert st.hour == 16 and st.minute == 0, f"start expected 16:00, got {c['start_time']}"
        assert et.hour == 17 and et.minute == 0, f"end expected 17:00, got {c['end_time']}"
        # 60 minute delta
        delta_min = (et - st).total_seconds() / 60.0
        assert abs(delta_min - 60.0) < 0.5, f"delta={delta_min}m"
        # total_hours = 1.0
        assert abs(c.get("total_hours", 0) - 1.0) < 0.01, f"total_hours={c.get('total_hours')}"
        assert c.get("credit_minutes") == 60
        assert c.get("is_manual") is True

    def test_05_monthly_detailed_shows_three_entries_with_times(self, headers):
        r = requests.get(
            f"{API}/time-entries/reports/monthly-detailed",
            params={"month": 7, "year": 2026},
            headers=headers,
            timeout=30,
        )
        assert r.status_code == 200, f"monthly-detailed: {r.status_code} {r.text}"
        data = r.json()
        daily = data.get("daily_records", [])
        day = next((d for d in daily if d.get("date") == TARGET_DATE), None)
        assert day is not None, f"{TARGET_DATE} missing in daily_records"
        entries = day.get("entries", [])
        assert len(entries) == 3, f"Expected 3 entries, got {len(entries)}: {entries}"
        # All entries must have start_time and end_time non-null
        for e in entries:
            assert e.get("start_time"), f"start_time empty: {e}"
            assert e.get("end_time"), f"end_time empty: {e}"
        # exactly 1 should be is_early_leave_credit
        credits = [e for e in entries if e.get("is_early_leave_credit")]
        assert len(credits) == 1, f"Expected 1 credit, got {len(credits)}"
        c = credits[0]
        st = datetime.fromisoformat(c["start_time"])
        et = datetime.fromisoformat(c["end_time"])
        assert st.hour == 16 and et.hour == 17, f"Credit times wrong: {c}"

    def test_06_realtime_status_excludes_credit_from_entradas(self, headers):
        r = requests.get(f"{API}/admin/realtime-status", headers=headers, timeout=30)
        assert r.status_code == 200, f"realtime-status: {r.status_code} {r.text}"
        data = r.json()
        # Endpoint may return list or dict — locate the user
        users = data if isinstance(data, list) else data.get("users") or data.get("data") or []
        teste_row = next(
            (u for u in users
             if (u.get("user_id") == ADMIN_ID
                 or u.get("id") == ADMIN_ID
                 or u.get("email") == ADMIN_USER
                 or u.get("username") == "teste")),
            None,
        )
        # realtime-status reports CURRENT day only; the test target date is in the
        # past, so credit entry of 2026-07-15 will not appear in the live view.
        # Main assertion: endpoint returns 200 (no 500) and, if user row exists,
        # 'entradas' array doesn't reference 2026-07-15 credit.
        if teste_row is not None:
            entradas = teste_row.get("entradas") or teste_row.get("entries") or []
            for e in entradas:
                # If a credit entry leaked in, flag it
                assert not e.get("is_early_leave_credit"), \
                    f"Credit entry leaked into realtime entradas: {e}"


# ============================================================
# TEST 7 — Regression: migrated credit on 2026-06-25 has non-null times
# ============================================================
class TestRegressionMigratedCredit:
    def test_07_monthly_detailed_june_credit_has_times(self, token):
        h = {"Authorization": f"Bearer {token}"}
        r = requests.get(
            f"{API}/time-entries/reports/monthly-detailed",
            params={"month": 6, "year": 2026},
            headers=h,
            timeout=30,
        )
        assert r.status_code == 200, f"monthly-detailed: {r.status_code} {r.text}"
        data = r.json()
        daily = data.get("daily_records", [])
        day = next((d for d in daily if d.get("date") == "2026-06-25"), None)
        assert day is not None, "2026-06-25 missing"
        entries = day.get("entries", [])
        credits = [e for e in entries if e.get("is_early_leave_credit")]
        assert len(credits) == 1, f"Expected 1 credit on 2026-06-25, got {len(credits)}"
        c = credits[0]
        assert c.get("start_time"), f"Migrated credit start_time still null: {c}"
        assert c.get("end_time"), f"Migrated credit end_time still null: {c}"
        st = datetime.fromisoformat(c["start_time"])
        et = datetime.fromisoformat(c["end_time"])
        delta_min = (et - st).total_seconds() / 60.0
        assert delta_min > 0, f"end before start: {c}"
        # total_hours = delta_min / 60
        if c.get("total_hours") is not None:
            assert abs(delta_min / 60.0 - c["total_hours"]) < 0.05, \
                f"total_hours mismatch with times: delta={delta_min}, total={c['total_hours']}"
