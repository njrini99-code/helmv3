// =============================================================================
// src/components/fairway/app-shell/more-nav.test.ts
//
// M1 (more-sheet-nav, 2026-07-10) — pins `selectOverflow`'s dedupe/grouping
// contract and `summarizeMoreTab`'s active/badge math. Pure module (no React,
// no 'use client') — imported directly, no render/mount needed.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { selectOverflow, summarizeMoreTab } from './more-nav';
import type { NavItem, NavSection } from './types';
import { IconHome, IconUsers, IconMessage, IconCalendar, IconMapPin } from '@/components/icons';

function item(overrides: Partial<NavItem> & Pick<NavItem, 'label' | 'href'>): NavItem {
  return { icon: IconHome, ...overrides };
}

describe('selectOverflow', () => {
  const sections: NavSection[] = [
    {
      heading: 'GolfHelm',
      items: [
        item({ label: 'Dashboard', href: '/golf/dashboard' }),
        item({ label: 'Team', href: '/golf/dashboard/roster', icon: IconUsers }),
        item({ label: 'Calendar', href: '/golf/dashboard/calendar', icon: IconCalendar }),
        item({ label: 'Messages', href: '/golf/dashboard/messages', icon: IconMessage, badge: 5 }),
        item({ label: 'Courses', href: '/golf/dashboard/courses', icon: IconMapPin }),
      ],
    },
  ];

  it('filters out every href in excludeHrefs, keeping the rest in order', () => {
    const overflow = selectOverflow(sections, [
      '/golf/dashboard',
      '/golf/dashboard/roster',
      '/golf/dashboard/calendar',
    ]);
    expect(overflow).toHaveLength(1);
    expect(overflow[0]!.items.map((i) => i.label)).toEqual(['Messages', 'Courses']);
  });

  it('drops a section entirely when every one of its items is excluded (Rule 3: no empty sections)', () => {
    const overflow = selectOverflow(
      [{ heading: 'Solo', items: [item({ label: 'Only', href: '/only' })] }],
      ['/only'],
    );
    expect(overflow).toEqual([]);
  });

  it('preserves multi-section grouping/order, dropping only the emptied-out section', () => {
    const multi: NavSection[] = [
      { heading: 'My Golf', items: [item({ label: 'Rounds', href: '/golf/dashboard/rounds' })] },
      { heading: 'Operations', items: [item({ label: 'Tasks', href: '/golf/dashboard/tasks' })] },
    ];
    const overflow = selectOverflow(multi, ['/golf/dashboard/rounds']);
    expect(overflow).toHaveLength(1);
    expect(overflow[0]!.heading).toBe('Operations');
    expect(overflow[0]!.items.map((i) => i.label)).toEqual(['Tasks']);
  });

  it('dedupes a repeated href across sections, keeping only its first occurrence', () => {
    const dupe: NavSection[] = [
      { heading: 'First', items: [item({ label: 'Shared', href: '/shared' })] },
      { heading: 'Second', items: [item({ label: 'Shared (again)', href: '/shared' })] },
    ];
    const overflow = selectOverflow(dupe, []);
    expect(overflow).toHaveLength(1);
    expect(overflow[0]!.heading).toBe('First');
    expect(overflow[0]!.items).toHaveLength(1);
    expect(overflow[0]!.items[0]!.label).toBe('Shared');
  });

  it('returns no sections when every section is fully excluded', () => {
    const overflow = selectOverflow(sections, sections[0]!.items.map((i) => i.href));
    expect(overflow).toEqual([]);
  });
});

describe('summarizeMoreTab', () => {
  const overflow: NavSection[] = [
    {
      heading: 'More',
      items: [
        item({ label: 'Messages', href: '/golf/dashboard/messages', badge: 5 }),
        item({ label: 'Operations', href: '/golf/dashboard/tasks', badge: 2 }),
        item({ label: 'Courses', href: '/golf/dashboard/courses' }),
      ],
    },
  ];

  it('sums every overflow item badge > 0', () => {
    expect(summarizeMoreTab(overflow, undefined)).toEqual({ active: false, badge: 7 });
  });

  it('badge is undefined (never a fake 0) when nothing carries a count', () => {
    const noBadges: NavSection[] = [
      { heading: 'More', items: [item({ label: 'Courses', href: '/golf/dashboard/courses' })] },
    ];
    expect(summarizeMoreTab(noBadges, undefined).badge).toBeUndefined();
  });

  it('active is true when the current pathname matches an overflow item (segment-boundary)', () => {
    expect(summarizeMoreTab(overflow, '/golf/dashboard/tasks').active).toBe(true);
    expect(summarizeMoreTab(overflow, '/golf/dashboard/tasks/123').active).toBe(true);
  });

  it('active is false when the pathname matches nothing in the overflow', () => {
    expect(summarizeMoreTab(overflow, '/golf/dashboard/rounds').active).toBe(false);
    expect(summarizeMoreTab(overflow, undefined).active).toBe(false);
  });

  it('honors a custom activeMatch predicate over the default segment match', () => {
    const withPredicate: NavSection[] = [
      {
        heading: 'More',
        items: [
          item({
            label: 'CoachHelm cluster',
            href: '/golf/dashboard/intelligence',
            activeMatch: (pathname) => pathname.startsWith('/golf/dashboard/alerts'),
          }),
        ],
      },
    ];
    // Own href does NOT match (activeMatch overrides the default).
    expect(summarizeMoreTab(withPredicate, '/golf/dashboard/intelligence').active).toBe(false);
    // The predicate's own route does.
    expect(summarizeMoreTab(withPredicate, '/golf/dashboard/alerts').active).toBe(true);
  });

  it('honors an explicit `active: true` override regardless of pathname', () => {
    const forced: NavSection[] = [
      { heading: 'More', items: [item({ label: 'Forced', href: '/nowhere', active: true })] },
    ];
    expect(summarizeMoreTab(forced, '/somewhere-else').active).toBe(true);
  });

  it('returns { active: false, badge: undefined } for an empty overflow', () => {
    expect(summarizeMoreTab([], '/golf/dashboard')).toEqual({ active: false, badge: undefined });
  });
});
