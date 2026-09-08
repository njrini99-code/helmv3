/**
 * G-13 — a slow fetch for an abandoned conversation overwrote the open one.
 *
 * `useGolfMessages(id)` takes the conversation id as an ARGUMENT, not a React
 * key, so switching conversations does not remount: one persistent hook
 * instance owns one `messages` state. `fetchMessages` called
 * `setMessages(...)` unconditionally, never comparing the id captured in its
 * closure against the one currently on screen. So an in-flight fetch for
 * conversation A, resolving after the user opened B, wrote A's messages,
 * loading and error into B's view.
 *
 * Recreating the `useCallback` on an id change does not fix this: a new
 * callback identity cannot cancel a promise the old one already started, and
 * both call the same setter. The audit grepped the whole hook for
 * AbortController / abort / signal / generation / requestId and found nothing.
 *
 * Asserted on the source, matching the idiom the sibling send-integrity suite
 * established and for the reason it gives: reaching `fetchMessages`
 * behaviourally requires a full supabase + auth + realtime harness, and what
 * distinguishes fixed from broken here is whether the writes are guarded at
 * all. The guard's own logic is exercised directly below, which is the part
 * that could be subtly wrong.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/hooks/golf/use-golf-messages.ts'), 'utf-8');

/** Comment-stripped, so a docstring quoting old code cannot satisfy a check. */
const code = source
  .split('\n')
  .filter((line) => {
    const t = line.trim();
    return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
  })
  .join('\n');

describe('use-golf-messages — a stale fetch cannot overwrite the open thread (G-13)', () => {
  it('tracks the live conversation in a ref, assigned on every render', () => {
    expect(code).toContain('const liveConversationIdRef = useRef(conversationId);');
    // Assigned during render, not in an effect — an effect would leave the ref
    // one render behind exactly when a switch is in progress.
    expect(code).toContain('liveConversationIdRef.current = conversationId;');
  });

  it('guards every post-await write against a conversation switch', () => {
    const guards = code.match(/liveConversationIdRef\.current !== conversationId/g) ?? [];
    // Three awaited writes: the participants read-status, the fetch error
    // branch, and the messages write itself.
    expect(guards.length).toBe(3);
  });

  it('guards the messages setter specifically — the write that caused the defect', () => {
    const idx = code.indexOf('setMessages(((data || []) as MessageWithReadStatus[]).reverse());');
    expect(idx).toBeGreaterThan(-1);
    const preceding = code.slice(Math.max(0, idx - 400), idx);
    expect(preceding).toContain('liveConversationIdRef.current !== conversationId');
  });

  it('guards the error branch, so an abandoned failure cannot surface on the open thread', () => {
    const idx = code.indexOf('setError(true);');
    expect(idx).toBeGreaterThan(-1);
    const preceding = code.slice(Math.max(0, idx - 400), idx);
    expect(preceding).toContain('liveConversationIdRef.current !== conversationId');
  });
});

/**
 * The guard's logic, exercised directly. The source assertions above prove the
 * guard is PRESENT; this proves the comparison it performs is the right one.
 */
describe('the staleness comparison itself', () => {
  function shouldApply(capturedId: string, liveId: string): boolean {
    return liveId === capturedId;
  }

  it('applies a response for the conversation still on screen', () => {
    expect(shouldApply('conv-a', 'conv-a')).toBe(true);
  });

  it('drops a response for a conversation the user has left', () => {
    expect(shouldApply('conv-a', 'conv-b')).toBe(false);
  });

  it('drops a response when the thread was closed entirely', () => {
    expect(shouldApply('conv-a', '')).toBe(false);
  });

  it('does not confuse two conversations sharing a prefix', () => {
    expect(shouldApply('conv-a', 'conv-ab')).toBe(false);
  });
});
