import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// W43 (preview walk, 11 Nov): week blocks were too faint to see at a glance on a 1x screen. The light materials are one
// step stronger; the owner's rule of no side stripe holds.
const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/calendar.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const body = (sel: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1]!.replace(/\s+/g, ' ').trim() === sel)?.[2] ?? '';

describe('W43 the week blocks read at a glance', () => {
  it('practice is green-100 with a 0.24 ring', () => {
    const b = body('.ch-ev--practice, .ch-ev--workout');
    expect(b).toMatch(/background:\s*var\(--ch-green-100\)/);
    expect(b).toMatch(/rgb\(21 90 57 \/ 0\.24\)/);
  });

  it('a meeting is paper edged in border-strong', () => {
    expect(body('.ch-ev--meeting, .ch-ev--other')).toMatch(/inset 0 0 0 1px var\(--ch-border-strong\)/);
  });

  it('a class keeps its slate with a 0.24 ring', () => {
    expect(body('.ch-ev--class')).toMatch(/rgb\(45 92 119 \/ 0\.24\)/);
  });

  it('no block gains a side stripe', () => {
    for (const sel of ['.ch-ev--practice, .ch-ev--workout', '.ch-ev--meeting, .ch-ev--other', '.ch-ev--class']) expect(body(sel)).not.toMatch(/border-left|inset \d+px 0 0/);
  });
});
