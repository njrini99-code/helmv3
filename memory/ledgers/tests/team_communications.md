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
