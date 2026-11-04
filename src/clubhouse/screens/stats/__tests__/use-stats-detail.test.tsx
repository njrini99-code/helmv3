// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStatsDetail, type StatsArrivalState } from '../use-stats-detail';

const at = (url: string, state: unknown = null) => window.history.replaceState(state, '', url);

/** jsdom runs `history.back()` as a task: wait for the popstate it fires. */
const popped = () => new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));

const hook = (props: { tab?: string; state?: StatsArrivalState; screen?: 'player' | 'team' } = {}) => renderHook(() => useStatsDetail({ screen: props.screen ?? 'player', tab: props.tab, state: props.state }));

beforeEach(() => {
  window.sessionStorage.clear();
  at('/golf/dashboard/stats');
});
afterEach(cleanup);

describe('useStatsDetail', () => {
  it('open pushes one { chPhone: 1 } entry with the hash', () => {
    const { result } = hook();
    const before = window.history.length;
    act(() => result.current.open('sg'));
    expect(result.current.detail).toBe('sg');
    expect(window.location.hash).toBe('#sd-sg');
    expect(window.history.state).toMatchObject({ chPhone: 1 });
    expect(window.history.length).toBe(before + 1);
  });

  it('a double open gives one detail and one entry (07 interrupt 13)', () => {
    const { result } = hook();
    const before = window.history.length;
    act(() => result.current.open('sg'));
    act(() => result.current.open('rounds'));
    expect(result.current.detail).toBe('sg');
    expect(window.history.length).toBe(before + 1);
  });

  it('Back closes it', async () => {
    const { result } = hook();
    act(() => result.current.open('tee'));
    const pop = popped();
    act(() => result.current.close());
    await act(async () => pop);
    expect(result.current.detail).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it("SectionStrip's go(-1) closes it", async () => {
    const { result } = hook();
    act(() => result.current.open('tee'));
    const pop = popped();
    act(() => window.history.go(-1));
    await act(async () => pop);
    expect(result.current.detail).toBeNull();
  });

  it('arrival replaces then pushes, so one Back reaches the summary', async () => {
    at('/golf/dashboard/stats?player=p1&tab=rounds');
    const before = window.history.length;
    const { result } = hook({ tab: 'rounds' });
    expect(result.current.detail).toBe('rounds');
    expect(window.location.hash).toBe('#sd-rounds');
    expect(window.history.length).toBe(before + 1);
    const pop = popped();
    act(() => result.current.close());
    await act(async () => pop);
    expect(result.current.detail).toBeNull();
    expect(window.location.search).toBe('?player=p1');
  });

  it('a Back onto a { chPhone: 1 } entry opens the detail with no new entry (S-STATS.return)', () => {
    at('/golf/dashboard/stats#sd-rounds', { chPhone: 1 });
    const before = window.history.length;
    const { result } = hook();
    expect(result.current.detail).toBe('rounds');
    expect(window.history.length).toBe(before);
  });

  it('restores the saved scroll only on that arrival', () => {
    const fresh = hook();
    expect(fresh.result.current.restoreTo).toBeNull();
    fresh.unmount();
    at('/golf/dashboard/stats#sd-rounds', { chPhone: 1 });
    window.sessionStorage.setItem('ch-stats-scroll:/golf/dashboard/stats', JSON.stringify({ summary: 300, detail: 600 }));
    const back = hook();
    expect(back.result.current.restoreTo).toEqual({ summary: 300, detail: 600 });
  });

  it('Open a part replaces the Strokes gained page, so one Back reaches the summary', async () => {
    const { result } = hook();
    act(() => result.current.open('sg'));
    const before = window.history.length;
    act(() => result.current.replace('putting'));
    expect(result.current.detail).toBe('putting');
    expect(window.location.hash).toBe('#gm-putting');
    expect(window.history.length).toBe(before);
    const pop = popped();
    act(() => result.current.close());
    await act(async () => pop);
    expect(result.current.detail).toBeNull();
  });

  it('a hash from the other screen lands on the summary with the hash replaced (CP-134)', () => {
    at('/golf/dashboard/stats#sd-team-game');
    const { result } = hook();
    expect(result.current.detail).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('holds a target through a failed load, then opens it when Try again lands (CP-129)', () => {
    at('/golf/dashboard/stats#sd-sg');
    let state: StatsArrivalState = 'failed';
    const { result, rerender } = renderHook(() => useStatsDetail({ screen: 'player', state }));
    expect(result.current.detail).toBeNull();
    expect(window.location.hash).toBe('#sd-sg');
    state = 'ready';
    rerender();
    expect(result.current.detail).toBe('sg');
  });

  it('an empty load replaces the hash and lands on the summary, except Goals', () => {
    at('/golf/dashboard/stats#gm-tee');
    const empty = hook({ state: 'empty' });
    expect(empty.result.current.detail).toBeNull();
    expect(window.location.hash).toBe('');
    empty.unmount();
    at('/golf/dashboard/stats?tab=dev');
    const goals = hook({ tab: 'dev', state: 'empty' });
    expect(goals.result.current.detail).toBe('goals');
  });
});
