from decimal import Decimal

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.db import transaction

from apps.notifications.services import create_notification
from .adapters import CreditsAdapter
from .models import Conversation, Message, FeedbackReward

import logging

logger = logging.getLogger(__name__)


def grant_reward(
    conversation: Conversation,
    amount: Decimal,
    comment: str,
    granted_by,
) -> FeedbackReward:
    """Начислить Кадры юзеру за обратную связь."""
    import uuid as _uuid
    reward_marker = str(_uuid.uuid4())

    # Атомарная транзакция: топап кредитов и создание записи FeedbackReward
    # должны коммититься вместе — иначе при сбое юзер получит кредиты без аудит-трейла.
    with transaction.atomic():
        metadata = {
            "feedback_conversation_id": conversation.id,
            "comment": comment,
            "reward_marker": reward_marker,
        }
        tx = CreditsAdapter.grant_reward(
            user=conversation.user,
            amount=amount,
            metadata=metadata,
        )

        reward = FeedbackReward.objects.create(
            conversation=conversation,
            amount=amount,
            comment=comment,
            transaction=tx,
            granted_by=granted_by,
        )

        # Системное сообщение в чат
        system_text = f"Начислено {amount} Кадров"
        if comment:
            system_text += f": {comment}"
        sys_msg = Message.objects.create(
            conversation=conversation,
            sender=granted_by,
            is_admin=True,
            text=f"[SYS] {system_text}",
        )

    # WebSocket и notification — вне транзакции (side effects после коммита)
    _send_to_conversation(conversation.id, {
        "type": "reward_granted",
        "amount": str(amount),
        "comment": comment,
        "message": {
            "id": sys_msg.id,
            "is_admin": True,
            "text": sys_msg.text,
            "created_at": sys_msg.created_at.isoformat(),
            "attachments": [],
        },
    })

    # Notification юзеру
    create_notification(
        user=conversation.user,
        type="feedback_reward",
        project=None,
        title="Награда за обратную связь",
        message=system_text,
    )

    return reward


def notify_new_message(conversation: Conversation, message: Message):
    """Отправить WS-событие о новом сообщении + notification."""
    if not message.text:
        return

    _send_to_conversation(conversation.id, {
        "type": "new_message",
        "message": {
            "id": message.id,
            "sender_name": message.sender.username,
            "is_admin": message.is_admin,
            "text": message.text,
            "created_at": message.created_at.isoformat(),
            "attachments": [],
        },
    })

    # Notification: если от юзера — уведомить админов; если от админа — юзеру
    if not message.is_admin:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        # TODO: bulk_create notifications — сейчас N запросов по числу staff-юзеров,
        # но при малом числе админов некритично.
        for admin in User.objects.filter(is_staff=True):
            create_notification(
                user=admin,
                type="feedback_new",
                project=None,
                title=f"Обращение от {conversation.user.username}",
                message=message.text[:100],
            )
    else:
        create_notification(
            user=conversation.user,
            type="feedback_reply",
            project=None,
            title="Ответ от команды",
            message=message.text[:100],
        )


def notify_conversation_updated(conversation: Conversation):
    """Отправить WS-событие об изменении статуса/тега."""
    _send_to_conversation(conversation.id, {
        "type": "conversation_updated",
        "status": conversation.status,
        "tag": conversation.tag,
    })


def notify_attachment_ready(conversation_id: int, message_id: int, attachment_data: dict):
    """Отправить WS-событие что вложение обработано."""
    _send_to_conversation(conversation_id, {
        "type": "attachment_ready",
        "message_id": message_id,
        "attachment": attachment_data,
    })


def _send_to_conversation(conversation_id: int, payload: dict):
    """Отправить событие в WebSocket группу диалога."""
    channel_layer = get_channel_layer()
    try:
        async_to_sync(channel_layer.group_send)(
            f"feedback_{conversation_id}",
            payload,
        )
    except Exception:
        logger.exception("Failed to send WS event to feedback_%s", conversation_id)
