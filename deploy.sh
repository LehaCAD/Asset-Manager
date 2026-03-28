#!/bin/bash
set -e

SERVER="root@85.239.36.28"
# Путь к ключу — работает и в Git Bash на Windows, и в Linux
# Ищем SSH ключ в разных местах (WSL, Git Bash, Linux)
for _p in "/mnt/c/Users/ImpressivePC/.ssh/id_rsa" \
           "/c/Users/ImpressivePC/.ssh/id_rsa" \
           "$HOME/.ssh/id_rsa"; do
  if [ -f "$_p" ]; then SSH_KEY="$_p"; break; fi
done
echo "Используется ключ: $SSH_KEY"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o BatchMode=yes"

echo "=== Деплой на raskadrawka.ru ==="

ssh $SSH_OPTS "$SERVER" << 'ENDSSH'
set -e
cd /root/Asset-Manager

echo "--- 1. Получаю новый код с GitHub ---"
git pull origin main

echo "--- 2. Пересобираю и запускаю контейнеры ---"
docker compose -f docker-compose.production.yml up -d --build

echo "--- 3. Жду базу данных ---"
sleep 10

echo "--- 4. Применяю миграции ---"
docker compose -f docker-compose.production.yml exec -T backend python manage.py migrate

echo "--- 5. Собираю статику ---"
docker compose -f docker-compose.production.yml exec -T backend python manage.py collectstatic --noinput

echo "--- 6. Рестарт nginx ---"
docker compose -f docker-compose.production.yml restart nginx

echo "=== Готово ==="
ENDSSH

echo "Сайт: https://raskadrawka.ru"
