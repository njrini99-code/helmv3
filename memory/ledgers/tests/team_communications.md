# Test ledger — team_communications

## 2026-09-07 — G-08 partial-failure guarantees

- SHA: fabfae3e5.
- Added `src/app/golf/actions/__tests__/message-attachments-partial-failure.test.ts`
  (6 tests) covering `sendGolfMessageWithAttachments` when the
  `golf_message_attachments` insert fails.
- New guarantees:
  1. No text + failed attachments ⇒ `success: false` (was `true` — the defect).
  2. The empty message row is deleted rather than left as a blank bubble.
  3. Orphaned storage objects are removed.
  4. Text survives ⇒ `success: true` with `attachmentsFailed: true` and
     `has_attachments` cleared.
  5. The surviving text still reaches `notifyGolfMessageRecipients` and still
     bumps the conversation timestamp — an early return at the compensation
     point would deliver the message silently. This is the guarantee most
     likely to be regressed by a later refactor.
  6. The success path is unchanged when the attachments do insert.
- Not covered: the two-statement commit race itself (needs two live clients),
  and the rendered bubble state (jsdom computes no layout — see the audit's
  W8 rendered-fidelity item).

## 2026-09-07 — G-26 nesting and G-19 failed-send guarantees

- SHAs: 21e33781b (G-26), fef04dbb9 (G-19).
- `MessageThreadPane.metadataNesting.test.ts` (3) — the timestamp must be a
  DESCENDANT of the message column, and the column must be the row child that
  carries it. Verified to fail (2 of 3) against the pre-fix structure. It
  asserts nesting, not geometry, because jsdom computes no flex layout; the
  geometry check is W8's, in a real browser.
- `MessageThreadPane.failedSend.test.ts` (7) — a failed send still renders the
  text, is labelled "Not sent", is muted rather than removed, wires Retry and
  Discard to the message id, degrades to a labelled bubble with no handlers,
  and leaves a delivered message completely untouched.
- `MessageComposer.midFlightTyping.test.tsx` (4) — text typed during an
  in-flight send survives; only the sent portion is consumed; the payload is
  what was in the box at submit time; a failed send retains the whole draft.
  Verified to fail against the old blanket clear.
- `use-golf-messages.failed-send.test.ts` (6) — source-level, matching the
  sibling send-integrity suite's idiom and stated reason. Note: its first
  version searched the whole file and matched the fix's OWN docstring quoting
  the old expression; assertions now read a comment-stripped copy.
