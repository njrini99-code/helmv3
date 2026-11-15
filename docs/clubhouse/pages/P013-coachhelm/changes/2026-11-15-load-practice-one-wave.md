# P013 CoachHelm (Practice) — Changelog

## 2026-11-15 — Practice reads in one wave

```text
Design package: none (production audit 2026-11-15, PMAC-12 and MAC-11's time to first byte)
PR/commit: claude/project-thread-10vtd2 (worker F, load)
Contract IDs: none changed (read order only; every state, row and tile is as it was)
Actions: none
Data impact: none (the same reads, started together; no write, no schema change)
Held items: the time-to-first-byte measurement (below)
```

### Changed

- `data/practice-home.ts`, coach: the team row, the plans, the practices in the window and the active roster need only the team id, so the four start together. Three database round trips one after the other become one. Their answers are read in the same order as before (no team row is "didn't load"; a missing plans table is "not on yet"; a failed window or roster is "didn't load"), so every outcome is the same. The older practices a plan points at, and the next plan's day, still follow, since they need the plans.
- `data/practice-home.ts`, player: the live versions start with the team row instead of after it. The events read still follows, since it needs the versions' event ids.

### Why

- PMAC-12: Practice took 825 ms to its first byte in production; the time was in this loader's waits.

### Verification

- Unit (vitest): `data/__tests__/practice-home-waves.test.ts` (new: each role's reads are asked for while the team row is held), `practice-plan.test.ts`, `practice-plan-failed-reads.test.ts`, `routes/__tests__/practice-unavailable.test.tsx`.
- Not measured here: time to first byte on `/golf/dashboard/practice` for a coach and a player, before and after, on a production build (C tier is enough for a server time).
