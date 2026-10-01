# Calendar catalog (6xxx)

Route `/golf/dashboard/calendar` (coach and player) · code `src/clubhouse/screens/calendar/`, loader
`src/clubhouse/data/calendar.ts` · tests `src/clubhouse/__tests__/calendar.test.tsx` · preview
`/clubhouse-preview/calendar` (`?state=empty|failed|partial|loading`, `&view=day|month|agenda`, `&event=`, `&new=1`) and
`/clubhouse-preview/calendar-player`.

Every save goes through `useAction` (offline CH-1903, slow CH-1902, commit and error haptics). Removing a
file is optimistic with Undo, and refuses offline the same way.

## 60xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-6001 | Publishing or saving an event fails | "Couldn't publish Short game" / "Couldn't save Short game" + "Your changes are still in the editor. Try again in a moment." Retry; the editor stays open. Done: "Published · Short game · players notified" / "Moved · …" / "Saved · …" | `EventEditor`, `useAction('calendar.saveEvent')` | calendar.test › CH-6001 |
| CH-6002 | Cancelling an event fails | "Couldn't cancel Travel briefing". Done: "Cancelled · Travel briefing · attendees notified" | `CancelEvent` | calendar.test › CH-6002 |
| CH-6003 | Creating a calendar-app link fails | "Couldn't create the calendar link". Done: "Team schedule link ready" | `SubscribeSheet` | calendar.test › CH-6003 |
| CH-6004 | Copying a calendar-app link fails | "Couldn't copy the link" + "Your browser blocked the clipboard. Select the link and copy it." Done: "Link copied · Team schedule" | `SubscribeSheet` | calendar.test › CH-6004 |
| CH-6005 | Removing busy time fails | "Couldn't remove Recruiting call". Done: "Removed · Recruiting call" | `BusyDetail` | calendar.test › CH-6005 |
| CH-6006 | Adding busy time fails | "Couldn't add your busy time" + "Your entry is still here. Try again." Done: "Busy time added · Film" | `BusySheet` | calendar.test › CH-6006 |
| CH-6007 | Attaching a file fails | "Couldn't attach the file". Done: "Attached · Pairings" | `FilePicker` | calendar.test › CH-6007 |
| CH-6008 | Removing a file fails | "Couldn't remove Local rules" + "It's still attached. Try again in a moment." The file comes back. Done: "Removed · Local rules" with Undo | `EventFiles` | calendar.test › CH-6008 |
| CH-6009 | Undo on a removed file fails (refused, or the call throws) | "Couldn't put Local rules back" + "Attach it again from Documents." Offline, nothing is sent: "Couldn't put Local rules back: you're offline" (CH-1903) | `EventFiles` | calendar.test › CH-6009 |
| CH-6010 | A player's reply fails (or is locked) | "Couldn't send your reply for Round review" + the lock reason or "Replies lock at the deadline or once the event starts." The choice goes back. Done: "You're going to Round review" | `PlayerReply`, optimistic | calendar.test › CH-6010 |
| CH-6011 | Saving attendance fails | "Couldn't save attendance" + "The marks that saved are kept. Try again for the rest." Done: "6 attendance marks saved" | `Attendance` | calendar.test › CH-6011 |
| CH-6012 | Copying an event link fails | "Couldn't copy the link" + "Your browser blocked the clipboard." Done: "Link copied" | `EventDetail` | calendar.test › CH-6012 |
| CH-6013 | Making a new calendar-app link fails | "Couldn't make a new Team schedule link" (or "My schedule") + the reason, or "The links below show which one works now." No Retry: the server deletes the old link before it makes the new one, so a failure can leave either state; the links are read again and the row shows what exists. Done: "New Team schedule link ready" and the new link shows | `SubscribeSheet`, `useAction('calendar.regenerateFeed')` → `regenerateCalendarFeed` | calendar-feed-manage.test › CH-6013 |
| CH-6014 | Removing a calendar-app link fails | "Couldn't remove the Team schedule link" + the reason, or "The link is unchanged. Try again.", Retry; the link stays. Done: "Team schedule link removed" and the row goes back to Create link | `SubscribeSheet`, `useAction('calendar.removeFeed')` → `deleteCalendarFeed` | calendar-feed-manage.test › CH-6014 |

## 61xx Validation (nothing is sent; the first problem takes focus; a warning haptic)

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-6101 | An event with no title | "Give the event a title." under the title, read with it | `EventEditor`, `aria-describedby` | calendar.test › CH-6101 |
| CH-6102 | An event that ends before it starts | "End has to be after the start." where the length usually shows | `EventEditor` | calendar.test › CH-6102 |
| CH-6103 | Busy time with no name | "Name the block so you know what it was." | `BusySheet` | calendar.test › CH-6103 |
| CH-6104 | Busy time that ends before it starts | "End has to be after the start." | `BusySheet` | calendar.test › CH-6104 |

## 62xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-6201 | Team events don't load | "The calendar didn't load." + "Nothing was changed…" Try again. Never an empty calendar | `Calendar`; logged `clubhouse.calendar.events` | calendar.test › CH-6201 |
| CH-6202 | The coach's busy time doesn't load | "Your busy time didn't load." + "Team events are complete, but your own blocks aren't shown." Try again | `Calendar` | calendar.test › CH-6202 |
| CH-6203 | Class schedules don't load | Coach: "Class schedules didn't load." + "…class overlaps may be missing." Player: "Your classes didn't load." Try again | `Calendar` | calendar.test › CH-6203 |
| CH-6204 | Replies don't load (summary) | "Replies didn't load." + "Pending replies aren't counted until they do." Try again | `Summary` | calendar.test › CH-6204 |
| CH-6205 | Replies don't load (an event) | "Replies didn't load." + "Try again to see who's going." Try again | `EventDetail` | calendar.test › CH-6205 |
| CH-6206 | Calendar-app links don't load | "Your calendar links didn't load." Try again | `SubscribeSheet` | calendar.test › CH-6206 |
| CH-6207 | An event's files don't load | "Files didn't load." Try again | `EventFiles` | calendar.test › CH-6207 |
| CH-6208 | The team's documents don't load (attach) | "Documents didn't load." Try again | `FilePicker` | calendar.test › CH-6208 |
| CH-6209 | Attendance doesn't load | "Attendance didn't load." + "Marks already saved are safe." Try again | `Attendance` | calendar.test › CH-6209 |
| CH-6210 | The calendar view crashes | "The calendar couldn't be shown." + "The rest of the page is fine…" Try again | `SectionBoundary calendar.<view>` | calendar.test › CH-6210 |
| CH-6211 | The detail panel crashes | "The detail panel couldn't be shown." … | `SectionBoundary calendar.panel` | calendar.test › CH-6211 |
| CH-6212 | The team's timezone doesn't load | "Your team's timezone didn't load." + "Times are shown in Eastern time until it does." Try again | `Calendar`; logged `clubhouse.calendar.teamSettings` | calendar.test › CH-6212 |
| CH-6213 | The roster doesn't load | "The roster didn't load." + "Events are complete, but players can't be invited or picked until it does." Try again; in the editor, "The roster didn't load, so no one can be invited yet." in place of the invite list | `Calendar`, `EventEditor`; logged `clubhouse.calendar.members` | calendar.test › CH-6213 |

## 63xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-6301 | Nothing in the agenda's range | "Nothing on the calendar in this range." (or "…these players' schedules…") + what shows here | `Calendar` agenda | calendar.test › CH-6301 |
| CH-6302 | Nothing on the team calendar today | The panel title reads "Nothing on the team calendar today" | `Summary` | calendar.test › CH-6302 |
| CH-6303 | An event has no files | "No files yet. Attach pairings, local rules or a travel sheet from Documents." | `EventFiles` | calendar.test › CH-6303 |
| CH-6304 | The team has no documents to attach | "Your team has no documents yet. Upload one in Documents, then attach it here." | `FilePicker` | calendar.test › CH-6304 |
| CH-6305 | An opened event left the loaded range | "This event isn't in the loaded range anymore. It may have moved or been cancelled." + back to Today | `EventDetail` | calendar.test › CH-6305 |
| CH-6306 | Nothing needs attention this week | Coach: "No overlaps and no replies waiting." Player: "You're all caught up." | `Summary` | calendar.test › CH-6306 |
| CH-6307 | Signed in with no team (coach or player) | The page empty state: "You aren't on a team yet" + Coach: "The calendar fills in once your team is set up." Player: "Team events show here once a coach adds you to a team roster." | `CalendarNoTeam`, from the route | calendar.test › CH-6307 |
| CH-6308 | A day with nothing on it (phone Day view) | "Nothing on this day." + Coach: "Tap + to plan something for the team." Player: "Events your coach invites you to show here." | `EmptyState` in `CalendarPhone` | calendar.test › CH-6308 |
| CH-6309 | A coach whose team has never scheduled anything (D-71) | The page empty state: "Nothing on the calendar" + "Add practices, qualifiers and trips. Players see them on their calendar and can reply." + Create event (the editor). Once anything exists, an empty range keeps CH-6301; a player, or a count that failed, never gets it | `CalendarFirstRun`; the loader's head count of the team's events | calendar.test › CH-6309 |

## 64xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-6401 | Calendar is loading | Header, toolbar, the week grid and the panel as skeletons | `CalendarSkeleton` | calendar.test › CH-6401 |
| CH-6402 | Calendar-app links are loading | Two skeleton rows | `SubscribeSheet` | calendar.test › CH-6402 |
| CH-6403 | An event's files are loading | A skeleton row | `EventFiles` | calendar.test › CH-6403 |
| CH-6404 | Documents are loading (attach) | Two skeleton rows | `FilePicker` | calendar.test › CH-6404 |
| CH-6405 | Attendance is loading | A skeleton row per player (up to five) | `Attendance` | calendar.test › CH-6405 |
| CH-6406 | Changing view or week, or a save in flight | The page is marked busy while the new range loads; buttons read "Publishing…", "Saving…", "Cancelling…", "Removing…", "Attaching…" and can't be pressed twice | `useTransition`, `useAction.pending` | preview |

## 65xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-6501 | Cancel event (event menu) | "Cancel Travel briefing?" + "Everyone invited is notified. Replies and attendance are kept, and the event stays on the calendar marked cancelled." For a series, which events; This and following and All in series delete the events, and the question says so: "…These events are removed from the calendar, and their replies and attendance with them." Keep event / Cancel event | `CancelEvent` | calendar.test › CH-6501 |
| CH-6502 | Remove busy time | "Remove Recruiting call?" + "This block is removed from your calendar." (or every repeat) | `BusyDetail` | calendar.test › CH-6502 |
| CH-6503 | Closing the event editor with changes | "Discard this event?" + "Nothing has been published yet. What you entered is lost." (editing: "Discard your changes?") Keep editing / Discard. Closing untouched just closes | `EventEditor` | calendar.test › CH-6503 |
| CH-6504 | New link (a calendar-app link) | "Make a new Team schedule link?" + "The current link stops working right away. Anyone who added it to a calendar app stops getting updates until they add the new link." Keep link / Make a new link. Warning haptic as it opens; focus starts on Keep link, so Enter never confirms. Asked in the link's own row, not a second dialog over the sheet | `SubscribeSheet` | calendar-feed-manage.test › CH-6504 |
| CH-6505 | Remove (a calendar-app link) | "Remove the Team schedule link?" + "The link stops working right away, so calendar apps that use it stop getting updates. You can create a new link any time." Keep link / Remove link (red). Same row, same haptic and focus | `SubscribeSheet` | calendar-feed-manage.test › CH-6505 |

## 66xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-6601 | Hovering or selecting an event | It lifts and takes a green ring (180ms); pressing shrinks about 6px (110ms) and springs back (280ms) | `calendar.css` | preview |
| CH-6602 | Dragging the time band in Find a time | The band follows in 15-minute steps; the overlapped lanes turn amber as it passes | `FindTime` | preview |
| CH-6603 | The current time | A green line with the time moves down the grid | `ch-wk__now` | preview |

## 67xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-6701 | Opening an event, a day or a panel item; changing view, week or players; each Find a time step | A selection tick | `haptic('select')` | calendar.test › CH-6701 |
| CH-6702 | A form with a problem, or closing the editor with changes | The OS warning pattern | `haptic('warning')` | calendar.test › CH-6503 |
| CH-6703 | A link is copied | The OS success pattern | `haptic('success')` | preview |

## 68xx Accessibility

| # | What | How | Test |
| --- | --- | --- | --- |
| CH-6801 | Each event is a button named with its title and time, and "schedule overlap" when it has one; each day header opens the day | `aria-label` | calendar.test › CH-6801 |
| CH-6802 | The detail panel is a polite live region; form errors are tied to their field | `aria-live`, `aria-invalid`, `aria-describedby` | calendar.test › CH-6802 |
| CH-6803 | Changing the player filter is announced ("Showing 2 players") | `role="status"` | preview |
| CH-6804 | No axe violations in any preview view and state, 1280px and 390px. One known exception, listed in the scan: the 7-day week at 390px squeezes overlapping events under 24px until the phone Calendar is designed | `npm run clubhouse:a11y` | a11y scan |
