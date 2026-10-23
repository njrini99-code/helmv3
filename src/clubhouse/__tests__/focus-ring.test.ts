import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ratchet, ROOT, walk, type Hit } from './_scan';

/**
 * CONS-36: one focus ring. A `:focus-visible` or `:focus-within` rule draws its outline in --ch-border-focus (on the
 * page) or --ch-border-focus-on-dark (on the hero green and dark plates), 2px out, or 2px in on a full-bleed row. The
 * files below still draw a ring of their own (the Button's documented ring among them); their counts may only fall.
 */
const OK_COLOUR = /var\(--ch-border-focus(-on-dark)?\)|^\s*(none|0|transparent|2px solid transparent)\s*$/;

function rings(): Hit[] {
  const out: Hit[] = [];
  for (const f of walk(ROOT, /\.css$/)) {
    const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1]!.trim();
      if (!/:focus-(visible|within)/.test(sel)) continue;
      for (const d of m[2]!.split(';')) {
        const [prop, ...rest] = d.split(':');
        const p = prop?.trim();
        const v = rest.join(':').trim();
        if (!p || !v) continue;
        const bad =
          ((p === 'outline' || p === 'outline-color') && !OK_COLOUR.test(v)) ||
          (p === 'outline-offset' && !/^-?2px$/.test(v)) ||
          (p === 'box-shadow' && /rgb\(28 25 18/.test(v));
        if (bad) out.push({ file: relative(ROOT, f), line: 0, text: `${sel} { ${p}: ${v} }` });
      }
    }
  }
  return out;
}

const ALLOW_RING: Record<string, number> = {
  'styles/controls.css': 1,
  'styles/messages.css': 1,
  'styles/shell.css': 4,
  'styles/stats.css': 1,
};

describe('one focus ring (CONS-36)', () => {
  it('focus draws with the focus tokens, 2px out or in', () => {
    const r = ratchet(rings(), ALLOW_RING);
    expect(r.over).toEqual([]);
    expect(r.stale).toEqual([]);
  });
});
