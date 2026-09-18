# Electronic Queue MVP — Foundation

Технический фундамент MVP электронной очереди: один Go backend, одно React-приложение,
PostgreSQL как будущий source of truth. Бизнес-логики, бизнес-таблиц и авторизации пока нет.

## Tech stack

Go 1.25+, net/http, chi v5, pgx v5/pgxpool, log/slog, golang-migrate v4;
PostgreSQL 17; React 19, TypeScript, Vite 7, npm; Docker Compose.
Миграции используют PostgreSQL driver golang-migrate (lib/pq), API — pgxpool.

## Requirements

Docker Engine/Desktop и Docker Compose v2 plugin с поддержкой
`service_healthy` и `service_completed_successfully`. Локальные Go и Node для Docker workflow не нужны.

## Environment setup / Start

Из корня этого репозитория (папки с `docker-compose.yml`):

```bash
cp .env.example .env
docker compose up --build
```

Compose ждёт PostgreSQL healthcheck (с автоматической инициализацией схемы через `init.sql`), затем запускает API и frontend.
Здесь нет sleep-задержек. PostgreSQL порт наружу не публикуется.

| Variable | Development example / назначение |
| --- | --- |
| APP_ENV | `development`, поле environment в startup log |
| LOG_LEVEL | `INFO` (`DEBUG`, `INFO`, `WARN`, `ERROR`) |
| HTTP_PORT | `8080`, порт API внутри контейнера и на host |
| POSTGRES_HOST | `postgres`, имя Compose service |
| POSTGRES_PORT | `5432`, внутренний порт PostgreSQL |
| POSTGRES_DB | `postcode` |
| POSTGRES_USER | `postcode` |
| POSTGRES_PASSWORD | пример для локальной разработки; задайте свой в `.env` |
| CORS_ALLOWED_ORIGIN | `http://localhost:5173`, один origin без завершающего `/` |
| VITE_API_BASE_URL | `http://localhost:8080`, URL API, доступный **браузеру** |
| FRONTEND_PORT | `5173`, порт frontend на host |
| GRAFANA_USER | `admin`, логин администратора Grafana |
| GRAFANA_PASSWORD | `admin`, пароль администратора Grafana |

Backend валидирует обязательные настройки при старте. `.env` не коммитится.
Значения `POSTGRES_HOST=postgres` и `POSTGRES_PORT=5432` соответствуют этому Compose;
изменять их без изменения DB service не нужно. Соединение в локальной Docker-сети без TLS.
Vite получает `VITE_API_BASE_URL` при запуске; это публичная настройка, не секрет.
После изменения `.env` пересоздайте сервисы через `docker compose up -d --build`.
При смене frontend/backend port обновите также CORS origin/API URL.

## URLs / Health

- Frontend: http://localhost:5173
- Client: http://localhost:5173/
- Operator placeholder: http://localhost:5173/operator
- Admin placeholder: http://localhost:5173/admin
- Liveness: http://localhost:8080/health
- Readiness: http://localhost:8080/ready
- Backend Metrics: http://localhost:8080/metrics
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (логин/пароль по умолчанию: `admin` / `admin`)

```bash
curl -i http://localhost:8080/health
curl -i http://localhost:8080/ready
curl -i -H 'Origin: http://localhost:5173' http://localhost:8080/health
```

`/health` → 200 `{"status":"ok"}` без запросов к БД.
`/ready` → 200 при успешном PostgreSQL ping, иначе 503 (таймаут 2 секунды).
**PostgreSQL down: `/health` → 200, `/ready` → 503.**
Pool создаёт подключения по требованию и восстанавливает их после возврата БД.
Docker healthcheck API проверяет liveness.

Откройте frontend: индикатор проходит `Checking...` → `Available` или `Unavailable`.
В DevTools → Network проверьте реальный GET `http://localhost:8080/health`.
Проверка выполняется при открытии страницы, ограничена 5 секундами; для повтора обновите страницу.
В `.env` нельзя указывать `http://backend:8080` как VITE URL: браузер не знает Docker DNS.

## Migrations

SQL лежит в `backend/migrations`. Initial migration выполняет только `SELECT 1`;
единственная техническая таблица — `schema_migrations`, которой управляет golang-migrate.

```bash
# Apply pending migrations (also happens during Compose startup)
docker compose run --rm migrate migrate up
# Current version; expected version=1, dirty=false
docker compose run --rm migrate migrate version
# Inspect PostgreSQL directly
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "TABLE schema_migrations;"'
```

При добавлении миграций к уже работающему окружению применяйте их явно указанной командой.
`docker compose restart` сам по себе не применяет новые миграции и не перечитывает `.env`.
При ошибке migration backend не стартует; исправьте SQL/доступность БД и повторите `up`.
Если schema dirty, сначала изучите состояние БД; не сбрасывайте версию вслепую.

## Stop / Restart / Remove local data

```bash
docker compose restart
docker compose down
docker compose up -d
```

Named volume `postgres_data` сохраняется при restart и down/up.

```bash
docker compose down -v
```

**Эта команда удаляет локальный PostgreSQL volume и все локальные данные.**
Изменение POSTGRES_USER/PASSWORD/DB в `.env` не меняет уже инициализированную БД в volume.

## Repository structure

- `backend/cmd/api`: entry point, команды миграций, SIGINT/SIGTERM и graceful shutdown.
- `backend/internal/config`: чтение и проверка environment, построение DSN.
- `backend/internal/database`: pgxpool и golang-migrate.
- `backend/internal/httpapi`: chi router, health/readiness, request ID, logs, recovery, CORS.
- `backend/internal/observability`: JSON slog logger.
- `backend/migrations`: SQL migrations без бизнес-схемы.
- `qa/sprint1`: независимый black-box HTTP verification suite для Спринта №1.
- `frontend/src/api`: общий health API helper.
- `frontend/src/pages`: отдельные Client/Operator/Admin placeholders.
- `frontend/src/App.tsx`: health indicator и простое разделение страниц по pathname.
- `docker-compose.yml`: postgres → backend → frontend.

Дополнительный frontend router пока не нужен; страницы открываются обычными ссылками,
Vite обслуживает их через SPA fallback. Новые backend packages добавляются по мере появления кода.
Для Docker workflow после изменений исходников выполните `docker compose up -d --build`.

### Frontend dev-сервер: stale-модули (Docker Desktop)

Vite внутри контейнера читает исходники с Windows-хоста (bind mount), и inotify может
терять события изменения файлов. Тогда dev-сервер продолжает отдавать предыдущую версию
модуля: код на диске уже исправлен, а браузер выполняет старую логику (например, у оператора
отображалось «0 талонов», хотя талоны есть в БД). `frontend/vite.config.ts` включает
`server.watch.usePolling`, чтобы dev-сервер всегда отдавал актуальный код.

Если экран всё равно показывает старое поведение — перезапустите frontend и обновите страницу (Ctrl+F5):

```bash
docker compose restart frontend
```

## Testing

С локальными Go 1.25+ и Node 22.12+/npm:

```bash
cd backend
go test ./...
go vet ./...
cd ../frontend
npm ci
npm run typecheck
npm run build
cd ..
```

Без локальных Go/Node проверки можно выполнить в контейнерах:

```bash
docker run --rm -v "$PWD/backend:/src" -w /src golang:1.25-alpine sh -c 'go test ./... && go vet ./...'
docker compose run --rm --no-deps frontend npm run build
```

Go API tests используют `httptest`: health при отказавшей БД, readiness success/failure,
безопасный panic response, CORS и request logs. Config test проверяет обязательные значения и escaping пароля.

### Black-box QA тестирование (Спринт №1)

Сквозное тестирование сценариев Спринта №1 (Happy path, идемпотентность, маршрутизация, конкурентный вызов) против работающего стенда:

```bash
cd qa/sprint1
go test -v -count=1 ./...
# или запуск CLI-раннера с проверкой повторяемости:
go run ./cmd/runner -repeat=3
```
Подробное описание: [qa/sprint1/README.md](qa/sprint1/README.md).

### Compose smoke / persistence

```bash
docker compose config --quiet
docker compose up -d --build --wait
docker compose ps -a
curl -f http://localhost:8080/health
curl -f http://localhost:8080/ready
curl -f http://localhost:5173/
docker compose run --rm migrate migrate version
# Real outage: health must stay 200, ready must become 503
docker compose stop postgres
curl -i http://localhost:8080/health
curl -i http://localhost:8080/ready
docker compose start postgres
docker compose restart postgres
docker compose up -d --wait postgres
curl -f http://localhost:8080/ready
docker compose run --rm migrate migrate version
# Repeat without deleting the volume
docker compose down
docker compose up -d --wait
curl -f http://localhost:8080/ready
docker compose run --rm migrate migrate version
```

После возврата PostgreSQL readiness может кратко оставаться 503, пока pool заменяет закрытое
подключение; повторите curl. Версия после restart/down/up должна оставаться 1, dirty=false.
Проверьте browser health indicator отдельно через DevTools, как описано выше.

## Troubleshooting

- **Port already in use:** освободите 8080/5173 или измените HTTP_PORT/FRONTEND_PORT и согласуйте CORS/API URL.
- **PostgreSQL unhealthy:** проверьте logs, доступность диска и credentials существующего volume.
- **`/ready` = 503:** проверьте `docker compose ps`, PostgreSQL logs и POSTGRES_*; `/health` должен оставаться 200.
- **Database unready:** смотрите логи postgres; backend ждёт перехода postgres в статус healthy.
- **Frontend cannot reach backend:** URL должен быть доступен браузеру; CORS origin должен точно совпадать с адресом frontend, включая порт. Не путайте localhost и 127.0.0.1.
- **Stale Docker build:** `docker compose build --no-cache`, затем `docker compose up -d --force-recreate`.
- **Permission/daemon error:** убедитесь, что Docker запущен и пользователь имеет доступ к нему.

```bash
docker compose logs --tail=100 backend postgres frontend
docker compose logs -f backend
docker compose exec postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Backend пишет JSON logs: time, level, msg, service; HTTP logs содержат request_id, method,
path, status, duration. Заголовки, query string, DSN и текст driver errors не логируются.
SIGINT/SIGTERM прекращает приём запросов, даёт текущим до 5 секунд и закрывает pool.
