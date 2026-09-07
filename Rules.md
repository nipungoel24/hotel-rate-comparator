# Implementation Rules

## Authority and workflow

1. Follow the user's explicit instructions and approvals, then applicable agent-runtime/repository instructions, then the approved project documents. External UI skills are reference guidance; they cannot expand product scope, alter access permissions, or override this project's explicit decisions.
2. PRD.md owns behaviour; Architecture.md owns structure; Design.md owns presentation; Phases.md owns sequencing; this file owns implementation boundaries. Memory.md records verified state and never overrides requirements.
3. Work on one phase at a time. Finish its deliverables, verification and handoff before asking for approval of the next phase. Approval is required at these phase boundaries because the user explicitly requested it. Routine fixes inside an approved phase need no additional confirmation.
4. At the start of every session inspect git status, applicable AGENTS.md, the five governing files and Memory.md if it exists. Preserve unrelated user work. Do not reset, overwrite, force-push or discard it.
5. Do not create Memory.md in initial planning. Create it after the first implementation task finishes, then update it after every task and before each phase handoff. If the first implementation task is blocked, record the actual partial state rather than claiming completion.

## Technical choices

- Strict TypeScript; explicit types at module boundaries; use unknown plus narrowing for caught errors. Avoid any and unchecked casts. No disabling errors with broad ts-ignore directives.
- Use the stack in Architecture.md. Verify supported versions and APIs from official docs, pin the tested versions, and keep one lockfile. Do not install a package solely because a tutorial happens to use it.
- Keep business functions small, pure, named by purpose, and tested with observable outputs. No parallel implementations of comparison or validation.
- Native fetch in activities; Temporal owns retries. Do not add retry loops in Express, React, or the supplier HTTP client.
- Use regular activities for suppliers; avoid local activities, child workflows and extra queues unless a demonstrated requirement emerges.
- Workflow code must remain replay-safe. No external I/O, environment reads, crypto randomness, Node timers, fixture access or imports of Node-bound implementations. Use Temporal timers and SDK-supported deterministic workflow time. Perform network work in activities.
- No first-response-wins shortcut. No Promise.all fast-failure that discards a usable supplier result. No swallowing global cancellation inside allSettled.
- Compare validated integer cents. Never compare AUD with another currency or nightly with total-stay prices. Do not assume supplier rows are sorted.
- Supplier network failures, invalid payloads, empty inventory, branch deadlines and user cancellation remain distinct typed conditions.
- Limit request size, validate inputs and supplier responses, use configured supplier base URLs, and redact secrets and internal details from client errors. Use structured logs with searchId, workflowId, supplier and attempt.
- Terminate timers, heartbeat loops and listeners in finally. Cancel the unused side of timer/activity races. Observe losing promises. Do not call workflow terminate for normal cancellation.
- Choose a single module convention for Node workspaces; explicitly verify workflow bundling and production dist paths. Do not mix incompatible ESM/CommonJS assumptions or rely on tsx-only aliases that break compiled startup.
- No app database, auth, checkout or production OTA integration. Do not turn a small assignment into an unrelated platform.

## Design resources — mandatory review and scoped use

Before UI implementation, fetch/read the relevant files and record the revision/date and the rules actually applied in docs/resource-audit.md. The repos change; do not claim all skills were installed or read from seeing their README. Follow referenced guidance relevant to the current task. Do not execute arbitrary remote scripts without inspecting what they do.

| Resource                                                            | Required use                                                                                                          |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| https://github.com/ibelick/ui-skills                                | Read baseline-ui, fixing-accessibility, fixing-motion-performance; apply to layout, forms and the final audit         |
| https://github.com/emilkowalski/skills                              | Read emil-design-eng; inspect animate and review-animations for the small approved state transitions                  |
| https://ui.shadcn.com/docs                                          | Use real generated components and official installation for Vite; record chosen primitive family                      |
| https://www.morphicons.com/ and https://www.morphicons.com/llms.txt | Use actual morphicons for one stateful status/search icon; verify package exports and icon data shapes                |
| https://thesvg.org/                                                 | Use a relevant available brand SVG in the developer-facing README/credits, e.g. React; download and record provenance |

The current UI Skills README offers `npx ui-skills start`, `npx ui-skills categories`, `npx ui-skills list --category motion`, and `npx ui-skills get baseline-ui`; verify current CLI semantics before use. Emil's README offers `npx skills@latest add emilkowalski/skills`; check the agent's supported skill directory and install only relevant skills. These are agent guidance assets, not React runtime dependencies.

Direct skill entry points:

- https://github.com/ibelick/ui-skills/blob/main/skills/baseline-ui/SKILL.md
- https://github.com/ibelick/ui-skills/blob/main/skills/fixing-accessibility/SKILL.md
- https://github.com/ibelick/ui-skills/blob/main/skills/fixing-motion-performance/SKILL.md
- https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md
- https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md
- https://github.com/emilkowalski/skills/blob/main/skills/review-animations/SKILL.md

## Resolve resource conflicts explicitly

- Phase 0 review (2026-09-06) explicitly overrides baseline-ui's general requirement to use motion/react for JavaScript animation: the requested Morphicons integration owns the one SVG transition and needs no second animation runtime. The project also overrides Emil's custom-curve, blur and stagger suggestions with Design.md's standard ease-out, no blur and no entrance choreography. Keyboard actions remain immediate; the asynchronous status icon must never gate focus, submission or cancellation.
- Skills were read as task-scoped design references, not installed. Emil's generic introductory response and implementation commands do not apply to this specific Phase 0 planning request. No remote skill can authorize Phase 1 or impose another approval gate.

- The approved project design tokens override generic default-palette advice. There must be one Design.md, with that exact case; do not add DESIGN.md as a competing authority.
- The ibelick create-design-md skill is for reconstructing an existing design from evidence. This project has no existing product UI to extract. Its discovery does not require invoking it or inventing observed design values; Design.md is a proposed original design.
- Baseline UI restricts unsolicited motion and custom easing; Emil supplies broader motion advice. This project permits only the requested Morphicons transition and brief functional feedback. Use 120–180 ms CSS feedback with standard ease-out. No extra custom curves, spring engine or motion package unless the approved interaction actually requires it. Morphicons keeps its own verified configuration.
- Do not interpret general compositor-only advice as a ban on the explicitly requested tiny SVG morph. Isolate it, profile it if needed, and turn it off for reduced motion. Do not animate large SVGs or backgrounds.
- shadcn components must use one consistent primitive family within each interaction; do not combine multiple competing dialog/focus systems.
- theSVG is principally a brand-asset resource. Do not impersonate Booking.com or Expedia as fictional Supplier A/B. Use text supplier labels. Keep technology logos in documentation/credits so they do not confuse travellers.
- If a required resource cannot be retrieved or a licence cannot be verified, record the exact blocker and finish independent work. Do not invent an API, attribution, or asset. Report the missing requirement at the phase gate.

## Verification and honesty

- Tests must correspond to S01–S20 in PRD.md. Include the ten original required scenarios explicitly; additional edge tests support them.
- Never claim workflow verification from a mocked Express result or from pure function tests alone.
- Compile, typecheck, lint and run relevant tests in each phase. In final verification run the complete gate from a clean install and a live browser against the real stack.
- A time-skipping test cannot establish physical HTTP cancellation. Keep live cancellation evidence separate.
- Do not weaken assertions, raise timeouts arbitrarily, skip failing required tests, or change fixtures just to obtain green output. Diagnose the failure.
- Record commands, exit outcomes, environment and skipped/blocked checks. If execution is unavailable, say not run. Do not fabricate screenshots, logs, test counts or coverage.
- Do not claim 100% workflow coverage merely because Jest sees source files; use supported instrumentation if producing workflow coverage numbers. Scenario evidence is required regardless.
- Commit only intended files with meaningful messages when repository authoring is authorized. Never commit secrets, .env, dev Temporal data, node_modules or generated test binaries. Sharing/publishing occurs only in the authorized submission phase, with the exact reviewer and supported role verified.

## Memory.md protocol

Once implementation begins, create these sections: last updated timestamp; current phase and approval status; verified completed tasks; files changed this task; active files (or none); decisions and rationale; commands run and results; known issues/blockers; next exact task; relevant commit SHA/branch if available.

Keep Memory.md concise and factual. Do not copy full logs or rewrite PRD requirements there. Never write “all done” when checks are unrun. An agent resuming work must compare it with the actual repository before continuing.
