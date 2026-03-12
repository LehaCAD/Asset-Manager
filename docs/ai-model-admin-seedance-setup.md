# Настройка AI Model Admin для Kie.ai / Seedance 1.5 Pro

## 1. Создай AI Provider для `Kie.ai`

- Открой админку `AI провайдеры`.
- Создай запись:
  - `Название`: `Kie.ai`
  - `Базовый URL API`: базовый URL Kie.ai, который используется в проекте
  - `API ключ`: рабочий ключ Kie.ai
  - `Активен`: включено

## 2. Создай AI Model для `Seedance 1.5 Pro`

- Открой админку `AI модели`.
- Создай запись:
  - `Провайдер`: `Kie.ai`
  - `Название`: `Seedance 1.5 Pro`
  - `Тип`: `Видео`
  - `Активна`: включено
  - `Эндпоинт`: endpoint Seedance 1.5 Pro из используемого API Kie.ai

## 3. Готовый `request_schema`

```json
{
  "model": "seedance-1.5-pro",
  "prompt": "{{prompt}}",
  "image_urls": "{{input_urls}}",
  "aspect_ratio": "{{aspect_ratio}}",
  "resolution": "{{resolution}}",
  "duration": "{{duration}}",
  "callback_url": "{{callback_url}}"
}
```

Если endpoint Kie.ai требует вложенный payload, сохрани те же плейсхолдеры в нужных ключах без переименования канонических параметров.

## 4. Как сделать первый Save

- Заполни `Провайдер`, `Название`, `Тип`, `Эндпоинт`.
- Вставь `request_schema`.
- Нажми `Сохранить`.
- После первого сохранения админка найдёт плейсхолдеры и откроет шаги настройки параметров и цен.

## 5. Как разметить плейсхолдеры

- `{{prompt}}` → роль `Промпт (основной текст)`
- `{{callback_url}}` → роль `Callback (системный)`
- `{{input_urls}}` или `{{image_urls}}` → роль `Входные файлы (авто)`
- `{{aspect_ratio}}` → роль `Параметр интерфейса`
- `{{resolution}}` → роль `Параметр интерфейса`
- `{{duration}}` → роль `Параметр интерфейса`

## 6. Какие options задать

Для `aspect_ratio`:

```text
16:9
9:16
1:1
```

Для `resolution`:

```text
720p
1080p
```

Для `duration`:

```text
5
10
```

## 7. Lookup pricing JSON

```json
{
  "cost_params": [
    "resolution",
    "duration"
  ],
  "costs": {
    "720p|5": "3.00",
    "720p|10": "5.00",
    "1080p|5": "6.00",
    "1080p|10": "9.00"
  }
}
```

Если цена зависит ещё и от `aspect_ratio`, добавь его в `cost_params` и используй тот же порядок в ключах lookup.

## 8. Важное примечание

`Pricing schema (fallback)` руками не заполнять.
