# Fix packet 03 · craft-and-system

14 findings, 3 block the flag flip.

## F-0009 · S1 · blocks-flip · P010
**The first click on a Team Hub row's More menu does nothing**

- Observed: 3 of 3 times, ~8 s after load and idle, the first click opened nothing 600 ms later; the second opened it (also W-018). S1 not S0: works on retry.
- Expected: Opens on the first click (Linear row menus).
- Fix: Check whether the first pointerdown is consumed by an outside-click or focus handler on the Menu (opened and closed in one tick).
- Files: src/clubhouse/ui/Menu.tsx, src/clubhouse/screens/team-hub/*
- Evidence: ev/P010/write-c-task-more.png, writes.jsonl#W-018
- Acceptance: rerun the instrument named in the evidence; it must pass (CO-02).

## F-0024 · S2 · after · P016
**Compare tags and a Team Hub caption are 11 px on the phone**

- Observed: span.ch-tour-cmp-tag / .is-b 11 px (P016 compare); em 11 px (P010 Team Hub).
- Expected: >= 12 px (CR-03).
- Fix: Move .ch-tour-cmp-tag and the Team Hub em to the 12 px step.
- Files: src/clubhouse/styles/hub.css
- Evidence: ev/P016/tournaments-compare-pro-light.png, ev/P010/team-hub-pro-light.png, p2p3-lean/lean-coach/drafts.jsonl
- Acceptance: rerun the instrument named in the evidence; it must pass (CR-03 phone text never under 12 px).

## F-0025 · S2 · after · P001
**A mistyped address says the page 'hasn't been rebuilt yet' instead of 'We couldn't find that'**

- Observed: /golf/dashboard/audit-unknown-path-p1 (coach) and /golf/dashboard/zz-audit-unknown-path (player) render NotRebuilt.
- Expected: NotFound for any path not in the route list (04 §A).
- Fix: In src/clubhouse/routes/alias.ts fall through to NotFound when the segment matches neither a Clubhouse route nor a known legacy route.
- Files: src/clubhouse/routes/alias.ts, src/clubhouse/shell/NotRebuilt.tsx
- Evidence: ev/p1/coach/audit-unknown-path-p1-pro.png, ev/p1/player/zz-audit-unknown-path-pro.png
- Acceptance: rerun the instrument named in the evidence; it must pass (CO-04).

## F-0026 · S2 · blocks-flip · P002
**A quick double tap pushes the same page two or three times, so Back has to be pressed again**

- Observed: Single press 1 navigation; fast double: Home 'Message' and 'Plan' 3, Stats 'Season', 'Qualifiers', 'Message Tyler' 2; 'Weekly Practice' duplicate layers. No duplicate writes; one Home read action fired twice.
- Expected: One navigation per intent (UIKit ignores taps during a push).
- Fix: Ignore a push to the same href while one is pending; use replace for window segment changes.
- Files: src/clubhouse/shell/*, src/clubhouse/ui/press.ts
- Evidence: p2p3-lean/lean-coach/press/P002.jsonl, p2p3-lean/lean-coach/press/P004.jsonl
- Acceptance: rerun the instrument named in the evidence; it must pass (CO-02 no duplicate action on double-tap).

## F-0050 · S3 · after · P005
**Stats chart labels are 11 px on the phone**

- Observed: text.ch-sv-rt__t 11 px ('70', '80', 'Jun 9', '↑ Lower is better', 'Zero is the Tour') on 5 player stats tabs; text.ch-line__t 11 px on coach stats.
- Expected: >= 12 px (CR-03); Apple Health axis labels read at caption size with Dynamic Type.
- Fix: Set .ch-sv-rt__t and .ch-line__t to the 12 px step token.
- Files: src/clubhouse/styles
- Evidence: ev/stats/stats-pro-light.png, ev/stats/stats~tab=dev-pro-light.png, p2p3-lean/lean-player/drafts.jsonl
- Acceptance: rerun the instrument named in the evidence; it must pass (CR-03 phone text never under 12 px).

## F-0053 · S3 · after · P006
**Calendar calls the same view 'List' on the phone and 'Agenda' on desktop, and the phone has no Week**

- Observed: Phone: Day / Month / List (ev/P006/calendar__view-month-pro-dark.png). Desktop: Day / Week / Month / Agenda (ev/calendar/calendar~event=…-mba15-light.png).
- Expected: One noun per view on both surfaces (SY-05); Apple Calendar iOS uses List on both.
- Fix: Pick one label (List) for ?view=agenda/list on both surfaces.
- Files: src/clubhouse/screens/calendar
- Evidence: ev/P006/calendar__view-month-pro-dark.png, ev/calendar/calendar~event=0e27cb7b-b5fa-4bdc-9f39-2c37ec31ddf9-mba15-light.png, p6-motion/lean-motion/DONE.md
- Acceptance: rerun the instrument named in the evidence; it must pass (SY-05 terminology; SY-04 parity).

## F-0054 · S3 · after · P016
**The pushed New event page shows its title twice at rest: in the bar and as the large title**

- Observed: Bar: '< Tournaments   New event'; page: eyebrow 'Tournaments' + large title 'New event' (ev/P016/tournaments-new-pro-light.png).
- Expected: Large title at rest, small bar title only after the large title scrolls under the bar (iOS navigation bar).
- Fix: Hide the bar title until the large title's IntersectionObserver reports it under the bar (the shell's large-title collapse), and drop the repeated eyebrow.
- Files: src/clubhouse/shell
- Evidence: ev/P016/tournaments-new-pro-light.png
- Acceptance: rerun the instrument named in the evidence; it must pass (SY-03 iOS conventions (large title)).

## F-0057 · S3 · after · P006
**Double-clicking a calendar event or day fires its reads twice and adds a navigation**

- Observed: Event: duplicate non-GETs on double; month day: 2 navs single, 3 double. Reads only.
- Expected: One open (Calendar for Mac).
- Fix: Treat dblclick as one open; dedupe the inspector fetch per event id.
- Files: src/clubhouse/screens/calendar/*
- Evidence: p2p3-lean/lean-coach/press/P006.jsonl
- Acceptance: rerun the instrument named in the evidence; it must pass (CO-02).

## F-0066 · S3 · after · P001
**Coach-only addresses silently show the player's own view and keep the coach parameters**

- Observed: 33 routes stay put with coach params and show the player's own data; no leak.
- Expected: Redirect to the clean URL or a one-line notice.
- Fix: router.replace stripping coach-only params on role mismatch.
- Files: src/clubhouse/routes/alias.ts
- Evidence: p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0046
- Acceptance: rerun the instrument named in the evidence; it must pass (CO-05).

## F-0067 · S3 · blocks-flip · P005
**The player hero mixes windows, and the 'better than previous 10' figure mirrors the SG value**

- Observed: Tyler Hayes, Last 10: 'SG / round −3.3' with '↗ +3.3 Better than previous 10' and 'What changed: +3.3 …', beside 'Rounds 2 · This season' and tab 'Rounds 10'. Equal size, opposite sign suggests a delta against an empty window. Investigate.
- Expected: Change only when the previous window has data; each figure labelled with its window (Apple Health).
- Fix: Null the change when the previous window is below the minimum; label the Rounds figure's window.
- Files: src/clubhouse/screens/stats/*
- Evidence: ev/P004/stats__player-faced578-mba15-light.png
- Acceptance: rerun the instrument named in the evidence; it must pass (CO-03).

## F-0069 · S3 · after · P013
**Some headings and labels are cut off with no ellipsis**

- Observed: Qualifier steps label, CoachHelm player-list heading, Ask composer label, 4 dt labels (CoachHelm/Stats desktop). S3: not screenshot-verified; scan also flags sr-only text.
- Expected: Ellipsis and a way to read it.
- Fix: text-overflow: ellipsis on single-line labels; let headings wrap.
- Files: n/a
- Evidence: ev/P009/qualifiers-86dad12b-selection-pro-light.png, ev/P013/coachhelm-pro-light.png
- Acceptance: rerun the instrument named in the evidence; it must pass (CN-03).

## F-0070 · S3 · after · P013
**One CoachHelm card says the same putting figure three ways**

- Observed: '35% vs PGA Tour make % avg 62.2', then '(95% range 23–48%) (PGA Tour ~62%)', then a 35% / 62.2% table; 'Owen' twice in one sentence.
- Expected: Number once, one comparison, one range (Claude iOS answer cards).
- Fix: 'Owen makes 35 % from 5–10 ft over 14 rounds (likely 23–48 %). Tour players make 62 %.'
- Files: src/clubhouse/screens/coachhelm/*
- Evidence: ev/P013/coachhelm-pro-light.png
- Acceptance: rerun the instrument named in the evidence; it must pass (CN-02 / CN-04).

## F-0073 · S4 · after · P001
**Avatar initials are sized off the type scale**

- Observed: span.ch-avatar at 9.24 px (desktop stats), 13.6 px (Messages, Roster), 16.32 px (Stats hero).
- Expected: Initials on the nearest step (11/13/17) per avatar size (CR-02).
- Fix: Map avatar sizes to step tokens in ui/Avatar instead of size × 0.34.
- Files: src/clubhouse/ui
- Evidence: ev/stats/stats-pro-light.png, p2p3-lean/lean-player/drafts.jsonl, p2p3-lean/lean-coach/drafts.jsonl
- Acceptance: rerun the instrument named in the evidence; it must pass (CR-02 type on the 11 steps).

## F-0074 · S4 · after · P002
**'From your coach' summary wraps with a separator dot stranded at the end of the line**

- Observed: '5 replies · 1 to acknowledge ·' / '4 tasks due' (ev/t2/player-home-dark.png).
- Expected: Items wrap whole with their separator (no line-final dot).
- Fix: Wrap each 'n thing' with its leading separator in a white-space: nowrap span.
- Files: src/clubhouse/screens/home
- Evidence: ev/t2/player-home-dark.png
- Acceptance: rerun the instrument named in the evidence; it must pass (CR-06 rhythm / CR-13).
