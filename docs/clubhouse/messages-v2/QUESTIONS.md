# Messages v2: open questions for the owner

Nothing here blocks the build. Each question has the default the implementers use until the owner says otherwise. "HTML" means `design-refresh/messages/redesign/clubhouse-messages.html`. Items are numbered Q-nn; SPEC.md and MOTION.md cite them.

## Conflicts inside the design

| # | Question | Evidence | Default we build |
| --- | --- | --- | --- |
| Q-01 | Reaction badge colour. The "Reactions" chapter prose says "white with green glyphs, and turn solid green when one is yours". The later Part 2 CSS (owner rule 2026-10-08) and the code-map table say "the opposite colour of the bubble, yours ringed in champagne". | HTML lines 1142, 924-931, 3153 | The CSS: green badge on a paper (their) bubble, ivory badge on yours, own reaction gets the champagne ring (`--a-ring`) on a 4 px page halo. |
| Q-02 | Lift haptic. The motion table says "Haptic: medium impact". Nov 4 ruling 22 says `haptic('press')` (light) because medium is reserved for commits. | HTML MOT hold row "Lift"; SETTLED-4NOV.md ruling 22 | `haptic('press')`. |
| Q-03 | Failed-send copy. The HTML draws "Not delivered · Try again". Today's string is "Not sent" and a test pins today's strings (ruling 19). | HTML `rowHTML` (`.seen.fail`); SETTLED ruling 19 | Adopt the HTML copy and change that test on purpose in the same PR (a requirement change, not a weakened test). Owner can veto and keep "Not sent". |
| Q-04 | Spring count. The heading says "Six springs" and lists seven. `send`, `pop`, `lift` are already in `lib/motion.ts`; only `launch` (visualDuration 0.5, bounce 0.2) is new. Its bounce is past the 0.1 cap; the 31 Oct sign-off ("yeah as long as it's smooth") covered send, pop, lift only. | HTML `SP`; `src/clubhouse/lib/motion.ts` lines 70-80 | Add `launch` to `CH_SPRINGS` with the same sign-off note. Owner to confirm the 0.2 bounce. |
| Q-05 | Reduce Motion crossfade length. HTML and the design language say 120 ms. The shared app helper is `CH_FADE_MS` = 180 ms (ruling 25: "Messages calls the shared helper and does not define its own"). | HTML `anim()` (`duration: 120`); `lib/motion.ts` `CH_FADE_MS` | Use the shared helper (180 ms, linear). Do not change Clubhouse-wide timing for Messages. |
| Q-19 | Send choreography. The HTML flies a CLONE of the new bubble (`flyText`) and hides the real one until it lands. Nov 4 ruling 23 said move the REAL bubble because a copy blinks in motion-check cases 1, 2 and 11. | HTML `flyText`, `launchSend`; SETTLED ruling 23 | The HTML wins. Hard gate: MC-01, MC-02 and MC-11 (MOTION.md) must pass with no teleport or blink; if the clone fails them, fall back to moving the real bubble and tell the owner. |
| Q-21 | Header face size. Rendered bar uses a 36 px face; the anatomy figure labels the header coin 40. | HTML `.who .av` (36), `anatomy()` sizes | 36. |

## Not drawn in the HTML

| # | Question | Default |
| --- | --- | --- |
| Q-06 | Loading, error, offline and permission states. Only the inbox skeleton (`#loading`) and the failed send are drawn. | Keep today's patterns and copy (`Retry`, `CrhStateBlock`, thread skeleton, `MessagesNoTeam`). Invent no new copy. Every new surface still gets a skeleton that matches its loaded height. |
| Q-07 | Inbox search. Only the resting search well is drawn; no results state. | Typing filters conversations by name and lists message hits (today's `message-hits.tsx`) as rows in the Recent card; empty result says "No results for {query}" in the "Nothing here" style (MSG-108). |
| Q-08 | Polls: multi-select ("Choose any"), closed state, creating rights. The prototype's `vote()` is single-choice and the closed state is not drawn. | Per-poll `multi` flag: tap toggles in multi, switches in single; tapping your own single choice clears it. Closed polls keep today's "Final" label, options disabled, no See-votes change. Poll creation stays as today (coaches). |
| Q-09 | "Draft a reminder" text. The HTML hard-codes "Reminder: vote in the practice round poll by Sunday 8 PM." | `Reminder: vote in the "{question}" poll by {closes without 'Closes'}.` The Hasn't-voted card and the reminder are for the poll's author / coaches only (privacy, see DATA.md). |
| Q-10 | SUPERSEDED by Q-32. Where desktop becomes phone. The three-pane layout is drawn at 1280 x 800 only. | Keep today's `useChPhone` phone breakpoint; the three-pane threshold changes per Q-32. |
| Q-11 | Pin limit. Chapter: "The team channel is always pinned first, and you can pin up to two more people" and the row menu says "Pin up to 3". DATA.md Q1 proposes an ordinary pin that the client sorts first; the prototype's `rowmenu` route does remove a pin to get below 3, but it never removes the channel's. | One rule for everyone: 3 pins per user per team INCLUDING the team channel. The client always shows the channel first and offers no Unpin on it; it is stored as an ordinary pin (pre-pinned once) so the server limit of 3 stays unchanged. At 3, Pin is dimmed with "Pin up to 3". Needs `golf_conversation_pins` in production (DATA.md M5). |
| Q-12 | Group typing in an inbox row / pin bubblet. The HTML draws dots only. The Nov 4 note had "Maya and Owen are typing" / "Several people are typing". | Dots only, with an aria-label naming the typers ("Maya and Owen are typing", "Several people are typing"). |
| Q-13 | SUPERSEDED by Q-31. Mute toast strings. The prototype lower-cases the choice ("Muted until i turn it on"). Ruling 19 pins today's mute strings, but today's labels are "Mute 8 hours" / "Mute a week", not the HTML's "For 8 hours" / "For a week". | See Q-31. |
| Q-14 | The drawn fake iOS keyboard. | Not built (device simulation). Build only the behaviour in MSG-307 / MOT-KB-1 from the real keyboard events. |
| Q-22 | Phone details title. In the HTML "Details" is always visible on the green bar (no fade on scroll). | As drawn. |
| Q-23 | Opening a photo or file bubble (viewer, download, share). Not drawn. | Keep today's behaviour. |
| Q-24 | Who may "Add" people to a group, and "Show all {n}". | Coaches only, as today. |
| Q-25 | Suggested people in New message ("Players you haven't messaged"). Not specified for a player viewer. | Keep today's `NewMessagePane` audience rules (a coach sees players; a player sees coaches and teammates the rules allow). |
| Q-28 | Rollout. | No new flag. Messages v2 replaces Messages behind the existing `golf_clubhouse_ui` flag (Clubhouse is off in production). The retired `golf_messages_redesign_v1` stays retired. |

## Privacy (many players are minors); detail and recommendations in DATA.md

| # | Question | Default |
| --- | --- | --- |
| Q-15 | Who sees read receipts and per-reader times (Seen by, "Seen 8:15 AM", "Not seen yet / Hasn't opened this chat"). | Per-reader names and times visible to the SENDER in groups only when the sender is a coach; a player sender sees "Delivered" and the count only. DM receipts as today. Parents never see them. Final call after the DATA.md audit of what `seen-by.tsx` exposes today. |
| Q-16 | Non-anonymous poll voters (faces and the Votes sheet). | Team members see voters on team polls (the design); the Hasn't-voted list and reminder are coach-only; no voter data leaves the team. |
| Q-17 | Class status in a DM's details ("No classes today. Next: Monday 9:05 AM, Statistics"). | Shown to a coach viewing a player's DM only. Never to another player. |
| Q-18 | "Profile" quick action in DM details. | Coach viewer only (ruling 20): for a player it would link to a teammate's stats (SHARED-11). |

DATA.md has its own numbered questions (its Q1-Q10, e.g. private per-person state table, Captain tag, DM receipt toggle). Defaults agree on: no toggle in v2, no Captain chip, coach-only Hasn't voted, and the channel-counts-as-a-pin rule (Q-11 now matches DATA.md Q1).

## Raised by the code survey (GAP.md)

| # | Question | Evidence | Default we build |
| --- | --- | --- | --- |
| Q-26 | Push underlay. HTML: the list moves to -30% and dims to 0.9. Code and Nov 4 ruling M-MSG-01a: -24%, `CH_UNDERLAY_SHIFT`, shell-wide. | GAP Part A risk 5 | Keep 24% (it is shared by every pushed screen). Owner can approve 30% for all pages. |
| Q-27 | Desktop details column animation. HTML (MOT-DET-2) animates `grid-template-columns` on the smooth spring and calls it the one allowed layout animation. Repo gate `clubhouse/no-layout-motion` forbids it, and the Nov 7 shell-motion note says transform and opacity only. | GAP Part G risk 2 | Implement the HTML with a single owner-approved exception recorded in the css baseline. If the owner declines: slide the panel by transform and let the thread snap width. |
| Q-29 | Delete a message. HTML has no confirm and fades the row. Code has a confirm Modal (CH-7501) that quotes the message. | GAP Part C risk 4 | Keep the confirm, change the toast to "Deleted for everyone", replace the height collapse with the scale .92 fade. |
| Q-30 | Avatar colours. HTML draws a hue per person; `ui/Avatar.tsx` (75 importers) has the 5 Nov ruling "coins are the calm neutral". | GAP Part G risk 8 | Keep neutral coins; do not touch Avatar. |
| Q-31 | Mute labels and toasts. Today: rows "Mute 8 hours", "Mute a week", "Until I turn it on" and TWO toasts per mute. HTML: "For 8 hours", "For a week", "Until I turn it on", one toast "Muted for ...". Supersedes Q-13. | GAP Part D risk 7, Part C risk 13 | Adopt the HTML labels, one toast per action, update the pinned tests on purpose (they pin today's strings, ruling 19). Owner can veto. |
| Q-32 | Desktop breakpoint for three panes. The grid needs a canvas of 1101 px, which is a viewport of about 1349; the drawn 1280 viewport gives a 1032 px canvas and the legacy floating panel. | GAP Part D risk 4 | Lower the threshold so 1280 gets rail 320 + thread + details 300 (needs about 1040). Replaces Q-10. |
| Q-33 | Serial sends. `!sending` blocks a second text send until the first resolves; MC-01 needs two sends 140 ms apart. | GAP Part B risk 3 | Relax the gate for plain text (optimistic ids make it safe); keep it for attachment recovery states. |
| Q-34 | Poll leader chip. Code marks the leader only once final (D5); HTML shows "Most votes" on a sole leader at any time. | GAP Part D risk 8 | HTML. |
| Q-35 | Captain chip in members. No data source exists (`details-v2.tsx:184`). | DATA.md Q5 | Do not draw it. |
| Q-36 | A coach sees a Seen-by row on others' messages in a group; the HTML shows it on yours only. | GAP Part C risk 10 | Keep (coach tooling). |
| Q-37 | Announcements sit inside the inbox on both layouts (D-44). The HTML has none. | GAP Part A risk 10 | Keep, restyled to the new card and row styles. |
| Q-38 | Phone row swipe (Read/Unread, Delete) and the VoiceOver Actions button. The HTML draws neither. | GAP Part A risk 9 | Keep. |
| Q-39 | A pinned tile has no menu, so once pinned people leave Recent they cannot be unpinned on the phone. Not drawn. | GAP Part A risk 3 | Long-press on a pin opens the same row menu (Unpin, Mark as unread, Mute..., Delete). |
| Q-40 | Class-awareness lines (thread header status, group line above the composer; P-10) are not in the HTML. | GAP Part D risk 9 | Keep, restyled; leave room for `GroupClassLine` above the composer pill. |
| Q-41 | Photo height. Photos are sized only after an async signed URL (thread grows 122 px), against the full-height-at-first-frame rule. | GAP Part D risk 1 | Carry kind, width, height in the message list payload and reserve the frame. |
| Q-42 | Reduce Transparency and Increase Contrast do not cover `--ch-glass`/`--ch-glass-strong`, which Messages uses. | GAP Part G risk 4 | Add both tokens to those blocks (opaque fills). |
| Q-43 | Release state. CLAUDE.md says Clubhouse is off in production; `config/feature-flags.yml` has `golf_clubhouse_ui` production: true. | GAP Part G | Verify with `npm run release:status` before any "live" claim. |
| Q-44 | DM "Seen 8:15 AM" prints the message's sent time today, not the reader's. Showing the reader's time needs the counterpart's `last_read_at` in the thread payload. | GAP Part B risk 10; DATA.md section 4 | Show the real time to a coach; "Seen" without a time for player-to-player. |
| Q-45 | Group unread in the conversation RPC counts one shared `read` flag per message; the badge uses per-user `last_read_at`. | DATA.md section 0 item 3 | Derive the inbox count from per-user `last_read_at` (client already does). |
| Q-46 | Security hardening ships with this work. DATA.md section 3 found grants that probably let a user re-point their own participant row to any conversation, rewrite `created_by`, and edit message `conversation_id`; the conversation RPC returns co-participant emails; typing is on a public topic. Read-only audit, not exploited. | DATA.md sections 0 and 3 | Ship migrations M1-M4 first, reproduced in a rolled-back transaction on the local Docker stack, applied by the Production rollout thread. |
