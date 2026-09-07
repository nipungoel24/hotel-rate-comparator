# Source Notes and Revalidation

Research date: 2026-09-05. Project choices are proposed engineering decisions unless identified below as documented SDK/resource behaviour. The implementation agent must check current APIs and supported package versions before installation.

| Source | Relevance |
| --- | --- |
| https://docs.temporal.io/develop/typescript | Official SDK, workflow, activity and worker entry point |
| https://docs.temporal.io/develop/typescript/activities/timeouts | Attempt vs whole-activity timeouts and retry configuration |
| https://docs.temporal.io/develop/typescript/workflows/cancellation-scopes | Workflow cancellation structure |
| https://docs.temporal.io/develop/typescript/workflows/cancellation | Heartbeat-based activity cancellation and cleanup |
| https://typescript.temporal.io/api/classes/activity.Context | cancellationSignal and heartbeat semantics |
| https://docs.temporal.io/develop/typescript/best-practices/testing-suite | Real test environments, activity testing and time-skipping |
| https://github.com/temporalio/samples-typescript | Official implementation examples to verify at build time |
| https://www.morphicons.com/ | React integration and icon-data distinction |
| https://www.morphicons.com/llms.txt | Agent-oriented documentation entry point |
| https://thesvg.org/ | Brand SVG catalogue; individual asset availability still needs verification |
| https://thesvg.org/legal | Policy entry point; this research did not establish the licence of any selected asset |
| https://github.com/ibelick/ui-skills | Skill registry and documented CLI entry points |
| https://github.com/ibelick/ui-skills/blob/main/skills/baseline-ui/SKILL.md | Layout, typography, primitive and motion constraints |
| https://github.com/ibelick/ui-skills/blob/main/skills/fixing-accessibility/SKILL.md | Names, form errors, keyboard and focus checks |
| https://github.com/ibelick/ui-skills/blob/main/skills/fixing-motion-performance/SKILL.md | Animation audit guidance |
| https://github.com/ibelick/ui-skills/blob/main/skills/create-design-md/SKILL.md | Reviewed scope; not applied because this is an original design |
| https://github.com/emilkowalski/skills | Skill inventory and installation entry point |
| https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md | Functional motion and design engineering principles |
| https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md | Reference for implementing approved transitions |
| https://github.com/emilkowalski/skills/blob/main/skills/review-animations/SKILL.md | Reference for reviewing the implemented transition |
| https://ui.shadcn.com/docs | Owned component source and official setup entry point |
| https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization | Organization repository roles; verify chosen repository model during submission |

Some raw GitHub URLs failed in this research; available GitHub page/search views supplied the relevant source text. The resource list is not a claim that every skill in either repository was fully read or installed. Relevant guidance was reviewed for this plan; the implementing agent must retrieve the complete applicable skill files and references and record exact revisions in docs/resource-audit.md. No icon asset has yet been selected, downloaded or licensed for the application.

The chosen five-second branch budget, retry intervals, six-second safety ceilings, fifteen-second workflow ceiling, price basis, HTTP mappings, palette and folder layout are this project's proposed decisions. They are not mandates from Temporal or the UI libraries. Confirm them in Phase 0 and validate them in code.
