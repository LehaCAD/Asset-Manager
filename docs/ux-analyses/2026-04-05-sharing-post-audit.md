## UX Analysis: Sharing & ElementCard Post-Audit Fixes
### Размер: L

### 1. Текущее состояние (до фикса)

**Проблемы найденные пользователем:**
- Кнопки согласования в лайтбоксе вызывали ошибку (миграция is_system не применена)
- Кнопки согласования были в одном ряду с лайками — неразличимы
- Статусов было 6, нужно 3 (null, В работе, Согласовано)
- AI badge не совпадал по размеру с другими badges
- Светлая тема сломана (bg-[#151B2B], hover:bg-white/5)
- Три точки — Переименовать и Переместить не работали (нет обработчиков)
- Ссылки фильтровались только по текущему проекту
- Кнопка "Все ссылки" — неинформативный текст

**Проблемы найденные при аудите:**
- REJECTED и null оба серые — неразличимы
- Нет loading state на кнопках согласования (double-click)
- Дублирование comment count на публичной карточке (badge + action bar)
- Reactions race condition (stale closure — pre-existing)

### 2. Impact Map

| Компонент | Изменение | Файлы |
|-----------|-----------|-------|
| Backend Element model | Статусы: 5→2 + data migration | models.py, migration 0012 |
| TypeScript types | ApprovalStatus: 5→2 | types/index.ts |
| ElementCard | Статусы, AI badge, bg-card, hover | ElementCard.tsx |
| ElementGrid | Прокинуть onRename/onMove через cardCallbacks | ElementGrid.tsx |
| WorkspaceContainer | RenameDialog, handleMoveElement, elementsApi | WorkspaceContainer.tsx |
| RenameDialog | Новый компонент | RenameDialog.tsx |
| ReviewerLightbox | Два ряда, loading state | ReviewerLightbox.tsx |
| ShareLinksPanel | Optional projectId | ShareLinksPanel.tsx |
| Navbar | Глобальные ссылки в Sheet | Navbar.tsx |
| sharingApi | Optional projectId | sharing.ts |
| Public share page | AI badge, comment count | page.tsx |

### 3. Решение (реализовано)

- Статусы: null (Нет статуса), IN_PROGRESS (В работе), APPROVED (Согласовано)
- Review bar: два ряда — [лайки | скачать] над [согласовано | на доработку | отклонить]
- AI badge: p-1.5 как у siblings, responsive text size
- Metadata footer: bg-card + border-t border-border (работает в обеих темах)
- Rename: новый RenameDialog + elementsApi.update + local store update
- Move: reuse MoveToGroupDialog с moveElementId для одного элемента
- Global links: Sheet в Navbar, ShareLinksPanel без projectId
- "Все ссылки" → "Активные ссылки"

### 4. Scope (выполнен)

12 файлов изменено, 1 создан, 1 миграция. Все применено и проверено.
