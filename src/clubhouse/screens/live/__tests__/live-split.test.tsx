// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reportDeskWidth, SPLIT_MIN_PX, useNarrow } from '../use-live-view';

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/live.css'), 'utf8');

beforeEach(() => {
  // A wide window: the viewport query alone would keep the panel beside the lanes.
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never;
});
afterEach(() => reportDeskWidth(null));

describe('the live desk split', () => {
  it('turns the panel into a sheet on the desk’s own width, not only the viewport’s', () => {
    const { result } = renderHook(() => useNarrow());
    expect(result.current).toBe(false);
    act(() => reportDeskWidth(SPLIT_MIN_PX - 1));
    expect(result.current).toBe(true);
    act(() => reportDeskWidth(SPLIT_MIN_PX));
    expect(result.current).toBe(false);
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
