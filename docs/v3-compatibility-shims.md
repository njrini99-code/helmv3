# CoachHelm v3 — Compatibility Shim Registry

> **Every shim has a kill date or the PR is rejected.** This file enforces Rule 10 from [`docs/v3-master-plan.md` Part I](./v3-master-plan.md). A shim is any temporary bridge that lets v2 and v3 coexist; without an explicit removal wave, shims become permanent debt.

---

## Registry

| Shim | Introduced | Removed | Owner | Status | Notes |
|---|---|---|---|---|---|
| `focus_areas` dual-write | W19 | W20 | engine | pending | Both `golf_player_focus_areas` and `golf_goals` written until the W20 cutover migration runs. |
| v2 generators running alongside v3 | W21 | W25 | engine | pending | Different signature namespace (`v3:` prefix) and `engine_version='v3'` stamp prevent collisions. |
| v2 `reasoning/` + `nlg/` referenced by orchestrator | — | W25 | engine | pending | W25 removes references in orchestrator; W26 deletes the code files. |

---

## Adding a Shim

When a wave introduces a new shim:

1. Append a row to the table above with `introduced` = wave number, `removed` = the wave that will delete it, `owner` = the area (engine / api / ui / data).
2. State the kill condition in the Notes column (a wave, a date, a metric — never "eventually").
3. In the source code, add a `// SHIM(<row-name>): remove by W<NN>` comment so the search-and-destroy is mechanical.

## Removing a Shim

The wave that removes a shim must:

1. Set its row's Status to `removed` and add the date.
2. Delete the `// SHIM(...)` source comment.
3. Verify in prod that the shim path no longer fires (e.g. `EXPLAIN ANALYZE` on the dual-write, or a log scan for the v2 reasoning callsite).

If the kill-date wave ships without removing the shim, the shim's status becomes `overdue` and blocks subsequent waves until resolved.

---

## Anti-Patterns

- **Silent shims** — code paths that exist "just in case." Forbidden. If it's not in this table, it doesn't get to live.
- **"Phase 2" removal** — a kill date that points at a hypothetical future wave. Removal lands in a numbered wave or doesn't get approved.
- **Reverse shims** — v3 code calling v2 code. v3 may read v2 state (e.g. existing `golf_coach_insights` rows) but must not call into v2 functions outside the orchestrator handoff in W25.
