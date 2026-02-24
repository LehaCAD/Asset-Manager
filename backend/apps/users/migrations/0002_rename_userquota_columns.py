# Generated manually for renaming legacy UserQuota columns (Box/Asset -> Scene/Element)

from django.db import migrations, connection


def column_exists(table: str, column: str) -> bool:
    """Return True if the table has the given column."""
    with connection.cursor() as cursor:
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
        # SQLite (e.g. tests): PRAGMA table_info returns (cid, name, type, ...)
        cursor.execute('PRAGMA table_info(%s)', [table])
        return any(row[1] == column for row in cursor.fetchall())


def rename_old_columns(apps, schema_editor):
    table = 'users_userquota'
    if connection.vendor == 'postgresql':
        if column_exists(table, 'max_boxes_per_project'):
            with connection.cursor() as cursor:
                cursor.execute(
                    'ALTER TABLE users_userquota RENAME COLUMN max_boxes_per_project TO max_scenes_per_project;'
                )
        if column_exists(table, 'max_assets_per_box'):
            with connection.cursor() as cursor:
                cursor.execute(
                    'ALTER TABLE users_userquota RENAME COLUMN max_assets_per_box TO max_elements_per_scene;'
                )
    elif connection.vendor == 'sqlite':
        # SQLite does not support RENAME COLUMN in older versions; 3.25.0+ supports it.
        # If we're on SQLite and table has old columns, we'd need a full table rebuild.
        # For dev/test with SQLite that was created with new schema, do nothing.
        if column_exists(table, 'max_boxes_per_project'):
            with connection.cursor() as cursor:
                cursor.execute(
                    'ALTER TABLE users_userquota RENAME COLUMN max_boxes_per_project TO max_scenes_per_project;'
                )
        if column_exists(table, 'max_assets_per_box'):
            with connection.cursor() as cursor:
                cursor.execute(
                    'ALTER TABLE users_userquota RENAME COLUMN max_assets_per_box TO max_elements_per_scene;'
                )
    # Other backends: could add MySQL etc. if needed.


def reverse_rename(apps, schema_editor):
    """Revert column names for migration rollback."""
    table = 'users_userquota'
    if connection.vendor == 'postgresql':
        if column_exists(table, 'max_scenes_per_project'):
            with connection.cursor() as cursor:
                cursor.execute(
                    'ALTER TABLE users_userquota RENAME COLUMN max_scenes_per_project TO max_boxes_per_project;'
                )
        if column_exists(table, 'max_elements_per_scene'):
            with connection.cursor() as cursor:
                cursor.execute(
                    'ALTER TABLE users_userquota RENAME COLUMN max_elements_per_scene TO max_assets_per_box;'
                )
    elif connection.vendor == 'sqlite':
        if column_exists(table, 'max_scenes_per_project'):
            with connection.cursor() as cursor:
                cursor.execute(
                    'ALTER TABLE users_userquota RENAME COLUMN max_scenes_per_project TO max_boxes_per_project;'
                )
        if column_exists(table, 'max_elements_per_scene'):
            with connection.cursor() as cursor:
                cursor.execute(
                    'ALTER TABLE users_userquota RENAME COLUMN max_elements_per_scene TO max_assets_per_box;'
                )


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(rename_old_columns, reverse_rename),
    ]
