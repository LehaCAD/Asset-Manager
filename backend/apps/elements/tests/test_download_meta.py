from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.projects.models import Project
from apps.scenes.models import Scene
from apps.elements.models import Element

User = get_user_model()


class DownloadMetaTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='test', password='test')
        self.other = User.objects.create_user(username='other', password='other')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

        self.project = Project.objects.create(name='P1', user=self.user)
        self.group = Scene.objects.create(name='G1', project=self.project)
        self.child = Scene.objects.create(name='G1.1', project=self.project, parent=self.group)

        self.el1 = Element.objects.create(
            project=self.project, scene=self.group,
            element_type='IMAGE', source_type='GENERATED', status='COMPLETED',
            file_url='https://s3.example.com/1.png', original_filename='photo.png',
            file_size=1024,
        )
        self.el2 = Element.objects.create(
            project=self.project, scene=self.child,
            element_type='VIDEO', source_type='UPLOADED', status='COMPLETED',
            file_url='https://s3.example.com/2.mp4', original_filename='clip.mp4',
            file_size=2048,
        )
        self.el_failed = Element.objects.create(
            project=self.project, scene=self.group,
            element_type='IMAGE', source_type='GENERATED', status='FAILED',
            file_url='', original_filename='bad.png', file_size=0,
        )
        self.el_root = Element.objects.create(
            project=self.project, scene=None,
            element_type='IMAGE', source_type='UPLOADED', status='COMPLETED',
            file_url='https://s3.example.com/3.png', original_filename='root.png',
            file_size=512,
        )

    def test_project_download_meta_returns_completed_elements(self):
        resp = self.client.get(f'/api/elements/download-meta/?project_id={self.project.id}')
        self.assertEqual(resp.status_code, 200)
        ids = [e['id'] for e in resp.data['elements']]
        self.assertIn(self.el1.id, ids)
        self.assertIn(self.el2.id, ids)
        self.assertIn(self.el_root.id, ids)
        self.assertNotIn(self.el_failed.id, ids)

    def test_project_download_meta_returns_groups(self):
        resp = self.client.get(f'/api/elements/download-meta/?project_id={self.project.id}')
        group_ids = [g['id'] for g in resp.data['groups']]
        self.assertIn(self.group.id, group_ids)
        self.assertIn(self.child.id, group_ids)

    def test_scene_download_meta_with_children(self):
        resp = self.client.get(f'/api/elements/download-meta/?scene_id={self.group.id}')
        self.assertEqual(resp.status_code, 200)
        ids = [e['id'] for e in resp.data['elements']]
        self.assertIn(self.el1.id, ids)
        self.assertIn(self.el2.id, ids)
        self.assertNotIn(self.el_root.id, ids)

    def test_element_fields_present(self):
        resp = self.client.get(f'/api/elements/download-meta/?project_id={self.project.id}')
        el = next(e for e in resp.data['elements'] if e['id'] == self.el1.id)
        for field in ('id', 'element_type', 'is_favorite', 'source_type',
                      'file_url', 'original_filename', 'file_size', 'scene_id'):
            self.assertIn(field, el)

    def test_other_user_cannot_access(self):
        client2 = APIClient()
        client2.force_authenticate(self.other)
        resp = client2.get(f'/api/elements/download-meta/?project_id={self.project.id}')
        self.assertEqual(resp.data['elements'], [])

    def test_unauthenticated_returns_401(self):
        client = APIClient()
        resp = client.get(f'/api/elements/download-meta/?project_id={self.project.id}')
        self.assertEqual(resp.status_code, 401)

    def test_no_params_returns_400(self):
        resp = self.client.get('/api/elements/download-meta/')
        self.assertEqual(resp.status_code, 400)
