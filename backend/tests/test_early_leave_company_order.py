"""
Backend tests for "Saída por Ordem da Empresa" (early_leave_company_order).

Covers:
  - Happy path: 2 entries, total < 8h, flag=true → cria pedido early_leave.
  - Approval: creates is_early_leave_credit entry; day total = 8h.
  - Rejection: no credit entry; original marked rejected.
  - Edge 1: single entry + flag → no request created.
  - Edge 2: total >= 8h + flag → no request created.
  - Edge 3: flag absent → never creates request.
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_USER = "teste@email.com"
ADMIN_PASS = "Admin123!"
ADMIN_ID = "c145d94b-bb5f-4fe1-b05d-6fa1034db968"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "emergent")


# ---------- Mongo helpers ----------
def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


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
        f"{BASE_URL}/api/auth/login",
        json={"username": ADMIN_USER, "password": ADMIN_PASS},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Seeders ----------
async def _cleanup(db, date_str: str):
    await db.time_entries.delete_many({"user_id": ADMIN_ID, "date": date_str})
    await db.overtime_authorizations.delete_many(
        {"user_id": ADMIN_ID, "date": date_str, "request_type": "early_leave"}
    )


async def _seed_completed(db, date_str: str, start_h: int, start_m: int,
                          end_h: int, end_m: int) -> str:
    eid = str(uuid.uuid4())
    start_iso = f"{date_str}T{start_h:02d}:{start_m:02d}:00+01:00"
    end_iso = f"{date_str}T{end_h:02d}:{end_m:02d}:00+01:00"
    total_hours = ((end_h * 60 + end_m) - (start_h * 60 + start_m)) / 60.0
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
        "observations": "[SEED test_early_leave]",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return eid


async def _seed_active(db, date_str: str, start_h: int, start_m: int) -> str:
    eid = str(uuid.uuid4())
    start_iso = f"{date_str}T{start_h:02d}:{start_m:02d}:00+01:00"
    await db.time_entries.insert_one({
        "id": eid,
        "user_id": ADMIN_ID,
        "username": "teste",
        "date": date_str,
        "start_time": start_iso,
        "end_time": None,
        "status": "active",
        "total_hours": None,
        "observations": "[SEED test_early_leave]",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return eid


# =====================================================
# TEST 1 — Happy path: 5h + 2h = 7h, flag=true → request criado
# =====================================================
def test_happy_path_creates_request(db, headers, event_loop):
    date_str = "2026-07-01"
    event_loop.run_until_complete(_cleanup(db, date_str))
    event_loop.run_until_complete(_seed_completed(db, date_str, 8, 0, 13, 0))
    active_id = event_loop.run_until_complete(_seed_active(db, date_str, 14, 0))

    r = requests.post(
        f"{BASE_URL}/api/time-entries/end/{active_id}",
        headers=headers,
        json={
            "early_leave_company_order": True,
            "client_time": f"{date_str}T16:00:00+01:00",
        },
        timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # Total da última entry deve rondar 2h
    assert 1.9 <= body["total_hours"] <= 2.1, body

    # Verifica pedido
    auths = event_loop.run_until_complete(
        db.overtime_authorizations.find(
            {"user_id": ADMIN_ID, "date": date_str, "request_type": "early_leave"},
            {"_id": 0},
        ).to_list(10)
    )
    assert len(auths) == 1, f"Esperava 1 pedido, got {len(auths)}"
    a = auths[0]
    assert a["status"] == "pending"
    assert a["entry_id"] == active_id
    assert abs(a["worked_hours"] - 7.0) < 0.05
    assert a["hours_short_minutes"] == 60
    assert a.get("approval_token"), "approval_token missing"
    assert a.get("id"), "token (id) missing"


# =====================================================
# TEST 2 — GET /api/overtime/authorizations?status=pending inclui early_leave
# =====================================================
def test_list_authorizations_includes_early_leave(headers):
    r = requests.get(
        f"{BASE_URL}/api/overtime/authorizations?status=pending",
        headers=headers,
        timeout=30,
    )
    assert r.status_code == 200, r.text
    items = r.json()
    el = [x for x in items if x.get("request_type") == "early_leave"
          and x.get("date") == "2026-07-01"]
    assert el, "Pedido early_leave 2026-07-01 não está na lista pending"
    a = el[0]
    assert "periodos" in a
    assert isinstance(a["periodos"], list)


# =====================================================
# TEST 3 — Aprovar: cria credit entry, soma do dia = 8h
# =====================================================
def test_approve_creates_credit_entry(db, headers, event_loop):
    date_str = "2026-07-01"
    auths = event_loop.run_until_complete(
        db.overtime_authorizations.find(
            {"user_id": ADMIN_ID, "date": date_str,
             "request_type": "early_leave", "status": "pending"},
            {"_id": 0},
        ).to_list(5)
    )
    assert len(auths) == 1
    token_id = auths[0]["id"]

    r = requests.post(
        f"{BASE_URL}/api/overtime/authorization/{token_id}/decide",
        headers=headers,
        json={"action": "approve"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    res = r.json()
    assert res.get("decision") == "approved", res

    # Auth status
    a = event_loop.run_until_complete(
        db.overtime_authorizations.find_one({"id": token_id}, {"_id": 0})
    )
    assert a["status"] == "approved"

    # Credit entry
    credits = event_loop.run_until_complete(
        db.time_entries.find(
            {"user_id": ADMIN_ID, "date": date_str, "is_early_leave_credit": True},
            {"_id": 0},
        ).to_list(5)
    )
    assert len(credits) == 1, f"Esperava 1 credit entry, got {len(credits)}"
    c = credits[0]
    assert abs(c["total_hours"] - 1.0) < 0.01
    assert "Crédito automático" in c["observations"]
    assert "saída antecipada por ordem da empresa" in c["observations"]

    # Day total ~ 8h
    all_entries = event_loop.run_until_complete(
        db.time_entries.find(
            {"user_id": ADMIN_ID, "date": date_str, "status": "completed"},
            {"_id": 0},
        ).to_list(50)
    )
    total = sum(e.get("total_hours", 0) or 0 for e in all_entries)
    assert abs(total - 8.0) < 0.05, f"Total dia = {total}, esperado 8"


# =====================================================
# TEST 4 — Rejeitar (noutro dia)
# =====================================================
def test_reject_no_credit_entry(db, headers, event_loop):
    date_str = "2026-07-02"
    event_loop.run_until_complete(_cleanup(db, date_str))
    event_loop.run_until_complete(_seed_completed(db, date_str, 8, 0, 13, 0))
    active_id = event_loop.run_until_complete(_seed_active(db, date_str, 14, 0))

    r = requests.post(
        f"{BASE_URL}/api/time-entries/end/{active_id}",
        headers=headers,
        json={
            "early_leave_company_order": True,
            "client_time": f"{date_str}T16:00:00+01:00",
        },
        timeout=30,
    )
    assert r.status_code == 200, r.text

    auths = event_loop.run_until_complete(
        db.overtime_authorizations.find(
            {"user_id": ADMIN_ID, "date": date_str, "request_type": "early_leave"},
            {"_id": 0},
        ).to_list(5)
    )
    assert len(auths) == 1
    token_id = auths[0]["id"]

    r = requests.post(
        f"{BASE_URL}/api/overtime/authorization/{token_id}/decide",
        headers=headers,
        json={"action": "reject"},
        timeout=90,
    )
    assert r.status_code == 200, r.text
    assert r.json().get("decision") == "rejected"

    # No credit entry
    credits = event_loop.run_until_complete(
        db.time_entries.find(
            {"user_id": ADMIN_ID, "date": date_str, "is_early_leave_credit": True},
            {"_id": 0},
        ).to_list(5)
    )
    assert len(credits) == 0, "Não deveria ter credit entry após rejeição"

    # Original entry marcada como rejected
    orig = event_loop.run_until_complete(
        db.time_entries.find_one({"id": active_id}, {"_id": 0})
    )
    assert orig.get("early_leave_authorized") is False
    assert orig.get("early_leave_rejected_by")

    # Total dia mantém-se 7h
    all_entries = event_loop.run_until_complete(
        db.time_entries.find(
            {"user_id": ADMIN_ID, "date": date_str, "status": "completed"},
            {"_id": 0},
        ).to_list(50)
    )
    total = sum(e.get("total_hours", 0) or 0 for e in all_entries)
    assert abs(total - 7.0) < 0.05


# =====================================================
# EDGE 1 — Apenas 1 entry (sem segunda picagem) + flag → NÃO cria pedido
# =====================================================
def test_edge_single_entry_no_request(db, headers, event_loop):
    date_str = "2026-07-03"
    event_loop.run_until_complete(_cleanup(db, date_str))
    active_id = event_loop.run_until_complete(_seed_active(db, date_str, 8, 0))

    r = requests.post(
        f"{BASE_URL}/api/time-entries/end/{active_id}",
        headers=headers,
        json={
            "early_leave_company_order": True,
            "client_time": f"{date_str}T13:00:00+01:00",
        },
        timeout=30,
    )
    assert r.status_code == 200, r.text

    auths = event_loop.run_until_complete(
        db.overtime_authorizations.find(
            {"user_id": ADMIN_ID, "date": date_str, "request_type": "early_leave"},
            {"_id": 0},
        ).to_list(5)
    )
    assert len(auths) == 0, "Single-entry day NÃO deve criar pedido"


# =====================================================
# EDGE 2 — Total já >= 8h + flag → NÃO cria pedido
# =====================================================
def test_edge_total_already_8h_no_request(db, headers, event_loop):
    date_str = "2026-07-04"
    event_loop.run_until_complete(_cleanup(db, date_str))
    # 4h + 4h+ activa por mais 30min => 8.5h
    event_loop.run_until_complete(_seed_completed(db, date_str, 8, 0, 12, 0))
    active_id = event_loop.run_until_complete(_seed_active(db, date_str, 13, 0))

    r = requests.post(
        f"{BASE_URL}/api/time-entries/end/{active_id}",
        headers=headers,
        json={
            "early_leave_company_order": True,
            "client_time": f"{date_str}T17:30:00+01:00",
        },
        timeout=30,
    )
    assert r.status_code == 200, r.text

    auths = event_loop.run_until_complete(
        db.overtime_authorizations.find(
            {"user_id": ADMIN_ID, "date": date_str, "request_type": "early_leave"},
            {"_id": 0},
        ).to_list(5)
    )
    assert len(auths) == 0, "Total >=8h NÃO deve criar pedido"


# =====================================================
# EDGE 3 — Sem flag (ou false) → NUNCA cria pedido
# =====================================================
def test_edge_no_flag_no_request(db, headers, event_loop):
    date_str = "2026-07-05"
    event_loop.run_until_complete(_cleanup(db, date_str))
    event_loop.run_until_complete(_seed_completed(db, date_str, 8, 0, 13, 0))
    active_id = event_loop.run_until_complete(_seed_active(db, date_str, 14, 0))

    r = requests.post(
        f"{BASE_URL}/api/time-entries/end/{active_id}",
        headers=headers,
        json={"client_time": f"{date_str}T16:00:00+01:00"},
        timeout=30,
    )
    assert r.status_code == 200, r.text

    auths = event_loop.run_until_complete(
        db.overtime_authorizations.find(
            {"user_id": ADMIN_ID, "date": date_str, "request_type": "early_leave"},
            {"_id": 0},
        ).to_list(5)
    )
    assert len(auths) == 0, "Sem flag NUNCA deve criar pedido"


# =====================================================
# Cleanup final
# =====================================================
def test_zz_cleanup(db, event_loop):
    for d in ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"]:
        event_loop.run_until_complete(_cleanup(db, d))
