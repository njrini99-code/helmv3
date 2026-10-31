import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** F-0049 (audit 2026-10-29): a control scrolled or tabbed into view on New round lands clear of the sticky dock. */
describe('New round controls clear the dock (F-0049)', () => {
  const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/rounds-setup.css'), 'utf8');
  it('the dock height is a variable and every control keeps that much (plus air) below it', () => {
    expect(css).toMatch(/\.ch-rsu \{[^}]*--ch-rsu-dock-h: 60px;/);
    expect(css).toMatch(/\.ch-rsu :is\(button, input, select, \[role='radio'\]\) \{\s*scroll-margin-bottom: calc\(var\(--ch-rsu-dock-h\) \+ 32px\);/);
  });
});
