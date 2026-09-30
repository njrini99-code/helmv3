# P007 — Messages

The gold-standard page (D-62): the other pages copy this folder's shape.

## Identity

```text
Page ID:            P007
Page Name:          Messages
Route:              /golf/dashboard/messages (coach and player)
Bridge Namespace:   7 (Bridge IDs 7ccii, D-68; catalog codes CH-7xxx)
Roles:              coach, player
Implementation Root: src/clubhouse/screens/messages
Manifest:           config/clubhouse/pages/P007-messages.json
```

## Purpose

### Primary user

A college golf coach running the team's conversation: the whole team, groups (a travel squad,
seniors) and one-to-one threads with players and staff. Players use the same page with their own
permissions.

### Job to be done

Reach the right people fast, see who has read and answered, and never lose something that was
written.

### Primary action

Send a message in the open conversation.

### Secondary actions

Start a direct thread or a group, post an announcement (coach), acknowledge an announcement or mark
its task done (player), react, edit or delete your own message, search, mute, add members to a
group you created, leave a group, open shared files.

### Information hierarchy

1. The open thread: who said what and when, newest at the bottom, the composer ready.
2. The rail: conversations by recency, unread counts, announcements above today.
3. Details: members, mute, files, and the group actions.

### User should notice first

Which conversations have something new, and the thread they were last in.

### User should never have to think about

Whether a message sent (it says so if it didn't, and keeps the text), whether an unread count cleared
by itself (desktop opens the newest thread without marking it read), or who is allowed to message whom
(the server decides).

### Success looks like

A coach answers five players and posts an announcement in a couple of minutes, and every failure
along the way told them exactly what didn't happen.

## Semantic features

Canonical IDs from `memory/registry.yml`:

```text
- team_communications (memory/features/team-communications.md)
```

## Design authority

```text
Package:          design/handoff/ (v2; VERSIONS.md). v1 files kept where records cite them.
Desktop reference: design/handoff/Coach - Messages.html, messages.jsx, msg.css (v1: Messages.html,
                  screenshots messages-01..04)
Phone spec:       docs/clubhouse/phone/messages.md (approved), from
                  design/handoff/mobile/Messages Mobile.html and Coach - Messages - Mobile.html
Status:           approved
```

## Related pages

### Enters from

The sidebar and the More sheet (D-66), the bell (a message notification), Home's Message team
(D-4), Roster's and Stats' Message buttons (`?player=`), and push notifications.

### Exits to

Calendar's editor from a thread's Schedule (`?new=1`, D-47; on desktop a direct thread with a player also
invites that player, `&with=`, D-52), a player's stats from a direct thread's
Details (coach), and back to the rail.

## Ownership

```text
Design:          the owner (Claude Design)
Implementation:  src/clubhouse/screens/messages, on the live realtime hooks and server actions
Data:            team_communications: golf_conversations, golf_conversation_participants,
                 golf_messages, golf_message_reactions, golf_message_attachments,
                 golf_announcements and their acknowledgements and tasks
```

## Current status

```text
Design:         approved
Implementation: in_progress (desktop and phone built; gates in PROGRESS.md)
Contract:       complete (CONTRACT.md: all 25 categories answered)
Bridge:         reserved (IDs recorded; nothing is sent until the Bridge is wired, D-68)
Data:           existing, plus two held plans (held/features/conversation-files.md,
                held/data/message-attachments-hardening.md)
Verification:   partial (VERIFY.md)
Docs:           current
```
