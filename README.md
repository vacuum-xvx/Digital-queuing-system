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

---

## Алгоритм очереди (due_at Scheduling Engine)

Система электронной очереди переведена на детерминированный алгоритм планирования по **крайнему сроку обслуживания (`due_at`)**, обеспечивающий строгое соблюдение нормативов SLA Почты России и бесконфликтное обслуживание клиентов разных категорий.

### 1. Расчет `due_at` и `ready_at` (Формулы)

Расчет выполняется чистой детерминированной функцией `ComputeSchedule(policy, ticket, checkinAt)`:

* **APPOINTMENT (Предварительная запись):**
  * **Клиент пришёл вовремя** (`checkin_at <= scheduled_at + grace_minutes`, по умолчанию grace = 5 мин):
    $$\text{due\_at} = \text{scheduled\_at}$$
    $$\text{ready\_at} = \max(\text{checkin\_at},\; \text{scheduled\_at} - \text{early\_window\_minutes})$$
    $$\text{source\_rank} = 0$$
    *Талон нельзя вызвать раньше, чем за `early_window_minutes` (10 мин) до слота.*
  * **Клиент опоздал** (`checkin_at > scheduled_at + grace_minutes`):
    Талон **не сгорает**, а переводится в режим живой очереди:
    $$\text{due\_at} = \text{checkin\_at} + \text{max\_wait\_minutes}\; (30\text{ мин})$$
    $$\text{ready\_at} = \text{checkin\_at}$$
    $$\text{source\_rank} = 2\; (\text{ранг LIVE})$$
  * **До подтверждения прибытия (чекина):**
    $$\text{ready\_at} = \text{scheduled\_at} + 365\text{ дней}\; (\text{не вызывается до визита})$$

* **QR (Талон через мобильное приложение / QR-код):**
  $$\text{due\_at} = \text{checkin\_at} + \text{max\_wait\_minutes}\; (30\text{ мин})$$
  $$\text{ready\_at} = \text{checkin\_at}$$
  $$\text{source\_rank} = 1$$

* **LIVE (Талон из терминала в зале):**
  $$\text{due\_at} = \text{checkin\_at} + \text{max\_wait\_minutes}\; (30\text{ мин})$$
  $$\text{ready\_at} = \text{checkin\_at}$$
  $$\text{source\_rank} = 2$$

*Если для конкретной услуги в `queue_policy.yaml` задан собственный `max_wait_minutes`, он имеет наивысший приоритет.*

---

### 2. Конфигурация через `queue_policy.yaml`

Политика очереди вынесена в корень проекта в файл `queue_policy.yaml`. Конфигурация автоматически валидируется и поддерживает **Hot-Reload каждые 5 секунд** без перезапуска сервисов:

```yaml
policy_version: 1

appointment:
  grace_minutes: 5         # Окно опоздания (минут после слота)
  early_window_minutes: 10 # За сколько минут до слота разрешено вызывать

sources:
  appointment:
    rank: 0                # Приоритет при равном due_at
    max_wait_minutes: 30
  qr:
    rank: 1
    max_wait_minutes: 30
  live:
    rank: 2
    max_wait_minutes: 30

services:                  # Переопределения для критичных или быстрых услуг
  "22222222-2222-2222-2222-222222222222":
    max_wait_minutes: 20
  "55555555-5555-5555-5555-555555555555":
    max_wait_minutes: 15

call:
  client_timeout_seconds: 90 # Таймаут ожидания явки клиента к окну
  max_recalls: 2             # Количество повторных вызовов перед NO_SHOW

window_close:
  policy: "finish_current"   # "finish_current" (завершить текущего) или "return_to_queue" (вернуть в очередь)
```

---

### 3. Порядок вызова в `CallNext`

Вызов следующего талона оператором выполняется атомарно на уровне СУБД с защитой от race conditions:

```sql
SELECT id, public_number, ...
FROM tickets t
WHERE t.branch_id = :branch_id
  AND (t.window_id IS NULL OR t.window_id = :window_id)
  AND EXISTS (SELECT 1 FROM window_services ws WHERE ws.window_id = :window_id AND ws.service_id = t.service_id)
  AND (t.status = 'WAITING' OR (t.source = 'APPOINTMENT' AND t.status = 'SCHEDULED'))
  AND t.ready_at <= :now
ORDER BY
  t.due_at ASC,      -- 1. Сначала тот, чей дедлайн ближе (или более просрочен)
  t.source_rank ASC, -- 2. При равном due_at: Запись (0) > QR (1) > Живая очередь (2)
  t.checkin_at ASC,  -- 3. FIFO по времени регистрации
  t.id ASC           -- 4. Детерминированный tie-breaker по UUID
LIMIT 1
FOR UPDATE OF t SKIP LOCKED;
```

**Ключевые свойства реализации:**
1. **Идемпотентность по `X-Request-Id`**: повторный вызов с тем же ключом идемпотентности возвращает уже назначенный талон без повторного смещения очереди.
2. **Диагностика пустоты**: метод различает пустую очередь (`ErrNoEligibleTickets`) и очередь, где клиенты есть, но их время еще не наступило (`ErrNotEligibleYet`).
3. **Неизменяемый аудит-лог**: все шаги вызова логируются в таблицу `ticket_events` с trigger `trg_ticket_events_no_mutation` (append-only: UPDATE и DELETE блокируются).
4. **Фоновый воркер восстановления (Reconciliation)**: каждые 5 секунд проверяет талоны в статусе `CALLED`. При превышении таймаута (90с) производит до 2 повторных вызовов, после чего переводит талон в `NO_SHOW` и освобождает окно.
5. **Дискретно-событийная симуляция (DES) для ETA**: оценка времени ожидания симулирует освобождение всех открытых окон, поддерживающих услугу талона.

---

### 4. Наглядный пример: Запись на 14:00 vs QR в 13:40

**Сценарий:**
* В **13:40** клиент **Б** берет талон по **QR-коду** (`source = QR`).
* В **13:55** в отделение приходит клиент **А**, записанный на прием на **14:00** (`source = APPOINTMENT`).
* В **13:55** оператор нажимает «Вызвать следующего». **Кто будет вызван первым?**

**Расчет параметров:**
1. **Клиент Б (QR):**
   * $\text{checkin\_at} = 13:40$
   * $\text{due\_at} = 13:40 + 30\text{ мин} = \mathbf{14:10}$
   * $\text{ready\_at} = 13:40 \le 13:55$ (готов к вызову)
2. **Клиент А (Запись):**
   * Клиент пришёл в 13:55 (за 5 минут до слота, внутри `early_window = 10 мин` и до `grace = 5 мин`).
   * $\text{due\_at} = \text{scheduled\_at} = \mathbf{14:00}$
   * $\text{ready\_at} = 13:55 \le 13:55$ (готов к вызову)

**Сравнение дедлайнов:**
$$\text{due\_at}(\text{Запись}) = 14:00 < \text{due\_at}(\text{QR}) = 14:10$$

**Результат:**
**Первым будет вызван клиент по записи (А)**, несмотря на то, что клиент по QR пришёл на 15 минут раньше. Причина: обязательство отделения перед клиентом по записи наступает в **14:00**, тогда как нормативное время обслуживания по QR-талону истекает только в **14:10**.

