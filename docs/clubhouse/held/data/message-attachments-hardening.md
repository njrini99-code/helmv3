# HELD DATA PLAN — Message attachments hardening

```text
Plan ID: HD-message-attachments-hardening
Status: HELD
Pages: Messages (P007): desktop and phone attachments, phone Details › Files
Feature: team_communications (memory/features/team-communications.md)
Migration: supabase/migrations/20261001130000_golf_attachments_revoke_anon_hide_deleted.sql
Date: 2026-09-29
```

## Requirement

The security review of `getGolfConversationFiles` (D-48, 2026-09-29) found two
gaps that predate the Clubhouse work. The owner decided on 2026-09-29: after
Clubhouse, a forward-only migration revokes the `anon` grants on
`golf_message_attachments` and excludes deleted messages from its SELECT policy.
Not before; the owner decides on apply.

## Current schema

Read-only checks of production on 2026-09-29 (metadata only):

- `golf_message_attachments` columns: `id`, `message_id`, `file_name`,
  `file_type`, `mime_type`, `file_size`, `storage_path`, `url`, `thumbnail_url`,
  `width`, `height`, `duration_seconds`, `created_at`, `updated_at`.
- Policies, all `TO authenticated`:
  - SELECT "Users can view attachments in their conversations": the message's
    conversation has the caller as a participant. **No `is_deleted` clause.**
  - INSERT "Users can add attachments to their own messages": the caller sent
    the message.
  - DELETE "Users can delete their own attachments": the caller sent the
    message.
- Grants: `anon` holds DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE and
  UPDATE, as do `authenticated`, `postgres` and `service_role`.
- `golf_messages.is_deleted` (boolean, nullable) marks a deleted message; the
  row stays.
- Files live in the private `golf-attachments` bucket
  (`supabase/migrations/20260801080000_golf_attachments_storage_bucket.sql`).

## Proposed schema

No new tables or columns. Two changes:

1. `REVOKE ALL ON public.golf_message_attachments FROM anon;`
2. Replace the SELECT policy with one that also requires the message not to be
   deleted: `… AND m.is_deleted IS NOT TRUE`.

## Tables / columns

`public.golf_message_attachments` (grants and one policy).
`public.golf_messages` is read by the policy, not changed.

## Relationships

Unchanged: `golf_message_attachments.message_id` → `golf_messages.id` →
`golf_conversations.id`, and `golf_conversation_participants` for membership.

## RLS / permissions

- Today `anon` can't read anything, because every policy is `TO authenticated`;
  the grants are latent. Revoking them removes the risk that a future `TO
  public` policy exposes the table.
- After the change, a participant no longer reads attachment rows of deleted
  messages, so `getGolfMessageAttachments` stops signing URLs for them (today it
  returns `storagePath` and a signed URL for them).
- The storage bucket's own policies are out of scope; re-read them at
  activation, since a signed URL already issued lasts an hour.

## Indexes

None needed. The policy already joins on `golf_messages.id`; `is_deleted` is
read from the same row.

## Backfill

None.

## Compatibility

- Clubhouse draws a deleted message as "Message deleted" with no files (`Bubble`
  in `MessagesView.tsx`). Confirm at activation that Fairway, exports, admin
  tools and `get_golf_message_attachments` don't rely on reading attachments of
  deleted messages.
- `getGolfConversationFiles` already filters deleted messages in its query; it
  is unaffected.
- Service-role jobs bypass RLS and are unaffected.

## Privacy / sensitive data

Attachments can hold minors' data (school forms, waivers, photos). Keeping a
deleted message's files reachable by signed URL is the privacy gap this closes.

## Rollback concept

Forward-only: a follow-up migration restores the previous SELECT policy text and
re-grants `anon` if something depended on either. Keep the old policy text in
the migration header.

## UI behavior while held

Nothing changes in Clubhouse: a deleted message is drawn without its files, and
the Files panel leaves them out. The gap stays reachable only through the
per-message open path, as it is today.

## SQL preparation status

```text
NOT WRITTEN
```

## HELD.md registration

```text
Required: yes, once the SQL is written (STATUS: WRITTEN — HOLD — NOT APPLIED)
Registered: no (no migration file yet)
```

## Activation checklist

- [ ] current schema re-read
- [ ] migration reviewed
- [ ] conflicts resolved
- [ ] owner authorization
- [ ] sanctioned apply path
- [ ] DB types regenerated
- [ ] RLS verified
- [ ] page wiring activated
- [ ] held status discharged
