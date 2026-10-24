import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './_scan';

/** Row 41: one scroll-edge shade for floating bars, from one token pair, in place of a hard hairline. */
const read = (f: string) => readFileSync(join(ROOT, 'styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (src: string, sel: string) => src.slice(src.indexOf(`${sel} {`), src.indexOf('}', src.indexOf(`${sel} {`)));

describe('scroll edge under floating bars (row 41)', () => {
  it('is one token pair', () => {
    const t = read('tokens.css');
    expect(t).toMatch(/--ch-scroll-edge-h: 14px;/);
    expect(t).toMatch(/--ch-scroll-edge-down: linear-gradient\(var\(--ch-scroll-edge-ink\), transparent\);/);
    expect(t).toMatch(/--ch-scroll-edge-up: linear-gradient\(to top, var\(--ch-scroll-edge-ink\), transparent\);/);
  });
  it.each([
    ['shell.css', "[data-ui='clubhouse'] .ch-topbar::before", 'down'],
    ['rounds-track.css', '\n.ch-rt-bar::before', 'up'],
    ['rounds-setup.css', "  .ch-rsu[data-ui='clubhouse'] .ch-rsu-dock::before", 'up'],
  ])('%s %s draws the shade', (file, sel, dir) => {
    const body = rule(read(file), sel);
    expect(body).toContain('height: var(--ch-scroll-edge-h);');
    expect(body).toContain(`background: var(--ch-scroll-edge-${dir});`);
  });
  it('the desktop top bar has no constant hairline: the shade shows once the canvas has scrolled, light and dark', () => {
    const shell = read('shell.css');
    const desk = shell.slice(shell.indexOf("@media (min-width: 821px) {\n  [data-ui='clubhouse'] .ch-topbar {"));
    expect(desk).toMatch(/^@media \(min-width: 821px\) \{\s*\[data-ui='clubhouse'\] \.ch-topbar \{\s*border-bottom-color: transparent;/);
    const before = rule(desk, "[data-ui='clubhouse'] .ch-topbar::before");
    expect(before).toContain('height: var(--ch-scroll-edge-h);');
    expect(before).toContain('background: var(--ch-scroll-edge-down);');
    expect(before).toContain('opacity: 0;');
    expect(rule(desk, "[data-ui='clubhouse'] .ch-topbar[data-scrolled]::before")).toContain('opacity: 1;');
    // The night bar no longer puts the hairline back.
    expect(shell).not.toMatch(/html\[data-fw-theme='dark'\] \.ch-topbar \{[^}]*border-bottom-color/);
  });
  it('the Track bar has no hard top hairline', () => {
    expect(rule(read('rounds-track.css'), '\n.ch-rt-bar')).toMatch(/box-shadow: none;/);
  });
});
