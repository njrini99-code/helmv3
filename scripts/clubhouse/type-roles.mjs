#!/usr/bin/env node
/**
 * B1's screen-by-screen move onto the type roles (tokens.css `--ch-type-<n>`, `-medium`, `-strong`). For one stylesheet
 * at a time, each `font: <400|500|600> calc(<step> * var(--ch-type-k))/<leading> var(--ch-font-sans|serif);` becomes
 * the role of the same size and weight, so no size or weight ever changes:
 *
 *   - multi-line text (leading over 1.15) takes the role's own leading: the point of B1, wrapped text gets air;
 *   - a single line (leading 1.15 or under: pills, tabs, figures) keeps its line height on the next line, so no box moves.
 *
 * Left as written: pixel sizes (fixed on purpose: charts, badges), sizes off the steps (big figures), 700, italics and
 * anything else. Tracking is not touched. A dry run by default: it prints each change. `--apply` writes.
 *
 *   node scripts/clubhouse/type-roles.mjs src/clubhouse/styles/settings.css [--apply]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({ options: { apply: { type: 'boolean' }, help: { type: 'boolean' } }, allowPositionals: true });
if (values.help || positionals.length === 0) {
  console.log('usage: node scripts/clubhouse/type-roles.mjs <stylesheet.css> [--apply]');
  process.exit(values.help ? 0 : 1);
}

const STEPS = new Set([11, 12, 13, 14, 15, 16, 17, 20, 22, 28, 34]);
const WEIGHT = { 400: '', 500: '-medium', 600: '-strong' };
const decl = /^(\s*)font: (400|500|600) calc\((\d+) \* var\(--ch-type-k\)\)\s*\/\s*([\d.]+) var\(--ch-font-(?:sans|serif)\);$/;

for (const file of positionals) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const out = [];
  let moved = 0;
  let kept = 0;
  for (const line of lines) {
    const m = decl.exec(line);
    if (!m || !STEPS.has(Number(m[3]))) {
      out.push(line);
      continue;
    }
    const [, indent, weight, size, leading] = m;
    const role = `${indent}font: var(--ch-type-${size}${WEIGHT[weight]});`;
    out.push(role);
    if (Number(leading) <= 1.15) {
      out.push(`${indent}line-height: ${leading};`);
      kept += 1;
    }
    moved += 1;
    if (!values.apply) console.log(`${file}: ${line.trim()}  ->  ${role.trim()}${Number(leading) <= 1.15 ? ` + line-height: ${leading}` : ''}`);
  }
  console.log(`${file}: ${moved} onto roles (${kept} single-line, line height kept)${values.apply ? '' : ' (dry run; pass --apply)'}`);
  if (values.apply) writeFileSync(file, out.join('\n'));
}
