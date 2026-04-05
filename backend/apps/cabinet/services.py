"""
Cabinet services — public interface (TIER 3, read-only).

Aggregates data from credits, elements, projects, users for dashboard views.
"""
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import (
    Sum, Count, Avg, Q, F, Value, CharField,
    Func, DecimalField as DjDecimalField,
)
from django.db.models.functions import (
    TruncDate, TruncWeek, TruncMonth, Abs, Coalesce,
)
from django.utils import timezone

from apps.credits.models import CreditsTransaction
from apps.elements.models import Element
from apps.projects.models import Project
from apps.users.models import User


# ── Dataclasses ──────────────────────────────────────────────

@dataclass(frozen=True)
class DaySpending:
    date: str
    amount: Decimal
    count: int


@dataclass(frozen=True)
class ModelSpending:
    model_id: int | None
    model_name: str
    amount: Decimal
    count: int


@dataclass(frozen=True)
class ProjectSpending:
    project_id: int
    project_name: str
    amount: Decimal
    storage_bytes: int


@dataclass(frozen=True)
class GenerationStats:
    total: int
    completed: int
    failed: int
    success_rate: float
    avg_cost: Decimal | None
    top_model: str | None


@dataclass(frozen=True)
class AnalyticsResult:
    period_start: date
    period_end: date
    balance: Decimal
    total_spent: Decimal
    total_generations: int
    success_rate: float
    storage_used_bytes: int
    storage_limit_bytes: int
    spending_by_day: list[DaySpending]
    spending_by_model: list[ModelSpending]
    spending_by_project: list[ProjectSpending]
    generation_stats: GenerationStats


@dataclass(frozen=True)
class ProjectStorage:
    project_id: int
    project_name: str
    elements_count: int
    storage_bytes: int


@dataclass(frozen=True)
class StorageResult:
    storage_used_bytes: int
    storage_limit_bytes: int
    by_project: list[ProjectStorage]


@dataclass(frozen=True)
class HistoryEntry:
    id: int
    created_at: str
    element_type: str
    source_type: str
    status: str
    status_display: str
    error_message: str
    ai_model_name: str | None
    prompt_text: str
    generation_cost: Decimal | None
    file_size: int | None
    project_id: int | None
    project_name: str | None
    thumbnail_url: str


@dataclass(frozen=True)
class TransactionEntry:
    id: int
    created_at: str
    reason: str
    reason_display: str
    amount: Decimal
    balance_after: Decimal
    ai_model_name: str | None
    element_id: int | None


# ── Helpers ──────────────────────────────────────────────────

def _parse_period(period_str: str) -> tuple[date, date]:
    """Parse period string like '7d', '30d', '90d', 'all' into (start, end) dates."""
    today = timezone.now().date()
    if period_str == 'all':
        return date(2020, 1, 1), today
    try:
        days = int(period_str.rstrip('d'))
    except (ValueError, AttributeError):
        days = 30
    return today - timedelta(days=days), today


def _get_trunc_fn(period_start: date, period_end: date):
    """Pick TruncDate/TruncWeek/TruncMonth based on period length."""
    delta = (period_end - period_start).days
    if delta <= 31:
        return TruncDate('created_at')
    elif delta <= 90:
        return TruncWeek('created_at')
    else:
        return TruncMonth('created_at')


REASON_DISPLAY = dict(CreditsTransaction.REASON_CHOICES)

STATUS_DISPLAY = {
    'PENDING': 'Ожидание',
    'PROCESSING': 'Обработка',
    'COMPLETED': 'Готово',
    'FAILED': 'Ошибка',
    'UPLOADING': 'Загрузка',
}


# ── Public API ───────────────────────────────────────────────

def get_analytics(
    user: User,
    period: str = '30d',
    ai_model_id: int | None = None,
    element_type: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    project_id: int | None = None,
) -> AnalyticsResult:
    """Aggregate analytics for user's cabinet dashboard."""
    if date_from and date_to:
        period_start, period_end = date_from, date_to
    else:
        period_start, period_end = _parse_period(period)
    period_end_dt = timezone.make_aware(
        timezone.datetime.combine(period_end, timezone.datetime.max.time())
    )
    period_start_dt = timezone.make_aware(
        timezone.datetime.combine(period_start, timezone.datetime.min.time())
    )

    # Base querysets
    tx_qs = CreditsTransaction.objects.filter(
        user=user,
        reason=CreditsTransaction.REASON_GENERATION_DEBIT,
        created_at__gte=period_start_dt,
        created_at__lte=period_end_dt,
    )
    el_qs = Element.objects.filter(
        project__user=user,
        source_type=Element.SOURCE_GENERATED,
        created_at__gte=period_start_dt,
        created_at__lte=period_end_dt,
    )

    # Apply filters
    if ai_model_id:
        tx_qs = tx_qs.filter(element__ai_model_id=ai_model_id)
        el_qs = el_qs.filter(ai_model_id=ai_model_id)
    if element_type:
        tx_qs = tx_qs.filter(element__element_type=element_type)
        el_qs = el_qs.filter(element_type=element_type)
    if project_id:
        tx_qs = tx_qs.filter(element__project_id=project_id)
        el_qs = el_qs.filter(project_id=project_id)

    # Total spent
    total_spent = tx_qs.aggregate(
        total=Coalesce(Sum(Abs('amount')), Decimal('0'))
    )['total']

    # Generation counts
    total_gen = el_qs.count()
    completed = el_qs.filter(status=Element.STATUS_COMPLETED).count()
    failed = el_qs.filter(status=Element.STATUS_FAILED).count()
    success_rate = round((completed / total_gen * 100), 1) if total_gen > 0 else 0.0

    # Avg cost
    avg_agg = tx_qs.aggregate(avg=Avg(Abs('amount')))
    avg_cost = avg_agg['avg']
    if avg_cost is not None:
        avg_cost = Decimal(str(round(avg_cost, 2)))

    # Top model
    top_model_row = (
        el_qs.filter(ai_model__isnull=False)
        .values('ai_model__name')
        .annotate(cnt=Count('id'))
        .order_by('-cnt')
        .first()
    )
    top_model = top_model_row['ai_model__name'] if top_model_row else None

    # Spending by day/week/month (bar chart data)
    # Based on element creation dates (not transactions) so older generations
    # without credit records still appear on the correct day.
    trunc_fn = _get_trunc_fn(period_start, period_end)
    spending_by_day_qs = (
        el_qs.annotate(bucket=trunc_fn)
        .values('bucket')
        .annotate(
            amount=Coalesce(
                Sum(
                    Abs('credits_transactions__amount'),
                    filter=Q(
                        credits_transactions__reason=CreditsTransaction.REASON_GENERATION_DEBIT
                    ),
                ),
                Decimal('0'),
                output_field=DjDecimalField(),
            ),
            count=Count('id', distinct=True),
        )
        .order_by('bucket')
    )
    spending_by_day = [
        DaySpending(
            date=str(row['bucket'].date() if hasattr(row['bucket'], 'date') else row['bucket']),
            amount=row['amount'] or Decimal('0'),
            count=row['count'],
        )
        for row in spending_by_day_qs
    ]

    # Spending by model
    spending_by_model_qs = (
        tx_qs.filter(element__ai_model__isnull=False)
        .values('element__ai_model_id', 'element__ai_model__name')
        .annotate(amount=Sum(Abs('amount')), count=Count('id'))
        .order_by('-amount')
    )
    spending_by_model = [
        ModelSpending(
            model_id=row['element__ai_model_id'],
            model_name=row['element__ai_model__name'],
            amount=row['amount'] or Decimal('0'),
            count=row['count'],
        )
        for row in spending_by_model_qs
    ]

    # Spending by project
    spending_by_project_qs = (
        tx_qs.filter(element__project__isnull=False)
        .values('element__project_id', 'element__project__name')
        .annotate(
            amount=Sum(Abs('amount')),
            storage=Coalesce(
                Sum('element__file_size', filter=Q(element__file_size__isnull=False)),
                0,
            ),
        )
        .order_by('-amount')
    )
    spending_by_project = [
        ProjectSpending(
            project_id=row['element__project_id'],
            project_name=row['element__project__name'],
            amount=row['amount'] or Decimal('0'),
            storage_bytes=row['storage'],
        )
        for row in spending_by_project_qs
    ]

    # Storage
    quota = getattr(user, 'quota', None)
    storage_used = Element.objects.filter(
        project__user=user, file_size__isnull=False
    ).aggregate(total=Coalesce(Sum('file_size'), 0))['total']
    storage_limit = quota.storage_limit_bytes if quota else 300 * 1024 * 1024

    return AnalyticsResult(
        period_start=period_start,
        period_end=period_end,
        balance=user.balance,
        total_spent=total_spent,
        total_generations=total_gen,
        success_rate=success_rate,
        storage_used_bytes=storage_used,
        storage_limit_bytes=storage_limit,
        spending_by_day=spending_by_day,
        spending_by_model=spending_by_model,
        spending_by_project=spending_by_project,
        generation_stats=GenerationStats(
            total=total_gen,
            completed=completed,
            failed=failed,
            success_rate=success_rate,
            avg_cost=avg_cost,
            top_model=top_model,
        ),
    )


def get_storage(user: User) -> StorageResult:
    """Get storage usage breakdown by project."""
    quota = getattr(user, 'quota', None)
    storage_limit = quota.storage_limit_bytes if quota else 300 * 1024 * 1024

    storage_used = Element.objects.filter(
        project__user=user, file_size__isnull=False
    ).aggregate(total=Coalesce(Sum('file_size'), 0))['total']

    by_project_qs = (
        Project.objects.filter(user=user)
        .annotate(
            el_count=Count('elements', filter=Q(elements__file_size__isnull=False)),
            storage=Coalesce(Sum('elements__file_size'), 0),
        )
        .filter(el_count__gt=0)
        .order_by('-storage')
    )
    by_project = [
        ProjectStorage(
            project_id=p.id,
            project_name=p.name,
            elements_count=p.el_count,
            storage_bytes=p.storage,
        )
        for p in by_project_qs
    ]

    return StorageResult(
        storage_used_bytes=storage_used,
        storage_limit_bytes=storage_limit,
        by_project=by_project,
    )


def get_history_queryset(
    user: User,
    status: str | None = None,
    ai_model_id: int | None = None,
    source_type: str | None = None,
    element_type: str | None = None,
    project_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    """Return annotated Element queryset for generation history."""
    qs = (
        Element.objects.filter(project__user=user)
        .select_related('ai_model', 'project')
        .annotate(
            _generation_cost=Coalesce(
                Sum(
                    Abs('credits_transactions__amount'),
                    filter=Q(
                        credits_transactions__reason=CreditsTransaction.REASON_GENERATION_DEBIT
                    ),
                ),
                Decimal('0'),
                output_field=DjDecimalField(),
            )
        )
        .order_by('-created_at')
    )

    if status:
        qs = qs.filter(status=status)
    if ai_model_id:
        qs = qs.filter(ai_model_id=ai_model_id)
    if source_type:
        qs = qs.filter(source_type=source_type)
    if element_type:
        qs = qs.filter(element_type=element_type)
    if project_id:
        qs = qs.filter(project_id=project_id)
    if date_from:
        qs = qs.filter(created_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(created_at__date__lte=date_to)

    return qs


def serialize_history_entry(el: Element) -> dict:
    """Convert Element to history dict (called after annotation)."""
    return {
        'id': el.id,
        'created_at': el.created_at.isoformat(),
        'element_type': el.element_type,
        'source_type': el.source_type,
        'status': el.status,
        'status_display': STATUS_DISPLAY.get(el.status, el.status),
        'error_message': el.error_message or '',
        'ai_model_name': el.ai_model.name if el.ai_model else None,
        'prompt_text': (el.prompt_text or '')[:500],
        'generation_cost': str(el._generation_cost) if el._generation_cost else None,
        'file_size': el.file_size,
        'project_id': el.project_id,
        'project_name': el.project.name if el.project else None,
        'thumbnail_url': el.thumbnail_url or '',
        'file_url': el.file_url or '',
    }


def get_transactions_queryset(
    user: User,
    reason: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    """Return CreditsTransaction queryset for balance history."""
    qs = CreditsTransaction.objects.filter(user=user).order_by('-created_at')

    if reason:
        qs = qs.filter(reason=reason)
    if date_from:
        qs = qs.filter(created_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(created_at__date__lte=date_to)

    return qs


def serialize_transaction(tx: CreditsTransaction) -> dict:
    """Convert CreditsTransaction to response dict."""
    ai_model_name = None
    if tx.metadata and isinstance(tx.metadata, dict):
        ai_model_name = tx.metadata.get('ai_model_name')
    return {
        'id': tx.id,
        'created_at': tx.created_at.isoformat(),
        'reason': tx.reason,
        'reason_display': REASON_DISPLAY.get(tx.reason, tx.reason),
        'amount': str(tx.amount),
        'balance_after': str(tx.balance_after),
        'ai_model_name': ai_model_name,
        'element_id': tx.element_id,
    }
