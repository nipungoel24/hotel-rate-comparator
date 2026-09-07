# Phased Implementation Plan

Phase 0 discovery and document reconciliation completed on 2026-09-06; approved. Phase 1 completed and verified 2026-09-06 (workspaces, pinned native Temporal CLI 1.8.3, worker/API/suppliers/Vite processes, health endpoints, real workflow smoke; see Memory.md). Phase 2 completed and verified 2026-09-06 (contracts, pure domain comparison, deterministic mock suppliers, unit + supplier suites; see Memory.md). Phase 3 completed and verified 2026-09-07 (real search workflow, concurrent supplier activities, Temporal retries, five-second durable branch deadlines, cancellation, heartbeats, HTTP abort; see Memory.md). Phase 4 completed and verified 2026-09-07 (POST /api/search-hotels through the reusable Temporal client, typed HTTP outcome mapping per the PRD contract, unique workflow IDs, request-disconnect detection with the race-safe WorkflowHandle.cancel() bridge, focused + real integration tests, compiled HTTP smoke; see Memory.md). Phase 5 completed and verified 2026-09-07 (React/Vite search experience: accessible form, client validation, real API integration, loading/cancellation with the Morphicons search-to-cancel morph, stale-response protection, typed state handling, responsive Design.md tokens, shadcn/ui primitives, theSVG footer asset, 39 jsdom component tests and 12 Playwright browser tests including the full real-stack search and the browser-to-Temporal cancellation chain; see Memory.md and docs/resource-audit.md). Phase 6 completed and verified 2026-09-07 (clean-room copy verification from the commit-eligible file set, cross-platform SHA256-verified Temporal CLI installer, CI workflow for GitHub Actions with real Temporal and Playwright, e2e TypeScript integrated into the authoritative typecheck, complete README with scenario coverage and setup instructions, secret/path/hygiene/asset/bundle audits, final gates green: npm run check exit 0 with 15 suites/259 tests plus Playwright 12/12; see Memory.md); awaiting approval. Phase 7 is NOT STARTED. Build only the current approved phase. Stop at each review gate because the user requested phase-by-phase approval. Finish the phase's concrete deliverables before asking.

## Phase 2 status (2026-09-06)

Implemented and verified: request/hotel/money schemas with Zod at trust boundaries, integer-cent normalization, total-order comparison with A-wins ties, typed supplier-result union, aggregate outcome mapping (no_hotels vs suppliers_unavailable), both mock endpoints with deterministic allowlisted scenarios (normal/empty/server-error/delay/very-slow/hang/fail-twice/invalid-payload) and per-request attempt headers, disconnect-safe timers, per-city fixtures (Sydney A-cheaper, Melbourne B-cheaper, Brisbane equal, Perth global-min-in-B, unknown city empty). Evidence: 134 tests green (86 unit + 48 supplier), typecheck/lint/format/build pass, live smoke on native Windows Temporal passes, compiled suppliers server verified over real HTTP. Phase 2 gate met: S01–S03, S06, S11, S13 and validation logic have unit coverage; every mock mode directly demonstrable; no global random state.

## Phase 0 evidence and handoff

- Existing directory contains ten planning Markdown files, including all five governing documents. No application source, package manifest, lockfile, Memory.md or AGENTS.md was found. Ancestor AGENTS.md checks found none. `git status --short` and `git rev-parse --show-toplevel` failed because this directory is not a Git repository; there is no branch, remote or history to report. Do not invent an existing approval from the bootstrap files. Other planning files remain preserved as reference material; the five governing documents own the reconciled decisions.
- Read the attached master prompt and existing PRD, Architecture, Rules, Phases, Design, Plan and Sources. Retained the product contract and S01–S20. Changed only the five governing documents to record discovery, candidate versions, module/primitive choices, actual cancellation-promise semantics and scoped design conflicts. No source scaffold or Memory.md was created.
- Commands actually run: file inventory and Get-Content reads succeeded; Node/npm version checks returned 22.20.0/10.9.3; platform check returned win32 x64; command lookup found no Temporal CLI. Docker info failed with config access denied and missing daemon pipe. WSL list failed with E_ACCESSDENIED. No server, application build, test suite or browser flow was run.
- Initial sandbox HTTP reads and npm registry reads failed with socket/EACCES errors. Public read-only requests succeeded after tool-managed escalation; this was not an approval rejection. Registry checks returned Temporal worker 1.23.0, Vite 8.2.2 and Morphicons 1.7.1, including Node engines and Morphicons exports. Git ls-remote succeeded for both skill repositories. CLI release metadata returned v1.8.3. No dependencies were installed.
- Read Temporal cancellation scopes, activity Context, timeout/retry guidance, testing guidance, test-environment API and CLI flags. Checked the released v1.23.0 README and cancellation-scope source. Architecture.md records the prose/source discrepancy and follows the released source. Actual compilation, native SDK loading and CLI startup remain Phase 1 checks.
- Read complete relevant ibelick skill files: baseline-ui, fixing-accessibility, fixing-motion-performance. Repository HEAD observed: `83b757b8bba91b7268b8e8d370f9a8052a7943c5`. Read Emil emil-design-eng, animate and review-animations; inspected the referenced STANDARDS.md sections for easing, duration and reduced-motion decisions. Repository HEAD observed: `d23d7f88a2e21c9e4b1418c7abe420f5c1052ba7`. Retrieval used main; these HEAD observations are provenance observations, not immutable file-download proofs. Re-fetch pinned sources for docs/resource-audit.md when implementation begins. No skills were installed.
- Applied guidance: accessible native forms, associated errors, stable loading layout, one primitive family, tabular prices, limited meaningful motion, reduced motion and interruptibility. Rules.md resolves project-token, animation-runtime, easing and SVG exceptions. Morphicons documentation and registry exports were inspected; shadcn Vite setup was read. theSVG legal page yielded no readable policy text; individual asset permission is still unresolved and must be verified before Phase 5 delivery.
- Next exact task after approval: Phase 1 workspace/configuration setup, then create Memory.md after that first implementation task and transfer this evidence into docs/resource-audit.md. Provision the pinned native CLI and prove a minimal Temporal workflow before declaring Phase 1 complete. Git initialization may be done in setup; publishing and reviewer identity/access checks remain Phase 7 only.

Phase 0 has no unresolved product contradiction. Remaining execution risks are native CLI/worker/test-server availability, fresh dependency installation and later theSVG asset terms. These are explicitly unverified, not passed checks. Phase 1 must stop at its gate if infrastructure cannot be made runnable.

## Phase 0 — Contract and repository discovery

1. Inspect the target directory, git state, AGENTS.md and existing files without overwriting work.
2. Read this blueprint and the original assignment. Review official Temporal docs and the relevant linked design resources; record access failures honestly.
3. Accept or propose precise edits to PRD.md, Architecture.md, Rules.md, Phases.md and Design.md. Preserve exact filenames. Resolve the global-minimum interpretation, AUD total-stay basis, failure/empty distinction, five-second total branch budget and synchronous cancellation assumption.
4. Inventory Node/npm/Temporal/test-server support and select compatible versions, but do not scaffold application code yet.
5. Provide the planned file structure, dependency decisions, scenario matrix and a brief explanation of the cancellation algorithm.

Gate: five coherent documents, no unresolved contradictions, scope/stack decisions ready for review. Ask “Approve Phase 0 so I can begin Phase 1?” Do not create Memory.md yet.

## Phase 1 — Workspace and runnable infrastructure

1. Create npm workspaces for web, API, worker, suppliers, contracts and domain. Add strict TypeScript, lint and format configuration and the exact lockfile.
2. Add a short root AGENTS.md pointing to the project documents and phase gate protocol.
3. Add .env.example and portable scripts; validate required environment values on process startup. Ignore secrets, build output, Temporal local database, dependencies and test artefacts.
4. Start a Temporal dev server with persistent local data; create a minimal registered worker and reusable API client. Verify the client and worker talk to the same namespace/task queue.
5. Add health endpoints for API and suppliers. Document that API process liveness alone does not prove a worker is polling. Show separate worker/Temporal readiness checks.
6. Create Memory.md after the first implementation task and keep it current.

Gate: clean install, typecheck and basic build succeed; named processes start; a minimal Temporal execution is visible; ports and shutdown work. Show exact commands and any untested OS paths. Request Phase 2 approval.

## Phase 2 — Contracts, domain and deterministic mock suppliers

1. Implement request/response schemas and currency/date conventions.
2. Implement price normalization, total deterministic order, global cheapest selection and aggregate outcome mapping as pure functions.
3. Build both mock endpoints and deterministic city inventories. Add allowlisted local scenario controls and trusted activity-attempt-based fail-twice mode.
4. Stop mock delayed/hanging handlers on disconnect; isolate simultaneous searches.
5. Write domain, validation and supplier endpoint tests while implementing.

Gate: S01–S03, S06, S11, S13 and validation logic have meaningful unit coverage; every mock mode is directly demonstrable; no global random state. Request Phase 3 approval.

## Phase 3 — Temporal workflow and supplier activities

1. Implement both concurrent branches and the deterministic aggregator.
2. Implement real HTTP activities, schema validation and failure classification.
3. Add bounded Temporal retries, five-second durable branch deadlines, cancellable activity scopes, local HTTP deadline abort, heartbeats and cleanup.
4. Propagate global cancellation; keep deadline cancellation local to its supplier branch.
5. Add real Temporal workflow tests for all original S01–S10 cases, plus S11–S15 where applicable.
6. Run real-clock HTTP cancellation tests and inspect workflow history for retry/cancellation evidence. Prove parallel starts with barriers.

Gate: all ten required workflow scenarios pass; live slow supplier work is aborted; retry test observes attempt three; global cancellation yields CANCELED. If native test-server tooling is blocked, report the blocker and use an available supported local Temporal path; do not mark tests as passed. Request Phase 4 approval.

## Phase 4 — HTTP API and request cancellation

1. Implement POST /api/search-hotels with authoritative validation, Temporal start/result handling and typed response mapping.
2. Reuse connections, generate correlation IDs and add safe structured errors/logs.
3. Wire response disconnect to workflow cancellation, including disconnect-before-start-resolution and completion races.
4. Bound infrastructure errors and handle worker absence; do not write after socket closure.
5. Add Supertest/API tests and live API-to-Temporal integration tests; exercise S05, S16–S20 and uncertain/failed start handling.

Gate: valid searches use real workflow results; invalid ones start no workflow; all HTTP statuses match PRD; aborting a real request cancels its workflow without misclassifying normal completion. Request Phase 5 approval.

## Phase 5 — Frontend and design integration

1. Review and record the relevant ibelick/Emil skills and actual Morphicons/shadcn APIs.
2. Apply Design.md tokens and generate only required shadcn components.
3. Build the responsive form and all explicit request states. Connect to the real API through the local proxy.
4. Add AbortController and stale-response protection; preserve values and clear obsolete results appropriately.
5. Add the actual Morphicons state transition and a licensed theSVG asset in README/credits with provenance.
6. Test labels, validation, success, partial, empty, failures, cancellation, duplicate clicks and late results. Check reduced motion and keyboard flow.

Gate: browser can run the complete real-stack flow; mobile and desktop screenshots demonstrate the approved design; icons are actual integrations; user cancellation propagates through Vite. Request Phase 6 approval.

## Phase 6 — Full verification and reviewer documentation

1. Run fresh install, formatting check, lint, typecheck, production build and all required suites.
2. Demonstrate healthy, empty, both-failed, timeout, fail-twice and cancellation scenarios from documented commands.
3. Add CI with a working Temporal test-server provision step, deterministic execution and browser dependencies. Make blocked infrastructure fail visibly rather than silently skipping required tests.
4. Complete README: prerequisites, versions, commands, environment variables, start order, architecture explanation, requests/responses, scenario-to-test mapping, debugging in Temporal UI, limitations and shutdown.
5. Verify built API/worker entrypoints run independently of development transpilers. Check that web assets contain no server dependencies/secrets.
6. Review git diff, ignored files and asset licences. Record exactly what was tested and on which OS.

Gate: a reviewer can reproduce the app from a fresh checkout; test claims have evidence; no required scenario is unaccounted for. Request Phase 7 approval with the concrete repository state and sharing proposal.

## Phase 7 — GitHub submission

1. Confirm the intended repository/account and keep existing history intact. Commit the reviewed source and push normally if authorized.
2. Verify the GitHub identity associated with kaushal@tripare.com. Do not guess a username from the email.
3. Grant the least privilege that satisfies the requested read access and is supported by the repository ownership type. If the ownership model cannot offer read-only collaborators, explain the precise issue and obtain a choice before granting broader permissions or changing visibility.
4. Verify remote commit, CI result and reviewer access state. Report invitation pending separately from accepted access.
5. Update Memory.md and provide repository URL, verified run commands, scenario evidence and limitations.

Gate: repository accessible as intended, remote source verified, honest handoff. Do not claim access was granted if only instructions were prepared.

## Script contract

These names are required target scripts; they do not exist in this planning package. Implement and verify them in the actual repository.

| Command                  | Responsibility                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| npm ci                   | Reproducible dependency install after lockfile exists                                     |
| npm run dev:temporal     | Start documented persistent local Temporal dev server                                     |
| npm run dev:suppliers    | Run mock supplier service                                                                 |
| npm run dev:worker       | Run Temporal worker                                                                       |
| npm run dev:api          | Run Express API                                                                           |
| npm run dev:web          | Run React frontend                                                                        |
| npm run dev              | Run the four app processes with cross-platform orchestration; Temporal started separately |
| npm run lint             | Lint owned source                                                                         |
| npm run format:check     | Check formatting                                                                          |
| npm run typecheck        | Strict checks for all workspaces                                                          |
| npm run build            | Build shared packages and all application workspaces in dependency order                  |
| npm run test:unit        | Domain, validation and isolated UI/API unit tests                                         |
| npm run test:suppliers   | Deterministic mock supplier endpoint tests (added Phase 2)                                |
| npm run test:activity    | HTTP activity context, parsing, errors and abort tests                                    |
| npm run test:workflow    | Actual Temporal test-server/worker scenario suite                                         |
| npm run test:integration | Real HTTP + Temporal timing and cancellation suite                                        |
| npm run test:e2e         | Playwright against actual running stack                                                   |
| npm run check            | Documented complete quality gate with explicit infrastructure prerequisites               |

## Phase handoff format

State: phase completed or blocked; implemented behaviour; changed files; commands and results; remaining limitations; Memory.md update status; next phase and approval question. Do not begin the next phase in the same turn unless the user has explicitly approved it.
