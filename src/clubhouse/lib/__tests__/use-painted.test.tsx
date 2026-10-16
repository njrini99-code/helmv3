import { act, render, renderHook } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useArrivalPainted } from '../use-painted';

// The test setup renders every page at rest; this file tests the real hook.
vi.unmock('@/clubhouse/lib/use-painted');

const frames = () => act(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => done())))));

function Below() {
  return <p>{useArrivalPainted() ? 'below' : 'wait'}</p>;
}

describe('useArrivalPainted', () => {
  it('renders everything on the server, and hydrating keeps it (no mismatch, no wait)', async () => {
    const html = renderToString(<Below />);
    expect(html).toContain('below');
    const host = document.createElement('div');
    host.innerHTML = html;
    const errors: unknown[] = [];
    await act(async () => {
      hydrateRoot(host, <Below />, { onRecoverableError: (e) => errors.push(e) });
    });
    expect(errors).toEqual([]);
    expect(host.textContent).toBe('below');
  });

  it('on a page mounted by navigating, is false for its first frame and true once that frame is painted', async () => {
    const { result } = renderHook(() => useArrivalPainted());
    expect(result.current).toBe(false);
    await frames();
    expect(result.current).toBe(true);
  });

  it('a client render shows the lower part after the paint', async () => {
    const { container } = render(<Below />);
    expect(container.textContent).toBe('wait');
    await frames();
    expect(container.textContent).toBe('below');
  });

  // Last: the Back's mark holds for 1.5s.
  it('a page brought back by Back or Forward renders all of it at once, so its scroll has the height to land on', () => {
    window.dispatchEvent(new PopStateEvent('popstate'));
    const { result } = renderHook(() => useArrivalPainted());
    expect(result.current).toBe(true);
  });
});
