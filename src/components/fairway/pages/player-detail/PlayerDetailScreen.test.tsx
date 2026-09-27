import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/golf/dashboard/roster/p1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/app/golf/actions/golf', () => ({ updatePlayerStatus: vi.fn(async () => ({ success: true })) }));

import { PlayerDetailScreen } from './PlayerDetailScreen';
import { buildPlayerDetailModel, type RawRound } from './buildPlayerDetailModel';
import type { PlayerDetailModel, PlayerIdentity } from './types';

const player: PlayerIdentity = {
  id: 'p1',
  firstName: 'Audit',
  fullName: 'Audit Testplayer',
  avatarUrl: null,
  graduationYear: 2029,
  email: null,
  phone: null,
  membershipStatus: 'active',
};

let seq = 0;
function round(date: string, total: number): RawRound {
  seq += 1;
  return {
    id: `r${seq}`,
    round_date: date,
    course_name: 'Pebble Beach',
    total_score: total,
    score_to_par: total - 72,
    front_nine: Math.floor(total / 2),
    back_nine: total - Math.floor(total / 2),
    holes_played: 18,
    total_putts: 32,
    round_type: 'tournament',
    status: 'completed',
  };
}

function model(rounds: RawRound[]): PlayerDetailModel {
  return buildPlayerDetailModel({
    firstName: player.firstName,
    seasonYear: 2026,
    rounds: { ok: true, value: rounds },
    roundStats: { ok: true, value: [] },
    genome: { ok: true, value: null },
    insights: { ok: true, value: [] },
    focusAreas: { ok: true, value: [] },
    goals: { ok: true, value: [] },
  });
}

async function renderWith(m: PlayerDetailModel, p: PlayerIdentity = player) {
  const detail = Promise.resolve(m);
  await act(async () => {
    render(<PlayerDetailScreen player={p} detail={detail} />);
    await detail;
  });
}

describe('PlayerDetailScreen', () => {
  it('gives a 0-round player coach-facing copy and exactly one action', async () => {
    await renderWith(model([]));
    expect(await screen.findByText('No rounds yet')).toBeTruthy();
    expect(screen.getByText('Nudge Audit to log their first round.')).toBeTruthy();
    const messageLinks = screen.getAllByRole('link', { name: /message/i });
    expect(messageLinks).toHaveLength(1);
    expect(messageLinks[0]!.textContent).toContain('Message Audit');
  });

  it('drops the old filler: no "Member since" and no sparkle icon rows', async () => {
    await renderWith(model([round('2026-08-02', 74)]));
    await screen.findByText(/Last round Aug 2/);
    expect(screen.queryByText(/Member since/i)).toBeNull();
    expect(screen.queryByText('Composite rating profile')).toBeNull();
    expect(screen.queryByText('Game-profile radar')).toBeNull();
  });

  it('shows initials on a tint when there is no photo', async () => {
    await renderWith(model([]));
    const avatar = document.querySelector('[data-slot="fw-avatar"]')!;
    expect(avatar.textContent).toContain('AT');
    expect(avatar.querySelector('img')).toBeNull();
  });

  it('renders the masthead status, one primary, the strip and the ledger for a player with rounds', async () => {
    const rounds = [round('2026-08-02', 74), round('2026-07-28', 70), round('2026-07-20', 77), round('2026-07-10', 75)];
    await renderWith(model(rounds));
    expect(await screen.findByText('Last round Aug 2 · 74 (+2)')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /^message$/i })).toHaveLength(1);
    const strip = document.querySelector('[data-slot="round-strip"]')!;
    expect(strip).toBeTruthy();
    expect(within(strip as HTMLElement).getByText('Best 70')).toBeTruthy();
    expect(strip.querySelector('[data-latest]')!.getAttribute('aria-label')).toContain('latest round');
    expect(screen.getAllByText('Scoring average').length).toBeGreaterThan(0);
    for (const href of ['/game?tab=scouting', '/game', '/genome']) {
      expect(document.querySelector(`a[href="/golf/dashboard/players/p1${href}"]`)).toBeTruthy();
    }
  });

  it('opens a read-only round summary from a bar, with no link to the paid round review', async () => {
    await renderWith(model([round('2026-08-02', 74), round('2026-07-28', 70)]));
    const latest = await screen.findByRole('button', { name: /Aug 2, Pebble Beach: 74/ });
    fireEvent.click(latest);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('74')).toBeTruthy();
    expect(dialog.querySelector('a[href*="/rounds/"]')).toBeNull();
  });
});
