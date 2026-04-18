# Сессия 04 — Мобильная адаптация

**Цель:** базовые вьюшки на iPhone должны не только умещаться, но и быть юзабельными. Не просто «не ломаться», а «работать».

**Тестовое устройство пользователя:** iPhone (Safari). Проверять также узкие брейкпоинты: 360/375/390/430 CSS-px.

---

## BF-04-01 — Welcome-модалка на айфоне занимает всю ширину / не умещается ✅

**Фикс:** `frontend/components/onboarding/WelcomeModal.tsx` — DialogContent класс → `w-[calc(100vw-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto`. Контент прежний (clapperboard, 3 шага, trophy, CTA). Работает в обеих темах через токены `bg-card`/`border-border`.

**Смежно:** [BF-01-01](01-themes-and-colors.md) — тема welcome-модалки.

---

## BF-04-02 — Панель массовых действий не влезает на мобилку ✅

**Фикс:** `frontend/components/element/ElementBulkBar.tsx`
- На `<md` — плавающая полоска 16px от краёв (`left-4 right-4`) с safe-area снизу
- Шапка: select-all + счётчик `N из M` слева, × справа
- Действия: `grid grid-cols-2 gap-1.5` (2×2), hit-area 44px, «Удалить» подкрашена `bg-destructive/10`
- На `md+` — существующая однорядная компактная версия без изменений
- Все цвета через токены (`bg-background`, `bg-muted`, `text-destructive`), работает в обеих темах

---

## BF-04-03 — DetailPanel (лайтбокс) не видна на мобилке ✅

**Фикс:** `frontend/components/lightbox/LightboxModal.tsx` + новый `frontend/components/ui/mobile-slide-out-panel.tsx`
- Создан общий `<MobileSlideOutPanel>` — right-side Sheet 88vw (max 420px) с edge-tab триггером, прикрученным к правому краю экрана
- В `LightboxModal` на `<md` дополнительно рендерится MobileSlideOutPanel с тем же контентом, что уходит в desktop-сайдбар (`children`). Desktop-путь (`hidden md:block`) остался без изменений
- Toggle-кнопка сдвинута на `top-[65%]`, чтобы не конфликтовать с right-стрелкой `LightboxNavigation` (она по центру)
- Swipe left/right между элементами работает как прежде

**Связано с BF-04-06 — используется тот же паттерн.**

---

## BF-04-04 — Ачивка за открытие детального просмотра срабатывает, хотя деталей не видно ✅

Закрылся автоматически через [BF-04-03](#bf-04-03--detailpanel-лайтбокс-не-видна-на-мобилке): DetailPanel теперь реально доступен на мобилке через edge-tab, ачивка стала честной.

---

## BF-04-05 — ConfigPanel недоступна на мобилке ✅

**Фикс:** `frontend/components/element/WorkspaceContainer.tsx`
- На `<md` прямо над `PromptBar` добавлена именованная кнопка-тогглер «Выбрать модель и параметры» (иконка `Sliders`, `ChevronDown`). Ширина в тон PromptBar, `rounded-t-xl`, `bg-card/80 backdrop-blur`.
- По тапу — top-sheet на весь экран сверху: `fixed inset-0 z-[60]` с `bg-black/60` бэкдропом; кликом по бэкдропу и крестиком `X` в sticky-шапке закрывается.
- Внутри — тот же `<ConfigPanel forceOpen hideCollapseButton />` (prop-ы в `ConfigPanel.tsx:17-24`), `max-h-[92vh] overflow-y-auto`.
- Конфликта с DetailPanel нет: DetailPanel на мобилке — right slide-out (`<MobileSlideOutPanel>`, BF-04-03/07), ConfigPanel — top-sheet. Разные оси, не пересекаются.
- Десктоп без изменений: `<div className="hidden md:block"><ConfigPanel /></div>`.

---

## BF-04-06 — Комментарии ревьюера в лайтбоксе на мобилке (шеринг) ✅

**Фикс:** `frontend/components/sharing/ReviewerLightbox.tsx`
- Bottom-sheet (`Sheet side="bottom"`) заменён на `<MobileSlideOutPanel>` — тот же right-slide-out, что у создателя
- Inline-кнопка «Комменты» из нижней панели действий удалена — вызов идёт через edge-tab
- Badge на tab показывает число комментариев
- Desktop-сайдбар с `CommentThread` и `ReviewerNameInput` не тронут

---

## BF-04-07 — Унификация slide-out панелей (мобилка) ✅

**Фикс:** `frontend/components/ui/mobile-slide-out-panel.tsx`
- Общий компонент-обёртка над shadcn Sheet (`side="right"`, 88vw, max 420px)
- Edge-tab триггер (24×56, `rounded-l-lg`) прикручен к правому краю экрана; в открытом состоянии — на левой границе панели. Иконки `PanelRightOpen`/`PanelRightClose` (lucide)
- Optional `triggerBadge` для счётчиков (используется для числа комментариев)
- Используется и в `LightboxModal`, и в `ReviewerLightbox` — один паттерн для создателя и ревьюера
- Токены темы — работает в dark и light без хардкода

---

## BF-04-08 — Общая проверка адаптивности workspace и ЛК на мобилке

**Задача:** пройтись по экранам:
- Список проектов
- Project detail (scene workspace)
- LightBox
- Share page
- Cabinet (все вкладки)
- Feedback chat
- Settings/preferences

И для каждого зафиксить:
- горизонтальный скролл (не должно быть)
- контент обрезан (нет)
- тапаются ли все элементы (hit area ≥44px)

Найденное — либо чиним в этой сессии, либо заводим `BF-04-XX` и распределяем.
