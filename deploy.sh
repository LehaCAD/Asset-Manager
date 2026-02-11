#!/bin/bash

# Deployment script для Asset Manager
# Использование: ./deploy.sh

set -e

echo "🚀 Начинаем деплой Asset Manager на VPS..."

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Переменные
SERVER_IP="85.239.56.80"
SERVER_USER="root"
DEPLOY_DIR="/var/www/asset-manager"
REPO_URL="." # локальная директория

echo -e "${YELLOW}📦 Создаем архив проекта...${NC}"
tar -czf deploy.tar.gz \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.git' \
    --exclude='deploy.tar.gz' \
    --exclude='postgres_data' \
    --exclude='private.ppk' \
    .

echo -e "${YELLOW}📤 Загружаем на сервер...${NC}"
scp deploy.tar.gz ${SERVER_USER}@${SERVER_IP}:/tmp/

echo -e "${YELLOW}🔧 Разворачиваем на сервере...${NC}"
ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
set -e

DEPLOY_DIR="/var/www/asset-manager"

# Создаем директорию если её нет
mkdir -p $DEPLOY_DIR

# Распаковываем
cd $DEPLOY_DIR
tar -xzf /tmp/deploy.tar.gz
rm /tmp/deploy.tar.gz

# Копируем production конфигурации
cp next.config.production.mjs frontend/next.config.mjs

# Останавливаем контейнеры если они запущены
docker compose -f docker-compose.production.yml down || true

# Собираем и запускаем
docker compose -f docker-compose.production.yml up -d --build

# Ждем запуска базы данных
echo "⏳ Ждем запуска базы данных..."
sleep 10

# Применяем миграции
docker compose -f docker-compose.production.yml exec -T backend python manage.py migrate

# Собираем статику
docker compose -f docker-compose.production.yml exec -T backend python manage.py collectstatic --noinput

echo "✅ Деплой завершен!"
ENDSSH

echo -e "${GREEN}✅ Деплой успешно завершен!${NC}"
echo -e "${GREEN}🌐 Сайт доступен по адресу: http://raskadrawka.ru${NC}"
echo -e "${YELLOW}⚠️  Не забудьте настроить SSL сертификат!${NC}"

# Удаляем локальный архив
rm deploy.tar.gz
