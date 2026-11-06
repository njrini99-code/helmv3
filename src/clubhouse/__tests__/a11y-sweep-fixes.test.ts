import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (file: string) => readFileSync(join(process.cwd(), 'src/clubhouse', file), 'utf8');

/** What clubhouse:a11y found once its stale selectors could reach these screens (redesign sweep, PR 2). */
describe('accessibility fixes from the sweep', () => {
  it('a crash paints its own page: on a phone .ch-root is the frame green and the body text sat on it at 1.2:1', () => {
    expect(src('styles/shell.css')).toMatch(/\.ch-root > \.ch-notyet \{[^}]*background: var\(--ch-canvas-wash\), var\(--ch-bg-page\)/);
  });

  it('the developer detail scrolls with the keyboard', () => {
    expect(src('ui/Notices.tsx')).toContain('<pre className="ch-notyet__dev" tabIndex={0}>');
  });

  it('the season figures hold only dt and dd inside their groups', () => {
    const profile = src('screens/roster/RosterProfileCrh.tsx');
    expect(profile).not.toContain('<span className="ch-rsx-figs__f"');
    expect(profile).toContain('<dd className="ch-rsx-figs__f">Index</dd>');
    expect(src('styles/roster.css')).toContain('.ch-rsx-figs dd.ch-rsx-figs__f');
  });
});
