#!/bin/bash
# Скрипт первичной настройки VPS
# Запускать на сервере от root

set -e

echo "🚀 Начинаем настройку VPS для Asset Manager"

# Обновление системы
echo "📦 Обновляем систему..."
apt update && apt upgrade -y

# Установка необходимых пакетов
echo "📦 Устанавливаем необходимые пакеты..."
apt install -y curl git vim htop ufw

# Установка Docker
if ! command -v docker &> /dev/null; then
    echo "🐳 Устанавливаем Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    systemctl enable docker
    systemctl start docker
else
    echo "✅ Docker уже установлен"
fi

# Установка Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "🐳 Устанавливаем Docker Compose..."
    apt install -y docker-compose-plugin
else
    echo "✅ Docker Compose уже установлен"
fi

# Настройка firewall
echo "🔥 Настраиваем firewall..."
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
echo "✅ Firewall настроен"

# Создание директории для проекта
echo "📁 Создаем директорию для проекта..."
mkdir -p /opt/asset-manager
cd /opt/asset-manager

# Создание SSH ключа для Git (если нужно)
if [ ! -f ~/.ssh/id_rsa ]; then
    echo "🔑 Создаем SSH ключ для Git..."
    ssh-keygen -t rsa -b 4096 -C "root@raskadrawka.ru" -N "" -f ~/.ssh/id_rsa
    echo "⚠️  Добавьте этот публичный ключ в GitHub/GitLab:"
    cat ~/.ssh/id_rsa.pub
    echo ""
    read -p "Нажмите Enter после добавления ключа в репозиторий..."
fi

# Клонирование репозитория (если еще не клонирован)
if [ ! -d ".git" ]; then
    echo "📥 Введите URL вашего Git репозитория (например: git@github.com:user/repo.git):"
    read GIT_REPO
    git clone $GIT_REPO .
else
    echo "✅ Репозиторий уже клонирован"
fi

# Создание .env.production
if [ ! -f ".env.production" ]; then
    echo "⚙️  Создаем .env.production..."
    cp .env.production.example .env.production
    
    # Генерация SECRET_KEY
    SECRET_KEY=$(openssl rand -base64 50 | tr -d "=+/" | cut -c1-50)
    sed -i "s/ЗАМЕНИТЕ_НА_СЛУЧАЙНЫЙ_КЛЮЧ_МИНИМУМ_50_СИМВОЛОВ/$SECRET_KEY/" .env.production
    
    # Генерация пароля БД
    DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
    sed -i "s/ЗАМЕНИТЕ_НА_СЛОЖНЫЙ_ПАРОЛЬ/$DB_PASSWORD/" .env.production
    
    echo "✅ .env.production создан"
    echo "⚠️  Проверьте и отредактируйте файл при необходимости:"
    echo "    nano .env.production"
else
    echo "✅ .env.production уже существует"
fi

# Создание директорий
mkdir -p nginx/ssl

# Получение SSL сертификата
echo "🔒 Получаем SSL сертификат от Let's Encrypt..."
echo "Сначала запустим Nginx в режиме HTTP для верификации..."

# Временный nginx конфиг для получения сертификата
cat > nginx/nginx-temp.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name raskadrawka.ru www.raskadrawka.ru;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 200 'OK';
            add_header Content-Type text/plain;
        }
    }
}
EOF

# Запуск временного Nginx
docker run -d --name nginx-temp \
    -p 80:80 \
    -v $(pwd)/nginx/nginx-temp.conf:/etc/nginx/nginx.conf:ro \
    -v $(pwd)/nginx/ssl:/var/www/certbot \
    nginx:alpine

sleep 3

# Получение сертификата
docker run -it --rm \
    -v $(pwd)/nginx/ssl:/etc/letsencrypt \
    certbot/certbot certonly \
    --webroot \
    --webroot-path=/etc/letsencrypt \
    --email admin@raskadrawka.ru \
    --agree-tos \
    --no-eff-email \
    -d raskadrawka.ru \
    -d www.raskadrawka.ru

# Останавливаем временный Nginx
docker stop nginx-temp
docker rm nginx-temp

echo "✅ SSL сертификат получен"

# Настройка автоматического обновления сертификата
echo "⏰ Настраиваем автообновление SSL..."
(crontab -l 2>/dev/null; echo "0 12 * * * cd /opt/asset-manager && docker-compose -f docker-compose.prod.yml restart certbot") | crontab -

echo ""
echo "✅ Настройка VPS завершена!"
echo ""
echo "📋 Следующие шаги:"
echo "1. Проверьте .env.production: nano .env.production"
echo "2. Запустите проект: ./scripts/deploy.sh"
echo ""
