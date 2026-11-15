import type { UIMessage } from 'ai';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ISLAND_REST_MS, ISLAND_SOLO_MS } from '../model';
import { useIsland } from '../useIsland';

vi.mock('../../../../../lib/haptics', () => ({ haptic: vi.fn() }));

type Part = Record<string, unknown> & { type: string };
const read = (id: string, state?: 'done' | 'failed', extra: Record<string, unknown> = {}): Part => ({ type: 'data-progress', id, data: { label: `Reading ${id}`, tool: 'get_player_metrics', ...(state ? { state } : {}), ...extra } });
const text = (t: string): Part => ({ type: 'text', text: t });
const thread = (...parts: Part[]): UIMessage[] => [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'How is Jonah doing?' }] } as UIMessage, { id: 'a1', role: 'assistant', parts } as unknown as UIMessage];

describe('when the activity island is on screen, and in which size', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  const mount = (messages: UIMessage[], busy = true) => renderHook((p: { messages: UIMessage[]; busy: boolean }) => useIsland(p), { initialProps: { messages, busy } });
  const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

  it('one quick read never raises it; one that is still running after a beat does, as one line', () => {
    const quick = mount(thread(read('r1')));
    expect(quick.result.current.model).toBeNull();
    quick.rerender({ messages: thread(read('r1', 'done')), busy: true });
    wait(ISLAND_SOLO_MS + 50);
    expect(quick.result.current.model).toBeNull();
    cleanup();

    const slow = mount(thread(read('r1')));
    wait(ISLAND_SOLO_MS - 100);
    expect(slow.result.current.model).toBeNull();
    wait(150);
    expect(slow.result.current.model?.head).toBe('Reading r1');
    expect(slow.result.current.open).toBe(false);
  });

  it('two steps raise it at once; three open it while the page is empty, and the first word folds it', () => {
    const h = mount(thread(read('r1'), read('r2')));
    expect(h.result.current.model?.total).toBe(2);
    expect(h.result.current.open).toBe(false);
    h.rerender({ messages: thread(read('r1'), read('r2'), read('r3')), busy: true });
    expect(h.result.current.open).toBe(true);
    h.rerender({ messages: thread(read('r1', 'done'), read('r2', 'done'), read('r3', 'done'), text('Jonah is ')), busy: true });
    expect(h.result.current.open).toBe(false);
    expect(h.result.current.model?.head).toBe('Writing the answer');
  });

  it('the coach’s own choice outranks the island’s: opened by hand it stays open over the answer, folded by hand it stays folded', () => {
    const h = mount(thread(read('r1'), read('r2'), read('r3')));
    expect(h.result.current.open).toBe(true);
    act(() => h.result.current.toggle());
    expect(h.result.current.open).toBe(false);
    h.rerender({ messages: thread(read('r1', 'done'), read('r2'), read('r3')), busy: true });
    expect(h.result.current.open).toBe(false);
    act(() => h.result.current.toggle());
    h.rerender({ messages: thread(read('r1', 'done'), read('r2', 'done'), read('r3', 'done'), text('Jonah is ')), busy: true });
    expect(h.result.current.open).toBe(true);
  });

  it('finished, it rests as a summary and then leaves; the turn’s own line brings its steps back', () => {
    const done = thread(read('r1', 'done'), read('r2', 'done'), text('Jonah is fine.'));
    const h = mount(thread(read('r1'), read('r2')));
    wait(2000);
    h.rerender({ messages: done, busy: false });
    expect(h.result.current.model?.head).toBe('Done · 2 steps · 2s');
    expect(h.result.current.pinned).toBe(false);
    wait(ISLAND_REST_MS + 100);
    expect(h.result.current.model).toBeNull();
    act(() => h.result.current.openFor('a1'));
    expect(h.result.current.model?.total).toBe(2);
    expect([h.result.current.open, h.result.current.pinned]).toEqual([true, true]);
    act(() => h.result.current.openFor('a1'));
    expect(h.result.current.model).toBeNull();
  });

  it('opened by the coach it does not leave under them when the rest ends', () => {
    const h = mount(thread(read('r1'), read('r2')));
    h.rerender({ messages: thread(read('r1', 'done'), read('r2', 'done'), text('Done.')), busy: false });
    act(() => h.result.current.toggle());
    wait(ISLAND_REST_MS + 100);
    expect(h.result.current.open).toBe(true);
    act(() => h.result.current.close());
    expect(h.result.current.model).toBeNull();
  });

  it('a turn that runs again for its card (Confirm) raises it only for new work; a restored thread raises nothing', () => {
    const h = mount(thread(read('r1'), read('r2')));
    const settled = thread(read('r1', 'done'), read('r2', 'done'), text('Here is the draft.'));
    h.rerender({ messages: settled, busy: false });
    wait(ISLAND_REST_MS + 100);
    expect(h.result.current.model).toBeNull();
    h.rerender({ messages: settled, busy: true });
    wait(3000);
    expect(h.result.current.model).toBeNull();
    cleanup();
    expect(mount(thread(read('r1', 'done'), read('r2', 'done'), text('An old answer.')), false).result.current.model).toBeNull();
  });
});
