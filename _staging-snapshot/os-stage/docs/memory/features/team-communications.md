# Feature: Team Communications

```yaml
feature_id: team_communications
status: active
criticality: high
last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
last_verified_at: 2026-08-21
history_backfill: not_started
```

## Purpose

Realtime team messaging and coach-to-team announcements. Messaging is
conversational; announcements are structured broadcasts with urgency,
targeting, linked documents, inline tasks, and acknowledgement tracking. Both
surfaces touch storage, task creation, and access rules, so bugs here tend to
have a wider blast radius than the UI alone suggests.

## User Contract

- A player or coach only ever sees conversations they're a participant in.
- An announcement marked as requiring acknowledgement tracks each player's
  ack durably; a coach can see who has and hasn't acknowledged.
- Message attachments are scoped to the conversation and never exposed via a
  guessable or broadly-shared storage path.
- An announcement's targeting (broadcast vs. specific recipients) is explicit
  and visible, not inferred.

## Current Behavior

Messaging: `sendGolfMessageWithAttachments()`
(`src/app/golf/actions/message-attachments.ts:162`, wrapping an impl at
line 56) inserts into `golf_messages` and `golf_message_attachments`, with an
optional client-side upload to Supabase Storage before the insert.
Participant read-state (`golf_conversation_participants.last_read_at`) is
**not** written inside the send path — it's updated separately from
`coach-notifications.ts` and `player-notifications.ts` when a participant
views/marks-read, not as a side effect of another participant sending.

Announcements: `createEnrichedAnnouncement()`
(`src/app/golf/actions/announcements.ts:615`, impl at line 221) inserts into
`golf_announcements`, plus targeted recipients or broadcast metadata, linked
documents, and optionally inline tasks/assignments in the same flow.
Acknowledgement tracking runs through `communication.ts`:
`acknowledgeAnnouncement()`, `getAnnouncementAcknowledgements()`,
`hasPlayerAcknowledged()`.

## Invariants

- Participants read only conversations they belong to.
- Attachments must be scoped to the conversation/team; storage paths must not
  be broadly guessable or exposed.
- Announcement targeting is explicit: broadcast or recipient-specific, never
  ambiguous.
- Required acknowledgements need durable per-player tracking
  (`golf_announcement_acknowledgements`), not a client-only "seen" flag.
- Inline announcement tasks must stay consistent with the task
  assignment/completion state owned by `team_operations`.

## Primary Journeys

1. **Send a message**: optional attachment upload to Supabase Storage →
   `sendGolfMessageWithAttachments()` → insert `golf_messages` +
   `golf_message_attachments` → Supabase Realtime pushes to other
   participants.
2. **Mark read**: separate action (`coach-notifications.ts` /
   `player-notifications.ts`), not part of the send path — updates
   `last_read_at` on `golf_conversation_participants`.
3. **Create announcement**: coach fills in urgency/targeting/documents/tasks →
   `createEnrichedAnnouncement()` → `golf_announcements` insert → recipient or
   broadcast rows → linked `golf_announcement_documents` → optional
   `golf_announcement_tasks` + `golf_tasks`/`golf_task_assignments`.
4. **Acknowledge**: player calls `acknowledgeAnnouncement()` →
   `golf_announcement_acknowledgements` row written; coach reads acknowledgement
   state via `getAnnouncementAcknowledgements()`.

## Architecture/Data Flow

```txt
Message send
  -> optional client-side attachment upload to Supabase Storage
  -> sendGolfMessageWithAttachments()
  -> INSERT golf_messages
  -> INSERT golf_message_attachments
  -> Supabase Realtime pushes to participants
  (last_read_at update happens elsewhere — coach/player-notifications.ts)

Announcement create
  -> createEnrichedAnnouncement()
  -> INSERT golf_announcements
  -> INSERT targeted recipients or broadcast metadata
  -> INSERT linked documents
  -> optionally create inline tasks and task assignments

Announcement acknowledge
  -> acknowledgeAnnouncement()
  -> INSERT/UPSERT golf_announcement_acknowledgements
```

## Permissions/Tenancy

Conversation and announcement access is team/participant-scoped, enforced
through the same RLS + server-action-auth pattern documented in
`team_access_control`. This doc does not duplicate policy definitions; verify
current RLS policy text against the live catalog before relying on a
specific policy name.

## Dependencies

- `team_access_control` (auth/RLS enforcement).
- `team_operations` (inline announcement tasks feed into the shared
  `golf_tasks`/`golf_task_assignments` tables).
- Supabase Storage (attachments, announcement-linked documents).
- Supabase Realtime (message delivery).
- Notifications (push/email) — see Known Debt; do not assume delivery just
  because an in-app record exists.

## Failure Modes

- **Realtime channel cleanup / participant filtering.** Realtime subscription
  bugs pass typecheck and build but only surface in a live browser session —
  changes to conversation/participant filtering need a browser check, not
  just a green CI run.
- **Attachment path exposure.** Loosening signed-URL or storage-path scoping
  on message or announcement-document attachments is a security regression,
  not a UX one.
- **Inline task drift.** An announcement's inline tasks can read as stale if
  the read path doesn't join `golf_announcement_tasks` against current
  `golf_task_assignments` state — the task's completion truth lives in
  `team_operations`' tables, not duplicated here.

## Observability Contract

No feature-specific observability contract (custom metrics, alert
thresholds) is defined in code as of `last_verified_sha` beyond the shared
`logServerError()` convention used across golf server actions.

## Test Contract

- `e2e/messages.spec.ts` — confirmed present.
- No pgTAP RLS test exists under `supabase/tests/rls/` specifically for
  `golf_conversations`, `golf_messages`, `golf_announcements`, or their
  acknowledgement/recipient tables — a real coverage gap, not something this
  doc is asserting exists. `documents_storage.sql` covers document storage
  RLS, which is adjacent (announcement-linked documents) but does not cover
  messaging or announcement rows themselves.
- No dedicated unit/action test file for `announcements.ts`,
  `communication.ts`, or `message-attachments.ts` was found under
  `src/app/golf/actions/__tests__/` — `e2e/messages.spec.ts` is currently the
  only automated coverage for this feature's write paths.

## Known Debt/Unknowns

- Push notification coverage for urgent announcements or new messages is not
  verifiable from this feature's own action files — no `sendPush`/push-related
  call was found in `messages.ts`, `announcements.ts`, or `communication.ts`.
  Do not assume push fires just because an in-app announcement or message
  record exists; check the actual notification-dispatch code
  (`settings_preferences`'s notification-prefs area, or a dedicated
  notifications service) before claiming delivery.
- Storage attachment RLS/signed-URL behavior was not independently
  re-verified this pass beyond confirming `documents_storage.sql` exists;
  treat attachment security specifics as needing a fresh check before any
  change to upload/signing code.

## Incident History

No incidents specific to this feature were found in this week's operational
ledger (`/tmp/claude/night/ledger.md`) or in `memory/incidents/` (which
contains only a README stub as of `last_verified_sha`). Absence of incidents
here is not strong evidence of health — it may also reflect that this
feature was not part of this week's audit sweep.

## ADR Links

None recorded yet — `memory/decisions/` contains only a README stub as of
`last_verified_sha`.

## Verification Evidence

- Tables (`golf_conversations`, `golf_conversation_participants`,
  `golf_messages`, `golf_message_attachments`, `golf_announcements`,
  `golf_announcement_acknowledgements`, `golf_announcement_documents`,
  `golf_announcement_recipients`, `golf_announcement_tasks`) all confirmed
  present in `src/lib/types/database.ts`'s generated table list.
  `golf_conversation_participants.last_read_at` confirmed present as a column.
- `sendGolfMessageWithAttachments`, `createEnrichedAnnouncement`,
  `acknowledgeAnnouncement`, `getAnnouncementAcknowledgements`,
  `hasPlayerAcknowledged` all confirmed present via direct grep of their
  action files, with line numbers cited above.
- `src/app/api/messages/**` and `src/app/api/announcements/**`, both named in
  `memory/registry.yml`'s `code.api` list for this feature, do not exist —
  `src/app/api/` has no `messages` or `announcements` subdirectory. This
  feature is server-action + Realtime only, no dedicated API route. Flagging
  as registry drift.
- `last_read_at` write site confirmed to live in `coach-notifications.ts` /
  `player-notifications.ts`, not in `messages.ts` — corrects the prior
  generation of this doc, which implied the write happens inside message
  send.
