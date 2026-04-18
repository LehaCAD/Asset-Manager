# Сессия 00 — Диагностика и разблок

**Цель:** снять неизвестности, на которых зависит вся остальная работа. Без UI-правок.

---

## BF-00-01 — Два 404 на дашборде при входе ✅ (фикс в коде)

**Симптом (пользователь):**
> «Я зашел и мне с двух аккаунтов, с телефона и с компа, мне на центре два раза упала ошибка 404».

**Диагностика:** логи nginx показали повторяющийся `GET /api/feedback/conversation/ → 404` при каждом заходе в проект. Для нового пользователя без единого сообщения в поддержку backend возвращает `HTTP_404_NOT_FOUND` — это семантически неверно: «нет ресурса» ≠ «нет такого endpoint». Axios-интерсептор пишет это в Sentry (и, вероятно, на клиенте отображается где-то на экране).

**Фикс:**
- `backend/apps/feedback/views.py` — `conversation_view` теперь возвращает `200 OK` с `null`-payload, когда у юзера ещё нет диалога.
- `frontend/lib/api/feedback.ts` — тип `getConversation()` стал `Promise<FeedbackConversation | null>`.
- `frontend/lib/store/feedback.ts` — оба использования `getConversation` учитывают `null`.

**Смежно проверить:** ещё 1 404 в логах — `POST /api/auth/password-reset/` (curl с самого сервера). Это не клиентский запрос, фронт ходит на `/api/auth/forgot-password/`. Игнор. Страница ачивок — отдельно в [BF-05-01](05-onboarding-achievements.md).

---

## BF-00-02 — Sentry: `ImportError: failed to find libmagic` ✅ (фикс в коде)

**Симптом:** при попытке отправить фото в чате поддержки (мобилка и десктоп) — файл не уходит. Sentry показывает `ImportError: failed to find libmagic. Check your installation`.

**Диагностика:**
- Прод использует `backend/Dockerfile.production` (а не `backend/Dockerfile`), это видно в `/root/Asset-Manager/docker-compose.production.yml` на сервере.
- `Dockerfile` (dev) содержит `libmagic1`, но `Dockerfile.production` — не содержал. Два файла разъехались.
- В рантайм-контейнере `dpkg -l | grep magic` — пусто; `python -c 'import magic'` — `ImportError`.

**Фикс:** добавил `libmagic1` в `backend/Dockerfile.production`.

**Смежно — ловушка на будущее:**
- Два Dockerfile-а (dev + prod) с дублирующимся набором apt-deps — source of bugs. Они обязаны идти в ногу. В `docs/systems/infra.md` (⚠ не написан) нужен раздел «Docker images», где явно сказано, что prod использует `Dockerfile.production` и любые системные зависимости надо менять в обоих.
- Кандидат на рефакторинг (бэклог): multi-stage `Dockerfile` с build-args вместо двух файлов.

**После пересборки проверить:**
- `docker exec apom_backend python -c 'import magic; print(magic.from_buffer(b"%PDF-1.4"))'` → должно вывести `PDF document, version 1.4`.
- Отправить фото в чат поддержки с обеих сторон (юзер → админ и обратно).

**Связано:** полная проработка загрузок в чате — [Сессия 07](07-support-chat-uploads.md).

---

## BF-00-03 — Полный Sentry-пассаж ✅

**Метод:** без доступа к Sentry API прошёлся по серверным логам (`docker logs apom_backend --since 24h`), отфильтровал `"level": "ERROR"|"CRITICAL"` и `WARNING` категорий 4xx. Для клиентского Sentry — нужен auth-token (в `.env` только DSN).

**Найденные серверные ERROR за последние сутки:**

| Кол-во | Сообщение | Диагноз | Куда ушло |
|---|---|---|---|
| 3 | `onboarding trigger failed for element.generation_success` → `AttributeError: 'NoneType' object has no attribute 'project'` (`elements/generation.py:219`) | Элемент в корне проекта → `el.scene` = None, обращение к `.project` падает. Проглочен общим `except` — но ачивка не выдаётся. Подтверждает жалобу из [BF-05-02](05-onboarding-achievements.md) | ✅ Фикс в этой сессии: `el.project.user` вместо `el.scene.project.user` в `generation.py` и `tasks.py` (upload_success) |
| 2 | `Failed to send email to ... timed out` | SMTP-порты закрыты провайдером, тикет открыт юзером. Fire-and-forget в треде, юзера не блокирует. | ✅ Известно, ждём открытия портов на VPS |

**WARNING-категории за сутки:** `Not Found: /api/feedback/conversation/` — закрывается [BF-00-01](#bf-00-01). `Not Found: /api/.env` — разведка бота, игнор. `Unauthorized` — нормальное поведение при истёкшем токене.

**Клиентский Sentry (frontend):** не просмотрен — нет auth-токена. Если хочешь полный пассаж UI-ошибок — дай personal token (Settings → Auth Tokens → scope `event:read project:read`), либо скинь скрином список свежих issue из Sentry UI, я разложу по сессиям.

**Проактивно:**
- Антипаттерн `element.scene.project.user` — грепнул по бэкенду, другие места чисты.
- Похожий антипаттерн может быть на фронте (`element.scene.project`) — проверить в ходе Сессии 04 (мобилка, где корневые элементы и не отображаются — [BF-04-01](04-mobile-responsive.md) и жалоба из `docs/Фиксы и мысли.md` п.1 «не отображаются элементы, лежащие в корне проекта»).
