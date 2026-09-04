/**
 * ============================================================================
 * FairwayMessages.tsx — a draft can only be sent to the thread it was typed in
 * ----------------------------------------------------------------------------
 * `MessageComposer` owns `message` and `pendingAttachments` as local state and
 * clears them ONLY on a successful send (MessageComposer.tsx). Mounted without
 * a `key`, that state survived a conversation switch — while both send
 * handlers read whatever `selectedConversationId` is current AT SEND TIME
 * (FairwayMessages.tsx `handleSendMessage` / `handleSendMessageWithAttachments`).
 *
 * So: type a message (or attach a photo) to conversation A, switch to B
 * without sending, press Send — and A's content went to B, with nothing on
 * screen suggesting the text had carried over. That is private content
 * delivered to the wrong recipient, which makes this a correctness and privacy
 * defect rather than a missing convenience.
 *
 * Keying the composer on the conversation makes it a fresh instance per
 * thread, so its contents can only ever reach the thread they were typed into.
 *
 * Source-string matching, not a render test, for the same reason the sibling
 * FairwayMessages.threadWidth.test.ts gives: mounting this component needs a
 * large hook/context mock surface for no additional signal, and the defect IS
 * the absence of a prop in the JSX.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src/components/fairway/pages/messages/FairwayMessages.tsx';
const source = readFileSync(join(process.cwd(), SRC), 'utf-8');

/** The `<MessageComposer ... />` JSX element, from its tag to its close. */
function composerElement(): string {
  const start = source.indexOf('<MessageComposer');
  expect(start, '<MessageComposer> should be rendered by FairwayMessages').toBeGreaterThan(-1);
  const end = source.indexOf('/>', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('FairwayMessages — the composer is scoped to its conversation', () => {
  it('keys MessageComposer so its draft cannot outlive a conversation switch', () => {
    expect(composerElement()).toMatch(/key=\{/);
  });

  it('keys it on the conversation identity, not an index or a constant', () => {
    const key = composerElement().match(/key=\{([^}]*)\}/)?.[1] ?? '';
    // Anything not derived from the selected conversation would let one
    // thread's draft persist into another — the exact defect this pins.
    expect(key).toMatch(/selectedConversation/);
    expect(key).toContain('.id');
    expect(key).not.toMatch(/\bindex\b/);
  });

  it('still renders the composer only when a conversation is selected', () => {
    // Guards the surrounding condition: keying is not a licence to mount a
    // composer with no thread behind it.
    expect(source).toMatch(/selectedConversation \?[\s\S]{0,2000}<MessageComposer/);
  });
});
