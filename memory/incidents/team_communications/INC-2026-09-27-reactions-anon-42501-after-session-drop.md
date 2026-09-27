# INC-2026-09-27: reactions load reported an anon 42501 after the session dropped mid-request

- Feature: `team_communications`
- Surface: `/golf/dashboard/messages` (MessageReactions)
- Status: FIX IN PR #2082 (agent/health-20260927-1147); production 6ee77e98 as of 2026-09-27 22:00Z
- Risk: R1. Client error handling only. No grant, RLS, migration or schema change; `golf_message_reactions` keeps granting anon nothing.
- Signal: Bridge fingerprint `8011d1b9` (`code=42501 msg=permission denied for table golf_message_reactions`), REGRESSED: auto-resolved 2026-09-19, reopened 2026-09-24, fired again 2026-09-27 16:18:39Z on deploy dpl_HD8BRLq11yFKjcqTLfQSXZoXYi4C with `anonymous: true`, document hidden, back_forward navigation.

## What was wrong

PR #1932 gated `refresh()` on `auth.getSession()`, and that gate is live. The
gate is a check, not a lock: a hidden or bfcache-restored tab can lose its
session between the check and PostgREST's answer. The read then runs as anon,
the table answers 42501 by design, and the hook reported it as a product
error. The error logger itself recorded the user as anonymous. The stored
analysis ("resolve once PR #1932 is live") is CORRECTED by this incident: the
fix was live and the residual race remained.

## Fix

In `refresh()`'s catch, a 42501 is silent only when `hasLiveSession()` is
false by the time the error arrives; the screen keeps its rows and
`onAuthStateChange` re-runs the load. A 42501 with a live session is still
reported (a real access defect).

## Proof

- `src/hooks/golf/__tests__/use-message-reactions.test.tsx`: the new
  session-dropped test fails on origin/main 82420866a (logError called) and
  passes with the fix; a companion test proves a live-session 42501 is still
  logged; the 8 existing tests pass unchanged.
- Replay: `replay/manifests/reactions-anon-42501-after-session-drop-2026-09-27.yml`.

## Verify in production

After deploy: `8011d1b9` has zero occurrences for 24h+ after the deploy is live.
