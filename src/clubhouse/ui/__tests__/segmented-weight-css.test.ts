import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The filter weight (owner, 11 Nov 2026, option B "white chip on a pale track") is drawn from existing tokens only: the
 * flat track the large view switch already uses, and a lifted ivory chip in ink. At night the chip is the raised surface.
 */
const css = readFileSync(join(__dirname, '../../styles/controls.css'), 'utf8');
const rule = (sel: string) => {
  const i = css.indexOf(`${sel} {`);
  expect(i, sel).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
};

describe('the filter weight of the segmented control', () => {
  it('a flat track and a lifted ivory chip in ink, from tokens', () => {
    const r = rule('.ch-seg--filter');
    expect(r).toContain('--ch-well-bg: var(--ch-well-bg-flat);');
    expect(r).toContain('--ch-well-shadow: inset 0 0 0 var(--ch-hairline-w) var(--ch-border-subtle);');
    expect(r).toContain('--ch-seg-on-bg: var(--ch-card-bg);');
    expect(r).toContain('--ch-seg-on-shadow: var(--ch-seg-pill-lift-shadow);');
    expect(r).toContain('--ch-seg-on-ink: var(--ch-text-primary);');
  });

  it('no letterpress edge on its labels, and the raised night surface for its chip at night', () => {
    expect(css).toMatch(/\.ch-seg--filter \.ch-seg__b,\s*\.ch-seg--filter \.ch-seg__b\.is-on \{\s*text-shadow: none;/);
    expect(rule(":where(html[data-fw-theme='dark']) .ch-seg--filter")).toContain('--ch-seg-on-bg: var(--ch-bg-elevated);');
  });

  it('never !important', () => {
    expect(css.match(/\.ch-seg--filter[^{]*\{[^}]*!important/g)).toBeNull();
  });
});
