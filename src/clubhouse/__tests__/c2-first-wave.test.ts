import { afterEach, describe, expect, it, vi } from 'vitest';
import { readWaves } from './read-waves';

/**
 * C2 (Phase 3, row 16): reads that need nothing from an earlier answer go in the first wave. Team Hub read the team's
 * clock before anything else, and a Calendar deep link (`?event=`) read its event after the first wave: one round trip
 * each, on every load, that waited on nothing.
 */

const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables, gate: undefined as ((t: string) => Promise<void>) | undefined }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: async () => ({ data: [], error: null }) }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: async () => ({ success: true, data: { items: [] } }) }));
vi.mock('@/app/golf/actions/player-hub-data', () => ({ getPlayerHubSummaryData: async () => null }));
vi.mock('@/app/golf/actions/player-notifications', () => ({ getPlayerHubAnnouncements: async () => [] }));
vi.mock('@/app/golf/actions/announcements', () => ({ getAnnouncementsWithMeta: async () => ({ success: true, data: [] }) }));

import { loadTeamHub } from '../data/hub';
import { loadCalendar } from '../data/calendar';

afterEach(() => {
  tables.current = {};
  tables.gate = undefined;
});

describe('C2: no wave waits on nothing', () => {
  it('Team Hub reads the team’s clock in its first wave, beside the team', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    tables.current = { golf_team_settings: { data: { timezone: 'America/New_York' } }, golf_teams: { data: { name: 'Wolfpack', season: null } } };
    const { waves: depth } = await waves.run(loadTeamHub({ role: 'coach', teamId: 't1', userId: 'u1', playerId: null }));
    expect(depth[0]).toEqual(expect.arrayContaining(['golf_team_settings', 'golf_teams', 'golf_team_members']));
  });

  it('a Calendar deep link reads its event in the first wave, not after it', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_events: { data: [] },
    };
    const event = 'a0000000-0000-4000-8000-0000000000e1';
    const { waves: depth } = await waves.run(loadCalendar({ role: 'coach', teamId: 't1', viewerPlayerId: null, coachId: 'c1', view: 'week', event }));
    expect(depth[0]).toEqual(expect.arrayContaining(['golf_events', 'golf_team_settings', 'golf_teams', 'golf_team_members']));
    // The window's reads follow in one wave; the deep link adds none of its own.
    expect(depth[1]).toEqual(expect.arrayContaining(['golf_events']));
  });
});
