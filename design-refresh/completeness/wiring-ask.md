# Wiring report: ask (4 Nov 2026)

Read-only check on helmv3 03d9087. Added `## Wiring, 4 Nov 2026` to `ask/06-SCREEN-SPECS.md` (W1 to W8) and `ask/08-ACCEPTANCE.md` (W-ASK-1 to 28), pointers under both H1s. Wrong rows fixed in place (02, 03, 05, 08).

## 1. Gaps found, by kind (19)
- Data (3): `listConversations` has no paging (new `listConversationsPage`, 30 a page); coaches can't read players' `notifications` rows, so Told counts come from an admin read in the new `GET …/actions/[key]` route; tone and facts had no table (HM2).
- Actions (7): HM1 hold existed nowhere; the stream route has no `after` import; `updateTag` works only inside a Server Action, so receipts read back the domain row; lineup goes through `setTournamentEntries` and `lockTournamentLineup`, never the raw RPC; Request more can't use the coach-only action ledger (held on its own HM4 row); events use `requestId` from the run key so a double release is one row; the round note appends (`saveRoundCoachNote` replaces).
- Privacy (4): RLS lets players read teammates' stats cache, so the filter lives in `player-tools.ts` on the server; `data-evidence` envelopes reach the client, so no teammate row may be in one; team average only with 5 or more others; player history and allowance policies had no file (HM3, HM4).
- Notifications (3): an event with RSVP off tells nobody (`rsvp.ts:268`), so its Told line counts attendance rows; the qualifier tells inside the call, hence held; Request more's email only while `isCustomerEmailEnabled()`.
- Flags (2): `coachhelm_ask_v2` and `coachhelm_player_ask_v1` are not in `feature-flags.yml` yet (AK0 adds them); the poll flow waits on held `20261028140800`.
- Handoffs (3): chat links use `c=` (`conversationHref`), not `chat=`; Ask 05's held table said Request more waits on HM1 (it waits on HM4); plan in Ask calls lane 6's actions only, event first.

## 2. Citations moved 75b4956 to 03d9087, fixed
`agent-tools.ts` teamTools comment 577-580 to 582-584, `get_tournaments` 602 to 603-607, `BuildToolsArgs` 169-183; `context.ts` 78-111 (403 at :89); stream route `buildCoachTools` call 554-562; CP-I and CP-59 `chat=` to `c=`; 03 "Seen by" sources.

## 3. New held migrations
HM1 to HM4 were only described in `ask/02-PLAN.md` §16, in neither package nor repo. Now written in `ask/held-migrations/` under their planned names (not the 202611040700xx block: five lanes cite them). HELD rows:
- `| \`20261101090000_coachhelm_action_runs_hold.sql\` | **HOLD** | Ask AK4, quick chat QC4. golf_coachhelm_action_runs.run_at, status CHECK adds held and cancelled, held needs run_at, partial index for the sweep. RLS and grants unchanged. Pending owner. | 2026-11-04 |`
- `| \`20261101090100_coachhelm_ask_tone_and_facts.sql\` | **HOLD** | Ask AK8. chat_conversations.tone (straight, detailed, team_talk) and new golf_coachhelm_coach_facts (coach-written, 1 to 280, four coach policies, anon revoked). Pending owner. | 2026-11-04 |`
- `| \`20261101090200_coachhelm_player_ask_conversations.sql\` | **HOLD** | Ask AK10a. chat_conversations.player_id, coach_id nullable with a one-owner CHECK, four player policies each on conversations and messages. Pending owner. | 2026-11-04 |`
- `| \`20261101090300_coachhelm_ask_allowance.sql\` | **HOLD** | Ask AK10b. ask_usage_weekly and ask_credit_requests (one per player per week, 8s hold on the row); restrictive deny for anon and authenticated, service role only. Pending owner. | 2026-11-04 |`
HM5 stays superseded by N-00 `20261026010100`.

## 4. Product calls
Mine: no allowance view (the cap is server config; the client gets plenty, low or out); before HM1 only today's four writes show; no "seen" without a column. None for Nick.

## 5. Text shared files need
- START_HERE (held list): "HM1 to HM4 are now files in `ask/held-migrations/` (planned names kept). HM5 is superseded by N-00 20261026010100."
- HELD.md: the four rows above.
- BUILD_BRIEF, Ask section: "Release needs `import { after } from 'next/server'` in the stream route; receipts read back the domain row."
