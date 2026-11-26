import { act, renderHook } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * E1 and E2 (Bridge plan §4.2): every useAction outcome is counted as a signal, a failure is reported to chReport once
 * (a throw used to be reported twice), and its report carries the signal's place so the Bridge stamps that row instead
 * of writing a second one. The error toast it shows is counted, not written as another incident.
 */

// `reportedUnder` records which signal each chReport call was made under (reportingSignal's scope).
const signals = vi.hoisted(() => {
  const s = {
    active: null as unknown,
    reportedUnder: [] as unknown[],
    chSignal: vi.fn((input: { kind: string }) => ({ sessionId: 'sess_12345678', seq: 7, page: 'P007', ...input })),
    reportingSignal: vi.fn((ref: unknown, report: () => void) => {
      s.active = ref;
      try {
        report();
      } finally {
        s.active = null;
      }
    }),
  };
  return s;
});
vi.mock('../signal', () => signals);
vi.mock('../haptics', () => ({ haptic: vi.fn() }));
vi.mock('../track', () => ({ chReport: vi.fn(() => signals.reportedUnder.push(signals.active)), chTrail: vi.fn(), chTagSession: vi.fn() }));

import { chReport } from '../track';
import { serverCodeIn, useAction, type ActionCopy } from '../use-action';
import { ToastProvider } from '../../ui/Toast';

const wrapper = ({ children }: { children: ReactNode }) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>{children}</ToastProvider>
  </LazyMotion>
);

const COPY: ActionCopy = { done: 'Sent', failed: 'Couldn’t send the message', code: 'CH-7004' };

function hook(action: () => Promise<{ success: boolean; error?: string }>, copy: ActionCopy = COPY) {
  return renderHook(() => useAction('messages.send', action, copy), { wrapper });
}

const calls = () => signals.chSignal.mock.calls.map(([s]) => s as Record<string, unknown>);

describe('useAction signals', () => {
  beforeEach(() => {
    signals.chSignal.mockClear();
    signals.reportedUnder = [];
    vi.mocked(chReport).mockClear();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('counts a start and a success with its duration, and reports nothing', async () => {
    const { result } = hook(async () => ({ success: true }));
    await act(() => result.current.run());
    expect(calls().filter((s) => s.kind === 'action')).toEqual([
      { kind: 'action', outcome: 'start', act: 'messages.send' },
      expect.objectContaining({ kind: 'action', outcome: 'success', code: 'CH-1702', act: 'messages.send', durationMs: expect.any(Number) }),
    ]);
    expect(chReport).not.toHaveBeenCalled();
  });

  it('reports a throw once, at medium, carrying the failure signal it was counted under', async () => {
    const { result } = hook(async () => {
      throw new Error('PGRST116: no rows');
    });
    await act(() => result.current.run());
    const failure = calls().find((s) => s.outcome === 'failure');
    expect(failure).toMatchObject({ kind: 'action', code: 'CH-7004', act: 'messages.send', message: 'PGRST116: no rows', serverCode: 'PGRST116', reported: true });
    // The call is the one it always was; the signal's place rides along through reportingSignal.
    expect(chReport).toHaveBeenCalledExactlyOnceWith(expect.any(Error), { surface: 'messages', action: 'messages.send' });
    expect(signals.reportedUnder).toEqual([expect.objectContaining({ sessionId: 'sess_12345678', seq: 7, outcome: 'failure' })]);
    // The error toast is counted, not a second incident.
    expect(calls().find((s) => s.kind === 'toast')).toMatchObject({ code: 'CH-7004', outcome: undefined });
  });

  it('reports a handled failure at low severity, and falls back to CH-1703 with no code of its own', async () => {
    const { result } = hook(async () => ({ success: false, error: 'Message too long' }), { done: 'Sent', failed: 'Couldn’t send' });
    await act(() => result.current.run());
    expect(calls().find((s) => s.outcome === 'failure')).toMatchObject({ code: 'CH-1703', message: 'Message too long', reported: true });
    expect(chReport).toHaveBeenCalledExactlyOnceWith(expect.any(Error), { surface: 'messages', action: 'messages.send', severity: 'low' });
    expect(signals.reportedUnder).toEqual([expect.objectContaining({ outcome: 'failure', code: 'CH-1703' })]);
  });

  it('counts a quiet failure without reporting it, so the Bridge keeps the only record', async () => {
    const { result } = hook(async () => ({ success: false, error: 'conflict' }), { ...COPY, quiet: true });
    await act(() => result.current.run());
    expect(calls().find((s) => s.outcome === 'failure')).toMatchObject({ code: 'CH-7004', reported: false });
    expect(chReport).not.toHaveBeenCalled();
  });

  it('counts an offline tap as offline, with no start and no incident', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { result } = hook(async () => ({ success: true }));
    await act(() => result.current.run());
    expect(calls().filter((s) => s.kind === 'action')).toEqual([{ kind: 'action', outcome: 'offline', code: 'CH-1903', act: 'messages.send' }]);
    expect(calls().find((s) => s.kind === 'toast')).toMatchObject({ code: 'CH-1903', outcome: undefined });
  });

  it('finds a server code only where the message names one', () => {
    expect(serverCodeIn('PGRST202 Could not find the function')).toBe('PGRST202');
    expect(serverCodeIn('violates row-level security (code 42501)')).toBe('42501');
    expect(serverCodeIn('Round 20261 failed')).toBeUndefined();
    expect(serverCodeIn(undefined)).toBeUndefined();
  });
});
