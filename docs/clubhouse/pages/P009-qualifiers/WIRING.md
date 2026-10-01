# P009 — Qualifiers: wiring map

## Entry point

```text
Routes:                  /golf/dashboard/qualifiers, /qualifiers/new, /qualifiers/[id], /qualifiers/[id]/edit,
                         /qualifiers/[id]/selection, /golf/dashboard/my-qualifiers
Pages:                   src/app/golf/(dashboard)/dashboard/qualifiers/**/page.tsx and my-qualifiers/page.tsx
                         (session; isClubhouseFor -> Clubhouse, else Fairway; the selection page sends the
                         Fairway side to the CoachHelm qualifying workspace)
Clubhouse route adapter: src/clubhouse/routes/qualifiers.tsx ClubhouseQualifiersRoute({ view, id })
                         (views: list, mine, detail, new, edit, selection; no session -> nothing;
                         no team -> QualifiersNoTeam, CH-09309; a player on new/edit/selection -> CoachOnly, CH-09311;
                         a bad or other-team id -> NotFound, CH-09310; a failed selection read -> CH-09218)
Server loaders:          src/clubhouse/data/qualifiers.ts loadQualifierList, loadQualifierDetail, loadQualifierForm,
                         loadQualifierSelection (each read that fails logs through chLogServer('qualifiers', …)).
                         loadQualifierDetail returns the core (the qualifier, its entries, rounds, squad and pick notes: what the
                         standings, facts and squad need) and `secondary`, a promise that never rejects (the round courses with
                         their tees and pars, and the scorecards; each has its own failure flag). The route passes the core as
                         `data` and the promise as `secondary`; the sections read it through `Streamed` (streamed.tsx).
Screens:                 src/clubhouse/screens/qualifiers/ QualifiersList, QualifierDetail (+ QualifierSections,
                         QualifierDetailPhone, streamed.tsx), QualifierForm (+ CoursePicker), QualifierSelection
Skeletons:               QualifiersSkeleton.tsx: QualifiersSkeleton (CH-09401), QualifierDetailSkeleton (CH-09402),
                         QualifierFormSkeleton (CH-09403), through ClubhouseSwitch in each loading.tsx.
                         QualifierSelectionSkeleton (CH-09409) for [id]/selection.
                         qualifiers, my-qualifiers, [id], new, [id]/edit and [id]/selection each have a loading.tsx.
```

## End-to-end graph

```text
UI (QualifiersList, QualifierDetail / QualifierDetailPhone, QualifierForm, QualifierSelection with PickDialog, CoursePicker)
↓
Action: useAction(name, run, copy) in the screen (offline refusal CH-1903, slow notice CH-1902, chReport, toast + haptic,
        Retry re-runs the same action, so each action holds its own follow-up: state, router.push, router.refresh)
↓
Client writes: src/clubhouse/screens/qualifiers/writes.ts (LIVE_WRITES, LIVE_SELECTION_WRITES; one interface,
               faked whole in tests)
↓
Server actions: src/app/golf/actions/golf.ts, qualifier-setup.ts (HELD gate), v3/qualifying.ts, course-library.ts
↓
Data: golf_qualifiers, golf_qualifier_entries, golf_qualifier_round_courses, golf_qualifier_selections,
      golf_rounds, golf_holes, golf_team_members, golf_courses, golf_course_tees, golf_team_saved_courses
      (the detail reads them in two waves: the qualifier, then entries, rounds, round courses and squad together; the tees start
      when the round courses are in and the scorecards when the rounds are, and stream behind the first paint)
↓
Realtime: ch-qualifier-<id> (golf_rounds for the qualifier; live qualifiers only) -> router.refresh() after 800ms of quiet
↓
Contract outcomes: CONTRACT.md (Bridge IDs 9ccii, catalog CH-09xxx)
↓
Bridge: recorded, not wired (D-68)
↓
Tests: src/clubhouse/__tests__/qualifiers.test.tsx (104 cases), qualifying-coach-gate.test.ts (6),
       qualifier-setup.test.ts (17), golf-qualifier-manual-close.test.ts (3)
```

## Actions

Each action's record is in `config/clubhouse/pages/P009-qualifiers.json` (`actions`), and the whole list is readable in
`docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`. Offline, every write is refused before anything is sent (the shell's
10703, CH-1903), and none of the eight writes is optimistic (91301). A landed write re-reads the page (91501) and a
failed one reports through `chReport` (92301).

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P009-CREATE | Create qualifier | `create.run` | `createGolfQualifier` | golf_qualifiers, golf_qualifier_entries, golf_qualifier_round_courses | invalid 90510 · lands 90901 · opens 90902 · fails 90601 · fields kept 91202 · Retry 91401 |
| ACT-P009-SAVE-EDIT | Save (Edit qualifier) | `save.run` | `runEditPlan` in `writes.ts`, which calls `updateGolfQualifierDetails`, `setQualifierRoundCourses`, `setQualifierSquadSize`, `setQualifierEntrants` in that order | golf_qualifiers, golf_qualifier_round_courses, golf_qualifier_entries | locked entrants 90513 · squad fixed 90514 · lands 90901 · returns 90902 · fails 90602 · partial 90622 · kept 91202 · refused 90811, 92302 |
| ACT-P009-CLOSE | Close qualifier › Close | `close.run` | `updateQualifierStatus` (`'completed'`) | golf_qualifiers | confirm 91101 · in flight 90302 · lands 90901 · fails 90603 · Retry 91401 · re-read 91501 · gate 90812 |
| ACT-P009-REOPEN | Reopen | `reopen.run` | `updateQualifierStatus` (`'in_progress'`) | golf_qualifiers | in flight 90303 · lands 90901 · fails 90604 · Retry 91401 · re-read 91501 · gate 90812 |
| ACT-P009-START-SELECTING | Start selecting | `start.run` | `advanceSelectionState`, called by `startSelecting` one state at a time from where the selection is up to `closed` (open → scoring → closed), stopping at the first refusal | golf_qualifiers | confirm 91102 · in flight 90205 · lands 90901 · fails 90623 · refusal 90809 · gate 90810 |
| ACT-P009-SET-PICK | Pick dialog › Save pick | `act.run` (PickDialog) | `setQualifierCoachPick` | golf_qualifier_selections | needs reason 90511 · needs player 90512 · none to pick 90411 · lands 90901 · fails 90624 · refusal 90809 · dialog kept 91203 · gate 90810 |
| ACT-P009-REMOVE-PICK | Remove (a pick) | `remove.run` | `removeQualifierCoachPick` | golf_qualifier_selections | confirm 91103 · lands 90901 · fails 90625 · gate 90810 |
| ACT-P009-CONFIRM-SQUAD | Confirm squad | `confirm.run` | `confirmQualifierSelection` | golf_qualifier_selections, golf_qualifiers | confirm 91104 · lands 90901 · opens 90902 · fails 90626 · confirmed 90701 · refusal 90809 · gate 90810 |
| ACT-P009-SEARCH-COURSES | Course picker (opening, typing) | `writes.courses` | `listCoursesStrict`, plus `getTeamSavedCourses` (the team's saved courses first) when the query is empty | golf_courses, golf_team_saved_courses | loading 90204 · none 90409 · fails 90613 · debounce 92102 |
| ACT-P009-LIST-TEES | Course picker › a course | `writes.tees` | `getCourseDetail` | golf_courses, golf_course_tees | loading 90204 · none 90410 · fails 90614 |
| ACT-P009-OPEN-SCORECARDS | A leaderboard row | `toggle` (Leaderboard) | none: the holes arrived with the page; a player opens only their own | golf_holes | no card 90407 · fails 90609 · player scope 90806 · keyboard 92003 · kept 91204 |
| ACT-P009-LIVE-STANDINGS | (automatic on a live qualifier) | `useLiveStandings` | `live.ts`: a realtime channel that ends in `router.refresh()` | golf_rounds | 90304 · announced 91803 |

Retry (91401) re-runs the same action with the same arguments and finishes what the button would have done, for all
eight writes. Until 2026-09-30 it re-sent only the write (CHANGELOG).

## Components

| Path | Purpose | States |
| --- | --- | --- |
| `screens/qualifiers/QualifiersList.tsx` | The list: pills, search (filter and search kept by the shell's `useChSessionState`), hero, Active and Concluded cards, the player's own first, `/my-qualifiers` | 90101, 90401 to 90403, 90406, 90605, 90606, 90615, 91904 |
| `screens/qualifiers/QualifierDetail.tsx` | One qualifier: head, facts, `Leaderboard` (scorecard tray), round-by-round, Close and Reopen, the live listener | 90102, 90302, 90303, 90404, 90407, 90603, 90604, 90607, 90608, 90609, 90616 to 90619, 91001, 91101, 91803 |
| `screens/qualifiers/QualifierSections.tsx` | Selections, Course per round (streamed) and the stale-standings notice | 90610, 90611 |
| `screens/qualifiers/streamed.tsx` | `Streamed` (`use()` of the loader's `secondary` inside its own `Suspense`), `SecondaryProvider`, the placeholders `CoursesSkeleton`, `CardBodySkeleton`, `NinesSkeleton`, `ParLineSkeleton` | CH-09410 |
| `screens/qualifiers/QualifierDetailPhone.tsx` | The phone qualifier: three facts, leaderboard cards, `PlayerRounds` sheet, Edit sheet | 91901, 91001, 90404, 90407, 90607 to 90609, 90616, 90618, 90619, 90806, 90808, 91803 |
| `screens/qualifiers/QualifierForm.tsx` | Create and edit, validation, dirty-leave guard, phone top bar | 90103, 90301, 90405, 90501 to 90514, 90601, 90602, 90612, 90620, 90621, 90622, 91201, 91202, 91902, 92001, 92002 |
| `screens/qualifiers/CoursePicker.tsx` | Course and tee lookup for a round | 90204, 90409, 90410, 90613, 90614, 92102 |
| `screens/qualifiers/QualifierSelection.tsx` | Manage selections: steps, lists, picks, `PickDialog`, the foot | 90104, 90205, 90411, 90412, 90511, 90512, 90623 to 90626, 90628, 90701, 91102 to 91104, 91203, 91903 |
| `screens/qualifiers/return-state.ts`, `BackToList.tsx` | The Back notes (`sessionStorage`, this tab, read once and spent as the screen mounts) and `useStepBack`: a qualifier opened from the list, and Manage selections opened from the qualifier, step back in history on Back; with no note Back goes to the address. `BackToList` is the not-found page's Back | CH-09904, CH-09905, CH-09310 |
| `screens/qualifiers/QualifiersSkeleton.tsx` | The three route skeletons | 90201, 90202, 90203 |
| `screens/qualifiers/model.ts` | Pure: ranking, ties, cut lines, form rules | (unit-level, through the screens' tests) |
| `screens/qualifiers/writes.ts` | Every write and lookup behind `ChQWrites` and `ChQSelectionWrites`; `selectionReason` | 90809, 92303, 92304 |
| `screens/qualifiers/live.ts` | `useLiveStandings` | 90304 |
| `screens/qualifiers/parts.tsx` | `StatusPill`, `StateBadge`, `ToPar`, `Meta` | (shared inside the page) |
| `routes/qualifiers.tsx` | The adapter, `QualifiersNoTeam`, `CoachOnly`, `NotFound`, `SelectionDidNotLoad` | 90105, 90408, 90627, 90801 to 90804 |

## Hooks

| Path | Type | Used by |
| --- | --- | --- |
| `screens/qualifiers/live.ts` (`useLiveStandings`) | Clubhouse, realtime (browser Supabase client) | QualifierDetail |
| `src/clubhouse/lib/use-action.ts` (`useAction`, `normalise`) | Clubhouse | QualifierDetail, QualifierForm, QualifierSelection (`TieRow` has its own) |
| `src/clubhouse/lib/use-refresh.ts` (`useRefresh`) | Clubhouse | every Try again on these pages |
| `src/clubhouse/lib/use-last-good.ts` (`useLastGood`) | Clubhouse | QualifierDetail: the last good standings of a qualifier while a refresh of them fails (CH-09220) |
| `src/clubhouse/lib/session-state.ts` (`useChSessionState`) | Clubhouse shell | QualifiersList: the filter and the search, per page and team (CH-09904) |
| `src/clubhouse/shell/RouteFrame.tsx` (scroll per page and team, restored on Back or Forward) | Clubhouse shell | every page, so the list's place (CH-09905); these screens keep no scroll of their own |
| `src/clubhouse/lib/use-phone.ts` (`useChPhone`, 820px) | Clubhouse | the screens |
| `src/clubhouse/shell/phone-chrome.tsx` (`PhoneTop`, `usePhoneTabsHidden`, `useBackFromMore`) | Clubhouse | the phone screens |
| `src/clubhouse/lib/haptics.ts`, `track.ts` (`chReport`, `chTrail`), `press.ts` | Clubhouse | throughout |

## Services / server actions

| Name | Path | Existing/New/Held | Purpose |
| --- | --- | --- | --- |
| createGolfQualifier | actions/golf.ts | Existing (shared with Fairway) | create, with entrants and round courses |
| updateGolfQualifierDetails, setQualifierRoundCourses | actions/golf.ts | Existing (shared with Fairway) | edit |
| updateQualifierStatus | actions/golf.ts | Existing (shared with Fairway) | close and reopen (organisation compare) |
| setQualifierSquadSize, setQualifierEntrants | actions/qualifier-setup.ts | **Held** (D-61; refuses unless `isClubhouseFor('coach')`) | Edit's squad and players |
| advanceSelectionState, setQualifierCoachPick, removeQualifierCoachPick, confirmQualifierSelection | actions/v3/qualifying.ts | Existing (shared with the CoachHelm qualifying workspace) | Manage selections; `getAuthedCoachContext` and `verifyPlayersOnTeam` gate them |
| listCoursesStrict, getTeamSavedCourses, getCourseDetail | actions/course-library.ts | Existing | the course picker |
| loadQualifyingWorkspace | lib/coachhelm/v3/qualifying/loader.ts | Existing (same loader the confirm uses) | Manage selections' read |
| readQualifierSelectionReasons | lib/golf/qualifier-selection-reasons.ts | Existing | pick reasons for a coach, working before and after the D-35 apply |

## Data resources

### DATA-QUALIFIERS

```text
Tables:   golf_qualifiers, golf_qualifier_entries, golf_qualifier_round_courses, golf_qualifier_selections,
          golf_rounds, golf_holes, golf_team_members, golf_courses, golf_course_tees, golf_team_saved_courses
RPCs:     golf_qualifier_selection_reasons (via readQualifierSelectionReasons; the column read is the fallback
          until the D-35 migration is applied)
Storage:  none
Realtime: ch-qualifier-<id>: golf_rounds filtered to the qualifier, live qualifiers only
Cache:    none on the Clubhouse side. The Fairway page sets revalidate 300; the Clubhouse route is a server render.
Refresh:  a live `router.refresh()` is a transition: the page on screen (standings, courses, cards) stays until the new render,
          including its streamed part, has landed, and then changes in one commit. Where a refresh is not a transition (a
          test), the streamed places show their placeholders and the standings are the new ones at once. A refresh whose
          rounds or entries read fails keeps the last good standings of the same qualifier with CH-09220.
RLS:      team coaches and active team players read; coaches write (checklist "Role permissions", read 2026-09-29,
          not read again for this pass). The server actions check first and RLS is the second gate.
Read path:  the four loaders (server); the course picker (server actions on demand); the live channel (client)
Write path: the server actions above, from writes.ts
Ownership:  the list reads `team_id = the viewer's team`; the detail, form and selection loaders compare the
            qualifier's team_id with the viewer's and answer "not found" otherwise (90805)
```

## Held dependencies

- `docs/clubhouse/held/features/qualifier-squad-and-entrants.md` (built, held behind the Clubhouse gate, D-61)
- `docs/clubhouse/held/data/qualifier-db-hardening.md` (written, not applied, D-35)

## Impact notes

- The five server actions in `golf.ts` and the four in `v3/qualifying.ts` are shared. Fairway's Qualifiers and the
  CoachHelm qualifying workspace call them too, so a change to their wording or result shape changes both UIs;
  `selectionReason` maps their refusal strings to sentences and falls back to the toast's own hint for a string it
  does not know.
- Manage selections reads through `loadQualifyingWorkspace`, the loader the confirm itself uses, so the squad
  shown is the squad committed. It reads `golf_qualifiers` twice (ownership, then the workspace).
- `createGolfQualifier` is not atomic: it inserts the qualifier, then the round courses, then the entries. If the
  entries insert fails, the qualifier exists, the form's toast says "Nothing was created", and Retry creates a
  second one. If the round-courses insert fails, the action still reports success and only logs it, so a coach can
  land on a new qualifier with no courses and no message. It is a shared server action, so it is not changed here
  (VERIFY.md, open).
- The confirm toast's count (`Squad confirmed · N players told`) is the squad's size. The server
  (`player-notify.ts`) tells each candidate one of three outcomes (selected, not selected, not scored) when
  anyone is selected, respects notification preferences, and logs a failed notification without returning it.
- The live channel listens to `golf_rounds` only (any change to a round of this qualifier). A change to an entry,
  a pick or a hole does not refresh the page until a round changes or the coach acts.
- The Retry on a failure toast re-runs the action, so any follow-up must live inside the action passed to
  `useAction`, not in the button's handler. A new write added here has to follow that.
