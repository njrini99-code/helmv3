# INC-2026-08-25 — round recap persist denied at helm_private boundary

- Feature: `golf_round_lifecycle`
- Surface: `round_review_ai` recap persist
- Status: repairing — fix verified against a local reproduction; production
  apply in progress
- Risk: R1 repair of an R3-introduced regression (grants/definer only; no data
  writes, no RLS loosening)
- Sentry: JAVASCRIPT-NEXTJS-PT (17 events, 9 users, escalating)
- First seen: 2026-08-25T19:08Z
- Fingerprint: pg_error_code 42501 at action `generateRoundRecap.persist`

## User impact

Every authenticated recap persist failed server-side. Players and coaches
viewing a completed round got no AI recap saved (the action degraded to
returning no recap), and each view re-attempted LLM generation.

## Confirmed root cause and invariant

`public.save_round_ai_recap` (migration 20260825041628) was SECURITY INVOKER,
so resolving `helm_private.save_round_ai_recap` used the caller's privileges.
Migration 20260825052141 then revoked ALL on schema `helm_private` from
`authenticated`, making the hop impossible for every real caller: 42501
"permission denied for schema helm_private". The pgTAP suite asserted the
INVOKER shape and only checked catalog facts, so it enshrined the bug instead
of catching it.

Invariant: any public wrapper that reaches into `helm_private` must be a
definer boundary (prosecdef = true, pinned search_path), and its suite must
actually CALL it as the `authenticated` role, not only assert catalog facts.

## Repair

- Migration `20260825233000_fix_round_recap_wrapper_definer.sql`: recreate the
  wrapper as SECURITY DEFINER, pinned search_path, EXECUTE revoked from
  PUBLIC/anon, granted to authenticated + service_role. No schema grants added;
  `helm_private` stays locked.
- The round-recap lifecycle suite in `supabase/tests/rls/`: flipped the INVOKER
  assertion to definer, added a wrapper search_path pin check, and added a
  call-path regression test executed as `authenticated` (10/10 pass locally
  against an exact reproduction of the broken state).
