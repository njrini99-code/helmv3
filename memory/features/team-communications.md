# Feature: Team Communications

## Status

- active

## Current State

Team Communications covers realtime team messaging and coach-to-team announcements. Messaging is conversational and realtime; announcements are structured broadcasts with urgency, targeting, linked documents, inline tasks, and acknowledgement tracking.

When a player or coach opens a conversation, the thread starts at the newest
loaded message. Later realtime messages preserve a reader's position unless
they are already near the bottom; an explicit search result takes precedence
and opens at its matched message instead. The search target consumes the
initial-open sentinel so it cannot be overwritten by a stale initial scroll.

These surfaces are operationally important because they touch files, notifications, task creation, player acknowledgement, and team access rules.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/messages/**`
- `src/app/golf/(dashboard)/dashboard/announcements/**`

### Components

- `src/components/golf/messages/**`
- `src/components/fairway/pages/messages/**`
- `src/components/golf/announcements/**`

### Actions

- `src/app/golf/actions/messages.ts`
- `src/app/golf/actions/message-attachments.ts`
- `src/app/golf/actions/message-reactions.ts`
- `src/app/golf/actions/message-responses.ts`
- `src/app/golf/actions/announcements.ts`
- `src/app/golf/actions/communication.ts`

## Core Data

- `golf_conversations`
- `golf_conversation_participants`
- `golf_messages`
- `golf_message_attachments`
- `golf_message_reactions`
- `golf_message_responses`
- `golf_message_mentions`
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
  -> optional direct file upload from the composer (uploadGolfDocument ->
     createGolfDocument: file lands in the team document library, then the
     new document id joins documentIds)
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
- A text send retries ONCE, after 750 ms, when the server-action POST fails
  at the transport layer (WebKit "Load failed", Chromium "Failed to fetch" —
  `withOneTransportRetry` in `src/lib/transient-network-error.ts`). Any other
  failure, and a second transport failure, still surface the toast and keep
  the draft. Field evidence 2026-09-01/02: two Shenandoah phones lost a send
  this way with `navigator.onLine === true`, and Vercel logged no
  `message_sent` for either — the request never arrived. A retry carries the
  same duplicate risk as the player's own re-tap and nothing more; a
  schema-backed idempotency key is the answer if duplicates ever become costly.
- A private conversation may only include the caller and people in the same
  Golf team. The player-facing group flow requires a title and at least two
  selected teammates; the server keeps the title optional for compatibility
  with existing direct callers, but applies the same team-audience check to
  every caller. Coach-only Team broadcasts remain the official channel rather
  than being conflated with player-created groups.
- A reply target is read through caller RLS and must be a non-deleted message
  in the same conversation. Invalid, inaccessible, cross-thread, and deleted
  targets all fail with the same user-safe `Reply message is unavailable`
  result.
- Send failure remains attached to the optimistic bubble as retryable state;
  it is never removed merely because the write failed. Failed reaction and
  structured-response reads return an explicit unavailable state, preserving
  the last known UI instead of presenting a failed read as zero activity.

## UI Contract

- Messaging needs realtime update behavior, attachment preview, read state, and empty conversation states.
- Opening a conversation must land at its newest message without forcing a
  reader back to the bottom after they scroll upward.
- Announcement coach view needs creation, targeting, urgency, documents, tasks, and acknowledgement tracking.
- The composer's Attachments section renders for any coach with a team (2026-08-26): it offers direct device upload (25 MB cap, mirrors the Documents-page accept list) plus the library picker; it must NOT be hidden just because the team library is empty.
- Announcement player view needs compact cards, clear acknowledgement action, linked documents/tasks, and urgency state.
- Mobile versions should keep primary action clear and move lower-priority controls into sheets or menus.
- The Golf messaging mobile presentation is purpose-built rather than a
  squeezed desktop rail: the inbox is a flat people-first canvas using real
  `Avatar`/`AvatarGroup` identity, `PressTarget` rows, search, compact filters,
  and editorial dividers rather than row cards. An open thread owns the phone
  with a compact back/header surface. Group participant identity is scoped to
  the active conversation, cleared while a new group loads, and ignores stale
  fetches, so one group cannot show another group’s faces. Stored photo URLs
  always render as photos; no-photo identities receive a deterministic Fairway
  tint, and a group with no photos uses its conversation monogram instead of a
  stack of anonymous initials.
- The mobile thread is a full-bleed canvas, not a recessed panel. Incoming and
  outgoing bursts retain connected geometry and restrained tonal distinction,
  but messaging deliberately uses no bubble shadows, contact elevation, or
  nested card surfaces. Its depth comes from identity, type, alignment, space,
  and the persistent header/composer chrome.
- Message composition uses a native auto-growing textarea and Fairway press
  controls. Valid sends snapshot and clear the draft in the same interaction
  tick; network state belongs on the optimistic bubble (`Sending`, `Sent`,
  `Read`, or retryable failure), not a disabled composer spinner. The composer
  retains keyboard-safe geometry, attachment preview, an inline 2px-rule reply
  reference (not a rounded reply card), newline behavior, typing throttling,
  and a 44px send hit target.
- The first-open scroll sentinel waits until the mobile thread is visible and
  has usable height. This prevents the hidden master-detail pane from
  consuming its one initial positioning attempt and opening a thread at the
  first message. Desktop remains the two-pane workspace.
- On a phone the messages column shrinks by whichever is taller of the bottom
  chrome (56px nav + safe area) and `--keyboard-height`, so the composer sits
  directly above the keys ("I can't see what I'm typing", Shenandoah team
  chat 2026-09-01); the thread pane re-pins to the newest message when its
  region shrinks, and the composer drops its home-indicator pad while the
  keyboard covers the home indicator. The screen carries
  `data-fw-keyboard-aware` so the shell's global scroll-into-view stays out.
- On a phone with a thread open, the inbox masthead (`ViewHeader`) is hidden
  (`hidden md:block`) so the thread gets the screen; the thread header carries
  Back. With both stacked, 100–272px of an 844px viewport was left for the
  conversation and read as "doesn't load the newest message" (mobile audit
  2026-09-02, UI-4).
- **Coach announcement edit (2026-09-02, GAPS_AUDIT_INTERACTION_CRUD).**
  Before this, there was no Edit action anywhere — expanding a posted
  announcement only revealed Delete, so fixing a typo meant a destructive
  delete-then-recreate that also discarded every acknowledgement. The coach
  card (`FairwayCoachAnnouncementCard`) now shows an Edit control (ghost
  variant, matching Delete's size) next to Delete once expanded. Edit opens
  the same Sheet component the create flow uses
  (`AnnouncementFormSheet`, mode-aware, in `FairwayCreateAnnouncement.tsx`)
  prefilled from the announcement's own title/body/urgency/
  requires_acknowledgement, and calls the new `updateAnnouncement` server
  action (announcements.ts), authorized identically to `deleteAnnouncement`
  (any coach staffed on the announcement's team, F036/F037 — not just the
  original author). **Editable: title, body, urgency,
  requires_acknowledgement — the row's own columns.** Recipients
  (`golf_announcement_recipients`), attachments
  (`golf_announcement_documents`), and inline tasks (`golf_announcement_tasks`
  / `golf_tasks` / `golf_task_assignments`) are deliberately NOT editable —
  changing any of them means delete-then-reinsert of junction rows, the exact
  DELETE-then-INSERT-in-a-save-path shape the Review Gate blocks, and
  re-targeting recipients would silently orphan existing
  acknowledgements/task-completions. Delete-and-recreate remains the path for
  changing those. Toggling `requires_acknowledgement` is non-retroactive in
  both directions: turning it off does not clear already-acknowledged
  players' acknowledged status, and turning it on does not require anyone who
  already read the original version to (re-)acknowledge — existing
  `golf_announcement_acknowledgements` rows are never touched by the edit
  action. The card patches its own collapsed header optimistically on save
  (an `override` local state cleared once the prop's own fields catch up via
  `router.refresh()`) rather than waiting on a full reload.

## Conversation Rail Failure Semantics (2026-08-27)

The rail distinguishes "backend failed" from "genuinely empty" — a failed load
must never render the cheerful "No conversations yet" (P257).

`useGolfConversations` reads from TWO sources: the
`get_golf_conversations_with_details` RPC (primary) and a direct
`golf_conversation_participants` query for team chats (supplement, "in case DB
function doesn't include them"). The terminal decision is
`(rpcError ?? groupConvsError) && !conversationsData?.length` →
`setError(true)`; `MessageConversationRail` then renders explain + Retry.

Deliberately NOT an early return at the team-chat query: it supplements the RPC,
so returning on its failure would blank a rail whose DMs loaded fine. The rail
keeps rows on screen when `error && conversations.length > 0`. Before
2026-08-27 that query's failure was logged and then fell through, so a user
whose team-chat read was denied saw an empty inbox with no error — the exact
masquerade P257 exists to stop.

## Known Risk Areas

- Announcement inline tasks can drift from task completion state if tasks and assignment tables are not read consistently.
- Push notification coverage is not guaranteed just because in-app/email records exist.
- Storage attachment rules can become a security issue if signed URL or path handling is loosened.
- Realtime messaging can pass static checks but fail through channel cleanup or participant filtering.

## Tests To Prefer

- `e2e/messages.spec.ts`
- RLS tests when conversation, message, announcement, recipient, or acknowledgement policies change.
- Browser/mobile checks for attachment send, announcement acknowledgement, and targeted-recipient views.
- `docs/qa/golf-messaging-mobile-2026-09-04/` contains the deterministic
  component-rendered mobile evidence, overflow assertions, and the current
  device-QA limitation once regenerated.

## Related Docs

- `memory/context/golfhelm-features.md`
- `memory/context/golfhelm-database.md`
- `docs/PUSH_NOTIFICATION_AUDIT.md`
