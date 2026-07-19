/**
 * MoreNavSheet — width-safety + touch-target regression (#177/#178).
 *
 * #177: embedded overflow rows must never measure wider than the sheet
 * itself, even with a long label/description/badge — `min-w-0` + `truncate`
 * on the shrinking flex child, plus a defensive `w-full overflow-hidden` on
 * the row and a `max-w` clamp on the badge, so nothing can force the row
 * wider than its container.
 *
 * #178: every row (identity row, overflow rows) must carry an explicit 44px
 * floor (WCAG 2.2 AA 2.5.8) rather than relying on incidental content height.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MoreNavSheet } from '../MoreNavSheet';
import type { NavSection } from '../types';

const LONG_LABEL = 'A Genuinely Extremely Long Task Management Row Label That Keeps Going';
const LONG_DESCRIPTION =
  'An equally long description string meant to stress-test the row width contract end to end';

const SECTIONS: readonly NavSection[] = [
  {
    heading: 'Operations',
    items: [
      {
        label: LONG_LABEL,
        description: LONG_DESCRIPTION,
        href: '/golf/dashboard/tasks',
        icon: () => null,
        badge: 12345,
      },
    ],
  },
];

describe('MoreNavSheet — row width safety (#177)', () => {
  it('overflow rows carry width-safety classes: w-full, min-w-0, overflow-hidden', () => {
    render(
      <MoreNavSheet
        open
        onOpenChange={() => {}}
        sections={SECTIONS}
        excludeHrefs={[]}
      />,
    );

    const row = document.body.querySelector('a[href="/golf/dashboard/tasks"]');
    expect(row).not.toBeNull();
    const classes = row!.className.split(/\s+/);
    expect(classes).toContain('w-full');
    expect(classes).toContain('min-w-0');
    expect(classes).toContain('overflow-hidden');
  });

  it('the label + description spans truncate instead of forcing row width', () => {
    const { getByText } = render(
      <MoreNavSheet open onOpenChange={() => {}} sections={SECTIONS} excludeHrefs={[]} />,
    );

    const label = getByText(LONG_LABEL);
    const description = getByText(LONG_DESCRIPTION);
    expect(label.className).toContain('truncate');
    expect(description.className).toContain('truncate');
  });

  it('an oversized badge value is clamped (max-w + truncate), never allowed to grow unbounded', () => {
    const { getByText } = render(
      <MoreNavSheet open onOpenChange={() => {}} sections={SECTIONS} excludeHrefs={[]} />,
    );

    // Badge caps display at "99+" regardless of the real count.
    const badge = getByText('99+');
    const classes = badge.className.split(/\s+/);
    expect(classes).toContain('max-w-[48px]');
    expect(classes).toContain('truncate');
  });
});

describe('MoreNavSheet — 44px touch-target floor (#178)', () => {
  it('overflow rows declare an explicit min-h-[56px] floor', () => {
    render(
      <MoreNavSheet open onOpenChange={() => {}} sections={SECTIONS} excludeHrefs={[]} />,
    );
    const row = document.body.querySelector('a[href="/golf/dashboard/tasks"]');
    expect(row!.className.split(/\s+/)).toContain('min-h-[56px]');
  });

  it('the identity row declares an explicit min-h-[44px] floor (not just incidental content height)', () => {
    render(
      <MoreNavSheet
        open
        onOpenChange={() => {}}
        sections={SECTIONS}
        excludeHrefs={[]}
        user={{ name: 'Nick Rini', teamName: 'Rini University' }}
        settingsHref="/golf/dashboard/settings"
      />,
    );
    const identityRow = document.body.querySelector('a[href="/golf/dashboard/settings"]');
    expect(identityRow).not.toBeNull();
    expect(identityRow!.className.split(/\s+/)).toContain('min-h-[44px]');
  });
});
