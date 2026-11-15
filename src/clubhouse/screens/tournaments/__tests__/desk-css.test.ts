import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/tournaments-desk.css'), 'utf8');
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

describe('event desk hole grid columns', () => {
  it('keeps a nine out of the grid: its holes are the row’s columns, and the row’s cell rule cannot outrank that', () => {
    // `.ch-tour-desk-hg__row > span` (a class and an element) makes every direct span a 32px cell. A nine named by its
    // class alone lost to it, became one cell and stacked its nine holes on top of each other.
    expect(rule('.ch-tour-desk-hg__row > .ch-tour-desk-hg__nine')).toMatch(/display:\s*contents/);
    expect(css).not.toMatch(/^\.ch-tour-desk-hg__nine \{/m);
  });
});

describe('event desk tabs on a phone', () => {
  it('a tab’s body stands 12 under its heading’s rule, and nothing leaves a band of page across the card', () => {
    // The section is the card on a phone and its blocks draw the card's colour: a margin between two blocks is outside
    // both, so the page showed through. Room is padding.
    const tools = rule('.ch-tour-desk.is-phone .ch-sec__head ~ .ch-tour-desk-tools');
    expect(tools).toMatch(/margin-bottom:\s*0/);
    expect(tools).toMatch(/padding-block:\s*12px/);
    expect(rule('.ch-tour-desk.is-phone .ch-sec__head ~ .ch-tour-desk-hg')).toMatch(/padding-top:\s*12px/);
    expect(rule('.ch-tour-desk.is-phone .ch-sec__head ~ .ch-tour-desk-line')).toMatch(/padding-block:\s*12px/);
  });
});

describe('event desk round pills on a phone', () => {
  it('a short pill ("R1", 38px) reaches 44 across through a layer in the gap, drawn no wider (F-0021)', () => {
    expect(rule('.ch-tour-desk.is-phone .ch-tour-desk-pill')).toMatch(/position:\s*relative/);
    const reach = rule('.ch-tour-desk.is-phone .ch-tour-desk-pill::after');
    expect(reach).toMatch(/inset:\s*0 min\(0px, calc\(50% - 22px\)\)/);
    expect(reach).toMatch(/content:\s*''/);
  });
});

describe('event desk hole grid type on a phone', () => {
  it('the Team vs par averages are the 12 role, never under the phone’s floor (F-0024)', () => {
    const heat = rule('.ch-tour-desk-hg.is-phone .ch-tour-desk-heat');
    expect(heat).toMatch(/font:\s*var\(--ch-type-12-strong\)/);
    expect(heat).toMatch(/letter-spacing:\s*var\(--ch-track-12\)/);
  });
});

describe('event desk notes', () => {
  it('keep their 8 over them: the rule names two classes, so the root’s paragraph reset cannot zero it', () => {
    expect(rule('.ch-tour-desk .ch-tour-desk-note')).toMatch(/margin:\s*8px 0 0/);
    expect(css).not.toMatch(/^\.ch-tour-desk-note \{/m);
  });
});

describe('event desk hole grid colours', () => {
  it('draws the Team vs par row under par in the score-under red (D-42), never the chart gain green', () => {
    const under = rule('.ch-tour-desk-heat.is-under');
    expect(under).toMatch(/background:\s*var\(--ch-score-under-bg\)/);
    expect(under).toMatch(/color:\s*var\(--ch-score-under\)/);
    expect(under).not.toMatch(/--ch-chart-gain/);
  });
});
