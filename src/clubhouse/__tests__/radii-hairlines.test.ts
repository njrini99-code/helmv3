import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, walk } from './_scan';

/**
 * B3: corners and separators. A bottom sheet's top corners are the sheet radius (X-3: 20), a Surface card's corner is
 * the card radius (X-4: 16) on its own elevation, and no stylesheet writes a radius in pixels that a token already
 * names. The sheets are listed by hand: a selector pattern would also catch panels and page cards that are not sheets.
 */
const SHEETS: Array<[file: string, selector: string]> = [
  ['controls.css', '.ch-modal__panel'],
  ['auth.css', '.ch-au-panel'],
  ['controls.css', '.ch-fsheet'],
  ['rounds-track.css', '.ch-rtcv__sheet'],
  ['shell.css', '.ch-more'],
  ['shell.css', '.ch-asks__panel'],
];
const TOKEN_PX = new Set([5, 7, 10, 14, 16, 20]);

const css = (name: string) => readFileSync(join(ROOT, 'styles', name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** Every `border-*-radius` value in rules whose selector list holds exactly `selector`. */
function radii(name: string, selector: string): string[] {
  const out: string[] = [];
  for (const m of css(name).matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (!m[1]!.split(',').some((s) => s.trim() === selector)) continue;
    for (const d of m[2]!.matchAll(/border(?:-[a-z]+)*-radius:\s*([^;]+);/g)) out.push(d[1]!.trim());
  }
  return out;
}

describe('radii and hairlines (B3)', () => {
  it.each(SHEETS)('%s %s: a sheet top is the sheet radius', (file, selector) => {
    const tops = radii(file, selector).filter((v) => /\s0\s+0$/.test(v));
    expect(tops.length).toBeGreaterThan(0);
    expect(tops.filter((v) => v !== 'var(--ch-radius-sheet) var(--ch-radius-sheet) 0 0')).toEqual([]);
  });

  it('.ch-surface is the card radius on its own elevation', () => {
    const ui = css('ui.css');
    const rule = ui.slice(ui.indexOf('.ch-surface {'), ui.indexOf('}', ui.indexOf('.ch-surface {')));
    expect(rule).toMatch(/border-radius: var\(--ch-radius-card\);/);
    expect(rule).toMatch(/box-shadow: var\(--ch-elevation-card\);/);
  });

  it('no stylesheet writes a radius in pixels a token names', () => {
    const raw: string[] = [];
    for (const file of walk(join(ROOT, 'styles'), /\.css$/)) {
      if (file.endsWith('tokens.css')) continue;
      for (const d of css(basename(file)).matchAll(/border(?:-[a-z]+)*-radius:\s*([^;]+);/g)) {
        for (const [, px] of d[1]!.matchAll(/(?<![\d.-])(\d+)px\b/g)) if (TOKEN_PX.has(Number(px))) raw.push(`${basename(file)}: ${d[1]}`);
      }
    }
    expect(raw).toEqual([]);
  });

  it('a separator border is the hairline width, one device pixel on Retina and a full pixel under Increase Contrast', () => {
    const raw: string[] = [];
    for (const file of walk(join(ROOT, 'styles'), /\.css$/)) {
      for (const m of css(basename(file)).matchAll(/border(?:-[a-z]+)*:\s*1px solid var\(--ch-border-(?:hairline|subtle)\)/g)) raw.push(`${basename(file)}: ${m[0]}`);
    }
    expect(raw).toEqual([]);
    const tokens = css('tokens.css');
    expect(tokens).toMatch(/@media \(min-resolution: 2dppx\) \{\s*\[data-ui='clubhouse'\] \{\s*--ch-hairline-w: 0\.5px;/);
    const contrast = tokens.slice(tokens.indexOf('@media (prefers-contrast: more)'));
    expect(contrast).toMatch(/--ch-hairline-w: 1px;/);
  });

  it('button sizes take their corner from the scale (CONS-4) and the phone cards are cards (CONS-32)', () => {
    expect(radii('ui.css', '.ch-btn--sm')).toEqual(['var(--ch-radius-sm)']);
    expect(radii('ui.css', '.ch-btn--lg')).toEqual(['var(--ch-radius-lg)']);
    for (const [file, sel] of [['rounds-track.css', '.ch-rt-card'], ['stats.css', '.ch-stm-panel'], ['shell.css', '.ch-bst-card']] as const) {
      expect(radii(file, sel), `${file} ${sel}`).toContain('var(--ch-radius-card)');
    }
  });

  it('the tokens hold the settled values', () => {
    const tokens = css('tokens.css');
    expect(tokens).toMatch(/--ch-radius-card: 16px;/);
    expect(tokens).toMatch(/--ch-radius-sheet: 20px;/);
    expect(tokens).toMatch(/--ch-hairline-w: 1px;/);
  });
});
