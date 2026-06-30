"""
Tests for fix: GET /api/time-entries/reports/monthly-detailed returning HTTP 500
due to TypeError when sorting entries with start_time=None (early_leave_credit
entries). Validates the fix at lines 1209, 1433, 1726 of routes/time_entries.py
and the enrichment of entries with is_early_leave_credit / authorized_by.
"""
import os
import asyncio
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_TESTE_USERNAME = "teste@email.com"
ADMIN_TESTE_PASSWORD = "Admin123!"
ADMIN_MIGUEL_USERNAME = "miguel"
ADMIN_MIGUEL_PASSWORD = "Miguel123!"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, username, password):
    r = session.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {username}: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token in login response: {r.json()}"
    return token


@pytest.fixture(scope="module")
def token_teste(session):
    return _login(session, ADMIN_TESTE_USERNAME, ADMIN_TESTE_PASSWORD)


@pytest.fixture(scope="module")
def token_miguel(session):
    return _login(session, ADMIN_MIGUEL_USERNAME, ADMIN_MIGUEL_PASSWORD)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- Tests: monthly-detailed for teste@email.com ----------------
class TestMonthlyDetailedTesteUser:
    def test_default_no_params_returns_200(self, session, token_teste):
        """GET monthly-detailed without params (current month) should return 200."""
        r = session.get(f"{API}/time-entries/reports/monthly-detailed",
                        headers=_auth(token_teste), timeout=30)
        assert r.status_code == 200, f"Status {r.status_code}: {r.text}"
        data = r.json()
        assert "daily_records" in data, f"Missing daily_records: {list(data.keys())}"
        assert isinstance(data["daily_records"], list)

    def test_month_6_year_2026_returns_credit_entry(self, session, token_teste):
        """
        For teste@email.com, June 2026 should contain entry 2026-06-25 with
        3 entries: 2 normais + 1 com is_early_leave_credit=true, total_hours=1.0,
        authorized_by='teste@email.com'.
        """
        r = session.get(f"{API}/time-entries/reports/monthly-detailed",
                        params={"month": 6, "year": 2026},
                        headers=_auth(token_teste), timeout=30)
        assert r.status_code == 200, f"Status {r.status_code}: {r.text}"
        data = r.json()
        daily = data.get("daily_records", [])
        # Find 2026-06-25
        day_25 = next((d for d in daily if d.get("date") == "2026-06-25"), None)
        assert day_25 is not None, f"2026-06-25 not in daily_records. Dates: {[d.get('date') for d in daily]}"
        entries = day_25.get("entries", [])
        assert len(entries) == 3, f"Expected 3 entries on 2026-06-25, got {len(entries)}: {entries}"
        # Identify credit entry
        credit_entries = [e for e in entries if e.get("is_early_leave_credit") is True]
        assert len(credit_entries) == 1, f"Expected exactly 1 credit entry, got {len(credit_entries)}: {entries}"
        credit = credit_entries[0]
        assert credit.get("total_hours") == 1.0, f"Credit total_hours expected 1.0, got {credit.get('total_hours')}"
        assert credit.get("authorized_by") == "teste@email.com", \
            f"authorized_by expected teste@email.com, got {credit.get('authorized_by')}"
        # Normal entries should NOT have is_early_leave_credit = True
        normal = [e for e in entries if not e.get("is_early_leave_credit")]
        assert len(normal) == 2, f"Expected 2 normal entries, got {len(normal)}"
        # Check normal entries have start_time
        for n in normal:
            assert n.get("start_time"), f"Normal entry missing start_time: {n}"

    def test_other_months_no_credit_still_work(self, session, token_teste):
        """Months 5 and 7 of 2026 (without credit entries) should still return 200."""
        for month in (5, 7):
            r = session.get(f"{API}/time-entries/reports/monthly-detailed",
                            params={"month": month, "year": 2026},
                            headers=_auth(token_teste), timeout=30)
            assert r.status_code == 200, f"Month {month}: {r.status_code} {r.text}"
            data = r.json()
            assert "daily_records" in data
            assert isinstance(data["daily_records"], list)


# ---------------- Tests: monthly-detailed for miguel ----------------
class TestMonthlyDetailedMiguel:
    def test_miguel_no_credit_entries_still_200(self, session, token_miguel):
        r = session.get(f"{API}/time-entries/reports/monthly-detailed",
                        headers=_auth(token_miguel), timeout=30)
        assert r.status_code == 200, f"Status {r.status_code}: {r.text}"
        data = r.json()
        assert "daily_records" in data

    def test_miguel_june_2026(self, session, token_miguel):
        r = session.get(f"{API}/time-entries/reports/monthly-detailed",
                        params={"month": 6, "year": 2026},
                        headers=_auth(token_miguel), timeout=30)
        assert r.status_code == 200, f"Status {r.status_code}: {r.text}"


# ---------------- Tests: regression on custom-range and monthly-pdf ----------------
class TestRegressionRelatedEndpoints:
    def test_custom_range_endpoint_works_with_credit_month(self, session, token_teste):
        """Custom range (line 1209) should also handle None start_time entries."""
        r = session.get(f"{API}/time-entries/reports/custom-range",
                        params={"start_date": "2026-06-01", "end_date": "2026-06-30"},
                        headers=_auth(token_teste), timeout=30)
        assert r.status_code == 200, f"custom-range failed: {r.status_code} {r.text}"

    def test_monthly_pdf_endpoint_works(self, session, token_teste):
        """Monthly PDF (line 1726) — verify no 500 error."""
        r = session.get(f"{API}/time-entries/reports/monthly-pdf",
                        params={"month": 6, "year": 2026},
                        headers=_auth(token_teste), timeout=60)
        # PDF endpoint may return 200 (binary) or 4xx but NOT 500
        assert r.status_code != 500, f"monthly-pdf returned 500: {r.text[:500]}"


# ---------------- Edge case: insert extra credit entry, verify ordering ----------------
class TestEdgeCaseExtraCreditEntry:
    """
    Edge case: insert a 2nd credit entry (start_time=None) in 2026-08-15 directly
    in DB. Verify monthly-detailed returns 200 and orders entries (None first).
    """
    INSERTED_ID = "TEST_credit_entry_2026_08_15"
    TARGET_DATE = "2026-08-15"

    @pytest.fixture(scope="class", autouse=True)
    def setup_and_teardown_credit_entry(self, request):
        """Insert credit entry directly in DB then cleanup."""
        async def _setup():
            import motor.motor_asyncio
            mongo_url = os.environ.get("MONGO_URL")
            db_name = os.environ.get("DB_NAME")
            client = motor.motor_asyncio.AsyncIOMotorClient(mongo_url)
            db = client[db_name]
            user = await db.users.find_one({"email": ADMIN_TESTE_USERNAME})
            if not user:
                user = await db.users.find_one({"username": ADMIN_TESTE_USERNAME})
            assert user, f"User {ADMIN_TESTE_USERNAME} not found"
            user_id = user["id"]
            # Insert a credit entry for 2026-08-15 with start_time=None
            await db.time_entries.delete_many({"id": self.INSERTED_ID})
            doc = {
                "id": self.INSERTED_ID,
                "user_id": user_id,
                "date": self.TARGET_DATE,
                "start_time": None,
                "end_time": None,
                "total_hours": 0.5,
                "is_early_leave_credit": True,
                "authorized_by": "teste@email.com",
                "observations": "TEST credit entry edge case",
                "outside_residence_zone": False,
                "created_at": datetime.now(timezone.utc),
            }
            await db.time_entries.insert_one(doc)
            client.close()
            return user_id

        loop = asyncio.new_event_loop()
        try:
            user_id = loop.run_until_complete(_setup())
        finally:
            loop.close()

        def teardown():
            async def _cleanup():
                import motor.motor_asyncio
                client = motor.motor_asyncio.AsyncIOMotorClient(os.environ.get("MONGO_URL"))
                db = client[os.environ.get("DB_NAME")]
                await db.time_entries.delete_many({"id": self.INSERTED_ID})
                client.close()
            l = asyncio.new_event_loop()
            try:
                l.run_until_complete(_cleanup())
            finally:
                l.close()
        request.addfinalizer(teardown)
        return user_id

    def test_august_2026_with_inserted_credit_entry(self, session, token_teste):
        r = session.get(f"{API}/time-entries/reports/monthly-detailed",
                        params={"month": 8, "year": 2026},
                        headers=_auth(token_teste), timeout=30)
        assert r.status_code == 200, f"Status {r.status_code}: {r.text}"
        data = r.json()
        daily = data.get("daily_records", [])
        day_15 = next((d for d in daily if d.get("date") == self.TARGET_DATE), None)
        assert day_15 is not None, f"{self.TARGET_DATE} not found in daily_records"
        entries = day_15.get("entries", [])
        assert len(entries) >= 1, f"Expected at least 1 entry, got {entries}"
        credit = next((e for e in entries if e.get("is_early_leave_credit")), None)
        assert credit is not None, f"Credit entry not found: {entries}"
        assert credit.get("total_hours") == 0.5
        assert credit.get("authorized_by") == "teste@email.com"
        # If multiple entries: credit (None start_time) should be first per "" < "..."
        if len(entries) > 1:
            assert entries[0].get("is_early_leave_credit") is True or entries[0].get("start_time") is None, \
                f"Credit entry should sort first; got order: {[(e.get('start_time'), e.get('is_early_leave_credit')) for e in entries]}"
