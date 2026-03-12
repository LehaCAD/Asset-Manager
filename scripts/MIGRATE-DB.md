# Миграция БД на новый сервер

## 1. Дамп на локальной машине

**Важно:** дамп должен быть в UTF-8. На Windows перенаправление `>` даёт UTF-16 — символы исказятся. Используйте один из способов ниже.

**PostgreSQL в Docker (рекомендуется — без проблем с кодировкой):**
```bash
docker exec apom_db pg_dump -U postgres -d apom_db --no-owner --no-acl -f /tmp/backup.sql
docker cp apom_db:/tmp/backup.sql backup.sql
```

**PostgreSQL в Docker (PowerShell, UTF-8):**
```powershell
$env:PGCLIENTENCODING = "UTF8"
docker exec apom_db pg_dump -U postgres -d apom_db --no-owner --no-acl | Out-File -Encoding utf8 backup.sql
```
После этого открой `backup.sql` в Notepad++ и сохрани как **UTF-8 без BOM**.

**PostgreSQL без Docker:**
```bash
pg_dump -h localhost -U postgres -d apom_db --no-owner --no-acl -f backup.sql
```

## 2. Копирование на VPS

```bash
scp backup.sql root@85.239.36.28:/root/Asset-Manager/
```

## 3. Восстановление на VPS

```bash
cd /root/Asset-Manager
chmod +x scripts/restore-db.sh
./scripts/restore-db.sh backup.sql
docker compose -f docker-compose.production.yml restart backend celery
```

## Примечания

- Медиафайлы в S3 — при тех же credentials переносить не нужно
- После restore обязательно перезапусти backend и celery
- Если таблицы уже созданы миграциями, plain SQL дамп может вызвать ошибки `relation already exists`. В таком случае используйте custom-формат: `pg_dump -F c -f backup.dump` и `pg_restore -d apom_db backup.dump`
