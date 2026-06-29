# Product Map

Helm Sports Labs is a multi-sport SaaS repo with shared platform infrastructure and separate product surfaces.

## Products

| Product | Routes | Primary Users | Notes |
|---|---|---|---|
| GolfHelm | `/golf/**` | golf coaches, golf players, admins | Team management, rounds, stats, travel, roster, messaging, CoachHelm AI. |
| CoachHelm | `/golf/dashboard/coachhelm/**`, `/api/coachhelm/**`, cron routes | golf coaches and players | AI insights, genome, alerts, patterns, evaluations, notifications. |
| BaseballHelm | `/baseball/**` | coaches, players, staff | Recruiting, roster, performance, videos, packets, decision room, team operations. |
| Lifting Lab | `/lifting/**` | strength coaches, athletes | Strength programs, live sessions, readiness, groups, exercises. |
| Platform | `/api/**`, auth, shared components, Supabase | all products | Auth, RLS, shared UI, observability, background jobs. |

## Feature Routing

Use `memory/registry.yml` first for feature ownership. It maps code paths to:

- Current-state feature docs.
- Required context docs.
- Required tests/checks.
- Integrations and risk level.

If a changed path does not map, either update `memory/registry.yml` or call out the feature-awareness gap.

## Current Feature Docs

Feature docs should stay concise and current-state only:

- What it does.
- User roles.
- Routes.
- Data model.
- Server actions/APIs.
- Happy path.
- Dangerous edge cases.
- Things agents often break.
- Required tests.
- Last verified.
