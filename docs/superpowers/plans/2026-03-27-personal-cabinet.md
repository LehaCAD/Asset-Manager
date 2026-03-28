# Личный кабинет — План реализации

## Шаги

### Phase 1: Backend — Django app `cabinet`
1. Создать `backend/apps/cabinet/` (apps.py, __init__.py, urls.py)
2. `services.py` — analytics, history, transactions, storage functions с frozen dataclasses
3. `serializers.py` — DRF serializers для ответов
4. `views.py` — thin views
5. Подключить urls в `config/urls.py`
6. `POST /api/auth/me/password/` в users app

### Phase 2: Frontend — инфраструктура
7. Установить recharts (в package.json)
8. Типы в `lib/types/index.ts`
9. API module `lib/api/cabinet.ts`
10. Zustand store `lib/store/cabinet.ts`

### Phase 3: Frontend — layout + pages
11. `cabinet/layout.tsx` — sidebar навигация
12. `cabinet/page.tsx` — redirect
13. `cabinet/analytics/page.tsx` — bar chart + cards
14. `cabinet/history/page.tsx` — таблица генераций
15. `cabinet/balance/page.tsx` — баланс + транзакции
16. `cabinet/storage/page.tsx` — хранилище
17. `cabinet/notifications/page.tsx` — заглушка
18. `cabinet/settings/page.tsx` — профиль + пароль + тема

### Phase 4: Интеграция
19. Ссылка в Navbar dropdown
20. Проверка и тестирование
