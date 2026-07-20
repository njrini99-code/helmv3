// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

// next/link drives prefetch through IntersectionObserver, which the jsdom setup
// mock isn't constructor-shaped for under this Next version (same workaround as
// CoachHelmSubNav.test.tsx) — we only care about the rendered anchor.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { Button } from '@/components/fairway/controls/button';
import { CoachHelmShell } from './CoachHelmShell';

// Regression coverage for the "double chrome" fix: the three legacy monoliths
// (FairwayCoachHelmSignals, PlayersGridView, FairwayEffectiveness) each mount
// this CoachHelmShell internally, and are themselves mounted a second time
// inside a stage DrillPanel (see components/golf/coachhelm/home/*Drill.tsx),
// which already renders its own back-chip + title chrome. `embedded` lets the
// inner shell suppress its own masthead + sub-nav so the drill doesn't show
// two competing mastheads plus a redundant single-tab strip.
describe('CoachHelmShell — embedded chrome suppression', () => {
  it('standalone (default) mount renders the masthead title and the sub-nav strip', () => {
    render(
      <CoachHelmShell
        active="players"
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
        title="Players"
      >
        <div>body content</div>
      </CoachHelmShell>,
    );

    expect(screen.getByRole('heading', { name: 'Players' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'CoachHelm sections' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Brief' })).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
  });

  it('embedded mount renders no masthead title and no sub-nav link', () => {
    render(
      <CoachHelmShell
        active="players"
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
        title="Players"
        embedded
      >
        <div>body content</div>
      </CoachHelmShell>,
    );

    expect(screen.queryByRole('heading', { name: 'Players' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'CoachHelm sections' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Brief' })).toBeNull();
    // Children still render — embedding only suppresses chrome, not content.
    expect(screen.getByText('body content')).toBeInTheDocument();
  });

  it('embedded mount still renders the action cluster when actions are provided', () => {
    render(
      <CoachHelmShell
        active="players"
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
        title="Players"
        embedded
        actions={<Button>New focus area</Button>}
      >
        <div>body content</div>
      </CoachHelmShell>,
    );

    expect(screen.getByRole('button', { name: 'New focus area' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Players' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'CoachHelm sections' })).toBeNull();
  });
});
