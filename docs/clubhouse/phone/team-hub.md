# Design: Team Hub (coach and player, desktop and phone)

Status: approved. The owner's v2 boards are the spec (D-22): `design/handoff/Coach - Team Hub.html`, `Player - Team Hub.html` and `Coach and Player - Team Hub - Mobile.html` (`hub.jsx`, `hub.css`, `hub-data.js`). This file maps each board piece to the data and writes that already exist, and names every gap (Q-70). Built as `src/clubhouse/screens/hub/`.

The route is `/golf/dashboard/team-hub` for both roles. Today a coach there gets "Team Hub collects a player's own tasks…" (the Fairway page is player-only); in Clubhouse the coach gets the coach hub, built from the separate coach surfaces' actions. It is a phone tab for players (D-66) and opens from More for coaches.

## Header and tabs

Coach view / Player view pill, "Team Hub", the team and season. A coach's one primary action is New announcement. Tabs: Home, Announcements, Travel, Documents, and Tasks (coach). `?tab=` opens a tab (the legacy `?tab=` redirects stay for Fairway users only).

## Board to data

| Board piece | Read | Write |
| --- | --- | --- |
| RSVPs (player: "Your RSVPs", Going / Maybe / Can't) | `get_player_hub_events` through `getPlayerHubSummaryData` (events needing a reply, with going and maybe counts) | `respondToEvent(eventId, 'accepted' | 'tentative' | 'declined')`, the same write Calendar's reply uses |
| RSVPs (coach: this week's replies as a bar) | This week's team events and `golf_event_attendance` counts (the Home week loader's attendance read) | none (Calendar owns the event) |
| Announcement card and the Announcements tab | Player: `getPlayerHubAnnouncements`; coach: `getAnnouncementsWithMeta` (acknowledged and recipient counts) | Player "Got it": `acknowledgeAnnouncement`. Coach: `createEnrichedAnnouncement` (headline, body, audience all or chosen players, ask to acknowledge, attach from Documents: only files players can open, `is_public`; it returns `attachmentsError` beside the id when the files didn't attach, and the toast says so, CH-10012), `updateAnnouncement`, `deleteAnnouncement` |
| Next trip pass, Travel tab | `golf_travel_itineraries` through `getPlayerHubSummaryData` (player) or the same select for the team (coach); travelers are the linked event's invitees | Coach Plan a trip: `createGolfTravelItinerary` / `updateGolfTravelItinerary`. Its Travelers step reads the chosen travelers' classes that overlap the trip with `getTravelerClassConflicts` (a coach's read; the class's name, weekdays and hours only) |
| Updates (Home) | The bell's feed, `getUnifiedNotifications` (one feed, not a second read) | Open marks read, as the bell does |
| Tasks (player: check off; coach: completion rings, Assign) | Player: assignments through `getPlayerHubSummaryData`; coach: `golf_tasks` with `golf_task_assignments` counts | Player: `completeTask`. Coach: `createTask(teamId, title, description, dueDate, priority, playerIds)`, `deleteTask` |
| Documents (folders, files; coach drop zone) | `getDocuments(teamId)`, grouped by `folder` ("Team" when none) | Open: `getPreviewUrl` (a signed link). Coach upload: `uploadGolfDocument` then `createGolfDocument`; delete: `deleteGolfDocument` |

## Gaps (Q-70), none built as a mock

- **Pin to the top**: announcements have no pinned column. The Home card shows the newest announcement that still needs the player's acknowledgement, else the newest.
- **Schedule** a post: `publish_at` exists on the table but `createEnrichedAnnouncement` doesn't take it. Not built.
- **"Players get a push notification"**: said only when the post's `send_push` came back true, never as a promise.
- **Trip photos**: the board's pass uses course photos; the owner rejected imagery (Coach Home), so the pass is typographic.
- **Class clash** in the trip builder ("Eli has CHEM 102 lab Mon 3:00–4:15"): built (Q-84, 2026-09-30) from the Travelers step and again on the Itinerary step. It asks the availability layer the Calendar's conflict check asks, for the chosen travelers only and the trip's days (the event's own days until a departure and return are typed; a departure or return time narrows the first or last day), so terms, synced meetings, academic breaks and the team's zone are decided once. A check that could not run says so and never reads as "no classes"; it never blocks Publish. The board's "He'd miss it" is "They'd miss it": the page cannot know a traveler's pronouns.
- **Room assignments and flight info** are free text or JSON in the table; shown as text when present.

## States

Each read has its own failed notice with Try again (never an empty panel); `getPlayerHubSummaryData` throws on a failed events, travel or tasks read, which the route's error view catches. Empty states from `gh-states.jsx` EMPTY.hub: coach "Nothing posted yet" (New announcement, Plan a trip), player "No team updates yet"; the RSVP card's own empties ("You're all caught up", coach "No events need RSVPs" with Create event).

## Phone

The same tabs as a segmented strip under the top bar; cards stack; compose, trip and task forms are sheets (`Modal`). A player reaches Team Hub from the tab bar (D-66), a coach from More ("‹ More").
