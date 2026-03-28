#!/bin/bash
set -e

# === Настройки ===
SERVER="root@85.239.36.28"
SSH_KEY="$HOME/.ssh/id_rsa"
REMOTE_DIR="/root/Asset-Manager"

echo "=== 1. Собираю архив (только код) ==="
tar -czf /tmp/deploy.tar.gz \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.git' \
    --exclude='.env' \
    --exclude='.env.local' \
    --exclude='.env.production' \
    --exclude='deploy.tar.gz' \
    --exclude='postgres_data' \
    --exclude='backups' \
    --exclude='*.exe' \
    --exclude='*.torrent' \
    --exclude='*.docx' \
    --exclude='*.png' \
    --exclude='*.svg' \
    --exclude='*.ppk' \
    --exclude='.claude' \
    --exclude='.superpowers' \
    --exclude='.mcp.json' \
    --exclude='.playwright-mcp' \
    --exclude='pen' \
    --exclude='certbot' \
    .

echo "=== 2. Загружаю на сервер ==="
scp -i "$SSH_KEY" /tmp/deploy.tar.gz "$SERVER:/tmp/"
rm /tmp/deploy.tar.gz

echo "=== 3. Разворачиваю на сервере ==="
ssh -i "$SSH_KEY" "$SERVER" << 'ENDSSH'
set -e
cd /root/Asset-Manager

# Распаковываю код (НЕ трогает .env — он excluded из архива)
tar -xzf /tmp/deploy.tar.gz
rm /tmp/deploy.tar.gz

# Пересобираю и запускаю
docker compose -f docker-compose.production.yml up -d --build

# Жду пока БД поднимется
echo "Жду базу данных..."
sleep 10

# Миграции
docker compose -f docker-compose.production.yml exec -T backend python manage.py migrate

# Статика
docker compose -f docker-compose.production.yml exec -T backend python manage.py collectstatic --noinput

# Рестарт nginx (чтобы подхватил новые конфиги)
docker compose -f docker-compose.production.yml restart nginx

echo "=== Деплой завершён ==="
ENDSSH

echo "=== Готово! Сайт: https://raskadrawka.ru ==="
