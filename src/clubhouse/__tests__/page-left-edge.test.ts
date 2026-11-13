import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// W40 (owner's preview, 11 Nov 2026): on a desk every page opens on one left edge; Practice's main was centred on its own and
// sat 76px right of the others at 1920, so its title jumped between tabs.
const shell = readFileSync(join(process.cwd(), 'src/clubhouse/styles/shell.css'), 'utf8');

describe('one left edge for desk pages (W40)', () => {
  it('the shared edge rule takes Practice’s pages', () => {
    const rule = shell.match(/\[data-ui='clubhouse'\] main:is\(([^)]*)\):not\(\[data-ch='your-week'\]\) \{\s*margin-inline: max\(0px, calc\(\(100vw - var\(--ch-sidebar-w\) - var\(--ch-measure-wide\)\) \/ 2\)\) auto;/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain('.ch-prc');
  });
});

// W40 (owner, 12 Nov 2026: "two widths, normal and wide"): the boards share one wide box.
describe('two page widths (W40)', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/styles', f), 'utf8');
  it('Calendar, the Team board and Stats with a detail open all stop at the wide measure', () => {
    expect(read('calendar.css')).toMatch(/\.ch-cal \{[^}]*max-width: var\(--ch-measure-wide\)/);
    expect(read('coachhelm-team.css')).toMatch(/\.ch-htb\.is-desk \{[^}]*max-width: var\(--ch-measure-wide\);/);
    expect(read('stats-redesign.css')).toMatch(/\.ch-st--shs:has\(\.ch-shs-desk:not\(\.is-alone\)\) \{\s*max-width: var\(--ch-measure-wide\);/);
  });
});
