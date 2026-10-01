# P010 — Team Hub

One page for the team's news, logistics and paperwork: a coach posts, plans trips, assigns tasks and
shares files and sees who has replied, read and done each; a player replies, acknowledges, checks off
and opens what their coaches sent.

## Identity

```text
Page ID:            P010
Page Name:          Team Hub
Route:              /golf/dashboard/team-hub (coach and player); ?tab=home|ann|travel|docs|tasks
Bridge Namespace:   10 (Bridge IDs 10ccii, D-68; catalog codes CH-10xxx)
Roles:              coach, player
Implementation Root: src/clubhouse/screens/hub
Manifest:           config/clubhouse/pages/P010-hub.json
```

## Purpose

### Primary user

A college golf coach keeping a team informed: what is happening this week, where the team is going, what
each player still owes and where the paperwork is. Players use the same page as the place their coaches'
word reaches them.

### Job to be done

Coach: tell the team once, and see who has read it, replied and done it. Player: know what is being
asked of them and answer it in a tap.

### Primary action

Coach: New announcement. Player: answer the event that needs a reply (Going, Maybe, Can't).

### Secondary actions

Coach: plan a trip, assign a task to the whole team or to chosen players, share a file with the team,
delete a post, a task or a file. Player: acknowledge a post (Got it), check off a task, open a file
and read the next trip. Both: open a tab, open an update, try a failed section again.

### Information hierarchy

1. Home: what needs the viewer now. A player's replies and the post waiting on them; a coach's replies
   so far this week and how many have read the newest post.
2. The next trip as a pass, and Updates (the bell's feed).
3. The tabs: every announcement, every trip, the documents by folder, and the coach's task list.

### User should notice first

For a player, the events and the post waiting on their answer. For a coach, who has not replied or
read yet.

### User should never have to think about

Whether a change went through (each one says so, or says what to do), whether Retry does the whole job
(it does), what a teammate has answered (a player is never sent it), or whether a control is theirs to
press (a player is never drawn a coach's, a coach never a player's).

### Success looks like

A coach posts an announcement and a trip in a couple of minutes and, an hour later, sees who has read
it; a player answers three RSVPs and the post on the way to class.

## Semantic features

Canonical IDs from `memory/registry.yml`:

```text
- player_hub (memory/features/player-hub.md)
- team_communications (memory/features/team-communications.md)
- team_operations (memory/features/team-operations.md)
```

## Design authority

```text
Package:          design/handoff/ (v2; VERSIONS.md)
Desktop reference: design/handoff/Coach - Team Hub.html, Player - Team Hub.html, hub.jsx, hub.css, hub-data.js
Phone spec:       docs/clubhouse/phone/team-hub.md (approved), from
                  design/handoff/Coach and Player - Team Hub - Mobile.html
Status:           approved
```

## Related pages

### Enters from

The sidebar (coach and player), the phone tab bar (a player) and the More sheet (a coach) (D-66),
and any link to `?tab=`.

### Exits to

Calendar, from an event in RSVPs (`?date=&event=`) and from Create event (`?new=1`); an update's own
link from the Updates card.

## Ownership

```text
Design:          the owner (Claude Design)
Implementation:  src/clubhouse/screens/hub, on the server actions the separate coach pages and the
                 player hub already use (one write path per behaviour)
Data:            player_hub, team_communications, team_operations: golf_announcements and their
                 acknowledgements, golf_event_attendance, golf_travel_itineraries, golf_tasks and
                 golf_task_assignments, golf_documents, the bell's notifications
```

## Current status

```text
Design:         approved
Implementation: in_progress (desktop and phone built; gates in PROGRESS.md)
Contract:       complete (CONTRACT.md: all 25 categories answered)
Bridge:         reserved (IDs recorded; nothing is sent until the Bridge is wired, D-68)
Data:           existing (no held plan; the design's Pin to the top and Schedule need new data, Q-70)
Verification:   partial (VERIFY.md)
Docs:           current
```
