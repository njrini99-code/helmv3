/**
 * The Ask CoachHelm launcher is `position: fixed` and nothing reserves space
 * beneath it, so it paints on top of page content.
 *
 * Measured in production 2026-08-17 as coach Nick Rini on
 * `/golf/dashboard/stats/team`, viewport 1440 (issue #1478):
 *
 *   FAB box            x 1345-1401, y 699-755
 *   `Top performer`    x 1247, y 692   <- underneath
 *   `▲ Most improved`  x 1247, y 750   <- underneath
 *
 * Signal is the column a coach scans first, and the two occluded values are the
 * two that identify who to talk to.
 *
 * The z-index does not save it. The class reads
 * `z-[var(--fw-z-nav,40)]`, but the fallback never applies — `--fw-z-nav` IS
 * defined, as `20` (design-tokens.css:269). So the launcher sits on the nav
 * layer, above ordinary content, and the `40` in the source misleads anyone
 * reading it into thinking it is higher than it is. This is the two-ladder
 * footgun the design-system rules warn about, showing up as a real overlap.
 *
 * Geometry: `bottom-6` (24px) + `h-14` (56px) means the launcher occupies the
 * bottom 80px of the viewport. Content needs at least that much clearance.
 *
 * WHY A SOURCE-CONTRACT TEST. jsdom does not lay out fixed positioning, so a
 * render test cannot observe the overlap — asserting on it would be an
 * instrument that cannot show the bug. This pins the invariant that actually
 * prevents it: the layout that MOUNTS the launcher also reserves room for it,
 * on the same condition and at the same breakpoint. Same approach as
 * `format-to-par-single-source.test.ts` and the form-a11y source scan.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LAYOUT = join(
  process.cwd(),
  'src/app/golf/(dashboard)/dashboard/layout.tsx',
);
const FAB = join(
  process.cwd(),
  'src/components/golf/coachhelm/chat/CoachHelmDrawer.tsx',
);

const layoutSrc = readFileSync(LAYOUT, 'utf8');
const fabSrc = readFileSync(FAB, 'utf8');

describe('Ask CoachHelm launcher — content clearance', () => {
  it('the layout that mounts the launcher also reserves space for it', () => {
    // The launcher is a sibling of {children}; without bottom padding on the
    // content it overlaps whatever sits in the bottom-right corner.
    expect(layoutSrc).toMatch(/md:pb-24/);
  });

  it('reserves it on the SAME condition that mounts the launcher', () => {
    // Coach-only, exactly like the mount. Reserving space for players — who
    // never get a launcher — would be dead whitespace on every page.
    const reservation = /isCoach\s*&&\s*'md:pb-24'|isCoach\s*\?\s*'md:pb-24'/;
    expect(layoutSrc).toMatch(reservation);
  });

  it('reserves it at the SAME breakpoint the launcher appears at', () => {
    // The launcher is `md:inline-flex` (hidden below md, where the bottom tab
    // bar owns that corner and carries its own CoachHelm destination). The
    // reservation must match, or phones get padding for a control that is not
    // there.
    expect(fabSrc).toMatch(/md:inline-flex/);
    expect(layoutSrc).not.toMatch(/(?<!md:)\bpb-24\b/);
  });

  it('reserves at least the launcher’s own footprint', () => {
    // bottom-6 (24px) + h-14 (56px) = 80px occupied. pb-24 is 96px.
    expect(fabSrc).toMatch(/bottom-6/);
    expect(fabSrc).toMatch(/\bh-14\b/);
  });
});
