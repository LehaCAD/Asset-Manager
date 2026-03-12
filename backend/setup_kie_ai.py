"""
Shell helper for creating the Kie.ai provider and default AI models.

Run with:
docker compose exec backend python manage.py shell < setup_kie_ai.py
"""

from django.core.management import call_command


call_command('setup_kie_ai')
print('Kie.ai setup completed.')
