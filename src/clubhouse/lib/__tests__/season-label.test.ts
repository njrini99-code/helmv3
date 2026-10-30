/**
 * F-0002 (audit 2026-10-29, S0): Roster, Team Hub and Team stats printed the team's free-text `golf_teams.season`
 * ("2025-26", typed once in Settings and never turned over). The season shown is computed: 1 August in the team's zone
 * (owner rule), written with an en dash, "2026–27".
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

vi.mock('server-only', () => ({}));
let fake: FakeSupabase;
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('../track-server', () => ({ chLogServer: vi.fn() }));

import { currentSeasonLabel } from '../../data/season';
import { seasonLabelOf } from '../season-start';
import { seasonOf } from '../../data/tournaments-shape';
import { loadPlayerRoster } from '../../data/roster-player';

describe('currentSeasonLabel', () => {
  it('turns on 1 August in the team’s zone', () => {
    expect(currentSeasonLabel(new Date('2026-10-29T12:00:00Z'), 'America/New_York')).toBe('2026–27');
    // 31 Jul 2026 23:00 in New York is already 1 Aug in UTC: still last season for an Eastern team.
    expect(currentSeasonLabel(new Date('2026-08-01T03:00:00Z'), 'America/New_York')).toBe('2025–26');
    expect(currentSeasonLabel(new Date('2026-08-01T04:00:00Z'), 'America/New_York')).toBe('2026–27');
  });

  it('writes the en dash and two digits of the second year', () => {
    expect(seasonLabelOf('2099-08-01')).toBe('2099–00');
    expect(seasonLabelOf('2026-07-31')).toBe('2025–26');
  });

  it('Tournaments’ season label is the same helper', () => {
    expect(seasonOf('2026-27', 'mens', null).label).toBe(seasonLabelOf('2026-08-01'));
  });
});

describe('the loaders show the computed season, never the stored text', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-29T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('loadPlayerRoster: a team row holding "2025-26" shows 2026–27', async () => {
    fake = createFakeSupabase({
      user: { id: 'u1' },
      tables: {
        golf_teams: [{ id: 't1', name: 'Varsity', season: '2025-26' }],
        golf_team_settings: [{ team_id: 't1', timezone: 'America/New_York' }],
        golf_team_members: [],
        golf_team_coach_staff: [],
      },
      rpc: { golf_player_profiles: async () => ({ data: [], error: null }) },
    });
    const roster = await loadPlayerRoster({ teamId: 't1', playerId: 'p1' });
    expect(roster.season).toBe('2026–27');
  });

  // The coach Roster, Team Hub and Team stats loaders read a dozen tables each; the guard pins that none of them puts the
  // stored column on the page.
  it.each(['roster.ts', 'hub.ts', 'stats-team.ts', 'roster-player.ts'])('data/%s takes the season from currentSeasonLabel', (file) => {
    const src = readFileSync(join(process.cwd(), 'src/clubhouse/data', file), 'utf8');
    expect(src).not.toMatch(/season:\s*teamRes\.data\?\.season/);
    expect(src).toMatch(/season:\s*currentSeasonLabel\(/);
  });
});
