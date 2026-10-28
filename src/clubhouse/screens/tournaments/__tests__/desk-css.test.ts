import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/tournaments-desk.css'), 'utf8');
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

describe('event desk hole grid colours', () => {
  it('draws the Team vs par row under par in the score-under red (D-42), never the chart gain green', () => {
    const under = rule('.ch-tour-desk-heat.is-under');
    expect(under).toMatch(/background:\s*var\(--ch-score-under-bg\)/);
    expect(under).toMatch(/color:\s*var\(--ch-score-under\)/);
    expect(under).not.toMatch(/--ch-chart-gain/);
  });
});
