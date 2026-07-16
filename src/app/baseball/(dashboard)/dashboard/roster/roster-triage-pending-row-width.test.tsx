// @vitest-environment jsdom
/**
 * Constrained-width render test for the Status board's "Awaiting Join"
 * (`pending`) column — round-3 FIX_FIRST on PR #882 (visual-audit 2026-07-16,
 * coach-roster-academics.md). Mirrors roster-triage-row-width.test.tsx (which
 * covers the generic RosterRowMenu kebab row) but for the OTHER Status-board
 * row shape: `PendingMemberActions` (Approve/Decline), which round-2 never
 * exercised.
 *
 * Round-2 cut every triage row to one stat column and gave `PlayerRowPlate`'s
 * name a hard `min-w-[64px]` floor — correct for a 44px trailing kebab, but
 * `PendingMemberActions` was a `shrink-0` pair of full-size FairwayButtons
 * ("Approve"/"Decline", each with an icon) costing ~200px combined. At the
 * same ~360-400px PaperCard column width every Status-board row lives in
 * (TriageBoard's grid adds columns as the viewport grows rather than
 * widening one card), that left no room for the name floor — real flexbox
 * overflow PaperCard's `overflow-hidden` would clip, taking the Approve/
 * Decline buttons themselves with it (a coach loses the ability to clear a
 * real pending join request — functional-access regression, not cosmetic).
 *
 * The fix is two-part, and both parts are load-bearing (see the width
 * arithmetic below — either one alone still overflows at 390px):
 *
 *   (a) the `pending` column zeroes its stat column (`buildPendingBoardStats`
 *       returns `[]` — a pending recruit has no season stats worth showing)
 *       via `TriageBoard`/`TriageColumn`'s `statsFor` override in
 *       RosterFairway.tsx, instead of the shared 1-column `boardRowStats`.
 *   (b) `PendingMemberActions` goes icon-only (two 44px `IconButton`s), not
 *       two labeled buttons — ~94px combined instead of ~200px.
 *
 * WIDTH ARITHMETIC AT 390px (same decomposition as roster-triage-row-width's
 * comment; jsdom has no layout engine, so this is the reasoning that governs
 * the fix, not something the test itself can assert in pixels):
 *
 *   390 page − 32 (page `px-4`) − 32 (PaperCard `p-4`) − 8 (row `gap-2`)
 *     = 318px budget for [PlayerRowPlate][trailing]
 *
 *   Trailing — PendingMemberActions icon-only: 44 + 44 + 6 (gap-1.5) = 94px
 *     → 318 − 94 = 224px left for PlayerRowPlate
 *
 *   PlayerRowPlate overhead (HoverReveal `px-1` + one `gap-3`, no stat-div so
 *   only 2 children [name-div, chevron] → 1 gap, not 2) + reserved chevron
 *   (`w-4`): 8 + 12 + 16 = 36px → 224 − 36 = 188px left for the name-div
 *
 *   Name-div at its floor (jersey "24" ~14px + gap-3 + 64px name floor +
 *   gap-3 + PositionChip "SS" ~26px): 14 + 12 + 64 + 12 + 26 = 128px
 *     → 188 − 128 = 60px of slack. Fits comfortably.
 *
 *   Contrast: (a) alone (stat zeroed, but buttons still full-text ~200px) —
 *     318 − 200 = 118px for PlayerRowPlate; minus the SAME 36px overhead =
 *     82px for a 128px name-div → −46px, OVERFLOWS.
 *   (b) alone (icon-only, but the freshness stat kept) — 318 − 94 = 224px;
 *     minus the WIDER 48px overhead (stat-div present → 2 gaps not 1) +
 *     80px stat-div (`w-20`) + 128px name-div = 256px needed → −32px,
 *     OVERFLOWS. Neither alone clears the 390px budget — both are required.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PlayerRowPlate } from '@/components/baseball/living-annual';
import { PendingMemberActions } from './RosterMemberActions';
import { buildPendingBoardStats } from './roster-wall-stats';

function renderPendingBoardRowAt390() {
  // Mirrors RosterFairway.tsx's real DOM shape for the `pending` Status-board
  // row: page `px-4` → TriageColumn's `PaperCard` (`p-4`) → the row's own
  // `flex items-center gap-2` wrapper around `min-w-0 flex-1` PlayerRowPlate
  // (stats zeroed via `buildPendingBoardStats`) + the trailing
  // `PendingMemberActions` — at 390px, the width the visual audit filed the
  // original kebab-clip bug against.
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
              stats={buildPendingBoardStats()}
              onClick={() => {}}
            />
          </div>
          <PendingMemberActions
            memberId="m1"
            playerName="Marcus Rodriguez"
            onApprove={vi.fn().mockResolvedValue({ success: true })}
            onReject={vi.fn().mockResolvedValue({ success: true })}
          />
        </div>
      </div>
    </div>,
  );
}

describe('Status-board "Awaiting Join" row at 390px — PlayerRowPlate + PendingMemberActions (#roster-pending-actions-clip)', () => {
  it('renders the full player name — not collapsed to a glyph or nothing', () => {
    renderPendingBoardRowAt390();
    expect(screen.getByText('Marcus')).toBeInTheDocument();
    expect(screen.getByText('Rodriguez')).toBeInTheDocument();
  });

  it('renders ZERO stat columns on the pending row — the width the Approve/Decline pair needs', () => {
    renderPendingBoardRowAt390();
    expect(screen.queryAllByTestId('player-row-stat')).toHaveLength(0);
  });

  it('renders both Approve and Decline, present and enabled — not clipped or dropped for width', () => {
    renderPendingBoardRowAt390();
    const approve = screen.getByRole('button', { name: "Approve Marcus Rodriguez's join request" });
    const decline = screen.getByRole('button', { name: "Decline Marcus Rodriguez's join request" });
    expect(approve).toBeInTheDocument();
    expect(approve).toBeEnabled();
    expect(decline).toBeInTheDocument();
    expect(decline).toBeEnabled();
  });

  it('Approve is genuinely clickable and invokes onApprove with the member id', () => {
    const onApprove = vi.fn().mockResolvedValue({ success: true });
    render(
      <div style={{ width: '390px' }} className="px-4">
        <div className="p-4">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <PlayerRowPlate
                firstName="Marcus"
                lastName="Rodriguez"
                jerseyNumber={24}
                position="SS"
                stats={buildPendingBoardStats()}
                onClick={() => {}}
              />
            </div>
            <PendingMemberActions
              memberId="m1"
              playerName="Marcus Rodriguez"
              onApprove={onApprove}
              onReject={vi.fn().mockResolvedValue({ success: true })}
            />
          </div>
        </div>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: "Approve Marcus Rodriguez's join request" }));
    expect(onApprove).toHaveBeenCalledWith('m1');
  });
});
