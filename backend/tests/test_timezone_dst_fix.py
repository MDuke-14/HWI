"""
Test timezone / DST fix for time-entries.

Verifies:
- POST /api/time-entries/start with client_time stores correct local time
- POST /api/time-entries/end with client_time stores correct end time and duration
- GET /api/time-entries/today returns entries for today's local date
- GET /api/admin/realtime-status returns clock_in/out in Lisbon local time
- GET /api/my-realtime-status returns inicio/fim in local time
- Fallback to Europe/Lisbon when no client_time provided
"""
import os
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://field-clock.preview.emergentagent.com").rstrip("/")

TEST_USER = {"username": "teste@email.com", "password": "teste"}
ADMIN_USER = {"username": "pedro", "password": "teste"}


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def test_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json=TEST_USER)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture
def auth_headers(test_token):
    return {"Authorization": f"Bearer {test_token}", "Content-Type": "application/json"}


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _extract_entries(resp_json):
    """Extract entries list from today endpoint response. The endpoint returns
    different shapes: a single active entry dict, a dict with 'entries', or list.
    """
    if isinstance(resp_json, list):
        return [e for e in resp_json if isinstance(e, dict)]
    if isinstance(resp_json, dict):
        if "entries" in resp_json:
            return resp_json.get("entries") or []
        if "id" in resp_json and "status" in resp_json:
            # single active entry shape
            return [resp_json]
        return resp_json.get("data") or []
    return []


def _cleanup_active(headers):
    """End any active entry so the test can start fresh."""
    import pytz
    lisbon = pytz.timezone("Europe/Lisbon")
    for _ in range(3):
        r = requests.get(f"{BASE_URL}/api/time-entries/today", headers=headers)
        if r.status_code != 200:
            return
        active = [e for e in _extract_entries(r.json()) if isinstance(e, dict) and e.get("status") == "active"]
        if not active:
            return
        for e in active:
            requests.post(
                f"{BASE_URL}/api/time-entries/end/{e['id']}",
                headers=headers,
                json={"client_time": datetime.now(lisbon).replace(microsecond=0).isoformat()},
            )


def _extract_start_entry(resp_json):
    """Start endpoint returns {'entry': {...}, 'message': '...'} or just the entry dict."""
    if isinstance(resp_json, dict):
        if "entry" in resp_json and isinstance(resp_json["entry"], dict):
            return resp_json["entry"]
        return resp_json
    return {}


def _extract_end_entry(resp_json):
    """End endpoint may return {'entry': {...}, ...} or the entry directly, or a list for split entries."""
    if isinstance(resp_json, dict):
        if "entry" in resp_json and isinstance(resp_json["entry"], dict):
            return resp_json["entry"]
        if "entries" in resp_json and isinstance(resp_json["entries"], list) and resp_json["entries"]:
            # Use last completed
            for e in reversed(resp_json["entries"]):
                if isinstance(e, dict) and e.get("total_hours") is not None:
                    return e
            return resp_json["entries"][-1]
        return resp_json
    return {}


# ---------------- Tests ----------------
class TestLogin:
    def test_login_teste_user(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login", json=TEST_USER)
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["user"]["username"] == "teste@email.com"

    def test_login_admin_user(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert r.status_code == 200
        assert "access_token" in r.json()


class TestTimeEntryStartClientTime:
    """Verify client_time is respected on start."""

    def test_start_with_client_time_stores_local(self, auth_headers):
        _cleanup_active(auth_headers)
        # Simulate Portuguese summer time: 09:00 local (+01:00)
        client_time = "2026-04-20T09:00:00+01:00"
        r = requests.post(
            f"{BASE_URL}/api/time-entries/start",
            headers=auth_headers,
            json={"client_time": client_time, "observations": "TEST_tz_fix"},
        )
        assert r.status_code == 200, f"Unexpected status: {r.status_code} {r.text}"
        data = _extract_start_entry(r.json())
        assert data.get("status") == "active"
        # date should be derived from local
        assert data.get("date") == "2026-04-20", f"date field is {data.get('date')}"
        # start_time should preserve offset or at least represent 09:00 local
        start_time = data.get("start_time")
        assert start_time is not None
        # Parse and check
        dt = datetime.fromisoformat(str(start_time).replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            # Convert to +01:00 and check hour
            import pytz
            lisbon = pytz.timezone("Europe/Lisbon")
            dt_local = dt.astimezone(lisbon)
            # In April 2026 Lisbon is UTC+1 (summer time)
            assert dt_local.hour == 9, f"Expected 09 hour local, got {dt_local.hour} ({start_time})"
            assert dt_local.minute == 0

        # cleanup
        _cleanup_active(auth_headers)

    def test_start_fallback_to_lisbon(self, auth_headers):
        """No client_time provided -> backend should use Europe/Lisbon."""
        _cleanup_active(auth_headers)
        r = requests.post(
            f"{BASE_URL}/api/time-entries/start",
            headers=auth_headers,
            json={"observations": "TEST_tz_fallback"},
        )
        assert r.status_code == 200, r.text
        data = _extract_start_entry(r.json())
        # date must be today's Lisbon local date
        import pytz
        lisbon = pytz.timezone("Europe/Lisbon")
        today_lisbon = datetime.now(lisbon).strftime("%Y-%m-%d")
        assert data.get("date") == today_lisbon, f"Expected {today_lisbon}, got {data.get('date')}"

        entry_id = data["id"]
        # Verify start_time when parsed in Lisbon is close to now Lisbon
        dt = datetime.fromisoformat(str(data["start_time"]).replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            dt_local = dt.astimezone(lisbon)
            now_local = datetime.now(lisbon)
            delta_min = abs((dt_local.replace(tzinfo=None) - now_local.replace(tzinfo=None)).total_seconds()) / 60
            assert delta_min < 5, f"Stored time too far from now: {dt_local} vs {now_local}"

        _cleanup_active(auth_headers)


class TestTimeEntryEndClientTime:
    def test_end_with_client_time_calculates_correct_hours(self, auth_headers):
        _cleanup_active(auth_headers)
        # Start at 09:00 +01:00
        start_ct = "2026-04-20T09:00:00+01:00"
        r = requests.post(
            f"{BASE_URL}/api/time-entries/start",
            headers=auth_headers,
            json={"client_time": start_ct, "observations": "TEST_end_hours"},
        )
        assert r.status_code == 200, r.text
        entry_id = _extract_start_entry(r.json())["id"]

        # End at 17:00 +01:00 -> 8 hours
        end_ct = "2026-04-20T17:00:00+01:00"
        r = requests.post(
            f"{BASE_URL}/api/time-entries/end/{entry_id}",
            headers=auth_headers,
            json={"client_time": end_ct},
        )
        assert r.status_code == 200, f"end failed: {r.status_code} {r.text}"
        entry = _extract_end_entry(r.json())
        total_hours = entry.get("total_hours")
        assert total_hours is not None, f"no total_hours in response: {r.json()}"
        assert abs(total_hours - 8.0) < 0.05, f"Expected ~8.0 total_hours, got {total_hours}"

    def test_end_fallback_when_no_client_time(self, auth_headers):
        _cleanup_active(auth_headers)
        # Start with client_time ~5 minutes ago local
        import pytz
        lisbon = pytz.timezone("Europe/Lisbon")
        from datetime import timedelta
        start_dt = (datetime.now(lisbon) - timedelta(minutes=5)).replace(microsecond=0)
        r = requests.post(
            f"{BASE_URL}/api/time-entries/start",
            headers=auth_headers,
            json={"client_time": start_dt.isoformat(), "observations": "TEST_end_fallback"},
        )
        assert r.status_code == 200, r.text
        entry_id = _extract_start_entry(r.json())["id"]

        # End without client_time
        r = requests.post(
            f"{BASE_URL}/api/time-entries/end/{entry_id}",
            headers=auth_headers,
            json={},
        )
        assert r.status_code == 200, r.text
        entry = _extract_end_entry(r.json())
        total_hours = entry.get("total_hours")
        assert total_hours is not None
        # Should be ~5 minutes = 0.08 hours
        assert 0.0 <= total_hours <= 0.2, f"Unexpected total_hours: {total_hours}"


class TestGetTodayLocalDate:
    def test_today_uses_local_date(self, auth_headers):
        _cleanup_active(auth_headers)
        # Start now (Lisbon local)
        import pytz
        lisbon = pytz.timezone("Europe/Lisbon")
        now = datetime.now(lisbon).replace(microsecond=0)
        r = requests.post(
            f"{BASE_URL}/api/time-entries/start",
            headers=auth_headers,
            json={"client_time": now.isoformat(), "observations": "TEST_today"},
        )
        assert r.status_code == 200, r.text

        r = requests.get(f"{BASE_URL}/api/time-entries/today", headers=auth_headers)
        assert r.status_code == 200
        entries = _extract_entries(r.json())
        assert isinstance(entries, list)
        today_local = now.strftime("%Y-%m-%d")
        # All returned entries should be for today local date
        for e in entries:
            assert e.get("date") == today_local, f"Entry {e.get('id')} has date {e.get('date')}, expected {today_local}"

        _cleanup_active(auth_headers)


class TestRealtimeStatusLocalTime:
    def test_my_realtime_status_local_time(self, auth_headers):
        _cleanup_active(auth_headers)
        import pytz
        lisbon = pytz.timezone("Europe/Lisbon")
        now = datetime.now(lisbon).replace(microsecond=0)
        r = requests.post(
            f"{BASE_URL}/api/time-entries/start",
            headers=auth_headers,
            json={"client_time": now.isoformat(), "observations": "TEST_rt"},
        )
        assert r.status_code == 200, r.text

        r = requests.get(f"{BASE_URL}/api/time-entries/my-realtime-status", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        inicio = data.get("inicio") or data.get("inicio_time") or data.get("clock_in_time")
        if inicio:
            # Should be HH:MM matching local now hour
            assert ":" in str(inicio)
            # Parse HH
            try:
                hour = int(str(inicio).split(":")[0])
                assert abs(hour - now.hour) <= 1, f"hour mismatch: {hour} vs {now.hour}"
            except ValueError:
                pass

        _cleanup_active(auth_headers)

    def test_admin_realtime_status_local_time(self, auth_headers, admin_headers):
        _cleanup_active(auth_headers)
        import pytz
        lisbon = pytz.timezone("Europe/Lisbon")
        now = datetime.now(lisbon).replace(microsecond=0)
        r = requests.post(
            f"{BASE_URL}/api/time-entries/start",
            headers=auth_headers,
            json={"client_time": now.isoformat(), "observations": "TEST_admin_rt"},
        )
        assert r.status_code == 200, r.text

        r = requests.get(f"{BASE_URL}/api/admin/realtime-status", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        # Find our test user
        users_list = data if isinstance(data, list) else data.get("users") or data.get("data") or []
        found = None
        for u in users_list:
            if u.get("username") == "teste@email.com" or u.get("user_id"):
                if u.get("clock_in_time") or u.get("status") == "active":
                    found = u
                    break

        if found and found.get("clock_in_time"):
            cin = str(found["clock_in_time"])
            assert ":" in cin, f"clock_in_time not HH:MM: {cin}"
            hour = int(cin.split(":")[0])
            assert abs(hour - now.hour) <= 1, f"Admin clock_in hour mismatch: {hour} vs {now.hour}"

        _cleanup_active(auth_headers)


class TestDSTEdgeCases:
    def test_duration_across_offsets(self, auth_headers):
        """Start at 10:00 +01:00, End at 12:30 +01:00 -> 2.5h."""
        _cleanup_active(auth_headers)
        r = requests.post(
            f"{BASE_URL}/api/time-entries/start",
            headers=auth_headers,
            json={"client_time": "2026-05-15T10:00:00+01:00", "observations": "TEST_dur"},
        )
        assert r.status_code == 200, r.text
        entry_id = _extract_start_entry(r.json())["id"]

        r = requests.post(
            f"{BASE_URL}/api/time-entries/end/{entry_id}",
            headers=auth_headers,
            json={"client_time": "2026-05-15T12:30:00+01:00"},
        )
        assert r.status_code == 200, r.text
        entry = _extract_end_entry(r.json())
        total = entry.get("total_hours")
        assert total is not None
        assert abs(total - 2.5) < 0.05, f"Expected 2.5h, got {total}"
