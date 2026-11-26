# CoachHelm Team Board: file-by-file build plan

> Reconciled Oct 31 after this file was written: the design page now follows the app where they disagreed (one decimal, Solid, Early and Thin read, the five track record levels, hollow under 5 rounds on file, "This week", no target on a new proposal, the pulse plays twice). The old call 2 (turning the team flags on) is withdrawn because they're already on; the new call 2 is the fifth "Course" tab. `04-FIDELITY-SPEC.md` section 8 has every settled default. Where this file and spec section 8 differ, section 8 wins.

The values (sizes, colours, words, motion, states) come from the design page `coachhelm-team.html` (version 2) and `../DESIGN_LANGUAGE.md`. This file says where they go. Where the page and DESIGN_LANGUAGE disagree on a value, DESIGN_LANGUAGE wins. On a file or a line, this file wins.

Repo `njrini99-code/helmv3`, checked at `main` 75b4956 (Oct 31). The clone is shallow, so git history was not searched. All paths are under `src/clubhouse/` unless they start with `src/`, `config/`, `scripts/`, `docs/`, `e2e/` or `supabase/`. Line numbers are at 75b4956. Find code by name first, because lines drift.

Sources:
- the design page `coachhelm-team.html`, sections `#map`, `#build`, `#lanes`, and its `<script>` (demo data, every tap and every motion)
- `../DESIGN_LANGUAGE.md`, `../BUILD_BRIEF.md`
- the sibling package `../coachhelm-lenses/02-PLAN.md` (lane 2, coach and player view), which this plan shares files with (§13)
- the sibling lanes: `../ask/ASK_REDESIGN.md` (Ask), `../practice-plan/COACHHELM_PRACTICE_PLAN.md` (lane 6)

Hard rules this plan keeps:
- no migration, no new column, no change to what shot tracking collects, no change to what the engine generates
- the green phone bar, the desktop sidebar and the glass top bar don't change
- no thick accent left borders anywhere
- titles sit inside cards, one card style, one green feature card per view
- amber for losses, green for gains, red only under par
- every figure names its window and sample, one tap away at most
- shared springs, each with a Reduce Motion version
- Assign reuses `createFocusAreaFromInsightV2` through `useFocusActions` (a proposal, never an active focus)
- with the new flag off, every CoachHelm address renders exactly what it renders at 75b4956

---

## 0. PR order

Every PR ships as a draft behind a new release flag, `coachhelm_team_board_v1` (§2). The design page's build order (loader, hole, spot, stories, huddle, roster, sheets, motion) is adjusted to the code: the sheets come before the stories, because the desktop story opens in the inspector and the spot card's reads need a sheet to open into.

| PR | Contents | Depends on |
|---|---|---|
| 0a | `drawnLater` option on `getTopInsightsForPlayers`, so only the reads the board draws are counted as shown. Additive, default unchanged. | none |
| 0 | Flag. Team loader and pure shapes (read only, not wired to any route). Fixtures. | 0a (or ships with option A of §3) |
| 1 | Route branch, `TeamBoard` shell (phone and desktop grid), Team / Ask switch, large title and context line, the hole SVG at rest, the five-tab station control. Preview route `coachhelm-team`. | 0 |
| 2 | Spot card: diverging bars, the station's reads, shared pattern or the "needs three players" line. | 1 |
| 3 | Read sheet and player sheet on phone (`ui/Modal`), the desktop inspector (420px). Assign as focus. | 2 |
| 4 | Stories: tiles card and the phone story viewer; the desktop story in the inspector. | 3 |
| 5 | Huddle scatter (dots; trails only where §9.2 lands). | 1 |
| 6 | Roster with finger-prints, Working on rings, track record card. | 3 |
| 7 | Motion: ball flight, station change, bars, sheet and inspector springs, story progress, huddle trails; Reduce Motion and Animations off. | 1 to 6 |

PRs 4, 5 and 6 don't depend on each other. PR 0a is the only one that touches engine-adjacent code (`src/app/golf/actions/insight-delivery.ts`), so it goes alone with a contract test.

Every PR must:
- run `npm run clubhouse:catalog` (CI runs `npm run clubhouse:catalog -- --check`; it writes `src/clubhouse/preview/component-catalog.json`)
- run `npm run clubhouse:css` (`scripts/clubhouse/css-quality.mjs`: no transitions on width, height, margin, padding, top or left; no `transition: all`; outer shadows from `--ch-*` tokens)
- keep `playwright.clubhouse.config.ts` green (testMatch `clubhouse-quality.spec.ts`, `clubhouse-playground.spec.ts`)
- run `npm run flags:check` (PR 0 also runs `npm run flags:generate`)
- add a changelog fragment that `scripts/clubhouse/changelog-gate.mjs` accepts: `docs/clubhouse/pages/P013-coachhelm/changes/<date>-<slug>.md`, plus one in `docs/clubhouse/changes/` for any shared `ui/`, `lib/` or `styles/` file outside the P013 stems

## 0.1 Final decisions (Oct 31, after Nick's picks)

Nick: "I like having 5th tab with course stuff like reads and perf history and the 4 open reads are good", then "Handle any other questions they have". So every call is settled; the ones this lane made are defaults he can flip (spec 8 U, X, Y, Z, AA).

| Call | Decision | Where it lands | Flip |
|---|---|---|---|
| Team view opens on the hole | Yes (default) | PR 1: `TEAM_BOARD_FIRST_VIEW = 'hole'` in `src/lib/coachhelm/v3/team-board/flag.ts` | set `'board'` to open on today's board |
| Course tab | Yes (Nick) | PR 0 loader (course rows, weekly trend, team against Tour), PR 1 (fifth segment of `StationControl`), PR 2 (`team/CourseCard.tsx`, the spot card's course variant), PR 3 (`team/CourseSheet.tsx` in the sheet and inspector), PR 7 (Course motion) | `COURSE_TAB = false` in the same file hides the tab; the reads stay in player sheets |
| Up to 4 reads a player | Yes (Nick) | PR 0a and PR 0 (`limit: NEEDS_MAX + WORKING_MAX`) | one line |
| Text contrast floor 4.9:1 | Default | PR 1 adds `--ch-loss-on-tint` to `styles/coachhelm-team.css` (scoped, not `tokens.css`) | use `--ch-loss` |

**Course tab data (PR 0, still read only, no new query):**
- Weekly trend, season figure, last 4 weeks and courses: the season's countable rounds the board already reads for the hole (§4.3 and spec 8 K), with `course_id` added to that select (fixed 4 Nov wiring: `course_name` and `score_to_par` are already in `ROUND_COLUMNS`, `data/season.ts:54`; only `course_id` is new, one additive column). New pure shape `team-board/course-shape.ts`: `toCourseHistory(rounds, roster, today)` returns `{ season, last4: number | null, weeks: {start, value, n}[], courses: {id, name, rounds, value, last, players: {id, rounds, value}[]}[] }`. Season and course values are round-weighted; a week is the mean of its rounds; `last4` is the last 28 days and is null under `LAST4_MIN_WEEKS = 6` weeks with rounds. Courses group by `course_id`, named by the newest `course_name`. The card's caps live beside it: `COURSE_READS_SHOWN = 3` and `COURSES_SHOWN = 4` before Show more.
- Team against Tour: the standing batch PR 0 already loads (`loadPlayersStandingMap`), metrics `scoring_par_3/4/5`, `penalty_rate_per_round`, `big_number_rate`, `opening_hole_delta`: the mean of each player's `player_value` against `pga_value`. Never the stored `team_avg`. A metric with no rows is drawn as "Not measured yet".
- Course reads: the drawn reads whose `category` maps to no station (`areaOf` null), in the feed's order, after `deliverReads` folding (spec 8 Y). A worst-holes read carries its course in `evidence` (the signature is `<player>:course_worst_holes:<course_id>`); `CourseSheet` lists reads whose course matches.
- Tests: `course-shape.test.ts` with the page's fixture (62 rounds, five courses, eleven weeks): season +6.4, last 4 weeks +6.0, Oak Hollow 33 rounds +5.9, Hilltop 15 rounds +7.5; the early fixture (16 rounds, three weeks) gives `last4: null`.

**Course tab screens:** spec section 4 (Course tab, Course sheet), 5 (states), 6 (hooks `data-ch-team-station="course"`, `data-ch-team-course`, `data-ch-team-more`), 7 (motion), and `05-SCREENS.md` for every value, motion and acceptance check.

---

## 1. Files that must NOT change

| File | Why |
|---|---|
| `shell/phone-chrome.tsx` (`PhoneTop`, `PhoneScreen`), `ui/PhoneBar.tsx`, `shell/TopBar.tsx`, `shell/ClubhouseFrame.tsx` | The green phone bar, the sidebar and the glass top bar stay. The board passes `start` and `title="CoachHelm"` to `PhoneTop` exactly as `CoachBoard.tsx:283` does. |
| `styles/shell.css` bar rules, `styles/tokens.css` | The bars' look. Every value the board needs exists or arrives with BUILD_BRIEF PR 1 (`--ch-card-bg`, `--ch-card-ring`, `--ch-separator`, `--ch-gain`, `--ch-loss`, chart fills, feature inks, `--ch-ease-spring`, `--ch-ease-spring-smooth`). Add no token here. |
| `screens/coachhelm/CoachBoard.tsx` | Stays as the flag-off board, byte for byte. The new board is a new file (§5). Its retirement is a cleanup PR after the flag has served coaches, not in this plan. |
| `data/coachhelm.ts` `loadCoachCoachHelm` body | The flag-off loader. PR 0 only adds `export` and one optional parameter to private helpers (§4.2). |
| `ui/Modal.tsx`, `ui/Segmented.tsx`, `ui/Surface.tsx`, `ui/Avatar.tsx`, `lib/motion.ts`, `lib/reduced-motion.ts`, `lib/dialog-lifetime.ts` | Used as they are. |
| `screens/coachhelm/writes.ts`, `src/app/golf/actions/development.ts` | Assign is `LIVE_COACHHELM_WRITES.assign` → `createFocusAreaFromInsightV2` (`development.ts:1736`), status `proposed`. No new write. |
| `src/lib/coachhelm/v3/team-pattern/pattern.ts`, `monday-brief/*`, `track-record/*`, `standing/refresh*` | Engine code is read, not changed. |
| `supabase/migrations/*` | No new migration. |
| Anything under shot entry or round capture | Display only. |

---

## 2. The flag

Today:
- Flags live in `config/feature-flags.yml` and generate `src/lib/flags/registry.generated.ts` (`npm run flags:generate`).
- Each CoachHelm flag has a one-function module, for example `src/lib/coachhelm/v3/track-record/flag.ts`: `export const TRACK_RECORD_FLAG = 'coachhelm_track_record_v1'; export function isTrackRecordEnabled(): boolean { return isFlagEnabled(TRACK_RECORD_FLAG) }`. `isFlagEnabled` (`src/lib/flags/is-enabled.ts`) is server-only, synchronous and fails closed.
- Evaluation reads the running environment's column (`environment.production / preview / development`) first and falls back to `default` only when the column is missing (`evaluateFlag`, `is-enabled.ts:49`).
- New Clubhouse-era CoachHelm flags are named `coachhelm_<thing>_v1` (`coachhelm_track_record_v1`, `coachhelm_monday_brief_v1`, `coachhelm_course_plan_v1`; lane 2 proposes `coachhelm_player_file_v1`).

Change (PR 0):
- Add `coachhelm_team_board_v1` to `config/feature-flags.yml`, copying the `coachhelm_track_record_v1` entry (1198):
  - `owner: golf/coachhelm`, `type: release`, `status: active`, `default: false`
  - `environment: { production: false, preview: false, development: false }`. All three false, written out, because the column wins over `default`.
  - purpose: the coach's CoachHelm Team view (the hole, the spot card, stories, huddle, roster, working, track record); read only, no new writes; with it off the board renders as today
  - cleanup_plan: remove once the old `CoachBoard` is deleted
- New `src/lib/coachhelm/v3/team-board/flag.ts`: `TEAM_BOARD_FLAG`, `isTeamBoardEnabled()`.
- Turning it on is Nick's call and not part of any PR here.

Read this before planning a rollout: at 75b4956 the three "built, hidden today" flags are not off where coaches are. `coachhelm_team_pattern_v1`, `coachhelm_monday_brief_v1` and `coachhelm_track_record_v1` all have `production: true, preview: true, development: false` (as do `coachhelm_support_v1`, `_recheck_v1`, `_verdicts_v1`, `_corrections_v1`, `_course_plan_v1`). They evaluate off only in local development. Their pieces are hidden today by the board's layout (the brief link, the track record link, patterns under the fold), not by their flags. There is no per-team allowlist per flag; the only team allowlist is `HELM_CLUBHOUSE_TEAMS` for Clubhouse as a whole (`src/clubhouse/gate.ts`). §12 lists this.

Each piece keeps its own flag as well. With the team board on and a piece's flag off, that piece's card is not drawn (never an empty card that says "nothing").

---

## 3. PR 0a: count only what the board draws

Today:
- `topInsights(ids)` (`data/coachhelm.ts:693`) calls `getTopInsightsForPlayers(ids, { limit: 1 })`. That cap is why a coach sees one read per player and has to open a player to see the rest.
- `getTopInsightsForPlayersImpl` (`src/app/golf/actions/insight-delivery.ts:1113`) ranks each player's visible reads, runs `deliverReads` (which, with `coachhelm_reads_v1_copy` on, already holds a player to 3 open reads and 1 strength via `capReadsPerPlayer`), slices to `limit` (clamped 1 to 50), and records every returned row as a `roster_card` exposure (`buildExposureRows`, one `recordInsightExposure` call).
- `getInsightsForPlayer` already has `drawnLater` (the option doc at `insight-delivery.ts:155-160`; fixed 4 Nov wiring: the option itself is line 160), so a surface that shapes rows after the call records only what it draws. `getTopInsightsForPlayers` has no such option.

Change (PR 0a, `src/app/golf/actions/insight-delivery.ts` only):
- Add `drawnLater?: (shown: Map<string, EvidenceInsight[]>) => Promise<readonly string[]>` to the `opts` of `getTopInsightsForPlayers` and its Impl. When present, build the exposure rows from the returned rows whose ids the promise resolves to, in that order; a promise that rejects records nothing. When absent, behaviour is exactly today's.
- No other caller changes.

Two options if PR 0a can't land first:
- A. Ship PR 0 with `limit: 4` and no `drawnLater`. Every returned row is counted as shown, including a note or a measured zero the board then leaves out. Small overcount, on `roster_card` only.
- B. Wait for 0a. Recommended, because CH13-21 ("only what a surface draws is counted as shown") is the rule every other Clubhouse surface follows.

Tests (`src/clubhouse/__tests__/coachhelm-actions-contracts.test.ts`, which already pins delivery contracts):
- without `drawnLater`, the exposure rows equal today's for the same fixture
- with `drawnLater` resolving two of four ids, exactly those two are recorded, in order
- a rejecting `drawnLater` records nothing and the call still answers the rows

---

## 4. PR 0: the team loader (read only)

### 4.1 Where each design piece gets its data

| Design piece | Source at 75b4956 | Status |
|---|---|---|
| Each player's reads, placed on the hole | `getTopInsightsForPlayers` with `limit: 4` (`NEEDS_MAX + WORKING_MAX`, `data/coachhelm-shape.ts:342`), mapped by `toChInsight`, capped by `partitionInsights` | OK with the cap raised |
| Which station a read sits at | the raw `EvidenceInsight.category` through `areaOf` (`data/coachhelm-ladder-shape.ts:99`; fixed 4 Nov wiring: was 94): tee, approach, short_game, putting | OK for four of seven categories. `scoring`, `pressure` and `course_management` have no station (§9.4) |
| Strokes by area per player, team average, hole total | see §4.3. Two sources, neither exactly ChLadder as drawn | DERIVE |
| Rounds per player (hollow under 15) | season rounds, the same rows as §4.3 | DERIVE |
| First 10 rounds (huddle trails) | no stored window anywhere (§9.2) | MISSING, two options |
| Shared pattern at a station | `teamPatternsOf` (`data/coachhelm.ts:669`, `coachhelm_team_pattern_v1`) → `computeTeamPatterns`; `ChTeamPatternRow` drops member ids and the metric | OK once the row carries ids and a station (§4.4) |
| Stories | `ChMondayBrief` rows and counts, `ChBriefWorking`, `ChDiveTheme.trend` | PARTIAL (§9.3) |
| Working on rings | `ChBriefWorking` (`data/coachhelm-coach-brief-shape.ts:80`): words only, no numbers, no player id | DERIVE (§4.4) |
| Track record card | `loadCoachTrackRecord` → `ChTrackRecord` (`data/coachhelm-track-record-shape.ts:76`) | OK, but its levels are not the page's (§12) |
| Not enough yet, hollow reads | `ChNotEnough` (`data/coachhelm-firm.ts:35`) with `coachhelm_support_v1` | OK |
| Cause, ladder, verdict on a read | `ChReadEngine` on `ChInsight.engine` | OK, each part behind its flag as today |
| Read sheet ladder: you, team, Tour | you: `ChInsight.current` / `value`; Tour: `evidence.gauge.cmp` or the team Tour's `values`; team: only from a team pool (`teamPoolLine`, `coachhelm_team_pool_v1`) | PARTIAL (§9.5) |
| "Worth .60 a round" on a read | `strokesAtStake` (`data/coachhelm-strokes.ts`): one decimal, null on about half of live reads | PARTIAL (§9.6) |

### 4.2 Changes to `data/coachhelm.ts` (additive, flag-off path untouched)

- `topInsights(ids, opts?: { limit?: number; drawnLater?: … })`: default `{ limit: 1 }`, so `loadCoachCoachHelm` (line 536; fixed 4 Nov wiring: was 538) still calls it with one read and the existing assertions (`__tests__/coachhelm.test.tsx:1737` and `:1977`, `{ limit: 1 }`) keep passing. Export it.
- Export `teamPatternsOf` (669) and `pulseLater` (736; fixed 4 Nov wiring: was 735).
- Export `tourBaselineOf` (274), so the team loader reads the team's name and gender in one `golf_teams` read and grades against the same Tour.

### 4.3 Strokes by area: which source

The page says "ChLadder per roster player, averaged, one team query". The code says:
- `ChLadder` is a display shape: `strokes` is a pre-formatted string at one decimal ("−0.9", `toChLadder` at `coachhelm-ladder-shape.ts:129`), its `missing` text is in the player's voice, and it has no round count.
- Its rows come from `golf_player_standing_season` when that table exists and `golf_player_standing` (lifetime) otherwise (`data/coachhelm-standing.ts:157`). The season table's migration (`20261024151000`) is held, awaiting owner apply. There is a batched lifetime loader (`loadPlayersStandingMap`, `src/lib/coachhelm/v3/standing/loader.ts:278`, already used by the Brief) but no batched season loader.
- Team Stats already computes each player's four legs for this season from round rows in one team query: `loadSeasonRounds` (`data/season.ts:108`) with `sgLegs` (`data/stats-team.ts:180`), `weightedMean` and `effectiveCount` (`data/stats-weight.ts`), floored at `MIN_SG_ROUNDS` (3).

Build (default): the Team Stats source. One `loadSeasonRounds(supabase, ids, { surface: 'coachhelm.team', since: seasonStartDate(now, zone) })`, then per player and per leg the same filter and mean Team Stats uses for its player legs (`stats-team.ts` around 470 to 476). It gives the four figures, the season round count (hollow coins), and the round dates the first-10 window needs (§9.2), from one read, and the numbers match the Team Stats page for the same player. New pure `toChTeamLegs` lives in `data/coachhelm-team-shape.ts` and returns numbers, not strings.

Other option (B): add `loadPlayersSeasonStandingMap(ids)` beside `loadPlayersStandingMap` in `standing/loader.ts` and build from `player_value − pga_value` as `toChLadder` does, falling back to lifetime with an "All time" label while the season table is held. It matches Standing, not Team Stats, and has no first-10 window. Nick picks; the default keeps one number per figure across Stats and CoachHelm, which the Stats package's data rules ask for.

Either way:
- The hole's headline total is the team mean of the stored per-round total (`sgPerRound` rule in BUILD_BRIEF "Data rules"), not the sum of the four leg means as the page's script computes it (`TOTAL=AREAS.reduce(...)`). They differ when a round has a total but not every leg.
- SG is stored against the team's chosen baseline (`supabase/migrations/20260607200000_per_team_sg_baseline.sql`: a coach setting, default PGA Tour for men and the women's scale for women). The label says "to Tour" only when the team's baseline is the Tour; otherwise it names the baseline.
- Print strokes at one decimal, as `toChLadder` and Standing do (A20). The page prints two (−1.08). §12.

### 4.4 Additive shape fields (no behaviour change for today's readers)

- `ChInsight.area?: ChLadderAreaId | null` (`data/coachhelm-shape.ts:97`), set in `toChInsight` (`data/coachhelm-map.ts:272`; fixed 4 Nov wiring: was 299) from `areaOf(ins.category)`. Today `ChInsight.category` is the display word ("Putting"), so the raw key is needed.
- `ChTeamPatternRow.memberIds: string[]` and `ChTeamPatternRow.area: ChLadderAreaId | null` (`data/coachhelm-team-pattern.ts`), from `TeamPattern.member_reads[].player_id` and the area of the members' reads (the most common `areaOf` across `member_reads[].insight_id`). `TeamPatterns.tsx` ignores both.
- `ChBriefWorking.playerId: string` and `ChBriefWorking.progress: { from: number; now: number; target: number } | null` (`data/coachhelm-coach-brief-shape.ts:80`), filled in `workingOf` (line 189; fixed 4 Nov wiring: was "around line 60") from `BriefFocusRow.baseline_value`, `current_value`, `target_value`; null when any is missing. The ring draws `(now − from) / (target − from)`, clamped 0 to 1.

### 4.5 New files

`src/lib/coachhelm/v3/team-board/flag.ts` (§2).

`data/coachhelm-team.ts` (`server-only`):
- `loadCoachTeamBoard({ coachId, teamId, now? }): Promise<ChTeamBoardData>`
- Order, copying `loadCoachCoachHelm` (501 to 632) step by step: `loadCoachHelmGate` → off and failed exactly as today; `pulseLater()` and the Tour start beside the roster; roster and names; then `loadVisible` and `topInsights(ids, { limit: 4, drawnLater })` together; then `newestRounds`, `drillTextByInsight`, `assignedByInsight`, `declinedByInsight`, `readFocusVerdicts`, `readCorrections` and `teamPatternsOf`, now over every drawn read, not only the heads.
- Per player: `toChInsight` for each returned row, then `partitionInsights` (3 needs work, 1 working, the feed's own order). `drawnLater` resolves to exactly those ids.
- Beside the cards, each started early, marked `handled`, and handed to the board still on its way (the pulse pattern, `isPulseLater` in `CoachBoard.tsx:325`), so the hole never waits on them:
  - `legs`: §4.3
  - `brief`: `loadCoachBrief({ coachId, teamId, now })` when `isMondayBriefEnabled()`, else absent
  - `record`: `loadCoachTrackRecord(...)` when `isTrackRecordEnabled()`, else absent
  - `themes`: `readThemes(id, 'coach')` (`data/coachhelm-dive.ts:77`; fixed 4 Nov wiring: was 76) per roster player, at most 4 at a time, only for players with an Improving or Slipping candidate; absent with the board's stories off
- Failure is per part: a part that fails carries `{ status: 'failed' }` and its card says so with its own Try again; it never reads as "nothing".

`data/coachhelm-team-shape.ts` (pure, client-safe):

```ts
export type ChStation = ChLadderAreaId; // 'tee' | 'approach' | 'short_game' | 'putting'
export interface ChTeamLeg { strokes: number | null; rounds: number; missing: string | null }
export interface ChTeamPlayer {
  id: string; name: string; first: string; classYear: string | null;
  rounds: number;                       // countable rounds this season
  early: boolean;                       // rounds < TEAM_EARLY_ROUNDS (15)
  legs: Record<ChStation, ChTeamLeg>;
  total: number | null;                 // stored per-round total, season mean
  worst: ChStation | null;              // most negative leg; null when none loses
  first10: Record<ChStation, number | null> | null; // §9.2; null when not built
  reads: { needs: ChInsight[]; working: ChInsight[] };
  heldBack: number;                     // Not enough yet, from ChNotEnough
}
export interface ChTeamBoardData {
  off: ChCoachHelmData['off'];
  team: { name: string; tour: ChTourBaseline | null; baselineLabel: string };
  roster: { count: number; error: boolean };
  players: { list: ChTeamPlayer[]; error: boolean };
  stations: Record<ChStation, { team: number | null; n: number }>;
  teamTotal: { strokes: number | null; rounds: number };
  patterns?: ChTeamPatterns;            // flag-gated, as today
  notEnough?: ChNotEnough;
  missing?: ChBoardMissing;
  pulse: ChPulse | Promise<ChPulseResult>;
  brief?: ChTeamPart<ChCoachBrief>;     // promise or value, like pulse
  record?: ChTeamPart<ChTrackRecord>;
  themes?: ChTeamPart<Record<string, Record<string, ChDiveTheme>>>;
}
```

Pure helpers in the same file: `toChTeamLegs(rounds, players)`, `stationOrder(stations)` (biggest loss first, for "biggest leak / second biggest / third / smallest"), `readsAt(players, station)` (findings only; current first, then out of date; within each the feed's order), `patternAt(patterns, station)` (rows with `area === station` and `memberIds.length >= TEAM_PATTERN_MIN_MEMBERS`), `huddlePoint(player)` (`{ x: tee + approach, y: short_game + putting }`, null when any leg is missing), `storiesOf(brief, working, themes)` (§9.3), `TEAM_EARLY_ROUNDS = 15`.

Add both data files to `config/clubhouse/pages/P013-coachhelm.json` `implementation.also`.

Fixtures (new `preview/fixtures-coachhelm-team.ts`): the page's five players, built on `HELM_PLAYERS` (`preview/fixtures-coachhelm.ts:56`: Jonah, Eli, Priya, Theo) plus `sam: { id: 'pl-sam', name: 'Sam Whitfield' }`, the page's leg values, its ten reads made with the existing insight builders, one pattern at approach with three members, two working rows, a track record from `fixtures-coachhelm-track.ts`.

Tests (`src/clubhouse/data/__tests__/coachhelm-team.test.ts`, mocking as `__tests__/coachhelm.test.tsx` does):
- `getTopInsightsForPlayers` is called once, with the roster's ids and `limit: 4`
- `drawnLater` resolves to exactly the reads the board draws (no note, no measured zero, at most 3 + 1 per player)
- gate off and failed give the same shapes as `loadCoachCoachHelm`
- each part (legs, brief, record, themes) failing leaves the rest drawn and marks only that part failed
- with `coachhelm_team_pattern_v1`, `_monday_brief_v1` or `_track_record_v1` off, that part is absent, not empty
- `toChTeamLegs`: under `MIN_SG_ROUNDS` a leg is null with a reason; the total is the stored total's mean, not the leg sum; the early flag flips at 15
- `readsAt` keeps the feed's order and never lists a strength
- `ChInsight.area` is null for scoring, pressure and course management
- `loadCoachCoachHelm` still passes `{ limit: 1 }` (existing tests unchanged)

Done when: the loader and shapes are merged with no route calling them; `npm test`, `flags:check` and typecheck pass; flag off changes nothing anywhere.

---

## 5. PR 1: route, shell, the hole at rest

### 5.1 Route (`routes/coachhelm.tsx`, 235 lines)

Today `CoachHelmView` (60) renders `<CoachBoard data={await loadCoachCoachHelm(...)} initialPlayer=… trackRecordHref=… briefHref=… />` when `!ask`.

Change:
- In `CoachHelmView`, before line 61: `if (!ask && isTeamBoardEnabled()) return <TeamBoard data={await loadCoachTeamBoard({ coachId, teamId })} initialPlayer={initialPlayer} />;`
- Add `import '../styles/coachhelm-team.css'` after line 41, and the same import in `src/app/clubhouse-preview/[screen]/page.tsx` (after 158).
- The Suspense fallback at 219 becomes `<TeamBoardSkeleton />` when the flag is on (same file, one ternary).
- `?player=X` keeps working: it opens that player's sheet (phone) or inspector (desktop) once. The Monday brief rows link `/golf/dashboard/coachhelm?player=…` (`coachhelm-monday-brief-shape.ts`), Roster links too.
- The Team / Ask switch: `CoachHelmTabs` (`screens/coachhelm/chat/SubTabs.tsx`) gets `boardLabel?: 'Board' | 'Team'` (default `'Board'`). The route passes `'Team'` to both `TeamBoard` and `Ask` when the flag is on, so the switch reads the same on both views. The value stays `'board'` and `COACHHELM_HREF` doesn't change.

### 5.2 Screens (new folder `screens/coachhelm/team/`)

| Component | File | Props | Notes |
|---|---|---|---|
| `TeamBoard` | `team/TeamBoard.tsx` (`'use client'`) | `{ data: ChTeamBoardData; writes?: ChCoachHelmWrites; initialPlayer?: string; links?: ChTeamLinks }` | owns `station` state, the open sheet or inspector, `useFocusActions(writes)` |
| `TeamHole` | `team/TeamHole.tsx` | `{ stations; players; station; onStation; orientation: 'v' | 'h'; intro: boolean }` | one SVG; phone vertical (330×400), desktop horizontal (760×268) |
| `hole-geometry` | `team/hole-geometry.ts` | none | the page's `HOLE.v` and `HOLE.h` tables copied as typed constants (path, fairway width, green, fringe, tee, bunkers, flag, station and label points, coin slots) |
| `StationControl` | `team/StationControl.tsx` | `{ value; onChange; stations }` | `Segmented` with five options (four spots, then Course after a hairline); each spot label is the short name and the team figure |
| `TeamBoardSkeleton` | `team/TeamBoardSkeleton.tsx` | none | final shape and height, as `CoachHelmSkeleton` does |

`TeamBoard` on phone, top to bottom:
1. `PhoneTop start title="CoachHelm"` (unchanged bar), `CoachHelmTabs boardLabel="Team"`
2. `LargeTitle` with the team name ("Varsity"), context line "5 players · 73 rounds this season · 10 open reads" (players on the roster, countable rounds this season, reads drawn on the board, never `ChCoachPlayer.count` rows)
3. Stories card (PR 4)
4. The feature card: kicker "Where {team} gives back strokes", the total (40/1 figure) with "a round to Tour · This season · N rounds", `TeamHole`, `StationControl`, note "Players stand where they lose most. Hollow: fewer than 5 rounds."
5. Spot card (PR 2), Huddle (PR 5), Roster, Working on, Track record (PR 6)

Desktop (`!useChPhone()`): sidebar and glass bar unchanged; the switch in the head's `aside` as `CoachBoard` does (288). A grid `.ch-htb-grid { grid-template-columns: minmax(0,1fr) clamp(320px, 30%, 440px); align-items: stretch }`; left column hero then spot card, right rail stories, working, huddle; then roster (left) and record (right). The last card in each column takes `flex: 1` so both columns end level at 1280, 1440 and 1728.

The hole at rest (no motion in PR 1):
- fairway and mowing stripe as two strokes of one path, fringe and green ellipses, bunkers, tee box, pin and flag
- a station per area: halo radius `10 + |team| × 22`, core dot, label and figure. A station with no team figure is drawn without halo and labelled "Not measured"
- coins: each player at their `worst` station, filled with the avatar tone; hollow (dashed ring, no fill) when `early`
- `role="img"` with an `aria-label` that reads all four figures, and each station a `role="button"` with `tabIndex=0`, Enter and Space, `aria-pressed`

Coins don't fit as drawn: the page has 1 to 3 fixed slots per station for five players. A real roster is 9 to 15. Build: up to three coins per station in the drawn slots, then a "+N" coin in the third slot that opens the spot card's bars. §9.7.

Preview (new): `preview/PreviewCoachHelmTeam.tsx` with mock writes (copy `PreviewCoachHelm.tsx`'s `failwrites` and `duplicate`), registered as `'coachhelm-team'` next to `'coachhelm'` (521) and documented in the list at 192 to 205 (§11).

Tests (`src/clubhouse/__tests__/coachhelm-team.test.tsx`):
- flag off: `ClubhouseCoachHelmRoute()` renders `CoachBoard` and calls `loadCoachCoachHelm`; flag on: `TeamBoard` and `loadCoachTeamBoard`
- `?player=pl-eli` opens Eli's sheet once
- the switch reads "Team" on the board and on Ask with the flag on, "Board" with it off
- exactly one `.ch-htb-feat` renders; no element has a left border wider than 1px
- each station is reachable by keyboard and its label states the figure and "a round"
- a player with fewer than 5 rounds on file has a hollow coin; the fourth player at a station draws "+N"

Done when: `/clubhouse-preview/coachhelm-team` renders the shell and hole on 390, 430 and 1280 with no horizontal scroll, and the green bar matches the Stats screenshot.

---

## 6. PR 2: the spot card

New `team/SpotCard.tsx`: `{ station; players; reads: ChInsight[]; pattern: ChTeamPatternRow | null; patternsOn: boolean; onRead(id); onPlayer(id); onPractice?: (row) => void }`.

- Header (inside the card): area name, meta "−0.79 a round · biggest leak" from `stationOrder`.
- Bars: every player with a figure at this station, worst first. Diverging from a zero axis at 84% of the track (the page's `ZP`), loss to the left in the loss fill, gain to the right in the gain fill, figure in its own tone. The team average is a dashed tick. An early player's bar is hatched (the page's 45° hatch of the loss fill), never a tint. A player with no figure is a row that says why (the leg's `missing`). Axis caption "Team average dashed · Tour" inside the card.
- Reads: "What CoachHelm sees here · N open reads", then `readsAt(station)` as rows: avatar, "{first}: {title}", chips for strokes (only when `strokesAtStake` gives one), rounds, and the confidence word; chevron. A tap calls `onRead`.
- Pattern: `patternAt(station)` draws member coins, the row's `title`, `members` line and an "Add to practice" button. With patterns on and no row, the line "No shared pattern here yet. CoachHelm needs three players with the same step before it calls one." With `coachhelm_team_pattern_v1` off, nothing (never that line, which would be untrue).
- "Add to practice" is drawn only when lane 6 exports its entry (`practicePlanHref({ step, playerIds })`); at 75b4956 there is no Clubhouse practice route under `src/app/golf/(dashboard)/dashboard/`, so the button is not drawn (`rebuiltHref`'s rule: never a dead button). §13.
- Desktop: bars and reads side by side (`.ch-htb-spl` two columns with a hairline between), pattern pinned to the bottom of the reads column.

Tests:
- bars are sorted worst first; the dashed tick sits at the team mean; early rows carry `data-early`
- reads at a station are only that station's findings, in the feed's order; strengths never appear
- the strokes chip is absent on a read with no estimate (no "0.0")
- pattern line states: pattern row, no row with flag on, flag off (nothing)
- the bar fill uses `transform: scaleX()` from the axis, never a width (a CSS text test like the existing quality ones)

---

## 7. PR 3: sheets and the desktop inspector

Phone uses `ui/Modal` (the bottom sheet with grabber, drag to close, focus trap, Reduce Motion fade), not a new sheet. There is no `ui/Sheet` at 75b4956; the page's `#build` names one, and `Modal` is that component here.

Desktop uses a new non-modal panel, `team/Inspector.tsx`: an `aside` 420px wide, absolutely placed under the glass bar at the right of the board, `transform: translateX(102%)` closed and `none` open (462ms `--ch-ease-spring-smooth` in, 280ms `--ch-ease` out), Esc closes, focus moves to its heading on open and back to the opener on close (`chFocusQuietly`, as `lib/dialog-lifetime.ts` does). `useDialogLifetime` has only `bottom`, `left` and `center` directions, so the panel is its own component rather than a dialog. The calendar's persistent `aside.ch-in-wrap` (`screens/calendar/Calendar.tsx:1292`) is the nearest pattern.

`team/ReadPanel.tsx` (`{ read: ChInsight; player; fa; target: ChFocusTarget; links }`), the same content in both containers:
- head: avatar, name, "{area} · N rounds this season", close
- title, lede, chips: strokes (when known), confidence word, cause word (`engine.cause.word`, when its flag and field are there), window
- comparison card titled with `evidence.label` and "Higher is better" or "Lower is better": rows for {first}, Team and Tour drawn as bars from zero, each with its value. Team only when the read carries a team pool; otherwise the row says "Team: not measured for this read" (§9.5).
- drill card: `week.title` and `week.meta`, or "Still gathering" with the count-down from `ChNotEnough` when the read is held back
- actions: `FocusActions` as `CoachBoard.tsx:242` uses it (same `useFocusActions`, same `ChFocusTarget`), so Assign creates the same proposal, says "Proposed to {first}", and the duplicate and failure states are today's. "Ask about this" (§13). "Open the full read": `coachReadHref(playerId, insightId, roster)` today; the read lane's page once it lands.

`team/PlayerPanel.tsx` (`{ player: ChTeamPlayer; stations; onRead }`): head with class year, rounds, total and "early"; "Where {first} gains and loses · This season" with four bars (same component as the spot card's rows); "Open reads" (needs then working); "Open {first}'s page" (`coachPlayerHref('deep-dive', id)` today, lane 2's `playerFileHref` once exported).

Tests:
- phone opens `Modal` and desktop opens `Inspector` for the same tap
- Assign calls `writes.assign` with the exact args `FocusActions` sends on the old board (spy), then the panel reads "Proposed to {first}"
- duplicate and failwrites states show today's messages
- Esc closes the inspector and focus returns to the row
- "Ask about this" and "Add to practice" are absent while their lanes export no href

---

## 8. PR 4: stories

`team/StoriesCard.tsx` and `team/StoryViewer.tsx`.

What the stories are built from (§9.3 says what can't be):
- a new read: a `ChBriefRow` with `kind: 'read'` (who, title, strokes); picture: that read's comparison bars
- a focus moving: a `ChBriefWorking` with `progress`; picture: from, now and the target tick
- a trend: a `ChDiveTheme` whose `trend.word` is Improving or Slipping (never "No clear change"); picture: the season figure for that area beside the team's; the first-10 bar only if §9.2 option B lands
- newest first, at most three; each tile ringed until opened (kept in `useChSessionState`, never the address)

The card's header: the page says "Since Thursday". Nothing stores the coach's last visit; the brief is weekly. Build "This week" with the brief's `week` ("Week of Oct 27") and `counts` as the meta. §12.

Phone viewer: full screen over the board on the feature green, progress bars, 5.2s per story then the next, tap or Next to advance, close returns focus to the tile. It must be pausable (WCAG 2.2.2): pressing and holding pauses, and so does keyboard focus inside it. Under Reduce Motion or Animations off it does not advance by itself. The story's action opens the read panel (`go`) or scrolls to Working on.

Desktop: the tile opens the story in the inspector (no auto-advance), with its picture on a green block, the source line and the action.

A failed brief or themes part says so in the card ("This week's brief didn't load") with Try again; never "nothing new". With `coachhelm_monday_brief_v1` off the card is not drawn.

Tests: tiles come from the three sources; "No clear change" never makes a story; the viewer advances at 5200ms with fake timers, pauses on hold, doesn't advance under reduce; the ring clears once seen.

---

## 9. Can't build as drawn, and pieces with no data source

None of these needs a migration. Each has two options and a default.

### 9.1 "ChLadder per roster player, one team query"
See §4.3. Default A (season rounds, Team Stats' maths); B (a batched season standing loader, lifetime fallback while the season table is held).

### 9.2 Huddle trails from the first 10 rounds: no stored source
No table or loader holds a first-10-rounds window. `golf_player_standing` mixes lifetime and 90-day windows, `golf_player_standing_season` is this season only (and held), Team Stats has season windows.
- A (default): drop the trails, keep the dots, and remove "Line: from their first 10 rounds to now" from the legend. The page's own `#map` allows this.
- B: with §9.1 A, take each player's first 10 counted season rounds from the same rows and average each leg the same way. Ship only with a parity test showing the same maths over all season rounds equals the season figure, and only for players with at least 20 rounds (else a trail is mostly the same rounds as the dot).

### 9.3 Stories that have no structured source
- The round story ("Two doubles from penalties at Hilltop", the 18-hole strip): the program pulse items are team-level text (`PulseItem` has no player or round id, `src/lib/coachhelm/v3/chat/program-pulse.ts:39`), and no loaded shape ties a round's holes to a read. A (default): no round story. B: for a brief read row whose player's newest round is inside the brief's week, read that round's `golf_holes` scores (one read, display only) and draw the strip; the link to the read is the row's own, never inferred from the holes.
- "Since Thursday": see §8.

### 9.4 Reads with no station
`scoring`, `pressure` and `course_management` reads have no area (`areaOf` returns null). **Decided: B, extended.** Nick, Oct 31: "I like having 5th tab with course stuff like reads and perf history". A fifth tab, Course, under the hole, as the Deep dive's `DIVE_AREAS` files them ("Course and scoring", `coachhelm-dive-shape.ts:111`). It holds those reads plus the scoring history (section 0.1). They also stay in each player's sheet. The page's penalty read now sits in Course.

### 9.5 The read sheet's Team row
A read carries a team comparison only when it has a team pool (`coachhelm_team_pool_v1`). A (default): draw {first} and Tour, and "Team: not measured for this read". B: use `golf_player_standing.team_avg` when the read's metric is a standing metric and `team_n >= 5` (the Standing cold-start floor).

### 9.6 "Worth .60 a round" and "ranked by strokes"
`strokesAtStake` prints one decimal and is null on about half of live reads. The board's doctrine is the feed's own order, never re-ranked (`partitionInsights`). A (default): keep the feed's order and show the chip only when an estimate exists. B: sort by the estimate with unestimated reads last; this changes what leads, so it's Nick's call.

### 9.7 Coins
See §5.2. A (default): three slots then "+N". B: lay coins out on an arc around the station, sized to fit, with no cap.

### 9.8 Station "pulse" loop and the ball-flight intro
DESIGN_LANGUAGE §10 bans entrance staggers on page load; the ball lands each station in turn on open, and the selected station pulses forever (2.4s loop). A (default): treat the flight as the hole's chart reveal (§8 "Chart marks: once, when first scrolled into view"): once per session, skipped under Reduce Motion and Animations off; no infinite pulse, a still ring instead. B: as drawn, flagged as an exception in the PR.

### 9.9 Bars that grow in width
The page transitions `width`, `left` and `right` (`.br .bf`, 520ms). `css-quality` blocks those. Build: fixed-width bars scaled with `scaleX` from the zero axis; a station change animates `scaleX` old to new on the same element.

---

## 10. PR 5, PR 6 and PR 7

### 10.1 PR 5: Huddle (`team/Huddle.tsx`)
- SVG 320×256 (page values: left 36, right 12, top 16, bottom 36, range −1.8 to 0.2), axes, Tour lines at 0, team average dashed, quadrant words inside the plot, axis captions, a 26pt coin per player at `huddlePoint`; hollow when early.
- A player without all four legs isn't plotted and the card's note names them ("Not plotted: Sam, no putting figure yet").
- The range widens to fit the data in steps of 0.5, so no coin is clipped.
- Each coin is a button that opens the player panel.
- Trails only with §9.2 B.
- Tests: no point outside the plot; not-plotted note; keyboard order follows the roster order.

### 10.2 PR 6: Roster, Working on, Track record
- `team/RosterCard.tsx`: one grouped list, worst total first. Row: avatar, name, "{year} · N rounds · early", four-bar finger-print (tee, approach, short game, putting; zero line, loss down in loss fill, gain up in gain fill), total and "N open". Desktop adds "Loses most: {area}" chip and the bar letters. Tap opens the player panel. Players with no reads yet and held-back players are rows too (CH-13310 and CH-13943 wording from `CoachBoard.tsx:204` to 230).
- `team/WorkingCard.tsx`: rows from `ChBriefWorking`, ring from `progress`, words from `word` and `since`, verdict word and tone from `ChEngineVerdict` when the focus's source read is on the board and `coachhelm_verdicts_v1` is on. A proposal made in this visit appears as "Proposed · {first} accepts it in their app" (from `fa.assigned`). Not drawn with the brief off.
- `team/RecordCard.tsx`: the program line as the lead ("28 of 40 reads held up when re-checked" comes from `ChTrackRecord.program`, whatever its words are), then the real rungs (`rungs[]`, `RUNG_WORD`), each with its bar and target tick when `bar` is set, "Not enough yet" otherwise. `unavailable` reads "Not available yet"; failed has Try again. Not drawn with `coachhelm_track_record_v1` off.
- "Re-check reads" on the page's record card is today's `RecheckReads` (`screens/coachhelm/Recheck.tsx`, `refreshTeamAnalysisAsCoach`). It runs the engine for the team; the page's toast calls it read only, which it isn't. Keep it as a quiet secondary button under the board as today, not inside the record card. §12.
- Tests: sort order, finger-print signs, ring math clamps, the proposed row appears after Assign, rung words come from `RUNG_WORD`.

### 10.3 PR 7: motion (one PR, after the pieces exist)
| Moment | Build | Reduce Motion and Animations off |
|---|---|---|
| Ball flight | 1900ms ease-in-out along the path, stations appear at their point (`scale .3 → 1`, settle spring, `CH_SPRINGS.settle`), ball fades after 300ms; once per session (§9.8) | skipped; stations drawn at rest |
| Station change | rows reorder by FLIP (`translateY`, 520ms `--ch-ease-spring-smooth`), bars `scaleX` old to new, the reads crossfade 300ms | crossfade only, `CH_FADE_MS` |
| Chart marks | bars, rings and finger-prints grow once when first in view, 360ms `--ch-ease` | drawn at rest |
| Sheet | `Modal`'s own (462ms up, 280ms down, drag) | `Modal`'s own fade |
| Inspector | 462ms in, 280ms out, transform only | opacity fade, `CH_FADE_MS` |
| Story viewer | rises 462ms; progress bar `scaleX` linear 5200ms | fade; no auto-advance |
| Huddle trails | (only with §9.2 B) trail draws by dash offset, coin slides from the trail start, 1100ms smooth spring | drawn at rest |
| Press | 0.97 on tappable cards and buttons; rows wash | none |

The page says Reduce Motion is a 120ms fade; the app's shared fade is `CH_FADE_MS` (180ms) and lane 2 kept it. Use the shared value; if BUILD_BRIEF PR 1's `--ch-dur-crossfade-rm` lands first, use that token. Animate only transform and opacity.

Tests (Playwright, appended to `e2e/clubhouse-quality.spec.ts` as one `test.describe('CoachHelm team board')`): under `reducedMotion: 'reduce'` no animation lasts longer than `CH_FADE_MS`; the ball never runs; the story viewer doesn't advance; with motion on, the ball runs once per session.

---

## 11. Preview fixture states (the capture script's names)

These are the names the capture script uses. If the build names differ, change them in one place: the state switch in `preview/PreviewCoachHelmTeam.tsx` and the route list in the capture script.

Route: `/clubhouse-preview/coachhelm-team`

`?state=`
- `default`: five players, ten reads, a pattern at approach, two working rows, a record
- `early`: every player under 5 rounds on file (all hollow), two held-back reads, the record `early`
- `empty`: a roster with no reads yet (`CH-13306` wording inside the spot card)
- `failed`: the brief and the track record reads fail; each shows its own notice ("Couldn't load what's new" with Try again, "Track record unavailable right now"), as the page's `#failed` draws. Add `failed-all` for the players read failing (`CH-13202` notice in the feature card's place); the page doesn't draw it, so its look follows today's CoachHelm failure notice
- `loading`: `TeamBoardSkeleton`
- `long`: 15 players, long names, five coins at one station ("+N"), long read titles, Text Size XXL safe
- `nopattern`: patterns on, no row at any station (the "needs three players" line)
- `notrails`: §9.2 A, the default build (no trails, legend without the line)

`&station=tee|app|sg|putt|course` (maps to `tee`, `approach`, `short_game`, `putting`, and the Course tab; `course` is new)

`&open=read|player|story|course`
- `read`: the top read at the station
- `player`: the player with the biggest loss at the station
- `story`: the first story (phone viewer held at 45% progress; desktop inspector)
- `course` (new): the course sheet for the course with the most recent round (Hilltop in the fixture)

`&all=1` (new): the Course tab with all reads and all courses showing.

Extra states this plan adds, for its own tests: `off`, `partial` (legs failed, cards still drawn), `piecesoff` (brief, patterns and record flags off), `assigned`, `failwrites`, `duplicate`, `noroster`.

Also:
- document the route in the comment list at `src/app/clubhouse-preview/[screen]/page.tsx` 192 to 205
- add `default`, `early`, `failed` and `&open=read` to `scripts/clubhouse/a11y.mjs` (the coachhelm block at 176 to 185) and the default to `scripts/clubhouse/aesthetic-capture.mjs` (`coachhelm` at 92)

---

## 12. Where the code contradicts the design page

| The page says | The code says | Build |
|---|---|---|
| Monday brief, team patterns and track record are "built, hidden today", flags off | All three flags are `production: true, preview: true` in `config/feature-flags.yml`; only local development is off. No per-team allowlist exists per flag. | Ask Nick whether the page's call 2 ("allowlisted teams first") means `HELM_CLUBHOUSE_TEAMS`. |
| Team | Ask switch | The switch reads "Board" (`SubTabs.tsx`) | `boardLabel="Team"` with the flag on (§5.1) |
| Strokes to two decimals (−1.08) | Strokes gained print at one decimal (A20, `toChLadder`) | One decimal unless Nick says otherwise |
| Hole total is the sum of the four legs | Stats data rule: the total is the stored total, never the leg sum | Stored total (§4.3) |
| "to Tour" | SG is against the team's chosen baseline | Name the baseline when it isn't the Tour |
| Reads ranked by strokes | Feed order, never re-ranked; strokes known on about half | §9.6 |
| Confidence words Solid, Fair, Early | Solid read, Early read, Thin read; the ladder's five words with the support pass | The app's words |
| Track record levels Solid, Fair, Early with targets 85% and 70% | Five rungs from Seen repeatedly to Not enough yet, targets from `RUNG_TARGETS`, "Not enough yet" below 10 rechecked | The real rungs |
| Re-check reads is read only | It runs `refreshTeamAnalysisAsCoach` for the team | Keep today's button and words |
| Penalty read sits at the tee | Penalties are course management, no station | §9.4 |
| Reduce Motion is a 120ms fade | Shared fade is 180ms (`CH_FADE_MS`) | Shared value |
| Bars grow in width; a station pulses forever; the ball flies on load | `css-quality` bans width transitions; DESIGN_LANGUAGE bans load staggers | §9.8, §9.9 |
| "Since Thursday" | No last-visit store; the brief is weekly | "This week" (§8) |
| `ui/Sheet` | No `ui/Sheet`; `ui/Modal` is the bottom sheet | `Modal` on phone, new `Inspector` on desktop |
| A first-10-rounds window "if the table has it" | No table has it | §9.2 |

---

## 13. Overlap with other lanes

| File | Who else touches it | This plan's edit | How to avoid a conflict |
|---|---|---|---|
| `routes/coachhelm.tsx` | lane 2 (player file branch before 190), Ask | one branch in `CoachHelmView`, one CSS import, one fallback ternary | small and in a different function from lane 2's |
| `screens/coachhelm/chat/SubTabs.tsx`, `chat/Ask.tsx` | Ask lane | `boardLabel` prop, passed through | additive prop; tell the Ask lane |
| `data/coachhelm.ts` | lane 2 (PR 6: `full_name`, `ChProposal.coachName`) | exports and one optional parameter | additive; rebase before merge |
| `data/coachhelm-shape.ts` | lane 2, Ask | `ChInsight.area?` | additive |
| `data/coachhelm-map.ts` | Ask (read shapes) | one field in `toChInsight` | additive |
| `data/coachhelm-team-pattern.ts`, `data/coachhelm-coach-brief-shape.ts` | none known | additive fields | additive |
| `src/app/golf/actions/insight-delivery.ts` | engine owners, lane 2 PR 5a | PR 0a option | its own PR with a contract test |
| `data/coachhelm-views-shape.ts` | lane 2 (`playerFileHref`), Ask (`coachReadHref`) | none | "Open {first}'s page" calls `playerFileHref` once lane 2 exports it, `coachPlayerHref` until then |
| Read sheet | lane 2 plans `file/EvidenceSheet.tsx`; the read lane plans its page | `team/ReadPanel.tsx` | agree on one read panel before both land; whichever lands second imports the first |
| Practice plan entry | lane 6 | none | lane 6 exports `practicePlanHref({ step, playerIds })`; until then "Add to practice" isn't drawn |
| Ask seed | Ask lane | none | Ask exports `askAboutHref({ insightId } | { station })`; until then "Ask about this" isn't drawn |
| `src/app/clubhouse-preview/[screen]/page.tsx`, `config/clubhouse/pages/P013-coachhelm.json`, `scripts/clubhouse/a11y.mjs`, `aesthetic-capture.mjs`, `e2e/clubhouse-quality.spec.ts`, `component-catalog.json` | every lane | one entry each | add at the end of each list; regenerate the catalog after rebase, never by hand |
| `config/feature-flags.yml`, `registry.generated.ts` | anyone adding a flag | one entry | regenerate after rebase |
| `styles/coachhelm.css` | lane 2, Ask | none | all new rules in `styles/coachhelm-team.css`, prefix `ch-htb-` (free at 75b4956) |

New files (no conflict): `src/lib/coachhelm/v3/team-board/flag.ts`; `data/coachhelm-team.ts`, `data/coachhelm-team-shape.ts`; `screens/coachhelm/team/` (`TeamBoard`, `TeamHole`, `hole-geometry`, `StationControl`, `SpotCard`, `ReadPanel`, `PlayerPanel`, `Inspector`, `StoriesCard`, `StoryViewer`, `Huddle`, `RosterCard`, `WorkingCard`, `RecordCard`, `TeamBoardSkeleton`); `styles/coachhelm-team.css`; `preview/PreviewCoachHelmTeam.tsx`, `preview/fixtures-coachhelm-team.ts`; tests and changelog fragments.

CSS map (design class to Clubhouse): `.card` → `Surface` (the one card style); `.feat.hero` → `.ch-htb-feat` (`--ch-green-800`, feature inks, a flat fill: no light or gradient, SHARED-2); `.stchips` → `Segmented`; `.spot .br .bt .bf .avg` → `.ch-htb-bar`, `__track`, `__fill[data-tone][data-early]`, `__avg`; `.rd` → `.ch-htb-read` in a grouped list; `.pat` → `.ch-htb-pat`; `.hud` → `.ch-htb-hud`; `.rr` and `.fp` → `.ch-htb-row`, `.ch-htb-fp`; `.wk` and `.ringc` → `.ch-htb-work`, `.ch-htb-ring`; `.recc` → `.ch-htb-rec`; `.tiles .tile` → `.ch-htb-tile`; `.story .prog` → `.ch-htb-story`, `__prog`; `.insp` → `.ch-htb-insp`; `.dgrid .dcol` → `.ch-htb-grid`, `__col`. Type uses `--ch-type-*` (scales with `--ch-type-k`); gaps use `--ch-space-*`.

---

## 14. Risks

- **R1 Exposure count.** Four reads a player instead of one quadruples `roster_card` exposures per visit. That's correct (they're shown) only with PR 0a. Without it, notes and measured zeros are overcounted (§3).
- **R2 Query cost.** The board now also runs the brief (which re-reads roster, reads and rounds in `loadBriefInputs`), the track record and up to N theme reads, each with its own gate check. They stream after the hole and can't hold it, but a team of 15 is about 25 more queries per visit. A later PR can hand the board's roster and reads to the brief.
- **R3 Two pattern maths.** The board's `teamPatternsOf` and the brief's `loadBriefInputs` compute patterns with slightly different "current" rules. The spot card uses the board's; the stories never restate a pattern.
- **R4 Small teams.** Bars and the huddle name players to their coach, which is fine; nothing here reaches a player. The player panel never shows another player's figures.
- **R5 Held season table.** If §9.1 B is chosen, the figures are lifetime until the owner applies `20261024151000`, and the label must say "All time".
- **R6 Auto-advancing stories.** Without pause on hold and focus, the viewer fails WCAG 2.2.2.
- **R7 css-quality.** Bars, rings and the inspector must animate transform and opacity only.
- **R8 Two read panels.** Lane 2's `EvidenceSheet` and this plan's `ReadPanel` (§13).

---

## 15. Acceptance

Every PR:
- flag off: every CoachHelm address renders exactly as at 75b4956 (Playwright shots of the board, Ask, Deep dive and Standing)
- 390 and 430 phones and 1280, 1440 and 1728 desktop: no horizontal scroll, 16 and 20px side gutters, both desktop columns end level
- Text Size XXL: nothing clips, cards grow, the hole scales with its card
- Reduce Motion and `[data-motion='off']`: no movement beyond the shared fade
- AA contrast on paper and on the feature green, light and dark; chart marks 3:1 on their track
- no left border wider than 1px on any `.ch-htb-*`; one card style; titles inside cards; one green feature card
- every figure has its window and sample one tap away
- the side by side capture against `coachhelm-team.html` for every state in §11, with each difference listed as matched, fixed or "Can't match as drawn" (§9, §12)

Per PR:
- **0a:** exposure rows unchanged without the option; only drawn ids with it
- **0:** the loader isn't called by any route; one top-insights call with `limit: 4`; each part fails alone
- **1:** flag switches boards; `?player=` opens the panel; the hole's stations are keyboard buttons; "+N" past three coins
- **2:** bars, reads and pattern match the fixture per station; no "0.0" chip
- **3:** Assign creates the same proposal as the old board and reads "Proposed"; inspector focus returns
- **4:** stories only from their sources; pause on hold; no auto-advance under reduce
- **5:** no clipped coin; the not-plotted note
- **6:** record words from the real rungs; Re-check stays today's button
- **7:** every row of §10.3 recorded beside the design page's Play buttons
