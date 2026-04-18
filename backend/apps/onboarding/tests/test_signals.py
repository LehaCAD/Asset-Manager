from django.test import TestCase
from apps.users.models import User
from apps.onboarding.models import UserTaskCompletion


class ProjectSignalTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='signaltest', password='test123')

    def test_create_project_completes_task(self):
        from apps.projects.models import Project
        Project.objects.create(user=self.user, name='Test Project')
        self.assertTrue(
            UserTaskCompletion.objects.filter(
                user=self.user, task__code='create_project'
            ).exists()
        )

    def test_create_scene_completes_task(self):
        from apps.projects.models import Project
        from apps.scenes.models import Scene
        project = Project.objects.create(user=self.user, name='Test')
        Scene.objects.create(project=project, name='Test Scene', order_index=0)
        self.assertTrue(
            UserTaskCompletion.objects.filter(
                user=self.user, task__code='create_scene'
            ).exists()
        )

    def test_create_shared_link_completes_task(self):
        from apps.projects.models import Project
        from apps.sharing.models import SharedLink
        project = Project.objects.create(user=self.user, name='Test')
        SharedLink.objects.create(project=project, created_by=self.user)
        self.assertTrue(
            UserTaskCompletion.objects.filter(
                user=self.user, task__code='share_project'
            ).exists()
        )
