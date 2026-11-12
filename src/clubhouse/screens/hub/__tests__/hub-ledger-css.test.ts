import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(join(process.cwd(), 'src/clubhouse', file), 'utf8');
const css = read('styles/hub.css');
/** The declarations of the first rule whose selector is exactly `selector`. */
const rule = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};

describe('Team Hub, Waiting on: every figure lines up under its heading', () => {
  it('a figure’s note sits before it, so the figure keeps the column’s right edge with or without one', () => {
    const n = rule('.ch-hw-led__n');
    expect(n).toContain('flex-direction: row-reverse');
    expect(n).toContain('justify-content: flex-start');
  });

  it('the ledger’s hairlines are each cell’s own: collapsed, WebKit drew the head’s rule darker under the first column', () => {
    const led = rule('.ch-hw-led');
    expect(led).toContain('border-collapse: separate');
    expect(led).toContain('border-spacing: 0');
  });
});

describe('Team Hub, Tasks and the week on a phone', () => {
  it('the coach’s Tasks list keeps the page’s width with or without a board over it', () => {
    expect(read('screens/hub/TeamHub.tsx')).toContain("'ch-hb-list' + (coach ? ' is-board' : '')");
    expect(rule('.ch-hb-list.is-board')).toContain('max-width: none');
  });

  it('the week’s rows are full tap targets on a phone, after the tile’s own row rules', () => {
    const at = css.lastIndexOf('.ch-hw .ch-hw-agenda a,\n  .ch-hw .ch-hw-later button {');
    expect(at).toBeGreaterThan(css.indexOf('\n.ch-hw-later button {'));
    expect(css.slice(at, css.indexOf('}', at))).toContain('min-height: 44px');
  });
});

describe('Team Hub’s tiles are the white raised card Home uses (owner, 11 Nov)', () => {
  it('a tile takes the one card recipe: the flat card face, the card’s cast and its corner', () => {
    const tile = rule('.ch-hw');
    expect(tile).toContain('background: var(--ch-card-bg)');
    expect(tile).toContain('box-shadow: var(--ch-card-shadow)');
    expect(tile).toContain('border-radius: var(--ch-radius-card)');
    expect(tile).not.toContain('--ch-ledger-rule-strong');
  });

  it('no theme redraws the outline: the recipe’s tokens carry the night card', () => {
    expect(css).not.toMatch(/html\[data-fw-theme='dark'\] \.ch-hw \{/);
  });

  it('the green trip tile keeps the feature recipe over it', () => {
    const feature = rule('.ch-hw--dark');
    expect(feature).toContain('background: var(--ch-feature-bg)');
    expect(feature).toContain('box-shadow: var(--ch-elevation-feature)');
    expect(css.indexOf('\n.ch-hw--dark {')).toBeGreaterThan(css.indexOf('\n.ch-hw {'));
  });
});
