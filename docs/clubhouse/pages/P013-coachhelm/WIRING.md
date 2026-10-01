# P013 — CoachHelm: wiring map

## Entry point

```text
Route:                   /golf/dashboard/coachhelm
Page:                    src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx
                         (a coach or a player with golf_clubhouse_ui on ->
                         ClubhouseCoachHelmRoute with ?view= handed to it, drawn
                         in place; else the Fairway page; no session ->
                         /golf/login)
Clubhouse route adapter: src/clubhouse/routes/coachhelm.tsx
                         ClubhouseCoachHelmRoute({ view, player, c, insight }):
                         ?view=development -> redirect to Stats' Development
                         (/golf/dashboard/stats?tab=dev), before the session is
                         read; no session -> nothing; session.coach ->
                         resolveClubhouseTeam, and no team (or not a coach team)
                         -> the no-team page (CH-13308), else ONE <Suspense>,
                         not keyed by view, around an async CoachHelmView
                         (?view=ask the Ask sub-tab: loadCoachHelmGate, then
                         loadAskCoachHelm -> Ask; else loadCoachCoachHelm ->
                         CoachBoard), its fallback the skeleton of the view the
                         address names;
                         session.player -> likewise ONE <Suspense> around an
                         async PlayerHelmView: ?view=profile|standing|deep-dive
                         -> the gate first (loadPlayerHelmGate: off -> the
                         board's own page CH-13304, a lookup that failed -> the
                         view's did-not-load, never "off"), then the view's one
                         loader; any other ?view= (insights, nothing, anything
                         else) -> loadPlayerCoachHelm -> PlayerBoard (no team
                         needed: without one there is no tour and nothing
                         proposed). The boundary is the same one for every view
                         (perf, 2026-10-01): a switch keeps the view on screen,
                         dimmed, and swaps once; the skeleton is for a hard load.
                         A view's address never chooses whose data it reads: the
                         player id is the session's. ?insight=<id> (Deep dive
                         only) is a name to open, passed to the screen and
                         checked against the player's own list.
Server loaders:          src/clubhouse/data/coachhelm.ts loadCoachCoachHelm and
                         loadPlayerCoachHelm (one read for the role; each failed
                         read logs through chLogServer('coachhelm', …) and never
                         throws for a partial read), with coachhelm-shape.ts
                         (types, partition, ordering, the pulse rows) and
                         coachhelm-map.ts (generator output to what is drawn).
                         loadPlayerHelmGate is the switch the board and every
                         view share.
View loaders (player):   coachhelm-profile.ts loadPlayerProfile,
                         coachhelm-standing.ts loadPlayerStanding and
                         coachhelm-dive.ts loadPlayerDeepDive, each
                         `({ playerId }) -> ChViewLoad<…>` (ready / off /
                         failed), with their pure steps in
                         coachhelm-profile-shape.ts, coachhelm-standing-shape.ts
                         and coachhelm-dive-shape.ts and the shared
                         coachhelm-views-shape.ts (the view union, addresses,
                         labels, the Development link). A failed read is
                         `failed`, never an empty page; each part beside the
                         main read has its own flag.
Screens:                 src/clubhouse/screens/coachhelm/PlayerBoard.tsx (->
                         Proposals.tsx) and CoachBoard.tsx -> parts.tsx (the
                         cards); the player's views in screens/coachhelm/views/:
                         Frame (page, sub-navigation, off page), PlayerHelmTabs,
                         Profile, Standing, DeepDive, KeepReading, Skeletons
Skeleton:                src/clubhouse/screens/coachhelm/CoachHelmSkeleton.tsx
                         (CH-13401 player, CH-13402 coach), from
                         coachhelm/loading.tsx through ClubhouseSwitch and
                         CoachHelmRouteSkeleton (the role from the golf user
                         context). A view's own skeleton is the page's Suspense
                         fallback (views/Skeletons.tsx: CH-13460 profile,
                         CH-13470 standing, CH-13480 deep dive; Ask's is
                         chat/AskSkeleton.tsx), because coachhelm/loading.tsx
                         cannot read ?view=. Every skeleton draws the view
                         strip's place and height (38px desktop, 44px phone).
View switch:             screens/coachhelm/use-view-switch.ts (useViewSwitch),
                         owned by each page that draws the strip (CoachBoard,
                         Ask, PlayerBoard, views/Frame): the strip moves on the
                         tap, the page is aria-busy and dimmed
                         (coachhelm.css, coachhelm-ask.css) until the next view
                         lands.
Route error:             src/app/golf/(dashboard)/dashboard/coachhelm/error.tsx
                         (the shared RouteErrorBoundary)
```

## End-to-end graph

```text
UI (Assign as focus, Dismiss, Undo in CoachBoard; Accept and Decline in the player's Proposals; the player and insight pickers; Try again on a notice)
↓
Action (a handler in CoachBoard or Proposals calls run() on a useAction and does nothing after it)
↓
Client controller: useAction (offline refusal CH-1903, slow notice CH-1902, chReport + error toast with Retry + haptic).
                   Every follow-up (the Assigned chip, hiding a dismissed card, restoring it, the Started or Declined chip) is
                   INSIDE the action function, so Retry does it too.
↓
Writes: LIVE_COACHHELM_WRITES and LIVE_PLAYER_WRITES (writes.ts), one method per server action
↓
Server actions: src/app/golf/actions/development.ts (createFocusAreaFromInsightV2, acceptFocusArea, declineFocusArea),
                src/app/golf/actions/insights.ts (dismissInsight, reactivateInsight)
↓
Data: golf_player_focus_areas, golf_coach_insights, golf_insight_action
↓
Contract outcomes: CONTRACT.md (Bridge IDs 13ccii, catalog CH-13xxx)
↓
Bridge: recorded, not wired (D-68)
↓
Tests: src/clubhouse/__tests__/coachhelm.test.tsx
```

The player's three views are reads only, with no write path and no action record
(there is nothing to assign, dismiss or accept on them):

```text
UI (the sub-navigation, a read in the Deep dive's list, Try again on a
notice, links to Development and to a round's review)
↓
Server component (ClubhouseCoachHelmRoute -> playerDrill -> an async view
component) -> the view's loader, for session.player.id
↓
Reads (the shared client unless the lib's own loader says otherwise; every
failure logs through chLogServer('coachhelm', …)):
  profile   -> loadGenome (golf_player_genome)
  standing  -> loadPlayerStandingMap (golf_player_standing; the lib's
               service-role client, scoped by the player id and filtered to
               it), golf_player_stats_cache (rounds played and the scoring
               average; the five-round floor the Fairway loader uses)
  deep dive -> getInsightsForPlayer (the Board's feed), getThemesForPlayer,
               golf_rounds (the rounds a read names: this player's,
               completed, not a test round), golf_player_focus_areas,
               loadActiveGoals and loadRecentlyAchievedGoals (the lib's
               service-role client, scoped by the player id and filtered to
               it)
↓
Pure steps (toChProfile, toChStanding, toChDeepInsight): what the screen
draws, so the preview and the tests run the same code
↓
Contract outcomes: CONTRACT.md (CH-13260, CH-13270, CH-13271, CH-13280 to
                   CH-13283, CH-13304, CH-13360, CH-13361, CH-13370 to
                   CH-13373, CH-13380 to CH-13384, CH-13460, CH-13470,
                   CH-13480, CH-13780, CH-13860, CH-13880, CH-13890,
                   CH-13930, CH-13931, CH-13980 to CH-13982)
↓
Tests: coachhelm-profile.test.tsx, coachhelm-standing.test.tsx,
       coachhelm-dive.test.tsx, coachhelm-views.test.tsx
```

## Actions

Each action's record is in `config/clubhouse/pages/P013-coachhelm.json`
(`actions`), and the whole list is readable in
`docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`. Offline, every write is
refused before anything is sent (the shell's 10703, CH-1903; 130702). Every
failure toast carries Retry, which runs the whole action again (131401).
Choosing a player or an insight is page state, not an action record.

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P013-ASSIGN-FOCUS | Assign as focus (coach) | `assign.run(cur)` in `CoachBoard` | `writes.assign` → `createFocusAreaFromInsightV2` (the insight's own title, first sentence, area type and metric) | golf_player_focus_areas, golf_insight_action | saving 130203 · chip 130901 · proposal 130902 · existing focus is done 130903 · refused 130601 · Retry 131401 · offline 130702 |
| ACT-P013-DISMISS-INSIGHT | Dismiss (coach) | warning haptic, then `dismiss.run(cur)` | `writes.dismiss` → `dismissInsight` | golf_coach_insights, golf_insight_action | saving 130203 · notice 130701 · refused 130602 · Retry 131401 · counts follow 130105 |
| ACT-P013-UNDO-DISMISS | Undo in the dismissed notice (coach) | `undo.run(cur)` | `writes.undo(id, lifecycle)` → `reactivateInsight(id, lifecycle)` | golf_coach_insights | saving 130203 · refused 130603 · Retry 131401 · restores the state it had 131403 |
| ACT-P013-ACCEPT-FOCUS | Accept on a proposed focus area (player) | `accept.run()` in `ProposalRow` | `writes.accept` → `acceptFocusArea(id)` (the player's own `proposed` row, RLS and a status guard) | golf_player_focus_areas | saving CH-13404 · chip CH-13902 · refused CH-13004 · Retry 131401 · offline 130702 |
| ACT-P013-DECLINE-FOCUS | Decline on a proposed focus area (player) | `decline.run()` in `ProposalRow` | `writes.decline` → `declineFocusArea(id)` | golf_player_focus_areas | saving CH-13404 · chip CH-13902 · refused CH-13005 · Retry 131401 · offline 130702 |
| ACT-P013-TRY-AGAIN | Try again on a failed-read notice | `InlineNotice` → `router.refresh` | the server route, read again | (every read) | recovery 131402 · failed notices 130604 to 130606 |

## Components

| Path | Purpose | States |
| --- | --- | --- |
| `screens/coachhelm/PlayerBoard.tsx` | The player's page: header, the proposals, the focus, Also worth knowing, Working; it writes only the player's own answer | CH-13201, CH-13204, CH-13301 to CH-13304, CH-13701, CH-13801, CH-13805 |
| `screens/coachhelm/Proposals.tsx` | "Proposed for you": each focus a coach proposed, with Accept and Decline and the answered chip | CH-13004, CH-13005, CH-13205, CH-13204, CH-13404, CH-13704, CH-13807, CH-13902 |
| `screens/coachhelm/CoachBoard.tsx` | The coach's page: header, pulse, By player, the chosen player's focus and the three writes | CH-13001 to CH-13003, CH-13202 to CH-13204, CH-13305 to CH-13307, CH-13309, CH-13310, CH-13403, CH-13601, CH-13703, CH-13901 |
| `screens/coachhelm/parts.tsx` | `FocusCard`, `Evidence` (`Gauge`, bars, `ReadMeter`), `PriPill`, `InsightRow`, `PulseList`, `Head` | CH-13802, CH-13803, CH-13804, CH-13806 |
| `screens/coachhelm/writes.ts` | The writes interfaces, `LIVE_COACHHELM_WRITES` and `LIVE_PLAYER_WRITES`; preview and tests pass their own set | — |
| `screens/coachhelm/CoachHelmSkeleton.tsx` | Route skeleton, one shape per role | CH-13401, CH-13402 |
| `screens/coachhelm/views/Frame.tsx` | The page every player view is drawn in (phone top bar, sub-navigation, header; `after` holds a pushed phone screen outside the page's size container) and `HelmOff` | CH-13304, CH-13801 |
| `screens/coachhelm/views/PlayerHelmTabs.tsx` | The player's sub-navigation: Board, Game profile, Standing, Deep dive as one radiogroup, a row of chips on the phone, and the Development link | CH-13930, CH-13931 |
| `screens/coachhelm/views/Profile.tsx` | Game profile: the persona and the seven measures, each with its value, plain meaning, sample and confidence | CH-13260, CH-13304, CH-13360, CH-13361, CH-13860 |
| `screens/coachhelm/views/Standing.tsx` | Standing: every tracked stat against the Tour and the team, the projections and the most to gain | CH-13270, CH-13271, CH-13304, CH-13370 to CH-13373, CH-13880 |
| `screens/coachhelm/views/DeepDive.tsx` | Deep dive: the list of reads beside one read in full (a pushed screen on the phone) | CH-13280 to CH-13283, CH-13304, CH-13380 to CH-13384, CH-13780, CH-13890, CH-13903, CH-13980 to CH-13982 |
| `screens/coachhelm/views/Skeletons.tsx`, `KeepReading.tsx` | Each view's skeleton at final height; the closing links between views | CH-13460, CH-13470, CH-13480 |
| `routes/coachhelm.tsx` | Route adapter, the player's view dispatch (`playerDrill`) and the coach's no-team page | CH-13308 |

## Hooks

| Path | Type | Used by |
| --- | --- | --- |
| `src/clubhouse/lib/use-action.ts` (`useAction`, `normalise`) | Clubhouse | CoachBoard (three actions), Proposals (two) |
| `src/clubhouse/lib/use-phone.ts` (`useChPhone`) | Clubhouse | PlayerBoard, CoachBoard, every player view |
| `src/clubhouse/ui/Toast.tsx` (`useToast`) | Clubhouse | CoachBoard (the existing-focus toast) |
| `src/clubhouse/shell/phone-chrome.tsx` (`PhoneTop`, `usePhoneStackHistory`) | Clubhouse | PlayerBoard, CoachBoard, the player views; `usePhoneStackHistory` in DeepDive (the open read is a history entry, CH-13980) |
| `src/clubhouse/shell/PhoneScreen.tsx`, `ui/PhoneBar.tsx` | Clubhouse | DeepDive (the pushed read on the phone) |
| `src/clubhouse/lib/haptics.ts`, `track.ts` | Clubhouse | throughout |

There are no realtime hooks: the page is read once on the server.

## Services / server actions

| Name | Path | Existing/New/Held | Purpose |
| --- | --- | --- | --- |
| createFocusAreaFromInsightV2 | actions/development.ts | Existing (the Fairway Brief's) | Assign as focus: a proposal the player accepts |
| acceptFocusArea, declineFocusArea | actions/development.ts | Existing (Fairway Development's, and Stats Development's Accept and Decline) | The player's answer to a proposed focus area: `proposed` to `active`, or to `declined` |
| loadTourBenchmarks, tourForGender | clubhouse/data/stats-common.ts | Existing (Stats and Home use them) | The team's own tour's values from `golf_pga_standards` (Q-88) |
| dismissInsight, reactivateInsight | actions/insights.ts | Existing (the Fairway Brief's) | Dismiss, and its true reverse |
| getInsightsForPlayer, getTopInsightsForPlayers | actions/insight-delivery.ts | Existing (the delivery actions) | A player's ranked feed (up to 30); one top insight per team player |
| getCoachProgramPulse | lib/coachhelm/v3/chat/request-cache.ts | Existing (cached per request) | The program pulse |
| isCoachHelmEnabledForPlayer, isCoachHelmEnabledForCoach | lib/coachhelm/v2/gate.ts | Existing | Whether CoachHelm is on, and who turned it off |
| applyInsightVisibility, fetchAllRowsResult | lib/coachhelm/v3/insight-visibility.ts, lib/supabase/fetch-all-rows.ts | Existing | The visible-insights probe, paginated |
| loadGenome, derivePersona | lib/coachhelm/v3/genome/loader.ts, persona.ts | Existing (the Fairway Game profile's) | The stored genome row (null for none or uncomputed; a failed read throws) and the persona derived from it |
| loadPlayerStandingMap | lib/coachhelm/v3/standing/loader.ts | Existing (the Fairway Standing's) | The player's `golf_player_standing` rows by metric (the lib's service-role client, scoped by the player id) |
| computeCounterfactual | lib/coachhelm/v3/counterfactual/compute.ts | Existing | What closing a gap is worth, from the scoring average (five-round floor, as `loadPlayerScoringBaseline`) |
| getThemesForPlayer | actions/insight-delivery.ts | Existing (the Fairway Deep dive's) | The category reads: where each stands, its strokes gained and trend, and the causes' team-anchored gains |
| loadActiveGoals, loadRecentlyAchievedGoals | lib/coachhelm/v3/goals/loader.ts | Existing | The player's goals (the lib's service-role client; the loader filters rows to the player id) |

## Data resources

### DATA-COACHHELM

```text
Tables:   golf_coach_insights (visible rows, evidence), golf_insight_player_feedback (a player's own dismissals),
          golf_drills (the attached drill's text), golf_player_focus_areas (a focus already made from an insight, written
          by Assign; and the player's own proposed ones, answered by Accept and Decline), golf_team_members and
          golf_players (a coach's active roster and names; a player's active team), golf_teams (the team's gender, so its
          tour), golf_pga_standards (the tour's value per metric, read-only reference data), golf_rounds (a count, only
          for a player with no insight), golf_insight_action (written by the actions)
RPCs:     none read by these loaders (the delivery actions have their own reads)
Storage:  none
Realtime: none
Cache:    none, except the pulse's per-request React cache; a Try again reads the page again (router.refresh)
RLS:      the RLS-scoped client throughout; the server actions check the caller first
Read path:  the loaders, on the server, in rounds (132101); a coach's are the resolved team's active players' (130802),
            a player's are their own (130803)
Write path: the server actions above, through writes.ts
```

### DATA-COACHHELM loader contract (owner rules, 2026-10-01)

What the loaders say when a read fails, and what the screens may rely on.

- A read that failed is never an empty or zero value. Each loader result
  carries its own flag: `insights.error`, `proposals.error`, `roster.error`,
  `players.error`, `pulse.error`, and, new, `missing` (`ChBoardMissing`:
  `drills`, `assigned`, `declined`, `newest`, `tour`), present only when a
  read beside the top card failed. The coach's board does not offer Assign or
  Propose again while `assigned`, `declined` or `newest` is set (CH-13207).
- `ChCoachHelmData.pulse` is a `ChPulse` (a preview's or a test's) or a
  `Promise<ChPulseResult>` (the loader's): the loader never awaits the pulse,
  starts it after the gate, and hands it over marked handled and never
  rejecting (`ok` with the pulse, or `failed`). `CoachBoard` reads it with
  `use()` in the pulse card's own Suspense. A render that adds a read adds it
  to the loader, not to the board: the board adds none.
- The delivery actions (`getInsightsForPlayer`, `getTopInsightsForPlayers`)
  record what they return as shown: each runs once per render, after the
  gate. Nothing in this contract starts one early, twice or from the client.
- `ProgramPulse.failed` (`lib/coachhelm/v3/chat/program-pulse.ts`) names the
  pulse reads that failed and is absent when none did; `items` and the counts
  are what they always were. An item made from a failed read is dropped by the
  Clubhouse layer (`pulseItemsThatStand`), and a rounds failure makes
  `players_without_rounds` and `players_with_recent_rounds` not facts
  (`noRoundsFrom`, the coverage line and the openers check `failed` first).
- `CoachChatContext.roster_failed` (`lib/coachhelm/v3/chat/context.ts`) is set
  only when the membership read failed; `loadAskCoachHelm` then answers
  `failed`, never `noRoster`. `PlayerCohort.failed` (the cohort loader) is set
  only on a failed lookup, for the page that would state the cohort as fact;
  the generators and the cron read `gender` as before.
- The coach's and the player's picks are in the address (`?player=`,
  `?insight=`), written with `history.replaceState` and never through the
  router, and read from the address when the screen mounts
  (`screens/coachhelm/url-state.ts`). The Ask composer's draft is in
  sessionStorage under the route and team, the coach and the chat; the History
  search and the chats panel use `useChSessionState`.

### DATA-COACHHELM-VIEWS

The player's Game profile, Standing and Deep dive. Reads only, for the signed-in
player.

```text
Tables:     golf_player_genome (the genome row), golf_player_standing (the rows
            `loadPlayerStandingMap` returns), golf_player_stats_cache (rounds
            played and the scoring average), golf_coach_insights (through the
            delivery action, and the visible-rows probe that tells an empty feed
            from a failed one), golf_insight_player_feedback (a player's own
            dismissals), golf_drills, golf_rounds (the rounds a read names: this
            player's, completed, not a test round; and the countable-round count
            on the first-run page), golf_player_focus_areas (this player's focus
            areas and what was assigned), golf_goals (through the goals
            loaders), golf_team_members and golf_teams (the team's tour),
            golf_pga_standards (read-only reference data)
RPCs:       none read here (getThemesForPlayer and the delivery action have
            their own reads)
Storage:    none
Realtime:   none
Cache:      none; Try again reads the page again (router.refresh)
RLS:        the RLS-scoped client for every read this adapter makes itself.
            Three of the lib's own loaders use the service-role client
            (loadPlayerStandingMap, loadActiveGoals, loadRecentlyAchievedGoals):
            the adapter hands them only the session's player id and filters what
            they return to that id, so a row that is anyone else's is never
            drawn (tested)
Read path:  the loaders, on the server, behind the same switch as the board
            (loadPlayerHelmGate); nothing in the address chooses whose data it
            is
Write path: none
```

## Held dependencies

None. Accept and Decline for a proposed focus (Q-77) are on the player's board
here (`Proposals.tsx`) as well as in Stats Development
(`screens/stats/ProposalAnswer.tsx`), which it does not import: that component's
toast numbers (CH-5003, CH-5004) and `.ch-pf-answer` style are Stats', so this
page has its own row over the same two actions. The player's Development is
Stats' Development tab, reached by `?view=development` and by a link in the
sub-navigation (Q-76: the Game profile, Standing and Deep dive are built;
Development is not duplicated here).

## Impact notes

- `createFocusAreaFromInsightV2`, `dismissInsight` and `reactivateInsight` are
  shared with the Fairway Brief and coach pages: a change there changes both
  UIs.
- `acceptFocusArea` and `declineFocusArea` are shared with the Fairway
  Development view and Stats Development: a change to what they return on a
  stale answer ("Focus area not found or no longer pending") changes all three.
- The Tour values (Q-88) come from `loadTourBenchmarks` in
  `data/stats-common.ts`, which Stats and Home also use, and from
  `golf_pga_standards` (readable by any signed-in user). A gauge is drawn
  against the Tour only for a metric the generator's college comparison shares
  with a `golf_pga_standards` row (`penalty_rate_per_round`, `big_number_rate`,
  `practice_tournament_delta`: the same quantity in the same unit); a change to
  which generators write `comparison_source: 'cohort_avg'` needs that looked at
  again.
- The delivery actions answer an empty list (or map) when a read fails. The
  loaders rely on that and probe the insights table themselves to tell a failure
  from a first run (130411); a change to what those actions return on failure
  breaks that.
- `createFocusAreaFromInsightV2` calls
  `revalidatePath('/golf/dashboard/coachhelm')` among others, so the framework
  may serve the route again after an assign lands. The chosen player, this
  visit's chip and its dismissals are client state and nothing here depends on
  it; it was not observed.
- The program pulse is the coach's own (`getCoachProgramPulse` resolves its team
  through the coach chat context) while this page's team comes from
  `resolveClubhouseTeam`; each resolves the coach's active team with its own
  resolver, and nothing here proves they can never differ.
- `?view=development` redirects before the session is read, so it applies to a
  coach and to a player alike. The other `?view=` values are read only after the
  session: a coach's `?view=profile`, `standing` and `deep-dive` are their own
  board (the player's gate and loaders never run for a coach, a coach who is
  also a player is a coach), and a player's are their own views.
- The player's views share code with the Fairway pages: the genome and persona
  (`lib/coachhelm/v3/genome`), the standing rows and metric registry
  (`lib/coachhelm/v3/standing`), `computeCounterfactual`, the delivery and theme
  actions and the goals loaders. A change to what a loader returns on failure (a
  thrown error, an empty list, `success: false`) changes which state a view
  draws: `loadGenome` throws, `getInsightsForPlayer` answers an empty list,
  `getThemesForPlayer` answers `success: false`, the goals loaders throw, and
  each is read as the failure it is.
- `team_pct` in `golf_player_standing` is direction-aligned (higher is better)
  for every metric family the refresh functions write (checked against every
  refresh function in
  `supabase/migrations/20260925120000_golf_standing_team_pct_floor_5.sql`);
  Standing's "ahead of your team" and rank wording rest on that, and the
  projection floor of five rounds is pinned by a test that reads the Fairway
  loader's own source. A change to either needs those looked at again.
- A genome dimension has no stored sample size of its own (only the rounds the
  genome was computed over and a confidence word per dimension), so the Game
  profile says how many rounds once, in its header, and a confidence word per
  measure, and never an n per dimension.
- A pushed phone screen (the Deep dive's open read) is rendered beside the
  page's `<main>`, not inside it: the page is a size container (`container-type:
  inline-size`), and layout containment would make a `position: fixed` screen
  fixed to the page, not the phone.
- Every follow-up to a write lives inside its `useAction` function. Anything
  added after `await x.run()` in a handler is skipped when the toast's Retry
  lands (131401).
- On a coach's gate lookup failure the loader still reads the pulse (it is the
  program's, not the gate's) and hands it over like any other, so the board
  draws the pulse or its own notice beside the roster notice, never "Nothing
  is flagged" over a pulse that was not read (130608).
