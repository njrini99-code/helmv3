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

/**
 * RELEASE WAKE ribbon (brief §12) — a compact, bucketed summary around the
 * last deploy. Raw incident lists live on `/admin/deploys`; this ribbon is
 * deliberately just counts + one watch verdict, per §41-43 ("raw events are
 * bucketed server-side, never spammed").
 */
export function ReleaseWakeRibbon({ wake }: { wake: ReleaseWakeSnapshot }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-col items-start gap-0.5">
        <span className="font-fw-mono text-caption tabular-nums text-warm-500">{formatSha(wake.releaseSha)}</span>
        <ReleaseWatchPosturePill state={wake.watchState} pulse />
        <span className="text-caption text-warm-500">{formatAge(wake.ageHours)}</span>
      </div>
      <div className="flex flex-1 flex-wrap gap-2">
        <Lane label="Incidents" lane={wake.lanes.incidents} href="/admin/errors" />
        <Lane label="User impact" lane={wake.lanes.userImpact} href="/admin/errors" />
        <Lane label="DB errors" lane={wake.lanes.databaseErrors} href="/admin/jobs" />
        <Lane label="Latency" lane={wake.lanes.latency} />
        <Lane label="Invariants" lane={wake.lanes.invariants} href="/admin/jobs" />
        <Lane label="Self-heal" lane={wake.lanes.selfHealActions} href="/admin/self-heal" />
      </div>
      <Link href="/admin/deploys" className="shrink-0 text-caption text-accent-700 underline">
        Release Runway →
      </Link>
    </div>
  );
}
