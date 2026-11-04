# Plan: My stats, Team Stats, Home "Your game" (phone)

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 21 rows).

File by file against helmv3 `main` 75b4956. The plan body below was drafted against an earlier version of the design page. **This first section overrides it wherever they differ**, because the page has since been corrected and the build must copy the page (`04-FIDELITY-SPEC.md`).

## Overrides (read first)

1. **No tabs.** The phone summary is one scroll, as drawn: Overview, Your game, Rounds, Development, each a section name over its cards. Don't build the Segmented tab row the body describes.
   - Wherever the body says "tab" for the phone, read "section". The desktop tabs stay as they are.
   - `?tab=rounds`, `?tab=dev` and `?tab=game` still open the Rounds, Goals and Strokes gained details on arrival (Routing table). The summary underneath is scrolled so the card that opens that detail is in view, so Back shows where it lives. `?tab=overview` opens the summary at the top.
   - The `'profile-tab'` session key isn't read on the phone.
   - `useArrivalPainted` defers the cards below the first screenful instead of "the tabs other than the first".
   - Tests that the body says assert tabs (`chips-tabs`, summary card set "per tab") assert sections instead: four section names, the card set in each.
2. **Section names stay** (body conflict 2 reversed; Nick, 31 Oct: "Keep as drawn"). They're what makes the long page read as organized, which was the ask ("Not fewer. Just better organized"). This is an exception to DESIGN_LANGUAGE law 1 for Stats only. The page is flat `--ch-grouped-bg` under them, 15:1.
3. **No large title, as drawn** (Nick, 31 Oct: "Keep as drawn"; body conflict 1 reversed). The window switch sits directly under the bar's lip. The `large-title` test asserts Stats phone has none.
4. **Card sizes as drawn,** not DESIGN_LANGUAGE's (body conflict 6): radius 18, padding 14 16 16, gap 12, section name 18 above. Summary figure 34, detail hero 40, glance figure 24. Values in `04-FIDELITY-SPEC.md` sections 3 and 4.
5. **Leg cards lead with the key stat plus an SG pill,** as drawn (body conflict 3 settled). Build it behind the `lead` prop anyway.
6. **Home leg icons: build them** (body conflict 20 reversed), using the same four glyphs as the Stats part cards from one shared icon map. PR 6 grows from contrast-only to contrast plus icons.
7. **Press:** cards and rows never scale (house rule CH-1606, owner, 1 Oct). Pressed surface tint instead. Buttons keep `pressScale` .97 (body conflict 5 applies to buttons only). (fixed 4 Nov: START_HERE's shared values table, which beats every lane file, says tappable cards press at 0.97 and rows wash; DESIGN_LANGUAGE's Summary to detail pattern says the same for the Stats summary card. So summary cards take the wash and scale 0.97 with `data-ch-press-scale`; rows and tiles wash only. 07 M-STATS-16.)
8. **Settled by the page since the body was written:**
   - Conflict 4 (push): the page now uses the house push exactly: 462ms, underlay −24%, `--ch-push-dim`.
   - Conflict 7 (window options): the page now has all five windows, the filter, and the house green chip.
   - Conflict 8 (bell on a detail): the page now has none.
   - Conflict 11 (approach visual): 7 bands as loaded, in yards, no Tour tick.
   - Conflict 12 (putt bands): the real 6.
   - Conflict 13 (invented Tour values): gone from the page.
   - Conflict 16 (Score by round twice): Scoring only; Rounds opens with the ticker.
   - Conflict 17 (change line): built as the body recommends; the page does the same.
   - Conflict 18b (team "To par"): the page shows Rounds.
   - Open call 7 (putting summary rails): the page shows four rails, 3–5 ft to 15–25 ft, each with its Tour tick.
   - The bar: `--ch-frame`, 98pt with a 16pt lip, 18pt title, champagne dot and back label, matching Classes and Roster. On Home the bar and the hero are one flat green (Nick, 31 Oct 13:47).
9. **Still to build differently from the page:** SG total, goal rings, Home spark count, Custom segment, coach head, haptics. See `04-FIDELITY-SPEC.md` section 8.

## Calls for Nick

1. **Stats page head: settled.** Nick, 31 Oct: "Keep as drawn". No large title; section names on the page.
2. **Detail pages are longer than drawn.** Today's panels (SG by round, GreenMiss, CupMiss, lag, break, distance by club, More and so on) move into the details instead of being cut. Recommended: yes, nothing removed.
3. **Home sparks to 10 rounds** (`LEG_TREND` 7 to 10) so "Improving" and "Slipping" can show. Recommended: yes; it's a constant and a test.

Smaller calls with a recommended default (build the default unless Nick says otherwise): SG "Open a part" replaces the SG page (body open call 4); team leg rows pin only, the Players list keeps its own sort (open call 5); team putting goes in the Team scoring detail (open call 6); no `?area=` alias (open call 8).

---

This is a plan for review, not an approved spec. The visual source is the Stats redesign mock (`parts/ph2.css`, `r_main.js`, `r_chrome.js`). Its rendered figures are in `prep/figures-dump.md`. The house rules are in `DESIGN_LANGUAGE.md`, and the PR order is in `BUILD_BRIEF.md` (PRs 4, 5 and 6). Where a figure's source or formula matters, `prep/DATA_MAP.md` has the row. This plan cites it by item number (DATA_MAP §n) and does not repeat it.

- **Repo:** `njrini99-code/helmv3`, read at `main` 75b4956 (Oct 31).
- **Paths:** under `src/clubhouse/` unless they say otherwise.
- **Line numbers:** they drift, so find code by component, function or selector name. The numbers here are only a guide.

## Ground rules for whoever builds this

- **Scope:** no new queries, tables, RPCs or writes. Every figure comes from data the Stats route already loads (`ChProfileData`, `ChTeamStats`, `ChPlayerHome`). Where a card needs a derived value (a band count, a one-putt rate, a ring's progress), compute it on the client in a pure helper with a unit test.
- **Nothing is removed.**
  - Every block on today's phone Stats must still be reachable: either on a summary card or on a detail page.
  - The inventory in "Where today's content goes" is the checklist.
  - A PR that drops a block without a row there fails review.
- **Top bar:** no change.
  - Keep the green bar: switcher title "My stats ⌄" / "Stats ⌄" with its dot, the bell with its badge, and the ivory lip.
  - A detail page uses the existing pushed bar (`ui/PhoneBar` inside `shell/PhoneScreen`): "‹ My stats" / "‹ Stats" with the page name centred.
  - Do not edit `shell/phone-chrome.tsx`, `ui/PhoneBar.tsx`, `PhoneTop` or the section switch (BUILD_BRIEF PR 3).
- **Push:** use the house push exactly as it is.
  - 462ms smooth spring, and the page underneath draws back by `CH_UNDERLAY_SHIFT` and dims.
  - Edge-swipe back, a fade under Reduce Motion, and an instant swap with Animations off.
  - Don't build a second push.
- **Signals:** keep every honesty rule as it is.
  - `deltaTone` / `halvesTone`: grey when the change is inside its likely error.
  - Floors and early reads: `floorRate`, `sampleState`, the hollow "early" tag.
  - Tour marks only from `data.bench` / `comparisons[].bench`; never draw a Tour value that isn't loaded (DATA_MAP Summary).
  - A summary card may show fewer figures than its detail, but never a different number for the same figure.
- **Accent borders:** none. Text sits on a surface (DESIGN_LANGUAGE law 1). The page is flat.
- **Text Size:** keep `--ch-type-k` scaling. Cards grow; nothing clips at the largest standard size.
- **Page edge:** 16px on phones, 20px from 430pt.
- **Theme and motion:** test light, dark, Reduce Motion and `[data-motion='off']`.
- **Desktop:** desktop keeps its layout. It only takes the shared colour and token changes listed under Desktop.

## Summary to detail map

### My stats (player; a coach on `?player=` sees the same, with the coach bar)

| Tab (window switch stays sticky above) | Summary card | Visual on the card | Tap pushes |
|---|---|---|---|
| Overview | **Scoring average** (feature card, the page's one feature) | `RoundTrend kind='score'` in feature inks, drag to read | Scoring |
| Overview | What changed | `StatsInsight` sentence plus a two-figure "Last N / N before" pair from `x.compare` | Scoring (anchored to its "Against the N before" panel) |
| Overview | At a glance (3×2: Greens, Fairways, Scrambling, Putts, Birdies, Bogeys) | figure and Tour line per tile; no chart | each tile pushes its part (Greens → Approach, Fairways → Off the tee, Scrambling → Short game, Putts → Putting, Birdies/Bogeys → Scoring) |
| Your game | **Strokes gained** | 4 mini diverging bars (SgBars look, no whisker) | Strokes gained |
| Your game | Off the tee | key figure, SG pill, Left / Fairway / Right strip, distance strip | Off the tee |
| Your game | Approach | key figure, SG pill, one band chart (see conflict 11), strip of 3 tiles | Approach |
| Your game | Short game | key figure, SG pill, up and down rails, strip | Short game |
| Your game | Putting | key figure, SG pill, make-rate rails (real bands), strip | Putting |
| Rounds | Round by round | round ticker (bars, taller = lower, best in green) | Rounds |
| Development | Goals and focus areas | up to three rings | Goals |

Detail pages: **Scoring, Strokes gained, Off the tee, Approach, Short game, Putting, Rounds, Goals** (8).

### Team Stats (coach)

| Summary card | Visual | Tap pushes |
|---|---|---|
| **Team scoring average** (feature card) | `TeamTrendChart` by round day, mean line | Team scoring |
| Team game | 4 mini diverging bars by leg, plus a "Greens · Putts · Scrambling" line | Team game |
| Players | top 3 by SG with a rank, plus a "who gains and loses" sentence | Players |

Detail pages: **Team scoring, Team game, Players** (3).

### Home (player)

The "Your game" card keeps its structure (`PlayerGame` `Legs`/`Leg`). It gets contrast fixes only (BUILD_BRIEF PR 6). It does not become a summary card.

## Routing: pushed detail pages, Back, scroll and deep links

### How a detail opens

- **Host:** each phone Stats screen (`StatsPlayerPhone`, `StatsTeamPhone`) holds one piece of state, `detail: StatsDetailId | null`. It renders the open detail inside `<AnimatePresence initial={false}>` as a `StatsDetailScreen` (new; wraps `PhoneScreen` + `PhoneBar`).
- **History:** a new hook, `useStatsDetail` (`screens/stats/use-stats-detail.ts`), keeps the house history contract and adds a hash:
  - open: `history.pushState({ chPhone: 1 }, '', '#' + hashOf(id))`
  - close (the bar's back, edge swipe, retapping the section): `history.back()`
  - `popstate`: read `location.hash` through `detailFromHash`, then set `detail` (`null` when there is no detail hash)

  The state is the same shape `usePhoneStackHistory` writes (`{chPhone: level}`). So `SectionStrip`'s retap (it reads `history.state.chPhone` and calls `history.go(-level)`) and `PhoneScreen`'s edge swipe (it finds the bar's back button) work unchanged. It is a sibling hook rather than a call to `usePhoneStackHistory`, because that hook pushes the same URL with no hash and `phone-chrome.tsx` is frozen. Keep the new hook under 60 lines and give it the same `ignore` guard for the pops it makes itself.
- **Next router:** Next 16 patches `pushState`/`replaceState` and keeps the caller's state keys. A change to the hash alone triggers no server request. RosterPhone already relies on this. Check it in the e2e test below (no RSC fetch on open or Back).
- **Scroll:**
  - The summary stays mounted under the fixed `.ch-pscreen` overlay, and `useOverlayScrollLock` holds its scroll. So the summary comes back at the same scroll position with no extra code. Test it, because it is a BUILD_BRIEF PR 4 acceptance item.
  - Each detail opens at its own top.
  - A detail opened with an anchor (What changed → "Against the N before") scrolls that panel into view after the push settles, using `scrollIntoView({block:'start'})` inside the screen. It doesn't animate under Reduce Motion.

### Hash and parameter scheme

| Detail | Hash (new unless noted) | Also opened by (arrival) |
|---|---|---|
| Scoring | `#gm-scoring` (existing) | `?area=scoring` (legacy alias, optional) |
| Off the tee | `#gm-tee` (existing) | `legDetailHref(…, 'Off the tee')`; `?area=driving` |
| Approach | `#gm-approach` (existing) | `legDetailHref(…, 'Approach')`; `?area=approach` |
| Short game | `#gm-short` (existing) | `legDetailHref(…, 'Around green')`; `?area=short-game` |
| Putting | `#gm-putting` (existing) | `legDetailHref(…, 'Putting')`; `?area=putting` |
| Strokes gained | `#sd-sg` | `?tab=game` with no hash (coach Home TeamLegs) |
| Rounds | `#sd-rounds` | `?tab=rounds` (RosterProfile `roundsHref`, RoundReview, TeamRounds); `?area=rounds` |
| Goals | `#sd-goals` | `?tab=dev` (WhatsNew, RosterPeek `devHref`, DeepDive, `PLAYER_HELM_DEVELOPMENT_HREF`, the `dev_plan_assigned` bell row's actionUrl `CLUBHOUSE_DEV_PLAN_PATH`) (fixed 4 Nov wiring: that row is in-app and email only, `development.ts:1403` to 1412 and `lib/notifications/index.ts:195` to 218; no sender pushes it) |
| Team scoring | `#sd-team-score` | none today |
| Team game | `#sd-team-game` | none today |
| Players | `#sd-team-players` | none today |

The five game areas keep `#gm-<id>`, so `legDetailHref` (the team grid), `GAME_SECTION_IDS`, `gameSectionFromHash` and every saved link keep working on phone and desktop. Desktop ignores `#sd-*`.

### Arriving with a deep link

On the first client render of the phone screen:

1. Work out the target detail with `arrivalDetail({ tab, hash, area })`:
   - a `#gm-x` or `#sd-x` hash wins
   - else `tab=rounds` gives Rounds, `tab=dev` gives Goals, and `tab=game` gives Strokes gained
   - `tab=overview` or nothing gives no detail
2. If there is a target:
   - `history.replaceState(history.state, '', summaryUrl)`, which is the same URL without `tab` and the hash, keeping `player`, `window` and the filter
   - then `pushState({chPhone:1}, '', '#'+hash)`
   - then set `detail`

   Back then lands on the summary of the right tab, not on the page before Stats. Refreshing the detail keeps it, through the hash. Refreshing the summary does not reopen it.
3. The detail is rendered under `AnimatePresence initial={false}`, so a deep link shows it in place, with no slide over a page the user never saw.
4. The summary tab under it is the detail's own tab: Rounds → Rounds tab, Goals → Development, and any game area or SG → Your game. Set that before the first paint so the underlay is right.

Notes:
- `tab` still chooses the summary tab when there is no detail, for example `tab=overview`.
- The `rounds` scroll-into-view in today's `Rounds` (`open={initialTab==='rounds'}`) goes. The Rounds detail replaces it.
- Legacy `?area=` is never read by Clubhouse today (`ClubhouseStatsRoute` is chosen before the `?tab→?area` redirect in `src/app/golf/(dashboard)/dashboard/stats/page.tsx`). Aliasing it is optional. If it's done, `routes/stats.tsx` passes `area` through to the screen; the page does no new work.
- Coach push notification `round_submitted` is unchanged. (fixed 4 Nov wiring: `round-submit.ts:1835` to 1838 sends it with `roundId`, so `push.ts:162` to 167 opens `/golf/dashboard/rounds/<roundId>`, today's round page; `/golf/dashboard/stats/team`, the team summary, is only the fallback when no id is sent.)

### Every inbound link, and where it lands after the change

| Source | Link | Phone today | Phone after |
|---|---|---|---|
| RosterProfile `roundsHref` | `?player&window=season&tab=rounds` | player page, scrolls to Rounds | Rounds detail over the Rounds tab; Back → summary |
| RoundReview (coach), TeamRounds | `?player&tab=rounds` | same | same as above |
| WhatsNew (focus), RosterPeek `devHref`, DeepDive, `PLAYER_HELM_DEVELOPMENT_HREF`, `dev_plan_assigned` | `?tab=dev` (± `player`) | Development tab | Goals detail over Development |
| coach Home TeamLegs | `?player&tab=game` | Your game tab | Strokes gained detail over Your game |
| Team grid cell (`legDetailHref`) | `?player&tab=game#gm-<leg>` | Your game tab, section chosen | that part's detail |
| PlayerPeek, Roster, Leaderboard, LatestRound, CoachHelm prose, commands, QualifierDetailPhone, HomePhone, MessagesPhone | `?player=` | player summary | unchanged |
| Push `round_submitted` | `/rounds/<roundId>` (fixed 4 Nov wiring: `/stats/team` only without an id, `push.ts:162` to 167) | the round page (team summary without an id) | unchanged |
| `nav.ts` coach with `player` | back "Team", title "Player stats" | coach bar | unchanged; details read "‹ Player stats" (see conflict 9) |

## New pieces (build once)

Where an existing component already does the job, the plan reuses it. "New" means no existing component fits.

| Piece | Where | New or reuse | What it is |
|---|---|---|---|
| `detail-route.ts` | `screens/stats/` | new (pure) | `StatsDetailId` union; `hashOf(id)`; `detailFromHash(hash)`; `arrivalDetail({tab, hash, area})`; `tabOfDetail(id)`; `summaryUrl(location)`. Reuses `GAME_SECTION_IDS` and `LEG_SECTION` from `legs.ts`. |
| `use-stats-detail.ts` | `screens/stats/` | new hook | open, close and popstate as above; reads the arrival once. |
| `StatsDetailScreen` | `screens/stats/StatsDetailScreen.tsx` | new, thin | `PhoneScreen` + `PhoneBar` (back label from the host, centred title) + a scroll body with page padding. Uses `PhoneScreen` as it is. |
| `DetailHero` | same file | new, small | 40/500 hero figure, label line ("Fairways hit · Last 10 rounds"), SG pill and its likely range, change line (`deltaTone`). This is the first block of every detail. |
| `SummaryCard` | `screens/stats/SummaryCard.tsx` | new | The whole card is one `<button>` (or `Link`-less button, since the push is client state). Title row with a chevron, a 15pt meta, figure slot, visual slot and strip slot. Press 0.97 (110/280ms). `aria-label` = title + figure. An interactive child (a drag-to-read chart) sits above the tap target and stops propagation, as the mock's `e.target.closest('.chart')` does. A separate "Open" chevron button keeps the card reachable from the keyboard when the chart takes the focus. |
| `FeatureCard` look | modifier on `SummaryCard` (`feature`) | new style | deep green fill, feature inks (`#F4F1E8`, `#D3D9CB`, gain `#8FD3AA`, loss `#EDB867`, under par `#F49A8D`) as tokens `--ch-feature-*` in `tokens.css`, with light and dark values. |
| Feature trend | `RoundTrend` prop `tone="feature"` | reuse plus prop | Same chart and pin, drawn with the feature tokens. The team side uses `TeamTrendChart` with the same prop passed through to `ui/charts/Line`. |
| `MiniDiverging` | `screens/stats/MiniDiverging.tsx` | new, from SgBars | Four rows of label, bar from a centre zero and the signed value. No whisker or pin; the card is the tap. Reuses `sgLegBars` rows and SgBars' scale maths (export `sgScale` from `SgBars.tsx`). Grows once (360ms). |
| `MiniRails` | `screens/stats/MiniRails.tsx` | new | Labelled horizontal rails, 0–100%, with an optional Tour tick drawn only when a Tour value is passed. Used by Short game (by lie), Putting (bands) and Approach (if conflict 11 goes that way). Takes `sampleState` and draws early rows hollow. |
| `RoundTicker` | `screens/stats/RoundTicker.tsx` | new | One bar per round in the window, oldest to newest. Taller = lower score, sharing one range. The best is in gain green, the rest neutral, with no amber. Labels are first and last date. It reads `data.rounds` only. |
| `GoalRing` | `screens/stats/GoalRing.tsx` | new | A ring with a centre figure, title and one line. Progress comes from `progressOf` (moved, below). With no progress it draws an empty track and "No baseline yet". It never invents progress. |
| `GlanceGrid` | inside `StatsPlayerPhone` | new, small | 3×2 tiles, each a button. Figure, label, and Tour line only when `bench` holds the key. |
| `progressOf` | move from `StatsPlayer.tsx` (desktop Development, about line 645) to `screens/stats/dev-format.ts` | move | Shared by desktop DevTrack and `GoalRing`. Same maths, so the desktop doesn't change. |
| `GameDetail` `only` prop | `GameDetail.tsx` | prop | `only={section}` renders one `Sec` with no `.ch-gd__nav` chips, no hash listener and no session `'game-section'`. This is how a part's detail reuses every panel without a copy. |
| `RoundLine` `ref` prop | `detail.tsx` | prop | A dashed reference line (Par, Tour or team mean) with its label, for "Score by round", "Greens by round" and "Putts by round". Draw the Tour line only when the value is loaded. |
| `teamLegPick` | none | none | Not built. The team leg picker becomes the Team game detail's list (see StatsTeamPhone). |

Not needed, because the job is already done:
- the Tour line: `PuttBands` already draws it only where the band has one
- the score mix: `ScoreMixBar` compact
- personal bests: `RoundsExtra`
- sharing: `BestCardShare`
- the players list: `TeamRank` with its pin, then a second tap opens the player
- the window: `WindowSwitch`

## File by file

Key: **keep** = untouched · **restyle** = CSS or tokens only · **restructure** = same component, new layout or props · **replace** = new component takes its place · **new**.

### screens/stats/StatsPlayerPhone.tsx: restructure

Today it is the phone player page as one long scroll, at 548 lines:
- the coach or player bar, then `.ch-spm-head` (avatar, name, year, rounds, HCP, Message)
- controls (WindowSwitch and StatsFilter), notices and PlayerInsight
- then `Figures`, `StrokesGained`, `GameDetail`, `Trend`, `RoundsExtra` + `Rounds`, `Development`

Changes:
- **Bar:** keep `PhoneTop` exactly: coach `back Team` / "Player stats" / Share, player `start` "My stats".
- **Head:** keep `.ch-spm-head` for the coach view (identity, HCP, Message link). For the player's own page it shrinks to the context line under the large title (see conflict 1).
- **Tabs:** a `Segmented` (sm) for Overview / Your game / Rounds / Development sits under the head. It reuses the desktop tab ids `overview | game | rounds | dev` and the same session key `'profile-tab'`, so a tab chosen on one device size is the one shown after a resize.
- **Sticky controls:** `.ch-stm-controls` (WindowSwitch, StatsFilter) becomes `position: sticky` under the green bar, with `top: var(--ch-phone-topbar-h)` (the existing bar height variable; read only) on the page colour, with a 14px shade after 8px of scroll. The tabs scroll away, and only the window switch sticks.
- **Notices stay above the cards and are unchanged:** `NineHint`, `InlineNotice` CH-5201, `FilterEmpty`. `PlayerInsight` moves into the "What changed" card.
- **Tab content:** each tab renders its summary cards (table above):
  - Overview: `ScoringCard` (feature), `WhatChangedCard`, `GlanceGrid`
  - Your game: `SgCard`, then four `LegCard`s
  - Rounds: `RoundsCard`
  - Development: `GoalsCard`, plus the "Add focus area" action for a coach (it stays on the summary, since it is a write and should not hide in a detail)
- **Details:** add the `useStatsDetail` host and `<AnimatePresence initial={false}>{detail && <StatsDetailScreen …/>}</AnimatePresence>`.
  - Back label: "My stats" for the player, "Player stats" for a coach.
  - The detail bodies are the moved functions below.
- **Moved functions** (bodies kept, re-homed):
  - `Figures` splits:
    - scoring avg, delta and `FigureGauge` go to the Scoring detail hero and its "Per round" panel
    - SG/round and `SgChangeChip` go to the Strokes gained detail hero
    - `formChange` goes to "What changed" when `x.compare` is null (conflict 17)
  - `StrokesGained` (SgBars plus its note) becomes the body of the Strokes gained detail, with a new "Open a part" list (four rows that push the part, replacing the current detail without stacking; see open call 4).
  - `Trend` → the Scoring detail ("Score by round") and the Strokes gained detail ("Strokes gained by round").
  - `RoundsExtra phone` + `Rounds` → the Rounds detail. The full list shows every round, not 5 rows then "All N rounds". Keep the "All N" link only when the window holds more than 20.
  - `Development` → the Goals detail, whole: Add focus area, focus areas with `ProposalAnswer` and `FocusLoop`, Goals with `GoalSetButton`, `GoalSuggestions` and `GoalStatus`.
  - `GameDetail phone` → five part details through `only`.
- **Deferral:** `useArrivalPainted` keeps deferring the lower part. It now defers the tabs other than the first, and it doesn't defer a deep-linked detail.
- **Props:** `initialTab` is still read, now through `arrivalDetail`. Add `area?: string` if the legacy alias is taken. Everything else is unchanged.

### screens/stats/StatsPlayer.tsx: small restructure

Today it is the shared player page. It chooses phone or desktop, holds tab state (`'profile-tab'`), `openLeg`/`LEG_SECTION`, the desktop hash scroll (about 107–122), and the desktop body (hero, tabs, Overview zones, GameDetail, Rounds zones, Development with `progressOf`, `FocusAreaSheet`).

Changes:
- **`openLeg`:** keep it for desktop as it is. On the phone it isn't passed. The phone's leg cards push their detail directly.
- **`LEG_SECTION`:** keep it, in `legs.ts`. `detail-route.ts` uses it to map a leg to a hash.
- **Hash and tab handling:**
  - Keep the desktop effects. Guard them so they run only off the phone; today they already clear `wantSection` on the phone.
  - The phone branch passes `initialTab`, plus `hash` read once on mount (`location.hash`) and `area` when aliased, to `StatsPlayerPhone`.
  - Desktop ignores `#sd-*`. `gameSectionFromHash` returns null for it, so nothing scrolls.
- **`progressOf`:** move it to `dev-format.ts` and import it back. The desktop is unchanged.
- **Phone branch props:** add `hash`. The rest is unchanged.

### screens/stats/StatsTeamPhone.tsx: restructure

Today it is the phone team page:
- head `.ch-stm-head` with the large title "Team stats" and context line; controls (PhoneWindowSwitch, TeamFilter); TeamInsight
- Hero, Trend, RoundFigures, Legs (a tab picker, with session `'team-sg-leg'`), TeamRank, Players (Avg/SG Segmented, PlayerPeek), Putting (5 bands)

Changes:
- **Head and controls:** keep the head. The controls go sticky, as on the player page. `TeamInsight` moves into the Team scoring detail; on the summary it shows only as the feature card's change line.
- **Summary:**
  - `TeamScoringCard` (feature): mean, to par, the change against the N before, and `TeamTrendChart` with the feature tone
  - `TeamGameCard`: `MiniDiverging` from `legTotals`, and the total from `team.sgMean`, not the sum of legs (conflict 10)
  - `TeamPlayersCard`: the top 3 from `teamRankRows` sorted by SG, plus the gains and loses sentence (DATA_MAP §9 wording)
- **Details:**
  - **Team scoring:** hero; `TeamInsight`; trend by round day with the mean line; "The round" (`RoundFigures`: greens, putts, scrambling, with "Hole stats from 56 of 70 rounds" as the card's note); the Round days table (Day, Team average, Rounds `n`, no "To par"; conflict 18); team Putting (5 bands; moved here from the summary).
  - **Team game:** hero (`team.sgMean`, the costliest leg); `SgBars` for team legs with the whisker and pin; "The round" (shared with Team scoring; render the component in both, it is cheap); "How strokes gained works". The old leg tab picker (`'team-sg-leg'`) becomes four rows under the bars. Tapping a row pushes Players sorted by that leg (open call 5), which keeps the "players by leg" view the picker gave.
  - **Players:** `TeamRank phone` (its own pin, then a second tap opens the player). Then the Players list with the Avg/SG `Segmented` (session `'team-players-sort'`) and `PlayerPeek`, both unchanged.
- **Host:** the same `useStatsDetail` host. The back label is "Stats".

### screens/stats/StatsTeam.tsx (desktop): keep

Today: PageHero, TeamFilter, TeamInsight, TeamCharts (tape, trend, leg cards, grid in StatsTeamIslands), TeamPutting, SeasonBests. No layout change. It takes the token changes under Desktop. The grid cell's `legDetailHref` is unchanged, and on a phone it now opens the part detail.

### screens/stats/GameDetail.tsx: restructure (props only)

Today it is the five game areas (SECTIONS), each a `Sec` with head, figures, Rule/How, reads, panels and More. On the phone it shows chips plus session `'game-section'`; on desktop, a hash reader and `jump`.

Changes:
- **Add `only?: GameSectionId`.**
  - When it is set: render that `Sec` alone; skip `.ch-gd__nav`, the hash listener (about 272–297), `jump` and the `'game-section'` session read.
  - The `Sec` head becomes the `DetailHero` (pass `hero` to `Sec` so the figure isn't printed twice).
- **Panel order inside a part detail:** follows the mock ("You and the Tour", "The figures", the main chart, "by round", "Against the N before", "How this is measured"). It uses the existing panels:
  - Scoring: `ScoreMixBar` ("An average round"), `ParTiles` (kept; the mock omits it, conflict 15), More
  - Off the tee: `FairwayStrip`, `Compare` (distance by club)
  - Approach: `Ladder` (GIR by distance, 7 bands, no Tour), proximity vs Tour, finish when the green is hit, `GreenMiss`, greens by lie
  - Short game: up and down by lie, up and down by distance
  - Putting: `PuttBands`, `CupMiss`, lag leave, make rate by break
- **Keep:** `ReadsLine`, `ReadsFailedNotice`, `floorFig` and `NONE_REASON`.
- **Fix in passing** (DATA_MAP §1): "Missed short" = `s.approachMissShortPct` alone (about 357–358). It is a data fix, but the Approach card now shows this figure on the summary, so ship it in the same PR.
- **Desktop:** unchanged (no `only`).

### screens/stats/GameMore.tsx: keep, re-homed

Today: ScoringMore, TeeMore, ApproachMore, ShortMore, PuttingMore. The `ByRound` lines ("Fairways by round", "Greens by round", "Putts by round") are already there.

On the phone they render inside the part detail, under the main chart, open. The phone `More` toggle goes in a detail, because the page is the "more". Pass `ref` to the by-round lines (Tour or Par dashed) only where the value is loaded: GIR 66 is; fairways and putts per round are not (DATA_MAP Summary).

### screens/stats/detail.tsx: restructure (one prop)

Today: How, Panel, Empty, Rule, More, Tiles, DataTable, RoundLine (about line 167), SectorGrid, ROUND_TYPE, RULE_WINDOW.
- Add `RoundLine` `ref?: {value:number; label:string}`, drawn as a dashed line with the label at its right end.
- `Panel` takes the card surface on the phone (radius 16, 20 padding, title inside), so the detail's blocks are cards and not ledger sections (DESIGN_LANGUAGE law 1). That's CSS under `.ch-pscreen .ch-gm-p`; the markup is unchanged.
- The rest is kept.

### screens/stats/OverviewZones.tsx (desktop): keep

Today: the seven desktop Overview zones, with Track, the `against` tone and `cmp(label)`. No change.
- The phone no longer uses anything from it.
- Fix in passing, as in GameDetail: "Missed short" (DATA_MAP §1, about 110–111).

### screens/stats/LegBars.tsx (desktop): keep

Today: the desktop SG bars with the whisker, team tick, pin and "See X in game detail" (`onOpen` → `openLeg`). No change.

### screens/stats/SgBars.tsx: keep, plus one export

Today: the phone SG bars with the whisker and pin (`.ch-stm-legs`, `.ch-stm-leg`). They are used in the Strokes gained detail and the Team game detail as they are.
- Export the scale helper for `MiniDiverging`.
- Don't add a total row as a bar. The SG figure is the hero. The `.ch-stm-leg.is-total` mint row (stats.css about 2347, 3901, 4719–4723) is dropped on the phone (BUILD_BRIEF PR 5: "no mint total row").

### screens/stats/PuttBands.tsx: keep

Today: the make rate by distance, with a Wilson whisker and Tour line only where loaded, early hollow, `compact` for the phone. It is used whole in the Putting detail.
- The Putting summary card uses `MiniRails` fed from the same `puttBands` (the real six bands, no 0–3 Tour), not a copy of this chart.

### screens/stats/RoundTrend.tsx: restructure (one prop)

Today: the score or SG line by round, phone 340×168, with drag to read (`useChartPin`), `openHref` and `tour`.
- Add `tone?: 'page' | 'feature'`. Feature draws with the `--ch-feature-*` tokens on the green card.
- Keep the plot height at 168 or more (law: chart at least 160pt).
- On the summary card, `openHref` is unset (the card pushes).

### screens/stats/StatsInsight.tsx: keep

Today: the insight-first card (`StatsInsight`, `TeamInsight`, `PlayerInsight`). Its sentence is used inside the "What changed" card and the Team scoring detail. Drop its own card chrome when nested: add `bare` to render only the sentence list.

### screens/stats/RoundsExtra.tsx: keep, re-homed

Today: personal bests, the compare table (`hasPrevious`) and BestCardShare. The `phone` variant renders inside the Rounds detail ("Personal bests", "Against the N before") as it is. The `compare` table is also used by the Scoring detail's "Against the N before" panel. Render the same component with `share={false}`, so the figures come from one place.

### screens/stats/WindowSwitch.tsx: restyle

Today: a Segmented (sm) with Last 5 / 10 / 20, Season, Qualifiers and Custom; `changeWords`; UpdatingNote.
- Keep every option (conflict 7). Keep the green chip.
- Only the container goes sticky (CSS in stats.css). No logic change.

### screens/stats/Goals.tsx: keep, re-homed

Today: GoalSetButton, GoalSuggestions, GoalStatus. These render inside the Goals detail as they are. `GoalRing` reads the same goal and focus rows for the summary.

### screens/stats/TeamRank.tsx: keep

Today: the players by metric, with the pin, then a second tap opens the player (session `'team-rank-metric'`).
- It renders inside the Players detail as it is.
- The summary's top 3 reuses `teamRankRows` and `rankScale` (team-rank.ts), not the component.
- Copy fix (DATA_MAP §9): when everyone is below zero, say "loses the least" in the summary sentence.

### screens/stats/TeamTrendChart.tsx: restructure (one prop)

Today: the team's round days on `ui/charts/Line` with the mean. Add `tone` to pass the feature tokens, as `RoundTrend` does.

### screens/stats/BestCard.tsx: keep

Today: the share-card canvas and `BestCardShare`. Unchanged, inside the Rounds detail.

### screens/stats/ScoreMixBar.tsx: keep

Today: the scoring mix bar, with its key and pin, early under 30 holes. It is used in the Scoring detail ("An average round"). Its colours aren't amber; check that it uses the chart tokens after PR 1.

### screens/home/PlayerGame.tsx: restyle (BUILD_BRIEF PR 6)

Today: Home's "Your game": `Legs` (about line 315), `Leg` (354: SG, the `.ch-ph-bench` You and Tour bar), `Spark` (400). Changes:
- Spark at steady: neutral ink `--ch-ink-600` (5.6:1) instead of `--ch-ink-400` (2.9:1).
- "Improving" / "Slipping" word in the gain / loss tone; "No clear change" stays secondary.
- Bench: a visible track; the Tour tick in dark ink; "You 55%" in its own bar's tone (gain when ahead of Tour, loss when behind, neutral with no Tour), not always `--ch-green-700`; the key goes 11 → 15px.
- No structure change. No leg icons (conflict 20).
- Bug, raised separately and not in this PR: "Improving" can never show with `LEG_TREND = 7` (DATA_MAP §3). Also, three of the four Tour bars never draw because the keys aren't in the standards (DATA_MAP §2). This plan doesn't change either. Both need Nick's call.

### screens/home/PlayerHome.tsx: keep

Today: player Home; renders `PlayerGame part="scoring"` and `part="legs"`. No change.

### styles/stats.css: restructure (phone blocks)

Today: 7666 lines. The phone blocks are at about 2078+, 2471+, 3186+ (`.ch-stm-controls`), 3237+, 3307+, 3374+, 3757+ and 4353+ (team), and `.ch-stm-leg.is-total` at about 2347, 3901 and 4719–4723.
- New block `/* Stats summary and detail (phone) */`, one place, at the end of the phone section:
  - `.ch-sc` (summary card): surface, radius 16, ring and shadow, padding 20, 24 between cards, title 17/600, meta 15, figure 34/500 tabular (conflict 6)
  - `.ch-sc--feature`
  - `.ch-sc__chev`
  - `.ch-sc:active` press
  - `.ch-glance`, `.ch-minidiv`, `.ch-rails`, `.ch-ticker`, `.ch-ring`
  - `.ch-dhero` (40/500)
  - `.ch-pscreen .ch-gm-p` card (the `Panel` class from detail.tsx)
- `.ch-stm-controls`: sticky, page colour, shade on scroll.
- **Remove** from the phone (desktop selectors untouched):
  - the `.ch-stm-leg.is-total` mint row
  - the ledger section heads on the Stats phone (`.ch-stm-panel__h` and the double rule, plus the `ui/Section` heads the phone page renders)
  - the `.ch-gd__nav` chips' phone rules (no longer rendered)
- Collapse the phone overrides that the old long page needed (the phone `GameDetail` flattening, the Rounds list scroll anchor) once nothing uses them. Each removal has a selector count check in the test below.
- All colours through tokens. No hex in the file except where `tokens.css` already allows it.

### styles/home.css: restyle

Today: Home's player legs about 2091–2215 (`.ch-ph-bench__t` `rgb(28 25 18/.08)`, Tour tick `em`, `.ch-ph-bench__k` 11px tertiary, first span `--ch-green-700`, `.ch-ph-spark` `--ch-ink-400`).
- `.ch-ph-bench__t`: track `--ch-chart-track` (new token, DESIGN_LANGUAGE's adopted #EBE5D8 light, with a dark value).
- `em` tick: `--ch-chart-zero` (new token, #5F5C55 light, with a dark value).
- `__k` at `--ch-type-15`.
- The span tone by `data-tone`.
- `.ch-ph-spark[data-tone='steady']`: `--ch-ink-600`.
- `__word[data-tone]`: gain or loss.

### shell/TopBar.tsx: keep

Today: the sticky bar; on the phone, the green bar with the switcher and bell, and the pushed slot for `PhoneTop`. No change. It goes inert under a `PhoneScreen` as now.

### shell/SectionStrip.tsx: keep

Today: the section switch. Its retap reads `history.state.chPhone` and calls `history.go(-level)`. No change. The new hook writes the same state, so a retap closes an open detail. Test it.

### ui/Segmented.tsx: keep

Today: the well with the green chip on the settle spring. It is used for the tabs and the window as it is. Don't flatten it (DESIGN_LANGUAGE §9; the Roster plan's shared piece 4).

### ui/Section.tsx: keep (not used on the redesigned phone Stats)

Today: the ledger section (a heading on the canvas over a rule; flush body). The phone Stats stops using it. Desktop Stats keeps it. Don't change the component, because other screens use it (BUILD_BRIEF PR 2 moves heads into cards screen by screen).

### ui/Surface.tsx: keep

Today: a paper card with a 16px radius, the ring and shadow, head and footer. `SummaryCard` and the detail panels use the same tokens (`--ch-surface`, ring, shadow) but their own markup, because the summary card is a single button and `Surface`'s head carries actions. Don't change `Surface`.

### Other files touched

- `screens/stats/legs.ts`: keep. It is imported by `detail-route.ts`.
- `screens/stats/links.ts`: keep `legDetailHref` and `teamPlayerHref`. Optionally add `statsDetailHref(id, filter, detail)` for in-app links to a detail (none needed yet).
- `screens/stats/dev-format.ts`: `progressOf` moves in.
- `routes/stats.tsx`: pass `area` only if the legacy alias is taken.
- `styles/tokens.css`: the `--ch-feature-*` set, `--ch-chart-track` and `--ch-chart-zero` (light and dark; neither chart token exists today). `--ch-chart-gain-fill` and `--ch-chart-loss-fill` already exist; see conflict 19.
- `preview/fixtures-stats.ts`: fix the fixture contradictions that would show on the new cards (DATA_MAP §13: drive Left/Right counts, sand 4 of 11 vs 33%, `sgPerRound` vs the rounds' own mean, best-GIR date, `PREVIEW_TEAM_DEMO` leg totals). This is preview only; no data change.

## Where today's content goes (the "nothing removed" checklist)

| Today on phone | After |
|---|---|
| Coach head: avatar, name, class year, rounds, HCP, Message | summary head (coach view), unchanged |
| Share (coach bar action) | unchanged |
| WindowSwitch (all 6 options), StatsFilter | sticky controls |
| NineHint, InlineNotice CH-5201, FilterEmpty | above the cards, unchanged |
| PlayerInsight | What changed card; full in the Scoring detail |
| Scoring avg, FigureGauge, delta | Scoring card and Scoring detail hero |
| SG/round, SgChangeChip | SG card and SG detail hero |
| Scoring trend (`formChange` halves) | What changed fallback (conflict 17) |
| StrokesGained (SgBars and note) | SG detail |
| GameDetail, 5 areas (every panel, ReadsLine, More, Rule/How) | 5 part details (`only`) |
| Trend: score by round | Scoring detail; also the Rounds detail per the mock (conflict 16) |
| Trend: SG by round | SG detail |
| RoundsExtra (bests, compare, BestCardShare) | Rounds detail; compare also in the Scoring detail |
| Rounds list (5 + All N) | Rounds detail, full list |
| Development (focus areas, ProposalAnswer, FocusLoop, goals, set, suggestions, status) | Goals detail, whole; "Add focus area" also on the Development summary for coaches |
| Team: head, controls, TeamInsight | head and sticky controls; TeamInsight in the Team scoring detail |
| Team hero, trend | feature card; Team scoring detail |
| Team RoundFigures (greens, putts, scrambling, coverage note) | Team game card line; "The round" in both team details |
| Team Legs picker | Team game detail rows |
| TeamRank | Players detail |
| Players list (Avg/SG, PlayerPeek) | Players detail |
| Team Putting (5 bands) | Team scoring detail (open call 6) |

## Data checks for the new cards

These are the figures the cards add or move. Rows marked MISSING or DERIVE in DATA_MAP must follow the rule here.

- **SG total:** `w.sgPerRound` (player) and `team.sgMean` (team), never the sum of the leg means. They differ when rounds lack leg splits (conflict 10).
- **Tour:** only where `bench` (player) or the standards hold the key. That leaves fairways, overall scrambling, putts per round, one-putts, three-putts, GIR by distance, GIR from fairway or rough, fringe, inside 10 yds and 0–3 ft with **no Tour line**. In the mock, "Tour 61%", "Tour 58%" (scrambling), "Tour 29.0", "Tour 74%", "Tour 49%" and "Tour 3[1]" are dropped. The 5–10 ft Tour value is 62.2, not 56 (DATA_MAP Summary).
- **One source per figure** (DATA_MAP §7):
  - the summary and the detail hero use the same value
  - "Against the N before" comes from `x.compare`, captioned "From round totals"
  - the card never shows a GIR from `GolfStats` while the hero shows one from `comparisons`
- **Putting bands:** the real six bands (0–3, 3–5, 5–10, 10–15, 15–25, 25+). The mock's four (and its "10–20") are not real. The summary rails can show four by dropping the last two only if the card says "Short putts", which is open call 7. Otherwise show all six.
- **One-putts a round:** `onePuttsTotal / holesPlayed × 18` today. DATA_MAP §5 says the denominator is wrong and the correct one isn't loaded. Show it only in the Putting detail with today's formula, unchanged. Don't put it on the summary card.
- **Approach visual:** see conflict 11.
- **Goal rings:** `progressOf(baseline, current, target)`. The mock's `1-(m-75)/6` isn't a rule. Focus areas without a baseline draw an empty ring. "Set by Coach Rivera" ships only if the row holds who set it: `attestingCoach` is the team's coach, not the setter, so don't show it.
- **"Missed short":** `s.approachMissShortPct` alone (DATA_MAP §1).
- **Round days:** no par is loaded on `days`, so there is no "To par" column (conflict 18).
- **Tee distances:** "Other clubs · when driver stays in the bag" mixes in par-3 irons (DATA_MAP §6). Label it "Other tee shots" until the calculator is fixed. Don't use the mock's line.
- **Team sentence:** "gains the most / loses the most" becomes "loses the least" when all are negative (DATA_MAP §9).

## Conflicts

Each needs a decision before or during the PR named. The recommendation is in **bold**.

1. **Large title.** BUILD_BRIEF PR 3, PR 4 and PR 5 put a 34pt large title plus a context line under the green bar. The mock has none on Stats: the cards start under the window switch. **Keep the large title (BUILD_BRIEF wins, and it matches Classes and Roster).** It scrolls away; the window switch sticks.
2. **Section headings on the page.** The mock's `.sech` (22/700, on the page: "Overview", "Your game") breaks law 1 ("text lives on a surface") and duplicates the tabs. **Drop them; the tabs name the group.**
3. **Leg card lead figure.** BUILD_BRIEF PR 4 says the lead figure is strokes gained. The mock leads with the key stat (43%, 57%, 32%, 32.1) plus an SG pill. **Ask Nick.** The plan builds the mock's order, behind one prop (`lead: 'stat' | 'sg'`) so it's a one-line switch.
4. **Push timing and underlay.** The mock pushes in 420ms with the underlay at −28% and shade .14. DESIGN_LANGUAGE says 462ms and −30%. The code uses 462ms and `CH_UNDERLAY_SHIFT = 0.24`. **Use the code as it is (frozen in BUILD_BRIEF PR 3).** Record that DESIGN_LANGUAGE's −30% isn't what ships.
5. **Press scale.** The mock uses .98 and DESIGN_LANGUAGE uses .97. **.97.**
6. **Card sizes.** The mock uses radius 18, padding 14/16 and a gap of 12. DESIGN_LANGUAGE uses 16, 20 and 24, with figures of 40 (hero), 17/600 (row) and 15 (meta). The mock's summary figure is 34, its detail hero 40 and its m4 tiles 24. **DESIGN_LANGUAGE for radius, padding and gaps. Use the mock's 34 for summary figures (it isn't specified), 40 for the hero, and 24 for glance tiles.**
7. **Window options.** The mock shows Last 5 / Last 10 / Season with a paper thumb, and drops Last 20, Qualifiers, Custom and the Filter. **Keep every option and the filter, and keep the green chip (DESIGN_LANGUAGE §9; Nick on Roster).** Removing them would remove features.
8. **Bell on pushed pages.** The mock's `backBar` keeps the bell on the right of a detail. `PhoneBar` has one action slot, and the house pushed bar shows a more button or nothing. **No bell on detail pages (the bar is frozen).** The detail is one tap from the summary, which has it.
9. **Back label for a coach.** Today a coach's bar on a player reads "‹ Team" / "Player stats". On a detail it could read "‹ Player stats" or "‹ Jonah". **"‹ Player stats"**, matching the bar title.
10. **SG total.** The mock's total is the sum of the legs (−5.7 = −0.9 −3.4 −0.1 −1.3), for the player and the team. **Use the stored total.** It can differ by a few tenths, so it isn't a rounding issue.
11. **Approach card visual.** The mock draws GIR by distance in 4 bands with a Tour tick. The data has 7 bands and no Tour value by distance. **Use the proximity vs Tour ladder (3 real Tour values), or the 7 bands without a tick.** Merging the bands needs counts per band, which the loader has, but that's a new rule. Ask.
12. **Putt bands.** The mock shows 4 bands (0–3, 3–5, 5–10, 10–20), with a Tour value inside 3 ft. The real data has 6 bands and no Tour inside 3 ft. **Use the real 6.**
13. **Tour values that aren't loaded.** About ten mock figures (see Data checks). **Drop them.** Adding standards is a data task for Nick, out of scope here.
14. **Goals.** The mock's ring progress is invented ("6/10", "3/8"), along with "Set by Coach Rivera", "Bunker work" and "125–150 yds". **Rings only from `progressOf`; no setter line.** The labels come from the rows.
15. **Content the mock leaves out.** Each item has a home under "Where today's content goes":
    - the coach head (identity, HCP, Message)
    - Share
    - the filter
    - the notices
    - SG by round, SgChangeChip, ParTiles
    - many GameDetail panels (GreenMiss, CupMiss, lag, break, distance by club, by lie)
    - More, ReadsLine, BestCardShare
    - the GIR and putts sublines
    - Development's controls
    - TeamInsight
    - the Players list with sort and PlayerPeek
    - team Putting

   **Keep them all.** This needs Nick's sign-off that the details are longer than the mock.
16. **Score by round twice.** The mock puts "Score by round" in both the Scoring detail and the Rounds detail. Test P005-D1 in `stats-parity` asserts "no Score by round on phone" twice. **Show it in Scoring only. The Rounds detail opens with the ticker, full size.** The test then changes to "once".
17. **The change line.** The mock says "4.3 lower than the 10 before" (`x.compare`, the previous N rounds). Today's phone "Scoring trend" uses `formChange` halves of the same window. These are different questions. **Use `x.compare` when there is one (Last N only), else the halves, labelled "than the first half of this window".** Never "the 10 before" for Season.
18. **Team.**
    - (a) The leg picker today re-sorts the players. The mock uses a pin. Recommendation in StatsTeamPhone.
    - (b) Round days "To par": there's no par on `days`, so **show Rounds (n) instead**.
19. **PR 1 tokens.** BUILD_BRIEF lists `--ch-chart-gain-fill` and `--ch-chart-loss-fill` as new. They exist, with 27 uses across six stylesheets. Redefining them changes roster, standing, rounds and Home visibly. **Leave them. Add `--ch-feature-*` for the green card only.** Any change to the shared fills is its own PR with screenshots.
20. **Home spark.** The mock labels the sparks "Last 10" and "Last 11" and adds leg icons. The code draws at most 7 rounds (`LEG_TREND = 7`) and has no icons. BUILD_BRIEF PR 6 is contrast only. **No icons; the label reads the real count.** Raising `LEG_TREND` to 10 (DATA_MAP §3) is a separate call.
21. **DESIGN_LANGUAGE §8 vs §5.** §8 says the large title "moves into the bar"; §5 says "nothing moves into the bar". **§5, which is the Roster plan's rule too.** Fix §8.
22. **One source per figure.** The redesign repeats GIR, putts and scrambling on the card, the hero and "vs before", but the code reads them from three sources (DATA_MAP §7). **The rule in Data checks; the caption on "vs before".**
23. **Desktop `?area=`.** The legacy area links (`mapLegacyStatsTab`) aren't read by Clubhouse on the phone or desktop. **Optional alias on the phone; desktop unchanged.** Say which.
24. **Hash scheme.** The brief allows "reuse `#gm-<section>` or `tab`". This plan reuses `#gm-` for the five parts and adds `#sd-` for three player pages and three team pages. The alternative (`?detail=`) would make Next refetch the route on every push. **Hashes.**

## Desktop

No layout change. Desktop changes:
- `progressOf` moves to `dev-format.ts`; it's an import change only.
- "Missed short" fix in `OverviewZones` and `GameDetail` (DATA_MAP §1). The figure changes where corner misses exist; note it in the PR.
- `--ch-feature-*` tokens are added but not used on desktop.
- `StatsPlayer`'s hash effects ignore `#sd-*`. A desktop user opening a phone-shared `#sd-rounds` link lands on the Overview tab. Map `#sd-rounds` → the `rounds` tab and `#sd-goals` → `dev` in the same effect (two lines), so the link still means something.
- `LegBars`, `StatsTeam` and the `legDetailHref` grid are unchanged.

## Tests

### Update

- `clubhouse/__tests__/stats-parity`:
  - "phone More": the More panels now render inside the part detail, open. Assert they are reachable from the detail.
  - "Rounds on the phone": titles move to the Rounds detail.
  - P005-D1 becomes "Score by round once" (conflict 16).
- `stats-player`, `stats-team`: the phone render now shows cards, then details. Assert the summary card set per tab and that each detail renders its blocks.
- `stats-phone-crash`: render every detail id for the player and the team with each fixture state (empty, early, failed reads).
- `chips-tabs`: the phone has tabs (Segmented) and no `.ch-gd__nav` chips.
- `large-title`: Stats phone keeps the large title (conflict 1). (fixed 4 Nov: Override 3 reversed this; the test asserts Stats phone has no large title, as 08 criterion 1 says.)
- `stats-visuals-sg`: the mini diverging bars and the detail bars come from the same `sgLegBars` rows; the total is `sgPerRound`.
- `stats-visuals-trend`: the feature tone; drag to read still pins on the summary card without opening the detail.
- `stats-goals`: the rings use `progressOf`; there is no ring without a baseline.
- `stats-bestcard`: still in the Rounds detail.
- `stats-filter-ui`, `WindowSwitch`: every option is still present; the controls are sticky (class check).
- `game-detail-hash`: add `only` (no nav chips, no hash listener); desktop unchanged.
- `charts-gauge` (StatsTeamPhone): the team putting moved to the Team scoring detail.
- `TeamRank`: the summary sentence wording when all are below zero.
- `player-home`, `player-home-phone`, `home-phone-figs-css`, `contrast-tokens`: the PR 6 colours (steady spark, track, tick, key size, "You" tone, "Improving" tone).
- CSS rule tests that will see new selectors:
  - `radii-hairlines`, `page-spacing`, `tabular-nums`, `phone-type-floor-css`, `target-size-css`, `pressed-sweep`, `tone-vocabulary`, `dark-ink-guard`, `hairlines`, `spacing-scale`, `legacy-type-roles`, `look-feel-pass-css`, `audit-a11y-motion`, `elevation-tokens`
  - run them all; expect allow-list updates for `.ch-sc*` and `.ch-dhero` only
- e2e `clubhouse-route-shots` (P004 team-stats, P005 player-stats, my-stats): new baseline shots for each summary tab and each detail, at 390 and 430, light and dark. `clubhouse-phone-audit`: the details are included.

### Keep as they are

- `game-detail-floors`, `game-detail-reads`, `PuttBands`, `focus-loop`, `overview-topar`, `honest-deltas`, `chart-labels`, `round-trend`, `legs-keys`, `grid-peek`, `FilterEmpty`, `player-stage-tone`, `figure-gauge-tone`
- `stats-geometry`, `strokes-gained`, `phone-desktop-words` (add any new terms to TERMS), `stats-busy-delay`, `avatar-sizes`, `empty-honest`, `stats-visuals-mix`, `stats-total-only-ui`
- `lib/__tests__/motion-glide`, `glossary`, `ui/__tests__/NoData`, chart tests

### New

- `detail-route.test.ts`:
  - `hashOf`/`detailFromHash` round-trip for all 11 ids
  - `arrivalDetail` for every row of the inbound links table, including a hash beating `tab`, `tab=overview` giving null, and unknown hashes giving null
  - `summaryUrl` keeps `player`, `window` and the filter, and drops `tab` and the hash
  - `tabOfDetail`
- `use-stats-detail.test.tsx` (jsdom):
  - open pushes one entry with `{chPhone:1}` and the hash
  - Back (`history.back` + popstate) closes it
  - SectionStrip's `go(-1)` closes it
  - arrival does replace then push, so one Back reaches the summary
  - opening a second part from the SG detail doesn't stack (open call 4)
- `stats-summary-cards.test.tsx`:
  - every summary card on every tab opens its detail
  - Back returns to the same tab
  - a drag on the feature chart doesn't open the detail
  - the keyboard: Enter on the card opens it
  - the Open button is reachable when the chart has the focus
- `stats-summary-figures.test.ts`: for the fixtures, each summary figure equals its detail hero (one source per figure); the SG total is `sgPerRound`, not the sum of legs; no Tour text renders for a key missing from `bench`.
- `stats-deep-links.e2e`:
  - for each inbound link in the table, the right detail is shown with no slide, and Back lands on the summary of the right tab
  - the summary scroll is restored after a detail pops
  - no RSC request on open or Back
- `goal-ring.test.tsx`: `progressOf` limits (0, 1, past target, no baseline).
- `mini-rails.test.tsx`: the Tour tick draws only with a value; early rows are hollow.
- `round-ticker.test.tsx`: lower is taller; the best is green; no amber; one range.

### Verification per PR (BUILD_BRIEF)

- `npm test`, stylelint, lint, and typecheck once
- `/clubhouse-preview/stats` and `/clubhouse-preview/player`, each state, at 390 and 430, light and dark
- Reduce Motion and Animations off
- Text Size at the largest standard size

## PR split

| PR | Contents | Visible change |
|---|---|---|
| **4a. Plumbing** | `detail-route.ts`, `use-stats-detail.ts`, `StatsDetailScreen` + `DetailHero` (unused); `progressOf` moved; `GameDetail` `only`; `RoundLine` `ref`; `RoundTrend`/`TeamTrendChart` `tone`; `SgBars` scale export; the "Missed short" fix; fixture fixes; unit tests for all of it | none (bar the Missed short figure) (fixed 4 Nov: the lane flag `clubhouse_stats_redesign_v1` is added here, off everywhere; the corrected Missed short formula is used only with it on, so the flag-off app renders exactly as main, START_HERE rule 1. See the Completeness pass) |
| **4b. Player phone summary and details** | `SummaryCard`, `GlanceGrid`, `MiniDiverging`, `MiniRails`, `RoundTicker`, `GoalRing`; the `StatsPlayerPhone` restructure; `StatsPlayer` phone props and desktop `#sd-` mapping; the stats.css phone block; `--ch-feature-*` tokens; tests (summary cards, deep links, parity updates, shots) | My stats phone |
| **4c. Detail polish** | panel order per the mock; the by-round reference lines; anchors (What changed → Against); the feature trend drag; chart grow-once | details |
| **4d. Desktop tokens** | only if conflict 19 is decided for a shared fill change; else skip | desktop colours |
| **5. Team phone** | `StatsTeamPhone` restructure, team summary cards and 3 details, the TeamRank wording, team tests and shots | Team stats phone |
| **6. Home contrast** | `PlayerGame` and home.css colour fixes and their tests | Home "Your game" |

- 4a lands first and is safe to ship alone.
- 4b and 5 can run in parallel once 4a is in.
- 6 is independent; coordinate it with the coach Home PR in the Roster plan, so both Homes match.

## Open calls

1. Large title on Stats: keep or drop (conflict 1).
2. Leg card lead figure: SG or the key stat (conflict 3).
3. Approach card visual (conflict 11).
4. From the SG detail, "Open a part" can replace the SG detail (one level; Back → summary) or stack a second level (Back → SG). `PhoneScreen` supports `covered`, but the hook above is one level. **Recommend replace**, using `replaceState` of the hash, because the bar's back says "My stats" either way.
5. Team game leg rows: push Players sorted by that leg (keeps today's picker behaviour), or pin only.
6. Team putting: the Team scoring detail, or a fourth team summary card.
7. Putting summary rails: all six bands, or "Short putts" (the first four).
8. Legacy `?area=` alias on the phone: yes or no (conflict 23).
9. Home `LEG_TREND` 7 → 10, and the Tour keys missing from the standards (DATA_MAP §2 and §3): separate data decisions; not in this plan.

## Acceptance checks per PR

- **Nothing removed:** every row of "Where today's content goes" is reachable on the phone.
- **Deep links:** every inbound link lands on its detail. Back goes to the right summary tab, which is scrolled where it was.
- **Figures:** a summary card and its detail show the same value. No Tour text without a loaded standard. The SG total is the stored total.
- **Contrast:** AA for all text, light and dark, including the feature inks on the green card and the Home fixes (steady spark ≥ 4.5:1).
- **Phone widths:** at 390 and 430 there is no horizontal scroll, and the glance grid and tickers don't clip at the largest Text Size.
- **Motion:** the push is the house push. Reduce Motion fades. Animations off swaps. Charts grow once, never on scroll or tab change.
- **Top bar:** unchanged on the summary and the details. Compare with today's screenshots.
- **Accent borders:** no left accent borders, mint total rows, section headings on the page, or gradients behind text.

## Completeness pass, 4 Nov 2026

What the builder adds, file by file, for the states in 05's Completeness pass. Same ground rules: no new query, table, RPC or write; nothing in shot tracking changes.

### The flag

- `config/feature-flags.yml`: add `clubhouse_stats_redesign_v1` in PR 4a (type release, owner golf/clubhouse, `default: false`, production, preview and development all false; purpose "the phone Stats redesign: summary cards and pushed details for My stats and Team Stats, and player Home's Your game card; flag off renders today's screens"; cleanup "remove once today's phone Stats long scroll is deleted"). Copy `coachhelm_track_record_v1`'s entry shape, then `npm run flags:generate` and `flags:check`. Add a sync helper beside the screens (`isStatsRedesignEnabled()` over `isFlagEnabled`, the track-record helper's pattern).
- The restructures in "File by file" are built so main's phone render survives behind the flag: keep main's phone Stats and Team Stats components as they are (renamed `…Legacy` if the file is restructured in place) and let `StatsPlayer.tsx` and the team route's phone branch pick the redesign only with the flag on. `PlayerGame` takes the PR 6 look only with it on. The desktop `#sd-*` mapping and the corrected Missed short formula also read the flag, so the flag-off app is main exactly (START_HERE rule 1). Delete the legacy copies in the flag's cleanup PR, not before.
- No held migration. Nothing to apply.

### Files

| File | Change | PR |
|---|---|---|
| `screens/stats/use-stats-detail.ts` | On mount, if `history.state?.chPhone === 1` and the hash names a detail, set `detail` only (no `replaceState` and `pushState`), so a Back onto a detail URL doesn't double history (S-STATS.return). Ignore `open()` while a detail is set (double tap). Save the summary's and the detail's scroll to `sessionStorage` (`ch-stats-scroll:` + path and search) when a link leaves the detail; restore on a back-forward arrival only | 4a |
| `screens/stats/StatsDetailScreen.tsx` | A `loading` prop: the pushed bar from the hash plus the detail skeleton (06). Focus to Back after 80ms on a keyboard push; on close, focus to the opener's `[data-go]` | 4a, 4b |
| `screens/stats/StatsPlayerPhone.tsx`, `StatsTeamPhone.tsx` | The summary is `inert` and `aria-hidden` while a detail is open. Filter-empty card (today's `FilterEmpty` inside the none card's shape) when the window or a filter has 0 rounds; first-round card only for the default with 0. `UpdatingNote` moves into the sticky controls; a failed window fetch sets the switch back to the window on screen and shows today's toast. Held arrival target on a failed load, opened when Try again succeeds | 4b, 5 |
| `screens/stats/WindowSwitch.tsx` | Accept a "revert to" value so the chip can spring back (M-STATS-33); scroll the Custom segment into view when it appears | 4b |
| `screens/stats/SummaryCard.tsx` | `data-ch-press-scale=".97"` plus the wash (02 Override 7 fixed); `aria-label` as 06's table | 4b |
| `screens/home/PlayerGame.tsx`, legs block of `PlayerHomePhone.tsx` | One-round spark (end dot only), season-start footnote clause, leg links as `#gm-<part>` with the flag on, Try again reloading only the card | 6 |
| scoring chart (`RoundTrend tone="feature"`) | One round: one dot, no line, not focusable. Focused: `role="slider"` with per-round value text | 4b, 4c |
| `RoundTicker.tsx` | One round: one flat bar, no best | 4b |
| window helper (pure) | Practice rounds out of the default type set if today counts them (03 Completeness pass), through the filter path that exists | 4a |
| preview routes `/clubhouse-preview/player`, `stats`, `home-player` | Render the redesign whatever the flag says (preview only); `&flag=off` renders main's components for the flag-off capture | 4a |
| `preview/fixtures-stats.ts`, Home fixtures | New states: `filterempty`, `updating`, `updating-failed`, `practice`, `denied`, `newseason`; `stats?viewer=player`; `one` for all three screens | 4a, 5, 6 |
| `capture/screens.json`, `capture/capture.mjs` | The new IDs and states (`flagoff`, `w600`, `w820` on every ID, and the ten new IDs) and motion rows M-STATS-28 to 38, M-HOME-02 to 04 are already in both (this pass added them); `capture.mjs` now shoots `w600` and `w820` at those widths | — |
| hooks | `stats-part-row` (each Open a part row on S-STATS.sg), used by M-STATS-37's clip; add it in 4c with `stats-sg-row` | 4c |

### Added by the lead (cross-lane, 4 Nov)
- **Flat hero marker (PR 6, with classes-roster-home PR 10).** When PR 6's flat `--ch-frame` hero renders on player Home, its root (`PlayerHomePhone.tsx`) sets `data-ch-hero-flat`. One line. Classes lane CP-02.3 keys player Home's bar change on this attribute, so a `--ch-frame` bar never sits over a `--ch-green-800` hero whichever lane flag is on. With `clubhouse_stats_redesign_v1` off the attribute is absent and player Home's bar is exactly main.

### Tests

- `stats-flag.test.tsx`: flag off renders main's phone Stats, Team Stats and Home card; no hook of this lane in the DOM; `#sd-sg` ignored.
- `use-stats-detail.test.tsx`: add a Back onto a `{chPhone:1}` entry (no new entries), double `open()`, scroll save and restore on back-forward only.
- `stats-states.test.tsx`: filter-empty vs first-round; updating and rollback; detail-loading (bar from the hash, skeleton, `aria-busy`), failed arrival held and opened by Try again, empty arrival replaced except Goals.
- `stats-access.test.ts`: signed in as a demo player, `?player=<teammate>` and the team route return no teammate id or figure (SHARED-11); wrong-screen hashes give the summary.
- `stats-a11y.test.tsx`: tab order, focus to Back and back to the opener, Escape, accessible names of 06's table, slider value text.
- `stats-press.test.tsx`: cards carry `data-ch-press-scale`; rows and tiles don't.
- e2e: `stats-return.e2e` (round page and player page come back to the detail at its scroll, `history.length` unchanged); `stats-practice.e2e` (CP-125); 600 and 820 shots.

### PR mapping

4a: the flag, the hook changes, the practice default, fixtures. 4b: the summary, details, states and a11y rules above. 4c: the scrub slider and M-STATS-37. 5: the same for Team Stats. 6: the Home rules. Criteria per PR: 08 CP-154.
