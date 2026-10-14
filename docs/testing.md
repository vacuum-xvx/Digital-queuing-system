# Материалы проверки

[Запуск и учётные записи](../README.md#запуск) ·
[Алгоритм](../README.md#как-рассчитывается-очередь) · [OpenAPI](openapi.yaml)

Команды ниже выполняются из корня репозитория. Наличие теста не означает,
что он пройден на текущей версии. HTTP/browser/release-наборы изменяют данные:
используйте отдельный QA-стенд с демо-отделением, а не рабочую очередь.

## Локальные проверки

Нужны Go 1.25+, Node 22.12+, npm; для проверки контракта — Python 3 и PyYAML.

```bash
(cd backend && go test ./... && go vet ./...)
(cd frontend && npm ci && npm test && npm run build)
python3 -m venv /tmp/queue-docs-qa
/tmp/queue-docs-qa/bin/pip install PyYAML
/tmp/queue-docs-qa/bin/python qa/sprint4/openapi.py
```

- [Domain-тесты](../backend/internal/domain/queue_schedule_test.go): расчёт сроков и политика.
- [HTTP-тесты](../backend/internal/httpapi/): маршруты, DTO, ошибки, авторизация, ETA, пагинация.
- [Persistence-тесты](../backend/internal/persistence/): очередь, конкурентные назначения,
  идемпотентность, события, окна и услуги; часть требует PostgreSQL.
- [Frontend-тесты](../frontend/tests/): проверки исходников интерфейса и расчёта загрузки;
  `npm run build` также запускает TypeScript typecheck.
- [OpenAPI-проверка](../qa/sprint4/openapi.py): внутренние `$ref`, соответствие маршрутам,
  описание защищённых ответов и nullable-полей ETA. Это не полная проверка всех DTO:
  парсер не учитывает маршруты `r.With(...).Post/Delete` и операции через Path Item `$ref`.
  Его PASS охватывает 45 операций; ещё два алиаса создания/удаления окон проверяются
  по [RegisterRoutes](../backend/internal/httpapi/handlers.go) отдельно (всего 47).

## Интеграционные тесты PostgreSQL

Требуется отдельная PostgreSQL 17 БД и роль с правом создания схем;
для `go test -race` — поддерживаемая Go платформа, включённый CGO и C-компилятор.
Compose не публикует порт PostgreSQL на хост. Можно поднять отдельную тестовую БД:

```bash
docker run --name queue-qa-postgres -d \
  -e POSTGRES_USER=queueqa -e POSTGRES_PASSWORD=queueqa \
  -e POSTGRES_DB=queueqa -p 127.0.0.1:55432:5432 postgres:17-alpine
docker exec queue-qa-postgres pg_isready -U queueqa -d queueqa
# Дождитесь accepting connections, затем:
(cd backend && CORE_TEST_DATABASE_URL='postgres://queueqa:queueqa@localhost:55432/queueqa?sslmode=disable' \
  go test -race -count=1 -v ./...)
docker stop queue-qa-postgres
```

Для повторного запуска контейнера: `docker start queue-qa-postgres`.
Без `CORE_TEST_DATABASE_URL` интеграционные тесты выводят SKIP.
[Harness](../backend/internal/persistence/postgres_integration_test.go) создаёт случайную
схему на тест, применяет миграции и удаляет только эту схему при завершении.
Актуальные проверки сроков: [due_at_integration_test.go](../backend/internal/persistence/due_at_integration_test.go),
[ETA](../backend/internal/persistence/eta_integration_test.go),
[совместимость услуг](../backend/internal/persistence/window_services_integration_test.go).

## Подсистема уведомлений и сценарий T8 (отказ демо-сервиса)

Подсистема уведомлений использует паттерн **Transactional Outbox**:
1. При вызове талона (`CallNextAt` / `CallSpecificTicketAt`) запись о событии вызова атомарно сохраняется в таблицу `notification_outbox` в рамках той же транзакции PostgreSQL.
2. Сетевой вызов провайдера уведомлений никогда не выполняется внутри транзакции БД очереди.
3. Фоновый worker (`OutboxWorker`) периодически считывает неотправленные сообщения (`FOR UPDATE SKIP LOCKED`) и отправляет их на настроенный `NOTIFICATION_PROVIDER_URL`.
4. При недоступности сервиса уведомлений, сетевых таймаутах или HTTP 5xx ошибках:
   - Вызов талона оператором **НЕ откатывается** и остаётся в статусе `CALLED`;
   - Окно оператора **НЕ блокируется** и продолжает нормальное обслуживание;
   - Запись в outbox остаётся в статусе `PENDING` с инкрементом `attempts` и экспоненциальным backoff (`next_attempt_at`);
   - После исчерпания максимального числа попыток (`NOTIFICATION_MAX_ATTEMPTS`, по умолчанию 3) статус фиксируется как `FAILED` с сохранением `last_error` для аудита;
   - При восстановлении сервиса новые события доставляются в штатном режиме (`SENT`).

### Автоматические тесты подсистемы уведомлений

```bash
# 1. Модульные тесты транспортов, воркера, таймаутов, ретраев и идемпотентности
(cd backend && go test -v -race ./internal/notification/...)

# 2. Интеграционный тест сценария T8 с реальной БД PostgreSQL
(cd backend && CORE_TEST_DATABASE_URL='postgres://postcode:local-development-only@172.19.0.2:5432/postcode?sslmode=disable' \
  go test -v -race -run TestT8_NotificationProviderOutageVerifiesQueueReliability ./internal/persistence/...)
```

### Воспроизведение сценария T8 на стенде Docker Compose

Сервис `notification-demo` поднимается в составе `docker compose up -d` на порту `8082` и поддерживает управление режимами через HTTP API:
- `POST /mode` с телом `{"mode":"SUCCESS"|"FAIL"|"TIMEOUT"}`
- `GET /health` — статус сервиса и текущий режим
- `GET /history` — журнал доставленных сообщений с подсчётом дубликатов
- `POST /reset` — сброс журнала и возврат в режим `SUCCESS`

**Шаги проверки T8:**

1. **Проверка доступности сервисов:**
   ```bash
   curl -s http://localhost:8080/ready
   # Ответ: {"database":"ok","status":"ready"}
   curl -s http://localhost:8082/health
   # Ответ: {"mode":"SUCCESS","status":"ok"}
   ```

2. **Имитация аварии сервиса уведомлений (режим FAIL):**
   ```bash
   curl -s -X POST http://localhost:8082/mode \
     -H "Content-Type: application/json" \
     -d '{"mode":"FAIL"}'
   # Ответ: {"mode":"FAIL","status":"ok"}
   ```

3. **Вызов талона оператором:**
   Вызовите следующий талон через UI `/operator` или API:
   ```bash
   curl -s -X POST http://localhost:8080/api/v1/operator/windows/33333333-3333-3333-3333-333333333333/call-next \
     -H "Cookie: session=<OPERATOR_SESSION_COOKIE>"
   ```
   **Результат:** Талон успешно переходит в статус `CALLED`, окно №1 закрепляется за талоном, номер отображается на табло `/tv`. Сбой провайдера уведомлений **не привёл** к ошибке оператора или откату очереди.

4. **Проверка состояния Outbox:**
   ```bash
   curl -s http://localhost:8080/api/v1/admin/notifications/outbox?status=FAILED \
     -H "Cookie: session=<OPERATOR_OR_CHIEF_COOKIE>"
   ```
   Запись о вызове фиксирует `attempts: 3`, `status: "FAILED"`, `lastError: "notification provider returned HTTP 503"`.

5. **Восстановление доступности провайдера (режим SUCCESS):**
   ```bash
   curl -s -X POST http://localhost:8082/mode \
     -H "Content-Type: application/json" \
     -d '{"mode":"SUCCESS"}'
   ```
   Последующие вызовы талонов успешно доставляют уведомления (`status: "SENT"`, `duplicate_count: 1` в `/history`).

## HTTP QA и release

Существующие наборы: [Sprint 1](../qa/sprint1/README.md),
[Sprint 2](../qa/sprint2/README.md), [Sprint 3](../qa/sprint3/README.md).
Их README описывают исторические контракты: выбор по баллам и вызов записи без
подтверждения прибытия расходятся с текущим алгоритмом `due_at`.
Сообщение Sprint 3 о незарегистрированных маршрутах также устарело — они есть в
[handlers.go](../backend/internal/httpapi/handlers.go). Такие расхождения нельзя
устранять изменением production ranking ради старых тестов.

[release.py](../qa/sprint4/release.py) проверяет реальные HTTP-сессии, роли,
талонный цикл, ETA и конкурентные действия. Он завершает талоны в демо-очереди,
открывает окна и оставляет историю/QA-пользователей в БД.

```bash
# Только для локального стенда с неизменёнными seed-пользователями:
export BASE_URL=http://localhost:8080
export QA_OPERATOR_PASSWORD=operator1234
export QA_CHIEF_PASSWORD=admin1234
python3 qa/sprint4/release.py --runs 1
```

Для других аккаунтов задайте `QA_OPERATOR_EMAIL`, `QA_CHIEF_EMAIL` и их пароли.
Флаг `--legacy` запускает Go-наборы Sprint 1–3 с авторизованной сессией
`QA_SESSION_TOKEN`; `--restart` дополнительно перезапускает PostgreSQL/backend
через Compose и проверяет сохранность состояния. По умолчанию выполняются 3 прогона.

Отдельный исторический набор можно запустить с действующей cookie `session`:

```bash
# QA_SESSION_TOKEN — значение cookie после POST /api/v1/auth/login.
(cd qa/sprint1 && go test -v -count=1 ./...)
(cd qa/sprint2 && go test -v -count=1 ./...)
(cd qa/sprint3 && go test -v -count=1 ./...)
```

Перед этими командами экспортируйте `QA_SESSION_TOKEN` в окружение.
CLI-раннеры и параметры повторов описаны в README соответствующего набора.

## Browser и нагрузка

Нужны запущенные UI/API, Playwright и установленный Chrome/Chromium.
`CHROMIUM_PATH` укажите по фактическому пути браузера:

```bash
npm install --prefix /tmp/sprint4-browser playwright
export UI_BASE_URL=http://localhost:5173
export CHROMIUM_PATH=/usr/bin/google-chrome
node qa/sprint4/browser.mjs
node qa/sprint4/visual-regression.mjs
node qa/sprint4/admin-tabs.mjs
```

[browser.mjs](../qa/sprint4/browser.mjs) использует реальные аккаунты из
`QA_OPERATOR_PASSWORD`/`QA_CHIEF_PASSWORD` и проверяет QR → оператор → завершение,
мобильную ширину и сохранение сессии. Начинайте с пустой QA-очереди и открытого окна №1.
Известное расхождение: сценарий записи ищет поле `Дата и время (МСК)`, которого нет
в текущем [ClientWorkspace](../frontend/src/features/client/ClientWorkspace.tsx):
он использует [Appointment24hPicker](../frontend/src/features/client/Appointment24hPicker.tsx).
Поэтому полный `browser.mjs` нельзя считать проходящим текущий UI без обновления теста;
для записи используйте ручной сценарий ниже.
[visual-regression.mjs](../qa/sprint4/visual-regression.mjs) проверяет цвета,
доступность и табло с подставным ответом API.
[admin-tabs.mjs](../qa/sprint4/admin-tabs.mjs) подставляет ответы API для вкладок и
пагинации; в нём путь `/usr/bin/google-chrome` задан жёстко.
Скриншоты записываются в `/tmp/queue-*.png` и `/tmp/admin-*.png`.
При другой установке Playwright задайте `PLAYWRIGHT_MODULE` — путь к `index.mjs`.

[Нагрузочный сценарий](../scripts/load_test.js) создаёт QR-талоны и читает публичные API:

```bash
bash scripts/run_load_test.sh http://localhost:8080
```

[Обёртка](../scripts/run_load_test.sh) использует локальный k6 или Docker с
`--network host` (учитывайте поддержку этого режима на вашей ОС). Созданные талоны
остаются в очереди. Скрипт [restore_backup](../scripts/restore_backup.sh)
относится к эксплуатации, а не к QA.

## Демонстрационный сценарий

1. Выполните [запуск](../README.md#запуск), проверьте `/ready` и версию миграций.
   Используйте демо-отделение `11111111-1111-1111-1111-111111111111`.
2. В отдельном профиле браузера войдите на `/operator` под seed-оператором.
   Выберите окно №1 (`33333333-3333-3333-3333-333333333333`), убедитесь,
   что оно открыто и поддерживает «Посылки». При необходимости откройте его через `/admin`.
3. В клиентском браузере откройте `/q/11111111-1111-1111-1111-111111111111`,
   выберите «Посылки» и нажмите «Получить талон». Ожидается номер `Q-*`, `WAITING`,
   позиция/ETA; само открытие QR-страницы талон не создаёт.
4. Откройте `/tv?branchId=11111111-1111-1111-1111-111111111111`.
   У оператора нажмите «Вызвать следующего»: клиент и табло покажут номер и окно.
   Начните обслуживание, затем завершите: `CALLED → SERVING → COMPLETED`.
   При непустой очереди сначала могут вызываться ранее созданные талоны.
5. На `/` создайте запись на будущее и подтвердите «Я уже в отделении».
   Проверьте автоматический «Вызвать следующего» без выбора конкретного номера:
   он учитывает `ready_at` и раннее окно; ручной вызов конкретного талона это условие обходит.
   отдельную ещё не вызванную запись отмените и проверьте `CANCELLED`.
6. В `/admin` проверьте очередь и окна. Журнал талона доступен авторизованному
   сотруднику через `GET /api/v1/admin/tickets/{ticketId}/events` —
   [контракт](openapi.yaml) описывает запрос и ответ.

`/demo` содержит моделируемые показатели и не заменяет этот сценарий на реальном API.
