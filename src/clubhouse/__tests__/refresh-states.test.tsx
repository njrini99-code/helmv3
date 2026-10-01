import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The shared pieces of the state vocabulary (perf, 2026-10-01, owner rule 2): a retry that says it is working and ignores a second
 * tap, and the last good value kept while a refresh of the same thing fails.
 */

const refreshSpy = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshSpy, push: vi.fn() }) }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));

import { useLastGood } from '../lib/use-last-good';
import { useRefresh } from '../lib/use-refresh';
import { InlineNotice } from '../ui/Notices';
import { RefreshNotice } from '../ui/RefreshNotice';

afterEach(() => refreshSpy.mockReset());

describe('InlineNotice retrying', () => {
  it('says Trying again, disables the control, marks the notice busy, and ignores a tap', async () => {
    const onRetry = vi.fn();
    render(<InlineNotice title="Did not load" onRetry={onRetry} retrying />);
    const btn = screen.getByRole('button', { name: 'Trying again' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByRole('alert').getAttribute('aria-busy')).toBe('true');
    await userEvent.click(btn);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('offers Try again when it is not retrying, and a tap retries once', async () => {
    const onRetry = vi.fn();
    render(<InlineNotice title="Did not load" onRetry={onRetry} />);
    expect(screen.getByRole('alert').getAttribute('aria-busy')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('useRefresh', () => {
  it('re-runs the server render and reports the wait', async () => {
    const { result } = renderHook(() => useRefresh());
    expect(result.current.refreshing).toBe(false);
    await act(async () => result.current.refresh());
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('RefreshNotice retries through it', async () => {
    render(<RefreshNotice code="CH-0" title="Did not load" body="Try again." />);
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });
});

describe('useLastGood', () => {
  type V = { board: string | null };
  const ok = (v: V) => v.board !== null;

  it('returns a good value as it is', () => {
    const v: V = { board: 'a' };
    const { result } = renderHook(() => useLastGood('q1', v, ok));
    expect(result.current).toEqual({ value: v, stale: false });
  });

  it('keeps the last good value of the same key when a refresh fails, and marks it stale', () => {
    const good: V = { board: 'a' };
    const failed: V = { board: null };
    const { result, rerender } = renderHook(({ v }) => useLastGood('q1', v, ok), { initialProps: { v: good } });
    rerender({ v: failed });
    expect(result.current.value).toBe(good);
    expect(result.current.stale).toBe(true);
  });

  it('takes the next good value and clears stale', () => {
    const good: V = { board: 'a' };
    const next: V = { board: 'b' };
    const { result, rerender } = renderHook(({ v }) => useLastGood('q1', v, ok), { initialProps: { v: good } });
    rerender({ v: { board: null } });
    rerender({ v: next });
    expect(result.current).toEqual({ value: next, stale: false });
  });

  it('returns a first load that failed as it came: an error, never an old figure', () => {
    const failed: V = { board: null };
    const { result } = renderHook(() => useLastGood('q1', failed, ok));
    expect(result.current).toEqual({ value: failed, stale: false });
  });

  it('never carries a value to another key (another qualifier, another round)', () => {
    const good: V = { board: 'a' };
    const failed: V = { board: null };
    const { result, rerender } = renderHook(({ k, v }) => useLastGood(k, v, ok), { initialProps: { k: 'q1', v: good } });
    rerender({ k: 'q2', v: failed });
    expect(result.current).toEqual({ value: failed, stale: false });
  });
});
