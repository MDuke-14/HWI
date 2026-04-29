"""
Backend tests for /api/indisponibilidades endpoints + early_leave_warning in time-entries/start.

Covers:
- POST create (valid / invalid tipo / invalid HH:MM / hora_inicio>=hora_fim / overlap)
- GET /me (own only)
- GET / (admin list, filters)
- GET /check (with/without horario, conflict detection)
- PUT (owner ok, perms, reset notif flags)
- DELETE
- GET /historico/{user_id}
- POST /api/time-entries/start returns early_leave_warning when saida_antecipada exists today;
  not present for entrada_tardia or absent.
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

# Load REACT_APP_BACKEND_URL from frontend/.env if not in environment
def _load_backend_url():
    val = os.environ.get("REACT_APP_BACKEND_URL")
    if val:
        return val.rstrip("/")
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env")
    try:
        with open(env_path) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_backend_url()
ADMIN_USER = "teste@email.com"
ADMIN_PASS = "teste"
ADMIN_ID = "c145d94b-bb5f-4fe1-b05d-6fa1034db968"


# ============== Fixtures ==============

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": ADMIN_USER, "password": ADMIN_PASS},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json",
    })
    return s


@pytest.fixture(scope="module")
def secondary_user(admin_client):
    """Create or reuse a non-admin user for permission tests."""
    uname = f"TEST_indisp_{uuid.uuid4().hex[:6]}@example.com"
    pwd = "test1234"
    r = admin_client.post(
        f"{BASE_URL}/api/auth/register",
        json={"username": uname, "password": pwd, "email": uname, "full_name": "TEST Indisp"},
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"Could not create secondary user: {r.status_code} {r.text}")
    user = r.json().get("user") or r.json()
    user_id = user.get("id")
    # login as that user
    lr = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": uname, "password": pwd}, timeout=15,
    )
    if lr.status_code != 200:
        pytest.skip(f"Could not login secondary user: {lr.text}")
    token = lr.json()["access_token"]
    yield {"id": user_id, "username": uname, "token": token}
    # cleanup
    try:
        admin_client.delete(f"{BASE_URL}/api/users/{user_id}")
    except Exception:
        pass


@pytest.fixture()
def cleanup_indisps(admin_client):
    created = []
    yield created
    for ind_id in created:
        try:
            admin_client.delete(f"{BASE_URL}/api/indisponibilidades/{ind_id}")
        except Exception:
            pass


# ============== Validations ==============

class TestCreateValidations:
    def test_create_valid_saida_antecipada(self, admin_client, cleanup_indisps):
        d = (date.today() + timedelta(days=2)).isoformat()
        r = admin_client.post(f"{BASE_URL}/api/indisponibilidades", json={
            "data": d, "hora_inicio": "16:00", "hora_fim": "18:00",
            "tipo": "saida_antecipada", "regressa_servico": False,
            "observacoes": "TEST_indisp", "aviso_minutos_antes": 30,
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["tipo"] == "saida_antecipada"
        assert body["hora_inicio"] == "16:00"
        assert body["data"] == d
        assert body["user_id"] == ADMIN_ID
        cleanup_indisps.append(body["id"])

    def test_invalid_tipo(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/indisponibilidades", json={
            "data": (date.today() + timedelta(days=3)).isoformat(),
            "hora_inicio": "08:00", "hora_fim": "09:00",
            "tipo": "ferias",
        })
        assert r.status_code in (400, 422), r.text

    def test_invalid_hhmm(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/indisponibilidades", json={
            "data": (date.today() + timedelta(days=3)).isoformat(),
            "hora_inicio": "25:00", "hora_fim": "26:00",
            "tipo": "entrada_tardia",
        })
        assert r.status_code == 400

    def test_inicio_after_fim(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/indisponibilidades", json={
            "data": (date.today() + timedelta(days=3)).isoformat(),
            "hora_inicio": "10:00", "hora_fim": "09:00",
            "tipo": "entrada_tardia",
        })
        assert r.status_code == 400

    def test_overlap_blocked(self, admin_client, cleanup_indisps):
        d = (date.today() + timedelta(days=4)).isoformat()
        r1 = admin_client.post(f"{BASE_URL}/api/indisponibilidades", json={
            "data": d, "hora_inicio": "09:00", "hora_fim": "11:00",
            "tipo": "entrada_tardia",
        })
        assert r1.status_code == 200
        cleanup_indisps.append(r1.json()["id"])
        r2 = admin_client.post(f"{BASE_URL}/api/indisponibilidades", json={
            "data": d, "hora_inicio": "10:00", "hora_fim": "12:00",
            "tipo": "saida_antecipada",
        })
        assert r2.status_code == 400
        assert "obrep" in r2.text.lower() or "sobrep" in r2.text.lower()


# ============== List endpoints ==============

class TestListing:
    def test_get_me(self, admin_client, cleanup_indisps):
        d = (date.today() + timedelta(days=5)).isoformat()
        r = admin_client.post(f"{BASE_URL}/api/indisponibilidades", json={
            "data": d, "hora_inicio": "07:30", "hora_fim": "08:30",
            "tipo": "entrada_tardia",
        })
        assert r.status_code == 200
        cleanup_indisps.append(r.json()["id"])

        rme = admin_client.get(f"{BASE_URL}/api/indisponibilidades/me")
        assert rme.status_code == 200
        items = rme.json()
        assert any(i["id"] == r.json()["id"] for i in items)
        # all belong to admin
        for it in items:
            assert it["user_id"] == ADMIN_ID

    def test_admin_list_all_with_filter(self, admin_client, cleanup_indisps):
        d = (date.today() + timedelta(days=6)).isoformat()
        r = admin_client.post(f"{BASE_URL}/api/indisponibilidades", json={
            "data": d, "hora_inicio": "14:00", "hora_fim": "15:00",
            "tipo": "saida_antecipada",
        })
        assert r.status_code == 200
        cleanup_indisps.append(r.json()["id"])

        all_r = admin_client.get(f"{BASE_URL}/api/indisponibilidades", params={"inicio": d, "fim": d})
        assert all_r.status_code == 200
        items = all_r.json()
        assert any(i["id"] == r.json()["id"] for i in items)

        by_user = admin_client.get(f"{BASE_URL}/api/indisponibilidades", params={"user_id": ADMIN_ID, "inicio": d, "fim": d})
        assert by_user.status_code == 200
        for it in by_user.json():
            assert it["user_id"] == ADMIN_ID

    def test_check_endpoint(self, admin_client, cleanup_indisps):
        d = (date.today() + timedelta(days=7)).isoformat()
        r = admin_client.post(f"{BASE_URL}/api/indisponibilidades", json={
            "data": d, "hora_inicio": "10:00", "hora_fim": "12:00",
            "tipo": "saida_antecipada",
        })
        assert r.status_code == 200
        cleanup_indisps.append(r.json()["id"])

        # without time -> all for that day for users
        c1 = admin_client.get(f"{BASE_URL}/api/indisponibilidades/check",
                              params=[("data", d), ("user_ids", ADMIN_ID)])
        assert c1.status_code == 200
        assert any(i["id"] == r.json()["id"] for i in c1.json())

        # overlap -> conflict found
        c2 = admin_client.get(f"{BASE_URL}/api/indisponibilidades/check",
                              params=[("data", d), ("user_ids", ADMIN_ID),
                                      ("hora_inicio", "11:00"), ("hora_fim", "13:00")])
        assert c2.status_code == 200
        assert len(c2.json()) >= 1

        # no overlap -> empty
        c3 = admin_client.get(f"{BASE_URL}/api/indisponibilidades/check",
                              params=[("data", d), ("user_ids", ADMIN_ID),
                                      ("hora_inicio", "13:00"), ("hora_fim", "14:00")])
        assert c3.status_code == 200
        assert c3.json() == []

    def test_historico(self, admin_client, cleanup_indisps):
        # ensure at least 2 entries
        for delta, hi, hf in [(8, "08:00", "09:00"), (9, "10:00", "11:00")]:
            r = admin_client.post(f"{BASE_URL}/api/indisponibilidades", json={
                "data": (date.today() + timedelta(days=delta)).isoformat(),
                "hora_inicio": hi, "hora_fim": hf, "tipo": "entrada_tardia",
            })
            assert r.status_code == 200
            cleanup_indisps.append(r.json()["id"])

        h = admin_client.get(f"{BASE_URL}/api/indisponibilidades/historico/{ADMIN_ID}")
        assert h.status_code == 200
        items = h.json()
        assert len(items) >= 2
        # ordered desc by data
        datas = [i["data"] for i in items]
        assert datas == sorted(datas, reverse=True)


# ============== Update / delete + permissions ==============

class TestUpdateDelete:
    def test_update_owner_resets_notif_flags(self, admin_client, cleanup_indisps):
        d = (date.today() + timedelta(days=10)).isoformat()
        r = admin_client.post(f"{BASE_URL}/api/indisponibilidades", json={
            "data": d, "hora_inicio": "09:00", "hora_fim": "10:00",
            "tipo": "entrada_tardia",
        })
        assert r.status_code == 200
        ind_id = r.json()["id"]
        cleanup_indisps.append(ind_id)

        u = admin_client.put(f"{BASE_URL}/api/indisponibilidades/{ind_id}", json={
            "hora_inicio": "08:30", "hora_fim": "09:30",
        })
        assert u.status_code == 200, u.text
        body = u.json()
        assert body["hora_inicio"] == "08:30"
        assert body["notificacao_matinal_enviada"] is False
        assert body["notificacao_pre_evento_enviada"] is False

    def test_update_other_user_forbidden(self, admin_client, secondary_user, cleanup_indisps):
        # admin creates own first to get an id; then we test that secondary user can't edit it
        d = (date.today() + timedelta(days=11)).isoformat()
        r = admin_client.post(f"{BASE_URL}/api/indisponibilidades", json={
            "data": d, "hora_inicio": "09:00", "hora_fim": "10:00",
            "tipo": "entrada_tardia",
        })
        assert r.status_code == 200
        ind_id = r.json()["id"]
        cleanup_indisps.append(ind_id)

        sec = requests.Session()
        sec.headers.update({"Authorization": f"Bearer {secondary_user['token']}",
                            "Content-Type": "application/json"})
        u = sec.put(f"{BASE_URL}/api/indisponibilidades/{ind_id}",
                    json={"hora_inicio": "07:00", "hora_fim": "08:00"})
        assert u.status_code == 403, u.text

    def test_delete_owner(self, admin_client):
        d = (date.today() + timedelta(days=12)).isoformat()
        r = admin_client.post(f"{BASE_URL}/api/indisponibilidades", json={
            "data": d, "hora_inicio": "09:00", "hora_fim": "10:00",
            "tipo": "entrada_tardia",
        })
        assert r.status_code == 200
        ind_id = r.json()["id"]
        dr = admin_client.delete(f"{BASE_URL}/api/indisponibilidades/{ind_id}")
        assert dr.status_code == 200


# ============== early_leave_warning in /api/time-entries/start ==============

class TestEarlyLeaveWarning:
    def _end_active(self, client):
        """End any open time entry for today."""
        try:
            today = client.get(f"{BASE_URL}/api/time-entries/today")
            if today.status_code == 200:
                items = today.json() if isinstance(today.json(), list) else [today.json()]
                for it in items:
                    if it and not it.get("end_time") and it.get("id"):
                        client.post(f"{BASE_URL}/api/time-entries/end/{it['id']}")
        except Exception:
            pass

    def test_warning_present_for_saida_antecipada_today(self, admin_client, cleanup_indisps):
        # Ensure no active entry
        self._end_active(admin_client)

        today = date.today().isoformat()
        # Cleanup any existing today's indisp for admin
        existing = admin_client.get(f"{BASE_URL}/api/indisponibilidades/me",
                                    params={"inicio": today, "fim": today}).json()
        for it in existing:
            admin_client.delete(f"{BASE_URL}/api/indisponibilidades/{it['id']}")

        r = admin_client.post(f"{BASE_URL}/api/indisponibilidades", json={
            "data": today, "hora_inicio": "16:00", "hora_fim": "18:00",
            "tipo": "saida_antecipada", "regressa_servico": True,
            "observacoes": "TEST consulta médica",
        })
        assert r.status_code == 200, r.text
        cleanup_indisps.append(r.json()["id"])

        st = admin_client.post(f"{BASE_URL}/api/time-entries/start", json={})
        assert st.status_code in (200, 201), st.text
        body = st.json()
        warn = body.get("early_leave_warning")
        assert warn is not None, f"early_leave_warning missing: {body}"
        assert warn.get("hora_inicio") == "16:00"
        assert warn.get("hora_fim") == "18:00"
        assert warn.get("regressa_servico") is True
        assert "consulta" in (warn.get("observacoes") or "").lower()

        # cleanup time entry
        tid = body.get("id")
        if tid:
            admin_client.post(f"{BASE_URL}/api/time-entries/end/{tid}")

    def test_no_warning_for_entrada_tardia(self, admin_client, cleanup_indisps):
        self._end_active(admin_client)
        today = date.today().isoformat()
        existing = admin_client.get(f"{BASE_URL}/api/indisponibilidades/me",
                                    params={"inicio": today, "fim": today}).json()
        for it in existing:
            admin_client.delete(f"{BASE_URL}/api/indisponibilidades/{it['id']}")

        r = admin_client.post(f"{BASE_URL}/api/indisponibilidades", json={
            "data": today, "hora_inicio": "07:30", "hora_fim": "09:00",
            "tipo": "entrada_tardia",
        })
        assert r.status_code == 200
        cleanup_indisps.append(r.json()["id"])

        st = admin_client.post(f"{BASE_URL}/api/time-entries/start", json={})
        assert st.status_code in (200, 201)
        body = st.json()
        # Field absent OR explicitly null
        assert not body.get("early_leave_warning"), f"unexpected warning: {body.get('early_leave_warning')}"

        tid = body.get("id")
        if tid:
            admin_client.post(f"{BASE_URL}/api/time-entries/end/{tid}")
