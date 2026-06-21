# GolfHelm E2E Tab Audit — Remediation Reconciliation (2026-06-21)

Final cross-PR reconciliation of the 2026-06-20 end-to-end tab audit (coach + player, Fairway/redesign live path). Every one of the **156** findings is accounted for: **151 fixed**, **5 skip-dormant** (legacy flag-off / dormant-feature display nits), **0 won't-fix**.

Source of truth: `REMEDIATION_LEDGER.csv` (this directory) — one row per finding with cluster, wave, verification trail, status, and PR.

## By PR

| PR | Theme | Findings | Severity mix |
|----|-------|---------:|--------------|
| #327 | Wave A — DB/security hardening (IDOR, RLS, anon grants) + pgTAP | 7 | CRITICAL 3, LOW 2, MEDIUM 2 |
| #328 | Wave B1 — 5 MEDIUM tab fixes (insights, rounds, settings gate, round-review, redirects) | 10 | LOW 2, MEDIUM 8 |
| #329 | Wave B2 — coach home, prediction-accuracy, team-stats N+1, travel, messaging | 14 | LOW 6, MEDIUM 8 |
| #330 | Wave C3 — 8 LOW long-tail clusters | 13 | LOW 11, MEDIUM 2 |
| #331 | Wave D4 — 17 independent clusters (CRIT/HIGH + LOW) | 42 | CRITICAL 3, HIGH 11, LOW 14, MEDIUM 14 |
| #332 | Wave E — hot-file chains (tasks unification, calendar pagination/realtime, onboarding, roster, settings) | 65 | CRITICAL 5, HIGH 14, LOW 23, MEDIUM 23 |
| — | Skip-dormant (legacy flag-off / dormant display nits) | 5 | LOW 3, MEDIUM 2 |
| | **TOTAL** | **156** | CRITICAL 11, HIGH 25, MEDIUM 59, LOW 61 |

## Skip-dormant (intentional no-ops)

These target the legacy (flag-off) fork or a dormant, never-surfaced feature. Prod runs the Fairway redesign, so the code paths don't execute; fixing them would be dead work. Documented, not silently dropped:

- **F049** [MEDIUM] CoachHelm Analytics — C24-coachhelm-legacy-skip-dormant
- **F053** [MEDIUM] CoachHelm Hub + Chat — C24-coachhelm-legacy-skip-dormant
- **F133** [LOW] Player detail (coach) — C22-retire-orphaned-legacy-dead-code
- **F139** [LOW] Qualifiers (coach) — C20-qualifier-coach-legacy-display-nits
- **F140** [LOW] Qualifiers (coach) — C20-qualifier-coach-legacy-display-nits

## Verification gate (every PR)

- `tsc --noEmit` rc=0
- eslint: 0 errors on changed files (lint:ratchet held/improved)
- full unit suite: **2533 passed / 39 skipped / 0 failed**
- Wave A DDL: dry-run validated (rolled-back BEGIN/RAISE) then applied to prod + 17 pgTAP assertions
- Behavioral live-repro: to run on each PR's Vercel preview before merge

## Notable late-stage catches (this reconciliation)

- **F147** (rounds): `getPlayerTeamId` returned null for non-active members → their rounds saved `team_id = NULL` and went invisible to the coach. Was unaddressed by the batch; fixed write-side (fallback to most-recent membership, no RLS loosening). → #332
- **F015 / F024**: previously tabled as 'refuted'; each had a small real residual (integer-credits input mismatch; coach-onboarding could create a stray coach row for a player). Both fixed safely rather than left open. → #332
