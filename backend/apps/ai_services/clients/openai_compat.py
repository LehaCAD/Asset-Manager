"""OpenAI-compatible LLM client.

Works with any provider that implements the OpenAI chat completions API
(e.g., Polza.ai, OpenRouter, local vLLM/Ollama).
"""

import requests

from .base import BaseLLMClient, LLMResponse


class OpenAICompatClient(BaseLLMClient):
    """Client for OpenAI-compatible chat completions API."""

    def chat(
        self,
        system_prompt: str,
        user_message: str,
        params: dict,
        timeout: int = BaseLLMClient.DEFAULT_TIMEOUT,
        model: str = "",
    ) -> LLMResponse:
        url = f"{self.base_url}/v1/chat/completions"

        body = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        }

        if model:
            body["model"] = model

        # Forward supported params
        for key in ("temperature", "max_tokens", "top_p"):
            if key in params:
                body[key] = params[key]

        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=timeout,
        )
        response.raise_for_status()

        data = response.json()
        usage = data.get("usage", {})

        return LLMResponse(
            text=data["choices"][0]["message"]["content"],
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
        )
