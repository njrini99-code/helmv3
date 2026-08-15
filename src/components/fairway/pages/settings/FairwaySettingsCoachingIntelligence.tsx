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
 *     / WeightDistributor) — '@/components/golf/coachhelm/settings'
 *
 * Priority/sensitivity/toggles flush immediately; thresholds + weights debounce.
 * The hook persists the patch once and triggers downstream revalidation. No
 * destructive writes.
 *
 * Toasts: this surface autosaves like the legacy page (it shows a "Saving…" /
 * "Saved" indicator), so it does NOT introduce new toasts. Tokens / primitives
 * ONLY for the chrome; the interactive editors are reused as-is EXCEPT Active
 * Alerts (B16) — that section is rendered directly with the Fairway `Switch`
 * primitive instead of the shared AlertTypeToggles editor, whose cards use a
 * plain Checkbox role instead of an accessible switch role.
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';
import { useCoachPhilosophy } from '@/hooks/coachhelm/useCoachPhilosophy';
import { PriorityRanker, SensitivitySlider } from '@/components/golf/coachhelm/settings';
import {
  THRESHOLD_RANGES,
  SIGNAL_CONTROL_RANGES,
  STATS_BENCHMARK_WINDOWS,
  confidenceFloorForSensitivity,
} from '@/lib/coachhelm/constants';
import { ALERT_GROUPS, type CoachPhilosophy } from '@/lib/coachhelm/types';
import {
  getOrCreateTeamCoachHelmSettings,
  getTeamCoachHelmAccess,
  updateTeamCoachHelmSettings,
  type TeamCoachHelmSettings,
} from '@/app/golf/actions/insights';
import { useGolfUser } from '@/contexts/golf-user-context';

import {
  ViewHeader,
  Surface,
  Switch,
  InlineNotice,
  EmptyState,
  Button,
  Slider,
  Segmented,
} from '@/components/fairway';
import {
  SettingsStack,
  SettingsGroup,
  SettingsRow,
} from '@/components/fairway/settings/settings-list';
import { IconArrowLeft, IconCheck, IconRefresh, IconWarning } from '@/components/icons';

type PriorityValues = Pick<
  CoachPhilosophy,
  | 'priorityBallStriking'
  | 'priorityShortGame'
  | 'priorityPutting'
  | 'priorityCourseManagement'
  | 'priorityMentalGame'
>;
// P079 — the comparison weights are persisted by the CRUD allowlist but their
// UI control (WeightDistributor) is HIDDEN until the roster-comparison engine
// consumes golf_coachhelm_coach_weights, so no WeightValues type is wired here.
// B17: bubbleZoneRange WAS suppressed here too (P078), but that left only 2 of
// the 3 documented "Fine-tune Thresholds" sliders rendering — a real, shipped
// control silently missing from the settings surface. The value is still
// persisted (CRUD allowlist), so restoring the slider loses no data; it just
// stops hiding a control the page's own copy ("Fine-tune Thresholds") promises.
type ThresholdKey = 'declineThreshold' | 'pressureGapThreshold' | 'bubbleZoneRange';
/** Signal controls (migration 20260725090000) — each replaces an engine
 *  constant and defaults to it, so shipping them changed nobody's alert
 *  volume until they move one. */
type SignalControlKey = 'minInsightConfidence' | 'minRoundsForSignal';
/** Window controls (migration 20260725140000) — same contract as the signal
 *  controls above: each replaces a hard-coded window and defaults to it. */
type WindowControlKey = 'minHolePlaysForRanking' | 'patternLookbackDays';
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
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8 pb-24">
      {/* P083 — explicit back affordance to the settings index (Nielsen #3
          user-control/freedom + #4 consistency). This is the real escape on a
          deep sub-page. Present on every state (loading / error / loaded)
          since it lives in the shared frame.
          #1318 — the ViewHeader used to carry its own `eyebrow="Settings"`
          directly above this back link's own "Settings" label, with the
          top-bar breadcrumb ALSO reading "…/ Settings" above both of them —
          the literal word rendered three times before the h1 ever did. The
          eyebrow was purely decorative (this back link was always the real
          nav), so it's dropped rather than the functional breadcrumb or back
          link — no navigation lost, just the redundant third copy. */}
      <Button
        asChild
        variant="ghost"
        size="sm"
        leftIcon={<IconArrowLeft size={16} aria-hidden />}
        className="mb-4 -ml-2 text-text-tertiary"
      >
        <Link href="/golf/dashboard/settings">Settings</Link>
      </Button>
      <ViewHeader
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
  // P084 — head-coach gate for the Team CoachHelm master switch. Resolved from
  // the SAME server gate the write enforces; assistants get a disabled control.
  // null = not yet resolved (treat as non-head until known).
  const [isHeadCoach, setIsHeadCoach] = useState<boolean | null>(null);
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
          // P084 — resolve head-coach status so assistants see a disabled switch.
          const access = await getTeamCoachHelmAccess(activeTeamId);
          setIsHeadCoach(access.success ? access.isHeadCoach : false);
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
      isHeadCoach={isHeadCoach}
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
  /** P084 — null until resolved; only `true` enables the master switch. */
  isHeadCoach: boolean | null;
  onTeamCoachHelmToggle: (nextEnabled: boolean) => void;
  onRetry: () => void;
}

function CoachingIntelligenceBody({
  coachId,
  teamId,
  teamSettings,
  teamSettingsSaving,
  teamSettingsError,
  isHeadCoach,
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

  const handleSignalControlChange = (key: SignalControlKey, value: number) => {
    debouncedSave(`signal:${key}`, { [key]: value } as Partial<CoachPhilosophy>);
  };

  const handleWindowControlChange = (key: WindowControlKey, value: number) => {
    debouncedSave(`window:${key}`, { [key]: value } as Partial<CoachPhilosophy>);
  };

  const handleBenchmarkWindowChange = (value: number) => {
    debouncedSave('window:statsBenchmarkWindowDays', { statsBenchmarkWindowDays: value });
  };

  const handleDigestChange = (value: CoachPhilosophy['alertDigest']) => {
    debouncedSave('signal:alertDigest', { alertDigest: value });
  };

  // The sensitivity preset already imposes a floor (0.40 / 0.55 / 0.70). The
  // Minimum confidence slider is a SECOND floor layered on top via max(), so
  // below the preset it does nothing — say so plainly rather than letting a
  // coach drag a control that cannot change anything.
  const presetConfidenceFloor = philosophy
    ? confidenceFloorForSensitivity(philosophy.alertSensitivity)
    : 0.55;
  const confidenceFloorIsPresetBound = philosophy
    ? philosophy.minInsightConfidence <= presetConfidenceFloor
    : true;

  // "7/10 on" beside the Active alerts header — with ten switches spread over
  // three sub-groups there was no way to see how much of CoachHelm was muted
  // without scrolling the whole list and counting.
  const allAlertKeys = ALERT_GROUPS.flatMap((g) => g.alerts.map((a) => a.key));
  const totalAlertCount = allAlertKeys.length;
  const activeAlertCount = philosophy
    ? allAlertKeys.filter((k) => !!philosophy[k]).length
    : 0;

  const handleAlertToggle = (key: keyof CoachPhilosophy, checked: boolean) => {
    void flushSave({ [key]: checked } as Partial<CoachPhilosophy>);
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
        ) : error ? (
          // A save failed AFTER the initial load succeeded (the full-page error
          // branch above only covers the initial fetch — this is the ONLY place
          // a later save failure was ever surfaced before, which was nowhere:
          // the control just silently snapped back to the last-good value with
          // no explanation (P421-style honesty gap). Mirrors the "Saved" chip's
          // placement so it's visible right where the coach is already looking.
          <span className="inline-flex items-center gap-1.5 text-fw-danger-ink">
            <IconWarning size={13} aria-hidden />
            Couldn’t save
          </span>
        ) : hasEverSaved ? (
          <span className="inline-flex items-center gap-1.5 text-fw-success-ink">
            <IconCheck size={13} aria-hidden />
            Saved
          </span>
        ) : null
      }
    >
      <SettingsStack className="mt-8">
        {/* A save failed — the field it belonged to has already reverted to the
            last-good server value (it's a controlled input bound to `philosophy`,
            which the hook only ever updates on success). Same InlineNotice
            treatment as `teamSettingsError` below, for the same reason: a failed
            write must never be silent. */}
        {error ? (
          <InlineNotice tone="danger">
            Your last change didn’t save — {error}. The control below has reverted;
            try adjusting it again.
          </InlineNotice>
        ) : null}

        {/* Metric Priorities */}
        <SettingsGroup
          title="Metric priorities"
          description="Drag to reorder. Top metrics have the most influence on player ratings and &ldquo;Needs Attention&rdquo; flags."
        >
          <div className="p-4">
          {/* B179: PriorityRanker's row hard-truncates each metric's
              description (`.truncate` on a `min-w-0 flex-1` cell squeezed
              between a 44px drag handle, rank badge, icon and priority bar) —
              at 390px that leaves a meaningless one- or two-word fragment.
              PriorityRanker is a shared, reused-as-is legacy editor (see file
              header), so override its one `.truncate` cell from here instead
              of touching the shared component: let the subtitle wrap onto a
              second line (an explicitly acceptable resolution) rather than
              cut it. */}
          <div className="[&_.truncate]:overflow-visible [&_.truncate]:whitespace-normal [&_.truncate]:text-clip">
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
          </div>
        </SettingsGroup>

        {/* Alert Sensitivity */}
        <SettingsGroup
          title="Alert sensitivity"
          description="Global control for how aggressively CoachHelm flags issues."
        >
          <div className="p-4">
            <SensitivitySlider
              value={philosophy.alertSensitivity}
              onChange={handleSensitivityChange}
            />
          </div>
        </SettingsGroup>

        {/* Thresholds */}
        <SettingsGroup
          title="Fine-tune thresholds"
          description="The specific numbers that trip each kind of alert."
        >
          {/* Slider owns its own label/value/rail/ticks layout, so these rows
              are plain padded cells rather than SettingsRow — nesting the two
              would print the label twice. */}
          <div className="px-4 py-4">
            <Slider
              label="Decline threshold"
              description="Strokes gained lost over 5 rounds before CoachHelm flags a decline."
              value={philosophy.declineThreshold}
              onValueChange={(v) => handleThresholdChange('declineThreshold', v)}
              {...THRESHOLD_RANGES.declineThreshold}
              unit="sg"
              ticks
            />
          </div>
          <div className="px-4 py-4">
            <Slider
              label="Pressure gap"
              description="Gap between practice and tournament scoring that trips a mental-game alert."
              value={philosophy.pressureGapThreshold}
              onValueChange={(v) => handleThresholdChange('pressureGapThreshold', v)}
              {...THRESHOLD_RANGES.pressureGapThreshold}
              unit="strokes"
              ticks
            />
          </div>
          <div className="px-4 py-4">
            <Slider
              label="Bubble zone"
              description="Strokes-gained range around the qualifying cutoff that marks a player as on the bubble."
              value={philosophy.bubbleZoneRange}
              onValueChange={(v) => handleThresholdChange('bubbleZoneRange', v)}
              {...THRESHOLD_RANGES.bubbleZoneRange}
              unit="sg"
              ticks
            />
          </div>
        </SettingsGroup>

        {/* Active Alerts */}
        <SettingsGroup
          title="Active alerts"
          description="Which automated insights CoachHelm is allowed to raise."
          action={
            <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
              {activeAlertCount}/{totalAlertCount} on
            </span>
          }
        >
          {/* One switch per row, grouped by subject. The old grid of bordered
              mini-cards put a box around every toggle — a second card layer
              inside a card, which is what made the page read as a form rather
              than as settings. */}
          {ALERT_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="bg-surface-sunken px-4 py-1.5 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                {group.title}
              </p>
              <div className="divide-y divide-border-subtle">
                {group.alerts.map((alert) => (
                  <SettingsRow
                    key={alert.key}
                    label={alert.label}
                    control={
                      <Switch
                        checked={!!philosophy[alert.key]}
                        onCheckedChange={(checked) => handleAlertToggle(alert.key, checked)}
                        aria-label={alert.label}
                      />
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </SettingsGroup>

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
                // P084 — only the head coach can change this (server enforces it).
                // Disable the control for assistants so they can't trigger a
                // guaranteed-failing optimistic flip + revert (Nielsen #5). While
                // head-coach status is still resolving (null) the switch stays
                // disabled, then enables only when isHeadCoach === true.
                disabled={
                  !teamSettings || teamSettingsSaving || isHeadCoach !== true
                }
                onCheckedChange={(checked) => void handleTeamCoachHelmToggle(checked)}
                aria-label="Team CoachHelm enabled"
              />
            </div>
            {isHeadCoach === false ? (
              <p className="font-fw-sans text-caption text-text-tertiary">
                Only the head coach can change this.
              </p>
            ) : null}
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
            <p className="text-body-sm text-text-secondary">
              Set automatically from your team’s gender — PGA Tour for men’s teams, LPGA for women’s.
            </p>
          </Surface>
        ) : null}

        {/* Signal controls — new 2026-07-25. Every one of these replaced a
            constant the engine had hard-coded, and each DEFAULTS to that
            constant, so a coach who never opens this section is unaffected. */}
        <SettingsGroup
          title="Signal controls"
          description="How much evidence CoachHelm needs before it says anything."
          footnote={
            confidenceFloorIsPresetBound
              ? `Your ${philosophy.alertSensitivity} preset already requires ${Math.round(presetConfidenceFloor * 100)}% — this only matters above that.`
              : `Above your ${philosophy.alertSensitivity} preset's ${Math.round(presetConfidenceFloor * 100)}% floor, so this is the number in effect.`
          }
        >
          <div className="px-4 py-4">
            <Slider
              label="Minimum confidence"
              description="How sure CoachHelm must be before an insight reaches you."
              value={philosophy.minInsightConfidence}
              onValueChange={(v) => handleSignalControlChange('minInsightConfidence', v)}
              {...SIGNAL_CONTROL_RANGES.minInsightConfidence}
              decimals={0}
              // Shown as a percentage — "0.55 confidence" is engine vocabulary,
              // "55%" is what a coach reads.
              displayTransform={(n) => Math.round(n * 100)}
              unit="%"
            />
          </div>
          <div className="px-4 py-4">
            <Slider
              label="Minimum rounds"
              description="Rounds a player needs logged before CoachHelm draws conclusions about them."
              value={philosophy.minRoundsForSignal}
              onValueChange={(v) => handleSignalControlChange('minRoundsForSignal', v)}
              {...SIGNAL_CONTROL_RANGES.minRoundsForSignal}
              unit="rounds"
              ticks
            />
          </div>
          <SettingsRow
            stacked
            label="Alert delivery"
            description="Surface alerts the moment they are generated, or batch them."
            control={
              <Segmented
                value={philosophy.alertDigest}
                onValueChange={(v) => handleDigestChange(v as CoachPhilosophy['alertDigest'])}
                options={[
                  { value: 'immediate', label: 'Immediate' },
                  { value: 'daily', label: 'Daily' },
                  { value: 'weekly', label: 'Weekly' },
                ]}
                aria-label="Alert delivery cadence"
              />
            }
          />
        </SettingsGroup>

        {/* Analysis windows — new 2026-07-25 (migration 20260725140000). Same
            contract as Signal controls: each replaced a hard-coded constant and
            defaults to it. These say how much HISTORY the engine looks at,
            where Signal controls say how much CERTAINTY it needs. */}
        <SettingsGroup
          title="Analysis windows"
          description="How far back CoachHelm looks, and how much repetition it needs before calling something a pattern."
        >
          <div className="px-4 py-4">
            <Slider
              label="Hole ranking threshold"
              description="Plays a hole needs before it can be listed as your toughest or easiest. Higher means shorter lists, better evidence."
              value={philosophy.minHolePlaysForRanking}
              onValueChange={(v) => handleWindowControlChange('minHolePlaysForRanking', v)}
              {...SIGNAL_CONTROL_RANGES.minHolePlaysForRanking}
              unit="plays"
              ticks
            />
          </div>
          <div className="px-4 py-4">
            <Slider
              label="Pattern lookback"
              description="How far back pattern mining reads. A shorter window follows current form; a longer one finds habits."
              value={philosophy.patternLookbackDays}
              onValueChange={(v) => handleWindowControlChange('patternLookbackDays', v)}
              {...SIGNAL_CONTROL_RANGES.patternLookbackDays}
              unit="days"
            />
          </div>
          <SettingsRow
            stacked
            label="Stats benchmark window"
            description={`The Stats page compares the last ${philosophy.statsBenchmarkWindowDays} days against the ${philosophy.statsBenchmarkWindowDays} before them.`}
            control={
              <Segmented
                value={String(philosophy.statsBenchmarkWindowDays)}
                onValueChange={(v) => handleBenchmarkWindowChange(Number(v))}
                options={STATS_BENCHMARK_WINDOWS.map((days) => ({
                  value: String(days),
                  label: `${days}d`,
                }))}
                aria-label="Stats benchmark window"
              />
            }
          />
        </SettingsGroup>

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
                    <Button
                      key={option}
                      type="button"
                      variant="ghost"
                      aria-pressed={active}
                      onClick={() => handleDisplayChange('insightVerbosity', option)}
                      className={[
                        'h-auto min-h-0 flex-1 rounded-fw-sm border-0 px-4 py-2.5 font-fw-sans text-body-sm font-medium font-normal capitalize',
                        'transition-colors [transition-duration:var(--fw-dur-fast)] [transition-timing-function:var(--fw-ease-soft)]',
                        'outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas',
                        active
                          ? 'bg-accent-700 text-text-on-accent'
                          : 'bg-surface-sunken text-text-secondary hover:bg-inset',
                      ].join(' ')}
                    >
                      {option}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
        </Surface>
      </SettingsStack>
    </CoachingIntelligenceFrame>
  );
}
