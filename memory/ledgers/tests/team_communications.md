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

## 2026-09-07 — G-21 fail-closed and G-13 staleness guarantees

- SHA: f5744c0bc.
- `MessageComposer.attachmentFailClosed.test.tsx` (5) — with files pending and
  no handler: the text path is NOT called, the user is told nothing was sent,
  and the draft plus attachment survive. Plain text sends and the
  handler-supplied path are unaffected. Verified to fail 3-of-5 against the
  fail-open branch.
- `use-golf-messages.stale-fetch.test.ts` (8) — 4 source-level (the ref exists,
  is assigned during render, and guards all three awaited writes, with the
  messages setter and error branch checked specifically), plus 4 exercising the
  staleness comparison directly, including the shared-prefix case that a
  `startsWith` implementation would get wrong.

## 2026-09-07 — G-15 preview shape and G-18 equivalence

- `MessageConversationRail.lastMessagePreview.test.tsx` (4) — the rail renders
  text and time from a preview object with no `id` and no `read`, survives the
  nullable `created_at`/`sender_id` the RPC actually declares, keeps the honest
  "No messages yet" placeholder, and renders two conversations that no longer
  share one fabricated id. The discriminator for G-15 is `npm run typecheck`,
  not a source grep: narrowing the type is what proves no consumer read `.id` or
  `.read`, and a grep for the literal could not.
- `send-message-duplicate-key-equivalence.test.ts` (7) — the transport-retry
  case still reports success and is shown to have asked the database; a
  colliding row with another sender, another conversation, or different content
  does not; an invisible row and a failed lookup both fail closed; an ordinary
  successful send does no extra round trip. Verified to fail 6-of-7 against the
  unconditional short-circuit. The harness sequences INSERT and the later SELECT
  on the SAME table, which a table-keyed mock cannot.

## 2026-09-07 — IME composition (G-23)

- `MessageComposer.imeComposition.test.tsx` (8) — each of the three signals is
  pinned SEPARATELY, so an engine-specific fix cannot pass the suite: native
  `isComposing`, `keyCode === 229`, an open composition with neither, and the
  WebKit compositionend-then-keydown order. Plus: the guard is not sticky (the
  next Enter sends), it does not defaults the composing Enter (the IME still
  gets its commit key), an ordinary Enter is unchanged, and Shift+Enter stays a
  newline during composition.
- Verified to fail 5-of-8 against the unguarded handler. The pre-existing
  `MessageComposer.enterKey.test.tsx` passed green over this whole contract
  without exercising it — the shape `.claude/rules/quality-gates.md` warns about.

## 2026-09-07 — per-viewer group unread (G-40)

- `use-golf-messages.per-viewer-unread.test.ts` (15). Eleven exercise the two
  extracted pure functions directly: which conversations get recomputed (groups
  yes, DMs no, already-counted skipped, an absent `is_group` is not a group,
  null input safe) and what happens to the counts (overwrite, a genuine zero,
  KEEP the previous number when no count was produced, other fields untouched,
  no mutation).
- Four assert the wiring on the source, which is what distinguishes fixed from
  broken: both helpers called inside `fetchConversations`, the count is
  head-only `exact` and filtered on sender/is_deleted, the id list is chunked,
  and the supplemental path registers its conversations so they are not counted
  twice. Verified: those 4 fail when the wiring is removed.
- The "keeps the previous number" case is the one that matters most — a failed
  recompute degrading to 0 would render as "you are caught up".

## 2026-09-07 — AttachmentPreview token migration (G-46)

`src/components/golf/messages/AttachmentPreview.tokens.test.ts` — 10 tests,
8 failing against the pre-fix file.

Asserted on the source. The classes are strings in JSX with no runtime
behaviour to observe: rendering and reading `className` would assert the same
strings through three more layers, and would not reach the error, uploading,
audio and document branches without four fixtures built to prove a lint fact.

It exists because no gate could see this. ESLint does not catch a banned
palette name, and the Review Gate's blocking rules are about RLS, auth and
table names — which is why the finding stayed open as long as it did. The
suite also pins the two deliberate non-changes (the `bg-black/20` scrim and
the legacy `IconButton` import), so a future reader does not "fix" them.
