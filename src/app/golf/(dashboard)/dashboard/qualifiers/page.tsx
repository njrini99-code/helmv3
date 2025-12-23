import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CreateQualifierButton } from '@/components/golf/qualifiers/CreateQualifierButton';
import type { GolfQualifier } from '@/lib/types/golf';
import { IconFlag } from '@/components/icons';

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'upcoming':
        return 'bg-blue-100 text-blue-700';
      case 'in_progress':
        return 'bg-green-100 text-green-700';
      case 'completed':
        return 'bg-slate-100 text-slate-600';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Qualifiers</h1>
            <p className="text-slate-500 mt-1">Manage team qualifying rounds</p>
          </div>
          {isCoach && <CreateQualifierButton />}
        </div>

        {/* Qualifiers List */}
        {qualifiers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 shadow-sm text-center">
            <IconFlag size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              No Qualifiers Yet
            </h3>
            <p className="text-slate-500 mb-4">
              {isCoach
                ? 'Create a qualifier to track player performance for team selection'
                : 'No qualifiers have been created by your coach yet'}
            </p>
            {isCoach && <CreateQualifierButton />}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {qualifiers.map(qualifier => (
              <Link
                key={qualifier.id}
                href={`/golf/dashboard/qualifiers/${qualifier.id}`}
                className="block"
              >
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:border-green-200 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {qualifier.name}
                    </h3>
                    <span
                      className={`px-2.5 py-1 text-xs font-medium rounded-full ${getStatusBadge(
                        qualifier.status || 'upcoming'
                      )}`}
                    >
                      {qualifier.status || 'upcoming'}
                    </span>
                  </div>

                  {qualifier.description && (
                    <p className="text-sm text-slate-600 mb-4 line-clamp-2">
                      {qualifier.description}
                    </p>
                  )}

                  <div className="space-y-2 text-sm text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Dates:</span>
                      <span className="font-medium">
                        {formatDate(qualifier.start_date)}
                        {qualifier.end_date && qualifier.end_date !== qualifier.start_date && (
                          <> - {formatDate(qualifier.end_date)}</>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Rounds:</span>
                      <span className="font-medium">{qualifier.num_rounds}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Holes/Round:</span>
                      <span className="font-medium">{qualifier.holes_per_round}</span>
                    </div>

                    {qualifier.course_name && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Course:</span>
                        <span className="font-medium">{qualifier.course_name}</span>
                      </div>
                    )}

                    {qualifier.location && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Location:</span>
                        <span className="font-medium">{qualifier.location}</span>
                      </div>
                    )}
                  </div>

                  {qualifier.show_live_leaderboard && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-green-600">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        Live Leaderboard Active
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
