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
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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

describe('FairwayRoundDetail — round type editor mounting', () => {
  it('offers the control to the PLAYER who owns the round', () => {
    renderDetail({ isCoach: false, viewerIsOwner: true });

    // The literal ask: "can they edit on their end?" This is the assertion that
    // fails if the editor is ever gated back down to coaches only.
    expect(screen.getByRole('button', { name: /change type/i })).toBeTruthy();
  });

  it('offers the control to a coach viewing a player\'s round', () => {
    renderDetail({ isCoach: true, viewerIsOwner: false });
    expect(screen.getByRole('button', { name: /change type/i })).toBeTruthy();
  });

  it('renders nothing extra when the viewer may not retype the round', () => {
    renderDetail({ canChangeType: false });
    expect(screen.queryByRole('button', { name: /change type/i })).toBeNull();
  });

  it('still shows the round type in the context line either way', () => {
    renderDetail();
    // The control sits next to the value it edits; if the masthead ever stops
    // naming the type, "Change type" loses its referent.
    expect(document.body.textContent).toMatch(/practice/i);
  });
});
