/**
 * Settings › Team Membership, as a player on a team. The 390px baseline cut
 * the team name and the organization on the same row ("Demo Univer…" over
 * "Demo Universit…"): both names truncated to one line so the Leave action
 * could share it. The row now wraps (the action drops to its own line when the
 * names need the width) and the names wrap instead of ellipsizing.
 *
 * jsdom doesn't lay out text, so this pins the class contract, in the resting
 * and the confirm-leave state.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/app/golf/actions/teams', () => ({
  getPlayerJoinRequests: vi.fn(async () => ({ success: true, data: [] })),
  createTeamJoinRequest: vi.fn(),
  cancelJoinRequest: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/utils/capacitor', () => ({
  triggerHaptic: vi.fn(async () => {}),
  isNativeApp: () => false,
}));

import { JoinTeamSection } from '@/components/golf/settings/JoinTeamSection';

const TEAM = {
  id: 'team-1',
  name: 'Demo University Golf',
  organization: { name: 'Demo University' },
};

function expectNamesWhole() {
  for (const text of [TEAM.name, TEAM.organization.name]) {
    const el = screen.getByText(text);
    expect(el.closest('.truncate')).toBeNull();
    expect(el.className).toMatch(/(^|\s)break-words(\s|$)/);
    expect(el.closest('.flex-wrap')).not.toBeNull();
  }
}

describe('JoinTeamSection current-team row', () => {
  it('shows the team and organization whole, with Leave free to drop below', () => {
    render(<JoinTeamSection playerId="player-1" currentTeam={TEAM} />);
    expectNamesWhole();
    expect(screen.getByRole('button', { name: /leave/i }).className).toMatch(/(^|\s)ml-auto(\s|$)/);
  });

  it('keeps the names whole while confirming a leave', () => {
    render(<JoinTeamSection playerId="player-1" currentTeam={TEAM} />);
    fireEvent.click(screen.getByRole('button', { name: /leave/i }));
    expect(screen.getByRole('button', { name: 'Confirm Leave' })).toBeInTheDocument();
    expectNamesWhole();
  });
});
