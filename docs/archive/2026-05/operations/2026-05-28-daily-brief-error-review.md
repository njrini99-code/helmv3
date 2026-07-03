# Daily Brief — 2026-05-28 — Scheduled Error Review (helm-review)

**Run start:** 2026-05-28 04:00 UTC
**Trigger:** scheduled `helm-review` task
**Sources reviewed:** Sentry (helm-xs / javascript-nextjs), Supabase Postgres logs, Vercel (via Sentry coverage — repo not linked locally)
**Output:** [PR #137](https://github.com/njrini99-code/helmv3/pull/137)

---

## TL;DR

**Two error storms unblocked in one additive migration.** Fix has already been applied to prod (via Supabase MCP, recorded as `20260528041553`); PR keeps local migrations in sync.

| Channel | Top error | Status |
|---------|-----------|--------|
| **Postgres** | `column golf_team_coachhelm_settings.preferences does not exist` (8+ per cron) | ✅ Fixed |
| **Sentry** | `TeeStrategyGenerator` constraint violation (23 events / 1h) | ✅ Fixed |
| **Sentry** | `synthesizeForPlayer` `startsWith` on null (602 events / 1d) | ⏳ Re-check after deploy |
| **Sentry** | PuttDistance / ParType / Scrambling / Warmup / PressureGap constraint violations on player `49ffe06d` (459 events / 1d) | ⚠️ Needs per-player debug session |
| **Sentry** | `generateTeeStrategyInsights is not defined` (30 events) | ⏳ Likely stale deploy — re-check after merge |
| **Sentry** | Vercel AI Gateway free-tier 402 / rate-limit (4 events) | ❌ Not a code bug — billing config |

---

## Sentry — top 20 unresolved issues (last 7d)

| Rank | Events | Issue | Culprit | Class |
|------|--------|-------|---------|-------|
| 1 | 602 | `synthesizeForPlayer` null `startsWith` | `/api/cron/coachhelm-roster-sweep` | downstream — re-check |
| 2 | 146 | PuttDistanceGenerator constraint | `POST /golf/dashboard/coachhelm` | player-specific anomaly |
| 3 | 144 | ParTypeGenerator constraint | `POST /golf/dashboard/coachhelm` | player-specific anomaly |
| 4 | 97 | "skipped legacy records" (info noise) | cron | log-level issue |
| 5 | 49 | WarmupHoleGenerator constraint | dashboard | player-specific |
| 6 | 49 | ScramblingGenerator constraint | dashboard | player-specific |
| 7 | 48 | PressureGapGenerator constraint | dashboard | player-specific |
| 8 | 30 | `generateTeeStrategyInsights is not defined` | dashboard | likely stale deploy |
| 9 | **23** | **TeeStrategyGenerator constraint** | cron | **✅ FIXED by PR #137** |
| 10 | 20 | "philosophy gate filtered" (info noise) | cron | log-level issue |
| 11 | 19 | "skipped 2 legacy records" (info) | cron | log-level issue |
| 12-13 | 16 | `__gated_out__` uuid syntax (approachMiss/scrambling) | cron | code path missing GATED_OUT guard |
| 14-17 | 18 | cascade failures from #2-7 | cron | resolves with #2-7 |
| 18, 20 | 4 | Vercel AI Gateway free-tier limit | `POST /api/coachhelm/v3/chat/send` | billing |
| 19 | 1 | `DialogContent` missing `DialogTitle` a11y | `/golf/dashboard/classes` | UI polish |

## Postgres errors (last 24h)

```
column golf_team_coachhelm_settings.preferences does not exist     (8+ per pass)
golf_coach_insights_insight_type_check violation                    (varies)
```

Both surfaces of the same root causes that PR #137 addresses.

## Vercel server errors

Not separately reviewed — Sentry's `javascript-nextjs` project already aggregates runtime errors from Vercel functions. Repo isn't linked locally (`.vercel/project.json` absent) so direct log pull skipped.

---

## Fix shipped — PR #137

**Migration:** `supabase/migrations/20260528041553_fix_coachhelm_settings_preferences_and_insight_types.sql`

1. **`golf_team_coachhelm_settings.preferences`** — ADD COLUMN `jsonb NOT NULL DEFAULT '{}'::jsonb`. Required by `src/lib/coachhelm/v3/foundation/generator-toggles.ts:60-62` and four sites in `src/app/golf/actions/insights.ts`. Default `{}` lets the "missing key = enabled" fallback at `generator-toggles.ts:69-70` work.
2. **`golf_coach_insights_insight_type_check`** — DROP + recreate to include `'tee_strategy'`, `'performance_alert'`, `'positive_highlight'`. All three are emitted by application code (`v3/generators/tee-strategy.ts:90`, `alerts.ts:415`, `alerts.ts:469`) but were missing from the constraint.

Both ops are pure additions — no data removed, no existing types delisted.

## What's NOT in this PR (follow-ups)

### Needs investigation
- **#2-7 constraint violations on player `49ffe06d-9b22-4f2f-8c69-f56badbbde6b`** — the failing types (`putt_distance`, `par_scoring`, etc.) ARE in the constraint, and the same types successfully INSERT for this same player within the last 36h. Suggests a player-state-dependent code path that produces a different `insight_type` literal at runtime. Recommend: enable verbose logging on `upsertInsight.insertNew` and capture the actual payload for one failing run.
- **#1 `synthesizeForPlayer` null `startsWith`** — `composite/loader.ts:36` already uses `row.signature?.startsWith`. Error is either (a) `row` itself being null in `data.filter`, or (b) a stale deploy. Re-check after PR #137 deploys.
- **#8 `generateTeeStrategyInsights is not defined`** — function is defined and exported in source (`v2/mining/tee-strategy.ts:66`). Stale deploy bundle still references it. Re-check after PR #137 deploys.
- **#12-13 `__gated_out__` uuid error** — approach-analytics, tee-strategy, course-management all already guard `attachDrills(GATED_OUT)`. There's a fourth caller somewhere that doesn't. Grep `attachDrills` outside those three files.

### Out of scope
- **#18, #20 Vercel AI Gateway free-tier 402** — needs paid-plan top-up or a fallback model path in `src/app/api/coachhelm/v3/chat/send/route.ts`.
- **#19 a11y warning** — UI polish (`DialogTitle` missing on classes-page dialog).
- **#4, #10, #11 "info noise" errors** — `logServerError` is being called with severity `'warning'`/`'error'` for events that are actually informational. Downgrade to `'info'` or stop logging entirely.

---

## Verification (post-merge expectations)

Within ~1h of deploy:
- "column ... preferences does not exist" → **drops to 0** in Supabase logs
- JAVASCRIPT-NEXTJS-2G (TeeStrategy 23ev/h) → **stops firing**
- JAVASCRIPT-NEXTJS-2E (`generateTeeStrategyInsights is not defined`) → **expect drop** if stale-deploy theory is right
- JAVASCRIPT-NEXTJS-2B (`synthesizeForPlayer` 602ev/d) → **may drop** if it was downstream of #9; otherwise needs separate fix

If #2-7 (constraint violations on player `49ffe06d`) continue firing, open a debug task to capture the runtime payload.

---

*Generated by scheduled task `helm-review` on 2026-05-28 — claude.com/claude-code*
