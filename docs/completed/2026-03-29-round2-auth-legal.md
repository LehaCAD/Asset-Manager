# Round 2: Auth Flows & Legal Pages — Итоги

> Выполнено: 29 марта 2026
> План: `docs/plans/PRODUCTION_ROUND_2_AUTH_LEGAL.md`

## Что сделано

### Backend

**Email-система:**
- `backend/apps/users/emails.py` — отправка писем через Yandex SMTP
- Plain text (HTML блокируется спам-фильтром Яндекса)
- Fire-and-forget через `threading.Thread` (view отвечает мгновенно)
- SMTP: `raskadrawka.notify@yandex.com`, лимит 500 писем/сутки

**Модель User — 6 новых полей** (`backend/apps/users/models.py`):
- `is_email_verified` — подтверждён ли email
- `email_verification_token` — UUID токен для подтверждения
- `email_verification_sent_at` — когда отправлено последнее письмо
- `password_reset_token` — UUID токен сброса пароля
- `password_reset_sent_at` — когда отправлен сброс
- `tos_accepted_at` — когда приняты условия использования

Миграция: `0006_user_email_verification_sent_at_and_more.py` (применена)

**API — 4 новых эндпоинта** (`backend/apps/users/views.py`, `urls.py`):

| Endpoint | Метод | Auth | Описание |
|----------|-------|------|----------|
| `/api/auth/verify-email/?token=` | GET | Нет | Подтверждение email по токену из письма |
| `/api/auth/resend-verification/` | POST | Да | Повторная отправка (cooldown 60 сек) |
| `/api/auth/forgot-password/` | POST | Нет | Запрос сброса пароля (всегда 200) |
| `/api/auth/reset-password/` | POST | Нет | Установка нового пароля по токену (1 час) |

**Сериализаторы** (`backend/apps/users/serializers.py`):
- `RegisterSerializer` — добавлено поле `tos_accepted` (обязательное)
- `UserSerializer` — добавлено поле `is_email_verified` (read-only, отдаётся в `/api/auth/me/`)
- `ForgotPasswordSerializer` — валидация email
- `ResetPasswordSerializer` — валидация token + password + password_confirm

**Конфигурация** (`backend/config/settings.py`):
- Секция `# === Email ===` с переменными окружения
- `FRONTEND_URL` для формирования ссылок в письмах

**Docker** (`docker-compose.yml`):
- Email env vars проброшены в backend и celery контейнеры

### Frontend

**Типы** (`frontend/lib/types/index.ts`):
- `User.is_email_verified?: boolean`
- `RegisterPayload.tos_accepted?: boolean`

**API** (`frontend/lib/api/auth.ts`):
- `verifyEmail(token)`, `resendVerification()`, `forgotPassword(email)`, `resetPassword(token, password, password_confirm)`

**Новые страницы:**

| Страница | Путь | Описание |
|----------|------|----------|
| Подтверждение email | `/verify-email?token=` | Автоподтверждение + fallback с кнопкой resend |
| Забыли пароль | `/forgot-password` | Форма email, всегда показывает "письмо отправлено" |
| Сброс пароля | `/reset-password?token=` | Форма нового пароля, обработка истёкшего токена |
| Условия использования | `/terms` | Полный юридический текст (ФЗ-152, ГК РФ) |
| Политика конфиденциальности | `/privacy` | Полный текст по ФЗ-152 |

**Обновлённые страницы:**
- `/login` — добавлена ссылка "Забыли пароль?"
- `/register` — чекбокс "Я принимаю Условия использования и Политику конфиденциальности", кнопка заблокирована без галочки

**Новый компонент:**
- `EmailVerificationBanner` (`frontend/components/layout/EmailVerificationBanner.tsx`) — ненавязчивая полоса в workspace layout (стиль Timeweb: `bg-surface`, иконка warning, кнопка primary outlined, крестик закрытия)

### Юридические тексты

Оба документа — полноценные рабочие тексты на русском:
- **Условия использования:** 12 разделов (регистрация, Кадры, возвраты 14 дней, допустимое использование, ограничение ответственности, применимое право РФ)
- **Политика конфиденциальности:** 12 разделов (ФЗ-152, категории данных, правовые основания, хранение в РФ, передача AI-провайдерам, права субъектов, Роскомнадзор)
- Рекомендуется проверить с юристом перед публичным запуском

## Что НЕ сделано (осознанные решения)

- **Блокировка генерации без верификации** — не нужна для MVP, только баннер
- **HTML-шаблоны писем** — заменены на plain text (Яндекс SMTP блокирует HTML как спам). Шаблоны остались в `backend/templates/emails/` на будущее
- **Отправка через Celery** — используется threading (проще, достаточно для MVP)

## Конфигурация email (`.env`)

```
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.yandex.ru
EMAIL_PORT=587
EMAIL_HOST_USER=raskadrawka.notify@yandex.com
EMAIL_HOST_PASSWORD=<пароль приложения>
DEFAULT_FROM_EMAIL=raskadrawka.notify@yandex.com
FRONTEND_URL=http://localhost:3000
```

Для production: поменять `FRONTEND_URL=https://raskadrawka.ru`

## Известные ограничения

- Яндекс SMTP: 500 писем/сутки (достаточно для старта)
- Письма от `@yandex.com` могут попадать в спам Gmail (пользователю нужно отметить "Не спам")
- При переходе на собственный домен: настроить SPF/DKIM в Timeweb DNS, переключить на Unisender или Yandex 360
