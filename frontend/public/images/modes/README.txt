Mode Illustrations — статические иллюстрации для режимов image_inputs_schema

Как добавить иллюстрацию для режима:

1. В Pencil MCP (.pen файл) — экспортируй нужный фрейм:
   - Используй инструмент export_nodes с nodeId thumbnail-фрейма
   - Формат: PNG, размер: 144x144px (2x для retina с отображением 72x72)

2. Сохрани файл сюда с именем {group_key}.png:
   - first_frame.png  — для группы "Начальный кадр"
   - end_frame.png    — для группы "Конечный кадр"
   - references.png   — для группы "Референсы"
   - frames.png       — для группы "Кадры"

3. В image_inputs_schema группы добавь поле "illustration":
   {
     "key": "frames",
     "label": "Кадры",
     "illustration": "frames",   ← ключ = имя файла без .png
     ...
   }

4. Фронтенд отрисует: /images/modes/{illustration}.png

Если illustration не задан — fallback на lucide icon из поля "icon".
Если icon не задан — серый placeholder.
