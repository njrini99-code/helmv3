import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// G3/G13 (preview grade): on a phone the Drills area chips were cut at the screen's edge ("Approac…") nearly at full ink.
// The row bleeds to the edges, and the 28px fade fell mostly on its 16-20px side padding; it now runs over both.
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/practice.css'), 'utf8');
const fades = [...css.matchAll(/\.ch-hscroll\.ch-prc-areas \{\s*--ch-hs-fade: ([^;]+);/g)].map((m) => m[1]);

describe('G13 the Drills areas fade past their padding', () => {
  it('sets a fade of edge fade plus padding, at 390 and at 414+', () => {
    expect(fades).toEqual(['44px', '48px']);
  });

  it('uses plain lengths, which useKeepInView can read with parseFloat', () => {
    for (const f of fades) expect(Number.isFinite(parseFloat(f!))).toBe(true);
  });
});
