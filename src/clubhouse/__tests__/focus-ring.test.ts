import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import postcss, { type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';
import { ratchet, ROOT, walk, type Hit } from './_scan';

/**
 * CONS-36: one focus ring. A focus rule (`:focus`, `:focus-visible` or `:focus-within`) draws a 2px outline in
 * --ch-border-focus (on the page) or --ch-border-focus-on-dark (on the hero green and dark plates), 2px out, or 2px in
 * on a full-bleed row. A field that rings with a box-shadow draws the ring in those tokens and its halo in
 * --ch-focus-halo (or a mix of a focus token); a layer in another colour is allowed only as the gap under a focus ring
 * (the Button's ring). An invalid field's red ring is its own state, not a focus ring. A rule that only moves the ring
 * (`outline-offset` with no outline of its own, as the sign-in text links) moves it 2px too. The files below still draw
 * a ring of their own; their counts may only fall:
 * - controls.css and shell.css: the pressed rows' inset ink highlight (a menu item, the team switcher, the bell rows);
 * - shell.css: the hero bell and Ask keys, whose 2px clear border is the gap, so their ring sits at offset 0.
 */
const FOCUS = /:focus(-visible|-within)?(?![\w-])/;
/** A selector's own focus state: `.x:not(:focus-visible)` is the resting state, not a ring. */
const isFocus = (sel: string) => FOCUS.test(sel.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, ''));
const INVALID = /\[(aria-invalid|data-invalid)/;
const TOKEN = /var\(--ch-(border-focus(-on-dark)?|focus-halo)\)/;
const RING_TOKEN = /var\(--ch-border-focus(-on-dark)?\)/;
const OUTLINE = /^\s*(2px solid var\(--ch-border-focus(-on-dark)?\)|none|0|transparent|2px solid transparent)\s*$/;
const OUTLINE_COLOUR = /^\s*(var\(--ch-border-focus(-on-dark)?\)|transparent)\s*$/;
const OFFSET = /^-?2px$/;

/** A box-shadow's layers, split on the commas outside parentheses. */
function layers(v: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of v) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * A spread ring (`0 0 0 2px colour`, inset or not, up to 8px): its spread and colour. Offset or blurred layers are not
 * rings, and a wide inset spread is a fill (the autofill cover), not a ring.
 */
function ring(layer: string): { spread: number; colour: string } | null {
  const m = /^(?:inset\s+)?0(?:px)?\s+0(?:px)?\s+0(?:px)?\s+([\d.]+)px\s+(.+?)(?:\s+inset)?$/.exec(layer);
  return m && Number(m[1]) <= 8 ? { spread: Number(m[1]), colour: m[2]!.trim() } : null;
}

/** Each ring layer is a focus token, or a gap under a wider ring in --ch-border-focus (the halo covers no gap). */
function badRing(v: string): string | null {
  const rings = layers(v).map(ring);
  for (const [i, r] of rings.entries()) {
    if (!r || TOKEN.test(r.colour)) continue;
    const covered = rings.slice(i + 1).some((o) => o && RING_TOKEN.test(o.colour) && o.spread > r.spread);
    if (!covered) return r.colour;
  }
  return null;
}

function rings(): Hit[] {
  const out: Hit[] = [];
  for (const f of walk(ROOT, /\.css$/)) {
    postcss.parse(readFileSync(f, 'utf8')).walkRules((r: Rule) => {
      const sels = r.selectors.map((s) => s.trim());
      const focus = sels.filter(isFocus);
      const decls = r.nodes.filter((n) => n.type === 'decl');
      const hit = (prop: string, value: string, line?: number) =>
        out.push({ file: relative(ROOT, f), line: line ?? 0, text: `${sels.join(', ')} { ${prop}: ${value} }` });
      if (!focus.length) {
        // A rule that moves the ring drawn by a focus rule elsewhere, with no outline of its own.
        const own = decls.some((d) => /^outline(-(style|width|color))?$/.test(d.prop));
        for (const d of decls) if (d.prop === 'outline-offset' && !own && !OFFSET.test(d.value.trim())) hit(d.prop, d.value, d.source?.start?.line);
        return;
      }
      const ringed = focus.some((s) => !INVALID.test(s));
      for (const d of decls) {
        const p = d.prop;
        const v = d.value.trim();
        const bad =
          (p === 'outline' && !OUTLINE.test(v)) ||
          (p === 'outline-color' && !OUTLINE_COLOUR.test(v)) ||
          (p === 'outline-width' && v !== '2px') ||
          (p === 'outline-style' && !/^(solid|none)$/.test(v)) ||
          (p === 'outline-offset' && !OFFSET.test(v)) ||
          (p === 'box-shadow' && (/rgb\(28 25 18/.test(v) || (ringed && badRing(v) !== null)));
        if (bad) hit(p, v, d.source?.start?.line);
      }
    });
  }
  return out;
}

const ALLOW_RING: Record<string, number> = {
  'styles/controls.css': 1,
  'styles/shell.css': 4,
};

describe('one focus ring (CONS-36)', () => {
  it('focus draws with the focus tokens, 2px wide, 2px out or in', () => {
    const r = ratchet(rings(), ALLOW_RING);
    expect(r.over).toEqual([]);
    expect(r.stale).toEqual([]);
  });

  it('sees every form of a ring the guard is for', () => {
    const one = (css: string) => {
      const found: string[] = [];
      postcss.parse(css).walkRules((r) => {
        const focus = r.selectors.filter(isFocus);
        for (const n of r.nodes) {
          if (n.type !== 'decl') continue;
          if (n.prop === 'box-shadow' && focus.some((s) => !INVALID.test(s)) && badRing(n.value)) found.push(n.value);
          if (n.prop === 'outline' && focus.length && !OUTLINE.test(n.value)) found.push(n.value);
        }
      });
      return found;
    };
    // A bare :focus, a raw green ring, a literal champagne, a thin outline and the error ring on plain focus all fail.
    expect(one('.a:focus { box-shadow: 0 0 0 1px var(--ch-green-600), 0 0 0 4px rgb(21 90 57 / 0.12); }')).toHaveLength(1);
    expect(one('.a:focus-visible { box-shadow: 0 0 0 2px #dccda6; }')).toHaveLength(1);
    expect(one('.a:focus-visible { outline: 1px solid var(--ch-border-focus); }')).toHaveLength(1);
    expect(one('.a:focus { box-shadow: 0 0 0 1px var(--ch-green-600), 0 0 0 4px var(--ch-focus-halo); }')).toHaveLength(1);
    expect(one('html .a:focus, html .a[aria-invalid] { box-shadow: 0 0 0 1.5px var(--ch-danger-600); }')).toHaveLength(1);
    // The tokens, the Button's gap under its ring, a mix of a token, a resting :not() and an invalid field's ring pass.
    expect(one('.a:focus { box-shadow: 0 0 0 1px var(--ch-border-focus), 0 0 0 4px var(--ch-focus-halo); }')).toEqual([]);
    expect(one('.a:focus-visible { box-shadow: 0 0 0 2px var(--ch-bg-page), 0 0 0 4px var(--ch-border-focus); }')).toEqual([]);
    expect(one('.a:focus-visible { box-shadow: 0 0 0 5px color-mix(in srgb, var(--ch-border-focus-on-dark) 20%, transparent); }')).toEqual([]);
    expect(one('.a:not(:focus-visible) { box-shadow: 0 0 0 1px rgb(110 98 62 / 0.2); }')).toEqual([]);
    expect(one('.a[aria-invalid]:focus { box-shadow: 0 0 0 1.5px var(--ch-danger-600); }')).toEqual([]);
  });

  /**
   * The CONS-36 regression: a dark resting rule (`html[data-fw-theme='dark'] .x { box-shadow }`) outranks the light
   * `.x:focus-within` ring, so in dark the field showed no ring at all. Wherever a dark rule restyles a field's resting
   * ring, the same stylesheet restates its focus ring in dark too.
   */
  it('a dark resting rule never outranks a field’s focus ring', () => {
    const DARK = /^(?::where\()?html\[data-fw-theme='dark'\]\)?\s+/;
    const off: string[] = [];
    for (const f of walk(ROOT, /\.css$/)) {
      const light = new Map<string, Set<string>>();
      const darkFocus = new Set<string>();
      const darkRest: [string, string[], number][] = [];
      postcss.parse(readFileSync(f, 'utf8')).walkRules((r) => {
        const props = r.nodes.filter((n) => n.type === 'decl' && /^(box-shadow|outline)$/.test(n.prop)).map((n) => (n as { prop: string }).prop);
        if (!props.length) return;
        for (const s of r.selectors.map((x) => x.trim())) {
          const base = s.replace(DARK, '');
          const m = /^(.*?):focus(?:-visible|-within)?$/.exec(base);
          if (DARK.test(s)) {
            if (m) darkFocus.add(m[1]!);
            else darkRest.push([base, props, r.source?.start?.line ?? 0]);
          } else if (m) light.set(m[1]!, new Set([...(light.get(m[1]!) ?? []), ...props]));
        }
      });
      for (const [base, props, line] of darkRest) {
        if (props.some((p) => light.get(base)?.has(p)) && !darkFocus.has(base)) off.push(`${relative(ROOT, f)}:${line} ${base}`);
      }
    }
    expect(off).toEqual([]);
  });
});
