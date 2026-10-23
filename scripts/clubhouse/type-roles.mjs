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
 * anything else. A dry run by default: it prints each change. `--apply` writes.
 *
 * `--tracking` does the second half instead: in a rule whose size is a step (a role, or a step-sized `font`/`font-size`),
 * a negative `letter-spacing` off the role set becomes that step's `var(--ch-track-<n>)`. Rules with no step size (large
 * figures), positive tracking (codes, initials, file badges) and `inherit` are left.
 *
 *   node scripts/clubhouse/type-roles.mjs src/clubhouse/styles/settings.css [--tracking] [--apply]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({ options: { apply: { type: 'boolean' }, tracking: { type: 'boolean' }, help: { type: 'boolean' } }, allowPositionals: true });
if (values.help || positionals.length === 0) {
  console.log('usage: node scripts/clubhouse/type-roles.mjs <stylesheet.css> [--tracking] [--apply]');
  process.exit(values.help ? 0 : 1);
}

const STEPS = new Set([11, 12, 13, 14, 15, 16, 17, 20, 22, 28, 34]);
const WEIGHT = { 400: '', 500: '-medium', 600: '-strong' };
const decl = /^(\s*)font: (400|500|600) calc\((\d+) \* var\(--ch-type-k\)\)\s*\/\s*([\d.]+) var\(--ch-font-(?:sans|serif)\);$/;

const ROLE_TRACK = /^(var\(--ch-track-[a-z0-9-]+\)|0|normal|inherit|0\.01em|-0\.01em|-0\.02em|-0\.03em|-0\.038em)$/;
/** The step a rule's text is set in, from its role or its step-sized font or font-size, or null. */
function stepOf(block) {
  const m =
    /font:\s*var\(--ch-type-(\d+)(?:-medium|-strong)?\)/.exec(block) ??
    /font(?:-size)?:\s*(?:\d{3}\s+)?(?:calc\((\d+) \* var\(--ch-type-k\)\)|(\d+)px)/.exec(block);
  const n = m ? Number(m[1] ?? m[2] ?? m[3]) : NaN;
  return STEPS.has(n) ? n : null;
}

if (values.tracking) {
  for (const file of positionals) {
    const src = readFileSync(file, 'utf8');
    let moved = 0;
    // Innermost blocks only: a declaration never holds a brace, so the text between a `{` and the next `}` is one rule's body.
    const next = src.replace(/\{([^{}]*)\}/g, (whole, body) => {
      const step = stepOf(body);
      if (step === null) return whole;
      return `{${body.replace(/letter-spacing:\s*([^;]+);/g, (decl, v) => {
        // Positive tracking is deliberate (a join code, initials, a file badge): it keeps its value.
        if (ROLE_TRACK.test(v.trim()) || !v.trim().startsWith('-')) return decl;
        moved += 1;
        if (!values.apply) console.log(`${file}: ${decl}  ->  letter-spacing: var(--ch-track-${step});`);
        return `letter-spacing: var(--ch-track-${step});`;
      })}}`;
    });
    console.log(`${file}: ${moved} letter-spacing onto the step's tracking${values.apply ? '' : ' (dry run; pass --apply)'}`);
    if (values.apply && next !== src) writeFileSync(file, next);
  }
  process.exit(0);
}

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
