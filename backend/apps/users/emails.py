"""
Транзакционная почта: подтверждение email, сброс пароля.

Отправляется через SMTP (reg.ru) с HTML-шаблонами и plain-text fallback.
Fire-and-forget через отдельный поток — чтобы не блокировать ответ Django
и не задерживать логин/регистрацию, когда SMTP-сервер тормозит.

Подробности и лимиты — docs/systems/email.md.
"""

import logging
import threading
from typing import Iterable

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags

logger = logging.getLogger(__name__)


def _deliver(
    subject: str,
    template_name: str,
    context: dict,
    to: Iterable[str],
    plain_fallback: str | None = None,
) -> None:
    """Отрендерить HTML-шаблон и отправить письмо. Синхронно, ловит все исключения."""
    try:
        html_body = render_to_string(template_name, context)
        text_body = plain_fallback or strip_tags(html_body)
        message = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=list(to),
        )
        message.attach_alternative(html_body, 'text/html')
        message.send(fail_silently=False)
        logger.info('Email sent to %s: %s', ', '.join(to), subject)
    except Exception as exc:
        logger.error('Failed to send email to %s (%s): %s', ', '.join(to), subject, exc)


def _spawn(subject: str, template: str, context: dict, to: Iterable[str], plain: str) -> None:
    threading.Thread(
        target=_deliver,
        args=(subject, template, context, to, plain),
        daemon=True,
    ).start()


def send_verification_email(user) -> None:
    """Письмо с ссылкой на подтверждение email (fire-and-forget)."""
    verify_url = f'{settings.FRONTEND_URL}/verify-email?token={user.email_verification_token}'
    context = {'user': user, 'verify_url': verify_url}
    plain = (
        f'Здравствуйте, {user.username}!\n\n'
        f'Для подтверждения email перейдите по ссылке:\n{verify_url}\n\n'
        f'Если вы не регистрировались — просто проигнорируйте это письмо.\n\n'
        f'— Раскадровка'
    )
    _spawn(
        subject='Подтвердите email — Раскадровка',
        template='emails/verify_email.html',
        context=context,
        to=[user.email],
        plain=plain,
    )


def send_password_reset_email(user) -> None:
    """Письмо со ссылкой на сброс пароля (fire-and-forget)."""
    reset_url = f'{settings.FRONTEND_URL}/reset-password?token={user.password_reset_token}'
    context = {'user': user, 'reset_url': reset_url}
    plain = (
        f'Здравствуйте, {user.username}!\n\n'
        f'Для сброса пароля перейдите по ссылке (действует 1 час):\n{reset_url}\n\n'
        f'Если вы не запрашивали сброс — просто проигнорируйте это письмо.\n\n'
        f'— Раскадровка'
    )
    _spawn(
        subject='Сброс пароля — Раскадровка',
        template='emails/reset_password.html',
        context=context,
        to=[user.email],
        plain=plain,
    )
