import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A plan's groups wear the app's own tones (owner, 11 Nov 2026): green, ochre, slate, clay, stone and ink. Never the blue and purple the
 * sheet was first drawn with, never the red that means under par, and the same tone for a letter on the sheet, in the builder, on the Run
 * card and in Ask's plan card.
 */
const read = (name: string) => readFileSync(join(process.cwd(), 'src/clubhouse/styles', name), 'utf8');
const plan = read('coachhelm-plan.css');
const practice = read('practice.css');
const tokens = read('tokens.css');

const DARK = tokens.indexOf("html[data-fw-theme='dark'] [data-ui='clubhouse'] {");
/** A token's hex by day (its first value) or at night (its first value in the dark block). */
const hex = (name: string, night = false) => {
  const m = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(night ? tokens.slice(DARK) : tokens);
  if (!m) throw new Error(`no hex for ${name}`);
  return m[1]!;
};
const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

/** Every rule and declaration that gives a group its colour, in the three places one is written. */
const sheetPalette = plan.slice(plan.indexOf('.ch-cp-sheet .g-A'), plan.indexOf('.ch-cp-sheet section')).replace(/\/\*[\s\S]*?\*\//g, '');
const askPalette = plan.slice(plan.indexOf('--ch-pl-cpv-ga'), plan.indexOf('--ch-pl-cpv-sep')) + plan.slice(plan.indexOf("html[data-fw-theme='dark'] .ch-cpv,"), plan.indexOf('.ch-cpv .art {'));
const discs = practice.slice(practice.indexOf('.ch-prc-disc {'), practice.indexOf('.ch-prc-player {'));

describe('a plan’s group tones', () => {
  it('are never the blue and purple, as tokens or as their values', () => {
    for (const css of [sheetPalette, discs, plan.slice(plan.indexOf('--ch-pl-cpv-ga'), plan.indexOf('--ch-pl-cpv-gon')), plan.slice(plan.lastIndexOf('--ch-pl-cpv-ga'), plan.lastIndexOf('--ch-pl-cpv-gon'))]) {
      expect(css).not.toMatch(/--ch-(run|plan)-group-[bc]\b/);
      expect(css).not.toMatch(/#(2f5b7e|654a7e|6e9bc0|b49acb|e3eaf2|ece7f1)/i);
      expect(css).not.toMatch(/--ch-yr-(jr|fr)\b|--ch-(flag|chart-flag)\b/);
    }
    expect(askPalette).toContain('--ch-pl-cpv-gb: var(--ch-yr-so)');
  });

  it('are one tone a letter everywhere: the sheet, the discs and Ask’s card', () => {
    const day = { B: '--ch-yr-so', C: '--ch-plan-group-d', D: '--ch-plan-group-f', E: '--ch-plan-group-e', F: '--ch-print-soft' };
    const night = { B: '--ch-champagne-500', C: '--ch-plan-group-d-night', D: '--ch-plan-group-f-night', E: '--ch-plan-group-e-night', F: '--ch-ink-700' };
    for (const [letter, token] of Object.entries(day)) {
      const l = letter.toLowerCase();
      expect(sheetPalette).toMatch(letter <= 'C' ? new RegExp(`--ch-pl-g${letter}:var\\(${token}\\)`) : new RegExp(`\\.g-${letter} \\{ --ch-pl-g: var\\(${token}\\)`));
      expect(discs).toContain(`.ch-prc-group.is-${l} .ch-prc-disc, .ch-prc-disc.g-${letter} { background: var(${token}); }`);
      expect(plan).toContain(`--ch-pl-cpv-g${l}: var(${token});`);
    }
    for (const [letter, token] of Object.entries(night)) {
      const l = letter.toLowerCase();
      expect(discs).toContain(`html[data-fw-theme='dark'] :is(.ch-prc-group.is-${l} .ch-prc-disc, .ch-prc-disc.g-${letter}) { background: var(${token}); }`);
      expect(plan).toContain(`--ch-pl-cpv-g${l}: var(${token});`);
    }
  });

  it('hold 4.5:1 under their letter, by day and at night', () => {
    // By day and on the sheet the letter is white. The sheet stays light at night, so Sophomore's night value sits under white there too.
    for (const fill of ['#1f6b45', hex('--ch-yr-so'), hex('--ch-yr-so', true), hex('--ch-plan-group-d'), hex('--ch-plan-group-f'), hex('--ch-plan-group-e'), hex('--ch-print-soft')]) {
      expect(contrast('#ffffff', fill), fill).toBeGreaterThanOrEqual(4.5);
    }
    const ink = hex('--ch-run-group-on', true);
    for (const fill of [hex('--ch-run-group-a', true), hex('--ch-champagne-500', true), hex('--ch-plan-group-d-night'), hex('--ch-plan-group-f-night'), hex('--ch-plan-group-e-night'), hex('--ch-ink-700', true)]) {
      expect(contrast(ink, fill), fill).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('write the sheet’s tints as plain colours: Share PDF cannot draw a color-mix()', () => {
    // html2canvas 1.4 throws on any colour function it does not know, and the whole file is lost.
    expect(sheetPalette).not.toContain('color-mix(');
    expect(sheetPalette.match(/--ch-pl-g(?:[ABC]-t|t):\s*#[0-9A-F]{6}/g)).toHaveLength(6);
  });
});

/**
 * The kinds of work (skill, random, pressure) wear the same family: ochre, slate and green on the day strip, its key and Ask's plan card.
 * A kind is a bar or a square with its word and a group is a disc with its letter, so colour never has to tell the two apart.
 */
describe('the kinds of work', () => {
  const bare = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
  const strip = bare(practice.slice(practice.indexOf('.ch-prc-day__bar i[data-tone='), practice.indexOf('.ch-prc-day__ends')));
  const key = bare(practice.slice(practice.indexOf('.ch-prc-ribbon__mix span::before'), practice.indexOf('.ch-prc-save {')));

  it('are never the blue and purple, on the strip, its key or Ask’s card', () => {
    for (const css of [strip, key]) expect(css).not.toMatch(/--ch-(run|plan)-group-[bc]\b/);
    expect(plan).not.toMatch(/--ch-pl-cpv-(skill|random|pressure):\s*#(3d6787|6e5487|6e9bc0|b49acb)/i);
  });

  it('are ochre, slate and green by day and their lit values at night, the same on the strip and its key', () => {
    const day = { skill: '--ch-yr-so', random: '--ch-plan-group-d', pressure: '--ch-run-group-a' };
    const night = { skill: '--ch-champagne-500', random: '--ch-plan-group-d-night' };
    for (const [kind, token] of Object.entries(day)) expect(strip).toContain(`.ch-prc-day__bar i[data-tone='${kind}'] { background: var(${token}); }`);
    for (const [kind, token] of Object.entries(night)) expect(strip).toContain(`html[data-fw-theme='dark'] .ch-prc-day__bar i[data-tone='${kind}'] { background: var(${token}); }`);
    // The key's first square is skill; random and pressure name themselves.
    expect(key).toMatch(/\.ch-prc-ribbon__mix span::before \{[^}]*background: var\(--ch-yr-so\);/);
    expect(key).toContain(".ch-prc-ribbon__mix [data-tone='random']::before { background: var(--ch-plan-group-d); }");
    expect(key).toContain("html[data-fw-theme='dark'] .ch-prc-ribbon__mix span::before { background: var(--ch-champagne-500); }");
    expect(key).toContain("html[data-fw-theme='dark'] .ch-prc-ribbon__mix [data-tone='random']::before { background: var(--ch-plan-group-d-night); }");
    expect(key).toContain("html[data-fw-theme='dark'] .ch-prc-ribbon__mix [data-tone='pressure']::before { background: var(--ch-run-group-a); }");
    expect(plan).toContain('--ch-pl-cpv-skill: var(--ch-yr-so);');
    expect(plan).toContain('--ch-pl-cpv-random: var(--ch-plan-group-d);');
    expect(plan).toContain('--ch-pl-cpv-skill: var(--ch-champagne-500);');
    expect(plan).toContain('--ch-pl-cpv-random: var(--ch-plan-group-d-night);');
  });

  it('stand 3:1 off the card they are drawn on, by day and at night', () => {
    for (const fill of [hex('--ch-yr-so'), hex('--ch-plan-group-d'), hex('--ch-run-group-a')]) expect(contrast(fill, '#fffefb'), fill).toBeGreaterThanOrEqual(3);
    for (const fill of [hex('--ch-champagne-500', true), hex('--ch-plan-group-d-night'), hex('--ch-run-group-a', true)]) expect(contrast(fill, hex('--ch-card-bg', true)), fill).toBeGreaterThanOrEqual(3);
  });
});
