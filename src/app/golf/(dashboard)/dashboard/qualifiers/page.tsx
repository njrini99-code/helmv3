import { createClient } from '@/lib/supabase/server';
import { ShineEffect } from '@/components/ui/shine-effect';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CreateQualifierButton } from '@/components/golf/qualifiers/CreateQualifierButton';
import type { GolfQualifier } from '@/lib/types/golf';
import { IconFlag, IconCalendar, IconMapPin, IconChevronRight, IconGolf } from '@/components/icons';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Qualifiers | Helm Sports',
  description: 'Track and manage team qualifiers for player selection and performance evaluation',
};

// Cache qualifiers for 5 minutes (qualifiers don't change frequently)
export const revalidate = 300;

export default async function GolfQualifiersPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const userRole = userData?.role;
  const isCoach = userRole === 'coach';

  let teamId: string | null = null;
  let qualifiers: GolfQualifier[] = [];

  if (isCoach) {
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    // Get team_id from organization
    if (coach?.organization_id) {
      const { data: orgTeam } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', coach.organization_id)
        .maybeSingle();
      teamId = orgTeam?.id || null;
    }
  } else {
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    // Get team_id from team_members
    if (player?.id) {
      const { data: teamMember } = await supabase
        .from('golf_team_members')
        .select('team_id')
        .eq('player_id', player.id)
        .maybeSingle();
      teamId = teamMember?.team_id || null;
    }
  }

  if (teamId) {
    const { data: qualifiersData } = await supabase
      .from('golf_qualifiers')
      .select('*')
      .eq('team_id', teamId)
      .order('start_date', { ascending: false });

    qualifiers = qualifiersData || [];
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

  return (
    <AnimatedPage className="min-h-full">
      {/* Header Section */}
      <AnimatedItem>
      <MobileNavHeader
        title="Qualifiers"
        subtitle={`${activeCount} active qualifier${activeCount !== 1 ? 's' : ''}`}
      >
        {isCoach && <CreateQualifierButton />}
      </MobileNavHeader>
      </AnimatedItem>

      {/* Main Content */}
      <AnimatedItem>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {qualifiers.length === 0 ? (
          <div className="relative glass-standard rounded-2xl overflow-hidden p-16 text-center">
            <ShineEffect />
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
              <IconFlag size={28} className="text-warm-400" />
            </div>
            <h3 className="text-lg font-semibold text-warm-900 mb-2">No Qualifiers Yet</h3>
            <p className="text-warm-500 mb-6 max-w-sm mx-auto">
              {isCoach
                ? 'Create a qualifier to track player performance for team selection'
                : 'No qualifiers have been created by your coach yet'}
            </p>
            {isCoach && <CreateQualifierButton />}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                  <div className="relative glass-standard rounded-2xl overflow-hidden p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                    <ShineEffect />
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0 pr-4">
                        <h3 className="text-lg font-semibold text-warm-900 group-hover:text-primary-600 transition-colors truncate">
                          {qualifier.name}
                        </h3>
                        {qualifier.description && (
                          <p className="text-sm text-warm-500 mt-1 line-clamp-2">
                            {qualifier.description}
                          </p>
                        )}
                      </div>
                      <span className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-full ${statusConfig.bg} ${statusConfig.text} shadow-sm`}>
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
                            style={{ width: `${Math.min(100, 50)}%` }}
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
