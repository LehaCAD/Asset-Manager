"""
Management command для тестирования Celery.
"""
from django.core.management.base import BaseCommand
from apps.elements.tasks import test_task


class Command(BaseCommand):
    help = 'Тестирование Celery задач'

    def add_arguments(self, parser):
        parser.add_argument(
            '--message',
            type=str,
            default='Hello from Celery!',
            help='Сообщение для обработки'
        )
        parser.add_argument(
            '--async',
            action='store_true',
            help='Запустить задачу асинхронно (не ждать результата)'
        )

    def handle(self, *args, **options):
        message = options['message']
        run_async = options['async']

        self.stdout.write(self.style.SUCCESS('=' * 50))
        self.stdout.write(self.style.SUCCESS('Celery Test Command'))
        self.stdout.write(self.style.SUCCESS('=' * 50))

        self.stdout.write(f'\n📨 Сообщение: "{message}"')

        if run_async:
            # Асинхронный запуск через Celery
            self.stdout.write('🚀 Отправка задачи в Celery...')
            result = test_task.delay(message)

            self.stdout.write(
                self.style.SUCCESS(f'✅ Задача отправлена!')
            )
            self.stdout.write(f'   Task ID: {result.id}')
            self.stdout.write(
                self.style.WARNING(
                    '   Задача выполняется асинхронно. Проверьте логи Celery worker.'
                )
            )
        else:
            # Синхронный запуск (для отладки без Celery)
            self.stdout.write(
                self.style.WARNING('⏳ Выполнение синхронно (без Celery)...')
            )
            result = test_task(message)
            self.stdout.write(
                self.style.SUCCESS(f'✅ Результат: {result}')
            )

        self.stdout.write('\n' + '=' * 50)
        self.stdout.write(
            self.style.SUCCESS('Тестирование завершено!')
        )
        self.stdout.write('=' * 50 + '\n')

        # Дополнительная информация
        self.stdout.write('\n📚 Полезные команды:')
        self.stdout.write('   • python manage.py test_celery --async')
        self.stdout.write('   • python manage.py test_celery --message "Custom message" --async')
        self.stdout.write('\n   • docker compose logs -f celery  (логи worker)')
        self.stdout.write('   • docker compose restart celery  (перезапуск worker)\n')
