import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/recruiting.css'), 'utf8');
/** The declarations of the last rule whose selector is exactly `selector`. */
const rule = (selector: string): string => {
  const at = css.lastIndexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};
const P = '.ch-rec[data-canopy] .ch-rec-panel';

/**
 * W42 (12 Nov): the desktop prospect pane stacked three empty states (Contact, Notes, Documents), each an icon tile, a
 * bold line, a grey line and its Add. Under its heading an empty part is one line now, what is missing and its Add, so
 * the pane reads as a form waiting to be filled. The longer line describes the Add for a screen reader. The phone already draws
 * them as rows on seams (its headings hidden), and keeps that.
 */
describe('Recruiting, the desktop prospect pane: an empty part is one line', () => {
  it('draws no icon tile', () => {
    expect(rule(`${P} .ch-rec-empty__ic`)).toContain('display: none');
  });

  it('says what is missing in the regular secondary line, not a bold title', () => {
    const b = rule(`${P} .ch-rec-empty__t b`);
    expect(b).toContain('font: var(--ch-type-14)');
    expect(b).toContain('color: var(--ch-text-secondary)');
  });

  it('draws the longer line no more (it describes the Add instead: recruiting.test, CH-14303)', () => {
    expect(rule(`${P} .ch-rec-empty__t span`)).toContain('display: none');
  });

  it('leaves the phone’s rows on seams alone', () => {
    expect(css).toMatch(/\.ch-recm-det \.ch-rec-empty \{\s*gap: 16px;/);
  });
});
