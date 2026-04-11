from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from .models import Conversation, Message, Attachment, FeedbackReward

User = get_user_model()


def _make_user(username="testuser", is_staff=False):
    user = User.objects.create_user(username=username, password="test123")
    if is_staff:
        user.is_staff = True
        user.save(update_fields=["is_staff"])
    return user


def _make_conversation(user):
    return Conversation.objects.create(user=user)


def _make_message(conv, sender, is_admin=False, text="test"):
    return Message.objects.create(
        conversation=conv, sender=sender, is_admin=is_admin, text=text,
    )


class TestConversationModel(TestCase):
    def test_one_conversation_per_user(self):
        user = _make_user()
        conv = _make_conversation(user)
        self.assertEqual(conv.status, Conversation.STATUS_OPEN)
        self.assertEqual(conv.user, user)

    def test_ordering_by_updated_at(self):
        u1 = _make_user("user1")
        u2 = _make_user("user2")
        c1 = _make_conversation(u1)
        c2 = _make_conversation(u2)
        _make_message(c1, u1)
        convs = list(Conversation.objects.all())
        self.assertEqual(convs[0].id, c2.id)


class TestUserAPI(TestCase):
    def setUp(self):
        self.user = _make_user()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_get_conversation_404_when_none(self):
        resp = self.client.get("/api/feedback/conversation/")
        self.assertEqual(resp.status_code, 404)

    def test_create_conversation(self):
        resp = self.client.post("/api/feedback/conversation/")
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(Conversation.objects.filter(user=self.user).exists())

    @patch("apps.feedback.services.get_channel_layer")
    @patch("apps.feedback.services.create_notification")
    def test_send_message(self, mock_notify, mock_channel):
        mock_channel.return_value = MagicMock()
        resp = self.client.post("/api/feedback/messages/", {"text": "Bug report"})
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(Message.objects.count(), 1)
        msg = Message.objects.first()
        self.assertEqual(msg.text, "Bug report")
        self.assertFalse(msg.is_admin)

    @patch("apps.feedback.services.get_channel_layer")
    @patch("apps.feedback.services.create_notification")
    def test_send_message_creates_conversation_if_missing(self, mock_notify, mock_channel):
        mock_channel.return_value = MagicMock()
        self.client.post("/api/feedback/messages/", {"text": "Hello"})
        self.assertTrue(Conversation.objects.filter(user=self.user).exists())

    @patch("apps.feedback.services.get_channel_layer")
    @patch("apps.feedback.services.create_notification")
    def test_send_message_reopens_resolved(self, mock_notify, mock_channel):
        mock_channel.return_value = MagicMock()
        conv = _make_conversation(self.user)
        conv.status = Conversation.STATUS_RESOLVED
        conv.save()
        self.client.post("/api/feedback/messages/", {"text": "Still broken"})
        conv.refresh_from_db()
        self.assertEqual(conv.status, Conversation.STATUS_OPEN)

    def test_get_messages(self):
        conv = _make_conversation(self.user)
        _make_message(conv, self.user, text="msg1")
        _make_message(conv, self.user, text="msg2")
        resp = self.client.get("/api/feedback/messages/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)

    def test_mark_read(self):
        conv = _make_conversation(self.user)
        resp = self.client.post("/api/feedback/conversation/read/")
        self.assertEqual(resp.status_code, 200)
        conv.refresh_from_db()
        self.assertIsNotNone(conv.user_last_read_at)


class TestAdminAPI(TestCase):
    def setUp(self):
        self.admin = _make_user("admin", is_staff=True)
        self.user = _make_user("user1")
        self.conv = _make_conversation(self.user)
        _make_message(self.conv, self.user, text="Help!")
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_list_conversations(self):
        resp = self.client.get("/api/feedback/admin/conversations/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_filter_by_status(self):
        resp = self.client.get("/api/feedback/admin/conversations/?status=resolved")
        self.assertEqual(len(resp.data), 0)

    @patch("apps.feedback.services.get_channel_layer")
    @patch("apps.feedback.services.create_notification")
    def test_admin_reply(self, mock_notify, mock_channel):
        mock_channel.return_value = MagicMock()
        resp = self.client.post(
            f"/api/feedback/admin/conversations/{self.conv.id}/messages/",
            {"text": "Fixed!"},
        )
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data["is_admin"])

    def test_update_status(self):
        resp = self.client.patch(
            f"/api/feedback/admin/conversations/{self.conv.id}/",
            {"status": "resolved"},
        )
        self.assertEqual(resp.status_code, 200)
        self.conv.refresh_from_db()
        self.assertEqual(self.conv.status, Conversation.STATUS_RESOLVED)

    def test_update_tag(self):
        self.client.patch(
            f"/api/feedback/admin/conversations/{self.conv.id}/",
            {"tag": "bug"},
        )
        self.conv.refresh_from_db()
        self.assertEqual(self.conv.tag, Conversation.TAG_BUG)

    @patch("apps.feedback.services.CreditsService")
    @patch("apps.feedback.services.create_notification")
    @patch("apps.feedback.services.get_channel_layer")
    def test_grant_reward(self, mock_channel, mock_notify, mock_cs_class):
        mock_channel.return_value = MagicMock()
        mock_cs = MagicMock()
        mock_cs.topup.return_value = MagicMock(balance_after=Decimal("100"))
        mock_cs_class.return_value = mock_cs

        resp = self.client.post(
            f"/api/feedback/admin/conversations/{self.conv.id}/reward/",
            {"amount": "50", "comment": "За баг"},
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(FeedbackReward.objects.count(), 1)
        mock_cs.topup.assert_called_once()

    def test_delete_message(self):
        msg = _make_message(self.conv, self.user, text="spam")
        resp = self.client.delete(f"/api/feedback/admin/messages/{msg.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Message.objects.filter(id=msg.id).exists())

    def test_admin_mark_read(self):
        resp = self.client.post(
            f"/api/feedback/admin/conversations/{self.conv.id}/read/"
        )
        self.assertEqual(resp.status_code, 200)
        self.conv.refresh_from_db()
        self.assertIsNotNone(self.conv.admin_last_read_at)

    @patch("apps.feedback.services.get_channel_layer")
    @patch("apps.feedback.services.create_notification")
    def test_staff_can_presign_for_admin_message(self, mock_notify, mock_channel):
        mock_channel.return_value = MagicMock()
        # Admin sends a reply first
        resp = self.client.post(
            f"/api/feedback/admin/conversations/{self.conv.id}/messages/",
            {"text": "Let me check"},
        )
        msg_id = resp.data["id"]
        # Admin can presign for their own message
        with patch("apps.feedback.views.boto3.client") as mock_boto:
            mock_s3 = MagicMock()
            mock_s3.generate_presigned_url.return_value = "https://s3.example.com/presigned"
            mock_boto.return_value = mock_s3
            resp = self.client.post(
                f"/api/feedback/messages/{msg_id}/presign/",
                {"file_name": "screen.png", "content_type": "image/png"},
            )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("upload_url", resp.data)

    def test_unread_total(self):
        # user already sent one message in setUp
        resp = self.client.get("/api/feedback/admin/unread-total/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("unread_total", resp.data)
        self.assertGreaterEqual(resp.data["unread_total"], 0)

    def test_non_staff_cannot_access_admin_endpoints(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get("/api/feedback/admin/conversations/")
        self.assertEqual(resp.status_code, 403)
