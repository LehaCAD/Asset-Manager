# Onboarding signal handlers — populated in Task 4.
# This file must exist: apps.py imports it unconditionally in ready().

from django.db.models.signals import post_save
from django.dispatch import receiver
from .services import OnboardingService


@receiver(post_save, sender='projects.Project')
def on_project_created(sender, instance, created, **kwargs):
    if created:
        OnboardingService().try_complete(instance.user, 'project.created')


@receiver(post_save, sender='scenes.Scene')
def on_scene_created(sender, instance, created, **kwargs):
    if created:
        OnboardingService().try_complete(instance.project.user, 'scene.created')


@receiver(post_save, sender='sharing.SharedLink')
def on_shared_link_created(sender, instance, created, **kwargs):
    if created:
        OnboardingService().try_complete(instance.created_by, 'sharing.link_created')
