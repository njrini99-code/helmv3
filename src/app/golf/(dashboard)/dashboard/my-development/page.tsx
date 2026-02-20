import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ShineEffect } from '@/components/ui/shine-effect';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import {
  IconTarget,
  IconCheck,
  IconClock,
  IconWind,
  IconCrosshair,
  IconFlag,
  IconCircleDot,
  IconMap,
  IconBrain,
  IconDumbbell,
  IconClipboardList,
  IconActivity,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { MobileMenuButton } from '@/components/golf/layout/MobileMenuButton';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'My Development | Helm Golf',
  description: 'View your development plans and focus areas assigned by your coach.',
};

export const revalidate = 60;

// ============================================================================
// AREA TYPE CONFIG (matches coach view, SVG icons)
// ============================================================================

interface AreaTypeConfig {
  label: string;
  icon: (props: { size?: number; className?: string }) => ReactNode;
  color: string;
  bgColor: string;
}

const AREA_TYPES: Record<string, AreaTypeConfig> = {
  driving: { label: 'Driving', icon: IconWind, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  iron_play: { label: 'Iron Play', icon: IconCrosshair, color: 'text-primary-600', bgColor: 'bg-primary-50' },
  short_game: { label: 'Short Game', icon: IconFlag, color: 'text-amber-600', bgColor: 'bg-amber-50' },
  putting: { label: 'Putting', icon: IconCircleDot, color: 'text-violet-600', bgColor: 'bg-violet-50' },
  course_management: { label: 'Course Mgmt', icon: IconMap, color: 'text-teal-600', bgColor: 'bg-teal-50' },
  mental_game: { label: 'Mental Game', icon: IconBrain, color: 'text-rose-600', bgColor: 'bg-rose-50' },
  fitness: { label: 'Fitness', icon: IconDumbbell, color: 'text-orange-600', bgColor: 'bg-orange-50' },
  other: { label: 'Other', icon: IconClipboardList, color: 'text-warm-600', bgColor: 'bg-warm-50' },
};

const DEFAULT_AREA: AreaTypeConfig = AREA_TYPES.other!;

const STATUS_CONFIG: Record<string, { label: string; color: string; borderColor: string }> = {
  active: { label: 'Active', color: 'bg-primary-50 text-primary-700', borderColor: 'border-primary-200' },
  in_progress: { label: 'In Progress', color: 'bg-blue-50 text-blue-700', borderColor: 'border-blue-200' },
  completed: { label: 'Completed', color: 'bg-warm-50 text-warm-600', borderColor: 'border-warm-200' },
  paused: { label: 'Paused', color: 'bg-amber-50 text-amber-700', borderColor: 'border-amber-200' },
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
    <AnimatedPage className="min-h-full">
      <AnimatedItem>
        <div className="border-b border-warm-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-5">
            <div className="flex items-center gap-3">
              <MobileMenuButton />
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                <IconTarget size={20} className="text-primary-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-warm-900">
                  My Development
                </h1>
                <p className="text-sm text-warm-500 mt-0.5">
                  Focus areas assigned by your coach to help you improve
                </p>
              </div>
            </div>

            {/* Summary stats bar */}
            {(focusAreas || []).length > 0 && (
              <div className="flex items-center gap-6 mt-4 pt-4 border-t border-warm-100">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary-500" />
                  <span className="text-sm text-warm-600">
                    <span className="font-semibold text-warm-900">{activeAreas.length}</span> Active
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-warm-300" />
                  <span className="text-sm text-warm-600">
                    <span className="font-semibold text-warm-900">{completedAreas.length}</span> Completed
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <IconActivity size={14} className="text-warm-400" />
                  <span className="text-sm text-warm-600">
                    <span className="font-semibold text-warm-900">{(focusAreas || []).length}</span> Total
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </AnimatedItem>

      <AnimatedItem>
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {(focusAreas || []).length === 0 ? (
          <div className="relative glass-standard rounded-2xl overflow-hidden p-8 md:p-16 text-center">
            <ShineEffect />
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
              <IconTarget size={28} className="text-warm-400" />
            </div>
            <h3 className="text-lg font-semibold text-warm-900 mb-2">No Development Plans Yet</h3>
            <p className="text-warm-500 max-w-sm mx-auto mb-4">
              Your coach hasn&apos;t assigned any focus areas yet. Check back later or talk to your coach about your development goals.
            </p>
            <a
              href="/golf/dashboard/messages"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              Message Coach
            </a>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Active Focus Areas */}
            {activeAreas.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-warm-900 mb-4 flex items-center gap-2">
                  <IconClock size={20} className="text-primary-600" />
                  Active Focus Areas
                  <span className="ml-auto text-sm font-normal text-warm-400">
                    {activeAreas.length} {activeAreas.length === 1 ? 'area' : 'areas'}
                  </span>
                </h2>
                <div className="space-y-4 mobile-stagger">
                  {activeAreas.map((fa) => {
                    const areaConfig = AREA_TYPES[fa.area_type || 'other'] ?? DEFAULT_AREA;
                    const progress = getProgressPercent(fa.current_value, fa.target_value);
                    const statusConfig = STATUS_CONFIG[fa.status || 'active'] ?? STATUS_CONFIG.active!;
                    const AreaIcon = areaConfig.icon;

                    return (
                      <div
                        key={fa.id}
                        className="relative glass-standard rounded-2xl overflow-hidden hover:shadow-md transition-shadow"
                      >
                        <ShineEffect />
                        {/* Colored top accent */}
                        <div className={cn('h-1', areaConfig.bgColor)} />
                        <div className="p-6">
                          <div className="flex items-start gap-4">
                            <div className={cn(
                              'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
                              areaConfig.bgColor
                            )}>
                              <AreaIcon size={22} className={areaConfig.color} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <h3 className="font-semibold text-warm-900">{fa.title || 'Untitled'}</h3>
                                  <p className={cn('text-sm font-medium mt-0.5', areaConfig.color)}>
                                    {areaConfig.label}
                                  </p>
                                </div>
                                <span
                                  className={cn(
                                    'px-2.5 py-1 text-xs font-medium rounded-full border',
                                    statusConfig.color,
                                    statusConfig.borderColor
                                  )}
                                >
                                  {statusConfig.label}
                                </span>
                              </div>

                              {fa.description && (
                                <p className="text-sm text-warm-600 mt-3 leading-relaxed">{fa.description}</p>
                              )}

                              {/* Progress bar if metrics exist */}
                              {fa.target_value != null && fa.target_value > 0 && (
                                <div className="mt-5">
                                  <div className="flex items-center justify-between text-sm mb-2">
                                    <span className="text-warm-500 font-medium">
                                      {fa.target_metric || 'Progress'}
                                    </span>
                                    <span className="font-semibold text-warm-700">
                                      {fa.current_value ?? 0}
                                      <span className="text-warm-400 font-normal mx-1">/</span>
                                      {fa.target_value}
                                      {progress > 0 && (
                                        <span className={cn(
                                          'ml-2 text-xs font-medium px-1.5 py-0.5 rounded',
                                          progress >= 100 ? 'bg-primary-100 text-primary-700' :
                                          progress >= 50 ? 'bg-blue-100 text-blue-700' :
                                          'bg-warm-100 text-warm-600'
                                        )}>
                                          {progress}%
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="h-2.5 bg-warm-100 rounded-full overflow-hidden">
                                    <div
                                      className={cn(
                                        'h-full rounded-full transition-all duration-700 ease-out',
                                        progress >= 100
                                          ? 'bg-gradient-to-r from-primary-500 to-primary-400'
                                          : progress >= 50
                                            ? 'bg-gradient-to-r from-blue-500 to-blue-400'
                                            : 'bg-gradient-to-r from-warm-400 to-warm-300'
                                      )}
                                      style={{ width: `${Math.min(progress, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Date */}
                              {fa.started_at && (
                                <p className="text-xs text-warm-400 mt-4">
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
                <h2 className="text-lg font-semibold text-warm-900 mb-4 flex items-center gap-2">
                  <IconCheck size={20} className="text-warm-500" />
                  Completed
                  <span className="ml-auto text-sm font-normal text-warm-400">
                    {completedAreas.length} {completedAreas.length === 1 ? 'area' : 'areas'}
                  </span>
                </h2>
                <div className="space-y-3">
                  {completedAreas.map((fa) => {
                    const areaConfig = AREA_TYPES[fa.area_type || 'other'] ?? DEFAULT_AREA;
                    const AreaIcon = areaConfig.icon;

                    return (
                      <div
                        key={fa.id}
                        className="relative bg-white/50 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm overflow-hidden"
                      >
                        <ShineEffect />
                        <div className="p-5">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-warm-100 flex items-center justify-center flex-shrink-0">
                              <AreaIcon size={18} className="text-warm-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-warm-700 truncate">{fa.title || 'Untitled'}</h3>
                              <p className="text-xs text-warm-400 mt-0.5">{areaConfig.label}</p>
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 border border-primary-200">
                              <IconCheck size={14} className="text-primary-600" />
                              <span className="text-xs font-medium text-primary-700">Complete</span>
                            </div>
                            {fa.completed_at && (
                              <span className="text-xs text-warm-400 hidden sm:block">
                                {new Date(fa.completed_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            )}
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
      </AnimatedItem>
    </AnimatedPage>
  );
}
