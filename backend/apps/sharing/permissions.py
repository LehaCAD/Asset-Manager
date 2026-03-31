from rest_framework.permissions import BasePermission


class IsProjectOwner(BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.project.user == request.user
