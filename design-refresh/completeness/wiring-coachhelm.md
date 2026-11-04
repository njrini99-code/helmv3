# Wiring report: coachhelm (quick chat and AGENT_KIT, 4 Nov 2026)

Checked on helmv3 main 03d9087 by reading only. Added `## Wiring, 4 Nov 2026` to `coachhelm/06-SCREEN-SPECS.md` (QW1 to QW4) and `coachhelm/08-ACCEPTANCE.md` (W-QC-1 to W-QC-15), pointers under both H1s. `AGENT_KIT.md` gains "Wiring, 4 Nov 2026" (K-16 to K-27, the server contract for each piece) and a log row. In-place fixes in 02, 03, 05 and TASK_FIELDS.

## 1. Gaps found, by kind (16)
- Data (4): `lookingAt` takes three arguments (trail from `useCrumbTrail`); "Earlier today" had no source (now the coach's newest conversation since the team zone's midnight; conversations carry no `team_id`, so a coach on two teams shares the day's thread); the event Told fixture assumed notification rows that an RSVP-off event never writes; the folder row still pointed at N-10.
- Actions (4): `shell.ts` has no role, so `quickChat = askOn && flag` (`askOn` is coach-only); the message send needs `clientMessageId` from the run key so a double release is one message; the qualifier's round-course write is best effort and only logged, so the receipt re-reads it and can be partial; TASK_FIELDS §3 named a `confirmed` status and the wrong proposal line.
- Privacy (1): the Told route reads delivery with the admin client, so it must return counts and roster ids for the coach's own team only (404 for another coach's key).
- Notifications (2): RSVP-off events tell nobody, so the line counts attendance; message "seen" comes from `golf_conversation_read_marks`.
- Flags (2): `coachhelm_quick_chat_v1` is new; the "HM1 not applied" row said every write runs at once, which conflicts with Ask's S-ASK.kit.no-hold (fixed: no event, message or qualifier task without HM1; messages go to "Open in Messages").
- Handoffs (3): Open full chat uses `conversationHref` (`c=`); there is no stream resume and the route aborts on disconnect, so the chat lives in a provider-level `QuickChatSession` and the Ask screen attaches through `useQuickChatRun()`; `subscribeOnline` must be exported from `AskSheetBody.tsx`, not copied.

## 2. Citations moved 75b4956 to 03d9087, fixed
`development.ts:478` to `:495`; TASK_FIELDS `agent-tools.ts:400-437` to `proposeGated` :317, `executeGated` 372-437, `recordProposal` `action-runs.ts:96`; `shell.ts` return at :265-266 and type at :49; `AskSheet.tsx` `lookingAt` 36-47.

## 3. New held migrations
None in this lane. It rides on HM1, now written at `ask/held-migrations/20261101090000_coachhelm_action_runs_hold.sql` (HELD row in `wiring-ask.md`).

## 4. Product calls
Made myself: the shared day thread for two-team coaches stays (rare, no migration); without HM1 the quick chat drops held tasks rather than writing with no Undo; a reload drops the live pill and the held receipt shows on the next open. None for Nick.

## 5. Text shared files need
- START_HERE, quick chat line: "Quick chat writes need HM1 (now a file in `ask/held-migrations/`); without it only today's four writes show."
- None else.
