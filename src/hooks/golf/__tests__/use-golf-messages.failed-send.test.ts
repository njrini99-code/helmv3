/**
 * G-19 — a failed send must not delete the user's message.
 *
 * Every failure branch of `sendMessage` used to call
 * `setMessages(prev => prev.filter(m => m.id !== optimisticId))`, once per
 * branch: the error result, the not-success result, and the catch. The message
 * the user typed vanished from the thread and a toast was its only trace, which
 * §9.2 names as the specific shortcut not to take.
 *
 * Asserted on the SOURCE, matching the idiom the sibling send-integrity suite
 * establishes and for the same stated reason: a behavioural test of this hook
 * needs a full realtime + auth harness to reach the send path, and what
 * actually distinguishes fixed from broken here is which call the failure
 * branches make. The user-visible half — muted bubble, Retry, Discard — is
 * covered behaviourally in
 * src/components/fairway/pages/messages/MessageThreadPane.failedSend.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/hooks/golf/use-golf-messages.ts'), 'utf-8');

/**
 * The source with comment lines removed.
 *
 * Needed because the fix's own docstring quotes the broken expression verbatim
 * in order to explain what it replaced — so a naive whole-file search finds the
 * defect in the very comment describing its removal. (It did, on the first run
 * of this suite.) Assertions about what the CODE does read this.
 */
const code = source
  .split('\n')
  .filter((line) => {
    const t = line.trim();
    return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
  })
  .join('\n');

describe('use-golf-messages — a failed send retains the message (G-19)', () => {
  it('no longer filters the optimistic row out on failure', () => {
    // The exact broken expression, byte for byte — in code, not in prose.
    expect(code).not.toContain('prev.filter(m => m.id !== optimisticId)');
  });

  it('marks the row failed instead, at every failure branch', () => {
    // Three branches: error result, non-success result, and the catch.
    //
    // Argument-agnostic on purpose. G-20b gave `markSendFailed` a second
    // parameter (which outcome it was), and the property THIS test owns is
    // that every branch marks rather than filters — not what else it records.
    // Pinning the full call froze a signature this suite does not own.
    const marks = code.match(/markSendFailed\(optimisticId[,)]/g) ?? [];
    expect(marks.length).toBe(3);
  });

  it('sets a client-only sendFailed flag rather than mutating a real column', () => {
    expect(code).toContain('sendFailed?: boolean;');
    // Again argument-agnostic past the flag itself: G-20b sets `sendOutcome`
    // alongside it, and this test owns the flag, not the row's whole shape.
    expect(code).toMatch(/m\.id === optimisticId \? \{ \.\.\.m, sendFailed: true[,\s}]/);
  });

  it('exposes a retry that reuses the SAME id, so pressing it twice cannot duplicate', () => {
    expect(code).toContain('const retryMessage = async');
    // The id is threaded back through as golf_messages.id, so a retry racing a
    // commit collides on the primary key and the action reports 23505 as the
    // success it is — the property withOneTransportRetry already depends on.
    expect(code).toContain('sendGolfMessage(conversationId, target.content, messageId)');
  });

  it('guards discard on sendFailed so it cannot become a second delete path', () => {
    expect(code).toContain('prev.filter(m => !(m.id === messageId && m.sendFailed))');
  });

  it('returns both affordances from the hook', () => {
    expect(code).toContain('retryMessage,');
    expect(code).toContain('discardFailedMessage,');
  });
});
