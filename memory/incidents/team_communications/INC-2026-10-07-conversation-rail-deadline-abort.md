# INC-2026-10-07: the conversation rail reported the browser client's own request deadline

- Feature: `team_communications`
- Surface: `/golf/dashboard/messages` (`loadGolfConversationRail`, action `fetch-team-chat-conversations`)
- Fingerprint: af4c2c9d (`/admin/errors/af4c2c9d`), severity warning
- Status: fix in PR (agent/health-20261007-0948), commit 90ae5607f; awaiting merge and production deploy (production ef6e017a as of 2026-10-07 09:48Z)
- Risk: R1. Client logging decision only. No schema, RLS, grant or data-shape change.
- Signal: `Client error: AbortError: Fetch is aborted`, first seen 2026-09-25, last 2026-10-06 18:20Z. Analysed NOT A DEFECT, auto-resolved, and re-opened as REGRESSED 4 times (`reopened_count` 4): Bridge noise.

## What was wrong

The rail's supplemental read of `golf_conversation_participants` runs through
the browser Supabase client, whose request deadline (`src/lib/supabase/client.ts`)
aborts it on a slow connection. supabase-js resolves that as an error object
(WebKit wording `AbortError: Fetch is aborted`), and the rail sent every error
from that read to `logError`. Same root cause as the reactions read
([INC-2026-09-28](INC-2026-09-28-reactions-client-deadline-abort.md), 9b8ad988),
at a different call site.

## Fix

`isClientDeadlineAbort` moves out of `use-message-reactions.ts` into
`src/hooks/golf/client-deadline-abort.ts` and is shared. The rail skips
reporting only that abort; it continues with the RPC rows and reloads on the
next realtime change. Every other failure of the read is still logged.

## Proof

- `src/hooks/golf/__tests__/use-golf-messages.rail-deadline-abort.test.ts`: the
  deadline-abort case fails on 4e030fb14 (`logError` called once) and passes
  with the fix; the "still reports any other failure" case passes on both.
- Replay: `replay/manifests/conversation-rail-deadline-abort-2026-10-07.yml`.

## Verify in production

After deploy: af4c2c9d stops receiving rows from `fetch-team-chat-conversations`.
