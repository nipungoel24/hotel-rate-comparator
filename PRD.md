# Hotel Rate Comparator — Product Requirements

Status: proposed baseline for Phase 0 approval. This is a specification, not a claim that the app exists or tests pass.

Phase 0 reconciliation (2026-09-06): existing requirements retained; approval history spans Phases 0–5 (all implemented and verified). The supplied assignment is the source of the ten original scenarios; no separate original assignment attachment was available. Proposed decisions remain one global minimum, AUD total-stay prices for one room/two adults, integer-cent ordering with A winning ties, and empty-plus-failure returning an error. S01–S20 remain mandatory and are implemented; this document remains the product contract.

## Purpose and users

Build a small full-stack hotel search application that returns the cheapest eligible offer from two unreliable mock suppliers. The main engineering objective is demonstrating reliable Temporal orchestration, retries, bounded waiting, and cancellation.

Primary users are travellers comparing accommodation prices. Secondary users are an engineering reviewer running repeatable failure scenarios and a developer maintaining the project. This is a standalone technical assignment; do not import Azzurro branding, prices, contacts, or production integrations.

## Required scope

| ID  | Requirement                                                                         | Acceptance evidence                                          |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| F01 | React + TypeScript form: city, check-in, check-out                                  | Browser test submits valid input; invalid input is explained |
| F02 | POST /api/search-hotels starts a real Temporal workflow and waits for its result    | Live API/worker/Temporal smoke test                          |
| F03 | Call both suppliers concurrently in normal Temporal activities                      | Workflow test proves both start before either is released    |
| F04 | Find the cheapest offer across both complete hotel lists                            | Unsorted multi-hotel fixtures and deterministic tie tests    |
| F05 | Support a valid result when the other supplier fails or exceeds its deadline        | Workflow and live timeout tests                              |
| F06 | Distinguish empty, failed, timed-out, cancelled, and successful searches            | Contract tests and UI state tests                            |
| F07 | Retry transient supplier failures, at most three total attempts within the deadline | Real activity retry-attempt assertions                       |
| F08 | Cancel a running search from the UI and propagate cancellation to Temporal and HTTP | Browser/API integration plus workflow cancellation evidence  |
| F09 | Mock GET /supplierA/hotels and GET /supplierB/hotels                                | Deterministic endpoint tests covering all modes              |
| F10 | Clear scripts, README, scenario coverage, limitations, GitHub handoff               | Fresh-checkout run and submission checklist                  |

## Product decisions and assumptions

These resolve gaps in the assignment and must be approved in Phase 0.

- Return **one globally cheapest offer** across all hotels supplied for the search. Returning the cheapest offer for every hotel is an optional later feature, not the MVP contract.
- Both mock suppliers describe comparable inventory: one room, two adults, identical stay dates, AUD, total price for the entire stay, all mock mandatory taxes included. No live availability or currency conversion.
- Mock supplier rows retain the required `hotelId`, `name`, `price`. `price` is AUD major units with at most two decimals. Include response-level `currency: "AUD"` and `priceBasis: "total_stay"`. Normalize once to safe integer cents before comparing.
- API success offers expose `price` (AUD major units for consumers), `priceMinor` (integer cents), `currency`, `priceBasis`, `supplier`, `hotelId`, and `name`. Both price fields must describe the same amount; clients display the server result and never reselect a winner.
- Valid prices are finite, strictly positive, at most AUD 1,000,000, and representable with at most two decimal places. A malformed row makes that supplier response a non-retryable invalid-response failure; do not silently turn malformed data into an empty list.
- Tie order: price in cents ascending, Supplier A before B, then hotelId using deterministic code-unit lexical comparison, then name. Identical duplicate rows are equivalent. Do not use network completion order or locale-dependent collation.
- Dates are calendar dates `YYYY-MM-DD`, not timestamps. Check-out must be after check-in; check-in cannot precede today's date in the app's documented UTC business timezone. Inject the comparison date into pure validation tests. Apply the same rule in browser and server, with the server authoritative. Use calendar-day arithmetic, not browser-local midnight calculations.
- Trim city; accept 2–100 characters with Unicode letters and normal city punctuation. Fixtures filter a small documented list of cities; an unknown valid city returns empty inventory. City matching can be case-insensitive; displayed hotel names preserve fixture text.
- A supplier gets a five-second **total branch budget**, including its queue delay, retry waits, and attempts after workflow branch scheduling. This is not five seconds per attempt. Workflow startup, transport, and cancellation delivery add overhead to the browser's elapsed time.
- The MVP uses a synchronous POST and direct/local HTTP disconnect detection for cancellation. Proxy buffering, browser crashes, and API process crashes make disconnect delivery best-effort. Finite workflow and HTTP deadlines prevent unlimited work. A persistent search-ID/poll/cancel protocol can be proposed later if deployment requires stronger guarantees.

## Outcomes and HTTP contract

Request: `{ "city": "Sydney", "checkIn": "2026-10-12", "checkOut": "2026-10-15" }`. Dates are illustrative; README examples must remain valid when run.

| Condition                                               | HTTP                                      | Result                                                                        |
| ------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| At least one usable offer                               | 200                                       | `status: "success"`, `bestOffer`, `partial`, supplier outcomes, searchId      |
| Both suppliers successfully return empty lists          | 200                                       | `status: "empty"`, `message: "No hotels found"`, searchId                     |
| No offers and at least one supplier failed or timed out | 502                                       | `status: "error"`, `code: "SUPPLIERS_UNAVAILABLE"`, helpful message, searchId |
| Invalid request                                         | 400                                       | `code: "VALIDATION_ERROR"` and structured field errors; no workflow started   |
| Temporal service unavailable at submission              | 503                                       | `code: "SEARCH_SERVICE_UNAVAILABLE"`; do not disguise as supplier failure     |
| Workflow exceeds overall execution timeout              | 504                                       | `code: "SEARCH_TIMEOUT"`                                                      |
| Unexpected internal defect                              | 500                                       | `code: "INTERNAL_ERROR"`; details stay in logs                                |
| User aborts browser fetch                               | No response expected on closed connection | UI cancelled state; workflow cancellation requested                           |

`partial` is true only when some supplier failed/timed out while an offer remains. A supplier's valid empty response does not itself make the search partial. Supplier outcomes expose only safe statuses and codes, never stack traces or internal URLs. Internal statuses: `success`, `empty`, `failed`, `timed_out`. User cancellation is a search-wide terminal condition, not a supplier failure.

Empty plus failed deliberately maps to an error: the system cannot conclude there are no hotels when one source is unavailable. On partial success display “Best available rate — one supplier could not be checked.” Never claim the result is cheapest across both suppliers when comparison was incomplete.

## Required scenario matrix

Use stable test names matching these IDs. Test both supplier directions where appropriate.

| ID  | Scenario                                       | Expected result                                                              | Required evidence                                 |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------- |
| S01 | A has the lowest price                         | A wins                                                                       | Unit + workflow                                   |
| S02 | B has the lowest price                         | B wins                                                                       | Unit + workflow                                   |
| S03 | Equal price from A and B                       | A wins even if B finishes first                                              | Unit + workflow                                   |
| S04 | A fails, B succeeds                            | B wins; partial=true                                                         | Workflow                                          |
| S05 | Both fail                                      | SUPPLIERS_UNAVAILABLE; API 502                                               | Workflow + API                                    |
| S06 | One empty, other has offers                    | Available minimum wins; partial=false                                        | Unit + workflow                                   |
| S07 | Both empty                                     | No hotels found; API 200 empty                                               | Workflow + browser                                |
| S08 | One supplier responds after 5 seconds          | Branch deadline cancels pending work; other wins                             | Workflow deadline + live HTTP-abort test          |
| S09 | A fails twice then succeeds on attempt three   | A's successful offer participates, within budget                             | Real Temporal retry test; verify attempts 1, 2, 3 |
| S10 | User cancels while suppliers are active        | Temporal execution ends CANCELED; I/O stops; no new retries                  | Workflow + real API/browser cancellation          |
| S11 | One empty, other fails or times out            | SUPPLIERS_UNAVAILABLE                                                        | Unit + workflow                                   |
| S12 | Both exceed deadline                           | SUPPLIERS_UNAVAILABLE with timed_out diagnostics                             | Workflow                                          |
| S13 | Unsorted lists with several hotels             | Global minimum, not first row                                                | Unit + workflow                                   |
| S14 | Bad JSON, schema, currency, or price           | Non-retryable supplier failure                                               | Activity + workflow                               |
| S15 | Concurrent searches and repeat runs            | No shared scenario/retry state or result contamination                       | Integration                                       |
| S16 | Invalid date/city                              | Field errors; no Temporal start call                                         | Unit + API + browser                              |
| S17 | Cancel during workflow start handshake         | Returned handle is cancelled when obtained                                   | API race test                                     |
| S18 | Late result after cancellation or newer search | Cannot overwrite current UI                                                  | Browser/component                                 |
| S19 | Normal response completion closes connection   | Does not trigger spurious workflow cancellation                              | API                                               |
| S20 | Worker unavailable or restarted                | Bounded failure; retained workflow resumes when worker returns within budget | Live smoke/recovery                               |

## Explicitly excluded

Login, payment, booking checkout, maps, favourites, recommendation AI, scraping, real OTA integrations, application database, Redis, Kafka, Kubernetes, account dashboards, and multiple currency support. Temporal's own persistence is still required and is not an application database.

## Delivery

A runnable GitHub repository with README.md; separate frontend/backend/worker/supplier scripts; deterministic fixtures; unit, workflow, integration and essential browser tests; CI; .env.example; exact dependency lockfile; known limitations; verified read access for the intended reviewer associated with kaushal@tripare.com. The implementation agent must distinguish an invitation sent from access accepted. Verify repository ownership and supported roles before sharing; do not silently substitute a role with write access.
