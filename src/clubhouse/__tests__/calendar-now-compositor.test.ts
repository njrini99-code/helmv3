import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** F-0047 (audit 2026-10-29): the Calendar now-pill and now-dot pulse on opacity (compositor), never box-shadow (paint). */
describe('Calendar now pulses are compositor-only (F-0047)', () => {
  const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/calendar.css'), 'utf8');
  it('no @keyframes in calendar.css animates box-shadow', () => {
    // Each @keyframes block by brace matching (some sit inside an @media block).
    const frames: Array<[string, string]> = [];
    for (const m of css.matchAll(/@keyframes ([\w-]+) \{/g)) {
      let depth = 1;
      let i = m.index! + m[0].length;
      while (depth > 0 && i < css.length) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0, i++;
      frames.push([m[1]!, css.slice(m.index!, i)]);
    }
    expect(frames.length).toBeGreaterThan(0);
    for (const [name, body] of frames) expect(body, name).not.toMatch(/box-shadow/);
  });
});
