# backend/apps/feedback/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # User
    path("conversation/", views.conversation_view),
    path("messages/", views.messages_view),
    path("messages/<int:message_id>/presign/", views.presign_view),
    path("messages/<int:message_id>/confirm-attach/", views.confirm_attach_view),
    path("conversation/read/", views.mark_read_view),

    # Admin
    path("admin/conversations/", views.admin_conversations_list),
    path("admin/conversations/<int:conversation_id>/", views.admin_conversation_detail),
    path("admin/conversations/<int:conversation_id>/messages/", views.admin_conversation_messages),
    path("admin/conversations/<int:conversation_id>/reward/", views.admin_reward_view),
    path("admin/conversations/<int:conversation_id>/read/", views.admin_mark_read_view),
    path("admin/messages/<int:message_id>/", views.admin_delete_message),
]
