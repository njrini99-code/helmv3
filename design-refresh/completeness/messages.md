# Lane report: Messages (completeness pass, 4 Nov 2026)

Lane folder: `pkg/design-refresh/messages/`. Files changed, each with the one-line pointer under its H1 and one `## Completeness pass, 4 Nov 2026` section at the end: `05-SCREENS.md`, `06-SCREEN-SPECS.md`, `07-MOTION.md`, `08-ACCEPTANCE.md`, `02-PLAN.md`, `03-DATA-CHECKS.md`, `pin-sync/PIN-SYNC.md`. Nothing outside the lane folder was edited. No shared file, no source folder, no capture script change. Nothing run, pushed or deployed.

The biggest finding: **the Messages lane has no flag.** No lane file or shared file names one, and 02-PLAN restyles in place and deletes old CSS and the gradient token, so "flag off renders exactly as main" (SHARED-8) could not hold. The pass names `golf_messages_redesign_v1` and scopes everything under `[data-ch-ms-v2]`; it needs a shared-file line (section 4).

## 1. Matrix

| Item ID | Kind | States covered before | Gaps found | What I added (file, CP ids) |
|---|---|---|---|---|
| Lane as a whole | flag | none | no flag; deletes in 02-PLAN break flag off | 05 "The lane flag"; 02 flag in 11a, deletes moved to a cleanup PR; 08 MSG-CP-01 to 05 |
| S-MSG | screen | 14 states drawn or ruled | row leave and row bump motion; badge refetch (M3), deleted counts (H1); no team | 07 M-MSG-CP-11, 12; 08 MSG-CP-24, 48, 59; 05 S-MSG.noteam |
| S-MSG.unread, .row-menu, .new, .empty, .fresh | screens and states | full | fresh "open line" (S6 settles it) | 05 fixed in place |
| S-MSG.thread | screen | full | failed copy pointed at page words, not S2; no pending, divider, paging, removed, deep link, edited, deleted rules | 05 fixed in place; new IDs below |
| S-MSG.composer | inline state | full | long text cap, IME, Esc order, double submit | 05 keyboard table; 08 MSG-CP-12, 49, 50, 52 |
| S-MSG.team, .typing | states | full | typing end cases, flag-off expiry | 08 MSG-CP-37, 38; 07 interrupt case 1 |
| S-MSG.times, .date-pill, .jump | states | full | jump to an unmounted latest page | 05 S-MSG.older; 08 MSG-CP-30 |
| S-MSG.toast | toast | full | "open line"; MSG-TOAST-03 forbade every other toast, including today's errors | 05 fixed (S5); 08 MSG-TOAST-03 fixed, MSG-CP-60 |
| S-MSG.attach, .file | menu, chip | full | upload progress, failure, size limit, re-sign (M4) | 05 S-MSG.upload; 06; 07 CP-04, 05; 08 MSG-CP-13 to 17 |
| S-MSG.reply, .edit | chips | full | edit failure; desktop Edit modal with flag on | 05 S-MSG.edited; 08 MSG-CP-21 |
| S-MSG.poll-composer, .poll, .votes | sheet, card | full | discard confirm, vote rollback, closed poll, one vs many voters | 06 confirm rows; 08 MSG-CP-18 to 20 |
| S-MSG.hold | overlay | full | haptic said medium (ruling 22 says light) | 05 fixed in place |
| S-MSG.holdseen, .seen | menu row, sheet | full | "open line" (S1, S8 settle) | 05 fixed in place (3 rows); 07 M-MSG-12 fixed |
| S-MSG.react | badge | full | who-reacted list not specified | 05 S-MSG.who-reacted; 06 |
| S-MSG.details, .groupdetails, .mute | pages, menu | full | narrow desktop; leave and removal; mute expiry | 05 S-MSG.narrow, S-MSG.removed; 08 MSG-CP-24 to 28, 47 |
| S-MSG.pending | new | none | sending label, failed reorder, delete failed | 05, 06, 07 CP-01 to 03, 08 MSG-CP-06 to 09 |
| S-MSG.offline | new | none | offline banner, what fails, reconnect | 05, 06, 07 CP-13, 08 MSG-CP-10, 11 |
| S-MSG.upload | new | none | as above | 05, 06, 07, 08 |
| S-MSG.edited, .deleted | new | none | mark contrast, placeholder, remote delete | 05, 06, 07 CP-06, 07, 08 MSG-CP-21, 22 |
| S-MSG.divider | new | none | position, copy, when it goes | 05, 06, 07 CP-08, 08 MSG-CP-31 |
| S-MSG.older | new | none | paging, anchor, failure, scroll restore | 05, 06, 07 CP-09, 10, 08 MSG-CP-29, 30, 32 |
| S-MSG.search | new | none | empty search, hidden hits (M1) | 05, 06, 07 CP-17, 08 MSG-CP-34 to 36 |
| S-MSG.who-reacted, .add, .confirm | new (kept) | "keep today's" only | focus, Esc, double submit, XXL stacking, L2 | 05, 06, 07 CP-15, 16, 08 MSG-CP-53 |
| S-MSG.removed | new | none | composer, inbox row, removed member's old messages | 05, 06, 07 CP-11, 14, 08 MSG-CP-25, 26 |
| S-MSG.deeplink | new | none | cold start, thread deleted, user removed, L3 | 05, 07 CP-20, 08 MSG-CP-44 to 46 |
| S-MSG.narrow | new | 04 §8 only | 720 to 1099, under 720, XXL, resize | 05, 06, 08 MSG-CP-47 |
| S-MSG.announcements, .announcement, .new-announcement | new (kept) | "keep today's" only | Ask-posted look, urgent chip, coach-only form | 05, 06, 07 CP-19, 08 MSG-CP-54 to 56 |
| S-MSG.prefill | new | none | own draft wins; how the composer reads each Ask `ChPrefill` field (`conversationId`, `poll`, `attachment`); gone conversation or not a member; missing board blob; rejected poll; reload; back | 05 field table; 06 4 rows; 07 M-MSG-CP-21; 08 MSG-CP-57, 61 to 69 |
| 11h pin sync | held PR | PIN-SYNC 1 to 12 | import order and silence, retry, offline queue, held state, two devices at the cap, load flash | PIN-SYNC completeness; 07 CP-18; 08 MSG-CP-39 to 43 |

## 2. Gaps filled

63 in the first pass, 69 with the prefill follow-up: 19 missing IDs with full 14-row matrices, 1 missing lane flag, 6 of today's bugs written as fixes behind the flag (M1 hidden search hits, M3 badge refetch, M4 silent signed URL expiry, H1 deleted unread, L2 Delete on the team channel, L3 empty desktop pane), 13 rows fixed in place (05: 8, 07: 1, 08: 4), 5 handoff receiving ends, 9 untested interrupt cases, 10 pin sync edge cases. Written as 43 element rows in 06, 21 motion rows (M-MSG-CP-01 to 21) in 07, and 69 criteria (MSG-CP-01 to 69) in 08 with PR owners. A follow-up from the lead added the Ask `ChPrefill` field rules (6 more gaps: destination, gone conversation, not a member, board chip, poll card, reload and back), so the total is 69.

## 3. Handoffs

| From | To | Trigger | Context carried | Back behaviour | Other flag off |
|---|---|---|---|---|---|
| Ask `create_announcement` | Messages, Announcements | Coach confirms; 8s Undo closes; players told | the announcement row (title, body, urgency); nothing marks it as from Ask | Ask's "Open" lands on the detail if `?announcement=<id>` exists, else the inbox; Back goes to the inbox | Ask off: nothing arrives. Messages off: it shows in today's Announcements as today |
| Practice plan publish | the bell, not Messages | Publish, after Undo | bell row `event_reminder`, `data.kind='practice_plan'`, link to the plan; optional plain team chat text | n/a in Messages | Practice off: nothing in Messages |
| Quick chat "Send to N" | Messages thread | after the 8s server hold (HM1) | a normal message from the coach | S-OPEN lands on `?conversation=<id>`; Back to the inbox | Quick chat off: nothing |
| Ask f_board, f_poll; Read "Message this player"; Day card Nudge | Messages composer | `?player=` or `?prefill=<key>` | `ChPrefill`: `draft`, `players`, `title`, and from AK11c `conversationId` (destination, wins over players), `poll` (filled poll composer opens by itself), `attachment {kind:'board', pngKey}` (photo chip "Board.png"). Gone conversation or not a member: the one player's DM if `players` has exactly one, else CH-7015 over the inbox and the prefill dropped, never redirected to another group. Nothing sends until Send | Messages back key to the inbox; browser back to Ask | Works with the Messages flag on or off: AK11c builds the same reads in today's composer, and MSG-CP-69 runs the same e2e in both states |
| Roster profile "Message" | Messages DM | `?player=<id>` | the player only | Back to the inbox; system back to the roster | Today's |
| Home "Message coach" / "Message team" | Messages | `?user=`, `?conversation=` | person or conversation | Back to the inbox | Today's |

Contradictions found:
- Ask CP-K says the Messages back key returns to Ask with the receipt. `ChPrefill` carries no origin, so Messages can't tell; Messages keeps its back key going to the inbox and browser back returns to Ask. If Ask wants the back key, AK11c should add `returnTo: 'ask'` to `ChPrefill`, and the Messages thread's back key would honour it once (the Ask lane's call; Messages would add one criterion).
- Ask's receipt Open should write a fresh prefill each tap, because `takePrefill` reads the key once.
- Ask's announcement copy uses "Got it 0 of 7"; Messages keeps today's acknowledgement copy word for word (tested against source). The Ask lane should check the two match.
- Ask: its 06 says "draft_poll writes into golf_messages (kind poll)" while its 02 says polls are prefill only and Post calls `sendGolfPoll`. Messages assumes prefill only (nothing arrives before the coach presses Send). The Ask lane should settle it.
- Ask's "Open" for an announcement assumes a destination; Messages today has no `?announcement=` param. Either 11b adds it (my rule covers both) or Ask's Open goes to the inbox.
- Practice plan: the rich `kind 'practice'` card it mentions is not built in Messages; only the plain text post exists.
- MSG-TOAST-03 said no other toast exists in Messages, which today's error toasts already break; fixed in place.

## 4. Needs a shared-file change

BUILD_BRIEF, under "PR 11a to 11g. Messages", after the 11a bullet, add:
> - **Flag:** `golf_messages_redesign_v1` in `config/feature-flags.yml` (shape of `golf_clubhouse_ui`), default off everywhere, read in `src/clubhouse/routes/messages.tsx` with `isFlagEnabled` and passed as `redesign`. With it off, Messages renders exactly as main: new CSS is scoped under `[data-ch-ms-v2]`, new components mount only when on, and the delete steps in `messages/02-PLAN.md` wait for a cleanup PR after the flag is on in production. 11h reads it too.

BUILD_BRIEF, 11a bullet: change "a design fixture that reaches all 34 states" to "a design fixture that reaches all 34 drawn states and the completeness views in `messages/05-SCREENS.md` (pending, offline, upload, edited, deleted, divider, older, search, search-empty, who-reacted, confirm, add, removed)".

START_HERE, build order row 6: append "Flag `golf_messages_redesign_v1` (new, off)."

DECISIONS (if it lists lane flags): add `golf_messages_redesign_v1 | Messages | off | new in the completeness pass`.

## 5. Calls only Nick can make

- The flag name, if he wants Messages under an existing flag instead.
- Offline sends: today's rule kept (fail at once, retry by hand). The flip is an automatic queue on reconnect, which is new behaviour.
- Whether 11b adds `?announcement=<id>` for Ask's "Open" (my default: add it behind the Messages flag; without it Open lands on the inbox).

## 6. START_HERE and BUILD_BRIEF check

Every screen ID in 05, the 28 drawn and the 19 added, has a PR (11a to 11h). START_HERE row 6 and BUILD_BRIEF cover 11a to 11h. The only gaps are the flag and the 11a fixture wording (section 4). `capture/capture.mjs` has no app-only mode for not-drawn views; 11a should add one when it adds the fixture views (not edited here).
