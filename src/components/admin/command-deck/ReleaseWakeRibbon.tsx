import Link from 'next/link';
import type { ReleaseWakeSnapshot } from '@/lib/admin/command-deck/release-wake';
import { ReleaseWatchPosturePill, UnknownInline } from '@/components/admin/premium';

function formatSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : 'unknown SHA';
}

function formatAge(ageHours: number | null): string {
  if (ageHours === null) return 'age unknown';
  if (ageHours < 1) return `${Math.round(ageHours * 60)}m ago`;
  if (ageHours < 48) return `${Math.round(ageHours)}h ago`;
  return `${Math.round(ageHours / 24)}d ago`;
}

function Lane({ label, lane, href }: { label: string; lane: ReleaseWakeSnapshot['lanes']['incidents']; href?: string }) {
  const content = (
    <div className="flex min-w-[92px] flex-col items-center gap-0.5 rounded-lg bg-surface-sunken px-2.5 py-2">
      <span className="text-eyebrow uppercase text-warm-500">{label}</span>
      {lane.unknown ? (
        // Same shared "unknown" treatment as every other Bridge Premium
        // surface (`UnknownInline`, `premium/UnknownValue.tsx`) — a
        // hand-rolled muted `text-warm-400` count here would let this one
        // lane drift from the rest of the page's unknown vocabulary.
        <UnknownInline reason={lane.unknownReason} />
      ) : (
        <span className="font-fw-mono text-lg tabular-nums text-warm-900">{lane.count}</span>
      )}
    </div>
  );
  if (!href || lane.unknown) return content;
  return (
    <Link href={href} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500">
      {content}
    </Link>
  );
}

/** True when every lane the Bridge can measure read a confirmed zero. The two
 *  lanes with no read model (latency, invariants) are always unknown and are
 *  stated separately, so they neither block nor join this check. */
function measuredLanesAllZero(wake: ReleaseWakeSnapshot): boolean {
  const { incidents, userImpact, databaseErrors, selfHealActions } = wake.lanes;
  return [incidents, userImpact, databaseErrors, selfHealActions].every((lane) => !lane.unknown && lane.count === 0);
}

/**
 * RELEASE WAKE ribbon (brief §12) — a compact, bucketed summary around the
 * last deploy. Raw incident lists live on `/admin/deploys`; this ribbon is
 * deliberately just counts + one watch verdict, per §41-43 ("raw events are
 * bucketed server-side, never spammed").
 *
 * `quiet` (set only under a granted page-level all-clear): when every
 * measurable lane is a confirmed zero, six tiles of 0 / unknown become one
 * sentence, and the two unmeasured lanes are still named, as unknown, never
 * dropped. Any non-zero or unread lane renders the full ribbon.
 */
export function ReleaseWakeRibbon({ wake, quiet = false }: { wake: ReleaseWakeSnapshot; quiet?: boolean }) {
  const summarize = quiet && measuredLanesAllZero(wake);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-col items-start gap-0.5">
        <span className="font-fw-mono text-caption tabular-nums text-warm-500">{formatSha(wake.releaseSha)}</span>
        <ReleaseWatchPosturePill state={wake.watchState} pulse />
        <span className="text-caption text-warm-500">{formatAge(wake.ageHours)}</span>
      </div>
      {summarize ? (
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-body-sm text-warm-800">
            Nothing new since this release: no incidents, affected users, database errors or self-heal actions.
          </p>
          <p className="mt-0.5 text-caption text-warm-500">
            Not measured yet: <UnknownInline label="latency" reason={wake.lanes.latency.unknownReason} />,{' '}
            <UnknownInline label="invariants" reason={wake.lanes.invariants.unknownReason} />.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-wrap gap-2">
          <Lane label="Incidents" lane={wake.lanes.incidents} href="/admin/errors" />
          <Lane label="User impact" lane={wake.lanes.userImpact} href="/admin/errors" />
          <Lane label="DB errors" lane={wake.lanes.databaseErrors} href="/admin/jobs" />
          <Lane label="Latency" lane={wake.lanes.latency} />
          <Lane label="Invariants" lane={wake.lanes.invariants} href="/admin/jobs" />
          <Lane label="Self-heal" lane={wake.lanes.selfHealActions} href="/admin/errors?view=loop" />
        </div>
      )}
      <Link href="/admin/deploys" className="shrink-0 text-caption text-accent-700 underline">
        Release Runway →
      </Link>
    </div>
  );
}
