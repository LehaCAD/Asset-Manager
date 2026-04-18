from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
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
    def test_conversation_creation(self):
        user = _make_user()
        conv = _make_conversation(user)
        self.assertEqual(conv.status, Conversation.STATUS_OPEN)
        self.assertEqual(conv.user, user)

    def test_multiple_conversations_per_user(self):
        """ForeignKey allows multiple conversations per user."""
        user = _make_user()
        c1 = _make_conversation(user)
        c2 = _make_conversation(user)
        self.assertNotEqual(c1.id, c2.id)
        self.assertEqual(Conversation.objects.filter(user=user).count(), 2)

    def test_status_closed(self):
        user = _make_user()
        conv = _make_conversation(user)
        conv.status = Conversation.STATUS_CLOSED
        conv.save()
        conv.refresh_from_db()
        self.assertEqual(conv.status, "closed")

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
        self.assertIn("can_reply", resp.data)
        self.assertTrue(resp.data["can_reply"])

    def test_create_conversation_returns_existing_open(self):
        """POST returns existing open conversation instead of creating new."""
        self.client.post("/api/feedback/conversation/")
        resp = self.client.post("/api/feedback/conversation/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Conversation.objects.filter(user=self.user).count(), 1)

    def test_get_conversation_returns_active_over_closed(self):
        """GET returns non-closed conversation when both exist."""
        closed = _make_conversation(self.user)
        closed.status = Conversation.STATUS_CLOSED
        closed.save()
        active = _make_conversation(self.user)
        resp = self.client.get("/api/feedback/conversation/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["id"], active.id)

    def test_get_conversation_returns_closed_when_no_active(self):
        """GET returns latest closed if no active conversations."""
        closed = _make_conversation(self.user)
        closed.status = Conversation.STATUS_CLOSED
        closed.save()
        resp = self.client.get("/api/feedback/conversation/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["id"], closed.id)
        self.assertFalse(resp.data["can_reply"])

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
    def test_send_message_creates_new_when_closed(self, mock_notify, mock_channel):
        """Sending a message when conversation is closed creates a new one."""
        mock_channel.return_value = MagicMock()
        conv = _make_conversation(self.user)
        conv.status = Conversation.STATUS_CLOSED
        conv.save()
        resp = self.client.post("/api/feedback/messages/", {"text": "Still broken"})
        self.assertEqual(resp.status_code, 201)
        # Should have 2 conversations: old closed + new open
        self.assertEqual(Conversation.objects.filter(user=self.user).count(), 2)
        new_conv = Conversation.objects.filter(user=self.user, status=Conversation.STATUS_OPEN).first()
        self.assertIsNotNone(new_conv)
        self.assertNotEqual(new_conv.id, conv.id)

    @patch("apps.feedback.services.get_channel_layer")
    @patch("apps.feedback.services.create_notification")
    def test_send_message_creates_new_when_all_closed(self, mock_notify, mock_channel):
        """Sending a message when all conversations are closed creates a new one."""
        mock_channel.return_value = MagicMock()
        conv = _make_conversation(self.user)
        conv.status = Conversation.STATUS_CLOSED
        conv.save()
        resp = self.client.post("/api/feedback/messages/", {"text": "New topic"})
        self.assertEqual(resp.status_code, 201)
        # Should have 2 conversations now: old closed + new open
        self.assertEqual(Conversation.objects.filter(user=self.user).count(), 2)
        new_conv = Conversation.objects.filter(user=self.user, status=Conversation.STATUS_OPEN).first()
        self.assertIsNotNone(new_conv)
        self.assertNotEqual(new_conv.id, conv.id)

    def test_conversation_history(self):
        """User can list all their conversations."""
        c1 = _make_conversation(self.user)
        c2 = _make_conversation(self.user)
        c2.status = Conversation.STATUS_CLOSED
        c2.save()
        resp = self.client.get("/api/feedback/conversations/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)

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
        resp = self.client.get("/api/feedback/admin/conversations/?status=closed")
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
            {"status": "closed"},
        )
        self.assertEqual(resp.status_code, 200)
        self.conv.refresh_from_db()
        self.assertEqual(self.conv.status, Conversation.STATUS_CLOSED)

    def test_update_tag(self):
        self.client.patch(
            f"/api/feedback/admin/conversations/{self.conv.id}/",
            {"tag": "bug"},
        )
        self.conv.refresh_from_db()
        self.assertEqual(self.conv.tag, Conversation.TAG_BUG)

    @patch("apps.credits.services.CreditsService")
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

    @patch("apps.feedback.services.get_channel_layer")
    def test_delete_message(self, mock_channel):
        mock_channel.return_value = MagicMock()
        msg = _make_message(self.conv, self.user, text="spam")
        resp = self.client.delete(f"/api/feedback/admin/messages/{msg.id}/")
        self.assertEqual(resp.status_code, 204)
        # Soft-delete: message still exists but is marked deleted
        msg.refresh_from_db()
        self.assertTrue(msg.is_deleted)
        self.assertEqual(msg.text, "")

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
        with patch("apps.common.s3.get_s3_client") as mock_boto:
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


class TestAdvancedFeatures(TestCase):
    """Tests for message editing, soft delete, pagination, and serializer output."""

    def setUp(self):
        self.admin = _make_user("admin", is_staff=True)
        self.user = _make_user("user1")
        self.conv = _make_conversation(self.user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    # ─── Message editing ────────────────────────────────────

    @patch("apps.feedback.services.get_channel_layer")
    @patch("apps.feedback.services.create_notification")
    def test_admin_can_edit_own_message(self, mock_notify, mock_channel):
        mock_channel.return_value = MagicMock()
        # Admin sends a reply
        resp = self.client.post(
            f"/api/feedback/admin/conversations/{self.conv.id}/messages/",
            {"text": "Original text"},
        )
        msg_id = resp.data["id"]

        # Admin edits the reply
        resp = self.client.patch(
            f"/api/feedback/admin/messages/{msg_id}/",
            {"text": "Updated text"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["text"], "Updated text")
        self.assertIsNotNone(resp.data["edited_at"])

        # Verify in DB
        msg = Message.objects.get(id=msg_id)
        self.assertEqual(msg.text, "Updated text")
        self.assertIsNotNone(msg.edited_at)

    def test_admin_cannot_edit_user_message(self):
        """Admin cannot PATCH a user's message (is_admin=False)."""
        msg = _make_message(self.conv, self.user, is_admin=False, text="User message")
        resp = self.client.patch(
            f"/api/feedback/admin/messages/{msg.id}/",
            {"text": "Hacked"},
        )
        self.assertEqual(resp.status_code, 404)
        # DB unchanged
        msg.refresh_from_db()
        self.assertEqual(msg.text, "User message")

    @patch("apps.feedback.services.get_channel_layer")
    @patch("apps.feedback.services.create_notification")
    def test_admin_cannot_edit_with_empty_text(self, mock_notify, mock_channel):
        mock_channel.return_value = MagicMock()
        # Admin sends a reply
        resp = self.client.post(
            f"/api/feedback/admin/conversations/{self.conv.id}/messages/",
            {"text": "Will try to blank this"},
        )
        msg_id = resp.data["id"]

        # Try editing with empty text
        resp = self.client.patch(
            f"/api/feedback/admin/messages/{msg_id}/",
            {"text": ""},
        )
        self.assertEqual(resp.status_code, 400)

        # Try editing with whitespace-only text
        resp = self.client.patch(
            f"/api/feedback/admin/messages/{msg_id}/",
            {"text": "   "},
        )
        self.assertEqual(resp.status_code, 400)

    @patch("apps.feedback.services.get_channel_layer")
    @patch("apps.feedback.services.create_notification")
    def test_edit_preserves_attachments(self, mock_notify, mock_channel):
        mock_channel.return_value = MagicMock()
        # Admin sends a reply
        resp = self.client.post(
            f"/api/feedback/admin/conversations/{self.conv.id}/messages/",
            {"text": "See attached"},
        )
        msg_id = resp.data["id"]
        msg = Message.objects.get(id=msg_id)

        # Create attachment directly in DB
        att = Attachment.objects.create(
            message=msg,
            file_key="feedback/test/screenshot.png",
            file_name="screenshot.png",
            file_size=12345,
            content_type="image/png",
        )

        # Edit the message
        resp = self.client.patch(
            f"/api/feedback/admin/messages/{msg_id}/",
            {"text": "Updated: see attached"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["text"], "Updated: see attached")

        # Attachments still exist
        self.assertTrue(Attachment.objects.filter(id=att.id).exists())
        self.assertEqual(msg.attachments.count(), 1)

    # ─── Soft delete ────────────────────────────────────────

    @patch("apps.feedback.views.admin_message_actions.__wrapped__", None)
    @patch("apps.feedback.services.get_channel_layer")
    def test_soft_delete_message(self, mock_channel):
        mock_channel.return_value = MagicMock()
        msg = _make_message(self.conv, self.user, text="delete me")

        resp = self.client.delete(f"/api/feedback/admin/messages/{msg.id}/")
        self.assertEqual(resp.status_code, 204)

        # Message still in DB but soft-deleted
        msg.refresh_from_db()
        self.assertTrue(msg.is_deleted)
        self.assertEqual(msg.text, "")

    @patch("apps.feedback.services.get_channel_layer")
    def test_soft_delete_already_deleted(self, mock_channel):
        mock_channel.return_value = MagicMock()
        msg = _make_message(self.conv, self.user, text="already gone")

        # First delete
        self.client.delete(f"/api/feedback/admin/messages/{msg.id}/")

        # Second delete should 404
        resp = self.client.delete(f"/api/feedback/admin/messages/{msg.id}/")
        self.assertEqual(resp.status_code, 404)

    @patch("apps.feedback.services.get_channel_layer")
    @patch("apps.feedback.services.create_notification")
    def test_deleted_messages_hidden_from_api(self, mock_notify, mock_channel):
        mock_channel.return_value = MagicMock()
        # Create 3 messages
        msg1 = _make_message(self.conv, self.user, text="msg1")
        msg2 = _make_message(self.conv, self.user, text="msg2")
        msg3 = _make_message(self.conv, self.user, text="msg3")

        # Soft-delete msg2
        self.client.delete(f"/api/feedback/admin/messages/{msg2.id}/")

        # Admin messages endpoint should return only 2
        resp = self.client.get(
            f"/api/feedback/admin/conversations/{self.conv.id}/messages/"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)
        returned_ids = [m["id"] for m in resp.data]
        self.assertIn(msg1.id, returned_ids)
        self.assertNotIn(msg2.id, returned_ids)
        self.assertIn(msg3.id, returned_ids)

        # User messages endpoint should also hide deleted
        self.client.force_authenticate(user=self.user)
        resp = self.client.get("/api/feedback/messages/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)
        returned_ids = [m["id"] for m in resp.data]
        self.assertNotIn(msg2.id, returned_ids)

    # ─── Pagination ─────────────────────────────────────────

    @patch("apps.feedback.services.get_channel_layer")
    def test_messages_pagination_30(self, mock_channel):
        mock_channel.return_value = MagicMock()
        # Create 35 messages
        for i in range(35):
            _make_message(self.conv, self.user, text=f"msg-{i}")

        # First page: should return 30
        resp = self.client.get(
            f"/api/feedback/admin/conversations/{self.conv.id}/messages/"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 30)

        # Second page: use the oldest message id from first page as cursor
        # The response is ordered chronologically (oldest first after reversing)
        oldest_id = resp.data[0]["id"]
        resp2 = self.client.get(
            f"/api/feedback/admin/conversations/{self.conv.id}/messages/?cursor={oldest_id}"
        )
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(len(resp2.data), 5)

    @patch("apps.feedback.services.get_channel_layer")
    def test_cursor_pagination(self, mock_channel):
        mock_channel.return_value = MagicMock()
        # Create 5 messages
        msgs = []
        for i in range(5):
            msgs.append(_make_message(self.conv, self.user, text=f"cursor-{i}"))

        # Request with cursor = id of the 3rd message (index 2)
        # Should return messages with id < cursor, i.e. msg[0] and msg[1]
        cursor_id = msgs[2].id
        resp = self.client.get(
            f"/api/feedback/admin/conversations/{self.conv.id}/messages/?cursor={cursor_id}"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)
        # All returned IDs should be < cursor_id
        for m in resp.data:
            self.assertLess(m["id"], cursor_id)

    # ─── Edited message serialization ───────────────────────

    @patch("apps.feedback.services.get_channel_layer")
    @patch("apps.feedback.services.create_notification")
    def test_edited_at_in_serializer(self, mock_notify, mock_channel):
        mock_channel.return_value = MagicMock()
        # Admin sends and then edits a message
        resp = self.client.post(
            f"/api/feedback/admin/conversations/{self.conv.id}/messages/",
            {"text": "Before edit"},
        )
        msg_id = resp.data["id"]

        # Edit it
        resp = self.client.patch(
            f"/api/feedback/admin/messages/{msg_id}/",
            {"text": "After edit"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIsNotNone(resp.data["edited_at"])
        self.assertEqual(resp.data["text"], "After edit")

        # Also verify via the messages list endpoint
        resp = self.client.get(
            f"/api/feedback/admin/conversations/{self.conv.id}/messages/"
        )
        edited_msg = next(m for m in resp.data if m["id"] == msg_id)
        self.assertIsNotNone(edited_msg["edited_at"])

    @patch("apps.feedback.services.get_channel_layer")
    @patch("apps.feedback.services.create_notification")
    def test_unedited_message_has_null_edited_at(self, mock_notify, mock_channel):
        mock_channel.return_value = MagicMock()
        resp = self.client.post(
            f"/api/feedback/admin/conversations/{self.conv.id}/messages/",
            {"text": "Never edited"},
        )
        self.assertEqual(resp.status_code, 201)
        self.assertIsNone(resp.data["edited_at"])

    @patch("apps.feedback.services.get_channel_layer")
    @patch("apps.feedback.services.create_notification")
    def test_soft_delete_clears_attachments(self, mock_notify, mock_channel):
        """Soft delete clears attachment file_key and marks expired."""
        mock_channel.return_value = MagicMock()
        # Create message and attachment
        msg = _make_message(self.conv, self.user, text="with file")
        att = Attachment.objects.create(
            message=msg, file_key="feedback/1/test.jpg",
            file_name="test.jpg", file_size=1000, content_type="image/jpeg",
        )

        with patch("apps.common.s3.get_s3_client") as mock_s3:
            mock_client = MagicMock()
            mock_s3.return_value = mock_client
            resp = self.client.delete(f"/api/feedback/admin/messages/{msg.id}/")

        self.assertEqual(resp.status_code, 204)
        att.refresh_from_db()
        self.assertEqual(att.file_key, "")
        self.assertTrue(att.is_expired)


class TestAdminManagement(TestCase):
    """Tests for admin management: clear history, delete conv, clear attachments, stats, bulk."""

    def setUp(self):
        self.admin = _make_user("admin", is_staff=True)
        self.user = _make_user("user1")
        self.conv = _make_conversation(self.user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    @patch("apps.common.s3.get_s3_client")
    @patch("apps.feedback.services.get_channel_layer")
    def test_clear_history(self, mock_channel, mock_s3):
        mock_channel.return_value = MagicMock()
        mock_s3.return_value = MagicMock()
        _make_message(self.conv, self.user, text="msg1")
        _make_message(self.conv, self.user, text="msg2")
        resp = self.client.post(f"/api/feedback/admin/conversations/{self.conv.id}/clear/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Message.objects.filter(conversation=self.conv).count(), 0)

    @patch("apps.common.s3.get_s3_client")
    def test_delete_conversation(self, mock_s3):
        mock_s3.return_value = MagicMock()
        _make_message(self.conv, self.user, text="msg")
        resp = self.client.delete(f"/api/feedback/admin/conversations/{self.conv.id}/delete/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Conversation.objects.filter(id=self.conv.id).exists())

    @patch("apps.common.s3.get_s3_client")
    def test_clear_attachments(self, mock_s3):
        mock_s3.return_value = MagicMock()
        msg = _make_message(self.conv, self.user, text="with file")
        Attachment.objects.create(message=msg, file_key="feedback/1/test.jpg", file_name="test.jpg", file_size=1000, content_type="image/jpeg")
        resp = self.client.post(f"/api/feedback/admin/conversations/{self.conv.id}/clear-attachments/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["attachments_removed"], 1)
        att = Attachment.objects.first()
        self.assertTrue(att.is_expired)

    def test_conversation_stats(self):
        _make_message(self.conv, self.user, text="msg1")
        _make_message(self.conv, self.user, text="msg2")
        resp = self.client.get(f"/api/feedback/admin/conversations/{self.conv.id}/stats/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["messages"], 2)

    def test_bulk_close_all(self):
        resp = self.client.post("/api/feedback/admin/bulk/", {"action": "close_all_open"})
        self.assertEqual(resp.status_code, 200)
        self.conv.refresh_from_db()
        self.assertEqual(self.conv.status, "closed")


class TestAdapterAndIntegration(TestCase):
    """Tests for CreditsAdapter, S3 client, and integration points."""

    def setUp(self):
        self.admin = _make_user("admin", is_staff=True)
        self.user = _make_user("user1")
        self.conv = _make_conversation(self.user)
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    @patch("apps.credits.services.CreditsService")
    @patch("apps.feedback.services.create_notification")
    @patch("apps.feedback.services.get_channel_layer")
    def test_credits_adapter_called_on_reward(self, mock_channel, mock_notify, mock_cs_class):
        """CreditsAdapter correctly calls CreditsService.topup."""
        mock_channel.return_value = MagicMock()
        mock_cs = MagicMock()
        mock_cs.topup.return_value = MagicMock(balance_after=Decimal("100"))
        mock_cs_class.return_value = mock_cs

        resp = self.client.post(
            f"/api/feedback/admin/conversations/{self.conv.id}/reward/",
            {"amount": "25", "comment": "Test reward"},
        )
        self.assertEqual(resp.status_code, 201)
        mock_cs.topup.assert_called_once()
        # Verify topup was called with correct reason
        call_kwargs = mock_cs.topup.call_args
        self.assertEqual(call_kwargs.kwargs.get('reason') or call_kwargs[1].get('reason'), 'feedback_reward')

    def test_s3_client_import(self):
        """Shared S3 client is importable and returns correct type."""
        from apps.common.s3 import get_s3_client, get_bucket_name
        # Just verify imports work — don't actually connect to S3
        self.assertTrue(callable(get_s3_client))
        self.assertTrue(callable(get_bucket_name))
        bucket = get_bucket_name()
        self.assertIsInstance(bucket, str)
        self.assertTrue(len(bucket) > 0)

    def test_feedback_utils_re_exports_s3(self):
        """Feedback utils re-exports from common.s3."""
        from apps.feedback.utils import get_s3_client
        from apps.common.s3 import get_s3_client as common_s3
        self.assertIs(get_s3_client, common_s3)

    def test_user_last_read_at_in_conversation_serializer(self):
        """ConversationSerializer includes user_last_read_at for unread separator."""
        _make_message(self.conv, self.user, text="Hello")
        user_client = APIClient()
        user_client.force_authenticate(user=self.user)
        resp = user_client.get("/api/feedback/conversation/")
        self.assertIn("user_last_read_at", resp.data)

    @patch("apps.feedback.services.get_channel_layer")
    @patch("apps.feedback.services.create_notification")
    def test_messages_page_size_30(self, mock_notify, mock_channel):
        """Verify page size is 30, not 50."""
        mock_channel.return_value = MagicMock()
        for i in range(35):
            _make_message(self.conv, self.user, text=f"msg {i}")

        resp = self.client.get(f"/api/feedback/admin/conversations/{self.conv.id}/messages/")
        self.assertEqual(len(resp.data), 30)

    def test_unread_total_endpoint(self):
        """Unread total returns correct count."""
        _make_message(self.conv, self.user, text="unread msg")
        resp = self.client.get("/api/feedback/admin/unread-total/")
        self.assertEqual(resp.status_code, 200)
        self.assertGreater(resp.data["unread_total"], 0)

    def test_unread_total_after_mark_read(self):
        """Unread total returns 0 after marking conversation as read."""
        _make_message(self.conv, self.user, text="msg")
        self.client.post(f"/api/feedback/admin/conversations/{self.conv.id}/read/")
        resp = self.client.get("/api/feedback/admin/unread-total/")
        self.assertEqual(resp.data["unread_total"], 0)

    @patch("apps.feedback.views.get_s3_client")
    @patch("apps.feedback.services.get_channel_layer")
    @patch("apps.feedback.services.create_notification")
    def test_presign_uses_common_s3_client(self, mock_notify, mock_channel, mock_s3):
        """Presign view uses the shared S3 client from apps.common."""
        mock_channel.return_value = MagicMock()
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = "https://s3.example.com/presigned"
        mock_s3.return_value = mock_client

        # Admin sends message first
        resp = self.client.post(
            f"/api/feedback/admin/conversations/{self.conv.id}/messages/",
            {"text": "check this"},
        )
        msg_id = resp.data["id"]

        resp = self.client.post(
            f"/api/feedback/messages/{msg_id}/presign/",
            {"file_name": "test.png", "content_type": "image/png"},
        )
        self.assertEqual(resp.status_code, 200)
        mock_s3.assert_called()  # Verify shared client was used


class TestConversationLifecycle(TestCase):
    """Tests for multi-conversation lifecycle: merge, auto-close, can_reply."""

    def setUp(self):
        self.admin = _make_user("admin", is_staff=True)
        self.user = _make_user("user1")
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_merge_conversations(self):
        """Merge moves messages and rewards from source to target."""
        c1 = _make_conversation(self.user)
        c2 = _make_conversation(self.user)
        m1 = _make_message(c1, self.user, text="msg in c1")
        m2 = _make_message(c2, self.user, text="msg in c2")

        resp = self.client.post("/api/feedback/admin/merge/", {
            "source_id": c1.id,
            "target_id": c2.id,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "merged")

        # Source deleted
        self.assertFalse(Conversation.objects.filter(id=c1.id).exists())

        # Both messages in target
        self.assertEqual(Message.objects.filter(conversation=c2).count(), 2)

    def test_merge_different_users_rejected(self):
        """Cannot merge conversations from different users."""
        u2 = _make_user("user2")
        c1 = _make_conversation(self.user)
        c2 = _make_conversation(u2)

        resp = self.client.post("/api/feedback/admin/merge/", {
            "source_id": c1.id,
            "target_id": c2.id,
        })
        self.assertEqual(resp.status_code, 400)

    def test_merge_same_id_rejected(self):
        """Cannot merge a conversation with itself."""
        c1 = _make_conversation(self.user)
        resp = self.client.post("/api/feedback/admin/merge/", {
            "source_id": c1.id,
            "target_id": c1.id,
        })
        self.assertEqual(resp.status_code, 400)

    def test_merge_reopens_closed_target(self):
        """Merge reopens a closed target conversation."""
        c1 = _make_conversation(self.user)
        c2 = _make_conversation(self.user)
        c2.status = Conversation.STATUS_CLOSED
        c2.save()
        _make_message(c1, self.user, text="msg")

        self.client.post("/api/feedback/admin/merge/", {
            "source_id": c1.id,
            "target_id": c2.id,
        })
        c2.refresh_from_db()
        self.assertEqual(c2.status, Conversation.STATUS_OPEN)

    def test_auto_close_inactive(self):
        """Auto-close task closes open conversations inactive for 24h."""
        from .tasks import auto_close_inactive
        conv = _make_conversation(self.user)
        # Manually backdate updated_at
        Conversation.objects.filter(id=conv.id).update(
            updated_at=timezone.now() - timedelta(hours=25)
        )
        auto_close_inactive()
        conv.refresh_from_db()
        self.assertEqual(conv.status, Conversation.STATUS_CLOSED)

    def test_auto_close_skips_recent(self):
        """Auto-close task does not close recently active open conversations."""
        from .tasks import auto_close_inactive
        conv = _make_conversation(self.user)
        auto_close_inactive()
        conv.refresh_from_db()
        self.assertEqual(conv.status, Conversation.STATUS_OPEN)

    def test_can_reply_open(self):
        """can_reply is True for open conversations."""
        conv = _make_conversation(self.user)
        self.client.force_authenticate(user=self.user)
        resp = self.client.get("/api/feedback/conversation/")
        self.assertTrue(resp.data["can_reply"])

    def test_can_reply_closed(self):
        """can_reply is False for closed conversations."""
        conv = _make_conversation(self.user)
        conv.status = Conversation.STATUS_CLOSED
        conv.save()
        self.client.force_authenticate(user=self.user)
        resp = self.client.get("/api/feedback/conversation/")
        self.assertFalse(resp.data["can_reply"])

    def test_admin_can_set_closed_status(self):
        """Admin can change status to closed."""
        conv = _make_conversation(self.user)
        resp = self.client.patch(
            f"/api/feedback/admin/conversations/{conv.id}/",
            {"status": "closed"},
        )
        self.assertEqual(resp.status_code, 200)
        conv.refresh_from_db()
        self.assertEqual(conv.status, Conversation.STATUS_CLOSED)


class TestUnifiedStream(TestCase):
    """Tests for the unified all-messages endpoint and conversation boundaries."""

    def setUp(self):
        self.user = _make_user()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_all_messages_empty(self):
        """Returns empty list when no conversations."""
        resp = self.client.get("/api/feedback/all-messages/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 0)

    def test_all_messages_single_conversation(self):
        """Returns messages from a single conversation with conversation_id."""
        conv = _make_conversation(self.user)
        _make_message(conv, self.user, text="msg1")
        _make_message(conv, self.user, text="msg2")
        resp = self.client.get("/api/feedback/all-messages/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)
        self.assertEqual(resp.data[0]["conversation_id"], conv.id)
        self.assertEqual(resp.data[1]["conversation_id"], conv.id)

    def test_all_messages_multiple_conversations(self):
        """Returns messages from all conversations with correct conversation_ids."""
        conv1 = _make_conversation(self.user)
        _make_message(conv1, self.user, text="conv1 msg")
        conv2 = Conversation.objects.create(user=self.user)
        _make_message(conv2, self.user, text="conv2 msg")
        resp = self.client.get("/api/feedback/all-messages/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)
        conv_ids = [m["conversation_id"] for m in resp.data]
        self.assertIn(conv1.id, conv_ids)
        self.assertIn(conv2.id, conv_ids)

    def test_all_messages_excludes_deleted(self):
        """Deleted messages are excluded from unified stream."""
        conv = _make_conversation(self.user)
        msg1 = _make_message(conv, self.user, text="visible")
        msg2 = _make_message(conv, self.user, text="deleted")
        msg2.is_deleted = True
        msg2.save()
        resp = self.client.get("/api/feedback/all-messages/")
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["text"], "visible")

    def test_all_messages_pagination(self):
        """Unified stream respects cursor pagination."""
        conv = _make_conversation(self.user)
        msgs = []
        for i in range(35):
            msgs.append(_make_message(conv, self.user, text=f"msg{i}"))
        resp = self.client.get("/api/feedback/all-messages/")
        self.assertEqual(len(resp.data), 30)
        # Second page with cursor
        oldest_id = resp.data[0]["id"]
        resp2 = self.client.get(f"/api/feedback/all-messages/?cursor={oldest_id}")
        self.assertEqual(len(resp2.data), 5)

    def test_all_messages_other_user_excluded(self):
        """User cannot see messages from other users' conversations."""
        other_user = _make_user("other")
        other_conv = _make_conversation(other_user)
        _make_message(other_conv, other_user, text="secret")
        my_conv = _make_conversation(self.user)
        _make_message(my_conv, self.user, text="mine")
        resp = self.client.get("/api/feedback/all-messages/")
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["text"], "mine")

    def test_conversation_history_multiple(self):
        """History endpoint returns all user's conversations."""
        conv1 = _make_conversation(self.user)
        conv2 = Conversation.objects.create(user=self.user)
        resp = self.client.get("/api/feedback/conversations/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)
