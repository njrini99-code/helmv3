import { fireEvent, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** E6-E8 (Bridge plan §4.2): the shell configures the queue, counts views and the team switch, numbered taps and rage clicks. */

const signals = vi.hoisted(() => ({ chSignal: vi.fn((_input: unknown) => null), configureSignals: vi.fn(), flushSignals: vi.fn() }));
vi.mock('../../lib/signal', () => signals);
vi.mock('next/web-vitals', () => ({ useReportWebVitals: vi.fn() }));

import { useReportWebVitals } from 'next/web-vitals';
import { RAGE_CLICKS, useChSignals } from '../use-signals';

const TEAM_A = '66666666-7777-4888-9999-000000000000';
const TEAM_B = '66666666-7777-4888-9999-000000000001';
const kinds = () => signals.chSignal.mock.calls.map(([s]) => s as unknown as Record<string, unknown>);

describe('useChSignals', () => {
  beforeEach(() => {
    signals.chSignal.mockClear();
    signals.configureSignals.mockClear();
  });
  afterEach(() => document.body.replaceChildren());

  it('tells the queue it is off, and counts nothing', () => {
    renderHook(() => useChSignals({ enabled: false, role: 'coach', teamId: TEAM_A, pathname: '/golf/dashboard/messages', search: '' }));
    expect(signals.configureSignals).toHaveBeenCalledWith({ enabled: false, role: 'coach', teamId: TEAM_A, page: 'P007' });
    expect(signals.chSignal).not.toHaveBeenCalled();
  });

  it('counts a view on each address, and a team switch as its own', () => {
    const { rerender } = renderHook((p: { pathname: string; teamId: string }) => useChSignals({ enabled: true, role: 'coach', search: '', ...p }), {
      initialProps: { pathname: '/golf/dashboard/messages', teamId: TEAM_A },
    });
    rerender({ pathname: '/golf/dashboard/roster', teamId: TEAM_A });
    rerender({ pathname: '/golf/dashboard/roster', teamId: TEAM_B });
    expect(kinds()).toEqual([{ kind: 'view' }, { kind: 'view' }, { kind: 'view', code: '10103' }]);
    expect(signals.configureSignals).toHaveBeenLastCalledWith({ enabled: true, role: 'coach', teamId: TEAM_B, page: 'P003' });
  });

  it('reports the three vitals CH-1954 names, CLS in thousandths', () => {
    renderHook(() => useChSignals({ enabled: true, role: 'coach', teamId: null, pathname: '/golf/dashboard', search: '' }));
    const report = vi.mocked(useReportWebVitals).mock.calls.at(-1)![0] as (m: { name: string; value: number }) => void;
    signals.chSignal.mockClear();
    report({ name: 'CLS', value: 0.12 });
    report({ name: 'INP', value: 240 });
    report({ name: 'FCP', value: 900 });
    expect(kinds()).toEqual([
      { kind: 'vital', code: 'CH-1954', act: 'CLS', durationMs: 120 },
      { kind: 'vital', code: 'CH-1954', act: 'INP', durationMs: 240 },
    ]);
  });

  it('counts a tap on a numbered control, and three clicks on a dead one as a rage click', () => {
    render(
      <div data-ui="clubhouse">
        <button type="button" data-ctl="CTL-P007-004">
          Send
        </button>
        <span data-ctl="CTL-P007-009">Looks like a button</span>
      </div>,
    );
    renderHook(() => useChSignals({ enabled: true, role: 'coach', teamId: null, pathname: '/golf/dashboard/messages', search: '' }));
    signals.chSignal.mockClear();
    const send = document.querySelector('button')!;
    for (let i = 0; i < RAGE_CLICKS; i++) fireEvent.click(send);
    expect(kinds()).toEqual(Array(RAGE_CLICKS).fill({ kind: 'tap', control: 'CTL-P007-004' }));
    signals.chSignal.mockClear();
    const dead = document.querySelector('span')!;
    for (let i = 0; i < RAGE_CLICKS; i++) fireEvent.click(dead);
    expect(kinds().filter((s) => s.kind === 'frustration')).toEqual([{ kind: 'frustration', code: 'CH-1951', control: 'CTL-P007-009' }]);
  });

  it('ignores clicks outside Clubhouse', () => {
    render(<span>outside</span>);
    renderHook(() => useChSignals({ enabled: true, role: 'coach', teamId: null, pathname: '/golf/dashboard', search: '' }));
    signals.chSignal.mockClear();
    for (let i = 0; i < RAGE_CLICKS; i++) fireEvent.click(document.querySelector('span')!);
    expect(signals.chSignal).not.toHaveBeenCalled();
  });
});
