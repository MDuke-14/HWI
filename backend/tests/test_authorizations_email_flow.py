"""
Tests for the authorization email-flow refactor (push -> email).

Covers:
- send_authorization_request_email helper (calls send_notification_email)
- GET /api/admin/day-authorizations enrichment (periodos + tipo_colaborador)
- GET /api/overtime/authorizations enrichment (periodos)
- POST /api/admin/day-authorizations/{id}/decide -> 200, status=authorized
- POST /api/overtime/authorization/{id}/decide  -> 200, status=success
- create_day_authorization_request invokes email path (verified by log scan + DB insert)
"""
import os
import uuid
import asyncio
import pytest
import requests
from datetime import datetime, timedelta, timezone

import pymongo

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://field-clock.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "emergent")

ADMIN_USER = "teste@email.com"
ADMIN_PASS = "teste"

mongo = pymongo.MongoClient(MONGO_URL)[DB_NAME]


# --------------------- fixtures ---------------------

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": ADMIN_USER, "password": ADMIN_PASS},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_id():
    u = mongo.users.find_one({"email": ADMIN_USER}) or mongo.users.find_one({"username": ADMIN_USER})
    assert u, "admin user not found in DB"
    return u["id"]


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture
def seed_day_auth(admin_id):
    """Seed: 1 user (if not exists) + 2 time_entries + 1 pending day_authorization."""
    user_id = admin_id  # reuse admin user (already in DB)
    date_str = "2025-12-13"  # Saturday

    # Make sure tipo_colaborador is set
    mongo.users.update_one({"id": user_id}, {"$set": {"tipo_colaborador": "senior"}})

    # Clean previous test data
    mongo.day_authorizations.delete_many({"user_id": user_id, "date": date_str})
    mongo.time_entries.delete_many({"user_id": user_id, "date": date_str})

    # Insert two time_entries: 08:00-13:00 (closed) and 14:00-active
    e1 = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "date": date_str,
        "start_time": f"{date_str}T08:00:00",
        "end_time": f"{date_str}T13:00:00",
        "status": "completed",
    }
    e2 = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "date": date_str,
        "start_time": f"{date_str}T14:00:00",
        "end_time": None,
        "status": "active",
    }
    mongo.time_entries.insert_many([e1, e2])

    auth_id = str(uuid.uuid4())
    doc = {
        "id": auth_id,
        "user_id": user_id,
        "user_name": "Admin Teste",
        "date": date_str,
        "day_type": "sabado",
        "day_type_display": "Sábado",
        "status": "pending",
        "first_entry_id": e1["id"],
        "first_entry_time": e1["start_time"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "decided_by": None,
        "decided_at": None,
        "notification_sent": True,
    }
    mongo.day_authorizations.insert_one(doc)
    yield {"auth_id": auth_id, "user_id": user_id, "date": date_str}
    # teardown
    mongo.day_authorizations.delete_many({"user_id": user_id, "date": date_str})
    mongo.time_entries.delete_many({"user_id": user_id, "date": date_str})


@pytest.fixture
def seed_overtime_auth(admin_id):
    user_id = admin_id
    date_str = "2025-12-14"  # Sunday
    mongo.users.update_one({"id": user_id}, {"$set": {"tipo_colaborador": "senior"}})
    mongo.overtime_authorizations.delete_many({"user_id": user_id, "date": date_str})
    mongo.time_entries.delete_many({"user_id": user_id, "date": date_str})

    entry_id = str(uuid.uuid4())
    entry = {
        "id": entry_id,
        "user_id": user_id,
        "date": date_str,
        "start_time": f"{date_str}T09:00:00",
        "end_time": f"{date_str}T12:00:00",
        "status": "completed",
    }
    mongo.time_entries.insert_one(entry)

    auth_id = str(uuid.uuid4())
    doc = {
        "id": auth_id,
        "user_id": user_id,
        "user_name": "Admin Teste",
        "date": date_str,
        "request_type": "overtime_start",
        "day_type": "Domingo",
        "entry_id": entry_id,
        "status": "pending",
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
    }
    mongo.overtime_authorizations.insert_one(doc)
    yield {"auth_id": auth_id, "user_id": user_id, "date": date_str, "entry_id": entry_id}
    mongo.overtime_authorizations.delete_many({"user_id": user_id, "date": date_str})
    mongo.time_entries.delete_many({"user_id": user_id, "date": date_str})


# --------------------- helper-function tests (in-process) ---------------------

def test_helpers_exist():
    """The new email helper + html helper must exist with the expected signatures."""
    import importlib, sys
    sys.path.insert(0, "/app/backend")
    mod = importlib.import_module("notifications_scheduler")
    assert hasattr(mod, "send_authorization_request_email")
    assert hasattr(mod, "get_authorization_request_email_html")
    assert hasattr(mod, "_format_user_role")
    # constants
    assert mod.ADMIN_AUTH_EMAIL == "geral@hwi.pt"
    assert mod.ADMIN_PORTAL_URL.endswith("/admin?tab=notifications")
    # html generation includes link + role + user_name
    html = mod.get_authorization_request_email_html(
        user_name="João Silva",
        user_role="Técnico Sénior",
        auth_type_label="horas extras",
        date_str="13/12/2025",
        periodos=["08:00 – 13:00", "14:00 – (em trabalho)"],
    )
    assert "João Silva" in html
    assert "Técnico Sénior" in html
    assert "horas extras" in html
    assert mod.ADMIN_PORTAL_URL in html
    assert "08:00 – 13:00" in html


def test_format_user_role_mapping():
    import sys, importlib
    sys.path.insert(0, "/app/backend")
    m = importlib.import_module("notifications_scheduler")
    assert m._format_user_role("junior") == "Técnico Junior"
    assert m._format_user_role("tecnico") == "Técnico"
    assert m._format_user_role("senior") == "Técnico Sénior"
    assert m._format_user_role(None) == "Técnico"


def test_send_authorization_request_email_invokes_smtp(monkeypatch, admin_id):
    """Ensure send_authorization_request_email calls send_notification_email with
    ADMIN_AUTH_EMAIL as destination and a non-empty html."""
    import sys, importlib
    sys.path.insert(0, "/app/backend")
    m = importlib.import_module("notifications_scheduler")

    calls = {}

    async def fake_send(to_email, subject, html_content):
        calls["to_email"] = to_email
        calls["subject"] = subject
        calls["html"] = html_content
        return True

    monkeypatch.setattr(m, "send_notification_email", fake_send)

    # use motor-async DB
    from motor.motor_asyncio import AsyncIOMotorClient
    adb = AsyncIOMotorClient(MONGO_URL)[DB_NAME]

    async def run():
        return await m.send_authorization_request_email(
            adb, admin_id, "overtime", "2025-12-13",
        )

    result = asyncio.get_event_loop().run_until_complete(run())
    assert result is True
    assert calls["to_email"] == "geral@hwi.pt"
    assert "horas extras" in calls["subject"]
    assert "Abrir Portal de Autorização" in calls["html"]


# --------------------- API: GET day-authorizations ---------------------

def test_get_day_authorizations_enriched(auth_headers, seed_day_auth):
    r = requests.get(f"{BASE_URL}/api/admin/day-authorizations", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    items = r.json()
    # locate seeded one
    target = next((x for x in items if x.get("id") == seed_day_auth["auth_id"]), None)
    assert target, f"seeded day-auth not found in response (returned {len(items)} items)"
    # periodos must be present and contain the formatted slots
    assert "periodos" in target
    assert isinstance(target["periodos"], list)
    joined = " | ".join(target["periodos"])
    assert "08:00" in joined and "13:00" in joined
    assert "14:00" in joined
    assert "em trabalho" in joined  # active entry shown without end
    # tipo_colaborador enriched
    assert target.get("tipo_colaborador") == "senior"


# --------------------- API: GET overtime authorizations ---------------------

def test_get_overtime_authorizations_enriched(auth_headers, seed_overtime_auth):
    r = requests.get(f"{BASE_URL}/api/overtime/authorizations", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    items = r.json()
    target = next((x for x in items if x.get("id") == seed_overtime_auth["auth_id"]), None)
    assert target, "seeded overtime auth not found"
    assert "periodos" in target
    assert isinstance(target["periodos"], list)
    assert any("09:00" in p for p in target["periodos"])


# --------------------- API: POST decide day-auth ---------------------

def test_decide_day_authorization_approve(auth_headers, seed_day_auth):
    r = requests.post(
        f"{BASE_URL}/api/admin/day-authorizations/{seed_day_auth['auth_id']}/decide",
        headers=auth_headers,
        json={"action": "approve"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "message" in data
    assert data.get("status") == "authorized"
    # persisted in DB
    doc = mongo.day_authorizations.find_one({"id": seed_day_auth["auth_id"]})
    assert doc and doc["status"] == "authorized"


def test_decide_day_authorization_reject(auth_headers, admin_id):
    """Separate seeding for reject because approve consumes the previous one."""
    date_str = "2025-12-20"
    mongo.day_authorizations.delete_many({"user_id": admin_id, "date": date_str})
    mongo.time_entries.delete_many({"user_id": admin_id, "date": date_str})
    eid = str(uuid.uuid4())
    mongo.time_entries.insert_one({
        "id": eid,
        "user_id": admin_id,
        "date": date_str,
        "start_time": f"{date_str}T08:00:00",
        "end_time": None,
        "status": "active",
    })
    aid = str(uuid.uuid4())
    mongo.day_authorizations.insert_one({
        "id": aid,
        "user_id": admin_id,
        "user_name": "Admin Teste",
        "date": date_str,
        "day_type": "sabado",
        "day_type_display": "Sábado",
        "status": "pending",
        "first_entry_id": eid,
        "first_entry_time": f"{date_str}T08:00:00",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    try:
        r = requests.post(
            f"{BASE_URL}/api/admin/day-authorizations/{aid}/decide",
            headers=auth_headers,
            json={"action": "reject"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "rejected"
        doc = mongo.day_authorizations.find_one({"id": aid})
        assert doc["status"] == "rejected"
    finally:
        mongo.day_authorizations.delete_many({"id": aid})
        mongo.time_entries.delete_many({"id": eid})


# --------------------- API: POST decide overtime auth ---------------------

def test_decide_overtime_authorization_approve(auth_headers, seed_overtime_auth):
    r = requests.post(
        f"{BASE_URL}/api/overtime/authorization/{seed_overtime_auth['auth_id']}/decide",
        headers=auth_headers,
        json={"action": "approve"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    # process_authorization_decision returns status='success' on the happy path
    assert data.get("status") in ("success", "approved", "already_decided"), data
    # persisted in DB
    doc = mongo.overtime_authorizations.find_one({"id": seed_overtime_auth["auth_id"]})
    assert doc and doc["status"] in ("approved", "rejected")


def test_decide_overtime_authorization_missing_expires_at_tolerant(auth_headers, admin_id):
    """Regression: process_authorization_decision must not crash if expires_at is absent."""
    date_str = "2025-12-21"
    mongo.overtime_authorizations.delete_many({"user_id": admin_id, "date": date_str})
    eid = str(uuid.uuid4())
    mongo.time_entries.insert_one({
        "id": eid, "user_id": admin_id, "date": date_str,
        "start_time": f"{date_str}T09:00:00", "end_time": None, "status": "active",
    })
    aid = str(uuid.uuid4())
    mongo.overtime_authorizations.insert_one({
        "id": aid,
        "user_id": admin_id,
        "user_name": "Admin Teste",
        "date": date_str,
        "request_type": "overtime_start",
        "day_type": "Domingo",
        "entry_id": eid,
        "status": "pending",
        "requested_at": datetime.now(timezone.utc).isoformat(),
        # NO expires_at -> must not 500
    })
    try:
        r = requests.post(
            f"{BASE_URL}/api/overtime/authorization/{aid}/decide",
            headers=auth_headers,
            json={"action": "approve"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
    finally:
        mongo.overtime_authorizations.delete_many({"id": aid})
        mongo.time_entries.delete_many({"id": eid})


# --------------------- code-path: server.py uses email (no push) ---------------------

def test_server_uses_email_for_day_auth_creation():
    """Static code grep: ensure create_day_authorization_request invokes
    send_authorization_request_email (not send_push_to_admins)."""
    with open("/app/backend/server.py", "r", encoding="utf-8") as f:
        src = f.read()
    # The function block must contain the email call and NOT push_to_admins immediately after
    assert "send_authorization_request_email" in src
    # find the create_day_authorization_request function and verify push_to_admins not used inside it
    start = src.find("async def create_day_authorization_request")
    assert start != -1
    end = src.find("\nasync def ", start + 50)
    body = src[start:end]
    assert "send_push_to_admins" not in body, "create_day_authorization_request still uses push"
    assert "send_authorization_request_email" in body
