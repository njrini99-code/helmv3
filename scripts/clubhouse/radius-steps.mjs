#!/usr/bin/env node
/**
 * Audit row 35 (B3): the shape codemod (review-notes codemod/shape.md section 3). The radius scale is four steps, 8 / 12
 * / 16 / 20 (`--ch-radius-sm|md|lg|xl`), with a floor (`xs`, 4), `--ch-radius-mark` (2) for chart marks and thin bars,
 * and `--ch-radius-tail` (6) for the Messages bubble tail. For one stylesheet at a time, each raw px corner becomes:
 *
 *   1. `999px` when it is at least half the rule's own px height or min-height (a capsule), and `99px` always;
 *   2. the tail token for Messages' 6px corners;
 *   3. a nested inner corner, `max(var(--ch-radius-xs), calc(var(--ch-radius-<outer>) - var(--ch-space-<pad>)))`, where
 *      one was hand-written as `calc(var(--ch-radius-<outer>) - <pad>px)` (the pad on the 4pt scale: 3 -> 4);
 *   4. the mark token for 1-3px;
 *   5. xs for 4-5px;
 *   6. the nearest step for 6px and up, a tie rounding up (6 -> 8, 10 -> 12, 14 -> 16, 22-28 -> 20), and 20 for
 *      anything larger that is not a capsule.
 *
 * Left as written: 0, 50%, 999px, inherit, tokens, percentages, the Messages composer field (a capsule at one line that
 * grows), and lane A's selectors. A dry run by default; `--apply` writes.
 *
 *   node scripts/clubhouse/radius-steps.mjs src/clubhouse/styles/stats.css [--apply]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({ options: { apply: { type: 'boolean' }, help: { type: 'boolean' } }, allowPositionals: true });
if (values.help || positionals.length === 0) {
  console.log('usage: node scripts/clubhouse/radius-steps.mjs <stylesheet.css> [--apply]');
  process.exit(values.help ? 0 : 1);
}

const STEP = [
  [8, 'sm'],
  [12, 'md'],
  [16, 'lg'],
  [20, 'xl'],
];
const SPACE = { 2: '0_5', 3: '1', 4: '1', 5: '1', 6: '1_5', 8: '2', 12: '3' };
const LANE_A = /\.ch-sidebar|\.ch-brand__fold|data-ch-pressed|:active/;

function corner(v, capsule, tail) {
  if (v === 99 || (capsule && v >= capsule / 2)) return '999px';
  if (tail && v === 6) return 'var(--ch-radius-tail)';
  if (v <= 3) return 'var(--ch-radius-mark)';
  if (v <= 5) return 'var(--ch-radius-xs)';
  if (v > 20) return 'var(--ch-radius-xl)';
  const [, name] = [...STEP].sort((a, b) => Math.abs(a[0] - v) - Math.abs(b[0] - v) || b[0] - a[0])[0];
  return `var(--ch-radius-${name})`;
}

for (const file of positionals) {
  const src = readFileSync(file, 'utf8');
  const messages = basename(file) === 'messages.css';
  let moved = 0;
  const next = src.replace(/([^{}]*)\{([^{}]*)\}/g, (whole, sel, body) => {
    const selector = sel.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (LANE_A.test(selector) || (messages && /comp__field/.test(selector))) return whole;
    const h = /(?:^|[\s;])(?:min-)?height:\s*(\d+(?:\.\d+)?)px/.exec(body);
    const capsule = h ? Number(h[1]) : 0;
    const out = body.replace(/(border(?:-[a-z]+)*-radius:\s*)([^;]+);/g, (d, prop, value) => {
      let after = value.replace(
        /calc\(var\(--ch-radius-([a-z]+)\) - (\d+)px\)/g,
        (c, outer, pad) => (SPACE[pad] ? `max(var(--ch-radius-xs), calc(var(--ch-radius-${outer}) - var(--ch-space-${SPACE[pad]})))` : c),
      );
      if (!after.includes('max(')) after = after.replace(/(?<![\w.(-])(\d+(?:\.\d+)?)px\b/g, (p, n) => (Number(n) === 999 ? p : corner(Number(n), capsule, messages)));
      if (after === value) return d;
      moved += 1;
      if (!values.apply) console.log(`${file}: ${selector.split('\n').pop()?.trim()} { ${value.trim()} -> ${after.trim()} }`);
      return `${prop}${after};`;
    });
    return out === body ? whole : `${sel}{${out}}`;
  });
  console.log(`${file}: ${moved} corners onto the radius steps${values.apply ? '' : ' (dry run; pass --apply)'}`);
  if (values.apply && next !== src) writeFileSync(file, next);
}
