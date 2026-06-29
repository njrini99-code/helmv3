# CoachHelm Wiring Audit — Consolidated Report

Date: 2026-04-27
Scope: Stats tab, Round Review, CoachHelm tab
Method: 3 parallel team-debugger investigators (ACH)
Status: **All 10 punch-list items shipped (1 deferred to schema migration).**

## Implementation summary (post-audit)

| # | Status | Surface | What landed |
|---|---|---|---|
| 1 | ✅ Shipped | CoachHelm | `WhatIfPanel` wired to existing `getPlayerWhatIf` server action; Simulate buttons live |
| 2 | ✅ Shipped | Round Review | `/[id]/page.tsx` no longer embeds `<RoundReviewViewer>`; replaced with CTA card linking to canonical `/[id]/review` |
| 3 | ✅ Shipped | Round Review | Hardcoded `playerAverages` (72/32/50%) zeroed out in `useRoundReviewV2.ts`; canonical surface uses real `getStatAverages` |
| 4 | ⏳ Deferred | CoachHelm | "Add to practice plan" — wired to new `recordDrillAddedToPlan` telemetry action; **persistence blocked by schema** (`golf_tasks.created_by` requires coach FK; needs `golf_drill_plan_items` migration) |
| 5 | ✅ Shipped | CoachHelm | V3 actions in coachhelm/page.tsx now static-imported; errors logged via `logServerError` instead of swallowed |
| 6 | ✅ Shipped | Round Review | Orphan `src/app/api/golf/rounds/generate-review/route.ts` deleted |
| 7 | ✅ Shipped | Round Review | Auto-gen guard added — `useRoundReviewV2` only fires `generate()` when round has score or shots |
| 8 | ✅ Shipped | Stats | All 3 silent catches at stats-client.tsx:491/644/679 now `console.warn` with context |
| 9 | ✅ Shipped | CoachHelm | Dead `RecentRoundReviews` export + file removed |
| 10 | ✅ Shipped | All | Stale TODO.md entries marked false-positive (rounds/[id], stats/[id]) |

Verified: `npx tsc --noEmit` clean across `src/`; ESLint clean on touched files.

---

---

## TL;DR

| Surface | Verdict | Real blockers |
|---|---|---|
| **Stats tab** | ✅ Fully wired | 0 |
| **Round Review** | ⚠️ Mostly wired | 2 (duplicate surface, hardcoded averages) |
| **CoachHelm tab** | ⚠️ Mostly wired | 2 (dead Simulate buttons, stub "Add to practice plan") + 1 strategic (no LLM anywhere) |

Net: the system is **not** skeleton — engines, server actions, Supabase tables, and crons all exist and are wired. There are ~5 concrete gaps and 1 product-level question.

---

## Ranked punch list (do these in order)

### 1. WhatIfPanel — dead buttons (Major, CoachHelm)
`src/app/golf/(dashboard)/dashboard/coachhelm/components/PlayerCoachHelmDashboard.tsx:449-453`
`<WhatIfPanel>` is rendered **without `onSimulate`**, so `WhatIfPanel.tsx:183` hides the Simulate buttons. The simulation engine at `src/lib/coachhelm/v2/simulation/scenario-engine.ts` is fully built and unused.
**Fix:** wrap `scenario-engine` in a server action and pass it as `onSimulate`.

### 2. Round Review — duplicate review surfaces (Major, Round Review)
- `src/app/golf/(dashboard)/dashboard/rounds/[id]/page.tsx:189` renders `<RoundReviewViewer>` (V2 hook)
- `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx` renders a different composition (`RoundReviewDisplay + RoundStatsComparison + V2ReviewSummary`) calling `generateAndStoreRoundReview` directly
- Detail page **never links** to `/review`; only inbound link is from `players/[playerId]/player-insight-client.tsx:818`
**Fix:** pick one canonical surface. Either collapse `/[id]/review` into `/[id]`, or replace the inline viewer with a `<Link>`.

### 3. Hardcoded league averages (Major, Round Review)
`src/hooks/coachhelm/useRoundReviewV2.ts:277-304`
V1 fallback path injects `playerAverages = { totalScore: 72, putts: 32, fairway: 50%, GIR: 50%, scramble: 50% }`.
**Fix:** call existing `getStatAverages(playerId)` at `src/app/golf/actions/round-review-system.ts:1506` — or delete the field, since `RoundStatsComparison` already uses real averages.

### 4. "Add to practice plan" — stub (Major, CoachHelm)
`src/components/golf/coachhelm/insight-card/DrillSheet.tsx:76-78`
`defaultAddToPlan` only fires `toast.info('Noted', ...)`. File header explicitly says "ships in a follow-up plan."
**Fix:** real action that inserts into `golf_tasks` (or whatever the practice-plan table is).

### 5. V3 actions silently swallowed (Minor, CoachHelm)
`src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx:157-166`
V3 actions are dynamic-imported with a stale `/* V3 actions not yet available */` comment; `coachhelm-data.ts` is 1021 LOC and ships. Errors are swallowed.
**Fix:** static-import and log real errors.

### 6. Orphan endpoint (Minor, Round Review)
`src/app/api/golf/rounds/generate-review/route.ts` exists, never called from anywhere — both round-review surfaces use server actions instead.
**Fix:** delete, or route one client path through it for consistency.

### 7. Auto-gen has no data guard (Minor, Round Review)
`src/hooks/coachhelm/useRoundReviewV2.ts:381-389` — auto-fires `generate()` even when round has no shots/score.
**Fix:** gate on `shots.length > 0 || score != null`.

### 8. Stats tab observability (Minor, Stats)
`src/app/golf/(dashboard)/dashboard/stats/stats-client.tsx:491, 644, 679` — three `catch` blocks silently `return null`.
**Fix:** add `console.warn` / Sentry.

### 9. Half-removed BENCHMARKS (Minor, CoachHelm)
`src/lib/coachhelm/v2/mining/stats-insight-generator.ts:63` — TODO says "replace with dynamic baselines"; `compareAgainstBaseline` already implements it (lines 33-61) but `BENCHMARKS` (lines 65-113) is still imported elsewhere.
**Fix:** migrate remaining call sites and delete `BENCHMARKS`.

### 10. Untyped Supabase table (Minor, CoachHelm)
`src/hooks/coachhelm/useCoachHelmSettings.ts:100, 116` — `'golf_coachhelm_settings' as 'users'` and `as any` casts because the table isn't in generated Supabase types.
**Fix:** regenerate Supabase types.

### 11. Dead component export (Minor, CoachHelm)
`src/components/golf/coachhelm/player/RecentRoundReviews.tsx` exported from `player/index.ts:6`, no consumer.
**Fix:** render it or delete it.

### 12. Stale TODO.md entries (Trivial, all)
- `TODO.md:98` — flags missing `/golf/dashboard/stats/[id]`. The UX uses `?player=` query-param + separate `/players/[playerId]` and `/rounds/[id]` routes. Not a real gap.
- `TODO.md:84, 410` — claims `/golf/dashboard/rounds/[id]` not linked anywhere. False — `rounds/page.tsx:420` and `roster/[id]/page.tsx:310` both link there.
**Fix:** prune or rescope these TODO entries; the auditor that produced them was stale.

---

## Strategic finding — no LLM in CoachHelm

`grep` for `openai|anthropic|generateText|streamText|@ai-sdk` across `src/lib/coachhelm/**`, `src/components/golf/coachhelm/**`, `src/hooks/coachhelm/**`, `src/app/api/coachhelm/**` returns **zero hits**. `package.json` has no AI provider deps. NLG (`src/lib/coachhelm/v2/nlg/insight-composer.ts:31`) is template-only over a deterministic statistical engine. The page metadata says "AI-powered insights" (`src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx:17`).

This is a **product decision, not a wiring bug**: either the marketing copy is aspirational, or there is a planned LLM integration that hasn't started. If model-generated language is intended, it is the largest missing piece in the system. If it isn't, the engine is genuinely complete.

---

## V1 / V2 / V3 status

- `src/lib/coachhelm/v2/stats/` is the only stats engine. There is no `src/lib/coachhelm/stats/`.
- `src/lib/coachhelm/` root keeps 3 types-only / constants-only files (`types.ts`, `insight-types.ts`, `constants.ts`) consumed by ~20 settings/round-review components — deliberate shared-types layer, not a v1 engine.
- 80 imports of `@/lib/coachhelm/v2/...` across `src/`.
- **Migration is complete on engine code.** Only stale residue: the `'v1.0'` engine_version string at `round-review-system.ts:1279` and the half-removed `BENCHMARKS` constant.

---

## Per-investigator reports

- `.full-review/stats-audit.md`
- `.full-review/round-review-audit.md`
- `.full-review/coachhelm-audit.md`
