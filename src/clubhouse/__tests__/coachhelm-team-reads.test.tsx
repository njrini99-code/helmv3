import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard/coachhelm', useSearchParams: () => new URLSearchParams() }));
vi.mock('../screens/coachhelm/writes', () => ({ LIVE_ANALYST_READ_WRITES: { focus: vi.fn(), mark: vi.fn() } }));

import { buildTeamReads } from '@/lib/coachhelm/v3/analyst/reads/build';
import { readsTeam } from '@/lib/coachhelm/v3/analyst/reads/__tests__/team';
import { forPlayer } from '@/lib/coachhelm/v3/analyst/reads/player-card';
import { teamReadsPage } from '@/lib/coachhelm/v3/analyst/reads/team-page';
import type { PartId, ReadPayload } from '@/lib/coachhelm/v3/analyst/reads/types';
import { toPlayerRead } from '../data/coachhelm-analyst-read-shape';
import { toChTeamReads } from '../data/coachhelm-team-reads-shape';
import { PlayerReadCard } from '../screens/coachhelm/file/AnalystRead';
import { TeamReads } from '../screens/coachhelm/views/TeamReads';

afterEach(cleanup);

const base = buildTeamReads(readsTeam().rows()).payloads.find((p) => p.priority)!;

/** A full roster: 18 players, 15 with a read (11 on approach, 3 on putting, 1 off the tee), 3 without one yet. */
function roster(): ReadPayload[] {
  const parts: PartId[] = [...Array<PartId>(11).fill('strokes_gained_approach'), ...Array<PartId>(3).fill('strokes_gained_putting'), 'strokes_gained_off_the_tee'];
  const read = parts.map((area, i): ReadPayload => {
    const c = base.priority!;
    const lost = 0.4 + i * 0.1;
    return {
      ...base,
      player_id: `p${String(i).padStart(2, '0')}`,
      figures: { ...base.figures, lost_per_round: lost.toFixed(1) },
      priority: { ...c, key: `priority:${area}`, area, area_label: { strokes_gained_approach: 'Approach', strokes_gained_putting: 'Putting', strokes_gained_off_the_tee: 'Off the tee', strokes_gained_around_the_green: 'Around the green' }[area], where_text: `Own line for player ${i}.`, numbers: { ...c.numbers, lost_per_round: lost } },
    };
  });
  const waiting = [0, 1, 2].map((i): ReadPayload => ({ ...base, player_id: `w${i}`, priority: null, missing: { text: `Needs 5 rounds with every shot logged this season; has ${i + 1}.`, needs: 5, has: i + 1 } }));
  return [...read, ...waiting];
}

describe('the team page from the saved reads, for a full roster', () => {
  const rows = roster().map((payload, i) => ({ payload, signature: payload.priority ? `${payload.priority.area}/band-${i % 4}/-` : null }));
  const page = teamReadsPage(rows);

  it('says the shared part once, groups the players by part (biggest first, worst loss first), and lists who has no read', () => {
    expect(page.shared?.text).toBe('Approach costs the most for 11 of 15 players. That is a team item, said once here; each player’s own line is below.');
    expect(page.groups.map((g) => [g.label, g.players.length])).toEqual([['Approach', 11], ['Putting', 3], ['Off the tee', 1]]);
    const approach = page.groups[0]!.players;
    expect(approach.map((p) => p.lost_text)).toEqual([...approach.map((p) => p.lost_text)].sort((a, b) => parseFloat(b) - parseFloat(a)));
    expect(page.groups[1]!.players.every((p) => p.exception === 'Not approach, as for most of the team.')).toBe(true);
    expect(page.waiting).toHaveLength(3);
  });

  it('no two rows repeat the shared sentence: each row is the player’s own line', () => {
    const lines = page.groups.flatMap((g) => g.players.map((p) => p.distinct));
    expect(new Set(lines).size).toBe(lines.length);
    for (const l of lines) expect(l).not.toContain('costs the most');
  });

  it('measures the same-card share at part, distance and pattern level', () => {
    expect(page.same_card).toMatchObject({ n: 3, of: 15 });
    for (const n of page.same_card.text.match(/\d+/g) ?? []) expect(Object.values(page.figures)).toContain(n);
  });

  it('draws every player by name, each opening their file, with no read and improved apart', () => {
    const names = new Map(roster().map((p, i) => [p.player_id, `Player ${i}`]));
    render(<TeamReads load={{ status: 'ready', data: toChTeamReads(page, names, 18) }} />);
    expect(screen.getByRole('heading', { name: 'Team reads' })).toBeInTheDocument();
    expect(screen.getByText(page.shared!.text)).toBeInTheDocument();
    expect(screen.getByText('15 of 18 players have a read')).toBeInTheDocument();
    const links = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.includes('view=player'));
    expect(links).toHaveLength(18);
    expect(links[0]!.getAttribute('href')).toContain('&at=reads');
    expect(within(screen.getByText('Player 15').closest('li')!).getByText('Needs 5 rounds with every shot logged this season; has 1.')).toBeInTheDocument();
  });

  it('CH-13215 says the page did not load; CH-13316 says no read is saved yet', () => {
    const { unmount } = render(<TeamReads load={{ status: 'failed' }} />);
    expect(document.querySelector('[data-ch-code="CH-13215"]')).not.toBeNull();
    unmount();
    render(<TeamReads load={{ status: 'ready', data: toChTeamReads(teamReadsPage([]), new Map(), 12) }} />);
    expect(document.querySelector('[data-ch-code="CH-13316"]')).not.toBeNull();
  });

  it('draws nothing when it is off', () => {
    const { container } = render(<TeamReads load={{ status: 'off' }} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('the player’s own read on Your week', () => {
  it('speaks to the player, with no team sentence, no coach’s verdict, no focus and no actions', () => {
    const read = toPlayerRead(forPlayer(base));
    render(<PlayerReadCard load={{ status: 'ready', read }} />);
    expect(screen.getByText('CoachHelm’s read of your game')).toBeInTheDocument();
    expect(screen.getByText(/^We compared your four parts/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set as focus' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Wrong' })).toBeNull();
    if (base.priority!.team) expect(screen.queryByText(base.priority!.team.value.text)).toBeNull();
    expect(read).toMatchObject({ cardKey: null, focus: null, suppressed: null, team: null });
  });

  it('CH-13216 says the read did not load and the week stays; off and none draw nothing', () => {
    render(<PlayerReadCard load={{ status: 'failed' }} />);
    expect(document.querySelector('[data-ch-code="CH-13216"]')?.textContent).toMatch(/Couldn’t load your read/);
    cleanup();
    expect(render(<PlayerReadCard load={{ status: 'off' }} />).container.innerHTML).toBe('');
    expect(render(<PlayerReadCard load={{ status: 'none' }} />).container.innerHTML).toBe('');
  });
});
