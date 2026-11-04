import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { legBarWidth } from '../TeamLegs';

/** Coach Home behind clubhouse_classes_roster_home_v1 (classes-roster-home 08 PR 10). */
const css = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/styles', f), 'utf8');
const lane = css('home.css').slice(css('home.css').indexOf('Coach Home, phone (clubhouse_classes_roster_home_v1'));

describe('the coach phone block', () => {
  it('fills the hero with the frame and has no hex colours', () => {
    expect(lane).toContain('background: var(--ch-frame);');
    expect(lane).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
  it('the hero-mode bar is the frame only under the lane', () => {
    expect(css('shell.css')).toMatch(/\.ch-root\[data-ch-crh='on'\]\[data-phone-hero\]:has\([^)]*\) \.ch-topbar \{\s*background: var\(--ch-frame\);/);
  });
  it('gives a capsule a 44 target on its 34', () => {
    expect(lane).toContain('min-height: 34px;');
    expect(lane).toContain('inset: -5px 0;');
  });
});

describe('legBarWidth', () => {
  it('is |sg| / 3.5 of the half, capped at the half', () => {
    expect(legBarWidth(1.75)).toBe(25);
    expect(legBarWidth(-9)).toBe(50);
    expect(legBarWidth(null)).toBe(0);
  });
});
