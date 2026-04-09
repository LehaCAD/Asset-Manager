from datetime import timedelta

from django.contrib import admin
from django.db.models import Count
from django.utils import timezone
from django.utils.html import format_html, mark_safe

from .models import Feature, Plan, Subscription


# ─── Feature ────────────────────────────────────────────────────────────────

@admin.register(Feature)
class FeatureAdmin(admin.ModelAdmin):
    list_display = ('code', 'title', 'icon_display', 'min_plan_display', 'plans_display')
    search_fields = ('code', 'title')
    ordering = ('code',)

    fieldsets = (
        (
            'Контент модалки',
            {
                'fields': ('code', 'title', 'description', 'icon'),
                'description': 'Этот текст видит пользователь при клике на заблокированную фичу.',
            },
        ),
        (
            'Привязка к тарифам',
            {
                'fields': ('min_plan',),
                'description': 'Минимальный тариф для лейбла «Доступно начиная с...»',
            },
        ),
    )

    def get_readonly_fields(self, request, obj=None):
        if obj:
            return ('code',)
        return ()

    def icon_display(self, obj):
        if obj.icon:
            return format_html(
                '<code class="sub-code-badge">{}</code>',
                obj.icon,
            )
        return format_html('<span class="sub-text-muted">—</span>')

    icon_display.short_description = 'Иконка'

    def min_plan_display(self, obj):
        if obj.min_plan:
            return format_html(
                '<span class="sub-badge sub-badge--plan">{}</span>',
                obj.min_plan.name,
            )
        return format_html('<span class="sub-text-muted">—</span>')

    min_plan_display.short_description = 'Мин. тариф'

    def plans_display(self, obj):
        plans = obj.plans.filter(is_active=True).order_by('display_order')
        if not plans:
            return format_html('<span class="sub-text-muted">нет</span>')
        badges = [
            format_html(
                '<span class="sub-badge sub-badge--plan-sm">{}</span>',
                plan.name,
            )
            for plan in plans
        ]
        return mark_safe(' '.join(badges))

    plans_display.short_description = 'Включена в тарифы'

    class Media:
        css = {
            'all': ('admin/subscriptions/subscriptions_admin.css',),
        }


# ─── Plan ───────────────────────────────────────────────────────────────────

@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = (
        'display_order',
        'name_display',
        'price_display',
        'credits_per_month',
        'projects_display',
        'storage_display',
        'features_display',
        'status_display',
        'user_count',
    )
    list_display_links = ('name_display',)
    list_filter = ('is_active', 'is_default', 'is_recommended')
    search_fields = ('name', 'code')
    list_editable = ('display_order',)
    ordering = ('display_order',)
    filter_horizontal = ('features',)

    fieldsets = (
        (
            'Основное',
            {
                'fields': ('code', 'name', 'price', 'credits_per_month'),
                'description': 'Базовые параметры тарифа.',
            },
        ),
        (
            'Лимиты',
            {
                'fields': (
                    'max_projects',
                    'max_scenes_per_project',
                    'max_elements_per_scene',
                    'storage_limit_gb',
                ),
                'description': '0 = безлимит. Эти значения определяют квоты пользователей.',
            },
        ),
        (
            'Фичи',
            {
                'fields': ('features',),
                'description': (
                    'Фичи, доступные на этом тарифе. '
                    'Описания редактируются в разделе «Фичи».'
                ),
            },
        ),
        (
            'Отображение',
            {
                'fields': (
                    'display_order',
                    'is_active',
                    'is_recommended',
                    'is_default',
                    'is_trial_reference',
                ),
                'description': 'Как тариф отображается на фронтенде.',
            },
        ),
    )

    def get_readonly_fields(self, request, obj=None):
        if obj:
            return ('code',)
        return ()

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.annotate(_user_count=Count('subscriptions'))

    # ── Display methods ──

    def name_display(self, obj):
        badges = []
        if obj.is_default:
            badges.append('<span class="sub-badge sub-badge--default">по умолч.</span>')
        if obj.is_recommended:
            badges.append('<span class="sub-badge sub-badge--recommended">рекоменд.</span>')
        if obj.is_trial_reference:
            badges.append('<span class="sub-badge sub-badge--trial">триал</span>')
        badges_html = mark_safe(' '.join(badges)) if badges else ''
        return format_html('<strong>{}</strong> {}', obj.name, badges_html)

    name_display.short_description = 'Название'
    name_display.admin_order_field = 'name'

    def price_display(self, obj):
        if obj.price == 0:
            return format_html(
                '<span class="sub-text-muted">Бесплатно</span>'
            )
        return format_html(
            '<strong>{}\u2009₽</strong>/мес',
            f'{obj.price:,.0f}'.replace(',', '\u2009'),
        )

    price_display.short_description = 'Цена'
    price_display.admin_order_field = 'price'

    def projects_display(self, obj):
        if obj.max_projects == 0:
            return format_html('<span class="sub-text-accent">∞</span>')
        return obj.max_projects

    projects_display.short_description = 'Проекты'
    projects_display.admin_order_field = 'max_projects'

    def storage_display(self, obj):
        if obj.storage_limit_gb == 0:
            return format_html('<span class="sub-text-accent">∞</span>')
        return format_html('{}\u2009ГБ', obj.storage_limit_gb)

    storage_display.short_description = 'Хранилище'
    storage_display.admin_order_field = 'storage_limit_gb'

    def features_display(self, obj):
        features = obj.features.all()
        if not features:
            return format_html('<span class="sub-text-muted">—</span>')
        badges = [
            format_html(
                '<span class="sub-badge sub-badge--feature">{}</span>',
                f.code,
            )
            for f in features[:5]
        ]
        extra = features.count() - 5
        if extra > 0:
            badges.append(format_html(
                '<span class="sub-badge sub-badge--feature-more">+{}</span>',
                extra,
            ))
        return mark_safe(' '.join(badges))

    features_display.short_description = 'Фичи'

    def status_display(self, obj):
        if obj.is_active:
            return format_html(
                '<span class="sub-status sub-status--active">Активен</span>'
            )
        return format_html(
            '<span class="sub-status sub-status--hidden">Скрыт</span>'
        )

    status_display.short_description = 'Статус'
    status_display.admin_order_field = 'is_active'

    def user_count(self, obj):
        count = obj._user_count
        if count == 0:
            return format_html('<span class="sub-text-muted">0</span>')
        return format_html('<strong>{}</strong>', count)

    user_count.short_description = 'Подписчики'
    user_count.admin_order_field = '_user_count'

    class Media:
        css = {
            'all': ('admin/subscriptions/subscriptions_admin.css',),
        }


# ─── Subscription ───────────────────────────────────────────────────────────

@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        'user_display',
        'plan_display',
        'status_display',
        'started_at',
        'expires_at_display',
    )
    list_filter = ('status', 'plan')
    search_fields = ('user__email', 'user__username')
    ordering = ('-created_at',)
    raw_id_fields = ('user',)

    fieldsets = (
        (
            'Подписка',
            {
                'fields': ('user', 'plan', 'status', 'started_at', 'expires_at', 'cancelled_at'),
                'description': (
                    'При ручном назначении тарифа Кадры НЕ начисляются. '
                    'Для пополнения баланса используйте раздел «Пользователи».'
                ),
            },
        ),
    )

    actions = [
        'assign_creator_pro_30d',
        'extend_30d',
        'reset_to_free',
    ]

    def get_readonly_fields(self, request, obj=None):
        if obj:
            return ('user',)
        return ()

    # ── Display methods ──

    def user_display(self, obj):
        return format_html(
            '<strong>{}</strong> <span class="sub-text-muted">{}</span>',
            obj.user.email or obj.user.username,
            obj.user.username if obj.user.email else '',
        )

    user_display.short_description = 'Пользователь'
    user_display.admin_order_field = 'user__email'

    def plan_display(self, obj):
        return format_html(
            '<span class="sub-badge sub-badge--plan">{}</span>',
            obj.plan.name,
        )

    plan_display.short_description = 'Тариф'
    plan_display.admin_order_field = 'plan__name'

    def status_display(self, obj):
        colors = {
            'active': 'active',
            'trial': 'trial',
            'expired': 'expired',
            'cancelled': 'cancelled',
        }
        css_class = colors.get(obj.status, 'expired')
        return format_html(
            '<span class="sub-status sub-status--{}">{}</span>',
            css_class,
            obj.get_status_display(),
        )

    status_display.short_description = 'Статус'
    status_display.admin_order_field = 'status'

    def expires_at_display(self, obj):
        if not obj.expires_at:
            return format_html('<span class="sub-text-muted">—</span>')

        now = timezone.now()
        days_left = (obj.expires_at - now).days

        formatted = obj.expires_at.strftime('%d.%m.%Y %H:%M')

        if days_left < 0:
            return format_html(
                '<span class="sub-expires sub-expires--past">'
                '{} <small>(истекла)</small>'
                '</span>',
                formatted,
            )
        if days_left <= 3:
            return format_html(
                '<span class="sub-expires sub-expires--soon">'
                '{} <small>(истекает через {} д.)</small>'
                '</span>',
                formatted,
                days_left,
            )
        return formatted

    expires_at_display.short_description = 'Истекает'
    expires_at_display.admin_order_field = 'expires_at'

    # ── Quick actions ──

    @admin.action(description='Назначить Создатель Pro на 30 дней')
    def assign_creator_pro_30d(self, request, queryset):
        try:
            creator_pro = Plan.objects.get(code='creator_pro')
        except Plan.DoesNotExist:
            self.message_user(
                request,
                'Тариф creator_pro не найден. Создайте его в разделе «Тарифные планы».',
                level='error',
            )
            return

        now = timezone.now()
        count = queryset.update(
            plan=creator_pro,
            status='active',
            started_at=now,
            expires_at=now + timedelta(days=30),
            cancelled_at=None,
        )
        self.message_user(
            request,
            f'Назначен тариф «{creator_pro.name}» на 30 дней для {count} подписок.',
        )

    @admin.action(description='Продлить на 30 дней')
    def extend_30d(self, request, queryset):
        now = timezone.now()
        count = 0
        for sub in queryset:
            base = sub.expires_at if sub.expires_at and sub.expires_at > now else now
            sub.expires_at = base + timedelta(days=30)
            if sub.status in ('expired', 'cancelled'):
                sub.status = 'active'
                sub.cancelled_at = None
            sub.save(update_fields=['expires_at', 'status', 'cancelled_at'])
            count += 1
        self.message_user(
            request,
            f'Продлено на 30 дней: {count} подписок.',
        )

    @admin.action(description='Сбросить на Старт')
    def reset_to_free(self, request, queryset):
        try:
            free_plan = Plan.objects.get(is_default=True)
        except Plan.DoesNotExist:
            self.message_user(
                request,
                'Дефолтный (бесплатный) тариф не найден. Отметьте один план как «По умолчанию».',
                level='error',
            )
            return

        now = timezone.now()
        count = queryset.update(
            plan=free_plan,
            status='active',
            started_at=now,
            expires_at=now + timedelta(days=36500),  # ~100 years
            cancelled_at=None,
        )
        self.message_user(
            request,
            f'Сброшено на тариф «{free_plan.name}»: {count} подписок.',
        )

    class Media:
        css = {
            'all': ('admin/subscriptions/subscriptions_admin.css',),
        }
