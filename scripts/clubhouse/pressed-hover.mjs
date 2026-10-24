#!/usr/bin/env node
/**
 * Auditor B6: iOS can paint `:active` on the first frame of a scroll, so a row the finger only passes over flashes its
 * pressed look. The press controller (lib/press.ts) marks a real press with `data-ch-pressed` after its delay, so on
 * touch that is the only pressed signal a rule should read. For one stylesheet at a time, each rule whose selector holds
 * `:is(:active, [data-ch-pressed])` keeps `[data-ch-pressed]` in place, and a copy right after it, inside
 * `@media (hover: hover)`, carries the `:active` half for a mouse and the keyboard. A rule already inside a hover query
 * keeps both. Only the selector line changes and the copy is inserted, so merges stay hunk-local. Dry run by default.
 *
 *   node scripts/clubhouse/pressed-hover.mjs src/clubhouse/styles/ui.css [--apply]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import postcss from 'postcss';

const { values, positionals } = parseArgs({ options: { apply: { type: 'boolean' } }, allowPositionals: true });
if (positionals.length === 0) {
  console.log('usage: node scripts/clubhouse/pressed-hover.mjs <stylesheet.css> [--apply]');
  process.exit(1);
}
const BOTH = ':is(:active, [data-ch-pressed])';
const inHover = (node) => {
  for (let p = node.parent; p; p = p.parent) if (p.type === 'atrule' && p.name === 'media' && /hover:\s*hover/.test(p.params)) return true;
  return false;
};

for (const file of positionals) {
  const src = readFileSync(file, 'utf8');
  const edits = [];
  postcss.parse(src, { from: file }).walkRules((rule) => {
    if (!rule.selector.includes(BOTH) || inHover(rule)) return;
    const start = rule.source.start.offset;
    const end = rule.source.end.offset; // postcss: one past the closing brace
    const text = src.slice(start, end);
    const open = text.indexOf('{');
    const head = text.slice(0, open);
    const body = text.slice(open);
    const indent = /([ \t]*)$/.exec(src.slice(0, start))[1];
    const pressed = rule.selectors.filter((s) => s.includes(BOTH));
    const copy = pressed.map((s) => s.split(BOTH).join(':active')).join(`,\n${indent}  `);
    const inner = body.replace(/\n/g, '\n  ');
    edits.push([start, end, `${head.split(BOTH).join('[data-ch-pressed]')}${body}\n${indent}@media (hover: hover) {\n${indent}  ${copy} ${inner}\n${indent}}`]);
  });
  if (!values.apply) for (const [a] of edits) console.log(`${file}: ${src.slice(a, src.indexOf('{', a)).trim().split('\n').pop()}`);
  let out = src;
  for (const [a, b, t] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + t + out.slice(b);
  console.log(`${file}: ${edits.length} pressed rules split${values.apply ? '' : ' (dry run; pass --apply)'}`);
  if (values.apply && edits.length) writeFileSync(file, out);
}
