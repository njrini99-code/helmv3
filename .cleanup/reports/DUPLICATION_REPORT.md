# Duplication Report

Generated from first-pass audit outputs on branch cleanup/comprehensive-code-audit. First pass is audit/report only; no product-code cleanup is approved.

## Top Duplicate Clusters

| Rank | Files | Area | Duplication Type | Estimated Impact | Risk |
|---|---|---|---|---|---|
| 1 | SQL migrations/archive | Supabase | Repeated policy/migration blocks | 15,328 duplicated SQL lines | DATABASE_REVIEW |
| 2 | `__tests__/*lint-rule*.mjs` | Test tooling | Repeated filesystem/AST test harnesses | Medium | SAFE_CANDIDATE after approval |
| 3 | `app/api/cron/v3/*/route.ts` | CoachHelm cron APIs | Repeated auth/admin boilerplate | Medium | ARCHITECTURE_REVIEW |
| 4 | `app/api/admin/crm/send-email/route.ts`, `app/api/cron/process-sequences/route.ts` | CRM/email | Repeated helper logic | Medium | MANUAL_REVIEW |
| 5 | Baseball auth/dashboard files | BaseballHelm | Repeated page shells | Unknown | DEFERRED_BASEBALLHELM |

## Best Refactor Candidates

| Area | Files | Proposed Shared Abstraction | Expected Benefit | Risk |
|---|---|---|---|---|
| lint-rule tests | `__tests__/*.test.mjs` | shared rule-test fixture helper | Less repeated test code | Low after approval |
| CoachHelm cron routes | `src/app/api/cron/v3/*/route.ts` | shared cron auth/response wrapper | Reduce route boilerplate | Medium |
| CRM/email routes | admin send/process sequence routes | shared mail validation/error helpers | Reduce duplicated error handling | Medium |

## Do Not Refactor Yet

| Files | Reason |
|---|---|
| `supabase/migrations*` | Historical migrations and RLS behavior require explicit database approval. |
| `src/lib/coachhelm/**` | Engine correctness risk; needs tests/approval first. |
| BaseballHelm files | DEFERRED_BASEBALLHELM. |

## Deferred BaseballHelm Duplicates

| Files | Finding | Reason Deferred |
|---|---|---|
| Baseball auth/dashboard/routes/components | jscpd found Baseball duplicate clusters | BaseballHelm frozen. |

## Metrics

- Standard jscpd: 625 clones, 27,211 duplicated lines, 3.03%.
- Strict jscpd: 1471 clones, 27,383 duplicated lines, 3.61%.
