'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCoachPhilosophy } from '@/hooks/coachhelm/useCoachPhilosophy';
import {
    PriorityRanker,
    SensitivitySlider,
    ThresholdSlider,
    WeightDistributor,
    AlertTypeToggles
} from '@/components/golf/coachhelm/settings';
import { THRESHOLD_RANGES } from '@/lib/coachhelm/constants';
import type { CoachPhilosophy } from '@/lib/coachhelm/types';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { IconCheck } from '@/components/icons';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';

type PriorityValues = Pick<
    CoachPhilosophy,
    'priorityBallStriking' | 'priorityShortGame' | 'priorityPutting' | 'priorityCourseManagement' | 'priorityMentalGame'
>;
type WeightValues = Pick<
    CoachPhilosophy,
    'weightHistorical' | 'weightRecentForm' | 'weightTournament' | 'weightQualifying' | 'weightSubjective'
>;
type ThresholdKey = 'declineThreshold' | 'pressureGapThreshold' | 'bubbleZoneRange';
type DisplayToggleKey = 'showStrokesGained' | 'showAdvancedStats';
type DisplayKey = DisplayToggleKey | 'insightVerbosity';

export default function CoachingIntelligenceSettingsPage() {
    const [coachId, setCoachId] = useState<string | null>(null);
    const supabase = createClient();

    useEffect(() => {
        async function getCoach() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: coach } = await supabase
                .from('golf_coaches')
                .select('id')
                .eq('user_id', user.id)
                .maybeSingle();

            if (coach) {
                setCoachId(coach.id);
            }
        }
        getCoach();
    }, [supabase]);

    const { philosophy, loading, saving, save } = useCoachPhilosophy(coachId);

    // Auto-save debouncing could go here, but for settings specific explicit actions or immediate updates are fine.
    // We'll update the local cache immediately via the hook's optimistic update pattern (implied by just calling save)

    const handlePriorityChange = (newValues: PriorityValues) => {
        save(newValues);
    };

    const handleSensitivityChange = (newValue: CoachPhilosophy['alertSensitivity']) => {
        save({ alertSensitivity: newValue });
    };

    const handleThresholdChange = (key: ThresholdKey, value: number) => {
        save({ [key]: value } as Partial<CoachPhilosophy>);
    };

    const handleAlertToggle = (key: keyof CoachPhilosophy, checked: boolean) => {
        save({ [key]: checked } as Partial<CoachPhilosophy>);
    };

    const handleWeightChange = (newValues: WeightValues) => {
        save(newValues);
    };

    const handleDisplayChange = (key: DisplayKey, value: boolean | CoachPhilosophy['insightVerbosity']) => {
        save({ [key]: value } as Partial<CoachPhilosophy>);
    };

    if (loading || !philosophy) {
        return (
            <div className="min-h-full pb-20">
                <div className="golf-mobile-page-header">
                    <div className="max-w-3xl mx-auto px-4 md:px-6 h-16 flex items-center gap-4">
                        <div className="h-5 w-5 skeleton-shimmer rounded-lg lg:hidden" />
                        <div className="h-5 w-40 skeleton-shimmer rounded-lg" />
                    </div>
                </div>
                <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-8">
                    <div className="h-4 w-3/4 skeleton-shimmer rounded" />
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="glass-premium rounded-2xl p-6 space-y-4">
                            <div className="space-y-2">
                                <div className="h-5 w-40 skeleton-shimmer rounded" />
                                <div className="h-3 w-64 skeleton-shimmer rounded" />
                            </div>
                            <div className="space-y-3">
                                <div className="h-8 w-full skeleton-shimmer rounded-lg" />
                                <div className="h-8 w-full skeleton-shimmer rounded-lg" />
                                <div className="h-8 w-3/4 skeleton-shimmer rounded-lg" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <AnimatedPage className="min-h-full pb-20">
            {/* Header */}
            <AnimatedItem>
                <MobileNavHeader
                    title="Coaching Philosophy"
                    backHref="/golf/dashboard/settings"
                    backLabel="Settings"
                >
                    {saving ? (
                        <span className="text-xs text-warm-400">Saving...</span>
                    ) : (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-primary-600 bg-primary-50 px-2 py-1 rounded-full">
                            <IconCheck size={12} />
                            Saved
                        </span>
                    )}
                </MobileNavHeader>
            </AnimatedItem>

            <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-8">

                {/* Intro */}
                <AnimatedItem className="prose prose-sm prose-slate max-w-none">
                    <p className="text-warm-500 text-[15px] leading-relaxed">
                        Configure how CoachHelm analyzes your team's performance. These settings control insight generation,
                        alert sensitivity, and how players are ranked against your specific coaching priorities.
                    </p>
                </AnimatedItem>

                {/* Priority Section */}
                <AnimatedItem><section className="glass-premium rounded-2xl overflow-clip">
                    <div className="p-6 border-b border-warm-100">
                        <h2 className="text-base font-semibold text-warm-900">Metric Priorities</h2>
                        <p className="text-sm text-warm-500 mt-1">
                            Drag to reorder. The top metrics will have the most influence on player ratings and "Needs Attention" flags.
                        </p>
                    </div>
                    <div className="p-6 bg-warm-50/50">
                        <PriorityRanker
                            values={{
                                priorityBallStriking: philosophy.priorityBallStriking,
                                priorityShortGame: philosophy.priorityShortGame,
                                priorityPutting: philosophy.priorityPutting,
                                priorityCourseManagement: philosophy.priorityCourseManagement,
                                priorityMentalGame: philosophy.priorityMentalGame,
                            }}
                            onChange={handlePriorityChange}
                        />
                    </div>
                </section></AnimatedItem>

                {/* Sensitivity Section */}
                <AnimatedItem><section className="glass-premium rounded-2xl overflow-clip">
                    <div className="p-6 border-b border-warm-100">
                        <h2 className="text-base font-semibold text-warm-900">Alert Sensitivity</h2>
                        <p className="text-sm text-warm-500 mt-1">
                            Global control for how aggressively CoachHelm flags issues.
                        </p>
                    </div>
                    <div className="p-6">
                        <SensitivitySlider
                            value={philosophy.alertSensitivity}
                            onChange={handleSensitivityChange}
                        />
                    </div>
                </section></AnimatedItem>

                {/* Thresholds Section */}
                <AnimatedItem><section className="glass-premium rounded-2xl overflow-clip">
                    <div className="p-6 border-b border-warm-100">
                        <h2 className="text-base font-semibold text-warm-900">Fine-tune Thresholds</h2>
                        <p className="text-sm text-warm-500 mt-1">
                            Specific triggers for different types of alerts.
                        </p>
                    </div>
                    <div className="p-6 space-y-8">
                        <ThresholdSlider
                            label="Decline Threshold"
                            description="Strokes gained lost over 5 rounds to trigger a decline alert."
                            value={philosophy.declineThreshold}
                            onChange={(v) => handleThresholdChange('declineThreshold', v)}
                            {...THRESHOLD_RANGES.declineThreshold}
                            unit="sg"
                        />
                        <div className="h-px bg-warm-100" />
                        <ThresholdSlider
                            label="Pressure Gap"
                            description="Difference between practice and tournament scoring that triggers a mental game alert."
                            value={philosophy.pressureGapThreshold}
                            onChange={(v) => handleThresholdChange('pressureGapThreshold', v)}
                            {...THRESHOLD_RANGES.pressureGapThreshold}
                            unit="strokes"
                        />
                        <div className="h-px bg-warm-100" />
                        <ThresholdSlider
                            label="Bubble Zone"
                            description="Range from the cut line (in strokes) to consider a player 'on the bubble'."
                            value={philosophy.bubbleZoneRange}
                            onChange={(v) => handleThresholdChange('bubbleZoneRange', v)}
                            {...THRESHOLD_RANGES.bubbleZoneRange}
                            unit="strokes"
                        />
                    </div>
                </section></AnimatedItem>

                {/* Weight Distributor Section */}
                <AnimatedItem><section className="glass-premium rounded-2xl overflow-clip">
                    <div className="p-6 border-b border-warm-100">
                        <h2 className="text-base font-semibold text-warm-900">Comparison Weighting</h2>
                        <p className="text-sm text-warm-500 mt-1">
                            When comparing players for roster decisions, how much should each factor matter?
                        </p>
                    </div>
                    <div className="p-6">
                        <WeightDistributor
                            values={{
                                weightHistorical: philosophy.weightHistorical,
                                weightRecentForm: philosophy.weightRecentForm,
                                weightTournament: philosophy.weightTournament,
                                weightQualifying: philosophy.weightQualifying,
                                weightSubjective: philosophy.weightSubjective,
                            }}
                            onChange={handleWeightChange}
                        />
                    </div>
                </section></AnimatedItem>

                {/* Alert Toggles Section */}
                <AnimatedItem><section className="glass-premium rounded-2xl overflow-clip">
                    <div className="p-6 border-b border-warm-100">
                        <h2 className="text-base font-semibold text-warm-900">Active Alerts</h2>
                        <p className="text-sm text-warm-500 mt-1">
                            Select which types of automated insights you want to receive.
                        </p>
                    </div>
                    <div className="p-6">
                        <AlertTypeToggles
                            values={philosophy}
                            onChange={handleAlertToggle}
                        />
                    </div>
                </section></AnimatedItem>

                {/* Display Preferences Section */}
                <AnimatedItem><section className="glass-premium rounded-2xl overflow-clip">
                    <div className="p-6 border-b border-warm-100">
                        <h2 className="text-base font-semibold text-warm-900">Display Preferences</h2>
                        <p className="text-sm text-warm-500 mt-1">
                            Control what data is shown on dashboards and reports.
                        </p>
                    </div>
                    <div className="p-6 space-y-4">
                        {([
                            { key: 'showStrokesGained', label: 'Show Strokes Gained metrics' },
                            { key: 'showAdvancedStats', label: 'Show advanced statistics' },
                        ] as const).map(({ key, label }) => (
                            <label key={key} className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={philosophy[key]}
                                    onChange={(e) => handleDisplayChange(key, e.target.checked)}
                                    className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm text-warm-700">{label}</span>
                            </label>
                        ))}

                        <div className="pt-4 border-t border-warm-100">
                            <label className="block text-sm font-medium text-warm-700 mb-2">
                                Insight Detail Level
                            </label>
                            <div className="flex gap-2">
                                {(['brief', 'detailed'] as const).map((option) => (
                                    <button
                                        key={option}
                                        onClick={() => handleDisplayChange('insightVerbosity', option)}
                                        className={`flex-1 py-2.5 px-4 min-h-[44px] rounded-lg text-sm font-medium transition-colors capitalize active:scale-[0.98] ${
                                            philosophy.insightVerbosity === option
                                                ? 'bg-primary-500 text-white'
                                                : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                                        }`}
                                    >
                                        {option}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </section></AnimatedItem>

            </div>
        </AnimatedPage>
    );
}
