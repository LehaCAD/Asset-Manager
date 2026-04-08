"""Management command to seed or re-seed plans and features."""

from django.core.management.base import BaseCommand

from apps.subscriptions.models import Feature, Plan


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
        'is_recommended': False,
        'is_trial_reference': False,
        'is_active': True,
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
        'is_default': False,
        'is_recommended': False,
        'is_trial_reference': False,
        'is_active': True,
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
        'is_default': False,
        'is_recommended': True,
        'is_trial_reference': True,
        'is_active': True,
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
        'is_default': False,
        'is_recommended': False,
        'is_trial_reference': False,
        'is_active': True,
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
        'is_default': False,
        'is_recommended': False,
        'is_trial_reference': False,
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

PLAN_FEATURES = {
    'creator': ['sharing'],
    'creator_pro': ['sharing', 'batch_download', 'ai_prompt'],
    'team': ['sharing', 'batch_download', 'ai_prompt', 'analytics_export'],
    'enterprise': ['sharing', 'batch_download', 'ai_prompt', 'analytics_export'],
}


class Command(BaseCommand):
    help = 'Seed or re-seed subscription plans and features'

    def handle(self, *args, **options):
        # 1. Create/update plans (real model, save() works)
        plan_objs = {}
        for plan_data in PLANS:
            code = plan_data['code']
            defaults = {k: v for k, v in plan_data.items() if k != 'code'}
            plan, created = Plan.objects.update_or_create(
                code=code, defaults=defaults
            )
            plan_objs[code] = plan
            action = 'Created' if created else 'Updated'
            self.stdout.write(f'  {action} plan: {plan.name} ({plan.code})')

        # 2. Create/update features (without min_plan first for safety)
        feature_objs = {}
        for feat_data in FEATURES:
            code = feat_data['code']
            min_plan_code = feat_data['min_plan_code']
            defaults = {
                'title': feat_data['title'],
                'description': feat_data['description'],
                'icon': feat_data['icon'],
                'min_plan': plan_objs[min_plan_code],
            }
            feature, created = Feature.objects.update_or_create(
                code=code, defaults=defaults
            )
            feature_objs[code] = feature
            action = 'Created' if created else 'Updated'
            self.stdout.write(f'  {action} feature: {feature.title} ({feature.code})')

        # 3. Set M2M plan->features
        for plan_code, feat_codes in PLAN_FEATURES.items():
            plan = plan_objs[plan_code]
            features = [feature_objs[fc] for fc in feat_codes]
            plan.features.set(features)
            self.stdout.write(
                f'  Plan {plan.code} -> features: {feat_codes}'
            )

        self.stdout.write(self.style.SUCCESS(
            f'Done: {Plan.objects.count()} plans, {Feature.objects.count()} features'
        ))
