# Change ledger — team_communications

## 2026-09-07 — a failed attachment insert stops reporting success (G-08)

- SHA: fabfae3e5.
- Change: `sendGolfMessageWithAttachmentsImpl`
  (`src/app/golf/actions/message-attachments.ts`) compensates when the
  `golf_message_attachments` insert fails instead of logging and falling
  through to `{ success: true }`. It removes the orphaned storage objects;
  deletes the message when no text survives (returning failure, so the
  composer keeps the draft); and when text does survive, clears
  `has_attachments` and falls THROUGH to the conversation-timestamp update and
  the recipient fan-out before returning `attachmentsFailed: true`. Return type
  widened with an optional `attachmentsFailed`.
- Why: the `golf_messages` row commits first with `has_attachments: true`. A
  later attachment-insert failure left it flagged with no attachment rows,
  which `MessageThreadPane`'s SUCCESSFUL-BUT-EMPTY branch reads as "the rows
  have not committed YET" and offers a one-shot retry for. That reading is
  correct for the two-statement commit race it was written for and wrong for
  this failure, which is permanent — so the retry could never succeed and the
  bubble stayed dead for the rest of the session, while the sender had been
  told the photo was delivered. Found as G-08 in the Wave 0 messages audit
  (`audit/M00-MANIFEST.md`), the highest-severity item in it; open issue #1825
  ("Message image attachments render as nothing — two independent user
  reports") is the user-visible form.
- Verification: `golf_messages_delete` and `golf_messages_update_v2` are each
  `sender_id = auth.uid()`, read from production `pg_policies`, so both
  compensations are permitted for the sender under RLS. The bucket
  `golf-attachments` is private and `golf_attachments_owner_delete` is
  `owner = auth.uid()`, so the sender may remove their own uploads.
- Note: the fall-through rather than an early return is load-bearing. The
  message really was delivered, so returning at the compensation point would
  have suppressed the recipient's push/email for a message they can see. A
  test pins it.
