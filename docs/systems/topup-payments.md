# YooKassa Top-Up — Agent Guide

> Справочник для агента, работающего с кодом пополнения баланса.

## Архитектура в одном абзаце

Пользователь на `/cabinet/balance` выбирает сумму + способ оплаты → frontend POST `/api/credits/topup/create/` → backend создаёт `Payment` + вызывает YooKassa API → возвращает `confirmation_url` → frontend редиректит на страницу ЮKassa → пользователь платит → ЮKassa шлёт webhook POST `/api/credits/topup/webhook/` → backend логирует в `PaymentWebhookLog`, вызывает `PaymentService.process_succeeded()` → `CreditsService().topup()` зачисляет Кадры → WebSocket уведомляет фронт. Celery-задача `reconcile_pending_payments` каждые 15 мин проверяет зависшие платежи.

## Карта файлов

### Backend (`backend/apps/credits/`)

| Файл | Что делает | Когда трогать |
|------|-----------|---------------|
| `models.py` | `Payment`, `PaymentWebhookLog`, `CreditsTransaction.REASON_PAYMENT_TOPUP` | Добавление полей, статусов, новых методов оплаты |
| `yookassa_client.py` | Обёртка над YooKassa SDK: `create_payment()`, `get_payment_status()`, `is_trusted_ip()` | Изменения в API ЮKassa, новые методы оплаты |
| `services.py` | `PaymentService.create_payment()`, `.process_succeeded()`, `.process_canceled()` | Логика обработки платежей, бонусы, рефунды |
| `views.py` | `TopUpCreateView`, `TopUpWebhookView`, `TopUpStatusView` | Новые endpoint-ы, изменение формата ответа |
| `serializers.py` | `TopUpCreateSerializer`, `TopUpCreateResponseSerializer`, `TopUpStatusSerializer` | Валидация запросов, формат ответов |
| `urls.py` | `/topup/create/`, `/topup/webhook/`, `/topup/<id>/status/` | Новые маршруты |
| `tasks.py` | `reconcile_pending_payments` (Celery, каждые 15 мин) | Таймауты, логика reconciliation |
| `admin.py` | `PaymentAdmin`, `PaymentWebhookLogAdmin` (read-only, цветные статусы) | Новые фильтры, отображение полей |
| `tests.py` | 46 тестов: модели, сервисы, views, webhook, reconciliation, IP | Любые изменения в логике |
| `management/commands/mock_yookassa_payment.py` | Мок-команда для локального тестирования | Новые сценарии тестирования |

### Frontend

| Файл | Что делает | Когда трогать |
|------|-----------|---------------|
| `lib/types/index.ts` | `PaymentMethodType`, `TopUpCreateRequest/Response`, `TopUpStatusResponse` | Новые поля в API |
| `lib/api/credits.ts` | `createTopUp()`, `getTopUpStatus()` | Новые endpoint-ы |
| `lib/store/credits.ts` | `selectedAmount`, `paymentMethod`, `createTopUp()` action | Логика UI, автопополнение |
| `components/cabinet/BalanceCard.tsx` | Карточка баланса + монетка + эквиваленты | Визуальные изменения |
| `components/cabinet/AmountPresets.tsx` | Сетка пресетов 3×2 + поле произвольной суммы | Новые пресеты, бонусы |
| `components/cabinet/PaymentMethods.tsx` | Радио: СБП / Карта / SberPay | Новые методы оплаты |
| `components/cabinet/TopUpSummary.tsx` | Итого + кнопка "Оплатить" | Изменения в итоговом блоке |
| `app/(cabinet)/cabinet/balance/page.tsx` | Собирает компоненты + история транзакций | Структура страницы |

### Настройки

| Файл | Что | 
|------|-----|
| `config/settings.py` | `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `YOOKASSA_RETURN_URL`, `YOOKASSA_WEBHOOK_IPS`, `CELERY_BEAT_SCHEDULE` |
| `.env` | Реальные значения `YOOKASSA_SHOP_ID` и `YOOKASSA_SECRET_KEY` |

## Ключевые модели

### Payment

```
user → ForeignKey(User)
yookassa_payment_id → CharField(unique, indexed)
amount → DecimalField
payment_method_type → "sbp" | "bank_card" | "sberbank"
status → "pending" | "waiting_for_capture" | "succeeded" | "canceled" | "expired"
credits_transaction → OneToOneField(CreditsTransaction, nullable)
error_message → TextField
metadata → JSONField
```

### PaymentWebhookLog

```
payment → ForeignKey(Payment, nullable)
yookassa_payment_id → CharField(indexed)
event_type → "payment.succeeded" | "payment.canceled" | ...
raw_body → JSONField (полный JSON от ЮKassa)
ip_address → GenericIPAddressField
processing_result → "ok" | "error" | "duplicate" | "ip_rejected"
error_message → TextField
processing_time_ms → PositiveIntegerField
```

## API Endpoints

| Method | Path | Auth | Назначение |
|--------|------|------|-----------|
| POST | `/api/credits/topup/create/` | JWT | Создать платёж, вернуть `confirmation_url` |
| POST | `/api/credits/topup/webhook/` | None (IP check) | Webhook от ЮKassa, всегда 200 |
| GET | `/api/credits/topup/<id>/status/` | JWT | Polling статуса (fallback если WS не работает) |

## Как запустить тесты

```bash
docker compose exec backend python manage.py test apps.credits -v 2
```

46 тестов покрывают: модели, IP-валидацию, PaymentService (идемпотентность, дубли), все 3 views, reconciliation task.

## Как тестировать без ЮKassa

```bash
# Успешный платёж
docker compose exec backend python manage.py mock_yookassa_payment USERNAME 1000 --status succeeded

# Отменённый
docker compose exec backend python manage.py mock_yookassa_payment USERNAME 500 --status canceled

# Зависший (для теста reconciliation)
docker compose exec backend python manage.py mock_yookassa_payment USERNAME 2000 --status pending

# Список платежей
docker compose exec backend python manage.py mock_yookassa_payment USERNAME --list
```

## Типичные задачи

### Добавить новый способ оплаты (напр. Tinkoff Pay)

1. `models.py` — добавить `METHOD_TINKOFF = "tinkoff"` в `METHOD_CHOICES`
2. `yookassa_client.py` — добавить `elif` в `create_payment()`
3. `serializers.py` — добавить `"tinkoff"` в `choices` у `TopUpCreateSerializer`
4. `PaymentMethods.tsx` — добавить элемент в `METHODS` массив
5. `types/index.ts` — добавить `'tinkoff'` в `PaymentMethodType`
6. `store/credits.ts` — обновить тип `paymentMethod`
7. Миграция: `makemigrations credits`
8. Тесты: добавить кейс

### Добавить бонусные Кадры за объём

1. `services.py` → `PaymentService.process_succeeded()` — вычислить бонус, передать в `topup()`
2. `AmountPresets.tsx` — показать бонус под пресетом ("1000₽ + 50 бонусных")
3. `TopUpSummary.tsx` — показать "Получите: 1050 Кадров (1000 + 50 бонус)"

### Добавить сохранение карт

1. При `create_payment()` передать `save_payment_method: true`
2. Новая модель `SavedPaymentMethod` (user, method_id, last4, type)
3. Новый endpoint GET `/api/credits/saved-methods/`
4. Компонент `SavedCards.tsx` — список сохранённых карт
5. В `PaymentMethods.tsx` — показать сохранённые карты выше новых методов

## Дизайн-макеты

В `pen/pencil-new.pen`:
- Desktop (520px): node `n3Fig` — "Top-Up Balance Page"
- Mobile (375px): node `TMfTL` — "Top-Up Mobile (375px)"

Цвета из Color System v2 (node `gx1cz`).
