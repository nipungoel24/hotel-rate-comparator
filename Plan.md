# Hotel Rate Comparator — Step-by-Step Build Strategy

This package is the planning and agent-instruction deliverable. It contains no implemented application, executed application tests, or GitHub submission.

## 1. Understand what is being evaluated

The visible product is a three-field hotel search page. The engineering challenge is that the answer depends on two unreliable systems. A correct solution still returns a usable rate when one supplier fails, waits long enough for recoverable failures, stops waiting after its budget, and honours cancellation.

Temporal has three different roles here: a client in Express submits the workflow; the Temporal service retains execution history and schedules work; a worker executes deterministic orchestration and the HTTP activities. Installing the SDK without actually routing the search through the service and worker would not satisfy the assignment.

The design uses React + Vite because the application is a single interactive page with a separate required Node backend. Next.js is allowed, but this project does not need server rendering or a second API routing system. This is a project-specific simplicity decision.

## 2. Freeze the contract before scaffolding

Approve these proposed interpretations: one globally cheapest offer; AUD totals for the whole stay; integer-cent comparison; Supplier A wins equal prices; five seconds total per supplier branch; three attempts maximum; empty-plus-failed is an error; cancellation is propagated from the active HTTP connection in the local MVP.

The phrase “cheapest result” otherwise leaves room for an agent to build a per-hotel table, select the first row, compare incompatible prices, or return the first completed response. PRD.md removes that ambiguity.

## 3. Create the smallest repeatable workspace

Use four app processes and two small shared packages. Pin dependencies, document environment variables and ports, then prove API, worker and Temporal connectivity before adding UI. Use the Temporal dev server's persistent local data file, excluded from git. Add scripts that work through npm rather than shell-specific background syntax.

Read Architecture.md for the exact responsibility map. Create AGENTS.md as a short entry point to the five governing documents. Start Memory.md after implementation begins.

## 4. Build deterministic suppliers and pure comparison

Create synthetic inventory and explicit behaviour modes. For example, A returns AUD 285 and B returns AUD 310 for the same dates; reverse the prices for B-cheaper; make both AUD 285 for a tie. Include more than one hotel and unsorted arrays so the comparator cannot accidentally pass by selecting the first record.

Use a trusted attempt number for fail-twice mode, not a shared counter across users. Unit-test money, dates, tie ordering and the aggregate result before introducing the workflow.

## 5. Prove Temporal reliability independently

Implement concurrent activity branches, Temporal retry policy and five-second durable deadlines. A branch deadline requests activity cancellation; the activity independently aborts its HTTP request and response body at the same absolute budget. Heartbeats carry cancellation notifications. Global workflow cancellation must remain distinct from one supplier hitting its deadline.

A start-to-close timeout bounds one attempt; a schedule-to-close timeout bounds the entire activity execution. Neither is a general-purpose way to forcibly stop arbitrary HTTP code. These distinctions motivate the explicit deadline and abort design. [Temporal timeouts](https://docs.temporal.io/develop/typescript/activities/timeouts), [activity cancellation](https://typescript.temporal.io/api/classes/activity.Context).

Run S01–S10 with a real Temporal test server and worker. Use fast, controlled tests for orchestration, plus real-clock HTTP tests for physical cancellation. Temporal's time-skipping does not make an ordinary Node supplier timer advance. [Temporal testing guidance](https://docs.temporal.io/develop/typescript/best-practices/testing-suite).

## 6. Add the Express contract and cancellation bridge

POST /api/search-hotels validates the request, starts a workflow, awaits its typed outcome, then returns the agreed HTTP response. It does not call suppliers directly. Handle normal response closure differently from a premature disconnect.

Test the difficult race: the browser disconnects while the workflow-start RPC is still pending. Save that fact and cancel the handle once it arrives. Also test completed workflows, no worker, Temporal unavailable, and intentional user aborts.

## 7. Build and review the UI

Apply the warm neutral/teal design in Design.md, accessible shadcn controls, one meaningful Morphicons state transition, and locally reviewed icon assets. Use theSVG for a relevant technology logo in documentation/credits; fictional suppliers remain clearly labelled A and B.

Implement idle, invalid, loading, success, partial success, empty, error and cancelled states. Keep Cancel visible while searching. Preserve the form on errors. Block stale responses from previous searches from replacing the active one. Verify mobile layout, keyboard interaction, reduced motion and clear price units.

Read the relevant ibelick and Emil skill files before UI work; their actual rules matter more than merely installing the repos. Their overlapping motion advice is resolved in Rules.md.

## 8. Make the submission reproducible

Run the complete app from a fresh checkout using only the README. Verify build output and the real browser path, not just development mode. Record tests by scenario ID, include all mock-mode demonstration commands, and state limitations honestly.

Only then prepare the GitHub repository and reviewer access. Check the exact intended reviewer identity and the access role supported by the repo ownership type. Do not treat a pending invitation as completed access.

## How to use the master prompt

Option A: place the five governing Markdown files in your project root, keep the other planning files in a separate handoff folder, and paste MasterPrompt.md into the agent. It embeds the specification so it can also work by itself.

Option B: attach only MasterPrompt.md and ask the agent to execute it. Its initial instruction authorizes Phase 0 only: inspect, reconcile and write the proposed documents, then stop for your approval before building.

After each gate, approve the next phase explicitly, for example: “Phase 0 approved. Implement Phase 1 only, run its checks, update Memory.md after implementation starts, and stop at the next gate.”

For a smaller-context local model, use the ShortStartPrompt.md entry point with the five documents available in the repository, then authorize one phase at a time. This reduces repeated context but does not remove the need to read the governing files. A prompt cannot guarantee an error-free agent; small phases and executable acceptance tests make mistakes easier to detect and correct.
