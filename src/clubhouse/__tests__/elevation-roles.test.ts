import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { hits, ratchet, ROOT, slack, walk, type Hit } from './_scan';

/**
 * Named elevations (dsx-07, design lab foundation 2): flat, card, raised and overlay are the only depth names a surface
 * reads. The older names that only point at one of them (reading, lifted, framed, board, plate, mark, glass, strip,
 * control, the shadow-sm/md/lg and per-lane card shadows) are retiring: their reads are counted per file and may only
 * fall. Shadows drop out under forced colours (Windows High Contrast), so every surface that reads a named elevation
 * also draws an outline in a `@media (forced-colors: active)` rule (its own stylesheet's, or base.css's shared list); the surfaces that don't yet
 * are counted per file and may only fall.
 */
const tokens = readFileSync(join(ROOT, 'styles/tokens.css'), 'utf8');
const css = walk(join(ROOT, 'styles'), /\.css$/).filter((f) => !f.endsWith('tokens.css'));
const RETIRING =
  /var\(\s*--ch-(?:elevation-(?:reading(?:-hover|-accent)?|lifted|framed|on-frame(?:-hover|-card-hover)?|feature|board(?:-hover)?|plate|row-card-hover|mark(?:-warn|-ink)?|glass-(?:card|edge)|sheet|control|strip(?:-plate)?)|card-shadow-flat|crh-card-shadow|nav-well-shadow|sheet-shadow|shadow-(?:sm|md|lg)|card-shadow|feature-shadow|raised-shadow)\s*[,)]/;
const NAMED = /var\(--ch-(?:elevation-(?:card|raised|overlay)|card-shadow|shadow-(?:sm|md|lg)|sheet-shadow)\)/;

const strip = (s: string) =>
  s
    .replace(/html\[data-fw-theme='dark'\]\s*/g, '')
    .replace(/\[data-ui='clubhouse'\]\s*/g, '')
    .replace(/:(?:hover|focus-visible|focus-within|active|focus)\b/g, '')
    .replace(/\[data-ch-pressed[^\]]*\]/g, '')
    .trim();
const inside = (node: postcss.Node, re: RegExp) => {
  for (let p = node.parent; p; p = p.parent) if (p.type === 'atrule' && re.test((p as postcss.AtRule).params)) return true;
  return false;
};

/** Surfaces that read a named elevation outside forced colours and print, with no forced-colours edge in their file. */
function edgeless(): Hit[] {
  const out: Hit[] = [];
  const roots = css.map((file) => ({ file, root: postcss.parse(readFileSync(file, 'utf8')) }));
  // An edge may live in the surface's own stylesheet or in base.css's shared forced-colours list.
  const edged = new Set<string>();
  for (const { root } of roots)
    root.walkDecls((d) => {
      if (d.parent?.type === 'rule' && inside(d, /forced-colors/) && /^(?:outline|border)/.test(d.prop))
        for (const s of (d.parent as postcss.Rule).selectors) edged.add(strip(s));
    });
  const covered = (s: string) => [...edged].some((c) => s === c || (s.startsWith(c) && !/[\w-]/.test(s[c.length]!)));
  for (const { file, root } of roots) {
    const seen = new Set<string>();
    root.walkDecls('box-shadow', (d) => {
      if (d.parent?.type !== 'rule' || inside(d, /forced-colors|print/) || !NAMED.test(d.value)) return;
      for (const s of (d.parent as postcss.Rule).selectors) {
        const n = strip(s);
        if (n && !seen.has(n) && !covered(n)) {
          seen.add(n);
          out.push({ file: relative(ROOT, file), line: d.source?.start?.line ?? 0, text: n });
        }
      }
    });
  }
  return out;
}


describe('named elevations (dsx-07)', () => {
  it('flat, card, raised and overlay are defined', () => {
    for (const n of ['flat', 'card', 'raised', 'overlay']) expect(tokens, n).toMatch(new RegExp(`--ch-elevation-${n}:`));
    expect(tokens).toMatch(/--ch-elevation-flat: 0 0 0 0 transparent;/);
  });
  it('reads of the retiring elevation names only fall, file by file', () => {
    const found = hits(RETIRING, walk(ROOT, /\.(tsx?|css)$/).filter((f) => !f.endsWith('tokens.css') && !f.includes('__tests__')));
    expect(ratchet(found, RETIRING_READS)).toEqual({ over: [], stale: [] });
    expect(slack(found, RETIRING_READS)).toEqual([]);
  });
  it('a surface that reads a named elevation keeps an edge under forced colours', () => {
    const found = edgeless();
    expect(ratchet(found, EDGELESS)).toEqual({ over: [], stale: [] });
    expect(slack(found, EDGELESS)).toEqual([]);
  });
});

/** Lines reading a retiring elevation name on 27 Nov 2026 (files other open PRs hold, and modules not live). Only falls. */
const RETIRING_READS: Record<string, number> = {
  'preview/playground-tokens.ts': 1,
  'styles/coachhelm-ask-look.css': 1,
  'styles/controls.css': 2,
  'styles/home.css': 21,
  'styles/messages-inbox.css': 2,
  'styles/qualifiers.css': 15,
  'styles/roster.css': 16,
  'styles/shell.css': 19,
  'styles/stats-redesign.css': 3,
  'styles/stats.css': 16,
};

/** Surfaces with no forced-colours edge on 27 Nov 2026 (files other open PRs hold, and modules not live). Only falls. */
const EDGELESS: Record<string, number> = {
  'styles/coachhelm-ask-look.css': 1,
  'styles/controls.css': 3,
  'styles/home.css': 14,
  'styles/messages-inbox.css': 3,
  'styles/qualifiers.css': 5,
  'styles/recruiting.css': 2,
  'styles/roster.css': 10,
  'styles/shell.css': 8,
  'styles/stats.css': 4,
};
