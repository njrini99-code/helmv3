/**
 * Audit HYD-08: the welcome greeting came off the clock during render, so the
 * server (its own hour and zone) and the hydrating client could print
 * different greetings. The greeting is now client-only: the server markup
 * reserves the line, and hydration fills it in without a mismatch.
 */
import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: () => new Promise(() => {}) }, from: vi.fn() }),
}));
vi.mock('@/hooks/use-sequenced-navigation', () => ({
  useSequencedNavigation: () => ({ cancel: vi.fn() }),
}));

import GolfWelcomePage from '../page';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  vi.useRealTimers();
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('welcome greeting (HYD-08)', () => {
  it('server markup carries no clock-derived greeting', () => {
    const html = renderToString(<GolfWelcomePage />);
    expect(html).toContain('<h1');
    expect(html).not.toMatch(/Good (morning|afternoon|evening)|Welcome back/);
  });

  it('hydrates without a mismatch and then shows the viewer greeting', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 18, 9, 0, 0)); // 9am local
    const html = renderToString(<GolfWelcomePage />);
    container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    const onRecoverableError = vi.fn();
    await act(async () => {
      root = hydrateRoot(container!, <GolfWelcomePage />, { onRecoverableError });
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelector('h1')?.textContent).toContain('Good morning');
  });
});
