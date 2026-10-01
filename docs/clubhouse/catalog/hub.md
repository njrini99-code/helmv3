# Team Hub catalog (10xxx)

Route: `/golf/dashboard/team-hub` (`?tab=home|ann|travel|docs|tasks`), for coaches and players. Spec: `docs/clubhouse/phone/team-hub.md`.

A player replies to events, acknowledges posts, checks off tasks and opens files; a coach posts (with files from Documents), fixes the wording of a post, plans trips, assigns tasks, shares and deletes files, and sees who has replied, read and done each.

Where things live:
- Code: `src/clubhouse/screens/hub/` (`TeamHub`, `parts`, `sheets`, `TravelerClasses`, `writes`)
- Loader: `src/clubhouse/data/hub.ts` (`loadTeamHub`); the trip's dates and the class lines, as plain functions, in `src/clubhouse/data/hub-shape.ts`; route `src/clubhouse/routes/hub.tsx`
- Tests: `src/clubhouse/__tests__/hub.test.tsx`
- Preview: `/clubhouse-preview/hub` and `/clubhouse-preview/hub-player` (`?state=empty|failed|failwrites`, `&tab=`)

Every save goes through `useAction`, so these belong to the shell: offline refusal (CH-1903), slow saves (CH-1902), the success and error haptics (D-70). Everything a save does on the page (the tick and its undo, the open tab, closing and clearing a sheet, the page reading again, the row leaving) is inside that action, so a toast's Retry that lands does it too.

## 100xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-10001 | A player's RSVP reply fails | "Couldn't send your reply for Team dinner" + Retry; the reply goes back to what it was. Done: "You're going to Team dinner" (maybe: "Marked maybe for …"; can't: "Your coach knows you can't make …") | `useAction('hub.reply')` → `respondToEvent` | hub.test › CH-10001 |
| CH-10002 | Acknowledging a post fails | "Couldn't acknowledge "Pairings and tee times for Thursday"" + Retry; Got it comes back | `useAction('hub.acknowledge')` → `acknowledgeAnnouncement` | hub.test › CH-10002 |
| CH-10003 | Checking off a task fails | "Couldn't mark Sign travel waiver done" + Retry; the box unchecks. Done: "Sign travel waiver done" | `useAction('hub.completeTask')` → `completeTask` | hub.test › CH-10003 |
| CH-10004 | A file won't open | "Couldn't open Travel waiver" + "The file may have been removed. Try again, or ask your coach to share it again." The blank tab closes | `useAction('hub.openDocument')` → `getPreviewUrl` | hub.test › CH-10004 |
| CH-10005 | Posting an announcement fails | "Couldn't post the announcement" + "Your text is still here. Try again in a moment." The sheet stays open with the text. Done: "Posted "Bus leaves at 6"" | `useAction('hub.postAnnouncement')` → `createEnrichedAnnouncement` | hub.test › CH-10005 |
| CH-10006 | Saving a trip fails | "Couldn't save Seahawk" + "What you entered is still here." Done: "Seahawk is on Travel" | `useAction('hub.planTrip')` → `createGolfTravelItinerary` | hub.test › CH-10006 |
| CH-10007 | Assigning a task fails | "Couldn't assign Book physicals" + "What you entered is still here." Done: "Book physicals assigned to the team" (or "to 3 players") | `useAction('hub.assignTask')` → `createTask` | hub.test › CH-10007 |
| CH-10008 | Uploading a file fails | "Couldn't upload Local rules.pdf" + "Check the file is under 50 MB and try again." Each file says so on its own. Done: "Local rules.pdf shared with the team" | `useAction('hub.uploadDocument')` → `uploadGolfDocument`, `createGolfDocument` | hub.test › CH-10008 |
| CH-10009 | Deleting a post, task or file fails | "Couldn't delete NCAA hours log" + Retry; it stays. Done: "Deleted NCAA hours log" | `useAction('hub.delete')` → `deleteAnnouncement`, `deleteTask`, `deleteGolfDocument` | hub.test › CH-10009 |
| CH-10011 | Unticking a done task fails | "Couldn't reopen Sign travel waiver" + Retry; it stays done. Done: "Sign travel waiver is open again" | `useAction('hub.uncompleteTask')` → `uncompleteTask` | hub.test › CH-10011 |
| CH-10010 | Saving an edit to an announcement fails | "Couldn't save the announcement" + "Your changes are still here. Try again in a moment." (the server's reason when it gave one, for example "Message is required.") The sheet stays open with the words; the card is unchanged. Done: "Saved "Bus leaves at 6"" | `useAction('hub.editAnnouncement')` → `updateAnnouncement` | hub.test › CH-10010 |
| CH-10012 | A post goes out but its files don't attach | "Posted "Waiver" without its files" + "The files didn't attach, so players see the post with no files. They can still open them in Documents." An error toast (8s, read as an alert) with no Retry, since a Retry would post it again; the sheet has closed and the page read again. Error haptic, no success haptic, and no "Posted" toast beside it. Clean posts say Posted as before | `useAction('hub.postAnnouncement')` (`refine` hands the outcome over) + its own toast from `ComposeSheet` ← `createEnrichedAnnouncement` (`attachmentsError` beside the id, `success` stays true) | hub.test › CH-10012 |

## 101xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-10101 | Posting or saving an edit with a headline under three characters | "Give it a headline, at least three characters." Warning haptic; nothing is sent | `ComposeSheet` | hub.test › CH-10101 |
| CH-10102 | Posting to chosen players with none chosen | "Choose at least one player, or send it to the whole team." | `ComposeSheet` | hub.test › CH-10102 |
| CH-10103 | A trip with a name under three characters | "Name the trip, at least three characters." | `TripSheet` | hub.test › CH-10103 |
| CH-10104 | A trip with no destination | "Where is the team going?" | `TripSheet` | hub.test › CH-10104 |
| CH-10105 | A trip with no departure day | "Pick the day the team leaves." | `TripSheet` | hub.test › CH-10105 |
| CH-10106 | A return before the departure | "The return can't be before the departure." | `TripSheet` | hub.test › CH-10106 |
| CH-10107 | A task with a name under three characters | "Name the task, at least three characters." | `AssignSheet` | hub.test › CH-10107 |
| CH-10108 | A task for nobody | "Choose at least one player." | `AssignSheet` | hub.test › CH-10108 |
| CH-10109 | Posting or saving an edit with no message (the server requires one) | "Add a message." Warning haptic; nothing is sent | `ComposeSheet` | hub.test › CH-10109 |
| CH-10110 | Plan a trip: a chosen traveler has a class during the trip | A warning, not a stop: "**Eli has CHEM 102 lab** Mon 3:00–4:15 PM. They'd miss it to travel." One line per traveler, three at most, then "2 more travelers also have a class during the trip."; a traveler's other classes are counted ("and 1 more class", "They'd miss these to travel."). Shown on the Travelers step, for the event's own days, and on the Itinerary step, for the dates and times typed in Logistics. Only the chosen travelers' classes that overlap the trip are read | `TripSheet` → `ClassClashes`, `useClassCheck` (`tripWindow`, `clashSummary` in `hub-shape.ts`) → `getTravelerClassConflicts` | hub.test › CH-10110 |

## 102xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-10201 | RSVPs don't load | Player: "Your events didn't load." Coach: "This week's replies didn't load." + Try again; never "You're all caught up" | `Rsvps`, `RefreshNotice` | hub.test › CH-10201 |
| CH-10202 | Updates don't load | "Updates didn't load." + "Your notifications are safe; the bell may still have them. Try again." | `Updates` | hub.test › CH-10202 |
| CH-10203 | Tasks don't load | "Your tasks didn't load." (coach: "Tasks didn't load.") | `Tasks` | hub.test › CH-10203 |
| CH-10204 | Documents don't load | "Documents didn't load." + "Your files are safe." | `Documents` | hub.test › CH-10204 |
| CH-10205 | A section crashes while drawing | "RSVPs couldn't be shown." (or the section's name); the rest of the page stays | `SectionBoundary hub.*` | hub.test › CH-10205 |
| CH-10206 | Announcements don't load | "Announcements didn't load." | `TeamHub` | hub.test › CH-10206 |
| CH-10207 | Travel doesn't load | "Travel didn't load." + "Trips are safe." | `TeamHub` | hub.test › CH-10207 |
| CH-10208 | The coach's roster doesn't load | In the announcement and task sheets, where players are chosen: "The roster didn't load, so players can't be chosen." + Try again (reads the page again; the roster that arrives starts fully chosen). "Whole team" loses its count and still posts; Assign stops with this line, never "For 0 of 0" | `PlayerPicks` (`playersError` from `loadTeamHub`) | hub.test › CH-10208 |
| CH-10209 | The team's documents don't load | In New announcement, where files are attached: "Documents didn't load." + "Nothing was lost. Try again to attach files." + Try again (reads the page again; the files that arrive can be attached, and what was typed stays). The post still goes with none. Never "No documents yet" | `DocumentPicks`, `RefreshNotice` (`documents.error` from `loadTeamHub`) | hub.test › CH-10209 |
| CH-10210 | Plan a trip: upcoming events didn't load | "Upcoming events didn't load. You can still plan the trip without one, or close and try again." | `TripSheet` | hub.test › CH-10210 |
| CH-10211 | Plan a trip: who is invited to the chosen event didn't load | "Who is invited to <event> didn't load, so travelers can't be chosen now. Publish keeps the event's invitees as they are." | `TripSheet` | hub.test › CH-10211 |
| CH-10212 | Plan a trip: the travelers' classes didn't load | "Couldn't check the travelers' classes, so one may clash. Publishing still works." + Try again (asks again, for the same travelers and days). When classes were found and some reads failed: "Some classes couldn't be checked, so one more may clash." beside the warning. Never "No class meets…". A browser that is offline is this too, with nothing sent. The trip can always be published; the failure is reported at low severity | `ClassClashes` (`useClassCheck`) | hub.test › CH-10212 |

## 103xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-10301 | No events need a reply | Player: "You're all caught up" + "New team events that need a reply show here." (an event the player is not invited to, or that has started, was cancelled or is past its RSVP deadline, is not listed). Coach: "No events need RSVPs" + Create event | `Rsvps` | hub.test › CH-10301 |
| CH-10302 | No updates | "Nothing new." + "Posts, trips, tasks and qualifier moves show here as they happen." | `Updates` | hub.test › CH-10302 |
| CH-10303 | No tasks | Player: "No tasks right now." Coach: "No tasks assigned." + "Assign a task and see who has done it." | `Tasks` | hub.test › CH-10303 |
| CH-10304 | No documents | "No documents yet." + who fills it | `Documents` | hub.test › CH-10304 |
| CH-10305 | A coach with nothing posted (v2 first run, gh-states EMPTY.hub.coach) | "Nothing posted yet" + New announcement, Plan a trip. Only when every read answered and was empty, Updates included; a failed Updates read shows CH-10202 instead | `TeamHub` | hub.test › CH-10305 |
| CH-10306 | A player with nothing from their coaches (EMPTY.hub.player) | "No team updates yet" + "Announcements, trips and documents from your coaches will show up here." Only when every read answered and was empty, Updates included; a failed Updates read shows CH-10202 instead | `TeamHub` | hub.test › CH-10306 |
| CH-10307 | No announcements | "No announcements yet." | `TeamHub` | hub.test › CH-10307 |
| CH-10308 | No trips | "No trips planned." + who fills it | `TeamHub` | hub.test › CH-10308 |
| CH-10309 | No team | "You aren't on a team yet" + the role's next step | `ClubhouseHubRoute` | hub.test › CH-10309 |
| CH-10310 | A team with nobody on the roster | In the sheets, where players are chosen: "No players on the roster yet. Add them in Roster, then choose them here." | `PlayerPicks` | hub.test › CH-10310 |
| CH-10311 | A team with no documents | In New announcement, where files are attached: "No documents yet. Add files in the Documents tab, then attach them here." Nothing to attach; the post still goes | `DocumentPicks` | hub.test › CH-10311 |
| CH-10312 | Plan a trip: no upcoming events in the next four months | "No upcoming events in the next four months. Add the tournament in Calendar to choose its travelers here." | `TripSheet` | hub.test › CH-10312 |
| CH-10313 | Plan a trip: the Travelers step with no calendar event | "Travelers come from the trip's calendar event. Without one, the whole team sees the trip. Go Back to choose an event." | `TripSheet` | hub.test › CH-10313 |
| CH-10314 | New announcement: files that players can't open are left out of the attach list | Only files players can open (`is_public`) are offered. With some left out, under the list: "1 coach-only file isn't offered: players couldn't open it." ("6 coach-only files aren't offered: … them."). With every file coach-only: "Your file is coach-only, so none can be attached: players couldn't open it." and no attach button; the post still goes with none. A file chosen and then made coach-only while the sheet is open comes off its chip and is not sent. The Documents tab still lists every file to a coach | `DocumentPicks` (`ChHubFile.isPublic` from `folders()`) | hub.test › CH-10314 |
| CH-10315 | Plan a trip: nobody chosen has a class during the trip | "No class meets during the trip for the travelers chosen." Only when the check ran in full: a check that could not is CH-10212 | `ClassClashes` | hub.test › CH-10315 |

## 104xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-10401 | Files are uploading | "Uploading…" on the drop zone; it can't be pressed again | `Documents` | hub.test › CH-10401 |
| CH-10402 | A post is being sent | "Posting" on the button; it can't be pressed twice | `ComposeSheet` | hub.test › CH-10402 |
| CH-10403 | A trip is being saved | "Saving" | `TripSheet` | hub.test › CH-10403 |
| CH-10404 | A task is being assigned | "Assigning" | `AssignSheet` | hub.test › CH-10404 |
| CH-10405 | Team Hub is loading | The header, the tab strip and the two Home columns as grey blocks, in place (nothing for the first 150ms, then a fade); read as "Loading Team Hub" | `HubSkeleton` from `team-hub/loading.tsx` through `ClubhouseSwitch` | hub.test › CH-10405 |
| CH-10406 | An edit is being saved | "Saving" on the button of Edit announcement; it can't be pressed twice | `ComposeSheet` (edit) | hub.test › CH-10406 |
| CH-10407 | Plan a trip: the travelers' classes are being checked | "Checking their classes…" once the chosen travelers have settled (350ms; a run of taps on player chips is one question). Publish never waits for it, and an answer for travelers or days no longer on screen is not shown | `ClassClashes` (`useClassCheck`) | hub.test › CH-10407 |

## 105xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-10501 | Deleting an announcement | "Delete this announcement?" + "Players stop seeing it, and its acknowledgements go with it." Keep it / Delete. Warning haptic | `ConfirmDelete` | hub.test › CH-10501 |
| CH-10502 | Deleting a task | "Delete this task?" + "It leaves every player's list, done or not." | `ConfirmDelete` | hub.test › CH-10502 |
| CH-10503 | Deleting a file | "Delete this file?" + "Players can no longer open it. This can't be undone." | `ConfirmDelete` | hub.test › CH-10503 |

## 107xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-10701 | A tab, an RSVP reply, an audience or transport choice, a player chip, a file to attach or take off | select; the current choice is silent | `haptic('select')` | hub.test › CH-10001 |
| CH-10702 | Delete (before the question), a form sent with a mistake | warning | `haptic('warning')` | hub.test › CH-10501 |

## 108xx Accessibility

| # | What | How | Test |
| --- | --- | --- | --- |
| CH-10801 | The sections are real tabs (selected state, each controls its panel); an RSVP is a radio group named for its event; a task's box names the task and says when it's done | `role="tablist|tab|tabpanel"`, `radiogroup`, `aria-pressed` | hub.test |
| CH-10802 | No axe violations in any preview state, 1280px and 390px | `npm run clubhouse:a11y` | a11y scan |
