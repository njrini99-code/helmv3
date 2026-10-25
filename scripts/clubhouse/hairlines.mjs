#!/usr/bin/env node
/**
 * Audit row 36 (B3): the lines codemod. Applies an inventory of separator lines (review-notes codemod/lines.md, Appendix
 * A: `| file:line | \`selector\` | kind | \`before\` | \`after\` | rule |`) to the stylesheets: each 1px separator border,
 * ring, inset edge or 1px line element moves to `var(--ch-hairline-w)` (one device pixel on 2x and 3x), and a raw colour
 * moves to its token. Rows are matched by selector and the `before` fragment, in source order, never by line number, so
 * the inventory still applies after other edits have moved lines. A row with no match is reported, not guessed.
 *
 *   node scripts/clubhouse/hairlines.mjs <lines.md> [--apply]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({ options: { apply: { type: 'boolean' } }, allowPositionals: true });
const [inventory] = positionals;
if (!inventory) {
  console.log('usage: node scripts/clubhouse/hairlines.mjs <lines.md> [--apply]');
  process.exit(1);
}
const LANE_A = /\.ch-sidebar|\.ch-brand__fold|data-ch-pressed|:active/;
const dir = 'src/clubhouse/styles';
const md = readFileSync(inventory, 'utf8');
const section = md.slice(md.indexOf('## Appendix A'), md.indexOf('## Appendix B'));
const rows = [...section.matchAll(/^\| ([\w-]+\.css):(\d+) \| `([^`]+)` \| [\w-]+ \| `([^`]+)` \| `([^`]+)` \|/gm)].map((m) => ({
  file: m[1],
  line: Number(m[2]),
  selector: m[3].replace(/\s+/g, ' ').trim(),
  before: m[4],
  after: m[5],
}));

const byFile = Object.groupBy(rows, (r) => r.file);
let applied = 0;
const missed = [];
for (const [file, list] of Object.entries(byFile)) {
  const path = join(dir, file);
  let src = readFileSync(path, 'utf8');
  // Innermost rules in source order: [selector, body start, body end].
  const rules = [...src.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((m) => {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
    const start = m.index + m[1].length + 1;
    return { sel, start, end: start + m[2].length };
  });
  const edits = [];
  let cursor = 0;
  for (const row of list.sort((a, b) => a.line - b.line)) {
    let hit = null;
    for (const r of rules) {
      if (r.end < cursor || LANE_A.test(r.sel)) continue;
      const parts = r.sel.split(',').map((s) => s.trim());
      if (!parts.includes(row.selector) && !r.sel.endsWith(row.selector) && !r.sel.includes(row.selector)) continue;
      let at = src.indexOf(row.before, Math.max(r.start, cursor));
      // A fragment must stand alone: `1px` inside `11px` or `-1px` is a different value.
      while (at !== -1 && at < r.end && /[\w.-]/.test(src[at - 1] ?? ' ') && /^\d/.test(row.before)) at = src.indexOf(row.before, at + 1);
      if (at !== -1 && at + row.before.length <= r.end) {
        hit = at;
        break;
      }
    }
    if (hit === null) {
      missed.push(`${file}:${row.line} ${row.selector}: ${row.before}`);
      continue;
    }
    edits.push([hit, row.before.length, row.after]);
    cursor = hit + row.before.length;
  }
  for (const [at, len, after] of edits.sort((a, b) => b[0] - a[0])) src = src.slice(0, at) + after + src.slice(at + len);
  applied += edits.length;
  if (values.apply && edits.length) writeFileSync(path, src);
}
console.log(`${applied} of ${rows.length} lines onto the hairline width${values.apply ? '' : ' (dry run; pass --apply)'}`);
for (const m of missed) console.log(`  no match: ${m}`);
