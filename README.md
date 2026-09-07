# Hotel Rate Comparator

Searches two hotel suppliers concurrently and uses Temporal to reliably return the cheapest valid rate despite supplier delays, failures, retries and user cancellation.

This is a technical assignment/demo: the two suppliers are deterministic local mock services returning synthetic AUD total-stay inventory for one room/two adults. There is no booking, no live inventory and no production integration.

## Why Temporal

- **Workflow vs Activity** — `searchHotels` is a Temporal Workflow: pure, replay-safe orchestration code that starts two supplier branches, waits on both and aggregates the result. Every HTTP call lives in `fetchSupplier` Activities so network work can retry, timeout, heartbeat and cancel safely.
- **Retries owned by Temporal** — transient supplier failures (5xx/429/408/transport) retry at most 3 total attempts (250 ms initial backoff, ×2, capped at 1 s). A real attempt counter (`Context.current().info.attempt`) drives the fail-twice fixture; there is no manual retry loop anywhere.
- **Durable deadlines** — each supplier branch gets a five-second _total_ budget (including queueing, retry waits and all attempts), enforced by a durable Temporal timer plus a local HTTP abort sharing the same deadline epoch. A retry never gets a fresh five seconds.
- **Cancellation with real I/O abort** — cancelling the Workflow (Temporal `CANCELLED`) cancels both Activities (`TRY_CANCEL`), which abort their in-flight `fetch` requests including response-body reads, then clean up heartbeats and timers. The browser's Cancel button aborts the HTTP request, the Express API detects the disconnect and calls `handle.cancel()` — the whole chain is proven by tests.

## Architecture

```text
React (Vite)                 Express API
  | POST /api/search-hotels     | validate → unique workflowId
  v                             v
  |-------------------- Shared Temporal Client
                                | workflow.start → await result (or cancel on disconnect)
                                v
                         searchHotels Workflow
                          +-------------------------+
                          |                         |
                  Supplier A branch         Supplier B branch
                  (5 s durable deadline)    (5 s durable deadline)
                          |                         |
                  fetchSupplier Activity   fetchSupplier Activity
                  (retry ≤3, heartbeat)    (retry ≤3, heartbeat)
                          |                         |
                  Supplier A HTTP           Supplier B HTTP
                          +------------+------------+
                                       v
                          aggregateSearch() (pure domain, integer cents)
                                       v
                                SearchOutcome
                                       v
                          typed HTTP response (200/400/502/503/504/500)
```

The browser never talks to Temporal or the suppliers; the API never calls supplier HTTP directly; comparison happens only in the pure domain package.

## Tech stack

- Node.js 22.20.0 + npm 10.9.3, TypeScript 5.9.3 (strict), npm workspaces
- Temporal TypeScript SDK 1.23.0 (all packages pinned), Temporal CLI 1.8.3 (project-local, SHA256-verified)
- React 19.2.8 + Vite 8.2.2, Tailwind CSS 4, shadcn/ui (Radix primitives), Morphicons
- Express 5.2.1, Zod 4.5.4 (contracts), Jest 30 + ts-jest, Supertest, Playwright 1.63 (Chromium)

## Repository structure

| Path                  | Responsibility                                                             |
| --------------------- | -------------------------------------------------------------------------- |
| `packages/contracts/` | Zod request/response schemas, API contracts, config                        |
| `packages/domain/`    | Pure money normalization, comparison, aggregation                          |
| `apps/suppliers/`     | Mock Supplier A/B HTTP service with deterministic scenarios                |
| `apps/worker/`        | Temporal worker: `searchHotels` workflow + `fetchSupplier` activity        |
| `apps/api/`           | Express API: `POST /api/search-hotels`, disconnect → workflow cancellation |
| `apps/web/`           | React frontend: form, loading/cancellation, results                        |
| `scripts/`            | Cross-platform setup/check/smoke/dev orchestration                         |
| `tests/`              | unit, suppliers, activity, workflow, integration, api, web, e2e suites     |
| `docs/`               | Resource audit, third-party asset provenance                               |

## Prerequisites

Verified versions (see `.node-version`): **Node.js 22.20.0**, **npm 10.9.3**. Playwright downloads its own Chromium on first use. Everything else (including the Temporal CLI) is installed project-locally by the commands below. No Docker or WSL is required; development and testing happen natively.

## Installation

```powershell
npm ci                    # reproducible install from package-lock.json
npm run setup:temporal    # downloads the pinned Temporal CLI 1.8.3, verifies SHA256
npm run build             # compiles all workspaces + production web build
```

`setup:temporal` installs the official release archive under `.tools/temporal/1.8.3/` (ignored by Git) after verifying its SHA256 against the release `checksums.txt`. It works on Windows, Linux and macOS.

## Environment variables

All values are optional development defaults (see `.env.example`):

| Variable                                      | Default                      | Meaning                                                                |
| --------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `HOST`                                        | `127.0.0.1`                  | Bind address for local processes                                       |
| `API_PORT`                                    | `3001`                       | Express API port                                                       |
| `SUPPLIERS_PORT`                              | `4001`                       | Mock suppliers port                                                    |
| `WEB_PORT`                                    | `5173`                       | Vite dev server port                                                   |
| `TEMPORAL_ADDRESS`                            | `127.0.0.1:7233`             | Temporal frontend                                                      |
| `TEMPORAL_NAMESPACE`                          | `default`                    | Temporal namespace                                                     |
| `TEMPORAL_TASK_QUEUE`                         | `hotel-rate-comparator`      | Task queue shared by API and worker                                    |
| `TEMPORAL_UI_PORT`                            | `8233`                       | Temporal Web UI                                                        |
| `SUPPLIER_A_BASE_URL` / `SUPPLIER_B_BASE_URL` | `http://HOST:SUPPLIERS_PORT` | Optional supplier origins (HTTP(S) origins only, no credentials/paths) |
| `SUPPLIER_SCENARIO_CONTROLS`                  | enabled                      | Set `disabled` to ignore the test-only scenario headers                |

## Running locally

Start Temporal in one terminal and leave it running:

```powershell
npm run dev:temporal
```

In another terminal, start the application (after `npm run build`):

```powershell
npm run dev        # suppliers + worker + API + web together
```

Or individually: `npm run dev:suppliers`, `npm run dev:worker`, `npm run dev:api`, `npm run dev:web`.

| URL                   | Service                                                   |
| --------------------- | --------------------------------------------------------- |
| http://127.0.0.1:5173 | Frontend                                                  |
| http://127.0.0.1:3001 | API (`/health`, `/ready`, `/api/search-hotels`)           |
| http://127.0.0.1:4001 | Mock suppliers (`/supplierA/hotels`, `/supplierB/hotels`) |
| http://127.0.0.1:8233 | Temporal Web UI                                           |
| 127.0.0.1:7233        | Temporal frontend (gRPC)                                  |

Shutdown: Ctrl+C stops the `dev` processes; Ctrl+C in the Temporal terminal stops the server (its database persists under ignored `.temporal/`).

## Using the app

Open the frontend, enter **Sydney**, **2030-10-12** → **2030-10-15** and press **Search rates**. The cheapest valid offer appears (fixture: Circular Quay Hotel, Supplier A, $120.00). While a search runs, the same button morphs into **Cancel search**; cancelling stops the request, cancels the Temporal Workflow and keeps your entries. Known cities in the fixtures: Sydney (A cheaper), Melbourne (B cheaper), Brisbane (tie → A), Perth (unsorted global minimum in B); any other valid city returns "No hotels found".

## API contract

`POST /api/search-hotels` — body `{ "city": "Sydney", "checkIn": "2030-10-12", "checkOut": "2030-10-15" }`.

| Condition                                  | Status | Body                                                                                                                                                        |
| ------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| At least one usable offer                  | 200    | `{ status: "success", searchId, bestOffer: { hotelId, name, supplier, price, priceMinor, currency: "AUD", priceBasis: "total_stay" }, partial, suppliers }` |
| Both suppliers returned empty              | 200    | `{ status: "empty", message: "No hotels found", searchId }`                                                                                                 |
| No offers and ≥1 supplier failed/timed out | 502    | `{ status: "error", code: "SUPPLIERS_UNAVAILABLE", message, searchId }`                                                                                     |
| Invalid request                            | 400    | `{ status: "error", code: "VALIDATION_ERROR", message, searchId, fields: [{ field, message }] }` — no Workflow starts                                       |
| Temporal unavailable at submission         | 503    | `{ status: "error", code: "SEARCH_SERVICE_UNAVAILABLE", ... }`                                                                                              |
| Execution exceeds its time limit           | 504    | `{ status: "error", code: "SEARCH_TIMEOUT", ... }`                                                                                                          |
| Unexpected internal defect                 | 500    | `{ status: "error", code: "INTERNAL_ERROR", message: "Internal server error", searchId }`                                                                   |

`partial: true` means an offer exists but at least one supplier failed or timed out. Supplier outcomes expose only safe statuses (`success`/`empty`/`failed`/`timed_out`) and codes; no stack traces or internal URLs ever reach clients.

## Reliability behavior

- **Concurrent suppliers** — both branches start before either is awaited; results are collected with `Promise.allSettled`, never first-response-wins.
- **Maximum 3 attempts** — retryable failures only; malformed payloads, invalid currency/price and exhausted deadlines are non-retryable. Empty inventory is success, never retried.
- **Five-second TOTAL branch budget** — one deadline epoch per branch, shared across all retry attempts; the slow branch is cancelled while the other supplier's result remains usable.
- **Partial success** — "Best available rate — one supplier could not be checked." A valid offer is never thrown away because the other supplier failed.
- **Empty ≠ failed** — both-empty is a valid `no_hotels` outcome; empty + failure is `suppliers_unavailable`, because inventory could not be completely checked.
- **Cancellation** — user cancel → browser `AbortController` → Express detects the disconnect → `WorkflowHandle.cancel()` → Workflow reaches Temporal `CANCELLED` → Activity `fetch` aborts (including response bodies) → supplier sockets close. Normal response completion never triggers cancellation.
- **Integer cents** — prices normalize to integer minor units once; all comparison is integer-based, deterministic, with Supplier A winning cross-supplier ties regardless of arrival order.

## Mock supplier scenarios

Both mock endpoints validate city/dates and return `{ hotels, currency: "AUD", priceBasis: "total_stay" }`. For deterministic testing, a development/test-only header `x-hotel-scenario` selects `normal`, `empty`, `server-error`, `delay` (2.5 s), `very-slow` (8 s), `hang`, `fail-twice` (500, 500, then success) or `invalid-payload`; `x-supplier-attempt` drives fail-twice and is always overwritten by the Activity with the real Temporal attempt number. These headers are test tooling only — the public API and frontend cannot submit them, and `SUPPLIER_SCENARIO_CONTROLS=disabled` ignores them entirely.

## Testing

```powershell
npm run check            # format:check + lint + build + typecheck + all Jest suites + compiled smoke (needs dev:temporal running)
npm run test:e2e         # Playwright Chromium against the full real stack (starts its own Temporal + processes)
```

That pair is the complete reviewer gate. Focused suites: `test:unit`, `test:suppliers`, `test:activity`, `test:workflow`, `test:integration`, `test:api`, `test:web`. Workflow/integration tests use the real pinned Temporal CLI (no mocks, no time-skipping for the HTTP timing cases); a missing server is a failure, never a skip. `test:e2e` needs ports 3001–3003, 4001–4003, 5173–5175 and 7233 free.

## Scenario coverage

| Assignment scenario                       | Evidence                                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| A cheaper                                 | `tests/unit/domain/compare.test.ts`, `tests/workflow/search-hotels.test.ts` (W01 S01), `tests/e2e` F20                           |
| B cheaper                                 | same suites (W02 S02), e2e Melbourne                                                                                             |
| Equal → A wins                            | `compare.test.ts` ties, W03 (B finishes first, A still wins)                                                                     |
| A fails / B succeeds                      | W04 S04, `tests/integration/api.test.ts` A04, e2e partial stack                                                                  |
| Both fail                                 | W06 S05, API A05 (502 `SUPPLIERS_UNAVAILABLE`)                                                                                   |
| One empty                                 | W07/W08 S06, unit aggregation                                                                                                    |
| Both empty                                | W09 S07, API A06, e2e empty state                                                                                                |
| Supplier > 5 s                            | W10 S08 (real HTTP abort both directions), `tests/integration/cancellation.test.ts`                                              |
| Fail twice, succeed on attempt 3          | W11 S09 (real Temporal attempts [1,2,3] in history + replay), `tests/activity/fetch-supplier.test.ts`                            |
| User cancellation                         | W12 S10, `tests/integration/cancellation.test.ts`, API C01–C05, `tests/e2e` browser-cancel chain (Temporal `CANCELLED` verified) |
| Timeout + empty / both timeout            | W13 S11, W14 S12                                                                                                                 |
| Malformed supplier payload                | `tests/activity/fetch-supplier.test.ts` S14, W15                                                                                 |
| Concurrent/repeated searches              | S15 integration, `tests/api` isolation tests, e2e                                                                                |
| Invalid dates/city never start a Workflow | V01–V07 in `tests/api/search-hotels.test.ts`, web validation tests                                                               |

## CI

`.github/workflows/ci.yml` runs on `ubuntu-latest` with the pinned Node version: `npm ci` → pinned Temporal CLI install (SHA256-verified official release) → format/lint/typecheck (including the e2e TypeScript) → build → all Jest suites (real Temporal test servers) → compiled smoke against a real Temporal server → Playwright Chromium full-stack suite. Required checks never use `continue-on-error`; on Playwright failure the report/test results are uploaded as artifacts. CI needs no secrets.

## UI resources

shadcn/ui components (Radix primitives) for the form/result primitives; Morphicons for the Search → Cancel icon morph; theSVG React logo vendored in the footer. Which ibelick/ui-skills and emilkowalski/skills were read and how they shaped the UI: `docs/resource-audit.md`. SVG provenance and safety review: `docs/third-party-assets.md`.

## Known limitations / assumptions

- Mock suppliers only — synthetic deterministic inventories, no live rates or availability.
- Temporal runs as a local dev server (`start-dev`, persistent local database); no production deployment, no server hardening.
- The five-second budget is a logical cutoff; process suspension, clock skew or infrastructure outages add physical elapsed time. Assumes synchronized clocks on one host.
- Direct development path promises disconnect cancellation; proxy buffering and browser/API crashes make it best-effort (finite Workflow/HTTP deadlines bound the work regardless).
- Playwright runs headless Chromium only; human pixel-level visual review of the captured QA screenshots (`artifacts/qa/`) is welcome, while automated design-token/geometry/contrast assertions cover the measurable checks.
- CI workflow is prepared but has not executed on GitHub yet — that happens with the Phase 7 push.

## Submission / reviewer notes

This is a technical assignment demonstrating Temporal orchestration, not a production travel product. There is no booking, payment or live inventory. Prices are demo data from local mock suppliers. Reviewer access to the repository is arranged as a separate final step.
