import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CreateQualifierButton } from '@/components/golf/qualifiers/CreateQualifierButton';
import type { GolfQualifier } from '@/lib/types/golf';
import { IconFlag, IconCalendar, IconMapPin, IconChevronRight, IconGolf } from '@/components/icons';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { Metadata } from 'next';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayQualifiers } from '@/components/fairway/pages/qualifiers/FairwayQualifiers';

export const metadata: Metadata = {
  title: 'Qualifiers | Helm Sports',
  description: 'Track and manage team qualifiers for player selection and performance evaluation',
};

// Cache qualifiers for 5 minutes (qualifiers don't change frequently)
export const revalidate = 300;

export default async function GolfQualifiersPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { role, coach, player } = session;
  const isCoach = role === 'coach';
  const supabase = await createClient();

  let teamId: string | null = null;
  let qualifiers: GolfQualifier[] = [];

  if (isCoach && coach?.organization_id) {
    teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  } else if (player?.id) {
    const { data: teamMember } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', player.id)
      .maybeSingle();
    teamId = teamMember?.team_id || null;
  }

  if (teamId) {
    const { data: qualifiersData } = await supabase
      .from('golf_qualifiers')
      .select('*')
      .eq('team_id', teamId)
      .order('start_date', { ascending: false })
      // P328: bound the fetch to the PostgREST hard server cap. A team's
      // qualifier history grows unbounded across seasons; an explicit limit
      // makes the ceiling intentional (newest-1000 by start_date) instead of
      // silently truncated, and the Fairway list paginates the concluded
      // bucket client-side so the page stays scannable.
      .limit(1000);

    qualifiers = qualifiersData || [];
  }

  // ── Fairway redesign fork (flag-gated, additive) ──────────────────────────
  // Reuses the SAME role + golf_qualifiers list resolved above; re-skins onto
  // the warm-matte Fairway system. Legacy branch below is unchanged when off.
  if (isRedesignEnabled()) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
        <FairwayQualifiers isCoach={isCoach} qualifiers={qualifiers} />
      </div>
    );
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'upcoming':
        return { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', label: 'Upcoming', icon: '\u{1F4C5}' };
      case 'in_progress':
        return { bg: 'bg-primary-50', text: 'text-primary-700', dot: 'bg-primary-500', pulse: true, label: 'Live', icon: '\u{1F3AF}' };
      case 'completed':
        return { bg: 'bg-warm-100', text: 'text-warm-600', dot: 'bg-warm-400', label: 'Completed', icon: '\u2705' };
      default:
        return { bg: 'bg-warm-100', text: 'text-warm-600', dot: 'bg-warm-400', label: status.replace('_', ' ') };
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const activeCount = qualifiers.filter(q => q.status === 'in_progress' || q.status === 'upcoming').length;
  const concludedCount = qualifiers.filter(q => q.status === 'completed').length;

  return (
    <AnimatedPage className="min-h-full">
      {/* Header Section */}
      <AnimatedItem>
      <LargeTitleHeader
        title="Qualifiers"
        subtitle={`${activeCount} active qualifier${activeCount !== 1 ? 's' : ''}`}
      >
        {isCoach && <CreateQualifierButton />}
      </LargeTitleHeader>
      </AnimatedItem>

      {/* Main Content */}
      <AnimatedItem>
      <div className="max-w-[1280px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Editorial hero band — anchors the qualifier grid beneath the
            sticky title header in the magazine-cover rhythm. */}
        <Reveal>
          <div className="surface-stone rounded-3xl p-6 md:p-10 mb-6">
            <PageHeader
              eyebrow="Qualifiers"
              eyebrowAccent="primary"
              title="Lineup decisions."
              subtitle={
                qualifiers.length === 0
                  ? isCoach
                    ? 'Run head-to-head qualifiers to decide who plays this week.'
                    : 'Qualifiers your coach posts will appear here.'
                  : `${activeCount} active · ${concludedCount} concluded.`
              }
            />
          </div>
        </Reveal>

        {qualifiers.length === 0 ? (
          <div className="relative surface-matte rounded-3xl overflow-clip p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
              <IconFlag size={28} className="text-warm-400" />
            </div>
            <h3 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-2">No Qualifiers Yet</h3>
            <p className="text-warm-500 mb-6 max-w-sm mx-auto">
              {isCoach
                ? 'Create a qualifier to track player performance for team selection'
                : 'No qualifiers have been created by your coach yet'}
            </p>
            {isCoach && <CreateQualifierButton />}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {qualifiers.map((qualifier, index) => {
              const statusConfig = getStatusConfig(qualifier.status || 'upcoming');
              
              return (
                <Link
                  key={qualifier.id}
                  href={`/golf/dashboard/qualifiers/${qualifier.id}`}
                  className="block group"
                  style={{
                    animation: 'fadeInUp 0.4s ease-out forwards',
                    animationDelay: `${index * 50}ms`,
                    opacity: 0,
                  }}
                >
                  <div className="relative surface-matte rounded-3xl overflow-clip p-6 min-h-[80px] hover:shadow-lg hover:-translate-y-0.5 active:bg-warm-50 transition-all duration-200">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0 pr-4">
                        <h3 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] group-hover:text-primary-600 transition-colors truncate">
                          {qualifier.name}
                        </h3>
                        {qualifier.description && (
                          <p className="text-sm text-warm-500 mt-1 line-clamp-2">
                            {qualifier.description}
                          </p>
                        )}
                      </div>
                      <span className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-full ${statusConfig.bg} ${statusConfig.text} shadow-sm`}>
                        <span className={`w-2 h-2 rounded-full ${statusConfig.dot} ${statusConfig.pulse ? 'animate-pulse' : ''}`} />
                        {statusConfig.label || (qualifier.status || 'upcoming').replace('_', ' ')}
                      </span>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-warm-600">
                        <IconCalendar size={14} className="text-warm-400" />
                        <span>
                          {formatDate(qualifier.start_date)}
                          {qualifier.end_date && qualifier.end_date !== qualifier.start_date && (
                            <> - {formatDate(qualifier.end_date)}</>
                          )}
                        </span>
                      </div>

                      {qualifier.spots_available && (
                        <div className="flex items-center gap-2 text-warm-600">
                          <IconGolf size={14} className="text-warm-400" />
                          <span>{qualifier.spots_available} spots available</span>
                        </div>
                      )}

                      {qualifier.course_name && (
                        <div className="flex items-center gap-2 text-warm-600 col-span-2">
                          <IconMapPin size={14} className="text-warm-400" />
                          <span className="truncate">{qualifier.course_name}</span>
                        </div>
                      )}

                    </div>

                    {/* Progress indicator for in-progress qualifiers */}
                    {qualifier.status === 'in_progress' && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs text-warm-500 mb-1.5">
                          <span>Progress</span>
                          <span className="tabular-nums font-medium">
                            {qualifier.spots_available
                              ? `${qualifier.spots_available} players competing`
                              : 'In progress'}
                          </span>
                        </div>
                        <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-primary-500 to-primary-400 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, (() => {
                              const start = new Date(qualifier.start_date).getTime();
                              const end = qualifier.end_date ? new Date(qualifier.end_date).getTime() : start + 7 * 86400000;
                              const now = Date.now();
                              if (end <= start) return 100;
                              return Math.round(((now - start) / (end - start)) * 100);
                            })())}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-end mt-4 pt-4 border-t border-warm-100">
                      <span className="flex items-center gap-1 text-sm text-warm-400 group-hover:text-primary-600 transition-colors">
                        View Details
                        <IconChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      </AnimatedItem>
    </AnimatedPage>
  );
}
