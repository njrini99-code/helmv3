# CoachHelm Player Lenses: file-by-file build plan

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 12 rows).

> Read 05 to 08 first (3 Nov). `05-SCREENS.md`, `06-SCREEN-SPECS.md`, `07-MOTION.md` and `08-ACCEPTANCE.md` are the build contract, with `../ACCEPTANCE-SHARED.md` over them. Where this file differs from them, they win. Two changes matter most: Reduce Motion is the app's 180ms fade (`CH_FADE_MS`, SHARED-6), not 120ms; and the feature card is flat green with no corner highlight (SHARED-2).

The values (sizes, colours, words, motion, states) come from the design page `redesign/coachhelm-lenses.html` and `DESIGN_LANGUAGE.md`. This file says where they go. Where the page and DESIGN_LANGUAGE disagree on a value, DESIGN_LANGUAGE wins. On a file or a line, this file wins.

Repo `njrini99-code/helmv3`, checked at `main` 75b4956 (Oct 31). The clone is shallow, with one commit, so git history was not searched. All paths are under `src/clubhouse/` unless they start with `src/`, `config/`, `scripts/`, `docs/`, `e2e/` or `.github/`. Line numbers are at 75b4956. Find code by name first, because lines drift.

Sources:
- the design page `redesign/coachhelm-lenses.html` (artifact 2wbDt4ckf9Nudnsv22MUXe)
- `DESIGN_LANGUAGE.md` (design-refresh root)
- Nick's four calls, Oct 31 ("All four on Lenses"):
  1. one file per player
  2. the "As Eli sees it" lens
  3. the coach's plan for the player, shown to the coach only
  4. players see the team average, never teammates by name
- the sibling lanes: `coachhelm-team` (lane 1, team board), `ask/ASK_REDESIGN.md`, `coachhelm/AGENT_KIT.md`, `classes-roster-home/02-PLAN.md`

Hard rules this plan keeps:
- no new migration
- the green phone bar, desktop sidebar and glass top bar don't change
- no thick accent left borders
- titles sit inside cards, and there is one card style
- amber for losses
- text follows `--ch-type-k`
- shared springs, each with a Reduce Motion version
- sample, window and read word are always one tap away
- shot tracking is untouched
- Assign, Dismiss, Undo, Accept and Decline reuse today's server actions (§2.6)

---

## 0. PR order (the page's 6 build steps mapped to PRs)

Every PR ships behind a new release flag, `coachhelm_player_file_v1` (§2.1). With the flag off, every address renders exactly what it renders today.

| PR | Page step | Contents | Depends on |
|---|---|---|---|
| 1 | 1 Shell and route | flag; `?view=player&player=` route; old-link redirects; `playerFileHref`; phone push page; desktop rail, head and two-column grid; the cards whose data is already loaded (feature, All reads, Where the strokes go); evidence sheet; preview `coachhelm-player-file` | none |
| 2 | 2 Plan card | the handshake (Suggested, Seen, Accepted or Declined); goal line from goal snapshots; this week's practice | 1 |
| 3 | 3 Last round in context | field-day card for the newest round, aggregates only | 1 |
| 4 | 4 Coach-only cards | "Your plan for Eli" (intent) and "Track record with Eli" | 1 |
| 5a | (5, prep) | move the player-feed shaping out of the `'use server'` file into a plain module, with no change in behaviour and no exposure write in the moved code | none (can go first) |
| 5b | 5 The lens | "Coach view / As Eli sees it" toggle; player-voice data built server side; fold, crossfade, preview pill | 1, 5a; picks up 2–4 cards if merged |
| 6 | 6 Your week | rebuild `PlayerBoard.tsx` as the player's own file in the same layout | 1, 5a, 5b (shares the player-voice cards) |

That makes 7 PRs. PRs 2, 3 and 4 don't depend on each other and can go in any order after PR 1. PR 5a can land at any time.

A cleanup PR after the flag has been on in production for a while is not in this plan:
- point `coachPlayerHref`, `coachReadHref` and `ui/PlayerPeek.tsx` straight at the file
- remove the coach branch of the old Deep dive and Standing views
- remove the flag

Every PR must:
- run `npm run clubhouse:catalog` (CI runs `npm run clubhouse:catalog -- --check` in `.github/workflows/clubhouse-quality.yml`; it writes `src/clubhouse/preview/component-catalog.json`)
- run `npm run clubhouse:css`
- keep `playwright.clubhouse.config.ts` green (testMatch `clubhouse-quality.spec.ts`, `clubhouse-playground.spec.ts`; chromium and webkit, motion no-preference and reduce)
- run `npm run flags:check` (PR 1 also runs `npm run flags:generate`)
- add a changelog fragment, which `scripts/clubhouse/changelog-gate.mjs` checks:
  - `docs/clubhouse/pages/P013-coachhelm/changes/<date>-<slug>.md`
  - plus one in `docs/clubhouse/changes/` for any shared `ui/`, `lib/` or `styles/` file outside the P013 stems

---

## 1. Files that must NOT change

| File | Why |
|---|---|
| `shell/TopBar.tsx`, `shell/ClubhouseFrame.tsx` | The desktop sidebar and glass top bar stay. |
| `shell/phone-chrome.tsx`, including `PhoneTop` (344–365), `PhoneScreen`, `usePhoneStackHistory` (428) | The green phone bar stays. The file passes `back`, `title` and `action` only, as `views/Frame.tsx:45` does today. |
| `ui/PhoneBar.tsx` (`PhoneBar`, `PhoneBarParts`, `PhoneIconAction`) | The pushed bar ("‹ CoachHelm", name, More) is already this component. |
| `styles/shell.css` bar rules (`.ch-topbar`, `.ch-pbar`, the lip `::after`, the phone hero bar) | The bars' look. |
| `styles/tokens.css` | Every value the page needs exists already: `--ch-card-bg`, `--ch-card-ring`, `--ch-separator`, `--ch-gain`, `--ch-loss`, `--ch-flag`, `--ch-well-bg-flat`, `--ch-grouped-bg`, `--ch-green-800`, `--ch-on-green-ink`, `--ch-type-k`, `--ch-ease-spring` (740), `--ch-ease-spring-smooth` (756). Add no token. |
| `ui/Segmented.tsx`, `styles/controls.css` `.ch-seg` | The lens control is the shared green chip, used as it is. |
| `ui/Modal.tsx`, `ui/Swap.tsx`, `ui/ListPresence.tsx`, `lib/motion.ts`, `lib/reduced-motion.ts` | Used, not changed. |
| `screens/coachhelm/writes.ts` | `LIVE_COACHHELM_WRITES` and `LIVE_PLAYER_WRITES` are reused as they are (§2.6). |
| `src/app/golf/actions/development.ts`, `src/app/golf/actions/v3/intent.ts` | The server actions don't change. |
| `src/app/golf/actions/insight-delivery.ts` | Only PR 5a touches it, and only to import the moved helpers. The exposure writes (`recordExposureForReturned`, 347) stay exactly where and as they are. |
| `src/lib/coachhelm/v3/insight-visibility.ts`, `src/lib/coachhelm/delivery/player-projection.ts`, `src/lib/coachhelm/v3/field-day/*`, `src/lib/coachhelm/v3/intent/*` | Engine code is read, not changed. |
| Anything under shot entry or round capture | Nothing here changes what shot tracking collects. |
| `supabase/migrations/*` | No new migration. |
| `screens/coachhelm/CoachBoard.tsx` | Lane 1 owns it. This plan doesn't edit it (§10). Its links reach the file through the redirects. |
| `screens/coachhelm/chat/*` | The Ask lane owns it. `chat/Evidence.tsx:173` calls `coachReadHref`, and the redirect carries that link. |

---

## 2. PR 1: Shell, route, redirects, first cards

### 2.1 The flag

Today:
- `config/feature-flags.yml` holds the CoachHelm flags. `coachhelm_track_record_v1` (1198–1229) is the entry to copy.
- The helper pattern is `src/lib/coachhelm/v3/track-record/flag.ts`:
  `export const TRACK_RECORD_FLAG = 'coachhelm_track_record_v1'; export function isTrackRecordEnabled() { return isFlagEnabled(TRACK_RECORD_FLAG) }`
- `isFlagEnabled` (`src/lib/flags/is-enabled`) is server-only and fails closed.

Change:
- Add `coachhelm_player_file_v1` to `config/feature-flags.yml`:
  - type release, owner golf/coachhelm
  - `default: false`, every environment false
  - purpose: one file per player, the lens, the coach-only cards, and the player's "Your week"; read only, with no new writes
  - cleanup_plan: remove once the old coach views are deleted
- Run `npm run flags:generate` to update `src/lib/flags/registry.generated.ts`.
- New `src/lib/coachhelm/v3/player-file/flag.ts`: `PLAYER_FILE_FLAG`, `isPlayerFileEnabled()`.
- Adding a flag is config, not a migration. Turning it on is Nick's call, and not part of any PR here.

I could not find a "PR 2410 Ask off switch" at 75b4956. The only #2410 reference is `src/clubhouse/__tests__/one-spinner.test.ts`, about the CoachMark wheel. If the brief meant a flag the Ask lane adds, it doesn't touch this one.

### 2.2 Route and links: `routes/coachhelm.tsx` (235 lines), `data/coachhelm-views-shape.ts` (130 lines)

Today:
- The page entry `src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx:199` types searchParams as `{view?; player?; c?; section?}`. Line 206 spreads them into `ClubhouseCoachHelmRoute`. `insight` is spread too, but it isn't in the type.
- `ClubhouseCoachHelmRoute({view, player, c, insight, section})` starts at 166 (fixed 4 Nov wiring: lines on 03d9087 are one later than this list said; each is corrected below). The coach branch:
  - `resolveClubhouseTeam`
  - track-record at 183
  - `const coachDrill = playerHelmDrill(view); if (coachDrill && typeof player === 'string')` → `CoachPlayerPage` (191–197)
  - monday-brief at 200, brief at 209
  - board or Ask at 216–222
- The player branch is at 224–233.
- `CoachPlayerPage` (114–132) handles `loadCoachPlayerScope` → `CoachPlayerNotOnTeam` / `CoachPlayerFailed` / board when coach-off / off views when player-off / a Suspense with `coachPlayerSkeleton` (143–147).
- `redirect` is already imported from next/navigation.
- views-shape helpers:
  - `playerHelmDrill(view)` (46) maps 'profile' → 'standing' and passes 'standing' and 'deep-dive' through
  - `landsOnGame` (52)
  - `COACH_PLAYER_VIEWS = ['deep-dive','standing']`
  - `coachPlayerHref(view, id)` = `/golf/dashboard/coachhelm?view=${view}&player=${id}`
  - `coachReadHref(playerId, insightId, roster)` = `coachPlayerHref('deep-dive', …)&insight=…`, or null when the player isn't on the roster

Change, in `data/coachhelm-views-shape.ts` (additive only):
- `export type PlayerFileCard = 'feat' | 'plan' | 'field' | 'reads' | 'sg' | 'intent' | 'track'`
- `export function playerFileHref(playerId: string, at?: { card?: PlayerFileCard; insight?: string }, on = false): string`, which returns `/golf/dashboard/coachhelm?view=player&player=${id}` plus `&at=` and `&insight=` when given and `on` is true, and today's Deep dive or Standing address when `on` is false (fixed 4 Nov: `on` added, as Read's `readHref`, because flags are server-only; full contract in the Completeness pass section at the end)
- `export const FILE_BYPASS = 'file'`: the old views read `from=file` and skip the redirect (see the Standing link in §2.8)
- Don't change `coachPlayerHref` or `coachReadHref` in this PR. The redirect carries them.

Change, in `src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx`:
- Add `insight?: string; at?: string; from?: string` to the searchParams type. This is a type-only fix, because the values are already spread.

Change, in `routes/coachhelm.tsx`:
- Add `at` and `from` to the props.
- In the coach branch, before the `coachDrill` block at 190: if `typeof player === 'string'` and `await isPlayerFileEnabled()`:
  - `view === 'player'` → `<CoachPlayerFilePage teamId coachId playerId at insight />`
  - `coachDrill && from !== 'file'` → `redirect(playerFileHref(player, { card: coachDrill === 'deep-dive' ? 'reads' : 'sg', insight }))`
  - So 'profile' lands on `sg` too. The "How Eli plays" game section stays one tap away through the "Full standing" link (§2.8).
- `CoachPlayerFilePage` copies `CoachPlayerPage` (114–132; fixed 4 Nov wiring) state by state. It reuses `loadCoachPlayerScope`, `CoachPlayerNotOnTeam` (CH-13311), `CoachPlayerFailed` (CH-13209), the board when coach-off, and `HelmOff` when player-off. Then it opens a Suspense with a new `FileSkeleton`.
- With the flag off, `view=player` falls through to the board, which is today's behaviour for an unknown view.
- Add `import '@/clubhouse/styles/coachhelm-file.css'` after line 41 (fixed 4 Nov wiring: the route's last CSS import is line 41, `coachhelm-brief.css`; put it after Read's and Team's imports if they land first). Grep `coachhelm-views.css` for any other import list, such as the preview, and add it there too.

Deep links from notifications. Nothing to change:
- `src/lib/notifications/insight-notifier.ts:119` sets `action_url: '/golf/dashboard/coachhelm'`, the board.
- `src/lib/coachhelm/v3/verdicts/verdict-job.ts:320` links `/golf/dashboard/players/${player_id}`, which `next.config.mjs:373` redirects to `/players/:id/game`.
- Neither lands on Deep dive. Pointing them at `playerFileHref` is the cleanup PR's call, not this plan's.

Old-link callers (no edit needed in PR 1; each reaches the file through the redirect):

| Caller | Link |
|---|---|
| `data/stats-reads.ts:73, 89` | `coachPlayerHref`/`coachReadHref` |
| `screens/roster/RosterPeek.tsx:296`, `screens/roster/Roster.tsx:364` | `coachPlayerHref('deep-dive', p.id)`. The Roster lane may edit nearby (§10). |
| `screens/coachhelm/views/Frame.tsx:37, 41` | the old views' own crumbs |
| `screens/coachhelm/views/Standing.tsx:63, 241, 407` | links between the old views |
| `screens/coachhelm/chat/Evidence.tsx:173` | `coachReadHref`, owned by the Ask lane |
| `screens/coachhelm/CoachBoard.tsx:211, 249` | `coachPlayerHref('standing', r.id)` and "All of {first}'s reads", owned by lane 1 |
| `ui/PlayerPeek.tsx:33` | hardcodes `/golf/dashboard/coachhelm?view=deep-dive&player=…` |

The old views link to each other (Frame, Standing). With the flag on, those links would bounce back into the file. Inside the old views, add `&from=file` only to the "Full standing" path the file opens (§2.8). Leave their other links alone: with the flag on, nobody lands on those views except through that link.

Tests (unit, `src/clubhouse/__tests__/coachhelm-file-route.test.tsx`; mock `isPlayerFileEnabled` the way the track-record route tests mock their flag):
- flag off: `?view=deep-dive&player=X` renders `CoachPlayerPage` as today, and `?view=player&player=X` renders the board
- flag on: `deep-dive` redirects to `…view=player&player=X&at=reads`, and keeps `&insight=Y`
- flag on: `standing` and `profile` redirect to `at=sg`
- flag on: `from=file` doesn't redirect
- `playerFileHref` encodes ids and leaves out empty parts
- not-member, scope-failed, coach-off and player-off give the same screens as `CoachPlayerPage`
- a player session never reaches the coach branch (today's guard; one assertion)

### 2.3 Loader and shape (new): `data/coachhelm-file.ts`, `data/coachhelm-file-shape.ts`

Today, every input exists:
- `data/coachhelm-player.ts`:
  - `loadCoachPlayerScope({coachId, teamId, playerId}, now)` (90) returns a branded `ChCoachPlayerScope {coachId, teamId, playerId, head, lastRound}` (50). It also reads the team zone.
  - `loadCoachPlayerDeepDive({scope})` (187) → `ChDeepDive`. It calls `getInsightsForCoach(coachId, {player_id, limit: PLAYER_FEED_LIMIT, includeMore: true})`, which records one `coach_feed` exposure, the same as opening Deep dive today.
  - `loadCoachPlayerStanding({scope})` (171) → `ChStanding`. It calls `getInsightsForCoach` again.
- `data/coachhelm-dive.ts` `readPlans` (53) and `readThemes` (77).

Change. New `server-only` `data/coachhelm-file.ts`:
- `loadCoachPlayerFile({scope}): Promise<ChViewLoad<ChPlayerFile>>`
- It runs the dive and standing loaders in parallel.
- It must not call `getInsightsForCoach` twice. Today Deep dive and Standing each call it, and each call records a `coach_feed` exposure. Instead, add an optional `feed` input to `loadCoachPlayerStanding`, or pass the dive's raw rows through. Find the narrowest seam in `coachhelm-player.ts` (171–186). Either way, one page view records one exposure set, not two.
- It returns `{ head, cards: ChFileCards, missing, failed: {dive, standing} }`. Each card fails on its own, through the existing `SectionBoundary` and `ChViewLoad` pattern.

New `data/coachhelm-file-shape.ts` (pure, client-safe):
- `ChFileCards` holds:
  - `feat: ChDeepInsight | null` (the top of `ChDeepDive.list` after `orderDive`)
  - `reads: { open: ChDeepInsight[]; cleared; dismissed: ChInsight[] }`
  - `sg: ChFileSg | null`
  - later PRs add `plan`, `field`, `intent` and `track` as optional fields, so PR 1's shape doesn't change
- `ChFileSg { rows: {id, label, strokes: number | null, tone: 'gain'|'loss'|'none'}[]; vs: 'team'|'tour'; sample: string; window: string; note: string | null }`
- `toChFileSg(rows: PlayerStanding[], viewer)` is a new pure function beside `toChLadder` (`data/coachhelm-ladder-shape.ts:129`). It uses `PlayerStanding.team_avg` and `team_n` (`src/lib/coachhelm/v3/standing/types.ts:14–22`). It returns `vs: 'team'` when every row has `team_n >= 5`, and otherwise falls back to `vs: 'tour'` (today's `ChLadderRow.strokes`). Then it says which in the meta line.
- Add `data/coachhelm-file.ts` and `data/coachhelm-file-shape.ts` to `config/clubhouse/pages/P013-coachhelm.json` `implementation.also`.

Tests (`src/clubhouse/data/__tests__/coachhelm-file.test.ts`):
- one `getInsightsForCoach` call per load (spy)
- dive failed gives standing cards plus a failed reads card
- standing failed gives an `sg` of null with the failed state, and the rest of the file still renders
- `toChFileSg`:
  - team below 5 falls back to tour
  - totals-only rounds give a null strokes value and the "needs hole-by-hole scores" note
  - the loss tone is used only when strokes is below 0

### 2.4 Screens (new): `screens/coachhelm/file/`

| Component | File | Props (real types) | Fed by |
|---|---|---|---|
| `PlayerFile` | `file/PlayerFile.tsx` (`'use client'`) | `{ load: ChViewLoad<ChPlayerFile>; voice: ChViewVoice; writes: ChCoachHelmWrites; correctionWrites; at?: PlayerFileCard; insight?: string; roster: ChFileRosterRow[] }` | `loadCoachPlayerFile` |
| `FileRail` (desktop) | `file/FileRail.tsx` | `{ rows: ChFileRosterRow[]; current: string }`, where `ChFileRosterRow = {id, name, first, line}` | §2.5 |
| `FileHead` | `file/FileHead.tsx` | `{ head: ChCoachPlayerHead; lens?: ReactNode }` | `scope.head` |
| `FeatureCard` | `file/FeatureCard.tsx` | `{ i: ChDeepInsight; voice: ChViewVoice; fa: ReturnType<typeof useFocusActions>; target: ChFocusTarget; onEvidence(id) }` | `cards.feat` |
| `ReadsCard` | `file/ReadsCard.tsx` | `{ reads: ChFileCards['reads']; voice; fa; onEvidence(id) }` | `cards.reads` |
| `SgCard` | `file/SgCard.tsx` | `{ sg: ChFileSg | null; voice; standingHref: string }` | `cards.sg` |
| `EvidenceSheet` | `file/EvidenceSheet.tsx` | `{ i: ChDeepInsight | null; voice; coach: boolean; corrections?; onClose() }` | the same `ChDeepInsight` |
| `FileSkeleton` | `file/FileSkeleton.tsx` | `{ first: string }` | none |

`PlayerFile`, on phone:
- `PhoneTop back={{label: 'CoachHelm', onBack}} title={head.name}` plus a More action. This copies `views/Frame.tsx:45` and `usePageCrumbs(['CoachHelm', name])`, with no new bar code.
- The push into the file is a route change. It reuses the push today's coach views get (nav-motion `chPushTiming`, 462 smooth spring, outgoing 24% left, `CH_UNDERLAY_SHIFT` 0.24, and brightness 0.9; PR 1 sets `--ch-vt-parallax` to `-24%` per START_HERE's shared values). Don't add a second push.

`PlayerFile`, on desktop:
- `.ch-hf` holds `FileRail`, then `.ch-hf-main` with `FileHead` and `.ch-hf-grid` (two columns, 1.12fr and 1fr).
- Column order per lens:
  - coach: feat, plan, sg | field, reads, intent, track
  - player: feat, plan, sg | working, field, reads

`PlayerFile`, with `at`:
- On mount, scroll that card into view. Use `scrollIntoView({block: 'start'})` with smooth scrolling only when `useChMotionMode()` allows it.
- With `insight`, also open `EvidenceSheet` on that read.
- Keep the open read in session state `coachhelm.file.insight.${playerId}`, as Deep dive does at `DeepDive.tsx:677` (fixed 4 Nov wiring: was 661).

`FeatureCard`, on green (`--ch-green-800`, once per view):
- `__who`: the player's name and avatar
- `__k`: the stance word (`PRI_LABEL`, `stanceOf` in `coachhelm-shape.ts:347, 360`)
- `__t`: the title (`ChInsight.title`, through `speak`)
- `__cmp`: three cells from `ChHelmGauge {you, cmp, sec}` (`coachhelm-shape.ts:52`), labelled You/Eli, Team, Tour. Loss values use `--ch-loss` (on green, the dark-mode loss value; check AA).
- `__p`: the lede plus `ChDeepInsight.closes` ("worth 0.4 strokes a round")
- `__ev`: three chips, each a button that opens `EvidenceSheet`:
  - `ChHelmEvidence.sample`
  - `ChHelmEvidence.window`
  - `firmnessOf(i)` (`coachhelm-dive-shape.ts:503`; the claim ladder word for the coach, the read word in the player lens)
  - This keeps the evidence rule: none of them can be hidden.
- `__acts`: reuse `FocusActions` (`parts.tsx:392`) with `where: 'dive'`. It needs an on-green look; see risk R6.

`ReadsCard`:
- Title "All reads" (player lens: "Also worth knowing").
- Rows reuse `InsightRow` (`parts.tsx:212`), with the stance chip and the firmness word.
- A tap opens `EvidenceSheet`.
- A dismissed read shows a static row, "Dismissed: … Undo", calling `useFocusActions(writes).undo`.
- Cleared reads use `ClearedLines` (`EngineState.tsx:117`).
- The order is `orderDive`'s.

`SgCard`:
- Title "Where the strokes go", meta "Eli vs the team" or "vs the Tour" from `ChFileSg.vs`.
- Four rows from `LADDER_METRICS` (sg_ott, sg_approach, sg_around_green, sg_putting), with an axis from −1.0 to +1.0.
- `footerNote` holds the plain sentence, then "Season · N rounds · strokes per round". If `PlayerStanding` carries no round count, use `ChStanding`'s sample text (check at build time).
- A "Full standing" link goes to `coachPlayerHref('standing', id) + '&from=file'`.

`EvidenceSheet`:
- `Modal`, a phone bottom sheet with `.ch-grab` and `useSheetDrag`. On desktop it's centred, scale 0.96 to 1.
- It reuses the Deep dive section parts instead of redrawing them: `Strip` (92), `Trend` (127), `Rounds` (187), `Why` (244), `Where` (290), `EngineState`/`WhyAudit` (`EngineState.tsx:29, 94`).
- Coach only: `CorrectionChips` (`Corrections.tsx:59`), shown as Not this / Wrong cause / Already working on it.
- PR 1 adds `export` to those functions in `views/DeepDive.tsx`, with no body change.
- The sheet head always shows sample, window and read word (the gauge well uses `--ch-well-bg-flat`).

`FileSkeleton`: card-shaped placeholders in the same grid. Reuse `ui/States` `Skeleton`, the way `views/Skeletons.tsx:185` (`DiveSkeleton`) does.

States (all from existing data):
- full
- early (fewer than 3 rounds; `ChDiveRounds.strip` is empty below 3): every card shows its mini empty line, worded on the design page
- empty (no rounds)
- failed per card
- loading
- not on team, scope failed, off
- write failed, and duplicate focus (`ACTIVE_FOCUS_DUPLICATE_ERROR`; already handled in `useFocusActions`, CH-13001/2/3)

Error codes: pick the next free `CH-13xxx` codes (`scripts/clubhouse/check.mjs` maps coachhelm to '13'). Grep each one before using it. Don't reuse a Deep dive code for a new state. (fixed 4 Nov wiring: this lane's block is CH-13760 to CH-13779, free on 03d9087; Save plan failure is CH-13760; Read keeps CH-13861 to CH-13869)

### 2.5 Desktop rail data

Today, the board loader (`data/coachhelm.ts`, lane 1) loads one top read per player. The design draws each rail row as name plus that top read title (`p.top`).

Change:
- PR 1 reads the rail with one session query in `data/coachhelm-file.ts`, `loadFileRoster(scope)`: active `golf_team_members` players on `scope.teamId`, with names and class year. It uses the same join `loadCoachPlayerScope` makes.
- The row's second line is the class year.
- The top-read line waits for lane 1's loader to expose per-player rows. Then `FileRail` takes `line` from it, and nothing else changes. Listed in §9.

### 2.6 Writes: confirmed names, files and signatures

None of these change. The file calls them only through `useFocusActions(writes)` (`parts.tsx:306`) and `LIVE_PLAYER_WRITES`.

| UI action | Hook or writes entry | Server action | File:line | Signature |
|---|---|---|---|---|
| Assign | `ChCoachHelmWrites.assign(a: ChAssignArgs)` → `useFocusActions().assign` | `createFocusAreaFromInsightV2` | `src/app/golf/actions/development.ts:1736` | `(args: CreateFocusAreaFromInsightArgsV2) => Promise<{success; focusAreaId?; error?; duplicateFocusAreaId?}>`. The args interface (1561) is `{playerId, insightId, title, description, areaType, targetMetric?, targetValue?, currentValue?}` plus timeframe fields. It inserts status 'proposed' with `started_at` null. |
| Dismiss | `writes.dismiss(id)` | `dismissInsight` | `src/app/golf/actions/insights-feed.ts:681` (fixed 4 Nov wiring: the file is `insights-feed.ts`, as `writes.ts:4` imports it) | `(insightId: string)` |
| Undo | `writes.undo(id, lifecycle)` | `reactivateInsight(id, lifecycle, 'dismiss')` | `insights-feed.ts:790` (fixed 4 Nov wiring: was `insight-delivery.ts`) | `(insightId, priorLifecycleState?: 'detected'|'matured'|'addressed'|'resolved', undoing: 'acknowledge'|'dismiss' = 'acknowledge')` |
| Accept | `ChPlayerWrites.accept(focusAreaId)` | `acceptFocusArea` | `development.ts:736` | `(id: string) => Promise<DevelopmentActionResult>`. proposed → active, and `started_at` is set. |
| Decline | `ChPlayerWrites.decline(focusAreaId)` | `declineFocusArea` | `development.ts:795` | `(id: string) => Promise<DevelopmentActionResult>`. proposed → 'declined' (760). |

`writes.ts` (111 lines) wires them in `LIVE_COACHHELM_WRITES` and `LIVE_PLAYER_WRITES`. The manifest's actions ACT-P013-ASSIGN-FOCUS, DISMISS and UNDO stay mapped to `parts.tsx#useFocusActions`.

### 2.7 CSS (new): `styles/coachhelm-file.css`, prefix `.ch-hf-`

The prefix `ch-hf-` is free at 75b4956 (`ch-pf-` is taken). As a `coachhelm-*.css` stem sheet it belongs to P013. Each piece of the design maps like this:

| Design class | Clubhouse | Notes |
|---|---|---|
| `.card`, `.card__h h4/small` | `Surface` (`ui/Surface.tsx`, `variant` default/flat) with its title and meta | The single card style: `--ch-card-bg` and `--ch-card-ring`. If BUILD_BRIEF PR 2's `variant="card"` has landed, use it. No left border. Title 17/600, meta 15/400. |
| `.card__n` | `.ch-hf-note` (footer note) | 15/400 secondary |
| `.feat`, `__who __k __t __cmp __p __ev __acts` | `.ch-hf-feat`, `.ch-hf-feat__who` … `__acts` | `--ch-green-800`, `--ch-on-green-ink`, once per view |
| `.btn.light/.ghost/.is-done` | `Button` and the existing `.ch-hl-cact`/`.ch-hl-done` from `FocusActions` | on-green overrides scoped under `.ch-hf-feat` |
| `.hs`, `.hs__s.on/.fill` | `.ch-hf-hs`, `.ch-hf-hs__s[data-on][data-fill]` | PR 2 |
| `.goal`, `.goal__t` | `.ch-hf-goal` (inline SVG, as `Trend` draws) | PR 2. Dashed goal line, last point in `--ch-loss` only when it's worse. |
| `.drill` | `.ch-hf-drill` | PR 2 |
| `.sg`, `__row __trk __bar.loss/.gain __axis` | `.ch-hf-sg`, `__row`, `__trk`, `__bar[data-tone]`, `__axis` | Bars are drawn at full width and scaled with `transform: scaleX()` from the zero axis (R8). |
| `.rows .r .chip .r__t`, `.r.static.undo` | `InsightRow` in a grouped list (`--ch-grouped-bg`, `--ch-separator`); `.ch-hf-undo` | |
| `.field`, `.field__t`, `.field__fig`, `.dots i/.mean/.me`, `.dots__lab` | `.ch-hf-field`, `.ch-hf-dots i[data-k=mean|me]`, `.ch-hf-dots__lab` | PR 3. The "me" dot uses `--ch-loss` or `--ch-gain` by sign. |
| `.kv`, `.vis`, lock icon | `.ch-hf-kv` (a `dl`), `.ch-hf-vis` with `Icon` lock and eye | PR 4 |
| `.tr3` | `.ch-hf-tr3` (three numbers) | PR 4 |
| `.pv` | `.ch-hf-pv` (sticky pill) | PR 5b. No glass behind data: a solid `--ch-card-bg` pill. |
| `.aseg`, `.sticky-seg` | `Segmented` inside `.ch-hf-lensbar` (sticky under the bar) | PR 5b |
| `.wrap-collapse[data-wrap]` | no CSS | the height runs in JS through `PresenceRow` (R8) |
| `.sheet`, `.sheet__grab/__h/__b`, `.well`, `.gauge`, `.strip .hi`, `.holes`, `.corr` | `Modal` + `.ch-grab`; `.ch-hf-well`; the Deep dive part classes (`.ch-hd-*`) as they are | reused, not restyled |
| `.drail`, `.dfile`, `.dhead`, `.grid2` | `.ch-hf-rail` (300px), `.ch-hf-main`, `.ch-hf-head` (`Avatar` 52), `.ch-hf-grid` | desktop only |
| `.titleblock` "By player" (phone coach list) | lane 1's team board | not this plan |

CSS rules `scripts/clubhouse/css-quality.mjs` enforces:
- no transitions or keyframes on width, height, margin, padding, top/left, `grid-template-*` or `flex-basis`
- no `transition: all`
- an outer shadow needs a `--ch-*` token

Every type size uses the `--ch-type-*` steps, which scale with `--ch-type-k`. Every gap uses `--ch-space-*`.

### 2.8 Preview (new): `coachhelm-player-file`

Today:
- `src/app/clubhouse-preview/[screen]/page.tsx` (645 lines) has its doc list at 192–207.
- `'coachhelm-coach-player'` at 577 renders `PreviewCoachHelmCoachPlayer`.
- Its fixtures are `preview/fixtures-coachhelm-coach-player.ts` (`PREVIEW_COACH_DIVE`, `_GAME`, `_STANDING`, `_VOICE`, for the player Jonah).
- Its mock writes have failwrites and duplicate.

Change:
- New `preview/PreviewCoachHelmPlayerFile.tsx` and `preview/fixtures-coachhelm-player-file.ts`. They build on the Jonah fixtures, so no new invented player.
- Register `'coachhelm-player-file'` next to 577, and document it in the list at 192–207:
  `/clubhouse-preview/coachhelm-player-file ?state=… &lens=coach|player &at=feat|plan|field|reads|sg|intent|track &q=<insight>`
- States:
  - PR 1: `full` (default), `early`, `empty`, `loading`, `failed`, `readsfailed`, `sgfailed`, `notonteam`, `scopefailed`, `off`, `teamsmall` (SG falls back to Tour), `totalsonly`, `failwrites`, `duplicate`
  - PR 2: `proposed`, `seen`, `accepted`, `declined`, `noplan`, `nogoal`, `practiceoff`
  - PR 3: `nofield` (fewer than 3 on the day), `fieldfew` (a field of 3 or 4: coach card with dots; no card for the player or the lens), `fieldfailed`
  - PR 4: `nointent`, `intentfailed`, `trackempty`, `trackearly`
  - PR 5b: `lens=player`
  - PR 6: `viewer=player` (own page)
- Add the route to `scripts/clubhouse/a11y.mjs` (route list 176–185) and `scripts/clubhouse/aesthetic-capture.mjs` (92).

### 2.9 PR 1 tests

Unit (vitest, `src/clubhouse/__tests__/coachhelm-file.test.tsx`; copy the setup of `coachhelm-coach-player.test.tsx` and `coachhelm-dive.test.tsx`):
- the card order per lens and viewport matches §2.4
- exactly one `.ch-hf-feat` renders
- every figure on the feature card has sample, window and firmness chips, and each opens the sheet on that read
- Assign, Dismiss and Undo call the `writes` entries with the exact args `FocusActions` sends today (spy on `ChCoachHelmWrites`)
- `at=reads&insight=Y` opens the sheet on Y
- correction chips render for a coach only
- the dismissed row's Undo calls `undo(id, lifecycle)`
- no element has a left border wider than 1px. Check computed style in jsdom on `.ch-hf *`, or a CSS text test like the existing quality ones.

Playwright: add one `test.describe('CoachHelm player file')` block at the end of `e2e/clubhouse-quality.spec.ts`. That file is already in `testMatch`, so the config doesn't change. It runs at 390×844, 430×932 and 1280×800, under both motion settings:
- no horizontal scroll
- the green bar is present and unchanged: compare `.ch-pbar` computed background with the board's
- the sheet opens and closes, and focus returns to the chip
- under reduce, no transform animation runs longer than `CH_FADE_MS`

---

## 3. PR 2: Plan card with the handshake

Today:
- `readPlans(supabase, playerId)` (`data/coachhelm-dive.ts:53`) selects `id, title, status, from_insight_id, target_metric` for statuses proposed, active, in_progress, paused and completed. Declined is left out. It also loads `loadActiveGoals` and `loadRecentlyAchievedGoals`.
- `ChDivePlan {focus: {id, title, word, live, fromThis} | null; goal: {id, title, word, line, fromThis} | null}` (`coachhelm-dive-shape.ts:93`), built by `planFor` (371).
- `Goal.snapshots: Array<{date, value, team_avg?}>`, plus `baseline_value`, `target_value` and `state` (goals/types.ts:27–66).
- The `golf_player_focus_areas` columns include `coach_id`, `created_at`, `started_at`, `status`, `from_insight_id` and `drill_ids`.
- `golf_insight_exposure (insight_id, player_id, coach_id, shown_at, surface)`:
  - RLS lets a coach read team rows
  - it has an index on `insight_id` (migration 20260621160000)
  - the player's feed writes `surface = 'player_feed'`
- Practice log: `loadFocusAreaPracticeLogData` (`src/lib/coachhelm/focus-areas/practice-log-loader.ts:162`) → `FocusAreaPracticeSummary {count, lastPracticedAt}`. It runs behind `coachhelm_focus_area_practice_log`.

Change. Don't edit `readPlans` (lower conflict). Instead add a file-only read in `data/coachhelm-file.ts`, `loadFilePlan(scope, plan: ChDivePlan)`:
- Live focus: one `golf_player_focus_areas` row by id, selecting `id, title, status, created_at, started_at, from_insight_id, drill_ids, coach_id`. If the newest coach focus is 'declined', add one more query that also takes `status = 'declined'` and is newer than the newest live one.
- Seen:
  ```
  golf_insight_exposure
    .select('shown_at')
    .eq('insight_id', from_insight_id)
    .eq('surface', 'player_feed')
    .gte('shown_at', created_at)
    .order('shown_at')
    .limit(1)
  ```
  This is one row on the indexed column, run only when `from_insight_id` is set. Without it, Seen is 'unknown' and the step shows a dash, never a false tick.
- Goal: take the goal `planFor` picked, and keep `snapshots`, `baseline_value` and `target_value` (already loaded by `readPlans`; pass them through instead of re-reading).
- Practice: `loadFocusAreaPracticeLogData` for the live focus, only when that flag is on.
- Drill name: from the focus area's `drill_ids`, through the same lookup the dive loader passes to `toChInsight` as `drillText` (find it in `loadCoachPlayerDeepDive`, `coachhelm-player.ts:187`). No drill means no row.

New shape in `coachhelm-file-shape.ts`:
- `ChFilePlan { focus; handshake: { suggested: {at} | null; seen: {at} | 'unknown' | null; accepted: {at} | null; declined: {at} | null }; goal: { title; target; baseline; points: {date; value}[]; worse: boolean } | null; practice: { drill: string | null; count: number; last: string | null } | null; outcome: ChDiveOutcome | null }`
- Dates are formatted in the team zone that `loadCoachPlayerScope` reads.

New `file/PlanCard.tsx`, props `{ plan: ChFilePlan | null; voice; lens: 'coach'|'player'; fa; target }`:
- Coach lens: the handshake `.ch-hf-hs` with three steps:
  - Suggested, with the date
  - Seen, with the date or a dash
  - Accepted, with the date, or Declined in plain text, not red
- Player lens: "From Coach {name}" instead of the handshake (the name comes in PR 6, §8).
- Goal line: an SVG polyline over the snapshot points, the target as a dashed line, and the last point in `--ch-loss` only when `worse`.
- Practice row: "This week: {drill} · {count} sessions logged".
- With no plan, the `footerNote` reads "Assign a focus from any read. Eli sees it as yours, by name." (or the early wording on the page).

Motion:
- the steps fill over 420 with `--ch-ease-spring-smooth`, on opacity and transform only
- the tick draws over 320 with `stroke-dashoffset`
- Reduce Motion is a `chFade` crossfade
- after Assign, the new step slides in with `Swap`

Tests:
- unit: the handshake for proposed (Suggested only), seen (Seen with date), accepted, declined, and no-insight (Seen is 'unknown', drawn as a dash)
- the Seen query filters `surface = 'player_feed'` and `shown_at >= created_at`: mock the client and assert the chain
- the goal line has `points.length` vertices
- practice is hidden when the flag is off
- Playwright: `?state=seen` and `?state=declined` screenshots at 390 and 1280

---

## 4. PR 3: Last round in context (field-day)

Today:
- `src/lib/coachhelm/v3/field-day/field.ts`:
  - `FieldDayEntry {round_id, player_id, field_n, field_mean, relative}`. `field_n` counts distinct players and includes the player. `field_mean` is to par per 18 and includes the player.
  - `buildFieldDayContext(rounds)`
  - `FIELD_MIN_MEMBERS = 3`
  - `FIELD_DAY_LABEL = 'Relative to the team on the day'`
- `field-day/loader.ts` `loadTeamFieldRounds(supabase, teamId, since)` returns null on failure. Its comment says "Read only with coachhelm_team_pattern_v1 on".
- RLS `golf_rounds_select` allows teammates and coaches.
- No Clubhouse screen draws field-day today.

Change. `data/coachhelm-file.ts` `loadFileField(scope)`:
- Runs only when `coachhelm_team_pattern_v1` is on (honouring the loader's comment; see R4).
- Calls `loadTeamFieldRounds` from the newest round's date, then `buildFieldDayContext`, and picks the entry for `scope.lastRound`.
- A new pure function `toChFileField(entry, sameDayRounds, viewer)` returns `ChFileField { head; me: number; others: { n: number; mean: number }; dots: number[] | null; relative: number; date; course }`:
  - `others` drops the player from both the count and the mean. The field mean includes them; the design's "5 teammates averaged +6.4" needs it without them. This is pure code over rows already loaded.
  - `dots` are the other players' per-18 values, sorted, with no ids and no names. Settled 3 Nov: they are sent to the coach whenever the field exists (2 or more others), because a coach already sees every player's round by name on the Team Board and in Roster, so a floor hides nothing from them. They are never sent to the player or the lens (SHARED-11).
  - When `field_n < FIELD_MIN_MEMBERS`, the result is null, and the card says why (copy on the design page).

New `file/FieldCard.tsx`, props `{ field: ChFileField | null; voice; failed: boolean }`:
- Title "Last round in context". The `__fig` reads "−2.4 vs the field".
- The dots strip shows the mean, `me` and the others.
- `footerNote` is `FIELD_DAY_LABEL` plus the date and n. That covers the evidence rule: sample (n) and window (the day) are on the card, and the read level is "On the day".
- The coach lens may label dots by name in the accessible label only (from the rail roster).
- The player lens, and PR 6, carry no names at all.

Tests:
- unit `toChFileField`: excludes self from n and mean; gives no dots below 5 others; null below 3 members; values only, no ids, in the returned object (assert `Object.keys`)
- loader: not called with team pattern off; a null loader result gives the failed state
- Playwright: `nofield` and `fieldfew`

---

## 5. PR 4: Coach-only cards

### 5.1 "Your plan for Eli" (`golf_coach_player_intent`)

Today:
- Columns (database.ts:11900): `coach_id, player_id, narrative_goal, alert_posture, highlight_categories string[], notes | null, updated_at`.
- RLS is coach-only.
- `loadIntent(coachId, playerId)` (`src/lib/coachhelm/v3/intent/loader.ts`) uses the admin client and invents a default when there's no row. Don't use it.
- `data/roster.ts:371–385` (`loadNotes`) reads the table with the session client.
- Labels: `NARRATIVE_GOAL_PRESENTATION` (`intent/types.ts`): Bubble, Maintain, Develop, Breakout, Rehab. Use the words only, not its emoji or pill colours.
- The writer is `setIntent` (`src/app/golf/actions/v3/intent.ts`), called from `RosterPeek.tsx:362`.

Change:
- `loadFileIntent(scope)` reads with the session client:
  ```
  .from('golf_coach_player_intent')
  .select('narrative_goal, alert_posture, highlight_categories, notes, updated_at')
  .eq('coach_id', scope.coachId)
  .eq('player_id', scope.playerId)
  .maybeSingle()
  ```
  `null` means "No plan set".
- `ChFileIntent { aim: string; alerts: string; watching: string[]; note: string | null; updated: string } | null`, with plain words from the type maps.
- New `file/IntentCard.tsx`:
  - title "Your plan for {first}" with a lock `Icon`
  - a `.ch-hf-vis` "Only you" line with the eye icon
  - a `dl` of Aim, Alerts, Watching, Note
- "Edit plan" is a link to where the plan is edited today: the Roster peek that calls `setIntent`. I didn't confirm that peek's address, so find its href in `screens/roster/` at build time. If none can be addressed, leave the link out. No new write path on this page. (fixed 4 Nov wiring: superseded by §13 item 2; "Edit plan" and "Set a plan" open `S-FILE.plan` on the file and save with `setIntent` (`src/app/golf/actions/v3/intent.ts:100`); failure CH-13760)
- The card is never in `ChFileCards` for a player viewer. The server leaves it out of anything built with `PLAYER_VOICE`, so it never reaches a player's client.

### 5.2 "Track record with Eli"

Today:
- `ChTrackRecord` (`data/coachhelm-track-record*.ts`) is team-wide. It depends on `20261021090000_golf_coachhelm_shown_reads.sql` (fixed 4 Nov wiring: HELD.md row 216 says APPLIED 2026-10-21, hold discharged; the file's own header is stale). Still don't use it here: it is team-wide, and the per-player card below needs only focus areas and attribution.
- Data that exists:
  - `golf_player_focus_areas` (`coach_id`, `status`, `outcome_status`, `completed_at`)
  - `golf_insight_action` / `golf_insight_outcome` (migration 20260621160000; coach reads team rows)
  - `readAttributionForPlayer(sb, playerId)` (`src/lib/coachhelm/v3/effectiveness/attribution-read.ts:281`) → `AttributionRow {…, delta, n_rounds_before/after}` and `MIN_SUFFICIENT_ROUNDS = 3`
  - `readFocusVerdicts` (`coachhelm-engine.ts:40`) behind `coachhelm_verdicts_v1`
- `development.ts:150` notes that `golf_coach_insights.outcome_status` is NULL on 606 of 608 rows.

Change:
- `loadFileTrack(scope)` covers this season.
- Counts come from the focus areas: assigned is the count where `coach_id = scope.coachId`. Improved and No change come from `outcome_status` (map the values the same way `ChDiveOutcome`'s `OUTCOME` map does: improved, no_change, worsened).
- Rows: one per focus area, with title, word and when.
- A delta comes from attribution only when `n_rounds_after >= MIN_SUFFICIENT_ROUNDS`.
- New `file/TrackCard.tsx` shows `.ch-hf-tr3` (Focuses assigned / Improved / No change) and the rows.
- With no measured outcome, it says "Not measured yet" with the count of open ones. Never a zero that reads as a failure.
- Coach only, like 5.1.

Tests:
- intent: null gives "No plan set"; the query uses the session client, not the admin client (mock the import); a player viewer's cards never include `intent` or `track` (pure shape test)
- track: all-null outcomes give "Not measured yet", not zeros; attribution under 3 rounds shows no delta
- Playwright: `nointent` and `trackearly`

---

## 6. PR 5a: Move the player-feed shaping out of the action file

Today, `getInsightsForPlayerImpl` (`src/app/golf/actions/insight-delivery.ts`, about 646–832; the file starts with `'use server'`) does this:
1. queries through `applyInsightVisibility` (709)
2. `loadCoachWeightsForPlayer`, `loadActiveGoals`, then `rankEvidenceInsightsScored` (`insight-delivery-ranking.ts:165`)
3. `dedupeBySubject(collapseParScoring(ranked))` (ranking 273, 291)
4. `loadPlayerFeedbackByInsight` (283, private) and `applyPlayerFeedbackOverlay` (318, private)
5. `readsDeliveryPlan` (387, private) and `deliverReads` (`insight-delivery-reads.ts:334`)
6. `recordExposureForReturned(…, 'player_feed', null, …)` (820, 824)
7. `projectInsightsForPlayer(shown)` (`src/lib/coachhelm/delivery/player-projection.ts:43`)

A `'use server'` file may export only async functions, and every export becomes a callable action. So the private sync helpers can't just be exported.

Change:
- New `src/lib/coachhelm/delivery/player-feed.ts` (`server-only`, not `'use server'`).
- Move `loadPlayerFeedbackByInsight`, `applyPlayerFeedbackOverlay`, `readsDeliveryPlan` and its helper `canaryReadsDeliveryPlan` there, unchanged.
- Add `shapePlayerFeed(supabase, playerId, rows, opts): Promise<{ shown; scores }>`, covering steps 2–5 in the same order. It contains no exposure write.
- `getInsightsForPlayerImpl` calls `shapePlayerFeed`, then records the exposure (step 6) and projects (step 7) exactly as now.
- Changelog fragment in `docs/clubhouse/changes/`. This touches engine code outside P013, so ask whoever owns `insight-delivery.ts` to review.

Tests:
- contract: for the existing player-feed fixtures, `getInsightsForPlayer` returns the same ids in the same order before and after. Extend `src/clubhouse/__tests__/coachhelm-actions-contracts.test.ts` if it covers this; otherwise add a test beside the insight-delivery tests.
- `shapePlayerFeed` writes nothing: spy on `from('golf_insight_exposure').insert` and expect zero calls
- the exposure count from `getInsightsForPlayer` is unchanged

---

## 7. PR 5b: The lens ("Coach view / As Eli sees it")

Today:
- `speak(text, viewer)` (`data/coachhelm-voice.ts`). `ChViewer = {role:'coach'; first} | {role:'player'}`.
- `readTextFor(ins, coach)` uses `evidence.coach_copy` for a coach.
- `ChViewVoice`, `PLAYER_VOICE`, `viewerOf` (`coachhelm-views-shape.ts`).
- `toChInsight(raw, {…, viewer})` and `toChDeepInsight(raw, base, inputs, say, role)` (`coachhelm-dive-shape.ts:533`) already take a viewer and a role.
- `firmnessOf` = `engine?.support?.word ?? evidence.read?.word`.
- The coach feed also queries through `applyInsightVisibility` (945, 972).
- `golf_insight_player_feedback` has a coach select policy (`ipf_coach_select_team`), so the overlay can read under the coach session.

Change, server side, in `data/coachhelm-file.ts`:
- `loadFileLens(scope, rawCoachRows)` builds the player lens with no write:
  - Query the player's rows through `applyInsightVisibility` with the coach's session, using the same select and filters as the player query at 709.
  - Run `shapePlayerFeed` (PR 5a), then `projectInsightsForPlayer`.
  - Then `toChInsight`/`toChDeepInsight` with `viewer: {role: 'player'}`, so the firmness word becomes the read word.
  - It must never call `getInsightsForPlayer`. That would record `player_feed` exposures and give the coach a false "Seen" (R1).
- `ChPlayerFile.lens` = `{ cards: ChFileCards }` in the player voice:
  - `intent` and `track` left out
  - `reads` renamed "Also worth knowing", with Working reads moved to their own `working` card
  - the feature card titled "Your focus", or "Coach {name} suggests this as your focus" when proposed
  - the plan card showing "From Coach {name}"
  - the field card with values only
- The coach's own name for the preview comes from the viewer. `ChViewer` coach `first` is already there, and the full name comes from `golf_coaches.full_name` (§8).
- The lens data is built only when the flag is on. It is sent with the page, so the toggle needs no request.

Change, client side:
- New `file/LensBar.tsx`: `Segmented` with "Coach view" and "As {first} sees it":
  - phone: in a sticky `.ch-hf-lensbar` under the green bar
  - desktop: in `FileHead`, 300px wide
  - state is client-only, resets per player, and doesn't go in the URL
- `PlayerFile` takes `lens: 'coach' | 'player'`:
  - Coach-only cards (intent, track, correction chips, Dismiss/Undo, the claim ladder word) leave through `PresenceRow` (`ui/ListPresence.tsx`): height to 0, opacity, margin −24 over 360, height animated in JS.
  - The player-only `working` card enters the same way.
  - Shared cards crossfade through `Swap` (`ui/Swap.tsx`, `useSwapHeight`) to the player-voice copy: opacity to 0.35 over 180 and back.
  - The `.ch-hf-pv` pill "Previewing {first}'s screen" rises 6px over 260 (transform and opacity).
- In the player lens, Accept and Decline render with `aria-disabled` and do nothing; there's a "Preview" hint on press. The lens calls no write and no server action.
- Reduce Motion (`useChReducedMotion`): a dim-and-swap with `chFade`/`CH_FADE_MS`. The shared fade wins: `CH_FADE_MS` (180ms), per SHARED-6. No height animation: cards swap in place.
- The Segmented thumb keeps its own 360 `--ch-ease-spring`.

Tests:
- unit:
  - toggling writes nothing (spy on every `writes` entry and on fetch; zero calls)
  - the player lens has no `intent`/`track` nodes in the DOM after the fold finishes
  - the firmness chip shows the read word, not the ladder word
  - "Also worth knowing" excludes Working reads
  - Accept in the lens calls nothing
- data:
  - `loadFileLens` never imports or calls `getInsightsForPlayer` (module mock throws if called)
  - the player-lens list matches `getInsightsForPlayer`'s ids for the same fixture, minus exposure
  - no field `projectInsightsForPlayer` strips (ladder, q, shrink) appears in the lens payload
- Playwright: toggle at 390 and 1280 under both motion settings; the pill is visible; there's no layout shift above the lens bar; under reduce, no element animates height

---

## 8. PR 6: "Your week" (the player's own file)

Today:
- `PlayerBoard({data: ChPlayerHelm, writes, coursePlanReads})` (`screens/coachhelm/PlayerBoard.tsx:44`, 191 lines) shows `Proposals`, `partitionInsights` (focus / also / working / more), `FocusCard`, `InsightRow`, `ClearedLines` and `MyCoursePlan`. Its codes are CH-13301/2/3/4, 13201 and 13909.
- `ChProposal {id, title, from, coachUserId?}` comes from `loadProposals` (`data/coachhelm.ts:312`), which reads `golf_coaches` `id, user_id` (`coachUserIds`, 336). `golf_coaches.full_name` exists (database.ts about 11951) and the table is readable to any signed-in user.
- The player branch of the route is at 224–233 (fixed 4 Nov wiring). The player keeps the Board / Standing / Deep dive tabs (`views/PlayerHelmTabs.tsx`).

Change:
- With the flag on, `PlayerBoard` renders the player-lens cards from PR 5b in the player order: feat, working, plan, field, sg, reads.
- Desktop order: feat, plan, sg | working, field, reads.
- The data comes from the player's own loaders: the existing `ChPlayerHelm` plus `loadFileField`, `loadFilePlan` (player view: no handshake) and `toChFileSg`, called with the player's session.
- Insights still come from `getInsightsForPlayer`. That's correct here: this is the real player feed, and the exposure it records is the real "Seen".
- Accept and Decline are live: `LIVE_PLAYER_WRITES` through `Proposals`/`ProposalRow` (`Proposals.tsx:26, 155`), reused inside the feature card. The accept motion: actions fade over 160, then `Swap` over 260.
- Coach name: add `full_name` to the `golf_coaches` select in `coachUserIds` (`data/coachhelm.ts:338`), and an optional `coachName?: string` to `ChProposal` (additive). That's two lines in lane 1's file (§10). If the name read fails, it says "Your coach".
- The Standing and Deep dive tabs stay. Removing them is not one of Nick's four calls; ask before the cleanup PR.
- No teammate's name or id reaches this page. Field dots are values only (§4), and SG is vs the team average.

Tests:
- unit: player order; feature card shows "Coach {name} suggests this as your focus" for a proposal, with live Accept/Decline calling `accept(id)`/`decline(id)`; a failed name read gives "Your coach"; no `intent`/`track`; no string from the team roster appears in the rendered HTML (fixture with distinct teammate names)
- Playwright: `viewer=player` at 390 and 1280; accept motion under reduce

---

## 9. Can't build as drawn (each with its fix)

None of these need a migration. Each takes the fix shown.

| Drawn | Why not | Build instead |
|---|---|---|
| "logged 2 of 3 sessions" (`.drill`) | The practice log has a count and a last date (`FocusAreaPracticeSummary`). Nothing stores a planned number of sessions. | "2 sessions logged this week". A target needs a new column, which is a migration, so it's out. |
| A strip of the read's own metric per round in the sheet ("Penalties in the last 10 rounds") | `ChDiveRound` carries score, to par and `toPar18`, not the read's metric per round. No per-round series of that metric is loaded. | Use `ChDiveRounds.strip` (to par per 18) and the rounds list, titled for what they are. Check `ChDiveRound` again at build time in case a later PR adds it. |
| Rail rows with each player's top read (`p.top`) | That data is the board loader's (lane 1). | PR 1 shows name and class year. `line` fills in from lane 1's loader once it lands. |
| "Seen" meaning the player opened it | Exposure is logged when a read is shown in the player's feed, not when it's tapped. | The label stays "Seen". The sheet says "Shown in {first}'s CoachHelm on {date}". With no source insight, it's a dash. |
| A track record with real outcomes | The outcome columns are mostly empty today (606 of 608 null, per `development.ts:150`). The team track record waits on a held migration. | Counts plus "Not measured yet". It fills in as verdicts run. Nothing is invented. |
| "Edit plan" in place | The only write the brief allows here is the five listed. `setIntent` exists but isn't one of them. | A link to where it's edited today (Roster peek), or no link. (fixed 4 Nov wiring: superseded by §13 item 2, the plan sheet saves in place with `setIntent`) |
| "5 teammates averaged" with dots for every team size | Dots on a small team point to people. | Settled 3 Nov: coach dots at every field size; the player never gets dots, and the player's field card needs `field_n ≥ 5` (05 S-BOARD `fieldfew`). |
| Reduce Motion at 60ms | The shared Reduce Motion fade is `CH_FADE_MS`. | Use the shared value. |
| Bars that grow in width | `css-quality` blocks width transitions. | Fixed width, `scaleX` from the axis, 360 with an 18ms stagger. |

Things that build, but need new pure code (no migration): SG vs the team (`toChFileSg`), the field average without the player (`toChFileField`), the goal line points, and the handshake shape.

---

## 10. Overlap with other lanes, and how to avoid conflicts

| File | Who else touches it | This plan's edit | How to avoid a conflict |
|---|---|---|---|
| `screens/coachhelm/CoachBoard.tsx` | lane 1 (becomes the team board) | none | Old links redirect. Lane 1's "Open {first}'s page" calls `playerFileHref` (exported in PR 1; tell lane 1). |
| `data/coachhelm.ts` | lane 1 (Board caps) | PR 6: `full_name` in `coachUserIds`, `coachName?` on `ChProposal` | Two additive lines. Land after lane 1's loader PR, or rebase on it. |
| `data/coachhelm-shape.ts` | lane 1, Ask | `ChProposal.coachName?` only (PR 6) | additive |
| `data/coachhelm-views-shape.ts` | Ask (`coachReadHref`), lane 1 | `playerFileHref`, `PlayerFileCard`, `FILE_BYPASS` (PR 1) | additive, at the end of the file |
| `data/coachhelm-dive-shape.ts`, `data/coachhelm-dive.ts` | possibly lane 1 (ReadSheet) | none | New shapes live in `coachhelm-file-shape.ts`. |
| `data/coachhelm-player.ts` | none known | PR 1: one seam so standing reuses the dive's feed rows | small |
| `screens/coachhelm/parts.tsx` | lane 1 (FocusCard, FocusActions) | none; reused as is | On-green styles go in `coachhelm-file.css` under `.ch-hf-feat`. |
| `screens/coachhelm/views/DeepDive.tsx` | possibly lane 1 | PR 1: `export` on six functions | keyword only |
| `screens/coachhelm/PlayerBoard.tsx` | lane 1 (player board?) | PR 6: flag branch | Check with lane 1 before PR 6. |
| `routes/coachhelm.tsx` | lane 1, Ask | PR 1: one branch before line 190, one CSS import | small and early in the function |
| lane 1's new `ReadSheet.tsx` | lane 1 | none | Risk of two sheets for one read: R10. |
| `screens/coachhelm/chat/Evidence.tsx` | Ask lane | none | the redirect carries `coachReadHref` |
| `screens/roster/Roster.tsx`, `RosterPeek.tsx` | classes-roster-home lane | none | the redirect carries their links |
| `src/app/golf/actions/insight-delivery.ts` | engine owners | PR 5a: move four helpers | its own PR with a contract test |
| `src/app/clubhouse-preview/[screen]/page.tsx` | every lane | one registry entry, one doc line | add next to `coachhelm-coach-player` (577) |
| `config/clubhouse/pages/P013-coachhelm.json` | every P013 lane | `implementation.also` adds the new data files | additive. The JSON array merges badly, so rebase right before merging. |
| `config/feature-flags.yml`, `registry.generated.ts` | anyone adding a flag | one entry | regenerate after rebase |
| `scripts/clubhouse/a11y.mjs`, `aesthetic-capture.mjs` | every lane | one route each | add at the end of the list |
| `src/clubhouse/preview/component-catalog.json` | generated; every lane | regenerated | run `npm run clubhouse:catalog` after rebase, never by hand |
| `e2e/clubhouse-quality.spec.ts` | every lane | one appended describe block | append at the end |
| `styles/coachhelm.css`, `coachhelm-dive.css` | lane 1, Ask | none | all new rules go in the new `coachhelm-file.css` |

New files (no conflict):
- `src/lib/coachhelm/v3/player-file/flag.ts`
- `src/lib/coachhelm/delivery/player-feed.ts` (PR 5a)
- `data/coachhelm-file.ts`, `data/coachhelm-file-shape.ts`
- `screens/coachhelm/file/PlayerFile.tsx`, `FileRail.tsx`, `FileHead.tsx`, `FeatureCard.tsx`, `ReadsCard.tsx`, `SgCard.tsx`, `EvidenceSheet.tsx`, `FileSkeleton.tsx`, `PlanCard.tsx`, `FieldCard.tsx`, `IntentCard.tsx`, `TrackCard.tsx`, `LensBar.tsx`
- `styles/coachhelm-file.css`
- `preview/PreviewCoachHelmPlayerFile.tsx`, `preview/fixtures-coachhelm-player-file.ts`
- tests and changelog fragments

---

## 11. Risks

- **R1 False "Seen".** If any lens code calls `getInsightsForPlayer`, it records `player_feed` exposures under the coach's view, and the handshake shows Seen when the player never saw it. Guard: PR 5a's `shapePlayerFeed` has no write, and PR 5b's tests mock `getInsightsForPlayer` to throw.
- **R2 Exposure volume.** `golf_insight_exposure` is large (86,770 rows for 64 reads on the largest program, per the held migration's note). The Seen read is one `limit(1)` on the indexed `insight_id`, for the live focus only. Never list exposures.
- **R3 Double coach exposure.** The file shows dive and standing data on one page. Calling both loaders unchanged would record `coach_feed` twice per view. Fix in §2.3.
- **R4 Field-day flag.** The loader's comment ties it to `coachhelm_team_pattern_v1`. PR 3 requires that flag too, so the field card is absent when it's off. Ask Nick whether that's wanted, or whether the new flag alone should open it.
- **R5 Who's who on a small team.** Dots plus a known score can identify teammates. Rule: no dots below 5 others, and no ids or names in any player payload. Tested in PR 3 and PR 6.
- **R6 Actions on green.** `FocusActions` was styled for paper, and Deep dive puts it outside the green head for this reason (`DeepDive.tsx:445`). On the feature card it needs on-green button and text colours under `.ch-hf-feat`, checked for AA in both themes.
- **R7 Intent leaking.** The intent card must never be in data sent to a player. RLS already blocks a player's read. The plan also leaves it out of the player-voice shape (test in PR 4).
- **R8 css-quality.** The fold and the bars can't use CSS height or width transitions. Use `PresenceRow`/`useSwapHeight` and `scaleX`. `npm run clubhouse:css` fails the PR otherwise.
- **R9 Redirect loops.** The old views link to each other. With the flag on, only the file's "Full standing" link may enter them, and it carries `from=file`. Test that `?view=standing&player=X&from=file` renders.
- **R10 Two sheets for one read.** Lane 1 plans `ReadSheet.tsx`, and this plan adds `EvidenceSheet.tsx`. Agree on one component, with the Deep dive parts inside, before both land. Whichever lands second imports the first.
- **R11 Lens RLS.** The lens runs player-feed shaping under a coach session: weights, goals, feedback and delivery plan. Each read must work for a coach. `ipf_coach_select_team` covers feedback. Check the others in a test against a seeded coach before PR 5b merges. I couldn't run that here.
- **R12 Accept and Decline in the lens.** They must look real but do nothing. A wired button here would act on the player's behalf.
- **R13 PR 5a touches engine code.** A behaviour-equal move still changes a hot path. Ship it alone, with the contract test.
- **R14 Catalog.** No `clubhouse:catalog` regeneration was run for this plan. Every PR regenerates it after rebasing.

---

## 12. Acceptance per PR

Every PR:
- flag off: every CoachHelm address renders exactly as at 75b4956 (Playwright screenshot of board, Deep dive and Standing)
- 390pt and 430pt phones, plus 1280 desktop: no horizontal scroll, 16/20px side gutters
- Text Size: at the largest `--ch-type-k` nothing clips, and cards grow
- Reduce Motion and `[data-motion='off']`: no movement beyond the shared fade
- AA contrast on paper and on green, light and dark
- no left border wider than 1px on any `.ch-hf-*`
- one card style; titles inside cards; one green feature card per view
- every figure has its sample, window and read word one tap away
- the green phone bar and desktop bars match a Stats screenshot
- `clubhouse:catalog -- --check`, `clubhouse:css`, `flags:check` and `playwright.clubhouse.config.ts` pass

Per PR:
- **PR 1:** old links redirect to the matching card; `at`/`insight` open the right card or sheet; Assign, Dismiss and Undo behave as on Deep dive today
- **PR 2:** the handshake matches the focus area's dates; Seen only from `player_feed` exposures after the focus area's `created_at`
- **PR 3:** the player is left out of the field's n and mean; no dots below 5 others
- **PR 4:** intent and track never render, or reach the client, for a player
- **PR 5a:** player-feed ids, order and exposure count unchanged
- **PR 5b:** the toggle writes nothing; the player lens matches the player's real feed for the same fixture
- **PR 6:** live Accept and Decline; no teammate name or id in the page HTML

---

## 13. Reconciled with the fidelity spec and data checks (Oct 31)

Where this section and the sections above disagree, this section wins. It was written after `03-DATA-CHECKS.md` and `04-FIDELITY-SPEC.md` landed.

1. **Fix the goals leak first (PR 0, small, alone).** `readPlans` (`data/coachhelm-dive.ts:53-71`) loads goals with `loadActiveGoals` / `loadRecentlyAchievedGoals`, which use the admin client and no share filter (`src/lib/coachhelm/v3/goals/loader.ts:19-38`). The coach's Deep dive can show a player's private goals today. `loadPlayerDetail.ts:14-16` already says why not to do this. For a coach viewer read goals with the session client (RLS `goals_coach_view`: coach-made or `shared_with_coach`), or filter `creator_role = 'coach' or shared_with_coach`. Test: a private player goal never reaches a coach's shape. This is behind Clubhouse's own flag today but should not wait for the file.
2. **Plan sheet in place.** "Edit plan" and "Set a plan" open the plan sheet on the page and save with `setIntent` (`src/app/golf/actions/v3/intent.ts:100`), the same write the Roster peek uses. Six writes, not five. New `file/IntentSheet.tsx` (Aim single pick, Alerts single pick, Watching multi pick, Note), reusing the sheet and the pick styles. "Not set" comes from reading the intent row with the session client; never show `loadIntent`'s default as the coach's plan.
3. **Field card.** Use `FieldDayEntry` as it is: `field_mean` and `relative` include the player, copy says "the field, Eli included, averaged" and "{field_n − 1} teammates played". `toChFileField` keeps `dots` (coach only, any field size, settled 3 Nov) but drops the without-the-player mean. Player viewer and lens: `dots: null` always, and the card itself is null when `field_n < 5` (the field mean of 3 or 4 includes the player, so it would give away the sum of two or three named teammates' scores; 5 matches the `team_n ≥ 5` floor on the Team figure). Keep the `coachhelm_team_pattern_v1` gate.
4. **Evidence sheet strip.** For the penalty read, a new read of `golf_rounds.total_penalties` for the player's last 8 countable rounds (the column exists; no migration). For other reads, the to-par strip titled "Score to par, last 8 rounds".
5. **Labels.** Handshake middle step is "Shown to {first}". Once assigned, the coach's chip reads "Assigned" (`stanceOf`). Practice line: "{n} sessions logged this week", no target.
6. **Early and empty copy** use `roundsToGo` (export it from `data/coachhelm.ts:99-122`; floor 4, 90-day window). No season dates in those states.
7. **Preview states.** Add `long` (long first, last and course names) to the `coachhelm-player-file` fixture list. Capture names map as in `04-FIDELITY-SPEC.md` section 5.
8. **Hooks.** Put the `data-ch-hf-*` attributes from `04-FIDELITY-SPEC.md` section 6 on the built controls; the capture script clicks them.
9. **Reduce Motion** is the app's `CH_FADE_MS` (180ms) opacity fade, pushes, sheets and the lens switch included (SHARED-6, 3 Nov; this replaces the 120ms this item said before). Pass nothing locally and leave `reduced-motion.test.tsx` as it is.
10. **Players compare against Tour and team only** (Nick, Oct 31). `dots` is null for any player viewer and the lens, whatever the team size.
11. **Strokes card** (`toChFileSg`): bar = the leg's strokes gained (Tour baseline, as stored); team tick = the team's average on that leg from the standing shape (`vsTeam`). No tick under 5 teammates.

## Completeness pass, 4 Nov 2026

Two link contracts other lanes call into. Ask (done) links player names to the file with `playerFileHref`; Classes and Roster (done) own the profile that "Open {first}'s profile" opens. §2.2's `playerFileHref` line was fixed in place to this signature.

### `playerFileHref` (PR 1, `data/coachhelm-views-shape.ts`, additive, next to Read's `readHref`)

| Part | Rule |
|---|---|
| Signature | `export function playerFileHref(playerId: string, at?: { card?: PlayerFileCard; insight?: string }, on = false): string` |
| Why `on` is a parameter | Same reason as Read 02 §3.2 `readHref(player, insight, on = false)`: flags are server-only (`src/lib/flags/is-enabled.ts`) and this module is client-safe. Callers take `on` from their server loader (`isPlayerFileEnabled()`), the way the route hands `trackRecordHref` to `CoachBoard`. |
| `on` true | `/golf/dashboard/coachhelm?view=player&player=${encodeURIComponent(id)}`, plus `&at=${card}` and `&insight=${encodeURIComponent(insight)}` when given; empty parts are left out. |
| `on` false (flag off, or a caller that passed nothing) | Today's address, byte for byte: `card: 'sg'` gives `coachPlayerHref('standing', id)`; anything else gives `coachPlayerHref('deep-dive', id)`, with `&insight=` when given (as `coachReadHref` builds it). With the flag on those old addresses redirect into the file (§2.2), so a caller that forgets `on` still lands on the file, one redirect later; with it off nobody lands on a page that doesn't exist. |
| Player role | Coach only. Never rendered in a player's payload or UI: Ask links player names for coaches only, and no player surface calls it. On the server a player session never reaches the coach branch (today's guard); a player who opens a file URL gets their own CoachHelm (`S-BOARD` with this flag on, today's board off), the query dropped by replace, and nothing of that player loads. A coach with an id not on their team gets `CoachPlayerNotOnTeam` (CH-13311). |
| Callers | S-LIST rows (lane 1), Team's player sheet "Open {first}'s page" (CT3), Ask answer names (Ask lane, replacing its `coachPlayerHref` stand-in), Read's cold-start Back target for a coach (`readHref` lane), roster peek later (cleanup PR). Rows in 05, 06 and 08 that write `playerFileHref(id)` mean `playerFileHref(id, undefined, on)`. |
| Tests | In `coachhelm-file-route.test.tsx`: `on` false returns today's deep-dive, standing (`card: 'sg'`) and insight addresses exactly; `on` true returns the file address with `at` and `insight`; ids are encoded; empty parts are left out. |

### "Open {first}'s profile" (S-FILE.more)

| Part | Rule |
|---|---|
| Address | `/golf/dashboard/roster?player=${encodeURIComponent(id)}`, the Classes and Roster lane's `S-ROSTER.profile.deeplink` (their PR 8, their 08 CP-21). |
| Before their PR 8 lands | Roster ignores the param and opens on its list. No fallback here; the menu item is still right. |
| Back | "‹ Roster" goes to the Roster list (their rule); browser Back from there returns to the file at the same scroll. |
| Flag off | The menu only exists with `coachhelm_player_file_v1` on, so there is nothing to fall back to. |
| Player role | The menu is coach only; a player never sees it. |
