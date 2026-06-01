'use client';

/**
 * ============================================================================
 * Fairway · Settings · FairwaySettingsCoachingIntelligence (COACH · ADDITIVE · GATED)
 * ----------------------------------------------------------------------------
 * Flag-on redesign of the coach Coaching-Intelligence settings page (the legacy
 * default-export client page). PRESENTATION-ONLY. There is no server loader for
 * this route — the legacy page itself fetches client-side — so this component
 * reuses the EXACT same plumbing VERBATIM:
 *
 *   • useCoachPhilosophy(coachId)                         — '@/hooks/coachhelm/useCoachPhilosophy'
 *   • getOrCreateTeamCoachHelmSettings / updateTeamCoachHelmSettings — '@/app/golf/actions/insights'
 *   • resolveCoachTeamId(supabase, orgId, coachId)        — '@/lib/golf/resolve-team'
 *   • THRESHOLD_RANGES                                    — '@/lib/coachhelm/constants'
 *   • the SAME editor widgets (PriorityRanker / SensitivitySlider / ThresholdSlider
 *     / WeightDistributor / AlertTypeToggles) — '@/components/golf/coachhelm/settings'
 *
 * Priority/sensitivity/toggles flush immediately; thresholds + weights debounce.
 * The hook persists the patch once and triggers downstream revalidation. No
 * destructive writes.
 *
 * Toasts: this surface autosaves like the legacy page (it shows a "Saving…" /
 * "Saved" indicator), so it does NOT introduce new toasts. Tokens / primitives
 * ONLY for the chrome; the interactive editors are reused as-is.
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { useCoachPhilosophy } from '@/hooks/coachhelm/useCoachPhilosophy';
import {
  PriorityRanker,
  SensitivitySlider,
  ThresholdSlider,
  WeightDistributor,
  AlertTypeToggles,
} from '@/components/golf/coachhelm/settings';
import { THRESHOLD_RANGES } from '@/lib/coachhelm/constants';
import type { CoachPhilosophy } from '@/lib/coachhelm/types';
import {
  getOrCreateTeamCoachHelmSettings,
  updateTeamCoachHelmSettings,
  type TeamCoachHelmSettings,
} from '@/app/golf/actions/insights';
import { resolveCoachTeamId } from '@/lib/golf/resolve-team';

import { ViewHeader, Surface, Switch, InlineNotice } from '@/components/fairway';
import { IconCheck } from '@/components/icons';

type PriorityValues = Pick<
  CoachPhilosophy,
  | 'priorityBallStriking'
  | 'priorityShortGame'
  | 'priorityPutting'
  | 'priorityCourseManagement'
  | 'priorityMentalGame'
>;
type WeightValues = Pick<
  CoachPhilosophy,
  | 'weightHistorical'
  | 'weightRecentForm'
  | 'weightTournament'
  | 'weightQualifying'
  | 'weightSubjective'
>;
type ThresholdKey = 'declineThreshold' | 'pressureGapThreshold' | 'bubbleZoneRange';
type DisplayToggleKey = 'showStrokesGained' | 'showAdvancedStats';
type DisplayKey = DisplayToggleKey | 'insightVerbosity';

export function FairwaySettingsCoachingIntelligence() {
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
          const resolvedTeamId = await resolveCoachTeamId(
            supabase,
            coach.organization_id,
            coach.id,
          );
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
      const previous = teamSettings;
      setTeamSettings((s: TeamCoachHelmSettings | null) =>
        s ? { ...s, enabled: nextEnabled } : s,
      );
      setTeamSettingsSaving(true);
      setTeamSettingsError(null);
      const result = await updateTeamCoachHelmSettings(teamId, { enabled: nextEnabled });
      setTeamSettingsSaving(false);
      if (result.success && result.settings) {
        setTeamSettings(result.settings);
      } else {
        setTeamSettings(previous);
        setTeamSettingsError(result.error || 'Failed to update');
      }
    },
    [teamId, teamSettings],
  );

  const { philosophy, loading, saving, save } = useCoachPhilosophy(coachId);

  const [hasEverSaved, setHasEverSaved] = useState(false);

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
      const ok = await save(patch, { revalidate: true });
      if (ok) {
        setHasEverSaved(true);
      }
    },
    [save],
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
    void flushSave(newValues);
  };

  const handleSensitivityChange = (newValue: CoachPhilosophy['alertSensitivity']) => {
    void flushSave({ alertSensitivity: newValue });
  };

  const handleThresholdChange = (key: ThresholdKey, value: number) => {
    debouncedSave(`threshold:${key}`, { [key]: value } as Partial<CoachPhilosophy>);
  };

  const handleAlertToggle = (key: keyof CoachPhilosophy, checked: boolean) => {
    void flushSave({ [key]: checked } as Partial<CoachPhilosophy>);
  };

  const handleWeightChange = (newValues: WeightValues) => {
    debouncedSave('weights', newValues);
  };

  const handleDisplayChange = (
    key: DisplayKey,
    value: boolean | CoachPhilosophy['insightVerbosity'],
  ) => {
    void flushSave({ [key]: value } as Partial<CoachPhilosophy>);
  };

  if (loading || !philosophy) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6 md:py-8 pb-24">
        <ViewHeader eyebrow="Settings" title="Coaching Intelligence" />
        <div className="mt-8 space-y-6">
          {[1, 2, 3, 4].map((i) => (
            <Surface key={i} elevation="border" padding="lg" className="space-y-4">
              <div className="h-5 w-40 rounded bg-surface-sunken" />
              <div className="h-3 w-64 rounded bg-surface-sunken" />
              <div className="space-y-3">
                <div className="h-8 w-full rounded-fw-sm bg-surface-sunken" />
                <div className="h-8 w-3/4 rounded-fw-sm bg-surface-sunken" />
              </div>
            </Surface>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6 md:py-8 pb-24">
      <ViewHeader
        eyebrow="Settings"
        title="Coaching Intelligence"
        description="Configure how CoachHelm analyzes your team. These settings control insight generation, alert sensitivity, and how players are ranked against your coaching priorities."
        meta={
          saving ? (
            <span className="text-text-tertiary">Saving…</span>
          ) : hasEverSaved ? (
            <span className="inline-flex items-center gap-1.5 text-fw-success">
              <IconCheck size={13} aria-hidden />
              Saved
            </span>
          ) : null
        }
      />

      <div className="mt-8 space-y-6">
        {/* Metric Priorities */}
        <Surface elevation="border" padding="lg">
          <div className="mb-5 flex flex-col gap-1">
            <h2 className="font-fw-display text-h2 text-text-primary">Metric Priorities</h2>
            <p className="font-fw-sans text-body-sm text-text-secondary">
              Drag to reorder. Top metrics have the most influence on player ratings and
              &ldquo;Needs Attention&rdquo; flags.
            </p>
          </div>
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
        </Surface>

        {/* Alert Sensitivity */}
        <Surface elevation="border" padding="lg">
          <div className="mb-5 flex flex-col gap-1">
            <h2 className="font-fw-display text-h2 text-text-primary">Alert Sensitivity</h2>
            <p className="font-fw-sans text-body-sm text-text-secondary">
              Global control for how aggressively CoachHelm flags issues.
            </p>
          </div>
          <SensitivitySlider
            value={philosophy.alertSensitivity}
            onChange={handleSensitivityChange}
          />
        </Surface>

        {/* Thresholds */}
        <Surface elevation="border" padding="lg">
          <div className="mb-5 flex flex-col gap-1">
            <h2 className="font-fw-display text-h2 text-text-primary">Fine-tune Thresholds</h2>
            <p className="font-fw-sans text-body-sm text-text-secondary">
              Specific triggers for different types of alerts.
            </p>
          </div>
          <div className="space-y-8">
            <ThresholdSlider
              label="Decline Threshold"
              description="Strokes gained lost over 5 rounds to trigger a decline alert."
              value={philosophy.declineThreshold}
              onChange={(v) => handleThresholdChange('declineThreshold', v)}
              {...THRESHOLD_RANGES.declineThreshold}
              unit="sg"
            />
            <div className="h-px bg-border-subtle" />
            <ThresholdSlider
              label="Pressure Gap"
              description="Difference between practice and tournament scoring that triggers a mental game alert."
              value={philosophy.pressureGapThreshold}
              onChange={(v) => handleThresholdChange('pressureGapThreshold', v)}
              {...THRESHOLD_RANGES.pressureGapThreshold}
              unit="strokes"
            />
            <div className="h-px bg-border-subtle" />
            <ThresholdSlider
              label="Bubble Zone"
              description="Range from the cut line (in strokes) to consider a player 'on the bubble'."
              value={philosophy.bubbleZoneRange}
              onChange={(v) => handleThresholdChange('bubbleZoneRange', v)}
              {...THRESHOLD_RANGES.bubbleZoneRange}
              unit="strokes"
            />
          </div>
        </Surface>

        {/* Comparison Weighting */}
        <Surface elevation="border" padding="lg">
          <div className="mb-5 flex flex-col gap-1">
            <h2 className="font-fw-display text-h2 text-text-primary">Comparison Weighting</h2>
            <p className="font-fw-sans text-body-sm text-text-secondary">
              When comparing players for roster decisions, how much should each factor matter?
            </p>
          </div>
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
        </Surface>

        {/* Active Alerts */}
        <Surface elevation="border" padding="lg">
          <div className="mb-5 flex flex-col gap-1">
            <h2 className="font-fw-display text-h2 text-text-primary">Active Alerts</h2>
            <p className="font-fw-sans text-body-sm text-text-secondary">
              Select which types of automated insights you want to receive.
            </p>
          </div>
          <AlertTypeToggles values={philosophy} onChange={handleAlertToggle} />
        </Surface>

        {/* Team CoachHelm master switch */}
        {teamId ? (
          <Surface
            elevation="border"
            padding="lg"
            className="flex flex-col gap-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="font-fw-display text-h2 text-text-primary">Team CoachHelm</h2>
                <p className="max-w-md font-fw-sans text-body-sm text-text-secondary">
                  Master switch for AI-generated insights, patterns, and predictions across the
                  entire team. Disable to pause everything CoachHelm does for this team without
                  losing existing data.
                </p>
              </div>
              <Switch
                checked={teamSettings?.enabled ?? true}
                disabled={!teamSettings || teamSettingsSaving}
                onCheckedChange={(checked) => void handleTeamCoachHelmToggle(checked)}
                aria-label="Team CoachHelm enabled"
              />
            </div>
            {teamSettingsError ? (
              <InlineNotice tone="danger">{teamSettingsError}</InlineNotice>
            ) : null}
            {teamSettings && !teamSettings.enabled ? (
              <p className="border-t border-border-subtle pt-4 font-fw-sans text-caption text-text-tertiary">
                CoachHelm is paused for this team.
                {teamSettings.disabled_at
                  ? ` Disabled ${new Date(teamSettings.disabled_at).toLocaleDateString()}.`
                  : null}
              </p>
            ) : null}
          </Surface>
        ) : null}

        {/* Display Preferences */}
        <Surface elevation="border" padding="lg">
          <div className="mb-5 flex flex-col gap-1">
            <h2 className="font-fw-display text-h2 text-text-primary">Display Preferences</h2>
            <p className="font-fw-sans text-body-sm text-text-secondary">
              Control what data is shown on dashboards and reports.
            </p>
          </div>
          <div className="space-y-4">
            {([
              { key: 'showStrokesGained', label: 'Show Strokes Gained metrics' },
              { key: 'showAdvancedStats', label: 'Show advanced statistics' },
            ] as const).map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="font-fw-sans text-body-sm text-text-primary">{label}</span>
                <Switch
                  checked={philosophy[key]}
                  onCheckedChange={(checked) => handleDisplayChange(key, checked)}
                  aria-label={label}
                />
              </div>
            ))}

            <div className="border-t border-border-subtle pt-4">
              <p className="mb-2 font-fw-sans text-body-sm font-medium text-text-primary">
                Insight Detail Level
              </p>
              <div className="flex gap-2">
                {(['brief', 'detailed'] as const).map((option) => {
                  const active = philosophy.insightVerbosity === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={active}
                      onClick={() => handleDisplayChange('insightVerbosity', option)}
                      className={[
                        'flex-1 rounded-fw-sm px-4 py-2.5 font-fw-sans text-body-sm font-medium capitalize',
                        'transition-colors [transition-duration:var(--fw-dur-fast)] [transition-timing-function:var(--fw-ease-soft)]',
                        'outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
                        active
                          ? 'bg-accent-500 text-text-on-accent'
                          : 'bg-surface-sunken text-text-secondary hover:bg-inset',
                      ].join(' ')}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Surface>
      </div>
    </div>
  );
}

export default FairwaySettingsCoachingIntelligence;
