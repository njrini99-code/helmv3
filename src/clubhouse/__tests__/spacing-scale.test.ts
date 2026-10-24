import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hits, ratchet, ROOT, slack, walk } from './_scan';

/**
 * B2: the spacing scale. A stylesheet on the MIGRATED list sets padding, margin and gaps only on the scale's steps
 * (`--ch-space-*` in tokens.css: 0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48px), or through a token. A 1px offset is a
 * hairline, not spacing, and scroll margins are not spacing either. Screens join the list as they move.
 */
const MIGRATED = ['whats-new.css', 'popup-lab.css', 'base.css', 'coachhelm-brief.css', 'coachhelm-track.css', 'goals.css'];
const SCALE = new Set([0, 1, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48]);

describe('spacing scale (B2)', () => {
  it('the scale and the reading widths are tokens', () => {
    const tokens = readFileSync(join(ROOT, 'styles/tokens.css'), 'utf8');
    for (const [name, px] of [['0_5', 2], ['1', 4], ['1_5', 6], ['2', 8], ['3', 12], ['4', 16], ['5', 20], ['6', 24], ['8', 32], ['10', 40], ['12', 48]] as const) {
      expect(tokens).toContain(`--ch-space-${name}: ${px}px;`);
    }
    expect(tokens).toMatch(/--ch-measure-text: 68ch;/);
  });

  it('the phone gutter is one token, 16 and 20 on a large phone (owner, 2026-10-24, decision 5; OQ-63)', () => {
    // Corrected: this pinned the B2 placeholder (--ch-phone-gutter at today's 20) while OQ-63 was open. Decision 5
    // answered it on --ch-page-x-phone itself, so the placeholder alias is gone; page-spacing.test.ts pins the rest.
    const tokens = readFileSync(join(ROOT, 'styles/tokens.css'), 'utf8');
    expect(tokens).toContain('--ch-page-x-phone: var(--ch-space-4);');
    expect(tokens).toMatch(/@media \(min-width: 414px\)[\s\S]*?--ch-page-x-phone: var\(--ch-space-5\);/);
    expect(tokens).not.toContain('--ch-phone-gutter');
  });

  it.each(MIGRATED)('%s spaces only on the scale', (name) => {
    const file = join(ROOT, 'styles', name);
    const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const off: string[] = [];
    for (const m of src.matchAll(/(?:^|[\s;{])((?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?):\s*([^;]+);/g)) {
      for (const [, v] of m[2]!.matchAll(/(-?\d+(?:\.\d+)?)px/g)) if (!SCALE.has(Math.abs(Number(v)))) off.push(`${relative(ROOT, file)}: ${m[1]}: ${m[2]}`);
    }
    expect(off).toEqual([]);
  });

  it('What’s new stops its lines at a reading width', () => {
    const css = readFileSync(join(ROOT, 'styles/whats-new.css'), 'utf8');
    expect(css.slice(css.indexOf('.ch-wn-meta {'), css.indexOf('}', css.indexOf('.ch-wn-meta {')))).toMatch(/max-width: var\(--ch-measure-text\);/);
  });
});

/**
 * Row 33: the codemod (scripts/clubhouse/spacing-scale.mjs, rule R) moved every off-scale padding, margin and gap onto
 * the scale. An integer px from 3 to 47 that is not a step, in a spacing property, a spacing custom property or an inline
 * React style, is counted per file and may only fall. Sub-pixel nudges, calc multipliers and values above 48 (layout
 * clearances) are outside this family by design; so are the phone page roots' top, bottom and gap, which stay as they
 * are for CONS-34 (OQ-63), and lane A's selectors, which the codemod skipped.
 */
const OFF = String.raw`(?<![\w.])-?(?:[3579]|1[013-57-9]|2[1-35-9]|3[013-9]|4[1-7])px\b`;
const OFF_SCALE = new RegExp(String.raw`(?<![\w-])(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?\s*:[^;{}]*?` + OFF);
const OFF_SCALE_VAR = new RegExp(String.raw`^\s*--ch-[a-z0-9-]*(?:pad|gap|gutter|inset|space)[a-z0-9-]*:\s*[^;]*` + OFF);
const OFF_SCALE_TSX = /\b(?:padding|margin|gap|rowGap|columnGap)(?:Top|Bottom|Left|Right|Inline|Block)?\s*:\s*['"]?-?(?:[3579]|1[013-57-9]|2[1-35-9]|3[013-9]|4[1-7])(?:px)?\b/;

// Page roots (CONS-34, OQ-63): a phone root's top and bottom beside --ch-page-x-phone, a desktop root's gap; and lane A's
// sidebar rows in shell.css.
const ALLOW: Record<string, number> = {
  'styles/coachhelm-dive.css': 1,
  'styles/coachhelm.css': 2,
  'styles/home.css': 10,
  'styles/hub.css': 1,
  'styles/messages.css': 9,
  'styles/recruiting.css': 1,
  'styles/roster.css': 1,
  'styles/rounds-recover.css': 1,
  'styles/rounds-setup.css': 2,
  'styles/rounds.css': 1,
  'styles/shell.css': 4,
  'styles/stats.css': 3,
};
// --ch-page-gutter: 28px (tablet), OQ-63.
const ALLOW_VAR: Record<string, number> = { 'styles/shell.css': 1 };

describe('spacing scale, every sheet (row 33)', () => {
  const css = walk(join(ROOT, 'styles'), /\.css$/).filter((f) => !f.endsWith('/tokens.css'));
  it('no stylesheet adds off-scale spacing (ratchet)', () => {
    const found = hits(OFF_SCALE, css);
    expect(ratchet(found, ALLOW)).toEqual({ over: [], stale: [] });
    expect(slack(found, ALLOW)).toEqual([]);
  });
  it('no spacing custom property is off the scale', () => {
    expect(ratchet(hits(OFF_SCALE_VAR, css), ALLOW_VAR)).toEqual({ over: [], stale: [] });
  });
  it('no inline style spaces off the scale (skeletons match their pages)', () => {
    expect(hits(OFF_SCALE_TSX, walk(ROOT, /\.tsx$/))).toEqual([]);
  });
});

/**
 * Row 39: three page widths (tokens.css): reading 760 for one column, standard 1200 for a page, wide 1360 for the two
 * data-dense desks. Every page main and form takes one, and no other px max-width of 700 or more is written; the two
 * left are pieces inside a page (Team Hub's travel card, the Messages composer that lines up with its thread, the hero's
 * one line of copy).
 */
describe('page widths (row 39)', () => {
  const MAINS: Array<[file: string, selector: string, width: 'reading' | 'page' | 'wide']> = [
    ['home.css', '.ch-h-main', 'page'],
    ['coachhelm.css', '.ch-hl', 'page'],
    ['hub.css', '.ch-hb', 'page'],
    ['messages.css', '.ch-ms.ch-ms--first', 'page'],
    ['qualifiers.css', '.ch-qf', 'page'],
    ['qualifiers.css', '.ch-qf--form', 'page'],
    ['roster.css', '.ch-rs', 'page'],
    ['recruiting.css', '.ch-rec', 'wide'],
    ['rounds-setup.css', '.ch-rsu', 'page'],
    ['rounds-track.css', '.ch-rt', 'page'],
    ['rounds.css', '.ch-rd', 'page'],
    ['rounds.css', '.ch-rv', 'page'],
    ['stats.css', '.ch-st', 'page'],
    ['classes.css', '.ch-cl', 'page'],
    ['calendar.css', '.ch-cal', 'wide'],
    ['rounds-recover.css', '.ch-rcv', 'reading'],
    ['settings.css', '.ch-set-stack', 'reading'],
    ['coachhelm-thread.css', '.ch-th-col', 'reading'],
  ];
  it('there are three, and only three', () => {
    const tokens = readFileSync(join(ROOT, 'styles/tokens.css'), 'utf8');
    expect(tokens).toMatch(/--ch-measure-reading: 760px;/);
    expect(tokens).toMatch(/--ch-measure-page: 1200px;/);
    expect(tokens).toMatch(/--ch-measure-wide: 1360px;/);
    expect(tokens.match(/--ch-measure-(?!text)[a-z]+:/g)).toHaveLength(3);
  });
  it.each(MAINS)('%s %s is the %s width', (file, sel, width) => {
    const src = readFileSync(join(ROOT, 'styles', file), 'utf8');
    const at = src.indexOf(`\n${sel} {`);
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, src.indexOf('}', at))).toContain(`max-width: var(--ch-measure-${width});`);
  });
  it('no other page-sized max-width is written in px', () => {
    const css = walk(join(ROOT, 'styles'), /\.css$/).filter((f) => !f.endsWith('/tokens.css'));
    const found = hits(/(?<![\w(-])max-width:\s*(?:[7-9]\d\d|\d{4,})px/, css);
    expect(ratchet(found, { 'styles/hub.css': 1, 'styles/messages.css': 1, 'styles/shell.css': 1 })).toEqual({ over: [], stale: [] });
  });
});
