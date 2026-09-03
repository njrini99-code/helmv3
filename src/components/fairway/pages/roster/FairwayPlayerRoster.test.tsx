/**
 * ============================================================================
 * FairwayPlayerRoster — GAPS_AUDIT_TABLET_LANDSCAPE_2026-09-02.md #1 (HIGH)
 * ----------------------------------------------------------------------------
 * The player-facing read-only "Team Roster" shares the same defect as the
 * coach roster (FairwayCoachRoster.test.tsx): at 810×1080 tablet portrait and
 * 844×390 mobile landscape, `md:grid-cols-2` (768px) put teammate cards into
 * 2 narrow columns while the app shell's sidebar still left a ~550px content
 * column, so a two-word name truncated to one letter + ellipsis. Fixed by
 * stepping the grid to `lg:grid-cols-2` (1024px) and letting the teammate
 * name wrap to 2 lines instead of single-line `truncate`.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FairwayPlayerRoster, type FairwayPlayerRosterPlayer } from './FairwayPlayerRoster';

function makePlayer(overrides: Partial<FairwayPlayerRosterPlayer> = {}): FairwayPlayerRosterPlayer {
  return {
    id: 'p1',
    first_name: 'Jordan',
    last_name: 'Lee',
    avatar_url: null,
    graduation_year: 2027,
    handicap: 2,
    last_seen: null,
    ...overrides,
  };
}

describe('FairwayPlayerRoster', () => {
  it('sizes the teammate grid at lg (1024px), not md (768px), so tablet/mobile-landscape width is not squeezed into 2 narrow columns', () => {
    const { container } = render(
      <FairwayPlayerRoster players={[makePlayer()]} teamName="Helm Golf" />,
    );
    expect(container.innerHTML).toMatch(/\blg:grid-cols-2\b/);
    expect(container.innerHTML).not.toMatch(/\bmd:grid-cols-2\b/);
  });

  it('lets a long teammate name wrap to 2 lines instead of truncating to one', () => {
    render(
      <FairwayPlayerRoster
        players={[makePlayer({ first_name: 'Cole', last_name: 'Bennett' })]}
        teamName="Helm Golf"
      />,
    );
    // TeammateCard's avatar carries a visually-hidden `sr-only` echo of the
    // full name too, so `getByText` alone is ambiguous — pin the visible
    // heading specifically.
    const nameEl = screen.getByRole('heading', { name: 'Cole Bennett', level: 3 });
    expect(nameEl.className).toMatch(/\bline-clamp-2\b/);
    expect(nameEl.className).not.toMatch(/\btruncate\b/);
  });
});
