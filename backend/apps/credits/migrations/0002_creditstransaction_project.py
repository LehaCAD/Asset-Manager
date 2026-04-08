"""
Add project FK to CreditsTransaction.

Previously total_spent per project was calculated via element__project,
but element FK is SET_NULL on deletion — losing the project link.
Direct project FK survives element deletion, preserving spending history.
"""

from django.db import migrations, models
import django.db.models.deletion


def populate_project_from_element(apps, schema_editor):
    """Backfill project_id from element.project for existing transactions."""
    CreditsTransaction = apps.get_model('credits', 'CreditsTransaction')
    # Update in batches to avoid locking the whole table
    qs = CreditsTransaction.objects.filter(
        project__isnull=True,
        element__isnull=False,
    ).select_related('element')

    batch = []
    for tx in qs.iterator(chunk_size=500):
        if tx.element and tx.element.project_id:
            tx.project_id = tx.element.project_id
            batch.append(tx)
        if len(batch) >= 500:
            CreditsTransaction.objects.bulk_update(batch, ['project_id'], batch_size=500)
            batch = []
    if batch:
        CreditsTransaction.objects.bulk_update(batch, ['project_id'], batch_size=500)


class Migration(migrations.Migration):

    dependencies = [
        ('credits', '0001_initial'),
        ('projects', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='creditstransaction',
            name='project',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='credits_transactions',
                to='projects.project',
                verbose_name='Проект',
            ),
        ),
        migrations.AddIndex(
            model_name='creditstransaction',
            index=models.Index(fields=['project', 'reason'], name='credits_cre_project_1261b4_idx'),
        ),
        migrations.RunPython(
            populate_project_from_element,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
