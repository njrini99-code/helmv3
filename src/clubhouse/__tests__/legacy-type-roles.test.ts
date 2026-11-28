import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hits, ratchet, ROOT, slack, walk } from './_scan';

/**
 * Type (MOTION-AND-VISUAL 4.3, Nick 15 Nov 2026): nine roles, scaled by --ch-type-k so text follows iPhone Text Size.
 * Large title, title, headline, body, callout, footnote, caption, the hero figure and the row figure. Every older named
 * role (serif, display, label, eyebrow, meta, row, section, card and bar titles, the 52 hero, the 40 and 44 figures) was
 * mapped onto one of the nine at its every use and deleted. The numeric steps (--ch-type-11 to -34) are the next to go:
 * their reads are counted per stylesheet and may only fall, a screen at a time, with before and after screenshots.
 */
const tokens = readFileSync(join(ROOT, 'styles/tokens.css'), 'utf8');
const css = walk(join(ROOT, 'styles'), /\.css$/).filter((f) => !f.endsWith('tokens.css'));
const NINE = ['large-title', 'title', 'headline', 'body', 'callout', 'footnote', 'caption', 'figure-hero', 'figure'];
const OLD = /--ch-(?:type|track)-(?:serif-[lms]|display-[ls]|body-[ls]|label|label-s|figure-l|figure-40-500|figure-44-500|bar-title|card-title|section|eyebrow|row|meta|hero)(?![a-z0-9-])/;
const STEP = /var\(--ch-type-\d+(?:-medium|-strong)?\)/;

describe('type roles (MOTION-AND-VISUAL 4.3)', () => {
  it('the nine roles are defined, at their desktop values, from --ch-type-k', () => {
    for (const r of NINE) expect(tokens, r).toMatch(new RegExp(`--ch-type-${r}: \\d{3} calc\\(\\d+ \\* var\\(--ch-type-k\\)\\)`));
    expect(tokens).toMatch(/--ch-type-figure-hero: 600 calc\(56 \* var\(--ch-type-k\)\)\/1/);
    expect(tokens).toMatch(/--ch-type-figure-hero: 600 calc\(44 \* var\(--ch-type-k\)\)\/1/);
  });
  it('the subhead is 15/20 on phone and desk, a step under the phone body (dsx-07)', () => {
    // The 15 step's reads sit on it, so secondary text keeps its 15 on a phone, where the body is 17/24.
    const subhead = /--ch-type-subhead: (\d{3}) calc\(15 \* var\(--ch-type-k\)\)\/calc\(20 \* var\(--ch-type-k\)\) var\(--ch-font-sans\);/g;
    expect([...tokens.matchAll(subhead)].map((m) => m[1])).toEqual(['400', '450']);
    const phone = tokens.match(/\/\* The nine roles on a phone[\s\S]*?\n\}\n/)?.[0] ?? '';
    expect(phone).toMatch(/--ch-type-body: 400 calc\(17 /);
    expect(phone).not.toMatch(/--ch-type-subhead:/);
    const oneX = tokens.match(/@media \(max-resolution: 1\.5dppx\) \{[\s\S]*?\n\}\n/)?.[0] ?? '';
    expect(oneX).toMatch(/--ch-type-subhead: 450 /);
  });
  it('the detail is 14/20 on phone and desk, so the old 14 step keeps its 14 on a phone (owner, 28 Nov 2026)', () => {
    // The callout is 15/20 on a phone; the rules that read the 14 step before dsx-07 read the detail instead.
    const detail = /--ch-type-detail: (\d{3}) calc\(14 \* var\(--ch-type-k\)\)\/calc\(20 \* var\(--ch-type-k\)\) var\(--ch-font-sans\);/g;
    expect([...tokens.matchAll(detail)].map((m) => m[1])).toEqual(['500', '560']);
    const phone = tokens.match(/\/\* The nine roles on a phone[\s\S]*?\n\}\n/)?.[0] ?? '';
    expect(phone).not.toMatch(/--ch-type-detail:/);
    expect(phone).toMatch(/--ch-type-callout: 500 calc\(15 /);
    const reads = hits(/var\(--ch-type-detail\)/, css);
    expect(reads.length).toBe(302);
  });
  it('no older named role is defined or read anywhere in Clubhouse', () => {
    expect(hits(OLD, walk(ROOT, /\.(tsx?|css)$/))).toEqual([]);
  });
  it('the legacy leadings are tokens equal to the old roles', () => {
    const t = hits(/--ch-lead-(?:caption|label):/, [join(ROOT, 'styles/tokens.css')]).map((h) => h.text);
    expect(t).toEqual(['--ch-lead-caption: 1.4;', '--ch-lead-label: 1.3;']);
  });
  it('reads of the numeric steps only fall, file by file', () => {
    const found = hits(STEP, css);
    expect(ratchet(found, STEP_READS)).toEqual({ over: [], stale: [] });
    expect(slack(found, STEP_READS)).toEqual([]);
  });
});

/** Lines reading a numeric type step per stylesheet on 15 Nov 2026, after the named roles moved. Only falls. */
const STEP_READS: Record<string, number> = {
  'styles/auth.css': 1,
  'styles/calendar.css': 86,
  'styles/coachhelm-ask-look.css': 37,
  'styles/component-playground.css': 3,
  'styles/controls.css': 28,
  'styles/home.css': 150,
  'styles/hub.css': 92,
  'styles/messages-inbox.css': 12,
  'styles/messages-overlays.css': 9,
  'styles/messages.css': 113,
  'styles/onboard.css': 37,
  'styles/practice.css': 125,
  'styles/qualifiers.css': 66,
  'styles/roster.css': 90,
  'styles/rounds-setup.css': 53,
  'styles/rounds-track.css': 75,
  'styles/rounds.css': 152,
  'styles/settings.css': 50,
  'styles/shell.css': 45,
  'styles/stats-redesign.css': 94,
  'styles/stats.css': 189,
  'styles/tournaments-compare.css': 32,
  'styles/tournaments-home.css': 4,
};
