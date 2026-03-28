# Production Round 3: Billing — Приём Платежей

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Пользователь может купить пакет Кадров за рубли через ЮKassa. Полный flow: выбор пакета → оплата → автоматическое начисление Кадров.

**Срок:** ~7-10 дней
**Зависимости:** Round 1 (HTTPS), Round 2 (email, ToS), ИП/ООО + подключение ЮKassa (оффлайн)
**Блокирует:** Полноценный запуск с монетизацией

---

## Параллельные оффлайн-задачи (начать ДО разработки)

| Задача | Срок | Что делать |
|--------|------|------------|
| Регистрация ИП | 3-7 дней | Через Госуслуги. УСН 6%. ОКВЭД: 62.01, 63.11 |
| Открытие р/с | 1-3 дня | Любой банк (Тинькофф, Сбер, Точка) |
| Подключение ЮKassa | 3-7 дней | yookassa.ru → Подключить → Документы ИП → Ждать модерацию |
| Подключение онлайн-кассы | 2-3 дня | АТОЛ Онлайн через ЮKassa (интеграция в dashboard) |
| Получить shopId + secretKey | После модерации | ЮKassa выдаёт credentials для API |

> **КРИТИЧНО:** Начать регистрацию ИП СРАЗУ. Это bottleneck всего процесса (1-2 недели). Разработку вести параллельно.

---

## Архитектура

```
Пользователь                    Раскадровка                      ЮKassa
     │                              │                              │
     │  1. Выбрал пакет 500 Кадров  │                              │
     │  ─────────────────────────►  │                              │
     │                              │  2. POST /payments            │
     │                              │  ─────────────────────────►  │
     │                              │  ← confirmation_url           │
     │  3. Redirect на оплату       │                              │
     │  ─────────────────────────────────────────────────────────► │
     │                              │                              │
     │  4. Оплатил                  │                              │
     │  ◄──────────────────────────────────────────────────────── │
     │                              │  5. Webhook: payment.succeeded│
     │                              │  ◄───────────────────────── │
     │                              │  6. topup(user, 500 Кадров)  │
     │                              │  7. WebSocket → frontend      │
     │  8. Баланс обновился         │                              │
     │  ◄───────────────────────── │                              │
```

---

## File Map

| File | Action | Задача |
|------|--------|--------|
| `backend/apps/billing/__init__.py` | Create | Новое приложение |
| `backend/apps/billing/models.py` | Create | Payment, CreditPack модели |
| `backend/apps/billing/services.py` | Create | YooKassa integration |
| `backend/apps/billing/views.py` | Create | Create payment, webhook |
| `backend/apps/billing/serializers.py` | Create | Сериализаторы |
| `backend/apps/billing/urls.py` | Create | URL patterns |
| `backend/apps/billing/admin.py` | Create | Django Admin для Payment |
| `backend/apps/billing/migrations/` | Create | Миграции |
| `backend/config/settings.py` | Modify | INSTALLED_APPS, YooKassa config |
| `backend/config/urls.py` | Modify | Подключить billing URLs |
| `backend/requirements.txt` | Modify | yookassa SDK |
| `frontend/app/(workspace)/billing/page.tsx` | Create | Страница покупки Кадров |
| `frontend/lib/api/billing.ts` | Create | API клиент |
| `frontend/lib/types/index.ts` | Modify | Типы для billing |

---

## Task 1: Backend — Модели

**Files:** `backend/apps/billing/models.py`

- [ ] Создать app: `backend/apps/billing/`
- [ ] Определить модели:

```python
import uuid
from django.db import models
from django.conf import settings
from decimal import Decimal


class CreditPack(models.Model):
    """Пакет Кадров для покупки."""
    name = models.CharField(max_length=100)  # "Стартер", "Базовый", etc.
    credits_amount = models.IntegerField()    # 100, 500, 1000, 5000
    price_rub = models.DecimalField(max_digits=10, decimal_places=2)  # 290.00
    bonus_credits = models.IntegerField(default=0)  # Бонусные кадры
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ['sort_order']

    def __str__(self):
        return f"{self.name} — {self.credits_amount} Кадров за {self.price_rub}₽"

    @property
    def total_credits(self):
        return self.credits_amount + self.bonus_credits

    @property
    def price_per_credit(self):
        return self.price_rub / self.credits_amount if self.credits_amount else Decimal(0)


class Payment(models.Model):
    """Платёж через ЮKassa."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Ожидает оплаты'
        SUCCEEDED = 'succeeded', 'Оплачен'
        CANCELED = 'canceled', 'Отменён'
        REFUNDED = 'refunded', 'Возвращён'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='payments')
    credit_pack = models.ForeignKey(CreditPack, on_delete=models.PROTECT)

    # ЮKassa данные
    yookassa_payment_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    confirmation_url = models.URLField(blank=True)

    # Суммы
    amount_rub = models.DecimalField(max_digits=10, decimal_places=2)
    credits_to_add = models.IntegerField()  # total_credits на момент покупки

    # Статус
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    credits_added = models.BooleanField(default=False)  # Идемпотентность: кредиты уже начислены?

    # Мета
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['yookassa_payment_id']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"Payment {self.id} — {self.user.username} — {self.amount_rub}₽ — {self.status}"
```

- [ ] Добавить `'apps.billing'` в `INSTALLED_APPS` в settings.py
- [ ] Создать миграцию

---

## Task 2: Backend — ЮKassa Integration

**Files:** `backend/requirements.txt`, `backend/config/settings.py`, `backend/apps/billing/services.py`

- [ ] Добавить в `requirements.txt`:
```
yookassa==3.4.0
```

- [ ] Добавить в `settings.py`:
```python
# === Billing (YooKassa) ===
YOOKASSA_SHOP_ID = os.getenv('YOOKASSA_SHOP_ID', '')
YOOKASSA_SECRET_KEY = os.getenv('YOOKASSA_SECRET_KEY', '')
YOOKASSA_RETURN_URL = os.getenv('YOOKASSA_RETURN_URL', 'http://localhost:3000/billing')
```

- [ ] Создать `backend/apps/billing/services.py`:
```python
from yookassa import Configuration, Payment as YooPayment
from django.conf import settings
from django.db import transaction
from apps.credits.services import CreditsService
from .models import Payment, CreditPack
import logging

logger = logging.getLogger(__name__)

# Инициализация SDK
Configuration.account_id = settings.YOOKASSA_SHOP_ID
Configuration.secret_key = settings.YOOKASSA_SECRET_KEY


class BillingService:

    @staticmethod
    def create_payment(user, credit_pack: CreditPack) -> Payment:
        """Создать платёж в ЮKassa и вернуть Payment с confirmation_url."""

        payment = Payment.objects.create(
            user=user,
            credit_pack=credit_pack,
            amount_rub=credit_pack.price_rub,
            credits_to_add=credit_pack.total_credits,
        )

        yoo_payment = YooPayment.create({
            'amount': {
                'value': str(credit_pack.price_rub),
                'currency': 'RUB',
            },
            'confirmation': {
                'type': 'redirect',
                'return_url': settings.YOOKASSA_RETURN_URL,
            },
            'capture': True,  # Автоматическое подтверждение
            'description': f'Пакет «{credit_pack.name}» — {credit_pack.total_credits} Кадров',
            'metadata': {
                'payment_id': str(payment.id),
                'user_id': user.id,
                'credits': credit_pack.total_credits,
            },
        }, payment.id)  # idempotency_key

        payment.yookassa_payment_id = yoo_payment.id
        payment.confirmation_url = yoo_payment.confirmation.confirmation_url
        payment.save(update_fields=['yookassa_payment_id', 'confirmation_url'])

        logger.info(f"Payment created: {payment.id} for user {user.id}, amount={credit_pack.price_rub}₽")
        return payment

    @staticmethod
    @transaction.atomic
    def process_webhook(yookassa_payment_id: str, status: str) -> Payment | None:
        """Обработать webhook от ЮKassa. Идемпотентно."""

        try:
            payment = Payment.objects.select_for_update().get(
                yookassa_payment_id=yookassa_payment_id
            )
        except Payment.DoesNotExist:
            logger.warning(f"Webhook for unknown payment: {yookassa_payment_id}")
            return None

        if status == 'succeeded' and not payment.credits_added:
            # Начислить Кадры
            CreditsService.topup(
                user=payment.user,
                amount=payment.credits_to_add,
                reason='purchase',
                metadata={
                    'payment_id': str(payment.id),
                    'credit_pack': payment.credit_pack.name,
                    'amount_rub': str(payment.amount_rub),
                },
            )
            payment.status = Payment.Status.SUCCEEDED
            payment.credits_added = True
            payment.save(update_fields=['status', 'credits_added', 'updated_at'])
            logger.info(f"Payment succeeded: {payment.id}, +{payment.credits_to_add} credits for user {payment.user_id}")

        elif status == 'canceled':
            payment.status = Payment.Status.CANCELED
            payment.save(update_fields=['status', 'updated_at'])
            logger.info(f"Payment canceled: {payment.id}")

        return payment
```

> **ВАЖНО:** Нужно добавить reason='purchase' в CreditsTransaction.REASON_CHOICES (apps/credits/models.py)

---

## Task 3: Backend — Views & URLs

**Files:** `backend/apps/billing/views.py`, `backend/apps/billing/serializers.py`, `backend/apps/billing/urls.py`

- [ ] Создать serializers:
```python
from rest_framework import serializers
from .models import CreditPack, Payment


class CreditPackSerializer(serializers.ModelSerializer):
    total_credits = serializers.IntegerField(read_only=True)
    price_per_credit = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = CreditPack
        fields = ['id', 'name', 'credits_amount', 'bonus_credits', 'total_credits',
                  'price_rub', 'price_per_credit']


class CreatePaymentSerializer(serializers.Serializer):
    credit_pack_id = serializers.IntegerField()


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ['id', 'amount_rub', 'credits_to_add', 'status',
                  'confirmation_url', 'created_at']
```

- [ ] Создать views:
```python
from rest_framework import views, generics, permissions, status
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
import json
from .models import CreditPack, Payment
from .serializers import CreditPackSerializer, CreatePaymentSerializer, PaymentSerializer
from .services import BillingService


class CreditPackListView(generics.ListAPIView):
    """GET /api/billing/packs/ — Список доступных пакетов Кадров."""
    serializer_class = CreditPackSerializer
    permission_classes = [permissions.AllowAny]
    queryset = CreditPack.objects.filter(is_active=True)


class CreatePaymentView(views.APIView):
    """POST /api/billing/pay/ — Создать платёж, вернуть URL для оплаты."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = CreatePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            pack = CreditPack.objects.get(
                id=serializer.validated_data['credit_pack_id'],
                is_active=True,
            )
        except CreditPack.DoesNotExist:
            return Response({'error': 'Пакет не найден'}, status=404)

        payment = BillingService.create_payment(request.user, pack)
        return Response(PaymentSerializer(payment).data, status=201)


class PaymentHistoryView(generics.ListAPIView):
    """GET /api/billing/history/ — История платежей пользователя."""
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Payment.objects.filter(user=self.request.user)


@method_decorator(csrf_exempt, name='dispatch')
class YooKassaWebhookView(views.APIView):
    """POST /api/billing/webhook/ — Webhook от ЮKassa."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        # ЮKassa присылает JSON с event и object
        body = request.data
        event = body.get('event')
        payment_obj = body.get('object', {})

        if event == 'payment.succeeded':
            BillingService.process_webhook(payment_obj['id'], 'succeeded')
        elif event == 'payment.canceled':
            BillingService.process_webhook(payment_obj['id'], 'canceled')

        return Response(status=200)
```

- [ ] Создать `backend/apps/billing/urls.py`:
```python
from django.urls import path
from . import views

urlpatterns = [
    path('packs/', views.CreditPackListView.as_view(), name='credit_packs'),
    path('pay/', views.CreatePaymentView.as_view(), name='create_payment'),
    path('history/', views.PaymentHistoryView.as_view(), name='payment_history'),
    path('webhook/', views.YooKassaWebhookView.as_view(), name='yookassa_webhook'),
]
```

- [ ] Подключить в `config/urls.py`:
```python
path('api/billing/', include('apps.billing.urls')),
```

---

## Task 4: Backend — Webhook Security

**Files:** `backend/apps/billing/views.py`

- [ ] Добавить проверку IP ЮKassa в webhook (опционально, но рекомендуется):
```python
YOOKASSA_IPS = [
    '185.71.76.0/27',
    '185.71.77.0/27',
    '77.75.153.0/25',
    '77.75.156.11',
    '77.75.156.35',
    '77.75.154.128/25',
    '2a02:5180::/32',
]
```

- [ ] Альтернатива: проверять платёж через API ЮKassa после webhook:
```python
from yookassa import Payment as YooPayment

yoo_payment = YooPayment.find_one(payment_obj['id'])
if yoo_payment.status == 'succeeded':
    BillingService.process_webhook(yoo_payment.id, 'succeeded')
```
Это надёжнее, чем проверка IP.

---

## Task 5: Backend — Django Admin

**Files:** `backend/apps/billing/admin.py`

- [ ] Создать admin для управления пакетами:
```python
from django.contrib import admin
from .models import CreditPack, Payment


@admin.register(CreditPack)
class CreditPackAdmin(admin.ModelAdmin):
    list_display = ['name', 'credits_amount', 'bonus_credits', 'price_rub', 'is_active', 'sort_order']
    list_editable = ['price_rub', 'is_active', 'sort_order']


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'credit_pack', 'amount_rub', 'credits_to_add', 'status', 'credits_added', 'created_at']
    list_filter = ['status', 'credits_added']
    search_fields = ['user__username', 'user__email', 'yookassa_payment_id']
    readonly_fields = ['id', 'yookassa_payment_id', 'confirmation_url', 'metadata']
```

- [ ] Создать начальные пакеты через admin или data migration:

| name | credits_amount | bonus_credits | price_rub | sort_order |
|------|---------------|---------------|-----------|------------|
| Стартер | 100 | 0 | 290 | 1 |
| Базовый | 500 | 0 | 1190 | 2 |
| Про | 1000 | 50 | 1990 | 3 |
| Студия | 5000 | 500 | 7990 | 4 |

---

## Task 6: Backend — Обновить Credits модель

**Files:** `backend/apps/credits/models.py`

- [ ] Добавить `purchase` в `REASON_CHOICES`:
```python
class CreditsTransaction(models.Model):
    REASON_CHOICES = [
        ('admin_topup', 'Admin Topup'),
        ('admin_adjustment', 'Admin Adjustment'),
        ('purchase', 'Purchase'),  # ← НОВЫЙ
        ('generation_debit', 'Generation Debit'),
        ('generation_refund', 'Generation Refund'),
        ('refund_provider_error', 'Refund Provider Error'),
        ('refund_pricing_failure', 'Refund Pricing Failure'),
    ]
```

- [ ] Создать миграцию

---

## Task 7: Frontend — Страница покупки

**Files:** `frontend/app/(workspace)/billing/page.tsx`, `frontend/lib/api/billing.ts`, `frontend/lib/types/index.ts`

### 7.1 Types

- [ ] Добавить в `lib/types/index.ts`:
```typescript
export interface CreditPack {
  id: number
  name: string
  credits_amount: number
  bonus_credits: number
  total_credits: number
  price_rub: string  // Decimal from backend
  price_per_credit: string
}

export interface PaymentResponse {
  id: string
  amount_rub: string
  credits_to_add: number
  status: string
  confirmation_url: string
  created_at: string
}
```

### 7.2 API

- [ ] Создать `frontend/lib/api/billing.ts`:
```typescript
import { client } from './client'
import { CreditPack, PaymentResponse } from '../types'

export async function getCreditPacks(): Promise<CreditPack[]> {
  const res = await client.get('/api/billing/packs/')
  return res.data
}

export async function createPayment(creditPackId: number): Promise<PaymentResponse> {
  const res = await client.post('/api/billing/pay/', { credit_pack_id: creditPackId })
  return res.data
}

export async function getPaymentHistory(): Promise<PaymentResponse[]> {
  const res = await client.get('/api/billing/history/')
  return res.data
}
```

### 7.3 Page

- [ ] Создать `frontend/app/(workspace)/billing/page.tsx`:
  - Показать карточки пакетов (GET /api/billing/packs/)
  - Каждая карточка: название, кол-во Кадров, бонус (если есть), цена, цена за Кадр
  - Кнопка "Купить" → POST /api/billing/pay/ → redirect на confirmation_url
  - После оплаты пользователь возвращается на эту страницу
  - Показать текущий баланс сверху
  - Внизу: краткая история покупок

- [ ] Дизайн карточек:
```
┌──────────────────────┐
│  Базовый             │
│                      │
│  500 Кадров          │
│  + 0 бонусных        │
│                      │
│  1 190 ₽             │
│  2.38 ₽ / Кадр       │
│                      │
│  [  Купить  ]        │
└──────────────────────┘
```

### 7.4 Обновить баланс после оплаты

- [ ] При возврате на `/billing` (после оплаты) — рефетчить баланс через `GET /api/auth/me/`
- [ ] Или: использовать WebSocket notification `payment_succeeded` → обновить баланс в store
  - Для MVP достаточно рефетча при возврате на страницу

---

## Task 8: Тестирование

- [ ] Тестовый режим ЮKassa: использовать тестовые shopId/secretKey (ЮKassa предоставляет sandbox)
- [ ] Проверить полный flow:
  1. Выбрать пакет → нажать "Купить"
  2. Редирект на тестовую страницу оплаты ЮKassa
  3. Оплатить тестовой картой (4111 1111 1111 1111)
  4. Вернуться на сайт
  5. Webhook приходит → Кадры начислены
  6. Баланс обновился

- [ ] Проверить идемпотентность: отправить webhook дважды → кредиты начислены только 1 раз
- [ ] Проверить отмену: отменить платёж → статус canceled, кредиты не начислены

---

## Чеклист завершения Round 3

- [ ] CreditPack модель с 4 начальными пакетами в БД
- [ ] Payment модель с индексами
- [ ] `GET /api/billing/packs/` возвращает активные пакеты
- [ ] `POST /api/billing/pay/` создаёт платёж в ЮKassa, возвращает confirmation_url
- [ ] Webhook `/api/billing/webhook/` обрабатывает payment.succeeded и payment.canceled
- [ ] Начисление Кадров идемпотентно (credits_added флаг)
- [ ] Frontend страница `/billing` с карточками пакетов
- [ ] Полный flow работает в тестовом режиме ЮKassa
- [ ] Django Admin: управление пакетами, просмотр платежей
- [ ] `purchase` reason в CreditsTransaction
- [ ] Логирование всех платёжных операций
