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
                           -> PlayerBoard (no team needed)
Server loaders:          src/clubhouse/data/coachhelm.ts loadCoachCoachHelm and loadPlayerCoachHelm (one read for the role; each
                         failed read logs through chLogServer('coachhelm', …) and never throws for a partial read), with
                         coachhelm-shape.ts (types, partition, ordering, the pulse rows) and coachhelm-map.ts (generator output
                         to what is drawn)
Screens:                 src/clubhouse/screens/coachhelm/PlayerBoard.tsx and CoachBoard.tsx -> parts.tsx (the cards)
Skeleton:                src/clubhouse/screens/coachhelm/CoachHelmSkeleton.tsx (CH-13401 player, CH-13402 coach), from coachhelm/loading.tsx
                         through ClubhouseSwitch and CoachHelmRouteSkeleton (the role from the golf user context)
Route error:             src/app/golf/(dashboard)/dashboard/coachhelm/error.tsx (the shared RouteErrorBoundary)
```

## End-to-end graph

```text
UI (Assign as focus, Dismiss, Undo in CoachBoard; the player and insight pickers; Try again on a notice)
↓
Action (a handler in CoachBoard calls run() on a useAction and does nothing after it)
↓
Client controller: useAction (offline refusal CH-1903, slow notice CH-1902, chReport + error toast with Retry + haptic).
                   Every follow-up (the Assigned chip, hiding a dismissed card, restoring it) is INSIDE the action function,
                   so Retry does it too.
↓
Writes: LIVE_COACHHELM_WRITES (writes.ts), one method per server action
↓
Server actions: src/app/golf/actions/development.ts (createFocusAreaFromInsightV2), src/app/golf/actions/insights.ts
                (dismissInsight, reactivateInsight)
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
| ACT-P013-TRY-AGAIN | Try again on a failed-read notice | `InlineNotice` → `router.refresh` | the server route, read again | (every read) | recovery 131402 · failed notices 130604 to 130606 |

## Components

| Path | Purpose | States |
| --- | --- | --- |
| `screens/coachhelm/PlayerBoard.tsx` | The player's page: header, the focus, Also worth knowing, Working; read-only | CH-13201, CH-13204, CH-13301 to CH-13304, CH-13701, CH-13801, CH-13805 |
| `screens/coachhelm/CoachBoard.tsx` | The coach's page: header, pulse, By player, the chosen player's focus and the three writes | CH-13001 to CH-13003, CH-13202 to CH-13204, CH-13305 to CH-13307, CH-13309, CH-13310, CH-13403, CH-13601, CH-13703, CH-13901 |
| `screens/coachhelm/parts.tsx` | `FocusCard`, `Evidence` (`Gauge`, bars, `ReadMeter`), `PriPill`, `InsightRow`, `PulseList`, `Head` | CH-13802, CH-13803, CH-13804, CH-13806 |
| `screens/coachhelm/writes.ts` | The writes interface and `LIVE_COACHHELM_WRITES`; preview and tests pass their own set | — |
| `screens/coachhelm/CoachHelmSkeleton.tsx` | Route skeleton, one shape per role | CH-13401, CH-13402 |
| `routes/coachhelm.tsx` | Route adapter, the `?view=` guard and the coach's no-team page | CH-1301, CH-13308 |

## Hooks

| Path | Type | Used by |
| --- | --- | --- |
| `src/clubhouse/lib/use-action.ts` (`useAction`, `normalise`) | Clubhouse | CoachBoard (three actions) |
| `src/clubhouse/lib/use-phone.ts` (`useChPhone`) | Clubhouse | PlayerBoard, CoachBoard |
| `src/clubhouse/ui/Toast.tsx` (`useToast`) | Clubhouse | CoachBoard (the existing-focus toast) |
| `src/clubhouse/shell/phone-chrome.tsx` (`PhoneTop`) | Clubhouse | PlayerBoard, CoachBoard |
| `src/clubhouse/lib/haptics.ts`, `track.ts` | Clubhouse | throughout |

There are no realtime hooks: the page is read once on the server.

## Services / server actions

| Name | Path | Existing/New/Held | Purpose |
| --- | --- | --- | --- |
| createFocusAreaFromInsightV2 | actions/development.ts | Existing (the Fairway Brief's) | Assign as focus: a proposal the player accepts |
| dismissInsight, reactivateInsight | actions/insights.ts | Existing (the Fairway Brief's) | Dismiss, and its true reverse |
| getInsightsForPlayer, getTopInsightsForPlayers | actions/insight-delivery.ts | Existing (the delivery actions) | A player's ranked feed (up to 30); one top insight per team player |
| getCoachProgramPulse | lib/coachhelm/v3/chat/request-cache.ts | Existing (cached per request) | The program pulse |
| isCoachHelmEnabledForPlayer, isCoachHelmEnabledForCoach | lib/coachhelm/v2/gate.ts | Existing | Whether CoachHelm is on, and who turned it off |
| applyInsightVisibility, fetchAllRowsResult | lib/coachhelm/v3/insight-visibility.ts, lib/supabase/fetch-all-rows.ts | Existing | The visible-insights probe, paginated |

## Data resources

### DATA-COACHHELM

```text
Tables:   golf_coach_insights (visible rows, evidence), golf_insight_player_feedback (a player's own dismissals),
          golf_drills (the attached drill's text), golf_player_focus_areas (a focus already made from an insight; written
          by Assign), golf_team_members and golf_players (a coach's active roster and names), golf_rounds (a count, only
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

None. Accept and Decline for a proposed focus (Q-77) live on the player's side in Stats Development
(`screens/stats/ProposalAnswer.tsx`); this board has none. The Fairway page's Development, Game profile,
Standing and Deep dive views are not rebuilt (Q-76).

## Impact notes

- `createFocusAreaFromInsightV2`, `dismissInsight` and `reactivateInsight` are shared with the Fairway Brief
  and coach pages: a change there changes both UIs.
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
