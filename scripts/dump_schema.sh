#!/usr/bin/env bash
set -euo pipefail

# Dumps current schema from running postgres container for reference
COMPOSE_CMD="docker compose"
if ! docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
fi

mkdir -p postgres
$COMPOSE_CMD exec -T postgres pg_dump -s -U "${POSTGRES_USER:-postcode}" "${POSTGRES_DB:-postcode}" > postgres/schema_reference.sql
echo "Schema reference dumped to postgres/schema_reference.sql"
