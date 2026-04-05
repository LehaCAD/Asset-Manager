import threading
from django.core.mail import send_mail
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


def _send_email(subject, message, recipient):
    """Отправить письмо в фоне (plain text, без HTML)."""
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
        )
        logger.info(f"Email sent to {recipient}: {subject}")
    except Exception as e:
        logger.error(f"Failed to send email to {recipient}: {e}")


def send_verification_email(user):
    """Отправить письмо подтверждения email (fire-and-forget)."""
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={user.email_verification_token}"
    message = (
        f"Здравствуйте, {user.username}!\n\n"
        f"Для подтверждения email перейдите по ссылке:\n"
        f"{verify_url}\n\n"
        f"Если вы не регистрировались — просто проигнорируйте это письмо.\n\n"
        f"— Раскадровка"
    )
    threading.Thread(
        target=_send_email,
        args=('Подтвердите email — Раскадровка', message, user.email),
        daemon=True,
    ).start()


def send_password_reset_email(user):
    """Отправить письмо сброса пароля (fire-and-forget)."""
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={user.password_reset_token}"
    message = (
        f"Здравствуйте, {user.username}!\n\n"
        f"Для сброса пароля перейдите по ссылке (действует 1 час):\n"
        f"{reset_url}\n\n"
        f"Если вы не запрашивали сброс — просто проигнорируйте это письмо.\n\n"
        f"— Раскадровка"
    )
    threading.Thread(
        target=_send_email,
        args=('Сброс пароля — Раскадровка', message, user.email),
        daemon=True,
    ).start()
