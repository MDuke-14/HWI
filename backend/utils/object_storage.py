"""
Emergent Object Storage helper.

Substitui gravações locais em `app/uploads/*` por object storage persistente.
Segue a Emergent Object Storage playbook.
"""
import os
import logging

import requests

logger = logging.getLogger(__name__)

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = os.environ.get("APP_NAME", "hwi-fs")

_storage_key: str | None = None


def init_storage(force: bool = False) -> str | None:
    """Inicializa (uma vez) o storage_key. Idempotente."""
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    if not EMERGENT_KEY:
        logger.warning("EMERGENT_LLM_KEY não definido — object storage desativado")
        return None
    try:
        resp = requests.post(
            f"{STORAGE_URL}/init",
            json={"emergent_key": EMERGENT_KEY},
            timeout=30,
        )
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
        logger.info("Emergent Object Storage inicializado")
        return _storage_key
    except Exception as e:
        logger.error(f"Falha ao inicializar object storage: {e}")
        _storage_key = None
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """
    Upload binário para o object storage.

    Args:
      path: caminho relativo (sem barra inicial), ex "hwi-fs/absences/<id>.pdf"
      data: bytes do ficheiro
      content_type: MIME type

    Returns:
      dict com {"path", "size", "etag"}. Levanta Exception em erro.
    """
    key = init_storage()
    if not key:
        raise RuntimeError("Object storage não inicializado")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 404:
        # storage_key pode ter expirado — força re-init e tenta uma vez
        logger.warning("storage_key expirou — a re-inicializar e a tentar de novo")
        key = init_storage(force=True)
        if not key:
            raise RuntimeError("Object storage não recuperou após re-init")
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple[bytes, str]:
    """
    Descarrega binário do object storage.

    Returns:
      (content_bytes, content_type)
    """
    key = init_storage()
    if not key:
        raise RuntimeError("Object storage não inicializado")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    if resp.status_code == 404:
        # tenta re-init
        key = init_storage(force=True)
        if key:
            resp = requests.get(
                f"{STORAGE_URL}/objects/{path}",
                headers={"X-Storage-Key": key},
                timeout=60,
            )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp", "pdf": "application/pdf",
}


def guess_content_type(filename: str, fallback: str = "application/octet-stream") -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return MIME_TYPES.get(ext, fallback)
