"""
Helper para registar eventos no histórico duma PC.

Todas as chamadas devem passar por aqui para garantir consistência.
Uso:
    from services.pc_history import record_pc_event
    await record_pc_event(db, pc_id, "material_added", "Material 'Rolamento' adicionado",
                          current_user=current_user, material_id=mat_id)
"""
from datetime import datetime, timezone
from typing import Optional
import logging

logger = logging.getLogger(__name__)


async def record_pc_event(
    db,
    pc_id: str,
    action: str,
    description: str,
    current_user: Optional[dict] = None,
    material_id: Optional[str] = None,
    fornecedor_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    """Regista uma entrada de histórico. Nunca deve falhar o fluxo principal
    — se der erro, apenas loga (não levanta)."""
    try:
        import uuid
        doc = {
            "id": str(uuid.uuid4()),
            "pc_id": pc_id,
            "action": action,
            "description": description,
            "material_id": material_id,
            "fornecedor_id": fornecedor_id,
            "metadata": metadata or {},
            "user_id": (current_user or {}).get("sub"),
            "username": (current_user or {}).get("username"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.pc_historico.insert_one(doc)
    except Exception as e:
        logger.warning(f"Falha a registar histórico da PC {pc_id} ({action}): {e}")
