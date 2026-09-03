import 'server-only';
import { fetchTeamsEkgLens, type TeamsEkgRow } from '@/lib/admin/lenses/teams-ekg';

/**
 * Semantic activity threads (brief §20-27: "Activity: semantic threads
 * instead of a raw feed ('Nick completed Round #… · 3 autosaves · 1 retry ·
 * final submit successful · trace available') + an Activity Density
 * Ribbon").
 *
 * WHY THIS IS NOT A ROUND-BY-ROUND NARRATIVE: the brief's own example
 * implies per-round success counts (autosaves, retries, a "final submit
 * successful" step) that this codebase cannot honestly produce —
 * admin_events is a failure/soft-failure log (see golf-journey.ts's header)
 * and carries no round-scoped success trail beyond the single
 * `round_submitted` event; there is no indexed way to join admin_events
 * back to one round (`roundId` lives inside the free-form `metadata` jsonb,
 * unindexed — querying it per-round for a "top threads" index would be an
 * unbounded, unindexed scan). Building that specific narrative would mean
 * inventing counts this codebase cannot prove.
 *
 * WHAT THIS MODULE ACTUALLY DOES, honestly: collapses each TEAM's most
 * recent activity into one sentence, reusing teams-ekg.ts's already-fetched
 * 30-day bucket data (zero new admin_events queries) — "{team} — 12 events,
 * 2 errors in the last 48h, 1 unresolved" is a real, indexed, already-proven
 * number, not a per-round fabrication. Each thread links to the EXISTING
 * `/admin/thread/team/<id>` page (entity-thread.ts) for the full day-by-day
 * detail — this module is an index INTO that page, not a replacement for it.
 */

export type ThreadSeverity = 'critical' | 'warning' | 'quiet';

export interface ActivityThread {
  teamId: string;
  teamName: string;
  sport: 'golf' | 'baseball';
  sentence: string;
  severity: ThreadSeverity;
  lastActivityDate: string | null;
  threadHref: string;
}

export interface ActivityThreadsLens {
  threads: ActivityThread[];
  generatedAt: string;
  degradedNote: string | null;
}

const RECENT_BUCKET_COUNT = 2; // today + yesterday, matching EkgBucket's day granularity
const DEFAULT_LIMIT = 8;

function sentenceFor(team: TeamsEkgRow, activity48h: number, errors48h: number, critical48h: boolean): string {
  const parts: string[] = [`${activity48h} event${activity48h === 1 ? '' : 's'}`];
  if (errors48h > 0) parts.push(`${errors48h} error${errors48h === 1 ? '' : 's'}`);
  if (critical48h) parts.push('critical');
  if (team.unresolvedIncidents !== null && team.unresolvedIncidents > 0) {
    parts.push(`${team.unresolvedIncidents} unresolved`);
  }
  if (team.releaseImpact !== null && team.releaseImpact > 0) {
    parts.push(`${team.releaseImpact} since the live release`);
  }
  return `${team.name} (${team.sport}) — ${parts.join(' · ')} in the last 48h`;
}

export async function fetchSemanticActivityThreads(limit: number = DEFAULT_LIMIT): Promise<ActivityThreadsLens> {
  const ekg = await fetchTeamsEkgLens('most-active');

  const threads: ActivityThread[] = ekg.teams.map((team) => {
    const recent = team.buckets.slice(-RECENT_BUCKET_COUNT);
    const activity48h = recent.reduce((s, b) => s + b.activity, 0);
    const errors48h = recent.reduce((s, b) => s + b.errors, 0);
    const critical48h = recent.some((b) => b.critical);
    const severity: ThreadSeverity = critical48h ? 'critical' : errors48h > 0 ? 'warning' : 'quiet';
    return {
      teamId: team.teamId,
      teamName: team.name,
      sport: team.sport,
      sentence: sentenceFor(team, activity48h, errors48h, critical48h),
      severity,
      lastActivityDate: team.lastActivityDate,
      threadHref: team.threadHref,
    };
  });

  // Rank by severity first (a quiet-but-critical team must never be buried
  // under a noisy-but-healthy one). `Array.prototype.sort` is stable, so
  // same-severity teams keep the order fetchTeamsEkgLens('most-active')
  // already gave them — no second volume sort needed.
  const severityRank: Record<ThreadSeverity, number> = { critical: 0, warning: 1, quiet: 2 };
  threads.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return {
    threads: threads.slice(0, limit),
    generatedAt: ekg.generatedAt,
    degradedNote: ekg.degradedNote,
  };
}
