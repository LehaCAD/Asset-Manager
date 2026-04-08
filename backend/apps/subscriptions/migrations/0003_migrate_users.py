"""Create Subscription for every existing User who doesn't have one."""

from django.db import migrations
from django.utils import timezone
from datetime import timedelta


def create_subscriptions_for_existing_users(apps, schema_editor):
    User = apps.get_model('users', 'User')
    Plan = apps.get_model('subscriptions', 'Plan')
    Subscription = apps.get_model('subscriptions', 'Subscription')

    default_plan = Plan.objects.filter(is_default=True).first()
    if not default_plan:
        return

    now = timezone.now()
    far_future = now + timedelta(days=3650)  # ~10 years

    users_without_sub = User.objects.exclude(
        subscription__isnull=False
    )

    subscriptions = []
    for user in users_without_sub.iterator():
        subscriptions.append(
            Subscription(
                user=user,
                plan=default_plan,
                status='active',
                started_at=user.created_at or now,
                expires_at=far_future,
            )
        )

    if subscriptions:
        Subscription.objects.bulk_create(subscriptions, batch_size=500)


def reverse_migration(apps, schema_editor):
    Subscription = apps.get_model('subscriptions', 'Subscription')
    Subscription.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0002_seed_plans'),
        ('users', '0006_user_email_verification_sent_at_and_more'),
    ]

    operations = [
        migrations.RunPython(
            create_subscriptions_for_existing_users,
            reverse_migration,
        ),
    ]
