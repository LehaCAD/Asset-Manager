# Ensure users_userquota has new column names (max_scenes_per_project, max_elements_per_scene).
# Idempotent: renames old columns only if they exist; no-op if already correct.

from django.db import migrations, connection


def column_exists(cursor, table: str, column: str) -> bool:
    if connection.vendor == 'postgresql':
        cursor.execute(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = CURRENT_SCHEMA()
              AND table_name = %s AND column_name = %s
            """,
            [table, column],
        )
        return cursor.fetchone() is not None
    cursor.execute('PRAGMA table_info(%s)', [table])
    return any(row[1] == column for row in cursor.fetchall())


def ensure_columns(apps, schema_editor):
    table = 'users_userquota'
    with connection.cursor() as cursor:
        if column_exists(cursor, table, 'max_boxes_per_project') and not column_exists(cursor, table, 'max_scenes_per_project'):
            cursor.execute(
                'ALTER TABLE users_userquota RENAME COLUMN max_boxes_per_project TO max_scenes_per_project;'
            )
        if column_exists(cursor, table, 'max_assets_per_box') and not column_exists(cursor, table, 'max_elements_per_scene'):
            cursor.execute(
                'ALTER TABLE users_userquota RENAME COLUMN max_assets_per_box TO max_elements_per_scene;'
            )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_rename_userquota_columns'),
    ]

    operations = [
        migrations.RunPython(ensure_columns, noop_reverse),
    ]
