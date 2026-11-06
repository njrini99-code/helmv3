import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), 'src/clubhouse', p), 'utf8');

describe('Home, Classes and Roster against their designs (owner, 2026-11-06)', () => {
  it('a sheet title takes focus without drawing a ring', () => {
    expect(read('styles/ui.css')).toContain(":focus-visible:not([tabindex='-1'])");
  });

  it('a drawn sheet keeps its actions under the content', () => {
    expect(read('styles/controls.css')).toMatch(/\.ch-modal\[data-ch-detent\] \.ch-modal__body \{\s*flex: 0 1 auto;/);
  });

  it('the profile cards sit 16 apart, not a gap plus a margin', () => {
    const css = read('styles/roster.css');
    expect(css).toMatch(/\.ch-rsx-prof \{\s*gap: 16px;/);
    expect(css).toMatch(/\.ch-rsx-prof > \.ch-rsx-sec \{\s*margin-top: 0;/);
  });

  it('a long leader name is cut inside its card', () => {
    expect(read('styles/roster.css')).toMatch(/\.ch-rs-ldr__p \{\s*max-width: 100%;/);
  });
});
