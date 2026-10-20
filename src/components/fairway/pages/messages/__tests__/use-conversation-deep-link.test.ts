// @vitest-environment jsdom
/**
 * A `?conversation=` link opens its thread every time, not only the first
 * time Messages mounts. The old boolean latch ignored a second notification
 * tap while Messages was open, leaving the previous thread on screen.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useConversationDeepLink, useOncePerLink } from '../use-conversation-deep-link';

const conversations = [{ id: 'conv-a' }, { id: 'conv-b' }];

function setup(initial: { conversationId: string | null; loading?: boolean }) {
  const onOpen = vi.fn();
  const onHandled = vi.fn();
  const hook = renderHook(
    ({ conversationId, loading }: { conversationId: string | null; loading: boolean }) =>
      useConversationDeepLink({ conversationId, conversations, loading, onOpen, onHandled }),
    { initialProps: { conversationId: initial.conversationId, loading: initial.loading ?? false } },
  );
  return { ...hook, onOpen, onHandled };
}

describe('useConversationDeepLink', () => {
  it('opens the linked thread once and consumes the link', () => {
    const { onOpen, onHandled, rerender } = setup({ conversationId: 'conv-a' });
    expect(onOpen).toHaveBeenCalledWith('conv-a');
    expect(onHandled).toHaveBeenCalledTimes(1);

    // A re-render before the stripped URL lands must not re-apply it.
    rerender({ conversationId: 'conv-a', loading: false });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('switches to a second linked thread while mounted', () => {
    const { onOpen, rerender } = setup({ conversationId: 'conv-a' });
    rerender({ conversationId: null, loading: false }); // the param is stripped
    rerender({ conversationId: 'conv-b', loading: false }); // a second notification tap
    expect(onOpen).toHaveBeenLastCalledWith('conv-b');
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('switches even when the URL goes straight from one link to the next', () => {
    const { onOpen, rerender } = setup({ conversationId: 'conv-a' });
    rerender({ conversationId: 'conv-b', loading: false });
    expect(onOpen).toHaveBeenLastCalledWith('conv-b');
  });

  it('applies the same thread again after the link was consumed', () => {
    const { onOpen, rerender } = setup({ conversationId: 'conv-a' });
    rerender({ conversationId: null, loading: false });
    rerender({ conversationId: 'conv-a', loading: false });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('waits for the conversation list, then applies the link', () => {
    const { onOpen, onHandled, rerender } = setup({ conversationId: 'conv-a', loading: true });
    expect(onOpen).not.toHaveBeenCalled();
    expect(onHandled).not.toHaveBeenCalled();
    rerender({ conversationId: 'conv-a', loading: false });
    expect(onOpen).toHaveBeenCalledWith('conv-a');
  });

  it('consumes a link to a thread the viewer is not in without opening anything', () => {
    const { onOpen, onHandled } = setup({ conversationId: 'conv-x' });
    expect(onOpen).not.toHaveBeenCalled();
    expect(onHandled).toHaveBeenCalledTimes(1);
  });
});

/**
 * `?player=<id>` (find-or-create a DM) had the same boolean latch, so a second
 * player link while Messages was open did nothing; its handler is async, so it
 * must also not start twice while it awaits a re-render.
 */
describe('useOncePerLink (?player=)', () => {
  function setupLink(initial: { value: string | null; ready?: boolean }) {
    const run = vi.fn(async (_value: string) => {});
    const hook = renderHook(
      ({ value, ready }: { value: string | null; ready: boolean }) => useOncePerLink(value, ready, run),
      { initialProps: { value: initial.value, ready: initial.ready ?? true } },
    );
    return { ...hook, run };
  }

  it('runs a second player link while mounted', () => {
    const { run, rerender } = setupLink({ value: 'player-1' });
    rerender({ value: null, ready: true });
    rerender({ value: 'player-2', ready: true });
    expect(run.mock.calls.map((c) => c[0])).toEqual(['player-1', 'player-2']);
  });

  it('does not start the handler twice while the link is still in the URL', () => {
    const { run, rerender } = setupLink({ value: 'player-1' });
    // A refetch re-renders before router.replace strips the param.
    rerender({ value: 'player-1', ready: true });
    rerender({ value: 'player-1', ready: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('waits until ready, then runs once', () => {
    const { run, rerender } = setupLink({ value: 'player-1', ready: false });
    expect(run).not.toHaveBeenCalled();
    rerender({ value: 'player-1', ready: true });
    expect(run).toHaveBeenCalledWith('player-1');
  });

  it('runs the same player again after the link was consumed', () => {
    const { run, rerender } = setupLink({ value: 'player-1' });
    rerender({ value: null, ready: true });
    rerender({ value: 'player-1', ready: true });
    expect(run).toHaveBeenCalledTimes(2);
  });
});
