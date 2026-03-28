"""
Cabinet views — thin HTTP dispatch to services.
"""
from datetime import date

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from . import services


class CabinetPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def analytics_view(request):
    """GET /api/cabinet/analytics/?period=30d&ai_model_id=&element_type="""
    result = services.get_analytics(
        user=request.user,
        period=request.query_params.get('period', '30d'),
        ai_model_id=_int_or_none(request.query_params.get('ai_model_id')),
        element_type=request.query_params.get('element_type') or None,
        date_from=_date_or_none(request.query_params.get('date_from')),
        date_to=_date_or_none(request.query_params.get('date_to')),
        project_id=_int_or_none(request.query_params.get('project_id')),
    )
    return Response({
        'period': {
            'start': str(result.period_start),
            'end': str(result.period_end),
        },
        'summary': {
            'balance': str(result.balance),
            'total_spent': str(result.total_spent),
            'total_generations': result.total_generations,
            'success_rate': result.success_rate,
            'storage_used_bytes': result.storage_used_bytes,
            'storage_limit_bytes': result.storage_limit_bytes,
        },
        'spending_by_day': [
            {'date': d.date, 'amount': str(d.amount), 'count': d.count}
            for d in result.spending_by_day
        ],
        'spending_by_model': [
            {
                'model_id': m.model_id,
                'model_name': m.model_name,
                'amount': str(m.amount),
                'count': m.count,
            }
            for m in result.spending_by_model
        ],
        'spending_by_project': [
            {
                'project_id': p.project_id,
                'project_name': p.project_name,
                'amount': str(p.amount),
                'storage_bytes': p.storage_bytes,
            }
            for p in result.spending_by_project
        ],
        'generation_stats': {
            'total': result.generation_stats.total,
            'completed': result.generation_stats.completed,
            'failed': result.generation_stats.failed,
            'success_rate': result.generation_stats.success_rate,
            'avg_cost': str(result.generation_stats.avg_cost) if result.generation_stats.avg_cost else None,
            'top_model': result.generation_stats.top_model,
        },
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def history_view(request):
    """GET /api/cabinet/history/?page=1&status=&ai_model_id=&source_type=&element_type=&project_id=&date_from=&date_to="""
    qs = services.get_history_queryset(
        user=request.user,
        status=request.query_params.get('status') or None,
        ai_model_id=_int_or_none(request.query_params.get('ai_model_id')),
        source_type=request.query_params.get('source_type') or None,
        element_type=request.query_params.get('element_type') or None,
        project_id=_int_or_none(request.query_params.get('project_id')),
        date_from=_date_or_none(request.query_params.get('date_from')),
        date_to=_date_or_none(request.query_params.get('date_to')),
    )

    paginator = CabinetPagination()
    page = paginator.paginate_queryset(qs, request)
    data = [services.serialize_history_entry(el) for el in page]
    return paginator.get_paginated_response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def transactions_view(request):
    """GET /api/cabinet/transactions/?page=1&reason=&date_from=&date_to="""
    qs = services.get_transactions_queryset(
        user=request.user,
        reason=request.query_params.get('reason') or None,
        date_from=_date_or_none(request.query_params.get('date_from')),
        date_to=_date_or_none(request.query_params.get('date_to')),
    )

    paginator = CabinetPagination()
    page = paginator.paginate_queryset(qs, request)
    data = [services.serialize_transaction(tx) for tx in page]
    return paginator.get_paginated_response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def storage_view(request):
    """GET /api/cabinet/storage/"""
    result = services.get_storage(request.user)
    return Response({
        'storage_used_bytes': result.storage_used_bytes,
        'storage_limit_bytes': result.storage_limit_bytes,
        'by_project': [
            {
                'project_id': p.project_id,
                'project_name': p.project_name,
                'elements_count': p.elements_count,
                'storage_bytes': p.storage_bytes,
            }
            for p in result.by_project
        ],
    })


def _int_or_none(val: str | None) -> int | None:
    if not val:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _date_or_none(val: str | None) -> date | None:
    if not val:
        return None
    try:
        return date.fromisoformat(val)
    except (ValueError, TypeError):
        return None
