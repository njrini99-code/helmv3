// =============================================================================
// src/components/fairway/app-shell/FairwayTopBar.test.tsx
//
// M1 (condensing-header, 2026-07-10) — pins the single condensing chrome
// unit's contract on `FairwayTopBar`: the leading crumb/⌘K pill are desktop-
// only (`hidden`/`md:block`, `hidden`/`md:flex`) with NO separate mobile-only
// crumb copy left behind; the condensed title is `aria-hidden`, decorative,
// and cross-fades purely off `LargeTitleContext`'s `condensed` (never a
// prop); `registeredTitle` wins over the `condensedTitle` fallback prop; and
// `flush` drops the bar's own bottom hairline at `<md` only.
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
    condensed: false,
    registeredTitle: null,
    setRegisteredTitle: () => {},
    sentinelRef: { current: null },
    registerTitleNode: () => {},
    ...overrides,
  };
}

function renderBar(props: Partial<React.ComponentProps<typeof FairwayTopBar>> = {}, value = ctx()) {
  return render(
    <LargeTitleContext.Provider value={value}>
      <FairwayTopBar breadcrumbs={BREADCRUMBS} condensedTitle="Roster" {...props} />
    </LargeTitleContext.Provider>,
  );
}

/** The condensed-title span, scoped under its own `data-slot` wrapper so it
 *  never collides with the (also-textually-"Roster") breadcrumb trail. */
function condensedTitleEl(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[data-slot="fw-topbar-condensed-title"] span');
  if (!el) throw new Error('condensed title span not found');
  return el as HTMLElement;
}

describe('FairwayTopBar — desktop-only chrome leaves the phone entirely', () => {
  it('renders exactly ONE breadcrumb element (no leftover <md-only crumb copy)', () => {
    const { container } = renderBar();
    // Pre-M1 there were TWO: the desktop `<nav aria-label="Breadcrumb">` trail
    // AND a separate `<md`-only last-crumb `<div aria-label="Breadcrumb">`.
    // M1 deletes the latter — the leading slot is EMPTY at rest on phone.
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

describe('FairwayTopBar — condensed title', () => {
  it('is aria-hidden and decorative (never a second announced heading)', () => {
    const { container } = renderBar({}, ctx({ condensed: true }));
    const wrapper = container.querySelector('[data-slot="fw-topbar-condensed-title"]')!;
    expect(wrapper).toHaveAttribute('aria-hidden');
    expect(condensedTitleEl(container)).toHaveTextContent('Roster');
  });

  it('fades in (opacity-100) when condensed, fades out (opacity-0) at rest', () => {
    const { container, rerender } = renderBar({}, ctx({ condensed: false }));
    expect(condensedTitleEl(container).className).toContain('opacity-0');

    rerender(
      <LargeTitleContext.Provider value={ctx({ condensed: true })}>
        <FairwayTopBar breadcrumbs={BREADCRUMBS} condensedTitle="Roster" />
      </LargeTitleContext.Provider>,
    );
    expect(condensedTitleEl(container).className).toContain('opacity-100');
  });

  it('prefers the registered title from context over the condensedTitle fallback prop', () => {
    const { container } = renderBar(
      { condensedTitle: 'Dashboard' },
      ctx({ condensed: true, registeredTitle: 'My Custom Title' }),
    );
    expect(condensedTitleEl(container)).toHaveTextContent('My Custom Title');
  });

  it('falls back to condensedTitle when nothing is registered', () => {
    const { container } = renderBar({ condensedTitle: 'Dashboard' }, ctx({ condensed: true, registeredTitle: null }));
    expect(condensedTitleEl(container)).toHaveTextContent('Dashboard');
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
