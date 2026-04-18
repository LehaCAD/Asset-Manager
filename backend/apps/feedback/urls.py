# backend/apps/feedback/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # User
    path("conversation/", views.conversation_view),
    path("conversations/", views.conversation_history_view),
    path("messages/", views.messages_view),
    path("attachments/presign-draft/", views.presign_draft_view),
    path("messages/<int:message_id>/presign/", views.presign_view),
    path("messages/<int:message_id>/confirm-attach/", views.confirm_attach_view),
    path("all-messages/", views.all_messages_view),
    path("conversation/read/", views.mark_read_view),

    # Admin — management (before parameterized routes)
    path("admin/bulk/", views.admin_bulk_action),
    path("admin/merge/", views.admin_merge_conversations),
    path("admin/conversations/<int:conversation_id>/clear/", views.admin_clear_history),
    path("admin/conversations/<int:conversation_id>/clear-attachments/", views.admin_clear_attachments),
    path("admin/conversations/<int:conversation_id>/stats/", views.admin_conversation_stats),
    path("admin/conversations/<int:conversation_id>/delete/", views.admin_delete_conversation),

    # Admin
    path("admin/unread-total/", views.admin_unread_total),
    path("admin/conversations/", views.admin_conversations_list),
    path("admin/conversations/<int:conversation_id>/", views.admin_conversation_detail),
    path("admin/conversations/<int:conversation_id>/messages/", views.admin_conversation_messages),
    path("admin/conversations/<int:conversation_id>/reward/", views.admin_reward_view),
    path("admin/conversations/<int:conversation_id>/read/", views.admin_mark_read_view),
    path("admin/messages/<int:message_id>/", views.admin_message_actions),
]
