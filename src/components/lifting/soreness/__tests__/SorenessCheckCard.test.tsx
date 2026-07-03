// =============================================================================
// SorenessCheckCard — checkinDate (team-local date) regression tests.
//
// Before the fix, handleReadyToGo/handleSubmitMap always computed
// `new Date().toISOString().slice(0, 10)` (the BROWSER'S UTC date) and sent
// it as checkinDate, silently mismatching the coach board/heatmap for any
// player outside UTC. The page already resolves the correct team-local date
// server-side (todayIsoInTz) — this card must use it when the caller
// supplies it via the `checkinDate` prop, and only fall back to the old UTC
// computation when no caller has wired the prop through yet.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('framer-motion', async () => {
  const ReactMod = await import('react');
  return {
    useReducedMotion: () => true,
    motion: new Proxy(
      {},
      {
        get: (_target, prop) =>
          ReactMod.forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => {
            const { children, initial: _i, animate: _a, exit: _e, transition: _t, whileTap: _w, ...rest } = props;
            void _i; void _a; void _e; void _t; void _w;
            return ReactMod.createElement(prop as string, { ...rest, ref }, children as React.ReactNode);
          }),
      },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock('@/lib/lifting/haptics', () => ({
  haptic: vi.fn(),
}));

const submitReadyToGoMock = vi.fn(async (..._args: unknown[]) => ({ success: true, checkinId: 'checkin-1' }));
const submitSorenessMapMock = vi.fn(async (..._args: unknown[]) => ({ success: true, checkinId: 'checkin-2' }));
vi.mock('@/app/lifting/actions/soreness', () => ({
  submitReadyToGo: (...args: unknown[]) => submitReadyToGoMock(...args),
  submitSorenessMap: (...args: unknown[]) => submitSorenessMapMock(...args),
}));

import { SorenessCheckCard } from '../SorenessCheckCard';

const BASE_PROPS = {
  request: null,
  orgId: 'org-1',
  athleteId: 'athlete-1',
};

describe('SorenessCheckCard — checkinDate threading', () => {
  beforeEach(() => {
    submitReadyToGoMock.mockClear();
    submitSorenessMapMock.mockClear();
  });

  it('uses the server-resolved checkinDate prop (team-local date) when provided, NOT the browser UTC date', async () => {
    render(<SorenessCheckCard {...BASE_PROPS} checkinDate="2026-07-04" />);

    fireEvent.click(screen.getByText('Ready to Go'));

    await waitFor(() => expect(submitReadyToGoMock).toHaveBeenCalledTimes(1));
    expect(submitReadyToGoMock).toHaveBeenCalledWith(
      expect.objectContaining({ checkinDate: '2026-07-04' }),
    );
  });

  it('falls back to the browser UTC date only when no checkinDate prop is supplied (back-compat)', async () => {
    render(<SorenessCheckCard {...BASE_PROPS} />);

    fireEvent.click(screen.getByText('Ready to Go'));

    await waitFor(() => expect(submitReadyToGoMock).toHaveBeenCalledTimes(1));
    const expectedUtcToday = new Date().toISOString().slice(0, 10);
    expect(submitReadyToGoMock).toHaveBeenCalledWith(
      expect.objectContaining({ checkinDate: expectedUtcToday }),
    );
  });
});
