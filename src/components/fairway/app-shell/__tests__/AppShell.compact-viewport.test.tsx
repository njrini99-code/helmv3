/**
 * AppShell — rail collapse overrides for compact-width tablets and
 * short-height mobile-landscape viewports (GAPS_AUDIT_TABLET_LANDSCAPE
 * 2026-09-02, findings #2 and #4).
 *
 * #4: the full 260px labeled rail didn't collapse below 1024px, so an
 * 810px-wide tablet portrait got ~550px of content that then stacked into a
 * single column with dead space. Fix: 768–1023px forces the icon rail for
 * RENDERING only — the stored `fairway-sidebar-collapsed` preference is never
 * overwritten, so >=1024px still honors whatever the user actually chose.
 *
 * #2: at 390px-tall mobile-landscape viewports the desktop rail mounts
 * (width >= 768px) but only 2 of 8 nav rows are visible with no scroll cue.
 * Fix: short viewports (<=500px tall) also force the icon rail AND drop
 * FairwaySidebar's `scrollbar-hidden` styling so the native scrollbar is the
 * guaranteed affordance even if the icon rail itself still overflows.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { AppShell } from '../AppShell';
import type { NavSection } from '../types';

const SECTIONS: readonly NavSection[] = [
  { items: [{ label: 'Dashboard', href: '/golf/dashboard', icon: () => null }] },
];

const STORAGE_KEY = 'fairway-sidebar-collapsed';

/** Query-aware `matchMedia` mock — `matches` decides per media-query string. */
function mockMatchMedia(matches: (query: string) => boolean) {
  window.matchMedia = ((query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/** `(min-width: 768px)` true, `(max-width: 1023px)` / `(max-height: 500px)` false. */
function desktopWide() {
  mockMatchMedia((query) => query === '(min-width: 768px)');
}

/** 810×1080 tablet portrait — in the 768–1023px compact-width band, tall enough. */
function tabletCompact() {
  mockMatchMedia(
    (query) => query === '(min-width: 768px)' || query === '(min-width: 768px) and (max-width: 1023px)',
  );
}

/** 844×390 mobile landscape — compact-width band AND short height. */
function mobileLandscapeShort() {
  mockMatchMedia(
    (query) =>
      query === '(min-width: 768px)' ||
      query === '(min-width: 768px) and (max-width: 1023px)' ||
      query === '(max-height: 500px)',
  );
}

function getContentColumn(container: HTMLElement): HTMLElement {
  const main = container.querySelector('main');
  if (!main?.parentElement) throw new Error('content column not found');
  return main.parentElement;
}

function getNav(container: HTMLElement): HTMLElement {
  const nav = container.querySelector('nav[aria-label="Sections"]');
  if (!nav) throw new Error('sidebar nav not found');
  return nav as HTMLElement;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('AppShell — compact width (768–1023px) forces the icon rail', () => {
  it('renders the collapsed rail + 76px offset at 810px width even when localStorage says expanded', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    tabletCompact();

    const { container } = render(
      <AppShell sections={SECTIONS}>
        <div>content</div>
      </AppShell>,
    );

    expect(getContentColumn(container).className).toContain('md:pl-[76px]');
    expect(getContentColumn(container).className).not.toContain('md:pl-[260px]');
    // Icon-only rows: no label span rendered for the nav item.
    expect(container.querySelector('nav[aria-label="Sections"]')).not.toHaveTextContent('Dashboard');
  });

  it('hides the collapse toggle while the compact-width override is active', () => {
    tabletCompact();
    const { queryByRole } = render(
      <AppShell sections={SECTIONS}>
        <div>content</div>
      </AppShell>,
    );

    expect(queryByRole('button', { name: 'Expand navigation' })).toBeNull();
    expect(queryByRole('button', { name: 'Collapse navigation' })).toBeNull();
  });

  it('does not overwrite the stored preference while forced', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    tabletCompact();

    render(
      <AppShell sections={SECTIONS}>
        <div>content</div>
      </AppShell>,
    );

    // Still exactly what was stored before render — the forced override
    // never calls `localStorage.setItem` on the user's behalf.
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });
});

describe('AppShell — desktop (>=1024px) still honors the stored preference', () => {
  it('renders expanded (260px) when nothing is stored', () => {
    desktopWide();
    const { container } = render(
      <AppShell sections={SECTIONS}>
        <div>content</div>
      </AppShell>,
    );

    expect(getContentColumn(container).className).toContain('md:pl-[260px]');
  });

  it('renders collapsed (76px) when the user previously chose collapsed', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    desktopWide();

    const { container } = render(
      <AppShell sections={SECTIONS}>
        <div>content</div>
      </AppShell>,
    );

    expect(getContentColumn(container).className).toContain('md:pl-[76px]');
  });

  it('shows a working collapse toggle', () => {
    desktopWide();
    const { getByRole } = render(
      <AppShell sections={SECTIONS}>
        <div>content</div>
      </AppShell>,
    );

    expect(getByRole('button', { name: 'Collapse navigation' })).toBeInTheDocument();
  });
});

describe('AppShell — short viewport height (<=500px) forces the icon rail + a scroll affordance', () => {
  it('renders the collapsed rail at 844×390 (mobile landscape)', () => {
    mobileLandscapeShort();
    const { container } = render(
      <AppShell sections={SECTIONS}>
        <div>content</div>
      </AppShell>,
    );

    expect(getContentColumn(container).className).toContain('md:pl-[76px]');
  });

  it('drops `scrollbar-hidden` from the nav so a visible scrollbar is the overflow cue', () => {
    mobileLandscapeShort();
    const { container } = render(
      <AppShell sections={SECTIONS}>
        <div>content</div>
      </AppShell>,
    );

    expect(getNav(container).className).not.toContain('scrollbar-hidden');
  });

  it('keeps `scrollbar-hidden` at normal (>500px) viewport heights', () => {
    tabletCompact();
    const { container } = render(
      <AppShell sections={SECTIONS}>
        <div>content</div>
      </AppShell>,
    );

    expect(getNav(container).className).toContain('scrollbar-hidden');
  });

  it('hides the collapse toggle while the short-viewport override is active', () => {
    mobileLandscapeShort();
    const { queryByRole } = render(
      <AppShell sections={SECTIONS}>
        <div>content</div>
      </AppShell>,
    );

    expect(queryByRole('button', { name: 'Expand navigation' })).toBeNull();
    expect(queryByRole('button', { name: 'Collapse navigation' })).toBeNull();
  });
});
