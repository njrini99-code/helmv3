import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chNavShown } from '../nav-motion';

/**
 * F-0006 (audit 2026-10-29): a drill-in's held copy of the page it leaves was appended to <body> inside React's commit,
 * so its style and layout landed in the same frame as the new page's first layout. It is appended at the tap, hidden,
 * so that work runs while the page is fetched; the commit only shows it and starts the slide.
 */
const realMatch = window.matchMedia;
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: q.includes('max-width'), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never;
  HTMLElement.prototype.animate = vi.fn(() => ({ finished: new Promise(() => {}), cancel: vi.fn(), currentTime: 0 }) as unknown as Animation) as never;
  document.body.innerHTML = '<div class="ch-root" data-ui="clubhouse"><main id="ch-content"><a href="/golf/dashboard/rounds/r1">Round</a></main></div>';
});
afterEach(() => {
  window.matchMedia = realMatch;
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-ch-nav');
});

describe('the push holds its copy at the tap (F-0006)', () => {
  it('a hidden .ch-frame-under is in the document before the page shows, and shown when it does', () => {
    chNavShown('/golf/dashboard/rounds');
    const link = document.querySelector('a')!;
    link.addEventListener('click', (e) => e.preventDefault());
    link.click();
    expect(document.documentElement.getAttribute('data-ch-nav')).toBe('push');
    const layer = document.body.querySelector<HTMLElement>(':scope > .ch-frame-under');
    expect(layer, 'the copy is in the document at the tap').not.toBeNull();
    expect(layer!.style.visibility).toBe('hidden');
    chNavShown('/golf/dashboard/rounds/r1');
    expect(layer!.isConnected).toBe(true);
    expect(layer!.style.visibility).toBe('');
  });
});
