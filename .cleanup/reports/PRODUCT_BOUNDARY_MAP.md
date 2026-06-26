# Product Boundary Map

Generated from first-pass audit outputs on branch cleanup/comprehensive-code-audit. First pass is audit/report only; no product-code cleanup is approved.

## GolfHelm Areas

| Path | Purpose | Cleanup Allowed? |
|---|---|---|
| `src/app/golf` | Golf app routes, actions, admin, dashboard flows | Manual approval required |
| `src/components/golf` | Golf-specific UI and CoachHelm UI | Manual approval required |
| `src/components/fairway` | Fairway/GolfHelm shared dashboard UI | Manual approval required; high shared-surface risk |
| `src/lib/golf` | Golf domain utilities and stats helpers | Manual approval required; stats correctness risk |

## BaseballHelm Areas

| Path | Purpose | Cleanup Allowed? |
|---|---|---|
| `src/app/baseball` | BaseballHelm routes/actions | No; DEFERRED_BASEBALLHELM |
| `src/components/baseball` | BaseballHelm UI | No; DEFERRED_BASEBALLHELM |
| `src/lib/baseball` | BaseballHelm domain/read models | No; DEFERRED_BASEBALLHELM |
| `docs/baseballhelm_revolution_plan_v2` | BaseballHelm docs/plans | No; DEFERRED_BASEBALLHELM |
| `scripts/baseballhelm-*` | BaseballHelm workflows | No; DEFERRED_BASEBALLHELM |

All BaseballHelm areas are read-only. 1348 files matched BaseballHelm terms and are quarantined.

## CoachHelm Areas

| Path | Purpose | Cleanup Allowed? |
|---|---|---|
| `src/lib/coachhelm` | CoachHelm engine and scoring | Manual approval; high correctness risk |
| `src/components/golf/coachhelm` | CoachHelm UI under GolfHelm | Manual approval |
| `src/components/fairway/pages/coachhelm` | Fairway CoachHelm surfaces | Manual approval |
| `src/app/api/coachhelm` | CoachHelm API routes | Manual approval; API behavior risk |

## Shared Areas

| Path | Consumers | Risk |
|---|---|---|
| `src/components/ui` | Golf, CoachHelm, Baseball, lifting | HIGH_RISK_DO_NOT_TOUCH without impact proof |
| `src/hooks` | Multi-product hooks | HIGH_RISK_DO_NOT_TOUCH when BaseballHelm usage is possible |
| `src/lib/supabase` | All database-backed products | DATABASE_REVIEW |
| `src/lib/auth` | Auth/security flows | HIGH_RISK_DO_NOT_TOUCH |
| `supabase` | Migrations/RLS/functions | DATABASE_REVIEW; no behavior changes |

## Ambiguous Areas

| Path | Why Ambiguous | Required Human Decision |
|---|---|---|
| `src/components/fairway` | Fairway is Golf/Coach-facing but shared exports may leak across shells | Decide ownership before refactors |
| `src/app/lifting`, `src/components/lifting` | Separate product, but auth/shared UI overlap | Confirm cleanup priority |
| `tools`, `.helmdev`, `.agents`, `.claude` | Agent/tooling artifacts may be intentionally retained | Decide archive/gitignore policy |
