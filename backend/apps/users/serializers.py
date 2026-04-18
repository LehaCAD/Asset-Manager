from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.subscriptions.models import Subscription
from apps.subscriptions.services import SubscriptionService
from apps.subscriptions.serializers import SubscriptionSerializer

User = get_user_model()


class UsernameOrEmailTokenSerializer(TokenObtainPairSerializer):
    """Accept either username or email in the `username` field of /auth/login/.

    If the input looks like an email and matches exactly one user by
    case-insensitive email, that user's `username` is substituted before the
    parent `validate` runs — keeping downstream logic (throttling, password
    check, token issuance) untouched.

    If multiple users share the same email (model-level uniqueness is NOT
    enforced historically), we refuse to guess: fall through with the original
    identifier, which will fail authentication. The user must log in by username.
    """

    def validate(self, attrs):
        identifier = (attrs.get("username") or "").strip()
        if "@" in identifier:
            matches = list(User.objects.filter(email__iexact=identifier)[:2])
            if len(matches) == 1:
                attrs["username"] = matches[0].username
            # len == 0 or len > 1 → leave identifier as-is; simplejwt will 401.
        return super().validate(attrs)


class RegisterSerializer(serializers.ModelSerializer):
    """Сериализатор регистрации пользователя."""
    password = serializers.CharField(
        write_only=True,
        validators=[validate_password],
        style={'input_type': 'password'},
    )
    password_confirm = serializers.CharField(
        write_only=True,
        required=False,
        style={'input_type': 'password'},
    )
    tos_accepted = serializers.BooleanField(write_only=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'password', 'password_confirm', 'tos_accepted')

    def validate_email(self, value: str) -> str:
        # Case-insensitive to match the login-by-email path and prevent near-duplicates
        # like "Alice@x.com" vs "alice@x.com" which would break `UsernameOrEmailTokenSerializer`.
        normalized = (value or "").strip().lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError("Пользователь с таким email уже существует.")
        return normalized

    def validate_tos_accepted(self, value):
        if not value:
            raise serializers.ValidationError('Необходимо принять условия использования')
        return value

    def validate(self, attrs: dict) -> dict:
        password_confirm = attrs.get('password_confirm')
        if password_confirm and attrs['password'] != password_confirm:
            raise serializers.ValidationError({"password_confirm": "Пароли не совпадают."})
        return attrs

    def create(self, validated_data: dict) -> User:
        validated_data.pop('password_confirm', None)
        validated_data.pop('tos_accepted', None)
        user = User.objects.create_user(**validated_data)
        return user


class UserSerializer(serializers.ModelSerializer):
    """Сериализатор данных пользователя."""

    quota = serializers.SerializerMethodField()
    subscription = serializers.SerializerMethodField()
    is_email_verified = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'is_email_verified', 'quota', 'subscription', 'created_at', 'updated_at')
        read_only_fields = ('id', 'created_at', 'updated_at')

    def get_quota(self, obj: User) -> dict:
        """Получение информации о квотах пользователя из тарифного плана."""
        return SubscriptionService.get_limits(obj)

    def get_subscription(self, obj: User) -> dict | None:
        """Получение информации о подписке пользователя."""
        try:
            sub = obj.subscription
            return SubscriptionSerializer(sub).data
        except Subscription.DoesNotExist:
            return None


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.UUIDField()
    password = serializers.CharField(min_length=8, write_only=True)
    password_confirm = serializers.CharField(min_length=8, write_only=True)

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Пароли не совпадают'})
        validate_password(data['password'])
        return data
