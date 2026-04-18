# Авторизация

> Актуальное состояние подсистемы. Обновлять при внесении изменений.
> Последнее обновление: 2026-04-17

## Назначение

JWT-аутентификация на `simplejwt`. Регистрация по логину + email, вход **по логину ИЛИ email**, смена пароля, восстановление через email.

## Модель

Стандартная `User` из Django с расширениями (см. `backend/apps/users/models.py`). Email — **НЕ уникальный** на уровне модели исторически (blank=True, не unique). Случаев дублирования на прод мало, но возможны; см. раздел «Login by email» ниже.

## Сериализаторы

`backend/apps/users/serializers.py`

### RegisterSerializer

Регистрация: `username`, `email`, `password`, `password_confirm`, `tos_accepted`.

**Нормализация email при регистрации:**
- `email` валидируется через `__iexact` против существующих записей, чтобы предотвратить near-duplicates (`Alice@x.com` vs `alice@x.com`)
- Значение приводится к lowercase перед сохранением
- Это предусловие для надёжного login-by-email

### UsernameOrEmailTokenSerializer

Наследует `TokenObtainPairSerializer`. В `validate()`:
1. Если `identifier` содержит `@` — ищет юзера по `email__iexact`
2. Если найдено ровно **один** — подставляет `attrs["username"] = user.username` → super().validate() продолжает как обычно
3. Если найдено **ноль** или **больше одного** — не подменяет; simplejwt вернёт 401

Защита от неоднозначности: при одинаковом email у нескольких юзеров (исторические данные) отказ вместо угадывания.

### View

`backend/apps/users/urls.py` — `LoginView(TokenObtainPairView)` с `serializer_class = UsernameOrEmailTokenSerializer` и `throttle_classes = [AuthRateThrottle]`.

## Frontend

### Login page

`frontend/app/(auth)/login/page.tsx`

- Поле `username` с лейблом **«Логин или email»** и validation `Введите логин или email`
- Заголовок `Войти в аккаунт` без подзаголовка
- `authApi.login({ username, password })` → `/api/auth/login/`

### Register page

`frontend/app/(auth)/register/page.tsx`

- Поле `username` → лейбл **«Логин»**, placeholder `латиница, цифры, «_»`
- Client-side валидация: ≥3 символа, `^[a-zA-Z0-9_]+$`, auto-lowercase на ввод
- Server-side 400 `username already` → inline ошибка «Такой логин уже занят»
- Email валидируется regex клиентом + server iexact-дедуп
- Кнопка `Создать аккаунт` активна только с `tos_accepted`
- Редирект на `/check-email?email=...` после успешного POST

### AuthGuard

`frontend/components/layout/AuthGuard.tsx` — обёртка над workspace- и cabinet-лейаутами.

- Читает access/refresh из Zustand-стора и cookies, ждёт hydration persist'а
- Если токенов нет и `pathname` не из auth-роутов (`/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`) → `router.replace("/login")`
- **Важно:** guard на `pathname` нужен, чтобы избежать race при logout (Navbar делает `window.location.href = "/login"` и в это время пользователь уже на `/login`, редирект не должен повторяться)

### Logout

`Navbar.handleLogout()` → `logout()` (очистка стора + кук) + **hard reload** через `window.location.href = "/login"`. Soft `router.replace()` вызывал гонку с AuthGuard и бесконечный рендер в dev-mode (StrictMode).

## API

| Endpoint | Метод | Авторизация | Назначение |
|----------|-------|-------------|------------|
| `/api/auth/register/` | POST | AllowAny | Регистрация. Returns tokens |
| `/api/auth/login/` | POST | AllowAny (throttled) | Login by username OR email. Returns tokens |
| `/api/auth/token/refresh/` | POST | AllowAny (throttled) | Refresh access token |
| `/api/auth/me/` | GET | IsAuthenticated | Текущий юзер + subscription + quota |
| `/api/auth/me/password/` | POST | IsAuthenticated | Смена пароля |
| `/api/auth/verify-email/?token=` | GET | AllowAny | Подтверждение email |
| `/api/auth/resend-verification/` | POST | IsAuthenticated | Перепослать письмо |
| `/api/auth/forgot-password/` | POST | AllowAny | Отправить ссылку на сброс |
| `/api/auth/reset-password/` | POST | AllowAny | Сбросить пароль по токену |

## Ограничения / безопасность

- **Login by email работает только при строгом соответствии 1:1**. Если в БД исторически существуют два юзера с одним email — им придётся входить по username
- `validate_email` при регистрации case-insensitive — новые дубли создать невозможно
- Rate limiting: `AuthRateThrottle` на login и refresh endpoints
- JWT access/refresh живут в cookies + Zustand-persist; persist cookies синхронизируются при login/logout

## Известные ограничения

- Email не unique на уровне модели (BC). Планируется миграция с unique constraint после чистки дубликатов.
- Нет OAuth (Google/Apple/Telegram) — backlog.
