# Calendar catalog (6xxx)

<!-- clubhouse:release-audit:start -->
## Catalog audit — 2026-10-06

Calendar month/week/day, editor, overlap, busy and subscribe sheets. Check
event sizing and collision layout, keyboard edit flows and Retry inside the
native dialog top layer.

See [current all-page evidence](../ALL_PAGE_AUDIT.md#p006-calendar). Existing
checklist ticks and catalog identifiers retain their recorded scope. Automated
browser checks do not replace physical keyboard, gesture or
assistive-technology acceptance.
<!-- clubhouse:release-audit:end -->

Route `/golf/dashboard/calendar` (coach and player) · code
`src/clubhouse/screens/calendar/`, loader `src/clubhouse/data/calendar.ts` ·
tests `src/clubhouse/__tests__/calendar.test.tsx` · preview
`/clubhouse-preview/calendar` (`?state=empty|failed|partial|loading`,
`&view=day|month|agenda`, `&event=`, `&new=1`) and
`/clubhouse-preview/calendar-player`.

Every save goes through `useAction` (offline CH-1903, slow CH-1902, commit and
error haptics). Removing a file is optimistic with Undo, and refuses offline the
same way.

## 60xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-6001 | Publishing or saving an event fails | "Couldn't publish Short game" / "Couldn't save Short game" + "Your changes are still in the editor. Try again in a moment." Retry; the editor stays open. Done: "Published · Short game · players notified" / "Moved · …" / "Saved · …" | `EventEditor`, `useAction('calendar.saveEvent')` | calendar.test › CH-6001 |
| CH-6002 | Cancelling an event fails | "Couldn't cancel Travel briefing". Done: "Cancelled · Travel briefing · attendees notified" | `CancelEvent` | calendar.test › CH-6002 |
| CH-6003 | Creating a calendar-app link fails | "Couldn’t create the calendar link". Done: "Team schedule link ready" | `SubscribeSheet` | calendar.test › CH-6003 |
| CH-6004 | Copying a calendar-app link fails | "Couldn’t copy the link" + "Your browser blocked the clipboard. Select the link and copy it." Done: "Link copied · Team schedule" | `SubscribeSheet` | calendar.test › CH-6004 |
| CH-6005 | Removing busy time fails | "Couldn't remove Recruiting call". Done: "Removed · Recruiting call" | `BusyDetail` | calendar.test › CH-6005 |
| CH-6006 | Adding busy time fails | "Couldn’t add your busy time" + "Your entry is still here. Try again." Done: "Busy time added · Film" | `BusySheet` | calendar.test › CH-6006 |
| CH-6007 | Attaching a file fails | "Couldn’t attach the file". Done: "Attached · Pairings" | `FilePicker` | calendar.test › CH-6007 |
| CH-6008 | Removing a file fails | "Couldn't remove Local rules" + "It’s still attached. Try again in a moment." The file comes back. Done: "Removed · Local rules" with Undo | `EventFiles` | calendar.test › CH-6008 |
| CH-6009 | Undo on a removed file fails (refused, or the call throws) | "Couldn’t put Local rules back" + "Attach it again from Documents." Offline, nothing is sent: "Couldn’t put Local rules back: you’re offline" (CH-1903) | `EventFiles` | calendar.test › CH-6009 |
| CH-6010 | A player's reply fails (or is locked) | "Couldn't send your reply for Round review" + the lock reason or "Replies lock at the deadline or once the event starts." The choice goes back. Done: "You're going to Round review" | `PlayerReply`, optimistic | calendar.test › CH-6010 |
| CH-6011 | Saving attendance fails | "Couldn’t save attendance" + "The marks that saved are kept. Try again for the rest." Done: "6 attendance marks saved" | `Attendance` | calendar.test › CH-6011 |
| CH-6012 | Copying an event link fails | "Couldn’t copy the link" + "Your browser blocked the clipboard." Done: "Link copied" | `EventDetail` | calendar.test › CH-6012 |
| CH-6013 | Making a new calendar-app link fails | "Couldn't make a new Team schedule link" (or "My schedule") + the reason, or "The links below show which one works now." No Retry: the server deletes the old link before it makes the new one, so a failure can leave either state; the links are read again and the row shows what exists. Done: "New Team schedule link ready" and the new link shows | `SubscribeSheet`, `useAction('calendar.regenerateFeed')` → `regenerateCalendarFeed` | calendar-feed-manage.test › CH-6013 |
| CH-6014 | Removing a calendar-app link fails | "Couldn't remove the Team schedule link" + the reason, or "The link is unchanged. Try again.", Retry; the link stays. Done: "Team schedule link removed" and the row goes back to Create link | `SubscribeSheet`, `useAction('calendar.removeFeed')` → `deleteCalendarFeed` | calendar-feed-manage.test › CH-6014 |
| CH-6015 | Moving an event by drag or Alt+arrow fails (P006-B3) | "Couldn’t move Travel briefing" + the reason, or "It’s back where it was. Try again in a moment." The block returns to the server's place. Done: "Moved to 4:00 PM" with Undo for the toast's life; the write (and so the invitees' notice) happens as the toast leaves without Undo (its clock runs out, and it waits while the toast is held, hovered or focused; or it is closed, swiped or pushed out), and Undo (or Command Z) writes nothing. Further moves of the same event inside the window coalesce into one held write (P-4 6.3); a move of another event, or leaving the page, writes a waiting move at once; an Undo pressed after that says "Already saved. Drag it back to undo." Offline, nothing is held: CH-1903; offline when the window closes, it waits for the connection | `useHeldMoves` in `Calendar`, `useTimeDrag` → `writeMove` → `updateGolfEvent` | calendar.test › CH-6015 |
| CH-6016 | Restoring a cancelled event fails | "Couldn’t restore Travel briefing" + the reason, Retry; it stays cancelled. Done: "Restored · Travel briefing" and the page reads again. Event actions › Restore event on a cancelled event, coach only, as Fairway's event menu; not asked first (it destroys nothing) | `Calendar`, `useAction('calendar.restoreEvent')` → `updateGolfEvent` (status confirmed) | calendar.test › CH-6016 |
| CH-6017 | Deleting a cancelled event permanently fails | "Couldn’t delete Travel briefing" + the reason (the server allows it only for a cancelled event or one with no attendance), Retry; the question stays open. Done: "Deleted · Travel briefing", the panel closes and the page reads again | `DeleteEvent`, `useAction('calendar.deleteEvent')` → `deleteGolfEventPermanently` | calendar.test › CH-6017 |
| CH-6018 | Someone else changed the event while it was being moved (P-4 6.5) | "Travel briefing changed while you were moving it" + "It’s now at 3:30 PM. Yours wasn’t saved." The block goes back to the server's place; Move again resends the same target with the fresh version (no new Undo window) | `useHeldMoves` (`writeMove` code `stale`, the version in `expectedUpdatedAt`) | calendar.test › CH-6018 |
| CH-6019 | A "This and following" series move fails | "Couldn’t move the series" + "Nothing was changed. Try again in a moment." | `useHeldMoves` → `editRecurringEvent` scope `thisAndFuture` | calendar.test › CH-6019 |
| CH-6020 | Changing an event's length (a grip or Alt+Shift+arrow) fails | "Couldn’t change the length of Practice" + the reason, or "It’s back as it was. Try again in a moment." Done: "Ends at 6:30 PM" or "Starts at 3:00 PM" with Undo | `useHeldMoves` kind `resize` | calendar.test › CH-6020 |
| CH-6021 | The server refuses a move by role | "Only coaches can move team events" + "Nothing was changed." | `useHeldMoves` (code `forbidden`) | calendar.test › CH-6021 |
| CH-6022 | The event was cancelled or deleted while it was being moved | "Practice was cancelled or deleted" + "It was changed by someone else while you were moving it." | `useHeldMoves` (code `gone`) | calendar.test › CH-6022 |
| CH-6040 | A tournament is set up from the editor (P-5, `golf_tournaments_v1`) | "Pinehurst Invitational is set up in Tournaments" + Open (the desk). No Undo: players may already have seen it; delete or stop tracking from the desk | `tournamentSavedToast`, `EventEditor` | calendar.test › P-5 CH-6040; calendar-tournament-section.test |
| CH-6041 | A round's day or time is saved from round mode (P-5 4.3) | "R2 moved to Fri 6 Nov, 8:30 AM" ("Tee times moved with it." when the tee sheet shifted), or "R2 has no tee time now" when made all day. Other changes are the calendar's Saved (CH-6001) | `roundSavedToast`, `RoundEditor` | calendar.test › P-5 CH-6041; calendar-round-mode.test |
| CH-6042 | A round is cancelled from the calendar (CH-6540 confirmed) | "R2 is cancelled" with Undo. The round strikes through at once; the write waits for the toast to go, so Undo sends nothing and no player hears of it | `cancelToast`, `useHeldCancel` | calendar.test › P-5 CH-6042; calendar-cancel-round.test |
| CH-6043 | The whole tournament is cancelled from the calendar (CH-6541 confirmed) | "Pinehurst Invitational is cancelled" with Undo; every round strikes through, written as CH-6042 is | `cancelToast`, `useHeldCancel` | calendar.test › P-5 CH-6043; calendar-cancel-round.test |
| CH-6044 | A round or the tournament is restored | "R2 is back on the calendar" (or the tournament's name). Written at once, no Undo: restoring is the safe direction | `cancelToast`, `useHeldCancel` | calendar.test › P-5 CH-6044; calendar-cancel-round.test |
| CH-6048 | Setting up a tournament from an event that is already a round (someone else just did) | Inline notice in the section: "Couldn’t set up the tournament. Nothing was saved." + "This event is already set up in Tournaments." The editor stays open | `TournamentSaveNotice` (refusal `already_tracked`) | calendar.test › P-5 CH-6048; calendar-tournament-section.test |
| CH-6049 | The event being set up was deleted or moved to another team | "This event was deleted or moved to another team." | refusal `event_not_found` | calendar.test › P-5 CH-6049 |
| CH-6050 | A round that is under way, suspended or final is changed or cancelled from the calendar | "R2 is under way, so it can’t be changed here. Change it from Tournaments." | refusal `round_started` | calendar.test › P-5 CH-6050 |
| CH-6051 | Cancelling a round, or stopping tracking, when scores are entered | "R2 has scores, so it can’t be cancelled. Change it from Tournaments." / "Scores are entered for this tournament, so it stays tracked." | refusal `round_has_scores` | calendar.test › P-5 CH-6051 |
| CH-6052 | The qualifier to link was deleted meanwhile | "That qualifier was deleted. Pick another or choose None." | refusal `qualifier_not_found` | calendar.test › P-5 CH-6052 |
| CH-6053 | The trip to link is already linked to another event | "That trip is already linked to another event. Pick another or choose None." | refusal `trip_not_found` | calendar.test › P-5 CH-6053 |
| CH-6054 | A plain save tries to change a round's type, team, series, name, place or course (the round guard) | "This event is part of Pinehurst Invitational. Its type, name and course are changed in Tournaments." | refusals `round_type_locked`, `round_fields_locked`, `round_team_locked`, `round_series_locked` | calendar.test › P-5 CH-6054 |
| CH-6055 | The coach isn't staffed on the team (a permission refusal) | "Only coaches on this team can set up tournaments." | refusal `not_coach` | calendar.test › P-5 CH-6055 |
| CH-6056 | Setting up the tournament fails for any other reason (the transaction never committed) | "Couldn’t set up the tournament. Nothing was saved." | refusal `failed`, `request_conflict` | calendar.test › P-5 CH-6056 |
| CH-6057 | The qualifier to link already counts toward another event (not stolen) | "That qualifier already counts toward another event. Pick another or choose None." | refusal `qualifier_linked` | calendar.test › P-5 CH-6057 |
| CH-6058 | Restoring a round that another round has moved in front of | "R2 can’t come back where it was: R3 is now before it. Move R3 first, then restore R2." | refusal `round_order` on a restore | calendar.test › P-5 CH-6058 |
| CH-6059 | A lineup is sent before 4.33's set_entries RPC is applied | "The lineup can’t be saved from here yet. Save without it and set it in Tournaments." | refusal `entries_unavailable` | calendar.test › P-5 CH-6059 |
| CH-6060 | Saving a round from the calendar fails for any other reason | "Couldn’t save R2. Nothing was changed." | refusal `failed` (round) | calendar.test › P-5 CH-6060 |
| CH-6061 | Cancelling, restoring or stopping tracking fails for any other reason | "Couldn’t change Pinehurst Invitational. Nothing was changed." | refusal `failed` (cancel, untrack) | calendar.test › P-5 CH-6061 |

## 61xx Validation (nothing is sent; the first problem takes focus; a warning haptic)

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-6101 | An event with no title | "Give the event a title." under the title, read with it | `EventEditor`, `aria-describedby` | calendar.test › CH-6101 |
| CH-6102 | An event that ends before it starts | "End has to be after the start." where the length usually shows | `EventEditor` | calendar.test › CH-6102 |
| CH-6103 | Busy time with no name | "Name the block so you know what it was." | `BusySheet` | calendar.test › CH-6103 |
| CH-6104 | Busy time that ends before it starts | "End has to be after the start." | `BusySheet` | calendar.test › CH-6104 |
| CH-6140 | Track on, no course | Under the course field (full red ring, never a side bar): "Pick a course to set up the tournament, or turn off Track in Tournaments." Focus moves to the field | `TournamentFields`, `validate` | calendar.test › P-5 CH-6140; calendar-tournament-section.test |
| CH-6141 | The last day is before the first day | "The last day is before the first day." | `validate` | calendar.test › P-5 CH-6141 |
| CH-6142 | More than 6 rounds (7 days with One round each day) | "A tournament has up to 6 rounds." | `validate`; refusal `round_count` | calendar.test › P-5 CH-6142 |
| CH-6143 | A round would start before the one ahead of it (round mode, the RPC, the sync trigger) | "Rounds go in order. R2 can’t start before R1." | refusal `round_order` | calendar.test › P-5 CH-6143 |
| CH-6144 | Track turned on for an event that was a round of a tournament that was removed | Info notice: "This was R2 of a tournament that was removed. Set it up again from the season home to keep all its days together." + Open Set up from calendar | `TournamentSection` | calendar.test › P-5 CH-6144 |
| CH-6145 | Custom counting with more counting than players | "Counting can’t be more than players." | `validate` | calendar.test › P-5 CH-6145 |
| CH-6146 | A results link that isn't https | "Use a link that starts with https://" | `validate` | calendar.test › P-5 CH-6146 |
| CH-6147 | No tournament name, or longer than 120 | "Add a name for the tournament, up to 120 characters." under the name | `validate`; refusal `bad_name` | calendar.test › P-5 CH-6147 |
| CH-6148 | Editing a repeating occurrence of type Tournament | Track is disabled; in place of the hint: "A repeating event can’t become a tournament. Make a new event for it." | `TournamentSection`; refusal `event_is_series` | calendar.test › P-5 CH-6148 |
| CH-6149 | Editing a cancelled event of type Tournament | Track is disabled; in place of the hint: "A cancelled event can’t become a tournament. Restore it first." | `TournamentSection`; refusal `event_cancelled` | calendar.test › P-5 CH-6149 |

## 62xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-6201 | Team events don't load | "The calendar didn’t load" + "Nothing was changed…" Try again. Never an empty calendar. With another read failed too, only the title stays in the grid's place and CH-1209 carries Try again. On the phone, Day keeps its week strip (no counts) and week arrows, and the notice stands where the day's list goes | `Calendar`, `CalendarPhone`; logged `clubhouse.calendar.events` | calendar.test › CH-6201 |
| CH-6202 | The coach's busy time doesn't load | "Your busy time didn’t load" + "Team events are complete, but your own blocks aren’t shown." Try again. With another read failed too, folded into CH-1209, which names it | `Calendar` | calendar.test › CH-6202 |
| CH-6203 | Class schedules don't load | Coach: "Class schedules didn’t load" + "…class overlaps may be missing." Player: "Your classes didn’t load". Try again. With another read failed too, folded into CH-1209, which names it | `Calendar` | calendar.test › CH-6203 |
| CH-6204 | Replies don't load (summary) | "Replies didn’t load" + "Pending replies aren’t counted until they do." Try again. With another read failed too, only the title stays and CH-1209 carries Try again | `Summary` | calendar.test › CH-6204 |
| CH-6205 | Replies don't load (an event) | "Replies didn’t load" + "Try again to see who’s going." Try again. With another read failed too, only the title stays and CH-1209 carries Try again | `EventDetail` | calendar.test › CH-6205 |
| CH-6206 | Calendar-app links don't load | "Your calendar links didn’t load." Try again | `SubscribeSheet` | calendar.test › CH-6206 |
| CH-6207 | An event's files don't load | "Files didn’t load." Try again | `EventFiles` | calendar.test › CH-6207 |
| CH-6208 | The team's documents don't load (attach) | "Documents didn’t load." Try again | `FilePicker` | calendar.test › CH-6208 |
| CH-6209 | Attendance doesn't load | "Attendance didn’t load." + "Marks already saved are safe." Try again | `Attendance` | calendar.test › CH-6209 |
| CH-6210 | The calendar view crashes | "The calendar couldn't be shown." + "The rest of the page is fine…" Try again | `SectionBoundary calendar.<view>` | calendar.test › CH-6210 |
| CH-6211 | The detail panel crashes | "The detail panel couldn't be shown." … | `SectionBoundary calendar.panel` | calendar.test › CH-6211 |
| CH-6212 | The team's timezone doesn't load | "Your team’s timezone didn’t load" + "Times are shown in Eastern time until it does." Try again. With another read failed too, folded into CH-1209, which names it (the head still names the zone) | `Calendar`; logged `clubhouse.calendar.teamSettings` | calendar.test › CH-6212 |
| CH-6213 | The roster doesn't load | "The roster didn’t load" + "Events are complete, but players can’t be invited or picked until it does." Try again (with another read failed too, folded into CH-1209, which names it); in the editor, "The roster didn’t load, so no one can be invited yet." in place of the invite list | `Calendar`, `EventEditor`; logged `clubhouse.calendar.members` | calendar.test › CH-6213 |
| CH-6240 | Round mode for a tournament event whose round ref didn't load (the calendar's events did) | A warning notice in place of the banner: "Couldn’t load the tournament for this round. You can still change its time." Only the day and times show, saved through the calendar's own save; blocks show stored titles with no pill | `RoundEditor`; `loadRoundRefs` `failed` | calendar.test › P-5 CH-6240; calendar-round-mode.test |
| CH-6241 | The tournament changed since it was opened (a version conflict) | "This tournament changed since you opened it. Reload to see the latest." + Reload; unsaved values stay until then | refusal `stale` | calendar.test › P-5 CH-6241 |

## 63xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-6301 | Nothing in the agenda's range | "Nothing on the calendar in this range" (or "…these players’ schedules…") + what shows here | `Calendar` agenda | calendar.test › CH-6301 |
| CH-6302 | Nothing on the team calendar today | The panel title reads "Nothing on the team calendar today" | `Summary` | calendar.test › CH-6302 |
| CH-6303 | An event has no files | "No files yet. Attach pairings, local rules or a travel sheet from Documents." | `EventFiles` | calendar.test › CH-6303 |
| CH-6304 | The team has no documents to attach | "Your team has no documents yet. Upload one in Documents, then attach it here." | `FilePicker` | calendar.test › CH-6304 |
| CH-6305 | An opened event left the loaded range | "This event isn’t in the loaded range anymore. It may have moved or been cancelled." + back to Today | `EventDetail` | calendar.test › CH-6305 |
| CH-6306 | Nothing needs attention this week | Coach: "No overlaps and no replies waiting." Player: "You’re all caught up." | `Summary` | calendar.test › CH-6306 |
| CH-6307 | Signed in with no team (coach or player) | The page empty state under the page's framed head ("Calendar"; on the phone the bar carries it): "You aren’t on a team yet" + Coach: "The calendar fills in once your team is set up." Player: "Team events show here once a coach adds you to a team roster." + Open team settings (a coach's Team, a player's Golf profile) | `CalendarNoTeam`, from the route | calendar.test › CH-6307 |
| CH-6308 | A day with nothing on it (phone Day view) | Under the day's heading, the flush section line: "Nothing on this day" + Coach: "Plan something for the team." with a New event button (the day's heading drops its count on an empty day). Player: "Events your coach invites you to show here." | `EmptyState` in `CalendarPhone` | calendar.test › CH-6308 |
| CH-6309 | A coach whose team has never scheduled anything (D-71) | The page empty state under the page's framed head ("Calendar", no action of its own; on the phone the bar carries it, and the page shows from first paint): "Nothing on the calendar" + "Add practices, qualifiers and trips. Players see them on their calendar, and reply when you require an RSVP." + New event (the editor; the verb used everywhere else). Once anything exists, an empty range keeps CH-6301; a player, or a count that failed, never gets it | `CalendarFirstRun`; the loader's head count of the team's events | calendar.test › CH-6309 |
| CH-6340 | The course picker (tournament section) finds no course for the search | "No courses match “Pinehurts”" + Use “Pinehurts” as the course name (stored as a label, never a new library row) | `CoursePicker` `allowTyped` | calendar.test › P-5 CH-6340; calendar-tournament-section.test |

## 64xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-6401 | Calendar is loading | Header, toolbar, the week grid and the panel as skeletons. On the phone: the month's opening on its double rule with the view switch, the flush week, the day's heading on its rule and four rows on seams, in the loaded page's geometry (0px shift at 390, WebKit) | `CalendarSkeleton` | calendar.test › CH-6401 |
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
| CH-6506 | Delete permanently (a cancelled event's menu, coach) | "Delete Travel briefing permanently?" + "Every reply and attendance record for it is erased. This can’t be undone." Keep event / Delete permanently (red, the warning haptic, D-70) | `DeleteEvent` | calendar.test › CH-6506 |
| CH-6540 | Cancel round, from the inspector's menu or round mode | "Cancel R2 of Pinehurst Invitational?" + "Players see it struck through on the calendar. Its lineup and tee times stay, so you can restore it." An optional reason (120). Cancel the whole tournament instead switches to CH-6541. Keep round / Cancel R2 (felt: warning) | `CancelRoundDialog` | calendar.test › P-5 CH-6540; calendar-cancel-round.test |
| CH-6541 | Cancel the whole tournament instead, from CH-6540 | "Cancel Pinehurst Invitational?" + "All 3 rounds are struck through for players. Nothing is deleted, so you can restore it." Keep tournament / Cancel tournament | `CancelRoundDialog` | calendar.test › P-5 CH-6541; calendar-cancel-round.test |

## 66xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-6601 | Hovering or selecting an event | On hover it lifts on a soft shadow and comes to the front (180ms); selected, it takes a green ring (180ms). A press doesn't scale it: the ring is the answer (the shell's CH-1606) | `calendar.css` | preview |
| CH-6602 | Dragging the time band in Find a time | The band follows in 15-minute steps; the overlapped lanes turn amber as it passes | `FindTime` | preview |
| CH-6603 | The current time | A green line with the time moves down the grid | `ch-wk__now` | preview |
| CH-6604 | Switching between Day, Week, Month and Agenda (Day, Month and List on the phone) | The new view settles in with a 6px rise (260ms) while the old one fades out (180ms), hidden from assistive tech. Instant with reduced motion | `Swap` in `Calendar` and `CalendarPhone` | calendar.test › CH-6605 CH-6604; preview (the timing) |
| CH-6605 | Stepping to another day, week or month (the arrows, the arrow keys, Today or a date) | The grid slides 12px the way it went (260ms in, 180ms out): a later period from the right, an earlier one from the left. Instant with reduced motion | `Swap kind="slide"` in `Calendar` | calendar.test › CH-6605 CH-6604; preview (the timing) |
| CH-6606 | Choosing another day in the phone's week strip | The chosen day's green plate glides along the strip to it (260ms, ease-out) while the day's ink turns, and the day's heading and agenda slide 12px the way the day went (260ms in, 180ms out, the leaving copy hidden from assistive tech). Instant with reduced motion and Animations off | `.ch-calm-week::before` on `--ch-calm-at`; `Swap kind="slide"` in `CalendarPhone`'s `DayView` | calendar.test › CH-6606; WebKit 390 frame sampling (plate 150→201px over 260ms; reduced: one frame) |
| CH-6640 | Tournament chosen (Track on), Track turned on or off, More details opened | The section's fields fade in (quick, after the 50 ms press delay); nothing moves in height; the More details chevron turns 180°. Nothing animates on first paint; reduced motion: instant | `TournamentSection`, `TournamentFields` | calendar-tournament-section.test |

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
| CH-6805 | A completed move is said once, never during a drag: "Practice moved to 4:00 PM, Wednesday 15 October. Undo with Command Z." (Control Z off a Mac; on touch "Undo is in the notice."); a resize "Practice now ends at 6:30 PM."; a clash appended; Undo "Move undone." | `role="status"` in `Calendar` | calendar-held-moves.test › CH-6805 |
| CH-6806 | Month drag is announced: "Picked up Fall qualifier R2, Thursday 16 October. Arrow keys choose a day, Space drops, Escape cancels.", "Over Friday 17 October.", "Fall qualifier R2 moved to Friday 17 October at 8:42 AM.", or "Move cancelled. Fall qualifier R2 stays on Thursday 16 October." | dnd-kit `accessibility.announcements` in `DndMonth` | calendar-month-drag.test › CH-6806 |
| CH-6840 | The tournament section is shown or hidden (Tournament chosen, Track turned on or off): one polite line: "Tournament details shown. 3 rounds." or "Tournament details hidden." | the editor's status region | calendar-tournament-section.test › CH-6840 |
| CH-6841 | The rounds change with the days, or reorder after a day or tee change: one polite line: "3 rounds, Thursday 5 November to Saturday 7 November." or "Rounds reordered. Round 2 is now Friday 6 November at 8:30 AM." | `TournamentFields` `announce`, the editor's status region | calendar.test › P-5 CH-6841 |
| CH-6842 | Escape (or the close button) while the tournament is being created: the editor stays open and says "Still creating the tournament." | `EventEditor` close guard | calendar-tournament-section.test › CH-6842 |
