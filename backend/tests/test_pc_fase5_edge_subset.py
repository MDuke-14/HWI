"""Edge case Fase 5: modo global com subset de materiais + 2 destinatários.
O frontend envia material_ids != [] quando o utilizador desmarca materiais no
modal GLOBAL; o backend classifica isso como 'individual' e rejeita >1
destinatário → 400. Este teste documenta o comportamento observado.
"""
import time
import uuid

import pytest

from tests.test_pc_enviar_cotacao_fase5 import (  # noqa: F401
    API, REAL_EMAIL, REAL_EMAIL_2, client, creds, relatorio_id,
    _make_pc, _cleanup_pc, _materiais,
)


def test_global_subset_materiais_com_2_destinatarios(client, relatorio_id):  # noqa: F811
    ctx = _make_pc(client, relatorio_id, 3)
    try:
        subset = ctx["material_ids"][:2]
        r = client.post(f"{API}/pedidos-cotacao/{ctx['pc_id']}/enviar-cotacao", json={
            "material_ids": subset,
            "emails_manuais": [
                {"email": REAL_EMAIL, "nome": "TEST_A"},
                {"email": REAL_EMAIL_2, "nome": "TEST_B"},
            ],
        }, timeout=180)
        print("STATUS:", r.status_code, "BODY:", r.text[:300])
        assert r.status_code == 200, (
            "BUG: modo global com subset de materiais + 2 destinatários é "
            f"rejeitado ({r.status_code}: {r.text[:200]})"
        )
        body = r.json()
        assert body["enviados"] == 2, body
        time.sleep(1)
        _, mats = _materiais(client, ctx["pc_id"])
        for mid in subset:
            assert len(mats[mid].get("cotacoes_solicitadas") or []) == 2
    finally:
        _cleanup_pc(client, ctx)
