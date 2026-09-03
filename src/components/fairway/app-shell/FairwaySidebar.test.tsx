// =============================================================================
// src/components/fairway/app-shell/FairwaySidebar.test.tsx
//
// Pins the `hideScrollbar` contract added for GAPS_AUDIT_TABLET_LANDSCAPE
// 2026-09-02 finding #2: at short viewport heights the nav is scrollable
// (scrollHeight > clientHeight) but `scrollbar-hidden` removed the only
// affordance a coach had to discover the rest of the rail. `AppShell` decides
// WHEN to pass `hideScrollbar={false}` (see AppShell.compact-viewport.test.tsx);
// this file pins what FairwaySidebar itself does with the prop in isolation.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FairwaySidebar } from './FairwaySidebar';
import type { NavSection } from './types';

const SECTIONS: readonly NavSection[] = [
  { items: [{ label: 'Dashboard', href: '/golf/dashboard', icon: () => null }] },
];

function getNav(container: HTMLElement): HTMLElement {
  const nav = container.querySelector('nav[aria-label="Sections"]');
  if (!nav) throw new Error('sidebar nav not found');
  return nav as HTMLElement;
}

describe('FairwaySidebar — hideScrollbar', () => {
  it('defaults to hiding the scrollbar (existing behavior, no prop passed)', () => {
    const { container } = render(<FairwaySidebar sections={SECTIONS} />);
    expect(getNav(container).className).toContain('scrollbar-hidden');
  });

  it('hides the scrollbar when explicitly true', () => {
    const { container } = render(<FairwaySidebar sections={SECTIONS} hideScrollbar />);
    expect(getNav(container).className).toContain('scrollbar-hidden');
  });

  it('exposes the native scrollbar when false', () => {
    const { container } = render(<FairwaySidebar sections={SECTIONS} hideScrollbar={false} />);
    expect(getNav(container).className).not.toContain('scrollbar-hidden');
  });
});

// Bridge Premium Phase 6: item.shortcut (Bridge's only current producer) was
// rendered as a visible badge only, with no aria-keyshortcuts companion — a
// keyboard shortcut that is reachable but never announced to assistive tech.
describe('FairwaySidebar — shortcut announcement', () => {
  it('exposes a single-digit shortcut as aria-keyshortcuts verbatim', () => {
    const sections: readonly NavSection[] = [
      { items: [{ label: 'Overview', href: '/admin', icon: () => null, shortcut: '1' }] },
    ];
    const { container } = render(<FairwaySidebar sections={sections} />);
    const link = container.querySelector('a[href="/admin"]');
    expect(link?.getAttribute('aria-keyshortcuts')).toBe('1');
  });

  it('exposes a single-letter shortcut as Shift+<letter> (the real gesture — see AdminShell)', () => {
    const sections: readonly NavSection[] = [
      { items: [{ label: 'Reliability', href: '/admin/reliability', icon: () => null, shortcut: 'R' }] },
    ];
    const { container } = render(<FairwaySidebar sections={sections} />);
    const link = container.querySelector('a[href="/admin/reliability"]');
    expect(link?.getAttribute('aria-keyshortcuts')).toBe('Shift+R');
  });

  it('hides the visible shortcut badge from assistive tech (the Link carries the announcement instead)', () => {
    const sections: readonly NavSection[] = [
      { items: [{ label: 'Reliability', href: '/admin/reliability', icon: () => null, shortcut: 'R' }] },
    ];
    const { container } = render(<FairwaySidebar sections={sections} />);
    const badge = Array.from(container.querySelectorAll('span')).find((el) => el.textContent === 'R');
    expect(badge?.getAttribute('aria-hidden')).toBe('true');
  });

  it('omits aria-keyshortcuts when there is no shortcut', () => {
    const { container } = render(<FairwaySidebar sections={SECTIONS} />);
    const link = container.querySelector('a[href="/golf/dashboard"]');
    expect(link?.hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  it('keeps the nav scrollable (overflow-y-auto) regardless of the scrollbar affordance', () => {
    const { container } = render(<FairwaySidebar sections={SECTIONS} hideScrollbar={false} />);
    expect(getNav(container).className).toContain('overflow-y-auto');
  });
});
