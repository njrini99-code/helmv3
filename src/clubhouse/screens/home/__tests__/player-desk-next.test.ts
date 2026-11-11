import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const css = postcss.parse(readFileSync(join(import.meta.dirname, '../../../styles/home.css'), 'utf8'));
const decls = (selector: string) => {
  const out: Record<string, string> = {};
  css.walkRules((r) => {
    if (r.selector === selector && r.parent?.type === 'root') r.walkDecls((d) => void (out[d.prop] = d.value));
  });
  return out;
};

/**
 * Player Home on the desk: the Up next card is as wide as its column, and its countdown was one well stretched across
 * it (265px for "1 d", 265px for "18 h" at 1440px). The well keeps the width its two figures need and sits beside the
 * words. The phone's card (.ch-hm-next) is not touched.
 */
describe('Player Home desk · Up next and its countdown', () => {
  it('the card is two columns on the desk: the words, and the well at its own width', () => {
    expect(decls('.ch-h-main--desk .ch-ph-next')).toMatchObject({ display: 'grid', 'grid-template-columns': 'minmax(0, 1fr) auto' });
    expect(decls('.ch-h-main--desk .ch-ph-next > *')).toMatchObject({ 'grid-column': '1' });
    // The kicker (type left, day and time right) runs the card's whole width, over both.
    expect(decls('.ch-h-main--desk .ch-ph-next > .ch-ph-next__k')).toMatchObject({ 'grid-column': '1 / -1' });
    expect(decls('.ch-h-main--desk .ch-ph-next > .ch-cd')).toMatchObject({ 'grid-column': '2', 'align-self': 'end', 'inline-size': 'calc(var(--ch-space-12) * 4)' });
  });

  it('the well itself is the one the phone draws: two equal halves', () => {
    expect(decls('.ch-cd')).toMatchObject({ display: 'grid', 'grid-template-columns': 'repeat(2, 1fr)' });
  });
});
