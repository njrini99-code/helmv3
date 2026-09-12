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

// fairway-facelift BRIEF.md §2/§3: the golf desktop rail swaps the warm-black
// `nav-*` recipe for the app's own cream surface tokens so it reads as one
// instrument with the canvas — but baseball/admin (the OTHER `nav-*`
// consumers) must render byte-identical to before this prop existed.
describe('FairwaySidebar — tone', () => {
  function getAside(container: HTMLElement): HTMLElement {
    const aside = container.querySelector('aside[aria-label="Main navigation"]');
    if (!aside) throw new Error('sidebar aside not found');
    return aside as HTMLElement;
  }

  it('defaults to the dark warm-black rail (no prop passed) — pins baseball/admin', () => {
    const { container } = render(<FairwaySidebar sections={SECTIONS} />);
    const aside = getAside(container);
    expect(aside.className).toContain('bg-nav-bg');
    expect(aside.className).toContain('on-dark');
    expect(aside.className).not.toContain('bg-surface-sunken');
  });

  it('tone="dark" renders exactly the existing classes (explicit form of the default)', () => {
    const { container } = render(<FairwaySidebar sections={SECTIONS} tone="dark" />);
    const aside = getAside(container);
    expect(aside.className).toContain('bg-nav-bg');
    expect(aside.className).toContain('on-dark');
  });

  it('tone="cream" carries no nav-bg class and drops the dark focus scope', () => {
    const { container } = render(<FairwaySidebar sections={SECTIONS} tone="cream" />);
    const aside = getAside(container);
    expect(aside.className).not.toContain('bg-nav-bg');
    expect(aside.className).not.toContain('on-dark');
    expect(aside.className).toContain('bg-surface-sunken');
    expect(aside.className).toContain('border-border-subtle');
  });

  it('tone="cream" gives the active row the fw-frost-selection capsule, not the dark active pill', () => {
    const sections: readonly NavSection[] = [
      { items: [{ label: 'Dashboard', href: '/golf/dashboard', icon: () => null }] },
    ];
    const { container } = render(
      <FairwaySidebar sections={sections} tone="cream" pathname="/golf/dashboard" />,
    );
    const link = container.querySelector('a[href="/golf/dashboard"]');
    // The capsule is a decorative inset overlay INSIDE the row, not a class
    // on the anchor itself (the reduced-transparency fallback reassigns
    // `.fw-frost-selection`'s own `color`, so it must never share an element
    // with `text-accent-700` — see the comment at its render site).
    const capsule = link?.querySelector('span.fw-frost-selection');
    expect(capsule).toBeTruthy();
    expect(capsule?.getAttribute('aria-hidden')).toBe('true');
    expect(link?.className).toContain('text-accent-700');
    expect(link?.className).not.toContain('fw-frost-selection');
    expect(link?.className).not.toContain('bg-nav-surface');
  });

  it('tone="dark" (default) keeps the active row on the existing bg-nav-surface pill', () => {
    const sections: readonly NavSection[] = [
      { items: [{ label: 'Dashboard', href: '/golf/dashboard', icon: () => null }] },
    ];
    const { container } = render(<FairwaySidebar sections={sections} pathname="/golf/dashboard" />);
    const link = container.querySelector('a[href="/golf/dashboard"]');
    expect(link?.className).toContain('bg-nav-surface');
    expect(link?.className).not.toContain('fw-frost-selection');
  });

  it('tone="cream" inactive rows use text-text-secondary with a surface-tint hover, not nav-text-dim', () => {
    const { container } = render(<FairwaySidebar sections={SECTIONS} tone="cream" />);
    const link = container.querySelector('a[href="/golf/dashboard"]');
    expect(link?.className).toContain('text-text-secondary');
    expect(link?.className).toContain('hover:bg-surface-tint');
    expect(link?.className).not.toContain('nav-text-dim');
  });

  it('tone="cream" inactive rows render no fw-frost-selection overlay (active-only)', () => {
    const { container } = render(<FairwaySidebar sections={SECTIONS} tone="cream" />);
    const link = container.querySelector('a[href="/golf/dashboard"]');
    expect(link?.querySelector('span.fw-frost-selection')).toBeNull();
  });

  it('tone="cream" active row lifts the label above the frost overlay (relative z-10)', () => {
    const sections: readonly NavSection[] = [
      { items: [{ label: 'Dashboard', href: '/golf/dashboard', icon: () => null }] },
    ];
    const { container, getByText } = render(
      <FairwaySidebar sections={sections} tone="cream" pathname="/golf/dashboard" />,
    );
    const link = container.querySelector('a[href="/golf/dashboard"]');
    const overlay = link?.querySelector('span.fw-frost-selection');
    const labelWrap = getByText('Dashboard').parentElement;
    // Both must be positioned so paint order is decided by z-index, not
    // element type — a static label would paint UNDER an absolute overlay
    // regardless of DOM order (CSS2.1 stacking: positioned descendants
    // always paint above in-flow static content).
    expect(overlay?.className).toContain('absolute');
    expect(labelWrap?.className).toContain('relative');
    expect(labelWrap?.className).toContain('z-10');
  });
});

describe('FairwaySidebar tone="green"', () => {
  it('keeps the dark recipe and adds the fw-rail-green token scope', () => {
    const { container } = render(<FairwaySidebar sections={SECTIONS} tone="green" />);
    const aside = container.querySelector('aside, nav, div[class*="bg-nav-bg"]') as HTMLElement;
    expect(aside.className).toContain('bg-nav-bg');
    expect(aside.className).toContain('on-dark');
    expect(aside.className).toContain('fw-rail-green');
    expect(aside.className).not.toContain('bg-surface-sunken');
  });
});
