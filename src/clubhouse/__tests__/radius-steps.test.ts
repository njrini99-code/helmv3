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
const PART = String.raw`(?:var\(--ch-radius-(?:xs|sm|md|lg|xl|card|sheet|mark|tail)\)|max\(var\(--ch-radius-xs\), calc\(var\(--ch-radius-(?:sm|md|lg|xl|card|sheet)\) - var\(--ch-space-[0-9_]+\)\)\)|0|50%|999px|inherit)`;
const OK = new RegExp(String.raw`^${PART}(?:\s+${PART})*(?:\s*!important)?$`);
const sheets = walk(join(ROOT, 'styles'), /\.css$/).filter((f) => !f.endsWith('tokens.css'));
// The Messages composer fields stay capsules at one line and grow (.ch-ms-comp__field, the pushed thread's textarea).
const ALLOW: Record<string, number> = { 'styles/messages.css': 2 };

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

  // Inner corner = outer step less the parent's padding. Each row: parent file and selector, child file and selector.
  const NESTED: Array<[parentFile: string, parent: string, childFile: string, child: string]> = [
    ['controls.css', '.ch-seg', 'controls.css', '.ch-seg__b'],
    ['controls.css', '.ch-seg--sm', 'controls.css', '.ch-seg--sm .ch-seg__b'],
  ];
  it.each(NESTED)('%s %s > %s %s: the inner corner subtracts the parent padding', (pf, parent, cf, child) => {
    const tokens = readFileSync(join(ROOT, 'styles', 'tokens.css'), 'utf8');
    const space = Object.fromEntries([...tokens.matchAll(/--ch-space-([0-9_]+):\s*(\d+)px;/g)].map((m) => [m[1]!, Number(m[2])]));
    const px = (v: string) => {
      const t = /var\(--ch-space-([0-9_]+)\)/.exec(v);
      return t ? space[t[1]!] : Number(/(\d+)px/.exec(v)?.[1]);
    };
    const pad = /(?:^|;)\s*padding:\s*([^;\s]+)/.exec(rule(pf, parent))?.[1] ?? '';
    const sub = /calc\(var\(--ch-radius-[a-z]+\) - (var\(--ch-space-[0-9_]+\))\)/.exec(rule(cf, child))?.[1] ?? '';
    expect(sub, `${child} has no nested corner`).not.toBe('');
    expect(px(sub)).toBe(px(pad));
  });

  it('the scale is four steps plus the floor and two named shapes', () => {
    const t = readFileSync(join(ROOT, 'styles', 'tokens.css'), 'utf8');
    for (const [k, v] of [['xs', 4], ['sm', 8], ['md', 12], ['lg', 16], ['xl', 20], ['card', 16], ['sheet', 20], ['mark', 2], ['tail', 6]] as const) {
      expect(t, k).toMatch(new RegExp(`--ch-radius-${k}: ${v}px;`));
    }
  });
});
