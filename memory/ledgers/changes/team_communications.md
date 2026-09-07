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

## 2026-09-07 — attachment send fails closed; stale fetch guarded (G-21, G-13)

- SHA: f5744c0bc.
- G-21: `MessageComposer` branched `if (hasAttachments && onSendWithAttachments)
  … else onSend(text)`, so a missing handler fell through to the text-only path
  — message delivered, files silently dropped, success reported. It now refuses,
  retains the draft and staged files, and surfaces the reason. Latent (the
  production call site always passes the handler), which is why nothing covered
  the branch.
- G-13: `useGolfMessages` takes the conversation id as an argument rather than a
  React key, so one hook instance owns one `messages` state across conversation
  switches, and `fetchMessages` wrote unconditionally. A slow fetch for A
  resolving after B opened wrote A's messages/loading/error into B's view. Added
  `liveConversationIdRef`, assigned during render and compared after all three
  awaited writes.
- Why the ref is assigned during render, not in an effect: an effect leaves it
  one render behind exactly while a conversation switch is in progress, which is
  the only moment it matters.

## 2026-09-07 — honest last-message preview; duplicate-key equivalence (G-15, G-18)

- G-15: `useGolfConversations` built every conversation's `last_message` as a
  full `GolfMessageRow`, which forced it to invent the columns
  `get_golf_conversations_with_details` does not return — a literal `id: ''` on
  every row in the inbox and a constant `read: false` (§16.1). Narrowed to a new
  `GolfConversationLastMessage` (`content`, `created_at`, `sender_id`), which
  makes the compiler, not a grep, the proof that nothing consumed the
  fabrication. `sender_id` also stops being coerced to `''`.
- G-15, second half: `ConversationRow` declared 13 of the RPC's 14 columns, so
  `is_team_channel` never reached the client, and the supplemental team-chat
  query did not select it either. Both fixed.
- The M01 authority question is answered in `audit/M01-TEAM-FLAGS.md`:
  `is_team_chat` is the grouping flag (the RPC's `is_group` output is literally
  `COALESCE(c.is_team_chat, FALSE)`); `is_team_channel` is a separate flag used
  only by the function's own `ORDER BY`. The manifest's "dropped in favour of"
  framing is wrong — they are two flags, not two spellings.
- Deliberately NOT changed: the client's sort. Ordering the inbox is the
  client's contract (it uses `last_message.created_at`, a better key than the
  RPC's `updated_at`), the rail buckets by time before rendering, and inbox
  sectioning is G-01's.
- G-18: `sendMessage`'s 23505 short-circuit returned `{ success: true }` on the
  strength of the constraint alone. It now verifies the existing row is this
  sender's, in this conversation, with this content, and fails closed when the
  row is invisible or the lookup errors (§17.3). The idempotency
  `withOneTransportRetry` and `retryMessage` depend on is preserved exactly.
- Why failing closed here is not a regression: G-19 landed first, so the caller
  retains the optimistic bubble and offers Retry instead of deleting it.

## 2026-09-07 — Enter no longer sends mid-IME-composition (G-23)

- `MessageComposer`'s Enter-to-send treated every unshifted Enter as a send. For
  a Japanese/Chinese/Korean/Vietnamese IME, Enter is the COMMIT key, so
  confirming a candidate mid-sentence sent the fragment and cleared the box.
- Three signals are read, because no single one covers every engine: the
  standard `nativeEvent.isComposing` (Chromium, Gecko), the legacy
  `keyCode === 229` (what some Android WebViews report instead), and a ref
  driven by compositionstart/compositionend for WebKit, which ends composition
  BEFORE dispatching the commit keydown.
- The ref is cleared on a macrotask, not synchronously. That is deliberate: it
  swallows exactly the one keydown WebKit dispatches after compositionend, and
  nothing a human could type in the next turn of the event loop.
- The guard RETURNS rather than calling `preventDefault()` — consuming the event
  would stop the IME committing the candidate at all.
- Only reachable with a fine pointer, since a touch keyboard already falls
  through to a native newline (the `isPointerFine` branch above it).

## 2026-09-07 — group unread is per-viewer (G-40)

- `get_golf_conversations_with_details` computes `unread_count` as
  `COUNT(*) WHERE read = FALSE AND sender_id <> me`, running on
  `golf_messages.read` — ONE boolean shared by every participant.
  `mark_golf_messages_read` flips it on every message the opener did not send,
  so in a 3+ person team chat one member opening the thread cleared the badge
  for everyone (§17.2, M-T06 FAIL).
- A correct per-viewer computation already existed in `useGolfConversations` —
  but only on the SUPPLEMENTAL team-chat path, reached for chats the RPC
  missed. The normal path was the broken one. The same computation now runs
  over every group conversation the RPC returns, from the viewer's own
  `golf_conversation_participants.last_read_at`. No schema change: that column
  exists in production and in the migrations (`A1-RESOLUTION.md` §3).
- DMs are deliberately left on the shared boolean. With two people, "not sent
  by me" and "not read by me" are the same set, so it is already per-viewer
  there — and it is what DM read receipts are built on.
- Degradation is explicit: if the `last_read_at` lookup fails, every badge
  keeps the RPC's number; if one conversation's count fails, only that one
  does. A failed count must never read as 0, which looks like "caught up".
- Two pure functions carry the decisions — `perViewerUnreadTargets` (which rows)
  and `applyPerViewerUnread` (what happens to a row with no recomputed number)
  — so they can be exercised without a realtime + auth harness. This is also
  why `ConversationRow` was hoisted to module scope as
  `GolfConversationRpcRow`.
- Still open, and NOT fixed here: the RPC itself. Correcting `unread_count` at
  the source means changing a SECURITY DEFINER function, i.e. a migration —
  writing one is in scope for this branch, applying it is not, and the client
  cannot depend on an unapplied function. The client-side derivation is what
  actually ships.
- `head: true, count: 'exact'` transfers zero rows, so the PostgREST 1000-row
  cap cannot silently under-count a busy chat; the id list is chunked at 200
  because PostgREST filters travel in the URL.
- Cost note: the per-conversation head count now fires for EVERY group row,
  where the supplemental path only ever covered rows the RPC had missed. The
  "team chats per viewer are few" reasoning behind the `Promise.all` was
  written for that rare path and now covers the common one — production
  currently has 6 team chats total, so N is small, but this is the number to
  watch if group chats grow.
- What clears the badge changed with it. The count no longer falls because
  `golf_messages.read` flipped; it falls because the viewer's own
  `last_read_at` moved. `markMessagesAsRead` writes that row first and treats
  it as the primary read marker, and the rail's realtime subscription is
  `golf_conversation_participants` / `event: '*'` / `filter: user_id=eq.<me>`
  — the viewer's own row included — so the write refetches the rail. Pinned by
  test, because the sibling receipts subscription in `useGolfMessages`
  deliberately ignores the current user and is an easy thing to copy.
