# Fix packet 04 · messages

9 findings, 3 block the flag flip.

## F-0003 · S0 · blocks-flip · P007
**A player's private message to Coach is posted to the whole Team Channel**

- Observed: New message, To: Coach only, Send: bubble in 25 ms, then the message sat in the 6-member Team Channel. Undone (W-023 to W-025).
- Expected: A one-to-one thread with the coach (iMessage, Slack DM).
- Fix: The direct-conversation resolver returns the existing conversation whose members include both users (the Team Channel). Match on an exact member set and kind=direct; create one when none matches.
- Files: src/clubhouse/screens/messages/*
- Evidence: ev/P007/write-p-dm-typed.png, writes.jsonl#W-013, writes.jsonl#W-024
- Acceptance: rerun the instrument named in the evidence; it must pass (CO-01).

## F-0004 · S0 · blocks-flip · P007
**Start conversation with one player closes the sheet and opens nothing**

- Observed: Spinner over 1.8 s, two server actions, sheet closes, no thread opens or lists. Twice. ?player= deep link also falls back to the Team Channel.
- Expected: The new DM opens with the composer focused (Slack desktop).
- Fix: Same resolver as F-a11y-006 (likely one root cause): return and route to the new conversation id; keep the sheet open with an inline error on failure.
- Files: src/clubhouse/screens/messages/*
- Evidence: ev/P007/write-dm-pick.png, writes.jsonl#W-009
- Acceptance: rerun the instrument named in the evidence; it must pass (CO-02 no dead control).

## F-0014 · S1 · blocks-flip · P007
**The Messages list stays a skeleton for 14 s on a cold open**

- Observed: Content complete 14232 ms median (14297 worst), 3 runs; LCP 3.7 s lands on the title. Some may be preview-toolbar bandwidth.
- Expected: Threads within 2.5 s cold (iMessage shows cached threads at once).
- Fix: Paint the conversation list from its first page before hydrating the auto-opened Team Channel thread.
- Files: src/clubhouse/screens/messages/Messages.tsx
- Evidence: p7-perf/lean-speed/summary.json, p7-perf/lean-speed/DONE.md
- Acceptance: rerun the instrument named in the evidence; it must pass (SP / ST-05).

## F-0045 · S2 · after · P011
**Discarding a round takes 3 s, assigning a task 1.8 s, starting a DM 1.8 s**

- Observed: W-015 Discard round: 3070 ms from confirm to Rounds, no toast (player phone). W-006 Assign task: 1820 ms to toast (coach desktop). W-004 announcement ≤ 2.2 s (coach desktop). W-009 Start conversation: spinner > 1.8 s (coach desktop). Optimistic writes elsewhere are 6-43 ms (W-005, W-010, W-013, W-023).
- Expected: Visible result ≤ 150 ms (optimistic), like the edit and ack paths already do.
- Fix: Make discard, task assign and announcement post optimistic (navigate or insert first, reconcile after), as announcement edit already is.
- Files: n/a
- Evidence: writes.jsonl#W-015, writes.jsonl#W-006, writes.jsonl#W-004, writes.jsonl#W-009
- Acceptance: rerun the instrument named in the evidence; it must pass (SP write -> confirmed > 500 ms D/F; 01 §3 cap: any interaction over 500 ms).

## F-0047 · S3 · after · P006
**The Calendar now-pill pulse repaints on the main thread every frame**

- Observed: ≈100 of ≈200 frames per 2 s PRESENTED_PARTIAL with has_main_animation from span.ch-now-pill (box-shadow keyframes, styles/calendar.css:3108).
- Expected: Idle loops on transform/opacity only (MS-4, MO-02).
- Fix: styles/calendar.css:3108: pulse a pseudo-element ring's opacity/transform instead of box-shadow.
- Files: src/clubhouse/styles/calendar.css
- Evidence: ev/motion/MOT-67/C2-calendar-idle-strip-trace.json, p6-motion/lean-motion/trace-smoothness.json
- Acceptance: rerun the instrument named in the evidence; it must pass (MO-02 / MS-4 Idle loops compositor-only).

## F-0048 · S3 · after · P007
**The conversation 'Actions for…' button on phone can't be tapped**

- Observed: Playwright WebKit tap timed out on 'Actions for Demo University Golf — Team Channel' in both press passes (coach and player); desktop click works.
- Expected: Every visible control takes a tap; hidden swipe actions are not in the tap order.
- Fix: Check whether the button is covered by the row's swipe layer or sits off-screen behind it; if it is a swipe action, give it aria-hidden until revealed and add a long-press menu path.
- Files: src/clubhouse/screens/messages/MessagesView.tsx
- Evidence: p2p3-lean/lean-coach/press/P007.jsonl, p2p3-lean/lean-player/rows/messages.jsonl, p2p3-lean/lean-coach/DONE.md
- Acceptance: rerun the instrument named in the evidence; it must pass (TO-01 / CO-02 every control reachable).

## F-0051 · S3 · after · P007
**The Announcements card on Messages pokes about 3 pt outside the page edge**

- Observed: Card left edge ~13 pt, everything else 16 pt (ev/t2/player-messages-light.png); scan().edge 3.
- Expected: Cards align to --ch-page-x-phone (16 pt).
- Fix: Drop the negative inline margin on the announcements digest card so it uses the page padding.
- Files: src/clubhouse/screens/messages
- Evidence: ev/t2/player-messages-light.png, p8-sim/rows.jsonl
- Acceptance: rerun the instrument named in the evidence; it must pass (CR-01 phone page edge 16 px).

## F-0052 · S3 · after · P007
**A conversation's last-message preview breaks into a three-line stack ('Coach:' / poll icon / 'staging check')**

- Observed: Team Channel row shows 'Coach:' on one line, the poll glyph alone on the next, the text on a third; row height ~2.5x the Announcements row.
- Expected: One or two lines, sender, glyph and text inline, ellipsis at the end (iMessage, Slack iOS).
- Fix: Render the preview as one inline run (sender, 13 px glyph, text) with -webkit-line-clamp: 2.
- Files: src/clubhouse/screens/messages/MessagesView.tsx
- Evidence: ev/t2/player-messages-light.png
- Acceptance: rerun the instrument named in the evidence; it must pass (CR-13 handcrafted, not basic; CN-03 truncation).

## F-0071 · S4 · after · P007
**Opening a conversation or an event sheet ticks a selection haptic**

- Observed: Inbox row -> thread: one select tick; Calendar event -> sheet: one select tick; round push: none.
- Expected: Zero haptics on plain navigation; select is for a selection change (D-70).
- Fix: Log it in 01 §6 as an owner choice, or drop haptic("select") at screens/messages/MessagesView.tsx:433 and screens/calendar/CalendarPhone.tsx:495.
- Files: src/clubhouse/screens/messages/MessagesView.tsx, src/clubhouse/screens/calendar/CalendarPhone.tsx
- Evidence: p6-motion/lean-motion/rows/MOT-30.jsonl, p6-motion/lean-motion/rows/MOT-21.jsonl
- Acceptance: rerun the instrument named in the evidence; it must pass (MO-14 Haptics: none on plain navigation).
