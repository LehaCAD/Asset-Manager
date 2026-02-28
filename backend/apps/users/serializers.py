from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

User = get_user_model()


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

    class Meta:
        model = User
        fields = ('username', 'email', 'password', 'password_confirm')

    def validate_email(self, value: str) -> str:
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Пользователь с таким email уже существует.")
        return value

    def validate(self, attrs: dict) -> dict:
        password_confirm = attrs.get('password_confirm')
        if password_confirm and attrs['password'] != password_confirm:
            raise serializers.ValidationError({"password_confirm": "Пароли не совпадают."})
        return attrs

    def create(self, validated_data: dict) -> User:
        validated_data.pop('password_confirm', None)
        user = User.objects.create_user(**validated_data)
        return user


class UserSerializer(serializers.ModelSerializer):
    """Сериализатор данных пользователя."""
    
    quota = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'quota', 'created_at', 'updated_at')
        read_only_fields = ('id', 'created_at', 'updated_at')
    
    def get_quota(self, obj: User) -> dict:
        """Получение информации о квотах пользователя."""
        from apps.projects.models import Project
        from apps.scenes.models import Scene
        from apps.elements.models import Element
        from apps.users.models import UserQuota
        
        # Получаем квоты, создаем если не существует (защита от legacy users)
        try:
            user_quota = obj.quota
        except UserQuota.DoesNotExist:
            # Автоматически создаем квоту для legacy users
            user_quota = UserQuota.objects.create(user=obj)
        
        # Подсчитываем использование
        used_projects = Project.objects.filter(user=obj).count()
        
        # Для сцен и элементов считаем максимальное использование в одном проекте/сцене
        projects = Project.objects.filter(user=obj)
        max_scenes_used = 0
        max_elements_used = 0
        
        for project in projects:
            scenes_count = Scene.objects.filter(project=project).count()
            if scenes_count > max_scenes_used:
                max_scenes_used = scenes_count
            
            scenes = Scene.objects.filter(project=project)
            for scene in scenes:
                elements_count = Element.objects.filter(scene=scene).count()
                if elements_count > max_elements_used:
                    max_elements_used = elements_count
        
        return {
            'max_projects': user_quota.max_projects,
            'used_projects': used_projects,
            'max_scenes_per_project': user_quota.max_scenes_per_project,
            'max_scenes_used': max_scenes_used,
            'max_elements_per_scene': user_quota.max_elements_per_scene,
            'max_elements_used': max_elements_used,
        }
