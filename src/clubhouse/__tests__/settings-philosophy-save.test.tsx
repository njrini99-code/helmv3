import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/** CoachHelm Settings autosave (usePhilosophy): what a failed save puts back. */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn() }));
vi.mock('../ui/Toast', () => ({ useToast: () => vi.fn(), useDelayedToast: () => () => () => {} }));

import { usePhilosophy } from '../screens/settings/CoachHelm';
import type { ChSettingsWrites } from '../screens/settings/model';

type Phil = Parameters<typeof usePhilosophy>[0];

describe('usePhilosophy', () => {
  it('two quick priority moves where the first fails and the second lands: the screen keeps the second, as the server does', async () => {
    let fail: () => void = () => {};
    const savePhilosophy = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (fail = () => r({ success: false, error: 'Load failed' }))))
      .mockImplementationOnce(() => Promise.resolve({ success: true, data: { id: 'ph1' } }));
    const initial = { id: 'ph1', priority_a: 1, priority_b: 2 } as unknown as Phil;
    const { result } = renderHook(() => usePhilosophy(initial, { savePhilosophy } as unknown as ChSettingsWrites));
    // Move one: b above a. Move two, while the first is still out: back again plus more, the whole order each time.
    act(() => result.current.change({ priority_a: 2, priority_b: 1 } as never));
    act(() => result.current.change({ priority_a: 1, priority_b: 3 } as never));
    // The first save is out; it fails.
    await waitFor(() => expect(savePhilosophy).toHaveBeenCalledTimes(1));
    await act(async () => {
      fail();
      await new Promise((r) => setTimeout(r, 0));
    });
    // Saves go in order: the second is sent once the first has answered.
    await waitFor(() => expect(savePhilosophy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe('saved'));
    const p = result.current.p as unknown as Record<string, number>;
    expect([p.priority_a, p.priority_b]).toEqual([1, 3]);
  });

  it('a failed save with nothing changed since still puts the field back', async () => {
    const savePhilosophy = vi.fn(() => Promise.resolve({ success: false, error: 'Load failed' }));
    const initial = { id: 'ph1', priority_a: 1 } as unknown as Phil;
    const { result } = renderHook(() => usePhilosophy(initial, { savePhilosophy } as unknown as ChSettingsWrites));
    act(() => result.current.change({ priority_a: 4 } as never));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect((result.current.p as unknown as Record<string, number>).priority_a).toBe(1);
  });
});
