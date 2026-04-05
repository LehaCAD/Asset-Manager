## UX Analysis: Notification + Sharing Filters Redesign
### Размер: M

### 1. Текущее состояние

**Колокольчик (NotificationDropdown):**
- Фильтры (проект-дропдаун + пилюли категорий) занимают треть попапа 320px
- Перегружает quick-glance сценарий
- Ни один из лидеров (Linear, GitHub, Figma, Notion) не ставит фильтры в bell dropdown

**Страница уведомлений:**
- Аддитивные пилюли на одной оси: "Отзывы" + "Контент" = все типы (неинтуитивно)
- activeCategories в useState рассинхронизирован с filters в сторе
- Нативный `<select>` не вписывается в дизайн-систему
- Каждый клик = запрос без дебаунса

**Шеринг (CreateLinkDialog):**
- 5 пилюль в одну строку через точки-разделители — тесно, оси не читаются
- Счётчики считают "что будет если включить" — сложная ментальная модель
- Disabled-пилюли с opacity = визуальный мусор
- Ничего не выбрано = все элементы — неочевидно

**Баг:** шеринг из ProjectCard и group context menu не работает (elementIds=[], elements не передаётся)

### 2. Impact Map

| Компонент | Что меняется | Критичность |
|-----------|-------------|-------------|
| NotificationDropdown.tsx | Убрать фильтры, вернуть простой список | high |
| notifications/page.tsx | Пилюли → табы, select → стилизованный дропдаун | high |
| notifications.ts (стор) | activeTab в сторе, убрать lastFetchedFilters | medium |
| CreateLinkDialog.tsx | Горизонтальные строки с лейблами вместо inline пилюль | high |
| ProjectCard.tsx | Fetch elements перед открытием диалога | high (баг) |
| WorkspaceContainer.tsx | Group share: fetch elements перед открытием | high (баг) |
| SceneCard.tsx | Добавить пункт "Поделиться" (опционально) | low |
| notification-icon.tsx | Без изменений | — |

### 3. Решение

**A. Колокольчик** — чистый список без фильтров:
- Заголовок "Уведомления" + "Прочитать все"
- 10 последних уведомлений, все типы вперемешку
- Ссылка "Все уведомления →" в футере
- Fetch при открытии без фильтров

**B. Страница уведомлений** — табы + дропдаун проекта:
- Табы взаимоисключающие: Все | Отзывы | Контент
- Дропдаун проекта справа от табов (стилизованный, не нативный select)
- activeTab и projectId хранятся в сторе
- Смена таба/проекта → один fetch

**D. Шеринг** — строки с лейблами:
```
Источник   [Генерации 24] [Загрузки 8]
Тип        [Фото 20]      [Видео 4]
Статус     [Избранное 6]
```
- Лейблы объясняют оси
- Счётчик = сколько элементов этого типа всего
- Пилюля с 0 скрывается, строка без пилюль скрывается
- Логика AND/OR та же, layout объясняет её

**Баг-фикс:** ProjectCard и group share → fetch sharingApi.getProjectElements/getGroupElements перед открытием CreateLinkDialog

**Mockup в pen:** node `lngsZ` в `pen/pencil-new.pen`

### 4. Scope для имплементации

**Файлы:**
- `frontend/components/layout/NotificationDropdown.tsx` — упростить до списка
- `frontend/app/(cabinet)/cabinet/notifications/page.tsx` — табы + дропдаун
- `frontend/lib/store/notifications.ts` — activeTab, projectId в стор
- `frontend/components/sharing/CreateLinkDialog.tsx` — строки с лейблами
- `frontend/components/project/ProjectCard.tsx` — fetch elements перед диалогом
- `frontend/components/element/WorkspaceContainer.tsx` — fix group share

**Порядок:** баг-фикс шеринга → UI шеринга → колокольчик → страница → стор

**Edge cases:** 0 элементов, 0 загрузок (строка скрыта), 0 проектов (дропдаун скрыт), loading при fetch
