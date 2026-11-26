# 05 · Screens: My stats, Team Stats, Home "Your game"

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 60 rows).

Every screen, pushed page, sheet, menu and inline state these three screens can show, with the stable ID that 06, 07, 08 and `capture/capture.mjs` use. The IDs match `redesign-package-src/acceptance/stats.md`. Team Stats is `S-TEAMSTATS` (not `S-TEAM`, which the CoachHelm Team lane uses), Home is `S-HOMEGAME`.

Design page: https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S (open any state by its hash, 04 §1). Local copy: `redesign/stats-and-home-phone.html`, same hashes. App routes are under `/clubhouse-preview/`. "add" means the fixture doesn't exist yet and the PR named in the PR column adds it. Today's components that this redesign leaves alone (StatsFilter, the section switcher menu, the round page, PlayerPeek) are listed so nothing on screen is missing, marked "none (unchanged)".

Hash tokens on the design page go in any order: screen (`stats`, `team`, `home`), theme (`light`, `dark`), data (`full`, `few`, `none`), state (`loading`, `failed`), `long`, window (`last5` … `qualifiers`), Text Size (`small` … `xxl`), `wide` (430), `reduce`, detail key.

Reduce Motion rows: the design page fades over 120ms; the build uses `CH_FADE_MS` from `lib/motion.ts` (180ms today, opacity only), as START_HERE's shared values say. The push moves the page behind by `CH_UNDERLAY_SHIFT` (0.24).

## Inventory

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-STATS` | screen | Section switcher in the bar, "My stats" (player); it is the player's Stats section | [#stats-light-full](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full) · `redesign/stats-and-home-phone.html#stats-light-full` | `player?state=self` | player (own figures only); a coach sees it as S-STATS.coach | 4b |
| `S-STATS.stuck` | inline state | Scroll the summary more than 1pt: the window switch sticks under the lip and its shade fades in | [#stats-light-full](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full) · `redesign/stats-and-home-phone.html#stats-light-full` then `scroll:320` | `player?state=self` | player | 4b |
| `S-STATS.window` | inline state | Tap a window segment (5, 10, 20, Season, Qualifiers): chip slides, figures crossfade | [#stats-light-full](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full) · `redesign/stats-and-home-phone.html#stats-light-full` then `tap:seg-last20` | `player?state=self` | player | 4b |
| `S-STATS.custom` | inline state | Pick a custom range in StatsFilter: a sixth segment "Custom" appends and the switch scrolls sideways | not drawn (today's component; build rule in the matrix) | `player?state=self&range=custom` | player | 4b |
| `S-STATS.scrub` | inline state | Press and drag on the Scoring average chart: rule, ring and that round's score; release restores | [#stats-light-full](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full) · `redesign/stats-and-home-phone.html#stats-light-full` then `scrub:0.6` | `player?state=self` | player | 4c |
| `S-STATS.filter` | sheet (today's, 62%) | Tap the filter button right of the switch | not drawn (today's component; build rule in the matrix) | `player?state=self (tap filter)` | player and coach | none (unchanged) |
| `S-STATS.switcher` | menu (today's) | Tap the section switcher "My stats ⌄" in the bar | not drawn (today's component; build rule in the matrix) | `player?state=self (tap switcher)` | player and coach | none (unchanged) |
| `S-STATS.scoring` | push | Tap the Scoring average card; or glance Birdies or Bogeys | [#stats-light-full-scoring](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-scoring) · `redesign/stats-and-home-phone.html#stats-light-full-scoring` | `player?state=self#gm-scoring` | player | 4b (4c visuals) |
| `S-STATS.sg` | push | Tap the Strokes gained card | [#stats-light-full-sg](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-sg) · `redesign/stats-and-home-phone.html#stats-light-full-sg` | `player?state=self#sd-sg` | player | 4b (4c visuals) |
| `S-STATS.sg-pin` | inline state | On S-STATS.sg, tap a By part row: it pins and shows its likely range; tap again unpins | [#stats-light-full-sg](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-sg) · `redesign/stats-and-home-phone.html#stats-light-full-sg` then `tap:drow-0` | `player?state=self#sd-sg` | player | 4c |
| `S-STATS.how` | inline state | On S-STATS.scoring, .tee, .approach or .putting, tap "How this is measured" under Against the N before: the text opens, chevron turns 90° (Strokes gained and Short game show the text open in a card of its own) | [#stats-light-full-scoring](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-scoring) · `redesign/stats-and-home-phone.html#stats-light-full-scoring` then `tap:how` | `player?state=self#gm-scoring` | player | 4c |
| `S-STATS.tee` | push | Tap the Off the tee card; or glance Fairways; or Open a part on S-STATS.sg | [#stats-light-full-tee](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-tee) · `redesign/stats-and-home-phone.html#stats-light-full-tee` | `player?state=self#gm-tee` | player | 4b (4c visuals) |
| `S-STATS.approach` | push | Tap the Approach card; or glance Greens | [#stats-light-full-approach](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-approach) · `redesign/stats-and-home-phone.html#stats-light-full-approach` | `player?state=self#gm-approach` | player | 4b (4c visuals) |
| `S-STATS.short` | push | Tap the Short game card; or glance Scrambling | [#stats-light-full-short](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-short) · `redesign/stats-and-home-phone.html#stats-light-full-short` | `player?state=self#gm-short` | player | 4b (4c visuals) |
| `S-STATS.putting` | push | Tap the Putting card; or glance Putts | [#stats-light-full-putting](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-putting) · `redesign/stats-and-home-phone.html#stats-light-full-putting` | `player?state=self#gm-putting` | player | 4b (4c visuals) |
| `S-STATS.rounds` | push | Tap the Round by round card | [#stats-light-full-rounds](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-rounds) · `redesign/stats-and-home-phone.html#stats-light-full-rounds` | `player?state=self#sd-rounds` | player | 4b |
| `S-STATS.round` | push (today's round page) | On S-STATS.rounds, tap a row in Every round | not drawn (today's component; build rule in the matrix) | `today's round route` | player | none (unchanged) |
| `S-STATS.goals` | push | Tap the Goals and focus areas card | [#stats-light-full-goals](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-goals) · `redesign/stats-and-home-phone.html#stats-light-full-goals` | `player?state=self#sd-goals` | player | 4b |
| `S-STATS.coach` | screen variant | A coach opens a player from Roster or Team players (`?player=`) | not drawn (today's component; build rule in the matrix) | `player?player=<id>` | coach: today's coach head (identity, handicap, Message), bar "Player stats ⌄", back "‹ Player stats" | 4b |
| `S-TEAMSTATS` | screen | Section switcher in the bar, "Stats" (coach) | [#team-light-full](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full) · `redesign/stats-and-home-phone.html#team-light-full` | `stats` | coach only; a player account never receives it (SHARED-11) | 5 |
| `S-TEAMSTATS.filter` | sheet (today's, 62%) | Tap the filter button | not drawn (today's component; build rule in the matrix) | `stats (tap filter)` | coach | none (unchanged) |
| `S-TEAMSTATS.tscore` | push | Tap the Team scoring average card | [#team-light-full-tscore](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-tscore) · `redesign/stats-and-home-phone.html#team-light-full-tscore` | `stats#sd-team-score` | coach | 5 |
| `S-TEAMSTATS.tgame` | push | Tap the Strokes gained by leg card | [#team-light-full-tgame](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-tgame) · `redesign/stats-and-home-phone.html#team-light-full-tgame` | `stats#sd-team-game` | coach | 5 |
| `S-TEAMSTATS.tplayers` | push | Tap the Who gains and loses card | [#team-light-full-tplayers](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-tplayers) · `redesign/stats-and-home-phone.html#team-light-full-tplayers` | `stats#sd-team-players` | coach | 5 |
| `S-TEAMSTATS.pin` | inline state | On .tgame or .tplayers, tap a row: it pins (whisker); on .tplayers a second tap on the pinned row opens the player | [#team-light-full-tplayers](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-tplayers) · `redesign/stats-and-home-phone.html#team-light-full-tplayers` then `tap:prow-0` | `stats#sd-team-players` | coach | 5 |
| `S-TEAMSTATS.peek` | sheet (today's PlayerPeek) | On .tplayers, the Players list below, tap a row | not drawn (today's component; build rule in the matrix) | `stats#sd-team-players (tap a Players row)` | coach | none (unchanged) |
| `S-TEAMSTATS.player` | push (today's) | Second tap on a pinned row in .tplayers (`teamPlayerHref`) | not drawn (today's component; build rule in the matrix) | `player?player=<id>` | coach | none (lands on S-STATS.coach) |
| `S-HOMEGAME` | card on player Home | Player Home, under the greeting | [#home-light-full](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#home-light-full) · `redesign/stats-and-home-phone.html#home-light-full` | `home-player` | player | 6 |
| `S-HOMEGAME.leg` | link (no slide) | Tap a leg (Off the tee, Approach, Short game, Putting): opens S-STATS.<part> with no slide; one Back reaches the Stats summary | not drawn (today's component; build rule in the matrix) | `player?state=self#gm-tee` | player | 6 |
| `S-ALL.retry` | inline state | Tap Try again on any failed notice: skeleton 900ms, then the page lands with no animation | [#stats-light-full-failed](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-failed) · `redesign/stats-and-home-phone.html#stats-light-full-failed` then `tap:retry` | `player?state=failed` | both | 4b, 5, 6 |

Inline states have no hash of their own: capture opens the parent hash, then runs the step after the arrow (`scroll:320` scrolls the page 320pt, `tap:<hook>` taps the element, `scrub:0.6` presses the chart at 60% of its width and holds). On the design page the steps use the page's own selectors; in the app they use the `data-ch` hooks the PR adds (listed in 08 Part 3 per PR).

## State matrix per ID

Columns: **Drawn** is the design hash for that state (blank = not drawn, and the rule says how to build it). **Capture** is the `--state` id for `capture.mjs`. **App** is the preview route for that state ("add" = the PR adds the fixture). States that can't occur on a pushed page (a detail never opens while its summary is loading or failed) say so.


### `S-STATS`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`stats-light-full`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full) | `default` | `player?state=self` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading | [`stats-light-full-loading`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-loading) | `loading` | `player?state=loading` | Cards held at loaded height; titles show; figures and visuals are bars; window switch inert (Stats); aria-busy. Shimmer 1.9s, off under Reduce Motion. |
| empty | [`stats-light-none`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-none) | `empty` | `add: player?state=empty` | No rounds: one empty card where the data cards were; sections that read no rounds stay. |
| failed | [`stats-light-full-failed`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-failed) | `failed` | `player?state=failed` | Today's code and copy in a card with Try again; anything that doesn't read rounds still renders. |
| few | [`stats-light-few`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-few) | `few` | `player?state=early` | 1 or 2 rounds: few note, figures with no tone, SG waits for round 3, pills hidden. |
| long | [`stats-light-full-long`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-long) | `long` | `add: player?state=long` | Longest real names: one line with ellipsis where 06 says, wraps everywhere else; rows never clip. |
| lots |  | `lots` | `add: player?state=lots` | Not drawn. Rows repeat at the same height (64 round rows, 52 player rows); ticker gap 3 above 12 rounds; no virtual list under 100. |
| one |  | `one` | `add: player?state=one` | Not drawn. One round renders the few rules; one team player renders one row and sign-aware wording. |
| offline |  | `offline` | `player?state=self (capture sets the context offline after load)` | Not drawn. Today's offline banner; cached figures render as loaded; window switch (Stats) works on cached data. |
| xxl | [`stats-light-full-xxl`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-xxl) | `xxl` | `player?state=self (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`stats-dark-full`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-dark-full) | `dark` | `player?state=self (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`stats-light-full-reduce`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-reduce) | `reduce` | `player?state=self (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?state=self (viewport 390)` | Drawn at 393 (the page's phone); 390 is the same layout 3pt narrower: edge 16, cards fill. |
| w430 | [`stats-light-full-wide`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-wide) | `w430` | `player?state=self (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?state=self (viewport 1280)` | Not drawn. Desktop keeps today's layout; `#sd-rounds` maps to the Rounds tab and `#sd-goals` to Development. |

### `S-STATS.stuck`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`stats-light-full`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full) | `default` | `player?state=self` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `player?state=loading` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| empty |  | `empty` | `add: player?state=empty` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| failed |  | `failed` | `player?state=failed` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| few |  | `few` | `player?state=early` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| long |  | `long` | `add: player?state=long` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| lots |  | `lots` | `add: player?state=lots` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| one |  | `one` | `add: player?state=one` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| offline |  | `offline` | `player?state=self (capture sets the context offline after load)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| xxl | [`stats-light-full-xxl`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-xxl) | `xxl` | `player?state=self (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`stats-dark-full`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-dark-full) | `dark` | `player?state=self (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`stats-light-full-reduce`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-reduce) | `reduce` | `player?state=self (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?state=self (viewport 390)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| w430 | [`stats-light-full-wide`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-wide) | `w430` | `player?state=self (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?state=self (viewport 1280)` | same as the parent screen's row for this state; the step is not available while it loads or fails |

### `S-STATS.window`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`stats-light-full`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full) | `default` | `player?state=self` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `player?state=loading` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| empty |  | `empty` | `add: player?state=empty` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| failed |  | `failed` | `player?state=failed` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| few |  | `few` | `player?state=early` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| long |  | `long` | `add: player?state=long` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| lots |  | `lots` | `add: player?state=lots` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| one |  | `one` | `add: player?state=one` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| offline |  | `offline` | `player?state=self (capture sets the context offline after load)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| xxl | [`stats-light-full-xxl`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-xxl) | `xxl` | `player?state=self (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`stats-dark-full`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-dark-full) | `dark` | `player?state=self (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`stats-light-full-reduce`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-reduce) | `reduce` | `player?state=self (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?state=self (viewport 390)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| w430 | [`stats-light-full-wide`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-wide) | `w430` | `player?state=self (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?state=self (viewport 1280)` | same as the parent screen's row for this state; the step is not available while it loads or fails |

### `S-STATS.custom`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default |  | `default` | `player?state=self&range=custom` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `player?state=loading` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| empty |  | `empty` | `add: player?state=empty` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| failed |  | `failed` | `player?state=failed` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| few |  | `few` | `player?state=early` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| long |  | `long` | `add: player?state=long` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| lots |  | `lots` | `add: player?state=lots` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| one |  | `one` | `add: player?state=one` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| offline |  | `offline` | `player?state=self&range=custom (capture sets the context offline after load)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| xxl |  | `xxl` | `player?state=self&range=custom (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark |  | `dark` | `player?state=self&range=custom (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce |  | `reduce` | `player?state=self&range=custom (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?state=self&range=custom (viewport 390)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| w430 |  | `w430` | `player?state=self&range=custom (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?state=self&range=custom (viewport 1280)` | same as the parent screen's row for this state; the step is not available while it loads or fails |

### `S-STATS.scrub`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`stats-light-full`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full) | `default` | `player?state=self` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `player?state=loading` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| empty |  | `empty` | `add: player?state=empty` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| failed |  | `failed` | `player?state=failed` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| few |  | `few` | `player?state=early` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| long |  | `long` | `add: player?state=long` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| lots |  | `lots` | `add: player?state=lots` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| one |  | `one` | `add: player?state=one` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| offline |  | `offline` | `player?state=self (capture sets the context offline after load)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| xxl | [`stats-light-full-xxl`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-xxl) | `xxl` | `player?state=self (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`stats-dark-full`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-dark-full) | `dark` | `player?state=self (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`stats-light-full-reduce`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-reduce) | `reduce` | `player?state=self (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?state=self (viewport 390)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| w430 | [`stats-light-full-wide`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-wide) | `w430` | `player?state=self (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?state=self (viewport 1280)` | same as the parent screen's row for this state; the step is not available while it loads or fails |

### `S-STATS.filter`

Today's component, unchanged by this redesign. Every state is today's: capture it with `--id S-STATS.filter --state default` on the app side only to prove it still opens from the new screens. Dark, XXL, Reduce Motion and 430 follow today's tests.


### `S-STATS.switcher`

Today's component, unchanged by this redesign. Every state is today's: capture it with `--id S-STATS.switcher --state default` on the app side only to prove it still opens from the new screens. Dark, XXL, Reduce Motion and 430 follow today's tests.


### `S-STATS.scoring`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`stats-light-full-scoring`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-scoring) | `default` | `player?state=self#gm-scoring` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `player?state=loading#gm-scoring` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a tap can't open it, but a deep link can arrive while loading: the detail's pushed bar shows at once over a detail skeleton, then the detail lands in place with no slide; state `detail-loading` in the Completeness pass) |
| empty |  | `empty` | `add: player?state=empty#gm-scoring` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: with no rounds a deep link replaces the hash and lands on the summary's empty card; Goals is the one detail that still opens; Completeness pass `deeplink-empty`) |
| failed |  | `failed` | `player?state=failed#gm-scoring` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a deep link that arrives on a failed load shows the summary's failed card, keeps the hash, and opens the detail in place when Try again succeeds; Completeness pass `deeplink-failed`) |
| few | [`stats-light-few-scoring`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-few-scoring) | `few` | `player?state=early#gm-scoring` | 1 or 2 rounds: few note, figures with no tone, SG waits for round 3, pills hidden. |
| long |  | `long` | `add: player?state=long#gm-scoring` | Longest real names: one line with ellipsis where 06 says, wraps everywhere else; rows never clip. |
| lots |  | `lots` | `add: player?state=lots#gm-scoring` | Not drawn. Rows repeat at the same height (64 round rows, 52 player rows); ticker gap 3 above 12 rounds; no virtual list under 100. |
| one |  | `one` | `add: player?state=one#gm-scoring` | Not drawn. One round renders the few rules; one team player renders one row and sign-aware wording. |
| offline |  | `offline` | `player?state=self#gm-scoring (capture sets the context offline after load)` | Not drawn. Today's offline banner; cached figures render as loaded; window switch (Stats) works on cached data. |
| xxl | [`stats-light-full-xxl-scoring`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-xxl-scoring) | `xxl` | `player?state=self#gm-scoring (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`stats-dark-full-scoring`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-dark-full-scoring) | `dark` | `player?state=self#gm-scoring (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`stats-light-full-reduce-scoring`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-reduce-scoring) | `reduce` | `player?state=self#gm-scoring (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?state=self#gm-scoring (viewport 390)` | Drawn at 393 (the page's phone); 390 is the same layout 3pt narrower: edge 16, cards fill. |
| w430 | [`stats-light-full-wide-scoring`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-wide-scoring) | `w430` | `player?state=self#gm-scoring (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?state=self#gm-scoring (viewport 1280)` | Not drawn. Desktop keeps today's layout; `#sd-rounds` maps to the Rounds tab and `#sd-goals` to Development. |

### `S-STATS.sg`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`stats-light-full-sg`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-sg) | `default` | `player?state=self#sd-sg` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `player?state=loading#sd-sg` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a tap can't open it, but a deep link can arrive while loading: the detail's pushed bar shows at once over a detail skeleton, then the detail lands in place with no slide; state `detail-loading` in the Completeness pass) |
| empty |  | `empty` | `add: player?state=empty#sd-sg` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: with no rounds a deep link replaces the hash and lands on the summary's empty card; Goals is the one detail that still opens; Completeness pass `deeplink-empty`) |
| failed |  | `failed` | `player?state=failed#sd-sg` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a deep link that arrives on a failed load shows the summary's failed card, keeps the hash, and opens the detail in place when Try again succeeds; Completeness pass `deeplink-failed`) |
| few | [`stats-light-few-sg`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-few-sg) | `few` | `player?state=early#sd-sg` | 1 or 2 rounds: few note, figures with no tone, SG waits for round 3, pills hidden. |
| long | [`stats-light-full-long-sg`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-long-sg) | `long` | `add: player?state=long#sd-sg` | Longest real names: one line with ellipsis where 06 says, wraps everywhere else; rows never clip. |
| lots |  | `lots` | `add: player?state=lots#sd-sg` | Not drawn. Rows repeat at the same height (64 round rows, 52 player rows); ticker gap 3 above 12 rounds; no virtual list under 100. |
| one |  | `one` | `add: player?state=one#sd-sg` | Not drawn. One round renders the few rules; one team player renders one row and sign-aware wording. |
| offline |  | `offline` | `player?state=self#sd-sg (capture sets the context offline after load)` | Not drawn. Today's offline banner; cached figures render as loaded; window switch (Stats) works on cached data. |
| xxl | [`stats-light-full-xxl-sg`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-xxl-sg) | `xxl` | `player?state=self#sd-sg (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`stats-dark-full-sg`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-dark-full-sg) | `dark` | `player?state=self#sd-sg (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`stats-light-full-reduce-sg`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-reduce-sg) | `reduce` | `player?state=self#sd-sg (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?state=self#sd-sg (viewport 390)` | Drawn at 393 (the page's phone); 390 is the same layout 3pt narrower: edge 16, cards fill. |
| w430 | [`stats-light-full-wide-sg`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-wide-sg) | `w430` | `player?state=self#sd-sg (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?state=self#sd-sg (viewport 1280)` | Not drawn. Desktop keeps today's layout; `#sd-rounds` maps to the Rounds tab and `#sd-goals` to Development. |

### `S-STATS.sg-pin`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`stats-light-full-sg`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-sg) | `default` | `player?state=self#sd-sg` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `player?state=loading#sd-sg` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| empty |  | `empty` | `add: player?state=empty#sd-sg` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| failed |  | `failed` | `player?state=failed#sd-sg` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| few |  | `few` | `player?state=early#sd-sg` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| long |  | `long` | `add: player?state=long#sd-sg` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| lots |  | `lots` | `add: player?state=lots#sd-sg` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| one |  | `one` | `add: player?state=one#sd-sg` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| offline |  | `offline` | `player?state=self#sd-sg (capture sets the context offline after load)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| xxl | [`stats-light-full-xxl-sg`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-xxl-sg) | `xxl` | `player?state=self#sd-sg (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`stats-dark-full-sg`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-dark-full-sg) | `dark` | `player?state=self#sd-sg (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`stats-light-full-reduce-sg`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-reduce-sg) | `reduce` | `player?state=self#sd-sg (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?state=self#sd-sg (viewport 390)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| w430 | [`stats-light-full-wide-sg`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-wide-sg) | `w430` | `player?state=self#sd-sg (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?state=self#sd-sg (viewport 1280)` | same as the parent screen's row for this state; the step is not available while it loads or fails |

### `S-STATS.how`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`stats-light-full-scoring`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-scoring) | `default` | `player?state=self#gm-scoring` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `player?state=loading#gm-scoring` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| empty |  | `empty` | `add: player?state=empty#gm-scoring` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| failed |  | `failed` | `player?state=failed#gm-scoring` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| few |  | `few` | `player?state=early#gm-scoring` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| long |  | `long` | `add: player?state=long#gm-scoring` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| lots |  | `lots` | `add: player?state=lots#gm-scoring` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| one |  | `one` | `add: player?state=one#gm-scoring` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| offline |  | `offline` | `player?state=self#gm-scoring (capture sets the context offline after load)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| xxl | [`stats-light-full-xxl-scoring`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-xxl-scoring) | `xxl` | `player?state=self#gm-scoring (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`stats-dark-full-scoring`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-dark-full-scoring) | `dark` | `player?state=self#gm-scoring (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`stats-light-full-reduce-scoring`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-reduce-scoring) | `reduce` | `player?state=self#gm-scoring (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?state=self#gm-scoring (viewport 390)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| w430 | [`stats-light-full-wide-scoring`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-wide-scoring) | `w430` | `player?state=self#gm-scoring (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?state=self#gm-scoring (viewport 1280)` | same as the parent screen's row for this state; the step is not available while it loads or fails |

### `S-STATS.tee`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`stats-light-full-tee`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-tee) | `default` | `player?state=self#gm-tee` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `player?state=loading#gm-tee` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a tap can't open it, but a deep link can arrive while loading: the detail's pushed bar shows at once over a detail skeleton, then the detail lands in place with no slide; state `detail-loading` in the Completeness pass) |
| empty |  | `empty` | `add: player?state=empty#gm-tee` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: with no rounds a deep link replaces the hash and lands on the summary's empty card; Goals is the one detail that still opens; Completeness pass `deeplink-empty`) |
| failed |  | `failed` | `player?state=failed#gm-tee` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a deep link that arrives on a failed load shows the summary's failed card, keeps the hash, and opens the detail in place when Try again succeeds; Completeness pass `deeplink-failed`) |
| few | [`stats-light-few-tee`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-few-tee) | `few` | `player?state=early#gm-tee` | 1 or 2 rounds: few note, figures with no tone, SG waits for round 3, pills hidden. |
| long | [`stats-light-full-long-tee`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-long-tee) | `long` | `add: player?state=long#gm-tee` | Longest real names: one line with ellipsis where 06 says, wraps everywhere else; rows never clip. |
| lots |  | `lots` | `add: player?state=lots#gm-tee` | Not drawn. Rows repeat at the same height (64 round rows, 52 player rows); ticker gap 3 above 12 rounds; no virtual list under 100. |
| one |  | `one` | `add: player?state=one#gm-tee` | Not drawn. One round renders the few rules; one team player renders one row and sign-aware wording. |
| offline |  | `offline` | `player?state=self#gm-tee (capture sets the context offline after load)` | Not drawn. Today's offline banner; cached figures render as loaded; window switch (Stats) works on cached data. |
| xxl | [`stats-light-full-xxl-tee`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-xxl-tee) | `xxl` | `player?state=self#gm-tee (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`stats-dark-full-tee`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-dark-full-tee) | `dark` | `player?state=self#gm-tee (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`stats-light-full-reduce-tee`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-reduce-tee) | `reduce` | `player?state=self#gm-tee (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?state=self#gm-tee (viewport 390)` | Drawn at 393 (the page's phone); 390 is the same layout 3pt narrower: edge 16, cards fill. |
| w430 | [`stats-light-full-wide-tee`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-wide-tee) | `w430` | `player?state=self#gm-tee (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?state=self#gm-tee (viewport 1280)` | Not drawn. Desktop keeps today's layout; `#sd-rounds` maps to the Rounds tab and `#sd-goals` to Development. |

### `S-STATS.approach`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`stats-light-full-approach`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-approach) | `default` | `player?state=self#gm-approach` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `player?state=loading#gm-approach` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a tap can't open it, but a deep link can arrive while loading: the detail's pushed bar shows at once over a detail skeleton, then the detail lands in place with no slide; state `detail-loading` in the Completeness pass) |
| empty |  | `empty` | `add: player?state=empty#gm-approach` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: with no rounds a deep link replaces the hash and lands on the summary's empty card; Goals is the one detail that still opens; Completeness pass `deeplink-empty`) |
| failed |  | `failed` | `player?state=failed#gm-approach` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a deep link that arrives on a failed load shows the summary's failed card, keeps the hash, and opens the detail in place when Try again succeeds; Completeness pass `deeplink-failed`) |
| few | [`stats-light-few-approach`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-few-approach) | `few` | `player?state=early#gm-approach` | 1 or 2 rounds: few note, figures with no tone, SG waits for round 3, pills hidden. |
| long |  | `long` | `add: player?state=long#gm-approach` | Longest real names: one line with ellipsis where 06 says, wraps everywhere else; rows never clip. |
| lots |  | `lots` | `add: player?state=lots#gm-approach` | Not drawn. Rows repeat at the same height (64 round rows, 52 player rows); ticker gap 3 above 12 rounds; no virtual list under 100. |
| one |  | `one` | `add: player?state=one#gm-approach` | Not drawn. One round renders the few rules; one team player renders one row and sign-aware wording. |
| offline |  | `offline` | `player?state=self#gm-approach (capture sets the context offline after load)` | Not drawn. Today's offline banner; cached figures render as loaded; window switch (Stats) works on cached data. |
| xxl | [`stats-light-full-xxl-approach`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-xxl-approach) | `xxl` | `player?state=self#gm-approach (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`stats-dark-full-approach`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-dark-full-approach) | `dark` | `player?state=self#gm-approach (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`stats-light-full-reduce-approach`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-reduce-approach) | `reduce` | `player?state=self#gm-approach (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?state=self#gm-approach (viewport 390)` | Drawn at 393 (the page's phone); 390 is the same layout 3pt narrower: edge 16, cards fill. |
| w430 | [`stats-light-full-wide-approach`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-wide-approach) | `w430` | `player?state=self#gm-approach (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?state=self#gm-approach (viewport 1280)` | Not drawn. Desktop keeps today's layout; `#sd-rounds` maps to the Rounds tab and `#sd-goals` to Development. |

### `S-STATS.short`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`stats-light-full-short`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-short) | `default` | `player?state=self#gm-short` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `player?state=loading#gm-short` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a tap can't open it, but a deep link can arrive while loading: the detail's pushed bar shows at once over a detail skeleton, then the detail lands in place with no slide; state `detail-loading` in the Completeness pass) |
| empty |  | `empty` | `add: player?state=empty#gm-short` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: with no rounds a deep link replaces the hash and lands on the summary's empty card; Goals is the one detail that still opens; Completeness pass `deeplink-empty`) |
| failed |  | `failed` | `player?state=failed#gm-short` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a deep link that arrives on a failed load shows the summary's failed card, keeps the hash, and opens the detail in place when Try again succeeds; Completeness pass `deeplink-failed`) |
| few | [`stats-light-few-short`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-few-short) | `few` | `player?state=early#gm-short` | 1 or 2 rounds: few note, figures with no tone, SG waits for round 3, pills hidden. |
| long |  | `long` | `add: player?state=long#gm-short` | Longest real names: one line with ellipsis where 06 says, wraps everywhere else; rows never clip. |
| lots |  | `lots` | `add: player?state=lots#gm-short` | Not drawn. Rows repeat at the same height (64 round rows, 52 player rows); ticker gap 3 above 12 rounds; no virtual list under 100. |
| one |  | `one` | `add: player?state=one#gm-short` | Not drawn. One round renders the few rules; one team player renders one row and sign-aware wording. |
| offline |  | `offline` | `player?state=self#gm-short (capture sets the context offline after load)` | Not drawn. Today's offline banner; cached figures render as loaded; window switch (Stats) works on cached data. |
| xxl | [`stats-light-full-xxl-short`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-xxl-short) | `xxl` | `player?state=self#gm-short (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`stats-dark-full-short`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-dark-full-short) | `dark` | `player?state=self#gm-short (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`stats-light-full-reduce-short`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-reduce-short) | `reduce` | `player?state=self#gm-short (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?state=self#gm-short (viewport 390)` | Drawn at 393 (the page's phone); 390 is the same layout 3pt narrower: edge 16, cards fill. |
| w430 | [`stats-light-full-wide-short`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-wide-short) | `w430` | `player?state=self#gm-short (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?state=self#gm-short (viewport 1280)` | Not drawn. Desktop keeps today's layout; `#sd-rounds` maps to the Rounds tab and `#sd-goals` to Development. |

### `S-STATS.putting`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`stats-light-full-putting`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-putting) | `default` | `player?state=self#gm-putting` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `player?state=loading#gm-putting` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a tap can't open it, but a deep link can arrive while loading: the detail's pushed bar shows at once over a detail skeleton, then the detail lands in place with no slide; state `detail-loading` in the Completeness pass) |
| empty |  | `empty` | `add: player?state=empty#gm-putting` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: with no rounds a deep link replaces the hash and lands on the summary's empty card; Goals is the one detail that still opens; Completeness pass `deeplink-empty`) |
| failed |  | `failed` | `player?state=failed#gm-putting` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a deep link that arrives on a failed load shows the summary's failed card, keeps the hash, and opens the detail in place when Try again succeeds; Completeness pass `deeplink-failed`) |
| few | [`stats-light-few-putting`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-few-putting) | `few` | `player?state=early#gm-putting` | 1 or 2 rounds: few note, figures with no tone, SG waits for round 3, pills hidden. |
| long |  | `long` | `add: player?state=long#gm-putting` | Longest real names: one line with ellipsis where 06 says, wraps everywhere else; rows never clip. |
| lots |  | `lots` | `add: player?state=lots#gm-putting` | Not drawn. Rows repeat at the same height (64 round rows, 52 player rows); ticker gap 3 above 12 rounds; no virtual list under 100. |
| one |  | `one` | `add: player?state=one#gm-putting` | Not drawn. One round renders the few rules; one team player renders one row and sign-aware wording. |
| offline |  | `offline` | `player?state=self#gm-putting (capture sets the context offline after load)` | Not drawn. Today's offline banner; cached figures render as loaded; window switch (Stats) works on cached data. |
| xxl | [`stats-light-full-xxl-putting`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-xxl-putting) | `xxl` | `player?state=self#gm-putting (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`stats-dark-full-putting`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-dark-full-putting) | `dark` | `player?state=self#gm-putting (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`stats-light-full-reduce-putting`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-reduce-putting) | `reduce` | `player?state=self#gm-putting (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?state=self#gm-putting (viewport 390)` | Drawn at 393 (the page's phone); 390 is the same layout 3pt narrower: edge 16, cards fill. |
| w430 | [`stats-light-full-wide-putting`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-wide-putting) | `w430` | `player?state=self#gm-putting (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?state=self#gm-putting (viewport 1280)` | Not drawn. Desktop keeps today's layout; `#sd-rounds` maps to the Rounds tab and `#sd-goals` to Development. |

### `S-STATS.rounds`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`stats-light-full-rounds`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-rounds) | `default` | `player?state=self#sd-rounds` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `player?state=loading#sd-rounds` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a tap can't open it, but a deep link can arrive while loading: the detail's pushed bar shows at once over a detail skeleton, then the detail lands in place with no slide; state `detail-loading` in the Completeness pass) |
| empty |  | `empty` | `add: player?state=empty#sd-rounds` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: with no rounds a deep link replaces the hash and lands on the summary's empty card; Goals is the one detail that still opens; Completeness pass `deeplink-empty`) |
| failed |  | `failed` | `player?state=failed#sd-rounds` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a deep link that arrives on a failed load shows the summary's failed card, keeps the hash, and opens the detail in place when Try again succeeds; Completeness pass `deeplink-failed`) |
| few | [`stats-light-few-rounds`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-few-rounds) | `few` | `player?state=early#sd-rounds` | 1 or 2 rounds: few note, figures with no tone, SG waits for round 3, pills hidden. |
| long | [`stats-light-full-long-rounds`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-long-rounds) | `long` | `add: player?state=long#sd-rounds` | Longest real names: one line with ellipsis where 06 says, wraps everywhere else; rows never clip. |
| lots |  | `lots` | `add: player?state=lots#sd-rounds` | Not drawn. Rows repeat at the same height (64 round rows, 52 player rows); ticker gap 3 above 12 rounds; no virtual list under 100. |
| one |  | `one` | `add: player?state=one#sd-rounds` | Not drawn. One round renders the few rules; one team player renders one row and sign-aware wording. |
| offline |  | `offline` | `player?state=self#sd-rounds (capture sets the context offline after load)` | Not drawn. Today's offline banner; cached figures render as loaded; window switch (Stats) works on cached data. |
| xxl | [`stats-light-full-xxl-rounds`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-xxl-rounds) | `xxl` | `player?state=self#sd-rounds (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`stats-dark-full-rounds`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-dark-full-rounds) | `dark` | `player?state=self#sd-rounds (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`stats-light-full-reduce-rounds`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-reduce-rounds) | `reduce` | `player?state=self#sd-rounds (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?state=self#sd-rounds (viewport 390)` | Drawn at 393 (the page's phone); 390 is the same layout 3pt narrower: edge 16, cards fill. |
| w430 | [`stats-light-full-wide-rounds`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-wide-rounds) | `w430` | `player?state=self#sd-rounds (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?state=self#sd-rounds (viewport 1280)` | Not drawn. Desktop keeps today's layout; `#sd-rounds` maps to the Rounds tab and `#sd-goals` to Development. |

### `S-STATS.round`

Today's component, unchanged by this redesign. Every state is today's: capture it with `--id S-STATS.round --state default` on the app side only to prove it still opens from the new screens. Dark, XXL, Reduce Motion and 430 follow today's tests.


### `S-STATS.goals`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`stats-light-full-goals`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-goals) | `default` | `player?state=self#sd-goals` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `player?state=loading#sd-goals` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a tap can't open it, but a deep link can arrive while loading: the detail's pushed bar shows at once over a detail skeleton, then the detail lands in place with no slide; state `detail-loading` in the Completeness pass) |
| empty |  | `empty` | `add: player?state=empty#sd-goals` | goals read no rounds: same as default |
| failed |  | `failed` | `player?state=failed#sd-goals` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a deep link that arrives on a failed load shows the summary's failed card, keeps the hash, and opens the detail in place when Try again succeeds; Completeness pass `deeplink-failed`) |
| few |  | `few` | `player?state=early#sd-goals` | goals read no rounds: same as default |
| long |  | `long` | `add: player?state=long#sd-goals` | goal titles from the coach: wrap to 2 lines, then ellipsis |
| lots |  | `lots` | `add: player?state=lots#sd-goals` | Not drawn. Rows repeat at the same height (64 round rows, 52 player rows); ticker gap 3 above 12 rounds; no virtual list under 100. |
| one |  | `one` | `add: player?state=one#sd-goals` | Not drawn. One round renders the few rules; one team player renders one row and sign-aware wording. |
| offline |  | `offline` | `player?state=self#sd-goals (capture sets the context offline after load)` | Not drawn. Today's offline banner; cached figures render as loaded; window switch (Stats) works on cached data. |
| xxl | [`stats-light-full-xxl-goals`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-xxl-goals) | `xxl` | `player?state=self#sd-goals (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`stats-dark-full-goals`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-dark-full-goals) | `dark` | `player?state=self#sd-goals (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`stats-light-full-reduce-goals`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-reduce-goals) | `reduce` | `player?state=self#sd-goals (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?state=self#sd-goals (viewport 390)` | Drawn at 393 (the page's phone); 390 is the same layout 3pt narrower: edge 16, cards fill. |
| w430 | [`stats-light-full-wide-goals`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-wide-goals) | `w430` | `player?state=self#sd-goals (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?state=self#sd-goals (viewport 1280)` | Not drawn. Desktop keeps today's layout; `#sd-rounds` maps to the Rounds tab and `#sd-goals` to Development. |

### `S-STATS.coach`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default |  | `default` | `player?player=<id>` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `player?state=loading` | Cards held at loaded height; titles show; figures and visuals are bars; window switch inert (Stats); aria-busy. Shimmer 1.9s, off under Reduce Motion. |
| empty |  | `empty` | `add: player?state=empty` | No rounds: one empty card where the data cards were; sections that read no rounds stay. |
| failed |  | `failed` | `player?state=failed` | Today's code and copy in a card with Try again; anything that doesn't read rounds still renders. |
| few |  | `few` | `player?state=early` | 1 or 2 rounds: few note, figures with no tone, SG waits for round 3, pills hidden. |
| long |  | `long` | `add: player?state=long` | Longest real names: one line with ellipsis where 06 says, wraps everywhere else; rows never clip. |
| lots |  | `lots` | `add: player?state=lots` | Not drawn. Rows repeat at the same height (64 round rows, 52 player rows); ticker gap 3 above 12 rounds; no virtual list under 100. |
| one |  | `one` | `add: player?state=one` | Not drawn. One round renders the few rules; one team player renders one row and sign-aware wording. |
| offline |  | `offline` | `player?player=<id> (capture sets the context offline after load)` | Not drawn. Today's offline banner; cached figures render as loaded; window switch (Stats) works on cached data. |
| xxl |  | `xxl` | `player?player=<id> (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark |  | `dark` | `player?player=<id> (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce |  | `reduce` | `player?player=<id> (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?player=<id> (viewport 390)` | Drawn at 393 (the page's phone); 390 is the same layout 3pt narrower: edge 16, cards fill. |
| w430 |  | `w430` | `player?player=<id> (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?player=<id> (viewport 1280)` | Not drawn. Desktop keeps today's layout; `#sd-rounds` maps to the Rounds tab and `#sd-goals` to Development. |

### `S-TEAMSTATS`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`team-light-full`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full) | `default` | `stats` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading | [`team-light-full-loading`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-loading) | `loading` | `stats?state=loading` | Cards held at loaded height; titles show; figures and visuals are bars; window switch inert (Stats); aria-busy. Shimmer 1.9s, off under Reduce Motion. |
| empty | [`team-light-none`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-none) | `empty` | `stats?state=empty` | No rounds: one empty card where the data cards were; sections that read no rounds stay. |
| failed | [`team-light-full-failed`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-failed) | `failed` | `stats?state=failed` | Today's code and copy in a card with Try again; anything that doesn't read rounds still renders. |
| few | [`team-light-few`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-few) | `few` | `stats?state=partial` | 1 or 2 rounds: few note, figures with no tone, SG waits for round 3, pills hidden. (fixed 4 Nov: for the team this is 1 or 2 round days, as drawn at `team-light-few`.) |
| long | [`team-light-full-long`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-long) | `long` | `add: stats?state=long` | Longest real names: one line with ellipsis where 06 says, wraps everywhere else; rows never clip. |
| lots |  | `lots` | `add: stats?state=lots` | Not drawn. Rows repeat at the same height (64 round rows, 52 player rows); ticker gap 3 above 12 rounds; no virtual list under 100. |
| one |  | `one` | `add: stats?state=one` | Not drawn. One round renders the few rules; one team player renders one row and sign-aware wording. |
| offline |  | `offline` | `stats (capture sets the context offline after load)` | Not drawn. Today's offline banner; cached figures render as loaded; window switch (Stats) works on cached data. |
| xxl | [`team-light-full-xxl`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-xxl) | `xxl` | `stats (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`team-dark-full`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-dark-full) | `dark` | `stats (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`team-light-full-reduce`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-reduce) | `reduce` | `stats (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `stats (viewport 390)` | Drawn at 393 (the page's phone); 390 is the same layout 3pt narrower: edge 16, cards fill. |
| w430 | [`team-light-full-wide`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-wide) | `w430` | `stats (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `stats (viewport 1280)` | Not drawn. Desktop keeps today's layout; `#sd-rounds` maps to the Rounds tab and `#sd-goals` to Development. |

### `S-TEAMSTATS.filter`

Today's component, unchanged by this redesign. Every state is today's: capture it with `--id S-TEAMSTATS.filter --state default` on the app side only to prove it still opens from the new screens. Dark, XXL, Reduce Motion and 430 follow today's tests.


### `S-TEAMSTATS.tscore`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`team-light-full-tscore`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-tscore) | `default` | `stats#sd-team-score` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `stats?state=loading#sd-team-score` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a tap can't open it, but a deep link can arrive while loading: the detail's pushed bar shows at once over a detail skeleton, then the detail lands in place with no slide; state `detail-loading` in the Completeness pass) |
| empty |  | `empty` | `stats?state=empty#sd-team-score` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: with no rounds a deep link replaces the hash and lands on the summary's empty card; Goals is the one detail that still opens; Completeness pass `deeplink-empty`) |
| failed |  | `failed` | `stats?state=failed#sd-team-score` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a deep link that arrives on a failed load shows the summary's failed card, keeps the hash, and opens the detail in place when Try again succeeds; Completeness pass `deeplink-failed`) |
| few | [`team-light-few-tscore`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-few-tscore) | `few` | `stats?state=partial#sd-team-score` | 1 or 2 rounds: few note, figures with no tone, SG waits for round 3, pills hidden. |
| long |  | `long` | `add: stats?state=long#sd-team-score` | Longest real names: one line with ellipsis where 06 says, wraps everywhere else; rows never clip. |
| lots |  | `lots` | `add: stats?state=lots#sd-team-score` | Not drawn. Rows repeat at the same height (64 round rows, 52 player rows); ticker gap 3 above 12 rounds; no virtual list under 100. |
| one |  | `one` | `add: stats?state=one#sd-team-score` | Not drawn. One round renders the few rules; one team player renders one row and sign-aware wording. |
| offline |  | `offline` | `stats#sd-team-score (capture sets the context offline after load)` | Not drawn. Today's offline banner; cached figures render as loaded; window switch (Stats) works on cached data. |
| xxl | [`team-light-full-xxl-tscore`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-xxl-tscore) | `xxl` | `stats#sd-team-score (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`team-dark-full-tscore`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-dark-full-tscore) | `dark` | `stats#sd-team-score (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`team-light-full-reduce-tscore`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-reduce-tscore) | `reduce` | `stats#sd-team-score (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `stats#sd-team-score (viewport 390)` | Drawn at 393 (the page's phone); 390 is the same layout 3pt narrower: edge 16, cards fill. |
| w430 | [`team-light-full-wide-tscore`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-wide-tscore) | `w430` | `stats#sd-team-score (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `stats#sd-team-score (viewport 1280)` | Not drawn. Desktop keeps today's layout; `#sd-rounds` maps to the Rounds tab and `#sd-goals` to Development. |

### `S-TEAMSTATS.tgame`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`team-light-full-tgame`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-tgame) | `default` | `stats#sd-team-game` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `stats?state=loading#sd-team-game` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a tap can't open it, but a deep link can arrive while loading: the detail's pushed bar shows at once over a detail skeleton, then the detail lands in place with no slide; state `detail-loading` in the Completeness pass) |
| empty |  | `empty` | `stats?state=empty#sd-team-game` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: with no rounds a deep link replaces the hash and lands on the summary's empty card; Goals is the one detail that still opens; Completeness pass `deeplink-empty`) |
| failed |  | `failed` | `stats?state=failed#sd-team-game` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a deep link that arrives on a failed load shows the summary's failed card, keeps the hash, and opens the detail in place when Try again succeeds; Completeness pass `deeplink-failed`) |
| few | [`team-light-few-tgame`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-few-tgame) | `few` | `stats?state=partial#sd-team-game` | 1 or 2 rounds: few note, figures with no tone, SG waits for round 3, pills hidden. |
| long |  | `long` | `add: stats?state=long#sd-team-game` | Longest real names: one line with ellipsis where 06 says, wraps everywhere else; rows never clip. |
| lots |  | `lots` | `add: stats?state=lots#sd-team-game` | Not drawn. Rows repeat at the same height (64 round rows, 52 player rows); ticker gap 3 above 12 rounds; no virtual list under 100. |
| one |  | `one` | `add: stats?state=one#sd-team-game` | Not drawn. One round renders the few rules; one team player renders one row and sign-aware wording. |
| offline |  | `offline` | `stats#sd-team-game (capture sets the context offline after load)` | Not drawn. Today's offline banner; cached figures render as loaded; window switch (Stats) works on cached data. |
| xxl | [`team-light-full-xxl-tgame`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-xxl-tgame) | `xxl` | `stats#sd-team-game (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`team-dark-full-tgame`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-dark-full-tgame) | `dark` | `stats#sd-team-game (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`team-light-full-reduce-tgame`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-reduce-tgame) | `reduce` | `stats#sd-team-game (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `stats#sd-team-game (viewport 390)` | Drawn at 393 (the page's phone); 390 is the same layout 3pt narrower: edge 16, cards fill. |
| w430 | [`team-light-full-wide-tgame`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-wide-tgame) | `w430` | `stats#sd-team-game (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `stats#sd-team-game (viewport 1280)` | Not drawn. Desktop keeps today's layout; `#sd-rounds` maps to the Rounds tab and `#sd-goals` to Development. |

### `S-TEAMSTATS.tplayers`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`team-light-full-tplayers`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-tplayers) | `default` | `stats#sd-team-players` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `stats?state=loading#sd-team-players` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a tap can't open it, but a deep link can arrive while loading: the detail's pushed bar shows at once over a detail skeleton, then the detail lands in place with no slide; state `detail-loading` in the Completeness pass) |
| empty |  | `empty` | `stats?state=empty#sd-team-players` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: with no rounds a deep link replaces the hash and lands on the summary's empty card; Goals is the one detail that still opens; Completeness pass `deeplink-empty`) |
| failed |  | `failed` | `stats?state=failed#sd-team-players` | can't occur: a detail only opens once its summary has loaded; with no rounds its card isn't there to tap. Deep links in these states land on the summary (fixed 4 Nov: a deep link that arrives on a failed load shows the summary's failed card, keeps the hash, and opens the detail in place when Try again succeeds; Completeness pass `deeplink-failed`) |
| few | [`team-light-few-tplayers`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-few-tplayers) | `few` | `stats?state=partial#sd-team-players` | 1 or 2 rounds: few note, figures with no tone, SG waits for round 3, pills hidden. |
| long | [`team-light-full-long-tplayers`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-long-tplayers) | `long` | `add: stats?state=long#sd-team-players` | Longest real names: one line with ellipsis where 06 says, wraps everywhere else; rows never clip. |
| lots |  | `lots` | `add: stats?state=lots#sd-team-players` | Not drawn. Rows repeat at the same height (64 round rows, 52 player rows); ticker gap 3 above 12 rounds; no virtual list under 100. |
| one |  | `one` | `add: stats?state=one#sd-team-players` | Not drawn. One round renders the few rules; one team player renders one row and sign-aware wording. |
| offline |  | `offline` | `stats#sd-team-players (capture sets the context offline after load)` | Not drawn. Today's offline banner; cached figures render as loaded; window switch (Stats) works on cached data. |
| xxl | [`team-light-full-xxl-tplayers`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-xxl-tplayers) | `xxl` | `stats#sd-team-players (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`team-dark-full-tplayers`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-dark-full-tplayers) | `dark` | `stats#sd-team-players (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`team-light-full-reduce-tplayers`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-reduce-tplayers) | `reduce` | `stats#sd-team-players (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `stats#sd-team-players (viewport 390)` | Drawn at 393 (the page's phone); 390 is the same layout 3pt narrower: edge 16, cards fill. |
| w430 | [`team-light-full-wide-tplayers`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-wide-tplayers) | `w430` | `stats#sd-team-players (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `stats#sd-team-players (viewport 1280)` | Not drawn. Desktop keeps today's layout; `#sd-rounds` maps to the Rounds tab and `#sd-goals` to Development. |

### `S-TEAMSTATS.pin`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`team-light-full-tplayers`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-tplayers) | `default` | `stats#sd-team-players` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `stats?state=loading#sd-team-players` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| empty |  | `empty` | `stats?state=empty#sd-team-players` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| failed |  | `failed` | `stats?state=failed#sd-team-players` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| few |  | `few` | `stats?state=partial#sd-team-players` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| long |  | `long` | `add: stats?state=long#sd-team-players` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| lots |  | `lots` | `add: stats?state=lots#sd-team-players` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| one |  | `one` | `add: stats?state=one#sd-team-players` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| offline |  | `offline` | `stats#sd-team-players (capture sets the context offline after load)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| xxl | [`team-light-full-xxl-tplayers`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-xxl-tplayers) | `xxl` | `stats#sd-team-players (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`team-dark-full-tplayers`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-dark-full-tplayers) | `dark` | `stats#sd-team-players (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`team-light-full-reduce-tplayers`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-reduce-tplayers) | `reduce` | `stats#sd-team-players (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `stats#sd-team-players (viewport 390)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| w430 | [`team-light-full-wide-tplayers`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#team-light-full-wide-tplayers) | `w430` | `stats#sd-team-players (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `stats#sd-team-players (viewport 1280)` | same as the parent screen's row for this state; the step is not available while it loads or fails |

### `S-TEAMSTATS.peek`

Today's component, unchanged by this redesign. Every state is today's: capture it with `--id S-TEAMSTATS.peek --state default` on the app side only to prove it still opens from the new screens. Dark, XXL, Reduce Motion and 430 follow today's tests.


### `S-TEAMSTATS.player`

Today's component, unchanged by this redesign. Every state is today's: capture it with `--id S-TEAMSTATS.player --state default` on the app side only to prove it still opens from the new screens. Dark, XXL, Reduce Motion and 430 follow today's tests.


### `S-HOMEGAME`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`home-light-full`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#home-light-full) | `default` | `home-player` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading | [`home-light-full-loading`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#home-light-full-loading) | `loading` | `add: home-player?state=loading` | Cards held at loaded height; titles show; figures and visuals are bars; window switch inert (Stats); aria-busy. Shimmer 1.9s, off under Reduce Motion. |
| empty | [`home-light-none`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#home-light-none) | `empty` | `add: home-player?state=empty` | No rounds: one empty card where the data cards were; sections that read no rounds stay. |
| failed | [`home-light-full-failed`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#home-light-full-failed) | `failed` | `add: home-player?state=failed` | Today's code and copy in a card with Try again; anything that doesn't read rounds still renders. |
| few | [`home-light-few`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#home-light-few) | `few` | `add: home-player?state=early` | 1 or 2 rounds: few note, figures with no tone, SG waits for round 3, pills hidden. |
| long | [`home-light-full-long`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#home-light-full-long) | `long` | `add: home-player?state=long` | Longest real names: one line with ellipsis where 06 says, wraps everywhere else; rows never clip. |
| lots |  | `lots` | `n/a (four legs, fixed)` | not applicable: the card always has four legs |
| one |  | `one` | `add: home-player?state=one` | Not drawn. One round renders the few rules; one team player renders one row and sign-aware wording. (fixed 4 Nov: for Home, one round renders the 2-round rules with "in 1 round" in the counts line and a spark of one point drawn as the end dot only, no line.) |
| offline |  | `offline` | `home-player (capture sets the context offline after load)` | Not drawn. Today's offline banner; cached figures render as loaded; window switch (Stats) works on cached data. (fixed 4 Nov: Home has no window switch. Offline, the card renders the last loaded figures; a leg tap still navigates and Stats shows its own offline state.) |
| xxl | [`home-light-full-xxl`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#home-light-full-xxl) | `xxl` | `home-player (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`home-dark-full`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#home-dark-full) | `dark` | `home-player (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`home-light-full-reduce`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#home-light-full-reduce) | `reduce` | `home-player (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `home-player (viewport 390)` | Drawn at 393 (the page's phone); 390 is the same layout 3pt narrower: edge 16, cards fill. |
| w430 | [`home-light-full-wide`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#home-light-full-wide) | `w430` | `home-player (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `home-player (viewport 1280)` | Not drawn. Desktop keeps today's layout; `#sd-rounds` maps to the Rounds tab and `#sd-goals` to Development. (fixed 4 Nov: that sentence is for Stats. For Home: desktop player Home keeps today's layout and takes only the colour and token fixes of PR 6 (steady spark ink, track, tick, key size, tones); the new icons and card shape are phone only, at 820 wide and under.) |

### `S-HOMEGAME.leg`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default |  | `default` | `player?state=self#gm-tee` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `add: home-player?state=loading#gm-tee` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| empty |  | `empty` | `add: home-player?state=empty#gm-tee` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| failed |  | `failed` | `add: home-player?state=failed#gm-tee` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| few |  | `few` | `add: home-player?state=early#gm-tee` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| long |  | `long` | `add: home-player?state=long#gm-tee` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| lots |  | `lots` | `n/a (four legs, fixed)` | not applicable: the card always has four legs |
| one |  | `one` | `add: home-player?state=one#gm-tee` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| offline |  | `offline` | `player?state=self#gm-tee (capture sets the context offline after load)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| xxl |  | `xxl` | `player?state=self#gm-tee (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark |  | `dark` | `player?state=self#gm-tee (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce |  | `reduce` | `player?state=self#gm-tee (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?state=self#gm-tee (viewport 390)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| w430 |  | `w430` | `player?state=self#gm-tee (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?state=self#gm-tee (viewport 1280)` | same as the parent screen's row for this state; the step is not available while it loads or fails |

### `S-ALL.retry`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default | [`stats-light-full-failed`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-failed) | `default` | `player?state=failed` | As drawn: full season, Last 10, Text Size Default, light, 393. |
| loading |  | `loading` | `player?state=loading` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| empty |  | `empty` | `add: player?state=empty` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| failed |  | `failed` | `player?state=failed` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| few |  | `few` | `player?state=early` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| long |  | `long` | `add: player?state=long` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| lots |  | `lots` | `add: player?state=lots` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| one |  | `one` | `add: player?state=one` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| offline |  | `offline` | `player?state=failed (capture sets the context offline after load)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| xxl | [`stats-light-full-failed-xxl`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-failed-xxl) | `xxl` | `player?state=failed (capture sets --ch-type-scale 1.36)` | Text Size 1.36: rows grow, nothing clips; from 1.24 the switch scrolls with a right mask, meta wraps under titles, glance is 2 columns, legs stack. |
| dark | [`stats-dark-full-failed`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-dark-full-failed) | `dark` | `player?state=failed (capture sets the dark theme)` | Dark tokens from 04 §2; every pair in 06 holds 4.9:1. |
| reduce | [`stats-light-full-failed-reduce`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-failed-reduce) | `reduce` | `player?state=failed (capture sets reducedMotion 'reduce')` | Nothing travels or scales; push is a `CH_FADE_MS` crossfade (180ms today); grow-once marks drawn at rest; shimmer off. |
| w390 |  | `w390` | `player?state=failed (viewport 390)` | same as the parent screen's row for this state; the step is not available while it loads or fails |
| w430 | [`stats-light-full-failed-wide`](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S#stats-light-full-failed-wide) | `w430` | `player?state=failed (viewport 430)` | Page edge 20; cards 390 wide; switch padding 2 20 10. |
| desktop |  | `desktop` | `player?state=failed (viewport 1280)` | same as the parent screen's row for this state; the step is not available while it loads or fails |

## Completeness pass, 4 Nov 2026

Added so one builder can finish every screen, subscreen and state of this lane without guessing. Fixed in place above (each marked "fixed 4 Nov"): the 32 "can't occur" rows on the detail matrices (a deep link can arrive while loading, failed or empty), S-HOMEGAME desktop, offline and one, and S-TEAMSTATS few. Motion for every ID is in 07's Completeness pass; the checks are CP-114 to CP-154 in 08; the flag, files and tests are in 02's; data rules (practice rounds, 1 August, dates) in 03's; element specs in 06's.

`capture/screens.json` now carries every ID and state below (so it and this file still agree), plus `flagoff`, `w600` and `w820` on every ID.

**The lane flag.** Every new phone screen here (PR 4b, 4c, 5 and 6, and 4a's Missed short formula) sits behind one new flag, `clubhouse_stats_redesign_v1`, off in every environment. With it off, the app renders exactly as main: today's phone Stats, Team Stats and Home "Your game", today's links, today's `?tab=` and `#gm-` handling, and no `data-ch` hook from this lane in the DOM. This lane has no held migration and needs none: it adds no query, table, RPC or write.

### Inventory additions

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-STATS.filter-empty` | inline state | The window or filter matches no rounds while Last 10 with no filter has some: Season or Qualifiers after 1 August, a course, type or holes filter, a custom range with no rounds | not drawn (today's `FilterEmpty`; build rule below) | `add: player?state=filterempty` | player and coach | 4b |
| `S-TEAMSTATS.filter-empty` | inline state | Same on Team Stats: no team rounds in the chosen window or filter, while Last 10 has some | not drawn (today's `FilterEmpty`) | `add: stats?state=filterempty` | coach | 5 |
| `S-STATS.updating` | inline state | A window, filter or custom range whose rounds the page hasn't loaded yet: today's `UpdatingNote` shows under the switch until they land | not drawn (today's `UpdatingNote`) | `add: player?state=updating` | both | 4b |
| `S-STATS.detail-loading` | inline state | A link straight to a detail (notification, bell row, link from another screen, refresh, cold start) that arrives before the data | not drawn (build rule below) | `add: player?state=loading#sd-goals` | both (team: `stats?state=loading#sd-team-score`) | 4b, 5 |
| `S-STATS.return` | inline state | Back from a page a detail opened (the round page, a player's page, Messages from the coach head, today's All N rounds list): the detail is in place at its own scroll, the summary under it at its scroll | not drawn | `player?state=self#sd-rounds`, tap a round, go back | both | 4b, 5 |
| `S-STATS.refresh` | inline state | Pull to refresh on a summary or on player Home (iPhone app only, today's gesture, Classes M-CRH-42) | not drawn (today's) | `player?state=self` | both | none (unchanged; must work on the new scroller, 4b, 5, 6) |
| `S-STATS.goals-sheets` | sheets (today's) | On S-STATS.goals: Set a goal (`GoalSetButton`), Goal suggestions, answer a coach's proposal (`ProposalAnswer`), and for a coach Add focus area (`FocusAreaSheet`) | not drawn (today's components, re-homed) | `player?state=self#sd-goals`, then tap | player; Add focus area coach only | none (unchanged; re-homed in 4b) |
| `S-STATS.share` | sheet (today's) | Share in the coach bar on S-STATS.coach; `BestCardShare` in S-STATS.rounds | not drawn (today's) | `player?player=<id>`, tap Share; `#sd-rounds`, tap the best card's share | Share coach; best card both | none (unchanged; re-homed in 4b) |
| `S-STATS.denied` | inline state | A link this viewer may not see: a player on `?player=<someone else>`, a player on the team route, a coach on a player no longer on the team, a removed round, or a detail hash that belongs to the other screen | not drawn (today's guards; rule below) | `add: player?state=denied`, `add: stats?viewer=player` | both | 4b, 5 |
| `S-HOMEGAME.season-start` | inline state | 1 August until this season's third round: Home's last-10 figures still show (they read across seasons) but strokes gained is this season's and waits | not drawn (rule below) | `add: home-player?state=newseason` | player | 6 |

### State rows for every ID in this lane

These rows apply to every ID in the inventory above and in 05's first inventory (S-STATS, S-STATS.stuck, .window, .custom, .scrub, .filter, .switcher, .scoring, .sg, .sg-pin, .how, .tee, .approach, .short, .putting, .rounds, .round, .goals, .coach; S-TEAMSTATS, .filter, .tscore, .tgame, .tplayers, .pin, .peek, .player; S-HOMEGAME, .leg; S-ALL.retry) unless a per-ID row below says otherwise.

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| flagoff |  | `flagoff` | `add: <the ID's preview route>&flag=off` (PR 4a: the preview routes show the redesign and `flag=off` renders main's components; the real routes follow the flag) | Not drawn. Today's screen, exactly as main (SHARED-8). `#sd-*` hashes are ignored and land on today's summary; `?tab=` and `#gm-` behave as today; the Home leg rows are not links, as today (fixed 4 Nov wiring: `PlayerGame.tsx` `Legs` 315 and `Leg` 354 render no link on main). No hook of this lane is in the DOM. |
| first-run |  | `empty` | `add: player?state=empty`, `stats?state=empty`, `add: home-player?state=empty` | A brand new player (no rounds, maybe no goals) sees the drawn none card; Development still shows and, with no goals, reads today's Goals empty copy in the same card. A brand new team (no players, or players with no rounds) sees "No team rounds yet". Home shows the drawn CH-2311 body. Nothing else needs setting up first. |
| role |  | `role` | `add: stats?viewer=player`, `player?player=<id>` | Player: own figures only; no teammate id, name or figure in the DOM or responses (SHARED-11); Team Stats IDs are never served. Coach: S-STATS.coach adds today's coach head (identity, handicap, Message), Share and Add focus area, all absent from a player's DOM. |
| w820 |  | `w820` | `<route> (viewport 820)` | Not drawn. From 431 to 820 wide (large phones in landscape, iPad split view, iPad portrait) the phone layout holds: page edge 20, cards fill the width, nothing caps it. Rails and bars are percentage widths; line charts redraw at the card's measured width with their drawn height (160 feature, 46 Home spark), strokes never stretch. From 821 wide, desktop. |
| keyboard |  | DOM test | `<route>` at 1280 and at 390 with a keyboard | Tab order: bar (switcher, bell), window segments, filter, then cards top to bottom; inside a card, the card button then its chevron (the keyboard target when the chart holds focus). Enter or Space opens; focus moves to Back after 80ms (M-STATS-27); Escape or Back pops and focus returns to the card that opened the detail. Focus ring 2px, offset 2 (06). |
| voiceover |  | DOM test | `<route>` | Reading order follows the tab order. Every card, tile, row and leg has one accessible name with its figure (06 Completeness pass table). Charts are one image each with a sentence label, except the scoring chart, which is a slider while focused. Skeletons are hidden from VoiceOver. |
| one (fixed) |  | `one` | `add: player?state=one`, `add: stats?state=one`, `add: home-player?state=one` | One round: the 2-round rules with "From 1 round."; the scoring chart draws one dot (r 5) and the par rule, no line, area or scrub; the ticker draws one bar in `--ch-chart-flat` (no best when nothing is beaten), caption "1 round"; What changed shows its sentence only, no bars. One team round day: the team few rules, Round days has one row. One team player: one row, sign-aware wording (06). |
| long notes |  | `long` | `add: <route>?state=long` | Three-line text (a goal title, a focus area note, a proposal's note, the FilterEmpty copy, the few note) wraps and grows its card; nothing clamps except where 06 names an ellipsis. |

### Per-ID rows the shared rows don't cover

#### `S-STATS.custom`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default (fixed) |  | `default` | `player?state=self&range=custom` | The default row above says "Last 10"; for this ID the custom range is on: a sixth segment "Custom" (`WindowSwitch`'s own label) holds the chip, the switch is scrolled so Custom sits fully in view (right mask as at XXL), and the feature card's meta reads today's custom range label. Clearing the range in StatsFilter removes the segment and the chip springs to Last 10 (M-STATS-07). |

#### `S-STATS.scrub`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| one |  | `one` | `add: player?state=one` | No scrub: one round has nothing to read across. The chart is not focusable; the card is the tap. |
| few |  | `few` | `player?state=early` | Scrub reads the two rounds. |

#### `S-STATS.filter-empty`, `S-TEAMSTATS.filter-empty`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default |  | `default` | `add: player?state=filterempty`, `add: stats?state=filterempty` | Not drawn. The window switch and filter stay live; one card where the data cards were, built like the drawn none card (06) with today's `FilterEmpty` copy and its own clear action; Development and Goals still render (player). The first-round empty card shows only for Last 10 with no filter and no rounds, because Last N already reads back 12 months. |
| season start |  | `season` | `add: player?state=filterempty&window=season` | Season (or Qualifiers) between 1 August and the first round of the new season: this card, and the switch offers Last 10, which still reads last season's rounds. |
| xxl, dark, w430, reduce |  | as the parent | as the parent | As the none card in that mode. |

#### `S-STATS.updating`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default |  | `default` | `add: player?state=updating` | The chip moves at the tap (M-STATS-07); today's `UpdatingNote` shows under the segments after today's busy delay (`stats-busy-delay`); every figure keeps the old window's value until the new rounds land, then crossfades once (M-STATS-09). No in-between value ever shows. |
| failed |  | `failed` | `add: player?state=updating-failed` | The fetch fails or the device is offline: the chip springs back to the window whose figures are on screen (M-STATS-33), the note goes, and today's toast says it didn't load. Nothing else changes. |
| offline |  | `offline` | `player?state=self` offline | A window whose rounds are already loaded switches as normal offline; one that needs a fetch behaves as failed. |

#### `S-STATS.detail-loading`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default |  | `default` | `add: player?state=loading#sd-goals` | The pushed bar shows at once with the back label and the detail's own title (both known from the hash), no bell; the body is a detail skeleton (06); `aria-busy`. When data lands the detail paints in place with no slide (M-STATS-26) and the summary under it is the loaded summary. |
| failed |  | `deeplink-failed` | `player?state=failed#sd-sg` | The summary's failed card shows (no detail over it); the hash stays in the URL; Try again that succeeds opens the detail in place, history as an arrival (one Back to the summary). |
| empty |  | `deeplink-empty` | `add: player?state=empty#gm-tee` | The hash is replaced (summary URL) and the summary's empty card shows. `#sd-goals` and `?tab=dev` still open Goals, because Goals reads no rounds (a `dev_plan_assigned` notification to a new player must land on the plan). |

#### `S-STATS.return`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default |  | `return` | `player?state=self#sd-rounds`, open a round, Back | The detail is in place (no slide), at the scroll it had when the round opened; the summary under it at its scroll; one more Back reaches the summary. `useStatsDetail` must not replace and push again when the history entry already carries `{chPhone: 1}` for that hash, or the history doubles. |
| removed |  | `return` | as above with the round deleted on another device | The round page shows today's not-found; Back returns as above; the Rounds detail drops the row on its next load, without animation. |

#### `S-STATS.refresh`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default |  | app clip | `player?state=self` in the iPhone app | Today's pull to refresh on the summary scroller and on Home (Classes M-CRH-42, unchanged). New figures land with no animation, no crossfade and no regrow (SHARED-6). Details have no pull of their own; an open detail shows the refreshed figures in place. Mobile Safari keeps its own pull. |
| failed |  | app clip | `player?state=failed` | A refresh that fails keeps the figures on screen and shows today's toast; it never swaps the page for the failed card. |

#### `S-STATS.goals-sheets`, `S-STATS.share`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| default |  | app only | `player?state=self#sd-goals`, tap Set a goal | Today's sheets and Share, unchanged in look and behaviour (their own validation, saving state, double-submit guard and failure toast). They open over the detail; the detail stays open behind them; closing returns focus to the button that opened them (M-STATS-30). After a save, the detail updates in place with no animation; rings don't regrow. |
| unsaved |  | app only | type in Set a goal, then swipe down | Today's sheet behaviour on discard, unchanged. Popping the detail is blocked while a sheet is open (the sheet closes first). |
| role |  | app only | `player?player=<id>#sd-goals` | Add focus area and Share are coach only and absent from a player's DOM; `ProposalAnswer` is player only. |

#### `S-STATS.denied`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| player, other id |  | `denied` | `add: player?state=denied` | A player never sees a teammate's page: today's loader decides (it shows the player's own page or refuses), and the build adds a test that the teammate's id and figures are absent. If today's loader renders the teammate, that is a live leak: stop and fix it first, on its own, like CR0. |
| player on team |  | `denied` | `add: stats?viewer=player` | Today's route guard, unchanged; no team row reaches the player (SHARED-11). A `#sd-team-*` hash is dropped. |
| coach, removed player |  | `denied` | `player?player=<removed id>` | Today's not-found or empty result for that id; no detail opens; the hash is dropped. A coach who taps a player on S-TEAMSTATS.pin after the player left the team gets the same. |
| wrong hash |  | `denied` | `player?state=self#sd-team-game`, `stats#sd-sg`, `#sd-nope` | `detailFromHash` returns null for a hash that isn't this screen's: the summary at the top, the hash replaced. |

#### `S-HOMEGAME`, `S-HOMEGAME.leg`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| season start |  | `season` | `add: home-player?state=newseason` | Not drawn. Last 10 rounds read across seasons, so figures, counts, sparks and trend words show as usual; SG pills wait until this season has 3 rounds; the footnote's second clause reads "strokes gained shows from this season's third round." |
| partial failure leg |  | `failed` | `add: home-player?state=failed` | The missing leg (drawn: Short game) still opens its Stats detail; Stats has its own loader and its own failed state. |
| retry |  | `retry` | `add: home-player?state=failed`, tap Try again | Only the card reloads: the card body shows the Home skeleton legs, the hero and everything around the card stay put (M-STATS-25 on the card). |
| none |  | `empty` | `add: home-player?state=empty` | With no rounds there are no legs, so no leg links. |
| boundary |  | n/a | `home-player` | This lane owns only the Your game card (`PlayerGame` legs, `.ch-ph-leg`, `.ch-ph-bench`, `.ch-ph-spark` in home.css, and the legs block of `PlayerHomePhone.tsx`). The green top, greeting, Up next and the rest of player Home are today's, plus PR 10's `--ch-frame` bar change from the Classes lane, which lands first. Coach Home is the Classes lane's. |
| desktop |  | `desktop` | `home-player (viewport 1280)` | Today's desktop player Home with PR 6's colour and token fixes only (05 S-HOMEGAME desktop row, fixed). |

#### `S-TEAMSTATS.tplayers`, `S-TEAMSTATS.pin`, `S-TEAMSTATS.player`, `S-TEAMSTATS.peek`

| State | Drawn | Capture | App | Rule |
|---|---|---|---|---|
| lots |  | `lots` | `add: stats?state=lots` | 25 and 40 players: Who gains and loses lists all, 52pt rows, no virtual list; today's Players list below keeps its own sort and peek. |
| removed mid-session |  | `denied` | `stats#sd-team-players`, remove a player elsewhere, second tap | The open page keeps the row until its next load; the second tap opens the player and gets S-STATS.denied's coach rule. The peek shows today's not-found. |
| peek | | app only | `stats#sd-team-players`, tap a Players row | Today's PlayerPeek, unchanged; it opens over the detail; its links leave as today; closing returns focus to the row. |

### Every way in, and where Back goes

| Entry | URL it uses | Lands on | Back |
|---|---|---|---|
| Bell row `dev_plan_assigned` (player), from the bell or from its email, cold start or warm (fixed 4 Nov wiring: it is a bell row and an email, not a push; `development.ts:1403` to 1412 stores `CLUBHOUSE_DEV_PLAN_PATH`, and no sender pushes it; `push.ts:219` to 224 would open CoachHelm Plan if one ever did) | `?tab=dev` | S-STATS.goals in place (S-STATS.detail-loading first on a cold start) | Summary, then whatever was before |
| Same row opened from the in-app bell (`shell/Bell.tsx:385` to 387) | same | same | Summary, then the bell's page |
| Push `round_submitted` (coach) | `/golf/dashboard/rounds/<roundId>` (fixed 4 Nov wiring: `round-submit.ts:1835` to 1838 sends the id, `push.ts:162` to 167; `/golf/dashboard/stats/team` only when no id is sent) | today's round page (S-TEAMSTATS only without an id) | as today |
| Coach Home: "Team stats", a leg cell name, the round sheet's "Player stats" (Classes lane) | `/stats`, `?player=&tab=game`, `?player=` | S-TEAMSTATS; S-STATS.sg over S-STATS.coach; S-STATS.coach | Summary, then coach Home |
| Roster profile "All N rounds", RoundReview, TeamRounds | `?player&tab=rounds` | S-STATS.rounds over S-STATS.coach | Summary, then the page it came from |
| Messages profile link (direct thread with a player) | `?player=` | S-STATS.coach | Messages |
| Ask read chip "Open in Stats" (Ask lane, existing `coachhelm-chat-links.ts` hrefs) | `?player=` or a `#gm-` part | S-STATS.coach or that part's detail; for a player's own Ask, the player's own S-STATS | Summary, then Ask |
| Player Home leg (S-HOMEGAME.leg) | `#gm-<part>` | that part's detail, no slide | Summary, then Home |
| Refresh on a detail | its hash | the same detail in place | Summary |
| A shared `#sd-*` link opened on desktop | `#sd-rounds`, `#sd-goals` | Rounds tab, Development tab; other `#sd-*` the Overview tab | as today |
