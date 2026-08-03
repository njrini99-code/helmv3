/**
 * #1249 — the roster's per-row controls must stay at the 44px touch floor.
 *
 * Measured on the production build at 390×844, each control's own border box:
 *
 *     Set intent for <player>                 88 × 20   (one per roster row)
 *     Player status: Active. Change status    76 × 24   (one per roster row)
 *
 * against a 44×44 reference floor (Apple HIG) / 48×48 dp (Material). These two
 * are the worst case rather than the smallest: they are the PRIMARY per-row
 * actions, stacked in a list, so adjacent rows fall inside a single thumb
 * contact patch — a miss doesn't do nothing, it hits the neighbouring player's
 * control.
 *
 * Both triggers deliberately wrap a non-interactive StatusPill and their own
 * comments record that they keep that chrome exactly, so the existing
 * `.touch-target` utility (which sets min-height/min-width and would inflate
 * the pill) is the wrong tool. `.fw-touch-hit` grows an invisible ::after box
 * instead: visual size unchanged, hit box at 44px. Verified live at 390×844 —
 * visual 88×20 / 76×24, hit 88×44 / 76×44.
 *
 * This is a source assertion, not a render test, and deliberately so: the way
 * this regresses is someone dropping the class while tidying a className list,
 * or deleting the utility it depends on. A jsdom render cannot measure a
 * ::after box at all (no layout), and the real geometry is already pinned by
 * the live measurement above. The honest follow-up is the app-wide Playwright
 * sweep the issue proposes for e2e/mobile-viewports.spec.ts; it is NOT added
 * here because that suite runs against CI-seeded BASEBALL storage state and a
 * golf-authenticated pass could not be run locally to prove it green.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('roster per-row controls keep a 44px hit area (#1249)', () => {
  it.each([
    ['src/components/fairway/pages/roster/FairwayIntentControl.tsx', 'Set intent'],
    ['src/components/fairway/pages/roster/FairwayPlayerStatusBadge.tsx', 'Player status'],
  ])('%s applies fw-touch-hit', (file, control) => {
    expect(
      read(file),
      `${control} is a primary per-row roster action measured at under half the ` +
        `44px touch floor. It must keep the 'fw-touch-hit' class, which expands ` +
        `the hit box without changing the StatusPill's visual size.`,
    ).toContain('fw-touch-hit');
  });

  it('the fw-touch-hit utility still defines a 44px floor', () => {
    const css = read('src/app/globals.css');
    expect(css).toContain('.fw-touch-hit::after');
    // Pull the rule body and assert the floor, so shrinking it below 44px
    // fails here rather than silently un-fixing both call sites.
    const body = css.slice(css.indexOf('.fw-touch-hit::after'));
    const rule = body.slice(0, body.indexOf('}'));
    expect(rule).toMatch(/min-height:\s*44px/);
    expect(rule).toMatch(/min-width:\s*44px/);
  });
});
