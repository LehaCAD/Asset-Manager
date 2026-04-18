## UX Analysis: Визуальный редизайн кабинета
### Размер: L

### 1. Текущее состояние
- Кабинет был построен code-first без pen-mockup'а
- Массовые расхождения с брендбуком: `rounded-xl` (12px) вместо max 6px, `bg-card/80` не из дизайн-системы, font sizes за пределами шкалы (text-3xl, text-4xl)
- Sidebar сливается с контентом (одинаковый bg-card)
- Active nav item: `bg-muted` вместо `bg-primary-muted + text-primary`
- Storage: красный/жёлтый для usage — нарушает "no fear colors"
- Нет error state ни в одном из 6 разделов
- Кастомные кнопки вместо shadcn Button
- Hardcoded chart color `#7C8CF5`

### 2. Impact Map
- **Изолированные изменения (только кабинет):** layout.tsx, все 6 page.tsx, DateRangePicker, SelectDropdown
- **Shared компоненты:** Skeleton (6+ мест вне кабинета), ChargeIcon (7 точек), Popover (6+ мест)
- **Глобальное обновление:** CSS vars в globals.css для соответствия брендбуку

### 3. Решение

**Mockup'ы в pen:**
- Dark theme: `UX: Cabinet Redesign 2026-04-04` (node `XGCzC`)
- Light theme: `UX: Cabinet Redesign — LIGHT THEME` (node `H76TR`)
- Light depth strategy: добавлено в Color System v2 (node `gx1cz`)

**Утверждённые развилки:**
| Вопрос | Решение |
|--------|---------|
| Sidebar | Фиксированная 240px (не collapsible) |
| CSS vars | Глобальное обновление под брендбук (отдельный шаг) |
| Storage цвета | Только `--primary`, без красного/жёлтого |
| Chart | Solid bars `--primary`, без градиента |

**Цветовая карта Dark / Light:**
| Элемент | Dark | Light |
|---------|------|-------|
| Page bg | `#0C0F16` | `#F5F6F8` |
| Sidebar bg | `#13161F` | `#EEEEF2` |
| Card bg | `#1A1D28` + border | `#FFFFFF` + border + shadow-sm |
| Table header bg | `#13161F` | `#F8F9FB` |
| Text primary | `#F0F1F4` | `#111318` |
| Text secondary | `#8B8FA3` | `#5C6070` |
| Text muted | `#5C6070` | `#9096A5` |
| Primary | `#8B7CF7` | `#6C5CE7` |
| Card shadow (light only) | — | `0 1px 2px rgba(0,0,0,0.03), 0 4px 8px rgba(18,42,66,0.015)` |

**Light theme depth strategy (Stripe-подход):**
- Тонированный фон `#F5F6F8` вместо белого — создаёт контраст с белыми карточками
- Sidebar `#EEEEF2` — ещё темнее для навигационной глубины
- Layered tinted shadow на карточках — два слоя, второй с синим подтоном
- Border + shadow combo — тонкий border остаётся для определённости формы

### 4. Обновлённый брендбук
Изменения внесены в `docs/BRANDBOOK.md`:
- Section 2.2: обновлены --bg-base и --bg-surface для light theme
- Section 6: обновлён shadow-sm для light theme (layered tinted)
- Section 8: обновлена иерархия поверхностей + добавлена стратегия глубины
- Section 13: обновлена шпаргалка
- Section 14: добавлены 3 новых строки в таблицу отличий

Изменения в pen `pencil-new.pen`:
- Добавлена секция "Light Theme Depth Strategy" в Color System v2 (node `gx1cz`)
- Swatches: bg-base, bg-surface, bg-elevated с shadow
- Shadow spec с кодом и объяснением

### 5. Scope для имплементации

**Порядок работы:**
1. `globals.css` — обновить CSS vars: --bg-base, --bg-surface, shadow-sm для light theme
2. `cabinet/layout.tsx` — sidebar цвета, active state, border radius, balance widget
3. `cabinet/analytics/page.tsx` — metric cards, chart solid bars, breakdown bars, font sizes, paddings, cornerRadius
4. `cabinet/balance/page.tsx` — hero card, table, font sizes, paddings
5. `cabinet/storage/page.tsx` — убрать destructive/warning, только --primary, предиктивная подсказка
6. `cabinet/history/page.tsx` — таблица стили, badge sizes, font sizes
7. `cabinet/notifications/page.tsx` — items стили, tab active state
8. `cabinet/settings/page.tsx` — input bg, border radius, section spacing
9. Добавить error state во все разделы

**Edge cases:** empty, error, loading (skeleton), 0/1/1000+ items.
