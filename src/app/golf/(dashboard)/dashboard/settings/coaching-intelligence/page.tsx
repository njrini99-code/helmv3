'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { saveCoachingPhilosophy } from '@/app/golf/actions/coaching-philosophy';
import { Button } from '@/components/ui/button';
import {
    getOrCreateTeamCoachHelmSettings,
    updateTeamCoachHelmSettings,
    type TeamCoachHelmSettings,
} from '@/app/golf/actions/insights';
import { resolveCoachTeamId } from '@/lib/golf/resolve-team';

// camelCase -> snake_case column mapping that mirrors the one in
// useCoachPhilosophy, kept here so we can hit the server action directly
// for the revalidatePath side-effect without going through the hook.
const CAMEL_TO_DB: Record<string, string> = {
    priorityBallStriking: 'priority_ball_striking',
    priorityShortGame: 'priority_short_game',
    priorityPutting: 'priority_putting',
    priorityCourseManagement: 'priority_course_management',
    priorityMentalGame: 'priority_mental_game',
    alertSensitivity: 'alert_sensitivity',
    declineThreshold: 'decline_threshold',
    pressureGapThreshold: 'pressure_gap_threshold',
    bubbleZoneRange: 'bubble_zone_range',
    weightHistorical: 'weight_historical',
    weightRecentForm: 'weight_recent_form',
    weightTournament: 'weight_tournament',
    weightQualifying: 'weight_qualifying',
    weightSubjective: 'weight_subjective',
    alertScoringDecline: 'alert_scoring_decline',
    alertStatRegression: 'alert_stat_regression',
    alertTournamentPressure: 'alert_tournament_pressure',
    alertPlateau: 'alert_plateau',
    alertBubblePlayer: 'alert_bubble_player',
    alertSurgePlayer: 'alert_surge_player',
    alertStreaks: 'alert_streaks',
    alertRecurringWeakness: 'alert_recurring_weakness',
    alertClosingHoles: 'alert_closing_holes',
    alertPar3Issues: 'alert_par_3_issues',
    showStrokesGained: 'show_strokes_gained',
    showAdvancedStats: 'show_advanced_stats',
    insightVerbosity: 'insight_verbosity',
};

function camelPatchToDb(patch: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
        const dbKey = CAMEL_TO_DB[key];
        if (dbKey) out[dbKey] = value;
    }
    return out;
}

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
    const [teamId, setTeamId] = useState<string | null>(null);
    const [teamSettings, setTeamSettings] = useState<TeamCoachHelmSettings | null>(null);
    const [teamSettingsSaving, setTeamSettingsSaving] = useState(false);
    const [teamSettingsError, setTeamSettingsError] = useState<string | null>(null);
    const supabase = createClient();

    useEffect(() => {
        async function getCoach() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: coach } = await supabase
                .from('golf_coaches')
                .select('id, organization_id')
                .eq('user_id', user.id)
                .maybeSingle();

            if (coach) {
                setCoachId(coach.id);

                if (coach.organization_id) {
                    // Deterministic org→team resolution (handles orgs with >1 team)
                    const resolvedTeamId = await resolveCoachTeamId(supabase, coach.organization_id, coach.id);
                    if (resolvedTeamId) {
                        setTeamId(resolvedTeamId);
                        const result = await getOrCreateTeamCoachHelmSettings(resolvedTeamId);
                        if (result.success && result.settings) {
                            setTeamSettings(result.settings);
                        }
                    }
                }
            }
        }
        getCoach();
    }, [supabase]);

    const handleTeamCoachHelmToggle = useCallback(
        async (nextEnabled: boolean) => {
            if (!teamId) return;
            // Optimistic UI: flip immediately, revert on failure.
            const previous = teamSettings;
            setTeamSettings((s: TeamCoachHelmSettings | null) =>
                s ? { ...s, enabled: nextEnabled } : s,
            );
            setTeamSettingsSaving(true);
            setTeamSettingsError(null);
            const result = await updateTeamCoachHelmSettings(teamId, {
                enabled: nextEnabled,
            });
            setTeamSettingsSaving(false);
            if (result.success && result.settings) {
                setTeamSettings(result.settings);
            } else {
                // Revert
                setTeamSettings(previous);
                setTeamSettingsError(result.error || 'Failed to update');
            }
        },
        [teamId, teamSettings],
    );

    const { philosophy, loading, saving, save } = useCoachPhilosophy(coachId);

    // Track whether we've successfully saved at least once so the "Saved"
    // pill doesn't appear on first render (when the user hasn't actually
    // done anything yet). Otherwise the pill misrepresents unsaved state.
    const [hasEverSaved, setHasEverSaved] = useState(false);

    // Debounce sliders + toggles so rapid changes don't hammer the DB.
    // Server action call afterwards ensures revalidatePath fires even when
    // the hook's direct-supabase save would otherwise not trigger it.
    const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    useEffect(() => {
        const timers = debounceTimersRef.current;
        return () => {
            timers.forEach((t) => clearTimeout(t));
            timers.clear();
        };
    }, []);

    const flushSave = useCallback(
        async (patch: Partial<CoachPhilosophy>) => {
            const ok = await save(patch);
            if (ok && coachId) {
                // Propagate the change + revalidate downstream screens.
                // Best-effort — if this fails we still saved via `save`.
                void saveCoachingPhilosophy(coachId, camelPatchToDb(patch));
                setHasEverSaved(true);
            }
        },
        [save, coachId],
    );

    const debouncedSave = useCallback(
        (bucket: string, patch: Partial<CoachPhilosophy>, delayMs = 600) => {
            const timers = debounceTimersRef.current;
            const existing = timers.get(bucket);
            if (existing) clearTimeout(existing);
            const t = setTimeout(() => {
                void flushSave(patch);
                timers.delete(bucket);
            }, delayMs);
            timers.set(bucket, t);
        },
        [flushSave],
    );

    const handlePriorityChange = (newValues: PriorityValues) => {
        // Priority ordering is a low-frequency drag; save immediately.
        void flushSave(newValues);
    };

    const handleSensitivityChange = (newValue: CoachPhilosophy['alertSensitivity']) => {
        void flushSave({ alertSensitivity: newValue });
    };

    const handleThresholdChange = (key: ThresholdKey, value: number) => {
        debouncedSave(`threshold:${key}`, { [key]: value } as Partial<CoachPhilosophy>);
    };

    const handleAlertToggle = (key: keyof CoachPhilosophy, checked: boolean) => {
        // Toggles fire once on click — no debounce needed.
        void flushSave({ [key]: checked } as Partial<CoachPhilosophy>);
    };

    const handleWeightChange = (newValues: WeightValues) => {
        debouncedSave('weights', newValues);
    };

    const handleDisplayChange = (key: DisplayKey, value: boolean | CoachPhilosophy['insightVerbosity']) => {
        void flushSave({ [key]: value } as Partial<CoachPhilosophy>);
    };

    if (loading || !philosophy) {
        return (
            <div className="min-h-full pb-20">
                <div className="sticky top-0 z-20 border-b border-warm-200/30 bg-cream-100/75 backdrop-blur-xl pt-[max(0.25rem,env(safe-area-inset-top,0px))] lg:pt-0">
                    <div className="max-w-[720px] mx-auto px-4 md:px-6 h-16 flex items-center gap-4">
                        <div className="h-5 w-5 skeleton-shimmer rounded-lg lg:hidden" />
                        <div className="h-5 w-40 skeleton-shimmer rounded-lg" />
                    </div>
                </div>
                <div className="max-w-[720px] mx-auto px-4 md:px-6 py-6 md:py-8 space-y-8">
                    <div className="h-4 w-3/4 skeleton-shimmer rounded" />
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="surface-matte rounded-3xl p-6 space-y-4">
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
                    breadcrumb={
                        <Breadcrumb
                            items={[
                                { label: 'Dashboard', href: '/golf/dashboard' },
                                { label: 'Settings', href: '/golf/dashboard/settings' },
                                { label: 'Coaching Intelligence' },
                            ]}
                        />
                    }
                >
                    {saving ? (
                        <span className="text-xs text-warm-400">Saving...</span>
                    ) : hasEverSaved ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-primary-600 bg-primary-50 px-2 py-1 rounded-full">
                            <IconCheck size={12} />
                            Saved
                        </span>
                    ) : null}
                </MobileNavHeader>
            </AnimatedItem>

            <div className="max-w-[720px] mx-auto px-4 md:px-6 py-6 md:py-8 space-y-8">

                {/* Intro */}
                <AnimatedItem className="prose prose-sm prose-slate max-w-none">
                    <p className="text-warm-500 text-body leading-relaxed">
                        Configure how CoachHelm analyzes your team's performance. These settings control insight generation,
                        alert sensitivity, and how players are ranked against your specific coaching priorities.
                    </p>
                </AnimatedItem>

                {/* Priority Section */}
                <AnimatedItem><section className="surface-matte rounded-3xl overflow-clip">
                    <div className="p-6 border-b border-warm-100">
                        <h2 className="text-body font-medium text-warm-900 tracking-[-0.005em]">Metric Priorities</h2>
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
                <AnimatedItem><section className="surface-matte rounded-3xl overflow-clip">
                    <div className="p-6 border-b border-warm-100">
                        <h2 className="text-body font-medium text-warm-900 tracking-[-0.005em]">Alert Sensitivity</h2>
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
                <AnimatedItem><section className="surface-matte rounded-3xl overflow-clip">
                    <div className="p-6 border-b border-warm-100">
                        <h2 className="text-body font-medium text-warm-900 tracking-[-0.005em]">Fine-tune Thresholds</h2>
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
                <AnimatedItem><section className="surface-matte rounded-3xl overflow-clip">
                    <div className="p-6 border-b border-warm-100">
                        <h2 className="text-body font-medium text-warm-900 tracking-[-0.005em]">Comparison Weighting</h2>
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
                <AnimatedItem><section className="surface-matte rounded-3xl overflow-clip">
                    <div className="p-6 border-b border-warm-100">
                        <h2 className="text-body font-medium text-warm-900 tracking-[-0.005em]">Active Alerts</h2>
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

                {/* Team CoachHelm Settings Section */}
                {teamId ? (
                    <AnimatedItem>
                        <section className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-body font-medium text-warm-900 tracking-[-0.005em]">Team CoachHelm</h2>
                                    <p className="text-sm text-warm-500 mt-1 max-w-md">
                                        Master switch for AI-generated insights, patterns, and predictions
                                        across the entire team. Disable to pause everything CoachHelm does
                                        for this team without losing existing data.
                                    </p>
                                    {teamSettingsError ? (
                                        <p className="text-xs text-red-600 mt-2">
                                            {teamSettingsError}
                                        </p>
                                    ) : null}
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={teamSettings?.enabled ?? true}
                                        disabled={!teamSettings || teamSettingsSaving}
                                        onChange={(e) => handleTeamCoachHelmToggle(e.target.checked)}
                                    />
                                    <div className="w-11 h-6 bg-warm-200 rounded-full peer peer-checked:bg-primary-500 peer-disabled:opacity-50 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5" />
                                </label>
                            </div>
                            {teamSettings && !teamSettings.enabled ? (
                                <div className="mt-4 pt-4 border-t border-warm-100 text-xs text-warm-500">
                                    CoachHelm is paused for this team.
                                    {teamSettings.disabled_at
                                        ? ` Disabled ${new Date(teamSettings.disabled_at).toLocaleDateString()}.`
                                        : null}
                                </div>
                            ) : null}
                        </section>
                    </AnimatedItem>
                ) : null}

                {/* Display Preferences Section */}
                <AnimatedItem><section className="surface-matte rounded-3xl overflow-clip">
                    <div className="p-6 border-b border-warm-100">
                        <h2 className="text-body font-medium text-warm-900 tracking-[-0.005em]">Display Preferences</h2>
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
                                    <Button variant="primary"
                                        key={option}
                                        onClick={() => handleDisplayChange('insightVerbosity', option)}
                                        className={`flex-1 py-2.5 px-4 min-h-[44px] rounded-lg text-sm font-medium transition-colors capitalize active:scale-[0.98] ${
                                            philosophy.insightVerbosity === option
                                                ? 'bg-primary-500 text-white'
                                                : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                                        }`}
                                    >
                                        {option}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>
                </section></AnimatedItem>

            </div>
        </AnimatedPage>
    );
}
