/**
 * The round-type editor has to be REACHABLE — by the player, on their own round.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * Coach report 2026-08-19: "UNCW boys accidentally clicked practice instead of
 * qualifier and they just need to go in and change their type of round",
 * followed by the question that decides where the control belongs: "Can they
 * edit on their end or no?"
 *
 * `updateRoundType` and `RoundTypeEditor` shipped in c619a96cc with 9 passing
 * unit tests — and the component was rendered by NOTHING. `grep -rl
 * RoundTypeEditor src/` returned exactly one file: its own. Every test passed,
 * the feature was written up as done, and no user could reach it. A unit test
 * on an unmounted component proves the action works, not that the fix shipped.
 *
 * So the assertion here is deliberately about MOUNTING and about WHO, not about
 * the action's logic (which round-type.test.ts already covers): the control
 * renders for the owning player, not only for a coach.
 *
 * UPDATED for the facelift's overflow menu (2026-09): "Change round type" is
 * no longer its own standalone trigger button beside the masthead — it is a
 * `Menu.Item` (Radix, `role="menuitem"`) inside the header's "More actions"
 * overflow menu, opened via the `IconButton` trigger. The behavioral
 * guarantee this file exists to pin — reachability gated on `canChangeType`,
 * for both the owning player and a coach — is unchanged; only the query
 * changes: open the menu first, then look for the item. Radix portals menu
 * content to `document.body`, so queries use `screen` (unscoped), not a
 * container ref.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FairwayRoundDetail } from '../FairwayRoundDetail';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

afterEach(() => cleanup());

const ROUND = {
  id: 'round-1',
  course_name: 'Grandover East',
  round_date: '2026-08-18',
  round_type: 'practice',
  total_score: 74,
  score_to_par: 2,
  total_putts: 30,
  total_fairways: 14,
  total_fairways_hit: 9,
  total_gir: 11,
  total_gir_possible: 18,
  front_nine: 37,
  back_nine: 37,
  holes_played: 18,
};

function renderDetail(overrides: Record<string, unknown> = {}) {
  return render(
    <FairwayRoundDetail
      round={ROUND}
      holes={[]}
      aiRecap={null}
      reviewStats={null}
      playerName="Ben Potter"
      isCoach={false}
      viewerIsOwner
      canChangeType
      {...overrides}
    />,
  );
}

/** Opens the masthead's "More actions" overflow menu, where "Change round
 *  type" now lives as a `Menu.Item` (role="menuitem") rather than its own
 *  standalone trigger button. */
async function openOverflowMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await screen.findByRole('menu');
}

describe('FairwayRoundDetail — round type editor mounting', () => {
  it('offers the control to the PLAYER who owns the round', async () => {
    renderDetail({ isCoach: false, viewerIsOwner: true });
    await openOverflowMenu();

    // The literal ask: "can they edit on their end?" This is the assertion that
    // fails if the editor is ever gated back down to coaches only.
    expect(screen.getByRole('menuitem', { name: /change round type/i })).toBeTruthy();
  });

  it('offers the control to a coach viewing a player\'s round', async () => {
    renderDetail({ isCoach: true, viewerIsOwner: false });
    await openOverflowMenu();
    expect(screen.getByRole('menuitem', { name: /change round type/i })).toBeTruthy();
  });

  it('renders nothing extra when the viewer may not retype the round', async () => {
    renderDetail({ canChangeType: false });
    await openOverflowMenu();
    // The overflow menu itself still exists (it also carries "All stats");
    // only the "Change round type" item is gated on `canChangeType`.
    expect(screen.queryByRole('menuitem', { name: /change round type/i })).toBeNull();
  });

  it('still shows the round type in the context line either way', () => {
    renderDetail();
    // The control sits next to the value it edits; if the masthead ever stops
    // naming the type, "Change round type" loses its referent.
    expect(document.body.textContent).toMatch(/practice/i);
  });
});
