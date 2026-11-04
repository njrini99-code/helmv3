# CoachHelm read redesign (lane 2): file-by-file build plan

The values (sizes, colours, words, motion, states) come from the design page `redesign/coachhelm-read.html` and `DESIGN_LANGUAGE.md`. This file says where they go. Where the page and DESIGN_LANGUAGE disagree on a value, DESIGN_LANGUAGE wins. On a file or a line, this file wins. Where this file and `03-DATA-CHECKS.md` disagree on a figure's source, the data checks win (section 14 reconciles them).

Repo `njrini99-code/helmv3`, read at `main` 75b4956 (Oct 31). The clone is shallow, so git history was not searched. Paths are under `src/clubhouse/` unless they start with `src/`, `config/`, `scripts/`, `docs/`, `e2e/` or `.github/`. Line numbers are at 75b4956. Find code by name first, because lines drift.

Prep only: draft PRs and a preview. No push, deploy, migration or flag flip. Nothing here changes what shot tracking collects, stores or sends.

Sources:
- the design page `redesign/coachhelm-read.html` (its script builds the phone Board card, the read page cards and the desktop three-column view). Its "Where each piece lives" table is the intent, except its "Deep dive address" line, which is superseded: the read is a new view, not a takeover of Deep dive (section 2).
- `DESIGN_LANGUAGE.md` and `BUILD_BRIEF.md` (PR conventions, fidelity check)
- sibling lanes: `coachhelm-lenses/02-PLAN.md` (sections 0, 1, 10, 11 R10, 13), `coachhelm-team/coachhelm-team.html` (lane 1), `ask/ASK_REDESIGN.md`, `coachhelm/AGENT_KIT.md`

Hard rules this plan keeps:
- release flag `coachhelm_read_v1`, off everywhere; flag off, every address renders exactly as at 75b4956
- no migration, no new column, no engine change, no change to shot tracking
- the green phone bar, the desktop sidebar and the glass top bar don't change
- titles inside cards, one card style, one green feature card per view, no accent left borders, amber for losses
- text follows `--ch-type-k` (iPhone Text Size, capped at XXL)
- no claim without its count; a player never sees a guessed cause (Q3)
- Assign, Dismiss and Undo reuse today's server actions through `useFocusActions` (`screens/coachhelm/parts.tsx:306`)
- shared springs only, each with a Reduce Motion version; animate transform and opacity only

---

## 0. PR order

| PR | Contents | Depends on |
|---|---|---|
| 1 Plumbing | flag and helper; `readHref`; the `?view=read` route branch (coach and player); the loader seams; `data/coachhelm-read-view-shape.ts` and `data/coachhelm-read-view.ts` building `ChReadView`; the three owner calls as a config object; `ReadPage` shell with `ReadHeadline` and `ReadSkeleton`; `styles/coachhelm-read.css`; preview `coachhelm-read` with the three reads, coach and player | BUILD_BRIEF PR 1 tokens (see section 2, item 4) |
| 2 Read page, phone cards | `WhereCard` (funnel), `WhyCard` (state track, arms dots, path, gap meter), `SureCard`, `MovedCard`, `RoundsCard`, `DoCard` (drill, worth, Assign, Message, Ask, assigned state); each card's own "didn't load" notice; all marks drawn at rest | 1 |
| 3 Desktop three-column | `ReadsRail` (the player's reads grouped by where on the hole), the three columns, crumbs, rail navigation, desktop action placement | 1, 2 |
| 4 Summary card export and lane hand-off | `ReadSummaryCard`, `ReadLadder`, pure `toChReadSummary`; preview host state `?screen=board`; the R10 agreement written into the PR | 1 (2 for the ladder styles) |
| 5 Motion and states | push (query-aware classification, shared commit), press 0.97, funnel and dots once on first view by `scaleX`/`scale`, path nodes, Assign tick; Reduce Motion crossfade; states: out of date, cleared, contradicted, under review, count-down, didn't load, long names, Text Size XXL | 2, 3, 4 |
| 6 Tests and capture | Playwright describe block, a11y and aesthetic routes, `capture/capture.mjs` states, motion clips, flag-off parity screenshots | 1 to 5 (each earlier PR lands its own unit tests) |

Six PRs. PRs 3 and 4 don't depend on each other and can go in either order after PR 2. PR 4's exports should land before Lenses PR 1 and lane 1's read sheet merge (section 11, R10), so it may be pulled ahead of PR 3.

A cleanup PR after the flag has been on in production for a while is not in this plan: point `coachReadHref` and `diveReadHref` straight at the read, remove the coach Deep dive dossier's duplicate parts, drop `SerifText` from Deep dive, remove the flag.

Every PR must:
- run `npm run clubhouse:catalog` (CI runs `npm run clubhouse:catalog -- --check` in `.github/workflows/clubhouse-quality.yml`; it writes `src/clubhouse/preview/component-catalog.json`; regenerate after every rebase, never edit by hand)
- run `npm run clubhouse:css` (`scripts/clubhouse/css-quality.mjs`: no new transition of width, height, margin, padding, top/left, inset, grid-template or flex-basis; no `transition: all`; an outer shadow needs a `--ch-*` token)
- run `npm run flags:check` (PR 1 also runs `npm run flags:generate`)
- keep `playwright.clubhouse.config.ts` green (testMatch `clubhouse-quality.spec.ts`, `clubhouse-playground.spec.ts`; chromium and webkit; motion no-preference and reduce)
- pass `npm test`, `npm run lint`, then `npm run typecheck` once at the end (8 GB)
- add a changelog fragment, which `scripts/clubhouse/changelog-gate.mjs` checks: `docs/clubhouse/pages/P013-coachhelm/changes/<date>-<slug>.md`, plus one in `docs/clubhouse/changes/` for any shared `ui/`, `lib/`, `shell/` or `styles/` file outside the P013 stems (PR 5's nav-motion commit needs one)
- attach the fidelity check (BUILD_BRIEF "Fidelity check"): side-by-side shots against the design page at 390 and 430, light and dark; clips of each animation it touches beside the design page's; each difference listed as matches, fixed, or can't match as drawn with the reason

---

## 1. Files that must NOT change

| File | Why |
|---|---|
| `shell/TopBar.tsx`, `shell/ClubhouseFrame.tsx` | Desktop sidebar and glass top bar stay. The glass bar has no page-action slot, so the design's glass-bar buttons move (section 10). |
| `shell/phone-chrome.tsx` (`PhoneTop` 344, `CH_UNDERLAY_SHIFT` 183, `usePhoneStackHistory` 428), `shell/PhoneScreen.tsx` | The green phone bar and the pushed bar stay. The read uses `PhoneTop back title action` as `views/Frame.tsx:45` does. |
| `ui/PhoneBar.tsx` | The pushed bar ("‹ CoachHelm", area name centred, More) is this component as it is. |
| `styles/shell.css` bar rules (`.ch-topbar`, `.ch-pbar`, the lip, the phone hero bar) | The bars' look. |
| `screens/coachhelm/views/DeepDive.tsx` (812 lines) | New view, not a takeover. Flag off and on, Deep dive renders as today. No exports are added by this lane (Lenses adds six `export` keywords; see section 11). |
| `screens/coachhelm/EngineState.tsx` (`EngineState` 29, `WhyAudit` 94, `ClearedLines` 117) | Kept for the Board, Deep dive and Lenses. The read's `SureCard` and `WhyCard` draw the same facts in their own markup. |
| `screens/coachhelm/parts.tsx` (466 lines) | Lane 1 owns it. `useFocusActions` (306) and `ChFocusTarget` (290) are imported as they are; `FocusActions` (392) and `FocusCard` (130) are not edited. |
| `screens/coachhelm/CoachBoard.tsx`, `screens/coachhelm/PlayerBoard.tsx` | Lane 1 and Lenses own them. This lane exports `ReadSummaryCard` for them and edits neither. |
| `screens/coachhelm/writes.ts` | `LIVE_COACHHELM_WRITES` reused as is. |
| `data/coachhelm-read-shape.ts` (257 lines, `ChRead`, `toChRead`, `readLines`) | Today's "The Read" four lines, imported by `coachhelm-dive-shape.ts:14`, `DeepDive.tsx:8` and two tests. Reused, never renamed (section 2, item 1). |
| `data/coachhelm-path.ts` (`narrowingOf` 55, `pathLineFor` 72), `data/coachhelm-engine-shape.ts`, `data/coachhelm-map.ts` (`toChInsight`) | Read, not changed. |
| `src/app/golf/actions/insight-delivery.ts`, `src/app/golf/actions/development.ts` | Server actions and exposure writes unchanged. |
| `src/lib/coachhelm/**` (engine, `delivery/player-projection.ts`, `v3/engine/context-narrowing.ts`, `v3/engine/root-cause.ts`) | Engine read, not changed. |
| `screens/coachhelm/chat/*`, `shell/AskSheet*.tsx` | The Ask lane owns them. This lane calls the Ask lane's entry (section 4.7). |
| `screens/messages/*` | Message is a link to today's compose. |
| `styles/coachhelm-dive.css`, `styles/coachhelm.css` | Lenses and lane 1 may touch them. Every new rule goes in `styles/coachhelm-read.css`. |
| `styles/tokens.css` | Owned by BUILD_BRIEF PR 1. This lane adds no token. |
| `supabase/migrations/*`, anything under shot entry or round capture | No migration; shot tracking untouched. |

---

## 2. Decisions applied, and what the code changes about them

The lane's decisions are followed. Five things in the code at 75b4956 force a small change of wording or name. Each is a fix, not a new decision.

1. `data/coachhelm-read-shape.ts` already exists (today's `ChRead`, the Deep dive's four lines). The new files are `data/coachhelm-read-view-shape.ts` (pure, client-safe, exports `ChReadView`) and `data/coachhelm-read-view.ts` (`server-only` loader). The existing file is imported, not edited. Also: `ChLadder`/`toChLadder` (`data/coachhelm-ladder-shape.ts:129`) already mean the strokes-gained ladder, and "claim ladder" means the support rung. The new benchmark type is `ChBenchmarkLadder`; the component keeps the agreed name `ReadLadder`.
2. Flags are server-only (`src/lib/flags/is-enabled.ts` starts with `import 'server-only'`), and `coachhelm-views-shape.ts` is client-safe. So `readHref` cannot read the flag. Signature: `readHref(player: string | null, insight: string, on = false)`. Callers get `on` from their server loader, the way the route hands `trackRecordHref` to `CoachBoard` (`routes/coachhelm.tsx:61`). With `on` false it returns today's address (the coach Deep dive open on the read, or the player's `diveReadHref`), so a caller that forgets the flag still lands on today's page.
3. A query-only change on the same path is a fade, not a push. `classifyNav` (`lib/nav-motion.ts:24`) strips the query (`strip`, line 16), so `/golf/dashboard/coachhelm` to `/golf/dashboard/coachhelm?view=read&…` returns `'fade'` (the `a === b` branch, line 27). The drawn push needs one shared change: a coachhelm-scoped rule that a move from no `view` (the board) to a detail view is a push, and back is a pop. It goes in PR 5 as its own commit with a `docs/clubhouse/changes/` fragment. The same gap affects Lenses' `?view=player` and today's Board to Standing links; agree it with Lenses (section 11).
4. The semantic tokens are not in `tokens.css` at 75b4956. `--ch-card-bg`, `--ch-card-ring`, `--ch-grouped-bg`, `--ch-well-bg-flat`, `--ch-loss`, `--ch-gain`, `--ch-chart-track`, `--ch-chart-flat`, `--ch-feature-ink`, `--ch-feature-loss`, `--ch-type-meta`, `--ch-type-figure-hero` and `--ch-dur-crossfade-rm` are all absent (only `--ch-chart-loss-fill`, `--ch-green-800`, `--ch-on-green-ink`, `--ch-type-k`, `--ch-type-card-title` exist). They arrive in BUILD_BRIEF PR 1. If PR 1 hasn't landed, this lane's PR 1 waits, or carries exactly PR 1's token block as Messages 11a does. Lenses' plan says these exist; they don't (section 11).
5. The fixture mapping in the brief and the design page differ. The design page draws Priya's long approaches as narrowed plus a likely cause with two arms, Eli's penalties as a counted path, and Jonah's downhill putts as not traced with a data gap. The existing fixtures agree with the page: `approachNarrowed` and `penaltiesTraced` in `preview/fixtures-coachhelm-path.ts:41-100`. Build to the page (fidelity first). Add one extra state, `eli-likely`, from `fixtures-coachhelm-engine.ts:301` ("Eli Likely and Contradicted") so a likely penalties read is covered too.

The three unanswered owner calls are built as defaults behind one config object, each labelled "Default, Nick can flip" (section 3.6):
1. pictures back, reversing D8 (default on; off draws the words only, which are already beside every picture)
2. players see the observed funnel, never a guessed cause (default on; Q3 stays either way)
3. team pool on the ladder only when `coachhelm_team_pool_v1` is on; Tour only otherwise (default)

---

## 3. PR 1: Plumbing

### 3.1 The flag

Today: `config/feature-flags.yml` holds the CoachHelm flags; `coachhelm_track_record_v1` (1198-1229) is the entry shape to copy. The helper pattern is `src/lib/coachhelm/v3/track-record/flag.ts` (sync: `isTrackRecordEnabled(): boolean { return isFlagEnabled(TRACK_RECORD_FLAG) }`).

Change:
- Add `coachhelm_read_v1` to `config/feature-flags.yml`: type release, owner golf/coachhelm, `default: false`, production, preview and development all false. Purpose: "the CoachHelm read as its own view (`?view=read`): the funnel, the cause state, how sure, how it moved, the rounds and what to do, from evidence already stored; read only, no new writes". Cleanup plan: "remove once the coach Deep dive dossier is retired".
- `npm run flags:generate` updates `src/lib/flags/registry.generated.ts`.
- New `src/lib/coachhelm/v3/read/flag.ts`: `READ_FLAG = 'coachhelm_read_v1'`, `isReadEnabled(): boolean` (sync, like track record).
- Turning it on is Nick's call and not part of any PR.

### 3.2 `readHref`: `data/coachhelm-views-shape.ts` (130 lines), additive at the end

Today: `coachPlayerHref` (91), `diveReadHref` (101), `coachReadHref(playerId, insightId, roster)` (108; null when the player isn't on the roster).

Change (append after line 130, nothing above it edited):
- `export const READ_VIEW = 'read'`
- `export function readHref(player: string | null, insight: string, on = false): string`
  - `on` false: `player` ? `${coachPlayerHref('deep-dive', player)}&insight=${enc(insight)}` : `diveReadHref(insight)`. That is today's address.
  - `on` true: `player` ? `/golf/dashboard/coachhelm?view=read&player=${enc(player)}&insight=${enc(insight)}` : `/golf/dashboard/coachhelm?view=read&insight=${enc(insight)}`
- The roster guard stays with callers: a coach caller that needs it calls `coachReadHref` first and uses `readHref` only when that is non-null.
- `coachReadHref`, `diveReadHref` and `helmViewHref` are not changed in this plan.

### 3.3 Route: `routes/coachhelm.tsx` (235 lines) and the page entry

Today:
- `src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx:199` types searchParams as `{view?; player?; c?; section?}`; line 206 spreads them, so `insight` already arrives but is untyped.
- `ClubhouseCoachHelmRoute` (166). Coach branch: track record 183-189, the coach player drill 191-198 (`CoachPlayerPage`, 114-132), Monday brief 200, Brief 209, Board or Ask 217-222. Player branch 224-233 (`PlayerHelmView`, 93-103).

Change, `page.tsx`: add `insight?: string` to the searchParams type (type only). Lenses adds `insight`, `at` and `from` on the same line; whichever lands second rebases.

Change, `routes/coachhelm.tsx`:
- Import `isReadEnabled`, the read loaders, `ReadPage`, `ReadSkeleton`; add `import '../styles/coachhelm-read.css'` after line 41.
- Coach branch, a new block after the track record block (after 189) and before the coach player drill comment at 190:
  - `if (view === READ_VIEW && isReadEnabled() && typeof player === 'string')`:
    - with `typeof insight === 'string'`: `<Suspense fallback={<ReadSkeleton chained coach={{ first: null }} />}><CoachReadPage coachId teamId playerId={player} insight={insight} /></Suspense>`
    - without `insight`: `redirect(coachPlayerHref('deep-dive', player))`
  - `CoachReadPage` copies `CoachPlayerPage` (114-132) state by state: `loadCoachPlayerScope`, `CoachPlayerNotOnTeam` (CH-13311), `CoachPlayerFailed` (CH-13209), the board when coach-off (CH-13305), the view's own off page when player-off (CH-13313, drawn by `ReadPage` with `load={{status:'off'}}`), then a Suspense with `ReadSkeleton` and `CoachReadView` calling `loadCoachRead({ scope, insightId })`.
- Player branch, before `const drill = playerHelmDrill(view)` at 225: `if (view === READ_VIEW && isReadEnabled())`:
  - with `insight`: a `PlayerReadView` that checks `loadPlayerHelmGate(playerId)` exactly as `PlayerHelmView` does (95-96), then `loadPlayerRead({ playerId: session.player.id, insightId: insight })`. The id is the session's, never the address's.
  - without `insight`: `redirect(PLAYER_HELM_HREF['deep-dive'])`
- Flag off: `view=read` falls through. The coach gets the board (unknown view, today's behaviour); the player gets the board (`playerHelmDrill('read')` is null). Exactly 75b4956.
- Order with Lenses: this block goes before Lenses' player-file block. The two views are distinct; the read never redirects, and Lenses' redirect never touches `view=read`.

Deep links from notifications: nothing changes. `src/lib/notifications/insight-notifier.ts:119` points at the board; `verdict-job.ts:320` at the players page.

### 3.4 Loader seams (one feed call per page view)

Today:
- `data/coachhelm-player.ts` `loadCoachPlayerDeepDive({scope})` (187-269) calls `getInsightsForCoach` once (200), which records one `coach_feed` exposure for every row it returns (`insight-delivery.ts:1069`; no `drawnLater` on the coach feed). Its `readRounds` call (225) reads only `roundIdsToRead`, not the example-hole rounds.
- `data/coachhelm-dive.ts` `loadPlayerDeepDive({playerId})` (101-194; fixed 4 Nov wiring: was 103-194 at 75b4956, 101 on 03d9087) calls `getInsightsForPlayer` with `drawnLater` (127; fixed 4 Nov wiring: was 135), and `done(page, ids)` reports the list ids as drawn (`player_feed` exposures, `insight-delivery.ts:817-824`). Its `readRounds` (156; fixed 4 Nov wiring: was 162) already adds `exampleRoundIds`.
- Neither returns the raw `EvidenceInsight` rows, and the read needs raw fields that `ChDeepInsight` drops (`diagnosis.basis.narrowing.steps`, `cause.alternatives`, `cause.event_strokes`, `cause.checked`, `cause.count_down`, `data_gap`, `confidence_factors`, `comparison.lines`, `estimated`, `strokes_impact_method`).

Change (behaviour of the exported loaders unchanged; tested):
- `coachhelm-player.ts`: move the body of `loadCoachPlayerDeepDive` into `export async function coachDiveCore(input, opts: { exampleRounds?: boolean } = {}): Promise<{ load: ChViewLoad<ChDeepDive>; raw: ReadonlyMap<string, EvidenceInsight> }>`. `loadCoachPlayerDeepDive` becomes `(await coachDiveCore(input)).load`. With `exampleRounds`, the `readRounds` call adds `exampleRoundIds(i.evidence)` as the player loader does; off by default, so the Deep dive's "Where it happened" doesn't gain holes with the flag off.
- `coachhelm-dive.ts`: same split, `playerDiveCore(input, opts: { drawn?: (list: readonly ChDeepInsight[]) => string[] } = {})`. Each `done(page, ids)` uses `opts.drawn?.(list) ?? list.map((i) => i.base.id)`.
- The read loaders call the core once. The coach read records the same `coach_feed` set Deep dive records today (parity; see R3). The player read passes `drawn: () => [insightId]`, so a read page records exactly the read it shows (R2).
- Lenses also edits `coachhelm-player.ts` (the Standing seam at 171-186). Different function; rebase only.

### 3.5 Shape and loader (new)

`data/coachhelm-read-view-shape.ts` (pure, client-safe). Types, each field nullable so a card draws only when its data is on the read:

| Type | Fields | From (stored, never computed beyond the stated rule) |
|---|---|---|
| `ChReadView` | `head {playerId \| null, name, first, area, areaLabel}`, `read: ChReadDetail \| null` (null: the id isn't on this player's list, the "gone" state), `rail: ChReadsRailGroup[]`, `counts {insights, needs}`, `missing?: ChBoardMissing`, `failed {rounds, plans, themes}`, `calls: ChReadCalls` | `ChDeepDive` (list, counts, missing, failure flags), `DIVE_AREAS`/`areaOf` (`coachhelm-dive-shape.ts:112, 121`) |
| `ChReadDetail` | `insight: ChInsight` (the `FocusActions` target), `stance: ChStance`, `headline`, `funnel`, `cause`, `sure`, `moved`, `rounds`, `todo`, `lifecycle`, `corrections` | one `ChDeepInsight` plus its raw row |
| `headline` | `title`, `lede`, `value`, `valueNote`, `ladder: ChBenchmarkLadder \| null`, `worth {strokes, to: 'team'\|'tour'\|'self', estimated: boolean} \| null`, `foot {sample, rounds, firm, rung \| null, through}`, `stale: string \| null` | `ChInsight.title/lede/value/valueUnit`; `evidence.comparison.lines` else `comparison_value` with the Tour label (Q-88: never a college line); `ChDeepInsight.closes`; `strokes_impact_method` in `{'sg_baseline','peer_delta'}` (the `ESTIMATED` set, `coachhelm-read-shape.ts:90`; fixed 4 Nov wiring: was 94); `ChHelmEvidence.sample`, `rounds_n`, `read.word`; `engine.support.word` coach only; `ChRead.when.through`, `ChRead.when.stale` (CH-13903) |
| `ChBenchmarkLadder` | `you {label, value, display}`, `lines {source, label, value, display, note}[]`, `min`, `max`, `dir`, `gap: string \| null` | `comparison.lines` (`types.ts:290`); team_pool only when `calls.teamPoolOnLadder` allows and the line exists; `note` from `n`, `n_unit`, `players` ("164 approaches · 8 teammates", never names) |
| `funnel` | `steps {label, n: number \| null, statement}[]`, `stoppedAt`, `observed: true` | `diagnosis.basis.narrowing` (`types.ts:510`); `n` parsed from the engine's own statement templates (section 10, row 1); null for a player when `calls.playerFunnel` is off |
| `cause` | `state: 'counted'\|'likely'\|'not_traced'`, `track: 0\|1\|2`, `arms? {label, failures, n}[]`, `verdict?`, `range?`, `path? {steps, count, rounds, eventStrokes, holes: ChDiveHole[]}`, `gap? {have, need, field, text}`, `countDown? {haveEvents, needEvents, haveRounds, needRounds}`, `reason?: InsightNotTracedReason`, `legacy? ChDiveDiagnosis` | `evidence.cause` (`types.ts:382`): `alternatives[0].arm_a/arm_b`, `lower_bound/upper_bound` (range words via `rangeWords`, `coachhelm-engine-shape.ts:210`), `path`, `occurrences/denominator/distinct_rounds`, `event_strokes`, `data_gap.have_count/target_count`, `count_down`; holes from `ChDeepInsight.where`; `legacy` = today's drivers list for rows written before the engine cause |
| `sure` | `word`, `rows {k: 'sample'\|'recent'\|'record', have, need, text}[]`, `checked: string[]`, `rung? {word, range}` | `confidence_factors.sample_adequacy` with `sample_n`; recency only when `factors_measured !== false`, else from the listed rounds' dates; `cause.checked.holes_with_full_record/of/fields_missing`; `diagnosis.basis.checked` cleaned (section 10, row 3); `engine.support` coach only |
| `moved` | `from`, `to`, `unit`, `text`, `tone`, `ref {label, value} \| null`, `theme {sg, trend} \| null` | `raw.metadata.movement` (`insight-delivery.ts:116`), `movementFor` text (`coachhelm-dive-shape.ts:307`), `ChDiveTheme` |
| `rounds` | `total`, `list (ChDiveRound & {counted: number})[]`, `shown: 4` | `ChDiveRounds`; `counted` = example holes on that round |
| `todo` | `drill: ChHelmWeek \| null`, `worth`, `startsFrom`, `assigned`, `declined`, `verdict: ChEngineVerdict \| null`, `plan: ChDivePlan`, `messageHref`, `askHref`, `practiceHref` | `ChInsight.week`, `assigned`, `declined`; `engine.verdict` (with `target`, `targetLine` 371); `ChDeepInsight.plan`; `rebuiltHref('/golf/dashboard/messages?player=…','coach')` as `DeepDive.tsx:450`; Ask lane entry; `practiceHref` null until the practice builder ships (`shell/nav.ts` `rebuiltHref` 331 answers null for an unbuilt page) |

Pure functions (each with tests):
- `toChReadDetail(raw, deep, viewer, calls)`; `toChReadView(dive, raw, insightId, viewer, calls, head)`
- `toChReadSummary(raw, base, viewer, calls)` for the Board card (PR 4)
- `benchmarkLadder(evidence, tour, calls)`, `funnelOf(narrowing)`, `causeOf(cause, where, viewer)` (named `readCauseOf` to avoid the engine shape's `causeOf`), `sureOf(...)`, `railOf(list)`
- Voice: every sentence goes through `speak` (`data/coachhelm-voice.ts`). Names, never pronouns ("23 pts below Jonah's level putts", not "his"; section 10, row 9).
- Player viewer: `cause.arms`, `verdict`, `range` and `rung` are never built. A player's likely cause becomes `state: 'not_traced'` with the "Not traced yet" sentence, as `pathLineFor` does (`coachhelm-path.ts:100`). The arms never reach a player's client.

`data/coachhelm-read-view.ts` (`server-only`):
- `loadCoachRead({ scope, insightId }): Promise<ChViewLoad<ChReadView>>`: `coachDiveCore(scope, { exampleRounds: true })`, then `toChReadView`. Head from `scope.head`.
- `loadPlayerRead({ playerId, insightId })`: `playerDiveCore({ playerId }, { drawn: () => [insightId] })`.
- `calls`: `READ_CALLS` with `teamPool: teamPoolEnabled()` (`src/lib/coachhelm/v3/team-pool/flag.ts`).
- Add both data files and `data/coachhelm-read-calls.ts` to `config/clubhouse/pages/P013-coachhelm.json` `implementation.also` (51). The JSON array merges badly; rebase right before merging.

### 3.6 The three owner calls: `data/coachhelm-read-calls.ts` (new, client-safe)

```ts
/** The read redesign's three open owner calls (31 Oct). Each value is the default; Nick can flip it. */
export const READ_CALLS = {
  /** Default, Nick can flip. Call 1: pictures back (reverses D8). false draws the words only. */
  pictures: true,
  /** Default, Nick can flip. Call 2: players see the observed funnel. Q3 (no guessed cause for players) stays either way. */
  playerFunnel: true,
  /** Default, Nick can flip. Call 3: 'when-flag-on' shows the team pool only with coachhelm_team_pool_v1 on; 'never' is Tour only. */
  teamPoolOnLadder: 'when-flag-on',
} as const;
export type ChReadCalls = typeof READ_CALLS & { teamPool: boolean };
```

With `pictures` false, every SVG mark (ladder track, funnel bars, dots, path nodes, gap meter, sure bars, slope) is left out and the words already written beside each picture remain. Test both values.

### 3.7 Screens (new): `screens/coachhelm/read/`

PR 1 adds the shell, the headline and the skeleton. The other cards follow in PR 2 to 4.

| Component | File | Props | PR |
|---|---|---|---|
| `ReadPage` | `read/ReadPage.tsx` (`'use client'`) | `{ load: ChViewLoad<ChReadView>; voice: ChViewVoice; writes?: ChCoachHelmWrites }` | 1 (shell), 3 (desktop) |
| `ReadHeadline` | `read/ReadHeadline.tsx` | `{ d: ChReadDetail; voice; pictures: boolean }` | 1 |
| `WhereCard` | `read/WhereCard.tsx` | `{ funnel; voice; pictures }` | 2 |
| `WhyCard` | `read/WhyCard.tsx` | `{ cause; voice; pictures }` | 2 |
| `SureCard` | `read/SureCard.tsx` | `{ sure; voice; pictures; corrections? }` | 2 |
| `MovedCard` | `read/MovedCard.tsx` | `{ moved; voice; pictures; failed }` | 2 |
| `RoundsCard` | `read/RoundsCard.tsx` | `{ rounds; voice; failed }` | 2 |
| `DoCard` | `read/DoCard.tsx` | `{ d; voice; fa: ChFocusActions; missing? }` | 2 |
| `ReadsRail` | `read/ReadsRail.tsx` | `{ rail; current: string; voice }` | 3 |
| `ReadSummaryCard` | `read/ReadSummaryCard.tsx` | `{ s: ChReadSummary; voice; href: string \| null; pictures }` | 4 |
| `ReadLadder` | `read/ReadLadder.tsx` | `{ ladder: ChBenchmarkLadder; onGreen: boolean; who: string }` | 1 (inside the headline), exported in 4 |
| `ReadSkeleton` | `read/ReadSkeleton.tsx` | `{ chained?: boolean; coach?: { first: string \| null } }` | 1 |

`ReadPage`, phone (PR 1):
- `PhoneTop back={{ label: viewer === 'coach' ? head.first : 'CoachHelm', onBack }}` (settled 3 Nov in 06 §14: the player's first name for a coach, "CoachHelm" for a player; this line used to say 'CoachHelm' for both). Was: `PhoneTop back={{ label: 'CoachHelm', onBack }} title={head.areaLabel}` plus a More action (`PhoneIconAction`), as `views/Frame.tsx:45` does. No new bar code. Back goes to `readBackHref`: the coach board on that player (`coachBoardFor`, `coachhelm-views-shape.ts:88`) or the player's board; history back when the previous entry is on CoachHelm.
- Card order down the page, as `readHTML` draws it: headline (green feature card, once), Where it shows up, Why CoachHelm thinks so, How sure, How it has moved, The rounds behind it, What to do.
- Gone state: `read === null` draws one card "This read is no longer on {first}'s CoachHelm" with a link to the Deep dive (new code, section 3.10).
- `usePageCrumbs(['CoachHelm', name, areaLabel])` for the desktop crumbs (coach), `['CoachHelm', areaLabel]` (player).

`ReadHeadline` (on green, `--ch-green-800`, the view's one feature card):
- `k` row: "{first} · {area}" (coach) or "{area}", then the stance word (`PRI_LABEL`, `stanceOf`, `coachhelm-shape.ts:347, 360`; "Assigned" once assigned).
- `h3` title in Instrument Sans (no `SerifText`), the lede, the hero figure and its note.
- `ReadLadder` (track, the loss span, a tick per line with its label and value, the player's dot with "{first} {value}" or "You {value}").
- foot 1: "Worth about {x} a round, closed to the team average" and "estimated from strokes gained" when `estimated`.
- foot 2: "{sample} · {rounds} · {firm}" plus " · {rung}" for a coach, and "Through {date}" right-aligned.
- Feature-card inks per DESIGN_LANGUAGE "Feature card text": primary `#F4F1E8`, secondary `#D3D9CB`, loss `#EDB867`, via PR 1's `--ch-feature-*` tokens.

`ReadSkeleton`: card-shaped placeholders in the final order and height, using `ui/States` `Skeleton` as `views/Skeletons.tsx:185` (`DiveSkeleton`) does; `chained` as there.

### 3.8 CSS (new): `styles/coachhelm-read.css`, prefix `.ch-hr-`

`.ch-hr-` is free at 75b4956 (grep of `src` finds none; `.ch-rd-` is the rounds sheet). As a `coachhelm-*.css` stem sheet it belongs to P013. Design class to Clubhouse class:

| Design class | Clubhouse | Notes |
|---|---|---|
| `.card`, `.ch`, `.cb`, `.cn` | `Surface` (`ui/Surface.tsx`, title, `actions` as meta, `footerNote`) | the one card style; PR 2 of the brief restyles `Surface`; if not landed, `.ch-hr-card` mirrors DESIGN_LANGUAGE section 4 exactly |
| `.feat`, `.k`, `.st`, `.hero`, `.lede`, `.ffoot`, `.worth`, `.open` | `.ch-hr-feat`, `__k`, `__st`, `__hero`, `__lede`, `__foot`, `__worth`, `__open` | once per view |
| `.ladder` (SVG) | `.ch-hr-ladder` | marks at 3:1 on track; text 12.5 at `--ch-type-k` |
| `.fun`, `.fstep`, `.fhead`, `.ftrack`, `.fbar`, `.fbar.last`, `.why`, `.obs` | `.ch-hr-fun`, `__step`, `__head`, `__track`, `__bar[data-last]`, `__why`, `.ch-hr-obs` | bar drawn full width, `transform: scaleX(var(--ch-hr-share))` from the left (section 7.2) |
| `.stepper`, `.slab` | `.ch-hr-track3`, `__lab` | three steps |
| `.arms`, `.arm`, `.dots i.f`, `.verdict`, `.q` | `.ch-hr-arms`, `__arm`, `.ch-hr-dots i[data-f]`, `.ch-hr-verdict`, `__q` | 14px dots |
| `.path`, `.pn.hit`, `.nd`, `.holes .hole` | `.ch-hr-path`, `__node[data-hit]`, `__icon`, `.ch-hr-holes`, `__hole` | connector `::after` scaled by `scaleX` |
| `.meter i.f` | `.ch-hr-meter i[data-f]` | gap meter |
| `.sure`, `.sr2`, `.tr i.mid`, `.checked` | `.ch-hr-sure`, `__row`, `__bar[data-mid]`, `.ch-hr-checked` | bars by `scaleX` |
| `.trendchip`, slope SVG | `.ch-hr-moved`, `.ch-hr-chip` | chip per DESIGN_LANGUAGE section 9 |
| `.row`, `.sdot`, `.v`, `.chev` | grouped-list rows, `.ch-hr-row`, `.ch-hr-dot[data-tone]` | 52/64 rows, inset hairline |
| `.drill`, `.dicon`, `.targets .tg`, `.linkrow .lk`, `.plan` | `.ch-hr-drill`, `__icon`, `.ch-hr-tg`, `.ch-hr-links`, `.ch-hr-plan` | |
| `.btn.pri`, `.btn.gh`, `.assigned`, `.check`, `.spin` | `ui/Button` (primary, ghost, `busy`); `.ch-hr-assigned` | the chip keeps today's words (CH-13601) |
| `.lg h5`, `.lr.on` | `.ch-hr-rail`, `__group`, `__row[aria-current]` | desktop |
| desktop grid | `.ch-hr-desk`, `.ch-hr-col` | 250px rail, story column, evidence column (settled in 06 §14; was 300) |

Every type size uses `--ch-type-*`; every gap `--ch-space-*`; 20pt between cards, 16pt card padding (header 16/16/12, body 0/16/16), rows inset 16 (settled in 06 §14; was 24 and 20). Phone edge 16px, 20px at 414 and wider (`--ch-page-x-phone`). No `font-family` other than `--ch-font-sans`.

### 3.9 Preview (new): `coachhelm-read`

Today: `src/app/clubhouse-preview/[screen]/page.tsx` (645 lines); doc list 192-207; `'coachhelm-coach-player'` at 577; CSS imports 151-158. Fixtures: `fixtures-coachhelm-path.ts` (`approachNarrowed` 48, `penaltiesTraced` 41), `fixtures-coachhelm-engine.ts` (301: Jonah Observed with a data gap and a Worked focus area, Eli Likely and Contradicted, Priya under review, Theo cleared), `fixtures-coachhelm-views.ts` (Jonah's rounds, 174-192), `fixtures-coachhelm-coach-player.ts`.

Change:
- New `preview/PreviewCoachHelmRead.tsx` and `preview/fixtures-coachhelm-read.ts`. Raw rows are built from the existing builders, so no invented player, and go through the real shapers (`toChInsight`, `toChDeepInsight`, `toChReadView`), so the preview can't draw what the page can't.
- Fix the fixture strings first (section 10, rows 1 and 3): the narrowing statements and `basis.checked` in `approachNarrowed` (lines 89-95, 83) are shortened forms the engine never writes. Replace them with the engine's real templates (`v3/engine/context-narrowing.ts:441-488`, `root-cause.ts:1255-1269`) or, better, generate them by calling the engine's own pure narrowing on a fixed set of items.
- Register `'coachhelm-read'` next to 577; add `import '@/clubhouse/styles/coachhelm-read.css'` after 158; document in the list at 192-207:
  `/clubhouse-preview/coachhelm-read ?q=approach|penalties|putts &viewer=coach|player &screen=read|board &state=…`
- States:
  - PR 1: `full` (default), `loading`, `failed`, `off`, `notonteam`, `scopefailed`, `gone`, `teampooloff` (Tour only), `noladder`
  - PR 2: `nofunnel`, `funnelstopped` (stopped at par), `funnelunparsed` (text-only steps), `eli-likely`, `legacy` (drivers list, no engine cause), `loadfailed` (shot records not read), `nodrill`, `nostrokes`, `roundsfailed`, `themesfailed`, `plansfailed`, `assigned`, `proposed`, `declined`, `verdict`, `failwrites`, `duplicate`, `words` (pictures off)
  - PR 3: desktop is the same states at 1440 x 900 (the design page's desktop shot size; the quality spec also checks 1280)
  - PR 4: `screen=board` for each read
  - PR 5: `stale`, `cleared`, `contradicted` (coach, and player before and after a day), `underreview`, `countdown`, `long`, and `?text=xxl` for Text Size XXL
- Add the route to `scripts/clubhouse/a11y.mjs` (route list 176-185) and `scripts/clubhouse/aesthetic-capture.mjs` (92), at the end of each list.

### 3.10 Error codes

`scripts/clubhouse/check.mjs` maps coachhelm to 13. Free at 75b4956: CH-13861 to CH-13869 (13850-13853, 13860 and 13880 are used; fixed 4 Nov wiring: CH-13860 is taken by Standing's How you play row in `docs/clubhouse/catalog/coachhelm.md:261`). Proposed: CH-13866 read page didn't load (fixed 4 Nov wiring: was CH-13860); CH-13861 read gone; CH-13862 rounds didn't load (read page); CH-13863 trend didn't load; CH-13864 plan didn't load; CH-13865 Ask entry unavailable (not drawn, logged only). Grep each before use. Agree the block with Lenses, which also picks "the next free" codes, so the two lanes don't collide (Lenses could take CH-13760 to CH-13779, also free).

### 3.11 PR 1 tests

Unit, `src/clubhouse/__tests__/coachhelm-read-route.test.tsx` (mock `isReadEnabled` the way the track-record route tests mock theirs):
- flag off: `?view=read&player=X&insight=Y` renders the board, and a player's `?view=read&insight=Y` renders their board (75b4956 behaviour)
- flag on: coach renders `CoachReadPage`; not-member, scope-failed, coach-off and player-off give the same screens as `CoachPlayerPage`
- flag on: missing `insight` redirects to the Deep dive
- a player session never reaches the coach branch; the player read uses the session id, never `?player=`

Unit, `src/clubhouse/data/__tests__/coachhelm-read-view.test.ts`:
- `readHref`: off returns today's addresses byte for byte (compare with `coachReadHref` minus the roster check, and `diveReadHref`); on returns the new ones; ids encoded
- `coachDiveCore` and `playerDiveCore`: the exported loaders return deep-equal results before and after the split for the existing fixtures; one feed call per load (spy)
- `playerDiveCore` with `drawn` reports only those ids (spy on the `drawnLater` resolution)
- `exampleRounds` off: the coach dive's `where` is unchanged
- `benchmarkLadder`: team pool shown only with `teamPool` true and the line present; never a college line; player and coach get the same numbers
- player viewer: no `arms`, `verdict`, `range` or `rung` keys anywhere in the payload (assert with `JSON.stringify`)
- no sentence contains he, she, him, her or his (fixture names include all three players)
- `READ_CALLS.pictures` false: the page renders no `svg` inside `.ch-hr-*` and every figure still appears as text

Acceptance: flag off, Playwright screenshots of the board, Deep dive and Standing (coach and player) match 75b4956; flag on in the preview, the headline matches the design at 390 and 430, light and dark; Text Size XXL grows the card without clipping.

---

## 4. PR 2: Read page, phone cards

Each card draws only when its data is on the read. A card with no data is left out, never drawn empty or as a zero. A part that failed draws its notice inside its own card.

### 4.1 Where it shows up: `WhereCard`

- Title "Where it shows up", meta chip "Observed, not a cause" (the `NARROWING_PREFIX` rule, `coachhelm-path.ts:37`, kept verbatim in the accessible name).
- One row per step: label, count right-aligned, a 12px track with the bar at that step's share of the first step's count; the last bar in loss fill; each row after the first carries its statement.
- Stopped step: the last passed step is the last bar; the failed step's statement is the note ("Not narrowed further: …"), as `narrowing.sentence` says.
- A step whose count couldn't be parsed draws its statement with no bar (section 10, row 1).
- Note: "Each step only shows when its count clears the engine's floor." Stated only when `stopped_at` is null.
- Player: drawn when `calls.playerFunnel` (default on). Coach: always when stored.
- Replaces today's narrowing chips on the coach card (`PathLine` chips, `parts.tsx:25`) on this page only.

### 4.2 Why CoachHelm thinks so: `WhyCard`

- Meta: "Counted", "Likely" (coach) or "Not traced yet".
- State track: three steps, labels "Not traced", "Likely, from totals" (player: "Likely (coach only)"), "Counted in shots"; index from `cause.track`.
- Likely, coach: two rows of dots (one dot per attempt, filled per failure) with "{failures} of {n} missed · {pct}%"; the verdict box "Likely, from the totals." plus the lift sentence and `range`, then "No shot path is counted yet, so this is not a measured cause."
- Likely, player: the verdict box "Not traced yet." with the observed sentence. No arms (Q3).
- Counted: path nodes with icons (tee, water, card from `Icon`), the hit node in loss; "{count}." plus "Each one cost about {x} strokes." from `event_strokes` (absolute value, one decimal; left out when null); "Counted in {first}'s recorded shots on these holes."; hole chips from `ChDiveHole` ("Oct 24 · hole 7"), each a link to its round review (`href`).
- Not traced, data gap: a meter of `target_count + have_count` cells with `have_count` filled ("4 of 10"); the gap sentence; "Nothing new is asked during a round. It fills from the misses that already have a side."
- Not traced, count-down: "{have} of the {need} {population} it needs" and rounds, as `pathLineFor` words it (115-121).
- Not traced, `load_failed`: "Shot records could not be read this run" (`coachhelm-path.ts:114`).
- Legacy rows (no `evidence.cause`): today's drivers list, as `Why` draws it (`DeepDive.tsx:244-288`), in this card's markup.

### 4.3 How sure: `SureCard`

- Title "How sure", meta the confidence word.
- Three rows, each only when derivable: Sample ("28 of the 30 approaches it needs"), Recent ("All 9 rounds inside 90 days"), Shot record ("26 of 28 holes, lie missing on 2" from `cause.checked`). Bar fill by `scaleX`, neutral below 80%.
- "What CoachHelm checked": the cleaned `diagnosis.basis.checked` list.
- Coach only: the claim rung and range with a "Coach only" chip (`engine.support`; `player-projection.ts` already strips it for players).
- Coach only, kept from Deep dive so nothing is removed: `CorrectionChips` (`screens/coachhelm/Corrections.tsx:59`) under the rung, when the loader put corrections on the read. Not drawn on the design page; listed in the PR under "Can't match as drawn" with the reason.

### 4.4 How it has moved: `MovedCard`

- Title "How it has moved", meta the window ("Jul 27 to Oct 24") only when both dates exist (section 10, row 6).
- A two-point slope (from, to) against the reference line (Tour, or the player's other side for a self comparison); the change sentence in loss or gain ink (`movementFor` text); the category trend chip from `ChDiveTheme` ("Approach strokes gained −0.42 a round · Slipping").
- No series is invented: two stored points only. No movement: "No trend yet" (CH-13383 wording). Themes failed: the notice inside the card (new code, same words as CH-13283).

### 4.5 The rounds behind it: `RoundsCard`

- Title "The rounds behind it", meta "{total} rounds".
- First 4 rows; "Show all {n}" opens the rest in place (up to `DIVE_ROUNDS_SHOWN` 8, `coachhelm-dive-shape.ts:32`). Each row: date, course, score and to par; a dot per counted hole from that round ("2 counted holes") or "Counted in the read"; a chevron to the round review.
- Failed: "The rounds behind this read didn't load" and its body, as CH-13281 words it, inside the card. None listed: CH-13382 wording.

### 4.6 What to do: `DoCard`

- Title "What to do", meta "This week".
- Drill: icon tile, name, meta ("15 min · intermediate"), text (`ChHelmWeek`). No drill: "No drill assigned." (`coachhelm-read-shape.ts`, `NO_DRILL`).
- Two figures: "Worth {x} a round" and "Starts from {value}". After an assign or for a focus already made: "Focus verdict" and "Target" only when `engine.verdict` exists (section 10, row 5); otherwise the proposed line.
- Coach actions: Assign as focus (primary). The gating copies `FocusActions` (`parts.tsx:392-466`) branch by branch: dismissed (CH-13901 with Undo), note (CH-13904), assigned (CH-13601 "Assigned as {first}'s focus"), status unknown (CH-13207), stale (no Assign, CH-13906), declined ("Propose again", CH-13907), proposed ("{first} sees it as a proposal and accepts it to start."). It calls `useFocusActions(writes).assign.run(target)` with the same `ChFocusTarget` (`parts.tsx:290`), so the args `createFocusAreaFromInsightV2` receives (`development.ts:1736`) are identical. Put the branch logic in a pure `assignStateOf(ins, fa, missing)` in `read/DoCard.tsx` and test it against `FocusActions`' render for every branch, so the two can't drift without a failing test.
- Dismiss and Undo: in the More menu of the pushed bar (coach only), calling `fa.dismiss.run(target)` with the warning haptic first (CH-13703) and the dismissed notice with Undo in the DoCard. Not drawn on the design page; kept so the coach can still dismiss from the read.
- Links row: "Message {first}" (coach; `rebuiltHref('/golf/dashboard/messages?player=…', 'coach')`, as `DeepDive.tsx:450`; no prefill, so nothing is put in a message the coach didn't write) and "Ask CoachHelm about this" (section 4.7).
- Plan line: dot plus "Not part of a focus area or goal yet." (player: "… Your coach can make it one."), or the plan line from `ChDivePlan` ("Focus area · Active · from this read.").
- "Add to practice plan": drawn only when `practiceHref` is non-null (the practice builder lane); null today.

### 4.7 Ask about this read

The Ask lane has no entry that takes a read at 75b4956: the Ask sheet is "never on CoachHelm itself" (`shell/AskSheet.tsx`, `AskSheetButton`), and `?view=ask` (`chat/SubTabs.tsx:6`) carries no context. This lane calls the Ask lane's entry and does not build it:
- Agreement needed (Ask lane, lane 4): an exported `askAboutReadHref({ insightId, playerId | null })` (or a hook) that opens Ask with the read attached. Lane 1's sheet needs the same.
- Until it exists, `todo.askHref` is null and the link isn't drawn (no half feature). A player's link also needs the Ask lane's player switch on.

### 4.8 PR 2 tests

- each card is absent, not empty, when its data is absent (one test per card)
- funnel: bar shares equal `n / steps[0].n`; a step with `n: null` draws text only; a stopped narrowing ends on the last passed step
- why: track index per state; arms dots count `n` and filled `failures`; player never gets arms (DOM and payload); count-down and data gap words match `pathLineFor`'s
- sure: no Recent row when `factors_measured === false` and no round dates; rung only for a coach
- moved: no date labels when the movement carries none
- rounds: "Show all" appears only past 4; failed notice inside the card
- do: `assignStateOf` matches `FocusActions` for dismissed, note, assigned, unknown, stale, declined and proposed; Assign calls `writes.assign` with the exact args `FocusActions` sends (spy on `ChCoachHelmWrites`); duplicate (`ACTIVE_FOCUS_DUPLICATE_ERROR`) shows Assigned with the toast; failwrites shows CH-13001
- exactly one `.ch-hr-feat` on the page
- no element under `.ch-hr-` has a left border wider than 1px (CSS text test like the existing quality ones)

Acceptance: every card against the design at 390 and 430, light and dark, for the three reads, coach and player; Assign, Dismiss and Undo behave as on the coach Deep dive today; every figure carries its count; the player view shows no guessed cause.

---

## 5. PR 3: Desktop three-column

Today: Deep dive's desktop is a rail plus dossier (`.ch-hd-rail`, `.ch-hd-main`, `DeepDive.tsx:798-808`); the coach finds a player's reads one player at a time.

Change, in `ReadPage` (desktop, `useChPhone()` false):
- `.ch-hr-desk`: `ReadsRail` (250px, settled in 06 §14; was 300) | the story column (headline, Where, Why, What to do) | the evidence column (How sure, How it has moved, The rounds behind it), as `renderDesk` draws it.
- `ReadsRail`: a card with the avatar coin and name ("Your reads" for a player), "{n} reads · {needs} need work" (`counts`), then groups in hole order from `DIVE_AREAS` (Off the tee, Approach, Around the green, Putting, Course and scoring). Each row: tone dot, title, "{stance} · {tier}" (tier only for a coach on a likely or counted read), value. The current read has `aria-current="page"`.
- A rail row is a `Link` to `readHref(player, id, true)` with `replace` and `scroll={false}`. The route's single Suspense keeps the page on screen until the next read is ready (`routes/coachhelm.tsx` header comment, 49-56). Each read page view records only the read it shows (section 3.4); rail titles are not counted as shown.
- Cleared reads stay in their area as one line, up to three, then "N more cleared" (`DIVE_CLEARED_SHOWN`, `clearedShown`, `coachhelm-dive-shape.ts:124, 522`).
- Crumbs: `usePageCrumbs` (`shell/crumbs.tsx:22`) gives "CoachHelm › Priya Natarajan › Approach" in today's glass bar. The design's two glass-bar buttons ("Ask about this read", "Message Priya") can't go in the glass bar without editing `TopBar.tsx` (section 10, row 7). They render as a right-aligned action row at the top of the story column, above the headline, in the page's own markup.
- Breakpoint: three columns from 1180px; between 821 and 1179 the evidence column moves under the story column; at 820 and below the phone layout.

Tests: column order per viewport; rail groups in hole order; a rail tap replaces the address and never pushes history; `aria-current` on the open read; no horizontal scroll at 1280 and 1024.

Acceptance: desktop shots against `renderDesk` at 1280, light and dark, coach and player; the sidebar and glass top bar match a Stats screenshot unchanged.

---

## 6. PR 4: Summary card export and lane hand-off

### 6.1 What this lane exports

- `ReadSummaryCard` (`read/ReadSummaryCard.tsx`): the Board card design. Green, the whole card is the tap target (`role="link"`, Enter and Space), press 0.97. Rows: "{first} · {area}" with the stance word; title; hero figure and note; `ReadLadder` on green; the cause line with its tier chip ("Counted", "Likely", "Not traced"; player "Seen in your shots", "Where", "Not traced") and its count (a player's likely line shows no count); foot "Worth about {x} a round" and "{sample} · {rounds} · {firm}"; "Open the read ›". No worth line without strokes.
- `ReadLadder` (`read/ReadLadder.tsx`): the ladder alone, for any head.
- `toChReadSummary(raw, base, viewer, calls)` in `coachhelm-read-view-shape.ts`: pure, runs on the server beside `toChInsight`. The hosts' loaders call it; `ChInsight` is not changed.
- `ChReadSummary` type.

Assign and Dismiss stay under the card in the host (lane 1's board, Lenses' file) as `FocusActions`; the card holds no write.

### 6.2 Who uses it

| Host | Where | What they do |
|---|---|---|
| Lane 1, team board | their read sheet head and any feature card on the team board | call `toChReadSummary` in `data/coachhelm.ts` where the board calls `toChInsight`; render `ReadSummaryCard` with `href = readHref(playerId, id, readOn)` |
| Lenses | `file/FeatureCard.tsx` and `file/EvidenceSheet.tsx` head; "Open the full read" on file rows | same; `readOn` passed from `CoachPlayerFilePage` |
| Lenses PR 6 | `PlayerBoard.tsx` rebuilt as "Your week" | player voice, `readHref(null, id, readOn)` |

### 6.3 R10: one sheet for one read (cross-lane agreement needed)

Lane 1 plans a read sheet ("Open the full read goes to the read redesign"; it names `ui/Sheet`, which doesn't exist at 75b4956: the house sheets are `ui/Modal.tsx` with `.ch-grab` and `ui/FormSheet.tsx`). Lenses plans `file/EvidenceSheet.tsx` reusing the Deep dive parts. Agreement to write into both lanes' PRs:
- one peek component for one read, owned by Lenses (`EvidenceSheet`, their PR 1), imported by lane 1
- its head is `ReadSummaryCard` in a compact variant (`variant="sheet"`: no "Open the read" row, no press) plus `ReadLadder`; sample, window and read word stay one tap away (Lenses' evidence chips)
- its body is a short peek; the full evidence lives on the read page, reached by "Open the full read" (`readHref`)
- whichever lands second imports the first; if Lenses lands before PR 4, it ships its own head and swaps to `ReadSummaryCard` in a follow-up

Tests: `toChReadSummary` gives the same title, value, ladder and worth as `toChReadDetail` for the same row (a summary never shows a different number from its detail); the card is one tab stop and opens on Enter and Space; a player's likely read shows "Where" and no count; preview `screen=board` shots against the design's Board card.

Acceptance: board card shots per read, coach and player, light and dark; R10 written in this PR's description and linked from both lanes.

---

## 7. PR 5: Motion and states

### 7.1 Push and press

- Board card to read: press 0.97 for 110ms down on `--ch-ease`, release 280ms; then the house push (462ms `--ch-ease-spring-smooth`, incoming 100% to 0, outgoing by `CH_UNDERLAY_SHIFT` with `--ch-push-dim`). The push is the route push (`lib/nav-motion.ts` `playPush`, 302), which needs the query-aware classification:
  - `classifyNav` (24): when `strip(a) === strip(b)` and the path is a page with sub-views, compare the `view` search param: board (none) to a detail view is `'push'`; the reverse, or `back`, is `'pop'`. Scope it with an explicit list (`/golf/dashboard/coachhelm`: `read`, `player`, `deep-dive`, `standing`, `profile`) so no other page changes.
  - its own commit, a `docs/clubhouse/changes/` fragment, tests in `src/clubhouse/__tests__/native-nav.test.tsx` beside the existing ones (27-45)
  - agree with Lenses first (their `?view=player` push has the same gap)
- `CH_UNDERLAY_SHIFT` is 0.24 (24%); the design and DESIGN_LANGUAGE say −30%. Use the shared constant (BUILD_BRIEF PR 4b uses 0.24) and list the difference under "Can't match as drawn" for Nick.
- Back pops with the same spring; the edge swipe works through `use-route-swipe.ts` as today.

### 7.2 Marks that play once

`useInViewOnce` (`lib/use-in-view.ts:9`) starts each once, the first time its card scrolls into view; never on re-render, never a count-up.
- Funnel: bars are full width and scale `scaleX(0)` to `scaleX(share)` from the left, all together, 360ms `--ch-ease`; the last bar that passed is loss. `transform` only (the polished design page already does this; `css-quality` blocks width transitions).
- Ladder span and sure bars: `scaleX` from the left, 360ms `--ch-ease` (DESIGN_LANGUAGE chart marks).
- Dots (likely): all together, 360ms `--ch-ease`, `transform: scale(.4)` to 1 and opacity 0 to 1.
- Path (counted): nodes `scale(.7)` to 1 with opacity, connectors `scaleX(0)` to 1, all together, 360ms `--ch-ease`.
- No staggers and no overshoot anywhere (updated 31 Oct to match the polished design page, version 2, and DESIGN_LANGUAGE section 8).

### 7.3 Assign

Button holds the spinner (`Button busy`) while the save runs; on success it becomes the Assigned chip with a tick drawn by `stroke-dashoffset` over 360ms; the DoCard flashes once (opacity only, no box-shadow animation); success haptic from `useAction`. The plan line updates in place through `Swap` (`ui/Swap.tsx`).

### 7.4 Reduce Motion

Every move becomes an opacity crossfade; funnel, dots, path and ladder draw at rest. The value is one shared number, and today there are three: DESIGN_LANGUAGE and lane 1 say 120ms (PR 1's `--ch-dur-crossfade-rm`), Lenses uses `CH_FADE_MS` (180ms, `lib/motion.ts:45`, `CH_DUR.quick`). Build with `var(--ch-dur-crossfade-rm, 120ms)` in CSS and one JS constant, and ask the foundation owner to settle it once for every lane (R7). `[data-motion='off']` zeroes everything (`tokens.css:1090-1108`).

### 7.5 States

Each drawn in its own words, never as a missing card or a zero. All exist in the code today.

| State | Source | How it draws |
|---|---|---|
| Out of date | `ChInsight.stale`, `ChRead.when.stale` (CH-13903) | headline title in secondary ink, the CH-13903 sentence under the lede, ladder kept, no Assign (CH-13906) |
| Count-down | `cause.not_traced_reason === 'count_down'` | WhyCard count-down row; a ring of `have/need` in the state cards; "Four more and it reads." only with real counts |
| Cleared | `ChDiveCleared` (`coachhelm_recheck_v1`) | a read opened by id that the recheck cleared draws "Cleared {date}" with the recheck's numbers and no actions; in the rail as one line |
| Contradicted | `engine.lifecycle.word` with `COACH_FIRST_MS` | coach sees it at once with the read it conflicts with (`lifecycle.pair`); player after a day |
| Under review | `engine.lifecycle.word === 'Under review'` | a chip on the headline; "It stays visible but is not on your focus" for the player |
| Didn't load (one part) | `failed.rounds/themes/plans`, `missing` | the notice inside the card that would hold it; two or more said once under the headline with one Try again, as `PageRefreshNotice` does in Deep dive |
| Long names | fixture `long` | names wrap, never truncate in titles; rail rows clamp to two lines with the full name in `title` |
| Text Size XXL | `--ch-type-k` at its cap | cards grow; ladder labels move under the track; no clipping at 390 |

Tests: Playwright with `reducedMotion: 'reduce'` asserts no transform transition runs and opacity transitions are at most the shared value; the funnel animates once (a second scroll into view doesn't restart it); `native-nav.test.tsx` cases for board to read (push), read to board with back (pop), read to read (fade), and an unrelated page unchanged; a unit test per state above.

Acceptance: clips of open, narrow, trace and assign beside the design page's Play buttons, both motion settings; every state card against the design's "Every state a read can be in".

---

## 8. PR 6: Tests and capture

- `e2e/clubhouse-quality.spec.ts` (198 lines): append one `test.describe('CoachHelm read')` block at the end (the file is already in `testMatch`). At 390x844, 430x932 and 1280x800, both motion settings: no horizontal scroll; the green bar matches the board's computed background; Back returns to the board at the same scroll; the read page has one feature card; flag-off routes render the board.
- `capture/capture.mjs` in this folder (as Messages and Lenses have): `design` shoots the design page per read, viewer and screen; `app` shoots `/clubhouse-preview/coachhelm-read` for every state; `compare` puts them side by side. Add these hooks for the script, and nothing else depends on them: `data-ch-hr-page` on the ReadPage root, `data-ch-hr-card="where|why|sure|moved|rounds|do"` on each card, `data-ch-hr-open` on the Board summary card, `data-ch-hr-assign`, `data-ch-hr-rail` on rail rows and `data-ch-hr-more` on Show all.
- Motion clips with Playwright `recordVideo` at 390 for open, narrow, trace and assign, beside the design page's.
- Contrast: add assertions to `src/clubhouse/__tests__/contrast-tokens.test.ts` only if a new text colour is introduced (none planned).

Acceptance: every state from section 3.9 shot and compared; the PR lists each difference as matches, fixed or can't match.

---

## 9. Today's code, piece by piece

What happens to each part of today's read. "Kept" means unchanged with the flag on or off. Nothing is deleted in this plan; deletions wait for the cleanup PR.

| Today | File:line | On the read page | Change to the file in this plan |
|---|---|---|---|
| `Dossier` header, stance pill, `SerifText` title | `views/DeepDive.tsx:445-537` (title 470, 486) | `ReadHeadline`, Instrument Sans | kept; serif removal in the cleanup PR (flag-off parity) |
| `Read` (What, Why, Next, When lines) | `DeepDive.tsx:331-390`, `data/coachhelm-read-shape.ts` | headline foot (sample, firm, through), WhyCard words, DoCard drill | kept; `toChRead`/`ChRead.when` reused by the shaper |
| `Section` "What was measured" + `Evidence` | `DeepDive.tsx:115, 515-525`, `parts.tsx:78` | hero figure and `ReadLadder` | kept |
| `Trend` | `DeepDive.tsx:127-185` (CH-13283, CH-13383) | `MovedCard` | kept |
| `Rounds`, `RoundRow`, `Strip` | `DeepDive.tsx:187-242, 92` (CH-13281, CH-13382) | `RoundsCard`; the to-par strip isn't on the design | kept; strip not drawn on the read (listed under can't match) |
| `Why` (drivers, reason, write-up) | `DeepDive.tsx:244-288` | WhyCard `legacy` branch only | kept |
| `Where` (example holes) | `DeepDive.tsx:290-327` (CH-13996) | WhyCard hole chips, RoundsCard dots | kept |
| `Plan` | `DeepDive.tsx:392-438` (CH-13282, CH-13384) | DoCard plan line | kept |
| `Hero`, `Ledger`, `Item`, `ClearedRow` | `DeepDive.tsx:640, 595, 542, 578` | `ReadsRail` (desktop) | kept |
| `EngineState` | `EngineState.tsx:29-92` | WhyCard (cause), SureCard (support), lifecycle chip, DoCard (verdict) | kept |
| `WhyAudit` | `EngineState.tsx:94-115` | SureCard checked list (from `basis.checked`), coach rung | kept |
| `ClearedLines` | `EngineState.tsx:117` | rail cleared lines | kept |
| `FocusCard` (green card, "Why we think this" fold) | `parts.tsx:130-199` | replaced on lane 1's and Lenses' screens by `ReadSummaryCard`; not edited here | kept |
| `PathLine` and narrowing chips | `parts.tsx:25` | WhereCard funnel, WhyCard | kept |
| `useFocusActions` | `parts.tsx:306-372` | imported by DoCard | kept |
| `FocusActions` | `parts.tsx:392-466` | DoCard copies its branches (tested for parity); Dismiss in More | kept |
| `CorrectionChips` | `Corrections.tsx:59` | SureCard, coach only | kept |
| `styles/coachhelm-dive.css` (1334 lines): read 216, four lines 242, measured 325, moved 372, where 444, rounds 504, why 588, plan 669, phone 810, pushed screen 872, mobile pass 1009, dark 1208, contrast 1235 | | nothing; the read uses `coachhelm-read.css` | kept |
| `styles/coachhelm.css` `.ch-hl-focus*`, `.ch-hl-why*` | | nothing | kept |

---

## 10. Can't build as drawn (each with its fix)

None needs a migration or an engine change. Coordinate each data row with `03-DATA-CHECKS.md` (section 14).

| Drawn | Why not | Build instead |
|---|---|---|
| 1. Funnel counts (28, 16, 12, 9) | `DiagnosisNarrowing.steps` stores `{level, passed, label, statement}` only (`types.ts:510-519`); `toDiagnosisNarrowing` drops the in-memory `attempts`/`failures` (`root-cause.ts:895-916`). The numbers live only in the statement text, and the par step has two templates: "{f} of {failures} {noun} came on {label} (…)" (share) and "on {label} {f} of {attempts} {phrase} (…)" (rate) (`context-narrowing.ts:456-458`). The shape step's "N of M" counts misses with a recorded direction, not the short-right misses. | Option A (default): a strict pure parser `funnelOf` keyed to the three templates, tested against strings generated by `context-narrowing.ts` itself; a step it can't parse draws its statement with no bar. The shape bar uses the count the template states and its label says what it counts. Option B: an additive `counts` field on each stored step (engine change, forward-only, owner sign-off; not this lane). |
| 2. A nested funnel (each bar a subset of the one above) | With the rate template the par step's count is of attempts on that slice, not of the misses above it. | Bars are scaled to the first step's count and each row states its own denominator; no row implies a subset it isn't. |
| 3. "What CoachHelm checked" as short labels ("Length of the approach") | `basis.checked` holds engine lines: "length: 16 of 28 approaches from 175+ yd missed the green (9 rounds)", "12 of 14 holes have complete shot records", "A5 {family}: candidate" (`root-cause.ts:1255-1269`). The preview fixture's short labels (`fixtures-coachhelm-path.ts:83`) are not what the engine writes. | A pure label map by narrowing level and subject ("Length of the approach", "Par and length of the hole", "Where the miss finished"; tee and par-scoring variants), then the count lines verbatim; A5 lines stay coach-only in the rung row. Fix the fixture to engine strings. |
| 4. "Recent: all 9 rounds inside 90 days" | `confidence_factors.recency` is a placeholder (1.0) on v3 rows with `factors_measured === false` (`types.ts:122-142`). | Use recency only when `factors_measured !== false`; else count the listed rounds' dates inside the window; with neither, leave the row out. |
| 5. After Assign: "Focus verdict: Too early to call" and a target | Assign inserts a proposed focus (`createFocusAreaFromInsightV2`, status 'proposed'); verdict rows exist only for an active focus once the verdict job runs (`readFocusVerdicts`, `coachhelm_verdicts_v1`). | After Assign: the Assigned chip and "{first} sees it as a proposal and accepts it to start." Verdict and target (`engine.verdict.target`) only for a focus that has one. |
| 6. Slope labels "Jul 27" and "Oct 24" | `metadata.movement` has `from`, `to`, `direction`, `percent_change`, no dates (`types.ts:521-526`). | Left point "Earlier", right point "Through {date}" from `ChRead.when.through`; the meta shows a window only when one is stored. |
| 7. "Ask about this read" and "Message Priya" in the desktop glass bar | `TopBar.tsx` is frozen and has no page-action slot. | An action row at the top of the story column (section 5). |
| 8. Ask with the read attached | No Ask entry takes a read at 75b4956 (section 4.7). | Not drawn until the Ask lane exports its entry. |
| 9. "23 pts below his level putts", "his own level putts" | The roster stores no pronoun; the house rule is the name (`coachhelm-path.ts:61`). | "below Jonah's level putts"; a test bans he, she, him, her and his in shaped copy. |
| 10. Board slides to −30% | `CH_UNDERLAY_SHIFT` is 0.24 (`phone-chrome.tsx:183`). | Use 0.24; Nick decides whether the shared constant moves. |
| 11. Funnel bars grow by width | `css-quality` blocks width transitions. | `scaleX` from the left (section 7.2). |
| 12. Reduce Motion at 120ms | Lenses uses 180ms; `--ch-dur-crossfade-rm` isn't in tokens yet. | Settled 3 Nov: `CH_FADE_MS` (180ms today), per SHARED-6 (R7). |
| 13. Board card push | A query-only navigation is a fade (`classifyNav`). | The query-aware rule (section 7.1), agreed with Lenses. |
| 14. Rounds card dots for every round | Example holes are capped at 5 (`cause.example_holes`, `types.ts:394`) and exist only for a counted cause. | Dots only on rounds with an example hole; other rows read "Counted in the read". |
| 15. To-par strip | Not on the design; Deep dive draws it. | Not drawn on the read; listed so Nick sees it was left out on purpose (the rounds list carries the same rounds). |
| 16. Team pool line on every read | The engine writes it only with `coachhelm_team_pool_v1` on, for five families, above its floors (flag purpose, `feature-flags.yml:710-722`). | Ladder shows the player and the Tour (or the player's other side) when no team line exists; owner call 3 default. |

Things that build but need new pure code (no migration): `funnelOf`, the checked-label map, `benchmarkLadder`, `readCauseOf`, `sureOf`, `railOf`, `toChReadSummary`, `assignStateOf`.

---

## 11. Overlap with other lanes, and how to avoid conflicts

| File or piece | Who else | This plan's edit | How to avoid a conflict |
|---|---|---|---|
| `routes/coachhelm.tsx` | Lenses (branch before 190, CSS import), lane 1, Ask | one block after 189, one in the player branch before 225, one CSS import after 41 | read block first, Lenses' file block second; small, early in the function; rebase |
| `src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx:199` | Lenses (adds `insight`, `at`, `from`) | adds `insight` | same line; second to land rebases (or let Lenses' line carry `insight`) |
| `data/coachhelm-views-shape.ts` | Lenses (`playerFileHref`, `PlayerFileCard`, `FILE_BYPASS`), Ask (`coachReadHref`), lane 1 | `READ_VIEW`, `readHref` appended | additive at the end; don't touch `coachReadHref` |
| `data/coachhelm-player.ts` | Lenses (Standing seam 171-186) | `coachDiveCore` split of 187-269 | different functions; behaviour-equal test |
| `data/coachhelm-dive.ts` | possibly lane 1 | `playerDiveCore` split of 103-194 | behaviour-equal test; Lenses' plan doesn't edit it except its PR 0 goals fix in `readPlans` (53-71), which is a different function |
| `screens/coachhelm/views/DeepDive.tsx` | Lenses (`export` on six functions) | none | no conflict |
| `screens/coachhelm/parts.tsx` | lane 1 | none; imports `useFocusActions` | none |
| `screens/coachhelm/CoachBoard.tsx` | lane 1 | none | lane 1 renders `ReadSummaryCard` and links with `readHref` |
| `screens/coachhelm/PlayerBoard.tsx` | Lenses PR 6, lane 1 | none | Lenses renders `ReadSummaryCard` in "Your week" |
| lane 1 read sheet, Lenses `EvidenceSheet` | lane 1, Lenses | none; exports the head pieces | R10 agreement (section 6.3) |
| `data/coachhelm.ts` (board loader) | lane 1, Lenses PR 6 | none | lane 1 calls `toChReadSummary` where it calls `toChInsight` and passes `readOn` |
| `lib/nav-motion.ts` `classifyNav` | Lenses (same gap), every pushed page | PR 5: coachhelm-scoped query rule | its own commit and fragment; agree with Lenses; tests for unrelated pages unchanged |
| `lib/motion.ts`, `tokens.css` Reduce Motion value | foundation (BUILD_BRIEF PR 1, PR 12), Lenses (180ms), lane 1 (120ms) | none | one shared value (R7) |
| `tokens.css` semantic tokens | foundation PR 1; Lenses' plan assumes they exist | none | land PR 1 first, or carry its block exactly (section 2, item 4) |
| Ask entry with a read attached | Ask lane (lane 4), lane 1 | none; calls it | Ask exports `askAboutReadHref`; until then not drawn |
| `shell/AskSheet.tsx`, quick chat (lane 5) | lane 5 | none | the read page doesn't add a bar key |
| Practice plan lane | practice lane | none | "Add to practice plan" only when its href is non-null |
| Messages lane (11a-11g) | Messages | none; links to `/golf/dashboard/messages?player=` | the compose link keeps working after 11f; `prefill.ts` not used |
| Stats lane (`data/stats-reads.ts:73, 89`) | Stats | none | its `coachReadHref` links stay on Deep dive until the cleanup PR |
| Roster lane (`RosterPeek.tsx:296`, `Roster.tsx:364`) | classes-roster-home | none | untouched |
| `chat/Evidence.tsx:173` (`coachReadHref`) | Ask | none | stays on Deep dive; Ask may switch to `readHref` with `readOn` |
| `src/app/clubhouse-preview/[screen]/page.tsx` | every lane | one registry entry next to 577, one CSS import, one doc line | add beside `coachhelm-coach-player` |
| `config/clubhouse/pages/P013-coachhelm.json` | every P013 lane | `implementation.also` adds three data files | rebase right before merge |
| `config/feature-flags.yml`, `registry.generated.ts` | anyone adding a flag | one entry | regenerate after rebase |
| `scripts/clubhouse/a11y.mjs`, `aesthetic-capture.mjs` | every lane | one route each | append at the end |
| `e2e/clubhouse-quality.spec.ts` | every lane | one appended describe | append at the end |
| `src/clubhouse/preview/component-catalog.json` | generated | regenerated | `npm run clubhouse:catalog` after rebase |
| CH-13xxx codes | Lenses ("next free") | CH-13861 to CH-13869 (fixed 4 Nov wiring: CH-13860 is taken; Lenses takes CH-13760 to CH-13779) | agree blocks (section 3.10) |

New files (no conflict): `src/lib/coachhelm/v3/read/flag.ts`; `data/coachhelm-read-view-shape.ts`, `data/coachhelm-read-view.ts`, `data/coachhelm-read-calls.ts`; `screens/coachhelm/read/ReadPage.tsx`, `ReadHeadline.tsx`, `WhereCard.tsx`, `WhyCard.tsx`, `SureCard.tsx`, `MovedCard.tsx`, `RoundsCard.tsx`, `DoCard.tsx`, `ReadSummaryCard.tsx`, `ReadLadder.tsx`, `ReadsRail.tsx`, `ReadSkeleton.tsx`; `styles/coachhelm-read.css`; `preview/PreviewCoachHelmRead.tsx`, `preview/fixtures-coachhelm-read.ts`; tests; changelog fragments; `coachhelm-read/capture/capture.mjs`.

---

## 12. Risks

- R1 A guessed cause reaching a player. The player feed returns `cause.alternatives` verbatim (`player-projection.ts` strips only the support keys). Guard: the shaper never builds arms, verdict, range or rung for a player viewer, and a payload test asserts the keys are absent.
- R2 Exposure counts on the player read. A second page view records `player_feed` exposures. Guard: `drawn: () => [insightId]`, so one read page view records exactly the read shown; rail titles aren't counted (an under-count, never a false "Seen").
- R3 Coach exposure parity. `getInsightsForCoach` records `coach_feed` for every row it returns, as opening Deep dive does today. On a phone read page that over-counts the rows not shown. No change here (engine file); flag to the engine owners that a `drawnLater` on the coach feed would fix it for Deep dive, Lenses and this page alike.
- R4 Parser drift. If the engine's narrowing wording changes, `funnelOf` stops parsing and steps fall back to text. Guard: the parser test generates its input from `context-narrowing.ts`, so a wording change fails CI rather than the screen.
- R5 Flag off parity. Three files change behaviour-equal (the two loader splits, the route). Guard: deep-equal loader tests and flag-off Playwright screenshots of board, Deep dive and Standing.
- R6 Shared push rule. Changing `classifyNav` touches every phone navigation. Guard: scope to one path and a view list; existing `native-nav.test.tsx` cases unchanged; Lenses agrees first.
- R7 Three Reduce Motion values (120ms, 180ms, and the page's 60ms in Lenses). Settled 3 Nov: `CH_FADE_MS` from `lib/motion.ts` (180ms today), per SHARED-6; no lane variable.
- R8 Tokens not landed. Without BUILD_BRIEF PR 1 the cards have no `--ch-card-bg`, `--ch-loss` or feature inks. Guard: PR 1 first, or carry its block exactly.
- R9 Two read sheets (R10 in Lenses). Guard: the section 6.3 agreement before either sheet merges.
- R10 A summary that disagrees with its detail. Guard: `toChReadSummary` and `toChReadDetail` share the ladder, worth and value functions, with a test.
- R11 Fixture strings unlike the engine's (`approachNarrowed`). Guard: fixtures generated from engine functions.
- R12 Actions on green. The DoCard is on paper, so `FocusActions`' paper styles fit; the Board card holds no buttons. No on-green button styles needed in this lane.
- R13 Catalog. No `clubhouse:catalog` was run for this plan; every PR regenerates after rebase.

---

## 13. Acceptance per PR

Every PR:
- flag off: every CoachHelm address renders as at 75b4956 (board, Deep dive, Standing; coach and player)
- 390 and 430 phones plus 1280 desktop: no horizontal scroll, 16 and 20px gutters
- Text Size XXL: nothing clips, cards grow
- Reduce Motion and `[data-motion='off']`: nothing travels; crossfade at the shared value only
- AA contrast on paper and on green, light and dark (4.5:1 text, 3:1 marks)
- no left border wider than 1px under `.ch-hr-`; one card style; titles inside cards; one green feature card per view
- every figure carries its count, sample and window; a player sees no guessed cause
- the green phone bar, sidebar and glass top bar match a Stats screenshot
- `clubhouse:catalog -- --check`, `clubhouse:css`, `flags:check`, `npm test`, lint, typecheck and `playwright.clubhouse.config.ts` pass; changelog fragment present
- fidelity check attached: shots and clips beside the design page, every difference explained

Per PR:
- PR 1: the route branches by flag as specified; `readHref` off equals today's addresses; loader splits behaviour-equal; one feed call per view; the headline matches the design
- PR 2: each card matches the design for the three reads, coach and player; Assign, Dismiss and Undo identical to the coach Deep dive; cards absent when their data is absent
- PR 3: three columns as drawn; rail grouped by hole; rail taps replace, not push
- PR 4: the board card matches the design; R10 agreed in writing; summary equals detail
- PR 5: push, press, funnel, dots, path and Assign match the design's clips; every state matches its card; Reduce Motion clean
- PR 6: every preview state shot and compared; the Playwright block green in both motion settings

---

## 14. Reconciled with `03-DATA-CHECKS.md`

`03-DATA-CHECKS.md` landed after this plan was first written. Reconciled 31 Oct. Where the two differ, the data map wins on what a figure can say and this plan wins on where the code goes.

The seven figures this plan derived:
1. Funnel counts parsed from narrowing statements: confirmed as PLUMB (keep each step's statement and count in the shaper). The shape step has no joint count: draw it as words with both per-axis counts ("9 of 12 short, 8 of 11 right"), never a fourth bar (data map Missing 4).
2. "N of the M it needs": coach only. Players get the sample with no target ("28 approaches") (Missing 8).
3. Recency: draw it as a share with the engine's window ("most rounds in the last 45 days") and only when `confidence_factors.factors_measured` is true; hide the bar otherwise (Missing 9). Do not derive it from round dates.
4. "Each one cost about X": replaced. Draw "On average a penalty hole cost about X strokes (across N)" with N from the strokes driver's `sample_n`, absolute value, "cost" only when negative, nothing when null, never attached to the path (data map, event_strokes section).
5. Team pool note: confirmed. Find the `team_pool` line in `comparison.lines`, not only `primary` (`teamPoolLine` misses appended lines). Gate on the row carrying the line, not on the render-time flag. Never pair it with "closed to the team average" (a different number).
6. Counted holes per round from `cause.example_holes`: confirmed, capped at 5.
7. Checked-label map: confirmed. For "lie missing on 2" draw "Checked 26 of 28 holes. Miss direction is thin." from `checked` and `fields_missing` (Missing 10).

Also from the data map, all now built into the design page (version 3, republished 31 Oct):
- "estimated from strokes gained" becomes "estimated" (Missing 2). The putts read's worth has no own-level anchor: "Worth about 0.3 strokes a round" (Missing 3).
- Data gap meter: `target_count` is still-needed, so have 4 and target 10 draws 14 cells, 4 filled, "4 tagged, 10 more to go" (Missing 6). The line under it is "Tag it when you enter the round. Nothing else changes." because `coachhelm_data_gap_prompt_v1` asks at round entry (Missing 7). Shot tracking itself is unchanged.
- Movement: "Before" and "Now", header "Last change" (Missing 11). Today's `Trend` label "Since it was first seen" becomes "Last change" too.
- Rounds: "Newest 8 of 9" (Missing 12).
- Verdict, target and grading on the three demo reads: drawn only when `verdictOf` returns one (catalog metrics only); the early word is "Too early" (Missing 13 to 15).
- Penalties trend chip uses the read's own category theme (course management), not off the tee.
- The approach Board cause line shows the likely slice alone, not joined with the shape count.
- "since Sep 20" reads "Read from Sep 20".
- The cause interval sits under Why; the claim range under How sure, coach only. They are different tests and never share a sentence.

New PR 0, before PR 1 (one small commit, flag independent): the player leak at 75b4956. `diagnosisFor` (`data/coachhelm-dive-shape.ts` 328-350) keeps the drivers whatever the viewer, and the Deep dive's Why section draws them (`views/DeepDive.tsx` 248-270). For a likely cause those drivers are the two arms that make the guess, so a player sees "Not traced yet" above the numbers behind it. Fix: in `diagnosisFor`, drop the drivers when the level is `hypothesis` and the viewer is a player, with a unit test beside the existing dive-shape tests. Every new field in `ChReadView` (arms, lift, bounds, slice label, `support.n`, floor, claim rung) is role-gated in the shaper, never in the view, because the shape is serialized into client components.

Flag fact to confirm with Nick: `config/feature-flags.yml` 708-735 has `coachhelm_team_pool_v1` default false but production true and preview true (its comment still says "Created OFF on main"). The engine also needs the `HELM_COACHHELM_TEAMS` canary, whose production value can't be read from the repo. So whether production writes team pool lines today is unconfirmed. This plan does not change the flag.

Fixture fixes the preview needs (data map, fixture section): `approachNarrowed`'s lift must agree with its arms; the counted causes under the 10-event floor can't be produced by the engine, so the counted penalties preview needs at least 10 events; putt slope reads are never a data gap (no sequence target), so the design page (version 3) now draws Jonah's putts as a count-down (6 of 10, as `ENGINE_BREAK`), and the data gap state moved to its own state card with the real copy. The design's demo numbers are illustrative; the preview uses the fixtures' own numbers through the real shapers.
