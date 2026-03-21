"""
Fix the DB-level FK constraint for Element.scene to use ON DELETE CASCADE.

Django's AlterField for on_delete only changes the Python-level behavior.
This migration ensures the actual DB constraint matches.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('elements', '0007_scene_cascade_delete'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE elements_element
                    DROP CONSTRAINT IF EXISTS elements_element_scene_id_7c87fd6c_fk_scenes_scene_id;
                ALTER TABLE elements_element
                    ADD CONSTRAINT elements_element_scene_id_7c87fd6c_fk_scenes_scene_id
                    FOREIGN KEY (scene_id) REFERENCES scenes_scene(id)
                    ON DELETE CASCADE
                    DEFERRABLE INITIALLY DEFERRED;
            """,
            reverse_sql="""
                ALTER TABLE elements_element
                    DROP CONSTRAINT IF EXISTS elements_element_scene_id_7c87fd6c_fk_scenes_scene_id;
                ALTER TABLE elements_element
                    ADD CONSTRAINT elements_element_scene_id_7c87fd6c_fk_scenes_scene_id
                    FOREIGN KEY (scene_id) REFERENCES scenes_scene(id)
                    DEFERRABLE INITIALLY DEFERRED;
            """,
        ),
    ]
