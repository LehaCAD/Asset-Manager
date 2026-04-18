"""Перенос превью AI-моделей из frontend/public в S3.

Читает PNG-файлы из `migrations/_seed_previews/` и заливает их в S3 через
`default_storage` по префиксу `system/model-previews/`. Для каждого файла
находит AIModel, у которой `preview_url` совпадает со «стэмом» файла
(напр. `nano_banana_2.png` → preview_url == `nano_banana_2`), и
проставляет `preview_image`. Если таких моделей не нашлось — файл всё
равно загружается (чтобы после миграции админ мог просто выбрать его
из S3 через обычный upload), миграция не падает.
"""

from __future__ import annotations

from pathlib import Path

from django.core.files.base import ContentFile
from django.db import migrations


SEED_DIR = Path(__file__).resolve().parent / '_seed_previews'


def _upload_seed_previews(apps, schema_editor):
    if not SEED_DIR.exists():
        return

    from django.core.files.storage import default_storage

    AIModel = apps.get_model('ai_providers', 'AIModel')
    ModelFamily = apps.get_model('ai_providers', 'ModelFamily')

    for path in sorted(SEED_DIR.glob('*.png')):
        stem = path.stem
        target_name = f'system/model-previews/{path.name}'

        if not default_storage.exists(target_name):
            with path.open('rb') as fh:
                default_storage.save(target_name, ContentFile(fh.read()))

        # Сопоставляем моделям: preview_url == stem (например, "nano_banana_2").
        candidates = list(AIModel.objects.filter(preview_url=stem))
        # Также ловим случай, когда в БД хранится уже готовый путь.
        candidates += list(AIModel.objects.filter(preview_url=f'/images/models/{path.name}'))
        for model in candidates:
            if not model.preview_image:
                model.preview_image = target_name
                model.preview_url = ''
                model.save(update_fields=['preview_image', 'preview_url'])

        # Для семейств работаем аккуратно: только если preview_url совпадает,
        # мы не меняем схему ModelFamily, но зачищаем путь на внешний URL из S3,
        # чтобы фронт получал абсолютный адрес вместо baked-in пути.
        families = list(ModelFamily.objects.filter(preview_url=stem))
        families += list(ModelFamily.objects.filter(preview_url=f'/images/models/{path.name}'))
        if families:
            public_url = default_storage.url(target_name)
            for family in families:
                family.preview_url = public_url
                family.save(update_fields=['preview_url'])


def _noop_reverse(apps, schema_editor):
    # Откат не удаляет файлы из S3 и не откатывает preview_url —
    # это необратимая data-миграция по смыслу.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('ai_providers', '0011_aimodel_preview_image'),
    ]

    operations = [
        migrations.RunPython(_upload_seed_previews, _noop_reverse),
    ]
