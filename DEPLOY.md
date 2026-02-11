# 🚀 Инструкция по деплою Asset Manager на VPS

## 📋 Предварительные требования

- VPS с Ubuntu 20.04+ или Debian 11+
- Docker и Docker Compose установлены
- Домен raskadrawka.ru настроен на IP 85.239.56.80
- SSH доступ к серверу

## 🔧 Первоначальная настройка сервера

### 1. Подключитесь к серверу

```bash
ssh root@85.239.56.80
```

### 2. Обновите систему

```bash
apt update && apt upgrade -y
```

### 3. Установите Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
```

### 4. Установите Docker Compose

```bash
apt install docker-compose-plugin -y
```

### 5. Установите Git (опционально)

```bash
apt install git -y
```

## 📦 Деплой проекта

### Вариант 1: Автоматический деплой (рекомендуется)

На вашем локальном компьютере:

```bash
# Сделайте скрипт исполняемым (только первый раз)
chmod +x deploy.sh

# Запустите деплой
./deploy.sh
```

### Вариант 2: Ручной деплой

#### На локальном компьютере:

1. Создайте архив проекта:
```bash
tar -czf deploy.tar.gz \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.git' \
    .
```

2. Загрузите на сервер:
```bash
scp deploy.tar.gz root@85.239.56.80:/var/www/
```

#### На сервере:

1. Распакуйте проект:
```bash
cd /var/www
mkdir -p asset-manager
cd asset-manager
tar -xzf ../deploy.tar.gz
```

2. Скопируйте production конфигурации:
```bash
cp next.config.production.mjs frontend/next.config.mjs
```

3. Запустите контейнеры:
```bash
docker compose -f docker-compose.production.yml up -d --build
```

4. Примените миграции:
```bash
docker compose -f docker-compose.production.yml exec backend python manage.py migrate
```

5. Создайте суперпользователя:
```bash
docker compose -f docker-compose.production.yml exec backend python manage.py createsuperuser
```

## 🔒 Настройка SSL сертификата

### 1. Получите SSL сертификат от Let's Encrypt

```bash
cd /var/www/asset-manager

# Первый раз получаем сертификат
docker compose -f docker-compose.production.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  -d raskadrawka.ru \
  -d www.raskadrawka.ru \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email
```

### 2. Активируйте HTTPS в Nginx

Откройте файл `nginx/conf.d/default.conf` и:
- В секции HTTP (порт 80) раскомментируйте строку с `return 301`
- Раскомментируйте всю секцию HTTPS (server блок с портом 443)

### 3. Перезапустите Nginx

```bash
docker compose -f docker-compose.production.yml restart nginx
```

## 🔄 Обновление проекта

### Из локальной машины:

```bash
./deploy.sh
```

### Или вручную на сервере:

```bash
cd /var/www/asset-manager

# Получить последние изменения (если используете git)
git pull

# Пересобрать и перезапустить
docker compose -f docker-compose.production.yml down
docker compose -f docker-compose.production.yml up -d --build

# Применить миграции
docker compose -f docker-compose.production.yml exec backend python manage.py migrate
```

## 📊 Полезные команды

### Просмотр логов

```bash
# Все логи
docker compose -f docker-compose.production.yml logs -f

# Логи конкретного сервиса
docker compose -f docker-compose.production.yml logs -f backend
docker compose -f docker-compose.production.yml logs -f frontend
docker compose -f docker-compose.production.yml logs -f nginx
```

### Перезапуск сервисов

```bash
# Перезапустить всё
docker compose -f docker-compose.production.yml restart

# Перезапустить конкретный сервис
docker compose -f docker-compose.production.yml restart backend
```

### Остановка и запуск

```bash
# Остановить
docker compose -f docker-compose.production.yml down

# Запустить
docker compose -f docker-compose.production.yml up -d
```

### Доступ к контейнерам

```bash
# Backend shell
docker compose -f docker-compose.production.yml exec backend bash

# PostgreSQL
docker compose -f docker-compose.production.yml exec db psql -U apom_user -d apom_production

# Выполнить Django команду
docker compose -f docker-compose.production.yml exec backend python manage.py <команда>
```

## 🛠️ Работа с локальной машины

### Настройка Git для быстрого деплоя

1. Инициализируйте Git репозиторий (если еще не сделали):
```bash
git init
git add .
git commit -m "Initial commit"
```

2. Работайте локально:
```bash
# Внесите изменения в код
# ...

# Закоммитьте изменения
git add .
git commit -m "Описание изменений"

# Задеплойте на сервер
./deploy.sh
```

### Синхронизация через rsync (альтернатива)

```bash
# Быстрая синхронизация изменений
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='__pycache__' \
  ./ root@85.239.56.80:/var/www/asset-manager/

# Затем на сервере перезапустить нужные сервисы
ssh root@85.239.56.80 "cd /var/www/asset-manager && docker compose -f docker-compose.production.yml restart backend frontend"
```

## 🔐 Безопасность

### Измените пароли в .env.production

1. Создайте сильные пароли:
```bash
# Для Django SECRET_KEY
python -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'

# Для PostgreSQL
openssl rand -base64 32
```

2. Обновите файл `.env.production`

3. Задеплойте снова:
```bash
./deploy.sh
```

### Настройте firewall

```bash
# На сервере
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## 📝 Проверка работоспособности

1. Откройте браузер и перейдите на http://raskadrawka.ru
2. Проверьте админку: http://raskadrawka.ru/admin
3. Проверьте API: http://raskadrawka.ru/api/

## ❓ Решение проблем

### Сайт не открывается

```bash
# Проверьте статус контейнеров
docker ps

# Проверьте логи nginx
docker compose -f docker-compose.production.yml logs nginx

# Проверьте доступность портов
netstat -tulpn | grep LISTEN
```

### Ошибки базы данных

```bash
# Проверьте подключение к БД
docker compose -f docker-compose.production.yml exec backend python manage.py dbshell

# Пересоздайте БД (ВНИМАНИЕ: удалит все данные!)
docker compose -f docker-compose.production.yml down -v
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml exec backend python manage.py migrate
```

### Frontend не отображается

```bash
# Пересоберите frontend
docker compose -f docker-compose.production.yml build frontend --no-cache
docker compose -f docker-compose.production.yml up -d frontend
```

## 📞 Поддержка

При возникновении проблем проверьте логи всех сервисов:

```bash
docker compose -f docker-compose.production.yml logs --tail=100
```
