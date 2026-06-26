# Database-Adjacent Risk Report

Generated from first-pass audit outputs on branch cleanup/comprehensive-code-audit. First pass is audit/report only; no product-code cleanup is approved.

## Supabase CLI Findings

| Tool | Finding | Risk |
|---|---|---|
| `supabase db lint` | Could not connect to local Postgres on 127.0.0.1:54322. | DATABASE_REVIEW; environment missing. |
| `supabase db diff` | Docker daemon unavailable. | DATABASE_REVIEW; environment missing. |

## Service Role Usage

| File | Usage | Risk |
|---|---|---|
| Multiple files | 867 service-role pattern lines found. | SECURITY_REVIEW / DATABASE_REVIEW. |
| `src/lib/supabase/admin.ts` | Central admin client reads service role env. | Security-critical; do not refactor casually. |
| `src/app/golf/actions/stats-data.ts` | Service-role fallback for detailed stats/RLS timeout paths. | Stats correctness and access-control risk. |
| Baseball service-role paths | Multiple matches under `src/lib/baseball` and `src/app/baseball`. | DEFERRED_BASEBALLHELM. |

## Query Duplication / Raw Query Hotspots

| File | Pattern | Refactor Candidate? |
|---|---|---|
| `src/app/golf/actions/*.ts` | Server actions contain many Supabase query chains. | Manual review only. |
| `src/app/api/cron/v3/*` | Repeated service/admin query patterns. | Architecture review after tests. |
| `supabase/migrations*` | 1116 RLS/policy pattern lines. | Do not touch without DB approval. |

## RLS / Policy Risk Areas

| File/Table | Concern | Risk |
|---|---|---|
| Supabase migrations/archive | Historical policy duplication/noise | DATABASE_REVIEW |
| service-role cron/admin paths | RLS bypass requires explicit scoping | SECURITY_REVIEW |

## Do Not Touch Without Approval

| Area | Reason |
|---|---|
| migrations | DB behavior and history. |
| RLS policies | Security boundary. |
| service-role helpers | Security boundary. |
| stats query paths | Correctness and performance. |

## BaseballHelm DB Findings

Deferred.
