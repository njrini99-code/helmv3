# Test Coverage Risk Report

Generated from first-pass audit outputs on branch cleanup/comprehensive-code-audit. First pass is audit/report only; no product-code cleanup is approved.

## Areas With Cleanup Risk and Weak Tests

| Area | Cleanup Risk | Test Coverage Concern |
|---|---|---|
| Overall repo | Refactors can regress behavior | Coverage summary: 38.25% ( 18250/47701 ). |
| `lib/notifications` | Email/push behavior risk | Low coverage shown in report. |
| `lib/supabase` | Auth/session/database boundary risk | Low coverage shown in report. |
| `lib/offline` | Offline sync/shot storage risk | Moderate-low coverage. |
| `lib/utils/schedule-parser.ts` | Parser behavior risk | Very low coverage. |
| CoachHelm engine/routes | Product correctness risk | Some v3 areas strong, but loaders/standing/practice areas are weaker. |

## Areas That Need Tests Before Cleanup

| Area | Why |
|---|---|
| auth/session/account deletion | Security and account integrity. |
| team membership/invites | Cross-team access risk. |
| stats calculations and dashboard aggregations | User-facing numerical correctness. |
| Supabase RLS/admin-client paths | Data isolation risk. |
| export/PDF/report code | User deliverable correctness. |
| mobile/offline flows | State sync risk. |

## Do Not Refactor Without Tests

| Area | Reason |
|---|---|
| BaseballHelm | DEFERRED_BASEBALLHELM. |
| database/RLS behavior | Requires database-specific validation. |
| CoachHelm scoring/generation | Correctness-sensitive. |

## BaseballHelm

BaseballHelm tests/findings are deferred.
