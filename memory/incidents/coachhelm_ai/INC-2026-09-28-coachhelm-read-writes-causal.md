# INC-2026-09-28: the player CoachHelm page read still wrote causal relationships

- Feature: `coachhelm_ai` (`src/lib/coachhelm/v2/mining/causal-engine.ts`, `src/lib/coachhelm/v2/orchestrator.ts`)
- Surface: `GET /golf/dashboard/coachhelm` (player), `getPlayerCoachHelmDashboard`
- Status: FIX IN PR (agent/health-20260928-0047); production 6ee77e98 (not yet deployed)
- Risk: R1. Application code only; no schema, RLS, grant or migration change.
- Signal: Bridge `ca4409c2` ("getPlayerCoachHelmDashboard failed: Failed to update CoachHelm causal relationship: TypeError: fetch failed") and `ed64f3b6` ("An unexpected error occurred"), both 2026-09-28 01:19Z; Sentry JAVASCRIPT-NEXTJS-YW (`fetch failed`, same route).

## What was wrong

The dashboard read passes `persistPatterns: false` and
`runInsightGenerators: false` to `analyzePlayer` so a page view never
writes (#2068, and the earlier 40P01 deadlock fix). The causal engine
ignored both: `discoverCausalRelationships()` always ran
`saveRelationships`, a lookup plus UPDATE/INSERT per relationship and a
supersede sweep on `golf_causal_relationships`. A failure there throws,
rejecting `analyzePlayer`'s `Promise.all`, so a transient network fault on
a write the page never needed failed the whole page.

## Fix

`discoverCausalRelationships({ persist })`, default `true` for the
post-round trigger, crons and explicit analyze actions; `analyzePlayer`
passes `persistPatterns` through. The page still shows the relationships it
just computed.

## Proof

- `src/lib/coachhelm/v2/mining/__tests__/causal-engine.read-only.test.ts`:
  `persist: false` throws the production message on f466378b and passes with
  the fix; the default-persist control proves the write path is exercised.
- `player-coachhelm-dashboard-readonly.test.ts` pins the orchestrator wiring.
- Replay: `replay/manifests/coachhelm-read-writes-causal-2026-09-28.yml`.

## Not changed

The 5s-budget warnings on the same route (`8ff00f0e`, `20ed2ddd`) are RLS
cost on `putt_details` / `approach_miss_details`, an R3 owner decision.

## Verify in production

After the next deploy: no `Failed to update CoachHelm causal relationship`
row from `getPlayerCoachHelmDashboard`; `golf_causal_relationships.updated_at`
advances only on round submit and cron runs.
