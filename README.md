<div align="center">

# 📮 Цифровая очередь нового поколения

**Меньше неопределённости. Больше времени для людей.**

Клиент · Оператор · Начальник отделения · Табло зала

![React 19](https://img.shields.io/badge/React-19-149ECA?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square)
![Go](https://img.shields.io/badge/Go-1.25-00ADD8?style=flat-square)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?style=flat-square)
![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square)

[Быстрый запуск](#запуск) · [Возможности](#сценарии-проекта) · [API](docs/openapi.yaml) · [Проверки](#проверки)

</div>

---

Электронная очередь для отделения Почты России: талоны через QR и терминал,
предварительная запись, управление окнами и наблюдаемость. React 19 + TypeScript
на клиенте, Go + PostgreSQL на сервере.

## 🔍 Что сдаётся на проверку

- 💻 Исходный код: [Go backend](backend/) · [React frontend](frontend/)
- 🚀 [Инструкция по запуску](#запуск)
- 📡 [OpenAPI-контракт](docs/openapi.yaml)
- 🏗️ [Архитектура](#архитектура)
- 🧠 [Алгоритм электронной очереди](#как-рассчитывается-очередь)
- 🧪 [Материалы проверки: тесты, QA и demo-сценарий](docs/testing.md)

[Быстрый запуск и URL](#запуск) · [Команды тестов](#проверки) ·
[Demo по шагам](docs/testing.md#демонстрационный-сценарий)

## Сценарии проекта

| Роль / экран | Реализовано |
|---|---|
| Клиент `/` | Выбор отделения и услуги, запись на время, талоны и их статусы, отмена |
| QR `/q/:branchId` | Страница выбранного отделения, получение талона после подтверждения |
| Терминал `/kiosk/:branchId` | Интерфейс в зале, полный экран, сброс после бездействия |
| Оператор `/operator` | Выбор окна, вызов, повторный вызов, обслуживание, завершение и перенаправление |
| Начальник `/admin` | Live-очередь, окна, расписание, политики, пользователи и показатели |
| Табло `/tv?branchId=…` | Номер талона → окно, ожидающие, голосовые объявления, московское время |

Это перечень возможностей в коде, а не заявление о формальной приёмке всех пунктов ТЗ.
Документы предметной области: [Sprint 1](docs/sprint1-domain.md),
[Sprint 2](docs/sprint2-domain.md), [Sprint 3](docs/sprint3-domain.md).
Контракт API: [OpenAPI](docs/openapi.yaml).

## Что получилось особенно хорошо

- **Общий источник данных:** PostgreSQL хранит талоны, состояние окон и события;
  табло не подставляет демонстрационные номера при пустой очереди или ошибке.
- **Детерминированный вызов:** порядок определён сроком обслуживания и стабильными
  правилами разрешения равенств. Конкурентный выбор использует блокировки PostgreSQL.
- **Понятные действия:** номер талона и окно — главные элементы табло; для начальника
  есть светлый live-экран и таблица с поиском/фильтрацией.
- **Доступность:** масштаб шрифта, высокий контраст, клавиатурный фокус,
  обозначенные выбранные кнопки, настройка звука и уменьшение анимации.
- **QR-плакат без рекламных обещаний:** только ссылка на отделение и инструкция.
- **Время без сюрпризов:** ввод и отображение записи в московском часовом поясе,
  независимо от часового пояса браузера.

## Как рассчитывается очередь

Описание ниже сверено с текущим кодом. Документы Sprint 1–3 сохраняют историю
реализации; описанный там выбор по `effectivePriority` больше не определяет `CallNext`.

### Путь посетителя

```text
QR / терминал / сайт → Отделение и услуга → Талон или запись
                                                  ↓
                            Позиция и оценка ожидания
                                                  ↓
                          Вызов на табло → Обслуживание
```

### Удобство на каждом экране

- **На телефоне:** быстрый выбор даты и времени, время справа от даты,
  адаптивный блок ожидания без разрывов слов.
- **В кабинете начальника:** UI предлагает страницы пользователей и аномалий по
  10, 25 или 50 записей, по умолчанию 25; API допускает `limit` 1–50 и без параметра использует 50.
- **У оператора:** первые 25 талонов очереди вместо загрузки всего списка;
  обновление списка по мере работы с талонами.
- **В зале:** светлое табло, крупные номера и голосовой вызов;
  озвучивание сосредоточено на экране ТВ.

### Срок обслуживания и готовность к вызову

Реализация: [ComputeSchedule](backend/internal/domain/queue_schedule.go),
[CallNext](backend/internal/persistence/postgres.go). Настройки: [queue_policy.yaml](queue_policy.yaml).

Для QR и живой очереди:

```text
ready_at = checkin_at
due_at   = checkin_at + max_wait_minutes
```

Для записи при прибытии в допустимое окно опоздания:

```text
due_at   = scheduled_at
ready_at = max(checkin_at, scheduled_at - early_window_minutes)
```

При опоздании за пределы grace-периода применяется срок живой очереди.
При автоматическом `CallNext` талон допускается к вызову только при совместимости
услуги с окном и наступившем `ready_at`. Порядок выбора:

```text
due_at ASC → source_rank ASC → checkin_at ASC → id ASC
```

Меньший `source_rank` выигрывает только при равном `due_at`: в текущем YAML
APPOINTMENT = 0, QR = 1, LIVE = 2. FIFO по `checkin_at` действует при равных
`due_at` и `source_rank`; окончательное равенство разрешается по UUID.
`max_wait_minutes` сначала берётся по UUID услуги, затем по источнику, иначе 30 минут.
Каждые 5 секунд проверяется время изменения YAML; файл перечитывается, если оно
увеличилось, и применяется только после успешной валидации. Уже сохранённые сроки
при этом автоматически не пересчитываются.

QR (`Q-*`) и LIVE (`L-*`) создаются в `WAITING` с check-in в момент создания.
Новая предварительная запись (`A-*`) создаётся на будущее в `SCHEDULED`;
до подтверждения прибытия её `ready_at` установлен на дату записи + 365 дней.
Вызов [arrive](backend/internal/persistence/sprint3.go) сохраняет `arrived_at`/`checkin_at`
и пересчитывает сроки, оставляя статус `SCHEDULED`. Повторный arrive в этом состоянии
сохраняет первое время прибытия. Далее возможен прямой переход в `CALLED`.
По YAML ранний вызов разрешён за 10 минут, допустимое опоздание — 15 минут.
При большем опоздании источник остаётся APPOINTMENT, но срок и ранг рассчитываются как LIVE.

Границы этого правила: [миграция 14](backend/migrations/000014_due_at_queue_engine.up.sql)
заполняет старые `SCHEDULED` без `due_at` значением `ready_at = scheduled_at − 10 минут`,
не требуя arrive. Новые записи используют описанный выше срок +365 дней;
это отложенный срок, а не отдельный бессрочный запрет вызова без прибытия.
[Ручной вызов](backend/internal/httpapi/operator_handlers.go) через тот же HTTP
`call-next` с `ticketId`/`publicNumber` выбирает `CallSpecificTicket`: проверяет окно,
занятость, состояние и совместимость, но не проверяет `ready_at` и не применяет ranking.
Он может вызвать запись без arrive и устанавливает `arrived_at`, если его ещё нет.

Срок — ориентир планирования, **не гарантия отсутствия ожидания**.
В коде также сохранён legacy-расчёт эффективного приоритета для диагностики/аудита;
его не следует путать с основным порядком `CallNext`.

Настраиваемые баллы источников, anti-starvation (рост баллов после порога ожидания)
и штраф опоздания находятся в [queue_policies](backend/internal/persistence/queue_policy.go).
Они используются в `calculateLegacyPriority` для `decisionPriority` события вызова,
но не сортируют кандидатов. Текущий механизм против вытеснения новыми талонами —
сохранённый срок `due_at`; отдельного повышения ранга по времени ожидания в `CallNext` нет.

### Атомарный вызов и состояния

`CallNext` в транзакции READ COMMITTED блокирует строку окна (`FOR UPDATE`),
проверяет `OPEN` и отсутствие `CALLED`/`SERVING`. Кандидаты должны принадлежать
отделению, поддерживаться через `window_services`, быть готовы по `ready_at`
и не быть закреплены за другим окном. Блокируются до трёх первых кандидатов
через `FOR UPDATE SKIP LOCKED`; первый получает окно и `CALLED`.
Обновление и событие аудита фиксируются одним commit. Блокировки талона защищают
от double assignment, а частичный уникальный индекс `tickets_one_active_per_window`
запрещает два активных талона на окно. Порядок commit конкурентных окон не гарантируется.

Основной цикл: `WAITING → CALLED → SERVING → COMPLETED`.
Отмена ожидающего талона/записи переводит его в `CANCELLED`;
неявка после вызова — в `NO_SHOW`. Действия `return` и `redirect` возвращают QR/LIVE
из `CALLED`/`SERVING` в `WAITING`; для APPOINTMENT эти действия запрещены.
См. [переходы FSM](backend/internal/domain/fsm.go) и
[обработку действий оператора](backend/internal/persistence/postgres.go).
[Recovery worker](backend/internal/persistence/recovery.go) проверяет вызовы каждые
5 секунд: по текущему YAML таймаут 90 секунд, до двух повторных вызовов, затем `NO_SHOW`.
[Журнал ticket_events](backend/internal/persistence/sprint2.go) содержит создание,
прибытие, вызов, начало/конец обслуживания, отмену, неявку, возврат и перенаправление;
для автоматического/ручного вызова сохраняются объяснение выбора, срок и legacy-баллы.
Повторный вызов recovery worker записывает `source_rank` вместо legacy-баллов.
События записываются в той же транзакции, что и изменение талона; SQL-триггер
запрещает UPDATE/DELETE журнала. Поля `reason`, `due_at`, `actor`, `request_id`, `at`
хранятся в БД, но текущий [HTTP DTO событий](backend/internal/httpapi/admin_handlers.go)
их не возвращает: API отдаёт только id, тип, статусы, окно, версию политики, баллы и время.

### Подсистема уведомлений (Transactional Outbox)

Реализация: [internal/notification](backend/internal/notification/),
[notification_outbox.go](backend/internal/persistence/notification_outbox.go),
миграция [000016_notification_outbox.up.sql](backend/migrations/000016_notification_outbox.up.sql).

- **Архитектурная изоляция:** Вызовы талонов (`CallNextAt`, `CallSpecificTicketAt`) атомарно
  сохраняют событие уведомления в таблицу `notification_outbox` внутри транзакции `CallNext`.
  Сетевые HTTP-вызовы сервиса уведомлений вынесены в асинхронный фоновый воркер `OutboxWorker`
  и никогда не выполняются внутри транзакции PostgreSQL.
- **Отказоустойчивость очереди (сценарий T8):** При сетевом таймауте, недоступности или ошибке
  HTTP 5xx провайдера уведомлений вызов талона не откатывается, окно остаётся назначенным,
  а талон сохраняет статус `CALLED`. Воркер осуществляет ограниченные повторные попытки
  с экспоненциальной задержкой (по умолчанию 3 попытки с шагом 1с, 2с, 4с) и переводит запись
  в `FAILED` при исчерпании лимита, сохраняя текст ошибки в `last_error`.
- **Идемпотентность доставки:** Каждое сообщение содержит детерминированный `id` (например, `<ticketId>-call`)
  и передаётся с заголовком `Idempotency-Key: <id>`. Демо-сервер отслеживает дубликаты
  и гарантирует корректность при повторной отправке.
- **Демо-адаптер и замена на реального провайдера:** Демо-сервис `notification-demo`
  работает в Docker Compose на порту `:8082` с эндпоинтами управления `/mode` (`SUCCESS`, `FAIL`, `TIMEOUT`),
  `/history` и `/reset`. Для интеграции с реальным шлюзом уведомлений (SMS/Push/Webhook)
  достаточно переопределить в `.env` переменную `NOTIFICATION_PROVIDER_URL` и параметры таймаутов/попыток.
- **Мониторинг Outbox:** Авторизованным сотрудникам доступен эндпоинт
  `GET /api/v1/admin/notifications/outbox` с пагинацией и фильтрацией по статусу (`PENDING`, `SENT`, `FAILED`).

### Позиция в очереди

[QueuePosition](backend/internal/persistence/queue_ranking.go) читает снимок
REPEATABLE READ. Опорное окно — первое открытое совместимое по `number, id`,
с учётом закрепления талона. Позиция равна числу готовых кандидатов перед талоном
по тому же кортежу `due_at, source_rank, checkin_at, id` плюс один.
Возможные причины: `AVAILABLE`, `NOT_ELIGIBLE_YET`, `NO_OPEN_COMPATIBLE_WINDOW`,
`NOT_QUEUED`. Поле `effectivePriority` здесь содержит базовый legacy-приоритет
(при ошибке чтения политики — `source_rank`), а не ключ сортировки.
Для старых строк без `due_at`/`checkin_at` код использует резервные значения;
сравнение с кандидатами, содержащими SQL NULL, не эквивалентно обычному полному кортежу.
Позиция — снимок для опорного окна, а не бронь следующего вызова:
занятость окна и конкурентные блокировки могут изменить фактический результат.

### Прогноз ожидания (ETA)

Реализация: [eta.go](backend/internal/persistence/eta.go).
Берутся до 20 последних завершённых обслуживаний той же услуги в отделении.
Новые измерения имеют больший вес (`i = 0` — самое свежее):

```text
duration = Σ(durationᵢ × (N − i)) / Σ(N − i)
```

Если измерений меньше трёх, используется 300 секунд. Для свободного окна время
доступности равно нулю; для занятого — `max(30, duration − elapsed)` секунд.
Моделируются `position − 1` обслуживаний длительностью `max(30, floor(duration))`:
каждое распределяется на окно с ближайшим освобождением. Модель использует окна,
совместимые с услугой клиента, и не моделирует отдельно услуги предшествующих талонов.
Прогноз для клиента — минимальное время доступности после распределения,
ограниченное диапазоном 60–1800 секунд. Это оценка, а не обещанное время приёма.
Если QueuePosition не `AVAILABLE` (в том числе нет открытого совместимого окна),
API возвращает `estimatedWaitSeconds=null` и `estimatedCallAt=null`, `sampleSize=0`,
`usedFallback=false`. Внутренняя резервная формула `clamp((position−1)×duration,60,1800)`
используется только после `AVAILABLE`, если список окон для моделирования оказался пуст.

## Запуск

Нужны Docker Engine/Desktop, Compose v2 и доступ к реестрам образов/npm/Go при сборке.
Команды выполняются из корня репозитория. Конфигурация: [docker-compose.yml](docker-compose.yml),
[.env.example](.env.example), [валидация backend env](backend/internal/config/config.go).

```bash
test -f .env || cp .env.example .env
# Для локального запуска оставьте порты и адреса из .env.example.
# При наличии .env проверьте его значения; команда выше его не перезаписывает.
docker compose config --quiet
docker compose up --build -d
docker compose ps
curl --fail http://localhost:8080/health
curl --fail http://localhost:8080/ready
docker compose exec backend /app/api migrate version
```

| Сервис | Адрес по умолчанию |
|---|---|
| Клиент | http://localhost:5173/ |
| Оператор / начальник | http://localhost:5173/operator · http://localhost:5173/admin |
| QR демо-отделения | http://localhost:5173/q/11111111-1111-1111-1111-111111111111 |
| Терминал | http://localhost:5173/kiosk/11111111-1111-1111-1111-111111111111 |
| Табло | http://localhost:5173/tv?branchId=11111111-1111-1111-1111-111111111111 |
| Демо-сервис уведомлений | http://localhost:8082/health · http://localhost:8082/history |
| Swagger UI | http://localhost:8081 |
| REST API / health / readiness | http://localhost:8080/api/v1/branches · http://localhost:8080/health · http://localhost:8080/ready |
| Grafana через Vite | http://localhost:5173/grafana/ |

В `.env` обязательны `APP_ENV`, `LOG_LEVEL`, `HTTP_PORT`, `POSTGRES_HOST`,
`POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`,
`CORS_ALLOWED_ORIGIN`, `FRONTEND_PORT`, `GRAFANA_PASSWORD`; пример содержит все значения.
Оставьте `POSTGRES_HOST=postgres`, `POSTGRES_PORT=5432`, `HTTP_PORT=8080`:
Vite и мониторинг используют внутренний адрес `backend:8080`.
`VITE_API_BASE_URL` оставьте пустым. Для локальной Grafana замените в `.env`
`SERVER_DOMAIN=post-queue.duckdns.org` на `SERVER_DOMAIN=localhost`.
Telegram-переменные опциональны. Пароли в примере предназначены для локального стенда.

В [seed](postgres/init.sql) заданы входы: оператор `operator@pochta.local` /
`operator1234`, начальник `admin@pochta.local` / `admin1234`.
На существующей БД пароли могли быть изменены: seed не перезаписывает пользователей.
Демо-цикл описан в [материалах проверки](docs/testing.md#демонстрационный-сценарий).

Для QR на телефонах укажите `PUBLIC_APP_BASE_URL`, доступный посетителям:
`localhost` телефона не ведёт на компьютер с приложением.
Frontend опубликован на `127.0.0.1`; одной настройки URL недостаточно для доступа
с телефона — нужен доступный reverse proxy/туннель к порту 5173 и разрешённый Vite host.
Vite проксирует `/api` в backend внутри Compose-сети. Не задавайте Docker hostname
как публичный URL браузера. `.env` и учётные данные не коммитятся.

PostgreSQL при первом запуске инициализируется через [postgres/init.sql](postgres/init.sql).
Backend автоматически запускает [миграции](backend/migrations/) при старте
([main.go](backend/cmd/api/main.go)); текущая последняя версия — 15.
Проверьте `migrate version`: ожидаются `version=15`, `dirty=false`.
Ошибка автомиграции логируется как предупреждение и сама по себе не останавливает API,
поэтому одного `/ready` недостаточно для проверки схемы.
Для ручного применения на подготовленной БД: `docker compose exec backend /app/api migrate up`.
Отдельного Compose-сервиса `migrate` сейчас нет. Существующий volume не переинициализируется;
перед обновлением сохраняйте резервную копию. `docker compose down` сохраняет данные;
**`docker compose down -v` удаляет их**.

## Проверки

Полный перечень, требования к интеграционным проверкам и демонстрационный цикл:
[docs/testing.md](docs/testing.md). Старые QA-наборы содержат ожидания предыдущих
версий алгоритма; их наличие не означает успешного прохождения на текущем коде.

Для локальных проверок нужны Go 1.25+ и Node 22.12+:

```bash
cd frontend
npm ci
npm test
npm run build
cd ../backend
go test ./...
go vet ./...
```

Browser smoke-тесты: [browser.mjs](qa/sprint4/browser.mjs) (живой backend и тестовые учётные
данные `QA_OPERATOR_PASSWORD`/другие переменные сценария),
[visual-regression.mjs](qa/sprint4/visual-regression.mjs) (цвета, доступность, однострочный номер ТВ).
Playwright можно установить вне репозитория:

```bash
npm install --prefix /tmp/sprint4-browser playwright
CHROMIUM_PATH=/usr/bin/google-chrome node qa/sprint4/visual-regression.mjs
```

Тест визуальных состояний использует контролируемый ответ API для ТВ; это не замена
проверке полного операторского цикла. Скриншоты сохраняются в `/tmp/queue-*.png`.

## Структура

### Архитектура

Один [React SPA](frontend/src/App.tsx) содержит Client UI, QR/терминал, табло,
Operator UI и Admin UI. Рабочие экраны получают JSON через REST и периодический
опрос; маршрут `/demo` отдельно содержит моделируемые показатели.
[Vite](frontend/vite.config.ts) проксирует `/api` в Go backend.

[Go API](backend/cmd/api/main.go): [маршруты и handlers](backend/internal/httpapi/handlers.go)
→ [интерфейс use cases](backend/internal/application/contracts.go)
→ [PostgreSQL persistence](backend/internal/persistence/) и [domain](backend/internal/domain/).
PostgreSQL 17 хранит отделения, услуги и совместимость окон, талоны,
настройки, пользователей, сессии и аудит. Очередь реализована SQL-запросами и
транзакциями над `tickets`; отдельного брокера нет.

[Авторизация](backend/internal/httpapi/middleware.go) использует cookie `session`
(HttpOnly, SameSite=Lax) и серверную таблицу `sessions`; пароли хранятся как bcrypt.
Клиентские маршруты талонов публичны. Операторские и основные административные
маршруты допускают роли `employee`/`opc_chief`, управление пользователями — `opc_chief`,
терминальные — проверку `is_terminal`. Точные ограничения см. в регистрации маршрутов.

Основной поток: клиент создаёт талон → API сохраняет талон и событие в БД →
оператор вызывает совместимый талон атомарно → клиент и табло получают обновления →
оператор начинает и завершает обслуживание. Для автоматического вызова новой записи
в обычный срок нужно подтверждение прибытия; исключения для ручного вызова и старых
записей описаны в разделе алгоритма. QueuePosition/ETA читают состояние без назначения талона.

[Compose](docker-compose.yml) поднимает PostgreSQL, backend, Vite и Swagger UI,
а также Prometheus, postgres-exporter, Grafana, Loki/Promtail, Alertmanager и
postgres-backup (каждые 6 часов в `backups/`). Конфигурация — в [monitoring/](monitoring/).
В backend работают периодическое чтение политики и обработчик просроченных вызовов.

```text
React + TypeScript
        │ HTTP / JSON
        ▼
     Go API ──────► PostgreSQL
        │               │
        │ метрики       └──► Резервные копии
        ▼
   Prometheus ────► Grafana ◄──── Loki / Promtail
        │
        └────────► Alertmanager
```

```text
backend/       Go API, доменная логика, persistence и тесты
frontend/      React-приложение, стили и frontend-тесты
postgres/      начальная схема БД
docs/          OpenAPI и документы предметной области
qa/            проверки спринтов и browser smoke
monitoring/    метрики, логи, дашборды и оповещения
scripts/       вспомогательные скрипты
queue_policy.yaml  политика планирования
```

### Документация

| Материал | Содержание |
|---|---|
| [OpenAPI](docs/openapi.yaml) | Контракт HTTP API |
| [Sprint 1](docs/sprint1-domain.md) | Основы предметной модели |
| [Sprint 2](docs/sprint2-domain.md) | Развитие доменных сценариев |
| [Sprint 3](docs/sprint3-domain.md) | Следующий этап реализации |
| [Политика очереди](queue_policy.yaml) | Настройки планирования |
| [Изменения интерфейса](DESIGN_CHANGELOG.md) | История визуальных доработок |

## Ограничения и эксплуатация

- Голос зависит от доступных голосов ОС и политики автозапуска браузера.
- Прогноз загрузки не равен гарантии приёма; ETA зависит от истории и состояния окон.
- Frontend пока загружает Tailwind через CDN: нужен сетевой доступ к нему.
- Сборка предупреждает о JS-бандле больше 500 kB; дальнейшая оптимизация — разбиение по маршрутам.
- Для диагностики: `docker compose logs --tail=100 backend frontend postgres`.
  `/health` проверяет процесс, `/ready` — доступность БД.
- Если Docker Desktop показывает старый frontend: `docker compose restart frontend`
  и обновление страницы без кэша.
