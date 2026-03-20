"""
Rotas de Notificações (CRUD, Push, VAPID).
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone, timedelta
import os
import logging
import json

from database import db
from auth_utils import get_current_user
from models import PushSubscription

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _get_push_helpers():
    """Lazy import to avoid circular dependencies"""
    try:
        import server
        return server.send_push_notification, server.send_push_to_admins, server.send_push_to_user
    except (ImportError, AttributeError):
        async def noop(*args, **kwargs): pass
        return noop, noop, noop


@router.get("")
async def get_notifications(
    unread_only: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Buscar notificações do usuário (auto-limpa >8 dias)"""
    # Auto-cleanup: remover notificações com mais de 8 dias
    cutoff = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
    await db.notifications.delete_many({
        "user_id": current_user["sub"],
        "created_at": {"$lt": cutoff}
    })
    
    query = {"user_id": current_user["sub"]}
    
    if unread_only:
        query["read"] = False
    
    notifications = await db.notifications.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(length=None)
    
    return notifications

@router.put("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Marcar notificação como lida"""
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user["sub"]},
        {"$set": {"read": True}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")
    
    return {"message": "Notificação marcada como lida"}

@router.post("/subscribe")
async def subscribe_push(
    subscription: dict,
    current_user: dict = Depends(get_current_user)
):
    """Registrar subscription de push notifications"""
    from pywebpush import webpush, WebPushException
    
    # Validar dados da subscription
    endpoint = subscription.get("endpoint", "")
    keys = subscription.get("keys", {})
    
    if not endpoint or not keys.get("p256dh") or not keys.get("auth"):
        raise HTTPException(status_code=400, detail="Subscription inválida: endpoint ou keys em falta")
    
    # Verificar se as VAPID keys estão configuradas
    vapid_private = os.environ.get('VAPID_PRIVATE_KEY')
    vapid_public = os.environ.get('VAPID_PUBLIC_KEY')
    
    if not vapid_private or not vapid_public:
        raise HTTPException(status_code=500, detail="VAPID keys não configuradas no servidor")
    
    # Remover subscription antiga do usuário
    await db.push_subscriptions.delete_many({"user_id": current_user["sub"]})
    
    # Criar nova subscription
    push_sub = PushSubscription(
        user_id=current_user["sub"],
        endpoint=endpoint,
        keys=keys
    )
    
    sub_dict = push_sub.dict()
    sub_dict["created_at"] = sub_dict["created_at"].isoformat()
    # Guardar também a chave pública usada para criar esta subscription
    sub_dict["vapid_public_key_hash"] = hash(vapid_public) % 10000  # Hash curto para comparação
    
    await db.push_subscriptions.insert_one(sub_dict)
    
    logging.info(f"Push subscription registrada para usuário {current_user['sub']} (endpoint: {endpoint[:50]}...)")
    
    return {"message": "Subscription registrada com sucesso", "status": "active"}


@router.get("/vapid-public-key")
async def get_vapid_public_key():
    """Retorna a chave pública VAPID para o frontend usar"""
    vapid_public = os.environ.get('VAPID_PUBLIC_KEY')
    if not vapid_public:
        raise HTTPException(status_code=500, detail="VAPID public key não configurada")
    return {"publicKey": vapid_public}


@router.get("/push-status")
async def get_push_status(current_user: dict = Depends(get_current_user)):
    """Verificar estado da subscription de push do usuário"""
    subscription = await db.push_subscriptions.find_one({"user_id": current_user["sub"]})
    
    if not subscription:
        return {"status": "not_subscribed", "message": "Nenhuma subscription encontrada"}
    
    # Verificar se a subscription foi criada com a chave VAPID atual
    vapid_public = os.environ.get('VAPID_PUBLIC_KEY')
    current_hash = hash(vapid_public) % 10000 if vapid_public else 0
    stored_hash = subscription.get("vapid_public_key_hash", 0)
    
    if stored_hash != 0 and stored_hash != current_hash:
        return {
            "status": "key_mismatch",
            "message": "A subscription foi criada com chaves VAPID diferentes. Por favor, reative as notificações.",
            "needs_resubscribe": True
        }
    
    return {
        "status": "active",
        "endpoint": subscription["endpoint"][:50] + "...",
        "created_at": subscription.get("created_at"),
        "needs_resubscribe": False
    }


async def send_push_to_user(user_id: str, title: str, message: str, notification_type: str = "info", priority: str = "medium"):
    """Função utilitária para enviar push notification para um usuário"""
    from pywebpush import webpush, WebPushException
    import json
    
    vapid_private = os.environ.get('VAPID_PRIVATE_KEY')
    vapid_public = os.environ.get('VAPID_PUBLIC_KEY')
    vapid_email = os.environ.get('VAPID_CLAIM_EMAIL', 'geral@hwi.pt')
    
    if not vapid_private or not vapid_public:
        logging.warning("VAPID keys não configuradas")
        return False
    
    subscriptions = await db.push_subscriptions.find({"user_id": user_id}).to_list(None)
    
    if not subscriptions:
        logging.info(f"Nenhuma subscription encontrada para usuário {user_id}")
        return False
    
    sent_count = 0
    for sub in subscriptions:
        try:
            payload = json.dumps({
                "title": title,
                "message": message,
                "type": notification_type,
                "priority": priority
            })
            
            webpush(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": sub["keys"]
                },
                data=payload,
                vapid_private_key=vapid_private,
                vapid_claims={"sub": f"mailto:{vapid_email}"}
            )
            sent_count += 1
            logging.info(f"Push notification enviada para {user_id}")
            
        except WebPushException as e:
            logging.error(f"Erro ao enviar push: {e}")
            # Se a subscription expirou, é inválida ou as chaves VAPID não correspondem, remover
            if e.response and e.response.status_code in [403, 404, 410]:
                await db.push_subscriptions.delete_one({"_id": sub["_id"]})
                logging.info(f"Subscription inválida/expirada removida para {user_id} (status: {e.response.status_code})")
        except Exception as e:
            logging.error(f"Erro inesperado ao enviar push: {e}")
    
    return sent_count > 0


@router.post("/test-push")
async def test_push_notification(
    current_user: dict = Depends(get_current_user)
):
    """Enviar notificação push de teste para o usuário atual"""
    _, _, send_push_to_user = _get_push_helpers()
    success = await send_push_to_user(
        current_user["sub"],
        "Teste de Notificação",
        "Esta é uma notificação de teste. Se você está vendo isto, as notificações push estão funcionando!",
        "test",
        "medium"
    )
    
    if success:
        return {"message": "Notificação de teste enviada com sucesso!"}
    else:
        raise HTTPException(status_code=400, detail="Não foi possível enviar a notificação. Verifique se as notificações push estão ativadas.")


@router.post("/test-clock-in-reminder")
async def test_clock_in_reminder(
    current_user: dict = Depends(get_current_user)
):
    """Testar notificação de lembrete de clock-in (apenas para admins)"""
    user = await db.users.find_one({"id": current_user["sub"]})
    if not user or not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Apenas administradores podem testar esta funcionalidade")
    
    from notifications_scheduler import send_push_notification
    from datetime import date
    
    today_formatted = date.today().strftime("%d/%m/%Y")
    
    send_push_notification, _, _ = _get_push_helpers()
    success = await send_push_notification(
        db,
        current_user["sub"],
        "⚠️ Não Iniciou o Ponto",
        f"Ainda não registou entrada hoje ({today_formatted}). Por favor, regularize a situação.",
        "clock_in_reminder",
        "high"
    )
    
    if success:
        return {"message": "Notificação de lembrete de entrada enviada!"}
    else:
        raise HTTPException(status_code=400, detail="Não foi possível enviar a notificação.")


@router.post("/test-clock-out-reminder")
async def test_clock_out_reminder(
    current_user: dict = Depends(get_current_user)
):
    """Testar notificação de lembrete de clock-out (apenas para admins)"""
    user = await db.users.find_one({"id": current_user["sub"]})
    if not user or not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Apenas administradores podem testar esta funcionalidade")
    
    from notifications_scheduler import send_push_notification
    
    send_push_notification, _, _ = _get_push_helpers()
    success = await send_push_notification(
        db,
        current_user["sub"],
        "🕐 Não Parou o Ponto",
        "O seu ponto está ativo após as 18:00. Entrada: 09:00. Aguarde autorização de horas extra.",
        "clock_out_reminder",
        "high"
    )
    
    if success:
        return {"message": "Notificação de lembrete de saída enviada!"}
    else:
        raise HTTPException(status_code=400, detail="Não foi possível enviar a notificação.")


@router.post("/test-overtime-admin")
async def test_overtime_admin_notification(
    current_user: dict = Depends(get_current_user)
):
    """Testar notificação de horas extra para admin (apenas para admins)"""
    user = await db.users.find_one({"id": current_user["sub"]})
    if not user or not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Apenas administradores podem testar esta funcionalidade")
    
    from notifications_scheduler import send_push_to_admins
    
    _, send_push_to_admins, _ = _get_push_helpers()
    count = await send_push_to_admins(
        db,
        "⚠️ Pedido de Horas Extra",
        "Utilizador Teste ainda tem o ponto ativo. Autorize ou rejeite as horas extra.",
        "overtime_authorization",
        "high"
    )
    
    return {"message": f"Notificação enviada para {count} administrador(es)!"}


@router.patch("/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    """Marcar todas as notificações como lidas"""
    result = await db.notifications.update_many(
        {"user_id": current_user["sub"], "read": False},
        {"$set": {"read": True}}
    )
    return {"message": f"{result.modified_count} notificações marcadas como lidas"}

@router.delete("/all")
async def delete_all_notifications(
    current_user: dict = Depends(get_current_user)
):
    """Deletar todas as notificações do usuário"""
    result = await db.notifications.delete_many({"user_id": current_user["sub"]})
    
    return {"message": f"{result.deleted_count} notificações removidas"}

