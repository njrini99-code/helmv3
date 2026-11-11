import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/qualifiers.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The sheet split in two: what is inside its phone blocks, and everything else. */
function split(src: string): { phone: string; rest: string } {
  const open = '@media (max-width: 820px), (max-height: 500px) and (pointer: coarse) {';
  const inside: string[] = [];
  const outside: string[] = [];
  let from = 0;
  for (let at = src.indexOf(open); at !== -1; ) {
    let depth = 0;
    let i = src.indexOf('{', at);
    const start = i + 1;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) break;
    }
    inside.push(src.slice(start, i));
    outside.push(src.slice(from, at));
    from = i + 1;
    at = src.indexOf(open, from);
  }
  outside.push(src.slice(from));
  return { phone: inside.join('\n'), rest: outside.join('\n') };
}
const sheet = split(css);

describe('Manage selections while it loads, on a phone', () => {
  it('draws the steps as the loaded page does: one row, one name', () => {
    const p = sheet.phone;
    // Loaded, the phone names only the step you are on.
    expect(p).toMatch(/\.ch-qfs-steps li:not\(\.is-now\) \.ch-qfs-steps__l\s*\{[^}]*clip-path/);
    // Loading, only the first step keeps its name bar: three bars wrapped the strip to two rows (76 against 36).
    expect(p).toMatch(/\.ch-qfs\[aria-busy='true'\] \.ch-qfs-steps li:not\(:first-child\) > \.ch-skel:last-child\s*\{\s*display:\s*none;/);
  });

  it('a desk keeps a name bar on each step, as its loaded strip names all three', () => {
    expect(sheet.rest).not.toMatch(/\.ch-qfs\[aria-busy='true'\] \.ch-qfs-steps li:not\(:first-child\) > \.ch-skel:last-child/);
  });
});

describe('the phone qualifier’s row of page keys', () => {
  it('holds Manage selections and Close qualifier on one line at the default size, and wraps Close under at a larger Text Size', () => {
    const p = sheet.phone;
    expect(p).toMatch(/\.ch-qfm-acts\s*\{[^}]*flex-wrap:\s*wrap;/);
    // Beside a neighbour Close keeps its own width (999 to 1 of the spare room); alone on a wrapped line it takes the row.
    expect(p).toMatch(/\.ch-qfm-acts \.ch-btn:first-child:not\(:last-child\)\s*\{\s*flex:\s*999 1 0%;/);
    expect(p).toMatch(/\.ch-qfm-acts \.ch-btn:last-child:not\(:first-child\)\s*\{\s*flex:\s*1 0 auto;/);
    // Each key is 36 drawn and 44 to the finger; two wrapped lines are 8 apart, so their reaches meet and never overlap.
    expect(p).toMatch(/\.ch-qfm-acts \.ch-btn::before\s*\{[^}]*inset:\s*-4px 0;/);
    expect(p).toMatch(/\.ch-qfm-acts\s*\{[^}]*gap:\s*8px;/);
  });
});
