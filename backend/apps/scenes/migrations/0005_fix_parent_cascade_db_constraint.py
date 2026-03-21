"""
Fix the DB-level FK constraint for Scene.parent to use ON DELETE CASCADE.

Django's on_delete=CASCADE is ORM-level only. This migration ensures
the actual DB constraint matches so deletions are reliable at all levels.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('scenes', '0004_scene_cascade_delete'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE scenes_scene
                    DROP CONSTRAINT IF EXISTS scenes_scene_parent_id_7299ae36_fk_scenes_scene_id;
                ALTER TABLE scenes_scene
                    ADD CONSTRAINT scenes_scene_parent_id_7299ae36_fk_scenes_scene_id
                    FOREIGN KEY (parent_id) REFERENCES scenes_scene(id)
                    ON DELETE CASCADE
                    DEFERRABLE INITIALLY DEFERRED;
            """,
            reverse_sql="""
                ALTER TABLE scenes_scene
                    DROP CONSTRAINT IF EXISTS scenes_scene_parent_id_7299ae36_fk_scenes_scene_id;
                ALTER TABLE scenes_scene
                    ADD CONSTRAINT scenes_scene_parent_id_7299ae36_fk_scenes_scene_id
                    FOREIGN KEY (parent_id) REFERENCES scenes_scene(id)
                    DEFERRABLE INITIALLY DEFERRED;
            """,
        ),
    ]
