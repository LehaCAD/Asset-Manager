import json
import time
import logging
from decimal import Decimal

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.ai_providers.models import AIModel

from .models import Payment, PaymentWebhookLog
from .serializers import (
    CreditsBalanceSerializer,
    CreditsEstimateRequestSerializer,
    CreditsEstimateResponseSerializer,
    TopUpCreateSerializer,
    TopUpCreateResponseSerializer,
    TopUpStatusSerializer,
)
from .services import CreditsService, PaymentService
from . import yookassa_client

logger = logging.getLogger(__name__)


class CreditsBalanceView(APIView):
    """Получить текущий баланс пользователя."""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        service = CreditsService()
        snapshot = service.get_balance_snapshot(request.user)
        serializer = CreditsBalanceSerializer(snapshot)
        return Response(serializer.data)


class CreditsEstimateView(APIView):
    """Оценить стоимость генерации."""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        serializer = CreditsEstimateRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "Некорректные параметры запроса.", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        ai_model_id = serializer.validated_data["ai_model_id"]
        generation_config = serializer.validated_data.get("generation_config", {})
        
        # Получаем модель
        try:
            ai_model = AIModel.objects.get(pk=ai_model_id, is_active=True)
        except AIModel.DoesNotExist:
            return Response(
                {"error": "Модель не найдена или неактивна."},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Оцениваем стоимость
        service = CreditsService()
        result = service.estimate_generation(
            user=request.user,
            ai_model=ai_model,
            generation_config=generation_config
        )
        
        response_data = {
            "cost": str(result.cost) if result.cost is not None else None,
            "balance": str(result.balance),
            "can_afford": result.can_afford,
            "error": result.error,
        }
        
        response_serializer = CreditsEstimateResponseSerializer(response_data)
        return Response(response_serializer.data)


class TopUpCreateView(APIView):
    """Создать платёж на пополнение баланса."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = TopUpCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "Некорректные параметры запроса.", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        amount = Decimal(serializer.validated_data["amount"])
        payment_method_type = serializer.validated_data["payment_method_type"]

        try:
            payment = PaymentService.create_payment(
                user=request.user,
                amount=amount,
                payment_method_type=payment_method_type,
            )
        except Exception:
            logger.exception("YooKassa create_payment failed for user %s", request.user.id)
            return Response(
                {"error": "Сервис оплаты временно недоступен."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        response_data = {
            "payment_id": payment.yookassa_payment_id,
            "confirmation_url": payment.metadata.get("confirmation_url", ""),
            "amount": str(payment.amount),
            "status": payment.status,
        }
        response_serializer = TopUpCreateResponseSerializer(response_data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


@method_decorator(csrf_exempt, name="dispatch")
class TopUpWebhookView(APIView):
    """Webhook от YooKassa — уведомление о статусе платежа."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        start = time.monotonic()
        client_ip = self._get_client_ip(request)
        raw_body = request.body.decode("utf-8", errors="replace")

        # Parse body
        try:
            body = json.loads(raw_body) if isinstance(raw_body, str) else request.data
        except (json.JSONDecodeError, Exception):
            body = request.data

        event_type = body.get("event", "unknown") if isinstance(body, dict) else "unknown"
        payment_obj = body.get("object", {}) if isinstance(body, dict) else {}
        yookassa_payment_id = payment_obj.get("id", "")

        # Log BEFORE any processing
        log_entry = PaymentWebhookLog.objects.create(
            yookassa_payment_id=yookassa_payment_id or "unknown",
            event_type=event_type,
            ip_address=client_ip,
            raw_body=raw_body[:10000],
            is_trusted_ip=yookassa_client.is_trusted_ip(client_ip),
        )

        # Check IP trust
        if not log_entry.is_trusted_ip:
            logger.warning("Untrusted webhook IP: %s", client_ip)
            log_entry.processing_result = "rejected_untrusted_ip"
            log_entry.processing_time_ms = int((time.monotonic() - start) * 1000)
            log_entry.save(update_fields=["processing_result", "processing_time_ms"])
            return Response(status=status.HTTP_200_OK)

        # Find payment
        try:
            payment = Payment.objects.get(yookassa_payment_id=yookassa_payment_id)
        except Payment.DoesNotExist:
            logger.warning("Webhook for unknown payment: %s", yookassa_payment_id)
            log_entry.processing_result = "payment_not_found"
            log_entry.processing_time_ms = int((time.monotonic() - start) * 1000)
            log_entry.save(update_fields=["processing_result", "processing_time_ms"])
            return Response(status=status.HTTP_200_OK)

        # Check duplicate
        if payment.status == Payment.STATUS_SUCCEEDED:
            log_entry.processing_result = "already_succeeded"
            log_entry.processing_time_ms = int((time.monotonic() - start) * 1000)
            log_entry.save(update_fields=["processing_result", "processing_time_ms"])
            return Response(status=status.HTTP_200_OK)

        # Process events
        try:
            if event_type == "payment.succeeded":
                credited = PaymentService.process_succeeded(payment.id)
                log_entry.processing_result = "credited" if credited else "already_processed"
                if credited:
                    self._notify_balance_changed(payment.user_id)
            elif event_type == "payment.canceled":
                reason = ""
                cancel_details = payment_obj.get("cancellation_details", {})
                if cancel_details:
                    reason = cancel_details.get("reason", "")
                PaymentService.process_canceled(payment.id, reason=reason)
                log_entry.processing_result = "canceled"
            else:
                log_entry.processing_result = f"ignored_event_{event_type}"
        except Exception:
            logger.exception("Error processing webhook for payment %s", yookassa_payment_id)
            log_entry.processing_result = "processing_error"

        log_entry.processing_time_ms = int((time.monotonic() - start) * 1000)
        log_entry.save(update_fields=["processing_result", "processing_time_ms"])
        return Response(status=status.HTTP_200_OK)

    @staticmethod
    def _get_client_ip(request):
        xff = request.META.get("HTTP_X_FORWARDED_FOR")
        if xff:
            return xff.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "0.0.0.0")

    @staticmethod
    def _notify_balance_changed(user_id):
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"user_{user_id}",
                {"type": "credits_balance_changed"},
            )
        except Exception:
            logger.warning("Could not send WebSocket notification for user %s", user_id)


class TopUpStatusView(APIView):
    """Получить статус платежа пользователя."""
    permission_classes = [IsAuthenticated]

    def get(self, request, yookassa_payment_id):
        try:
            payment = Payment.objects.get(
                yookassa_payment_id=yookassa_payment_id,
                user=request.user,
            )
        except Payment.DoesNotExist:
            return Response(
                {"error": "Платёж не найден."},
                status=status.HTTP_404_NOT_FOUND,
            )

        response_data = {
            "status": payment.status,
            "amount": str(payment.amount),
        }

        if payment.status == Payment.STATUS_SUCCEEDED:
            service = CreditsService()
            snapshot = service.get_balance_snapshot(request.user)
            response_data["balance"] = str(snapshot["balance"])

        response_serializer = TopUpStatusSerializer(response_data)
        return Response(response_serializer.data)
