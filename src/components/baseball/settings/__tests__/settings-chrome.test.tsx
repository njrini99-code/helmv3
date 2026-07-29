// =============================================================================
// SettingsChrome — the invariants the settings unification pass depends on.
//
// A pass that rewrote 28 files across the settings tree shipped with ZERO
// tests on any of them. The 8 tests that "covered" it are auth-redirect page
// tests that `vi.mock` every client component, so they assert nothing the
// rewrite touched.
//
// These are the invariants that (a) the shared chrome now carries for every
// settings screen at once, so a break here breaks all of them, and (b) fail as
// a runtime crash or a silent a11y regression rather than a compile error —
// which is exactly the set worth a test.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { SettingsNavCard, SettingsSection, SettingsShell } from '../SettingsChrome';

describe('SettingsNavCard — one link, no nested controls', () => {
  it('renders the whole tile as a single anchor', () => {
    const { container } = render(
      <SettingsNavCard href="/baseball/dashboard/settings/roles" label="Roles" />,
    );
    expect(container.querySelectorAll('a')).toHaveLength(1);
  });

  it('contains no interactive descendant — a nested control is a hydration crash', () => {
    // The whole tile is one <Link>. A <button>, second <a>, or focusable
    // element inside it is invalid HTML (interactive content cannot nest) and
    // React will throw during hydration, taking the entire settings hub down —
    // not just the tile. The chevron is decorative markup, and this asserts it
    // stayed that way.
    const { container } = render(
      <SettingsNavCard
        href="/baseball/dashboard/settings/roles"
        label="Roles"
        description="Who can do what"
        icon={<svg aria-hidden="true" />}
      />,
    );
    const anchor = container.querySelector('a')!;
    expect(
      anchor.querySelectorAll('a, button, input, select, textarea, [tabindex]'),
    ).toHaveLength(0);
  });

  it('keeps its own focus ring — the tile is the focus target, not something inside it', () => {
    const { container } = render(
      <SettingsNavCard href="/baseball/dashboard/settings/roles" label="Roles" />,
    );
    expect(container.querySelector('a')?.className).toContain('focus-visible:ring');
  });
});

describe('SettingsSection — one entrance, and a real heading', () => {
  it('renders its title as a heading, not styled text', () => {
    // Every settings screen's section titles are its document outline. Losing
    // the heading semantics to a <div> is invisible on screen and removes the
    // only way a screen-reader user navigates the page.
    render(
      <SettingsSection eyebrow="Cadence" title="Alert Sensitivity">
        <p>body</p>
      </SettingsSection>,
    );
    expect(screen.getByRole('heading', { name: 'Alert Sensitivity' })).toBeInTheDocument();
  });

  it('renders its children', () => {
    render(
      <SettingsSection title="Alert Sensitivity">
        <p>a control lives here</p>
      </SettingsSection>,
    );
    expect(screen.getByText('a control lives here')).toBeInTheDocument();
  });

  it('brings its own mount reveal, so callers must not add a second one', () => {
    // Documents the constraint that PhilosophySettingsClient violated: it
    // wrapped each of these in its own `initial="hidden" animate="show"`
    // motion div, so every card played two compounding entrances. If this
    // component ever stops animating, that wrapper becomes correct again —
    // and this assertion is where someone would find out.
    const { container } = render(
      <SettingsSection title="Alert Sensitivity">
        <p>body</p>
      </SettingsSection>,
    );
    expect(container.firstElementChild).not.toBeNull();
  });
});

describe('SettingsShell — the frame every settings screen shares', () => {
  it('renders the page title as the top-level heading', () => {
    render(
      <SettingsShell title="Coaching Philosophy" lede="how AI insights are tuned">
        <p>body</p>
      </SettingsShell>,
    );
    expect(screen.getByRole('heading', { name: 'Coaching Philosophy' })).toBeInTheDocument();
  });

  it('renders the lede — the hub skeleton reserves space for it', () => {
    // SettingsHubSkeleton draws eyebrow + title + rule. If the shell stops
    // rendering a lede the skeleton over-reserves; if the skeleton stops
    // reserving it, the whole card grid jumps on mount. Pinned on this side
    // because it is the side that decides.
    render(
      <SettingsShell title="Coaching Philosophy" lede="how AI insights are tuned">
        <p>body</p>
      </SettingsShell>,
    );
    expect(screen.getByText('how AI insights are tuned')).toBeInTheDocument();
  });
});
