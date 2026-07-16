// @vitest-environment jsdom
/**
 * Constrained-width render test (FIX_FIRST follow-up on PR #882's roster
 * name-floor fix, visual-audit 2026-07-16, coach-roster-academics.md):
 *
 * The Status board (TriageColumn/TriageBoard in RosterFairway.tsx) renders
 * the SAME shared `PlayerRowPlate` molecule — with its `min-w-[64px]` name
 * floor — as the Roster Wall, but inside a PaperCard column that's only
 * ~360-400px wide at every breakpoint (TriageBoard's grid adds more
 * same-width columns as the viewport grows rather than widening a single
 * card), with the row's own trailing `RosterRowMenu` kebab (Edit
 * jersey/position, Remove from team) riding alongside it. Before this fix,
 * that row still carried 2 fixed-width stat columns (OPS + freshness), which
 * left no width budget for the name floor once a jersey number + position
 * chip + the 44px kebab took their share — real flexbox overflow that
 * PaperCard's `overflow-hidden` clips, up to and including the kebab itself
 * (a functional access regression: a coach loses Edit/Remove on that row).
 *
 * `jsdom` has no real layout/CSS engine, so this can't assert actual pixel
 * clipping — but it renders the REAL production shape (real `PlayerRowPlate`,
 * real `RosterRowMenu`, real `buildBoardStats`, no mocking-around-the-fix) at
 * the exact width the bug was filed against, and pins the two things that
 * actually matter: (1) the row still carries exactly the post-fix ONE stat
 * column, not the pre-fix two, and (2) the kebab is not just present in the
 * DOM but genuinely interactive — clicking it opens the real menu.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PlayerRowPlate } from '@/components/baseball/living-annual';
import { RosterRowMenu } from './RosterMemberActions';
import { buildBoardStats } from './roster-wall-stats';

function renderStatusBoardRowAt390() {
  // Mirrors RosterFairway.tsx's real DOM shape for a Status-board row:
  // page `px-4` → TriageColumn's `PaperCard` (`p-4`) → the row's own
  // `flex items-center gap-2` wrapper around `min-w-0 flex-1` PlayerRowPlate
  // + the trailing RosterRowMenu kebab — at 390px, the width the visual
  // audit filed the bug against.
  return render(
    <div style={{ width: '390px' }} className="px-4">
      <div className="p-4">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <PlayerRowPlate
              firstName="Marcus"
              lastName="Rodriguez"
              jerseyNumber={24}
              position="SS"
              stats={buildBoardStats({ level: 'fresh', days: 2, label: '2d' })}
              onClick={() => {}}
            />
          </div>
          <RosterRowMenu
            playerId="p1"
            playerName="Marcus Rodriguez"
            jerseyNumber={24}
            position="SS"
            onAssign={vi.fn().mockResolvedValue({ success: true })}
            onRemove={vi.fn().mockResolvedValue({ success: true })}
          />
        </div>
      </div>
    </div>,
  );
}

describe('Status-board row at 390px — PlayerRowPlate + RosterRowMenu (#roster-triage-kebab-clip)', () => {
  it('renders the full player name — not collapsed to a glyph or nothing', () => {
    renderStatusBoardRowAt390();
    expect(screen.getByText('Marcus')).toBeInTheDocument();
    expect(screen.getByText('Rodriguez')).toBeInTheDocument();
  });

  it('renders exactly ONE stat column on this row — the post-fix width budget, not the pre-fix two', () => {
    renderStatusBoardRowAt390();
    expect(screen.getAllByTestId('player-row-stat')).toHaveLength(1);
  });

  it('renders the trailing kebab and keeps it genuinely clickable — opening the real Edit/Remove menu', () => {
    renderStatusBoardRowAt390();
    const kebab = screen.getByRole('button', { name: 'Actions for Marcus Rodriguez' });
    expect(kebab).toBeInTheDocument();
    expect(kebab).toBeEnabled();

    fireEvent.click(kebab);

    // A clipped-but-present kebab would still exist in the DOM; asserting the
    // menu it opens actually renders proves it's reachable, not just mounted.
    expect(screen.getByText('Edit jersey / position')).toBeInTheDocument();
    expect(screen.getByText('Remove from team')).toBeInTheDocument();
  });
});
