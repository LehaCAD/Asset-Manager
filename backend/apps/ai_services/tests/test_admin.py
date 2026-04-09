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
        count_before = LLMProvider.objects.count()
        response = self.client.post("/admin/ai_services/llmprovider/add/", {
            "name": "OpenAI",
            "provider_type": "openai_compatible",
            "api_base_url": "https://api.openai.com",
            "api_key": "sk-test",
            "is_active": True,
        })
        assert response.status_code == 302
        assert LLMProvider.objects.count() == count_before + 1
