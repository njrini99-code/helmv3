<!-- markdownlint-disable MD004 MD007 MD012 MD013 MD022 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# team communications test ledger

## 2026-09-04 — attachment flag, composer scoping, Enter-by-pointer (PR #1828)

- `src/hooks/golf/__tests__/use-golf-messages.attachment-flag.test.ts` — NEW.
  Structural, matching the sibling single-load test, because the bug IS the
  select string: the thread query must request `has_attachments`, and must not
  quietly drop the columns it already depended on. Also pins that
  `MessageThreadPane` is the consumer that makes the column load-bearing, so if
  that filter is ever rewritten the select assertion is revisited rather than
  left as decoration. **Confirmed to fail against the pre-fix select (1 of 3).**
- `src/components/fairway/pages/messages/FairwayMessages.composerScope.test.ts`
  — NEW. The composer must be keyed on the conversation, and on the
  conversation IDENTITY rather than an index or a constant. This is a privacy
  guarantee, not a rendering one: unkeyed, a draft outlived the switch while the
  send handlers read whichever conversation was then current. **Confirmed to
  fail against the pre-fix component (2 of 3).**
- `src/components/fairway/pages/messages/MessageComposer.enterKey.test.tsx` —
  NEW. Both halves: a fine pointer still sends on Enter (desktop unchanged) and
  does not on Shift+Enter; a coarse pointer does NOT send, leaves Enter
  undefaulted so the textarea inserts its newline, and still sends from the
  button. Plus the hint being pointer-gated. Pinning only the touch half would
  have been a gate that cannot fail. **Confirmed to fail pre-fix (3 of 7).**
- `MessageThreadPane.scroll.test.ts` — UPDATED, not loosened. It now expects TWO
  ResizeObservers (the stick-to-bottom hold joins the keyboard-shrink pin) and
  dispatches a real `scroll` event, because assigning `scrollTop` in jsdom emits
  none where a browser always does — without it the test asserted a state the
  browser never reaches.
- `FairwayMessages.threadWidth.test.ts` and `src/test/golf/mobile-audit-2026-09-02.test.ts`
  (UI-4) — UPDATED to assert the PROPERTY the original guarded (the masthead
  never occupies phone height) rather than the exact conditional, which the new
  behaviour supersedes by being strictly stronger.
