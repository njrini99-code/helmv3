import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import { coachTour, earliestStaleFloor, loadPlayerDismissed, loadPlayerHelmGate, loadVisible, newestRounds, playerTeam } from './coachhelm';
import { countReads, readAreaOf, type ChReadArea, type ChReadCount, type ClassifiableInsight } from './coachhelm-classify';
import type { ChCoachPlayerScope, ChCoachPlayerScopeResult } from './coachhelm-player';
import type { ChTourBaseline } from './coachhelm-shape';
import { coachPlayerHref, diveReadHref, helmViewHref } from './coachhelm-views-shape';

/**
 * "CoachHelm sees…" on Game detail (Clubhouse P005, spec D build A): how many of the player's current reads are costing strokes and
 * how many are working, per Game detail section, and where the Deep dive is. Counts only: no title, no text, and nothing is recorded
 * as shown (the Board's own visible-rows read, `loadVisible`, records no exposure).
 *
 * The count is `countReads` (data/coachhelm-classify.ts), the one the coach's Game profile line and the roster's CoachHelm block use,
 * so the three never disagree. A coach's read takes the branded scope only (`loadCoachPlayerScope`, data/coachhelm-player.ts), never
 * an id from the address; a player's takes the session's own id.
 */

/** One section's count, and the Deep dive it links to (open on the read when the section has exactly one). */
export interface ChAreaReads extends ChReadCount {
  href: string;
}

/**
 * What Game detail draws. `ready`: the sections with at least one current read (a section with none draws nothing, never
 * "0 reads"). `off`: CoachHelm is off for the coach or for the player; nothing is drawn. `failed`: a read did not load; one line
 * under the section chips says so (CH-5215).
 */
export type ChStatsReads = { status: 'ready'; byArea: Partial<Record<ChReadArea, ChAreaReads>> } | { status: 'off' } | { status: 'failed' };

export type StatsReadsInput = { role: 'coach'; scope: ChCoachPlayerScope } | { role: 'player'; playerId: string };

const log = (what: string, err: unknown) => chLogServer('stats', what, err, 'coachhelm');

const FAILED: ChStatsReads = { status: 'failed' };

/** The reads by section, counted by `countReads`; `dive` is the Deep dive's address, with the one read's id when there is one. */
export function readsByArea(rows: ReadonlyArray<ClassifiableInsight & { id: string }>, tour: ChTourBaseline | null, newestRound: string | null, dive: (insightId: string | null) => string): Partial<Record<ChReadArea, ChAreaReads>> {
  const groups = new Map<ChReadArea, Array<ClassifiableInsight & { id: string }>>();
  for (const r of rows) {
    const area = readAreaOf(r.category);
    if (!area) continue;
    groups.set(area, [...(groups.get(area) ?? []), r]);
  }
  const out: Partial<Record<ChReadArea, ChAreaReads>> = {};
  for (const [area, group] of groups) {
    const count = countReads(group, tour, newestRound);
    const total = count.costing + count.working;
    if (total === 0) continue;
    // The one read the count is, when it is one: the link opens the Deep dive on it.
    const counted = total === 1 ? group.find((r) => {
      const c = countReads([r], tour, newestRound);
      return c.costing + c.working === 1;
    }) : undefined;
    out[area] = { ...count, href: dive(counted?.id ?? null) };
  }
  return out;
}

/**
 * The coach's: run only once the scope check answered ok, so a player off this team (or an id that is not one) reads nothing. The
 * scope's own gates (the coach's and the player's) were checked by `loadCoachPlayerScope`.
 */
async function coachReads(scope: ChCoachPlayerScope): Promise<ChStatsReads> {
  const supabase = await createClient();
  const [visible, tour] = await Promise.all([loadVisible(supabase, [scope.playerId]), coachTour(supabase, scope.teamId)]);
  if (visible.error) return FAILED;
  const rows = visible.rows.filter((r) => r.player_id === scope.playerId);
  const newest = await newestRounds(supabase, [scope.playerId], earliestStaleFloor(rows));
  if (newest.error) return FAILED;
  const base = coachPlayerHref('deep-dive', scope.playerId);
  const dive = (id: string | null) => (id ? `${base}&insight=${encodeURIComponent(id)}` : base);
  return { status: 'ready', byArea: readsByArea(rows, tour.baseline, newest.days.get(scope.playerId) ?? null, dive) };
}

/** The player's own: their gate, then their visible reads less the ones they dismissed (as their Board and Deep dive hide them). */
async function playerReads(playerId: string): Promise<ChStatsReads> {
  const gate = await loadPlayerHelmGate(playerId);
  if (gate.status === 'failed') return FAILED;
  if (gate.status === 'off') return { status: 'off' };
  const supabase = await createClient();
  const [visible, dismissed, team] = await Promise.all([loadVisible(supabase, [playerId]), loadPlayerDismissed(supabase, playerId), playerTeam(supabase, playerId)]);
  if (visible.error || dismissed.error) return FAILED;
  const rows = visible.rows.filter((r) => r.player_id === playerId && !dismissed.ids.has(r.id));
  const newest = await newestRounds(supabase, [playerId], earliestStaleFloor(rows));
  if (newest.error) return FAILED;
  const dive = (id: string | null) => (id ? diveReadHref(id) : helmViewHref('deep-dive'));
  return { status: 'ready', byArea: readsByArea(rows, team.tour, newest.days.get(playerId) ?? null, dive) };
}

/** Game detail's reads for this viewer. Never throws: a read that throws is `failed`, logged. */
export async function loadStatsReads(input: StatsReadsInput): Promise<ChStatsReads> {
  try {
    return input.role === 'coach' ? await coachReads(input.scope) : await playerReads(input.playerId);
  } catch (err) {
    log('reads', err);
    return FAILED;
  }
}

/**
 * A coach's reads from the scope check's answer: only an ok scope reads anything. A player off this team (or an id that is not one)
 * and CoachHelm off for the coach or the player draw nothing; a check that did not load is `failed`.
 */
export async function readsForScope(result: ChCoachPlayerScopeResult): Promise<ChStatsReads> {
  if (result.status === 'ok') return loadStatsReads({ role: 'coach', scope: result.scope });
  return result.status === 'failed' ? FAILED : { status: 'off' };
}
