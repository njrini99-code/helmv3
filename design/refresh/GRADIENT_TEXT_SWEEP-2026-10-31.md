# Text on the page gradient: the full sweep

Oct 31, 2026. Read only: no code changed, no PR, nothing posted. HelmV3 `main` at 75b4956 (#2427).

## Summary

- **43 screens** have text drawn straight on the page (the parchment gradient), in **884 spots** (one spot = one text style on one screen). 550 of them show on phone, 593 on desktop.
- **No spot fails WCAG AA**, in light or dark, at the lightest or the darkest point of the gradient. The lowest is 5.0:1 (.ch-hscroll.ch-hb-strip on Team Hub (coach), amber #8a5a0c); the lowest in dark is 7.0:1. So what Nick is reacting to is not a ratio. It is dark type floating on a tinted, uneven field between cards that barely separate from it, exactly as DESIGN_LANGUAGE.md section 1 says.
- **The Section-on-phone change reaches very little.** `ui/Section.tsx` is used by 17 files (Classes, Team rounds, What's new, qualifiers, tournaments, calendar extras, three CoachHelm views). Stats, Home, Player stats, Roster, Messages, Calendar, Hub, Rounds, Settings and CoachHelm Standing each draw their own heads and notes with their own classes (Stats: `.ch-stm-panel__h`, `.ch-stm-note`, `.ch-stm-cover`). Nick's screenshot is entirely those. Each thread has to move its own heads into cards; the build brief's line that the Section change "fixes Nick's screenshot on every tab at once" does not hold.
- **The flat page (law 2) is the one change that reaches every spot at once**, phone and desktop, light and dark. It removes the gradient under all of them, but on phone the text is still on the page until each screen moves it into a card.
- Phone spots by what fixes them: A large title or its context line 43; B Section head 12; C empty, failed or notice text 45; D back link 0; E the screen's own heads, notes and content flush on the page 450.

### Worst offenders (by how much sits on the page, phone)

Ratios all pass, so "worst" here means most text on the gradient. These are whole pages built flush on the canvas (the Oct 7 Ledger), not a stray caption:

| Screen | Text runs on the page (phone) | Redesign thread |
|---|---|---|
| Player stats profile | 264 | Stats + player Home |
| CoachHelm Standing / Deep dive (player) | 196 | None (not covered) |
| Calendar (coach) | 177 | None (not covered) |
| Rounds (my rounds) | 104 | None (not covered) |
| Team Hub (coach) | 103 | None (not covered) |
| Player Home | 101 | Stats + player Home |
| Coach Home | 96 | Classes, Roster, coach Home |
| Qualifier detail (coach) | 88 | None (not covered) |
| Qualifier detail (player) | 69 | None (not covered) |
| Team rounds | 68 | None (not covered) |
| Calendar (player) | 55 | None (not covered) |
| Classes | 53 | Classes, Roster, coach Home |

Lowest ratios found (still passing):

| Screen | Spot | Text | Ratio here | On the gradient's darkest point | Dark mode |
|---|---|---|---|---|---|
| Team Hub (coach) | `.ch-hscroll.ch-hb-strip` | 6 | 5.0 | 5.0 | 8.4 |
| Team Hub (coach) | `.ch-hb-task.is-coach` | Submit eligibility form | 5.0 | 5.0 | 8.6 |
| Team Hub (player) | `.ch-hscroll.ch-hb-strip` | 2 | 5.0 | 5.0 | 8.5 |
| Classes | `.ch-cl-tb__over` | 2 | 5.2 | 5.0 | 8.6 |
| Tournament desk | `.ch-num.ch-tour-under` | −6 | 5.1 | 5.1 | 7.0 |
| Rounds (my rounds) | `.ch-rd-sc__s.is-under` | −3 | 5.1 | 5.1 | 7.1 |

### Not text, but the same problem

- **The green bar fading onto the page.** Phone: `src/clubhouse/styles/shell.css:3106` `.ch-topbar::before` paints `--ch-scroll-edge-down` (frame green at 26% to transparent, 14px, `tokens.css:529-530`) under the bar once the page scrolls. Desktop: `shell.css:3140`. The sheet lip under the phone bar is `shell.css:2466` (`.ch-topbar::after`). The language does not mention this shade; whoever does the flat page should decide whether it stays.
- **The gradient itself.** Phone: `shell.css:2452` (`--ch-light-canvas`, `--ch-light-paper`, `--ch-workspace`) and `shell.css:2448` for the app behind it. Desktop: `shell.css:2322-2327` plus the green mist `.ch-canvas::before` at `shell.css:2330-2345`. Tokens: `tokens.css:474` (`--ch-light-canvas`), `tokens.css:487-493` (`--ch-light-paper`); in dark the key light stays (`tokens.css:942`) and the paper tint is off (`952`). At 8:15am the phone page renders #f4ecdb; the green mist makes the desktop top-left darker than the rest.
- **Hole coverage caption** ("Hole stats from 56 of 70 rounds" in Nick's screenshot): `.ch-stm-cover`, `src/clubhouse/screens/stats/StatsTeamPhone.tsx:313`. The sample data has every round's holes, so the scan did not see it; it sits on the page like the other Stats notes.

## How this was measured

Every Clubhouse preview screen (`/clubhouse-preview/*`, the dev-only fixture pages) rendered locally from `main`, 76 screen states, in five settings: phone 390 light at 8:15am (Nick's screenshot), phone light at 6:30pm (golden hour, the warmest paper), phone dark, desktop 1440 light at noon, desktop dark. A text run counts when the nearest painted thing under it is the page canvas and the painted pixels under it match the page at that height. Contrast is measured on the pixels actually painted under the text (text hidden, then screenshotted), and again against the lightest and darkest page pixel on the same screen. AA is 4.5:1, or 3:1 for 24px and up (or 18.7px bold). Prod-only states the fixtures do not draw (for example the hole coverage caption) are not in the table. Desktop CoachHelm and Messages sit inside their own paper sheet, so they have nothing on the page there.

Columns: **Ratio** is light mode on the painted page under the text (worst setting); **Gradient ends** is the same text on the lightest / darkest page pixel; **Dark** is dark mode. P = phone, D = desktop; "dark only" means the text sits on its own sheet in light and on the page only at night (desktop CoachHelm is the main case: its paper sheet goes transparent in dark). **Fix**: A to E as in the summary.

## Thread: Messages  (2 screens, 13 spots)

### Messages (coach)  (`/clubhouse-preview/messages`; 33 text runs on phone, 4 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title` | Messages | 34/600 | P | 7.8 | 8.1 / 8.0 | 13.2 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-es__title` | No conversations yet | 22/600 | P D | 7.9 | 8.1 / 8.1 | 13.2 | src/clubhouse/styles/ui.css:2207 | src/clubhouse/ui/States.tsx:109 | C |
| `.ch-es__body` | Start a thread with the whole team or mess… | 15/400 | P D | 9.9 | 10.0 / 10.0 | 13.0 | src/clubhouse/styles/ui.css:2222 | src/clubhouse/ui/States.tsx:112 | C |
| `.ch-ms-row__top` | Varsity team (+14) | 13/400 | P | 8.3 | 8.4 / 8.3 | 9.3 | src/clubhouse/styles/messages.css:194 | src/clubhouse/screens/messages/announcements.tsx:87 | E |
| `.ch-ms-row__prev` | Ava (+9) | 14/500 | P | 9.9 | 10.0 / 9.9 | 13.1 | (see component) | src/clubhouse/screens/messages/MessagesView.tsx:593 | E |
| `.ch-ms-fold__b` | Announcements (+2) | 15/500 | P | 8.7 | 8.6 / 8.5 |  | src/clubhouse/styles/messages.css:3304 | src/clubhouse/screens/messages/announcements.tsx:53 | E |
| `.ch-ms-sec__l` | Today (+1) | 12/500 | P | 6.4 | 6.5 / 6.5 | 9.2 | src/clubhouse/styles/messages.css:88 | src/clubhouse/screens/messages/announcements.tsx:30 | E |
| `.ch-ms-head` | Conversations with your players and staff,… (+1) | 16/400 | D | 9.9 | 10.3 / 10.0 | 13.1 | src/clubhouse/styles/messages.css:22 | src/clubhouse/screens/messages/MessagesNoTeam.tsx:10 | E |

### Messages (player)  (`/clubhouse-preview/messages-player`; 20 text runs on phone, 0 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title` | Messages | 34/600 | P | 7.8 | 8.1 / 8.0 | 13.3 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-ms-row__top` | Varsity team (+7) | 13/400 | P | 8.4 | 8.4 / 8.3 | 9.3 | src/clubhouse/styles/messages.css:194 | src/clubhouse/screens/messages/announcements.tsx:87 | E |
| `.ch-ms-row__prev` | Ava (+6) | 14/500 | P | 9.9 | 10.0 / 9.9 | 13.1 | (see component) | src/clubhouse/screens/messages/MessagesView.tsx:593 | E |
| `.ch-ms-fold__b` | Announcements (+2) | 15/500 | P | 8.7 | 8.6 / 8.5 |  | src/clubhouse/styles/messages.css:3304 | src/clubhouse/screens/messages/announcements.tsx:53 | E |
| `.ch-ms-sec__l` | Today | 12/500 | P | 6.4 | 6.5 / 6.5 | 9.2 | src/clubhouse/styles/messages.css:88 | src/clubhouse/screens/messages/announcements.tsx:30 | E |

## Thread: Stats + player Home  (3 screens, 165 spots)

### Player stats profile  (`/clubhouse-preview/player`; 264 text runs on phone, 37 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-display` | Luca Ferraro (+2) | 44/600 | D | 7.9 | 8.3 / 8.1 | 13.3 | src/clubhouse/styles/base.css:142 | src/clubhouse/ui/PageHero.tsx:63 | A |
| `.ch-large-title` | Jonah Okafor (+1) | 34/600 | P | 7.9 | 8.1 / 8.0 | 13.1 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-empty__title` | No strokes gained in this window (+4) | 16/600 | P | 14.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/shell.css:728 | src/clubhouse/ui/States.tsx:185 | C |
| `.ch-empty__body` | Strokes gained by leg appears after three … (+4) | 14/400 | P | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/shell.css:736 | src/clubhouse/ui/States.tsx:186 | C |
| `.ch-nodata` | — | 22/600 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/ui.css:371 | src/clubhouse/ui/NoData.tsx:10 | C |
| `.ch-gx-tiles` | Average to par (+28) | 12/500 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:2785 | src/clubhouse/screens/stats/detail.tsx:96 | E |
| `.ch-sv-mix-key` | <1% (+19) | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:7167 | src/clubhouse/screens/stats/ScoreMixBar.tsx:75 | E |
| `.ch-gx-tbl` | Stat (+19) | 14/500 | P | 6.6 | 6.6 / 6.5 | 7.8 | src/clubhouse/styles/stats.css:2822 | src/clubhouse/screens/stats/detail.tsx:129 | E |
| `.ch-stm-panel__h` | Strokes gained (+13) | 20/600 | P | 8.0 | 8.1 / 8.0 | 10.9 | src/clubhouse/styles/stats.css:2216 | src/clubhouse/screens/stats/StatsPlayerPhone.tsx:338 | E |
| `.ch-pf-hero__figs` | Scoring avg (+11) | 22/500 | D | 6.8 | 6.8 / 6.6 | 8.4 | src/clubhouse/styles/stats.css:1234 | src/clubhouse/screens/stats/StatsPlayer.tsx:296 | E |
| `.ch-stm-figs.is-three.is-line` | Scoring avg (+10) | 22/600 | P | 6.6 | 6.6 / 6.5 | 8.6 | src/clubhouse/styles/stats.css:2134 | src/clubhouse/screens/stats/StatsPhoneSkeleton.tsx:39 | E |
| `.ch-sv-rt__t` | 72 (+10) | 11/500 | P | 14.7 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/stats.css:3637 | src/clubhouse/screens/stats/RoundTrend.tsx:118 | E |
| `.ch-stm-row__b` | Oakmont CC (+8) | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:2432 | src/clubhouse/screens/stats/StatsTeamPhone.tsx:462 | E |
| `.ch-gm__figs` | Scoring average (+7) | 28/600 | P | 6.6 | 6.6 / 6.5 | 8.6 | src/clubhouse/styles/stats.css:1553 | src/clubhouse/screens/stats/GameDetail.tsx:182 | E |
| `.ch-gx-rank` | Hole (+7) | 16/400 | P | 6.6 | 6.6 / 6.5 | 8.6 | src/clubhouse/styles/stats.css:2936 | src/clubhouse/screens/stats/GameMore.tsx:125 | E |
| `.ch-stm-row__v.ch-num` | 74 (+7) | 13/400 | P | 6.6 | 6.6 / 6.5 | 8.6 | src/clubhouse/styles/stats.css:2441 | src/clubhouse/screens/stats/StatsTeamPhone.tsx:468 | E |
| `.ch-gm-p__t` | What an average round looks like (+6) | 15/600 | P | 14.7 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/stats.css:1589 | src/clubhouse/screens/stats/detail.tsx:46 | E |
| `.ch-gx-sub` | Per 18 holes (+6) | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:2796 | src/clubhouse/screens/stats/detail.tsx:101 | E |
| `.ch-spm-head__id` | Sophomore (+5) | 13/400 | P | 8.1 | 8.4 / 8.3 | 10.6 | src/clubhouse/styles/stats.css:2491 | src/clubhouse/screens/stats/StatsPhoneSkeleton.tsx:149 | E |
| `.ch-spm-dev` | Approach 125–150 yds (+5) | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:2599 | src/clubhouse/screens/stats/StatsPlayerPhone.tsx:490 | E |
| `.ch-sv-read` | Tap a leg to see its likely range. (+4) | 14/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:5919 | src/clubhouse/screens/stats/ScoreMixBar.tsx:54 | E |
| `.ch-sv-mix-name` | Eagle or better (+4) | 14/500 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:7183 | src/clubhouse/screens/stats/ScoreMixBar.tsx:78 | E |
| `.ch-gx-rank__n.ch-num` | 1 (+4) | 13/600 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:2943 | src/clubhouse/screens/stats/GameMore.tsx:128 | E |
| `.ch-spm-sub` | Focus areas (+4) | 14/600 | P | 8.1 | 8.1 / 8.0 | 10.9 | src/clubhouse/styles/stats.css:2570 | src/clubhouse/screens/stats/StatsPlayerPhone.tsx:500 | E |
| `.ch-pf-hero__sub` | Team 72.8 (+4) | 13/400 | D | 8.5 | 8.7 / 8.4 | 10.7 | src/clubhouse/styles/stats.css:1247 | src/clubhouse/screens/stats/StatsPlayer.tsx:301 | E |
| `.ch-stm-leg.ch-sv-row` | Off the tee (+3) | 13/600 | P | 6.6 | 6.6 / 6.5 | 7.8 | src/clubhouse/styles/stats.css:2292 | src/clubhouse/screens/stats/StatsTeamPhone.tsx:391 | E |
| `.ch-stm-leg.ch-sv-row.is-early` | Around green (+3) | 14/400 | P | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/stats.css:2292 | src/clubhouse/screens/stats/StatsTeamPhone.tsx:391 | E |
| `.ch-pill` | Off the tee (+3) | 13/500 | P | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/roster.css:238 | src/clubhouse/screens/stats/StatsFilter.tsx:332 | E |
| `.ch-gm-p__n` | Doubles or worse are the quickest place to… (+3) | 13/400 | P | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/stats.css:1592 | src/clubhouse/screens/stats/detail.tsx:48 | E |
| `.ch-gx-pm` | Par (+3) | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:2906 | src/clubhouse/screens/stats/GameMore.tsx:82 | E |
| `.ch-gs__row` | Strokes gained: putting (+3) | 14/400 | P | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/goals.css:42 | src/clubhouse/screens/stats/Goals.tsx:55 | E |
| `.ch-tab-t` | Overview (+3) | 14/500 | D | 8.3 | 8.7 / 8.4 | 13.1 | src/clubhouse/styles/stats.css:1281 | src/clubhouse/screens/stats/StatsPlayer.tsx:319 | E |
| `.ch-gm__t` | Scoring (+2) | 20/600 | P | 8.1 | 8.1 / 8.0 | 9.3 | src/clubhouse/styles/stats.css:1522 | src/clubhouse/screens/stats/GameDetail.tsx:176 | E |
| `.ch-gm-how` | How this is measured (+2) | 13/600 | P | 8.8 | 8.8 / 8.7 | 9.3 | src/clubhouse/styles/stats.css:3418 | src/clubhouse/screens/stats/detail.tsx:35 | E |
| `.ch-par3__v.ch-num` | 3.30 (+2) | 22/600 | P | 14.7 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/stats.css:1620 | src/clubhouse/screens/stats/charts.tsx:196 | E |
| `.ch-par3__to.ch-num.ch-loss` | +0.30 to par (+2) | 13/500 | P | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/stats.css:1626 | src/clubhouse/screens/stats/charts.tsx:198 | E |
| `.ch-topar` | +2 (+2) | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:1409 | src/clubhouse/screens/stats/StatsPlayerPhone.tsx:440 | E |
| `.ch-btn.ch-btn--ghost.ch-btn--sm` | Pause (+2) | 13/500 | P | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-pf-hero__id` | Freshman · Class of 2030 · Bologna, IT (+2) | 16/400 | D | 9.8 | 10.3 / 10.0 | 13.1 | src/clubhouse/styles/stats.css:1201 | src/clubhouse/screens/stats/StatsPlayer.tsx:261 | E |
| `.ch-btn.ch-btn--secondary` | Message (+2) | 14/500 | D dark only | 13.7 |  | 13.7 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-stm-sgsub` | vs Tour (+1) | 12/500 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:3352 | src/clubhouse/screens/stats/StatsPlayerPhone.tsx:291 | E |
| `.ch-fg__gauge` | Par (+1) | 12/500 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:308 | src/clubhouse/screens/stats/charts.tsx:47 | E |
| `.ch-stm-overview__meta` | 10 countable rounds (+1) | 14/400 | P | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/stats.css:3330 | src/clubhouse/screens/stats/StatsPhoneSkeleton.tsx:164 | E |
| `.ch-sgchg` | Change in SG a round · No clear change vs … (+1) | 13/400 | P D | 8.4 | 8.4 / 8.3 | 10.7 | src/clubhouse/styles/stats.css:404 | src/clubhouse/screens/stats/charts.tsx:117 | E |
| `.ch-stm-leg.ch-sv-row.is-total` | Total (+1) | 13/600 | P | 6.6 | 6.6 / 6.5 | 8.6 | src/clubhouse/styles/stats.css:2292 | src/clubhouse/screens/stats/StatsTeamPhone.tsx:391 | E |
| `.ch-gm__sub` | Per 18 holes (+1) | 13/400 | P | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/stats.css:1529 | src/clubhouse/screens/stats/GameDetail.tsx:180 | E |
| `.ch-sv-mix-axis` | Under par (+1) | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:7151 | src/clubhouse/screens/stats/ScoreMixBar.tsx:70 | E |
| `.ch-gs__h` | Suggested for you (+1) | 13/500 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/goals.css:13 | src/clubhouse/screens/stats/Goals.tsx:82 | E |
| `.ch-st-back__nav` | 7 (+1) | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.7 | src/clubhouse/styles/stats.css:1103 | src/clubhouse/screens/stats/StatsPlayer.tsx:246 | E |
| `.ch-fg__end.ch-num.is-right` | +6 | 12/500 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:319 | src/clubhouse/screens/stats/charts.tsx:74 | E |
| `.ch-fg__end.ch-num.is-left` | −1 | 12/500 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:319 | src/clubhouse/screens/stats/charts.tsx:74 | E |
| `.ch-stm-note` | 2 legs are losing strokes: Approach, Aroun… | 13/400 | P | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/stats.css:2231 | src/clubhouse/screens/stats/StatsTeamPhone.tsx:239 | E |
| `.ch-gx-rule` | Last 10 rounds · 10 rounds, 18 holes only | 13/400 | P | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/stats.css:2718 | src/clubhouse/screens/stats/GameDetail.tsx:434 | E |
| `.ch-par3__l` | Par | 12/500 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:1615 | src/clubhouse/screens/stats/charts.tsx:195 | E |
| `.ch-par3__d.ch-num` | Tour | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:1632 | src/clubhouse/screens/stats/charts.tsx:201 | E |
| `.ch-gx-more` | More detail | 14/600 | P | 8.8 | 8.8 / 8.7 | 9.3 | src/clubhouse/styles/stats.css:2731 | src/clubhouse/screens/stats/detail.tsx:76 | E |
| `.ch-spm-more` | All 10 rounds | 14/600 | P | 8.8 | 8.8 / 8.7 | 9.3 | src/clubhouse/styles/stats.css:2558 | src/clubhouse/screens/stats/StatsPlayerPhone.tsx:468 | E |
| `.ch-pf-tag.is-active` | Active | 12/500 | D | 9.2 | 11.2 / 10.9 | 9.2 | src/clubhouse/styles/stats.css:1172 | src/clubhouse/screens/stats/StatsPlayer.tsx:263 | E |
| `.ch-btn.ch-btn--ghost.ch-btn--sm.ch-sf__open.ch-btn--flush-start` | Filter | 13/500 | D | 6.9 | 7.2 / 7.0 | 7.7 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-gm-p__empty` | Comparing starts at 13 rounds: the newest … | 14/400 | P dark only | 10.9 |  | 10.9 | src/clubhouse/styles/stats.css:1596 | src/clubhouse/screens/stats/detail.tsx:57 | E |
| `.ch-btn.ch-btn--ghost.ch-btn--sm` | Team stats | 13/500 | D dark only | 7.6 |  | 7.6 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |

### Player Home  (`/clubhouse-preview/home-player`; 101 text runs on phone, 88 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-hm-hero__date` | Wednesday 14 October | 13/500 | P | 6.2 | 6.5 / 6.5 | 9.1 | src/clubhouse/styles/home.css:1004 | src/clubhouse/screens/home/PlayerHomePhone.tsx:55 | A (top) |
| `.ch-h-head__date` | Wednesday 14 October | 13/500 | P D dark only | 6.2 | 6.5 / 6.5 | 9.1 | src/clubhouse/styles/home.css:16 | src/clubhouse/screens/home/CoachHome.tsx:56 | A (top) |
| `.ch-display` | Good afternoon, Theo | 44/600 | P D | 7.8 | 8.1 / 8.0 | 13.2 | src/clubhouse/styles/base.css:142 | src/clubhouse/ui/PageHero.tsx:63 | A (top) |
| `.ch-es__body` | Your stats start with the first round you … (+1) | 15/400 | P D | 10.0 | 10.0 / 9.9 | 13.0 | src/clubhouse/styles/ui.css:2222 | src/clubhouse/ui/States.tsx:112 | C |
| `.ch-es__title` | Welcome to the team | 28/600 | P D | 7.8 | 8.1 / 8.0 | 13.2 | src/clubhouse/styles/ui.css:2207 | src/clubhouse/ui/States.tsx:109 | C |
| `.ch-ph-chart__ax` | 68 (+16) | 11/500 | P D | 14.2 | 14.7 / 14.6 | 14.3 | src/clubhouse/styles/home.css:1811 | src/clubhouse/screens/home/PlayerGame.tsx:261 | E |
| `.ch-wks__d` | M (+9) | 12/500 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/ui.css:1924 | src/clubhouse/ui/WeekStrip.tsx:102 | E |
| `.ch-ph-figs` | Scoring avg (+7) | 22/600 | P D | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/home.css:1982 | src/clubhouse/screens/home/PlayerGame.tsx:112 | E |
| `.ch-ph-leg__v` | 71% (+7) | 13/500 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/home.css:2078 | src/clubhouse/screens/home/PlayerGame.tsx:371 | E |
| `.ch-fgr__c` | GIR (+5) | 22/600 | P | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/ui.css:862 | src/clubhouse/ui/Ledger.tsx:113 | E |
| `.ch-h-round__stats` | GIR (+5) | 14/600 | D | 7.2 | 7.2 / 7.0 | 7.8 | src/clubhouse/styles/home.css:441 | src/clubhouse/screens/home/LatestRound.tsx:156 | E |
| `.ch-hm-tl__b` | Short-game block (+3) | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/home.css:1256 | src/clubhouse/screens/home/DayCard.tsx:198 | E |
| `.ch-ph-figs__m.ch-num` | −1.9 · Better than previous 10 (+3) | 12/400 | P D | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/home.css:2002 | src/clubhouse/screens/home/PlayerGame.tsx:118 | E |
| `.ch-ph-leg__h` | Off the tee (+3) | 15/600 | P D | 14.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/home.css:2046 | src/clubhouse/screens/home/PlayerGame.tsx:362 | E |
| `.ch-ph-leg__n.ch-num` | 101 of 142 fairways in the last 10 rounds (+3) | 13/400 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/home.css:2140 | src/clubhouse/screens/home/PlayerGame.tsx:390 | E |
| `.ch-ph-game__h` | Scoring (+3) | 22/600 | D | 8.1 | 8.3 / 8.1 | 10.9 | src/clubhouse/styles/home.css:1767 | src/clubhouse/screens/home/PlayerGame.tsx:152 | E |
| `.ch-hm-sec__h` | This week (+2) | 20/600 | P | 8.1 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/home.css:1195 | src/clubhouse/screens/home/TeamLegs.tsx:208 | E |
| `.ch-ph-chart__val.is-under` | 71 (+2) | 13/600 | P D | 14.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/home.css:1826 | src/clubhouse/screens/home/PlayerGame.tsx:287 | E |
| `.ch-h-agenda__t.ch-num` | 5:30 (+2) | 13/500 | D | 8.3 | 8.7 / 8.4 | 8.5 | src/clubhouse/styles/home.css:253 | src/clubhouse/screens/home/Week.tsx:122 | E |
| `.ch-h-agenda__a` | Team dinner (+2) | 14/500 | D | 9.1 | 9.1 / 8.8 | 9.3 | src/clubhouse/styles/home.css:258 | src/clubhouse/screens/home/Week.tsx:124 | E |
| `.ch-h-agenda__b` | Carolina Inn (+2) | 13/400 | D | 8.6 | 8.7 / 8.4 | 8.6 | src/clubhouse/styles/home.css:262 | src/clubhouse/screens/home/Week.tsx:126 | E |
| `.ch-wks__d.is-today` | W (+1) | 12/500 | P | 8.4 | 8.4 / 8.3 | 9.3 | src/clubhouse/styles/ui.css:1924 | src/clubhouse/ui/WeekStrip.tsx:102 | E |
| `.ch-hm-week__n` | Friday (+1) | 13/600 | P | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/home.css:1496 | src/clubhouse/screens/home/HomePhone.tsx:432 | E |
| `.ch-hm-tl__t.ch-num` | 3:30 (+1) | 13/600 | P | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/home.css:1253 | src/clubhouse/screens/home/DayCard.tsx:194 | E |
| `.ch-ph-rd__b` | Oakmont CC (+1) | 13/400 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/home.css:2290 | src/clubhouse/screens/home/PlayerHomePhone.tsx:206 | E |
| `.ch-hm-score.ch-num.is-under` | 69 (+1) | 12/600 | P | 5.7 | 5.7 / 5.7 | 7.1 | src/clubhouse/styles/home.css:1600 | src/clubhouse/screens/home/PlayerHomePhone.tsx:210 | E |
| `.ch-hm-meta` | Gross · par 72 · countable rounds (+1) | 13/500 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/home.css:1202 | src/clubhouse/screens/home/PlayerGame.tsx:140 | E |
| `.ch-ph-chart__ann` | Avg (+1) | 13/500 | P D | 14.7 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/home.css:1816 | src/clubhouse/screens/home/PlayerGame.tsx:276 | E |
| `.ch-ph-bench__k.ch-num` | You (+1) | 12/500 | P D | 8.4 | 8.4 / 8.3 | 9.3 | src/clubhouse/styles/home.css:2127 | src/clubhouse/screens/home/PlayerGame.tsx:382 | E |
| `.ch-h-pane__head` | This week (+1) | 20/600 | D | 7.9 | 8.3 / 8.1 | 13.4 | src/clubhouse/styles/home.css:142 | src/clubhouse/screens/home/Week.tsx:59 | E |
| `.ch-hm-hero.is-player` | Good afternoon, Theo | 34/600 | P | 8.0 | 8.1 / 8.0 | 13.1 | src/clubhouse/styles/home.css:992 | src/clubhouse/screens/home/PlayerHomePhone.tsx:54 | E (top) |
| `.ch-hm-lab` | Today | 14/600 | P | 8.1 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/home.css:1208 | src/clubhouse/screens/home/HomePhone.tsx:317 | E |
| `.ch-hm-sec__h.ch-ph-sec__h` | Your latest round | 20/600 | P | 8.1 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/home.css:1195 | src/clubhouse/screens/home/TeamLegs.tsx:208 | E |
| `.ch-ph-pg` | 1 | 13/500 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/home.css:2233 | src/clubhouse/screens/home/PlayerHomePhone.tsx:182 | E |
| `.ch-btn.ch-btn--ghost.ch-ph-card__more.ch-btn--flush-end` | My stats | 14/500 | P | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-ph-note` | Your last ten rounds were all 71 or better… | 14/400 | P D | 8.8 | 8.8 / 8.7 | 9.3 | src/clubhouse/styles/home.css:2008 | src/clubhouse/screens/home/PlayerGame.tsx:128 | E |
| `.ch-ph-spark` | Last | 12/500 | P D | 8.3 | 8.4 / 8.3 | 10.8 | src/clubhouse/styles/home.css:2201 | src/clubhouse/screens/home/PlayerGame.tsx:420 | E |
| `.ch-ph-spark__word` | No clear change | 12/600 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/home.css:2210 | src/clubhouse/screens/home/PlayerGame.tsx:438 | E |
| `.ch-h-agenda__label` | Today | 13/500 | D | 8.3 | 8.7 / 8.4 | 10.8 | src/clubhouse/styles/home.css:233 | src/clubhouse/screens/home/Week.tsx:96 | E |
| `.ch-h-agenda__label.ch-h-agenda__label--later` | Later this week | 13/500 | D | 8.5 | 8.7 / 8.4 | 10.8 | src/clubhouse/styles/home.css:233 | src/clubhouse/screens/home/Week.tsx:96 | E |
| `.ch-h-round__name` | Oakmont CC | 15/600 | D | 15.1 | 15.1 / 14.7 | 15.2 | src/clubhouse/styles/home.css:327 | src/clubhouse/screens/home/LatestRound.tsx:132 | E |
| `.ch-h-round__meta` | Mon 12 Oct · Member tees | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/home.css:336 | src/clubhouse/screens/home/LatestRound.tsx:133 | E |
| `.ch-h-round__score` | 69 | 40/500 | D | 15.1 | 15.1 / 14.7 | 15.2 | src/clubhouse/styles/home.css:346 | src/clubhouse/screens/home/LatestRound.tsx:136 | E |
| `.ch-h-topar.ch-num.is-under` | −3 | 15/600 | D | 5.3 | 5.3 / 5.1 | 7.1 | src/clubhouse/styles/home.css:354 | src/clubhouse/screens/home/LatestRound.tsx:138 | E |
| `.ch-btn.ch-btn--ghost.ch-btn--sm.ch-h-round__more` | My stats | 13/500 | D | 9.1 | 9.1 / 8.8 | 9.3 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |

### Team Stats  (`/clubhouse-preview/stats`; 32 text runs on phone, 133 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title` | Team stats | 34/600 | P | 7.8 | 8.1 / 8.0 | 13.2 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-stm-head` | Varsity | 15/400 | P | 8.5 | 8.6 / 8.5 | 10.9 | src/clubhouse/styles/stats.css:2107 | src/clubhouse/screens/stats/StatsTeamPhone.tsx:95 | A |
| `.ch-hero__title.ch-display` | Team stats | 44/600 | D dark only | 13.3 |  | 13.3 | src/clubhouse/styles/hero-tones.css:17 | src/clubhouse/ui/PageHero.tsx:63 | A |
| `.ch-notice__title` | Some of this page didn’t load (+2) | 15/600 | P D | 14.4 | 14.7 / 14.6 | 15.1 | src/clubhouse/styles/shell.css:794 | src/clubhouse/ui/Notices.tsx:51 | C |
| `.ch-empty-page__title` | No stats yet | 22/600 | P D | 8.0 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/shell.css:598 | src/clubhouse/shell/NotRebuilt.tsx:24 | C |
| `.ch-empty-page__body` | Team and player stats fill in as players p… | 15/400 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/shell.css:607 | src/clubhouse/shell/NotRebuilt.tsx:25 | C |
| `.ch-notice__body` | Some team figures and team putting didn’t … | 14/400 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/shell.css:801 | src/clubhouse/ui/Notices.tsx:52 | C |
| `.ch-nodata` | — | 14/600 | D | 8.2 | 8.7 / 8.4 | 9.8 | src/clubhouse/styles/ui.css:371 | src/clubhouse/ui/NoData.tsx:10 | C |
| `.ch-lg__cell` | +0.4 (+8) | 14/600 | D | 6.8 | 6.8 / 6.6 | 7.8 | src/clubhouse/styles/stats.css:138 | src/clubhouse/screens/stats/StatsTeamIslands.tsx:860 | E |
| `.ch-sv-tr__who` | Theo Marchetti (+6) | 14/500 | D | 10.1 | 10.3 / 10.0 | 13.1 | src/clubhouse/styles/stats.css:7409 | src/clubhouse/screens/stats/TeamRank.tsx:83 | E |
| `.ch-lg__r.ch-lg__r--h` | Player (+6) | 12/500 | D | 8.3 | 8.7 / 8.4 | 9.3 | src/clubhouse/styles/stats.css:743 | src/clubhouse/screens/stats/StatsTeamIslands.tsx:822 | E |
| `.ch-lg__a` | Theo Marchetti (+6) | 14/600 | D | 14.9 | 15.1 / 14.7 | 15.1 | src/clubhouse/styles/stats.css:766 | src/clubhouse/screens/stats/StatsTeamIslands.tsx:847 | E |
| `.ch-stm-panel__h` | The round (+5) | 13/400 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:2216 | src/clubhouse/screens/stats/StatsPlayerPhone.tsx:338 | E |
| `.ch-num.ch-lg__ch` | +0.6 (+5) | 13/500 | D | 15.1 | 15.1 / 14.7 | 15.2 | src/clubhouse/styles/stats.css:6257 | src/clubhouse/routes/round-continue.tsx:58 | E |
| `.ch-line__t` | 73.0 (+4) | 12/500 | P | 14.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/ui.css:1846 | src/clubhouse/ui/charts/Line.tsx:313 | E |
| `.ch-sv-tr__tick.ch-num` | −2 (+4) | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/stats.css:7474 | src/clubhouse/screens/stats/TeamRank.tsx:163 | E |
| `.ch-pg-band` | 0–3 ft (+4) | 12/500 | D | 15.1 | 15.1 / 14.8 | 15.2 | src/clubhouse/styles/stats.css:1056 | src/clubhouse/screens/stats/charts.tsx:176 | E |
| `.ch-best__k` | Low round (+4) | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/stats.css:1081 | src/clubhouse/screens/stats/StatsTeam.tsx:241 | E |
| `.ch-who__m` | Pine Needles · Oct 11 (+4) | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/stats.css:971 | src/clubhouse/screens/stats/StatsTeamIslands.tsx:852 | E |
| `.ch-stm-note` | Lower is better. (+3) | 14/400 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:2231 | src/clubhouse/screens/stats/StatsTeamPhone.tsx:239 | E |
| `.ch-sgt__head` | Who gains and loses (+3) | 20/600 | D | 8.2 | 8.3 / 8.1 | 10.9 | src/clubhouse/styles/stats.css:478 | src/clubhouse/screens/stats/TeamRank.tsx:211 | E |
| `.ch-sv-tr__key` | Player, a round (+3) | 13/400 | D | 8.5 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/stats.css:7488 | src/clubhouse/screens/stats/TeamRank.tsx:173 | E |
| `.ch-lg__key` | Loses strokes (+3) | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/stats.css:906 | src/clubhouse/screens/stats/StatsTeamIslands.tsx:808 | E |
| `.ch-pg-pct.is-below` | 70% (+3) | 12/700 | D | 15.1 | 15.1 / 14.8 | 15.2 | src/clubhouse/styles/stats.css:1057 | src/clubhouse/screens/stats/charts.tsx:179 | E |
| `.ch-who` | Theo Marchetti (+3) | 14/600 | D | 15.1 | 15.1 / 14.7 | 15.2 | src/clubhouse/styles/stats.css:963 | src/clubhouse/screens/stats/StatsTeam.tsx:242 | E |
| `.ch-num.ch-best__v` | 6 (+3) | 15/600 | D | 15.1 | 15.1 / 14.7 | 15.2 | src/clubhouse/styles/stats.css:1092 | src/clubhouse/screens/stats/StatsTeam.tsx:250 | E |
| `.ch-sv-tr__rank.ch-num` | T1 (+2) | 13/500 | D | 8.3 | 8.7 / 8.4 | 10.8 | src/clubhouse/styles/stats.css:7403 | src/clubhouse/screens/stats/TeamRank.tsx:82 | E |
| `.ch-sv-tr__v.ch-num.ch-gain` | +1.7 (+2) | 14/600 | D | 15.1 | 15.1 / 14.7 | 15.2 | src/clubhouse/styles/stats.css:7462 | src/clubhouse/screens/stats/TeamRank.tsx:89 | E |
| `.ch-sgm__l` | Off the tee (+2) | 13/500 | D | 10.1 | 10.3 / 10.0 | 13.1 | src/clubhouse/styles/stats.css:708 | src/clubhouse/screens/stats/StatsTeamIslands.tsx:718 | E |
| `.ch-lg__cell.is-col` | +0.7 (+2) | 14/600 | D | 6.8 | 7.2 / 7.0 | 7.0 | src/clubhouse/styles/stats.css:138 | src/clubhouse/screens/stats/StatsTeamIslands.tsx:860 | E |
| `.ch-num.ch-lg__tot.ch-gain` | +1.7 (+2) | 15/600 | D | 7.2 | 7.2 / 7.0 | 7.8 | src/clubhouse/styles/stats.css:6257 | src/clubhouse/routes/round-continue.tsx:58 | E |
| `.ch-num.ch-lg__tot.ch-loss` | −0.5 (+2) | 15/600 | D | 6.8 | 6.8 / 6.6 | 8.6 | src/clubhouse/styles/stats.css:6257 | src/clubhouse/routes/round-continue.tsx:58 | E |
| `.ch-stm-hero__v.ch-num` | 73 (+1) | 64/600 | P | 14.7 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/stats.css:4400 | src/clubhouse/screens/stats/StatsTeamPhone.tsx:204 | E |
| `.ch-stm-hero__c` | −0.9 (+1) | 17/600 | P | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/stats.css:4406 | src/clubhouse/screens/stats/StatsTeamPhone.tsx:205 | E |
| `.ch-stm-gh` | Players (+1) | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:4541 | src/clubhouse/screens/stats/StatsTeamPhone.tsx:434 | E |
| `.ch-sv-tr__v.ch-num.ch-loss` | −0.9 (+1) | 14/600 | D | 15.1 | 15.1 / 14.7 | 15.2 | src/clubhouse/styles/stats.css:7462 | src/clubhouse/screens/stats/TeamRank.tsx:89 | E |
| `.ch-sv-note` | Hollow dots are early reads ( (+1) | 13/400 | D | 8.6 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/stats.css:5967 | src/clubhouse/screens/stats/ScoreMixBar.tsx:87 | E |
| `.ch-sgm__v.ch-num.ch-gain` | +0.4 (+1) | 28/500 | D | 7.2 | 7.2 / 7.0 | 7.8 | src/clubhouse/styles/stats.css:712 | src/clubhouse/screens/stats/StatsTeamIslands.tsx:719 | E |
| `.ch-who__m.ch-num` | 10 (+1) | 13/400 | D | 8.5 | 8.7 / 8.4 | 10.8 | src/clubhouse/styles/stats.css:971 | src/clubhouse/screens/stats/StatsTeamIslands.tsx:852 | E |
| `.ch-st-card__head` | Season bests (+1) | 20/600 | D | 8.3 | 8.3 / 8.1 | 10.9 | src/clubhouse/styles/stats.css:120 | src/clubhouse/screens/stats/StatsTeam.tsx:229 | E |
| `.ch-hero__line` | 7 (+1) | 16/400 | D dark only | 13.0 |  | 13.0 | src/clubhouse/styles/hero-tones.css:23 | src/clubhouse/ui/PageHero.tsx:66 | E |
| `.ch-stm-hero` | Scoring average | 15/500 | P | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/stats.css:4383 | src/clubhouse/screens/stats/StatsTeamPhone.tsx:201 | E |
| `.ch-stm-hero__par.ch-num` | +1.6 to par | 15/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:4390 | src/clubhouse/screens/stats/StatsTeamPhone.tsx:203 | E |
| `.ch-stm-mean.ch-num` | Mean | 14/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/stats.css:4485 | src/clubhouse/screens/stats/StatsTeamPhone.tsx:270 | E |
| `.ch-btn.ch-btn--ghost.ch-btn--flush-end` | Export | 14/500 | D | 7.2 | 7.2 / 7.0 | 7.7 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-btn.ch-btn--ghost.ch-btn--sm.ch-sf__open.ch-btn--flush-start` | Filter | 13/500 | D | 6.7 | 7.2 / 7.0 | 7.8 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-sv-read` | Select a player to see their likely range;… | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/stats.css:5919 | src/clubhouse/screens/stats/ScoreMixBar.tsx:54 | E |
| `.ch-sv-tr__meanlab.ch-num` | Team | 13/400 | D | 10.3 | 10.3 / 10.0 | 13.1 | src/clubhouse/styles/stats.css:7473 | src/clubhouse/screens/stats/TeamRank.tsx:150 | E |
| `.ch-sv-tr__v.ch-num` | −0.5 | 14/500 | D | 10.3 | 10.3 / 10.0 | 13.1 | src/clubhouse/styles/stats.css:7462 | src/clubhouse/screens/stats/TeamRank.tsx:89 | E |
| `.ch-sv-tr__needs` | Needs 3 rounds | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/stats.css:7452 | src/clubhouse/screens/stats/TeamRank.tsx:87 | E |
| `.ch-sgm__n` | No clear change | 13/400 | D | 8.5 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/stats.css:732 | src/clubhouse/screens/stats/StatsTeamIslands.tsx:736 | E |
| `.ch-sgm__v.ch-num.ch-loss` | −0.3 | 28/500 | D | 6.8 | 6.8 / 6.6 | 8.6 | src/clubhouse/styles/stats.css:712 | src/clubhouse/screens/stats/StatsTeamIslands.tsx:719 | E |
| `.ch-num.ch-lg__tot` | Early read | 15/600 | D | 15.1 | 15.1 / 14.7 | 15.2 | src/clubhouse/styles/stats.css:6257 | src/clubhouse/routes/round-continue.tsx:58 | E |
| `.ch-yb__head` | Team putting | 20/600 | D | 8.2 | 8.3 / 8.2 | 13.4 | src/clubhouse/styles/stats.css:1001 | src/clubhouse/screens/stats/charts.tsx:23 | E |
| `.ch-yb__meta` | Make rate by distance · 423 putts | 13/500 | D | 5.9 | 5.9 / 5.8 | 8.6 | src/clubhouse/styles/stats.css:1006 | src/clubhouse/screens/stats/charts.tsx:28 | E |
| `.ch-pg-pct` | 97% | 12/700 | D | 15.1 | 15.1 / 14.8 | 15.2 | src/clubhouse/styles/stats.css:1057 | src/clubhouse/screens/stats/charts.tsx:179 | E |
| `.ch-yb__note` | 4 bands are below the Tour make rate: 3–5 … | 13/500 | D | 7.2 | 7.2 / 7.1 | 7.8 | src/clubhouse/styles/stats.css:1013 | src/clubhouse/screens/stats/charts.tsx:31 | E |
| `.ch-num.ch-best__v.is-under` | 69 (−3) | 15/600 | D | 5.3 | 5.3 / 5.1 | 7.1 | src/clubhouse/styles/stats.css:1092 | src/clubhouse/screens/stats/StatsTeam.tsx:250 | E |
| `.ch-hero__eyebrow` | Varsity · Fall 2026 | 13/500 | D dark only | 9.1 |  | 9.1 | src/clubhouse/styles/hero-tones.css:13 | src/clubhouse/ui/PageHero.tsx:62 | E |

## Thread: Classes, Roster, coach Home  (4 screens, 137 spots)

### Coach Home  (`/clubhouse-preview/home`; 96 text runs on phone, 136 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-h-head__date` | Wednesday 14 October | 13/500 | P D dark only | 6.2 | 6.5 / 6.5 | 9.1 | src/clubhouse/styles/home.css:16 | src/clubhouse/screens/home/CoachHome.tsx:56 | A |
| `.ch-display` | Good morning, Maya | 44/600 | P D | 7.8 | 8.3 / 8.0 | 13.2 | src/clubhouse/styles/base.css:142 | src/clubhouse/ui/PageHero.tsx:63 | A |
| `.ch-hm-hero__date` | Wednesday 14 October | 13/500 | P | 6.2 | 6.5 / 6.5 | 9.1 | src/clubhouse/styles/home.css:1004 | src/clubhouse/screens/home/PlayerHomePhone.tsx:55 | A |
| `.ch-notice__title` | Some of this page didn’t load (+4) | 14/600 | P D | 14.2 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/shell.css:794 | src/clubhouse/ui/Notices.tsx:51 | C |
| `.ch-notice__body` | This week’s schedule, team scoring and rec… (+1) | 14/400 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/shell.css:801 | src/clubhouse/ui/Notices.tsx:52 | C |
| `.ch-es__title` | Your season starts here | 22/600 | P D | 8.1 | 8.1 / 8.1 | 13.4 | src/clubhouse/styles/ui.css:2207 | src/clubhouse/ui/States.tsx:109 | C |
| `.ch-es__body` | Add your players and your first event. Hom… | 15/400 | P D | 10.0 | 10.0 / 10.0 | 13.1 | src/clubhouse/styles/ui.css:2222 | src/clubhouse/ui/States.tsx:112 | C |
| `.ch-h-legs__t` | Part (+23) | 13/400 | D | 6.8 | 6.8 / 6.5 | 7.8 | src/clubhouse/styles/home.css:4262 | src/clubhouse/screens/home/TeamLegs.tsx:119 | E |
| `.ch-wks__d` | M (+9) | 12/500 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/ui.css:1924 | src/clubhouse/ui/WeekStrip.tsx:102 | E |
| `.ch-num.ch-h-lb__num` | 70.9 (+9) | 15/500 | D | 10.3 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/stats.css:6257 | src/clubhouse/routes/round-continue.tsx:58 | E |
| `.ch-hm-tl__b` | 1:1 with Jonah (+8) | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/home.css:1256 | src/clubhouse/screens/home/DayCard.tsx:198 | E |
| `.ch-hm-form__figs` | Rounds (+8) | 12/500 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/home.css:1478 | src/clubhouse/screens/home/HomePhone.tsx:389 | E |
| `.ch-hm-sec__h` | Up next (+5) | 20/600 | P | 8.0 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/home.css:1195 | src/clubhouse/screens/home/TeamLegs.tsx:208 | E |
| `.ch-h-round__stats` | GIR (+5) | 14/600 | D | 7.2 | 7.2 / 7.0 | 7.8 | src/clubhouse/styles/home.css:441 | src/clubhouse/screens/home/LatestRound.tsx:156 | E |
| `.ch-h-lb__name` | Theo Marchetti (+5) | 15/600 | D | 15.0 | 15.1 / 14.6 | 15.2 | src/clubhouse/styles/home.css:739 | src/clubhouse/screens/home/Leaderboard.tsx:75 | E |
| `.ch-hm-tl__t.ch-num` | 4:45 (+4) | 13/500 | P | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/home.css:1253 | src/clubhouse/screens/home/DayCard.tsx:194 | E |
| `.ch-hm-legs__a` | Theo M. (+4) | 13/500 | P | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/home.css:4461 | src/clubhouse/screens/home/TeamLegs.tsx:189 | E |
| `.ch-h-agenda__t.ch-num` | 4:45 (+4) | 13/500 | D | 8.3 | 8.7 / 8.4 | 8.5 | src/clubhouse/styles/home.css:253 | src/clubhouse/screens/home/Week.tsx:122 | E |
| `.ch-h-agenda__a` | 1:1 with Jonah (+4) | 14/500 | D | 9.1 | 9.1 / 8.7 | 9.3 | src/clubhouse/styles/home.css:258 | src/clubhouse/screens/home/Week.tsx:124 | E |
| `.ch-h-agenda__b` | Range bay 4 (+4) | 13/400 | D | 8.6 | 8.7 / 8.4 | 8.6 | src/clubhouse/styles/home.css:262 | src/clubhouse/screens/home/Week.tsx:126 | E |
| `.ch-h-sec` | The team’s game (+4) | 22/600 | D | 8.2 | 8.3 / 8.0 | 10.9 | src/clubhouse/styles/home.css:585 | src/clubhouse/screens/home/SkeletonDeskHead.tsx:81 | E |
| `.ch-h-legs__who` | Theo M. (+4) | 13/500 | D | 7.2 | 7.2 / 7.0 | 7.8 | src/clubhouse/styles/home.css:4299 | src/clubhouse/screens/home/TeamLegs.tsx:178 | E |
| `.ch-h-lb__row.ch-h-lb__head` | Player (+4) | 13/500 | D | 8.5 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/home.css:602 | src/clubhouse/screens/home/HomeSkeleton.tsx:64 | E |
| `.ch-hm-legs__l` | Off the tee (+3) | 15/500 | P | 14.7 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/home.css:4426 | src/clubhouse/screens/home/TeamLegs.tsx:226 | E |
| `.ch-hm-legs__s.ch-num` | Fairways 61% · Tour 66% (+3) | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/home.css:4440 | src/clubhouse/screens/home/TeamLegs.tsx:228 | E |
| `.ch-h-lb__meta` | Senior (+3) | 13/400 | D | 8.6 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/home.css:748 | src/clubhouse/screens/home/Leaderboard.tsx:90 | E |
| `.ch-hm-legs__sg.ch-num.is-loss` | −0.9 (+2) | 15/600 | P | 6.5 | 6.6 / 6.5 | 8.6 | src/clubhouse/styles/home.css:4432 | src/clubhouse/screens/home/TeamLegs.tsx:227 | E |
| `.ch-hm-rd__b` | Theo Marchetti (+2) | 15/600 | P | 14.7 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/home.css:1546 | src/clubhouse/screens/home/HomePhone.tsx:496 | E |
| `.ch-num.ch-h-legs__sg.is-loss` | −0.9 (+2) | 15/600 | D | 6.8 | 6.8 / 6.5 | 8.6 | src/clubhouse/styles/stats.css:6257 | src/clubhouse/routes/round-continue.tsx:58 | E |
| `.ch-num.ch-h-lb__sg.is-gain` | +1.8 (+2) | 14/600 | D | 7.2 | 7.2 / 7.0 | 7.8 | src/clubhouse/styles/stats.css:6257 | src/clubhouse/routes/round-continue.tsx:58 | E |
| `.ch-h-lb__pos.ch-num` | 4 (+2) | 13/600 | D | 8.3 | 8.7 / 8.4 | 10.8 | src/clubhouse/styles/home.css:689 | src/clubhouse/screens/home/Leaderboard.tsx:83 | E |
| `.ch-hm-link` | Calendar (+1) | 13/500 | P | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/home.css:1219 | src/clubhouse/screens/home/TeamLegs.tsx:211 | E |
| `.ch-hm-form__top` | 73 (+1) | 56/500 | P | 14.7 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/home.css:1402 | src/clubhouse/screens/home/HomePhone.tsx:371 | E |
| `.ch-hm-delta.ch-num` | −0.9 (+1) | 12/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/home.css:1418 | src/clubhouse/screens/home/HomePhone.tsx:376 | E |
| `.ch-hm-legs__who` | gains most (+1) | 13/400 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/home.css:4456 | src/clubhouse/screens/home/TeamLegs.tsx:188 | E |
| `.ch-wks__d.is-today` | W (+1) | 12/500 | P | 8.4 | 8.4 / 8.3 | 9.3 | src/clubhouse/styles/ui.css:1924 | src/clubhouse/ui/WeekStrip.tsx:102 | E |
| `.ch-hm-week__n` | Friday (+1) | 13/600 | P | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/home.css:1496 | src/clubhouse/screens/home/HomePhone.tsx:432 | E |
| `.ch-hm-rd__m` | Oakmont CC (+1) | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/home.css:1567 | src/clubhouse/screens/home/HomePhone.tsx:527 | E |
| `.ch-hm-rd__when` | Mon 12 Oct (+1) | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/home.css:1584 | src/clubhouse/screens/home/HomePhone.tsx:529 | E |
| `.ch-hm-score.ch-num.is-under` | 70 (+1) | 12/600 | P | 5.7 | 5.7 / 5.7 | 7.1 | src/clubhouse/styles/home.css:1600 | src/clubhouse/screens/home/PlayerHomePhone.tsx:210 | E |
| `.ch-hm-score.ch-num` | 78 (+1) | 12/600 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/home.css:1600 | src/clubhouse/screens/home/PlayerHomePhone.tsx:210 | E |
| `.ch-h-pane__head` | This week (+1) | 20/600 | D | 8.1 | 8.3 / 8.0 | 13.4 | src/clubhouse/styles/home.css:142 | src/clubhouse/screens/home/Week.tsx:59 | E |
| `.ch-h-rail__name` | Sofia Alvarez (+1) | 14/600 | D | 15.1 | 15.1 / 14.6 | 15.2 | src/clubhouse/styles/home.css:538 | src/clubhouse/screens/home/LatestRound.tsx:217 | E |
| `.ch-h-rail__meta` | Oakmont CC · Mon 12 Oct (+1) | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/home.css:545 | src/clubhouse/screens/home/LatestRound.tsx:218 | E |
| `.ch-h-rail__score.ch-num` | 70 (+1) | 17/600 | D | 15.1 | 15.1 / 14.6 | 15.2 | src/clubhouse/styles/home.css:553 | src/clubhouse/screens/home/LatestRound.tsx:220 | E |
| `.ch-btn.ch-btn--ghost.ch-btn--sm` | Team stats (+1) | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-num.ch-h-lb__num.is-under` | −1.1 (+1) | 15/500 | D | 5.3 | 5.3 / 5.1 | 7.1 | src/clubhouse/styles/stats.css:6257 | src/clubhouse/routes/round-continue.tsx:58 | E |
| `.ch-num.ch-h-lb__sg.is-loss` | −0.9 (+1) | 14/600 | D | 6.8 | 6.8 / 6.5 | 8.6 | src/clubhouse/styles/stats.css:6257 | src/clubhouse/routes/round-continue.tsx:58 | E |
| `.ch-hm-hero` | Good morning, Maya | 34/600 | P | 7.9 | 8.1 / 8.0 | 13.1 | src/clubhouse/styles/home.css:992 | src/clubhouse/screens/home/PlayerHomePhone.tsx:54 | E |
| `.ch-hm-hero__brief` | Eli hasn’t posted a round in 9 days. Quali… | 15/400 | P | 9.8 | 10.0 / 9.9 | 13.0 | src/clubhouse/styles/home.css:1022 | src/clubhouse/screens/home/HomePhone.tsx:78 | E |
| `.ch-hm-legs__sg.ch-num.is-gain` | +0.4 | 15/600 | P | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/home.css:4432 | src/clubhouse/screens/home/TeamLegs.tsx:227 | E |
| `.ch-hm-legs__c.is-gain` | Better than previous 10 | 12/400 | P | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/home.css:4447 | src/clubhouse/screens/home/TeamLegs.tsx:229 | E |
| `.ch-hm-legs__c` | No clear change vs previous 10 | 12/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/home.css:4447 | src/clubhouse/screens/home/TeamLegs.tsx:229 | E |
| `.ch-hm-legs__c.is-loss` | Worse than previous 10 | 12/400 | P | 6.5 | 6.6 / 6.5 | 8.6 | src/clubhouse/styles/home.css:4447 | src/clubhouse/screens/home/TeamLegs.tsx:229 | E |
| `.ch-h-head__sub` | Eli hasn’t posted a round in 9 days. Quali… | 16/400 | D | 10.2 | 10.3 / 9.9 | 13.0 | src/clubhouse/styles/home.css:28 | src/clubhouse/screens/home/CoachHome.tsx:58 | E |
| `.ch-h-agenda__label` | Today | 13/500 | D | 8.3 | 8.7 / 8.4 | 10.8 | src/clubhouse/styles/home.css:233 | src/clubhouse/screens/home/Week.tsx:96 | E |
| `.ch-h-agenda__label.ch-h-agenda__label--later` | Later this week | 13/500 | D | 8.5 | 8.7 / 8.4 | 10.8 | src/clubhouse/styles/home.css:233 | src/clubhouse/screens/home/Week.tsx:96 | E |
| `.ch-h-round__name` | Theo Marchetti | 15/600 | D | 15.1 | 15.1 / 14.6 | 15.2 | src/clubhouse/styles/home.css:327 | src/clubhouse/screens/home/LatestRound.tsx:132 | E |
| `.ch-h-round__meta` | Oakmont CC · Mon 12 Oct · Member tees | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/home.css:336 | src/clubhouse/screens/home/LatestRound.tsx:133 | E |
| `.ch-h-round__score` | 70 | 40/500 | D | 14.7 | 15.1 / 14.6 | 14.9 | src/clubhouse/styles/home.css:346 | src/clubhouse/screens/home/LatestRound.tsx:136 | E |
| `.ch-h-topar.ch-num.is-under` | −2 | 15/600 | D | 5.1 | 5.3 / 5.1 | 7.0 | src/clubhouse/styles/home.css:354 | src/clubhouse/screens/home/LatestRound.tsx:138 | E |
| `.ch-btn.ch-btn--ghost.ch-btn--sm.ch-h-round__more` | Theo | 13/500 | D | 9.1 | 9.1 / 8.7 | 9.3 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-h-rail__title` | Recent rounds | 13/500 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/home.css:478 | src/clubhouse/screens/home/LatestRound.tsx:201 | E |
| `.ch-h-rail__par.ch-num.is-under` | −2 | 13/600 | D | 5.3 | 5.3 / 5.1 | 7.1 | src/clubhouse/styles/home.css:560 | src/clubhouse/screens/home/LatestRound.tsx:221 | E |
| `.ch-h-rail__par.ch-num` | +6 | 13/600 | D | 10.3 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/home.css:560 | src/clubhouse/screens/home/LatestRound.tsx:221 | E |
| `.ch-num.ch-h-legs__sg.is-gain` | +0.4 | 15/600 | D | 7.2 | 7.2 / 7.0 | 7.8 | src/clubhouse/styles/stats.css:6257 | src/clubhouse/routes/round-continue.tsx:58 | E |
| `.ch-h-legs__chg.is-gain` | Better than previous 10 | 13/400 | D | 7.2 | 7.2 / 7.0 | 7.8 | (see component) | src/clubhouse/screens/home/TeamLegs.tsx:148 | E |
| `.ch-h-legs__chg` | No clear change vs previous 10 | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | (see component) | src/clubhouse/screens/home/TeamLegs.tsx:148 | E |
| `.ch-h-legs__chg.is-loss` | Worse than previous 10 | 13/400 | D | 6.8 | 6.8 / 6.5 | 8.6 | (see component) | src/clubhouse/screens/home/TeamLegs.tsx:148 | E |
| `.ch-h-lb__status.is-steady` | Steady | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/home.css:766 | src/clubhouse/screens/home/Leaderboard.tsx:92 | E |
| `.ch-h-lb__status.is-quiet` | No rounds 9 days | 13/400 | D | 6.8 | 6.8 / 6.5 | 8.6 | src/clubhouse/styles/home.css:766 | src/clubhouse/screens/home/Leaderboard.tsx:92 | E |
| `.ch-h-lb__status.is-early` | Early read | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/home.css:766 | src/clubhouse/screens/home/Leaderboard.tsx:92 | E |
| `.ch-num.ch-h-lb__sg.is-early` | Early read | 13/500 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/stats.css:6257 | src/clubhouse/routes/round-continue.tsx:58 | E |
| `.ch-btn.ch-btn--secondary` | Message team | 14/500 | D dark only | 13.6 |  | 13.6 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-h-agenda__rsvp.ch-num` | 5 of 6 going · Eli hasn’t replied | 13/400 | D dark only | 8.6 |  | 8.6 | src/clubhouse/styles/home.css:4333 | src/clubhouse/screens/home/Week.tsx:132 | E |
| `.ch-btn.ch-btn--ghost.ch-btn--sm.ch-h-agenda__nudge` | Nudge Eli | 13/500 | D dark only | 7.2 |  | 7.2 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |

### Classes  (`/clubhouse-preview/classes`; 53 text runs on phone, 57 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title.ch-cl-title` | Classes | 34/600 | P | 7.8 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-sec__title` | Your classes | 20/600 | P D | 8.0 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/home.css:3222 | src/clubhouse/ui/Section.tsx:34 | B |
| `.ch-es__title` | Add your class schedule | 22/600 | P D | 8.0 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/ui.css:2207 | src/clubhouse/ui/States.tsx:109 | C |
| `.ch-es__body` | Import a screenshot of your schedule and w… | 15/400 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/ui.css:2222 | src/clubhouse/ui/States.tsx:112 | C |
| `.ch-notice__title` | Your classes didn’t load | 14/600 | P D | 14.2 | 14.7 / 14.7 | 15.2 | src/clubhouse/styles/shell.css:794 | src/clubhouse/ui/Notices.tsx:51 | C |
| `.ch-notice__body` | Nothing is lost. Your classes are still sa… | 14/400 | P D | 9.9 | 10.0 / 10.0 | 13.1 | src/clubhouse/styles/shell.css:801 | src/clubhouse/ui/Notices.tsx:52 | C |
| `.ch-cl-card__code` | 310 (+4) | 15/500 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/classes.css:375 | src/clubhouse/screens/classes/parts.tsx:271 | E |
| `.ch-cl-card__name` | Intermediate Macroeconomics (+4) | 17/600 | P D | 14.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/classes.css:399 | src/clubhouse/screens/classes/parts.tsx:277 | E |
| `.ch-cl-card__prof` | Prof. M. Hart (+4) | 13/400 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/classes.css:1682 | src/clubhouse/screens/classes/parts.tsx:278 | E |
| `.ch-cl-card__week` | 10:10 (+4) | 12/600 | P D | 13.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/classes.css:437 | src/clubhouse/screens/classes/parts.tsx:284 | E |
| `.ch-cl-card__loc` | Gardner Hall 008 (+4) | 12/500 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/classes.css:473 | src/clubhouse/screens/classes/parts.tsx:301 | E |
| `.ch-cl-tthead__days` | Mon (+3) | 13/600 | D | 7.8 | 8.3 / 8.1 | 13.1 | src/clubhouse/styles/classes.css:2082 | src/clubhouse/screens/classes/parts.tsx:64 | E |
| `.ch-cl-over__r` | STAT 201 (+2) | 12/400 | P D | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/classes.css:655 | src/clubhouse/screens/classes/parts.tsx:392 | E |
| `.ch-cl-tb__wk` | Week (+2) | 13/500 | D | 8.0 | 8.7 / 8.4 | 10.8 | src/clubhouse/styles/classes.css:166 | src/clubhouse/screens/classes/parts.tsx:159 | E |
| `.ch-cl-today__t.ch-num` | 10:10–11:25 AM (+1) | 14/600 | P | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/classes.css:1423 | src/clubhouse/screens/classes/parts.tsx:489 | E |
| `.ch-cl-today__n` | Intermediate Macroeconomics (+1) | 16/600 | P | 14.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/classes.css:1429 | src/clubhouse/screens/classes/parts.tsx:490 | E |
| `.ch-cl-today__m` | Gardner Hall 008 · ECON 310 (+1) | 13/400 | P | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/classes.css:1436 | src/clubhouse/screens/classes/parts.tsx:491 | E |
| `.ch-cl-card__cr` | 3 (+1) | 12/500 | P D | 8.3 | 8.4 / 8.3 | 10.8 | src/clubhouse/styles/classes.css:389 | src/clubhouse/screens/classes/parts.tsx:275 | E |
| `.ch-cl-add` | Add a class (+1) | 13/400 | P D | 8.4 | 8.4 / 8.3 | 9.3 | src/clubhouse/styles/classes.css:486 | src/clubhouse/screens/classes/parts.tsx:339 | E |
| `.ch-cl-over__h` | A team event overlaps your classes (+1) | 20/600 | P D | 8.0 | 8.1 / 8.0 | 10.9 | src/clubhouse/styles/classes.css:589 | src/clubhouse/screens/classes/parts.tsx:371 | E |
| `.ch-cl-over__e` | Pinehurst qualifier (+1) | 12/400 | P D | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/classes.css:621 | src/clubhouse/screens/classes/parts.tsx:383 | E |
| `.ch-cl-card2.ch-cl-note` | What your coach sees (+1) | 13/400 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/classes.css:541 | src/clubhouse/screens/classes/parts.tsx:364 | E |
| `.ch-cl-tb__over` | 2 (+1) | 28/600 | D | 5.2 | 5.2 / 5.0 | 8.6 | src/clubhouse/styles/classes.css:219 | src/clubhouse/screens/classes/parts.tsx:145 | E |
| `.ch-cl-today` | Today | 20/600 | P | 8.0 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/classes.css:1393 | src/clubhouse/screens/classes/parts.tsx:482 | E |
| `.ch-btn.ch-btn--ghost.ch-cl-danger` | Delete all classes | 14/500 | P | 5.1 | 5.1 / 5.1 | 7.1 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-cl-tb__k.ch-num` | 13 credits · 5 classes | 12/600 | D | 9.9 | 10.3 / 10.0 | 13.2 | src/clubhouse/styles/classes.css:195 | src/clubhouse/screens/classes/parts.tsx:175 | E |
| `.ch-cl-tthead__lead` | This week | 13/500 | D | 8.4 | 8.7 / 8.4 | 10.8 | src/clubhouse/styles/classes.css:2066 | src/clubhouse/screens/classes/parts.tsx:63 | E |
| `.ch-btn.ch-btn--ghost.ch-cl-danger.ch-btn--flush-end` | Delete all classes | 14/500 | D | 5.3 | 5.3 / 5.1 | 7.1 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-cl-k` | Fall 2026 | 12/500 | P D dark only | 6.6 | 6.6 / 6.6 | 9.0 | src/clubhouse/styles/classes.css:46 | src/clubhouse/screens/classes/ClassesView.tsx:358 | E |
| `.ch-cl-h` | Classes | 44/600 | D dark only | 13.3 |  | 13.3 | src/clubhouse/styles/classes.css:51 | src/clubhouse/screens/classes/ClassesSkeleton.tsx:10 | E |

### Roster (coach)  (`/clubhouse-preview/roster`; 42 text runs on phone, 19 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title` | Roster | 34/600 | P | 7.8 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-display` | Roster | 44/600 | D dark only | 13.2 |  | 13.2 | src/clubhouse/styles/base.css:142 | src/clubhouse/ui/PageHero.tsx:63 | A |
| `.ch-es__title` | No players yet | 28/600 | P D | 7.9 | 8.1 / 8.0 | 13.3 | src/clubhouse/styles/ui.css:2207 | src/clubhouse/ui/States.tsx:109 | C |
| `.ch-es__body` | Players fill this list themselves: they jo… | 15/400 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/ui.css:2222 | src/clubhouse/ui/States.tsx:112 | C |
| `.ch-rsm-row__b` | Theo Marchetti (+16) | 13/400 | P | 6.5 | 6.6 / 6.5 | 7.8 | src/clubhouse/styles/roster.css:1332 | src/clubhouse/screens/roster/RosterPhone.tsx:409 | E |
| `.ch-rsm-row__v` | 70.9 (+15) | 12/500 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/roster.css:1368 | src/clubhouse/screens/roster/RosterPhone.tsx:428 | E |
| `.ch-rs-head` | 73.0 (+3) | 16/400 | D | 9.8 | 10.3 / 9.9 | 13.0 | src/clubhouse/styles/roster.css:31 | src/clubhouse/screens/roster/Roster.tsx:471 | E |
| `.ch-rs-req__who` | Grace Liu (+3) | 13/400 | D | 8.6 | 8.7 / 8.3 | 10.9 | src/clubhouse/styles/roster.css:106 | src/clubhouse/screens/roster/RosterRequests.tsx:65 | E |
| `.ch-rsm-banner__b` | Join requests (+1) | 13/400 | P | 9.9 | 10.0 / 9.9 | 13.0 | src/clubhouse/styles/roster.css:1776 | src/clubhouse/screens/roster/RosterPhone.tsx:473 | E |
| `.ch-rs-req__head` | 2 (+1) | 20/600 | D | 7.6 | 8.3 / 8.0 | 10.9 | src/clubhouse/styles/roster.css:70 | src/clubhouse/screens/roster/RosterRequests.tsx:51 | E |
| `.ch-pill.ch-num` | Inactive · 1 (+1) | 13/500 | D | 10.3 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/roster.css:238 | src/clubhouse/screens/stats/StatsFilter.tsx:332 | E |
| `.ch-rsm-kicker` | Varsity (+1) | 13/500 | P | 6.6 | 6.6 / 6.6 | 9.1 | src/clubhouse/styles/roster.css:1234 | src/clubhouse/screens/roster/RosterPhone.tsx:154 | E |
| `.ch-rsm-sort` | Sort by | 13/500 | P | 8.2 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/roster.css:1245 | src/clubhouse/screens/roster/RosterPhone.tsx:236 | E |
| `.ch-rsm-sec` | Inactive | 20/600 | P | 8.0 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/roster.css:1275 | src/clubhouse/screens/roster/RosterPhone.tsx:351 | E |
| `.ch-btn.ch-btn--ghost` | Export | 14/500 | D | 7.2 | 7.2 / 7.0 | 7.7 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-btn.ch-btn--ghost.ch-btn--sm` | Decline | 13/500 | D | 7.0 | 7.2 / 7.0 | 7.7 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-rs-attn__l` | Needs a look | 13/500 | D | 8.4 | 8.7 / 8.3 | 10.8 | src/clubhouse/styles/roster.css:123 | src/clubhouse/screens/roster/Roster.tsx:537 | E |
| `.ch-rs-team__name` | Varsity · 2026–27 | 14/500 | D dark only | 10.8 |  | 10.8 | src/clubhouse/styles/roster.css:44 | src/clubhouse/screens/roster/Roster.tsx:474 | E |

### Roster (player)  (`/clubhouse-preview/roster-player`; 30 text runs on phone, 10 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title` | Roster | 34/600 | P | 7.8 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-display` | Roster | 44/600 | D dark only | 13.2 |  | 13.2 | src/clubhouse/styles/base.css:142 | src/clubhouse/ui/PageHero.tsx:63 | A |
| `.ch-rsm-row__b` | Maya Reyes (+15) | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/roster.css:1332 | src/clubhouse/screens/roster/RosterPhone.tsx:409 | E |
| `.ch-rsm-row__v` | 1.9 (+7) | 12/500 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/roster.css:1368 | src/clubhouse/screens/roster/RosterPhone.tsx:428 | E |
| `.ch-rs-row.ch-rs-row--head.ch-well-soft` | Coach (+1) | 13/500 | D | 7.9 | 8.5 / 8.4 | 10.8 | src/clubhouse/styles/roster.css:542 | src/clubhouse/screens/roster/TeamRoster.tsx:171 | E |
| `.ch-rs-who.ch-rs-who--static` | Maya Reyes (+1) | 14/600 | D | 14.4 | 14.9 / 14.7 | 15.2 | src/clubhouse/styles/roster.css:596 | src/clubhouse/screens/roster/TeamRoster.tsx:178 | E |
| `.ch-rs-num2` | Head coach (+1) | 14/500 | D | 10.1 | 10.1 / 10.0 | 12.9 | src/clubhouse/styles/roster.css:640 | src/clubhouse/screens/roster/Roster.tsx:850 | E |
| `.ch-rsm-kicker` | Varsity (+1) | 13/500 | P | 6.7 | 6.7 / 6.6 | 9.2 | src/clubhouse/styles/roster.css:1234 | src/clubhouse/screens/roster/RosterPhone.tsx:154 | E |
| `.ch-rs-head` | 7 (+1) | 16/400 | D dark only | 13.0 |  | 13.0 | src/clubhouse/styles/roster.css:31 | src/clubhouse/screens/roster/Roster.tsx:471 | E |
| `.ch-rsm-sec.is-first` | Coaches | 20/600 | P | 7.9 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/roster.css:1275 | src/clubhouse/screens/roster/RosterPhone.tsx:351 | E |
| `.ch-rsm-sec` | Players | 20/600 | P | 8.0 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/roster.css:1275 | src/clubhouse/screens/roster/RosterPhone.tsx:351 | E |
| `.ch-rsm-sort` | Sort by | 13/500 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/roster.css:1245 | src/clubhouse/screens/roster/RosterPhone.tsx:236 | E |
| `.ch-rs-team__name` | Varsity · 2026–27 | 14/500 | D dark only | 10.8 |  | 10.8 | src/clubhouse/styles/roster.css:44 | src/clubhouse/screens/roster/Roster.tsx:474 | E |

## Thread: None (not covered)  (34 screens, 569 spots)

None of the four redesigns covers these screens. Flat page fixes the gradient under all of them; on phone, the E spots still need someone to move them into cards.

### CoachHelm Standing / Deep dive (player)  (`/clubhouse-preview/coachhelm-views`; 196 text runs on phone, 243 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title.ch-hl-h__t` | CoachHelm | 34/600 | P | 12.6 | 13.0 / 11.5 | 13.4 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-hs-r__f` | You (+43) | 20/600 | P D dark only | 6.5 | 6.6 / 5.8 | 8.8 | src/clubhouse/styles/coachhelm-standing.css:210 | src/clubhouse/screens/coachhelm/views/Standing.tsx:115 | E |
| `.ch-hs-r__h` | Strokes gained: total (+15) | 15/600 | P D dark only | 13.3 | 14.9 / 13.2 | 14.5 | src/clubhouse/styles/coachhelm-standing.css:126 | src/clubhouse/screens/coachhelm/views/Standing.tsx:96 | E |
| `.ch-hs-vs.is-behind` | 2.1 strokes behind the Tour (+14) | 13/500 | P D dark only | 6.5 | 6.6 / 5.8 | 9.9 | src/clubhouse/styles/coachhelm-standing.css:146 | src/clubhouse/screens/coachhelm/views/Standing.tsx:99 | E |
| `.ch-hg-m__how` | How it is measured (+8) | 13/400 | P D dark only | 13.1 | 14.7 / 13.0 | 13.1 | src/clubhouse/styles/coachhelm-profile.css:195 | src/clubhouse/screens/coachhelm/views/HowYouPlay.tsx:95 | E |
| `.ch-hs-g__t` | Where strokes go (+7) | 20/600 | P D dark only | 8.7 | 8.8 / 7.8 | 9.3 | src/clubhouse/styles/coachhelm-standing.css:770 | src/clubhouse/screens/coachhelm/views/Standing.tsx:269 | E |
| `.ch-hs-g__h` | Strokes a round against (+7) | 13/400 | P D dark only | 10.9 | 14.7 / 13.0 | 10.9 | src/clubhouse/styles/coachhelm-standing.css:97 | src/clubhouse/screens/coachhelm/views/Standing.tsx:268 | E |
| `.ch-hg-m__fig` | 71% left (+7) | 20/600 | P D dark only | 6.6 | 6.6 / 5.8 | 9.9 | src/clubhouse/styles/coachhelm-profile.css:146 | src/clubhouse/screens/coachhelm/views/HowYouPlay.tsx:82 | E |
| `.ch-hg-sc__e` | Left (+7) | 12/400 | P D dark only | 10.8 | 14.7 / 13.0 | 10.8 | src/clubhouse/styles/coachhelm-profile.css:280 | src/clubhouse/screens/coachhelm/views/HowYouPlay.tsx:50 | E |
| `.ch-hd-it__v.ch-num` | 23 pts (+7) | 15/600 | P | 5.4 | 5.4 / 5.4 | 9.3 | src/clubhouse/styles/coachhelm-dive.css:139 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:562 | E |
| `.ch-hd-read` | What (+7) | 13/600 | D dark only | 9.3 |  | 9.3 | src/clubhouse/styles/coachhelm-dive.css:258 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:337 | E |
| `.ch-hd-r__d.ch-num` | Sep 28 (+7) | 13/600 | D dark only | 9.3 |  | 9.3 | src/clubhouse/styles/coachhelm-dive.css:541 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:221 | E |
| `.ch-hd-r__s.ch-num` | 74 (+7) | 15/600 | D dark only | 13.1 |  | 13.1 | src/clubhouse/styles/coachhelm-dive.css:558 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:226 | E |
| `.ch-hd-it__b` | Downhill putts from 4–6 ft: a real penalty (+6) | 12/600 | P | 5.4 | 5.4 / 5.4 | 9.3 | src/clubhouse/styles/coachhelm-dive.css:126 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:555 | E |
| `.ch-hd-sec__h` | What was measured (+5) | 16/600 | D dark only | 9.3 |  | 9.3 | src/clubhouse/styles/coachhelm-dive.css:320 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:118 | E |
| `.ch-hd-dx__d` | Downhill make rate, 4-6 ft (+4) | 12/400 | D dark only | 10.9 |  | 10.9 | src/clubhouse/styles/coachhelm-dive.css:632 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:260 | E |
| `.ch-hs-ld__h` | Off the tee (+3) | 15/600 | P D dark only | 14.9 | 14.9 / 13.2 | 15.1 | src/clubhouse/styles/coachhelm-standing.css:584 | src/clubhouse/screens/coachhelm/views/Standing.tsx:214 | E |
| `.ch-hs-ld__v.ch-num` | −0.4 (+3) | 17/600 | P D dark only | 6.6 | 6.6 / 5.8 | 9.9 | src/clubhouse/styles/coachhelm-standing.css:595 | src/clubhouse/screens/coachhelm/views/Standing.tsx:216 | E |
| `.ch-hs-n.ch-num` | 12 rounds (+3) | 13/500 | P D dark only | 10.3 | 14.7 / 13.0 | 10.3 | src/clubhouse/styles/coachhelm-standing.css:143 | src/clubhouse/screens/coachhelm/views/Standing.tsx:103 | E |
| `.ch-hg-m__k` | Miss pattern (+3) | 12/500 | P D dark only | 10.8 | 14.7 / 13.0 | 10.8 | src/clubhouse/styles/coachhelm-profile.css:100 | src/clubhouse/screens/coachhelm/views/HowYouPlay.tsx:64 | E |
| `.ch-hg-m__word` | Left bias (+3) | 22/600 | P D dark only | 6.5 | 6.6 / 5.8 | 9.9 | src/clubhouse/styles/coachhelm-profile.css:132 | src/clubhouse/screens/coachhelm/views/HowYouPlay.tsx:80 | E |
| `.ch-hg-m__mean` | Which side your approach misses finish on.… (+3) | 14/400 | P D dark only | 13.1 | 14.7 / 13.0 | 13.1 | src/clubhouse/styles/coachhelm-profile.css:164 | src/clubhouse/screens/coachhelm/views/HowYouPlay.tsx:75 | E |
| `.ch-hl-bars` | Downhill (+3) | 14/500 | D dark only | 15.2 |  | 15.2 | src/clubhouse/styles/coachhelm.css:130 | src/clubhouse/screens/coachhelm/parts.tsx:85 | E |
| `.ch-hl-ev__f` | 75 putts (+3) | 12/400 | D dark only | 10.9 |  | 10.9 | src/clubhouse/styles/coachhelm-dive.css:1129 | src/clubhouse/screens/coachhelm/parts.tsx:109 | E |
| `.ch-hd-r__c` | Oak Hollow (+3) | 12/400 | D dark only | 10.9 |  | 10.9 | src/clubhouse/styles/coachhelm-dive.css:553 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:222 | E |
| `.ch-hv-chip` | Deep dive (+2) | 14/500 | P | 12.8 | 14.7 / 13.0 | 12.8 | src/clubhouse/styles/coachhelm-views.css:28 | src/clubhouse/screens/coachhelm/views/PlayerHelmTabs.tsx:57 | E |
| `.ch-hs-pct` | Top quartile on your team (+2) | 13/400 | P D dark only | 10.4 | 14.7 / 13.0 | 10.4 | src/clubhouse/styles/coachhelm-standing.css:155 | src/clubhouse/screens/coachhelm/views/Standing.tsx:100 | E |
| `.ch-hs-proj` | About (+2) | 13/600 | P D dark only | 6.5 | 6.6 / 5.8 | 9.9 | src/clubhouse/styles/coachhelm-standing.css:253 | src/clubhouse/screens/coachhelm/views/Standing.tsx:140 | E |
| `.ch-hs-note` | Tour proximity counts every approach, miss… (+2) | 12/400 | P D dark only | 10.4 | 14.7 / 13.0 | 10.4 | src/clubhouse/styles/coachhelm-standing.css:246 | src/clubhouse/screens/coachhelm/views/Standing.tsx:130 | E |
| `.ch-hg-m.is-plain` | Miss-side bias (+2) | 14/600 | P D dark only | 13.1 | 14.7 / 13.0 | 13.1 | src/clubhouse/styles/coachhelm-profile.css:128 | src/clubhouse/screens/coachhelm/views/HowYouPlay.tsx:63 | E |
| `.ch-hd-grp__h` | Putting (+2) | 13/600 | P | 10.9 | 13.0 / 12.9 | 10.9 | src/clubhouse/styles/coachhelm-dive.css:51 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:604 | E |
| `.ch-hd-tr__k` | Since it was first seen (+2) | 13/500 | D dark only | 10.9 |  | 10.9 | src/clubhouse/styles/coachhelm-dive.css:400 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:143 | E |
| `.ch-hl-h` | Where you stand on every stat CoachHelm tr… (+1) | 15/400 | P | 13.1 | 14.7 / 13.0 | 13.1 | src/clubhouse/styles/coachhelm.css:59 | src/clubhouse/screens/coachhelm/CoachHelmSkeleton.tsx:158 | E |
| `.ch-hs-ld__n.ch-num` | 1 (+1) | 14/500 | P D dark only | 10.9 | 14.7 / 13.0 | 10.9 | src/clubhouse/styles/coachhelm-standing.css:645 | src/clubhouse/screens/coachhelm/views/Standing.tsx:231 | E |
| `.ch-hg-sec__h` | How you play (+1) | 13/400 | P D dark only | 10.9 | 13.0 / 11.5 | 10.9 | src/clubhouse/styles/coachhelm-profile.css:35 | src/clubhouse/screens/coachhelm/views/HowYouPlay.tsx:123 | E |
| `.ch-hg-m__f` | Solid read (+1) | 12/400 | P D dark only | 10.8 | 14.7 / 13.0 | 10.8 | src/clubhouse/styles/coachhelm-profile.css:182 | src/clubhouse/screens/coachhelm/views/HowYouPlay.tsx:90 | E |
| `.ch-hv-next` | Keep reading (+1) | 20/600 | P D dark only | 12.9 | 13.0 / 11.5 | 13.1 | src/clubhouse/styles/coachhelm-views.css:112 | src/clubhouse/screens/coachhelm/views/KeepReading.tsx:10 | E |
| `.ch-hv-link` | Deep dive (+1) | 13/400 | P D dark only | 10.9 | 14.7 / 13.0 | 10.9 | src/clubhouse/styles/coachhelm-views.css:123 | src/clubhouse/screens/coachhelm/views/KeepReading.tsx:14 | E |
| `.ch-hl-h` | Where you stand on every stat CoachHelm tr… (+1) | 16/400 | D dark only | 13.1 |  | 13.1 | src/clubhouse/styles/coachhelm.css:59 | src/clubhouse/screens/coachhelm/CoachHelmSkeleton.tsx:158 | E |
| `.ch-hd-read__drill` | Downhill ladder (+1) | 15/400 | D dark only | 10.9 |  | 10.9 | src/clubhouse/styles/coachhelm-dive.css:284 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:366 | E |
| `.ch-hd-meas__v` | 23 pts (+1) | 44/600 | D dark only | 9.9 |  | 9.9 | src/clubhouse/styles/coachhelm-dive.css:344 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:519 | E |
| `.ch-hd-tr` | From 31% to 23%, down 8 pts (+1) | 15/600 | D dark only | 9.3 |  | 9.3 | src/clubhouse/styles/coachhelm-dive.css:404 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:140 | E |
| `.ch-hd-strip__c.ch-num` | +6 (+1) | 14/600 | D dark only | 9.3 |  | 9.3 | src/clubhouse/styles/coachhelm-dive.css:433 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:167 | E |
| `.ch-hd-plan__b` | Focus area made from this (+1) | 12/500 | D dark only | 10.9 |  | 10.9 | src/clubhouse/styles/coachhelm-dive.css:725 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:402 | E |
| `.ch-hv-chip.is-link` | Development | 14/500 | P | 8.8 | 8.8 / 7.8 | 9.0 | src/clubhouse/styles/coachhelm-views.css:28 | src/clubhouse/screens/coachhelm/views/PlayerHelmTabs.tsx:57 | E |
| `.ch-hs-ld__why` | Because | 14/600 | P D dark only | 15.1 | 15.7 / 13.9 | 15.1 | src/clubhouse/styles/coachhelm-standing.css:632 | src/clubhouse/screens/coachhelm/views/Standing.tsx:229 | E |
| `.ch-hs-ld__none` | No open read here. | 13/400 | P D dark only | 10.8 | 14.7 / 13.0 | 10.8 | src/clubhouse/styles/coachhelm-standing.css:622 | src/clubhouse/screens/coachhelm/views/Standing.tsx:251 | E |
| `.ch-hs-vs.is-ahead` | 3 ft closer than your team average | 13/500 | P D dark only | 7.8 | 8.8 / 7.8 | 8.8 | src/clubhouse/styles/coachhelm-standing.css:146 | src/clubhouse/screens/coachhelm/views/Standing.tsx:99 | E |
| `.ch-hl-note` | Ranks come from your team’s refresh overni… | 13/400 | P D dark only | 10.9 | 14.7 / 13.0 | 10.9 | src/clubhouse/styles/coachhelm.css:588 | src/clubhouse/screens/coachhelm/Proposals.tsx:140 | E |
| `.ch-hg-lede__s` | Mixed off the tee · thrives on par-3 holes… | 16/500 | P D dark only | 15.2 | 15.7 / 13.9 | 15.2 | src/clubhouse/styles/coachhelm-profile.css:55 | src/clubhouse/screens/coachhelm/views/HowYouPlay.tsx:146 | E |
| `.ch-hg-lede__k.ch-num` | Last 90 days · 14 rounds · Refreshed yeste… | 13/500 | P D dark only | 10.9 | 14.7 / 13.0 | 10.9 | src/clubhouse/styles/coachhelm-profile.css:62 | src/clubhouse/screens/coachhelm/views/HowYouPlay.tsx:147 | E |
| `.ch-hg-m.is-warn` | Back-9 stamina | 14/600 | P D dark only | 13.1 | 14.7 / 13.0 | 13.1 | src/clubhouse/styles/coachhelm-profile.css:128 | src/clubhouse/screens/coachhelm/views/HowYouPlay.tsx:63 | E |
| `.ch-hd-hero` | CoachHelm has 4 reads on your game, 2 of t… | 20/600 | P D dark only | 10.8 | 10.9 / 10.8 | 13.4 | src/clubhouse/styles/coachhelm-dive.css:7 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:643 | E |
| `.ch-hd-it__f` | · | 12/500 | P | 10.9 | 14.7 / 14.6 | 10.9 | src/clubhouse/styles/coachhelm-dive.css:158 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:559 | E |
| `.ch-hl-h__t` | CoachHelm | 44/600 | D dark only | 13.3 |  | 13.3 | src/clubhouse/styles/coachhelm.css:55 | src/clubhouse/screens/coachhelm/parts.tsx:272 | E |
| `.ch-btn.ch-btn--ghost.ch-btn--sm` | Development | 13/500 | D dark only | 7.7 |  | 7.7 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-hl-focus__k` | Putting | 13/600 | D dark only | 9.3 |  | 9.3 | src/clubhouse/styles/coachhelm-dive.css:1073 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:466 | E |
| `.ch-hl-pri.is-medium` | Worth closing | 13/600 | D dark only | 9.0 |  | 9.0 | (see component) | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:483 | E |
| `.ch-hd-dos__h` | Downhill putts from | 34/600 | D dark only | 13.4 |  | 13.4 | src/clubhouse/styles/coachhelm-dive.css:1065 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:465 | E |
| `.ch-serif-num` | 4–6 | 34/600 | D dark only | 13.4 |  | 13.4 | src/clubhouse/styles/shell.css:2240 | src/clubhouse/ui/SerifText.tsx:14 | E |
| `.ch-hd-meas__s.ch-num` | Jul 5 to Oct 1 | 13/400 | D dark only | 13.1 |  | 13.1 | src/clubhouse/styles/coachhelm-dive.css:356 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:523 | E |
| `.ch-hd-tr__t.ch-num` | Putting: strokes gained averaged −0.3 a ro… | 13/400 | D dark only | 13.1 |  | 13.1 | src/clubhouse/styles/coachhelm-dive.css:413 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:160 | E |
| `.ch-hd-dx__r` | Both groups have enough putts to compare, … | 13/400 | D dark only | 10.9 |  | 10.9 | src/clubhouse/styles/coachhelm-dive.css:647 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:272 | E |
| `.ch-hd-full__k` | The full write-up | 13/500 | D dark only | 10.9 |  | 10.9 | src/clubhouse/styles/coachhelm-dive.css:657 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:277 | E |
| `.ch-hd-why` | From 4–6 ft, you’re making 58% of downhill… | 15/400 | D dark only | 13.1 |  | 13.1 | src/clubhouse/styles/coachhelm-dive.css:661 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:278 | E |

### Calendar (coach)  (`/clubhouse-preview/calendar`; 177 text runs on phone, 141 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-intro__eyebrow.ch-num` | 2026 | 13/500 | P | 6.6 | 6.7 / 6.6 | 9.2 | src/clubhouse/styles/ui.css:1016 | src/clubhouse/screens/calendar/CalendarPhone.tsx:116 | A |
| `.ch-empty__title` | Nothing on this day | 16/600 | P | 14.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/shell.css:728 | src/clubhouse/ui/States.tsx:185 | C |
| `.ch-empty__body` | Plan something for the team. | 14/400 | P | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/shell.css:736 | src/clubhouse/ui/States.tsx:186 | C |
| `.ch-calm-month__c` | 1 (+29) | 15/500 | P | 14.4 | 14.7 / 14.6 | 14.9 | src/clubhouse/styles/calendar.css:3183 | src/clubhouse/screens/calendar/month.tsx:48 | E |
| `.ch-mo__n` | 27 (+29) | 13/600 | D | 7.8 | 8.7 / 8.3 | 11.2 | src/clubhouse/styles/calendar.css:1396 | src/clubhouse/screens/calendar/month-dnd.tsx:132 | E |
| `.ch-wks__d` | S (+24) | 12/500 | P | 8.1 | 8.4 / 8.3 | 10.7 | src/clubhouse/styles/ui.css:1924 | src/clubhouse/ui/WeekStrip.tsx:102 | E |
| `.ch-ag__t` | 9:00 AM (+23) | 13/600 | P D | 8.3 | 8.4 / 8.3 | 9.3 | src/clubhouse/styles/calendar.css:1666 | src/clubhouse/screens/calendar/change-note.tsx:286 | E |
| `.ch-ag__a` | Priya Natarajan · STAT 201 (+21) | 15/500 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/calendar.css:1691 | src/clubhouse/screens/calendar/change-note.tsx:289 | E |
| `.ch-ag__when` | Tomorrow (+17) | 20/600 | P D | 8.0 | 8.1 / 8.0 | 10.8 | src/clubhouse/styles/calendar.css:1608 | src/clubhouse/screens/calendar/views.tsx:739 | E |
| `.ch-calm-ev__b` | Strength (+15) | 13/400 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/calendar.css:2999 | src/clubhouse/screens/calendar/CalendarPhone.tsx:505 | E |
| `.ch-mo__ev.is-draggable` | Range and wedges (+10) | 12/500 | D | 5.9 | 5.9 / 5.7 | 8.6 | src/clubhouse/styles/calendar.css:536 | src/clubhouse/screens/calendar/month-dnd.tsx:229 | E |
| `.ch-calm-ev__t.ch-num` | 6:30 (+9) | 12/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/calendar.css:3004 | src/clubhouse/screens/calendar/CalendarPhone.tsx:497 | E |
| `.ch-ag__b` | Class (+6) | 13/400 | P D | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/calendar.css:1696 | src/clubhouse/screens/calendar/change-note.tsx:290 | E |
| `.ch-mo__dow` | Sun (+6) | 12/500 | D | 8.1 | 8.7 / 8.3 | 10.8 | src/clubhouse/styles/calendar.css:1340 | src/clubhouse/screens/calendar/month-dnd.tsx:144 | E |
| `.ch-calm-dayk` | Tue (+5) | 20/600 | P | 7.9 | 8.1 / 8.0 | 10.9 | src/clubhouse/styles/calendar.css:2863 | src/clubhouse/screens/calendar/CalendarPhone.tsx:246 | E |
| `.ch-calm-month__h` | S (+4) | 12/500 | P | 8.1 | 8.4 / 8.3 | 10.7 | src/clubhouse/styles/calendar.css:3170 | src/clubhouse/screens/calendar/month.tsx:43 | E |
| `.ch-calm-month__c.is-out` | 27 (+3) | 15/500 | P | 8.2 | 8.4 / 8.3 | 10.8 | src/clubhouse/styles/calendar.css:3183 | src/clubhouse/screens/calendar/month.tsx:48 | E |
| `.ch-cal-legend` | Practice (+3) | 13/400 | D | 8.5 | 8.7 / 8.3 | 10.7 | src/clubhouse/styles/calendar.css:178 | src/clubhouse/screens/calendar/CalendarSkeleton.tsx:22 | E |
| `.ch-in__sechead` | Needs attention (+3) | 13/500 | D | 8.5 | 8.7 / 8.3 | 10.8 | src/clubhouse/styles/calendar.css:1829 | src/clubhouse/screens/calendar/inspector.tsx:241 | E |
| `.ch-cal-sub` | 14 team events this week (+2) | 13/400 | D dark only | 10.8 |  | 10.8 | src/clubhouse/styles/calendar.css:70 | src/clubhouse/screens/calendar/inspector.tsx:811 | E |
| `.ch-ag__when.is-today` | Today (+1) | 20/600 | P | 6.8 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/calendar.css:1608 | src/clubhouse/screens/calendar/views.tsx:739 | E |
| `.ch-calm-month__lg` | Competition (+1) | 13/400 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/calendar.css:3246 | src/clubhouse/screens/calendar/month.tsx:205 | E |
| `.ch-in__quiet` | 4 (+1) | 13/400 | D | 8.6 | 8.7 / 8.3 | 10.9 | src/clubhouse/styles/calendar.css:1963 | src/clubhouse/screens/calendar/inspector.tsx:249 | E |
| `.ch-mo__more` | 2 (+1) | 12/500 | D | 8.0 | 8.7 / 8.3 | 9.8 | src/clubhouse/styles/calendar.css:1580 | src/clubhouse/screens/calendar/month-dnd.tsx:193 | E |
| `.ch-cal-title` | Oct 11 – 17 (+1) | 44/600 | D dark only | 13.3 |  | 13.3 | src/clubhouse/styles/calendar.css:28 | src/clubhouse/screens/calendar/Calendar.tsx:1155 | E |
| `.ch-intro__title.ch-calm-title` | October | 34/600 | P | 7.9 | 8.1 / 8.0 | 13.2 | src/clubhouse/styles/ui.css:1031 | src/clubhouse/ui/Ledger.tsx:213 | E |
| `.ch-calm-hint` | Hold an event to move it. | 13/400 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/calendar.css:4066 | src/clubhouse/screens/calendar/CalendarPhone.tsx:442 | E |
| `.ch-btn.ch-btn--ghost.ch-btn--sm` | Show 5 earlier days | 13/500 | P D | 6.8 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-cal-title__yr` | 2026 | 15/500 | D | 9.4 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/calendar.css:58 | src/clubhouse/screens/calendar/Calendar.tsx:1157 | E |
| `.ch-in__fact.is-team` | Team events from Helm | 13/400 | D | 10.3 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/calendar.css:1787 | src/clubhouse/screens/calendar/inspector.tsx:139 | E |
| `.ch-in__fact.is-class` | Class schedules for | 13/400 | D | 10.3 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/calendar.css:1787 | src/clubhouse/screens/calendar/inspector.tsx:139 | E |
| `.ch-in__fact.is-own` | Your busy time · only you see it | 13/400 | D | 10.3 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/calendar.css:1787 | src/clubhouse/screens/calendar/inspector.tsx:139 | E |

### Rounds (my rounds)  (`/clubhouse-preview/rounds`; 104 text runs on phone, 99 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title` | Rounds | 34/600 | P D dark only | 7.8 | 8.1 / 8.0 | 13.3 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-notice__title` | Your rounds didn’t load | 15/600 | P D | 14.7 | 14.6 / 14.6 | 15.1 | src/clubhouse/styles/shell.css:794 | src/clubhouse/ui/Notices.tsx:51 | C |
| `.ch-notice__body` | Nothing is lost. Your posted rounds are st… | 14/400 | P D | 10.0 | 9.9 / 9.9 | 13.1 | src/clubhouse/styles/shell.css:801 | src/clubhouse/ui/Notices.tsx:52 | C |
| `.ch-empty-page__title` | No rounds yet | 22/600 | P D | 8.0 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/shell.css:598 | src/clubhouse/shell/NotRebuilt.tsx:24 | C |
| `.ch-empty-page__body` | Track your first round shot by shot. Your … | 15/400 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/shell.css:607 | src/clubhouse/shell/NotRebuilt.tsx:25 | C |
| `.ch-rd-meter` | Fairways (+23) | 12/500 | D | 8.7 | 8.7 / 8.3 | 10.9 | src/clubhouse/styles/rounds.css:841 | src/clubhouse/screens/rounds/parts.tsx:520 | E |
| `.ch-rd-sc__date` | 26 (+13) | 12/500 | P D | 8.4 | 8.4 / 8.3 | 9.2 | src/clubhouse/styles/rounds.css:687 | src/clubhouse/screens/rounds/parts.tsx:539 | E |
| `.ch-rd-sc__s` | E (+13) | 12/500 | P D | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/rounds.css:890 | src/clubhouse/screens/rounds/parts.tsx:582 | E |
| `.ch-rd-grp__h` | September 2026 (+9) | 20/600 | P D | 8.1 | 8.1 / 8.0 | 10.9 | src/clubhouse/styles/rounds.css:626 | src/clubhouse/screens/rounds/RoundsLibrary.tsx:84 | E |
| `.ch-rd-rib__t.ch-num` | −3 (+7) | 13/500 | P | 14.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/rounds.css:468 | src/clubhouse/screens/rounds/parts.tsx:252 | E |
| `.ch-rd-rib__d.ch-num` | 18 (+6) | 13/600 | P | 14.7 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/rounds.css:485 | src/clubhouse/screens/rounds/parts.tsx:299 | E |
| `.ch-rd-rib__v` | 77 (+6) | 13/600 | P | 14.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/rounds.css:476 | src/clubhouse/screens/rounds/parts.tsx:293 | E |
| `.ch-rd-sc__c` | Finley GC (+6) | 13/400 | P D | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/rounds.css:726 | src/clubhouse/screens/rounds/parts.tsx:543 | E |
| `.ch-rd-fig__m` | · (+3) | 13/400 | P D | 8.4 | 8.4 / 8.3 | 10.7 | src/clubhouse/styles/rounds.css:328 | src/clubhouse/screens/rounds/parts.tsx:367 | E |
| `.ch-rd-season__lg` | Under par (+3) | 12/500 | P | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/rounds.css:491 | src/clubhouse/screens/rounds/parts.tsx:465 | E |
| `.ch-rd-k` | Since August 1 · 8 counted rounds (+2) | 12/500 | P D | 6.3 | 6.5 / 6.5 | 9.0 | src/clubhouse/styles/rounds.css:13 | src/clubhouse/screens/rounds/TeamRounds.tsx:138 | E |
| `.ch-rd-season__big` | 73 (+2) | 13/500 | P D | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/rounds.css:283 | src/clubhouse/screens/rounds/parts.tsx:438 | E |
| `.ch-rd-fig` | Best (+2) | 13/600 | P D | 9.9 | 10.0 / 9.9 | 12.9 | src/clubhouse/styles/rounds.css:306 | src/clubhouse/screens/rounds/parts.tsx:350 | E |
| `.ch-num.ch-rd-fig__v` | 69 (+2) | 28/600 | P D | 14.6 | 14.7 / 14.6 | 15.0 | src/clubhouse/styles/rounds.css:314 | src/clubhouse/screens/rounds/parts.tsx:352 | E |
| `.ch-rd-range__ends` | 69 (+1) | 12/600 | P D | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/rounds.css:368 | src/clubhouse/screens/rounds/parts.tsx:361 | E |
| `.ch-rd-season__ch` | Every round vs par (+1) | 13/400 | P | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/rounds.css:416 | src/clubhouse/screens/rounds/parts.tsx:461 | E |
| `.ch-rd-rib__t` | Aug (+1) | 13/500 | P | 14.7 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/rounds.css:468 | src/clubhouse/screens/rounds/parts.tsx:252 | E |
| `.ch-rd-sc__s.is-under` | −3 (+1) | 20/600 | P | 5.1 | 5.1 / 5.1 | 7.1 | src/clubhouse/styles/rounds.css:890 | src/clubhouse/screens/rounds/parts.tsx:582 | E |
| `.ch-rd-unf__f` | +1 (+1) | 14/400 | D | 10.1 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/rounds.css:168 | src/clubhouse/screens/rounds/parts.tsx:124 | E |
| `.ch-rd-fig__course` | Carolina GC | 13/400 | P D | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/rounds.css:3853 | src/clubhouse/screens/rounds/parts.tsx:371 | E |
| `.ch-rd-rib__t.ch-num.is-par` | Par | 13/700 | P | 14.7 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/rounds.css:468 | src/clubhouse/screens/rounds/parts.tsx:252 | E |
| `.ch-rd-rib__v.is-under` | 69 | 13/600 | P | 14.7 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/rounds.css:476 | src/clubhouse/screens/rounds/parts.tsx:293 | E |
| `.ch-rd-unf__k` | In progress | 20/600 | D | 7.8 | 8.3 / 8.0 | 13.3 | src/clubhouse/styles/rounds.css:71 | src/clubhouse/screens/rounds/parts.tsx:116 | E |
| `.ch-rd-unf__t` | Today | 13/500 | D | 8.7 | 8.7 / 8.3 | 10.9 | src/clubhouse/styles/rounds.css:90 | src/clubhouse/screens/rounds/parts.tsx:155 | E |
| `.ch-rd-unf__c` | Finley GC | 28/600 | D | 14.3 | 15.1 / 14.6 | 15.2 | src/clubhouse/styles/rounds.css:2785 | src/clubhouse/screens/rounds/parts.tsx:121 | E |
| `.ch-rd-unf__m` | Blue tees · Practice · 18 holes | 14/400 | D | 10.0 | 10.3 / 9.9 | 13.2 | src/clubhouse/styles/rounds.css:102 | src/clubhouse/screens/rounds/parts.tsx:122 | E |
| `.ch-rd-rib__t.ch-num.is-avg` | Avg | 13/600 | P dark only | 13.7 |  | 13.7 | src/clubhouse/styles/rounds.css:468 | src/clubhouse/screens/rounds/parts.tsx:252 | E |

### Team Hub (coach)  (`/clubhouse-preview/hub`; 103 text runs on phone, 87 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title` | Team Hub | 34/600 | P D dark only | 7.9 | 8.1 / 8.0 | 13.3 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-es__title` | Nothing posted yet | 22/600 | P D | 8.0 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/ui.css:2207 | src/clubhouse/ui/States.tsx:109 | C |
| `.ch-es__body` | Post an announcement, plan a trip or share… | 15/400 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/ui.css:2222 | src/clubhouse/ui/States.tsx:112 | C |
| `.ch-hb-file__b` | Pairings and tee times (+13) | 13/400 | P D | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/hub.css:960 | src/clubhouse/screens/hub/parts.tsx:767 | E |
| `.ch-hb-pass__line` | Uniform (+9) | 12/500 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/hub.css:682 | src/clubhouse/screens/hub/parts.tsx:438 | E |
| `.ch-hscroll.ch-hb-strip` | 6 (+8) | 14/600 | P D | 5.0 | 5.0 / 5.0 | 8.4 | src/clubhouse/styles/hub.css:2509 | src/clubhouse/screens/tournaments/EventDesk.tsx:303 | E |
| `.ch-hb-task.is-coach` | Submit eligibility form (+8) | 12/600 | P D | 5.0 | 5.0 / 5.0 | 8.6 | src/clubhouse/styles/hub.css:779 | src/clubhouse/screens/hub/parts.tsx:620 | E |
| `.ch-hb-plan` | Mon · 12:00 PM (+5) | 13/500 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/hub.css:676 | src/clubhouse/screens/hub/parts.tsx:421 | E |
| `.ch-hb-pass__f` | Departs (+5) | 12/500 | P D | 8.3 | 8.4 / 8.3 | 10.8 | src/clubhouse/styles/hub.css:625 | src/clubhouse/screens/hub/parts.tsx:384 | E |
| `.ch-hscroll.ch-hb-tabs` | Home (+4) | 14/500 | P D | 9.4 | 10.0 / 9.9 | 13.0 | src/clubhouse/styles/hub.css:2509 | src/clubhouse/screens/tournaments/EventDesk.tsx:303 | E |
| `.ch-hb-ann__h` | Maya Reyes (+4) | 12/400 | P D | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/hub.css:361 | src/clubhouse/screens/hub/parts.tsx:161 | E |
| `.ch-hb-muted.ch-num` | 1 attachment (+3) | 13/400 | P D | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/hub.css:38 | src/clubhouse/screens/hub/TeamHub.tsx:601 | E |
| `.ch-hb-ann.is-older` | Short-game block moves to Green (+3) | 17/600 | P D | 8.0 | 8.1 / 8.0 | 13.1 | src/clubhouse/styles/hub.css:334 | src/clubhouse/screens/hub/parts.tsx:143 | E |
| `.ch-hb-card__h` | Carolina Fall Invitational (+3) | 20/600 | P D | 8.0 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/hub.css:117 | src/clubhouse/screens/hub/parts.tsx:467 | E |
| `.ch-hb-prog` | 0/6 (+3) | 13/600 | P D | 14.6 | 14.7 / 14.6 | 15.1 | src/clubhouse/styles/hub.css:2829 | src/clubhouse/screens/hub/parts.tsx:625 | E |
| `.ch-hb-muted` | Varsity · 2026–27 (+2) | 12/500 | P D | 6.4 | 6.5 / 6.5 | 9.0 | src/clubhouse/styles/hub.css:38 | src/clubhouse/screens/hub/TeamHub.tsx:601 | E |
| `.ch-hb-reads.ch-num` | 6 (+2) | 13/500 | P D | 9.9 | 10.0 / 9.9 | 12.9 | src/clubhouse/styles/hub.css:468 | src/clubhouse/screens/hub/TeamHub.tsx:104 | E |
| `.ch-hb-task.is-coach.is-done` | Upload class schedule (+2) | 15/600 | P D | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/hub.css:779 | src/clubhouse/screens/hub/parts.tsx:620 | E |
| `.ch-hb-ann.is-lead` | Pairings and tee times for Thursday (+1) | 22/600 | P | 8.0 | 8.1 / 8.0 | 13.1 | src/clubhouse/styles/hub.css:334 | src/clubhouse/screens/hub/parts.tsx:143 | E |
| `.ch-hb-ann__fold` | Maintenance on the practice green through … (+1) | 14/400 | P | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/hub.css:2407 | src/clubhouse/screens/hub/parts.tsx:154 | E |
| `.ch-hb-eyebrow.ch-num` | Next trip (+1) | 13/500 | P D | 6.5 | 6.5 / 6.5 | 9.2 | src/clubhouse/styles/hub.css:138 | src/clubhouse/screens/hub/parts.tsx:149 | E |
| `.ch-hb-pass__main` | Carolina Fall Invitational (+1) | 22/600 | P D | 8.0 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/hub.css:1561 | src/clubhouse/screens/hub/parts.tsx:355 | E |
| `.ch-hb-ann__margin.ch-num` | Yesterday (+1) | 13/500 | D | 8.3 | 8.7 / 8.4 | 10.8 | src/clubhouse/styles/hub.css:2361 | src/clubhouse/screens/hub/parts.tsx:145 | E |
| `.ch-hb-reads.ch-hb-reads--open.ch-num` | 5 | 13/500 | P | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/hub.css:468 | src/clubhouse/screens/hub/TeamHub.tsx:104 | E |
| `.ch-serif-num` | 2 | 17/600 | P D | 8.1 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/shell.css:2240 | src/clubhouse/ui/SerifText.tsx:14 | E |
| `.ch-hb-role` | Coach view | 12/600 | P D dark only | 8.4 | 8.8 / 8.7 | 9.2 | src/clubhouse/styles/hub.css:22 | src/clubhouse/screens/hub/TeamHub.tsx:593 | E |
| `.ch-hb-margin__k` | Acknowledged | 13/500 | D | 6.7 | 6.8 / 6.5 | 9.1 | src/clubhouse/styles/hub.css:2386 | src/clubhouse/screens/hub/TeamHub.tsx:102 | E |
| `.ch-hb-margin__t` | Pairings and tee times for Thursday | 15/600 | D | 8.2 | 8.3 / 8.1 | 13.2 | src/clubhouse/styles/hub.css:2390 | src/clubhouse/screens/hub/TeamHub.tsx:103 | E |
| `.ch-hb-margin__n.ch-num` | 1 hasn’t yet. | 13/400 | D | 8.6 | 8.7 / 8.4 | 10.8 | src/clubhouse/styles/hub.css:2396 | src/clubhouse/screens/hub/TeamHub.tsx:110 | E |

### Qualifier detail (coach)  (`/clubhouse-preview/qualifier`; 88 text runs on phone, 14 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-backlink` | Qualifiers | 13/500 | D dark only | 9.1 |  | 9.1 | src/clubhouse/styles/ui.css:708 | src/clubhouse/ui/Section.tsx:51 | D |
| `.ch-qfm-lb__tot.ch-num` | 72 (+11) | 13/400 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/qualifiers.css:2054 | src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:352 | E |
| `.ch-qf-plate` | E (+8) | 22/600 | P | 14.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/qualifiers.css:2444 | src/clubhouse/screens/qualifiers/parts.tsx:50 | E |
| `.ch-qf-pos__n` | 1 (+7) | 22/500 | P | 5.6 | 5.7 / 5.6 | 8.6 | src/clubhouse/styles/qualifiers.css:2489 | src/clubhouse/screens/qualifiers/parts.tsx:65 | E |
| `.ch-qfm-lb__nm` | Sofia Alvarez (+7) | 15/500 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/qualifiers.css:2015 | src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:339 | E |
| `.ch-qfm-facts` | Rounds in (+5) | 12/500 | P | 8.2 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/qualifiers.css:1858 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:221 | E |
| `.ch-qf-panel__head` | Leaderboard (+4) | 22/600 | P | 8.0 | 8.1 / 8.0 | 10.9 | src/clubhouse/styles/qualifiers.css:614 | src/clubhouse/screens/qualifiers/QualifierDetail.tsx:283 | E |
| `.ch-qfm-head` | Preseason qualifier (+3) | 28/600 | P | 7.9 | 8.1 / 8.0 | 13.1 | src/clubhouse/styles/qualifiers.css:1793 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:208 | E |
| `.ch-qf-head` | Preseason qualifier (+3) | 44/600 | D | 12.6 | 13.4 / 13.2 | 13.1 | src/clubhouse/styles/qualifiers.css:34 | src/clubhouse/screens/qualifiers/QualifierForm.tsx:261 | E |
| `.ch-btn.ch-btn--ghost` | Edit (+2) | 14/500 | P D | 7.0 | 7.0 / 7.0 | 7.7 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-qfm-lbhead` | Pos (+2) | 12/500 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/qualifiers.css:1940 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:239 | E |
| `.ch-qfm-head__k` | Aug 22 (+1) | 12/500 | P | 6.3 | 6.5 / 6.5 | 9.0 | src/clubhouse/styles/qualifiers.css:1787 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:209 | E |
| `.ch-qf-note` | Closed to new rounds. (+1) | 14/400 | P | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/qualifiers.css:515 | src/clubhouse/screens/qualifiers/QualifierDetail.tsx:244 | E |
| `.ch-qfm-lbhead__stack` | To par (+1) | 12/500 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/qualifiers.css:2047 | src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:325 | E |
| `.ch-badge.ch-badge--positive` | Qualified (+1) | 13/600 | P | 8.7 | 8.8 / 8.7 | 9.3 | src/clubhouse/styles/qualifiers.css:1591 | src/clubhouse/ui/Badge.tsx:7 | E |
| `.ch-qf-list` | Finley GC (+1) | 15/600 | P | 14.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/qualifiers.css:898 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:345 | E |
| `.ch-qf-list__m` | Blue · Par 72 (+1) | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/qualifiers.css:924 | src/clubhouse/screens/qualifiers/QualifierSelection.tsx:325 | E |
| `.ch-qf-why` | Single 18-hole round. (+1) | 15/400 | P | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/qualifiers.css:960 | src/clubhouse/screens/qualifiers/QualifierDetail.tsx:289 | E |
| `.ch-badge.ch-badge--accent` | Live · updated 4:12 PM (+1) | 12/600 | P D dark only | 8.7 | 8.8 / 8.7 | 9.2 | src/clubhouse/styles/qualifiers.css:1591 | src/clubhouse/ui/Badge.tsx:7 | E |
| `.ch-qf-move.is-gain` | 2 (+1) | 12/600 | P | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/qualifiers.css:2522 | src/clubhouse/screens/qualifiers/parts.tsx:76 | E |
| `.ch-qf-move.is-loss` | 1 (+1) | 12/600 | P | 6.6 | 6.6 / 6.5 | 8.6 | src/clubhouse/styles/qualifiers.css:2522 | src/clubhouse/screens/qualifiers/parts.tsx:76 | E |
| `.ch-btn.ch-btn--secondary` | Manage selections (+1) | 14/500 | D dark only | 13.6 |  | 13.6 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-qf-pos__t` | T | 15/500 | P | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/qualifiers.css:2499 | src/clubhouse/screens/qualifiers/parts.tsx:70 | E |
| `.ch-qf-line.ch-qfm-line` | Top-score line · | 13/600 | P | 6.5 | 6.5 / 6.5 | 9.2 | src/clubhouse/styles/qualifiers.css:756 | src/clubhouse/screens/qualifiers/QualifierDetail.tsx:618 | E |
| `.ch-qf-cap` | Complete cards rank first, by total to par… | 13/400 | P | 5.7 | 5.7 / 5.6 | 8.6 | src/clubhouse/styles/qualifiers.css:785 | src/clubhouse/screens/qualifiers/QualifierDetail.tsx:607 | E |
| `.ch-qf-plate.is-under` | −3 | 22/600 | P | 5.1 | 5.1 / 5.1 | 7.1 | src/clubhouse/styles/qualifiers.css:2444 | src/clubhouse/screens/qualifiers/parts.tsx:50 | E |
| `.ch-badge.ch-badge--warning` | Bubble | 13/600 | P | 6.5 | 6.5 / 6.5 | 9.5 | src/clubhouse/styles/qualifiers.css:1591 | src/clubhouse/ui/Badge.tsx:7 | E |
| `.ch-qf-line.ch-qf-line--muted.ch-qfm-line` | Travel cut · top | 13/500 | P | 5.7 | 5.7 / 5.6 | 8.6 | src/clubhouse/styles/qualifiers.css:756 | src/clubhouse/screens/qualifiers/QualifierDetail.tsx:618 | E |
| `.ch-qf-thin` | 1 of 3 rounds | 13/400 | P | 6.5 | 6.6 / 6.5 | 8.6 | src/clubhouse/styles/qualifiers.css:2545 | src/clubhouse/screens/qualifiers/QualifierDetail.tsx:522 | E |
| `.ch-qfm-lb__sub` | No rounds submitted | 13/400 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/qualifiers.css:2023 | src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:343 | E |
| `.ch-qf-dash` | — | 16/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/qualifiers.css:426 | src/clubhouse/screens/qualifiers/QualifierDetail.tsx:592 | E |
| `.ch-qfm-lb__thru.ch-num` | 0/ | 14/500 | P | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/qualifiers.css:2060 | src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:354 | E |
| `.ch-qf-eyebrow` | Qualifier | 13/500 | D dark only | 9.1 |  | 9.1 | src/clubhouse/styles/qualifiers.css:52 | src/clubhouse/screens/qualifiers/QualifierForm.tsx:263 | E |
| `.ch-badge.ch-badge--neutral` | Concluded | 12/600 | D dark only | 13.1 |  | 13.1 | src/clubhouse/styles/qualifiers.css:1591 | src/clubhouse/ui/Badge.tsx:7 | E |

### Qualifier detail (player)  (`/clubhouse-preview/qualifier-player`; 69 text runs on phone, 6 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-backlink` | Qualifiers | 13/500 | D dark only | 9.1 |  | 9.1 | src/clubhouse/styles/ui.css:708 | src/clubhouse/ui/Section.tsx:51 | D |
| `.ch-qf-pos__n` | 1 (+6) | 22/500 | P | 5.7 | 5.7 / 5.6 | 8.6 | src/clubhouse/styles/qualifiers.css:2489 | src/clubhouse/screens/qualifiers/parts.tsx:65 | E |
| `.ch-qfm-lb__nm` | Sofia Alvarez (+6) | 15/500 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/qualifiers.css:2015 | src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:339 | E |
| `.ch-qfm-lb__tot.ch-num` | 141 (+5) | 13/400 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/qualifiers.css:2054 | src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:352 | E |
| `.ch-qf-you-line` | You vs the line (+4) | 13/600 | P | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/qualifiers.css:574 | src/clubhouse/screens/qualifiers/parts.tsx:178 | E |
| `.ch-qf-plate` | E (+4) | 22/600 | P | 14.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/qualifiers.css:2444 | src/clubhouse/screens/qualifiers/parts.tsx:50 | E |
| `.ch-qfm-facts` | Rounds in (+3) | 12/500 | P | 8.2 | 8.4 / 8.3 | 10.8 | src/clubhouse/styles/qualifiers.css:1858 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:221 | E |
| `.ch-qf-panel__head` | Leaderboard (+3) | 22/600 | P | 8.0 | 8.1 / 8.0 | 10.9 | src/clubhouse/styles/qualifiers.css:614 | src/clubhouse/screens/qualifiers/QualifierDetail.tsx:283 | E |
| `.ch-qfm-lbhead` | Pos (+2) | 12/500 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/qualifiers.css:1940 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:239 | E |
| `.ch-qfm-head` | Pinehurst qualifier (+1) | 28/600 | P | 7.9 | 8.1 / 8.0 | 13.1 | src/clubhouse/styles/qualifiers.css:1793 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:208 | E |
| `.ch-badge.ch-badge--accent` | Live · updated 4:12 PM (+1) | 12/600 | P D dark only | 8.7 | 8.8 / 8.7 | 9.2 | src/clubhouse/styles/qualifiers.css:1591 | src/clubhouse/ui/Badge.tsx:7 | E |
| `.ch-qf-you-line__me.ch-num` | Place (+1) | 14/400 | P | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/qualifiers.css:578 | src/clubhouse/screens/qualifiers/parts.tsx:180 | E |
| `.ch-qfm-lbhead__stack` | To par (+1) | 12/500 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/qualifiers.css:2047 | src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:325 | E |
| `.ch-qf-move.is-loss` | 1 (+1) | 12/600 | P | 6.5 | 6.6 / 6.5 | 8.6 | src/clubhouse/styles/qualifiers.css:2522 | src/clubhouse/screens/qualifiers/parts.tsx:76 | E |
| `.ch-qf-list` | Finley GC (+1) | 15/600 | P | 14.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/qualifiers.css:898 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:345 | E |
| `.ch-qf-list__m` | Blue · Par 72 (+1) | 13/400 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/qualifiers.css:924 | src/clubhouse/screens/qualifiers/QualifierSelection.tsx:325 | E |
| `.ch-qf-head` | Pinehurst qualifier (+1) | 44/600 | D | 12.6 | 13.4 / 13.3 | 13.1 | src/clubhouse/styles/qualifiers.css:34 | src/clubhouse/screens/qualifiers/QualifierForm.tsx:261 | E |
| `.ch-qfm-head__k` | Sep 22 – Oct 1 | 12/500 | P | 6.4 | 6.5 / 6.5 | 9.0 | src/clubhouse/styles/qualifiers.css:1787 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:209 | E |
| `.ch-qf-plate.is-card` | +4 | 22/600 | P | 14.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/qualifiers.css:2444 | src/clubhouse/screens/qualifiers/parts.tsx:50 | E |
| `.ch-badge.ch-badge--positive` | Qualifying | 13/600 | P | 8.7 | 8.8 / 8.7 | 9.3 | src/clubhouse/styles/qualifiers.css:1591 | src/clubhouse/ui/Badge.tsx:7 | E |
| `.ch-qf-plate.is-under` | −3 | 22/600 | P | 5.1 | 5.1 / 5.1 | 7.1 | src/clubhouse/styles/qualifiers.css:2444 | src/clubhouse/screens/qualifiers/parts.tsx:50 | E |
| `.ch-qf-line.ch-qfm-line` | Top-score line · | 13/600 | P | 6.5 | 6.5 / 6.5 | 9.2 | src/clubhouse/styles/qualifiers.css:756 | src/clubhouse/screens/qualifiers/QualifierDetail.tsx:618 | E |
| `.ch-qf-move.is-gain` | 1 | 12/600 | P | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/qualifiers.css:2522 | src/clubhouse/screens/qualifiers/parts.tsx:76 | E |
| `.ch-badge.ch-badge--warning` | Bubble | 13/600 | P | 6.5 | 6.5 / 6.5 | 9.5 | src/clubhouse/styles/qualifiers.css:1591 | src/clubhouse/ui/Badge.tsx:7 | E |
| `.ch-qf-line.ch-qf-line--muted.ch-qfm-line` | Travel cut · top | 13/500 | P | 5.6 | 5.7 / 5.6 | 8.6 | src/clubhouse/styles/qualifiers.css:756 | src/clubhouse/screens/qualifiers/QualifierDetail.tsx:618 | E |
| `.ch-qf-thin` | 1 of 3 rounds | 13/400 | P | 6.6 | 6.6 / 6.5 | 8.6 | src/clubhouse/styles/qualifiers.css:2545 | src/clubhouse/screens/qualifiers/QualifierDetail.tsx:522 | E |
| `.ch-qfm-lb__sub` | No rounds submitted | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/qualifiers.css:2023 | src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:343 | E |
| `.ch-qf-dash` | — | 16/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/qualifiers.css:426 | src/clubhouse/screens/qualifiers/QualifierDetail.tsx:592 | E |
| `.ch-qfm-lb__thru.ch-num` | 0/ | 14/500 | P | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/qualifiers.css:2060 | src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:354 | E |
| `.ch-qf-cap` | Complete cards rank first, by total to par… | 13/400 | P | 5.7 | 5.7 / 5.6 | 8.6 | src/clubhouse/styles/qualifiers.css:785 | src/clubhouse/screens/qualifiers/QualifierDetail.tsx:607 | E |
| `.ch-qf-why` | Lowest aggregate over all rounds. Ties bro… | 15/400 | P | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/qualifiers.css:960 | src/clubhouse/screens/qualifiers/QualifierDetail.tsx:289 | E |
| `.ch-qf-eyebrow` | Qualifier | 13/500 | D dark only | 9.1 |  | 9.1 | src/clubhouse/styles/qualifiers.css:52 | src/clubhouse/screens/qualifiers/QualifierForm.tsx:263 | E |

### Team rounds  (`/clubhouse-preview/team-rounds`; 68 text runs on phone, 68 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title` | Team rounds | 34/600 | P D dark only | 7.9 | 8.1 / 8.0 | 13.2 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-sec__title` | October 2026 (+2) | 20/600 | P D | 8.0 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/home.css:3222 | src/clubhouse/ui/Section.tsx:34 | B |
| `.ch-sec__meta` | 7 (+2) | 13/400 | P D | 8.3 | 8.4 / 8.3 | 10.8 | src/clubhouse/styles/ui.css:695 | src/clubhouse/ui/Section.tsx:38 | B |
| `.ch-empty-page__title` | No rounds yet | 22/600 | P D | 8.0 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/shell.css:598 | src/clubhouse/shell/NotRebuilt.tsx:24 | C |
| `.ch-empty-page__body` | Every round your players post shows up her… | 15/400 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/shell.css:607 | src/clubhouse/shell/NotRebuilt.tsx:25 | C |
| `.ch-trd-score` | E (+19) | 13/400 | P D | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/rounds.css:1706 | src/clubhouse/screens/rounds/TeamRounds.tsx:87 | E |
| `.ch-lgr__lead` | Oct 12 (+11) | 14/500 | P D | 9.9 | 10.0 / 9.9 | 13.0 | src/clubhouse/styles/ui.css:808 | src/clubhouse/ui/Ledger.tsx:70 | E |
| `.ch-fgr__c` | Rounds (+5) | 12/500 | P D | 7.9 | 8.4 / 8.3 | 10.7 | src/clubhouse/styles/ui.css:862 | src/clubhouse/ui/Ledger.tsx:113 | E |
| `.ch-lgr__title` | Jonah Okafor (+4) | 15/600 | P D | 14.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/ui.css:822 | src/clubhouse/ui/Ledger.tsx:72 | E |
| `.ch-fgr__note` | 5 players (+3) | 13/400 | P D | 8.0 | 8.4 / 8.3 | 10.8 | src/clubhouse/styles/ui.css:909 | src/clubhouse/ui/Ledger.tsx:116 | E |
| `.ch-trd-meta` | Finley GC (+3) | 13/400 | P D | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/rounds.css:1688 | src/clubhouse/screens/rounds/TeamRounds.tsx:85 | E |
| `.ch-trd-meta__tee` | Blue tees (+2) | 13/400 | P D | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/rounds.css:1694 | src/clubhouse/screens/rounds/TeamRounds.tsx:72 | E |
| `.ch-fgr__c.is-under` | Under par (+1) | 12/500 | P D | 8.3 | 8.4 / 8.3 | 10.8 | src/clubhouse/styles/ui.css:862 | src/clubhouse/ui/Ledger.tsx:113 | E |
| `.ch-trd-score.is-under` | −1 (+1) | 17/600 | P D | 5.1 | 5.1 / 5.1 | 7.1 | src/clubhouse/styles/rounds.css:1706 | src/clubhouse/screens/rounds/TeamRounds.tsx:87 | E |
| `.ch-rd-k` | Varsity · | 12/500 | P D dark only | 6.6 | 6.7 / 6.6 | 9.0 | src/clubhouse/styles/rounds.css:13 | src/clubhouse/screens/rounds/TeamRounds.tsx:138 | E |

### Calendar (player)  (`/clubhouse-preview/calendar-player`; 55 text runs on phone, 13 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-intro__eyebrow.ch-num` | 2026 | 13/500 | P | 6.6 | 6.6 / 6.6 | 9.2 | src/clubhouse/styles/ui.css:1016 | src/clubhouse/screens/calendar/CalendarPhone.tsx:116 | A |
| `.ch-wks__d` | S (+24) | 12/500 | P | 8.1 | 8.4 / 8.3 | 10.7 | src/clubhouse/styles/ui.css:1924 | src/clubhouse/ui/WeekStrip.tsx:102 | E |
| `.ch-calm-ev__b` | Strength (+13) | 13/400 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/calendar.css:2999 | src/clubhouse/screens/calendar/CalendarPhone.tsx:505 | E |
| `.ch-calm-ev__t.ch-num` | 6:30 (+8) | 12/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/calendar.css:3004 | src/clubhouse/screens/calendar/CalendarPhone.tsx:497 | E |
| `.ch-calm-dayk` | Tue (+4) | 20/600 | P | 7.9 | 8.1 / 8.0 | 10.9 | src/clubhouse/styles/calendar.css:2863 | src/clubhouse/screens/calendar/CalendarPhone.tsx:246 | E |
| `.ch-cal-legend` | Practice (+3) | 13/400 | D | 8.5 | 8.7 / 8.5 | 10.8 | src/clubhouse/styles/calendar.css:178 | src/clubhouse/screens/calendar/CalendarSkeleton.tsx:22 | E |
| `.ch-in__sechead` | Needs your attention (+3) | 13/500 | D | 8.5 | 8.7 / 8.5 | 10.9 | src/clubhouse/styles/calendar.css:1829 | src/clubhouse/screens/calendar/inspector.tsx:241 | E |
| `.ch-intro__title.ch-calm-title` | October | 34/600 | P | 7.9 | 8.1 / 8.0 | 13.2 | src/clubhouse/styles/ui.css:1031 | src/clubhouse/ui/Ledger.tsx:213 | E |
| `.ch-cal-title__yr` | 2026 | 15/500 | D | 9.6 | 10.3 / 10.1 | 13.1 | src/clubhouse/styles/calendar.css:58 | src/clubhouse/screens/calendar/Calendar.tsx:1157 | E |
| `.ch-in__fact.is-team` | Team events from Helm | 13/400 | D | 10.3 | 10.3 / 10.1 | 13.1 | src/clubhouse/styles/calendar.css:1787 | src/clubhouse/screens/calendar/inspector.tsx:139 | E |
| `.ch-in__fact.is-class` | Your classes · only you and your coaches s… | 13/400 | D | 10.3 | 10.3 / 10.1 | 13.1 | src/clubhouse/styles/calendar.css:1787 | src/clubhouse/screens/calendar/inspector.tsx:139 | E |
| `.ch-cal-title` | Oct 11 – 17 | 44/600 | D dark only | 13.3 |  | 13.3 | src/clubhouse/styles/calendar.css:28 | src/clubhouse/screens/calendar/Calendar.tsx:1155 | E |
| `.ch-cal-sub` | 13 team events this week | 13/400 | D dark only | 10.8 |  | 10.8 | src/clubhouse/styles/calendar.css:70 | src/clubhouse/screens/calendar/inspector.tsx:811 | E |

### New qualifier form  (`/clubhouse-preview/qualifier-new`; 46 text runs on phone, 48 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title` | New qualifier | 44/600 | P D | 12.2 | 13.0 / 12.9 | 13.2 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-backlink` | Qualifiers | 13/500 | D dark only | 9.1 |  | 9.1 | src/clubhouse/styles/ui.css:708 | src/clubhouse/ui/Section.tsx:51 | D |
| `.ch-check.ch-qf-prow` | Sofia Alvarez (+10) | 13/400 | P D | 10.8 | 14.7 / 14.6 | 10.8 | src/clubhouse/styles/stats.css:3113 | src/clubhouse/ui/Checkbox.tsx:33 | E |
| `.ch-field__label` | Qualifier name (+8) | 13/500 | P D | 14.9 | 15.7 / 15.6 | 14.9 | src/clubhouse/styles/recruiting.css:1408 | src/clubhouse/screens/roster/Roster.tsx:936 | E |
| `.ch-qf-fs__h` | Basics (+7) | 13/400 | P D | 10.8 | 13.0 / 12.9 | 10.8 | src/clubhouse/styles/qualifiers.css:1008 | src/clubhouse/screens/qualifiers/QualifierForm.tsx:321 | E |
| `.ch-field__help` | What players should expect: format and sta… (+6) | 13/400 | P D | 10.7 | 14.7 / 14.6 | 10.7 | src/clubhouse/styles/controls.css:216 | src/clubhouse/screens/calendar/editor-round.tsx:317 | E |
| `.ch-qf-rc` | Finley GC (+1) | 13/400 | P D | 10.9 | 14.7 / 14.6 | 10.9 | src/clubhouse/styles/qualifiers.css:1117 | src/clubhouse/screens/qualifiers/QualifierForm.tsx:601 | E |
| `.ch-btn.ch-btn--ghost.ch-btn--sm` | Choose (+1) | 13/500 | P D | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-qf-fs__h` | Players (+1) | 13/400 | P D | 10.9 | 13.0 / 12.9 | 10.9 | src/clubhouse/styles/qualifiers.css:1008 | src/clubhouse/screens/qualifiers/QualifierForm.tsx:321 | E |
| `.ch-qf-head` | Players enter rounds from their app. The l… | 15/400 | P D | 13.0 | 14.7 / 14.6 | 13.0 | src/clubhouse/styles/qualifiers.css:34 | src/clubhouse/screens/qualifiers/QualifierForm.tsx:261 | E |
| `.ch-field__opt` | Optional | 13/500 | P D | 8.7 | 8.8 / 8.7 | 9.3 | src/clubhouse/styles/controls.css:211 | src/clubhouse/screens/classes/TeamBreakSheet.tsx:108 | E |
| `.ch-field__label` | Course per round | 13/500 | P D | 15.2 | 15.7 / 15.6 | 15.2 | src/clubhouse/styles/recruiting.css:1408 | src/clubhouse/screens/roster/Roster.tsx:936 | E |
| `.ch-btn.ch-btn--ghost` | Cancel | 14/500 | D | 7.2 | 7.2 / 7.0 | 7.8 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-qf-eyebrow` | Qualifiers | 13/500 | P D dark only | 9.1 | 15.0 / 14.9 | 9.1 | src/clubhouse/styles/qualifiers.css:52 | src/clubhouse/screens/qualifiers/QualifierForm.tsx:263 | E |

### Qualifier selection  (`/clubhouse-preview/qualifier-selection`; 43 text runs on phone, 9 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title` | Pinehurst qualifier | 44/600 | P D | 12.5 | 13.0 / 12.9 | 13.2 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-backlink` | Qualifier | 13/500 | D dark only | 9.1 |  | 9.1 | src/clubhouse/styles/ui.css:708 | src/clubhouse/ui/Section.tsx:51 | D |
| `.ch-qf-list` | Sofia Alvarez (+7) | 14/500 | P | 10.9 | 14.7 / 14.6 | 10.9 | src/clubhouse/styles/qualifiers.css:898 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:345 | E |
| `.ch-qf-list__n.ch-num` | 1 (+6) | 13/500 | P | 10.9 | 14.7 / 14.6 | 10.9 | src/clubhouse/styles/qualifiers.css:917 | src/clubhouse/screens/qualifiers/QualifierSelection.tsx:322 | E |
| `.ch-qf-panel__head` | On score now (+5) | 13/400 | P | 10.9 | 13.0 / 12.9 | 10.9 | src/clubhouse/styles/qualifiers.css:614 | src/clubhouse/screens/qualifiers/QualifierDetail.tsx:283 | E |
| `.ch-qf-tp` | E (+5) | 14/500 | P | 15.2 | 15.7 / 15.6 | 15.2 | src/clubhouse/styles/qualifiers.css:334 | src/clubhouse/screens/qualifiers/parts.tsx:41 | E |
| `.ch-qfs-steps__l` | Standings (+2) | 13/500 | P D | 10.7 | 15.1 / 14.7 | 10.7 | src/clubhouse/styles/qualifiers.css:1420 | src/clubhouse/screens/qualifiers/QualifierSelection.tsx:245 | E |
| `.ch-qfs-steps__n.ch-num` | 2 (+1) | 12/600 | P D | 10.7 | 14.7 / 14.6 | 10.7 | src/clubhouse/styles/qualifiers.css:1302 | src/clubhouse/screens/qualifiers/QualifierSelection.tsx:244 | E |
| `.ch-qf-list__m.ch-num` | 2 rounds (+1) | 13/400 | P | 10.9 | 14.7 / 14.6 | 10.9 | src/clubhouse/styles/qualifiers.css:924 | src/clubhouse/screens/qualifiers/QualifierSelection.tsx:325 | E |
| `.ch-qfs-pick__who` | Open pick (+1) | 14/500 | P | 10.9 | 14.7 / 14.6 | 10.9 | src/clubhouse/styles/qualifiers.css:1339 | src/clubhouse/screens/qualifiers/QualifierSelection.tsx:347 | E |
| `.ch-qf-eyebrow` | Manage selections | 13/500 | P D dark only | 9.1 | 14.7 / 14.6 | 9.1 | src/clubhouse/styles/qualifiers.css:52 | src/clubhouse/screens/qualifiers/QualifierForm.tsx:263 | E |
| `.ch-qf-head` | 5 | 16/400 | P D dark only | 13.1 | 14.7 / 14.6 | 13.1 | src/clubhouse/styles/qualifiers.css:34 | src/clubhouse/screens/qualifiers/QualifierForm.tsx:261 | E |
| `.ch-qf-note` | Start selecting when the standings are whe… | 14/400 | P | 13.1 | 14.7 / 14.6 | 13.1 | src/clubhouse/styles/qualifiers.css:515 | src/clubhouse/screens/qualifiers/QualifierDetail.tsx:244 | E |
| `.ch-qf-tp.is-under` | −3 | 14/500 | P | 5.1 | 5.1 / 5.1 | 7.1 | src/clubhouse/styles/qualifiers.css:334 | src/clubhouse/screens/qualifiers/parts.tsx:41 | E |
| `.ch-qf-list__n` | — | 13/500 | P | 10.9 | 14.7 / 14.6 | 10.9 | src/clubhouse/styles/qualifiers.css:917 | src/clubhouse/screens/qualifiers/QualifierSelection.tsx:322 | E |
| `.ch-qf-list__m` | No round yet | 13/400 | P | 10.9 | 14.7 / 14.6 | 10.9 | src/clubhouse/styles/qualifiers.css:924 | src/clubhouse/screens/qualifiers/QualifierSelection.tsx:325 | E |

### What's new  (`/clubhouse-preview/whats-new`; 42 text runs on phone, 42 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title` | What’s new | 34/600 | P D dark only | 7.9 | 8.1 / 8.0 | 13.2 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-sec__title` | Today (+3) | 20/600 | P D | 7.9 | 8.1 / 8.0 | 13.3 | src/clubhouse/styles/home.css:3222 | src/clubhouse/ui/Section.tsx:34 | B |
| `.ch-sec__meta` | 3 (+2) | 13/400 | P D | 8.1 | 8.4 / 8.3 | 10.8 | src/clubhouse/styles/ui.css:695 | src/clubhouse/ui/Section.tsx:38 | B |
| `.ch-empty-page__title` | Nothing new this week | 22/600 | P D | 8.0 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/shell.css:598 | src/clubhouse/shell/NotRebuilt.tsx:24 | C |
| `.ch-empty-page__body` | New insights, validated patterns and focus… | 15/400 | P D | 10.0 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/shell.css:607 | src/clubhouse/shell/NotRebuilt.tsx:25 | C |
| `.ch-lgr__lead` | 1:42 PM (+6) | 14/500 | P D | 9.9 | 10.0 / 9.9 | 13.0 | src/clubhouse/styles/ui.css:808 | src/clubhouse/ui/Ledger.tsx:70 | E |
| `.ch-lgr__title` | Short putts inside six feet (+6) | 15/600 | P D | 14.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/ui.css:822 | src/clubhouse/ui/Ledger.tsx:72 | E |
| `.ch-wn-meta` | Jonah Okafor (+4) | 13/400 | P D | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/whats-new.css:2 | src/clubhouse/screens/whats-new/WhatsNew.tsx:41 | E |
| `.ch-wn-detail` | Jonah has made 9 of his last 10 putts insi… (+4) | 13/400 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/whats-new.css:12 | src/clubhouse/screens/whats-new/WhatsNew.tsx:45 | E |
| `.ch-wn-what` | New insight (+3) | 13/400 | P D | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/whats-new.css:9 | src/clubhouse/screens/whats-new/WhatsNew.tsx:43 | E |
| `.ch-wn-what.is-gain` | Insight resolved (+1) | 13/400 | P D | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/whats-new.css:9 | src/clubhouse/screens/whats-new/WhatsNew.tsx:43 | E |
| `.ch-rd-k` | Past 7 days (+1) | 12/500 | P D dark only | 6.6 | 6.6 / 6.6 | 9.0 | src/clubhouse/styles/rounds.css:13 | src/clubhouse/screens/rounds/TeamRounds.tsx:138 | E |

### CoachHelm (player)  (`/clubhouse-preview/coachhelm-player`; 32 text runs on phone, 28 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title.ch-hl-h__t` | CoachHelm | 34/600 | P | 12.6 | 13.0 / 12.9 | 13.4 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-hl-row__v.ch-num` | 1.1 (+5) | 12/500 | P D dark only | 10.6 | 14.7 / 14.6 | 10.6 | src/clubhouse/styles/coachhelm.css:579 | src/clubhouse/screens/coachhelm/parts.tsx:229 | E |
| `.ch-hl-row__b` | Course management (+4) | 12/500 | P D dark only | 10.9 | 14.7 / 14.6 | 10.9 | src/clubhouse/styles/coachhelm.css:561 | src/clubhouse/screens/coachhelm/parts.tsx:224 | E |
| `.ch-hl-bars` | Downhill (+3) | 14/500 | P D dark only | 15.1 | 15.7 / 15.6 | 15.1 | src/clubhouse/styles/coachhelm.css:130 | src/clubhouse/screens/coachhelm/parts.tsx:85 | E |
| `.ch-hl-ev__f` | 75 putts (+2) | 12/400 | P D dark only | 10.8 | 14.7 / 14.6 | 10.8 | src/clubhouse/styles/coachhelm-dive.css:1129 | src/clubhouse/screens/coachhelm/parts.tsx:109 | E |
| `.ch-hv-chip` | Standing (+1) | 14/500 | P | 12.8 | 14.7 / 14.6 | 12.8 | src/clubhouse/styles/coachhelm-views.css:28 | src/clubhouse/screens/coachhelm/views/PlayerHelmTabs.tsx:57 | E |
| `.ch-hl-week__t` | Downhill ladder (+1) | 14/400 | P D dark only | 10.9 | 14.7 / 14.6 | 10.9 | src/clubhouse/styles/coachhelm.css:278 | src/clubhouse/screens/coachhelm/parts.tsx:164 | E |
| `.ch-hl-sec` | Also worth knowing (+1) | 20/600 | P | 13.0 | 13.0 / 12.9 | 13.4 | src/clubhouse/styles/coachhelm.css:507 | src/clubhouse/screens/coachhelm/PlayerBoard.tsx:162 | E |
| `.ch-hv-chip.is-link` | Development | 14/500 | P | 8.8 | 8.8 / 8.7 | 9.1 | src/clubhouse/styles/coachhelm-views.css:28 | src/clubhouse/screens/coachhelm/views/PlayerHelmTabs.tsx:57 | E |
| `.ch-hl-h` | One thing to work on this week, based on t… | 15/400 | P | 13.0 | 14.7 / 14.6 | 13.0 | src/clubhouse/styles/coachhelm.css:59 | src/clubhouse/screens/coachhelm/CoachHelmSkeleton.tsx:158 | E |
| `.ch-hl-ev__l` | Make rate, downhill vs level, same distanc… | 13/500 | P D dark only | 11.0 | 14.7 / 14.6 | 11.0 | src/clubhouse/styles/coachhelm.css:126 | src/clubhouse/screens/coachhelm/parts.tsx:83 | E |
| `.ch-hl-week__k` | This week | 12/600 | P D dark only | 7.0 | 7.0 / 7.0 | 7.7 | src/clubhouse/styles/coachhelm.css:274 | src/clubhouse/screens/coachhelm/parts.tsx:165 | E |
| `.ch-hl-week` | Rehearse a downhill-only ladder: start 2 f… | 14/400 | P D dark only | 13.1 | 14.7 / 14.6 | 13.1 | src/clubhouse/styles/coachhelm.css:266 | src/clubhouse/screens/coachhelm/parts.tsx:163 | E |
| `.ch-hl-why` | Why we think this | 14/600 | P D dark only | 15.2 | 15.7 / 15.6 | 15.2 | src/clubhouse/styles/coachhelm.css:462 | src/clubhouse/screens/coachhelm/parts.tsx:179 | E |
| `.ch-hl-note` | Reads update as you post rounds. Your coac… | 13/400 | P D dark only | 10.9 | 14.7 / 14.6 | 10.9 | src/clubhouse/styles/coachhelm.css:588 | src/clubhouse/screens/coachhelm/Proposals.tsx:140 | E |
| `.ch-hl-h__t` | CoachHelm | 44/600 | D dark only | 13.3 |  | 13.3 | src/clubhouse/styles/coachhelm.css:55 | src/clubhouse/screens/coachhelm/parts.tsx:272 | E |
| `.ch-hl-h` | One thing to work on this week, based on t… | 16/400 | D dark only | 13.1 |  | 13.1 | src/clubhouse/styles/coachhelm.css:59 | src/clubhouse/screens/coachhelm/CoachHelmSkeleton.tsx:158 | E |
| `.ch-btn.ch-btn--ghost.ch-btn--sm` | Development | 13/500 | D dark only | 7.7 |  | 7.7 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |

### Recruiting  (`/clubhouse-preview/recruiting`; 32 text runs on phone, 61 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title.ch-recm-title` | Recruiting | 34/600 | P | 7.8 | 8.1 / 8.0 | 13.2 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-es__body` | Add the golfers you’re watching and move t… (+1) | 15/400 | P D | 9.8 | 10.0 / 9.9 | 13.0 | src/clubhouse/styles/ui.css:2222 | src/clubhouse/ui/States.tsx:112 | C |
| `.ch-es__title` | Your prospect list starts here | 28/600 | P D | 8.0 | 8.1 / 8.0 | 13.2 | src/clubhouse/styles/ui.css:2207 | src/clubhouse/ui/States.tsx:109 | C |
| `.ch-recm-row__b` | Mason Reilly (+15) | 13/400 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/recruiting.css:1044 | src/clubhouse/screens/recruiting/RecruitingPhone.tsx:105 | E |
| `.ch-rec-tb` | Prospect (+10) | 12/500 | D | 8.4 | 8.7 / 8.3 | 9.6 | src/clubhouse/styles/recruiting.css:223 | src/clubhouse/screens/recruiting/RecruitingDesktop.tsx:127 | E |
| `.ch-rec-pipe__txt` | Watched (+7) | 13/400 | P D | 8.5 | 8.7 / 8.3 | 10.7 | src/clubhouse/styles/recruiting.css:180 | src/clubhouse/screens/recruiting/Pipeline.tsx:75 | E |
| `.ch-rec-tb__name` | Caleb Nguyen (+7) | 14/500 | D | 13.4 | 15.1 / 14.6 | 13.4 | src/clubhouse/styles/recruiting.css:265 | src/clubhouse/screens/recruiting/RecruitingDesktop.tsx:155 | E |
| `.ch-rec-tb__sub` | 2028 · Raleigh, NC (+7) | 13/400 | D | 8.6 | 8.7 / 8.3 | 9.6 | src/clubhouse/styles/recruiting.css:289 | src/clubhouse/screens/recruiting/RecruitingDesktop.tsx:159 | E |
| `.ch-rec-doc__t` | Fall tournament schedule.pdf (+2) | 14/400 | D | 15.1 | 15.1 / 14.6 | 15.2 | src/clubhouse/styles/recruiting.css:608 | src/clubhouse/screens/recruiting/Documents.tsx:285 | E |
| `.ch-rec-head` | Prospects you’re following, from first loo… (+1) | 16/400 | D | 9.6 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/recruiting.css:27 | src/clubhouse/screens/recruiting/RecruitingDesktop.tsx:30 | E |
| `.ch-rec-pipe__sum` | Pipeline (+1) | 20/600 | D | 7.8 | 8.3 / 8.0 | 10.9 | src/clubhouse/styles/recruiting.css:63 | src/clubhouse/screens/recruiting/Pipeline.tsx:38 | E |
| `.ch-rec-panel__id` | Mason Reilly (+1) | 20/600 | D | 8.2 | 8.3 / 8.0 | 13.1 | src/clubhouse/styles/recruiting.css:404 | src/clubhouse/screens/recruiting/RecruitingDesktop.tsx:202 | E |
| `.ch-rec-sec` | Contact (+1) | 13/600 | D | 8.7 | 8.7 / 8.3 | 10.9 | src/clubhouse/styles/recruiting.css:491 | src/clubhouse/screens/recruiting/parts.tsx:105 | E |
| `.ch-rec-row__v` | mason.reilly@example.com (+1) | 14/400 | D | 15.1 | 15.1 / 14.6 | 15.2 | src/clubhouse/styles/recruiting.css:1978 | src/clubhouse/screens/recruiting/parts.tsx:97 | E |
| `.ch-rec-row__a` | Email (+1) | 13/500 | D | 7.2 | 7.2 / 7.0 | 7.8 | src/clubhouse/styles/recruiting.css:554 | src/clubhouse/screens/recruiting/parts.tsx:124 | E |
| `.ch-rec-cal__t` | Recruiting calendar | 14/400 | P D dark only | 9.8 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/recruiting.css:1822 | src/clubhouse/screens/recruiting/parts.tsx:249 | E |
| `.ch-rec-cal__pick` | Choose your division | 14/500 | P D | 6.8 | 7.0 / 7.0 | 7.6 | src/clubhouse/styles/recruiting.css:1825 | src/clubhouse/screens/recruiting/parts.tsx:258 | E |
| `.ch-recm-count` | 8 prospects | 13/500 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/recruiting.css:963 | src/clubhouse/screens/recruiting/RecruitingPhone.tsx:85 | E |
| `.ch-recm-sort` | Recently updated | 14/500 | P | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/recruiting.css:969 | src/clubhouse/screens/recruiting/RecruitingPhone.tsx:92 | E |
| `.ch-rec-notes` | Saw Mason at the Carolinas Junior in July.… | 14/400 | D | 15.1 | 15.1 / 14.6 | 15.2 | src/clubhouse/styles/recruiting.css:1304 | src/clubhouse/screens/recruiting/parts.tsx:219 | E |
| `.ch-rec-sec__head` | Documents | 13/600 | D | 8.7 | 8.7 / 8.3 | 10.9 | src/clubhouse/styles/recruiting.css:1233 | src/clubhouse/screens/recruiting/Documents.tsx:254 | E |
| `.ch-rec-link` | Upload | 13/500 | D | 7.2 | 7.2 / 7.0 | 7.8 | src/clubhouse/styles/recruiting.css:502 | src/clubhouse/screens/recruiting/Documents.tsx:257 | E |
| `.ch-rec-note` | Private to your staff. Files open through … | 12/400 | D | 8.7 | 8.7 / 8.3 | 10.9 | src/clubhouse/styles/recruiting.css:646 | src/clubhouse/screens/recruiting/Documents.tsx:304 | E |
| `.ch-rec-note.ch-rec-drophint` | Drop a file here to add it. Film can be an… | 12/400 | D | 8.7 | 8.7 / 8.3 | 10.9 | src/clubhouse/styles/recruiting.css:646 | src/clubhouse/screens/recruiting/Documents.tsx:304 | E |
| `.ch-rec-meta` | Added | 13/400 | D | 8.7 | 8.7 / 8.3 | 10.9 | src/clubhouse/styles/recruiting.css:434 | src/clubhouse/screens/recruiting/parts.tsx:231 | E |

### CoachHelm board (coach)  (`/clubhouse-preview/coachhelm`; 30 text runs on phone, 30 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title.ch-hl-h__t` | CoachHelm | 34/600 | P | 12.7 | 13.0 / 12.9 | 13.4 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-sec__title` | Your players | 20/600 | P D dark only | 12.9 | 13.0 / 12.9 | 13.3 | src/clubhouse/styles/home.css:3222 | src/clubhouse/ui/Section.tsx:34 | B |
| `.ch-es__title` | No signals yet | 16/600 | P D dark only | 15.2 | 15.7 / 15.6 | 15.2 | src/clubhouse/styles/ui.css:2207 | src/clubhouse/ui/States.tsx:109 | C |
| `.ch-es__body` | CoachHelm reads posted rounds. Each player… | 14/400 | P D dark only | 13.1 | 14.7 / 14.6 | 13.1 | src/clubhouse/styles/ui.css:2222 | src/clubhouse/ui/States.tsx:112 | C |
| `.ch-hl-pl` | Jonah Okafor (+5) | 12/400 | P D dark only | 10.9 | 15.7 / 15.6 | 10.9 | src/clubhouse/styles/coachhelm.css:434 | src/clubhouse/screens/coachhelm/CoachBoard.tsx:186 | E |
| `.ch-hl-ledger` | Eli (+3) | 14/500 | P D dark only | 13.1 | 14.7 / 14.6 | 13.1 | src/clubhouse/styles/coachhelm.css:238 | src/clubhouse/screens/coachhelm/parts.tsx:98 | E |
| `.ch-hl-ev__f` | 21 rounds (+2) | 12/400 | P D dark only | 10.9 | 14.7 / 14.6 | 10.9 | src/clubhouse/styles/coachhelm-dive.css:1129 | src/clubhouse/screens/coachhelm/parts.tsx:109 | E |
| `.ch-hl-h` | 3 players have an open signal. (+1) | 15/400 | P | 13.0 | 14.7 / 14.6 | 13.0 | src/clubhouse/styles/coachhelm.css:59 | src/clubhouse/screens/coachhelm/CoachHelmSkeleton.tsx:158 | E |
| `.ch-hl-since__b` | Since you were last here (+1) | 14/500 | P D dark only | 10.8 | 14.7 / 14.6 | 10.8 | src/clubhouse/styles/coachhelm.css:291 | src/clubhouse/screens/coachhelm/CoachBoard.tsx:366 | E |
| `.ch-hl-pl__c.ch-num` | 3 (+1) | 12/600 | P | 11.9 | 14.7 / 14.6 | 11.9 | src/clubhouse/styles/coachhelm.css:698 | src/clubhouse/screens/coachhelm/CoachBoard.tsx:200 | E |
| `.ch-hl-h` | 3 players have an open signal. (+1) | 16/400 | D dark only | 13.1 |  | 13.1 | src/clubhouse/styles/coachhelm.css:59 | src/clubhouse/screens/coachhelm/CoachHelmSkeleton.tsx:158 | E |
| `.ch-hl-pl.is-on` | Eli Brandt (+1) | 12/400 | D dark only | 9.8 |  | 9.8 | src/clubhouse/styles/coachhelm.css:434 | src/clubhouse/screens/coachhelm/CoachBoard.tsx:186 | E |
| `.ch-hl-role` | Coach | 13/500 | P D dark only | 9.0 | 14.7 / 14.6 | 9.0 | src/clubhouse/styles/shell.css:2185 | src/clubhouse/screens/coachhelm/parts.tsx:269 | E |
| `.ch-hl-note__a` | Sam Whitfield | 14/600 | P D dark only | 13.1 | 14.7 / 14.6 | 13.1 | src/clubhouse/styles/coachhelm.css:2095 | src/clubhouse/screens/coachhelm/CoachBoard.tsx:211 | E |
| `.ch-hl-pl.is-none` | No reads yet | 12/400 | P D dark only | 10.9 | 14.7 / 14.6 | 10.9 | src/clubhouse/styles/coachhelm.css:434 | src/clubhouse/screens/coachhelm/CoachBoard.tsx:186 | E |
| `.ch-hl-ev__l` | Penalties per round | 13/500 | P D dark only | 11.0 | 14.7 / 14.6 | 11.0 | src/clubhouse/styles/coachhelm.css:126 | src/clubhouse/screens/coachhelm/parts.tsx:83 | E |
| `.ch-hl-why` | Why we think this | 14/600 | P D dark only | 15.2 | 15.7 / 15.6 | 15.2 | src/clubhouse/styles/coachhelm.css:462 | src/clubhouse/screens/coachhelm/parts.tsx:179 | E |
| `.ch-btn.ch-btn--ghost` | Dismiss | 14/500 | P D dark only | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-btn.ch-btn--ghost` | All of | 14/500 | P D dark only | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-hl-h__t` | CoachHelm | 44/600 | D dark only | 13.3 |  | 13.3 | src/clubhouse/styles/coachhelm.css:55 | src/clubhouse/screens/coachhelm/parts.tsx:272 | E |

### Settings  (`/clubhouse-preview/settings`; 25 text runs on phone, 50 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title.ch-setm-title` | Settings | 34/600 | P | 7.8 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-display` | Settings | 44/600 | D dark only | 13.3 |  | 13.3 | src/clubhouse/styles/base.css:142 | src/clubhouse/ui/PageHero.tsx:63 | A |
| `.ch-set-rail__i` | Notifications (+10) | 13/400 | D | 8.5 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/settings.css:44 | src/clubhouse/screens/settings/SettingsView.tsx:176 | E |
| `.ch-setm-row__l` | Account (+9) | 15/600 | P | 7.0 | 7.0 / 7.0 | 7.8 | src/clubhouse/styles/settings.css:1007 | src/clubhouse/screens/settings/phone/GolfPhone.tsx:110 | E |
| `.ch-setm-row__v` | Profile, email (+7) | 14/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/settings.css:1012 | src/clubhouse/screens/settings/phone/GolfPhone.tsx:111 | E |
| `.ch-field__label` | Full name (+7) | 13/500 | D | 15.1 | 15.1 / 14.6 | 15.2 | src/clubhouse/styles/recruiting.css:1408 | src/clubhouse/screens/roster/Roster.tsx:936 | E |
| `.ch-surface__title` | Profile (+5) | 20/600 | D | 5.3 | 5.3 / 5.1 | 7.1 | src/clubhouse/styles/settings.css:195 | src/clubhouse/ui/Surface.tsx:45 | E |
| `.ch-surface__sub` | How players and staff see you across GolfH… (+4) | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/ui.css:530 | src/clubhouse/screens/settings/parts.tsx:80 | E |
| `.ch-setm-id__b` | Jonah Okafor (+3) | 14/400 | P | 9.9 | 10.0 / 9.9 | 13.0 | src/clubhouse/styles/settings.css:869 | src/clubhouse/screens/settings/phone/SettingsPhone.tsx:294 | E |
| `.ch-set-row__l` | Current email (+3) | 14/500 | D | 15.1 | 15.1 / 14.6 | 15.2 | src/clubhouse/styles/settings.css:246 | src/clubhouse/screens/settings/parts.tsx:130 | E |
| `.ch-set-photo__txt` | Photo (+1) | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/settings.css:407 | src/clubhouse/screens/settings/Account.tsx:62 | E |
| `.ch-field__help` | With your name in Messages, on announcemen… (+1) | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/controls.css:216 | src/clubhouse/screens/calendar/editor-round.tsx:317 | E |
| `.ch-set-value` | maya.reyes@unc.edu (+1) | 14/400 | D | 10.3 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/settings.css:320 | src/clubhouse/screens/settings/Golf.tsx:76 | E |
| `.ch-set-link` | Report a problem (+1) | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/settings.css:423 | src/clubhouse/screens/settings/Account.tsx:243 | E |
| `.ch-set-link` | Privacy policy (+1) | 14/500 | D | 15.1 | 15.1 / 14.6 | 15.2 | src/clubhouse/styles/settings.css:423 | src/clubhouse/screens/settings/Account.tsx:243 | E |
| `.ch-set-row__h` | Signs you out on this device. (+1) | 13/400 | D | 8.7 | 8.7 / 8.4 | 10.9 | src/clubhouse/styles/settings.css:256 | src/clubhouse/screens/settings/parts.tsx:138 | E |
| `.ch-set-head` | Head coach (+1) | 16/400 | D dark only | 13.1 |  | 13.1 | src/clubhouse/styles/settings.css:19 | src/clubhouse/screens/settings/SettingsView.tsx:161 | E |
| `.ch-setm-gh` | Help and legal | 20/600 | P | 8.0 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/settings.css:928 | src/clubhouse/screens/settings/phone/ui.tsx:23 | E |
| `.ch-setm-signout` | Sign out | 15/600 | P | 14.6 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/settings.css:1313 | src/clubhouse/screens/settings/phone/SettingsPhone.tsx:317 | E |
| `.ch-set-value.ch-num` | Web | 14/400 | D | 10.3 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/settings.css:320 | src/clubhouse/screens/settings/Golf.tsx:76 | E |

### CoachHelm, coach's view of a player  (`/clubhouse-preview/coachhelm-coach-player`; 25 text runs on phone, 68 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title.ch-hl-h__t` | Jonah Okafor | 34/600 | P | 12.7 | 13.0 / 12.9 | 13.4 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-hd-it__b` | Downhill putts from 4–6 ft: a real penalty (+7) | 12/600 | P | 5.4 | 5.4 / 5.4 | 9.3 | src/clubhouse/styles/coachhelm-dive.css:126 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:555 | E |
| `.ch-hd-it__v.ch-num` | 23 pts (+7) | 15/600 | P | 5.4 | 5.4 / 5.4 | 9.3 | src/clubhouse/styles/coachhelm-dive.css:139 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:562 | E |
| `.ch-hd-read` | What (+7) | 13/600 | D dark only | 9.3 |  | 9.3 | src/clubhouse/styles/coachhelm-dive.css:258 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:337 | E |
| `.ch-hd-r__d.ch-num` | Sep 28 (+7) | 13/600 | D dark only | 9.3 |  | 9.3 | src/clubhouse/styles/coachhelm-dive.css:541 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:221 | E |
| `.ch-hd-r__s.ch-num` | 74 (+7) | 15/600 | D dark only | 13.1 |  | 13.1 | src/clubhouse/styles/coachhelm-dive.css:558 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:226 | E |
| `.ch-hd-sec__h` | What was measured (+5) | 16/600 | D dark only | 9.3 |  | 9.3 | src/clubhouse/styles/coachhelm-dive.css:320 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:118 | E |
| `.ch-hd-dx__d` | Penalties off the tee, per round (+4) | 12/400 | D dark only | 10.9 |  | 10.9 | src/clubhouse/styles/coachhelm-dive.css:632 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:260 | E |
| `.ch-hl-ledger` | Jonah (+3) | 14/500 | D dark only | 13.1 |  | 13.1 | src/clubhouse/styles/coachhelm.css:238 | src/clubhouse/screens/coachhelm/parts.tsx:98 | E |
| `.ch-hd-r__c` | Oak Hollow (+3) | 12/400 | D dark only | 10.9 |  | 10.9 | src/clubhouse/styles/coachhelm-dive.css:553 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:222 | E |
| `.ch-hd-grp__h` | Putting (+2) | 13/600 | P | 10.9 | 13.0 / 12.9 | 10.9 | src/clubhouse/styles/coachhelm-dive.css:51 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:604 | E |
| `.ch-hl-ev__f` | 21 rounds (+2) | 12/400 | D dark only | 10.9 |  | 10.9 | src/clubhouse/styles/coachhelm-dive.css:1129 | src/clubhouse/screens/coachhelm/parts.tsx:109 | E |
| `.ch-hd-plan__b` | Goal made from this (+2) | 12/500 | D dark only | 10.9 |  | 10.9 | src/clubhouse/styles/coachhelm-dive.css:725 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:402 | E |
| `.ch-hd-meas__v` | 1.1 (+1) | 44/600 | D dark only | 9.9 |  | 9.9 | src/clubhouse/styles/coachhelm-dive.css:344 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:519 | E |
| `.ch-hd-strip__c.ch-num` | +6 (+1) | 14/600 | D dark only | 9.3 |  | 9.3 | src/clubhouse/styles/coachhelm-dive.css:433 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:167 | E |
| `.ch-hv-chip` | Standing | 14/500 | P | 12.8 | 14.7 / 14.6 | 12.8 | src/clubhouse/styles/coachhelm-views.css:28 | src/clubhouse/screens/coachhelm/views/PlayerHelmTabs.tsx:57 | E |
| `.ch-hl-role` | CoachHelm | 12/500 | P | 9.2 | 14.7 / 14.6 | 9.2 | src/clubhouse/styles/shell.css:2185 | src/clubhouse/screens/coachhelm/parts.tsx:269 | E |
| `.ch-hl-h` | Junior · Last round Sep 28, 3 days ago | 15/400 | P | 13.1 | 14.7 / 14.6 | 13.1 | src/clubhouse/styles/coachhelm.css:59 | src/clubhouse/screens/coachhelm/CoachHelmSkeleton.tsx:158 | E |
| `.ch-hd-hero` | CoachHelm has 4 reads on Jonah’s game, 2 o… | 20/600 | P D dark only | 10.8 | 10.9 / 10.8 | 13.4 | src/clubhouse/styles/coachhelm-dive.css:7 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:643 | E |
| `.ch-hd-it__f` | · | 12/500 | P | 10.9 | 14.7 / 14.6 | 10.9 | src/clubhouse/styles/coachhelm-dive.css:158 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:559 | E |
| `.ch-hv-role-link` | CoachHelm | 13/500 | D dark only | 9.0 |  | 9.0 | src/clubhouse/styles/coachhelm-views.css:262 | src/clubhouse/screens/coachhelm/views/Frame.tsx:56 | E |
| `.ch-hl-h__t` | Jonah Okafor | 44/600 | D dark only | 13.3 |  | 13.3 | src/clubhouse/styles/coachhelm.css:55 | src/clubhouse/screens/coachhelm/parts.tsx:272 | E |
| `.ch-hl-h` | Junior · Last round Sep 28, 3 days ago | 16/400 | D dark only | 13.1 |  | 13.1 | src/clubhouse/styles/coachhelm.css:59 | src/clubhouse/screens/coachhelm/CoachHelmSkeleton.tsx:158 | E |
| `.ch-hl-focus__k` | Course management | 13/600 | D dark only | 9.3 |  | 9.3 | src/clubhouse/styles/coachhelm-dive.css:1073 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:466 | E |
| `.ch-hl-pri.is-high` | Priority | 13/600 | D dark only | 9.0 |  | 9.0 | (see component) | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:483 | E |
| `.ch-hd-dos__h` | Penalty strokes: | 34/600 | D dark only | 13.4 |  | 13.4 | src/clubhouse/styles/coachhelm-dive.css:1065 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:465 | E |
| `.ch-serif-num` | 1.1 | 34/600 | D dark only | 13.4 |  | 13.4 | src/clubhouse/styles/shell.css:2240 | src/clubhouse/ui/SerifText.tsx:14 | E |
| `.ch-btn.ch-btn--ghost` | Dismiss | 14/500 | D dark only | 7.8 |  | 7.8 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-hd-msg` | Message | 14/500 | D dark only | 13.1 |  | 13.1 | src/clubhouse/styles/coachhelm-dive.css:1274 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:501 | E |
| `.ch-hd-meas__s.ch-num` | All rounds | 13/400 | D dark only | 13.1 |  | 13.1 | src/clubhouse/styles/coachhelm-dive.css:356 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:523 | E |
| `.ch-hd-tr__k` | Jonah’s scores in the rounds below | 13/500 | D dark only | 10.9 |  | 10.9 | src/clubhouse/styles/coachhelm-dive.css:400 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:143 | E |
| `.ch-hd-dx__r` | Twenty-one rounds is enough to trust an av… | 13/400 | D dark only | 10.9 |  | 10.9 | src/clubhouse/styles/coachhelm-dive.css:647 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:272 | E |
| `.ch-hd-full__k` | The full write-up | 13/500 | D dark only | 10.9 |  | 10.9 | src/clubhouse/styles/coachhelm-dive.css:657 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:277 | E |
| `.ch-hd-why` | Across all 21 rounds on file Jonah is aver… | 15/400 | D dark only | 13.1 |  | 13.1 | src/clubhouse/styles/coachhelm-dive.css:661 | src/clubhouse/screens/coachhelm/views/DeepDive.tsx:278 | E |

### Tournament desk  (`/clubhouse-preview/tournament-desk`; 18 text runs on phone, 52 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-intro__eyebrow` | Oct 5 – 7 · Oakmont CC | 13/500 | P | 6.2 | 6.5 / 6.5 | 9.1 | src/clubhouse/styles/ui.css:1016 | src/clubhouse/screens/calendar/CalendarPhone.tsx:116 | A |
| `.ch-intro__title.ch-large-title` | Oakmont Fall Classic | 34/600 | P | 7.9 | 8.1 / 8.0 | 13.2 | src/clubhouse/styles/ui.css:1031 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-sec__title` | Who counted (+1) | 20/600 | P D | 8.0 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/home.css:3222 | src/clubhouse/ui/Section.tsx:34 | B |
| `.ch-sec__meta` | Lowest 4 whole-round scores each round mak… (+1) | 13/400 | P D | 8.3 | 8.7 / 8.3 | 10.9 | src/clubhouse/styles/ui.css:695 | src/clubhouse/ui/Section.tsx:38 | B |
| `.ch-nodata` | — | 13/400 | D | 8.7 | 8.7 / 8.3 | 10.9 | src/clubhouse/styles/ui.css:371 | src/clubhouse/ui/NoData.tsx:10 | C |
| `.ch-tour-desk-sc.ch-num` | 70 (+6) | 15/500 | D | 15.0 | 15.1 / 14.5 | 15.2 | src/clubhouse/styles/tournaments-desk.css:293 | src/clubhouse/screens/tournaments/WhoCounted.tsx:88 | E |
| `.ch-tour-desk-ct__n` | Theo Marchetti (+5) | 15/600 | D | 14.9 | 15.1 / 14.5 | 15.2 | src/clubhouse/styles/tournaments-desk.css:253 | src/clubhouse/screens/tournaments/WhoCounted.tsx:67 | E |
| `.ch-hscroll.ch-tour-desk-tabs` | Overview (+4) | 14/500 | P D | 9.9 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/hub.css:2509 | src/clubhouse/screens/tournaments/EventDesk.tsx:303 | E |
| `.is-r.ch-num.ch-tour-desk-ct__tot` | 214 (+4) | 15/600 | D | 15.0 | 15.1 / 14.5 | 15.1 | src/clubhouse/styles/tournaments-desk.css:274 | src/clubhouse/screens/tournaments/WhoCounted.tsx:110 | E |
| `.ch-tour-desk-key` | Not counted that round (+3) | 13/400 | P D | 9.6 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/tournaments-desk.css:351 | src/clubhouse/screens/tournaments/WhoCounted.tsx:189 | E |
| `.ch-tour-desk-ct__row.is-head` | Player (+3) | 13/500 | D | 10.0 | 10.3 / 9.9 | 12.9 | src/clubhouse/styles/tournaments-desk.css:232 | src/clubhouse/screens/tournaments/WhoCounted.tsx:63 | E |
| `.ch-tour-desk-ct__s` | Senior (+3) | 13/400 | D | 10.1 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/tournaments-desk.css:263 | src/clubhouse/screens/tournaments/WhoCounted.tsx:68 | E |
| `.is-r.ch-tour-desk-ct__cnt` | 3/3 (+2) | 13/400 | D | 10.1 | 10.3 / 9.9 | 13.0 | src/clubhouse/styles/tournaments-desk.css:281 | src/clubhouse/screens/tournaments/WhoCounted.tsx:114 | E |
| `.ch-tour-desk-res` | 858 (+1) | 13/400 | P D | 10.0 | 10.3 / 9.9 | 13.0 | src/clubhouse/styles/tournaments-desk.css:43 | src/clubhouse/screens/tournaments/EventDesk.tsx:130 | E |
| `.ch-tour-desk-sc.ch-num` | 72 (+1) | 15/500 | D | 15.1 | 15.1 / 14.5 | 15.2 | src/clubhouse/styles/tournaments-desk.css:293 | src/clubhouse/screens/tournaments/WhoCounted.tsx:88 | E |
| `.ch-num.ch-tour-under` | −6 | 16/600 | P D | 5.1 | 5.3 / 5.1 | 7.0 | src/clubhouse/styles/tournaments.css:166 | src/clubhouse/screens/tournaments/HoleGrid.tsx:79 | E |
| `.ch-tour-head__t` | Oakmont Fall Classic | 44/600 | D | 7.9 | 8.3 / 8.0 | 13.3 | src/clubhouse/styles/tournaments.css:53 | src/clubhouse/screens/tournaments/parts.tsx:81 | E |
| `.ch-tour-desk-link` | Official results | 14/500 | D | 7.2 | 7.2 / 7.0 | 7.7 | src/clubhouse/styles/tournaments-desk.css:449 | src/clubhouse/screens/tournaments/EventDesk.tsx:142 | E |
| `.ch-tour-crumb` | Tournaments | 13/500 | D dark only | 13.0 |  | 13.0 | src/clubhouse/styles/tournaments.css:101 | src/clubhouse/screens/tournaments/parts.tsx:119 | E |
| `.ch-tour-head__k.ch-num` | Oct 5 – 7, 2026 · Oakmont CC · Blue tees | 13/500 | D dark only | 9.1 |  | 9.1 | src/clubhouse/styles/tournaments.css:59 | src/clubhouse/screens/tournaments/TourPlaceholder.tsx:67 | E |

### Team Hub (player)  (`/clubhouse-preview/hub-player`; 15 text runs on phone, 15 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title` | Team Hub | 34/600 | P D dark only | 7.9 | 8.1 / 8.0 | 13.3 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-hscroll.ch-hb-strip` | 2 (+7) | 14/600 | P D | 5.0 | 5.0 / 5.0 | 8.5 | src/clubhouse/styles/hub.css:2509 | src/clubhouse/screens/tournaments/EventDesk.tsx:303 | E |
| `.ch-hscroll.ch-hb-tabs` | Home (+4) | 14/500 | P D | 9.7 | 10.0 / 9.9 | 13.0 | src/clubhouse/styles/hub.css:2509 | src/clubhouse/screens/tournaments/EventDesk.tsx:303 | E |
| `.ch-hb-muted` | Varsity · 2026–27 | 12/500 | P D dark only | 6.2 | 6.5 / 6.5 | 9.2 | src/clubhouse/styles/hub.css:38 | src/clubhouse/screens/hub/TeamHub.tsx:601 | E |

### New round setup  (`/clubhouse-preview/setup`; 15 text runs on phone, 2 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-rsu-field` | Round type (+3) | 13/500 | P | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/rounds-setup.css:319 | src/clubhouse/screens/rounds/setup/AddCourseSheet.tsx:158 | E |
| `.ch-rsu-qual__b` | Open qualifier (+2) | 12/600 | P | 8.7 | 8.8 / 8.7 | 9.3 | src/clubhouse/styles/rounds-setup.css:279 | src/clubhouse/screens/rounds/setup/RoundSetup.tsx:331 | E |
| `.ch-rsu-course__empty` | Choose a course (+1) | 20/600 | P | 8.0 | 8.1 / 8.0 | 13.1 | src/clubhouse/styles/rounds-setup.css:227 | src/clubhouse/screens/rounds/setup/RoundSetup.tsx:300 | E |
| `.ch-rsu-note` | Tracked on every shot: (+1) | 13/400 | P D | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/rounds-setup.css:431 | src/clubhouse/screens/rounds/setup/AddCourseSheet.tsx:229 | E |
| `.ch-rsu-card__h` | Round details | 20/600 | P | 8.1 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/rounds-setup.css:154 | src/clubhouse/screens/rounds/setup/HoleConfig.tsx:49 | E |
| `.ch-rsu-field__hint` | Shotgun start? Pick a course, then choose … | 13/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/rounds-setup.css:325 | src/clubhouse/screens/rounds/setup/RoundSetup.tsx:384 | E |
| `.ch-rsu-card__h.ch-rsu-ph` | Scorecard | 20/600 | P | 8.1 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/rounds-setup.css:154 | src/clubhouse/screens/rounds/setup/HoleConfig.tsx:49 | E |
| `.ch-rsu-card.ch-rsu-hc.ch-rsu-hc--empty` | Your scorecard appears here once you pick … | 14/400 | P | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/rounds-setup.css:134 | src/clubhouse/screens/rounds/setup/HoleConfig.tsx:48 | E |

### Round review  (`/clubhouse-preview/round`; 13 text runs on phone, 23 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-rv-figs` | Front 9 (+12) | 12/400 | P D | 8.3 | 8.4 / 8.3 | 10.8 | src/clubhouse/styles/rounds.css:1153 | src/clubhouse/screens/rounds/RoundReview.tsx:637 | E |
| `.ch-rv-hero__s` | +2 (+1) | 17/600 | D | 6.7 | 6.8 / 6.7 | 8.5 | src/clubhouse/styles/rounds.css:1111 | src/clubhouse/screens/rounds/RoundReview.tsx:628 | E |
| `.ch-rv-back` | Jonah Okafor (+1) | 13/500 | D dark only | 9.1 |  | 9.1 | src/clubhouse/styles/rounds.css:1038 | src/clubhouse/screens/rounds/RoundReview.tsx:602 | E |
| `.ch-rv-hero__k` | Jonah Okafor · Wed Oct 14 · Practice (+1) | 13/500 | D dark only | 9.1 |  | 9.1 | src/clubhouse/styles/rounds.css:1079 | src/clubhouse/screens/rounds/RoundReview.tsx:615 | E |
| `.ch-rv-hero__h` | Approach gained +1.3, putting gave back 0.… | 16/400 | D | 9.7 | 10.3 / 10.1 | 13.1 | src/clubhouse/styles/rounds.css:3080 | src/clubhouse/screens/rounds/RoundReview.tsx:619 | E |
| `.ch-rv-hero__m` | Blue tees · 6,984 yds · 73.1 / 133 | 15/400 | D | 9.7 | 10.3 / 10.1 | 13.1 | src/clubhouse/styles/rounds.css:1091 | src/clubhouse/screens/rounds/RoundReview.tsx:621 | E |
| `.ch-btn.ch-btn--ghost` | Print | 14/500 | D | 7.0 | 7.2 / 7.1 | 7.9 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |
| `.ch-rv-hero__l` | Finley GC | 44/600 | D dark only | 13.3 |  | 13.3 | src/clubhouse/styles/rounds.css:1073 | src/clubhouse/screens/rounds/RoundsSkeleton.tsx:119 | E |

### Tournaments home  (`/clubhouse-preview/tournaments`; 10 text runs on phone, 65 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-intro__title.ch-large-title` | Tournaments | 34/600 | P | 7.9 | 8.1 / 8.0 | 13.2 | src/clubhouse/styles/ui.css:1031 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-intro__eyebrow` | Varsity · Fall 2026 | 13/500 | P | 6.6 | 6.6 / 6.6 | 9.2 | src/clubhouse/styles/ui.css:1016 | src/clubhouse/screens/calendar/CalendarPhone.tsx:116 | A |
| `.ch-sec__title` | Coming up (+2) | 20/600 | P D | 7.8 | 8.1 / 8.0 | 13.3 | src/clubhouse/styles/home.css:3222 | src/clubhouse/ui/Section.tsx:34 | B |
| `.ch-sec__meta` | 2 events on the calendar (+1) | 13/400 | D | 8.2 | 8.7 / 8.3 | 10.9 | src/clubhouse/styles/ui.css:695 | src/clubhouse/ui/Section.tsx:38 | B |
| `.is-r.ch-tour-led__fin` | 858 (+16) | 13/400 | D | 10.3 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/tournaments.css:265 | src/clubhouse/screens/tournaments/SeasonLedger.tsx:120 | E |
| `.ch-tour-led__t2` | Oakmont CC (+14) | 13/400 | D | 10.0 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/tournaments.css:260 | src/clubhouse/screens/tournaments/SeasonLedger.tsx:110 | E |
| `.ch-tour-led__open` | Oakmont Fall Classic (+6) | 15/600 | D | 14.9 | 15.1 / 14.6 | 15.2 | src/clubhouse/styles/tournaments.css:238 | src/clubhouse/screens/tournaments/SeasonLedger.tsx:107 | E |
| `.ch-tour-led__row.is-head` | Event (+5) | 13/500 | D | 9.9 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/tournaments.css:214 | src/clubhouse/screens/tournaments/SeasonLedger.tsx:58 | E |
| `.ch-tour-cov` | 11 of 15 (+4) | 12/400 | D | 10.3 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/tournaments.css:171 | src/clubhouse/screens/tournaments/parts.tsx:181 | E |
| `.ch-tour-led__season` | This season · 2026–27 (+1) | 13/600 | P | 9.7 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/tournaments.css:226 | src/clubhouse/screens/tournaments/SeasonLedger.tsx:45 | E |
| `.ch-tour-head__t` | What happened at each event, who counted, … (+1) | 16/400 | D | 10.0 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/tournaments.css:53 | src/clubhouse/screens/tournaments/parts.tsx:81 | E |
| `.ch-tour-led__season` | This season · 2026–27 (+1) | 13/600 | D | 10.1 | 10.3 / 9.9 | 13.1 | src/clubhouse/styles/tournaments.css:226 | src/clubhouse/screens/tournaments/SeasonLedger.tsx:45 | E |
| `.ch-num.ch-tour-under` | −6 (+1) | 15/600 | D | 5.3 | 5.3 / 5.1 | 7.1 | src/clubhouse/styles/tournaments.css:166 | src/clubhouse/screens/tournaments/HoleGrid.tsx:79 | E |
| `.ch-intro__brief` | What happened at each event, who counted, … | 15/400 | P | 9.8 | 10.0 / 9.9 | 13.0 | src/clubhouse/styles/settings.css:817 | src/clubhouse/ui/Ledger.tsx:218 | E |
| `.ch-lgr__title` | Holly Ridge Classic | 15/600 | P D | 14.7 | 14.7 / 14.6 | 15.2 | src/clubhouse/styles/ui.css:822 | src/clubhouse/ui/Ledger.tsx:72 | E |
| `.ch-lgr__meta` | Holly Ridge · 36 holes · Qualifier opens O… | 13/400 | P D | 8.4 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/ui.css:830 | src/clubhouse/ui/Ledger.tsx:73 | E |
| `.ch-tour-head__k.ch-num` | Varsity · Fall 2026 | 13/500 | D dark only | 9.1 |  | 9.1 | src/clubhouse/styles/tournaments.css:59 | src/clubhouse/screens/tournaments/TourPlaceholder.tsx:67 | E |
| `.ch-btn.ch-btn--secondary` | Add event | 14/500 | D dark only | 13.6 |  | 13.6 | src/clubhouse/styles/home.css:2848 | src/clubhouse/shell/Bell.tsx:412 | E |

### CoachHelm Ask  (`/clubhouse-preview/coachhelm-ask`; 8 text runs on phone, 6 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-ask-card` | Brief me (+5) | 16/600 | P | 9.1 | 9.1 / 9.1 | 9.3 | src/clubhouse/styles/coachhelm-ask.css:1000 | src/clubhouse/screens/coachhelm/chat/Home.tsx:117 | E |
| `.ch-ask-greet` | What do you want to know about (+1) | 15/400 | P D | 10.9 | 15.1 / 15.1 | 10.9 | src/clubhouse/styles/coachhelm-ask.css:399 | src/clubhouse/screens/coachhelm/chat/Home.tsx:12 | E |
| `.ch-ask-team` | Finley University | 14/500 | D | 15.2 | 16.2 / 16.2 | 15.2 | src/clubhouse/styles/coachhelm-ask.css:33 | src/clubhouse/screens/coachhelm/chat/Ask.tsx:56 | E |
| `.ch-ask-head__t` | New chat | 14/500 | D | 13.1 | 15.1 / 15.1 | 13.1 | src/clubhouse/styles/coachhelm-ask.css:82 | src/clubhouse/screens/coachhelm/chat/Ask.tsx:324 | E |
| `.ch-ask-cov` | 6 of 8 players have a round in the last 30… | 13/400 | D | 10.9 | 15.1 / 15.1 | 10.9 | src/clubhouse/styles/coachhelm-ask.css:1234 | src/clubhouse/screens/coachhelm/chat/Home.tsx:142 | E |
| `.ch-ask-foot.is-home` | CoachHelm reads | 12/400 | D | 10.9 | 15.1 / 15.1 | 10.9 | src/clubhouse/styles/coachhelm-ask.css:124 | src/clubhouse/screens/coachhelm/chat/Ask.tsx:332 | E |

### Tournament review  (`/clubhouse-preview/tournament-review`; 8 text runs on phone, 9 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-intro__eyebrow` | Oct 5 – 7 · Oakmont Fall Classic | 13/500 | P | 6.3 | 6.5 / 6.5 | 9.1 | src/clubhouse/styles/ui.css:1016 | src/clubhouse/screens/calendar/CalendarPhone.tsx:116 | A |
| `.ch-intro__title.ch-large-title` | Review | 34/600 | P | 7.8 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/ui.css:1031 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-sec__title` | What the rounds show (+1) | 20/600 | P D | 8.0 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/home.css:3222 | src/clubhouse/ui/Section.tsx:34 | B |
| `.ch-sec__meta` | Observation, evidence, then a possible exp… (+1) | 13/400 | P D | 8.3 | 8.4 / 8.3 | 10.9 | src/clubhouse/styles/ui.css:695 | src/clubhouse/ui/Section.tsx:38 | B |
| `.ch-tour-head__t` | What the rounds show, what each rests on, … (+1) | 16/400 | D | 9.9 | 10.3 / 10.0 | 13.1 | src/clubhouse/styles/tournaments.css:53 | src/clubhouse/screens/tournaments/parts.tsx:81 | E |
| `.ch-intro__brief` | What the rounds show, what each rests on, … | 15/400 | P | 9.9 | 10.0 / 9.9 | 13.0 | src/clubhouse/styles/settings.css:817 | src/clubhouse/ui/Ledger.tsx:218 | E |
| `.ch-tour-rev-missing` | Sofia and Eli | 13/400 | P D | 9.7 | 10.0 / 9.9 | 13.3 | src/clubhouse/styles/tournaments-review.css:90 | src/clubhouse/screens/tournaments/Review.tsx:120 | E |
| `.ch-tour-crumb` | Oakmont Fall Classic | 13/500 | D dark only | 13.0 |  | 13.0 | src/clubhouse/styles/tournaments.css:101 | src/clubhouse/screens/tournaments/parts.tsx:119 | E |
| `.ch-tour-head__k.ch-num` | Oct 5 – 7 · Oakmont Fall Classic | 13/500 | D dark only | 9.1 |  | 9.1 | src/clubhouse/styles/tournaments.css:59 | src/clubhouse/screens/tournaments/TourPlaceholder.tsx:67 | E |

### Qualifiers list (coach)  (`/clubhouse-preview/qualifiers`; 7 text runs on phone, 21 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title` | Lineup decisions | 44/600 | P D | 12.2 | 13.0 / 12.9 | 13.2 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-empty-page__title` | No qualifiers yet | 22/600 | P D | 12.9 | 13.0 / 12.9 | 13.4 | src/clubhouse/styles/shell.css:598 | src/clubhouse/shell/NotRebuilt.tsx:24 | C |
| `.ch-empty-page__body` | Set up a qualifier to rank players across … | 15/400 | P D | 13.1 | 14.7 / 14.6 | 13.1 | src/clubhouse/styles/shell.css:607 | src/clubhouse/shell/NotRebuilt.tsx:25 | C |
| `.ch-qf-card__h` | Fall invitational qualifier (+5) | 15/600 | D | 14.5 | 16.2 / 15.7 | 14.5 | src/clubhouse/styles/qualifiers.css:261 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:99 | E |
| `.ch-qf-meta` | Sep 1 – Sep 4, 2026 (+3) | 14/400 | D | 14.5 | 16.2 / 15.7 | 14.5 | src/clubhouse/styles/qualifiers.css:269 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:131 | E |
| `.ch-qf-meta__w` | Finley GC (+1) | 14/400 | D | 14.5 | 16.2 / 15.7 | 14.5 | src/clubhouse/styles/qualifiers.css:286 | src/clubhouse/screens/qualifiers/parts.tsx:116 | E |
| `.ch-qf-head` | Rank players over counted rounds and pick … | 15/400 | P D | 13.0 | 14.7 / 14.6 | 13.0 | src/clubhouse/styles/qualifiers.css:34 | src/clubhouse/screens/qualifiers/QualifierForm.tsx:261 | E |
| `.ch-qf-sec.is-focus` | Active | 20/600 | P D | 8.5 | 9.1 / 8.8 | 9.2 | src/clubhouse/styles/qualifiers.css:136 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:90 | E |
| `.ch-qf-sec` | Also active | 20/600 | P D | 13.0 | 13.0 / 12.9 | 13.4 | src/clubhouse/styles/qualifiers.css:136 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:90 | E |
| `.ch-qf-sec.is-done` | Concluded | 20/600 | P D | 12.9 | 13.0 / 12.9 | 13.1 | src/clubhouse/styles/qualifiers.css:136 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:90 | E |
| `.ch-qf-cta.is-quiet` | View results | 13/500 | D | 10.3 | 15.1 / 14.7 | 10.3 | src/clubhouse/styles/qualifiers.css:297 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:64 | E |
| `.ch-qf-eyebrow__k` | Qualifiers | 13/500 | D dark only | 9.0 |  | 9.0 | src/clubhouse/styles/qualifiers.css:1502 | src/clubhouse/screens/qualifiers/QualifiersList.tsx:90 | E |

### Live now  (`/clubhouse-preview/live`; 6 text runs on phone, 8 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title` | Live | 44/600 | D dark only | 13.1 |  | 13.1 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-lv-group__label` | On the course · 5 (+2) | 13/600 | P D | 7.8 | 8.3 / 8.1 | 10.9 | src/clubhouse/styles/live.css:591 | src/clubhouse/screens/live/live-parts.tsx:31 | E |
| `.ch-lv-empty__title` | No one is on the course right now. | 15/400 | P D | 5.7 | 5.7 / 5.7 | 8.4 | src/clubhouse/styles/live.css:604 | src/clubhouse/screens/live/live-parts.tsx:117 | E |
| `.ch-lv-empty__body` | Rounds show up here as soon as a player st… | 13/400 | P D | 5.7 | 5.7 / 5.7 | 8.4 | src/clubhouse/styles/live.css:610 | src/clubhouse/screens/live/live-parts.tsx:118 | E |
| `.ch-lv-sort` | Sort: To par | 13/500 | P D | 8.3 | 8.4 / 8.3 | 10.7 | src/clubhouse/styles/live.css:538 | src/clubhouse/screens/live/live-parts.tsx:92 | E |
| `.ch-lv-eyebrow` | Today | 13/500 | D dark only | 8.4 |  | 8.4 | src/clubhouse/styles/live.css:522 | src/clubhouse/screens/live/LiveView.tsx:93 | E |

### My qualifiers  (`/clubhouse-preview/my-qualifiers`; 5 text runs on phone, 17 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title` | My qualifiers | 34/600 | P D dark only | 12.5 | 13.0 / 12.9 | 13.2 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-qf-card__h` | Fall invitational qualifier (+3) | 15/600 | D | 14.5 | 16.2 / 15.7 | 14.5 | src/clubhouse/styles/qualifiers.css:261 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:99 | E |
| `.ch-qf-meta` | Sep 1 – Sep 4, 2026 (+2) | 14/400 | D | 14.5 | 16.2 / 15.7 | 14.5 | src/clubhouse/styles/qualifiers.css:269 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:131 | E |
| `.ch-qf-mine` | You made the squad · (+1) | 13/500 | D | 8.8 | 9.1 / 8.8 | 8.8 | src/clubhouse/styles/qualifiers.css:289 | src/clubhouse/screens/qualifiers/QualifiersList.tsx:273 | E |
| `.ch-qf-head` | The qualifiers you’re entered in, and wher… | 15/400 | P D | 12.9 | 14.7 / 14.6 | 12.9 | src/clubhouse/styles/qualifiers.css:34 | src/clubhouse/screens/qualifiers/QualifierForm.tsx:261 | E |
| `.ch-qf-sec.is-focus` | Active | 20/600 | P D | 8.5 | 9.1 / 8.8 | 9.2 | src/clubhouse/styles/qualifiers.css:136 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:90 | E |
| `.ch-qf-sec` | Also active | 20/600 | P D | 13.0 | 13.0 / 12.9 | 13.4 | src/clubhouse/styles/qualifiers.css:136 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:90 | E |
| `.ch-qf-sec.is-done` | Concluded | 20/600 | P D | 12.9 | 13.0 / 12.9 | 13.1 | src/clubhouse/styles/qualifiers.css:136 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:90 | E |
| `.ch-qf-meta__w` | Finley GC | 14/400 | D | 14.5 | 16.2 / 15.7 | 14.5 | src/clubhouse/styles/qualifiers.css:286 | src/clubhouse/screens/qualifiers/parts.tsx:116 | E |
| `.ch-qf-cta.is-quiet` | View results | 13/500 | D | 10.3 | 15.1 / 14.7 | 10.3 | src/clubhouse/styles/qualifiers.css:297 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:64 | E |
| `.ch-qf-eyebrow__k` | My qualifiers | 13/500 | D dark only | 9.0 |  | 9.0 | src/clubhouse/styles/qualifiers.css:1502 | src/clubhouse/screens/qualifiers/QualifiersList.tsx:90 | E |

### Qualifiers list (player)  (`/clubhouse-preview/qualifiers-player`; 5 text runs on phone, 22 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title` | Qualifiers | 34/600 | P D dark only | 12.5 | 13.0 / 12.9 | 13.3 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-qf-card__h` | Fall invitational qualifier (+5) | 15/600 | D | 14.5 | 16.2 / 15.7 | 14.5 | src/clubhouse/styles/qualifiers.css:261 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:99 | E |
| `.ch-qf-meta` | Sep 1 – Sep 4, 2026 (+3) | 14/400 | D | 14.5 | 16.2 / 15.7 | 14.5 | src/clubhouse/styles/qualifiers.css:269 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:131 | E |
| `.ch-qf-meta__w` | Finley GC (+1) | 14/400 | D | 14.5 | 16.2 / 15.7 | 14.5 | src/clubhouse/styles/qualifiers.css:286 | src/clubhouse/screens/qualifiers/parts.tsx:116 | E |
| `.ch-qf-mine` | You made the squad · (+1) | 13/500 | D | 8.8 | 9.1 / 8.8 | 8.8 | src/clubhouse/styles/qualifiers.css:289 | src/clubhouse/screens/qualifiers/QualifiersList.tsx:273 | E |
| `.ch-qf-head` | Your team’s qualifiers, and where you stan… | 15/400 | P D | 12.9 | 14.7 / 14.6 | 12.9 | src/clubhouse/styles/qualifiers.css:34 | src/clubhouse/screens/qualifiers/QualifierForm.tsx:261 | E |
| `.ch-qf-sec.is-focus` | Active | 20/600 | P D | 8.5 | 9.1 / 8.8 | 9.2 | src/clubhouse/styles/qualifiers.css:136 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:90 | E |
| `.ch-qf-sec` | Also active | 20/600 | P D | 13.0 | 13.0 / 12.9 | 13.4 | src/clubhouse/styles/qualifiers.css:136 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:90 | E |
| `.ch-qf-sec.is-done` | Concluded | 20/600 | P D | 12.9 | 13.0 / 12.9 | 13.1 | src/clubhouse/styles/qualifiers.css:136 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:90 | E |
| `.ch-qf-cta.is-quiet` | View results | 13/500 | D | 10.3 | 15.1 / 14.7 | 10.3 | src/clubhouse/styles/qualifiers.css:297 | src/clubhouse/screens/qualifiers/QualifiersSkeleton.tsx:64 | E |
| `.ch-qf-mine.is-out` | You aren’t entered | 13/500 | D | 10.3 | 15.1 / 14.7 | 10.3 | src/clubhouse/styles/qualifiers.css:289 | src/clubhouse/screens/qualifiers/QualifiersList.tsx:273 | E |
| `.ch-qf-eyebrow__k` | Qualifiers | 13/500 | D dark only | 9.0 |  | 9.0 | src/clubhouse/styles/qualifiers.css:1502 | src/clubhouse/screens/qualifiers/QualifiersList.tsx:90 | E |

### Tournament history  (`/clubhouse-preview/tournament-history`; 5 text runs on phone, 60 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-intro__title.ch-large-title` | Tournaments | 34/600 | P | 7.9 | 8.1 / 8.0 | 13.2 | src/clubhouse/styles/ui.css:1031 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-intro__eyebrow` | Varsity · 2026–27 | 13/500 | P | 6.6 | 6.6 / 6.6 | 9.2 | src/clubhouse/styles/ui.css:1016 | src/clubhouse/screens/calendar/CalendarPhone.tsx:116 | A |
| `.ch-sec__title` | Across seasons (+1) | 20/600 | P D | 7.9 | 8.1 / 8.0 | 13.4 | src/clubhouse/styles/home.css:3222 | src/clubhouse/ui/Section.tsx:34 | B |
| `.ch-sec__meta` | Graduated players stay with the events the… | 13/400 | D | 8.7 | 8.7 / 8.5 | 10.9 | src/clubhouse/styles/ui.css:695 | src/clubhouse/ui/Section.tsx:38 | B |
| `.is-r.ch-tour-led__fin` | 858 (+16) | 13/400 | D | 10.3 | 10.3 / 10.1 | 13.1 | src/clubhouse/styles/tournaments.css:265 | src/clubhouse/screens/tournaments/SeasonLedger.tsx:120 | E |
| `.ch-tour-led__t2` | Oakmont CC (+14) | 13/400 | D | 10.0 | 10.3 / 10.1 | 13.1 | src/clubhouse/styles/tournaments.css:260 | src/clubhouse/screens/tournaments/SeasonLedger.tsx:110 | E |
| `.ch-tour-led__open` | Oakmont Fall Classic (+6) | 15/600 | D | 14.9 | 15.1 / 14.8 | 15.2 | src/clubhouse/styles/tournaments.css:238 | src/clubhouse/screens/tournaments/SeasonLedger.tsx:107 | E |
| `.ch-tour-led__row.is-head` | Event (+5) | 13/500 | D | 10.0 | 10.3 / 10.1 | 13.1 | src/clubhouse/styles/tournaments.css:214 | src/clubhouse/screens/tournaments/SeasonLedger.tsx:58 | E |
| `.ch-tour-cov` | 11 of 15 (+4) | 12/400 | D | 10.3 | 10.3 / 10.1 | 13.1 | src/clubhouse/styles/tournaments.css:171 | src/clubhouse/screens/tournaments/parts.tsx:181 | E |
| `.ch-tour-head__t` | What happened at each event, who counted, … (+1) | 16/400 | D | 10.0 | 10.3 / 10.1 | 13.1 | src/clubhouse/styles/tournaments.css:53 | src/clubhouse/screens/tournaments/parts.tsx:81 | E |
| `.ch-tour-led__season` | This season · 2026–27 (+1) | 13/600 | D | 10.1 | 10.3 / 10.1 | 13.1 | src/clubhouse/styles/tournaments.css:226 | src/clubhouse/screens/tournaments/SeasonLedger.tsx:45 | E |
| `.ch-num.ch-tour-under` | −6 (+1) | 15/600 | D | 5.3 | 5.3 / 5.2 | 7.1 | src/clubhouse/styles/tournaments.css:166 | src/clubhouse/screens/tournaments/HoleGrid.tsx:79 | E |
| `.ch-intro__brief` | What happened at each event, who counted, … | 15/400 | P | 9.8 | 10.0 / 9.9 | 13.0 | src/clubhouse/styles/settings.css:817 | src/clubhouse/ui/Ledger.tsx:218 | E |
| `.ch-tour-head__k.ch-num` | Varsity · 2026–27 | 13/500 | D dark only | 9.1 |  | 9.1 | src/clubhouse/styles/tournaments.css:59 | src/clubhouse/screens/tournaments/TourPlaceholder.tsx:67 | E |

### Tournament lineup  (`/clubhouse-preview/tournament-lineup`; 5 text runs on phone, 5 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-empty-page__title` | Lineup isn’t built yet | 22/600 | P D | 8.1 | 8.1 / 8.0 | 13.1 | src/clubhouse/styles/shell.css:598 | src/clubhouse/shell/NotRebuilt.tsx:24 | C |
| `.ch-empty-page__body` | Its data, types and preview states are rea… | 15/400 | P D | 10.0 | 10.0 / 9.9 | 13.0 | src/clubhouse/styles/shell.css:607 | src/clubhouse/shell/NotRebuilt.tsx:25 | C |
| `.ch-tour-head__k` | Pinehurst Intercollegiate | 13/500 | P D dark only | 6.2 | 6.5 / 6.5 | 9.1 | src/clubhouse/styles/tournaments.css:59 | src/clubhouse/screens/tournaments/TourPlaceholder.tsx:67 | E |
| `.ch-tour-ph__detail.ch-num` | 4 of 5 set | 15/400 | P D | 14.7 | 14.7 / 14.6 | 14.9 | src/clubhouse/styles/tournaments.css:352 | src/clubhouse/screens/tournaments/TourPlaceholder.tsx:79 | E |
| `.ch-tour-head` | Lineup | 44/600 | P D dark only | 13.3 | 14.9 / 14.9 | 13.3 | src/clubhouse/styles/tournaments.css:64 | src/clubhouse/screens/tournaments/TourPlaceholder.tsx:56 | E |

### Tournament live  (`/clubhouse-preview/tournament-live`; 5 text runs on phone, 5 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-empty-page__title` | The live round isn’t built yet | 22/600 | P D | 8.0 | 8.1 / 8.0 | 13.2 | src/clubhouse/styles/shell.css:598 | src/clubhouse/shell/NotRebuilt.tsx:24 | C |
| `.ch-empty-page__body` | Its data, types and preview states are rea… | 15/400 | P D | 10.0 | 10.0 / 9.9 | 13.0 | src/clubhouse/styles/shell.css:607 | src/clubhouse/shell/NotRebuilt.tsx:25 | C |
| `.ch-tour-head__k` | Pinehurst Intercollegiate | 13/500 | P D dark only | 6.2 | 6.5 / 6.5 | 9.1 | src/clubhouse/styles/tournaments.css:59 | src/clubhouse/screens/tournaments/TourPlaceholder.tsx:67 | E |
| `.ch-tour-ph__detail.ch-num` | Team −1 · 6 on the course | 15/400 | P D | 14.7 | 14.7 / 14.6 | 14.9 | src/clubhouse/styles/tournaments.css:352 | src/clubhouse/screens/tournaments/TourPlaceholder.tsx:79 | E |
| `.ch-tour-head` | Round 1 | 44/600 | P D dark only | 13.3 | 14.9 / 14.9 | 13.3 | src/clubhouse/styles/tournaments.css:64 | src/clubhouse/screens/tournaments/TourPlaceholder.tsx:56 | E |

### Tournament (player)  (`/clubhouse-preview/tournament-player`; 5 text runs on phone, 5 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-empty-page__title` | The player’s Tournaments isn’t built yet | 22/600 | P D | 8.0 | 8.1 / 8.0 | 13.2 | src/clubhouse/styles/shell.css:598 | src/clubhouse/shell/NotRebuilt.tsx:24 | C |
| `.ch-empty-page__body` | Its data, types and preview states are rea… | 15/400 | P D | 9.9 | 10.0 / 9.9 | 13.1 | src/clubhouse/styles/shell.css:607 | src/clubhouse/shell/NotRebuilt.tsx:25 | C |
| `.ch-tour-ph__detail.ch-num` | Jonah Okafor · 5 events | 15/400 | P D | 14.6 | 14.7 / 14.6 | 15.1 | src/clubhouse/styles/tournaments.css:352 | src/clubhouse/screens/tournaments/TourPlaceholder.tsx:79 | E |
| `.ch-tour-head__k` | Varsity · Fall 2026 | 13/500 | P D dark only | 6.6 | 6.6 / 6.6 | 9.1 | src/clubhouse/styles/tournaments.css:59 | src/clubhouse/screens/tournaments/TourPlaceholder.tsx:67 | E |
| `.ch-tour-head` | Tournaments | 44/600 | P D dark only | 13.3 | 14.9 / 14.9 | 13.3 | src/clubhouse/styles/tournaments.css:64 | src/clubhouse/screens/tournaments/TourPlaceholder.tsx:56 | E |

### CoachHelm Track record  (`/clubhouse-preview/coachhelm-track`; 3 text runs on phone, 4 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title.ch-hl-h__t` | Track record | 34/600 | P | 12.5 | 13.0 / 12.9 | 13.2 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-backlink` | CoachHelm | 13/500 | D dark only | 9.2 |  | 9.2 | src/clubhouse/styles/ui.css:708 | src/clubhouse/ui/Section.tsx:51 | D |
| `.ch-hl-h.ch-htr-h` | How often the reads CoachHelm showed your … | 15/400 | P D dark only | 13.0 | 14.7 / 14.6 | 13.0 | src/clubhouse/styles/coachhelm.css:59 | src/clubhouse/screens/coachhelm/CoachHelmSkeleton.tsx:158 | E |
| `.ch-hl-role` | Coach | 13/500 | P D dark only | 9.0 | 14.9 / 14.9 | 9.0 | src/clubhouse/styles/shell.css:2185 | src/clubhouse/screens/coachhelm/parts.tsx:269 | E |
| `.ch-hl-h__t` | Track record | 44/600 | D dark only | 13.3 |  | 13.3 | src/clubhouse/styles/coachhelm.css:55 | src/clubhouse/screens/coachhelm/parts.tsx:272 | E |

### CoachHelm Brief  (`/clubhouse-preview/coachhelm-coach-brief`; 3 text runs on phone, 4 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title.ch-hl-h__t` | Brief | 34/600 | P | 12.5 | 13.0 / 13.0 | 13.4 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-backlink` | CoachHelm | 13/500 | D dark only | 9.2 |  | 9.2 | src/clubhouse/styles/ui.css:708 | src/clubhouse/ui/Section.tsx:51 | D |
| `.ch-hl-h.ch-hmb-h` | Who to talk to this week, what the team is… | 15/400 | P D dark only | 12.9 | 14.7 / 14.7 | 12.9 | src/clubhouse/styles/coachhelm.css:59 | src/clubhouse/screens/coachhelm/CoachHelmSkeleton.tsx:158 | E |
| `.ch-hl-role` | Coach | 13/500 | P D dark only | 9.0 | 15.0 / 15.0 | 9.0 | src/clubhouse/styles/shell.css:2185 | src/clubhouse/screens/coachhelm/parts.tsx:269 | E |
| `.ch-hl-h__t` | Brief | 44/600 | D dark only | 13.2 |  | 13.2 | src/clubhouse/styles/coachhelm.css:55 | src/clubhouse/screens/coachhelm/parts.tsx:272 | E |

### CoachHelm Monday brief  (`/clubhouse-preview/coachhelm-brief`; 3 text runs on phone, 4 on desktop)

| Spot | Sample text | Size | P/D | Ratio | Gradient ends | Dark | CSS | Component | Fix |
|---|---|---|---|---|---|---|---|---|---|
| `.ch-large-title.ch-hl-h__t` | Monday brief | 34/600 | P | 12.6 | 13.0 / 12.9 | 13.2 | src/clubhouse/styles/shell.css:3074 | src/clubhouse/ui/Ledger.tsx:213 | A |
| `.ch-backlink` | CoachHelm | 13/500 | D dark only | 9.2 |  | 9.2 | src/clubhouse/styles/ui.css:708 | src/clubhouse/ui/Section.tsx:51 | D |
| `.ch-hl-h.ch-hmb-h` | Who needs a conversation before practice, … | 15/400 | P D dark only | 13.0 | 14.7 / 14.6 | 13.0 | src/clubhouse/styles/coachhelm.css:59 | src/clubhouse/screens/coachhelm/CoachHelmSkeleton.tsx:158 | E |
| `.ch-hl-role` | Coach | 13/500 | P D dark only | 9.0 | 15.0 / 14.9 | 9.0 | src/clubhouse/styles/shell.css:2185 | src/clubhouse/screens/coachhelm/parts.tsx:269 | E |
| `.ch-hl-h__t` | Monday brief | 44/600 | D dark only | 13.3 |  | 13.3 | src/clubhouse/styles/coachhelm.css:55 | src/clubhouse/screens/coachhelm/parts.tsx:272 | E |
