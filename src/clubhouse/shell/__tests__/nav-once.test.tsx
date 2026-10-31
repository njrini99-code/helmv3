import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNavOnce } from '../../lib/nav-once';

/**
 * F-0026 (audit 2026-10-29): a quick double tap pushed the same page twice. A second activation of the link already
 * on its way is dropped (default prevented, which Next's Link honours), until the address changes or a second passes.
 */
afterEach(cleanup);

function Host({ path }: { path: string }) {
  useNavOnce(path, '');
  return (
    <div data-ui="clubhouse">
      <a href="/golf/dashboard/stats">Stats</a>
      <a href="/golf/dashboard/roster">Roster</a>
    </div>
  );
}

function clicks(a: HTMLElement, n: number): number {
  let through = 0;
  const count = (e: Event) => {
    if (!e.defaultPrevented) through++;
    e.preventDefault();
  };
  a.addEventListener('click', count);
  for (let i = 0; i < n; i++) a.click();
  a.removeEventListener('click', count);
  return through;
}

describe('nav-once (F-0026)', () => {
  it('two taps on the same link within the second navigate once', () => {
    const { getByText } = render(<Host path="/golf/dashboard" />);
    expect(clicks(getByText('Stats'), 2)).toBe(1);
  });

  it('another link is not held back, and the same one goes again once the page has changed', () => {
    const { getByText, rerender } = render(<Host path="/golf/dashboard" />);
    expect(clicks(getByText('Stats'), 1)).toBe(1);
    expect(clicks(getByText('Roster'), 1)).toBe(1);
    act(() => rerender(<Host path="/golf/dashboard/roster" />));
    expect(clicks(getByText('Stats'), 1)).toBe(1);
  });
});

describe('usePushOnce (F-0026, a segment’s router.push)', () => {
  it('a second identical push in the same moment is dropped; a different one goes', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { usePushOnce } = await import('../../lib/nav-once');
    const router = { push: vi.fn() };
    const { result } = renderHook(() => usePushOnce(router));
    result.current('/golf/dashboard/stats?window=season');
    result.current('/golf/dashboard/stats?window=season');
    result.current('/golf/dashboard/stats?window=qualifiers');
    expect(router.push.mock.calls.map((c) => c[0])).toEqual(['/golf/dashboard/stats?window=season', '/golf/dashboard/stats?window=qualifiers']);
  });
});
