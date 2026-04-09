# Верификация интеграции ЮKassa — руководство

## Быстрый старт

```bash
# 1. Пересобрать контейнеры (yookassa SDK)
docker compose up --build -d

# 2. Применить миграции
docker compose exec backend python manage.py migrate

# 3. Проверить что всё работает
docker compose exec backend python manage.py check
```

---

## Как увидеть результат

### Как пользователь (Frontend)

1. Открой `http://localhost:3000/cabinet/balance`
2. Ты увидишь:
   - **Карточка баланса** — текущие Кадры + эквивалент в генерациях
   - **Шаг 1** — 6 пресетов (100-10 000₽), поле произвольной суммы
   - **Шаг 2** — СБП / Банковская карта / SberPay
   - **Итого** — сумма, Кадры, способ, кнопка "Оплатить"
3. Кликай пресеты — итог обновляется
4. Кликай способ оплаты — итог обновляется
5. Кнопка "Оплатить" → без ЮKassa-ключей покажет тост "Сервис оплаты временно недоступен"

### Как админ (Django Admin)

1. Открой `http://localhost:8000/admin/`
2. В разделе **Credits** появились:
   - **Платежи** — список всех платежей с цветными статусами
   - **Логи webhook** — аудит-лог всех входящих webhook от ЮKassa

### Через Mock-команду (полный цикл без ЮKassa)

```bash
# Посмотреть текущий баланс пользователя
docker compose exec backend python manage.py shell -c "from apps.users.models import User; u=User.objects.get(username='ВАШ_USERNAME'); print(f'Баланс: {u.balance}₽')"

# Симулировать успешный платёж 1000₽ через СБП
docker compose exec backend python manage.py mock_yookassa_payment ВАШ_USERNAME 1000 --method sbp --status succeeded

# Симулировать отменённый платёж 500₽ картой
docker compose exec backend python manage.py mock_yookassa_payment ВАШ_USERNAME 500 --method bank_card --status canceled

# Симулировать зависший платёж (без webhook)
docker compose exec backend python manage.py mock_yookassa_payment ВАШ_USERNAME 2000 --status pending

# Посмотреть все платежи пользователя
docker compose exec backend python manage.py mock_yookassa_payment ВАШ_USERNAME --list
```

После mock-платежа:
- Баланс обновится (проверь в shell или на фронте)
- В админке `/admin/credits/payment/` появится запись
- В админке `/admin/credits/paymentwebhooklog/` появится лог

---

## Юнит-тесты

```bash
# Запустить все тесты кредитов (46 тестов)
docker compose exec backend python manage.py test apps.credits -v 2

# Что покрыто тестами:
# - Модели Payment, PaymentWebhookLog (создание, статусы, строковое представление)
# - Проверка IP (доверенные IP ЮKassa, недоверенные, граничные)
# - PaymentService (создание, обработка succeeded, идемпотентность, отмена)
# - Webhook view (успех, отмена, чужой IP, дубль, несуществующий платёж, битый JSON)
# - Create view (201, 400 валидация, 401 без авторизации, 503 ошибка ЮKassa)
# - Status view (свой платёж, чужой, succeeded с балансом, 404)
# - Reconciliation (succeeded, canceled, expired, свежий не тронут, ошибка API)
```

---

## Подключение реальной ЮKassa

Когда будешь готов к реальным платежам:

1. Зарегистрируйся на https://yookassa.ru
2. Получи `shop_id` и `secret_key` в личном кабинете
3. Добавь в `.env` (или docker-compose environment):
```
YOOKASSA_SHOP_ID=твой_shop_id
YOOKASSA_SECRET_KEY=твой_secret_key
YOOKASSA_RETURN_URL=https://raskadrawka.ru/cabinet/balance
```
4. Настрой webhook в ЛК ЮKassa:
   - URL: `https://raskadrawka.ru/api/credits/topup/webhook/`
   - События: `payment.succeeded`, `payment.canceled`
5. Пересобрать backend: `docker compose up --build backend -d`

### Для тестового режима ЮKassa

ЮKassa предоставляет тестовый магазин — реальные деньги не списываются, но весь flow работает. Используй тестовые карты из документации ЮKassa.

---

## Мониторинг в продакшене

| Вопрос | Где смотреть |
|--------|-------------|
| Сколько платежей за сегодня? | Admin → Платежи → фильтр по дате |
| Есть ли зависшие? | Admin → Платежи → фильтр "Ожидание" |
| Webhook пришёл? | Admin → Логи webhook → поиск по ID |
| Почему не зачислились? | Логи webhook → фильтр "Ошибка" → error_message |
| Дубли? | Логи webhook → фильтр "Дубликат" |
| Подозрительный IP? | Логи webhook → фильтр "IP отклонён" |
| Reconciliation работает? | `docker compose logs celery` — ищи "Reconciliation complete" |

### Reconciliation (автоматическая сверка)

Celery-задача `reconcile_pending_payments` запускается **каждые 15 минут**:
- Проверяет все pending платежи старше 10 мин через API ЮKassa
- Если ЮKassa говорит "succeeded" — зачисляет (webhook потерялся)
- Если "canceled" — обновляет статус
- Если pending > 2 часов — помечает expired

Для работы нужен `-B` флаг у Celery (Celery Beat):
```bash
celery -A config worker -l info -B
```
