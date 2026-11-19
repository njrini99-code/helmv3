// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const toast = vi.fn();
vi.mock('../../../../ui/Toast', () => ({ useToast: () => toast }));
vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));

import { useRoundPorts } from '../ports';

const CONFLICT = 'This round was updated on another device. Please reload.';

/**
 * L-036 (owner-approved, 18 Nov 2026): the round-changed message showed twice, as the amber Reload banner and as the
 * CH-11902 toast. The toast stays the signal until the banner is up, then it closes and is not raised again.
 */
describe('round conflict: banner or toast, never both', () => {
  it('raises the CH-11902 toast while no banner is up', () => {
    toast.mockClear();
    const { result } = renderHook(() => useRoundPorts());
    result.current.ports.showToast(CONFLICT, 'error');
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0]?.[0]).toMatchObject({ code: 'CH-11902' });
  });

  it('closes the toast when the banner comes up, and raises none while it is up', () => {
    toast.mockClear();
    const { result } = renderHook(() => useRoundPorts());
    result.current.ports.showToast(CONFLICT, 'error');
    const signal = (toast.mock.calls[0]?.[0] as { signal: AbortSignal }).signal;
    expect(signal.aborted).toBe(false);
    result.current.conflictBanner(true);
    expect(signal.aborted).toBe(true);
    result.current.ports.showToast(CONFLICT, 'error');
    expect(toast).toHaveBeenCalledTimes(1);
    result.current.conflictBanner(false);
    result.current.ports.showToast(CONFLICT, 'error');
    expect(toast).toHaveBeenCalledTimes(2);
  });
});
