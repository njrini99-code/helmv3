import { act, render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
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

  it('a part of a hard load that hydrates after the app is running draws the default while hydrating, then the kept value (Qualifiers review S1)', async () => {
    const key = 'ch:screen:/qualifiers\u0000t1\u0000q';
    // The server made the markup from the default; the app is running by the time this part hydrates.
    const html = renderToString(at('/qualifiers\u0000t1'));
    markAppRunning();
    sessionStorage.setItem(key, JSON.stringify('maya'));
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      errors.push(a.map(String).join(' '));
    });
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(host, at('/qualifiers\u0000t1'), { onRecoverableError: (e) => errors.push(String((e as Error)?.message ?? e)) });
    });
    spy.mockRestore();
    expect(errors.filter((e) => /hydrat|did not match|didn't match/i.test(e))).toEqual([]);
    expect(host.textContent).toBe('q=maya');
    act(() => root?.unmount());
    host.remove();
  });
});
