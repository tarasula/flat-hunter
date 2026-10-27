<#
  Автообновление Flat Hunter на Windows.
  Регистрирует задачу в Планировщике заданий, которая каждые 2 минуты делает
  `git pull` в папке репозитория. Расширение само замечает новые файлы
  и перезагружается (см. background.js).

  Установка (из папки репозитория, в PowerShell):
    powershell -ExecutionPolicy Bypass -File scripts\auto-update-windows.ps1
  Удаление:
    powershell -ExecutionPolicy Bypass -File scripts\auto-update-windows.ps1 -Uninstall
#>
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$TaskName = 'FlatHunterAutoUpdate'
$IntervalMinutes = 2
$RepoDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host 'Автообновление отключено.' -ForegroundColor Green
  return
}

$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git) {
  Write-Host 'git не найден. Установите Git for Windows: https://git-scm.com/download/win' -ForegroundColor Red
  exit 1
}
if (-not (Test-Path (Join-Path $RepoDir '.git'))) {
  Write-Host "$RepoDir — не git-репозиторий. Склонируйте репо через git clone или GitHub Desktop." -ForegroundColor Red
  exit 1
}

# conhost --headless запускает git без мигающего окна консоли
$action = New-ScheduledTaskAction -Execute 'conhost.exe' `
  -Argument "--headless `"$git`" -C `"$RepoDir`" pull --ff-only --quiet"

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Flat Hunter: git pull расширения каждые 2 минуты' -Force | Out-Null

Write-Host "Автообновление включено: git pull каждые $IntervalMinutes мин в $RepoDir" -ForegroundColor Green
Write-Host "Проверить/удалить можно в Планировщике заданий (задача $TaskName)."
