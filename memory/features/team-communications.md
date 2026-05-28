# Feature: Team Communications

## Status

- active

## Current State

Team Communications covers realtime team messaging and coach-to-team announcements. Messaging is conversational and realtime; announcements are structured broadcasts with urgency, targeting, linked documents, inline tasks, and acknowledgement tracking.

These surfaces are operationally important because they touch files, notifications, task creation, player acknowledgement, and team access rules.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/messages/**`
- `src/app/golf/(dashboard)/dashboard/announcements/**`

### Components

- `src/components/golf/messages/**`
- `src/components/golf/announcements/**`

### Actions

- `src/app/golf/actions/messages.ts`
- `src/app/golf/actions/message-attachments.ts`
- `src/app/golf/actions/announcements.ts`
- `src/app/golf/actions/communication.ts`

## Core Data

- `golf_conversations`
- `golf_conversation_participants`
- `golf_messages`
- `golf_message_attachments`
- `golf_announcements`
- `golf_announcement_acknowledgements`
- `golf_announcement_documents`
- `golf_announcement_recipients`
- `golf_announcement_tasks`
- Inline task records in `golf_tasks` and `golf_task_assignments`.

## Data Flow

```txt
Message send
  -> optional client-side attachment upload to Supabase Storage
  -> sendGolfMessageWithAttachments()
  -> INSERT golf_messages
  -> INSERT golf_message_attachments
  -> update participant last_read_at
  -> Supabase Realtime pushes to participants

Announcement create
  -> createEnrichedAnnouncement()
  -> INSERT golf_announcements
  -> INSERT targeted recipients or broadcast metadata
  -> INSERT linked documents
  -> optionally create inline tasks and task assignments
```

## Business Rules

- Participants should only read conversations they belong to.
- Message attachments must be scoped to the conversation/team and should not expose storage paths broadly.
- Announcement targeting must be explicit: broadcast or recipient-specific.
- Required acknowledgements need durable tracking per player.
- Inline announcement tasks must stay consistent with task assignment state.
- Urgent announcements may need push/email/in-app notification treatment; check current notification wiring before claiming it exists.

## UI Contract

- Messaging needs realtime update behavior, attachment preview, read state, and empty conversation states.
- Announcement coach view needs creation, targeting, urgency, documents, tasks, and acknowledgement tracking.
- Announcement player view needs compact cards, clear acknowledgement action, linked documents/tasks, and urgency state.
- Mobile versions should keep primary action clear and move lower-priority controls into sheets or menus.

## Known Risk Areas

- Announcement inline tasks can drift from task completion state if tasks and assignment tables are not read consistently.
- Push notification coverage is not guaranteed just because in-app/email records exist.
- Storage attachment rules can become a security issue if signed URL or path handling is loosened.
- Realtime messaging can pass static checks but fail through channel cleanup or participant filtering.

## Tests To Prefer

- `e2e/messages.spec.ts`
- RLS tests when conversation, message, announcement, recipient, or acknowledgement policies change.
- Browser/mobile checks for attachment send, announcement acknowledgement, and targeted-recipient views.

## Related Docs

- `memory/context/golfhelm-features.md`
- `memory/context/golfhelm-database.md`
- `docs/PUSH_NOTIFICATION_AUDIT.md`
