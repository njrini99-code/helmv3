# INC-2026-09-25 — "no player profile" raised PGRST116 on the round-continue path

- Feature: `golf_round_lifecycle`
- Status: FIXED on branch (agent/health-20260925-0948), not yet merged or deployed
- Risk: R2 — false exceptions only; every caller already returned its own
  "not found" result, so no user saw a wrong answer and no data was written
- Fingerprint: `rel:72be7f89` (Sentry JAVASCRIPT-NEXTJS-SZ, plus WJ/WH/SA/Q9/QZ
  with the same message)
- First seen: 2026-09-07 (SZ); last seen 2026-09-15; 34 events on
  `POST /golf/dashboard/rounds/continue/[id]`

## What was wrong

`golf_players` lookups by `user_id` ended in `.single()`. For a signed-in
user without a player row, PostgREST reports the zero-row match as PGRST116
("Cannot coerce the result to a single JSON object"). The callers never read
that error (`if (!player) return …`), but the Supabase/Sentry instrumentation
records it as an exception.

bdc09c915 (#1647, 2026-08-28) converted the first 8 sites in `golf.ts` to
`.maybeSingle()` and the fingerprint was auto-resolved on 2026-09-04 as
ALREADY FIXED. The same message then recurred from sites that commit did not
touch (the draft auto-save in `round-drafts.ts` among them). A 2026-09-17
FIX HERE analysis named them, but the standing 09-04 resolution was never
reopened, so Repair's STEP 1 filter hid the finding for 8 days.

## Fix

`.maybeSingle()` at 9 sites: `round-drafts.ts` (3), `golf.ts` saved-course
actions (3), `communication.ts` (2), `announcements.ts` (1). Zero rows now
return `{ data: null, error: null }`; more than one row still errors.

Deliberately left on `.single()`: `golf.ts` respondToEvent and `stats.ts`
(they branch on PGRST116 to tell "no profile" from a failed read),
`calendar-sync.ts` (an authorization check, R3 scope) and
`auth/callback/route.ts` (auth, R3).

Regression test: `src/app/golf/actions/__tests__/player-lookup-maybe-single.test.ts`
(fails on e5adf2e41, passes on the fix). Replay:
`replay/manifests/player-lookup-maybe-single-2026-09-25.yml`.

## Close

Resolve `rel:72be7f89` (ledger write only; it is a `rel:` key) once the fix
has been live 24h with zero occurrences. The stale 09-04 ledger row needs a
reopen by the owner for the Bridge to show this as open until then.
