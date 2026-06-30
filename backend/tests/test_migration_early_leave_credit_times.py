"""
Backend tests for migration `early_leave_credit_virtual_times_v1`
- Ensures backend is up and migration record is registered.
- Ensures idempotency: restart does not re-run the migration.
- Edge case: inserts a fresh credit entry without start/end and a real
  completed picagem on the same day, deletes the migration record,
  restarts the backend, asserts the new entry got fixed, then cleans up
  (entry deletion + restore of original migration record).
- Regression: /api/admin/realtime-status and /api/time-entries/reports/monthly-detailed return 200.
"""
import os
import re
import time
import uuid
import subprocess
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
MIGRATION_KEY = "early_leave_credit_virtual_times_v1"
BACKEND_LOG = "/var/log/supervisor/backend.err.log"


@pytest.fixture(scope="session")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "teste@email.com", "password": "Admin123!"},
        timeout=30,
    )
    assert r.status_code == 200, f"Login falhou: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _wait_for_backend(timeout=60):
    """Wait for backend /api/health to return 200."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            r = requests.get(f"{BASE_URL}/api/health", timeout=5)
            if r.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(1)
    return False


# ---- Tests --------------------------------------------------------------

def test_backend_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200, r.text


def test_migration_recorded(db):
    rec = db.migrations.find_one({"key": MIGRATION_KEY})
    assert rec is not None, "Migration record nao encontrado em db.migrations"
    assert "fixed_count" in rec, "fixed_count em falta"
    assert "skipped_count" in rec, "skipped_count em falta"
    assert "executed_at" in rec, "executed_at em falta"
    assert isinstance(rec["fixed_count"], int)
    assert isinstance(rec["skipped_count"], int)


def test_idempotency_log_present():
    """Reads supervisor log and confirms the 'ja foi executada' message
    is present (means migration didn't re-run on last restart)."""
    with open(BACKEND_LOG, "r", encoding="utf-8", errors="ignore") as f:
        log = f.read()
    pattern = re.compile(
        r"Migração '" + re.escape(MIGRATION_KEY) + r"' já foi executada"
    )
    assert pattern.search(log), \
        "Idempotency log nao encontrado no backend.err.log apos restart"


def test_regression_endpoints(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r1 = requests.get(f"{BASE_URL}/api/admin/realtime-status", headers=h, timeout=30)
    assert r1.status_code == 200, f"realtime-status: {r1.status_code} {r1.text[:200]}"

    now = datetime.now(timezone.utc)
    r2 = requests.get(
        f"{BASE_URL}/api/time-entries/reports/monthly-detailed",
        params={"month": now.month, "year": now.year},
        headers=h,
        timeout=60,
    )
    assert r2.status_code == 200, f"monthly-detailed: {r2.status_code} {r2.text[:200]}"


def test_edge_case_fresh_orphan_credit_is_fixed_on_restart(db):
    """Insert a NEW credit entry without start/end, with a real picagem on
    the same date; delete migration record; restart backend; verify entry
    got fixed; cleanup test data and restore original migration record."""

    # 1. Snapshot original migration record so we can restore it later
    original_rec = db.migrations.find_one({"key": MIGRATION_KEY})
    assert original_rec is not None, \
        "pre-condicao: migration deveria ja estar registada"

    # Drop ObjectId so we can re-insert later (motor/pymongo accepts insert
    # with the original ObjectId, but safer to remove it)
    original_rec_clean = {k: v for k, v in original_rec.items() if k != "_id"}

    test_user_id = "c145d94b-bb5f-4fe1-b05d-6fa1034db968"  # admin teste@email.com
    # Use a far-past date to avoid colliding with real data
    test_date = "2024-01-15"
    real_entry_id = f"TEST_real_{uuid.uuid4()}"
    credit_entry_id = f"TEST_credit_{uuid.uuid4()}"

    real_start = "2024-01-15T08:00:00+00:00"
    real_end = "2024-01-15T16:00:00+00:00"

    real_entry = {
        "id": real_entry_id,
        "user_id": test_user_id,
        "date": test_date,
        "start_time": real_start,
        "end_time": real_end,
        "status": "completed",
        "total_hours": 8.0,
        "is_early_leave_credit": False,
        "test_marker": "migration_test",
    }
    credit_entry = {
        "id": credit_entry_id,
        "user_id": test_user_id,
        "date": test_date,
        "start_time": None,
        "end_time": None,
        "status": "completed",
        "total_hours": 1.0,
        "credit_minutes": 60,
        "is_early_leave_credit": True,
        "test_marker": "migration_test",
    }

    try:
        db.time_entries.insert_one(real_entry)
        db.time_entries.insert_one(credit_entry)

        # 2. Delete migration record so it will re-run on restart
        db.migrations.delete_one({"key": MIGRATION_KEY})
        assert db.migrations.find_one({"key": MIGRATION_KEY}) is None

        # 3. Restart backend
        subprocess.run(
            ["sudo", "supervisorctl", "restart", "backend"],
            check=True, capture_output=True, timeout=30,
        )
        assert _wait_for_backend(timeout=60), "Backend nao voltou apos restart"
        # Migration runs in lifespan startup before health endpoint serves,
        # but add a small grace period in case of async race.
        time.sleep(3)

        # 4. Verify the credit entry got fixed
        fixed = db.time_entries.find_one({"id": credit_entry_id})
        assert fixed is not None
        assert fixed["start_time"] is not None, \
            "start_time ainda esta None apos migration"
        assert fixed["end_time"] is not None, \
            "end_time ainda esta None apos migration"

        # start_time should equal the latest real end_time (16:00)
        vstart_dt = datetime.fromisoformat(fixed["start_time"])
        vend_dt = datetime.fromisoformat(fixed["end_time"])
        real_end_dt = datetime.fromisoformat(real_end)
        assert vstart_dt == real_end_dt, \
            f"start_time esperado {real_end_dt}, obtido {vstart_dt}"
        delta_min = (vend_dt - vstart_dt).total_seconds() / 60
        assert abs(delta_min - 60) < 0.001, \
            f"duracao virtual esperada 60min, obtida {delta_min}min"

        # 5. New migration record must show fixed_count >= 1
        new_rec = db.migrations.find_one({"key": MIGRATION_KEY})
        assert new_rec is not None
        assert new_rec["fixed_count"] >= 1, \
            f"fixed_count esperado >=1, obtido {new_rec['fixed_count']}"

    finally:
        # Cleanup test entries
        db.time_entries.delete_many({"test_marker": "migration_test"})
        # Restore original migration record
        db.migrations.delete_one({"key": MIGRATION_KEY})
        db.migrations.insert_one(original_rec_clean)


def test_skip_case_credit_without_real_picagem(db):
    """Edge case: credit entry on a date with NO real completed picagens
    must be SKIPPED (not crash) and counted in skipped_count."""

    original_rec = db.migrations.find_one({"key": MIGRATION_KEY})
    assert original_rec is not None
    original_rec_clean = {k: v for k, v in original_rec.items() if k != "_id"}

    test_user_id = "c145d94b-bb5f-4fe1-b05d-6fa1034db968"
    test_date = "2024-02-20"  # date with no real picagens
    credit_entry_id = f"TEST_orphan_credit_{uuid.uuid4()}"

    orphan_credit = {
        "id": credit_entry_id,
        "user_id": test_user_id,
        "date": test_date,
        "start_time": None,
        "end_time": None,
        "status": "completed",
        "total_hours": 1.0,
        "credit_minutes": 60,
        "is_early_leave_credit": True,
        "test_marker": "migration_skip_test",
    }

    try:
        db.time_entries.insert_one(orphan_credit)
        db.migrations.delete_one({"key": MIGRATION_KEY})

        subprocess.run(
            ["sudo", "supervisorctl", "restart", "backend"],
            check=True, capture_output=True, timeout=30,
        )
        assert _wait_for_backend(timeout=60), "Backend nao arrancou"
        time.sleep(3)

        # Entry should remain unchanged (still None)
        still_orphan = db.time_entries.find_one({"id": credit_entry_id})
        assert still_orphan is not None
        assert still_orphan["start_time"] is None, \
            "Entry sem real picagem nao devia ter sido modificada"

        new_rec = db.migrations.find_one({"key": MIGRATION_KEY})
        assert new_rec is not None
        assert new_rec["skipped_count"] >= 1, \
            f"skipped_count esperado >=1, obtido {new_rec['skipped_count']}"

        # Backend still healthy (no crash)
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.status_code == 200

    finally:
        db.time_entries.delete_many({"test_marker": "migration_skip_test"})
        db.migrations.delete_one({"key": MIGRATION_KEY})
        db.migrations.insert_one(original_rec_clean)
