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
 *   • useGolfUser().teamId (cookie-aware ACTIVE team)     — '@/contexts/golf-user-context'
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
  SgBaselineSelector,
} from '@/components/golf/coachhelm/settings';
import { THRESHOLD_RANGES } from '@/lib/coachhelm/constants';
import type { CoachPhilosophy } from '@/lib/coachhelm/types';
import {
  getOrCreateTeamCoachHelmSettings,
  updateTeamCoachHelmSettings,
  type TeamCoachHelmSettings,
} from '@/app/golf/actions/insights';
import { useGolfUser } from '@/contexts/golf-user-context';

import { ViewHeader, Surface, Switch, InlineNotice, EmptyState, Button } from '@/components/fairway';
import { IconCheck, IconRefresh, IconWarning } from '@/components/icons';

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

/** Shared page chrome wrapper so every state (loading / error / loaded) renders
 *  inside the same centered column with the same ViewHeader. */
function CoachingIntelligenceFrame({
  meta,
  children,
}: {
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6 md:py-8 pb-24">
      <ViewHeader
        eyebrow="Settings"
        title="Coaching Intelligence"
        description="Configure how CoachHelm analyzes your team. These settings control insight generation, alert sensitivity, and how players are ranked against your coaching priorities."
        meta={meta}
      />
      {children}
    </div>
  );
}

export function FairwaySettingsCoachingIntelligence() {
  // ACTIVE team from the layout-resolved context (cookie-aware) — team-scoped
  // CoachHelm settings must follow the program head's team toggle. The coach
  // PHILOSOPHY below is coach-scoped (keyed by coach_id) and intentionally
  // does NOT change with the toggle.
  const golfUser = useGolfUser();
  const activeTeamId = golfUser.teamId ?? null;
  const [coachId, setCoachId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamSettings, setTeamSettings] = useState<TeamCoachHelmSettings | null>(null);
  const [teamSettingsSaving, setTeamSettingsSaving] = useState(false);
  const [teamSettingsError, setTeamSettingsError] = useState<string | null>(null);
  // Bumping this key remounts the philosophy body, which re-runs the hook's
  // coachId-keyed fetch effect from scratch — a clean retry without mutating
  // the (verbatim-reused) hook.
  const [reloadKey, setReloadKey] = useState(0);
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

        if (activeTeamId) {
          setTeamId(activeTeamId);
          const result = await getOrCreateTeamCoachHelmSettings(activeTeamId);
          if (result.success && result.settings) {
            setTeamSettings(result.settings);
          }
        }
      }
    }
    getCoach();
  }, [supabase, activeTeamId]);

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

  return (
    <CoachingIntelligenceBody
      // Remount-on-retry: a fresh key tears down the hook state and re-runs the
      // coachId-keyed fetch, so a failed load can recover without a full reload.
      key={`philosophy-${coachId ?? 'pending'}-${reloadKey}`}
      coachId={coachId}
      teamId={teamId}
      teamSettings={teamSettings}
      teamSettingsSaving={teamSettingsSaving}
      teamSettingsError={teamSettingsError}
      onTeamCoachHelmToggle={handleTeamCoachHelmToggle}
      onRetry={() => setReloadKey((k) => k + 1)}
    />
  );
}

interface CoachingIntelligenceBodyProps {
  coachId: string | null;
  teamId: string | null;
  teamSettings: TeamCoachHelmSettings | null;
  teamSettingsSaving: boolean;
  teamSettingsError: string | null;
  onTeamCoachHelmToggle: (nextEnabled: boolean) => void;
  onRetry: () => void;
}

function CoachingIntelligenceBody({
  coachId,
  teamId,
  teamSettings,
  teamSettingsSaving,
  teamSettingsError,
  onTeamCoachHelmToggle,
  onRetry,
}: CoachingIntelligenceBodyProps) {
  const handleTeamCoachHelmToggle = onTeamCoachHelmToggle;
  const { philosophy, loading, saving, error, save } = useCoachPhilosophy(coachId);

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

  // Failed fetch/create: the hook sets `error`, clears `loading`, and leaves
  // `philosophy` null. Without this branch the loading skeleton would render
  // forever (P077). Show a designed, recoverable error state instead.
  if (error && !loading && !philosophy) {
    return (
      <CoachingIntelligenceFrame>
        <Surface elevation="border" padding="lg" className="mt-8">
          <EmptyState
            icon={IconWarning as unknown as React.ComponentProps<typeof EmptyState>['icon']}
            title="Couldn’t load your coaching settings"
            description="Something went wrong while loading your CoachHelm philosophy. Your saved settings are safe — try again."
            action={
              <Button
                variant="secondary"
                leftIcon={<IconRefresh size={16} aria-hidden />}
                onClick={onRetry}
              >
                Retry
              </Button>
            }
          />
        </Surface>
      </CoachingIntelligenceFrame>
    );
  }

  if (loading || !philosophy) {
    return (
      <CoachingIntelligenceFrame>
        <div className="mt-8 space-y-6" aria-busy="true" aria-live="polite">
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
      </CoachingIntelligenceFrame>
    );
  }

  return (
    <CoachingIntelligenceFrame
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
    >
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

        {/* Strokes Gained baseline (per-team) */}
        {teamId ? (
          <Surface elevation="border" padding="lg" className="text-text-primary">
            <div className="mb-3 flex flex-col gap-1">
              <h2 className="font-fw-display text-h2 text-text-primary">Strokes Gained baseline</h2>
            </div>
            <SgBaselineSelector />
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
    </CoachingIntelligenceFrame>
  );
}

export default FairwaySettingsCoachingIntelligence;
