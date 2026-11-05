import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeepLinkSheet } from '../use-deep-link-sheet';

/**
 * W-CRH-3, classes-roster-home CP-5 and CP-6: a URL opens the sheet at rest; one Back closes it, a second leaves; a reload after a hand close
 * shows the bare screen. Includes the remount the address change can cause, which a single-render test would miss.
 */

const ROUTE = '/golf/dashboard/roster';

beforeEach(() => {
  window.history.replaceState(null, '', ROUTE);
});
afterEach(() => vi.restoreAllMocks());

function arriveAt(search: string) {
  window.history.replaceState(null, '', `${ROUTE}${search}`);
}

describe('useDeepLinkSheet', () => {
  it('stays shut with no param and writes no history', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const { result } = renderHook(() => useDeepLinkSheet('invite'));
    expect(result.current).toMatchObject({ open: false, atRest: false });
    expect(push).not.toHaveBeenCalled();
  });

  it('on arrival, rewrites to the bare address, pushes the param back on top, and opens at rest', () => {
    arriveAt('?invite=1&keep=x');
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    const { result } = renderHook(() => useDeepLinkSheet('invite'));
    expect(replace.mock.calls[0]?.[2]).toBe(`${ROUTE}?keep=x`);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]?.[2]).toBe(`${ROUTE}?invite=1&keep=x`);
    expect((window.history.state as { chDeep?: string }).chDeep).toBe('invite');
    expect(result.current).toMatchObject({ open: true, atRest: true });
  });

  it('a value that does not match does nothing, and the matching value opens', () => {
    arriveAt('?tab=rounds');
    expect(renderHook(() => useDeepLinkSheet('tab', { value: 'requests' })).result.current.open).toBe(false);
    arriveAt('?tab=requests');
    expect(renderHook(() => useDeepLinkSheet('tab', { value: 'requests' })).result.current.open).toBe(true);
  });

  it('enabled false never opens or writes: a player roster ignores the param', () => {
    arriveAt('?invite=1');
    const push = vi.spyOn(window.history, 'pushState');
    const { result } = renderHook(() => useDeepLinkSheet('invite', { enabled: false }));
    expect(result.current.open).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('a remount on the marked entry opens without a second push', () => {
    arriveAt('?invite=1');
    const first = renderHook(() => useDeepLinkSheet('invite'));
    first.unmount();
    const push = vi.spyOn(window.history, 'pushState');
    const second = renderHook(() => useDeepLinkSheet('invite'));
    expect(push).not.toHaveBeenCalled();
    expect(second.result.current).toMatchObject({ open: true, atRest: true });
  });

  it('a rerender neither reopens a closed sheet nor pushes again', () => {
    arriveAt('?invite=1');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { result, rerender } = renderHook(() => useDeepLinkSheet('invite'));
    const push = vi.spyOn(window.history, 'pushState');
    act(() => result.current.close());
    rerender();
    expect(result.current.open).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('Back to the bare address closes the sheet; a popstate that still holds the param leaves it open', () => {
    arriveAt('?invite=1');
    const { result } = renderHook(() => useDeepLinkSheet('invite'));
    act(() => void window.dispatchEvent(new PopStateEvent('popstate')));
    expect(result.current.open).toBe(true);
    act(() => {
      window.history.replaceState(null, '', ROUTE);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current).toMatchObject({ open: false, atRest: false });
  });

  it('a sheet opened by a tap has no entry, so closing it never steps back', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { result } = renderHook(() => useDeepLinkSheet('invite'));
    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
    expect(back).not.toHaveBeenCalled();
  });

  it('another sheet entry on top is not stepped back through', () => {
    window.history.replaceState({ chDeep: 'tab' }, '', ROUTE);
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { result } = renderHook(() => useDeepLinkSheet('invite'));
    act(() => result.current.close());
    expect(back).not.toHaveBeenCalled();
  });
});
