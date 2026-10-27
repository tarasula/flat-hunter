#!/usr/bin/env bash
#
# Автообновление Flat Hunter на macOS.
# Регистрирует фоновую задачу (launchd), которая каждые 2 минуты делает
# `git pull` в папке репозитория. Расширение само замечает новые файлы
# и перезагружается (см. background.js).
#
# Установка:  bash scripts/auto-update-mac.sh
# Удаление:   bash scripts/auto-update-mac.sh --uninstall
# Лог:        ~/Library/Logs/flat-hunter-autoupdate.log

set -euo pipefail

LABEL="com.flathunter.autoupdate"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/flat-hunter-autoupdate.log"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INTERVAL_SECONDS=120

if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "✅ Автообновление отключено."
  exit 0
fi

GIT="$(command -v git || true)"
if [[ -z "$GIT" ]]; then
  echo "❌ git не найден. Установите Xcode Command Line Tools: xcode-select --install"
  exit 1
fi

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "❌ $REPO_DIR — не git-репозиторий. Склонируйте репо через git clone или GitHub Desktop."
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$GIT</string>
    <string>-C</string>
    <string>$REPO_DIR</string>
    <string>pull</string>
    <string>--ff-only</string>
    <string>--quiet</string>
  </array>
  <key>StartInterval</key><integer>$INTERVAL_SECONDS</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "✅ Автообновление включено: git pull каждые $((INTERVAL_SECONDS / 60)) мин в"
echo "   $REPO_DIR"
echo "   Лог ошибок: $LOG"
