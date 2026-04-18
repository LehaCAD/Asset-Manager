"""Base LLM client abstraction."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class LLMResponse:
    """Standardized response from any LLM provider."""

    text: str
    prompt_tokens: int
    completion_tokens: int


class BaseLLMClient(ABC):
    """Abstract base class for LLM API clients."""

    DEFAULT_TIMEOUT = 15

    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    @abstractmethod
    def chat(
        self,
        system_prompt: str,
        user_message: str,
        params: dict,
        timeout: int = DEFAULT_TIMEOUT,
        model: str = "",
    ) -> LLMResponse:
        """Send a chat request and return a standardized response.

        Args:
            system_prompt: System-level instruction for the model.
            user_message: User message content.
            params: Provider-specific parameters (temperature, max_tokens, etc.).
            timeout: Request timeout in seconds.
            model: Model identifier (provider-specific).

        Returns:
            LLMResponse with text and token usage.
        """
        ...
