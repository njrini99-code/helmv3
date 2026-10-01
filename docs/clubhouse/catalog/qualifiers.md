# Qualifiers catalog (09xxx)

Routes:
- `/golf/dashboard/qualifiers` with `/new`, `/[id]`, `/[id]/edit` and `/[id]/selection` (Manage selections)
- `/golf/dashboard/my-qualifiers`

Coaches and players share the list and the detail (D-30). Create, edit and Manage selections are coach-only.

Where things live:
- Code: `src/clubhouse/screens/qualifiers/`
- Loader: `src/clubhouse/data/qualifiers.ts`
- Setup actions: `src/app/golf/actions/qualifier-setup.ts`
- Tests: `src/clubhouse/__tests__/qualifiers.test.tsx`
- Preview:
  - `/clubhouse-preview/qualifiers` (`?state=empty|failed|partial|loading`)
  - `/clubhouse-preview/qualifier` (`?q=live|upcoming|selected|completed|spring`, and `?state=failed|scores|partial|failwrites|loading`)
  - `/clubhouse-preview/qualifier-new` and `/clubhouse-preview/qualifier-edit` (`?state=failed|noroster|courses|failwrites|loading`)
  - `/clubhouse-preview/qualifiers-player`, `/clubhouse-preview/qualifier-player` and `/clubhouse-preview/my-qualifiers`

Every save goes through `useAction`, so these belong to the shell:
- offline refusal (CH-1903);
- slow saves (CH-1902);
- the commit and error haptics (CH-1702, CH-1703).

## 090xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-09001 | Creating a qualifier fails | "Couldn't create the qualifier" + the server's reason, or "Nothing was created. Check the details and try again." Retry; the form keeps every field. Done: "Qualifier created · 7 players entered", then the new qualifier opens in place of the form (replaced, so Back does not return to a form whose Create would make a second one) | `useAction('qualifiers.create')` → `createGolfQualifier` | qualifiers.test › CH-09001 |
| CH-09002 | Saving an edit fails | "Couldn't save the qualifier" + the reason when it is short, else "Check the form and save again." The full account stays on the form (CH-09902). Done: "Qualifier saved", and the qualifier opens in place of the form (replaced, so Back goes to where the coach came from) | `useAction('qualifiers.save')` → `runEditPlan` (details, rounds and courses, squad, players, in order) | qualifiers.test › CH-09002 |
| CH-09003 | Closing a qualifier fails | "Couldn't close Pinehurst qualifier" + "It is still open, and players can still enter rounds. Try again." Done: "Qualifier closed · no new rounds accepted" | `useAction('qualifiers.close')` → `updateQualifierStatus(id, 'completed')` | qualifiers.test › CH-09003 |
| CH-09004 | Reopening a qualifier fails | "Couldn't reopen Fall invitational qualifier" + "It is still closed. Try again." Done: "Qualifier reopened · players can enter rounds" | `useAction('qualifiers.reopen')` → `updateQualifierStatus(id, 'in_progress')` | qualifiers.test › CH-09004 |
| CH-09005 | Start selecting fails | "Couldn't start selecting" + the reason, or "Nothing changed. Try again." Done: "Selecting is open · choose your picks" | `useAction('qualifiers.startSelecting')` → `startSelecting` (`advanceSelectionState`, one step at a time to closed) | qualifiers.test › CH-09005 |
| CH-09006 | Saving a coach's pick fails | "Couldn't pick Ava Chen" + the reason (for example "Every pick is taken. Remove one first."), or "Nothing changed. Try again." The dialog keeps the player and the reason. Done: "Ava Chen picked" | `useAction('qualifiers.setPick')` → `setQualifierCoachPick` | qualifiers.test › CH-09006 |
| CH-09007 | Removing a coach's pick fails | "Couldn't remove Ava Chen as a pick" + "They are still a pick. Try again." Done: "Ava Chen removed as a pick" | `useAction('qualifiers.removePick')` → `removeQualifierCoachPick` | qualifiers.test › CH-09007 |
| CH-09008 | Confirming the squad fails | "Couldn't confirm the squad" + the reason, or "Nothing was confirmed and nobody was told. Try again." Done: "Squad confirmed · 5 players" (Q-116), then the qualifier opens | `useAction('qualifiers.confirmSquad')` → `confirmQualifierSelection` | qualifiers.test › CH-09008 |
| CH-09009 | The squad is confirmed but telling the players failed | An error toast "The players weren’t all told" + "The squad is confirmed. Let the entrants know yourself." (Q-116) | `confirmQualifierSelection` returns `notified: false` | qualifiers.test › CH-09009 |
| CH-09010 | Giving or taking back a place at a tied cut fails | "Couldn’t give {name} the place" / "Couldn’t take the place back from {name}" + "Nothing changed. Try again." Done: "{name} takes the place at the cut" / "{name} is level at the cut again" (Q-114) | `useAction('qualifiers.chooseTie')` → `chooseQualifierTiePlace` | qualifiers.test › CH-09318 |

## 091xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-09101 | The name is empty | "Give the qualifier a name." under the field; focus moves to it | `validateForm` | qualifiers.test › CH-09101 |
| CH-09102 | There is no start date | "Add a start date." | `validateForm` | qualifiers.test › CH-09102 |
| CH-09103 | The end date is before the start | "The end date is before the start date." | `validateForm` | qualifiers.test › CH-09103 |
| CH-09104 | The entry deadline is after the start | "The entry deadline has to be on or before the start date." | `validateForm` | qualifiers.test › CH-09104 |
| CH-09105 | Rounds isn't 1 to 50, or is below a round that already has scores (edit) | "Rounds must be a whole number from 1 to 50." or "Round 2 already has scores, so the qualifier needs at least 2 rounds." | `validateForm` | qualifiers.test › CH-09105 |
| CH-09106 | One round, not acknowledged | "Confirm that this qualifier is meant to have one round." under the acknowledgement | `validateForm` | qualifiers.test › CH-09106 |
| CH-09107 | No players chosen | "Choose at least one player." under the players | `validateForm` | qualifiers.test › CH-09107 |
| CH-09108 | Squad size isn't 1 to 12 | "Squad size must be a whole number from 1 to 12." | `validateForm` | qualifiers.test › CH-09108 |
| CH-09109 | More coach's picks than places | "Coach's picks must be a whole number no bigger than the squad." | `validateForm` | qualifiers.test › CH-09109 |
| CH-09110 | Any of the above on submit | "Couldn't create the qualifier." (or save) + the one problem, or "Fix the 3 highlighted fields below." Nothing is sent | `InlineNotice` | qualifiers.test › CH-09110 |
| CH-09111 | A coach's pick with no reason | "Say why you picked Ava Chen." under the reason; nothing is sent | `PickDialog` | qualifiers.test › CH-09111 |
| CH-09112 | Save pick with no player chosen | "Choose a player." under the list; nothing is sent | `PickDialog` | qualifiers.test › CH-09112 |

## 092xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-09201 | The qualifiers don't load | "The qualifiers didn't load." + Try again, never "No qualifiers yet" | `InlineNotice` | qualifiers.test › CH-09201 |
| CH-09202 | Entries or rounds don't load on the list | "Standings didn't load." The cards and the hero stay; leaders and "You're T3" are left out, not zeroed, and neither "You aren't entered" nor "no rounds in yet" is said | `InlineNotice` | qualifiers.test › CH-09202 |
| CH-09203 | A qualifier's entrants don't load | "The field didn't load." in the leaderboard; entrants read "—" | `InlineNotice` | qualifiers.test › CH-09203 |
| CH-09204 | A qualifier's rounds don't load | "Scores didn't load." The field is never shown without its scores; round-by-round is hidden | `InlineNotice` | qualifiers.test › CH-09204 |
| CH-09205 | The scorecards don't load (or the stream that carries them is cut off) | "Scorecards didn't load." inside an opened row (the phone's sheet); the totals stay | `InlineNotice` | qualifiers.test › CH-09205 |
| CH-09206 | The round courses don't load (detail), or the stream that carries them is cut off | "The round courses didn't load." in Course per round; par reads nothing rather than a guess | `InlineNotice` | qualifiers.test › CH-09206 |
| CH-09207 | The confirmed squad doesn't load, or the entries it takes its names from don't | "The confirmed squad didn't load." in Squad, with the reason: the squad list, or the players' names that come with the field. Never a row of "A player" | `InlineNotice` | qualifiers.test › CH-09207 |
| CH-09208 | The roster (or, editing, the entrants or their rounds) doesn't load in the form | "The roster didn't load." Saving is blocked, so nobody is entered or taken out by mistake. The Players head carries no "0 of 0 active players entered" | `InlineNotice`, submit disabled | qualifiers.test › CH-09208 |
| CH-09209 | The course list doesn't load in the picker | "Courses didn't load." + Try again | `InlineNotice` | qualifiers.test › CH-09209 |
| CH-09210 | A course's tees don't load in the picker | "Tees didn't load." + Try again | `InlineNotice` | qualifiers.test › CH-09210 |
| CH-09211 | The list crashes | "The qualifiers couldn't be shown." The head and filters stay | `SectionBoundary` `qualifiers.list` | qualifiers.test › CH-09211 |
| CH-09212 | The leaderboard crashes | "The leaderboard couldn't be shown." The rest of the page stays | `SectionBoundary` `qualifiers.leaderboard` | qualifiers.test › CH-09212 |
| CH-09213 | Round-by-round crashes | "Round-by-round scores couldn't be shown." | `SectionBoundary` `qualifiers.rounds` | qualifiers.test › CH-09213 |
| CH-09214 | Selections crashes | "Selections couldn't be shown." | `SectionBoundary` `qualifiers.selections` | qualifiers.test › CH-09214 |
| CH-09215 | Course per round crashes | "Course per round couldn't be shown." | `SectionBoundary` `qualifiers.courses` | qualifiers.test › CH-09215 |
| CH-09216 | The form crashes | "The qualifier form couldn't be shown." | `SectionBoundary` `qualifiers.form` | qualifiers.test › CH-09216 |
| CH-09217 | The round courses don't load in the edit form | "The round courses didn't load." Saving keeps the courses already set | `InlineNotice` | qualifiers.test › CH-09217 |
| CH-09218 | Manage selections doesn't load | "Selections didn't load." + Try again, never "That qualifier isn't on your team" | `RefreshNotice` in the route; logged `clubhouse.qualifiers.selection` | qualifiers.test › CH-09218 |
| CH-09219 | Manage selections crashes | "Selections couldn't be shown." The head and steps stay | `SectionBoundary` `qualifiers.selection` | qualifiers.test › CH-09219 |
| CH-09220 | A refresh of a qualifier's standings fails after they were showing (a live update, a write's re-read, Try again) | "These standings may be out of date." + "The latest scores didn't load, so this is the last list that did. Try again to bring it up to date." + Try again, in the leaderboard (desktop and phone), above the last good rows. A recovered read clears it; another qualifier never inherits the rows; a first load that fails is CH-09203 or CH-09204 | `InlineNotice` (`StaleStandings`) from `useLastGood(qualifier id, data, board loaded)` | qualifiers.test › CH-09220 |
| CH-09221 | The coach's pick notes don't load (detail, coach, confirmed squad) | "Pick notes didn't load." + "The squad is right; the coach's notes on the picks are missing until they load." + Try again, under the squad. The picks stay; the notes are never shown as "no notes" | `InlineNotice` in `Selections`; `reasonsError` from `loadQualifierDetail` | qualifiers.test › CH-09221 |
| CH-09222 | A player's entries don't load on /my-qualifiers | "Your qualifiers didn't load." + Try again, never "You aren't entered in any qualifiers"; the head carries no "0 active · 0 concluded" | `InlineNotice`; `entriesError` from `loadQualifierList` | qualifiers.test › CH-09222 |

## 093xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-09301 | The team has no qualifiers | The page empty state (v2 medallion): Coach: "No qualifiers yet" + "Set up a qualifier to rank players across counted rounds and pick your lineup." + Create qualifier (v2 copy). Player: "No qualifiers yet" + "Your coach's qualifiers show here once they're set up." | `EmptyState` | qualifiers.test › CH-09301 |
| CH-09302 | Search or filter matches nothing | "No qualifiers match your filters." + Clear filters | `EmptyState` | qualifiers.test › CH-09302 |
| CH-09303 | Nothing has concluded yet | "No concluded qualifiers yet." under Concluded | `EmptyState` | qualifiers.test › CH-09303 |
| CH-09304 | No round is in yet | "Awaiting first round." + "7 players entered. Standings appear once a player submits a round." | `EmptyState` | qualifiers.test › CH-09304 |
| CH-09305 | The roster has no active players (form) | "No active players on the roster." | `EmptyState` | qualifiers.test › CH-09305 |
| CH-09306 | A player isn't entered in any qualifier (/my-qualifiers) | The page empty state (v2 medallion): "You aren't entered in any qualifiers" + See the team's qualifiers | `EmptyState` | qualifiers.test › CH-09306 |
| CH-09308 | A round has no hole-by-hole card | "No hole-by-hole card for this round. Only the total was recorded." | `Scorecard` | qualifiers.test › CH-09308 |
| CH-09309 | Not on a team | The page empty state (v2 medallion): "You aren't on a team yet" | `EmptyState` (route) | qualifiers.test › CH-09309 |
| CH-09310 | The qualifier isn't on the viewer's team, or doesn't exist | The page empty state (v2 medallion): "That qualifier isn't on your team" + Back to qualifiers | `EmptyState` (route) | qualifiers.test › CH-09310 |
| CH-09311 | A player opens /new, /edit or /selection | The page empty state (v2 medallion): "Only coaches create qualifiers" (or edit, or "Only coaches pick the squad") + a way back | `EmptyState` (route) | qualifiers.test › CH-09311 |
| CH-09312 | The course search matches nothing | "No courses match “Pine”." | `EmptyState` | qualifiers.test › CH-09312 |
| CH-09314 | A course has no tee sets | "This course has no tee sets yet." | `EmptyState` | qualifiers.test › CH-09314 |
| CH-09315 | Nobody can be a coach's pick | "Nobody else can be picked yet." + "A player needs a round in, outside the places on score, to be a coach's pick." in the pick dialog | `EmptyState` in `PickDialog` | qualifiers.test › CH-09315 |
| CH-09316 | No place on score is filled | "Nobody has a score in yet." (or, with no places on score, "Every place is a coach's pick.") in On score now | `EmptyState` in `QualifierSelection` | qualifiers.test › CH-09316 |
| CH-09318 | Players are level at the last place on score (Q-114) | A "Tie at the cut" panel: "{n} players level for {k} places · {g} given", each row with "Tie at cut" or "Given the place" and Give the place / Take it back in Manage selections; confirm waits and the note says how many places are left. The board shows "Tie at cut" | `tie_at_cut` from `loadQualifyingWorkspace`; `buildBoard` state `tie` | qualifiers.test › CH-09318 |

## 094xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-09401 | The list is loading | Its skeleton: head, tools, hero, cards | `QualifiersSkeleton` | qualifiers.test › CH-09401 |
| CH-09402 | A qualifier is loading | Its skeleton: head, facts, leaderboard, side cards | `QualifierDetailSkeleton` | qualifiers.test › CH-09402 |
| CH-09403 | The form is loading | Its skeleton | `QualifierFormSkeleton` | qualifiers.test › CH-09403 |
| CH-09404 | A create or save is in flight | The button reads "Creating" or "Saving" and is disabled | `QualifierForm` | qualifiers.test › CH-09404 |
| CH-09405 | A close is in flight | "Closing", disabled | `QualifierDetail` | qualifiers.test › CH-09405 |
| CH-09406 | A reopen is in flight | "Reopening", disabled. On the phone the Edit sheet stays up until the server answers and its Reopen button says it (a refusal leaves the sheet and the button as they were; a landed reopen closes it) | `QualifierDetail`, `QualifierDetailPhone` | qualifiers.test › CH-09406 |
| CH-09407 | Courses or tees are loading in the picker | Skeleton rows | `CoursePicker` | qualifiers.test › CH-09407 |
| CH-09409 | Manage selections is loading | Its own skeleton, on the page's own classes: head with the primary slot, the three steps, the note, the two lists and the picks card | `QualifierSelectionSkeleton` through `ClubhouseSwitch` in `[id]/selection/loading.tsx` | qualifiers.test › CH-09409 |
| CH-09410 | A qualifier's courses and scorecards are still streaming in behind its standings | The standings, facts and squad are on screen; the Par line under Course is a one-line placeholder, Course per round is a row per round on the list's own classes, and an opened row's cards are the round's head (round, course, day, total) over a card-sized block (the phone's sheet: the head over two nine-sized blocks). Nothing says "no card", "no courses" or "Par by round" until they land. A live refresh draws the same placeholders where the new courses and cards are not in yet, never over the standings | `Streamed` (`use()` of the loader's `secondary` promise inside its own `Suspense`), `CoursesSkeleton`, `CardBodySkeleton`, `NinesSkeleton`, `ParLineSkeleton` | qualifiers.test › CH-09410 |
| CH-09408 | A selection write is in flight | The dialog's button reads "Starting", "Saving", "Removing" or "Confirming" and is disabled. Giving or taking back a place at a tied cut waits on that player's row only (its button reads "Saving"); the other level players stay available, and the places left count the give in flight | `QualifierSelection`, `TieRow` | qualifiers.test › CH-09408 |

## 095xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-09501 | Close qualifier | "Close this qualifier?" + "Players won't be able to enter or submit rounds in Pinehurst qualifier, including rounds already started, until you reopen it. It moves to Concluded." Keep it open / Close qualifier | `Modal` | qualifiers.test › CH-09501 |
| CH-09502 | Cancel or Back with unsaved changes in the form | "Discard your changes?" Keep editing / Discard | `Modal` | qualifiers.test › CH-09502 |
| CH-09503 | Start selecting | "Start selecting?" + "Coach's picks open. This step can't be undone. The standings keep updating, and the places on score are set when you confirm the squad." Not yet / Start selecting | `Modal` | qualifiers.test › CH-09503 |
| CH-09504 | Remove a coach's pick | "Remove Ava Chen as a pick?" + "Their reason is removed with them. You can pick them again." Keep them / Remove | `Modal` | qualifiers.test › CH-09504 |
| CH-09505 | Confirm the squad | "Confirm the squad?" + who makes the trip + "Every entrant is told whether they made it, and the squad can't be changed afterwards." Keep editing / Confirm squad | `Modal` | qualifiers.test › CH-09505 |

## 096xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-09601 | Pressing a card, the hero or a status pill | It shrinks about 6px (110ms) and springs back (280ms) (the shell's CH-1606) | `useChPress` | preview |
| CH-09602 | Opening a leaderboard row | The scorecards appear in place, final on mount; no count-up, no stagger. The Live dot is static (D-33) | `Leaderboard` | preview |

## 097xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-09701 | A status pill, a leaderboard row, a player checkbox, a course, a tee, or a player in the pick dialog | select | `haptic('select')` | qualifiers.test › CH-09701 |
| CH-09702 | Close qualifier, Discard | warning before the question or the loss | `Button feel="warning"` | qualifiers.test › CH-09702 |
| CH-09703 | Start selecting, Confirm squad, Remove a pick | warning before the question (D-70: they can't be undone, or lose a reason); success when it lands | `Button feel="warning"` | qualifiers.test › CH-09703 |

## 098xx Accessibility

| # | What | How | Test |
| --- | --- | --- | --- |
| CH-09801 | No axe violations in any preview state, 1280px and 390px | `npm run clubhouse:a11y` | a11y scan |
| CH-09802 | The leaderboard and round-by-round are tables (rows, column headers, a row header per player); each row's scorecards open from a button with aria-expanded, and each scorecard is a table with a caption | ARIA table roles, `<table>` | qualifiers.test › CH-09802 |
| CH-09803 | A live update to the standings is announced | "Standings updated. 14 rounds submitted." in a polite live region | `aria-live` | qualifiers.test › CH-09803 |

## 099xx Network and UX

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-09901 | The qualifier is closed | Coach: "Closed to new rounds. Players can't enter or submit rounds in it, including rounds already started, until you reopen it." Player: "This qualifier is closed." (D-31) | `QualifierDetail` | qualifiers.test › CH-09901 |
| CH-09902 | An edit saved only in part, or not at all | "Couldn't save the qualifier." at the top of the form, with which part did save, for example "Saved the details and the rounds and courses, but not the players. One player has a round … Save again to finish." It stays until the next save | `InlineNotice` in `QualifierForm`, from `runEditPlan`'s message | qualifiers.test › CH-09902 |
| CH-09904 | The list's filter and search | They are in the list's address (`?filter=active` or `?filter=concluded`, and `&q=…`, the defaults left out, any other query kept), read when the list mounts and rewritten as they change (replaced, never pushed), so a reload, the browser's Back and the list's own remount all keep them. Back from a qualifier (desktop link, phone top bar, the not-found page) returns to the list as it was left (the team's list or a player's /my-qualifiers) | `QualifiersList`, `list-state.ts`, `BackToList`; the address is the state, `sessionStorage` carries only which list Back returns to | qualifiers.test › CH-09904 |
| CH-09905 | Returning to the list from a qualifier | The list is scrolled to where it was left. The position is kept when a link on the list is followed, and restored once, after the frame's own scroll to the top (CH-1904), only when the list is being returned to (a Back control or the browser's Back) at the same address; a fresh visit opens at the top | `QualifiersList` (`rememberScroll` on a link click, `returnScroll` after mount), `useBackToList` | qualifiers.test › CH-09905 |
| CH-09903 | The squad is confirmed (Manage selections) | "The squad is confirmed, and every entrant has been told whether they made it." The page is read-only | `QualifierSelection` | qualifiers.test › CH-09903 |
