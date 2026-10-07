/**
 * Audit DATA-04: the round detail page must never generate the AI recap during
 * render. It reads the persisted recap and, only when a completed round has
 * none, the client asks for it once after mount.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateRoundRecap = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/round-recap', () => ({ generateRoundRecap }));

import { useDeferredRoundRecap } from '../use-deferred-round-recap';

beforeEach(() => {
  generateRoundRecap.mockReset().mockResolvedValue({ recap: 'Fresh recap.', cached: false });
});

describe('useDeferredRoundRecap', () => {
  it('does not ask for a recap when one is already persisted', () => {
    const { result } = renderHook(() => useDeferredRoundRecap('r1', 'Stored recap.', false));
    expect(result.current).toEqual({ recap: 'Stored recap.', generating: false });
    expect(generateRoundRecap).not.toHaveBeenCalled();
  });

  it('does not ask when the round is not pending (e.g. not completed)', () => {
    renderHook(() => useDeferredRoundRecap('r1', null, false));
    expect(generateRoundRecap).not.toHaveBeenCalled();
  });

  it('asks once after mount for a pending round and shows the result', async () => {
    const { result } = renderHook(() => useDeferredRoundRecap('r1', null, true));
    expect(result.current.generating).toBe(true);
    await waitFor(() => expect(result.current).toEqual({ recap: 'Fresh recap.', generating: false }));
    expect(generateRoundRecap).toHaveBeenCalledTimes(1);
    expect(generateRoundRecap).toHaveBeenCalledWith('r1');
  });

  it('asks only once under StrictMode double effects and across re-renders', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useDeferredRoundRecap(id, null, true),
      { wrapper, initialProps: { id: 'r1' } },
    );
    rerender({ id: 'r1' });
    await waitFor(() => expect(result.current.recap).toBe('Fresh recap.'));
    rerender({ id: 'r1' });
    expect(generateRoundRecap).toHaveBeenCalledTimes(1);
  });

  it('clears the pending state quietly when generation fails', async () => {
    generateRoundRecap.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useDeferredRoundRecap('r1', null, true));
    await waitFor(() => expect(result.current.generating).toBe(false));
    expect(result.current.recap).toBeNull();
  });
});
