# Qualifiers catalog (09xxx)

Routes:
- `/golf/dashboard/qualifiers` with `/new`, `/[id]` and `/[id]/edit`
- `/golf/dashboard/my-qualifiers`

Coaches and players share the list and the detail (D-30). Create and edit are coach-only.

Where things live:
- Code: `src/clubhouse/screens/qualifiers/`
- Loader: `src/clubhouse/data/qualifiers.ts`
- Setup actions: `src/app/golf/actions/qualifier-setup.ts`
- Tests: `src/clubhouse/__tests__/qualifiers.test.tsx`
- Preview:
  - `/clubhouse-preview/qualifiers` (`?state=empty|failed|partial|nomatch|loading`)
  - `/clubhouse-preview/qualifier` (`?q=live|upcoming|completed|selected|closed`, and `?state=failed|scores|partial|loading`)
  - `/clubhouse-preview/qualifier-new` and `/clubhouse-preview/qualifier-edit` (`?state=failed|noroster|failwrites|loading`)
  - `/clubhouse-preview/qualifiers-player`, `/clubhouse-preview/qualifier-player` and `/clubhouse-preview/my-qualifiers`

Every save goes through `useAction`, so these belong to the shell:
- offline refusal (CH-1903);
- slow saves (CH-1902);
- the commit and error haptics (CH-1702, CH-1703).

## 090xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-09001 | Creating a qualifier fails | "Couldn't create the qualifier" + the server's reason, or "Nothing was created. Check the details and try again." Retry; the form keeps every field. Done: "Qualifier created · 7 players entered", then the new qualifier opens | `useAction('qualifiers.create')` → `createGolfQualifier` | qualifiers.test › CH-09001 |
| CH-09002 | Saving an edit fails | "Couldn't save the qualifier" + the reason when it is short, else "Check the form and save again." The full account stays on the form (CH-09902). Done: "Qualifier saved" | `useAction('qualifiers.save')` → `runEditPlan` (details, rounds and courses, squad, players, in order) | qualifiers.test › CH-09002 |
| CH-09003 | Closing a qualifier fails | "Couldn't close Pinehurst qualifier" + "It is still open, and players can still enter rounds. Try again." Done: "Qualifier closed · no new rounds accepted" | `useAction('qualifiers.close')` → `updateQualifierStatus(id, 'completed')` | qualifiers.test › CH-09003 |
| CH-09004 | Reopening a qualifier fails | "Couldn't reopen Fall invitational qualifier" + "It is still closed. Try again." Done: "Qualifier reopened · players can enter rounds" | `useAction('qualifiers.reopen')` → `updateQualifierStatus(id, 'in_progress')` | qualifiers.test › CH-09004 |

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

## 092xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-09201 | The qualifiers don't load | "The qualifiers didn't load." + Try again, never "No qualifiers yet" | `InlineNotice` | qualifiers.test › CH-09201 |
| CH-09202 | Entries or rounds don't load on the list | "Standings didn't load." The cards stay; leaders and "You're T3" are left out, not zeroed | `InlineNotice` | qualifiers.test › CH-09202 |
| CH-09203 | A qualifier's entrants don't load | "The field didn't load." in the leaderboard; entrants read "—" | `InlineNotice` | qualifiers.test › CH-09203 |
| CH-09204 | A qualifier's rounds don't load | "Scores didn't load." The field is never shown without its scores; round-by-round is hidden | `InlineNotice` | qualifiers.test › CH-09204 |
| CH-09205 | The scorecards don't load | "Scorecards didn't load." inside an opened row; the totals stay | `InlineNotice` | qualifiers.test › CH-09205 |
| CH-09206 | The round courses don't load (detail) | "The round courses didn't load." in Course per round; par reads nothing rather than a guess | `InlineNotice` | qualifiers.test › CH-09206 |
| CH-09207 | The confirmed squad doesn't load | "The confirmed squad didn't load." in Squad | `InlineNotice` | qualifiers.test › CH-09207 |
| CH-09208 | The roster (or, editing, the entrants or their rounds) doesn't load in the form | "The roster didn't load." Saving is blocked, so nobody is entered or taken out by mistake | `InlineNotice`, submit disabled | qualifiers.test › CH-09208 |
| CH-09209 | The course list doesn't load in the picker | "Courses didn't load." + Try again | `InlineNotice` | qualifiers.test › CH-09209 |
| CH-09210 | A course's tees don't load in the picker | "Tees didn't load." + Try again | `InlineNotice` | qualifiers.test › CH-09210 |
| CH-09211 | The list crashes | "The qualifiers couldn't be shown." The head and filters stay | `SectionBoundary` `qualifiers.list` | qualifiers.test › CH-09211 |
| CH-09212 | The leaderboard crashes | "The leaderboard couldn't be shown." The rest of the page stays | `SectionBoundary` `qualifiers.leaderboard` | qualifiers.test › CH-09212 |
| CH-09213 | Round-by-round crashes | "Round-by-round scores couldn't be shown." | `SectionBoundary` `qualifiers.rounds` | qualifiers.test › CH-09213 |
| CH-09214 | Selections crashes | "Selections couldn't be shown." | `SectionBoundary` `qualifiers.selections` | qualifiers.test › CH-09214 |
| CH-09215 | Course per round crashes | "Course per round couldn't be shown." | `SectionBoundary` `qualifiers.courses` | qualifiers.test › CH-09215 |
| CH-09216 | The form crashes | "The qualifier form couldn't be shown." | `SectionBoundary` `qualifiers.form` | qualifiers.test › CH-09216 |
| CH-09217 | The round courses don't load in the edit form | "The round courses didn't load." Saving keeps the courses already set | `InlineNotice` | qualifiers.test › CH-09217 |

## 093xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-09301 | The team has no qualifiers | Coach: "No qualifiers yet." + Create qualifier. Player: "No qualifiers yet." with "Your coach's qualifiers show here once they're set up." | `EmptyState` | qualifiers.test › CH-09301 |
| CH-09302 | Search or filter matches nothing | "No qualifiers match your filters." + Clear filters | `EmptyState` | qualifiers.test › CH-09302 |
| CH-09303 | Nothing has concluded yet | "No concluded qualifiers yet." under Concluded | `EmptyState` | qualifiers.test › CH-09303 |
| CH-09304 | No round is in yet | "Awaiting first round." + "7 players entered. Standings appear once a player submits a round." | `EmptyState` | qualifiers.test › CH-09304 |
| CH-09305 | The roster has no active players (form) | "No active players on the roster." | `EmptyState` | qualifiers.test › CH-09305 |
| CH-09306 | A player isn't entered in any qualifier (/my-qualifiers) | "You aren't entered in any qualifiers." + See the team's qualifiers | `EmptyState` | qualifiers.test › CH-09306 |
| CH-09308 | A round has no hole-by-hole card | "No hole-by-hole card for this round. Only the total was recorded." | `Scorecard` | qualifiers.test › CH-09308 |
| CH-09309 | Not on a team | "You aren't on a team yet." | `EmptyState` (route) | preview |
| CH-09310 | The qualifier isn't on the viewer's team, or doesn't exist | "That qualifier isn't on your team." + Back to qualifiers | `EmptyState` (route) | preview |
| CH-09311 | A player opens /new or /edit | "Only coaches create qualifiers." (or edit) + a way back | `EmptyState` (route) | preview |
| CH-09312 | The course search matches nothing | "No courses match “Pine”." | `EmptyState` | qualifiers.test › CH-09312 |
| CH-09314 | A course has no tee sets | "This course has no tee sets yet." | `EmptyState` | qualifiers.test › CH-09314 |

## 094xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-09401 | The list is loading | Its skeleton: head, tools, hero, cards | `QualifiersSkeleton` | qualifiers.test › CH-09401 |
| CH-09402 | A qualifier is loading | Its skeleton: head, facts, leaderboard, side cards | `QualifierDetailSkeleton` | qualifiers.test › CH-09402 |
| CH-09403 | The form is loading | Its skeleton | `QualifierFormSkeleton` | qualifiers.test › CH-09403 |
| CH-09404 | A create or save is in flight | The button reads "Creating" or "Saving" and is disabled | `QualifierForm` | qualifiers.test › CH-09404 |
| CH-09405 | A close is in flight | "Closing", disabled | `QualifierDetail` | qualifiers.test › CH-09405 |
| CH-09406 | A reopen is in flight | "Reopening", disabled | `QualifierDetail` | qualifiers.test › CH-09406 |
| CH-09407 | Courses or tees are loading in the picker | Skeleton rows | `CoursePicker` | qualifiers.test › CH-09407 |

## 095xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-09501 | Close qualifier | "Close this qualifier?" + "Players won't be able to enter or submit rounds in Pinehurst qualifier, including rounds already started, until you reopen it. It moves to Concluded." Keep it open / Close qualifier | `Modal` | qualifiers.test › CH-09501 |
| CH-09502 | Cancel or Back with unsaved changes in the form | "Discard your changes?" Keep editing / Discard | `Modal` | qualifiers.test › CH-09502 |

## 096xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-09601 | Pressing a card, the hero or a status pill | A 0.985 press over 90ms | `--ch-press-scale`, `--ch-dur-instant` | preview |
| CH-09602 | Opening a leaderboard row | The scorecards appear in place, final on mount; no count-up, no stagger. The Live dot is static (D-33) | `Leaderboard` | preview |

## 097xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-09701 | A status pill, a leaderboard row, a player checkbox, a course or a tee | select | `haptic('select')` | qualifiers.test › CH-09701 |
| CH-09702 | Close qualifier, Discard | warning before the question or the loss | `Button feel="warning"` | qualifiers.test › CH-09702 |

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
