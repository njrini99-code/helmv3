# INC-2026-09-28: the reactions read reported the browser client's own request deadline

- Feature: `team_communications`
- Surface: `/golf/dashboard/messages` (`useMessageReactions`, actions `load` and `save`)
- Fingerprint: 9b8ad988 (`/admin/errors/9b8ad988`), severity warning
- Status: fix in PR (agent/health-20260928-1247); awaiting merge and production deploy (production 6ee77e98 as of 2026-09-28 21:48Z)
- Risk: R1. Client logging decision only. No schema, RLS, grant or data-shape change; the user-facing retry copy is unchanged.
- Signal: `Client error: msg=AbortError: Fetch is aborted hint=Request was aborted (timeout or manual cancellation)`, 2026-09-11 → 2026-09-28 (last 20:26Z). Analysed NOT A DEFECT 2026-09-11 and auto-resolved, then re-opened as REGRESSED twice (`reopened_count` 2): Bridge noise.

## What was wrong

On a slow connection the browser Supabase client's request deadline
(`src/lib/supabase/client.ts`) aborts the reactions read. supabase-js resolves
that as a plain error object; the hook's catch sent every non-42501 failure to
`logError`, so a transport timeout became a Bridge incident, and every later
slow load re-opened it.

## Fix

`isClientDeadlineAbort` in `src/hooks/golf/use-message-reactions.ts` matches
the same three abort wordings `use-presence.ts` treats as benign (Chrome
`TimeoutError: signal timed out`, WebKit `AbortError: Fetch is aborted`, and
the supabase-js hint). The retry copy still shows; the load re-runs on focus,
realtime and retry. 42501 with a live session and every other failure are
still reported.

## Proof

- `src/hooks/golf/__tests__/use-message-reactions.test.tsx` new case fails on
  ef6e37c07 (`logError` called 1 time) and passes with the fix; the 42501
  reporting cases pass unchanged.
- Replay: `replay/manifests/reactions-client-deadline-abort-2026-09-28.yml`.

## Verify in production

After deploy: 9b8ad988 stops receiving rows.

## 2026-10-05 update: the save path had the same gap

The load fix (#2095, merge 463af536) is live in production ef6e017a. 9b8ad988 then
reopened (reopened_count 3) on 2026-10-04 22:16Z with `action: save`: the
`setReaction` catch still sent the same WebKit deadline abort to `logError`.
`setReaction` now applies `isClientDeadlineAbort` before reporting; the
"Reaction was not saved. Try again." copy still shows and the call still
returns false. New case in `src/hooks/golf/__tests__/use-message-reactions.test.tsx`
("does not report the browser client aborting a reaction save") fails on
ed65bb576 (`logError` called once). Replay:
`replay/manifests/reactions-save-deadline-abort-2026-10-05.yml`.
Status: fix in PR (agent/health-20261005-1555); awaiting merge and deploy.
