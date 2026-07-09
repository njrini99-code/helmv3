'use client';

// =============================================================================
// JourneyClient — the player's "recruiting journey" surface, migrated onto
// "The Living Annual" kit (Lane 3 · THE PASSPORT, green ink — spec §5, §6
// alongside Analytics / College Interest; ui-migration-map.md `timeline` row).
//
// PRESENTATION ONLY. `useJourney()` (the schools + events + stats query) and
// the validated `updateInterestStatus` server action are byte-for-byte
// unchanged — only the render moved to the kit. Off-palette status colors
// (blue/purple/amber funnel badges) are replaced with lane-ink `<InkBadge>`
// tones; the funnel still reads left-to-right, it just never leaves green.
// =============================================================================

import { useState } from 'react';
import Link from 'next/link';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  IconTarget,
  IconEye,
  IconVideo,
  IconMessage,
  IconCalendar,
  IconPlus,
  IconChevronRight,
} from '@/components/icons';
import { useJourney, type JourneySchool, type JourneyEvent } from '@/hooks/use-journey';
import { updateInterestStatus } from '@/app/baseball/actions/interests';
import { cn, formatRelativeTime } from '@/lib/utils';
import {
  SectionMasthead,
  Eyebrow,
  RuledStatLine,
  KPIContentsStrip,
  PaperCard,
  InkBadge,
  EditorsLetter,
  Reveal,
} from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

const statusOptions = [
  { value: 'interested', label: 'Interested' },
  { value: 'researching', label: 'Researching' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'visited', label: 'Campus Visit' },
  { value: 'offered', label: 'Offer Extended' },
  { value: 'committed', label: 'Committed' },
];

// Funnel progression reads in ONE ink (green, Passport lane) — never the
// legacy blue/purple/amber map. Later funnel stages simply get more presence
// (solid vs. soft), and `committed` — the one genuinely celebratory moment —
// is the sole `sodium` accent in this surface (spec §4.2 rule 4).
const STATUS_BADGE: Record<string, { tone: 'team' | 'sodium'; variant: 'soft' | 'solid' }> = {
  interested: { tone: 'team', variant: 'soft' },
  researching: { tone: 'team', variant: 'soft' },
  contacted: { tone: 'team', variant: 'solid' },
  visited: { tone: 'team', variant: 'solid' },
  offered: { tone: 'team', variant: 'solid' },
  committed: { tone: 'sodium', variant: 'solid' },
};

// Icons carry the read via SHAPE, not chrome color (spec §4.2 rule 2) — every
// timeline icon stays in lane ink (green), matching CollegeInterestClient's
// established pattern for the same kind of activity feed.
function getEventIcon(type: JourneyEvent['type']) {
  const cls = 'text-grade-plus';
  switch (type) {
    case 'profile_view':
      return <IconEye size={14} className={cls} aria-hidden />;
    case 'watchlist_add':
      return <IconTarget size={14} className={cls} aria-hidden />;
    case 'video_view':
      return <IconVideo size={14} className={cls} aria-hidden />;
    case 'message':
      return <IconMessage size={14} className={cls} aria-hidden />;
    case 'added_interest':
      return <IconPlus size={14} className={cls} aria-hidden />;
    case 'status_change':
      return <IconTarget size={14} className={cls} aria-hidden />;
    default:
      return <IconEye size={14} className={cls} aria-hidden />;
  }
}

function SchoolCard({
  school,
  index,
  onStatusChange,
}: {
  school: JourneySchool;
  index: number;
  onStatusChange: (id: string, status: string) => void;
}) {
  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateInterestStatus(school.id, newStatus);
      onStatusChange(school.id, newStatus);
    } catch {
      // Error handled silently - status update is non-critical
    }
  };

  const badge: { tone: 'team' | 'sodium'; variant: 'soft' | 'solid' } =
    STATUS_BADGE[school.status] ?? { tone: 'team', variant: 'soft' };
  const statusLabel = statusOptions.find((s) => s.value === school.status)?.label || school.status;

  return (
    <Reveal staggerIndex={Math.min(index, 10)}>
      <PaperCard className="p-4 lg:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h3 className="truncate font-annual text-h3 font-semibold leading-tight text-text-primary">
                {school.school_name}
              </h3>
              <InkBadge label={statusLabel.toUpperCase()} tone={badge.tone} variant={badge.variant} />
            </div>
            <Eyebrow ink="muted" items={[school.division, school.conference]} />
          </div>
          <Select
            options={statusOptions}
            value={school.status}
            onChange={handleStatusChange}
            className="w-36 shrink-0 text-sm"
          />
        </div>

        {/* Engagement */}
        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-[color:var(--hairline)] pt-3">
          <RuledStatLine label="Views" value={school.profile_views} ink="team" size="row" />
          {school.watchlist_added ? <InkBadge label="On Watchlist" tone="team" variant="soft" /> : null}
        </div>

        {school.notes && (
          <p className="mt-3 font-annual text-body-sm italic leading-relaxed text-text-tertiary">
            &ldquo;{school.notes}&rdquo;
          </p>
        )}

        <div className="mt-4 flex items-center justify-between">
          <span className="text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
            Added {formatRelativeTime(school.created_at)}
          </span>
          {school.organization_id && (
            <Link
              href={`/baseball/program/${school.organization_id}`}
              className="inline-flex items-center gap-1 font-annual text-body-sm font-medium text-grade-plus hover:underline"
            >
              View Program <IconChevronRight size={14} />
            </Link>
          )}
        </div>
      </PaperCard>
    </Reveal>
  );
}

function TimelineEvent({ event }: { event: JourneyEvent }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--hairline)] bg-[var(--paper)]">
          {getEventIcon(event.type)}
        </div>
        <div className="mt-2 w-px flex-1 bg-[color:var(--hairline)]" />
      </div>
      <div className="flex-1 pb-6">
        <p className="font-annual text-body-sm leading-relaxed text-text-secondary">{event.description}</p>
        <p className="mt-1 text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
          {formatRelativeTime(event.timestamp)}
        </p>
      </div>
    </div>
  );
}

function JourneySkeleton() {
  return (
    <div className={cn(PAGE_SHELL, 'space-y-8')}>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={220} height={11} />
        <Skeleton variant="text" width={200} height={36} />
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {[0, 1, 2].map((i) => (
            <PaperCard key={i} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-2">
                  <Skeleton variant="text" width="40%" height={18} />
                  <Skeleton variant="text" width="30%" height={11} />
                </div>
              </div>
            </PaperCard>
          ))}
        </div>
        <PaperCard className="space-y-4 p-5">
          <Skeleton variant="text" width="40%" height={14} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="text" width="100%" height={22} />
          ))}
        </PaperCard>
      </div>
    </div>
  );
}

export default function JourneyClient() {
  const { schools, events, stats, loading } = useJourney();
  const [schoolList, setSchoolList] = useState<JourneySchool[]>([]);

  // Sync schools from hook
  if (schools.length !== schoolList.length && !loading) {
    setSchoolList(schools);
  }

  const handleStatusChange = (id: string, newStatus: string) => {
    setSchoolList((prev) => prev.map((s) => (s.id === id ? { ...s, status: newStatus } : s)));
  };

  if (loading) {
    return <JourneySkeleton />;
  }

  const displaySchools = schoolList.length > 0 ? schoolList : schools;

  return (
    <div className={cn(PAGE_SHELL, 'space-y-8')}>
      <SectionMasthead
        eyebrow="THE PASSPORT · RECRUITING JOURNEY"
        title="My Journey"
        ink="team"
        actions={
          <Link
            href="/baseball/dashboard/colleges"
            className="inline-flex items-center gap-2 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] px-3 py-1.5 font-annual text-sm font-medium text-text-primary hover:bg-[color:var(--paper-canvas)]"
          >
            <IconPlus size={16} />
            Add Schools
          </Link>
        }
      >
        <p className="max-w-prose font-annual text-body-sm text-text-secondary">
          Track your recruiting progress with schools.
        </p>
      </SectionMasthead>

      {stats && stats.total_interests > 0 && (
        <KPIContentsStrip
          columns={5}
          items={[
            { label: 'Total Schools', value: stats.total_interests },
            { label: 'Interested', value: stats.schools_interested },
            { label: 'Contacted', value: stats.schools_contacted },
            { label: 'Visited', value: stats.schools_visited },
            { label: 'Offers', value: stats.schools_offered, leader: stats.schools_offered > 0 },
          ]}
        />
      )}

      <div className="grid grid-cols-1 gap-8 border-t border-[color:var(--hairline)] pt-6 lg:grid-cols-3">
        {/* Schools List */}
        <div className="space-y-4 lg:col-span-2">
          <Eyebrow as="h2" ink="team">Your Schools</Eyebrow>
          {displaySchools.length === 0 ? (
            <EditorsLetter
              ink="team"
              live
              title="No schools in your journey yet."
              body="Start by adding schools you're interested in from the Discover Colleges page."
              action={
                <Link
                  href="/baseball/dashboard/colleges"
                  className="inline-flex items-center gap-2 rounded-fw-md bg-grade-plus px-4 py-2 font-annual text-sm font-medium text-white hover:opacity-90"
                >
                  <IconPlus size={16} />
                  Discover Colleges
                </Link>
              }
            />
          ) : (
            <div className="space-y-4">
              {displaySchools.map((school, i) => (
                <SchoolCard key={school.id} school={school} index={i} onStatusChange={handleStatusChange} />
              ))}
            </div>
          )}
        </div>

        {/* Activity Timeline */}
        <div>
          <Eyebrow as="h2" ink="team" className="mb-4">Recent Activity</Eyebrow>
          <PaperCard className="p-5">
            {events.length === 0 ? (
              <div className="py-8 text-center">
                <IconCalendar size={28} className="mx-auto mb-2 text-text-tertiary" />
                <p className="font-annual text-body-sm text-text-secondary">No activity yet</p>
                <p className="mt-1 text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
                  Activity from coaches will appear here
                </p>
              </div>
            ) : (
              <div>
                {events.slice(0, 10).map((event) => (
                  <TimelineEvent key={event.id} event={event} />
                ))}
                {events.length > 10 && (
                  <p className="pt-2 text-center font-annual text-body-sm text-text-tertiary">
                    + {events.length - 10} more events
                  </p>
                )}
              </div>
            )}
          </PaperCard>
        </div>
      </div>
    </div>
  );
}
