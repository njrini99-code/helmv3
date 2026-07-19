/**
 * AppShell — background inert while the More sheet is open (#18/#196).
 *
 * Radix's built-in `hideOthers` already marks the rest of the page
 * `aria-hidden` while a modal `Drawer`/`Dialog` is open, but `aria-hidden`
 * alone doesn't remove a subtree from the tab order or from pointer
 * hit-testing — only from the accessibility tree. The (Radix-Dialog-based)
 * Create Task Dialog gets real inertness for free; this shell's mobile More
 * sheet needs the SAME guarantee explicitly, since `MoreNavSheet`'s own
 * rendered content portals to `document.body`, entirely outside this
 * wrapper.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { AppShell } from '../AppShell';
import type { NavSection } from '../types';

const SECTIONS: readonly NavSection[] = [
  { items: [{ id: 'home', label: 'Home', href: '/home', icon: () => null }] },
];

// Force the mobile (`!isDesktop`) branch, which is what mounts `MoreNavSheet`.
beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false, // '(min-width: 768px)' never matches -> mobile
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

describe('AppShell — More sheet inertness', () => {
  it('is NOT inert while the More sheet is closed', () => {
    const { container } = render(
      <AppShell sections={SECTIONS} mobileOpen={false} onMobileOpenChange={() => {}}>
        <div>content</div>
      </AppShell>,
    );

    const root = container.firstElementChild;
    expect(root?.hasAttribute('inert')).toBe(false);
  });

  it('becomes inert (background focus + hit-testing blocked) while the More sheet is open', () => {
    const { container, rerender } = render(
      <AppShell sections={SECTIONS} mobileOpen={false} onMobileOpenChange={() => {}}>
        <div>content</div>
      </AppShell>,
    );

    act(() => {
      rerender(
        <AppShell sections={SECTIONS} mobileOpen={true} onMobileOpenChange={() => {}}>
          <div>content</div>
        </AppShell>,
      );
    });

    const root = container.firstElementChild;
    expect(root?.hasAttribute('inert')).toBe(true);
  });
});
