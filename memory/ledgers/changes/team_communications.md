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

## 2026-09-07 — message metadata nested in its column (G-26)

- SHA: 21e33781b.
- Change: in `MessageThreadPane`, the timestamp / read-receipt block moved from
  being a SIBLING of the message column to being its last child. Dropped `pb-1`,
  which only existed to compensate for the row's `items-end`.
- Why: the row is `flex items-end gap-2`, so as a sibling the metadata was a
  third flex item consuming row width — every message carrying a timestamp had
  its bubble pushed inward by the width of the time plus the gap and no longer
  lined up with its group-mates. G-26, the defect the audit plan names in its
  own opening paragraph.
- Test note: jsdom computes no flex layout, so the visual symptom is
  unobservable in vitest and both pre-existing message-pane suites passed over
  this defect. The new suite asserts DOM NESTING, which jsdom does model, and
  was verified to fail (2 of 3) against the pre-fix structure. Rendered geometry
  remains open as `audit/PROGRESS.md` W8.

## 2026-09-07 — a failed send retains the message (G-19)

- SHA: fef04dbb9.
- Change: `useGolfMessages.sendMessage`'s three failure branches mark the
  optimistic row `sendFailed` instead of filtering it out. New `retryMessage`
  (re-sends under the SAME id) and `discardFailedMessage` (guarded on
  `sendFailed`) are returned from the hook and wired through `FairwayMessages`
  to `MessageThreadPane`, which renders the failed bubble muted, labelled
  "Not sent", with Retry and Discard. `MessageComposer` now clears only the
  text it actually sent.
- Why: deleting the user's message on failure left a toast as the only trace of
  something they wrote (§9.2 names this shortcut explicitly). Separately, a
  blanket `setMessage('')` on success discarded anything typed during the round
  trip, because the textarea deliberately stays enabled while a send is in
  flight (§9.3).
- Correction to the finding: M03C said the clear was "unconditional". It was
  already inside `if (success)`. The real defect was narrower — it cleared the
  BOX rather than what was SENT.
- Safety: retry reuses the row's existing id, so a retry racing a commit
  collides on `golf_messages`' primary key and the action reports 23505 as the
  success it is, rather than duplicating. `sendFailed` is client-only and can
  never appear on a row that came from the database.
