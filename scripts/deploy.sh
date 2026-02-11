#!/bin/bash
# Скрипт для деплоя на VPS
# Запускать на сервере

set -e

echo "🚀 Начинаем деплой Asset Manager"

cd /opt/asset-manager

# Получаем последние изменения
echo "📥 Получаем обновления из Git..."
git pull origin main

# Останавливаем контейнеры
echo "🛑 Останавливаем старые контейнеры..."
docker-compose -f docker-compose.prod.yml down

# Собираем новые образы
echo "🔨 Собираем образы..."
docker-compose -f docker-compose.prod.yml build

# Применяем миграции
echo "📊 Применяем миграции БД..."
docker-compose -f docker-compose.prod.yml run --rm backend python manage.py migrate

# Собираем статику
echo "📦 Собираем статику..."
docker-compose -f docker-compose.prod.yml run --rm backend python manage.py collectstatic --no-input

# Запускаем контейнеры
echo "▶️  Запускаем контейнеры..."
docker-compose -f docker-compose.prod.yml up -d

# Проверяем статус
echo "✅ Проверяем статус..."
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "✅ Деплой завершен!"
echo "🌐 Сайт доступен по адресу: https://raskadrawka.ru"
echo ""
echo "📊 Полезные команды:"
echo "  - Логи: docker-compose -f docker-compose.prod.yml logs -f"
echo "  - Перезапуск: docker-compose -f docker-compose.prod.yml restart"
echo "  - Остановка: docker-compose -f docker-compose.prod.yml down"
echo ""
