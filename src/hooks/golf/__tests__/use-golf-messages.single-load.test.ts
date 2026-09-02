/**
 * A thread must be fetched and subscribed ONCE per conversation.
 *
 * Reported 2026-08-31: "whenever messages loads, it instantly loads again",
 * and threads opening at the oldest message rather than the newest.
 *
 * One cause. `currentUserId` resolves asynchronously from `auth.getUser()`, so
 * it is null on first render and a string a moment later. It was a dependency
 * of `fetchOtherParticipantReadStatus` -> `fetchMessages` -> the effect that
 * fetches the thread and opens the realtime channel. One late id rebuilt that
 * whole chain:
 *
 *   mount       -> fetch #1 -> loading false -> thread scrolls to latest,
 *                              consuming MessageThreadPane's ONE-SHOT
 *                              scroll-to-latest sentinel
 *   id resolves -> fetch #2 -> loading TRUE again -> the container remounts at
 *                              scrollTop 0, and nothing puts it back
 *
 * This is asserted structurally, on the source, because that is what the bug
 * was: a dependency array. The repo already does this for the sibling scroll
 * behaviour (MessageThreadPane.scroll.test.ts). A behavioural test would need
 * a full realtime + auth harness and would still be pinning this same shape.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/hooks/golf/use-golf-messages.ts'), 'utf-8');

describe('useGolfMessages — one fetch and one subscription per conversation', () => {
  it('keys the fetch+subscribe effect on the conversation alone', () => {
    // The effect that calls fetchMessages() and opens the channel.
    const start = source.indexOf('    fetchMessages();\n\n    // Set up real-time subscription');
    expect(start).toBeGreaterThan(-1);

    // Its dependency array is the first `}, [...]);` after it.
    const depsMatch = source.slice(start).match(/\}, \[([^\]]*)\]\);/);
    expect(depsMatch).not.toBeNull();
    const deps = depsMatch![1]!;

    expect(deps).toContain('conversationId');
    // Both of these re-created themselves when the async user id arrived, and
    // either one re-runs the effect: refetching the thread and resubscribing.
    expect(deps).not.toContain('currentUserId');
    expect(deps).not.toContain('fetchMessages');
  });

  it('reads the user id through a ref inside the realtime handlers', () => {
    const channelStart = source.indexOf('// Set up real-time subscription');
    const channelEnd = source.indexOf('.subscribe();', channelStart);
    expect(channelStart).toBeGreaterThan(-1);
    expect(channelEnd).toBeGreaterThan(channelStart);

    const handlers = source.slice(channelStart, channelEnd);
    // A bare `currentUserId` here is a closure over state, which forces the
    // effect to depend on it again and reinstates the double fetch.
    expect(handlers).not.toMatch(/[^.\w]currentUserId[^R]/);
    expect(handlers).toContain('currentUserIdRef.current');
  });

  it('keeps fetchOtherParticipantReadStatus off the async user id', () => {
    const start = source.indexOf('const fetchOtherParticipantReadStatus = useCallback');
    expect(start).toBeGreaterThan(-1);
    const deps = source.slice(start).match(/\}, \[([^\]]*)\]\);/)![1]!;
    expect(deps).toContain('conversationId');
    expect(deps).not.toContain('currentUserId');
  });
});
