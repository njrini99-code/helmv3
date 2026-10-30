# Fix packet 06 · dates-and-times

6 findings, 3 block the flag flip.

## F-0001 · S0 · blocks-flip · P001
**The bell tells the player an event starts at 2:00 PM when it starts at 10:00 AM Eastern**

- Observed: After W-026 moved the hand-test event to Sat 31 Oct 10:00 AM-12:00 PM ET, the event sheet read 10:00 AM-12:00 PM Eastern, but the bell's 'Event updated' line read 2:00 PM (the UTC hour). Raised from the draft's S1: a wrong time shown as right.
- Expected: Every time in the bell renders in the viewer's zone through the same formatter the event sheet uses (Apple Calendar notifications always show local time).
- Fix: Store the start as an ISO instant in the notification payload and format it client-side with the lib/format.ts time helper in the viewer's zone, as the event sheet does.
- Files: src/clubhouse/shell/Bell*.tsx, lib/format.ts
- Evidence: ev/P006/write-ht-player-pro.png, p2p3-lean/lean-coach/drafts.jsonl#D-lean-coach-0205, writes.jsonl#W-026
- Acceptance: rerun the instrument named in the evidence; it must pass (CO-08 Dates and times right in the user's zone).

## F-0002 · S0 · blocks-flip · P003
**Roster and Team Hub still call this the 2025-26 season**

- Observed: 29 Oct 2026: Roster 'Demo University Golf · 2025-26', Team Hub 'Demo University Golf · 2025-2…'; Tournaments 'This season · 2026–27'; Rounds 'Since August 1'. Hyphen on Roster, en dash on Tournaments.
- Expected: 2026–27 everywhere after 1 August 2026, en dash.
- Fix: Have both headers call the 1 August season helper Tournaments and Rounds use; format with an en dash.
- Files: src/clubhouse/screens/roster/*, src/clubhouse/screens/team-hub/*
- Evidence: p0-calibrate/ev/preview2-coach/roster.png, p0-calibrate/ev/preview2-coach/tournaments.png, ev/P003/roster__invite-1-mba15-light.png, ev/P010/team-hub__tab-ann-compose-1-mba15-light.png
- Acceptance: rerun the instrument named in the evidence; it must pass (CO-08 seasons turn over on 1 August [Nick]).

## F-0010 · S1 · blocks-flip · P006
**Editing only an event's place marks it 'moved', and a different event shows 'Was 9:00 AM'**

- Observed: Only AUDIT practice's location was edited (W-003); its chip read 'moved' and the never-edited hand-test chip showed 'Was 9:00 AM'. Raised from S2: players read this chip to decide when to show up.
- Expected: 'Moved' only when start or end changes, on that event.
- Fix: Compute 'moved' from a start/end diff; key the 'was' annotation by event id.
- Files: src/clubhouse/screens/calendar/*
- Evidence: ev/P006/write-c-ev-more.png, writes.jsonl#W-003
- Acceptance: rerun the instrument named in the evidence; it must pass (CO-01; CO-08).

## F-0038 · S2 · after · P002
**The struck-through 'was 10:00 AM' on a moved practice reads at 3.4:1**

- Observed: s.ch-was 13 px 3.4:1 (Lc 53); dark Lc 36.3.
- Expected: ≥ 4.5:1: the old time is information.
- Fix: Meta ink for .ch-was, keep the strike.
- Files: n/a
- Evidence: p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0022
- Acceptance: rerun the instrument named in the evidence; it must pass (CT-03).

## F-0059 · S3 · after · P001
**The bell, + and compose buttons are missing from loading skeletons and pop in**

- Observed: Home, Rounds, Stats, Calendar, Messages loading states show only the title menu.
- Expected: Top bar stable across skeleton and content.
- Fix: Keep the bell and route action slot in the frame top bar during the route skeleton (shell/ClubhouseFrame.tsx).
- Files: src/clubhouse/shell/ClubhouseFrame.tsx
- Evidence: ev/states/home-loading.png, ev/states/home-default.png, ev/states/stats-loading.png
- Acceptance: rerun the instrument named in the evidence; it must pass (ST-01).

## F-0068 · S3 · after · P009
**A qualifier under the 'Active' heading is labelled 'Ended'**

- Observed: 'Active' section (filter 'Active 1') holds 'Fall Invitational Qualifier' badged 'Ended · 5 rounds outstanding'; the player's setup still offers it as 'Open qualifier · Round 3 of 3 · Play'.
- Expected: One state word ('Waiting on 5 rounds').
- Fix: Rename the ended-with-outstanding badge, or give it its own group.
- Files: src/clubhouse/screens/qualifiers/*
- Evidence: ev/P009/qualifiers-pro-light.png, ev/rounds/rounds_new-mba15-light.png
- Acceptance: rerun the instrument named in the evidence; it must pass (SY-05 one noun per state).
