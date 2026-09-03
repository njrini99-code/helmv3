import Link from 'next/link';
import { EkgSparkline, StatusPill } from '@/components/fairway';
import type { TeamsEkgRow } from '@/lib/admin/lenses/teams-ekg';

/**
 * One row of the Team EKG Grid (brief §20-27: "Teams: Team EKG Grid
 * (30-day strip per team: activity, incidents, failed journeys,
 * utilization, release impact)"). The EKG strip itself is the EXISTING
 * `EkgSparkline` component already shipping at /admin/teams — this row adds
 * only the two lens-specific overlays teams-ekg.ts computes: release impact
 * and unresolved-incident count.
 */
export function TeamEkgRow({ team }: { team: TeamsEkgRow }) {
  return (
    <Link
      href={team.threadHref}
      className="flex flex-col gap-3 rounded-fw-md px-2 py-3 transition-colors hover:bg-surface-sunken md:flex-row md:items-center md:justify-between"
    >
      <div className="min-w-0 md:w-48">
        <p className="truncate text-sm font-medium text-warm-900">{team.name}</p>
        <p className="font-fw-mono text-xs text-warm-500">
          {team.sport} · {team.playerCount} players
        </p>
      </div>
      <EkgSparkline buckets={team.buckets} halo={team.halo} label={team.name} width={200} height={28} />
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={team.unresolvedIncidents === null ? 'neutral' : team.unresolvedIncidents > 0 ? 'warning' : 'success'} size="sm">
          {team.unresolvedIncidents === null ? 'unresolved unknown' : `${team.unresolvedIncidents} unresolved`}
        </StatusPill>
        <StatusPill tone={team.releaseImpact === null ? 'neutral' : team.releaseImpact > 0 ? 'danger' : 'success'} size="sm">
          {team.releaseImpact === null ? 'release impact unknown' : `${team.releaseImpact} since release`}
        </StatusPill>
      </div>
    </Link>
  );
}
