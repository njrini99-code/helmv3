# Clubhouse quality tooling implementation plan

> Approved scope: implement the configuration recommendations requested by
> the owner. Use the writing-plans and dispatching-parallel-agents workflows.

**Goal:** make Clubhouse UI checks repeatable without changing the design or
claiming device release acceptance.

**Architecture:** scoped agent guidance, a separate presentation-fixture
Playwright lane, CSS analysis against an immutable base, and a performance
reader for existing raw captures. Keep reviewed screenshots outside Git.

**Stack:** Next.js, Playwright Chromium/WebKit, axe, Stylelint/PostCSS,
Next DevTools MCP and React DevTools.

## Task 1: Scope agent authority

Update root/design guidance with a Clubhouse exception. Add local authority
and an optional reviewer. Map all 15 manifest families into the premium audit
profile. Check manifest coverage and knowledge inventory.

## Task 2: Implement repeatable checks

Add normal/reduced-motion popup checks in two browser engines, explicit visual
baseline comparison, configurable page accessibility selections, a CSS guard
and raw-capture performance budgets. Test parsers and failure handling; run
the presentation smoke matrix and CSS guard. Wire the PR workflow.

## Task 3: Integrate local tools and handoff

Pin MCP, profiler and lint dependencies; repair local MCP transport through a
portable template and preserving setup command. Document commands and evidence
limits, refresh generated inventories, run affected checks, commit/push the
task branch and update the existing PR. Physical-device and owner-reviewed
baselines remain release evidence, not tooling-test claims.
