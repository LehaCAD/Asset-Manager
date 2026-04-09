import json
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
    if provider.provider_type == LLMProvider.ANTHROPIC:
        from apps.ai_services.clients.anthropic import AnthropicClient
        return AnthropicClient(provider.api_base_url, api_key)
    from apps.ai_services.clients.openai_compat import OpenAICompatClient
    return OpenAICompatClient(provider.api_base_url, api_key)


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

    # 3. Pre-check credits (optimization — avoid LLM call if can't pay)
    if service.cost_per_call > 0:
        user.refresh_from_db()
        if user.balance < service.cost_per_call:
            logger.warning("Insufficient credits for prompt enhancement: user=%s", user.pk)
            return _noop(original_prompt)

    # 4. Call LLM — ALWAYS enhance, no short/long logic
    try:
        enhanced_text = _call_llm(service, original_prompt)
    except Exception:
        logger.exception("Prompt enhancement LLM call failed, using original prompt")
        return _noop(original_prompt)

    # 5. Validate response
    if not enhanced_text:
        return _noop(original_prompt)

    # 6. Parse JSON response — LLM outputs {"enhanced_prompt": "..."}
    try:
        parsed = json.loads(enhanced_text)
        final_prompt = parsed.get("enhanced_prompt", "").strip()
        if not final_prompt:
            return _noop(original_prompt)
    except (json.JSONDecodeError, AttributeError):
        # If LLM returns plain text instead of JSON, use it as-is
        final_prompt = enhanced_text

    # 7. Debit credits
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

    return EnhanceResult(prompt=final_prompt, was_enhanced=True, cost=cost)
