#!/usr/bin/env node
/**
 * Audit row 33 (B2): the 4pt spacing codemod (review-notes codemod/spacing.md, rule R and exceptions X1-X6). For one
 * stylesheet at a time, every integer px value from 3 to 47 that is not a scale step (2, 4, 6, 8, 12, 16, 20, 24, 32,
 * 40, 48), in a padding, margin, gap, row-gap or column-gap declaration (and their longhands) or a spacing custom
 * property (`--ch-*pad|gap|gutter|inset|space*`), moves to the nearest step; a tie goes to the coarser grid (10 -> 8,
 * 14 -> 16, 18 -> 16, 22 -> 24, 28 -> 32, 36 -> 32, 44 -> 48). The sign is kept, so a negative margin stays paired with
 * the padding it cancels. On-scale raw px stay raw.
 *
 * Left as written: sub-pixel nudges (X1), px inside a `calc(... * Npx)` multiplier (X2), values above 48 (X3, layout
 * clearances), page roots (a declaration on a `--ch-page-*` token, and the gap of a rule padded by one: page meaning,
 * CONS-34 / OQ-63), the tablet `--ch-page-gutter`, and lane A's selectors (the sidebar fold, Ask's pressed looks).
 * X5: in a rule for an interactive control with no height of its own, vertical padding rounds up, never down, so a
 * tap target never shrinks.
 *
 * A dry run by default: it prints each change. `--apply` writes. Only the changed values are replaced.
 *
 *   node scripts/clubhouse/spacing-scale.mjs src/clubhouse/styles/stats.css [--apply]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({ options: { apply: { type: 'boolean' }, help: { type: 'boolean' } }, allowPositionals: true });
if (values.help || positionals.length === 0) {
  console.log('usage: node scripts/clubhouse/spacing-scale.mjs <stylesheet.css> [--apply]');
  process.exit(values.help ? 0 : 1);
}

const STEPS = [2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48];
const twos = (n) => (n % 2 ? 0 : 1 + twos(n / 2));
/** Rule R: the nearest step, a tie to the step with more factors of 2. `up` (X5) takes the next step up instead. */
function step(v, up = false) {
  if (up) return STEPS.find((s) => s >= v);
  return [...STEPS].sort((a, b) => Math.abs(a - v) - Math.abs(b - v) || twos(b) - twos(a))[0];
}
const offScale = (v) => Number.isInteger(v) && v >= 3 && v <= 47 && !STEPS.includes(v);

const PROP = /^(\s*)((?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?|--ch-[a-z0-9-]*(?:pad|gap|gutter|inset|space)[a-z0-9-]*):\s*([^;]+);/;
const CONTROL = /button|input|textarea|select|btn|chip|seg|pill|toggle|tab|field|__send|__close|__action/;
const LANE_A = /\.ch-sidebar|\.ch-brand__fold|data-ch-pressed|:active/;

/** Moves each off-scale px in `value`; `vertical(i)` says whether the i-th top-level part is a block-axis padding. */
function remap(value, vertical) {
  let part = 0;
  let depth = 0;
  let out = '';
  for (let i = 0; i < value.length; ) {
    const ch = value[i];
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (/\s/.test(ch) && depth === 0) {
      part += 1;
      while (i < value.length && /\s/.test(value[i])) out += value[i++];
      continue;
    }
    const m = /^(-?)(\d+(?:\.\d+)?)px\b/.exec(value.slice(i));
    const prev = value[i - 1] ?? ' ';
    if (m && !/[\w.-]/.test(prev)) {
      const v = Number(m[2]);
      // X2: a multiplier inside a calc() (`* 12px` or `12px *`) scales something else; leave it.
      const multiplier = /\*\s*$/.test(value.slice(0, i)) || /^\s*\*/.test(value.slice(i + m[0].length));
      out += offScale(v) && !multiplier ? `${m[1]}${step(v, depth === 0 && vertical(part))}px` : m[0];
      i += m[0].length;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

for (const file of positionals) {
  const src = readFileSync(file, 'utf8');
  let moved = 0;
  const next = src.replace(/([^{}]*)\{([^{}]*)\}/g, (whole, sel, body) => {
    const selector = sel.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (LANE_A.test(selector)) return whole;
    const pageRoot = /var\(--ch-page-/.test(body);
    const control = CONTROL.test(selector) && !/(?:^|[\s;])(?:height|min-height|block-size|min-block-size):/.test(body);
    const lines = body.split('\n').map((line) => {
      const m = PROP.exec(line);
      if (!m) return line;
      const [decl, indent, prop, value] = m;
      if (/var\(--ch-page-/.test(value) || (pageRoot && /^(?:gap|row-gap)$/.test(prop)) || prop === '--ch-page-gutter') return line;
      const parts = value.trim().split(/\s+(?![^(]*\))/).length;
      const vertical = (i) => {
        if (!control) return false;
        if (/^padding-(?:top|bottom|block(?:-start|-end)?)$/.test(prop)) return true;
        if (prop !== 'padding') return false;
        return parts === 1 || i === 0 || (parts >= 3 && i === 2);
      };
      const after = remap(value, vertical);
      if (after === value) return line;
      moved += 1;
      if (!values.apply) console.log(`${file}: ${selector.split('\n').pop()?.trim()} { ${prop}: ${value.trim()} -> ${after.trim()} }`);
      return line.replace(decl, `${indent}${prop}: ${after};`);
    });
    const out = lines.join('\n');
    return out === body ? whole : `${sel}{${out}}`;
  });
  console.log(`${file}: ${moved} declarations onto the 4pt scale${values.apply ? '' : ' (dry run; pass --apply)'}`);
  if (values.apply && next !== src) writeFileSync(file, next);
}
