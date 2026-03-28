# Production Round 2: Auth Flows & Legal Pages

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Email verification, password reset, ToS/Privacy Policy, галочка на регистрации. После этого раунда можно открывать регистрацию для всех.

**Срок:** ~5-7 дней
**Зависимости:** Round 1 (HTTPS, Sentry)
**Блокирует:** Открытие регистрации

---

## File Map

| File | Action | Задача |
|------|--------|--------|
| `backend/config/settings.py` | Modify | EMAIL backend config |
| `backend/requirements.txt` | Modify | Нет новых зависимостей (всё встроено в Django) |
| `backend/apps/users/models.py` | Modify | Добавить `is_email_verified`, `email_verification_token` |
| `backend/apps/users/serializers.py` | Modify | Добавить `tos_accepted` в регистрацию |
| `backend/apps/users/views.py` | Modify | Email verification, password reset views |
| `backend/apps/users/urls.py` | Modify | Новые эндпоинты |
| `backend/apps/users/emails.py` | Create | Email-отправка (verification, reset) |
| `backend/apps/users/migrations/000X_*.py` | Create | Миграция для новых полей |
| `backend/templates/emails/verify_email.html` | Create | HTML-шаблон письма верификации |
| `backend/templates/emails/reset_password.html` | Create | HTML-шаблон письма сброса |
| `frontend/app/(auth)/verify-email/page.tsx` | Create | Страница подтверждения email |
| `frontend/app/(auth)/forgot-password/page.tsx` | Create | Страница "забыли пароль" |
| `frontend/app/(auth)/reset-password/page.tsx` | Create | Страница ввода нового пароля |
| `frontend/app/(auth)/register/page.tsx` | Modify | Галочка ToS |
| `frontend/app/(auth)/login/page.tsx` | Modify | Ссылка "Забыли пароль?" |
| `frontend/app/(workspace)/terms/page.tsx` | Create | Условия использования |
| `frontend/app/(workspace)/privacy/page.tsx` | Create | Политика конфиденциальности |
| `frontend/lib/api/auth.ts` | Modify | Новые API-вызовы |

---

## Task 1: Email Backend

**Files:** `backend/config/settings.py`

- [ ] Добавить email конфигурацию:
```python
# === Email ===
EMAIL_BACKEND = os.getenv('EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = os.getenv('EMAIL_HOST', '')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', 587))
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True').lower() == 'true'
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'Раскадровка <noreply@raskadrawka.ru>')

FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')
```

- [ ] В `.env.production` добавить SMTP-данные (Yandex 360 / Mailgun / SendGrid)

**Варианты SMTP-провайдера:**

| Провайдер | Бесплатный лимит | Рекомендация |
|-----------|-----------------|--------------|
| Yandex 360 Business | 1000 писем/сутки | Домен `@raskadrawka.ru`, бесплатно |
| Mailgun | 100 писем/день (trial) | Хороший API, $0.80/1000 писем |
| SendGrid | 100 писем/день | Популярный, Free tier |
| Brevo (ex-Sendinblue) | 300 писем/день | Бесплатно, хватит для старта |

**Рекомендация для старта:** Brevo (300 писем/день бесплатно) или Yandex 360 (если уже подключён домен).

---

## Task 2: Модель — email verification поля

**Files:** `backend/apps/users/models.py`, новая миграция

- [ ] Добавить поля в User модель:
```python
import uuid
from django.utils import timezone
from datetime import timedelta

class User(AbstractUser):
    ...existing fields...

    is_email_verified = models.BooleanField(default=False)
    email_verification_token = models.UUIDField(default=uuid.uuid4, editable=False)
    email_verification_sent_at = models.DateTimeField(null=True, blank=True)
    password_reset_token = models.UUIDField(null=True, blank=True)
    password_reset_sent_at = models.DateTimeField(null=True, blank=True)
    tos_accepted_at = models.DateTimeField(null=True, blank=True)

    def is_password_reset_token_valid(self):
        """Токен сброса пароля валиден 1 час."""
        if not self.password_reset_token or not self.password_reset_sent_at:
            return False
        return timezone.now() - self.password_reset_sent_at < timedelta(hours=1)

    def can_resend_verification(self):
        """Можно отправлять повторно раз в 60 секунд."""
        if not self.email_verification_sent_at:
            return True
        return timezone.now() - self.email_verification_sent_at > timedelta(seconds=60)
```

- [ ] Создать и применить миграцию:
```bash
docker compose exec backend python manage.py makemigrations users
docker compose exec backend python manage.py migrate
```

> **ВАЖНО:** Миграция обратно совместима (все новые поля nullable или с default). Можно безопасно применять на production.

---

## Task 3: Email-отправка

**Files:** `backend/apps/users/emails.py` (create)

- [ ] Создать `backend/apps/users/emails.py`:
```python
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


def send_verification_email(user):
    """Отправить письмо подтверждения email."""
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={user.email_verification_token}"

    html_message = render_to_string('emails/verify_email.html', {
        'user': user,
        'verify_url': verify_url,
    })

    try:
        send_mail(
            subject='Подтвердите email — Раскадровка',
            message=f'Перейдите по ссылке для подтверждения: {verify_url}',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            html_message=html_message,
        )
        logger.info(f"Verification email sent to {user.email}")
    except Exception as e:
        logger.error(f"Failed to send verification email to {user.email}: {e}")
        raise


def send_password_reset_email(user):
    """Отправить письмо сброса пароля."""
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={user.password_reset_token}"

    html_message = render_to_string('emails/reset_password.html', {
        'user': user,
        'reset_url': reset_url,
    })

    try:
        send_mail(
            subject='Сброс пароля — Раскадровка',
            message=f'Перейдите по ссылке для сброса пароля: {reset_url}',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            html_message=html_message,
        )
        logger.info(f"Password reset email sent to {user.email}")
    except Exception as e:
        logger.error(f"Failed to send password reset email to {user.email}: {e}")
        raise
```

- [ ] Создать `backend/templates/emails/verify_email.html`:
```html
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2>Подтвердите ваш email</h2>
  <p>Здравствуйте, {{ user.username }}!</p>
  <p>Для завершения регистрации на Раскадровке подтвердите ваш email:</p>
  <p style="margin: 30px 0;">
    <a href="{{ verify_url }}"
       style="background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
      Подтвердить email
    </a>
  </p>
  <p style="color: #666; font-size: 14px;">Если вы не регистрировались — просто проигнорируйте это письмо.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="color: #999; font-size: 12px;">Раскадровка — AI-продакшен платформа</p>
</body>
</html>
```

- [ ] Создать `backend/templates/emails/reset_password.html` (аналогичный шаблон с другим текстом и кнопкой "Сбросить пароль")

---

## Task 4: Backend API — Verification & Reset

**Files:** `backend/apps/users/views.py`, `backend/apps/users/serializers.py`, `backend/apps/users/urls.py`

### 4.1 Serializers

- [ ] Добавить в `serializers.py`:
```python
class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()

class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.UUIDField()
    password = serializers.CharField(min_length=8, write_only=True)
    password_confirm = serializers.CharField(min_length=8, write_only=True)

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Пароли не совпадают'})
        validate_password(data['password'])
        return data
```

- [ ] Добавить `tos_accepted` в RegisterSerializer:
```python
class RegisterSerializer(serializers.ModelSerializer):
    ...existing...
    tos_accepted = serializers.BooleanField(write_only=True)

    def validate_tos_accepted(self, value):
        if not value:
            raise serializers.ValidationError('Необходимо принять условия использования')
        return value
```

- [ ] Добавить `is_email_verified` в UserSerializer (read-only)

### 4.2 Views

- [ ] Обновить RegisterView — отправлять verification email после создания:
```python
class RegisterView(generics.CreateAPIView):
    ...existing...

    def perform_create(self, serializer):
        user = serializer.save()
        user.tos_accepted_at = timezone.now()
        user.email_verification_sent_at = timezone.now()
        user.save(update_fields=['tos_accepted_at', 'email_verification_sent_at'])
        send_verification_email(user)
```

- [ ] Добавить новые views:
```python
class VerifyEmailView(views.APIView):
    """GET /api/auth/verify-email/?token=<uuid>"""
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def get(self, request):
        token = request.query_params.get('token')
        if not token:
            return Response({'error': 'Токен не указан'}, status=400)
        try:
            user = User.objects.get(email_verification_token=token)
        except User.DoesNotExist:
            return Response({'error': 'Недействительный токен'}, status=400)

        user.is_email_verified = True
        user.save(update_fields=['is_email_verified'])
        return Response({'message': 'Email подтверждён'})


class ResendVerificationView(views.APIView):
    """POST /api/auth/resend-verification/"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if user.is_email_verified:
            return Response({'message': 'Email уже подтверждён'})
        if not user.can_resend_verification():
            return Response({'error': 'Подождите минуту перед повторной отправкой'}, status=429)

        user.email_verification_token = uuid.uuid4()
        user.email_verification_sent_at = timezone.now()
        user.save(update_fields=['email_verification_token', 'email_verification_sent_at'])
        send_verification_email(user)
        return Response({'message': 'Письмо отправлено'})


class ForgotPasswordView(views.APIView):
    """POST /api/auth/forgot-password/ {email}"""
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Всегда отвечаем 200 (чтобы не раскрывать существование email)
        try:
            user = User.objects.get(email=serializer.validated_data['email'])
            user.password_reset_token = uuid.uuid4()
            user.password_reset_sent_at = timezone.now()
            user.save(update_fields=['password_reset_token', 'password_reset_sent_at'])
            send_password_reset_email(user)
        except User.DoesNotExist:
            pass

        return Response({'message': 'Если email зарегистрирован, вы получите письмо'})


class ResetPasswordView(views.APIView):
    """POST /api/auth/reset-password/ {token, password, password_confirm}"""
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user = User.objects.get(
                password_reset_token=serializer.validated_data['token']
            )
        except User.DoesNotExist:
            return Response({'error': 'Недействительный токен'}, status=400)

        if not user.is_password_reset_token_valid():
            return Response({'error': 'Токен истёк'}, status=400)

        user.set_password(serializer.validated_data['password'])
        user.password_reset_token = None
        user.password_reset_sent_at = None
        user.save(update_fields=['password', 'password_reset_token', 'password_reset_sent_at'])
        return Response({'message': 'Пароль изменён'})
```

### 4.3 URLs

- [ ] Добавить в `backend/apps/users/urls.py`:
```python
path('verify-email/', VerifyEmailView.as_view(), name='verify_email'),
path('resend-verification/', ResendVerificationView.as_view(), name='resend_verification'),
path('forgot-password/', ForgotPasswordView.as_view(), name='forgot_password'),
path('reset-password/', ResetPasswordView.as_view(), name='reset_password'),
```

---

## Task 5: Frontend — Auth Pages

### 5.1 API functions

**Files:** `frontend/lib/api/auth.ts`

- [ ] Добавить функции:
```typescript
export async function verifyEmail(token: string) {
  return client.get(`/api/auth/verify-email/?token=${token}`)
}

export async function resendVerification() {
  return client.post('/api/auth/resend-verification/')
}

export async function forgotPassword(email: string) {
  return client.post('/api/auth/forgot-password/', { email })
}

export async function resetPassword(token: string, password: string, password_confirm: string) {
  return client.post('/api/auth/reset-password/', { token, password, password_confirm })
}
```

### 5.2 Verify Email Page

**Files:** `frontend/app/(auth)/verify-email/page.tsx`

- [ ] Создать страницу: принимает `?token=` из URL, вызывает API, показывает результат (успех/ошибка)
- [ ] При успехе: "Email подтверждён! Перейти к проектам →"
- [ ] При ошибке: "Недействительная ссылка" + кнопка "Отправить повторно"

### 5.3 Forgot Password Page

**Files:** `frontend/app/(auth)/forgot-password/page.tsx`

- [ ] Создать страницу: форма с одним полем email
- [ ] После отправки: "Если email зарегистрирован, мы отправили инструкции"
- [ ] Ссылка "Вернуться к входу"

### 5.4 Reset Password Page

**Files:** `frontend/app/(auth)/reset-password/page.tsx`

- [ ] Создать страницу: принимает `?token=` из URL, форма с password + password_confirm
- [ ] При успехе: "Пароль изменён! Войти →"
- [ ] При ошибке (токен истёк): "Ссылка устарела. Запросить новую →"

### 5.5 Обновить Login

**Files:** `frontend/app/(auth)/login/page.tsx`

- [ ] Добавить ссылку "Забыли пароль?" под формой:
```tsx
<Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-foreground">
  Забыли пароль?
</Link>
```

### 5.6 Обновить Register

**Files:** `frontend/app/(auth)/register/page.tsx`

- [ ] Добавить checkbox ToS:
```tsx
<label className="flex items-start gap-2 text-sm">
  <input
    type="checkbox"
    checked={tosAccepted}
    onChange={(e) => setTosAccepted(e.target.checked)}
    className="mt-1"
    required
  />
  <span className="text-muted-foreground">
    Я принимаю{' '}
    <Link href="/terms" className="text-foreground underline" target="_blank">
      Условия использования
    </Link>
    {' '}и{' '}
    <Link href="/privacy" className="text-foreground underline" target="_blank">
      Политику конфиденциальности
    </Link>
  </span>
</label>
```

- [ ] Передавать `tos_accepted: true` в POST `/api/auth/register/`
- [ ] Кнопка "Зарегистрироваться" disabled без галочки

---

## Task 6: Legal Pages

### 6.1 Terms of Service

**Files:** `frontend/app/(workspace)/terms/page.tsx`

- [ ] Создать страницу с шаблонным текстом ToS. Ключевые разделы:
  1. Общие положения (что за сервис)
  2. Регистрация и аккаунт
  3. Кадры (виртуальная валюта): определение, неизымаемость, невозвратность бонусных
  4. Возвраты: неиспользованные Кадры в течение 14 дней по курсу покупки
  5. Стоимость генераций: может изменяться, актуальные тарифы на сайте
  6. Допустимое использование
  7. Интеллектуальная собственность (контент принадлежит пользователю)
  8. Ограничение ответственности
  9. Изменение условий
  10. Контакты

### 6.2 Privacy Policy

**Files:** `frontend/app/(workspace)/privacy/page.tsx`

- [ ] Создать страницу. Ключевые разделы (ФЗ-152 + GDPR-like):
  1. Какие данные собираем (email, username, history генераций)
  2. Цели обработки
  3. Хранение (РФ, VPS)
  4. Cookies (аналитика, auth tokens)
  5. Передача третьим лицам (AI-провайдеры — только промпты, не перс. данные)
  6. Права пользователя (доступ, удаление, экспорт)
  7. Контакты

> **Примечание:** Тексты нужно согласовать с юристом перед публичным запуском. Шаблонные тексты — для MVP.

---

## Task 7: Banner "Подтвердите email" (опционально, но рекомендуется)

**Files:** `frontend/components/layout/EmailVerificationBanner.tsx` (create)

- [ ] Создать баннер, который показывается если `user.is_email_verified === false`:
```tsx
'use client'
import { useAuthStore } from '@/lib/store/auth'

export function EmailVerificationBanner() {
  const user = useAuthStore(s => s.user)
  if (!user || user.is_email_verified) return null

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center text-sm text-amber-200">
      Подтвердите email ({user.email}).{' '}
      <button onClick={handleResend} className="underline hover:text-amber-100">
        Отправить повторно
      </button>
    </div>
  )
}
```

- [ ] Добавить в layout workspace (`app/(workspace)/layout.tsx`)
- [ ] Решить: блокировать ли генерацию без верификации? **Рекомендация:** не блокировать на MVP, только показывать баннер. Блокировать позже, когда подключится биллинг.

---

## Чеклист завершения Round 2

- [ ] Email отправляется при регистрации (проверить: зарегистрироваться → получить письмо)
- [ ] Клик по ссылке в письме → email подтверждён
- [ ] "Забыли пароль" → письмо → сброс работает
- [ ] Токен сброса истекает через 1 час
- [ ] Повторная отправка verification не чаще 1 раз в минуту
- [ ] Галочка ToS обязательна при регистрации
- [ ] Страницы ToS и Privacy Policy доступны
- [ ] Rate limiting работает (5 запросов/минуту на auth endpoints)
- [ ] `is_email_verified` отдаётся в GET `/api/auth/me/`
