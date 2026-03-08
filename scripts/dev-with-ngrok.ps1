$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Refresh PATH so ngrok is found if just installed
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

function Get-NgrokPublicUrl {
    try {
        $tunnels = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3
        if ($tunnels.tunnels.Count -gt 0) {
            return ($tunnels.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1).public_url
        }
    }
    catch {
        return $null
    }
    return $null
}

function Get-NgrokPath {
    $cmd = Get-Command ngrok -ErrorAction SilentlyContinue
    if ($cmd) {
        $p = $cmd.Source
        if ($p -and (Test-Path $p)) { return $p }
    }
    $paths = @(
        "$PSScriptRoot\ngrok\ngrok.exe",
        "$env:LOCALAPPDATA\Microsoft\WindowsApps\ngrok.exe",
        "$env:LOCALAPPDATA\Programs\ngrok\ngrok.exe",
        "$env:ProgramFiles\ngrok\ngrok.exe",
        "$env:ProgramFiles(x86)\ngrok\ngrok.exe",
        "$env:ChocolateyInstall\bin\ngrok.exe"
    )
    foreach ($p in $paths) {
        if ($p -and (Test-Path $p)) { return $p }
    }
    return $null
}

$publicUrl = Get-NgrokPublicUrl
if (-not $publicUrl) {
    $ngrokPath = Get-NgrokPath
    $started = $false
    if ($ngrokPath) {
        try {
            Start-Process -FilePath $ngrokPath -ArgumentList "http 8000" -WindowStyle Hidden
            $started = $true
        } catch {}
    }
    if (-not $started) {
        try {
            Start-Process ngrok -ArgumentList "http 8000" -WindowStyle Hidden
            $started = $true
        } catch {}
    }
    if ($started) {
        Start-Sleep -Seconds 3
        $publicUrl = Get-NgrokPublicUrl
    }
}

if (-not $publicUrl) {
    Write-Host ""
    Write-Host "ngrok not found or not running." -ForegroundColor Red
    Write-Host ""
    Write-Host "Install: winget install ngrok.ngrok  OR  choco install ngrok" -ForegroundColor Yellow
    Write-Host "Or download: https://ngrok.com/download"
    Write-Host ""
    Write-Host "Alternative: run ngrok manually in another terminal:" -ForegroundColor Cyan
    Write-Host "  ngrok http 8000"
    Write-Host "Then run this script again."
    Write-Host ""
    exit 1
}

$publicUrl = $publicUrl.TrimEnd("/")
$hostname = ([Uri]$publicUrl).Host
$projectRoot = Split-Path $PSScriptRoot -Parent
$envPath = Join-Path $projectRoot ".env.local"

$envContent = @{}
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.*)$') {
            $envContent[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
}

$envContent["BACKEND_BASE_URL"] = $publicUrl
$envContent["ALLOWED_HOSTS"] = "localhost,127.0.0.1,backend,0.0.0.0,$hostname"

$envLines = $envContent.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
Set-Content -Path $envPath -Value $envLines -Encoding UTF8

Write-Host "BACKEND_BASE_URL=$publicUrl"
Write-Host "ALLOWED_HOSTS=$($envContent['ALLOWED_HOSTS'])"

Push-Location $projectRoot
try {
    docker-compose --env-file .env.local up -d backend celery
}
finally {
    Pop-Location
}
