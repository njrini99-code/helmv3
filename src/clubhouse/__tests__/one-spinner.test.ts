import { describe, expect, it } from 'vitest';
import { hits, walk } from './_scan';

/**
 * CONS-24: one spinner. Every busy ring is ui/Spinner (controls.css). Two named exceptions turn their own: pull-to-refresh,
 * and the CoachHelm mark's wheel (`ch-th-turn`, CoachMark), a brand mark that turns one spoke and holds, not a ring (owner,
 * 2026-10-31, #2410).
 */
describe('one spinner (CONS-24)', () => {
  const css = walk(undefined, /\.css$/);
  it('no stylesheet keeps a turning keyframe of its own', () => {
    expect(hits(/@keyframes\s+(?!ch-spinner-turn|ch-ptr-turn|ch-th-turn\b)[\w-]*(spin|turn|rotate)/i, css)).toEqual([]);
  });
  it('the old local spinners are gone', () => {
    expect(hits(/ch-(th|rt|ox|au)-spin|ch-cl-sync__sp/, walk(undefined, /\.(tsx?|css)$/))).toEqual([]);
  });
});
