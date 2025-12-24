import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CreateQualifierButton } from '@/components/golf/qualifiers/CreateQualifierButton';
import type { GolfQualifier } from '@/lib/types/golf';
import { IconFlag, IconCalendar, IconMapPin, IconChevronRight, IconGolf, IconUsers } from '@/components/icons';

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
      .select('id, team_id')
      .eq('user_id', user.id)
      .single();

    teamId = coach?.team_id || null;
  } else {
    const { data: player } = await supabase
      .from('golf_players')
      .select('id, team_id')
      .eq('user_id', user.id)
      .single();

    teamId = player?.team_id || null;
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
        return { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' };
      case 'in_progress':
        return { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', pulse: true };
      case 'completed':
        return { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' };
      default:
        return { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' };
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
    <div className="min-h-screen">
      {/* Header Section */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Qualifiers</h1>
              <p className="text-slate-500 mt-0.5">
                {activeCount} active qualifier{activeCount !== 1 ? 's' : ''}
              </p>
            </div>
            {isCoach && <CreateQualifierButton />}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {qualifiers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/60 p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <IconFlag size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Qualifiers Yet</h3>
            <p className="text-slate-500 mb-6 max-w-sm mx-auto">
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
                  <div className="bg-white rounded-2xl border border-slate-200/60 p-6 hover:border-slate-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-200">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0 pr-4">
                        <h3 className="text-lg font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors truncate">
                          {qualifier.name}
                        </h3>
                        {qualifier.description && (
                          <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                            {qualifier.description}
                          </p>
                        )}
                      </div>
                      <span className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${statusConfig.bg} ${statusConfig.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot} ${statusConfig.pulse ? 'animate-pulse' : ''}`} />
                        {(qualifier.status || 'upcoming').replace('_', ' ')}
                      </span>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-slate-600">
                        <IconCalendar size={14} className="text-slate-400" />
                        <span>
                          {formatDate(qualifier.start_date)}
                          {qualifier.end_date && qualifier.end_date !== qualifier.start_date && (
                            <> - {formatDate(qualifier.end_date)}</>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-slate-600">
                        <IconGolf size={14} className="text-slate-400" />
                        <span>{qualifier.num_rounds} round{qualifier.num_rounds !== 1 ? 's' : ''} • {qualifier.holes_per_round} holes</span>
                      </div>

                      {qualifier.course_name && (
                        <div className="flex items-center gap-2 text-slate-600 col-span-2">
                          <IconMapPin size={14} className="text-slate-400" />
                          <span className="truncate">{qualifier.course_name}</span>
                          {qualifier.location && (
                            <span className="text-slate-400">• {qualifier.location}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                      {qualifier.show_live_leaderboard ? (
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </span>
                          Live Leaderboard
                        </span>
                      ) : (
                        <span />
                      )}
                      <span className="flex items-center gap-1 text-sm text-slate-400 group-hover:text-emerald-600 transition-colors">
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

      {/* CSS Keyframes */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
