"""Seed plans and features for the subscriptions app."""

from django.db import migrations


PLANS = [
    {
        'code': 'free',
        'name': 'Старт',
        'price': 0,
        'credits_per_month': 0,
        'max_projects': 1,
        'max_scenes_per_project': 10,
        'max_elements_per_scene': 10,
        'storage_limit_gb': 1,
        'is_default': True,
        'display_order': 1,
    },
    {
        'code': 'creator',
        'name': 'Создатель',
        'price': 990,
        'credits_per_month': 1000,
        'max_projects': 5,
        'max_scenes_per_project': 20,
        'max_elements_per_scene': 20,
        'storage_limit_gb': 20,
        'display_order': 2,
    },
    {
        'code': 'creator_pro',
        'name': 'Создатель Pro',
        'price': 1990,
        'credits_per_month': 2000,
        'max_projects': 0,
        'max_scenes_per_project': 50,
        'max_elements_per_scene': 50,
        'storage_limit_gb': 100,
        'is_recommended': True,
        'is_trial_reference': True,
        'display_order': 3,
    },
    {
        'code': 'team',
        'name': 'Команда',
        'price': 4990,
        'credits_per_month': 5000,
        'max_projects': 0,
        'max_scenes_per_project': 100,
        'max_elements_per_scene': 100,
        'storage_limit_gb': 500,
        'display_order': 4,
    },
    {
        'code': 'enterprise',
        'name': 'Корпоративный',
        'price': 0,
        'credits_per_month': 0,
        'max_projects': 0,
        'max_scenes_per_project': 0,
        'max_elements_per_scene': 0,
        'storage_limit_gb': 0,
        'is_active': False,
        'display_order': 5,
    },
]

FEATURES = [
    {
        'code': 'sharing',
        'title': 'Доступ по ссылке',
        'description': 'Делитесь проектами с клиентами и коллегами. Комментарии и ревью прямо в Раскадровке.',
        'icon': 'link',
        'min_plan_code': 'creator',
    },
    {
        'code': 'batch_download',
        'title': 'Массовое скачивание',
        'description': 'Скачайте все элементы проекта или группы одним архивом.',
        'icon': 'download',
        'min_plan_code': 'creator_pro',
    },
    {
        'code': 'ai_prompt',
        'title': 'Усиление промпта',
        'description': 'Нейросеть улучшит ваш промпт для более точной и качественной генерации.',
        'icon': 'sparkles',
        'min_plan_code': 'creator_pro',
    },
    {
        'code': 'analytics_export',
        'title': 'Экспорт аналитики',
        'description': 'Выгружайте данные аналитики в удобном формате для отчётов.',
        'icon': 'file-spreadsheet',
        'min_plan_code': 'team',
    },
]

# plan_code -> list of feature codes
PLAN_FEATURES = {
    'creator': ['sharing'],
    'creator_pro': ['sharing', 'batch_download', 'ai_prompt'],
    'team': ['sharing', 'batch_download', 'ai_prompt', 'analytics_export'],
    'enterprise': ['sharing', 'batch_download', 'ai_prompt', 'analytics_export'],
}


def seed_plans_and_features(apps, schema_editor):
    Plan = apps.get_model('subscriptions', 'Plan')
    Feature = apps.get_model('subscriptions', 'Feature')

    # 1. Create features WITHOUT min_plan (historical models skip custom save)
    feature_objs = {}
    for feat_data in FEATURES:
        data = {k: v for k, v in feat_data.items() if k != 'min_plan_code'}
        feature_objs[feat_data['code']] = Feature.objects.create(**data)

    # 2. Create plans
    plan_objs = {}
    for plan_data in PLANS:
        plan_objs[plan_data['code']] = Plan.objects.create(**plan_data)

    # 3. Assign min_plan to features
    for feat_data in FEATURES:
        feature = feature_objs[feat_data['code']]
        feature.min_plan = plan_objs[feat_data['min_plan_code']]
        feature.save()

    # 4. Set M2M plan->features
    for plan_code, feat_codes in PLAN_FEATURES.items():
        plan = plan_objs[plan_code]
        for feat_code in feat_codes:
            plan.features.add(feature_objs[feat_code])


def reverse_seed(apps, schema_editor):
    Plan = apps.get_model('subscriptions', 'Plan')
    Feature = apps.get_model('subscriptions', 'Feature')
    Feature.objects.all().delete()
    Plan.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_plans_and_features, reverse_seed),
    ]
