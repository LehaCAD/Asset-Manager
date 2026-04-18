# Почта — транзакционные письма

Подсистема отправки писем пользователям (подтверждение email, сброс пароля и т.п.).
Отправка идёт через SMTP-сервер **reg.ru** от имени `noreply@raskadrawka.ru`.

> Зона ответственности: приложение `apps.users`, модуль `backend/apps/users/emails.py`.

---

## 1. Что сейчас отправляется

| Письмо | Триггер | Шаблон |
|---|---|---|
| Подтверждение email | `POST /api/auth/register/` и `POST /api/auth/resend-verification/` | `backend/templates/emails/verify_email.html` |
| Сброс пароля | `POST /api/auth/forgot-password/` | `backend/templates/emails/reset_password.html` |

Оба письма:

- Тема на русском, отправитель `Раскадровка <noreply@raskadrawka.ru>`.
- **HTML + plain-text fallback** (`EmailMultiAlternatives`). Почтовики, не умеющие HTML, видят текстовую версию.
- Fire-and-forget в daemon-треде (`threading.Thread`). SMTP-запрос не блокирует HTTP-ответ Django — важно, чтобы регистрация/ресет не подвисали, если у reg.ru в этот момент тормозит отправка.
- Исключения ловятся и логируются, но не ломают бизнес-флоу (см. обработку `try/except` в `apps/users/views.py`).

Вся настройка и сами функции: `backend/apps/users/emails.py`.

---

## 2. SMTP — параметры reg.ru

```
EMAIL_BACKEND   = django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST      = mail.hosting.reg.ru
EMAIL_PORT      = 465
EMAIL_USE_SSL   = True
EMAIL_USE_TLS   = False       ← SSL и TLS взаимоисключающие
EMAIL_HOST_USER = noreply@raskadrawka.ru
EMAIL_HOST_PASSWORD = <в .env / .env.production>
DEFAULT_FROM_EMAIL  = Раскадровка <noreply@raskadrawka.ru>
SERVER_EMAIL        = Раскадровка <noreply@raskadrawka.ru>
EMAIL_TIMEOUT       = 20
```

Альтернатива: порт **587** с `EMAIL_USE_TLS=True` / `EMAIL_USE_SSL=False` (STARTTLS). Используется как fallback, если провайдер (или корпоративный прокси) режет 465.

Секреты живут **только** в `.env` и `.env.production` (обе в `.gitignore`). В репозитории их быть не должно. Если пароль утёк — сменить в ISPmanager и обновить `.env`.

Настройки пробрасываются в контейнеры через `docker-compose.production.yml` в сервисах `backend` и `celery` (см. `EMAIL_*` env-переменные).

---

## 3. Лимиты reg.ru

По тарифам хостинга reg.ru (источник: [База знаний reg.ru — Sender rate overlimit](https://help.reg.ru/support/hosting/nastroyka-pochty-regru/problemyy/oshibka-sender-rate-overlimitt)):

| Тариф | Писем в сутки | Получателей в одном письме |
|---|---|---|
| Shared-хостинг / «Почта на домене» | **3000 / сутки** | 50 (на «Почте на домене» — до 150) |
| VIP-тариф | 9000 / сутки | 50 |
| Максимальный размер письма | 50 МБ | — |

При превышении — SMTP-сервер возвращает отбойник `Sender rate overlimit`. При таком сообщении остальные письма в этих сутках **не доставляются до новых суток** — не пытаться ретраить в цикле, ждать окно.

**Для транзакционных писем (verify + reset) 3000/сутки с огромным запасом покрывают текущий трафик.** Переходить на специализированный сервис (Unisender, Sendpulse, Yandex 360 Business, Amazon SES) имеет смысл только если:
- начнутся массовые рассылки (новости, дайджесты, маркетинг);
- появится жёсткое требование к доставке в Gmail Primary (reg.ru без идеальных DNS регулярно уходит в «Промоакции» / спам);
- нужна аналитика открытий/кликов.

---

## 4. DNS — критично для доставки

Без корректных SPF/DKIM/DMARC писем стабильно попадают в спам у Gmail, Yandex, Mail.ru, Outlook. Настройка велась 2026-04-16/17, mail-tester после всех правок даёт **10/10**.

### 4.1. Итоговое рабочее состояние

Все записи живут в **ЛК reg.ru → Мои домены → `raskadrawka.ru` → «Управление зоной»** (тот же экран, где редактируются обычные A-записи).

| Тип | Subdomain | Значение |
|---|---|---|
| `MX` (prio 10) | `@` | `mx1.hosting.reg.ru.` |
| `MX` (prio 20) | `@` | `mx2.hosting.reg.ru.` |
| `TXT` (SPF) | `@` | `v=spf1 +a +mx ip4:31.31.196.0/24 include:_spf.hosting.reg.ru ~all` |
| `TXT` (DKIM) | `dkim._domainkey` | `v=DKIM1; k=rsa; s=email; p=<публичный ключ из ISPmanager>` |
| `TXT` (DMARC) | `_dmarc` | `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:postmaster@raskadrawka.ru; sp=quarantine` |

Селектор DKIM — **`dkim`** (так у нас в ISPmanager). Не `mail`, не `default`. Если когда-либо reg.ru начнёт подписывать другим селектором — смотри `DKIM-Signature: … s=<селектор>` в заголовках любого письма с прода и переименуй DNS-запись под новый селектор.

### 4.2. Подводные камни, которые реально выстрелили

**SPF — `include:_spf.hosting.reg.ru` недостаточно.** Reg.ru не обновляет этот include при добавлении новых shared-серверов. Наш аккаунт живёт на `server27.hosting.reg.ru` (IP `31.31.196.16`), которого в include **нет**, поэтому Gmail писал `spf=softfail`. Фикс — **добавить подсеть сервера вручную**: `ip4:31.31.196.0/24`. Если reg.ru перенесёт аккаунт на другую стойку (видно по `Received: from serverNN.hosting.reg.ru` в заголовках любого письма) — правим ip4 под новый сервер.

**DMARC `p=none` mail-tester штрафует на -3 балла.** «Мягкая» политика воспринимается как слабая защита от спуфинга. Ставим сразу `p=quarantine` — у нас всего один легитимный отправитель (reg.ru), SPF+DKIM выравниваются, ложных срабатываний не будет. Через месяц стабильной работы можно поднять до `p=reject`.

**Двух SPF-записей быть не должно.** Редактируем существующую, не создаём вторую. Если нужны новые сендеры — добавляем их `include:` / `ip4:` в ту же строку.

**MX для отправки не нужен, но нужен для приёма.** DMARC-отчёты (`rua=postmaster@...`), отбойники и bounce-репорты без MX не долетят. Оставляем `mx1/mx2.hosting.reg.ru`. Ящик `postmaster@raskadrawka.ru` для входящих DMARC-отчётов — заводим в ISPmanager.

### 4.3. Где брать DKIM-ключ

ISPmanager → «Почта» → «Почтовые домены» → `raskadrawka.ru` → «Изменить» → галка «DKIM». Панель покажет имя TXT-записи (`dkim._domainkey`) и содержимое (`v=DKIM1; k=rsa; s=email; p=MIIBIjAN…`). Копируем целиком в DNS-зону.

### 4.4. Как проверять

- `dig TXT raskadrawka.ru` → одна SPF-строка с `ip4:31.31.196.0/24`.
- `dig TXT dkim._domainkey.raskadrawka.ru` → длинный публичный ключ.
- `dig TXT _dmarc.raskadrawka.ru` → `p=quarantine` + `rua=`.
- `dig MX raskadrawka.ru` → `mx1/mx2.hosting.reg.ru`.
- [mail-tester.com](https://www.mail-tester.com/) — оценка должна быть 10/10. Отправлять нужно **осмысленное** письмо (нормальный subject + HTML), короткие тестовые сабжи типа «123» / «TNT» режут оценку на content-эвристике отдельно от DNS.
- [mxtoolbox.com/SuperTool.aspx](https://mxtoolbox.com/SuperTool.aspx) — blacklist-чек.
- В заголовках пришедшего письма (Gmail → «Показать оригинал») искать строку `Authentication-Results:` — должно быть одновременно `spf=pass dkim=pass dmarc=pass`.

---

## 5. Шаблоны писем

HTML-шаблоны хранятся в `backend/templates/emails/`:

- `verify_email.html` — подтверждение email.
- `reset_password.html` — сброс пароля.

Стиль: тёмная тема, firmные цвета `#0f0f0f / #1a1a1a / #6366f1 / #8b5cf6`. Шапка и футер брендируют «Раскадровка». Layout собран на inline-стилях внутри `<table>` (требование почтовых клиентов — Outlook/Gmail режут CSS-классы).

### Добавить новое письмо

1. Создать HTML-шаблон в `backend/templates/emails/<name>.html` по образцу двух существующих.
2. В `backend/apps/users/emails.py` (или в новом `apps/<app>/emails.py`) добавить функцию-обёртку над `_spawn(...)` с нужным контекстом и plain-text fallback.
3. Вызвать из соответствующего view (см. `apps/users/views.py`).
4. **Обязательно** fire-and-forget: SMTP может тормозить 20+ секунд на tail-latency, синхронный вызов подвесит HTTP-ответ.
5. Добавить строку в раздел «Что сейчас отправляется» этого файла.

---

## 6. Дебаг и тестирование

### Локально

В `.env` оставить `EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend` — письма печатаются в stdout Django, реальный SMTP не трогается.

Чтобы прогнать реальную отправку с dev-машины на свой ящик:

```bash
# .env: EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
docker compose exec backend python manage.py shell -c "from django.core.mail import send_mail; send_mail('Тест', 'Работает', None, ['you@example.com'])"
```

### В продакшене

```bash
# Проверка, что контейнер видит SMTP:
docker compose -f docker-compose.production.yml exec backend python -c "import smtplib,ssl; s=smtplib.SMTP_SSL('mail.hosting.reg.ru',465,context=ssl.create_default_context(),timeout=10); print(s.ehlo()); s.quit()"

# Лайв-лог отправок:
docker compose -f docker-compose.production.yml logs -f backend | grep -i email
```

Все отправки логируются в `apps.users.emails` на уровне INFO (успех) и ERROR (ошибка). В Sentry попадают только ERROR (как исключения в потоке).

### Типичные ошибки

| Сообщение | Причина | Лечение |
|---|---|---|
| `SMTPAuthenticationError (535)` | неверный пароль ящика | проверить `EMAIL_HOST_PASSWORD` в `.env.production`, пересоздать в ISPmanager |
| `SMTPConnectError / timeout` | контейнер не видит 465 | проверить firewall / egress на сервере, попробовать 587 + TLS |
| `Sender rate overlimit` | привысили 3000/сутки | ждать новых суток, либо апгрейд тарифа reg.ru, либо специализированный сервис |
| письмо дошло, но в спам | DNS (SPF/DKIM/DMARC) не настроены или не совпадают с From | раздел 4 этой страницы |
| `501 … From/To` | `DEFAULT_FROM_EMAIL` не совпадает с `EMAIL_HOST_USER` | у reg.ru from-адрес должен совпадать с ящиком SMTP — оставить `noreply@raskadrawka.ru` |
| `spf=softfail` в заголовках пришедшего письма | reg.ru отправляет с сервера, IP которого нет в `_spf.hosting.reg.ru` | в заголовке `Received: from serverNN.hosting.reg.ru` посмотреть IP, добавить соответствующий `ip4:X.X.X.0/24` в SPF-запись |
| mail-tester снимает ~3 балла за «DMARC policy state» | `p=none` | поменять `_dmarc` TXT на `p=quarantine` (см. раздел 4.1) |

---

## 7. Чек-лист после деплоя или смены провайдера

- [ ] В `.env.production` обновлены `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_SSL/TLS`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL`.
- [ ] Пересобраны контейнеры: `docker compose -f docker-compose.production.yml up -d --build backend celery`.
- [ ] SPF-запись указывает на нового провайдера (одна строка!). Для reg.ru — с явным `ip4:<подсеть нашего сервера>`, см. раздел 4.2.
- [ ] DKIM-запись добавлена в DNS (значение из панели провайдера), селектор в DNS совпадает с тем, которым провайдер подписывает исходящие.
- [ ] DMARC-запись присутствует, политика `p=quarantine` (или `p=reject` после прогрева).
- [ ] MX `mx1/mx2.hosting.reg.ru` настроены, ящик `postmaster@raskadrawka.ru` заведён (DMARC-отчёты).
- [ ] Отправлено осмысленное письмо на mail-tester.com — оценка 10/10.
- [ ] Отправлено тестовое на личный Gmail / Yandex / Mail.ru — приходит в «Входящие».
- [ ] Сохранён старый SMTP как fallback в заметках (на неделю), чтобы было, к чему откатиться.

---

## 8. Что делать, если reg.ru упадёт

Fire-and-forget исключения не ломают регистрацию пользователя — он получает 201, просто без письма. Если почта недоступна дольше 15–30 минут:

1. Проверить ISPmanager reg.ru: нет ли отключения по неоплате / техработ.
2. Можно временно переключить `EMAIL_BACKEND` в `.env.production` на `django.core.mail.backends.console.EmailBackend` — перестанут копиться ошибки в Sentry. Письма из очереди не пойдут, но и падений не будет.
3. Долгосрочный fallback — подключить второй SMTP (Unisender / SES), поменять переменные окружения и передеплоить.

> Очереди писем у нас нет: если отправка провалилась, письмо теряется. Для verify-email это OK (пользователь может запросить повторно), для сброса пароля — пользователь повторит запрос. Если захочется надёжную доставку — переделывать на Celery-таску с retry (сейчас намеренно не сделано, чтобы не усложнять MVP).
