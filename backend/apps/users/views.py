import uuid

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import generics, permissions, status, views
from rest_framework.decorators import api_view, permission_classes as perm
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .emails import send_verification_email, send_password_reset_email
from .serializers import RegisterSerializer, UserSerializer, ForgotPasswordSerializer, ResetPasswordSerializer
from .throttles import AuthRateThrottle

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    """Регистрация нового пользователя. Возвращает токены сразу после регистрации."""
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthRateThrottle]

    def create(self, request, *args, **kwargs) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Save tos_accepted_at and send verification email
        user.tos_accepted_at = timezone.now()
        user.email_verification_sent_at = timezone.now()
        user.save(update_fields=['tos_accepted_at', 'email_verification_sent_at'])

        try:
            send_verification_email(user)
        except Exception:
            pass  # Don't fail registration if email fails

        refresh = RefreshToken.for_user(user)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }, status=status.HTTP_201_CREATED)


class MeView(generics.RetrieveUpdateAPIView):
    """Получение и обновление данных текущего пользователя."""
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self) -> User:
        return self.request.user


class VerifyEmailView(views.APIView):
    """GET /api/auth/verify-email/?token=<uuid>"""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthRateThrottle]

    def get(self, request):
        token = request.query_params.get('token')
        if not token:
            return Response({'error': 'Токен не указан'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(email_verification_token=token)
        except User.DoesNotExist:
            return Response({'error': 'Недействительный токен'}, status=status.HTTP_400_BAD_REQUEST)

        if user.is_email_verified:
            return Response({'message': 'Email уже подтверждён'})

        user.is_email_verified = True
        user.save(update_fields=['is_email_verified'])
        return Response({'message': 'Email подтверждён'})


class ResendVerificationView(views.APIView):
    """POST /api/auth/resend-verification/"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        if user.is_email_verified:
            return Response({'message': 'Email уже подтверждён'})
        if not user.can_resend_verification():
            return Response(
                {'error': 'Подождите минуту перед повторной отправкой'},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        user.email_verification_token = uuid.uuid4()
        user.email_verification_sent_at = timezone.now()
        user.save(update_fields=['email_verification_token', 'email_verification_sent_at'])
        send_verification_email(user)
        return Response({'message': 'Письмо отправлено'})


class ForgotPasswordView(views.APIView):
    """POST /api/auth/forgot-password/ {email}"""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user = User.objects.get(email=serializer.validated_data['email'])
            user.password_reset_token = uuid.uuid4()
            user.password_reset_sent_at = timezone.now()
            user.save(update_fields=['password_reset_token', 'password_reset_sent_at'])
            send_password_reset_email(user)
        except User.DoesNotExist:
            pass  # Always return 200 to not reveal email existence

        return Response({'message': 'Если email зарегистрирован, вы получите письмо'})


class ResetPasswordView(views.APIView):
    """POST /api/auth/reset-password/ {token, password, password_confirm}"""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user = User.objects.get(
                password_reset_token=serializer.validated_data['token']
            )
        except User.DoesNotExist:
            return Response({'error': 'Недействительный токен'}, status=status.HTTP_400_BAD_REQUEST)

        if not user.is_password_reset_token_valid():
            return Response({'error': 'Токен истёк'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(serializer.validated_data['password'])
        user.password_reset_token = None
        user.password_reset_sent_at = None
        user.save(update_fields=['password', 'password_reset_token', 'password_reset_sent_at'])
        return Response({'message': 'Пароль изменён'})


@api_view(['POST'])
@perm([permissions.IsAuthenticated])
def change_password_view(request):
    """POST /api/auth/me/password/ — смена пароля."""
    current_password = request.data.get('current_password')
    new_password = request.data.get('new_password')

    if not current_password or not new_password:
        return Response(
            {'error': 'Укажите текущий и новый пароль.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not request.user.check_password(current_password):
        return Response(
            {'error': 'Текущий пароль неверный.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(new_password) < 6:
        return Response(
            {'error': 'Новый пароль должен содержать минимум 6 символов.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    request.user.set_password(new_password)
    request.user.save(update_fields=['password'])
    return Response({'ok': True})
