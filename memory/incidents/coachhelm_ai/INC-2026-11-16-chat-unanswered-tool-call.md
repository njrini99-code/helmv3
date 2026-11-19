# INC-2026-11-16: an answer-only tool call was stored without its result and broke the conversation

- Feature: `coachhelm_ai`
- Surface: `POST /api/coachhelm/v3/chat/stream` (coach Ask)
- Status: FIX IN PR (health routine 2026-11-18, `60fccb64f1`); not merged, not deployed
- Risk: R1. Chat engine only (`engine/loop.ts`, `engine/store.ts`). No schema, RLS, grant, auth or budget change; no data write.
- Signal: Bridge `7286de9e` (warning, `v3.chat.stream.degraded`, 20 rows in one burst 2026-11-16 14:41Z) and `rel:d92ad386`: "messages.34: `tool_use` ids were found without `tool_result` blocks immediately after". The engine dropped every feature group in turn and the request still failed, so both of the coach's next messages (14:41:10Z, 14:41:55Z) were stored `failed`.

## What was wrong

The 14:36Z turn used all 12 steps (`CHAT_MAX_STEPS`). The 13th call is the
answer-only step (`tool_choice: none`), but the API returned a `tool_use`
anyway. `runModelLoop` kept the assistant message as returned and stopped with
`complete` (`if (toolUses.length === 0 || answerOnly)`), so the turn was stored
complete with a trailing call that has no result (the stored row's last model
message is a lone `tool_use`). `buildHistory` replays stored turns exactly, so
every later request of the conversation carried an unanswered call and the API
rejected it. Nothing could recover the conversation.

## Fix

- `loop.ts`: on the answer-only step, tool calls are not kept; a response that
  was only a call keeps nothing.
- `store.ts`: `answeredCallsOnly` removes from a stored turn any call whose
  result is not in the very next message (a message left with only thinking is
  dropped). `buildHistory` applies it to every stored turn except one still
  waiting on a card, whose call the coach's next message answers. This also
  heals conversations already stored this way, with no data write.

## Proof

- `src/lib/coachhelm/v3/chat/engine/__tests__/unanswered-calls.test.ts`: 6 of 7
  fail on origin/main `c8c482377`, 7/7 pass with the fix. The chat engine and
  stream route suites (12 files, 243 tests) pass.
- Replay: `replay/manifests/chat-unanswered-tool-call-2026-11-16.yml`.

## Not covered

`3d921c67` ("`tool_use` ids must be unique", 2026-11-10) is a different
shape and still NEEDS MORE EVIDENCE.

## Verify in production

After deploy: `7286de9e` / `rel:d92ad386` do not recur, and a new message in
conversation `223d3db7` completes instead of failing.
