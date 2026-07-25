'use client';

// =============================================================================
// CampDetailClient — the coach's camp roster / check-in surface, migrated onto
// "The Living Annual" kit (Lane 2 · THE WAR ROOM, clay ink — a recruiting
// event's roster, sibling to Discover/Compare in this same wave).
//
// PRESENTATION ONLY. `fetchCampData`, `handleCheckIn`/`handleMarkNoShow`, and
// the ownership check are unchanged — only the render moved to the kit. The
// 13 off-palette blue/purple/amber/red hits (info-bar icon chips, quick-stat
// figures, and the status pill map) are replaced with lane-ink `<InkBadge>`/
// `<RuledStatLine>` — status now reads by LABEL, not by a chrome color map.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  IconArrowLeft,
  IconCalendar,
  IconMapPin,
  IconUsers,
  IconCheck,
  IconX,
  IconClock,
} from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import { fromUntyped } from '@/lib/supabase/untyped';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/sonner';
import { cn, getFullName, formatRelativeTime } from '@/lib/utils';
import { formatCampDate } from '@/lib/baseball/camp-utils';
import {
  SectionMasthead,
  PaperCard,
  Eyebrow,
  RuledStatLine,
  InkBadge,
  PositionChip,
  EditorsLetter,
  Reveal,
} from '@/components/baseball/living-annual';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

interface CampRegistration {
  id: string;
  camp_id: string;
  player_id: string;
  status: 'interested' | 'registered' | 'confirmed' | 'attended' | 'no_show' | 'cancelled';
  registered_at: string | null;
  attended_at: string | null;
  notes: string | null;
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    primary_position: string | null;
    grad_year: number | null;
    high_school_name: string | null;
    city: string | null;
    state: string | null;
  } | null;
}

interface Camp {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  location: string | null;
  capacity: number | null;
  status: string | null;
  price_cents: number | null;
  is_free: boolean | null;
  coach_id: string;
  organization: {
    id: string;
    name: string;
  } | null;
}

const CAMP_DETAIL_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

// Status reads by LABEL + tone, never a bespoke color map — no blue/amber/red
// (spec §4.2 rule 2: clay only for stamps/seals/hot signals, never generic
// chrome). `attended` is the one genuinely positive outcome and gets the
// lane-ink solid treatment; everything else stays quiet neutral.
const STATUS_BADGE: Record<string, { tone: 'pursuit' | 'neutral'; variant: 'soft' | 'solid' }> = {
  interested: { tone: 'neutral', variant: 'soft' },
  registered: { tone: 'neutral', variant: 'solid' },
  confirmed: { tone: 'pursuit', variant: 'soft' },
  attended: { tone: 'pursuit', variant: 'solid' },
  no_show: { tone: 'neutral', variant: 'soft' },
  cancelled: { tone: 'neutral', variant: 'soft' },
};

const STATUS_LABEL: Record<string, string> = {
  interested: 'Interested',
  registered: 'Registered',
  confirmed: 'Confirmed',
  attended: 'Checked In',
  no_show: 'No Show',
  cancelled: 'Cancelled',
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'registered', label: 'Pending' },
  { value: 'attended', label: 'Checked In' },
  { value: 'no_show', label: 'No Show' },
] as const;

// Segmented filter control — the same clay-ink `<Button variant="ghost">`
// pattern CollegeInterestClient/StatsCenterClient use for a button-group
// toggle (spec §7.1: `<Button>` already owns press/haptics).
function RosterFilterControl({
  value,
  onChange,
}: {
  value: (typeof FILTERS)[number]['value'];
  onChange: (v: (typeof FILTERS)[number]['value']) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Roster filter"
      className="inline-flex flex-wrap gap-1 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] p-1"
    >
      {FILTERS.map((f) => {
        const active = f.value === value;
        return (
          <Button
            key={f.value}
            type="button"
            variant="ghost"
            role="radio"
            aria-checked={active}
            haptic="none"
            onClick={() => onChange(f.value)}
            className={cn(
              'min-h-[44px] whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium',
              active
                ? 'bg-pursuit text-white shadow-sm hover:bg-pursuit'
                : 'text-text-secondary hover:bg-[color:var(--paper-canvas)]',
            )}
          >
            {f.label}
          </Button>
        );
      })}
    </div>
  );
}

function CampDetailSkeleton() {
  return (
    <div className={cn(PAGE_SHELL, 'space-y-6')}>
      <SectionMasthead eyebrow="THE WAR ROOM · CAMP ROSTER" title="Camp Details" ink="pursuit" />
      <PaperCard className="p-6">
        <Skeleton variant="text" width="40%" height={18} />
      </PaperCard>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <PaperCard key={i} className="p-4">
            <Skeleton variant="text" width="60%" height={11} className="mb-2" />
            <Skeleton variant="text" width="40%" height={28} />
          </PaperCard>
        ))}
      </div>
    </div>
  );
}

export default function CampDetailClient() {
  const params = useParams();
  const router = useRouter();
  const { coach, user } = useAuth();
  const { showToast } = useToast();
  const supabase = createClient();

  const campId = params.id as string;

  const [camp, setCamp] = useState<Camp | null>(null);
  const [registrations, setRegistrations] = useState<CampRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'registered' | 'attended' | 'no_show'>('all');

  const isCoach = user?.role === 'coach';

  const fetchCampData = useCallback(async () => {
    setLoading(true);

    // Fetch camp details
    const { data: campData, error: campError } = await supabase
      .from('baseball_camps')
      .select(`
        *,
        organization:organizations(id, name)
      `)
      .eq('id', campId)
      .single();

    if (campError || !campData) {
      showToast('Camp not found', 'error');
      router.push('/baseball/dashboard/camps');
      return;
    }

    // Verify coach owns this camp
    if (isCoach && coach && campData.coach_id !== coach.id) {
      showToast('You do not have access to this camp', 'error');
      router.push('/baseball/dashboard/camps');
      return;
    }

    setCamp(campData as Camp);

    // Fetch registrations with player details
    const { data: regsData } = await supabase
      .from('baseball_camp_registrations')
      .select(`
        id,
        camp_id,
        player_id,
        status,
        registered_at,
        attended_at,
        notes,
        player:baseball_players(
          id,
          first_name,
          last_name,
          avatar_url,
          primary_position,
          grad_year,
          high_school_name,
          city,
          state
        )
      `)
      .eq('camp_id', campId)
      .neq('status', 'cancelled')
      .order('registered_at', { ascending: false });

    setRegistrations((regsData as unknown as CampRegistration[]) || []);
    setLoading(false);
  }, [campId, coach, isCoach, router, showToast, supabase]);

  useEffect(() => {
    fetchCampData();
  }, [fetchCampData]);

  const handleCheckIn = async (registrationId: string) => {
    setCheckingIn(registrationId);

    const { error } = await fromUntyped(supabase, 'baseball_camp_registrations')
      .update({
        status: 'attended',
        attended_at: new Date().toISOString(),
      })
      .eq('id', registrationId);

    if (error) {
      showToast('Failed to check in player', 'error');
    } else {
      setRegistrations(prev =>
        prev.map(r =>
          r.id === registrationId
            ? { ...r, status: 'attended' as const, attended_at: new Date().toISOString() }
            : r
        )
      );
      showToast('Player checked in', 'success');
    }

    setCheckingIn(null);
  };

  const handleMarkNoShow = async (registrationId: string) => {
    const { error } = await supabase
      .from('baseball_camp_registrations')
      .update({ status: 'no_show' })
      .eq('id', registrationId);

    if (error) {
      showToast('Failed to update status', 'error');
    } else {
      setRegistrations(prev =>
        prev.map(r =>
          r.id === registrationId ? { ...r, status: 'no_show' as const } : r
        )
      );
    }
  };

  const filteredRegistrations = registrations.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'registered') return r.status === 'registered' || r.status === 'confirmed';
    return r.status === filter;
  });

  const stats = {
    total: registrations.length,
    attended: registrations.filter(r => r.status === 'attended').length,
    pending: registrations.filter(r => r.status === 'registered' || r.status === 'confirmed').length,
    noShow: registrations.filter(r => r.status === 'no_show').length,
  };

  if (loading) {
    return <CampDetailSkeleton />;
  }

  if (!camp) {
    return (
      <div className={PAGE_SHELL}>
        <SectionMasthead eyebrow="THE WAR ROOM · CAMP ROSTER" title="Camp Not Found" ink="pursuit" />
        <div className="mt-6">
          <EditorsLetter
            ink="pursuit"
            title="Camp not found."
            body="This camp may have been deleted or you don't have access."
            action={
              <Link href="/baseball/dashboard/camps">
                <Button>Back to Camps</Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(PAGE_SHELL, 'space-y-6')}>
      <SectionMasthead
        eyebrow="THE WAR ROOM · CAMP ROSTER"
        title={camp.name}
        ink="pursuit"
        actions={
          <Link href="/baseball/dashboard/camps">
            <Button variant="secondary" size="sm" leftIcon={<IconArrowLeft size={16} />}>
              Back
            </Button>
          </Link>
        }
      >
        {camp.organization?.name && (
          <p className="font-annual text-body-sm text-text-secondary">{camp.organization.name}</p>
        )}
      </SectionMasthead>

      {/* Camp Info */}
      <PaperCard className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-8">
          <div>
            <Eyebrow ink="muted" className="inline-flex items-center gap-1"><IconCalendar size={12} />Date</Eyebrow>
            <p className="mt-1 font-annual text-body-sm font-medium text-text-primary">
              {formatCampDate(camp.start_date, CAMP_DETAIL_DATE_OPTIONS)}
              {camp.end_date !== camp.start_date && ` - ${formatCampDate(camp.end_date, CAMP_DETAIL_DATE_OPTIONS)}`}
            </p>
          </div>

          {camp.location && (
            <div>
              <Eyebrow ink="muted" className="inline-flex items-center gap-1"><IconMapPin size={12} />Location</Eyebrow>
              <p className="mt-1 font-annual text-body-sm font-medium text-text-primary">{camp.location}</p>
            </div>
          )}

          <div>
            <Eyebrow ink="muted" className="inline-flex items-center gap-1"><IconUsers size={12} />Capacity</Eyebrow>
            <p className="mt-1 font-annual text-body-sm font-medium text-text-primary">
              {stats.total}{camp.capacity ? ` / ${camp.capacity}` : ''} registered
            </p>
          </div>
        </div>
      </PaperCard>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-4">
        <RuledStatLine label="Total" value={stats.total} ink="pursuit" size="row" />
        <RuledStatLine label="Checked In" value={stats.attended} ink="pursuit" size="row" leader={stats.attended > 0} />
        <RuledStatLine label="Pending" value={stats.pending} ink="pursuit" size="row" />
        <RuledStatLine label="No Show" value={stats.noShow} ink="pursuit" size="row" />
      </div>

      {/* Roster */}
      <PaperCard className="p-0">
        <div className="flex flex-col gap-4 border-b border-[color:var(--hairline)] p-5 sm:flex-row sm:items-center sm:justify-between">
          <Eyebrow as="h2" ink="pursuit">Roster ({filteredRegistrations.length})</Eyebrow>
          <RosterFilterControl value={filter} onChange={setFilter} />
        </div>

        {filteredRegistrations.length === 0 ? (
          <div className="p-8">
            <EditorsLetter ink="pursuit" title="No registrations yet." body="Players who sign up for this camp will appear here." />
          </div>
        ) : (
          <div className="divide-y divide-[color:var(--hairline)]">
            {filteredRegistrations.map((reg, i) => {
              const badge = STATUS_BADGE[reg.status] ?? { tone: 'neutral' as const, variant: 'soft' as const };
              return (
                <Reveal key={reg.id} staggerIndex={Math.min(i, 10)}>
                  {/* Stacks identity above the badge/action row below `sm` —
                      at 320-390px the trailing cluster (badge + Check In +
                      no-show) plus the avatar left no room for the name
                      column on one non-wrapping line, and the primary
                      "Check In" action was the piece most at risk of being
                      squeezed off. */}
                  <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <Avatar decorative
                        name={getFullName(reg.player?.first_name, reg.player?.last_name)}
                        src={reg.player?.avatar_url}
                        size="md"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-annual text-body-sm font-medium text-text-primary">
                            {getFullName(reg.player?.first_name, reg.player?.last_name)}
                          </p>
                          {reg.player?.primary_position && (
                            <PositionChip label={reg.player.primary_position} size="sm" />
                          )}
                        </div>
                        <p className="truncate font-annual text-body-sm text-text-tertiary">
                          {reg.player?.high_school_name && `${reg.player.high_school_name} • `}
                          {reg.player?.grad_year && `Class of ${reg.player.grad_year}`}
                          {reg.player?.city && reg.player?.state && ` • ${reg.player.city}, ${reg.player.state}`}
                        </p>
                        {reg.attended_at && (
                          <p className="mt-1 flex items-center gap-1 font-annual text-eyebrow uppercase tracking-[0.1em] text-pursuit">
                            <IconCheck size={12} />
                            Checked in {formatRelativeTime(reg.attended_at)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 sm:flex-shrink-0 sm:justify-end">
                      <InkBadge label={(STATUS_LABEL[reg.status] ?? reg.status).toUpperCase()} tone={badge.tone} variant={badge.variant} />

                      {isCoach && (reg.status === 'registered' || reg.status === 'confirmed') && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            onClick={() => handleCheckIn(reg.id)}
                            disabled={checkingIn === reg.id}
                            className="gap-1"
                          >
                            {checkingIn === reg.id ? (
                              <IconClock size={14} className="animate-spin" />
                            ) : (
                              <IconCheck size={14} />
                            )}
                            Check In
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleMarkNoShow(reg.id)}
                            aria-label="Mark no-show"
                          >
                            <IconX size={14} />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        )}
      </PaperCard>
    </div>
  );
}
