"""Anthropic Messages API client."""

import requests

from .base import BaseLLMClient, LLMResponse

_DEFAULT_MAX_TOKENS = 1024


class AnthropicClient(BaseLLMClient):
    """Client for the Anthropic Messages API."""

    def chat(
        self,
        system_prompt: str,
        user_message: str,
        params: dict,
        timeout: int = BaseLLMClient.DEFAULT_TIMEOUT,
        model: str = "",
    ) -> LLMResponse:
        url = f"{self.base_url}/v1/messages"

        body = {
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": user_message},
            ],
            "max_tokens": params.get("max_tokens", _DEFAULT_MAX_TOKENS),
        }

        if model:
            body["model"] = model

        # Forward supported params (except max_tokens, already handled)
        for key in ("temperature", "top_p"):
            if key in params:
                body[key] = params[key]

        response = requests.post(
            url,
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=timeout,
        )
        response.raise_for_status()

        data = response.json()
        usage = data.get("usage", {})

        return LLMResponse(
            text=data["content"][0]["text"],
            prompt_tokens=usage.get("input_tokens", 0),
            completion_tokens=usage.get("output_tokens", 0),
        )
