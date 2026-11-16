import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hits, ratchet, ROOT, slack, walk } from './_scan';

/**
 * Row 35 (B3, review-notes codemod/shape.md): every corner is a step token, a derived inner corner, or a shape keyword.
 * The codemod (scripts/clubhouse/radius-steps.mjs) moved the raw ones; the few left are counted per file and may only
 * fall.
 */
const DECL = /border(?:-[a-z]+)*-radius\s*:\s*([^;}]+)/;
const PART = String.raw`(?:var\(--ch-radius-(?:xs|sm|md|lg|xl|full|bubble|tail)\)|max\(var\(--ch-radius-xs\), calc\(var\(--ch-radius-(?:sm|md|lg|xl)\) - var\(--ch-space-[0-9_]+\)\)\)|0|50%|inherit)`;
const OK = new RegExp(String.raw`^${PART}(?:\s+${PART})*(?:\s*!important)?$`);
const sheets = walk(join(ROOT, 'styles'), /\.css$/).filter((f) => !f.endsWith('tokens.css'));
// The Messages composer fields stay capsules at one line and grow (.ch-ms-comp__field, the pushed thread's textarea).
const ALLOW: Record<string, number> = { 'styles/messages.css': 1 };

const read = (f: string) => readFileSync(join(ROOT, 'styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** The body of the rule whose selector list holds exactly `sel`. */
const rule = (f: string, sel: string) =>
  [...read(f).matchAll(/([^{}]*)\{([^{}]*)\}/g)].find((m) => m[1]!.split(',').some((s) => s.trim() === sel))?.[2] ?? '';

describe('radius steps (row 35)', () => {
  it('no raw radius outside the allowlist; counts may only fall', () => {
    const found = hits(DECL, sheets).filter((h) => !OK.test(DECL.exec(h.text)![1]!.trim()));
    expect(ratchet(found, ALLOW)).toEqual({ over: [], stale: [] });
    expect(slack(found, ALLOW)).toEqual([]);
  });

  // The nested-corner rule (inner = outer step less the padding) still holds where a stepped corner nests; the toggle no
  // longer does: its well and thumb are capsules, the thumb 3px in (MOTION-AND-VISUAL 4.2 and 4.5).
  it('the segmented well and thumb are capsules, the thumb 3px in', () => {
    expect(rule('controls.css', '.ch-seg')).toMatch(/padding:\s*var\(--ch-seg-inset\);/);
    expect(readFileSync(join(ROOT, 'styles', 'tokens.css'), 'utf8')).toMatch(/--ch-seg-inset: 3px;/);
    expect(rule('controls.css', '.ch-seg')).toMatch(/border-radius:\s*var\(--ch-radius-full\);/);
    expect(rule('controls.css', '.ch-seg__b')).toMatch(/border-radius:\s*var\(--ch-radius-full\);/);
  });

  it('the scale is five steps plus the glyph corner and the bubble (MOTION-AND-VISUAL 4.5)', () => {
    const t = readFileSync(join(ROOT, 'styles', 'tokens.css'), 'utf8');
    for (const [k, v] of [['sm', 8], ['md', 12], ['lg', 16], ['xl', 20], ['full', 999], ['xs', 4], ['bubble', 18], ['tail', 6]] as const) {
      expect(t, k).toMatch(new RegExp(`--ch-radius-${k}: ${v}px;`));
    }
    expect([...t.matchAll(/^\s*--ch-radius-([a-z-]+):/gm)].map((m) => m[1]).sort()).toEqual(['bubble', 'full', 'lg', 'md', 'sm', 'tail', 'xl', 'xs']);
  });
});
