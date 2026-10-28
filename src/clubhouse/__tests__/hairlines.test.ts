import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hits, ratchet, ROOT, slack, walk } from './_scan';

/**
 * Row 36 (B3, 4.21.18): a separator is the hairline width, one device pixel on 2x and 3x, on a token colour. The lines
 * codemod (scripts/clubhouse/hairlines.mjs over review-notes codemod/lines.md Appendix A) moved them; the full-pixel
 * lines left are deliberate (field edges, focus, state rings, marks, controls, chart marks, rails and clips; Appendix B)
 * and are counted per file. They may only fall.
 */
const SEP = String.raw`(?:var\(--ch-(?:border-hairline|border-subtle|ledger-rule(?:-soft|-strong)?|champagne-rule(?:-strong)?|hero-rule|stage-rule(?:-soft)?|ink-rule|board-rule|edge|cl-tb)\)|rgb\((?:28 25 18|16 18 14|110 98 62|176 149 96|205 187 142|220 205 166) ?\/)`;
const ONE_PX_LINE = new RegExp(String.raw`\b1px solid ${SEP}|\b0 0 0 1px ${SEP}|\binset 0 -?1px 0 ${SEP}|\binset -?1px 0 0 ${SEP}`);
const ONE_PX_ELEMENT = /^\s*(?:height|width|block-size|inline-size):\s*1px;/;
const sheets = walk(join(ROOT, 'styles'), /\.css$/).filter((f) => !f.endsWith('tokens.css'));
// shell.css counts lane A's sidebar foot, which the codemod skipped.
const ALLOW_LINES: Record<string, number> = {
  'styles/auth.css': 3,
  'styles/calendar.css': 4,
  'styles/classes.css': 2,
  'styles/coachhelm-ask.css': 1,
  'styles/coachhelm-thread.css': 1,
  'styles/coachhelm-views.css': 2,
  'styles/command.css': 1,
  'styles/controls.css': 2,
  'styles/home.css': 3,
  'styles/hub.css': 3,
  'styles/messages.css': 4,
  'styles/onboard.css': 5,
  'styles/qualifiers.css': 2,
  'styles/recruiting.css': 2,
  'styles/roster.css': 2,
  'styles/rounds-setup.css': 9,
  'styles/rounds-track.css': 5,
  'styles/rounds.css': 3,
  'styles/shell.css': 6,
  'styles/stats.css': 2,
  'styles/ui.css': 5,
};
const ALLOW_ELEMENTS: Record<string, number> = {
  'styles/auth.css': 4,
  'styles/base.css': 2,
  'styles/calendar.css': 1,
  'styles/classes.css': 3,
  'styles/coachhelm-ask.css': 2,
  'styles/coachhelm-standing.css': 2,
  'styles/coachhelm-thread.css': 4,
  'styles/coachhelm.css': 2,
  'styles/home.css': 1,
  'styles/messages.css': 2,
  'styles/qualifiers.css': 2,
  'styles/recruiting.css': 1,
  'styles/rounds.css': 2,
  'styles/shell.css': 1,
  'styles/stats.css': 11,
  'styles/ui.css': 1,
};

describe('hairlines (row 36)', () => {
  it('no separator is a full CSS pixel (ratchet)', () => {
    const found = hits(ONE_PX_LINE, sheets);
    expect(ratchet(found, ALLOW_LINES)).toEqual({ over: [], stale: [] });
    expect(slack(found, ALLOW_LINES)).toEqual([]);
  });
  it('no 1px separator element (ratchet; the rest are chart marks, rails and clips)', () => {
    const found = hits(ONE_PX_ELEMENT, sheets);
    expect(ratchet(found, ALLOW_ELEMENTS)).toEqual({ over: [], stale: [] });
    expect(slack(found, ALLOW_ELEMENTS)).toEqual([]);
  });
  it('the line tokens hold the settled values (decision 6)', () => {
    const t = readFileSync(join(ROOT, 'styles', 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(t).toMatch(/--ch-border-hairline: rgb\(28 25 18 \/ 0\.1\);/);
    expect(t).toMatch(/--ch-border-hairline: rgb\(237 231 216 \/ 0\.12\);/);
    expect(t).toMatch(/@media \(min-resolution: 3dppx\) \{\s*\[data-ui='clubhouse'\] \{\s*--ch-hairline-w: 0\.333px;/);
    expect(t.indexOf('(min-resolution: 3dppx)')).toBeLessThan(t.indexOf('@media (prefers-contrast: more)'));
    expect(t).toMatch(/--ch-stage-rule-soft: rgb\(244 238 221 \/ 0\.1\);/);
    expect(t.match(/--ch-champagne-rule-strong:/g)?.length).toBe(2);
  });
});
