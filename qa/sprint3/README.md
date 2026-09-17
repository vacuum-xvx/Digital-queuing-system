# Sprint 3 Black-Box Integration QA Suite

## 1. Overview & Ownership
- **Role:** Senior DevOps / Black-box QA Engineer (Nikita)
- **Scope:** `qa/sprint3/**`
- **Target:** Verification of Sprint 3 Queue Engine exclusively via public HTTP API.
- **Constraints:** 
  - Pure Black-Box HTTP testing only.
  - Zero imports of `backend/internal/**`.
  - Zero direct SQL state manipulation.
  - Zero test-only or reset endpoints.
  - Runs safely against isolated local Compose or dedicated dev environments without destroying volumes.

---

## 2. Implemented Scenarios

1. **Scenario 1 — LIVE Creation & Idempotency:**
   - Verifies 201 Created on new LIVE ticket (`source: "LIVE"`, `status: "WAITING"`, `publicNumber: "L-*"`).
   - Verifies idempotent replay (200/201 returns identical ticket ID and number).
   - Verifies exactly 1 `CREATED` audit event on idempotent replays.
   - Verifies 409 `IDEMPOTENCY_CONFLICT` on conflicting payload with identical idempotency key.

2. **Scenario 2 — LIVE Service Routing:**
   - Verifies window service capabilities. Window 2 (PAYMENTS only) returns 409 `NO_ELIGIBLE_TICKETS` for a PARCELS LIVE ticket.
   - Window 1 (PARCELS compatible) successfully calls and serves the ticket.

3. **Scenario 3 — Mixed-Source Ordering:**
   - Creates controlled candidates: QR (base 10), LIVE (base 10), and due APPOINTMENT (base 100).
   - Verifies that `CallNext` selects candidates in strict accordance with the canonical formula: `effectivePriority DESC, effectiveQueueTime ASC, id ASC`.
   - Appointment wins over QR and LIVE. Earlier QR wins over subsequent LIVE with identical base priority.

4. **Scenario 4 — Anti-Starvation:**
   - Configures fast anti-starvation policy (`threshold = 0`, `pointsPerMinute = 600`, i.e., 10 pts/sec).
   - Ages a low-base QR ticket (base 10) in real time until its boost reaches 110 points (`effectivePriority = 120`).
   - Introduces a fresh Appointment candidate (base 100).
   - Verifies that the aged ticket overtakes the higher-base candidate when formula dictates.
   - Restores default policy.

5. **Scenario 5 — Appointment Grace Period:**
   - Creates an Appointment due within the grace window (`graceMinutes = 15`).
   - Verifies that arrival within grace accrues 0 lateness penalty (`effectivePriority >= 100`).

6. **Scenario 6 — Appointment Lateness Penalty:**
   - Tests arrival past the grace window.
   - Verifies lateness penalty deduction capped at `maxPoints`.

7. **Scenario 7 — Branch-Delay Semantics:**
   - Verifies that lateness penalty freezes at the time of `/arrive`.
   - Subsequent waiting time in branch does not increase lateness penalty, but correctly accrues anti-starvation waiting boost.

8. **Scenario 8 — Legacy Appointment (No Arrival):**
   - Verifies backward compatibility for appointments without `/arrive`.
   - Due appointments remain eligible and are called according to Sprint 2 baseline semantics.

9. **Scenario 9 — NO_SHOW Transition & Idempotency:**
   - Calls ticket to `CALLED`.
   - Transitions to `NO_SHOW`.
   - Verifies window active ticket immediately returns 204 No Content.
   - Verifies repeated `NO_SHOW` is idempotent (200/204) and generates only 1 `NO_SHOW` event total.

10. **Scenario 10 — NO_SHOW vs Start Concurrency:**
    - Concurrent requests from `CALLED`: one calls `/no-show`, the other calls `/start`.
    - Verifies atomic mutual exclusion: exactly one wins (200), the other receives 409 `INVALID_TICKET_STATE`.
    - Allowed final states: `SERVING` or `NO_SHOW`.

11. **Scenario 11 — QueuePosition (All Reasons):**
    - Verifies all contractual reasons:
      - `AVAILABLE` (active queue candidate with open compatible window)
      - `NOT_ELIGIBLE_YET` (future appointment)
      - `NO_OPEN_COMPATIBLE_WINDOW` (compatible windows closed)
      - `NOT_QUEUED` (terminal or inactive tickets)

12. **Scenario 12 — Position Consistency with CallNext:**
    - Verifies that candidate with `position = 1` matches the exact ticket returned by `CallNext`.

13. **Scenario 13 — Multi-Window Reference Selection:**
    - When multiple windows are compatible (e.g. Window 1 and Window 3), verifies reference window is chosen deterministically by `number ASC`, then `id ASC` (Window 1).

14. **Scenario 14 — Event Audit Chain:**
    - Verifies exact audit event sequence:
      - Complete flow: `CREATED` -> `CALLED` -> `SERVICE_STARTED` -> `COMPLETED`.
      - No-show flow: `CREATED` -> `CALLED` -> `NO_SHOW`.
      - `CALLED` event contains `windowId`, `policyVersion`, and `decisionPriority`.

15. **Scenario 15 — Policy Compatibility & Versioning:**
    - Verifies extended GET returns all 8 Sprint 3 policy fields + version.
    - Verifies full Sprint 3 PUT increments version.
    - Verifies numeric range validation (negative values return 400).
    - Verifies optimistic lock version conflict (outdated expectedVersion returns 409 `POLICY_VERSION_CONFLICT`).
    - Restores default policy.

---

## 3. How to Run

### Via Go Test
```bash
cd qa/sprint3
go test -v -count=1 ./...
```

### Via Standalone CLI Runner
```bash
cd qa/sprint3
go run ./cmd/runner/main.go -base-url=http://localhost:8080 -repeat=3
```

Environment variables:
- `BASE_URL`: Target API URL (default: `http://localhost:8080`).

---

## 4. Integration Status & Blockers
- **Backend Core:** Merged into `main` (commit `840f2e5`). Migration 000006 applied.
- **HTTP Layer (Egor):** Endpoints `POST /api/v1/appointments/{ticketId}/arrive`, `POST /api/v1/operator/tickets/{ticketId}/no-show`, and `GET /api/v1/tickets/{ticketId}/position` are pending registration in the HTTP router. The suite gracefully reports these as blocked without failing baseline checks.
