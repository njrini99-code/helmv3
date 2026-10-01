import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markAppRunning, RouteScope, useChSessionState } from '../lib/session-state';

/** PAGE_PERFORMANCE.md rule 1: a list's filter and search come back when the coach returns to the page. */

let setQ: (q: string) => void = () => {};
function Search() {
  const [q, set] = useChSessionState('q', '');
  setQ = set;
  return <p>q={q}</p>;
}
const at = (scope: string) => (
  <RouteScope value={scope}>
    <Search />
  </RouteScope>
);

beforeEach(() => sessionStorage.clear());

describe('useChSessionState', () => {
  it('a hard load (the first, hydrating page) renders the default even with a saved value, as the server did', () => {
    sessionStorage.setItem('ch:screen:/roster\u0000t1\u0000q', JSON.stringify('maya'));
    // Fresh module state: the app is not running yet in a new test file's first render.
    render(at('/roster\u0000t1'));
    expect(screen.getByText('q=')).toBeTruthy();
  });

  it('a return to the page brings the search back; another team or page starts clean', () => {
    markAppRunning();
    const first = render(at('/roster\u0000t1'));
    act(() => setQ('maya'));
    expect(screen.getByText('q=maya')).toBeTruthy();
    first.unmount();

    const back = render(at('/roster\u0000t1'));
    expect(screen.getByText('q=maya')).toBeTruthy();
    back.unmount();

    const otherTeam = render(at('/roster\u0000t2'));
    expect(screen.getByText('q=')).toBeTruthy();
    otherTeam.unmount();

    render(at('/stats\u0000t1'));
    expect(screen.getByText('q=')).toBeTruthy();
  });

  it('going back to the default clears what was saved, and blocked storage still works for the visit', () => {
    markAppRunning();
    const view = render(at('/roster\u0000t1'));
    act(() => setQ('maya'));
    act(() => setQ(''));
    expect(sessionStorage.length).toBe(0);
    view.unmount();

    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    render(at('/roster\u0000t1'));
    act(() => setQ('nora'));
    expect(screen.getByText('q=nora')).toBeTruthy();
    spy.mockRestore();
  });
});
