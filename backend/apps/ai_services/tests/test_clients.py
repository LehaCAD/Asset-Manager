"""Tests for LLM client abstraction layer."""

from unittest.mock import MagicMock, patch

import requests
from django.test import SimpleTestCase

from apps.ai_services.clients.anthropic import AnthropicClient
from apps.ai_services.clients.base import LLMResponse
from apps.ai_services.clients.openai_compat import OpenAICompatClient


class OpenAICompatClientTests(SimpleTestCase):
    """Tests for the OpenAI-compatible LLM client."""

    def setUp(self):
        self.client = OpenAICompatClient(
            base_url="https://polza.ai/api/v1",
            api_key="test-key-123",
        )

    def _mock_response(self, *, status_code=200, json_data=None):
        mock_resp = MagicMock()
        mock_resp.status_code = status_code
        mock_resp.json.return_value = json_data or {}
        if status_code >= 400:
            mock_resp.raise_for_status.side_effect = requests.exceptions.HTTPError(
                response=mock_resp,
            )
        else:
            mock_resp.raise_for_status.return_value = None
        return mock_resp

    @patch("apps.ai_services.clients.openai_compat.requests.post")
    def test_chat_success(self, mock_post):
        """Verify request URL, body structure, and response parsing."""
        mock_post.return_value = self._mock_response(
            json_data={
                "choices": [{"message": {"content": "Hello world"}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 5},
            },
        )

        result = self.client.chat(
            system_prompt="You are helpful.",
            user_message="Say hi",
            params={"temperature": 0.7},
        )

        # Verify correct URL
        call_args = mock_post.call_args
        self.assertEqual(
            call_args[0][0], "https://polza.ai/api/v1/v1/chat/completions"
        )

        # Verify headers
        headers = call_args[1]["headers"]
        self.assertEqual(headers["Authorization"], "Bearer test-key-123")
        self.assertEqual(headers["Content-Type"], "application/json")

        # Verify body structure
        body = call_args[1]["json"]
        self.assertEqual(len(body["messages"]), 2)
        self.assertEqual(body["messages"][0]["role"], "system")
        self.assertEqual(body["messages"][0]["content"], "You are helpful.")
        self.assertEqual(body["messages"][1]["role"], "user")
        self.assertEqual(body["messages"][1]["content"], "Say hi")
        self.assertEqual(body["temperature"], 0.7)

        # Verify response parsing
        self.assertIsInstance(result, LLMResponse)
        self.assertEqual(result.text, "Hello world")
        self.assertEqual(result.prompt_tokens, 10)
        self.assertEqual(result.completion_tokens, 5)

    @patch("apps.ai_services.clients.openai_compat.requests.post")
    def test_chat_with_custom_timeout(self, mock_post):
        """Verify timeout is passed through to requests."""
        mock_post.return_value = self._mock_response(
            json_data={
                "choices": [{"message": {"content": "ok"}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            },
        )

        self.client.chat(
            system_prompt="sys",
            user_message="msg",
            params={},
            timeout=30,
        )

        call_args = mock_post.call_args
        self.assertEqual(call_args[1]["timeout"], 30)

    @patch("apps.ai_services.clients.openai_compat.requests.post")
    def test_chat_api_error_raises(self, mock_post):
        """Mock 429 status and verify HTTPError is raised."""
        mock_post.return_value = self._mock_response(status_code=429)

        with self.assertRaises(requests.exceptions.HTTPError):
            self.client.chat(
                system_prompt="sys",
                user_message="msg",
                params={},
            )

    @patch("apps.ai_services.clients.openai_compat.requests.post")
    def test_chat_timeout_raises(self, mock_post):
        """Mock requests.exceptions.Timeout and verify it propagates."""
        mock_post.side_effect = requests.exceptions.Timeout("Connection timed out")

        with self.assertRaises(requests.exceptions.Timeout):
            self.client.chat(
                system_prompt="sys",
                user_message="msg",
                params={},
            )

    @patch("apps.ai_services.clients.openai_compat.requests.post")
    def test_chat_model_param_forwarded(self, mock_post):
        """Verify model parameter is included in request body."""
        mock_post.return_value = self._mock_response(
            json_data={
                "choices": [{"message": {"content": "ok"}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            },
        )

        self.client.chat(
            system_prompt="sys",
            user_message="msg",
            params={},
            model="openai/gpt-4.1-mini",
        )

        body = mock_post.call_args[1]["json"]
        self.assertEqual(body["model"], "openai/gpt-4.1-mini")

    @patch("apps.ai_services.clients.openai_compat.requests.post")
    def test_chat_default_timeout(self, mock_post):
        """Verify default timeout is used when not specified."""
        mock_post.return_value = self._mock_response(
            json_data={
                "choices": [{"message": {"content": "ok"}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            },
        )

        self.client.chat(
            system_prompt="sys",
            user_message="msg",
            params={},
        )

        call_args = mock_post.call_args
        self.assertEqual(call_args[1]["timeout"], 15)


class AnthropicClientTests(SimpleTestCase):
    """Tests for the Anthropic LLM client."""

    def setUp(self):
        self.client = AnthropicClient(
            base_url="https://api.anthropic.com",
            api_key="sk-ant-test-key",
        )

    def _mock_response(self, *, status_code=200, json_data=None):
        mock_resp = MagicMock()
        mock_resp.status_code = status_code
        mock_resp.json.return_value = json_data or {}
        if status_code >= 400:
            mock_resp.raise_for_status.side_effect = requests.exceptions.HTTPError(
                response=mock_resp,
            )
        else:
            mock_resp.raise_for_status.return_value = None
        return mock_resp

    @patch("apps.ai_services.clients.anthropic.requests.post")
    def test_chat_success(self, mock_post):
        """Verify URL, system as top-level param, and response parsing."""
        mock_post.return_value = self._mock_response(
            json_data={
                "content": [{"text": "Anthropic says hello"}],
                "usage": {"input_tokens": 12, "output_tokens": 8},
            },
        )

        result = self.client.chat(
            system_prompt="You are helpful.",
            user_message="Say hi",
            params={"max_tokens": 2048},
        )

        call_args = mock_post.call_args

        # Verify correct URL
        self.assertEqual(
            call_args[0][0], "https://api.anthropic.com/v1/messages"
        )

        # Verify headers
        headers = call_args[1]["headers"]
        self.assertEqual(headers["x-api-key"], "sk-ant-test-key")
        self.assertEqual(headers["anthropic-version"], "2023-06-01")
        self.assertEqual(headers["Content-Type"], "application/json")

        # Verify body: system is top-level, NOT in messages
        body = call_args[1]["json"]
        self.assertEqual(body["system"], "You are helpful.")
        self.assertEqual(len(body["messages"]), 1)
        self.assertEqual(body["messages"][0]["role"], "user")
        self.assertEqual(body["messages"][0]["content"], "Say hi")
        self.assertEqual(body["max_tokens"], 2048)

        # Verify response parsing
        self.assertIsInstance(result, LLMResponse)
        self.assertEqual(result.text, "Anthropic says hello")
        self.assertEqual(result.prompt_tokens, 12)
        self.assertEqual(result.completion_tokens, 8)

    @patch("apps.ai_services.clients.anthropic.requests.post")
    def test_chat_max_tokens_required(self, mock_post):
        """Verify max_tokens is always in body even if not in params."""
        mock_post.return_value = self._mock_response(
            json_data={
                "content": [{"text": "ok"}],
                "usage": {"input_tokens": 1, "output_tokens": 1},
            },
        )

        self.client.chat(
            system_prompt="sys",
            user_message="msg",
            params={},  # No max_tokens provided
        )

        body = mock_post.call_args[1]["json"]
        self.assertIn("max_tokens", body)
        self.assertEqual(body["max_tokens"], 1024)  # Default value
