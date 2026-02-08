"""
Management command для тестирования Celery.
"""
from django.core.management.base import BaseCommand
from apps.assets.tasks import test_task, example_async_task


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
        parser.add_argument(
            '--example',
            action='store_true',
            help='Запустить пример асинхронной задачи'
        )

    def handle(self, *args, **options):
        message = options['message']
        run_async = options['async']
        run_example = options['example']

        self.stdout.write(self.style.SUCCESS('=' * 50))
        self.stdout.write(self.style.SUCCESS('Celery Test Command'))
        self.stdout.write(self.style.SUCCESS('=' * 50))

        if run_example:
            self.stdout.write('\n🚀 Запуск примера асинхронной задачи...')
            
            if run_async:
                # Асинхронный запуск
                result = example_async_task.delay('TestUser', 3)
                self.stdout.write(
                    self.style.SUCCESS(f'✅ Задача отправлена: {result.id}')
                )
                self.stdout.write(
                    self.style.WARNING(
                        'Задача выполняется асинхронно. Проверьте логи Celery worker.'
                    )
                )
            else:
                # Синхронный запуск (для отладки)
                self.stdout.write(
                    self.style.WARNING('⏳ Выполнение (это займет ~3 секунды)...')
                )
                result = example_async_task('TestUser', 3)
                self.stdout.write(
                    self.style.SUCCESS(f'✅ Результат: {result}')
                )
        else:
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
        self.stdout.write('   • python manage.py test_celery --example --async')
        self.stdout.write('\n   • docker compose logs -f celery  (логи worker)')
        self.stdout.write('   • docker compose restart celery  (перезапуск worker)\n')
