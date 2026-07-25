'use client';

// =============================================================================
// CollegeInterestClient — the coach-facing "who's scouting my players" surface,
// migrated onto "The Living Annual" kit (War Room lane, clay ink — spec §5
// Lane 2, alongside Discover / Watchlist / Signals; P4.30).
//
// PRESENTATION ONLY (data-fetch exception below). fetchInterests (the
// engagement-event query, the filter/sort math), and — LOAD-BEARING, do not
// touch — the `isAnonymous = !event.coach_id` derivation that nulls out
// coach_name/coach_school/coach_division for a not-yet-activated viewer, are
// byte-for-byte unchanged.
//
// EXCEPTION: `teamId` is now a prop resolved server-side (page.tsx, via the
// same cookie-aware `resolveCoachTeamIdWithCookie` Command Center uses) —
// the old client-side `fetchCoachTeam()` called `.single()` on
// `baseball_team_coach_staff` filtered only by `coach_id`, which threw for
// any coach with 2+ staff rows (showcase/multi-team coaches) and left the
// page on the skeleton loader forever with no error. It also ignored the
// team-switcher cookie entirely. Do not reintroduce client-side team
// resolution here.
//
// The 3 player-gate states are preserved EXACTLY — same 3 branches, same
// conditions (college-player lock → not-yet-activated lock → in-flight-redirect
// loading for an activated non-college player) — only restyled from the old
// glass Card + IconLock treatment onto `<EditorsLetter>` (green/Passport ink,
// since these are messages addressed TO a player).
// =============================================================================

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/loading';
import { Skeleton } from '@/components/ui/skeleton';
import { IconEye, IconVideo, IconStarFilled } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { usePlayerRecruitingGate } from '@/hooks/use-route-protection';
import { createClient } from '@/lib/supabase/client';
import { cn, getFullName, formatRelativeTime } from '@/lib/utils';
import {
  SectionMasthead,
  Eyebrow,
  RuledStatLine,
  PaperCard,
  InkBadge,
  EditorsLetter,
  Reveal,
} from '@/components/baseball/living-annual';

interface EngagementEvent {
  id: string;
  player_id: string;
  engagement_type: string;
  created_at: string | null;
  coach_id: string | null;
  coaches: {
    id: string;
    full_name: string | null;
    organization: {
      name: string | null;
      division: string | null;
    } | null;
  } | null;
  players: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    primary_position: string | null;
    grad_year: number | null;
    avatar_url: string | null;
  } | null;
}

interface PlayerInterest {
  player_id: string;
  player_name: string;
  player_position: string | null;
  player_grad_year: number | null;
  player_avatar_url: string | null;
  total_views: number;
  unique_coaches: number;
  watchlist_adds: number;
  recent_activity: Array<{
    id: string;
    engagement_type: string;
    created_at: string | null;
    coach_name: string | null;
    coach_school: string | null;
    coach_division: string | null;
  }>;
}

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';
const GATE_SHELL = 'mx-auto max-w-lg px-4 py-16 sm:px-6';

const INTEREST_FILTERS: Array<{ value: 'all' | 'high' | 'recent'; label: string }> = [
  { value: 'all', label: 'All Players' },
  { value: 'high', label: 'High Interest' },
  { value: 'recent', label: 'Recent (7d)' },
];

// Segmented filter control — same local pattern as StatsCenterClient's
// `SegmentedControl` (the established War Room / record-book convention for a
// button-group toggle), clay-ink active state for this lane. `<Button>` already
// owns its own press/haptic system (spec §7.1) — no bespoke hover/press CSS.
function InterestFilterControl({
  value,
  onChange,
}: {
  value: 'all' | 'high' | 'recent';
  onChange: (v: 'all' | 'high' | 'recent') => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Interest filter"
      className="inline-flex flex-wrap gap-1 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] p-1"
    >
      {INTEREST_FILTERS.map((f) => {
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
              'min-h-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium',
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

// Skeleton loader (not a spinner) for the interest list, matching the kit's
// double-bezel PaperCard rhythm so the loading frame IS the final frame.
function InterestListSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((i) => (
        <PaperCard key={i} className="p-4">
          <div className="flex items-start gap-3">
            <Skeleton variant="circular" width={40} height={40} />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" width="40%" height={16} />
              <Skeleton variant="text" width="30%" height={11} />
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-[color:var(--hairline)] pt-3">
            <Skeleton variant="text" width={110} height={10} />
            <Skeleton variant="text" width="80%" height={14} />
            <Skeleton variant="text" width="65%" height={14} />
          </div>
        </PaperCard>
      ))}
    </div>
  );
}

// Icons carry the read via SHAPE, not chrome color — every activity icon stays
// in lane ink (clay) per spec §4.2 rule 2 ("clay only on stamps/seals/hot
// signals... never generic chrome"); differentiating by red/blue/amber/purple
// literals would violate the two-ink system.
function getEngagementIcon(type: string) {
  switch (type) {
    case 'profile_view':
      return <IconEye size={14} className="text-pursuit" aria-hidden />;
    case 'video_view':
      return <IconVideo size={14} className="text-pursuit" aria-hidden />;
    case 'watchlist_add':
      return <IconStarFilled size={14} className="text-pursuit" aria-hidden />;
    default:
      return <IconEye size={14} className="text-text-tertiary" aria-hidden />;
  }
}

function getEngagementLabel(type: string) {
  switch (type) {
    case 'profile_view':
      return 'Viewed profile';
    case 'video_view':
      return 'Watched video';
    case 'watchlist_add':
      return 'Added to watchlist';
    default:
      return 'Activity';
  }
}

export default function CollegeInterestClient({ teamId }: { teamId: string | null }) {
  const { user, loading: authLoading } = useAuth();
  const { playerType, isActivated, isLoading: gateLoading } = usePlayerRecruitingGate();
  const [interests, setInterests] = useState<PlayerInterest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'high' | 'recent'>('all');

  useEffect(() => {
    if (teamId) {
      fetchInterests();
    } else {
      // No team resolved server-side (coach has no program/team yet) — stop
      // spinning on the skeleton so the honest "no team" empty state below
      // can render instead of loading forever.
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchInterests only depends on teamId/filter, already in deps
  }, [teamId, filter]);

  async function fetchInterests() {
    if (!teamId) return;

    setLoading(true);
    const supabase = createClient();

    // Get team players
    const { data: teamMembers } = await supabase
      .from('baseball_team_members')
      .select('player_id')
      .eq('team_id', teamId);

    if (!teamMembers || teamMembers.length === 0) {
      setInterests([]);
      setLoading(false);
      return;
    }

    const playerIds = teamMembers.map(m => m.player_id);

    // Fetch engagement events for team players
    const { data: events } = await supabase
      .from('baseball_player_engagement_events')
      .select(`
        id,
        player_id,
        engagement_type,
        created_at,
        coach_id,
        coaches:baseball_coaches!coach_id (
          id,
          full_name,
          organization:organizations (
            name,
            division
          )
        ),
        players:baseball_players!player_id (
          id,
          first_name,
          last_name,
          primary_position,
          grad_year,
          avatar_url
        )
      `)
      .in('player_id', playerIds)
      .in('engagement_type', ['profile_view', 'video_view', 'watchlist_add'])
      .order('created_at', { ascending: false })
      .limit(500);

    if (!events) {
      setInterests([]);
      setLoading(false);
      return;
    }

    // Group by player and calculate stats
    const playerMap = new Map<string, PlayerInterest>();
    const typedEvents = events as EngagementEvent[];

    typedEvents.forEach((event) => {
      const playerId = event.player_id;

      if (!playerMap.has(playerId)) {
        playerMap.set(playerId, {
          player_id: playerId,
          player_name: getFullName(event.players?.first_name, event.players?.last_name),
          player_position: event.players?.primary_position || null,
          player_grad_year: event.players?.grad_year || null,
          player_avatar_url: event.players?.avatar_url || null,
          total_views: 0,
          unique_coaches: 0,
          watchlist_adds: 0,
          recent_activity: [],
        });
      }

      const interest = playerMap.get(playerId)!;

      // Count engagement
      if (event.engagement_type === 'profile_view' || event.engagement_type === 'video_view') {
        interest.total_views++;
      }
      if (event.engagement_type === 'watchlist_add') {
        interest.watchlist_adds++;
      }

      // Add to recent activity (limit to 10 per player)
      // Note: anonymity is determined by whether coach info is available
      const isAnonymous = !event.coach_id;
      if (interest.recent_activity.length < 10) {
        interest.recent_activity.push({
          id: event.id,
          engagement_type: event.engagement_type,
          created_at: event.created_at,
          coach_name: isAnonymous
            ? null
            : (event.coaches?.full_name ?? 'Coach'),
          coach_school: isAnonymous ? null : (event.coaches?.organization?.name ?? null),
          coach_division: isAnonymous ? null : (event.coaches?.organization?.division ?? null),
        });
      }
    });

    // Count unique coaches per player
    typedEvents.forEach((event) => {
      const interest = playerMap.get(event.player_id);
      if (interest && event.coach_id) {
        const coachIds = new Set(
          typedEvents
            .filter((e) => e.player_id === event.player_id && e.coach_id)
            .map((e) => e.coach_id)
        );
        interest.unique_coaches = coachIds.size;
      }
    });

    let result = Array.from(playerMap.values());

    // Apply filter
    if (filter === 'high') {
      result = result.filter(i => i.watchlist_adds > 0 || i.unique_coaches >= 3);
    } else if (filter === 'recent') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      result = result.filter(i =>
        i.recent_activity.some(a => a.created_at && new Date(a.created_at) > sevenDaysAgo)
      );
    }

    // Sort by activity
    result.sort((a, b) => {
      const aLatest = a.recent_activity[0]?.created_at || '';
      const bLatest = b.recent_activity[0]?.created_at || '';
      return bLatest.localeCompare(aLatest);
    });

    setInterests(result);
    setLoading(false);
  }

  if (authLoading || gateLoading) return <PageLoading />;

  // Players who land on this coach surface see an appropriate gate state.
  if (user?.role === 'player') {
    // College players cannot activate recruiting at all — they use team features.
    if (playerType === 'college') {
      return (
        <div className={GATE_SHELL}>
          <EditorsLetter
            ink="team"
            title="Not available for college players"
            body="College interest tracking is a coach-facing tool. As a college player, your team features are available from the team dashboard."
          />
        </div>
      );
    }

    // Non-college players who haven't activated recruiting yet.
    if (!isActivated) {
      return (
        <div className={GATE_SHELL}>
          <EditorsLetter
            ink="team"
            title="Activate recruiting first"
            body="Once you activate recruiting, you'll be able to see which college programs are viewing your profile."
          />
        </div>
      );
    }

    // Non-college player — this is a coach surface; redirect is handled by the
    // gate hook (now fires for all non-college players, activated or not).
    // Show a loading state while the redirect is in flight.
    return <PageLoading />;
  }

  if (user?.role !== 'coach') {
    return (
      <div className={GATE_SHELL}>
        <EditorsLetter
          ink="team"
          title="Coaches only"
          body="Only coaches can access college interest tracking."
        />
      </div>
    );
  }

  // No team resolved server-side — a brand-new coach account with no
  // program/team set up yet. Honest next-action state instead of an
  // indefinite skeleton or a silent zero-players view.
  if (!teamId) {
    return (
      <div className={GATE_SHELL}>
        <EditorsLetter
          ink="pursuit"
          title="No team set up yet"
          body="Once your program has a team, you'll be able to track which colleges are viewing your players here."
          action={
            <Link
              href="/baseball/dashboard/command-center"
              className="inline-flex min-h-0 items-center rounded-md bg-pursuit px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pursuit focus-visible:ring-offset-2"
            >
              Go to Command Center
            </Link>
          }
        />
      </div>
    );
  }

  const stats = {
    totalPlayers: interests.length,
    highInterest: interests.filter(i => i.watchlist_adds > 0).length,
    totalViews: interests.reduce((sum, i) => sum + i.total_views, 0),
    avgCoachesPerPlayer: interests.length > 0
      ? Math.round(interests.reduce((sum, i) => sum + i.unique_coaches, 0) / interests.length)
      : 0,
  };

  return (
    <div className={cn(PAGE_SHELL, 'space-y-8')}>
      <SectionMasthead eyebrow="THE WAR ROOM · RECRUITING ACTIVITY" title="College Interest" ink="pursuit">
        <p className="max-w-prose font-annual text-body-sm text-text-secondary">
          Track which colleges are viewing and tracking your players.
        </p>
      </SectionMasthead>

      {/* Contents strip — clay ink (War Room lane; KPIContentsStrip is team-green
          by design and would mix inks here, so this composes RuledStatLine directly). */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-7 lg:grid-cols-4 lg:gap-x-8">
        <RuledStatLine label="Players Tracked" value={stats.totalPlayers} ink="pursuit" size="row" />
        <RuledStatLine
          label="High Interest"
          value={stats.highInterest}
          ink="pursuit"
          size="row"
          emphasis={stats.highInterest > 0}
        />
        <RuledStatLine label="Total Views" value={stats.totalViews} ink="pursuit" size="row" />
        <RuledStatLine label="Avg Coaches" value={stats.avgCoachesPerPlayer} ink="pursuit" size="row" />
      </div>

      <div className="flex flex-col gap-4 border-t border-[color:var(--hairline)] pt-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Eyebrow as="h2" ink="pursuit">Player Interest Activity</Eyebrow>
          <p className="mt-1 hidden font-annual text-body-sm text-text-secondary lg:block">
            See which colleges are viewing and tracking your players.
          </p>
        </div>
        <InterestFilterControl value={filter} onChange={setFilter} />
      </div>

      {loading ? (
        <InterestListSkeleton />
      ) : interests.length === 0 ? (
        <EditorsLetter
          ink="pursuit"
          live
          title="No college interest yet."
          body="When college coaches view your players' profiles or add them to watchlists, you'll see the activity here."
        />
      ) : (
        <div className="space-y-6">
          {interests.map((interest, i) => (
            <Reveal key={interest.player_id} staggerIndex={Math.min(i, 10)}>
              <PaperCard className="p-4 lg:p-5">
                <div className="flex items-start gap-3 lg:gap-4">
                  <Avatar decorative name={interest.player_name} src={interest.player_avatar_url || undefined} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-annual text-h3 font-semibold leading-tight text-text-primary">
                        {interest.player_name}
                      </h3>
                      {interest.watchlist_adds > 0 && (
                        <InkBadge
                          tone="pursuit"
                          variant="solid"
                          label={`${interest.watchlist_adds} WATCHLIST${interest.watchlist_adds > 1 ? 'S' : ''}`}
                        />
                      )}
                    </div>
                    <Eyebrow
                      ink="muted"
                      className="mt-1"
                      items={[interest.player_position, interest.player_grad_year != null ? String(interest.player_grad_year) : null]}
                    />
                    <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
                      <RuledStatLine label="Views" value={interest.total_views} ink="pursuit" size="row" />
                      <RuledStatLine
                        label="Colleges"
                        value={interest.unique_coaches}
                        ink="pursuit"
                        size="row"
                        leader={interest.unique_coaches > 0}
                      />
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                {interest.recent_activity.length > 0 && (
                  <div className="mt-4 border-t border-[color:var(--hairline)] pt-3">
                    <Eyebrow ink="muted" className="mb-2">Recent Activity</Eyebrow>
                    <div className="space-y-2.5">
                      {interest.recent_activity.slice(0, 5).map((activity) => (
                        <div key={activity.id} className="flex items-start gap-2.5">
                          <div className="mt-0.5 flex-shrink-0">{getEngagementIcon(activity.engagement_type)}</div>
                          <div className="min-w-0 flex-1">
                            {!activity.coach_name ? (
                              <p className="font-annual text-body-sm leading-relaxed text-text-secondary">
                                <span className="font-semibold text-text-primary">A college coach</span>{' '}
                                {getEngagementLabel(activity.engagement_type).toLowerCase()}
                                {activity.coach_division && (
                                  <span className="text-text-tertiary"> · {activity.coach_division}</span>
                                )}
                              </p>
                            ) : (
                              <p className="font-annual text-body-sm leading-relaxed text-text-secondary">
                                <span className="font-semibold text-text-primary">{activity.coach_name}</span> from{' '}
                                <span className="font-semibold text-text-primary">{activity.coach_school}</span>{' '}
                                {getEngagementLabel(activity.engagement_type).toLowerCase()}
                                {activity.coach_division && (
                                  <span className="text-text-tertiary"> · {activity.coach_division}</span>
                                )}
                              </p>
                            )}
                          </div>
                          <div className="flex-shrink-0 font-annual text-microbadge uppercase tracking-[0.1em] text-text-tertiary">
                            {activity.created_at ? formatRelativeTime(activity.created_at) : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </PaperCard>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
