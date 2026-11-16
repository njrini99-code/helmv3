import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { getValidTimezone } from '@/lib/calendar/timezone';
import { chLogServer } from '../lib/track-server';
import { figureSetOver, figureWindowLabel, figureWindowRounds, type ChFigureSet } from './figure-window';
import { holeRounds } from './round-scope';
import { loadSeasonRounds, seasonStartDate } from './season';
import { SEASON_FIGURE_SPEC, seasonSgByCategory, type ChSgByCategory } from './season-figures-shape';
import { loadRoundCache } from './stats-common';

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * A player's figures over this season, for the CoachHelm readers that used to take them from the lifetime stats cache
 * (`golf_player_stats_cache`): Standing's scoring baseline and the Deep dive's strokes gained by category.
 *
 * Why (stats and charts audit 2026-11-15, SC-01): production still runs the old `update_player_stats_complete`, whose putts, rates and
 * best round divide by every completed round's holes, test and total-only rounds included, and take the best round from test rounds
 * too (Cole B's best round read 37; putts read 4.5 to 7 low). The SQL fix is the held OD-01 chain, which is the owner's to apply. Until
 * then these readers take the season's rounds, as Stats counts them (practice out, test rounds never, a nine at half a round), with
 * greens, fairways and putts from each round's stats row (`figure-window.ts`), and say which window the figure covers.
 */
export type ChSeasonFigures = { status: 'ok'; set: ChFigureSet; label: string } | { status: 'failed' };

/**
 * One player's season figures, or `failed` when the rounds or their stats rows did not read (never figures without their rates). It
 * never throws: a caller's page stays up and says this part is missing.
 */
export async function loadPlayerSeasonFigures(sb: Supabase, playerId: string, opts: { zone: string; surface: string; now?: Date }): Promise<ChSeasonFigures> {
  try {
    return await readSeasonFigures(sb, playerId, opts);
  } catch (err) {
    chLogServer(opts.surface, 'seasonFigures', err);
    return { status: 'failed' };
  }
}

async function readSeasonFigures(sb: Supabase, playerId: string, opts: { zone: string; surface: string; now?: Date }): Promise<ChSeasonFigures> {
  const spec = SEASON_FIGURE_SPEC(opts.zone, opts.now);
  const loaded = await loadSeasonRounds(sb, [playerId], { surface: opts.surface, since: seasonStartDate(opts.now ?? new Date(), opts.zone) });
  if (loaded.error) return { status: 'failed' };
  const window = figureWindowRounds(
    loaded.rounds.filter((r) => r.player_id === playerId),
    spec,
  );
  const cache = await loadRoundCache(
    sb,
    holeRounds(window).map((r) => r.id),
    opts.surface,
  );
  if (cache.error) return { status: 'failed' };
  const set = figureSetOver(window, cache.byRound);
  return { status: 'ok', set, label: figureWindowLabel(set, 'season') };
}

/**
 * The time zone of the player's team (`golf_team_settings.timezone`), the clock the season starts on. Eastern, the product default,
 * when the player has no team, a read fails or the stored value is not a real zone: a date is never worth failing a page.
 */
export async function loadPlayerTeamZone(sb: Supabase, playerId: string, surface: string): Promise<string> {
  try {
    const member = await sb.from('golf_team_members').select('team_id').eq('player_id', playerId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (member.error) chLogServer(surface, 'zone', member.error);
    const teamId = (member.data as { team_id: string } | null)?.team_id;
    if (!teamId) return getValidTimezone(null);
    const settings = await sb.from('golf_team_settings').select('timezone').eq('team_id', teamId).maybeSingle();
    if (settings.error) chLogServer(surface, 'zone', settings.error);
    return getValidTimezone((settings.data as { timezone: string | null } | null)?.timezone);
  } catch (err) {
    chLogServer(surface, 'zone', err);
    return getValidTimezone(null);
  }
}

/**
 * One player's strokes gained by category this season, for the themes (`readThemes`). Strokes gained is on the round itself, so no
 * stats row is read, and the rounds are read beside the team's clock rather than after it: from the earliest the season can have
 * started on any clock (a day and a half before now, in UTC), then cut to the team's own season. Null when the rounds did not read.
 */
export async function loadPlayerSeasonSg(sb: Supabase, playerId: string, opts: { surface: string; now?: Date }): Promise<ChSgByCategory | null> {
  try {
    const now = opts.now ?? new Date();
    const floor = seasonStartDate(new Date(now.getTime() - 36 * 3_600_000), 'UTC');
    const [zone, loaded] = await Promise.all([loadPlayerTeamZone(sb, playerId, opts.surface), loadSeasonRounds(sb, [playerId], { surface: opts.surface, since: floor })]);
    if (loaded.error) return null;
    return seasonSgByCategory(
      loaded.rounds.filter((r) => r.player_id === playerId),
      zone,
      now,
    );
  } catch (err) {
    chLogServer(opts.surface, 'seasonSg', err);
    return null;
  }
}
