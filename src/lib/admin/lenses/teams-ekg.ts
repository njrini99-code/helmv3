import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { fetchPulseGrid, type PulseSort, type PulseTeamRow } from '@/lib/admin/data/pulse-grid';
import { fetchReleaseLedger } from '@/lib/admin/data/release-ledger';

/**
 * Team EKG Grid lens (brief §20-27: "Teams: Team EKG Grid (30-day strip per
 * team: activity, incidents, failed journeys, utilization, release
 * impact)").
 *
 * REUSE, NOT REBUILD: the 30-day activity/error EKG strip per team already
 * exists and ships today at /admin/teams, built by
 * src/lib/admin/data/pulse-grid.ts (fetchPulseGrid) and rendered with the
 * shared `EkgSparkline` component — see that module's own header for the
 * verified admin_events team_id coverage limits this lens inherits
 * unchanged. This module WRAPS fetchPulseGrid rather than re-querying
 * activity/error buckets from scratch, and adds exactly the two columns the
 * brief names that /admin/teams does not yet carry:
 *   - releaseImpact: error/critical admin_events for this team created
 *     SINCE the current live release (fetchReleaseLedger's `isLive` card),
 *     i.e. incidents plausibly tied to what's running right now.
 *   - unresolvedIncidents: currently-unresolved error/critical admin_events
 *     for this team, bounded to the SAME window pulse-grid's activity/error
 *     buckets use (`pulse.windowDays`, not all-time) — the closest honest
 *     proxy for "failed journeys" this module can support without a
 *     per-journey-stage-per-team join, which was out of scope for the time
 *     available. Disclosed as an approximation, not oversold as
 *     journey-level attribution.
 *
 * "Utilization" (feature adoption by team) is intentionally NOT duplicated
 * here — see adoption-map.ts, which already breaks feature adoption down by
 * team and is the correct place for that number to live once.
 *
 * Both bulk counts below are ONE query each across every team (grouped in
 * JS), never one query per team — same cost discipline pulse-grid.ts
 * documents for its own reads.
 */

export interface TeamsEkgRow extends PulseTeamRow {
  /** null when the release ledger read failed OR no live release could be
   *  identified — never coerced to 0. */
  releaseImpact: number | null;
  unresolvedIncidents: number | null;
}

export interface TeamsEkgLens {
  teams: TeamsEkgRow[];
  windowDays: number;
  sort: PulseSort;
  liveReleaseSha: string | null;
  liveReleaseSinceIso: string | null;
  generatedAt: string;
  degradedNote: string | null;
}

interface TeamCountRow {
  team_id: string | null;
}

function countByTeam(rows: readonly TeamCountRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.team_id) continue;
    counts.set(row.team_id, (counts.get(row.team_id) ?? 0) + 1);
  }
  return counts;
}

export async function fetchTeamsEkgLens(sort: PulseSort = 'attention'): Promise<TeamsEkgLens> {
  const admin = createAdminClient();
  const degraded: string[] = [];

  const [pulse, releaseLedger] = await Promise.all([fetchPulseGrid(sort), fetchReleaseLedger()]);
  if (pulse.degradedNote) degraded.push(pulse.degradedNote);

  const liveRelease = releaseLedger.status === 'ok' ? releaseLedger.data?.cards.find((c) => c.isLive) ?? null : null;
  if (releaseLedger.status === 'error') degraded.push(`release ledger unreadable: ${releaseLedger.error ?? 'unknown error'}`);
  const liveReleaseSinceIso = liveRelease ? new Date(liveRelease.createdAt).toISOString() : null;

  // Bound to the SAME window the rest of the EKG uses (pulse.windowDays back
  // from the moment pulse-grid was generated) — an unbounded "unresolved"
  // read used to answer a different question (all time) than every other
  // column on this row (30 days), and widened the row-count risk with it.
  const ekgWindowSinceIso = new Date(
    new Date(pulse.generatedAt).getTime() - pulse.windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Paginated past the PostgREST 1000-row cap — an unpaginated `.select()`
  // silently truncates once error/critical admin_events rows in the window
  // pass 1000, and a truncated-but-"successful" read used to resolve every
  // team OUTSIDE the truncated page to a fabricated 0 (a green "0
  // unresolved" pill on a team that was never actually checked). Ordered by
  // `id` (PK), not `team_id` — many rows share one team_id.
  let releaseImpactByTeam: Map<string, number> | null = null;
  if (liveReleaseSinceIso) {
    const res = await fetchAllRowsResult((from, to) =>
      admin
        .from('admin_events')
        .select('id, team_id')
        .not('team_id', 'is', null)
        .in('severity', ['error', 'critical'])
        .gte('created_at', liveReleaseSinceIso)
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (res.error) {
      degraded.push(`release-impact read failed: ${res.error.message}`);
    } else {
      releaseImpactByTeam = countByTeam((res.data ?? []) as TeamCountRow[]);
    }
  }

  const unresolvedRes = await fetchAllRowsResult((from, to) =>
    admin
      .from('admin_events')
      .select('id, team_id')
      .not('team_id', 'is', null)
      .in('severity', ['error', 'critical'])
      .eq('resolved', false)
      .gte('created_at', ekgWindowSinceIso)
      .order('id', { ascending: true })
      .range(from, to),
  );
  let unresolvedByTeam: Map<string, number> | null = null;
  if (unresolvedRes.error) {
    degraded.push(`unresolved-incident read failed: ${unresolvedRes.error.message}`);
  } else {
    unresolvedByTeam = countByTeam((unresolvedRes.data ?? []) as TeamCountRow[]);
  }

  const teams: TeamsEkgRow[] = pulse.teams.map((t) => ({
    ...t,
    releaseImpact: liveReleaseSinceIso === null ? null : releaseImpactByTeam?.get(t.teamId) ?? (releaseImpactByTeam ? 0 : null),
    unresolvedIncidents: unresolvedByTeam?.get(t.teamId) ?? (unresolvedByTeam ? 0 : null),
  }));

  return {
    teams,
    windowDays: pulse.windowDays,
    sort: pulse.sort,
    liveReleaseSha: liveRelease?.commitSha ?? null,
    liveReleaseSinceIso,
    generatedAt: pulse.generatedAt,
    degradedNote: degraded.length > 0 ? degraded.join('; ') : null,
  };
}
