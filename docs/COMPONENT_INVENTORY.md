# Инвентаризация компонентов — 60 шт.

## UI Primitives (18) — `components/ui/`

| Компонент | Описание | Варианты/Размеры |
|-----------|----------|------------------|
| Button | Кнопка | default, destructive, outline, secondary, ghost, link / xs, sm, default, lg, icon |
| Dialog | Модальное окно | Root, Trigger, Content, Close |
| DropdownMenu | Выпадающее меню | Root, Trigger, Content |
| Tooltip | Подсказка при наведении | configurable delay, position |
| Tabs | Вкладки | Root (orientation), List, Trigger, Content |
| Separator | Разделитель | horizontal, vertical |
| Popover | Всплывающий контент | Root, Trigger, Content, Anchor |
| ScrollArea | Скролл-контейнер | vertical, horizontal |
| Switch | Тогл вкл/выкл | sm, default |
| Badge | Метка/тег | default, secondary, destructive, outline, ghost, link |
| Skeleton | Плейсхолдер загрузки | анимированный |
| Sheet | Боковая панель | Root, Trigger, Content, Overlay |
| Textarea | Многострочный инпут | auto-sizing |
| Label | Подпись к полю | — |
| Toggle | Одиночный тогл | default, outline / sm, default, lg |
| ToggleGroup | Группа тоглов | spacing control |
| Input | Текстовый инпут | validation states |
| Select | Выпадающий выбор | Trigger, Content, Value |
| ChargeIcon | Иконка "Заряд" | sm, md, lg |

## Layout (5) — `components/layout/`

| Компонент | Описание |
|-----------|----------|
| Navbar | Шапка: меню пользователя, баланс, тема |
| WorkspaceHeader | Заголовок workspace: хлебные крошки, навигация по сценам, счётчик |
| Breadcrumbs | Хлебные крошки: Projects → Project → Scene |
| AuthGuard | Обёртка: проверка авторизации |
| ThemeToggle | Переключатель темы |

## Project (4) — `components/project/`

| Компонент | Описание |
|-----------|----------|
| ProjectGrid | Сетка проектов + кнопка создания + скелетоны + empty state |
| ProjectCard | Карточка проекта: thumbnail, имя, статус, метрики, меню |
| CreateProjectDialog | Диалог создания проекта: имя + aspect ratio |
| ProjectSettingsDialog | Настройки проекта: имя, статус, aspect ratio |

## Scene/Group (3) — `components/scene/`

| Компонент | Описание |
|-----------|----------|
| ScenarioTableClient | DnD-сетка карточек сцен/групп + создание + reorder |
| SceneCard | Карточка сцены: thumbnail, имя, метрики, drag handle |
| CreateSceneDialog | Диалог создания сцены: имя |

## Element & Workspace (12) — `components/element/`

| Компонент | Описание |
|-----------|----------|
| WorkspaceContainer | Основной workspace для root и group: смешанная сетка, upload, WS |
| SceneWorkspace | (deprecated) Старый workspace контейнер |
| ElementGrid | Адаптивная DnD-сетка элементов и групп, display preferences |
| ElementCard | Карточка элемента: thumbnail, статус, избранное, удаление, мультиселект |
| ElementCardSkeleton | Скелетон элемента |
| GroupCard | Карточка группы: иконка папки, имя, кол-во, размер, чекбокс |
| EmptyState | Пустое состояние: drag-and-drop upload зона |
| ElementFilters | Фильтры: All, Favorites, Images, Videos + счётчики |
| ElementBulkBar | Панель bulk: выделено N, select-all, удалить, переместить |
| SceneNavigation | Навигация prev/next между сценами |
| ElementSelectionModal | Модалка выбора элементов из нескольких сцен, tree, upload |
| ElementSelectionGrid | Сетка выбора элементов с чекмарком |
| ElementSelectionCard | Карточка элемента в модалке выбора |
| MoveToGroupDialog | Диалог перемещения в группу: дерево групп |

## Generation (9) — `components/generation/`

| Компонент | Описание |
|-----------|----------|
| PromptBar | Ввод промпта, image inputs, mode toggle, кнопка генерации, цена |
| ConfigPanel | Сворачиваемая панель: модель, параметры, цена |
| ParametersForm | Рендер параметров из schema: text, select, switch, option panel |
| ModelSelector | Модальная панель выбора модели: IMAGE/VIDEO табы, превью, теги |
| ModelCard | Карточка модели: превью, имя, теги, состояние выбора |
| ModeSelector | Поповер image input групп/слотов: available/active/locked |
| OptionSelectorPanel | Плавающая панель выбора опций (resolution, aspect ratio) grid |
| PromptThumbnail | Миниатюра image input с кнопкой удаления |
| PromptThumbnailPopup | Поповер превью загруженного изображения: replace, remove |

## Lightbox (4) — `components/lightbox/`

| Компонент | Описание |
|-----------|----------|
| LightboxModal | Полноэкранный просмотр: навигация, filmstrip, фильтры, действия, DetailPanel |
| DetailPanel | Боковая панель: метаданные, промпт, модель, цена, seed, дата |
| Filmstrip | Горизонтальная полоса миниатюр внизу lightbox |
| LightboxNavigation | Стрелки prev/next |

## Display (1) — `components/display/`

| Компонент | Описание |
|-----------|----------|
| DisplaySettingsPopover | Настройки сетки: плотность, aspect ratio, fit mode |
