#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "Использование: $0 <путь_к_бэкапу.sql.gz>"
  echo ""
  echo "Доступные бэкапы в ./backups:"
  ls -lht backups/*.sql.gz 2>/dev/null || echo "  (бэкапов пока нет)"
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "❌ Файл ${BACKUP_FILE} не найден!"
  exit 1
fi

echo "⚠️  ВНИМАНИЕ: Восстановление перезапишет текущие данные в PostgreSQL!"
read -p "Продолжить? (y/N): " -r CONFIRM
if [[ ! "${CONFIRM}" =~ ^[Yy]$ ]]; then
  echo "Отменено."
  exit 0
fi

echo "🔄 Восстановление базы данных из ${BACKUP_FILE}..."
gunzip -c "${BACKUP_FILE}" | docker compose exec -T postgres psql -U "${POSTGRES_USER:-postcode}" -d "${POSTGRES_DB:-postcode}"
echo "✅ База данных успешно восстановлена!"
