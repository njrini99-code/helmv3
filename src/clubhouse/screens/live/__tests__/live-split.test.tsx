// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/golf/dashboard/live' }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => false }));
// The live feed itself runs, but each render's hold is recorded, so a test can read whether updates are held.
const holds: boolean[] = [];
vi.mock('../../../live/use-live-rounds', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../live/use-live-rounds')>();
  return {
    ...real,
    useLiveRounds: (opts: Parameters<typeof real.useLiveRounds>[0]) => {
      holds.push(Boolean(opts.hold));
      return real.useLiveRounds(opts);
    },
  };
});

import '../../../__tests__/dialog-polyfill';
import { PREVIEW_LIVE, PREVIEW_LIVE_NOW } from '../../../preview/fixtures-live';
import { LiveView } from '../LiveView';
import { SPLIT_MIN_PX, useNarrow } from '../use-live-view';

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/live.css'), 'utf8');

let deskPx = 0;

beforeEach(() => {
  // A wide window: the viewport query alone would keep the panel beside the lanes.
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never;
  // jsdom lays nothing out: the desk reports the width a test gives it, every other element 0.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('ch-lv--desk') ? deskPx : 0;
    },
  });
});
afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  deskPx = 0;
  holds.length = 0;
});

const openFirstLane = (container: HTMLElement) => {
  const hit = container.querySelector<HTMLElement>('.ch-lv-hit');
  expect(hit).not.toBeNull();
  fireEvent.click(hit!);
};

describe('the live desk split', () => {
  it('turns the panel into a sheet on the desk’s own width, not only the viewport’s', () => {
    const { result, rerender } = renderHook(({ w }: { w: number | null }) => useNarrow(w), { initialProps: { w: null as number | null } });
    expect(result.current).toBe(false);
    rerender({ w: SPLIT_MIN_PX - 1 });
    expect(result.current).toBe(true);
    rerender({ w: SPLIT_MIN_PX });
    expect(result.current).toBe(false);
  });

  it('a desk 900 px wide in a wide window draws the sheet, never the side panel', () => {
    deskPx = 900;
    const { container } = render(<LiveView initial={PREVIEW_LIVE} frozen now={PREVIEW_LIVE_NOW} />);
    expect(container.querySelector('.ch-lv-split')?.getAttribute('data-panel')).toBe('sheet');
    expect(container.querySelector('.ch-lv-panel')).toBeNull();
  });

  it('a desk with room for the split keeps the panel beside the lanes', () => {
    deskPx = 1200;
    const { container } = render(<LiveView initial={PREVIEW_LIVE} frozen now={PREVIEW_LIVE_NOW} />);
    expect(container.querySelector('.ch-lv-split')?.getAttribute('data-panel')).toBe('side');
    expect(container.querySelector('.ch-lv-panel')).not.toBeNull();
  });

  it('holds live updates while the sheet a 900 px desk draws is open, as the layout says', () => {
    deskPx = 900;
    const { container } = render(<LiveView initial={PREVIEW_LIVE} frozen now={PREVIEW_LIVE_NOW} />);
    expect(holds.at(-1)).toBe(false);
    openFirstLane(container);
    expect(container.querySelector('.ch-lv-split')?.getAttribute('data-panel')).toBe('sheet');
    expect(holds.at(-1)).toBe(true);
  });

  it('keeps updates flowing when the panel sits beside the lanes', () => {
    deskPx = 1200;
    const { container } = render(<LiveView initial={PREVIEW_LIVE} frozen now={PREVIEW_LIVE_NOW} />);
    openFirstLane(container);
    expect(container.querySelector('.ch-lv-panel')).not.toBeNull();
    expect(holds.at(-1)).toBe(false);
  });

  it('needs the room its own columns take: 560 px of lanes, a 360 px panel and the gap', () => {
    expect(SPLIT_MIN_PX).toBe(560 + 360 + 24);
    expect(css).toMatch(/\.ch-lv-split \{\s*display: grid;\s*grid-template-columns: minmax\(560px, 1fr\) 360px;\s*gap: var\(--ch-space-6\);/);
  });

  it('draws the one-line lane only when its 668 px fit', () => {
    expect(css).toMatch(/@container chlv \(min-width: 668px\)/);
    expect(css).not.toMatch(/@container chlv \(min-width: 640px\)/);
  });
});
