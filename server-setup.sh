#!/bin/bash

# Скрипт первоначальной настройки сервера
# Запустите этот скрипт ОДИН РАЗ на новом VPS сервере

set -e

echo "🔧 Настройка VPS сервера для Asset Manager"

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Обновление системы
echo -e "${YELLOW}📦 Обновление системы...${NC}"
apt update && apt upgrade -y

# Установка Docker
echo -e "${YELLOW}🐳 Установка Docker...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    echo -e "${GREEN}✅ Docker установлен${NC}"
else
    echo -e "${GREEN}✅ Docker уже установлен${NC}"
fi

# Установка Docker Compose
echo -e "${YELLOW}🔨 Установка Docker Compose...${NC}"
apt install docker-compose-plugin -y

# Установка дополнительных утилит
echo -e "${YELLOW}🛠️  Установка утилит...${NC}"
apt install -y \
    git \
    curl \
    wget \
    nano \
    htop \
    ufw \
    certbot

# Создание директории для проекта
echo -e "${YELLOW}📁 Создание директории проекта...${NC}"
mkdir -p /var/www/asset-manager
mkdir -p /var/www/asset-manager/certbot/conf
mkdir -p /var/www/asset-manager/certbot/www

# Настройка firewall
echo -e "${YELLOW}🔒 Настройка firewall...${NC}"
ufw --force enable
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
echo -e "${GREEN}✅ Firewall настроен${NC}"

# Настройка автоочистки Docker
echo -e "${YELLOW}🧹 Настройка автоочистки Docker...${NC}"
cat > /etc/cron.daily/docker-cleanup << 'EOF'
#!/bin/bash
docker system prune -af --volumes --filter "until=168h"
EOF
chmod +x /etc/cron.daily/docker-cleanup

# Настройка лимитов для Docker
echo -e "${YELLOW}⚙️  Настройка лимитов системы...${NC}"
cat >> /etc/sysctl.conf << EOF

# Docker optimizations
vm.max_map_count=262144
fs.file-max=65535
EOF
sysctl -p

# Информация об установке
echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║  ✅ Сервер успешно настроен!                              ║"
echo "║                                                            ║"
echo "║  Следующие шаги:                                          ║"
echo "║  1. Загрузите проект на сервер                            ║"
echo "║  2. Запустите: cd /var/www/asset-manager                  ║"
echo "║  3. Создайте файл .env.production                         ║"
echo "║  4. Запустите: docker compose -f docker-compose.production.yml up -d ║"
echo "║                                                            ║"
echo "║  Или используйте ./deploy.sh с локальной машины           ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Показать информацию о системе
echo -e "${YELLOW}📊 Информация о системе:${NC}"
echo "Docker version: $(docker --version)"
echo "Docker Compose version: $(docker compose version)"
echo "OS: $(lsb_release -d | cut -f2)"
echo "RAM: $(free -h | grep Mem | awk '{print $2}')"
echo "Disk: $(df -h / | tail -1 | awk '{print $2}')"
echo ""
echo -e "${GREEN}🚀 Сервер готов к деплою!${NC}"
