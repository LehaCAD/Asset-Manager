# Prompt Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggle "Усилить промпт" that automatically enhances short prompts via a configurable LLM before sending to the image/video generation provider.

**Architecture:** New isolated Django app `ai_services` with LLM provider abstraction (OpenAI-compatible + Anthropic clients). Enhancement runs synchronously in `create_generation()` before Element creation. Frontend adds a checkbox above PromptBar, gated by existing `ai_prompt` subscription feature.

**Tech Stack:** Django 5, DRF, `requests` library (already installed), Zustand, React, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-09-prompt-enhancement-design.md`

---

## File Map

### New Files (backend)
| File | Responsibility |
|------|---------------|
| `backend/apps/ai_services/__init__.py` | Package init |
| `backend/apps/ai_services/apps.py` | Django app config |
| `backend/apps/ai_services/models.py` | LLMProvider, AIService models |
| `backend/apps/ai_services/clients/__init__.py` | Package init |
| `backend/apps/ai_services/clients/base.py` | BaseLLMClient ABC, LLMResponse dataclass |
| `backend/apps/ai_services/clients/openai_compat.py` | OpenAI-compatible client (covers GPT, DeepSeek, Groq) |
| `backend/apps/ai_services/clients/anthropic.py` | Anthropic Claude client |
| `backend/apps/ai_services/services/__init__.py` | Package init |
| `backend/apps/ai_services/services/prompt_enhance.py` | enhance_prompt() business logic |
| `backend/apps/ai_services/urls.py` | URL routing (empty — no public endpoints) |
| `backend/apps/ai_services/admin.py` | Admin panel (test button deferred to follow-up) |
| `backend/apps/ai_services/tests/__init__.py` | Package init |
| `backend/apps/ai_services/tests/test_models.py` | Model tests |
| `backend/apps/ai_services/tests/test_clients.py` | LLM client tests |
| `backend/apps/ai_services/tests/test_prompt_enhance.py` | Enhancement service tests |
| `backend/apps/ai_services/tests/test_admin.py` | Admin tests |

### New Files (frontend)
| File | Responsibility |
|------|---------------|
| `frontend/components/generation/PromptEnhanceToggle.tsx` | Toggle component with subscription gating |

### Modified Files
| File | Changes |
|------|---------|
| `backend/config/settings.py:62` | Add `'apps.ai_services'` to INSTALLED_APPS |
| `backend/apps/credits/models.py:24` | Add `REASON_PROMPT_ENHANCEMENT` constant |
| `backend/apps/credits/services.py:191` | Add `debit_flat()` method |
| `backend/apps/credits/tests.py` | Add tests for `debit_flat()` |
| `backend/apps/elements/orchestration.py:53` | Insert enhancement logic before debit |
| `backend/apps/elements/tasks.py:86-91` | Use `_enhanced_prompt` in `build_generation_context()` |
| `backend/apps/elements/tests.py` | Add orchestration integration tests |
| `frontend/lib/store/generation.ts:277-329` | Add `enhancePrompt` state + pass in payload |
| `frontend/components/generation/PromptBar.tsx:248-254` | Add pill container with PromptEnhanceToggle |
| `frontend/components/lightbox/DetailPanel.tsx:29-31,127-141,147-155,257` | Show enhancement info |

---

## Task 1: Django App Skeleton + Models

**Files:**
- Create: `backend/apps/ai_services/__init__.py`, `apps.py`, `models.py`
- Modify: `backend/config/settings.py:62`
- Test: `backend/apps/ai_services/tests/__init__.py`, `test_models.py`

- [ ] **Step 1: Create app directory structure**

```bash
docker compose exec backend bash -c "mkdir -p apps/ai_services/clients apps/ai_services/services apps/ai_services/tests"
```

- [ ] **Step 2: Write `__init__.py` files**

Create empty `__init__.py` in: `apps/ai_services/`, `apps/ai_services/clients/`, `apps/ai_services/services/`, `apps/ai_services/tests/`

Create empty `urls.py`:
```python
# backend/apps/ai_services/urls.py
# No public endpoints — ai_services is called internally from orchestration.
urlpatterns = []
```

- [ ] **Step 3: Write `apps.py`**

```python
# backend/apps/ai_services/apps.py
from django.apps import AppConfig

class AiServicesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.ai_services"
    verbose_name = "AI Сервисы"
```

- [ ] **Step 4: Write model tests**

```python
# backend/apps/ai_services/tests/test_models.py
from decimal import Decimal
from django.test import TestCase
from django.db import IntegrityError
from apps.ai_services.models import LLMProvider, AIService


class LLMProviderModelTests(TestCase):
    def test_create_provider(self):
        provider = LLMProvider.objects.create(
            name="OpenAI",
            provider_type="openai_compatible",
            api_base_url="https://api.openai.com",
            api_key="sk-test-key",
        )
        assert provider.is_active is True
        assert str(provider) == "OpenAI"

    def test_resolve_api_key_plain(self):
        provider = LLMProvider.objects.create(
            name="Test", provider_type="openai_compatible",
            api_base_url="https://api.test.com", api_key="sk-plain-key",
        )
        assert provider.resolve_api_key() == "sk-plain-key"

    def test_resolve_api_key_env(self):
        import os
        os.environ["TEST_LLM_KEY"] = "sk-from-env"
        provider = LLMProvider.objects.create(
            name="Test", provider_type="openai_compatible",
            api_base_url="https://api.test.com", api_key="ENV:TEST_LLM_KEY",
        )
        assert provider.resolve_api_key() == "sk-from-env"
        del os.environ["TEST_LLM_KEY"]

    def test_resolve_api_key_env_missing(self):
        provider = LLMProvider.objects.create(
            name="Test", provider_type="openai_compatible",
            api_base_url="https://api.test.com", api_key="ENV:NONEXISTENT_KEY",
        )
        with self.assertRaises(ValueError):
            provider.resolve_api_key()


class AIServiceModelTests(TestCase):
    def setUp(self):
        self.provider = LLMProvider.objects.create(
            name="OpenAI", provider_type="openai_compatible",
            api_base_url="https://api.openai.com", api_key="sk-test",
        )

    def test_create_service(self):
        service = AIService.objects.create(
            service_type=AIService.PROMPT_ENHANCE,
            name="Prompt Enhance",
            provider=self.provider,
            model_name="gpt-4o-mini",
            system_prompt="Enhance prompts.",
            parameters={"temperature": 0.7, "max_tokens": 500},
            cost_per_call=Decimal("1.00"),
        )
        assert service.is_active is True
        assert str(service) == "Prompt Enhance (gpt-4o-mini)"

    def test_unique_active_constraint(self):
        """Only one active service per service_type."""
        AIService.objects.create(
            service_type=AIService.PROMPT_ENHANCE, name="First",
            provider=self.provider, model_name="gpt-4o-mini",
            system_prompt="v1", cost_per_call=Decimal("1.00"),
        )
        with self.assertRaises(IntegrityError):
            AIService.objects.create(
                service_type=AIService.PROMPT_ENHANCE, name="Second",
                provider=self.provider, model_name="gpt-4o",
                system_prompt="v2", cost_per_call=Decimal("2.00"),
            )

    def test_two_active_different_types_ok(self):
        AIService.objects.create(
            service_type=AIService.PROMPT_ENHANCE, name="Enhance",
            provider=self.provider, model_name="gpt-4o-mini",
            system_prompt="v1", cost_per_call=Decimal("1.00"),
        )
        service2 = AIService.objects.create(
            service_type=AIService.SMART_EDIT, name="Edit",
            provider=self.provider, model_name="gpt-4o",
            system_prompt="v2", cost_per_call=Decimal("2.00"),
        )
        assert service2.pk is not None

    def test_inactive_duplicate_allowed(self):
        AIService.objects.create(
            service_type=AIService.PROMPT_ENHANCE, name="Active",
            provider=self.provider, model_name="gpt-4o-mini",
            system_prompt="v1", cost_per_call=Decimal("1.00"),
        )
        inactive = AIService.objects.create(
            service_type=AIService.PROMPT_ENHANCE, name="Inactive",
            provider=self.provider, model_name="gpt-4o",
            system_prompt="v2", cost_per_call=Decimal("2.00"),
            is_active=False,
        )
        assert inactive.pk is not None

    def test_get_timeout_default(self):
        service = AIService.objects.create(
            service_type=AIService.PROMPT_ENHANCE, name="Test",
            provider=self.provider, model_name="gpt-4o-mini",
            system_prompt="v1", parameters={},
            cost_per_call=Decimal("1.00"),
        )
        assert service.get_timeout() == 15

    def test_get_timeout_custom(self):
        service = AIService.objects.create(
            service_type=AIService.PROMPT_ENHANCE, name="Test",
            provider=self.provider, model_name="gpt-4o-mini",
            system_prompt="v1", parameters={"timeout": 10},
            cost_per_call=Decimal("1.00"),
        )
        assert service.get_timeout() == 10
```

- [ ] **Step 5: Run tests — verify they fail**

```bash
docker compose exec backend python manage.py test apps.ai_services.tests.test_models -v2
```

Expected: ImportError (models don't exist yet)

- [ ] **Step 6: Write models**

```python
# backend/apps/ai_services/models.py
import os
from django.db import models
from django.db.models import Q, UniqueConstraint


class LLMProvider(models.Model):
    PROVIDER_OPENAI_COMPATIBLE = "openai_compatible"
    PROVIDER_ANTHROPIC = "anthropic"
    PROVIDER_TYPE_CHOICES = [
        (PROVIDER_OPENAI_COMPATIBLE, "OpenAI-совместимый"),
        (PROVIDER_ANTHROPIC, "Anthropic"),
    ]

    name = models.CharField("Название", max_length=100)
    provider_type = models.CharField(
        "Тип провайдера", max_length=30, choices=PROVIDER_TYPE_CHOICES,
    )
    api_base_url = models.URLField("Базовый URL API")
    api_key = models.CharField(
        "API-ключ", max_length=500,
        help_text="Прямой ключ или ENV:VARIABLE_NAME для чтения из переменной окружения",
    )
    is_active = models.BooleanField("Активен", default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "LLM-провайдер"
        verbose_name_plural = "LLM-провайдеры"

    def __str__(self):
        return self.name

    def resolve_api_key(self) -> str:
        if self.api_key.startswith("ENV:"):
            env_var = self.api_key[4:]
            value = os.environ.get(env_var)
            if not value:
                raise ValueError(f"Переменная окружения {env_var} не задана")
            return value
        return self.api_key


class AIService(models.Model):
    PROMPT_ENHANCE = "PROMPT_ENHANCE"
    SMART_EDIT = "SMART_EDIT"
    SERVICE_TYPE_CHOICES = [
        (PROMPT_ENHANCE, "Усиление промпта"),
        (SMART_EDIT, "Умное редактирование"),
    ]

    service_type = models.CharField(
        "Тип сервиса", max_length=30, choices=SERVICE_TYPE_CHOICES,
    )
    name = models.CharField("Название", max_length=100)
    provider = models.ForeignKey(
        LLMProvider, on_delete=models.PROTECT, verbose_name="Провайдер",
    )
    model_name = models.CharField("Модель", max_length=100)
    system_prompt = models.TextField("Системный промпт")
    parameters = models.JSONField(
        "Параметры", default=dict, blank=True,
        help_text='{"temperature": 0.7, "max_tokens": 500, "top_p": 1.0, "timeout": 15}',
    )
    cost_per_call = models.DecimalField(
        "Стоимость за вызов (кадры)", max_digits=10, decimal_places=2,
    )
    is_active = models.BooleanField("Активен", default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "AI-сервис"
        verbose_name_plural = "AI-сервисы"
        constraints = [
            UniqueConstraint(
                fields=["service_type"],
                condition=Q(is_active=True),
                name="unique_active_service_per_type",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.model_name})"

    def get_timeout(self) -> int:
        return self.parameters.get("timeout", 15)
```

- [ ] **Step 7: Register app in settings**

Add `'apps.ai_services',` to `INSTALLED_APPS` in `backend/config/settings.py` after `'apps.subscriptions'`.

- [ ] **Step 8: Create and run migration**

```bash
docker compose exec backend python manage.py makemigrations ai_services
docker compose exec backend python manage.py migrate
```

- [ ] **Step 9: Run tests — verify they pass**

```bash
docker compose exec backend python manage.py test apps.ai_services.tests.test_models -v2
```

Expected: All 8 tests PASS

- [ ] **Step 10: Commit**

```bash
git add backend/apps/ai_services/ backend/config/settings.py
git commit -m "feat(ai_services): add LLMProvider and AIService models with constraints"
```

---

## Task 2: LLM Clients (Base + OpenAI-Compatible)

**Files:**
- Create: `backend/apps/ai_services/clients/base.py`, `clients/openai_compat.py`, `clients/anthropic.py`
- Test: `backend/apps/ai_services/tests/test_clients.py`

- [ ] **Step 1: Write client tests**

```python
# backend/apps/ai_services/tests/test_clients.py
import json
from unittest.mock import patch, MagicMock
from django.test import SimpleTestCase
from apps.ai_services.clients.base import LLMResponse
from apps.ai_services.clients.openai_compat import OpenAICompatibleClient
from apps.ai_services.clients.anthropic import AnthropicClient


class OpenAICompatibleClientTests(SimpleTestCase):
    def setUp(self):
        self.client = OpenAICompatibleClient(
            base_url="https://api.openai.com",
            api_key="sk-test",
        )

    @patch("apps.ai_services.clients.openai_compat.requests.post")
    def test_chat_success(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "Enhanced prompt text"}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 20},
        }
        mock_post.return_value = mock_response

        result = self.client.chat(
            system_prompt="You are helpful",
            user_message="хочу котика",
            params={"temperature": 0.7, "max_tokens": 500},
        )

        assert isinstance(result, LLMResponse)
        assert result.text == "Enhanced prompt text"
        assert result.prompt_tokens == 10
        assert result.completion_tokens == 20

        # Verify request structure
        call_args = mock_post.call_args
        assert call_args[0][0] == "https://api.openai.com/v1/chat/completions"
        body = call_args[1]["json"]
        assert body["messages"][0]["role"] == "system"
        assert body["messages"][1]["role"] == "user"
        assert body["messages"][1]["content"] == "хочу котика"
        assert body["temperature"] == 0.7
        assert call_args[1]["timeout"] == 15

    @patch("apps.ai_services.clients.openai_compat.requests.post")
    def test_chat_with_custom_timeout(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "ok"}}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 1},
        }
        mock_post.return_value = mock_response

        self.client.chat("sys", "user", {"max_tokens": 100}, timeout=10)
        assert mock_post.call_args[1]["timeout"] == 10

    @patch("apps.ai_services.clients.openai_compat.requests.post")
    def test_chat_api_error_raises(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.text = "Rate limited"
        mock_response.raise_for_status.side_effect = Exception("429 Too Many Requests")
        mock_post.return_value = mock_response

        with self.assertRaises(Exception):
            self.client.chat("sys", "user", {"max_tokens": 100})

    @patch("apps.ai_services.clients.openai_compat.requests.post")
    def test_chat_timeout_raises(self, mock_post):
        import requests as req
        mock_post.side_effect = req.exceptions.Timeout("Connection timed out")

        with self.assertRaises(req.exceptions.Timeout):
            self.client.chat("sys", "user", {"max_tokens": 100})

    @patch("apps.ai_services.clients.openai_compat.requests.post")
    def test_chat_model_param_forwarded(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "ok"}}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
        }
        mock_post.return_value = mock_response

        client = OpenAICompatibleClient("https://api.openai.com", "sk-test")
        client.chat("sys", "user", {"max_tokens": 100}, model="gpt-4o-mini")
        body = mock_post.call_args[1]["json"]
        assert body["model"] == "gpt-4o-mini"


class AnthropicClientTests(SimpleTestCase):
    def setUp(self):
        self.client = AnthropicClient(
            base_url="https://api.anthropic.com",
            api_key="sk-ant-test",
        )

    @patch("apps.ai_services.clients.anthropic.requests.post")
    def test_chat_success(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "content": [{"type": "text", "text": "Enhanced prompt"}],
            "usage": {"input_tokens": 15, "output_tokens": 25},
        }
        mock_post.return_value = mock_response

        result = self.client.chat(
            system_prompt="You are helpful",
            user_message="хочу котика",
            params={"temperature": 0.7, "max_tokens": 500},
        )

        assert result.text == "Enhanced prompt"
        assert result.prompt_tokens == 15
        assert result.completion_tokens == 25

        call_args = mock_post.call_args
        assert call_args[0][0] == "https://api.anthropic.com/v1/messages"
        body = call_args[1]["json"]
        assert body["system"] == "You are helpful"
        assert body["messages"][0]["role"] == "user"
        assert "max_tokens" in body

    @patch("apps.ai_services.clients.anthropic.requests.post")
    def test_chat_max_tokens_required(self, mock_post):
        """Anthropic requires max_tokens — client must set default if not in params."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "content": [{"type": "text", "text": "ok"}],
            "usage": {"input_tokens": 1, "output_tokens": 1},
        }
        mock_post.return_value = mock_response

        self.client.chat("sys", "user", {})  # No max_tokens in params
        body = mock_post.call_args[1]["json"]
        assert "max_tokens" in body
        assert body["max_tokens"] > 0
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
docker compose exec backend python manage.py test apps.ai_services.tests.test_clients -v2
```

- [ ] **Step 3: Write base client**

```python
# backend/apps/ai_services/clients/base.py
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class LLMResponse:
    text: str
    prompt_tokens: int
    completion_tokens: int


class BaseLLMClient(ABC):
    DEFAULT_TIMEOUT = 15

    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    @abstractmethod
    def chat(self, system_prompt: str, user_message: str, params: dict,
             timeout: int = DEFAULT_TIMEOUT, model: str = "") -> LLMResponse:
        ...
```

- [ ] **Step 4: Write OpenAI-compatible client**

```python
# backend/apps/ai_services/clients/openai_compat.py
import logging
import requests
from .base import BaseLLMClient, LLMResponse

logger = logging.getLogger(__name__)


class OpenAICompatibleClient(BaseLLMClient):
    def chat(self, system_prompt: str, user_message: str, params: dict,
             timeout: int = BaseLLMClient.DEFAULT_TIMEOUT, model: str = "") -> LLMResponse:
        url = f"{self.base_url}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        }
        if model:
            body["model"] = model
        # Map universal params
        for key in ("temperature", "max_tokens", "top_p"):
            if key in params:
                body[key] = params[key]

        response = requests.post(url, json=body, headers=headers, timeout=timeout)
        response.raise_for_status()
        data = response.json()

        return LLMResponse(
            text=data["choices"][0]["message"]["content"],
            prompt_tokens=data.get("usage", {}).get("prompt_tokens", 0),
            completion_tokens=data.get("usage", {}).get("completion_tokens", 0),
        )
```

- [ ] **Step 5: Write Anthropic client**

```python
# backend/apps/ai_services/clients/anthropic.py
import logging
import requests
from .base import BaseLLMClient, LLMResponse

logger = logging.getLogger(__name__)


class AnthropicClient(BaseLLMClient):
    def chat(self, system_prompt: str, user_message: str, params: dict,
             timeout: int = BaseLLMClient.DEFAULT_TIMEOUT, model: str = "") -> LLMResponse:
        url = f"{self.base_url}/v1/messages"
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        body = {
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_message}],
            "max_tokens": params.get("max_tokens", 1024),
        }
        if model:
            body["model"] = model
        for key in ("temperature", "top_p"):
            if key in params:
                body[key] = params[key]

        response = requests.post(url, json=body, headers=headers, timeout=timeout)
        response.raise_for_status()
        data = response.json()

        return LLMResponse(
            text=data["content"][0]["text"],
            prompt_tokens=data.get("usage", {}).get("input_tokens", 0),
            completion_tokens=data.get("usage", {}).get("output_tokens", 0),
        )
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
docker compose exec backend python manage.py test apps.ai_services.tests.test_clients -v2
```

Expected: All 8 tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/apps/ai_services/clients/
git commit -m "feat(ai_services): add LLM client abstraction — OpenAI-compatible + Anthropic"
```

---

## Task 3: CreditsService.debit_flat()

**Files:**
- Modify: `backend/apps/credits/models.py:24`, `backend/apps/credits/services.py:191`
- Test: `backend/apps/credits/tests.py`

- [ ] **Step 1: Write tests for debit_flat()**

```python
# Add to backend/apps/credits/tests.py

class CreditsServiceDebitFlatTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="flat_user", password="x")
        CreditsService().topup(
            user=self.user, amount=Decimal("100.00"),
            reason=CreditsTransaction.REASON_ADMIN_TOPUP,
        )

    def test_debit_flat_success(self):
        result = CreditsService().debit_flat(
            user=self.user, amount=Decimal("5.00"),
            reason=CreditsTransaction.REASON_PROMPT_ENHANCEMENT,
        )
        assert result.ok is True
        assert result.cost == Decimal("5.00")
        self.user.refresh_from_db()
        assert self.user.balance == Decimal("95.00")

    def test_debit_flat_creates_transaction(self):
        CreditsService().debit_flat(
            user=self.user, amount=Decimal("3.00"),
            reason=CreditsTransaction.REASON_PROMPT_ENHANCEMENT,
        )
        tx = CreditsTransaction.objects.filter(
            user=self.user,
            reason=CreditsTransaction.REASON_PROMPT_ENHANCEMENT,
        ).last()
        assert tx is not None
        assert tx.amount == Decimal("-3.00")

    def test_debit_flat_insufficient_funds(self):
        result = CreditsService().debit_flat(
            user=self.user, amount=Decimal("999.00"),
            reason=CreditsTransaction.REASON_PROMPT_ENHANCEMENT,
        )
        assert result.ok is False
        self.user.refresh_from_db()
        assert self.user.balance == Decimal("100.00")

    def test_debit_flat_zero_amount(self):
        result = CreditsService().debit_flat(
            user=self.user, amount=Decimal("0.00"),
            reason=CreditsTransaction.REASON_PROMPT_ENHANCEMENT,
        )
        assert result.ok is True
        assert result.cost == Decimal("0.00")
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
docker compose exec backend python manage.py test apps.credits.tests.CreditsServiceDebitFlatTests -v2
```

- [ ] **Step 3: Add REASON_PROMPT_ENHANCEMENT constant**

In `backend/apps/credits/models.py`, after existing REASON constants (~line 24):

```python
REASON_PROMPT_ENHANCEMENT = "prompt_enhancement"
```

Add to `REASON_CHOICES`:

```python
(REASON_PROMPT_ENHANCEMENT, "Усиление промпта"),
```

- [ ] **Step 4: Create migration for new reason choice**

```bash
docker compose exec backend python manage.py makemigrations credits
docker compose exec backend python manage.py migrate
```

- [ ] **Step 5: Implement debit_flat()**

In `backend/apps/credits/services.py`, add after `debit_for_generation()` method. Use `@transaction.atomic` decorator to match existing pattern (`debit_for_generation`, `topup`):

```python
@transaction.atomic
def debit_flat(self, user, amount, reason, element=None, metadata=None):
    """Debit a fixed amount (not tied to AIModel pricing)."""
    if amount <= 0:
        return DebitResult(ok=True, cost=Decimal("0"), balance_after=user.balance, error=None)

    locked_user = type(user).objects.select_for_update().get(pk=user.pk)
    if locked_user.balance < amount:
        return DebitResult(
            ok=False, cost=Decimal("0"), balance_after=locked_user.balance,
            error="Недостаточно кадров",
        )
    locked_user.balance -= amount
    locked_user.save(update_fields=["balance"])

    CreditsTransaction.objects.create(
        user=locked_user,
        amount=-amount,
        balance_after=locked_user.balance,
        reason=reason,
        element=element,
        metadata=metadata or {},
    )

    return DebitResult(ok=True, cost=amount, balance_after=locked_user.balance, error=None)
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
docker compose exec backend python manage.py test apps.credits.tests.CreditsServiceDebitFlatTests -v2
```

- [ ] **Step 7: Commit**

```bash
git add backend/apps/credits/
git commit -m "feat(credits): add debit_flat() for fixed-cost service charges"
```

---

## Task 4: Prompt Enhancement Service

**Files:**
- Create: `backend/apps/ai_services/services/prompt_enhance.py`
- Test: `backend/apps/ai_services/tests/test_prompt_enhance.py`

- [ ] **Step 1: Write comprehensive tests**

```python
# backend/apps/ai_services/tests/test_prompt_enhance.py
from decimal import Decimal
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth import get_user_model
from apps.ai_services.models import LLMProvider, AIService
from apps.ai_services.services.prompt_enhance import enhance_prompt, EnhanceResult
from apps.credits.models import CreditsTransaction
from apps.credits.services import CreditsService

User = get_user_model()


class EnhancePromptTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="enhancer", password="x")
        CreditsService().topup(
            user=self.user, amount=Decimal("100.00"),
            reason=CreditsTransaction.REASON_ADMIN_TOPUP,
        )
        self.provider = LLMProvider.objects.create(
            name="OpenAI", provider_type="openai_compatible",
            api_base_url="https://api.openai.com", api_key="sk-test",
        )
        self.service = AIService.objects.create(
            service_type=AIService.PROMPT_ENHANCE,
            name="Enhance", provider=self.provider,
            model_name="gpt-4o-mini",
            system_prompt="Enhance short prompts. Return detailed prompts as-is.",
            parameters={"temperature": 0.7, "max_tokens": 500},
            cost_per_call=Decimal("1.00"),
        )

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    def test_short_prompt_enhanced(self, mock_llm):
        mock_llm.return_value = "A cute fluffy orange tabby kitten sitting on a blanket"
        result = enhance_prompt("хочу котика", self.user)

        assert result.was_enhanced is True
        assert result.prompt == "A cute fluffy orange tabby kitten sitting on a blanket"
        assert result.cost == Decimal("1.00")
        mock_llm.assert_called_once()

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    def test_credits_debited_on_success(self, mock_llm):
        mock_llm.return_value = "Enhanced version"
        enhance_prompt("short prompt", self.user)
        self.user.refresh_from_db()
        assert self.user.balance == Decimal("99.00")

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    def test_transaction_created(self, mock_llm):
        mock_llm.return_value = "Enhanced"
        enhance_prompt("test", self.user)
        tx = CreditsTransaction.objects.filter(
            user=self.user, reason=CreditsTransaction.REASON_PROMPT_ENHANCEMENT,
        ).last()
        assert tx is not None
        assert tx.amount == Decimal("-1.00")

    def test_no_active_service_returns_original(self):
        self.service.is_active = False
        self.service.save()
        result = enhance_prompt("test prompt", self.user)

        assert result.was_enhanced is False
        assert result.prompt == "test prompt"
        assert result.cost == Decimal("0")

    @patch("apps.ai_services.services.prompt_enhance.SubscriptionService.has_feature")
    def test_no_feature_returns_original(self, mock_feature):
        mock_feature.return_value = False
        result = enhance_prompt("test prompt", self.user)

        assert result.was_enhanced is False
        assert result.prompt == "test prompt"

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    def test_llm_error_returns_original(self, mock_llm):
        mock_llm.side_effect = Exception("API Error")
        result = enhance_prompt("test prompt", self.user)

        assert result.was_enhanced is False
        assert result.prompt == "test prompt"
        assert result.cost == Decimal("0")

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    def test_llm_error_no_debit(self, mock_llm):
        mock_llm.side_effect = Exception("Timeout")
        enhance_prompt("test", self.user)
        self.user.refresh_from_db()
        assert self.user.balance == Decimal("100.00")

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    def test_llm_returns_empty_uses_original(self, mock_llm):
        mock_llm.return_value = ""
        result = enhance_prompt("my prompt", self.user)

        assert result.was_enhanced is False
        assert result.prompt == "my prompt"

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    def test_insufficient_credits_returns_original(self, mock_llm):
        mock_llm.return_value = "Enhanced"
        self.user.balance = Decimal("0.50")
        self.user.save()

        result = enhance_prompt("short", self.user)
        assert result.was_enhanced is False
        assert result.prompt == "short"
        mock_llm.assert_not_called()
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
docker compose exec backend python manage.py test apps.ai_services.tests.test_prompt_enhance -v2
```

- [ ] **Step 3: Implement prompt_enhance.py**

```python
# backend/apps/ai_services/services/prompt_enhance.py
import logging
from dataclasses import dataclass
from decimal import Decimal

from apps.ai_services.models import AIService, LLMProvider
from apps.credits.models import CreditsTransaction
from apps.credits.services import CreditsService
from apps.subscriptions.services import SubscriptionService

logger = logging.getLogger(__name__)


@dataclass
class EnhanceResult:
    prompt: str
    was_enhanced: bool
    cost: Decimal


def _get_client(provider: LLMProvider):
    """Instantiate the appropriate LLM client for the provider."""
    api_key = provider.resolve_api_key()
    if provider.provider_type == LLMProvider.PROVIDER_ANTHROPIC:
        from apps.ai_services.clients.anthropic import AnthropicClient
        return AnthropicClient(provider.api_base_url, api_key)
    from apps.ai_services.clients.openai_compat import OpenAICompatibleClient
    return OpenAICompatibleClient(provider.api_base_url, api_key)


def _call_llm(service: AIService, user_message: str) -> str:
    """Call the LLM and return the response text."""
    client = _get_client(service.provider)
    response = client.chat(
        system_prompt=service.system_prompt,
        user_message=user_message,
        params=service.parameters,
        timeout=service.get_timeout(),
        model=service.model_name,
    )
    return response.text.strip()


def _noop(prompt: str) -> EnhanceResult:
    return EnhanceResult(prompt=prompt, was_enhanced=False, cost=Decimal("0"))


def enhance_prompt(original_prompt: str, user) -> EnhanceResult:
    # 1. Find active service
    try:
        service = AIService.objects.select_related("provider").get(
            service_type=AIService.PROMPT_ENHANCE, is_active=True,
        )
    except AIService.DoesNotExist:
        return _noop(original_prompt)

    # 2. Check feature gate
    if not SubscriptionService.has_feature(user, "ai_prompt"):
        return _noop(original_prompt)

    # 3. Check credits before calling LLM
    if service.cost_per_call > 0:
        user.refresh_from_db()
        if user.balance < service.cost_per_call:
            logger.warning("Insufficient credits for prompt enhancement: user=%s", user.pk)
            return _noop(original_prompt)

    # 4. Call LLM
    try:
        enhanced_text = _call_llm(service, original_prompt)
    except Exception:
        logger.exception("Prompt enhancement LLM call failed, using original prompt")
        return _noop(original_prompt)

    # 5. Validate response
    if not enhanced_text:
        return _noop(original_prompt)

    # 6. Debit credits
    cost = Decimal("0")
    if service.cost_per_call > 0:
        debit_result = CreditsService().debit_flat(
            user=user,
            amount=service.cost_per_call,
            reason=CreditsTransaction.REASON_PROMPT_ENHANCEMENT,
        )
        if not debit_result.ok:
            return _noop(original_prompt)
        cost = debit_result.cost

    return EnhanceResult(prompt=enhanced_text, was_enhanced=True, cost=cost)
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
docker compose exec backend python manage.py test apps.ai_services.tests.test_prompt_enhance -v2
```

Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/ai_services/services/
git commit -m "feat(ai_services): implement enhance_prompt() with credits + feature gate"
```

---

## Task 5: Integration — orchestration.py + tasks.py

**Files:**
- Modify: `backend/apps/elements/orchestration.py:53`, `backend/apps/elements/tasks.py:86-91`
- Test: `backend/apps/elements/tests.py`

- [ ] **Step 1: Write orchestration integration tests**

```python
# Add to backend/apps/elements/tests.py

class OrchestrationEnhancePromptTests(TestCase):
    """Tests for prompt enhancement integration in create_generation()."""

    def setUp(self):
        from apps.ai_providers.models import AIProvider, AIModel
        from apps.ai_services.models import LLMProvider, AIService
        from apps.credits.models import CreditsTransaction
        from apps.credits.services import CreditsService

        self.user = User.objects.create_user(username="orch_test", password="x")
        CreditsService().topup(
            user=self.user, amount=Decimal("500.00"),
            reason=CreditsTransaction.REASON_ADMIN_TOPUP,
        )
        self.project = Project.objects.create(title="Test Project", user=self.user)
        self.scene = Scene.objects.create(title="Test Scene", project=self.project, order=0)

        ai_provider = AIProvider.objects.create(
            name="Test Provider", base_url="https://api.test.com",
            api_key="test-key",
        )
        self.ai_model = AIModel.objects.create(
            provider=ai_provider, name="Test Model",
            model_type="IMAGE", api_endpoint="/v1/generate",
            request_schema={"prompt": "{{prompt}}"},
            pricing_schema={"fixed_cost": "10.00"},
        )

        # LLM provider + service for enhancement
        llm_provider = LLMProvider.objects.create(
            name="Test LLM", provider_type="openai_compatible",
            api_base_url="https://api.test.com", api_key="sk-test",
        )
        AIService.objects.create(
            service_type=AIService.PROMPT_ENHANCE, name="Test Enhance",
            provider=llm_provider, model_name="test-model",
            system_prompt="Enhance.", cost_per_call=Decimal("1.00"),
            parameters={"max_tokens": 100},
        )

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    @patch("apps.elements.tasks.start_generation.delay")
    def test_enhance_prompt_flag_triggers_enhancement(self, mock_task, mock_llm):
        mock_llm.return_value = "Enhanced: beautiful cat"
        data, status = create_generation(
            project=self.project, scene=self.scene,
            prompt="cat", ai_model_id=self.ai_model.id,
            generation_config={"enhance_prompt": True},
            user=self.user,
        )
        element = Element.objects.get(pk=data["id"])
        assert element.generation_config.get("_enhanced_prompt") == "Enhanced: beautiful cat"
        assert element.generation_config.get("_prompt_enhanced") is True
        assert element.prompt_text == "cat"  # Original preserved

    @patch("apps.elements.tasks.start_generation.delay")
    def test_no_enhance_flag_skips_enhancement(self, mock_task):
        data, status = create_generation(
            project=self.project, scene=self.scene,
            prompt="detailed prompt about a specific subject",
            ai_model_id=self.ai_model.id,
            generation_config={},
            user=self.user,
        )
        element = Element.objects.get(pk=data["id"])
        assert "_enhanced_prompt" not in (element.generation_config or {})

    @patch("apps.ai_services.services.prompt_enhance._call_llm")
    @patch("apps.elements.tasks.start_generation.delay")
    def test_enhance_flag_removed_from_config(self, mock_task, mock_llm):
        mock_llm.return_value = "Enhanced"
        data, _ = create_generation(
            project=self.project, scene=self.scene,
            prompt="test", ai_model_id=self.ai_model.id,
            generation_config={"enhance_prompt": True, "aspect_ratio": "16:9"},
            user=self.user,
        )
        element = Element.objects.get(pk=data["id"])
        assert "enhance_prompt" not in element.generation_config
        assert element.generation_config.get("aspect_ratio") == "16:9"
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
docker compose exec backend python manage.py test apps.elements.tests.OrchestrationEnhancePromptTests -v2
```

- [ ] **Step 3: Modify orchestration.py**

In `backend/apps/elements/orchestration.py`, inside `create_generation()`, after prompt validation (~line 40) and before credits debit (~line 53), insert:

```python
# --- Prompt enhancement ---
enhance_requested = generation_config.pop("enhance_prompt", False)
enhanced_prompt = prompt
enhance_cost = Decimal("0")
was_enhanced = False

if enhance_requested:
    try:
        from apps.ai_services.services.prompt_enhance import enhance_prompt as _enhance
        result = _enhance(prompt, user)
        enhanced_prompt = result.prompt
        enhance_cost = result.cost
        was_enhanced = result.was_enhanced
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Prompt enhancement failed, using original")

if was_enhanced:
    generation_config["_enhanced_prompt"] = enhanced_prompt
    generation_config["_prompt_enhanced"] = True
    generation_config["_enhance_cost"] = str(enhance_cost)
```

Add `from decimal import Decimal` at the top if not already imported.

- [ ] **Step 4: Modify tasks.py**

In `backend/apps/elements/tasks.py`, inside `start_generation()`, replace the `build_generation_context()` call (~lines 86-91):

```python
# Use enhanced prompt if available, otherwise original
config = element.generation_config or {}
prompt_for_provider = config.get("_enhanced_prompt", element.prompt_text) or ""

context = build_generation_context(
    ai_model,
    prompt=prompt_for_provider,
    generation_config=config,
    callback_url=callback_url,
)
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
docker compose exec backend python manage.py test apps.elements.tests.OrchestrationEnhancePromptTests -v2
```

- [ ] **Step 6: Run all backend tests**

```bash
docker compose exec backend python manage.py test -v2
```

Expected: All existing + new tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/apps/elements/orchestration.py backend/apps/elements/tasks.py backend/apps/elements/tests.py
git commit -m "feat(elements): integrate prompt enhancement into generation pipeline"
```

---

## Task 6: Admin Panel

**Files:**
- Create: `backend/apps/ai_services/admin.py`
- Test: `backend/apps/ai_services/tests/test_admin.py`

- [ ] **Step 1: Write admin tests**

```python
# backend/apps/ai_services/tests/test_admin.py
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.test import Client as TestClient
from apps.ai_services.models import LLMProvider, AIService

User = get_user_model()


class AIServicesAdminTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("admin", "a@a.com", "pass")
        self.client = TestClient()
        self.client.login(username="admin", password="pass")

    def test_provider_list_accessible(self):
        response = self.client.get("/admin/ai_services/llmprovider/")
        assert response.status_code == 200

    def test_service_list_accessible(self):
        response = self.client.get("/admin/ai_services/aiservice/")
        assert response.status_code == 200

    def test_create_provider_via_admin(self):
        response = self.client.post("/admin/ai_services/llmprovider/add/", {
            "name": "OpenAI",
            "provider_type": "openai_compatible",
            "api_base_url": "https://api.openai.com",
            "api_key": "sk-test",
            "is_active": True,
        })
        assert response.status_code == 302
        assert LLMProvider.objects.count() == 1
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
docker compose exec backend python manage.py test apps.ai_services.tests.test_admin -v2
```

Expected: FAIL (admin not registered yet)

- [ ] **Step 3: Write admin.py**

```python
# backend/apps/ai_services/admin.py
from django.contrib import admin
from django.utils.html import format_html
from .models import LLMProvider, AIService


@admin.register(LLMProvider)
class LLMProviderAdmin(admin.ModelAdmin):
    list_display = ("name", "provider_type", "display_url", "display_status")
    list_filter = ("provider_type", "is_active")
    readonly_fields = ("created_at",)
    fieldsets = (
        ("Основное", {"fields": ("name", "provider_type", "api_base_url", "api_key", "is_active")}),
        ("Даты", {"fields": ("created_at",), "classes": ("collapse",)}),
    )

    def display_url(self, obj):
        url = obj.api_base_url
        return url[:40] + "..." if len(url) > 40 else url
    display_url.short_description = "URL"

    def display_status(self, obj):
        if obj.is_active:
            return format_html('<span style="color: #4ade80; font-weight: bold;">● Активен</span>')
        return format_html('<span style="color: #94a3b8;">● Неактивен</span>')
    display_status.short_description = "Статус"


@admin.register(AIService)
class AIServiceAdmin(admin.ModelAdmin):
    list_display = ("name", "service_type", "display_provider", "model_name", "display_cost", "display_status")
    list_filter = ("service_type", "is_active")
    readonly_fields = ("created_at",)
    fieldsets = (
        ("Основное", {"fields": ("service_type", "name", "provider", "model_name", "is_active")}),
        ("Системный промпт", {"fields": ("system_prompt",),
         "description": "Инструкция для LLM. Редактируется в формате plain text."}),
        ("Параметры", {"fields": ("parameters",),
         "description": '{"temperature": 0.7, "max_tokens": 500, "top_p": 1.0, "timeout": 15}'}),
        ("Стоимость", {"fields": ("cost_per_call",)}),
        ("Даты", {"fields": ("created_at",), "classes": ("collapse",)}),
    )

    def display_provider(self, obj):
        return obj.provider.name
    display_provider.short_description = "Провайдер"

    def display_cost(self, obj):
        return f"{obj.cost_per_call} кадров"
    display_cost.short_description = "Стоимость"

    def display_status(self, obj):
        if obj.is_active:
            return format_html('<span style="color: #4ade80; font-weight: bold;">● Активен</span>')
        return format_html('<span style="color: #94a3b8;">● Неактивен</span>')
    display_status.short_description = "Статус"
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
docker compose exec backend python manage.py test apps.ai_services.tests.test_admin -v2
```

- [ ] **Step 5: Commit**

```bash
git add backend/apps/ai_services/admin.py backend/apps/ai_services/tests/test_admin.py
git commit -m "feat(ai_services): add admin panel for LLM providers and services"
```

> **Deferred:** Кнопка «Протестировать» в change_form (custom admin action для тестирования промпта) — реализуется в follow-up задаче после первого мануального тестирования.

---

## Task 7: Frontend — Generation Store + Payload

**Files:**
- Modify: `frontend/lib/store/generation.ts`

- [ ] **Step 1: Add `enhancePrompt` state to generation store**

In `frontend/lib/store/generation.ts`, add to the state interface and initial state:

```typescript
// Add to state fields (near line 30):
enhancePrompt: boolean;
setEnhancePrompt: (value: boolean) => void;
```

In the `create()` call, add:

```typescript
enhancePrompt: typeof window !== 'undefined'
  ? localStorage.getItem('enhance_prompt') === 'true'
  : false,
setEnhancePrompt: (value: boolean) => {
  set({ enhancePrompt: value });
  if (typeof window !== 'undefined') {
    localStorage.setItem('enhance_prompt', String(value));
  }
},
```

- [ ] **Step 2: Pass `enhance_prompt` flag in payload**

In `generate()` method (~line 325), add to `generationConfig`:

```typescript
const generationConfig = {
  ...get().parameters,
  ...imageInputsMap,
  ...schemaExtraParams,
  ...(get().enhancePrompt ? { enhance_prompt: true } : {}),
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/store/generation.ts
git commit -m "feat(frontend): add enhancePrompt state and payload flag to generation store"
```

---

## Task 8: Frontend — PromptEnhanceToggle Component

**Files:**
- Create: `frontend/components/generation/PromptEnhanceToggle.tsx`
- Modify: `frontend/components/generation/PromptBar.tsx:248`

- [ ] **Step 1: Create PromptEnhanceToggle component**

```tsx
// frontend/components/generation/PromptEnhanceToggle.tsx
"use client";

import { useState } from "react";
import { useGenerationStore } from "@/lib/store/generation";
import { useSubscriptionStore } from "@/lib/store/subscription";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UpgradeModal } from "@/components/subscription/UpgradeModal";
import { ProBadge } from "@/components/subscription/ProBadge";
import { Info } from "lucide-react";

export function PromptEnhanceToggle() {
  const enhancePrompt = useGenerationStore((s) => s.enhancePrompt);
  const setEnhancePrompt = useGenerationStore((s) => s.setEnhancePrompt);
  const hasFeature = useSubscriptionStore((s) => s.hasFeature("ai_prompt"));
  const [showUpgrade, setShowUpgrade] = useState(false);

  if (!hasFeature) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowUpgrade(true)}
          className="flex items-center gap-1.5 opacity-50 cursor-pointer"
        >
          <Checkbox disabled checked={false} className="h-3.5 w-3.5" />
          <span className="text-xs text-muted-foreground">Усилить промпт</span>
          <ProBadge />
        </button>
        <UpgradeModal
          featureCode="ai_prompt"
          open={showUpgrade}
          onOpenChange={setShowUpgrade}
        />
      </>
    );
  }

  return (
    <TooltipProvider>
      <label className="flex items-center gap-1.5 cursor-pointer">
        <Checkbox
          checked={enhancePrompt}
          onCheckedChange={(checked) => setEnhancePrompt(checked === true)}
          className="h-3.5 w-3.5"
        />
        <span className="text-xs text-muted-foreground">Усилить промпт</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 text-muted-foreground/50" />
          </TooltipTrigger>
          <TooltipContent>
            <p>Короткие промпты будут автоматически дополнены.<br />Детальные останутся как есть.</p>
          </TooltipContent>
        </Tooltip>
      </label>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Add to PromptBar**

In `frontend/components/generation/PromptBar.tsx`, import and add above the bar container. Before the opening `<div className={cn("relative flex items-start gap-3 ..."` (~line 249), add:

```tsx
import { PromptEnhanceToggle } from "./PromptEnhanceToggle";
```

Wrap the return in a fragment and add the pill container:

```tsx
return (
  <div className={cn("m-4", className)}>
    {/* Pill-контейнер для фич */}
    <div className="flex items-center gap-3 px-4 mb-2">
      <PromptEnhanceToggle />
    </div>

    {/* Existing PromptBar */}
    <div className="relative flex items-start gap-3 rounded-xl bg-card p-3 px-4 shadow-lg shadow-black/20 border border-border">
      {/* ... rest of existing content, remove m-4 from this div ... */}
    </div>
  </div>
);
```

Note: Move the `m-4` margin from the inner div to the new outer wrapper div.

- [ ] **Step 3: Verify build compiles**

```bash
docker compose exec frontend npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/components/generation/PromptEnhanceToggle.tsx frontend/components/generation/PromptBar.tsx
git commit -m "feat(frontend): add PromptEnhanceToggle above PromptBar with subscription gating"
```

---

## Task 9: Frontend — DetailPanel Enhancement Display

**Files:**
- Modify: `frontend/components/lightbox/DetailPanel.tsx:29-31,127-141,147-155,257`

- [ ] **Step 1: Add `_` prefix keys to HIDDEN_CONFIG_KEYS**

In `DetailPanel.tsx`, modify the `configParams` filter (~line 129) to also skip `_`-prefixed keys:

```typescript
.filter(([key]) => !HIDDEN_CONFIG_KEYS.has(key) && !key.startsWith("_"))
```

- [ ] **Step 2: Add enhancement cost to metadata**

In the `metadata` array (~line 147), after the `generationCost` entry:

```typescript
const enhanceCost = element.generation_config?.["_enhance_cost"] as string | undefined;
const wasEnhanced = element.generation_config?.["_prompt_enhanced"] === true;

// Add to metadata array:
...(enhanceCost ? [{ label: "Усиление промпта", value: formatCurrency(enhanceCost) }] : []),
```

- [ ] **Step 3: Add enhanced badge to Prompt section header**

In the Prompt section (~line 257), modify the heading:

```tsx
<div className="flex items-center gap-2">
  <h3 className="text-sm font-medium text-muted-foreground mb-2">Промпт</h3>
  {wasEnhanced && (
    <span className="text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded mb-2">
      ✦ Усилен
    </span>
  )}
</div>
```

- [ ] **Step 4: Show enhanced prompt in textarea**

Modify the prompt display logic — if enhanced, show the enhanced prompt:

```typescript
// Near line 70:
const displayPrompt = wasEnhanced
  ? (element.generation_config?.["_enhanced_prompt"] as string) ?? element.prompt_text ?? ""
  : element.prompt_text ?? "";

// Use displayPrompt in the Textarea value
```

Note: The `promptText` state should be initialized from `displayPrompt`, and the save button should still save to `prompt_text`.

- [ ] **Step 5: Verify build**

```bash
docker compose exec frontend npm run build
```

- [ ] **Step 6: Commit**

```bash
git add frontend/components/lightbox/DetailPanel.tsx
git commit -m "feat(frontend): show prompt enhancement info in DetailPanel"
```

---

## Task 10: Seed Data + Manual Testing

**Files:** No code changes — admin setup + verification

- [ ] **Step 1: Create LLMProvider via Django admin**

Navigate to `/admin/ai_services/llmprovider/add/`:
- Name: `OpenAI`
- Тип провайдера: `OpenAI-совместимый`
- Базовый URL API: `https://api.openai.com`
- API-ключ: `ENV:OPENAI_API_KEY` (or direct key for testing)
- Активен: ✓

- [ ] **Step 2: Create AIService for prompt enhancement**

Navigate to `/admin/ai_services/aiservice/add/`:
- Тип сервиса: `Усиление промпта`
- Название: `GPT-4o-mini Enhance`
- Провайдер: `OpenAI`
- Модель: `gpt-4o-mini`
- Системный промпт:

```
You are a prompt enhancement assistant for an AI image/video generation platform.

Your task:
- If the user's prompt is short or vague (under ~30 words), expand it into a detailed, high-quality generation prompt
- If the prompt is already detailed and specific, return it unchanged
- Preserve the original language (Russian or English)
- Add relevant details: style, lighting, composition, mood, camera angle, quality descriptors
- Do NOT change the core subject or intent
- Output ONLY the final prompt text, no explanations or prefixes
```

- Параметры: `{"temperature": 0.7, "max_tokens": 500, "top_p": 1.0}`
- Стоимость: `1.00`
- Активен: ✓

- [ ] **Step 3: Set OPENAI_API_KEY in environment**

Add to `.env` or `docker-compose.yml`:

```bash
OPENAI_API_KEY=sk-your-key-here
```

- [ ] **Step 4: Manual test flow**

1. Open workspace, enable "Усилить промпт" toggle
2. Type short prompt: "котик"
3. Click "Создать"
4. Wait for generation to complete
5. Open in Lightbox → DetailPanel
6. Verify: badge "✦ Усилен" visible, enhanced prompt shown, cost line present
7. Click "Повторить запрос" → verify original prompt "котик" is restored in PromptBar

- [ ] **Step 5: Run full test suite**

```bash
docker compose exec backend python manage.py test -v2
```

- [ ] **Step 6: Final commit (if any code changes during testing)**

No code files should change during manual testing. If fixes were needed, commit them with descriptive messages to the relevant files.
