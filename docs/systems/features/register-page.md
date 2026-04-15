# Register Page

> Страница регистрации с интерактивным шоукейсом продукта.
> Последнее обновление: 2026-04-15

## Статус: Реализовано

## Обзор

Страница регистрации — первый экран, который видит пользователь. Приходит из лендинга, из share-ссылки, по прямому URL. Задача: произвести впечатление, показать продукт и довести до регистрации. Текущая реализация — стандартная карточка на пустом фоне. Новая версия — split-screen с интерактивным showcase.

## Дизайн-решение

### Компоновка (desktop, >900px)

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  ┌─────────────────────┐  ┌────────────────────────┐ │
│  │                     │  │                        │ │
│  │   HERO TEXT         │  │                        │ │
│  │   (крупный,         │  │    ФОРМА               │ │
│  │    агитационный)    │  │    РЕГИСТРАЦИИ          │ │
│  │                     │  │                        │ │
│  │   ~33% showcase     │  │    50% экрана          │ │
│  ├─────────────────────┤  │                        │ │
│  │                     │  │                        │ │
│  │   FLOATING          │  │                        │ │
│  │   COMPONENTS        │  │                        │ │
│  │                     │  │                        │ │
│  │   ~67% showcase     │  │                        │ │
│  │                     │  │                        │ │
│  └─────────────────────┘  └────────────────────────┘ │
│                                                      │
│  ← 50% showcase →         ← 50% form →              │
└──────────────────────────────────────────────────────┘
```

- **Правая половина (50%):** форма регистрации, вертикально по центру
- **Левая половина (50%):**
  - **Верхняя треть:** hero-блок — крупный заголовок + подзаголовок (мотивационный, агитационный)
  - **Нижние две трети:** поле с плавающими интерактивными компонентами

### Компоновка (мобилка, <900px)

Showcase скрывается полностью. Форма на весь экран. Тёмный фон, логотип, форма.

### Showcase: плавающие компоненты

Компоненты выглядят **идентично** реальному интерфейсу Раскадровки в dark mode. Каждый элемент:

- **Плавает** — мягкая CSS/JS анимация (синусоиды, разные амплитуды/фазы)
- **Draggable** — можно схватить мышкой и перетащить в любое место
- **Интерактивный** — hover-эффекты, кликабельные реакции, чекбоксы

Само пространство **не** draggable. Двигаются только отдельные элементы.

### Типы компонентов в showcase

| Компонент | Откуда стиль | Интерактив |
|-----------|-------------|------------|
| **ProjectCard** | `ProjectGrid.tsx` — карточка проекта с превью-гридом, footer с именем и мета | Hover → фиолетовый заголовок, `border-primary/40` |
| **ElementCard** | `ElementCard` — карточка генерации с thumbnail, бейджами типа (VIDEO/IMAGE), комментариев | Hover → overlay с лупой, кликабельный чекбокс, approval-пилл |
| **GroupCard** | `GroupCard` — стек из 3 слоёв (back/middle/front), превью внутри | Hover → подъём стека, `border-primary/40` |
| **Комментарий** | `CommentThread` — аватар (цветной круг с инициалом), имя, время, текст | Hover → появляются кнопки реакций (👍 ❤️ ↩️), кнопки кликабельны |
| **Реакции** | Sharing reactions — `rounded-full` пиллы с emoji + счётчик | Клик → toggle active (фиолетовая обводка), счётчик +1/-1 |
| **Share-бейдж** | — круглый pill, иконка + текст («Ссылка отправлена», «3 участника») | Pulse-анимация зелёной/синей точки |
| **Status-бейдж** | — «Генерация завершена», «Генерация 3 из 8...» | Пульсирующая точка |
| **Нотификация** | Toast-style — иконка в цветном квадрате + заголовок + описание | Hover → подсветка border |
| **Chat-пузырь** | `MessageBubble` — Telegram-стиль, admin (#2B5278) / user (#182533) | — |
| **Review-пилл** | `approved` (зелёный), `changes_requested` (оранжевый) | — |

### Контент внутри карточек

Внутри ElementCard и ProjectCard — **реальные красивые изображения**, не градиентные заглушки:

- Сочные AI-генерации: животные, фэнтези-персонажи (орки, русалки), спортсмены, ultra-HD портреты, пейзажи
- Изображения должны вызывать желание рассмотреть поближе и попробовать сгенерировать самому
- Формат: статичные `.webp` / `.jpg`, размер ~200-300px для превью
- Источник: заранее сгенерированные и размещённые в `frontend/public/images/showcase/`

### Hero-блок

Верхняя треть showcase. Содержит:

- **Заголовок:** крупный (28-32px), жирный (800), с градиентным акцентом на ключевых словах
- **Подзаголовок:** 13-14px, muted, 1-2 строки — что делает платформа
- Текст на русском, без англицизмов, современный, не пафосный

Примеры заголовков (финальный выбрать при имплементации):
- «Собирайте **визуальные истории** вместе с командой»
- «Создавайте. Согласовывайте. **Запускайте.**»
- «AI-продакшен для **визуальных команд**»

## Форма регистрации

### Поля

1. **Логин** — text, `autocomplete="username"`, placeholder `"your_username"`
2. **Email** — email, `autocomplete="email"`, placeholder `"you@example.com"`
3. **Пароль** — password с toggle visibility, `autocomplete="new-password"`, placeholder `"Минимум 8 символов"`
4. **Повторите пароль** — password, `autocomplete="new-password"`
5. **Чекбокс ToS** — ссылки на Условия и Политику

### Кнопки

- **Зарегистрироваться** — primary, gradient (`#6C5CE7 → #8B7CF7`), `disabled` если не принят ToS
- **Разделитель** «или»
- **Продолжить с Google** — outline, иконка Google

### Подзаголовок формы

`Бесплатно. Без карты. Генерации сразу.` — снимает барьер.

### Ссылка на логин

`Уже есть аккаунт? Войти` — внизу формы, отделена border-top.

### Валидация

Без изменений — текущая логика из `register/page.tsx`:
- Все поля обязательны
- Пароль ≥ 8 символов
- Пароли совпадают
- ToS принят
- Toast при ошибках (sonner, русский)

## Стилизация

### Цвета (dark mode — основная тема)

| Токен | Значение | Использование |
|-------|----------|---------------|
| `--background` | `#111827` | Фон страницы, фон формы |
| `--card` / `--card-bg` | `#1C2640` | Фон карточек, input'ов |
| `--border` | `#2D3A55` | Границы |
| `--primary` | `#8B7CF7` | Акцент, кнопки, active-состояния |
| `--primary-dark` | `#6C5CE7` | Gradient start |
| `--foreground` | `#EFF1F5` | Основной текст |
| `--muted-foreground` | `#8B8FA3` | Вторичный текст |
| `--surface` | `#151D30` | Панели |

### Фон showcase

- Базовый: `--background` (`#111827`)
- Слой 1: тонкая анимированная сетка (opacity 0.02-0.03)
- Слой 2: 4-5 glow-сфер (radial-gradient, фиолетовый/синий, filter:blur(80px), плавно дрейфуют)
- Слой 3: плавающие компоненты

### Типографика

- Font: Inter (уже в проекте)
- Hero: 28-32px / 800 / letter-spacing -0.5px
- Card titles: 13px / 500
- Meta: 11px / 400
- Form title: 26-28px / 800
- Labels: 12px / 500
- Inputs: 13px

### Анимации

- Floating: `requestAnimationFrame` + синусоиды, у каждого элемента свои amplitude/frequency/phase
- Drag: нативный pointer events (mousedown/move/up), без библиотек
- Hover на карточках: `border-color` transition 0.25s, `box-shadow` transition
- Hover на комментариях: появление кнопок реакций (opacity 0→1, 0.2s)
- Reaction click: `transform:scale(0.92)` на active, toggle класса
- Glow-сферы: parallax за мышкой (subtle, ±8px)
- Пульсирующие точки: `@keyframes pulse` scale 1→2, opacity 1→0

## Технические детали

### Архитектура компонентов (Thin Pages)

Соблюдаем правило `Page → Container → Store → API`. Страница — тонкая, бизнес-логика в контейнерах и хуках.

```
register/page.tsx        — только <AuthShowcase /> + <RegisterContainer />
RegisterContainer.tsx    — форма + валидация, использует useRegisterForm()
useRegisterForm.ts       — хук: state, submit, ошибки, loading
LoginContainer.tsx       — форма логина, использует useLoginForm()
useLoginForm.ts          — хук: state, submit, redirect
```

### Файлы (новые)

```
frontend/
├── app/(auth)/
│   ├── layout.tsx                    — МИНИМАЛЬНЫЕ ПРАВКИ (см. ниже)
│   ├── register/page.tsx             — Thin page: <AuthShowcase /> + <RegisterContainer />
│   └── login/page.tsx                — Thin page: <AuthShowcase /> + <LoginContainer />
├── components/auth/
│   ├── AuthShowcase.tsx              — showcase панель (hero + FloatingField)
│   ├── FloatingField.tsx             — контейнер с floating элементами + drag logic
│   ├── RegisterContainer.tsx         — форма регистрации (UI + useRegisterForm)
│   ├── LoginContainer.tsx            — форма логина (UI + useLoginForm)
│   ├── useRegisterForm.ts            — хук: state, validation, submit, loading
│   ├── useLoginForm.ts               — хук: state, submit, redirect
│   ├── showcase-items.ts             — конфигурация плавающих элементов
│   └── ShowcaseCard.tsx              — wrapper: float + drag + hover
├── public/images/showcase/           — AI-генерации (10-15 изображений)
```

### Layout и другие auth-страницы

`app/(auth)/layout.tsx` остаётся **общим** для всех 5 страниц группы (register, login, forgot-password, verify-email, reset-password). Layout **не** включает showcase — он минимален:

```tsx
// layout.tsx — только тёмный фон, без лого (лого внутри каждой страницы)
<div className="dark min-h-screen bg-background">{children}</div>
```

Showcase подключается **на уровне page**, а не layout. Страницы `forgot-password`, `verify-email`, `reset-password` остаются без showcase — просто центрированная карточка на тёмном фоне (как сейчас, но в dark mode).

### Light mode

Showcase **принудительно dark**. На элементе showcase добавляется `className="dark"`, что фиксирует CSS-переменные в тёмной палитре. Даже если пользователь в light mode, showcase всегда тёмный — это часть визуальной идентичности. Форма регистрации адаптируется к теме пользователя.

### Google OAuth

Кнопка «Продолжить с Google» — **backlog**. В текущей реализации кнопка показывается, но при клике показывает toast «Скоро будет доступно». Backend OAuth не реализован. Явно помечено как backlog в конце спеки.

### Accessibility

- Вся showcase-панель: `aria-hidden="true"` — декоративный контент, не для скринридеров
- `prefers-reduced-motion`: при активном — все floating-анимации выключаются, glow-parallax выключается, элементы статичны
- Форма регистрации: полная keyboard-навигация, `aria-label` на toggle password, фокус-кольца

### Drag-логика

Без внешних библиотек. Нативные pointer events:

```
onPointerDown → setPointerCapture, запомнить offset, isDragging=true
onPointerMove → обновить position (left/top) через transform
onPointerUp → releasePointerCapture, isDragging=false
onPointerCancel → releasePointerCapture, isDragging=false (reset)
```

- `pointer-events` вместо `mouse-events` — работает и на тач
- `setPointerCapture` + `releasePointerCapture` для надёжного отслеживания
- **`onPointerCancel`** обязателен — сброс состояния при потере фокуса, tab-switch, React 19 Strict Mode double-render
- Элемент при drag: `z-index:1000`, `cursor:grabbing`, `will-change:transform`
- Границы: не выпускать за пределы showcase-контейнера
- Позиция через `transform:translate(dx,dy)` — не через `left/top` (избегаем layout thrashing)

### TypeScript: showcase-items.ts

```typescript
interface ShowcaseItem {
  id: string;
  type: 'project-card' | 'element-card' | 'group-card' | 'comment' | 'reaction-group' | 'share-badge' | 'status-badge' | 'notification' | 'chat-bubble' | 'review-pill';
  position: { x: number; y: number };  // начальная позиция в % от контейнера
  size: { width: number };              // px
  float: { amplitudeX: number; amplitudeY: number; speedX: number; speedY: number; };
  content: Record<string, unknown>;     // type-specific payload
}
```

### Изображения для showcase

10-15 заранее сгенерированных изображений. Размещаются в `frontend/public/images/showcase/`. Примерные сюжеты:

- Фэнтези: воин-орк, русалка, дракон
- Портреты: стильные люди, спортсмены
- Животные: волк, лев, сова
- Пейзажи: горы, океан, город
- Абстракция: неон, текстуры

Формат: `.webp`, размер файла 30-80KB, разрешение 400x400 для квадратных, 600x400 для landscape.

### Совместимость с login

Страница `/login` использует тот же showcase и layout. Меняется только содержимое формы (меньше полей, другой заголовок). `AuthShowcase` — shared компонент.

## Feature gating

Страница регистрации — публичная, доступна всем. Feature gating не применяется.

## Responsive breakpoints

| Размер | Поведение |
|--------|-----------|
| **>1400px (ultrawide)** | Showcase получает больше места, элементов видно больше |
| **900-1400px (desktop)** | Стандартный split 50/50 |
| **<900px (mobile/tablet)** | Showcase скрыт, форма на полный экран |

### Изображения: временное решение

До генерации финальных изображений — использовать **placeholder-картинки** через Unsplash (`https://images.unsplash.com/photo-...?w=400&q=80`). Это позволяет начать имплементацию не дожидаясь контента. Финальные `.webp` заменяют URL при готовности.

### Loading state

При первом рендере showcase-компоненты скрыты (`opacity:0`). После гидрации — `opacity:1` с transition 0.5s. Это предотвращает layout shift и мерцание при SSR→CSR.

## Backlog

- Google OAuth (backend: django-allauth или social-auth-app-django)
- OAuth: Apple, VK, Яндекс
- Motion-design видео на левой панели вместо floating components
- A/B тестирование hero-текстов
- Онбординг-flow после регистрации (тур по интерфейсу)
- Реальные скриншоты интерфейса вместо стилизованных карточек
