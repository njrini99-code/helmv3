// =============================================================================
// src/components/baseball/player-profile/snapshot-cards/SnapshotHeaderBand.tsx
//
// V7 Profile Header band — the operating-status strip a coach scans first:
// status (active/limited/injured/redshirt/trial/showcase) + role, today's
// availability, latest readiness, next event, latest CoachHelm signal, and the
// snapshot's source-trust posture. Every field is honest: a not-present field
// renders a quiet "—" / "not set" rather than a fabricated value.
//
// Presentational only. Fed by getPlayerSnapshotCards().header.
// =============================================================================

import Link from 'next/link';
import {
  IconActivity,
  IconCalendar,
  IconSparkles,
  IconHeart,
  IconShieldCheck,
  IconChevronRight,
  IconBaseball,
} from '@/components/icons';
import { SourceTrustBadge } from '@/components/baseball/source-trust';
import { PaperCard } from '@/components/baseball/living-annual';
import { ToneChip, fmtDate } from './shared';
import type {
  SnapshotHeader,
  SnapshotPlayerStatus,
} from '@/lib/baseball/read-models/player-snapshot-cards';

const STATUS_META: Record<
  SnapshotPlayerStatus,
  { label: string; tone: 'success' | 'warning' | 'error' | 'info' | 'neutral' }
> = {
  active: { label: 'Active', tone: 'success' },
  limited: { label: 'Limited', tone: 'warning' },
  injured: { label: 'Injured', tone: 'error' },
  redshirt: { label: 'Redshirt', tone: 'info' },
  trial: { label: 'Trial', tone: 'neutral' },
  showcase: { label: 'Showcase', tone: 'info' },
};

function titleCase(s: string | null): string | null {
  if (!s) return null;
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function HeaderCell({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <span className="w-7 h-7 rounded-lg bg-cream-50/80 border border-warm-200/40 flex items-center justify-center flex-shrink-0 text-warm-500">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-eyebrow font-semibold text-warm-400 uppercase tracking-wide">{label}</p>
        <div className="mt-0.5 text-sm text-warm-800 font-medium truncate">{children}</div>
      </div>
    </div>
  );
}

export function SnapshotHeaderBand({
  header,
  playerId,
}: {
  header: SnapshotHeader;
  playerId: string;
}) {
  const status = STATUS_META[header.status.value];
  const confPct =
    header.latestSignal.confidence != null
      ? Math.round(header.latestSignal.confidence * 100)
      : null;

  return (
    <PaperCard as="section">
      {/* Status + role + trust row */}
      <div className="flex flex-wrap items-center gap-2 px-5 pt-4 pb-3 border-b border-[color:var(--hairline)]">
        <ToneChip tone={status.tone} icon={<IconActivity size={12} />}>
          {status.label}
          {!header.status.present && <span className="opacity-60 font-normal"> · assumed</span>}
        </ToneChip>
        <ToneChip tone="neutral" icon={<IconBaseball size={12} />}>
          {header.roleLabel}
        </ToneChip>
        {header.status.note && (
          <span className="text-xs text-warm-400">{titleCase(header.status.note)}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {header.sourceTrust ? (
            <SourceTrustBadge trust={header.sourceTrust} size="sm" />
          ) : (
            <span className="inline-flex items-center gap-1 text-eyebrow text-warm-400">
              <IconShieldCheck size={12} /> No sourced data yet
            </span>
          )}
        </div>
      </div>

      {/* Operating fields grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4 px-5 py-4">
        {/* Today's availability.
            THREE states, not two. `present: false` means no availability row
            exists for this player — it previously rendered as "Cleared (no
            flag)", which turns the ABSENCE of a medical/availability record into
            an affirmative clearance. A coach reads that as "checked, and fine".
            Nobody checked.
            The status chip two rows above already handles this correctly (it
            appends "· assumed" when !present); this cell simply never got the
            same treatment. `readFailed` splits out the third case, because the
            read model collapses a query error to the same null as an absent row
            — so a failed database read was also rendering as a clearance. */}
        <HeaderCell icon={<IconShieldCheck size={14} />} label="Availability">
          {header.availability.present ? (
            <span className="inline-flex items-center gap-1.5">
              {titleCase(header.availability.status) ?? '—'}
              {header.availability.reason && (
                <span className="text-warm-400 font-normal text-xs">
                  · {titleCase(header.availability.reason)}
                </span>
              )}
            </span>
          ) : header.availability.readFailed ? (
            <span className="text-warm-400 font-normal">Couldn&rsquo;t load</span>
          ) : (
            <span className="text-warm-400 font-normal">Not recorded</span>
          )}
        </HeaderCell>

        {/* Latest readiness */}
        <HeaderCell icon={<IconHeart size={14} />} label="Readiness">
          {header.readiness.present && header.readiness.label ? (
            <span className="inline-flex items-center gap-1.5">
              <ToneChip tone={header.readiness.tone ?? 'neutral'}>{header.readiness.label}</ToneChip>
              {header.readiness.stale && (
                <span className="text-pursuit font-normal text-xs">stale</span>
              )}
            </span>
          ) : (
            <span className="text-warm-400 font-normal">No check-in</span>
          )}
        </HeaderCell>

        {/* Next event */}
        <HeaderCell icon={<IconCalendar size={14} />} label="Next Event">
          {header.nextEvent.present ? (
            <span className="block truncate">
              {header.nextEvent.title}
              <span className="block text-eyebrow text-warm-400 font-normal">
                {titleCase(header.nextEvent.eventType)} · {fmtDate(header.nextEvent.startTime)}
              </span>
            </span>
          ) : (
            <span className="text-warm-400 font-normal">Nothing scheduled</span>
          )}
        </HeaderCell>

        {/* Latest CoachHelm signal */}
        <HeaderCell icon={<IconSparkles size={14} />} label="Latest Signal">
          {header.latestSignal.present ? (
            <Link
              href={`/baseball/dashboard/signals?player=${playerId}`}
              className="group inline-flex items-start gap-1 hover:text-primary-700 transition-colors"
            >
              <span className="block min-w-0">
                <span className="block truncate">{header.latestSignal.title}</span>
                <span className="block text-eyebrow text-warm-400 font-normal">
                  {titleCase(header.latestSignal.category)}
                  {confPct != null && ` · ${confPct}% conf`}
                </span>
              </span>
              <IconChevronRight
                size={13}
                className="mt-0.5 text-warm-300 group-hover:translate-x-0.5 transition-transform flex-shrink-0"
              />
            </Link>
          ) : (
            <span className="text-warm-400 font-normal">No active signal</span>
          )}
        </HeaderCell>
      </div>
    </PaperCard>
  );
}
