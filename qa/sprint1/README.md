# Sprint #1 Black-Box QA Verification Suite

## Overview
This directory contains the independent black-box verification suite for Sprint #1 of the next-generation digital queue system (`tsifrovaya-ochered-novogo-pokoleniya`).

The suite verifies the end-to-end functionality of the system exclusively over HTTP against the frozen Sprint #1 public API contracts without importing any internal domain, application, or persistence packages.

## Frozen Contract Compliance
- **Black-Box HTTP Only**: Interacts solely via HTTP endpoints under `/health`, `/ready`, and `/api/v1/*`.
- **Exact DTOs**:
  - `GET /api/v1/branches` validates exact fields `items`, `id`, `name`.
  - `GET /api/v1/branches/{branchId}/services` validates exact fields `items`, `id`, `code`, `name`.
  - `TicketDTO` and `ErrorResponse` validate standard camelCase and RFC3339 UTC fields.
- **Frozen Demo Identifiers**:
  - Branch: `11111111-1111-1111-1111-111111111111`
  - PARCELS Service: `22222222-2222-2222-2222-222222222222`
  - PAYMENTS Service: `55555555-5555-5555-5555-555555555555`
  - Window 1 (PARCELS): `33333333-3333-3333-3333-333333333333`
  - Window 2 (PAYMENTS): `44444444-4444-4444-4444-444444444444`
  - Window 3 (PARCELS): `66666666-6666-6666-6666-666666666666`

## Verification Scenarios
1. **Foundation Regression**:
   - Validates `GET /health` returns `200 OK` (`{"status":"ok"}`).
   - Validates `GET /ready` returns `200 OK` (`{"status":"ready","database":"ok"}`).
   - Executed both before and after test suites.
2. **Scenario A — Happy Path**:
   - Verifies demo branch and PARCELS / PAYMENTS service catalog.
   - Issues QR ticket for PARCELS (`201 Created`, state `WAITING`).
   - Window 1 calls ticket (`200 OK`, state `CALLED`, Window 1 assigned).
   - Starts service (`200 OK`, state `SERVING`).
   - Completes service (`200 OK`, state `COMPLETED`).
   - Verifies ticket state persistence and window release (`204 No Content`).
3. **Scenario B — Idempotency**:
   - Creates ticket with key `K` (`201 Created`, state `WAITING`).
   - Replays request with key `K` (`200 OK`, identical ticket ID and public number).
   - Requests different service with key `K` (`409 Conflict`, error code `IDEMPOTENCY_CONFLICT`).
   - Cleans up ticket via public API to `COMPLETED`.
4. **Scenario C — Service Routing**:
   - Creates PARCELS ticket (`201 Created`, state `WAITING`).
   - Window 2 (PAYMENTS only) calls next (`409 Conflict`, error code `NO_ELIGIBLE_TICKETS`).
   - Verifies ticket remains `WAITING` with no window assigned.
   - Window 1 (PARCELS supported) calls next (`200 OK`, state `CALLED`).
   - Starts and completes service to `COMPLETED`.
5. **Scenario D — Concurrent Claim**:
   - Verifies Window 1 and Window 3 both support PARCELS and are initially idle (`204`).
   - Creates exactly one PARCELS ticket (`WAITING`).
   - Concurrently dispatches `call-next` from Window 1 and Window 3 using goroutines synchronized by a release barrier.
   - Asserts atomic claim: exactly one window receives `200 OK` with the ticket, while the other window receives `409 Conflict` (`NO_ELIGIBLE_TICKETS`).
   - Winning window serves and completes the ticket.
   - Verifies both windows are idle (`204`).

## Repeatability & Non-Destructive Cleanup
- **No Database Reset**: Automatic QA code **NEVER** runs `docker compose down -v`.
- **Public-API Cleanup**:
  - `settleCurrent(windowID)`: Inspects `/operator/windows/{windowId}/current-ticket`. If `CALLED`, starts and completes; if `SERVING`, completes.
  - `drainWindow(windowID)`: Settles active ticket, then repeatedly calls `call-next` and completes tickets until `NO_ELIGIBLE_TICKETS` is received.
  - `preflightCleanEnvironment()`: Cleans all windows and queues in deterministic order before each scenario.
  - Deferred post-scenario cleanup guarantees active tickets created by tests are completed even upon assertion failures.
- **Multiple Runs**: The suite can be run repeatedly against persistent storage. Historical completed tickets remain in the database; ticket counters continue incrementally.

> [!CAUTION]
> **Manual Recovery Only**: `docker compose down -v` permanently destroys PostgreSQL data volumes. It must NEVER be called by automated QA scripts or continuous integration routines.

## How to Run

### Option 1: Standard Go Test
```bash
cd qa/sprint1
go test -v -count=1 ./...
```
Or with custom `BASE_URL`:
```bash
BASE_URL=http://localhost:8080 go test -v -count=1 ./...
```

### Option 2: Standalone CLI Runner
```bash
cd qa/sprint1
go run ./cmd/runner -base-url=http://localhost:8080 -repeat=3
```
Options:
- `-base-url string`: URL of the backend service (default: `http://localhost:8080` or `$BASE_URL`).
- `-repeat int`: Number of complete sequential suite repetitions without database reset (default: `3`).
