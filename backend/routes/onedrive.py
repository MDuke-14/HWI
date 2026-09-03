"""
OneDrive integration - per-user OAuth 2.0 (Microsoft Entra / M365).

Cada utilizador liga a sua própria conta Microsoft. Tokens (access + refresh) são
guardados encriptados na coleção `onedrive_tokens` do MongoDB, keyed por
`user_id` do sistema HWI. Um utilizador nunca acede aos ficheiros doutro.
"""
import os
import logging
import secrets
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from itsdangerous import BadSignature, URLSafeSerializer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

from server import get_current_user  # reutiliza JWT existente

logger = logging.getLogger(__name__)
router = APIRouter(tags=["onedrive"])

# --- Config ---
MS_TENANT = os.environ.get("MS_TENANT_ID") or "organizations"
MS_CLIENT_ID = os.environ.get("MS_CLIENT_ID")
MS_CLIENT_SECRET = os.environ.get("MS_CLIENT_SECRET")
MS_REDIRECT_PREVIEW = os.environ.get("MS_REDIRECT_URI_PREVIEW", "")
MS_REDIRECT_PROD = os.environ.get("MS_REDIRECT_URI_PROD", "")
FRONTEND_ORIGIN_PREVIEW = os.environ.get("FRONTEND_ORIGIN_PREVIEW", "")
FRONTEND_ORIGIN_PROD = os.environ.get("FRONTEND_ORIGIN_PROD", "")
TOKEN_KEY = os.environ.get("ONEDRIVE_TOKEN_KEY")

if not (MS_CLIENT_ID and MS_CLIENT_SECRET and TOKEN_KEY):
    logger.warning("OneDrive: variáveis de ambiente em falta — integração desativada")

AUTH_URL = f"https://login.microsoftonline.com/{MS_TENANT}/oauth2/v2.0/authorize"
TOKEN_URL = f"https://login.microsoftonline.com/{MS_TENANT}/oauth2/v2.0/token"
GRAPH = "https://graph.microsoft.com/v1.0"
SCOPES = "openid profile User.Read Files.ReadWrite offline_access"

_fernet = Fernet(TOKEN_KEY.encode()) if TOKEN_KEY else None
_state_signer = URLSafeSerializer(TOKEN_KEY, salt="onedrive-oauth-state") if TOKEN_KEY else None

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".bmp"}


def _db(request: Request):
    return request.app.state.db  # set em startup


def _enc(v: str) -> str:
    return _fernet.encrypt(v.encode()).decode()


def _dec(v: str) -> str:
    return _fernet.decrypt(v.encode()).decode()


def _now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def _pick_redirect_and_origin(request: Request) -> tuple[str, str]:
    """Decide qual redirect_uri e frontend_origin usar a partir do host do pedido."""
    host = request.headers.get("host", "")
    if "timesync-app-2.emergent.host" in host and MS_REDIRECT_PROD:
        return MS_REDIRECT_PROD, FRONTEND_ORIGIN_PROD
    return MS_REDIRECT_PREVIEW, FRONTEND_ORIGIN_PREVIEW


# ================================================================
#  1) OAuth start — abre popup Microsoft
# ================================================================
@router.get("/onedrive/oauth/start")
async def onedrive_oauth_start(
    request: Request,
    token: Optional[str] = Query(None, description="JWT passado via query (popups não enviam Authorization header)"),
):
    """Inicia o consent flow.
    O front-end abre `window.open('/api/onedrive/oauth/start?token=<jwt>')` num popup.
    Guardamos o user_id assinado dentro do `state` para o callback saber quem é.
    """
    if not (MS_CLIENT_ID and MS_CLIENT_SECRET and _state_signer):
        raise HTTPException(503, "OneDrive não configurado no backend")

    # Autenticar manualmente via ?token= (o popup não tem Authorization header)
    from jose import jwt, JWTError
    from server import SECRET_KEY, ALGORITHM

    if not token:
        raise HTTPException(401, "Token em falta")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise JWTError("no sub")
    except JWTError:
        raise HTTPException(401, "Token inválido")

    redirect_uri, _ = _pick_redirect_and_origin(request)
    state = _state_signer.dumps({"uid": str(user_id), "nonce": secrets.token_urlsafe(24)})
    query = urlencode({
        "client_id": MS_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "response_mode": "query",
        "scope": SCOPES,
        "state": state,
        "prompt": "select_account",
    })
    return RedirectResponse(f"{AUTH_URL}?{query}")


# ================================================================
#  2) OAuth callback — troca code por tokens
# ================================================================
@router.get("/onedrive/oauth/callback", response_class=HTMLResponse)
async def onedrive_oauth_callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
):
    redirect_uri, frontend_origin = _pick_redirect_and_origin(request)
    close_script = (
        "<script>"
        f"window.opener?.postMessage({{type:'onedrive-{{status}}',error:'{{err}}'}}, {frontend_origin!r});"
        "window.close();</script>"
    )

    if error:
        html = close_script.replace("{status}", "error").replace("{err}", (error_description or error).replace("'", ""))
        return HTMLResponse(html, status_code=400)

    if not (code and state and _state_signer):
        raise HTTPException(400, "Estado ou código em falta")

    try:
        payload = _state_signer.loads(state)
        user_id = payload["uid"]
    except (BadSignature, KeyError):
        raise HTTPException(400, "Estado inválido")

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(TOKEN_URL, data={
            "client_id": MS_CLIENT_ID,
            "client_secret": MS_CLIENT_SECRET,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "scope": SCOPES,
        })
        if r.status_code >= 400:
            logger.error(f"OneDrive token exchange falhou: {r.status_code} {r.text}")
            html = close_script.replace("{status}", "error").replace("{err}", "token exchange failed")
            return HTMLResponse(html, status_code=502)
        tokens = r.json()

        me = await client.get(f"{GRAPH}/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
        me.raise_for_status()
        profile = me.json()

    refresh = tokens.get("refresh_token")
    if not refresh:
        html = close_script.replace("{status}", "error").replace("{err}", "no refresh token")
        return HTMLResponse(html, status_code=502)

    db = _db(request)
    await db.onedrive_tokens.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "ms_user_id": profile["id"],
            "email": profile.get("mail") or profile.get("userPrincipalName"),
            "display_name": profile.get("displayName"),
            "access_token": _enc(tokens["access_token"]),
            "refresh_token": _enc(refresh),
            "expires_at": _now_ts() + int(tokens.get("expires_in", 3600)),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    logger.info(f"OneDrive ligado: user_id={user_id} email={profile.get('mail')}")

    html = close_script.replace("{status}", "connected").replace("{err}", "")
    return HTMLResponse(html)


# ================================================================
#  3) Status / Disconnect
# ================================================================
@router.get("/onedrive/status")
async def onedrive_status(request: Request, current_user: dict = Depends(get_current_user)):
    db = _db(request)
    row = await db.onedrive_tokens.find_one({"user_id": current_user["sub"]})
    if not row:
        return {"connected": False}
    return {
        "connected": True,
        "email": row.get("email"),
        "display_name": row.get("display_name"),
        "updated_at": row.get("updated_at"),
    }


@router.delete("/onedrive/disconnect")
async def onedrive_disconnect(request: Request, current_user: dict = Depends(get_current_user)):
    db = _db(request)
    await db.onedrive_tokens.delete_one({"user_id": current_user["sub"]})
    return {"disconnected": True}


# ================================================================
#  4) Refresh token helper
# ================================================================
async def _graph_token(request: Request, user_id: str) -> str:
    db = _db(request)
    row = await db.onedrive_tokens.find_one({"user_id": user_id})
    if not row:
        raise HTTPException(409, "OneDrive não está ligado — liga a tua conta no perfil")

    if row.get("expires_at", 0) > _now_ts() + 120:
        return _dec(row["access_token"])

    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(TOKEN_URL, data={
            "client_id": MS_CLIENT_ID,
            "client_secret": MS_CLIENT_SECRET,
            "grant_type": "refresh_token",
            "refresh_token": _dec(row["refresh_token"]),
            "scope": SCOPES,
        })
    if r.status_code >= 400:
        logger.warning(f"OneDrive refresh falhou (user_id={user_id}): {r.text}")
        await db.onedrive_tokens.delete_one({"_id": row["_id"]})
        raise HTTPException(401, "Sessão OneDrive expirada — volta a ligar no perfil")

    t = r.json()
    update = {
        "access_token": _enc(t["access_token"]),
        "expires_at": _now_ts() + int(t.get("expires_in", 3600)),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if t.get("refresh_token"):
        update["refresh_token"] = _enc(t["refresh_token"])
    await db.onedrive_tokens.update_one({"_id": row["_id"]}, {"$set": update})
    return t["access_token"]


# ================================================================
#  5) Listar imagens
# ================================================================
class ChildItem(BaseModel):
    id: str
    name: str
    size: Optional[int] = None
    mime_type: Optional[str] = None
    is_folder: bool = False
    thumbnail: Optional[str] = None
    modified: Optional[str] = None


@router.get("/onedrive/list")
async def onedrive_list(
    request: Request,
    folder_id: Optional[str] = Query(None, description="ID da pasta (None = root)"),
    search: Optional[str] = Query(None, description="Texto para procurar em todo o drive"),
    current_user: dict = Depends(get_current_user),
):
    """Lista pastas + imagens numa pasta OneDrive do utilizador logado.
    Se `search` for passado, faz `/me/drive/root/search(q='...')` restrito a imagens.
    """
    token = await _graph_token(request, current_user["sub"])
    headers = {"Authorization": f"Bearer {token}"}
    params = {
        "$select": "id,name,size,file,folder,parentReference,lastModifiedDateTime,thumbnails",
        "$expand": "thumbnails($select=small)",
        "$top": "200",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        if search:
            url = f"{GRAPH}/me/drive/root/search(q='{search}')"
        elif folder_id:
            url = f"{GRAPH}/me/drive/items/{folder_id}/children"
        else:
            url = f"{GRAPH}/me/drive/root/children"
        r = await client.get(url, headers=headers, params=params)

    if r.status_code == 401:
        raise HTTPException(401, "Sessão OneDrive expirada — volta a ligar")
    r.raise_for_status()

    items: list[dict] = []
    for x in r.json().get("value", []):
        name = x.get("name", "")
        ext = os.path.splitext(name)[1].lower()
        is_folder = "folder" in x
        is_image = "file" in x and ext in IMAGE_EXTS
        if not (is_folder or is_image):
            continue
        thumb = None
        thumbs = x.get("thumbnails") or []
        if thumbs and thumbs[0].get("small"):
            thumb = thumbs[0]["small"].get("url")
        items.append({
            "id": x["id"],
            "name": name,
            "size": x.get("size"),
            "mime_type": (x.get("file") or {}).get("mimeType"),
            "is_folder": is_folder,
            "thumbnail": thumb,
            "modified": x.get("lastModifiedDateTime"),
        })
    return {"items": items}


# ================================================================
#  6) Download bytes de UMA imagem
# ================================================================
@router.get("/onedrive/download/{item_id}")
async def onedrive_download(item_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    token = await _graph_token(request, current_user["sub"])
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        r = await client.get(
            f"{GRAPH}/me/drive/items/{item_id}/content",
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code in (401, 403):
        raise HTTPException(r.status_code, "Sem permissão para ler este ficheiro")
    r.raise_for_status()
    ct = r.headers.get("content-type", "application/octet-stream")
    if not ct.startswith("image/"):
        raise HTTPException(415, "O ficheiro selecionado não é uma imagem")
    return StreamingResponse(iter([r.content]), media_type=ct)



# ================================================================
#  7) Upload de ficheiro para o OneDrive (pasta HWI - FS na raiz)
# ================================================================
from fastapi import File, UploadFile, Form

ONEDRIVE_ROOT_FOLDER = "HWI - FS"


async def _ensure_folder_path(client: httpx.AsyncClient, token: str, path: str) -> str:
    """Cria (idempotente) uma cadeia de pastas separadas por '/'.
    Devolve o item_id da pasta final.
    Ex: `HWI - FS/FS-373/Fotografias`.
    """
    parts = [p for p in path.split("/") if p]
    if not parts:
        raise ValueError("path vazio")
    headers = {"Authorization": f"Bearer {token}"}
    current_id = None  # None = root
    for i, part in enumerate(parts):
        rel = "/".join(parts[: i + 1])
        r = await client.get(f"{GRAPH}/me/drive/root:/{rel}", headers=headers)
        if r.status_code == 200:
            current_id = r.json()["id"]
            continue
        if r.status_code != 404:
            r.raise_for_status()
        # cria dentro do pai
        if current_id is None:
            create_url = f"{GRAPH}/me/drive/root/children"
        else:
            create_url = f"{GRAPH}/me/drive/items/{current_id}/children"
        create = await client.post(
            create_url,
            headers={**headers, "Content-Type": "application/json"},
            json={"name": part, "folder": {}, "@microsoft.graph.conflictBehavior": "fail"},
        )
        if create.status_code == 409:
            # Race: outra chamada criou primeiro — lê de novo
            r2 = await client.get(f"{GRAPH}/me/drive/root:/{rel}", headers=headers)
            r2.raise_for_status()
            current_id = r2.json()["id"]
        else:
            create.raise_for_status()
            current_id = create.json()["id"]
    return current_id


async def _ensure_folder(client: httpx.AsyncClient, token: str, folder_name: str) -> str:
    """Compat wrapper — usa a nova função com path plano."""
    return await _ensure_folder_path(client, token, folder_name)


@router.post("/onedrive/upload")
async def onedrive_upload(
    request: Request,
    file: UploadFile = File(...),
    filename_override: Optional[str] = Form(None),
    subfolder_path: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Envia bytes para OneDrive na pasta `HWI - FS/{subfolder_path}` (ou `HWI - FS` se vazio).
    Retorna `{ok, id, web_url, name, path}`.
    """
    token = await _graph_token(request, current_user["sub"])
    content = await file.read()
    if not content:
        raise HTTPException(400, "Ficheiro vazio")
    name = (filename_override or file.filename or "foto.jpg").strip().replace("/", "_")
    ct = file.content_type or "application/octet-stream"

    # Pasta destino: sempre relativa a "HWI - FS"
    parent = ONEDRIVE_ROOT_FOLDER
    if subfolder_path:
        sub = subfolder_path.strip().strip("/")
        # sanitizar nomes de pasta
        safe_parts = [p.replace("\\", "_").replace(":", "_")[:120] for p in sub.split("/") if p]
        if safe_parts:
            parent = f"{ONEDRIVE_ROOT_FOLDER}/" + "/".join(safe_parts)

    async with httpx.AsyncClient(timeout=120) as client:
        try:
            await _ensure_folder_path(client, token, parent)
        except Exception as e:
            logger.error(f"OneDrive upload — falha a criar pasta '{parent}': {e}")
            raise HTTPException(502, f"Não foi possível preparar a pasta '{parent}' no OneDrive")

        upload_url = (
            f"{GRAPH}/me/drive/root:/{parent}/{name}:/content"
            f"?@microsoft.graph.conflictBehavior=rename"
        )
        r = await client.put(
            upload_url,
            headers={"Authorization": f"Bearer {token}", "Content-Type": ct},
            content=content,
        )
    if r.status_code in (401, 403):
        raise HTTPException(r.status_code, "Sem permissão para escrever no OneDrive — reconfirma o acesso no perfil")
    if r.status_code >= 400:
        logger.error(f"OneDrive upload falhou: {r.status_code} {r.text}")
        raise HTTPException(502, f"OneDrive rejeitou o upload ({r.status_code})")
    data = r.json()
    return {
        "ok": True,
        "id": data.get("id"),
        "name": data.get("name"),
        "web_url": data.get("webUrl"),
        "size": data.get("size"),
        "path": f"{parent}/{data.get('name')}",
    }


# ================================================================
#  8) Ligar foto FS ao item OneDrive (guarda referência)
# ================================================================
class LinkPayload(BaseModel):
    onedrive_item_id: Optional[str] = None
    onedrive_web_url: Optional[str] = None
    onedrive_path: Optional[str] = None
    sync_status: str = "synced"  # synced | pending | failed


@router.patch("/relatorios-tecnicos/{relatorio_id}/fotografias/{foto_id}/onedrive-link")
async def link_photo_to_onedrive(
    relatorio_id: str,
    foto_id: str,
    payload: LinkPayload,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    db = _db(request)
    foto = await db.fotos_relatorio.find_one({"id": foto_id, "relatorio_id": relatorio_id}, {"_id": 0, "id": 1})
    if not foto:
        raise HTTPException(404, "Fotografia não encontrada")
    update = {
        "onedrive_sync_status": payload.sync_status,
        "onedrive_synced_at": datetime.now(timezone.utc).isoformat() if payload.sync_status == "synced" else None,
        "onedrive_synced_by_user_id": current_user["sub"] if payload.sync_status == "synced" else None,
    }
    if payload.onedrive_item_id:
        update["onedrive_item_id"] = payload.onedrive_item_id
    if payload.onedrive_web_url:
        update["onedrive_web_url"] = payload.onedrive_web_url
    if payload.onedrive_path:
        update["onedrive_path"] = payload.onedrive_path
    await db.fotos_relatorio.update_one({"id": foto_id}, {"$set": update})
    return {"ok": True}


# ================================================================
#  9) Retry das fotos pendentes do utilizador
# ================================================================
import base64 as _b64


@router.post("/onedrive/sync-pending")
async def sync_pending_photos(request: Request, current_user: dict = Depends(get_current_user)):
    """Re-tenta upload para OneDrive de todas as fotografias marcadas como
    `onedrive_sync_status in ("pending","failed")` que este utilizador criou.
    """
    db = _db(request)
    user_id = current_user["sub"]

    # Só re-tentar fotos que este utilizador tirou (evita disparar tokens de outros)
    cursor = db.fotos_relatorio.find(
        {
            "uploaded_by": user_id,
            "onedrive_sync_status": {"$in": ["pending", "failed"]},
        },
        {"_id": 0, "id": 1, "relatorio_id": 1, "intervencao_id": 1, "filename": 1,
         "content_type": 1, "foto_base64": 1, "uploaded_at": 1},
    )
    to_retry = await cursor.to_list(length=200)
    if not to_retry:
        return {"retried": 0, "synced": 0, "failed": 0}

    token = await _graph_token(request, user_id)
    synced = 0
    failed = 0
    for foto in to_retry:
        try:
            # Descobrir número FS + folder path
            relatorio = await db.relatorios_tecnicos.find_one(
                {"id": foto["relatorio_id"]}, {"_id": 0, "numero_assistencia": 1}
            )
            fs_num = (relatorio or {}).get("numero_assistencia", "X")
            subfolder = f"FS-{fs_num}/Fotografias"
            parent = f"{ONEDRIVE_ROOT_FOLDER}/{subfolder}"

            content = _b64.b64decode(foto.get("foto_base64", ""))
            if not content:
                failed += 1
                continue
            name = foto.get("filename") or f"foto_{foto['id']}.jpg"
            ct = foto.get("content_type") or "image/jpeg"

            async with httpx.AsyncClient(timeout=120) as client:
                await _ensure_folder_path(client, token, parent)
                upload_url = (
                    f"{GRAPH}/me/drive/root:/{parent}/{name}:/content"
                    f"?@microsoft.graph.conflictBehavior=rename"
                )
                r = await client.put(
                    upload_url,
                    headers={"Authorization": f"Bearer {token}", "Content-Type": ct},
                    content=content,
                )
            if r.status_code >= 400:
                failed += 1
                await db.fotos_relatorio.update_one(
                    {"id": foto["id"]},
                    {"$set": {
                        "onedrive_sync_status": "failed",
                        "onedrive_last_error": r.text[:500],
                    }},
                )
                continue

            data = r.json()
            await db.fotos_relatorio.update_one(
                {"id": foto["id"]},
                {"$set": {
                    "onedrive_sync_status": "synced",
                    "onedrive_item_id": data.get("id"),
                    "onedrive_web_url": data.get("webUrl"),
                    "onedrive_path": f"{parent}/{data.get('name')}",
                    "onedrive_synced_at": datetime.now(timezone.utc).isoformat(),
                    "onedrive_last_error": None,
                }},
            )
            synced += 1
        except Exception as e:
            logger.warning(f"sync-pending falhou para foto {foto.get('id')}: {e}")
            failed += 1
            await db.fotos_relatorio.update_one(
                {"id": foto["id"]},
                {"$set": {"onedrive_sync_status": "failed", "onedrive_last_error": str(e)[:500]}},
            )

    return {"retried": len(to_retry), "synced": synced, "failed": failed}

