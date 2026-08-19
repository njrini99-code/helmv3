export interface TeamStatsFreshness {
  roundRefreshMinutes: number;
  statsCacheAsOf: string | null;
  statsCacheStale: boolean;
  standingAsOf: string | null;
  oldestSignalInsightAsOf: string | null;
}

function formatUtc(timestamp: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(timestamp);
  return match ? `${match[1]} ${match[2]} UTC` : timestamp;
}

export function earliestTimestamp(timestamps: Array<string | null | undefined>): string | null {
  const valid = timestamps.filter((timestamp): timestamp is string => {
    if (!timestamp) return false;
    return Number.isFinite(Date.parse(timestamp));
  });
  if (valid.length === 0) return null;
  return valid.reduce((earliest, timestamp) => (timestamp < earliest ? timestamp : earliest));
}

/**
 * Signal labels combine current completed rounds with persisted cache,
 * standing, and insight snapshots. Keep every timestamp explicit so a coach
 * can distinguish an unavailable snapshot from data that is merely older.
 */
export function formatTeamStatsFreshness(freshness: TeamStatsFreshness): string {
  const parts = [`Round results refresh within ${freshness.roundRefreshMinutes} min`];

  if (freshness.statsCacheAsOf) {
    parts.push(
      `stats cache as of ${formatUtc(freshness.statsCacheAsOf)}${freshness.statsCacheStale ? ' (refresh pending)' : ''}`,
    );
  }
  if (freshness.standingAsOf) {
    parts.push(`rank snapshot as of ${formatUtc(freshness.standingAsOf)}`);
  }
  if (freshness.oldestSignalInsightAsOf) {
    parts.push(`oldest signal insight: ${formatUtc(freshness.oldestSignalInsightAsOf)}`);
  }

  return parts.join(' · ');
}
