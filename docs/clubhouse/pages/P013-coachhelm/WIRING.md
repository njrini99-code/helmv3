# P013 — CoachHelm: wiring map

## Entry point

```text
Route:                   /golf/dashboard/coachhelm
Page:                    src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx (a coach or a player with golf_clubhouse_ui on
                         -> ClubhouseCoachHelmRoute with ?view= handed to it, drawn in place; else the Fairway page; no session -> /golf/login)
Clubhouse route adapter: src/clubhouse/routes/coachhelm.tsx ClubhouseCoachHelmRoute({ view }):
                           ?view=development|profile|standing -> the shell's NotRebuilt (CH-1301), before the session is read;
                           no session -> nothing; session.coach -> resolveClubhouseTeam, and no team (or not a coach team) ->
                           the no-team page (CH-13308), else loadCoachCoachHelm -> CoachBoard; session.player -> loadPlayerCoachHelm
                           -> PlayerBoard (no team needed: without one there is no tour and nothing proposed)
Server loaders:          src/clubhouse/data/coachhelm.ts loadCoachCoachHelm and loadPlayerCoachHelm (one read for the role; each
                         failed read logs through chLogServer('coachhelm', …) and never throws for a partial read), with
                         coachhelm-shape.ts (types, partition, ordering, the pulse rows) and coachhelm-map.ts (generator output
                         to what is drawn)
Screens:                 src/clubhouse/screens/coachhelm/PlayerBoard.tsx (-> Proposals.tsx) and CoachBoard.tsx -> parts.tsx (the cards)
Skeleton:                src/clubhouse/screens/coachhelm/CoachHelmSkeleton.tsx (CH-13401 player, CH-13402 coach), from coachhelm/loading.tsx
                         through ClubhouseSwitch and CoachHelmRouteSkeleton (the role from the golf user context)
Route error:             src/app/golf/(dashboard)/dashboard/coachhelm/error.tsx (the shared RouteErrorBoundary)
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

## Actions

Each action's record is in `config/clubhouse/pages/P013-coachhelm.json` (`actions`), and the whole list is
readable in `docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`. Offline, every write is refused before anything
is sent (the shell's 10703, CH-1903; 130702). Every failure toast carries Retry, which runs the whole action
again (131401). Choosing a player or an insight is page state, not an action record.

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
| `routes/coachhelm.tsx` | Route adapter, the `?view=` guard and the coach's no-team page | CH-1301, CH-13308 |

## Hooks

| Path | Type | Used by |
| --- | --- | --- |
| `src/clubhouse/lib/use-action.ts` (`useAction`, `normalise`) | Clubhouse | CoachBoard (three actions), Proposals (two) |
| `src/clubhouse/lib/use-phone.ts` (`useChPhone`) | Clubhouse | PlayerBoard, CoachBoard |
| `src/clubhouse/ui/Toast.tsx` (`useToast`) | Clubhouse | CoachBoard (the existing-focus toast) |
| `src/clubhouse/shell/phone-chrome.tsx` (`PhoneTop`) | Clubhouse | PlayerBoard, CoachBoard |
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

## Held dependencies

None. Accept and Decline for a proposed focus (Q-77) are on the player's board here (`Proposals.tsx`) as well as
in Stats Development (`screens/stats/ProposalAnswer.tsx`), which it does not import: that component's toast
numbers (CH-5003, CH-5004) and `.ch-pf-answer` style are Stats', so this page has its own row over the same two
actions. The Fairway page's Development, Game profile, Standing and Deep dive views are not rebuilt (Q-76).

## Impact notes

- `createFocusAreaFromInsightV2`, `dismissInsight` and `reactivateInsight` are shared with the Fairway Brief
  and coach pages: a change there changes both UIs.
- `acceptFocusArea` and `declineFocusArea` are shared with the Fairway Development view and Stats Development: a
  change to what they return on a stale answer ("Focus area not found or no longer pending") changes all three.
- The Tour values (Q-88) come from `loadTourBenchmarks` in `data/stats-common.ts`, which Stats and Home also use, and
  from `golf_pga_standards` (readable by any signed-in user). A gauge is drawn against the Tour only for a metric
  the generator's college comparison shares with a `golf_pga_standards` row (`penalty_rate_per_round`,
  `big_number_rate`, `practice_tournament_delta`: the same quantity in the same unit); a change to which generators
  write `comparison_source: 'cohort_avg'` needs that looked at again.
- The delivery actions answer an empty list (or map) when a read fails. The loaders rely on that and probe the
  insights table themselves to tell a failure from a first run (130411); a change to what those actions
  return on failure breaks that.
- `createFocusAreaFromInsightV2` calls `revalidatePath('/golf/dashboard/coachhelm')` among others, so the
  framework may serve the route again after an assign lands. The chosen player, this visit's chip and its
  dismissals are client state and nothing here depends on it; it was not observed.
- The program pulse is the coach's own (`getCoachProgramPulse` resolves its team through the coach chat
  context) while this page's team comes from `resolveClubhouseTeam`; each resolves the coach's active team
  with its own resolver, and nothing here proves they can never differ.
- The `?view=` guard runs before the session is read, so it applies to a coach and to a player alike; only
  `development`, `profile` and `standing` are named, so `?view=deep-dive` (a Fairway view) draws the board.
- Every follow-up to a write lives inside its `useAction` function. Anything added after `await x.run()` in a
  handler is skipped when the toast's Retry lands (131401).
- On a coach's gate lookup failure the loader returns an empty pulse with no error, so the board draws
  "Nothing is flagged in the pulse right now." beside the roster notice (130608, found, not fixed).
