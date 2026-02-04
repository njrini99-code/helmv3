import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ShineEffect } from '@/components/ui/shine-effect';
import { IconTarget, IconCheck, IconClock } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Development | Helm Golf',
  description: 'View your development plans and focus areas assigned by your coach.',
};

export const revalidate = 60;

const DEFAULT_AREA = { label: 'Other', icon: '📋' };

const AREA_TYPES: Record<string, { label: string; icon: string }> = {
  driving: { label: 'Driving', icon: '🏌️' },
  iron_play: { label: 'Iron Play', icon: '⛳' },
  short_game: { label: 'Short Game', icon: '🎯' },
  putting: { label: 'Putting', icon: '🕳️' },
  course_management: { label: 'Course Management', icon: '🗺️' },
  mental_game: { label: 'Mental Game', icon: '🧠' },
  fitness: { label: 'Fitness', icon: '💪' },
  other: DEFAULT_AREA,
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-slate-100 text-slate-600',
  paused: 'bg-amber-100 text-amber-700',
};

export default async function MyDevelopmentPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/golf/login');
  }

  // Verify user is a player
  const { data: player } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    redirect('/golf/dashboard');
  }

  // Fetch focus areas for this player
  const { data: focusAreas } = await supabase
    .from('golf_player_focus_areas')
    .select(`
      id,
      area_type,
      title,
      description,
      status,
      target_metric,
      current_value,
      target_value,
      started_at,
      completed_at,
      created_at
    `)
    .eq('player_id', player.id)
    .order('created_at', { ascending: false });

  const activeAreas = (focusAreas || []).filter(fa => fa.status === 'active' || fa.status === 'in_progress');
  const completedAreas = (focusAreas || []).filter(fa => fa.status === 'completed');

  const getProgressPercent = (current: number | null, target: number | null) => {
    if (!current || !target || target === 0) return 0;
    return Math.min(100, Math.round((current / target) * 100));
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            My Development
          </h1>
          <p className="text-slate-500 mt-0.5">
            Focus areas assigned by your coach to help you improve
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {(focusAreas || []).length === 0 ? (
          <div className="relative glass-standard rounded-2xl overflow-hidden p-16 text-center">
            <ShineEffect />
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <IconTarget size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Development Plans Yet</h3>
            <p className="text-slate-500 max-w-sm mx-auto">
              Your coach hasn&apos;t assigned any focus areas yet. Check back later or talk to your coach about your development goals.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Active Focus Areas */}
            {activeAreas.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <IconClock size={20} className="text-green-600" />
                  Active Focus Areas
                </h2>
                <div className="space-y-4">
                  {activeAreas.map((fa) => {
                    const areaType = AREA_TYPES[fa.area_type || 'other'] ?? DEFAULT_AREA;
                    const progress = getProgressPercent(fa.current_value, fa.target_value);

                    return (
                      <div
                        key={fa.id}
                        className="relative glass-standard rounded-2xl overflow-hidden"
                        >
                        <ShineEffect />
                        <div className="p-5">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0 text-2xl">
                              {areaType.icon}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <h3 className="font-semibold text-slate-900">{fa.title || 'Untitled'}</h3>
                                  <p className="text-sm text-slate-500">{areaType.label}</p>
                                </div>
                                <span
                                  className={cn(
                                    'px-2.5 py-1 text-xs font-medium rounded-full capitalize',
                                    STATUS_STYLES[fa.status || 'active'] || STATUS_STYLES.active
                                  )}
                                >
                                  {fa.status === 'in_progress' ? 'In Progress' : fa.status || 'Active'}
                                </span>
                              </div>

                              {fa.description && (
                                <p className="text-sm text-slate-600 mt-3">{fa.description}</p>
                              )}

                              {/* Progress bar if metrics exist */}
                              {fa.target_value && (
                                <div className="mt-4">
                                  <div className="flex items-center justify-between text-sm mb-1.5">
                                    <span className="text-slate-500 font-medium">
                                      {fa.target_metric || 'Progress'}
                                    </span>
                                    <span className="font-semibold text-slate-700">
                                      {fa.current_value || 0} / {fa.target_value}
                                      <span className="text-slate-400 font-normal ml-1">
                                        ({progress}%)
                                      </span>
                                    </span>
                                  </div>
                                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all duration-500"
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                </div>
                              )}

                              {fa.started_at && (
                                <p className="text-xs text-slate-400 mt-3">
                                  Started {new Date(fa.started_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Completed Focus Areas */}
            {completedAreas.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <IconCheck size={20} className="text-slate-500" />
                  Completed
                </h2>
                <div className="space-y-3">
                  {completedAreas.map((fa) => {
                    const areaType = AREA_TYPES[fa.area_type || 'other'] ?? DEFAULT_AREA;

                    return (
                      <div
                        key={fa.id}
                        className="relative glass-standard rounded-2xl overflow-hidden opacity-75"
                      >
                        <ShineEffect />
                        <div className="p-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 text-xl">
                              {areaType.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-slate-700 truncate">{fa.title || 'Untitled'}</h3>
                              <p className="text-sm text-slate-500">{areaType.label}</p>
                            </div>
                            <div className="flex items-center gap-2 text-green-600">
                              <IconCheck size={16} />
                              <span className="text-sm font-medium">Complete</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
