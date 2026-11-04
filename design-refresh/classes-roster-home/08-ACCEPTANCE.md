# Acceptance: Classes, Roster, coach Home
> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 74 criteria, CP-1 to CP-74, and their per-PR mapping).
> Wiring, 4 Nov 2026: see the section of that name at the end of this file.
Design page: https://claude.ai/artifact/QnVN3x63a79TM8geunzccU (v6) · Package: design-refresh/classes-roster-home/ · Status: Ready to build

Local page: `classes-roster-home/redesign/clubhouse-phone-redesign.html` (CSS `redesign/redesign.css`). Screen inventory and state matrices: `classes-roster-home.05-SCREENS.md` in this folder. Sources in brackets: 04 = 04-FIDELITY-SPEC, 03 = 03-DATA-CHECKS, 02 = 02-PLAN, 01 = 01-BRIEFS, DL = DESIGN_LANGUAGE, v6 = the design page. "(computed)" = WCAG ratio worked from the token hex values, not printed in the package.

Shared criteria are referenced, not restated. Numbering is SHARED-1 to SHARED-12 as in `00-shared/ACCEPTANCE-SHARED.md`.

Nick's calls applied (31 Oct, 04 §8 and 03 "Settled"): practice rounds stay out of every scoring average, the leaders and the top five (they still list in Latest rounds); no Captain tag; "Injured" chip with no date; injured players count as active ("7 active · 1 injured"); Classes shows no finals, holidays or next week's travel, term line "6 weeks left · term ends Dec 15"; Home hero-mode bar is `--ch-frame` so bar and hero are one green; desktop "Needs a look" strip (`.ch-rs-attn`) removed.

Text sizes are at Text Size Default and scale as `calc(N * var(--ch-type-k))`; "x k" marks a box that scales too. XXL is `--ch-type-k` 1.36.

## Screen IDs

Full table with kinds, routes, roles and PRs is in `classes-roster-home.05-SCREENS.md`. IDs: S-CLASSES, S-CLASSES.add-menu, S-CLASSES.add-sheet, S-CLASSES.import-sheet, S-CLASSES.class-sheet, S-CLASSES.overlaps, S-CLASSES.noteam, S-CLASSES.desktop; S-ROSTER, S-ROSTER.player, S-ROSTER.invite, S-ROSTER.requests, S-ROSTER.profile, S-ROSTER.profile-actions, S-ROSTER.injured, S-ROSTER.desktop, S-ROSTER.peek; S-HOME, S-HOME.round-sheet, S-HOME.strip, S-HOME.desktop.

## Part 1. Shared parts (used by every screen in this lane)

### Year coins and label (PR 7) [02 §2.2–2.4, 03 §4, DL]
1. `Avatar` takes an opt-in `year` prop and sets `data-year` = `sr|jr|so|fr`. Fills: `--ch-yr-sr` #1F6B45 / #2A7A51, `--ch-yr-jr` #3D6787 / #46739A, `--ch-yr-so` #86672C / #8F6E31, `--ch-yr-fr` #9A4A35 / #A3533E (light / dark), white initials.
2. Coaches, unknown years and past or far grad years keep the neutral coin: `--ch-coin-bg` #E9E3D3 / #2A2E27, ink #5A4E36 / #DCD3BC.
3. `classYearKey(gradYear, now, tz)` returns `sr|jr|so|fr|null`; the season turns over on 1 August (grad 2027 = Senior for 2026–27).
4. `classYearLabel` returns null outside the four years: no "Class of 2026" for a past year and none invented.
5. `classYearLine` returns "Junior · Class of 2028", or "Class of 2031" once, or null. The string "Class of X · Class of X" appears nowhere (profile, peek, requests sheet, request meta).
6. Coin 32 x min(k, 1.2), initials 650 12; other sizes 26, 40, 76. Inactive coins carry `data-dim`.
7. White on year fills (DL): light Sr 6.5, Jr 6.0, So 5.3, Fr 6.2; dark Sr 5.3, Jr 5.0, So 4.7. Dark So fill is darkened so white reads at least 4.9:1 (design lead call; new hex in 06). Every year coin passes 4.9:1 in both themes (SHARED-4).

### Bar, large title, sticky controls [04 §3–4, 02 §2.7–2.8]
8. Bar 98pt with a 16 lip (SHARED-1). Bar shade (14pt) fades in over 180ms linear once content passes 8px under it. Champagne dot 7x7 #E2C98F. Bell badge is a 19pt pill.
9. Large title 600 34/1.2, `wdth` 88, sits 116 from the top with 16 below; context line 400 15/1.33 under it.
10. Over the first 56px of scroll the large title scales to 86% and fades to 10%, origin left, scroll-linked and linear. Under Reduce Motion it only fades. Nothing moves into the bar.
11. Pushed bar columns 120 / 1fr / 120; back label in champagne.
12. Sticky controls (`.ctlbar`) stick at top 98 with the page colour behind them, no blur.
13. Segmented: buttons 32 tall, chip radius 12, track radius 16, padding 4, gap 4. No "Sort by" text node.

### Cards, rows, states [04 §3–5]
14. Cards radius 16, header padding 14 16 12, note padding 12 16 14; sections 24 apart (12 when tight). Flat page and no left accent borders (SHARED-2, SHARED-3).
15. Rows padding 10 16, min height 52, or 64 with a coin. Hairlines 0.66px, inset 16, or 60 after a coin.
16. Every touch target is at least 44x44, including capsules drawn at 34.
17. Skeleton bars: `--ch-separator`, radius 6, 1.6s opacity pulse to 55%, static under Reduce Motion. Green feature cards load as a green block with 16% ivory bars. No spinner, no shimmer sweep.
18. Empty and failed blocks sit inside the card, centred: 44 icon circle (accent tint; amber for failed), title 600 16/1.3, body 400 14/1.45 max 34ch, buttons. Failed copy always says nothing was lost and offers Try again.
19. Contrast (computed): `--ch-warn-ink` on `--ch-warn-bg` over the card 6.75 / 8.42; hero ink at 72% on `--ch-frame` 7.11 / 8.83; Classes mist ink on its tint (dark) 8.86.

## Part 2. Criteria per screen

### S-CLASSES [04 §4–6, 03 §6, 02 §3]
20. Large title "Classes", context "Fall 2026 · Aug 20 – Dec 15". The bar's right action is + with aria-label "Add or import a class". The "Your classes" heading is absent on phone.
21. Term card (`.term`): `--ch-frame` fill, radius 16, padding 18 16 16, gap 16. Week well 66x66, radius 18, reading "11 of 17".
22. Term head reads "Week 11" with "6 weeks left · term ends Dec 15". No finals, holiday or next-week travel text or marks anywhere on the screen.
23. Overlap chip: fill `rgb(231 174 87 / .18)`, text #F6D69E (7.09:1 on the chip over the frame, computed), reads "1 overlap". Absent when there are no conflicts this week.
24. Credits bar 10 high, gaps 3, one segment per class with flex = credits; label "6 classes / 15 credits".
25. Term line shows a Today marker and no finals marks. "Soon" is two columns and lists only this week's team events and the term end.
26. Today card: weekday on the right ("Saturday"). Time column 58 x k wide, one `ch-num` node, never wraps. The team practice row is green. Two rows with the same code (or name) and start render once.
27. No classes today: "No classes today" with a second line "Next: Monday, Nov 2" and a day ribbon 28 high, radius 8, spanning 7 AM to 5 PM.
28. Overlaps card: amber chip "1 this week", bus icon, footer "Your coach sees this overlap too." Rows come from this week's conflicts only.
29. Binders: tone fill, ring `--ch-cl-tb`, radius 16, padding 16 16 14, gap 12. Week strip 5 columns, gap 5, today ringed. Room in a dashed footer. Travel flag when a team event clashes.
30. Status card: switch labelled "Share class status with coaches" (today's label and write) with "What your coach sees" under it.
31. "Delete all classes" renders as a danger row at the end.
32. Dark: binder and board tones are the app's own dark tones, not the mock's (04 §8).
33. Loading, empty and failed copy and buttons as in 05-SCREENS; empty offers Import schedule and Add a class.
34. Long names: binder class names wrap to 2 lines then ellipsis.

### S-CLASSES.add-menu
35. Tapping + opens a menu with exactly two rows, Add class and Import schedule, each opening today's sheet. Dismiss by tapping outside or Escape.

### S-CLASSES.class-sheet
36. Sheet height 90% of the viewport, top radius 20, grabber 36x5, ✕ button (44 hit area).
37. Facts in order: Meets, Time, Room, Credits. A "This week" card follows, with a Travel chip only when a team event clashes. Buttons: Remove, Edit class (today's actions).
38. Closes on ✕, on a tap on the dimmed page, and on swipe down.

### S-CLASSES.overlaps
39. Tapping the term card's overlap chip smooth-scrolls to the Overlaps card; under Reduce Motion it jumps.

### S-CLASSES.desktop
40. Desktop keeps Section and the side layout; `.ch-cl-h h1` is still present; phone and desktop show the same facts (`classes-parity`).

### S-ROSTER (coach) [04 §4–6, 03 §1–5, 02 §4]
41. Large title "Roster"; context line is the team name (no "Varsity"). Bar action is a user-plus labelled "Invite players".
42. Team card (`.rhero`): `--ch-frame` fill, radius 16, padding 16 16 14; title "2026–27 season"; total "N players".
43. Counts line reads "N active · N injured · N waiting". Injured players are counted inside active. "waiting" is coach only.
44. Mix bar 12 high, gaps 3, one segment per year in year colours; legend with singular and plural ("1 Senior", "4 Juniors").
45. Top-five footer: five coins at 30 and "76.2 avg" format. Renders only when 5 players each have 3+ non-practice rounds; otherwise absent from the DOM.
46. Leaders row (`.ldrs`): horizontal scroll, `scroll-snap-type: x mandatory`; card width min(62%, 220); fill = year colour at 11%, ring at 24%; bleeds to the screen edge.
47. Leader cards: "Low average" (trophy), "On a heater" (last 3), "Needs a look" (SG / rd in the loss colour). Only players with 3+ non-practice rounds count. The row is absent when none qualify; "Needs a look" is absent when no row has the attention note.
48. Join requests row: coin stack, names, badge, chevron. Absent with no requests.
49. Sort in the sticky bar: Avg / SG / Name. Rows reorder by FLIP over 360ms `cubic-bezier(.22,1,.36,1)`; chip slides 360ms `cubic-bezier(.34,1.3,.64,1)`; both instant under Reduce Motion.
50. Active card titled "N players". Rows 64 tall, hairline inset 60. Note line shows class status, the attention note, or "Early read · 2 rounds".
51. Form bars: 44x24 box, five bars oldest to newest left to right, gap 3, radius 2, min height 5, one shared range across rows (`FormRange`). Green when the round beats the season team average (`data.teamAvg`), amber when more than 2 over. Drawn only from 3 rounds; under 3, two neutral stubs.
52. Figure on the right: average with "x.x HCP", or SG with "SG / rd" when sorting by SG, or "—" when there is none (totals-only rounds).
53. Card footer: "Bars are the last five rounds. Green beats the team average."
54. Injured card: titled "Injured", dim coins, amber "Injured" chip with no date. No return date string anywhere.
55. No Captain tag, class or text in the DOM.
55a. Practice rounds never feed a form bar (design lead call; they still list in Latest rounds).
56. Early state (`roster?state=early`): no form bars (stubs), SG "—", no leaders row, no top five, rows "Early read · 2 rounds".
57. Empty: "No players yet" with Invite players and Copy team code. Failed: "The roster didn't load", Try again.
58. Long names ellipsis on one line; 25 players render 25 rows with computed counts and nothing truncated.
59. Averages exclude practice rounds on rows, leaders and top five (Nick).

### S-ROSTER.player
60. Same team card without injured count, waiting count or top five; those nodes are absent from the player DOM, as are leaders, form bars, averages and SG of teammates (SHARED-11).
61. Sort Name / Class / HCP. A Coaches card, then a Players card.
62. Rows read "Senior · Class of 2027" style lines from `classYearLine`, a "You" chip on the viewer's row, HCP on the right, and are not tappable.
63. Empty: "No teammates yet".

### S-ROSTER.requests
64. Sheet at 62%; per person Decline and Approve (today's writes), year line from `classYearLine` with no repeat; footer note; team code card; Approve all.
65. `?tab=requests` still opens this sheet (`requests-link` test passes).

### S-ROSTER.profile
66. Bar: "‹ Roster" in champagne, name centred, more button labelled "Player actions" (44 hit area).
67. Head: coin 76, name, hometown, year chip (year colour at 14% fill, text at 62%), buttons Message and Plan 1:1.
68. Cards in order: This season, Scoring trend, Recent rounds (link "All N"), About.
69. The SG label reads the team's baseline name ("vs Tour" without a team baseline), never "vs D1". The trend label states its window ("Last 7" or "season") as the data gives it.
70. Long names wrap to 2 lines, centred.
71. Push 462ms `--ch-ease-spring-smooth`: profile 100% to 0, roster to −24% (`CH_UNDERLAY_SHIFT` 0.24, the house value; the design drew −30%) and dims 10%. Pop 280ms `--ch-ease` (330ms then unmount). Reduce Motion: `CH_FADE_MS` (180ms) crossfade, nothing slides. Edge swipe pops.

### S-ROSTER.desktop
72. Top row: team card and leaders (`.dldrs`). Requests row under it.
73. Table in a card with a sticky header: Player, Status, Last 5, Avg, HCP, SG/rd, Rds. "Last 5" cells hold the same form bars as phone; table avatars carry `data-year`.
74. `.ch-rs-attn` is absent from the DOM.

### S-ROSTER.peek
75. Peek: coin, year chip with no repeated class line, Message, Schedule 1:1, four figures, chart, Open full profile. Clicking a row selects it.

### S-HOME (coach) [04 §4–6, 03 §7, 02 §6]
76. Hero (`.hhero`): full bleed, `--ch-frame` fill, padding 54 top and 20 sides, bottom radius 24. The shell's hero-mode bar background (shell.css near line 1306) is `var(--ch-frame)`: sampled pixels at the bar/hero join are identical (no seam), light and dark.
77. Bar row in the hero: crest 32, "Home ⌄" 600 18, champagne dot, ringed bell.
78. Date 400 15 at 72% ink. Greeting 600 34/1.1 `wdth` 88 ("Good morning, Nick."). Brief 400 15/1.45 at 84% with a sparkle glyph, text from `homeSubline`.
79. "Waiting on you" capsules: drawn 34 tall inside a 44 hit area; labels are the real queue items (replies missing, tasks overdue, posts awaiting acknowledgement); each opens its page as today.
80. Up next glass card: fill `rgb(255 255 255 / .08)`, ring at 13%, radius 16, padding 16; type and countdown; title 22pt; time and place; invitee coins (with `data-year` where found); "4 of 6 going" format.
81. Today card: fixed time column, "Next" chip on the next event, amber "Clash" chip on clashes, Calendar link.
82. Team scoring card: label text node "Average · last 10 rounds"; delta reads "vs previous 10" and is toned only past the standard error; chart uses `--ch-chart-line` with 10 points; Rounds / GIR / Putts row. Practice rounds excluded.
83. The team's game: 2x2 cells split by hairlines; meta "SG per round"; each cell's bar 8 high, radius 4, from a centre zero; names are links to that player's game on Stats; note "Approach and putting cost the most. Names open that player's game on Stats."
84. SG bars grow once (scaleX from the zero line) over 360ms `cubic-bezier(.22,1,.36,1)` when Home is first shown; drawn in place under Reduce Motion; never regrow on re-render.
85. This week: 7 columns with a note.
86. Latest rounds: rows 64; score well 54x48, radius 13; red only for under par via `--ch-score-under`; shows the loader's 3 rows.
87. Loading, empty, failed copy as in 05-SCREENS. `eventsonly` and `norounds` hide the scoring cards and keep Today and This week.
88. `player-home-phone.test` passes unchanged; the coach phone styles are one block in home.css with no hex colours.

### S-HOME.round-sheet
89. Sheet at 74%: Score / GIR / Putts / SG strip, nine-hole card, Message, Round recap. Closes on ✕ or dim tap.

### S-HOME.strip
90. Tapping the bar title drops the section strip under the bar from −12px over 462ms smooth spring with a 180ms fade; the chevron turns 180°. Reduce Motion: appears in place. Tapping again or picking a section closes it. Applies on every screen with a green bar title.

### S-HOME.desktop
91. Desktop: hero with Up next, This week agenda, Team scoring, legs, Latest rounds (4 rows), Leaderboard top 5.

## Part 3. Mechanics, motion and data (cross-screen)

### Mechanics [04 §6]
92. Walk every row of 04 §6 on each screen, including Back: strip, bell, +, overlap chip, Today row and binder, status switch, sorts, leaders swipe, leader card and row (coach push; player row inert), requests row, capsules, Up next, legs names, round row, desktop row click.

### Motion [04 §7]
93. Press: scale 0.97, 110ms down and 280ms back, `cubic-bezier(.22,1,.36,1)`; rows take a 5% ink wash instead of scale; Reduce Motion wash only.
94. Sheet in: 462ms `--ch-ease-spring-smooth`, sheet from 102% to 0, page dims to 32% black over 260ms. Sheet out: 280ms `--ch-ease`. Reduce Motion: `CH_FADE_MS` (180ms) crossfade both ways.
95. Switch: thumb 462ms settle spring, track 260ms linear, thumb travel 20px; instant under Reduce Motion.
96. Never: count-up numbers, entrance staggers, animated blur or shadow on scroll, motion on re-render. Settings > Animations off (`[data-motion='off']`) behaves as Reduce Motion.

### Data [03]
97. Every scoring average, the leaders and the top five exclude practice rounds (staging fixture with a practice round proves it); Latest rounds still lists practice rounds.
98. Home average is the last 10 countable rounds and is labelled so. Roster row figures and the form-bar colour use `data.teamAvg` (season); each card names its window (fixed 4 Nov: the conflict is settled in DECISIONS, "Team average window").
99. Form bars come from `trend.slice(-5)` on the client with the shared range and the 3-round floor.
100. No figure, chip or name is invented: staging shows no Captain, no "Varsity", no return date, no finals, and the join code is the team's real code.

## Part 4. Per PR

Every PR also runs `npm run clubhouse:catalog`, `npm run clubhouse:css` and keeps `playwright.clubhouse.config.ts` green [02 §0].

### PR 7. Year avatars and label (with the shared tokens, card surface and large title of 02 §2)
- Passes: 1–19; SHARED-1 to 12.
- Adds tests: `class-year.test.ts` (normal, missing, past year, far year, repeat, 1 August rollover); Avatar `data-year` and neutral fallback; no "Class of X · Class of X" across profile, peek, requests and request meta; `rosterPeek` sub uses `classYearLine`; `large-title.test.tsx` (order, 56px scale and fade, fade only under Reduce Motion); contrast assertions for the year tokens.
- Done when: an avatar on Roster, Home and the profile shows year colours, coaches and unknown years stay neutral, and nothing else on any screen changes in a capture.

### PR 8. Roster phone and desktop
- Passes: 41–75, 92–94, 97–100.
- Adds tests: in `roster.test.tsx` move the 776 / 972 kicker asserts to `.ch-rs-team` counts; `.ch-rsm-row__bars` replaces the spark; leaders render three cards and hide "Needs a look" without attention; counts include "waiting" for the coach only; `data-year` and `data-dim`; no "Sort by" node; sticky bar class; desktop "Last 5" header and bars; no `.ch-rs-attn`. `roster-player.test.tsx`: team card, "You" chip, "Senior · Class of 2027", no top five / injured / waiting nodes. `page-spacing.test.ts`: `.ch-rs-ldrs` in PHONE_BLEEDS. Fixtures: `roster?state=early|long|big`. Reruns: `roster-sort`, `roster-premium`, `wiring-p003-roster`, class-line, context-menu, peek-reads, requests-link, requests-stale-hint, spread-axis, `native-nav`.
- Done when: every S-ROSTER ID matches side by side in default, early, loading, empty, failed, long, big, injured, dark, XXL and 430, coach and player, and the push, sheet and sort clips match 04 §7.

### PR 9. Classes
- Passes: 20–40, 92–96.
- Adds tests: in `classes.test.tsx` invert 1270–1280 to `.ch-cl-term` with `.ch-cl-term__line` and no `.is-compact`; 1288 becomes "No classes today" plus a "Next: …" line; + opens a menu with Add class and Import schedule; TodayClasses dedupes same code and start; time column is one `ch-num` node; no "Your classes" heading on phone; context line text; no finals or holiday text. `class-awareness-player.test.tsx` (switch label unchanged), `classes-parity.test.ts`, `contrast-tokens.test.ts` 425 rerun with the dark tones, `look-feel-pass-css` keeps `.ch-cl-h h1 {`, `page-spacing` ROOTS. Fixture: `classes?state=long`.
- Done when: every S-CLASSES ID matches side by side in default, sheet, loading, empty, failed, long, dark, XXL, 430 and desktop.

### PR 10. Coach Home
- Passes: 76–91, 92–98.
- Adds tests: `home.test.tsx` 402 hero, 415 Today, 426 form label as text, 1394 legs grid of 4 cells with name links; CSS tests that the coach hero has no `background:none`, the coach phone block has no hex colours and the hero-mode bar is `var(--ch-frame)`; Up next coins carry `data-year`; capsule hit area at least 44; `page-spacing` adds `.ch-hm-hero:not(.is-player)` to PHONE_BLEEDS; `player-home-phone.test.tsx` passes unchanged; reruns `home-consumer-truthfulness`, `home-change-marks`, `home-phone-figs-css`, `shell-reach-css`.
- Done when: every S-HOME ID matches side by side in default, round sheet, strip, loading, empty, failed, dark, XXL, 430 and desktop; the bar/hero join shows no seam; player Home is re-shot and handed to the Stats lane (PR 6).

## Part 5. Side by side [04 §9]

For each ID and state: `node capture/capture.mjs --id <ID> --state <state>` (the script needs `--id` and `--state` added per the build contract; until then run `design`, `app` and `compare` with `--only classes|roster|home` from the README). Widths 390 and 430, light and dark, Text Size default and XXL, Reduce Motion on for stills. List every difference in the PR as matches, fixed, or can't match (04 §8 row); anything else blocks the PR. Measure on both with the inspector, within 2pt:

- Page edge 16 / 20; card radius 16; row heights 52 / 64; Classes time column 58; bar 98 with its 16 lip.
- Term card well 66; team card mix bar 12; form bars 44x24; profile coin 76; hero bottom radius 24 and greeting 34; score well 54x48.
- Sheet detents: class 90%, requests 62%, round 74%.

Motion: record the push and pop, each sheet, the sort, the strip, the large title and the Home SG grow on the design page and the app at 390 wide with Playwright `recordVideo`, then again with `reducedMotion: 'reduce'` (crossfades only, SHARED-6). Durations and curves must be the ones in 93–95 and 04 §7.

One still each for dark, XXL, long names, 25 players, loading, empty and failed. Compare the bar against a Stats screenshot [02 §10].

## Completeness pass, 4 Nov 2026

Numbered CP-1 onward so they never collide with 1 to 100. Each is a fact checked by S (screenshot), D (DOM or unit test), C (clip) or N (network log). Sources: 05 "Completeness pass" (CP.1 to CP.5), 06 CP-6.1 to CP-6.16, 07 M-CRH-46 to M-CRH-58.

### Flag and held migrations (S-ALL.flag-off) [05 CP.1]
CP-1. `config/feature-flags.yml` has `clubhouse_classes_roster_home_v1` with `default: false` and production, preview and development false; `registry.generated.ts` is regenerated. D
CP-2. With the flag off, every route this lane touches (classes, roster coach and player, profile, home coach and player, desktop) renders a DOM and a 390 and 1280 screenshot identical to main 75b4956. D, S
CP-3. Every CSS rule the lane adds or replaces sits under `[data-ch-crh='on']`; a stylelint or unit check finds none outside it in classes.css, roster.css, home.css and the shell.css hero-mode bar rule. D
CP-4. No PR from 7 to 10 contains a migration file or applies one. D

### Entries: URLs, cold start, roles [05 CP.3]
CP-5. `roster?tab=requests` (coach, phone) shows the requests sheet at rest on the first content frame; browser Back closes it to Roster; a second Back leaves the route; a reload after closing shows Roster with no sheet. D, C (M-CRH-46)
CP-6. `roster?invite=1` and `classes?new=1` behave as CP-5 for the invite sheet and the class form; the add-menu does not show on `?new=1`. D
CP-7. `roster?player=<id>` (coach, phone) shows the profile at rest over Roster with focus on the name heading; Back pops to Roster with M-CRH-21; Back again leaves. On desktop the row is selected in the peek and scrolled into view. D, C
CP-8. `roster?player=` with a non-uuid, another team's player or a removed player shows Roster at rest, no profile, the toast "That player isn't on your roster.", and the param is gone from the URL. No name of the requested player appears in the DOM or the response. D, N
CP-9. A player session opening `roster?tab=requests`, `?invite=1` or `?player=<id>` gets S-ROSTER.player at the top; no requests, invite or profile component is in the DOM, and no coach-only read is in the network log. D, N (SHARED-11)
CP-10. `/golf/dashboard/roster/<id>` still sends a coach to `/stats?player=<id>` and a player to `/roster`; a coach on `/golf/dashboard/classes` still gets the legacy page. D
CP-11. A cold start into any URL in CP-5 to CP-7 shows the skeleton at once, then the target at rest: no frame shows a sheet rise, a push or the SG grow. C (M-CRH-46, never-animate 13)
CP-12. `roster?tab=requests` on desktop scrolls the requests row into view and focuses it (today's behaviour); with no requests, Roster shows at the top with no requests row. D

### Notifications [05 CP.3]
CP-13. A bell row or push whose `action_url` is `/golf/dashboard/roster?tab=requests` lands per CP-5; plain `/golf/dashboard/roster` lands on Roster at the top with the Join requests row in view. D
CP-14. A join-request item opened after the request was handled elsewhere lands on S-ROSTER.requests.none (phone) with "No join requests right now." and the team code card, and no Approve all. D, S
CP-15. A player item to `/golf/dashboard/classes` lands on Classes at the top; a coach's class item lands on Home with the class line in view under Waiting on you. No new notification type or writer exists in the diff. D

### Cross-lane handoffs [05 CP.4]
CP-16. Profile "View stats", peek "View stats" and "All {n}" open `/stats?player=<id>` (with `&window=season&tab=rounds` for All); browser Back returns to Roster with the profile open at rest and its scroll restored within 1pt. D, C (M-CRH-53)
CP-17. Home leg names open `/stats?player=<id>&tab=game` and "Team stats" opens `/stats/team` as today; Back returns to Home at its scroll position. D
CP-18. Profile, peek and round sheet "Message" open today's compose with that player as the recipient and nothing sent; Day card Nudge and Message open `/messages?prefill=` as a draft only. D, N (no message insert in the log)
CP-19. With the Messages lane's gate off, CP-18 lands on today's Messages; with it on, on the redesigned compose; the link this lane builds is the same in both. D
CP-20. The CoachHelm panel, peek CoachHelm and round sheet CoachHelm use today's hrefs unchanged; with `coachhelm_player_file_v1` off they open today's Deep dive, on they land on the Lenses file through Lenses' redirect. D
CP-21. Lenses' "Open {first}'s profile" (`/golf/dashboard/roster?player=<id>`) lands per CP-7; "‹ Roster" goes to the Roster list; browser Back from the list returns to the file. D
CP-22. The Home queue renders capsules only from `queue.joinRequests`, `replies.missing`, `overdueTasks` and `unackedPosts`; no Ask, Practice plan, Messages or Team Board capsule exists in the DOM. D
CP-23. Team items on Classes (Today's practice row, the Overlaps lead row, the Soon list, the class sheet's Travel chip) are not buttons or links and show no press wash. D
CP-24. Player Home with this lane on and stats-home off renders as main, bar included; with both on, pixels sampled at the bar and hero join are identical in light and dark; the coach's `variant='card'` never reaches `PlayerHomePhone`'s calls of `Today`, `UpNext`, `WeekStrip`. D, S

### Not-drawn sheets and targets from 3 Nov (05 "Not drawn" table)
CP-25. S-CLASSES.class-form, .import-sheet, .exam-sheet, .no-class-today, S-ROSTER.invite, .invite-email, .profile-actions, S-HOME.in-class-sheet, .term-sheet, .breaks-sheet and the S-HOME.live sheet: each opens as a phone sheet with `--ch-sheet-bg`, top radius 20, grabber 36 x 5, a 650 17k title and a 32 close in a 44 hit area; content height capped at 92dvh; fields per 06 CP-6.2; no accent left borders. S, D
CP-26. Each of those sheets keeps today's fields, copy, writes, toasts and error codes (a DOM snapshot of labels and buttons against main matches, apart from class names). D
CP-27. Every confirm (Discard, Start over, Remove class, Delete all, Remove exam, Mark inactive or active, Remove player, Remove break, note discard) shows today's title and two buttons, keep left and act right, stacking act over keep at XXL; the destructive act is `--ch-flag` text and fires `warning` on confirm. S, D (06 CP-6.4, M-CRH-37)
CP-28. Each restyled sheet opens on K1 462ms, closes on K3 280ms (unmount 320), drags to close past 80px or 0.5px/ms, and fades over 180ms under Reduce Motion. C (M-CRH-45)
CP-29. ClassForm with changes asks "Discard your changes?" on ✕, dim tap, Escape, a drag past 80px and browser Back; the drag case springs back first (M-CRH-58). D, C
CP-30. ImportSchedule keeps Pick, Reading (slow notice CH-12902), error kinds, Review and Done; steps swap with `chSwap` (12px, 260ms, K3); "Start over?" confirms from Review. D, C
CP-31. The status card keeps the "Share class status with coaches" switch, with today's other rows (Pushes during class, No class today, Tag, Re-sync and Fix notices, CH-12270) as 06 rows below it in the same card, only with `class_awareness_v1` on. D
CP-32. The status switch moves at once on tap; on a failed write it moves back (M-CRH-48) and today's toast shows; no inline spinner. C, D
CP-33. "Adding to your calendar…" and "Retry sync" show as a 06 row at the top of the binders with today's copy; `failsync` shows "{code} is saved, but not on your calendar". D
CP-34. A crash while loading Classes shows the drawn failed state with Try again, not the Fairway `RouteErrorBoundary` page. D
CP-35. Approve and Decline fade the row and close the gap (M-CRH-36); the Roster count updates; the sheet closes when the last request goes; Approve all exists on the phone sheet only, and only with 2 or more requests. D, C
CP-36. An Injured row opens the profile like an Active row (M-CRH-17); an Inactive card follows Injured with Active-style rows and no form bars, each opening the profile. D
CP-37. A 450ms hold on a coach Roster row or a Home Latest rounds row opens PlayerPeek with Message, View stats, Plan 1:1 and CoachHelm; a scroll before 450ms cancels it (07 case 23). C
CP-38. Profile Availability is the stock Segmented in an "Availability" card after About; a tap writes as today and toasts; a failure moves the chip back (M-CRH-48). D, C
CP-39. The desktop row kebab and right-click open today's context menu with the menu surface; a 500ms touch hold opens it on touch screens; Escape closes and returns focus. D
CP-40. The Home class line is one 06 row under the hero's Waiting on you capsules, with today's copy, only with `class_awareness_v1` on; it opens In class now or the term sheet as today. D
CP-41. The live card is a 06 card after Up next and its PlayerLiveSheet is restyled; `home?live=busy|one|many|finished|event|failed` each render with today's copy. S, D
CP-42. Capsules link: join requests to `roster?tab=requests`, replies to the event in Calendar, tasks to Team Hub tasks, posts to Team Hub announcements; Up next opens the event; a week tile opens Calendar's day view. D
CP-43. The bell (where shown) and pull to refresh behave as main: clips before and after the PR match. C (M-CRH-34, M-CRH-42)
CP-44. One class, one player and one round each render one row with no "see all"; mix and credits bars draw one full segment; leaders and the top five follow their own minimums. S
CP-45. Offline: today's banner and refresh notice only; cards keep the last data; a write shows "{failed}: you're offline" with Try again (CH-1903). D

### New states [05 CP.2, CP.5]
CP-46. S-ALL.busy: a tapped write button takes `aria-busy` and `aria-disabled`, keeps its label and colours (no opacity change), and a second tap sends no second request. D, N
CP-47. S-ALL.day-rollover: with the fixture clock crossing midnight in the team's zone while the page is open, the next visible frame after refocus shows the new weekday on Classes Today, the new ringed tile, and Home's new date, with no motion. D, C (M-CRH-55)
CP-48. Crossing 1 August, coins, `classYearLine` and the team card title ("2027–28 season") turn over on the refetch; a device zone 3 hours off the team zone changes nothing. D
CP-49. S-ALL.mid-width at 1024: no horizontal page scroll; the leaders row drops under the team card when the main column is under 960; the Home hero is one column under 1100. At 768: the phone layout with a 20 edge. S
CP-50. S-CLASSES.no-term: no term card, no context line, Today first, no overlap chip; the route never falls to its error state. S, D
CP-51. S-CLASSES.term-edges: before the start "Starts {date}" with no well; after the end "Term ended", "Ended {date}", a full line with no knob and no Soon; the last week reads "1 week left" and the end date "Ends today". S, D
CP-52. S-CLASSES.partial: a card whose read failed shows its own failed block with Try again; the other cards render; the term card hides rather than fail. S
CP-53. S-CLASSES.sheet-stack: Edit, Remove and Add an exam open above the class sheet; Escape or a dim tap closes only the top one and focus returns to the button below; a confirmed Remove closes both together (M-CRH-57). D, C
CP-54. S-CLASSES.gone: a refetch without the open class closes its sheet with no toast. D
CP-55. S-ROSTER.requests.one: one row, no Approve all in the DOM. D
CP-56. S-ROSTER.requests.elsewhere: an already-handled answer removes the row as a success with no error toast. D
CP-57. S-ROSTER.requests.failed: a failed row returns to opacity 1 by frame 440 with the toast; with Approve all, only the rows the server rejected return. C (M-CRH-47), D
CP-58. S-ROSTER.profile.removed: a refetch without the open player pops the profile (M-CRH-49) and toasts "{first} is no longer on the roster."; a player set inactive elsewhere stays open with a dim coin. C, D
CP-59. S-ROSTER.profile.note-dirty: Back, a link and an edge swipe with unsaved note text open the discard confirm; Keep editing returns to the field; Discard pops. D, C (M-CRH-58)
CP-60. S-ROSTER.profile.order: cards read This season, Scoring trend, Recent rounds, About, Availability, Coach's note, CoachHelm, with no text node on the page between them (SHARED-2). D
CP-61. S-ROSTER.desktop-search: a search with no matches shows the empty block inside the table card under the sticky header; clearing restores the rows. S
CP-62. S-ROSTER.desktop-tools: Export, search, Status segmented and the Team or List toggle keep today's behaviour; `ch-roster-view` still restores the view on reload. D
CP-63. S-ROSTER.print: print media of the desktop roster shows every row in ink on white with outlined coins and no clipped header. S
CP-64. S-HOME.since and S-HOME.later render as 06 cards with today's copy and links; absent when empty. S, D
CP-65. S-HOME.no-events shows today's type chips (44 hit areas) and "Add event" to `/calendar?new=1&type=<t>` (CH-2309); a day with nothing today shows "Plan" to `/calendar?new=1` (CH-2301). D
CP-66. S-HOME.day-actions: Nudge, Message and Directions are glass capsules 34 tall in 44 hit areas on the Up next card, shown only where today shows them; Directions opens Apple Maps. D, S
CP-67. S-HOME.queue-failed: the hero shows today's CH-2220 line in `h-ink2` with a Try again capsule; the rest of Home renders. S
CP-68. S-HOME.part-failed: `cachefailed`, `error`, `tourfailed`, `noholes` and `unranked` each render the rule in 05 CP.5. S
CP-69. S-HOME.round-links: with no recap the primary reads "Player stats"; CoachHelm shows as a full-width default button under the two when today shows it. D

### Keyboard, focus and VoiceOver [05 S-ALL.keyboard, S-ALL.voiceover; 06 CP-6.1, CP-6.10]
CP-70. A focus ring (2px, offset 2, `--ch-accent-ink` on light surfaces, champagne on green) shows on `:focus-visible` for every interactive element and never after a tap; its contrast is at least 3:1 in both themes. S, D
CP-71. Tab order follows 05 S-ALL.keyboard on Classes, Roster, the profile, Home and both desktop screens; no positive `tabindex` exists. D
CP-72. Every sheet is a dialog with `aria-modal` labelled by its title; focus moves to the title on open, Tab is trapped, Escape closes, and focus returns to the opener on the unmount frame (M-CRH-50). D, C
CP-73. Every accessible name in 06 CP-6.10 is present; form bars, coins, credit and mix segments, the term line and sparks are `aria-hidden` while their row or card label carries the figures. D
CP-74. In a player session, the accessibility tree holds no teammate's average, SG, form, leader or top-five text, hidden or not (SHARED-11). D

### Per PR (adds to Part 4)
- PR 7: CP-1, CP-3 (the gate and the scoping helper), CP-4, CP-48, CP-70, CP-73 (coin labels).
- PR 8: CP-2 (roster routes), CP-5 to CP-14, CP-16, CP-18 to CP-21, CP-35 to CP-39, CP-44 to CP-46, CP-49, CP-55 to CP-63, CP-70 to CP-74.
- PR 9: CP-2 (classes), CP-6, CP-11, CP-15, CP-23, CP-25 to CP-34, CP-44 to CP-47, CP-49 to CP-54, CP-70 to CP-73.
- PR 10: CP-2 (home), CP-15, CP-17, CP-18, CP-20, CP-22, CP-24, CP-37, CP-40 to CP-47, CP-49, CP-64 to CP-73. PR 10 also builds S-HOME.desktop (06 11.4), which BUILD_BRIEF's "Coach Home (phone)" title leaves out.


## Wiring, 4 Nov 2026

Pass or fail, each against helmv3 03d9087 and the tables in 06 "Wiring, 4 Nov 2026" (W.1 to W.5).

W-CRH-1. Flag. `clubhouse_classes_roster_home_v1` exists in `config/feature-flags.yml` with `default: false` and all three environments false, `npm run flags:generate` output is committed, and the flag is read only on the server (routes/classes.tsx, routes/roster.tsx, the Home page, data/shell.ts). With it off, every screen ID in 05 renders main's DOM. Covers S-ALL.flag-off, every ID.
W-CRH-2. Shell attribute. With the flag on, `.ch-root` carries `data-ch-crh="on"` from `ChShellData.crh`; with it off the attribute is absent. Covers S-HOME, S-HOME.player-boundary.
W-CRH-3. Deep links. `roster?tab=requests`, `?invite=1`, `?player=<id>` and `classes?new=1` open at rest through `useDeepLinkSheet`; one Back closes the sheet or pops the profile, a second leaves; a reload after a hand close shows the bare screen. Covers S-ALL.deeplink, S-ROSTER.requests, S-ROSTER.invite, S-ROSTER.profile.deeplink, S-CLASSES.class-form.
W-CRH-4. Missing player. `roster?player=<not on this team>` shows Roster, the toast "That player isn't on your roster." and no name of any other team's player. Covers S-ROSTER.profile.missing.
W-CRH-5. Role guard. In a player session `routes/roster.tsx` renders `TeamRoster` from `loadPlayerRoster`; the network log holds no `getTeamJoinRequests`, `golf_coach_player_intent` or availability read, and the DOM holds no teammate average, SG, trend, availability or request. Covers S-ROSTER.player, S-ROSTER.role-guard (SHARED-11).
W-CRH-6. Rollover. Classes and Roster carry a `clock` and call `useHomeDayRollover`; with a fixture clock crossing midnight (and 31 Jul to 1 Aug) the screen refreshes once, with no motion, and the year labels and season title turn over. Covers S-ALL.day-rollover, S-CLASSES, S-ROSTER, S-HOME.
W-CRH-7. Practice rounds. With the flag on, a player with 2 practice rounds among 8 shows the same season average, form bars, leader eligibility and top five as with those 2 removed; Home's team scoring, legs and leaderboard ignore them; Latest rounds still lists them. With the flag off, figures match main. Covers S-ROSTER, S-ROSTER.desktop, S-HOME, S-HOME.desktop.
W-CRH-8. Class save. Add and edit write `golf_player_classes` only for the signed-in player (a forged `player_id` is refused by `golf_player_classes_insert_player` / `_update_player`), keep today's validation, and on a sync failure show CH-12002 and the Retry sync row. A second tap while saving sends one write. Covers S-CLASSES.class-form, S-CLASSES.sync, S-ALL.busy.
W-CRH-9. Import. Import calls `golf_import_player_classes` once, a re-import of the same file adds no rows, and CH-12004 shows on failure with nothing added. Covers S-CLASSES.import-sheet.
W-CRH-10. Remove and delete all. Remove calls `removeClassFromCalendar` then deletes the row; a failure keeps the binder and shows CH-12003; Delete all reports kept rows with CH-12005 or CH-12006. Covers S-CLASSES.remove-confirm, S-CLASSES.delete-all-confirm, S-CLASSES.sheet-stack.
W-CRH-11. Class gone. A refetch without the open class closes its sheet with no toast; a write that answers not found closes it with today's failure toast. Covers S-CLASSES.gone.
W-CRH-12. Term guards. The term card renders the before-start copy on 18 Aug (a gap between windows), and the no-term and after-end branches render from preview fixtures; real dates never reach them. Covers S-CLASSES.no-term, S-CLASSES.term-edges.
W-CRH-13. Status card writes. The share switch upserts only the player's own `golf_player_class_settings` row, moves back on failure with CH-12270, and is absent with `class_awareness_v1` off. Covers S-CLASSES.status-panel extras, S-CLASSES.toggle-result, S-CLASSES.no-class-today.
W-CRH-14. Approve and decline. Each calls `acceptJoinRequest` or `rejectJoinRequest` once, the row hides at once and returns on a refusal (CH-3002 / CH-3003), the player gets one bell row (`team_join_approved` to `/golf/dashboard`, `team_join_rejected` to `/golf/dashboard/settings`) and no push. Covers S-ROSTER.requests, S-ROSTER.requests.failed, S-ROSTER.requests results.
W-CRH-15. Handled elsewhere. When the action answers "This request has already been processed", the row stays gone, no error toast shows, and the route refreshes. Covers S-ROSTER.requests.elsewhere.
W-CRH-16. Approve all. Phone only, absent with one request; approves in order, skips ids already approved, and reports "{n} of {m}" on a partial failure with the refused rows still listed. Covers S-ROSTER.requests, S-ROSTER.requests.one.
W-CRH-17. Team card and leaders. Counts read `status` and `availability` (injured counted in active), "n waiting" is absent when requests did not load, top five needs five players with 3 counting rounds, and every leader card needs 3 counting rounds. Covers S-ROSTER.team-card, S-ROSTER.leaders, S-ROSTER (early, one item).
W-CRH-18. Status, remove, availability. Mark inactive or active, Remove and Availability call `updatePlayerStatus`, `removePlayerFromTeam` and `setPlayerAvailability` once each; Availability is optimistic and restores on failure (CH-3009); Remove of a player with an in-progress round shows that error and changes nothing. Covers S-ROSTER.status-confirm, S-ROSTER.remove-confirm, S-ROSTER.profile availability, S-ROSTER.profile.availability-failed.
W-CRH-19. Notes. The availability reason saves 1 to 280 characters to the coach-only table and is not drawn when that table did not answer; the coach's note saves through `setIntent`; both keep the text on failure (CH-3011 / CH-3004); the dirty guard confirms before Back. Covers S-ROSTER.profile.order, S-ROSTER.profile.note-dirty.
W-CRH-20. Removed elsewhere. A refetch without the open player pops the profile with "{first} is no longer on the roster."; set inactive elsewhere dims the coin and moves the row. Covers S-ROSTER.profile.removed.
W-CRH-21. Invite. Copy shows "{what} copied" or CH-3006; Share uses `navigator.share` with `/golf/join/<code>`; email sends at most 10 and shows CH-3980 when email is off. Covers S-ROSTER.invite, S-ROSTER.invite-email.
W-CRH-22. Roster links. Message opens `messages?player=<id>`, View stats `stats?player=<id>`, All {n} today's rounds href and CoachHelm `coachHelmPlayerHref`, all unchanged strings. Covers S-ROSTER.profile targets, S-ROSTER.peek-hold, S-ROSTER.desktop-menu.
W-CRH-23. Home year coins. `ChCoachHome.yearById` comes from the roster read Home already makes (no new query) and is absent from `ChPlayerHome`; Up next coins carry `data-year` only when `invitees` and `inviteeIds` have the same length, else name-only coins. Covers S-HOME, S-HOME.desktop.
W-CRH-24. Waiting on you. Capsules come only from `loadCoachQueue` (joins, replies, tasks, posts) with today's hrefs; a part that did not load is left out with CH-2220 and a Try again capsule that refreshes the route. Covers S-HOME.waiting targets, S-HOME.queue-failed.
W-CRH-25. Day actions. Nudge and Message open Messages through `messagesPrefillHref` with a draft and send nothing; Directions opens Apple Maps for off-site events only. Covers S-HOME.day-actions.
W-CRH-26. Coach class sheets. Save dates, Mark no classes and its remove call `saveTeamTerm`, `addTeamBreak` and `removeTeamBreak`; a player session cannot (the `_coach` policies refuse). Covers S-HOME.class-line, S-HOME.term-sheet, S-HOME.breaks-sheet, S-HOME.in-class-sheet.
W-CRH-27. Shot tracking. No file this lane changes writes `golf_rounds`, hole or shot rows, or changes what the scoring screens collect; a grep of the PR diffs for those table names in writes returns nothing. Covers S-HOME, S-HOME.round-sheet, S-ROSTER.
W-CRH-28. No notification added. The PR diffs add no insert into `notifications`, `golf_notifications` or a push sender. Covers every ID.
