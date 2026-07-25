// =============================================================================
// src/components/fairway/app-shell/FairwayTopBar.test.tsx
//
// Pins the sticky chrome unit's contract on `FairwayTopBar`: the crumb trail
// and ⌘K pill are desktop-only (`hidden`/`md:block`, `hidden`/`md:flex`) with
// NO mobile crumb copy left behind; the phone leading slot carries a STANDING
// destination title that is present regardless of scroll (the 2026-07-25 fix —
// it used to be `opacity-0` until an IntersectionObserver said you had
// scrolled past the page masthead, so at rest nothing named the view); that
// title is `aria-hidden` with the accessible name on the `<header>` landmark
// instead, so it never becomes a second heading; `registeredTitle` wins over
// the `pageTitle` fallback prop; and `flush` drops the bar's own bottom
// hairline at `<md` only.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';
import { FairwayTopBar } from './FairwayTopBar';
import { LargeTitleContext, type LargeTitleContextValue } from './LargeTitleContext';
import type { Breadcrumb } from './types';

const BREADCRUMBS: Breadcrumb[] = [
  { label: 'Dashboard', href: '/golf/dashboard' },
  { label: 'Roster' },
];

function ctx(overrides: Partial<LargeTitleContextValue> = {}): LargeTitleContextValue {
  return {
    registeredTitle: null,
    setRegisteredTitle: () => {},
    ...overrides,
  };
}

function renderBar(props: Partial<React.ComponentProps<typeof FairwayTopBar>> = {}, value = ctx()) {
  return render(
    <LargeTitleContext.Provider value={value}>
      <FairwayTopBar breadcrumbs={BREADCRUMBS} pageTitle="Roster" {...props} />
    </LargeTitleContext.Provider>,
  );
}

/** The standing-title span, scoped under its own `data-slot` wrapper so it
 *  never collides with the (also-textually-"Roster") breadcrumb trail. */
function titleEl(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[data-slot="fw-topbar-title"] span');
  if (!el) throw new Error('standing title span not found');
  return el as HTMLElement;
}

describe('FairwayTopBar — desktop-only chrome leaves the phone entirely', () => {
  it('renders exactly ONE breadcrumb element (no leftover <md-only crumb copy)', () => {
    const { container } = renderBar();
    // There used to be TWO: the desktop `<nav aria-label="Breadcrumb">` trail
    // AND a separate `<md`-only last-crumb `<div aria-label="Breadcrumb">`.
    // The phone gets the standing title instead — never a crumb (rule 7).
    expect(container.querySelectorAll('[aria-label="Breadcrumb"]')).toHaveLength(1);
  });

  it('wraps the breadcrumb trail in `hidden md:block` (desktop only)', () => {
    renderBar();
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const wrapper = nav.parentElement!;
    expect(wrapper.className).toContain('hidden');
    expect(wrapper.className).toContain('md:block');
  });

  it('wraps the ⌘K command entry in `hidden md:flex` (desktop only)', () => {
    renderBar({ onSearchOpen: () => {} });
    const button = screen.getByRole('button', { name: 'Open command menu' });
    const wrapper = button.parentElement!;
    expect(wrapper.className).toContain('hidden');
    expect(wrapper.className).toContain('md:flex');
  });
});

describe('FairwayTopBar — standing destination title (phone)', () => {
  it('is VISIBLE at rest — no scroll required to learn where you are', () => {
    // The regression this file exists to prevent: the title used to render
    // `opacity-0 translate-y-1` until a scroll observer flipped `condensed`,
    // so the phone header showed nothing but a notification bell at scroll 0.
    const { container } = renderBar();
    const el = titleEl(container);
    expect(el).toHaveTextContent('Roster');
    expect(el.className).not.toContain('opacity-0');
  });

  it('never animates or transitions — it is not a scroll-driven affordance', () => {
    const { container } = renderBar();
    const el = titleEl(container);
    expect(el.className).not.toContain('transition');
    expect(el.className).not.toContain('translate-y');
  });

  it('lives in the LEADING slot on phone and is hidden at md+ (crumbs take over)', () => {
    const { container } = renderBar();
    const wrapper = container.querySelector('[data-slot="fw-topbar-title"]')!;
    expect(wrapper.className).toContain('md:hidden');
    // Leading: it is the first child of the header row, before the crumb trail.
    const row = container.querySelector('header > div')!;
    expect(row.firstElementChild).toBe(wrapper);
  });

  it('truncates rather than colliding with the action cluster at narrow widths', () => {
    const { container } = renderBar();
    const wrapper = container.querySelector('[data-slot="fw-topbar-title"]')!;
    expect(wrapper.className).toContain('min-w-0');
    expect(titleEl(container).className).toContain('truncate');
  });

  it('is aria-hidden, with the accessible name on the <header> landmark instead', () => {
    // Promoting it to a heading would put a second h1-level node on every page
    // and strict-mode-fail the unscoped getByRole('heading', { level: 1 }) in
    // e2e/golf-dashboard.spec.ts.
    const { container } = renderBar();
    const wrapper = container.querySelector('[data-slot="fw-topbar-title"]')!;
    expect(wrapper).toHaveAttribute('aria-hidden');
    expect(container.querySelector('header')).toHaveAttribute('aria-label', 'Roster');
    expect(container.querySelector('[data-slot="fw-topbar-title"] [role="heading"]')).toBeNull();
  });

  it('prefers the registered title from context over the pageTitle fallback prop', () => {
    const { container } = renderBar(
      { pageTitle: 'Dashboard' },
      ctx({ registeredTitle: 'My Custom Title' }),
    );
    expect(titleEl(container)).toHaveTextContent('My Custom Title');
    expect(container.querySelector('header')).toHaveAttribute('aria-label', 'My Custom Title');
  });

  it('falls back to pageTitle when nothing is registered', () => {
    const { container } = renderBar({ pageTitle: 'Dashboard' }, ctx({ registeredTitle: null }));
    expect(titleEl(container)).toHaveTextContent('Dashboard');
  });

  it('omits the landmark aria-label entirely when there is no title to show', () => {
    const { container } = renderBar({ pageTitle: undefined, breadcrumbs: undefined });
    expect(container.querySelector('header')).not.toHaveAttribute('aria-label');
  });
});

describe('FairwayTopBar — flush', () => {
  it('drops the bottom hairline at <md only when flush', () => {
    const { container } = renderBar({ flush: true });
    const header = container.querySelector('header')!;
    expect(header.className).toContain('max-md:border-b-0');
  });

  it('keeps its own hairline when not flush', () => {
    const { container } = renderBar({ flush: false });
    const header = container.querySelector('header')!;
    expect(header.className).not.toContain('max-md:border-b-0');
  });
});

describe('FairwayTopBar — action cluster renders at every breakpoint', () => {
  it('renders actions without any md:hidden/hidden wrapper', () => {
    renderBar({ actions: <Button type="button">Bell</Button> });
    const button = screen.getByRole('button', { name: 'Bell' });
    const wrapper = button.parentElement!;
    expect(wrapper.className).not.toContain('hidden');
  });
});
