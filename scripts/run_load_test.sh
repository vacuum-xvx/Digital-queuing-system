#!/usr/bin/env bash
set -euo pipefail

TARGET_URL="${1:-http://localhost:8080}"
echo "🚀 Запуск нагрузочного тестирования k6..."
echo "📍 Целевой URL: ${TARGET_URL}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v k6 &>/dev/null; then
  BASE_URL="${TARGET_URL}" k6 run "${SCRIPT_DIR}/load_test.js"
else
  echo "ℹ️ Локальный бинарник k6 не найден, запускаем в Docker (grafana/k6)..."
  docker run --rm -i --network host -e BASE_URL="${TARGET_URL}" grafana/k6:latest run - < "${SCRIPT_DIR}/load_test.js"
fi
