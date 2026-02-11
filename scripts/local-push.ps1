# PowerShell скрипт для отправки изменений на сервер
# Запускать на ЛОКАЛЬНОМ компьютере Windows

$ErrorActionPreference = "Stop"

Write-Host "🔄 Отправляем изменения на сервер" -ForegroundColor Cyan

# Проверяем, что все изменения закоммичены
$status = git status --porcelain
if ($status) {
    Write-Host "⚠️  У вас есть незакоммиченные изменения:" -ForegroundColor Yellow
    git status -s
    Write-Host ""
    $commit = Read-Host "Хотите создать коммит? (y/n)"
    if ($commit -eq 'y') {
        $message = Read-Host "Введите сообщение коммита"
        git add .
        git commit -m $message
    } else {
        Write-Host "❌ Отмена. Сначала закоммитьте изменения." -ForegroundColor Red
        exit 1
    }
}

# Отправляем в репозиторий
Write-Host "📤 Отправляем в Git репозиторий..." -ForegroundColor Cyan
git push origin main

# Подключаемся к серверу и деплоим
Write-Host "🚀 Деплоим на сервер..." -ForegroundColor Cyan
ssh root@85.239.56.80 "cd /opt/asset-manager && ./scripts/deploy.sh"

Write-Host "✅ Готово! Изменения применены на сервере." -ForegroundColor Green
