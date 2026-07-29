'use client';

// =============================================================================
// src/components/baseball/settings/PhilosophySettingsClient.tsx
//
// Coaching-philosophy editor: reduced-motion-safe entrance motion, accessible
// range + ranking controls, and a friendly save affordance.
//
// DESIGN MIGRATION (settings unification)
// ---------------------------------------
// The masthead had already migrated to the Living Annual kit, but the body was
// still legacy `Card variant="glass"` panels with a PRIVATE `SectionHeader`
// recipe painted in `primary-*` / `warm-*` — a near-copy of Program Settings'
// section header that had drifted (different badge radius, different eyebrow
// size, no hairline rule). That private recipe is gone; sections now render
// through the shared `SettingsSection`, so this screen and Program Settings are
// literally the same component.
//
// Business logic + data flow are unchanged — same server action, same fields,
// same swap-ranking behavior, same hit-slop treatment on the reorder chevrons.
// =============================================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LazyMotion, m, useReducedMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import {
  IconArrowLeft,
  IconSparkles,
  IconTarget,
  IconActivity,
  IconCheck,
  IconInfo,
  IconChevronUp,
  IconChevronDown,
} from '@/components/icons';
import { savePhilosophySettings } from '@/app/baseball/actions/philosophy';
import type { BaseballCoachPhilosophy } from '@/lib/types';
import { PaperCard } from '@/components/baseball/living-annual';
import {
  SettingsNotice,
  SettingsSection,
  SettingsShell,
} from '@/components/baseball/settings/SettingsChrome';

/** Selected vs unselected chrome for the alert-sensitivity radio group. */
const LEVEL_SELECTED = 'border-grade-plus bg-grade-plus/10';
const LEVEL_IDLE =
  'border-[color:var(--hairline)] bg-[var(--paper-canvas)] hover:border-grade-plus/40';

const SETTINGS_PATH = '/baseball/dashboard/settings';

interface PhilosophySettingsClientProps {
  coachId: string;
  coachName: string;
  philosophy: BaseballCoachPhilosophy;
  isNew: boolean;
}

type AlertSensitivity = 'conservative' | 'balanced' | 'aggressive';

const PRIORITIES = [
  { key: 'priority_hitting', label: 'Hitting / Average', description: 'Contact and batting average focus' },
  { key: 'priority_power', label: 'Power', description: 'Home runs and extra-base hits' },
  { key: 'priority_plate_discipline', label: 'Plate Discipline', description: 'Walks, strikeout rate, pitch selection' },
  { key: 'priority_speed', label: 'Speed / Baserunning', description: 'Stolen bases, baserunning ability' },
  { key: 'priority_defense', label: 'Defense', description: 'Fielding and defensive metrics' },
] as const;

const SENSITIVITY_COPY: Record<AlertSensitivity, string> = {
  conservative: 'Only critical issues',
  balanced: 'Important changes',
  aggressive: 'All notable changes',
};

// -----------------------------------------------------------------------------
// Accessible labelled range row — value rendered with tabular-nums so the
// readout does not jitter as the thumb moves.
// -----------------------------------------------------------------------------

function RangeRow({
  id,
  label,
  valueText,
  help,
  min,
  max,
  step,
  value,
  onChange,
}: {
  id: string;
  label: string;
  valueText: string;
  help: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label htmlFor={id} className="text-sm font-medium text-text-primary">
          {label}
        </label>
        <span className="text-sm font-semibold tabular-nums text-text-primary">{valueText}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[color:var(--hairline)] accent-grade-plus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grade-plus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--paper)]"
        aria-valuetext={valueText}
      />
      <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">{help}</p>
    </div>
  );
}

export function PhilosophySettingsClient({
  coachId,
  coachName,
  philosophy,
  isNew,
}: PhilosophySettingsClientProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const reduceMotion = useReducedMotion();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [alertSensitivity, setAlertSensitivity] = useState<AlertSensitivity>(
    philosophy.alert_sensitivity as AlertSensitivity
  );
  const [declineThreshold, setDeclineThreshold] = useState(philosophy.decline_threshold);
  const [pressureGapThreshold, setPressureGapThreshold] = useState(philosophy.pressure_gap_threshold);
  const [bubbleZoneRange, setBubbleZoneRange] = useState(philosophy.bubble_zone_range ?? 1.5);

  const [priorities, setPriorities] = useState<Record<string, number>>({
    priority_hitting: philosophy.priority_hitting ?? 1,
    priority_power: philosophy.priority_power ?? 2,
    priority_plate_discipline: philosophy.priority_plate_discipline ?? 3,
    priority_speed: philosophy.priority_speed ?? 4,
    priority_defense: philosophy.priority_defense ?? 5,
  });

  const handlePriorityChange = (key: string, direction: 'up' | 'down') => {
    const currentRank = priorities[key]!;
    const newRank = direction === 'up' ? currentRank - 1 : currentRank + 1;

    if (newRank < 1 || newRank > 5) return;

    // Find the item currently at the target rank
    const swapKey = Object.entries(priorities).find(([, v]) => v === newRank)?.[0];

    if (swapKey) {
      setPriorities(prev => ({
        ...prev,
        [key]: newRank,
        [swapKey]: currentRank,
      }));
    }
  };

  const handleSave = async () => {
    setSaving(true);

    const result = await savePhilosophySettings({
      coachId,
      alertSensitivity,
      declineThreshold,
      pressureGapThreshold,
      bubbleZoneRange: bubbleZoneRange ?? 1.5,
      priority_hitting: priorities.priority_hitting ?? 1,
      priority_power: priorities.priority_power ?? 2,
      priority_plate_discipline: priorities.priority_plate_discipline ?? 3,
      priority_speed: priorities.priority_speed ?? 4,
      priority_defense: priorities.priority_defense ?? 5,
    });

    setSaving(false);

    if (result.success) {
      setSaved(true);
      addToast({
        type: 'success',
        title: 'Settings saved',
        description: 'Your coaching philosophy has been updated.',
      });
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    } else {
      addToast({
        type: 'error',
        title: 'Failed to save',
        description: result.error,
      });
    }
  };

  const sortedPriorities = [...PRIORITIES].sort((a: { key: string; label: string; description: string }, b: { key: string; label: string; description: string }) =>
    (priorities[a.key] ?? 0) - (priorities[b.key] ?? 0)
  );

  // NOTE: this screen deliberately has NO local mount variants.
  //
  // Each section below is a shared `SettingsSection`, which brings the kit's
  // own `<Reveal>` (fade + 6px rise + blur, 0.4s, staggered). Wrapping those in
  // a second `<m.div variants={...} initial="hidden" animate="show">` — as this
  // file did before the sections were shared — played two compounding
  // entrances on every card, and broke the kit's "one signature move per view"
  // rule in a way that reads as jank rather than as a bug.
  //
  // `reduceMotion` is still read below for the drag/reorder affordances, which
  // Reveal does not cover.

  return (
    <LazyMotion features={loadFeatures}>
      <SettingsShell
        title="Coaching Philosophy"
        lede={`${coachName} • how AI insights are tuned`}
        actions={
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<IconArrowLeft size={16} />}
            aria-label="Back to settings"
            onClick={() => router.push(SETTINGS_PATH)}
          >
            Settings
          </Button>
        }
      >
        {/* Welcome message for new users */}
        {isNew && (
          <m.div
            initial={reduceMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <PaperCard className="p-6">
              <div className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-fw-md border border-[color:var(--hairline)] bg-grade-plus/10 text-grade-plus">
                  <IconSparkles size={20} />
                </span>
                <div className="min-w-0">
                  <h3 className="font-annual text-h3 font-semibold text-text-primary">
                    Welcome, {coachName}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                    Set up your coaching philosophy to personalize AI-powered insights.
                    The system learns your priorities and surfaces what matters most to your
                    program.
                  </p>
                </div>
              </div>
            </PaperCard>
          </m.div>
        )}

        {/* Alert Sensitivity */}
        <SettingsSection
            icon={<IconActivity size={18} />}
            eyebrow="Cadence"
            title="Alert Sensitivity"
            subtitle="How often should we notify you?"
            bodySpacing="none"
          >
            <div
              className="grid grid-cols-1 gap-3 sm:grid-cols-3"
              role="radiogroup"
              aria-label="Alert sensitivity"
            >
              {(['conservative', 'balanced', 'aggressive'] as const).map((level) => {
                const active = alertSensitivity === level;
                return (
                  <Button
                    variant="ghost"
                    key={level}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setAlertSensitivity(level)}
                    className={cn(
                      'h-auto flex-col items-start rounded-fw-md border p-4 transition-colors duration-200',
                      active ? LEVEL_SELECTED : LEVEL_IDLE,
                    )}
                  >
                    <span className="font-annual font-medium capitalize text-text-primary">
                      {level}
                    </span>
                    <span className="mt-1 text-xs leading-relaxed text-text-secondary">
                      {SENSITIVITY_COPY[level]}
                    </span>
                  </Button>
                );
              })}
            </div>
        </SettingsSection>

        {/* Threshold Settings */}
        <SettingsSection
            icon={<IconTarget size={18} />}
            eyebrow="Tuning"
            title="Alert Thresholds"
            subtitle="Fine-tune when alerts trigger"
            bodySpacing="none"
          >
            <div className="space-y-6">
              <RangeRow
                id="psc-decline-threshold"
                label="Decline alert threshold"
                valueText={`${declineThreshold.toFixed(1)}%`}
                help="Alert when a player's performance drops by this percentage."
                min={1}
                max={5}
                step={0.5}
                value={declineThreshold}
                onChange={setDeclineThreshold}
              />
              <RangeRow
                id="psc-pressure-gap"
                label="Pressure gap threshold"
                valueText={`${pressureGapThreshold.toFixed(1)}%`}
                help="Alert when game vs. practice performance differs by this amount."
                min={1}
                max={5}
                step={0.5}
                value={pressureGapThreshold}
                onChange={setPressureGapThreshold}
              />
              <RangeRow
                id="psc-bubble-zone"
                label="Bubble zone range"
                valueText={`±${bubbleZoneRange.toFixed(1)}%`}
                help={'Range around team average to consider a player "on the bubble."'}
                min={0.5}
                max={3}
                step={0.5}
                value={bubbleZoneRange}
                onChange={setBubbleZoneRange}
              />
            </div>
        </SettingsSection>

        {/* Priority Rankings */}
        <SettingsSection
            icon={<IconSparkles size={18} />}
            eyebrow="Emphasis"
            title="Development Priorities"
            subtitle="Rank what matters most to your program"
            bodySpacing="none"
          >
            <ol className="space-y-2">
                {sortedPriorities.map((priority, index) => (
                  <li
                    key={priority.key}
                    className="flex items-center gap-3 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-3"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-grade-plus/10 text-sm font-semibold tabular-nums text-grade-plus"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-annual font-medium text-text-primary">{priority.label}</p>
                      <p className="text-xs leading-relaxed text-text-secondary">{priority.description}</p>
                    </div>
                    {/* gap-3 (12px), not gap-1: each chevron below keeps its
                        compact 32px (h-8/w-8) visual but reaches the 44px
                        tap-target floor via an invisible `before:` hit-slop
                        (mirrors MinimumStandards.tsx) rather than a real
                        resize — up/down need to stay row-height-matched with
                        the h-8 rank badge to their left. That hit-slop
                        extends 6px past each button's own edge (-inset-1.5),
                        so the gap between the two buttons has to be >= 12px
                        or the invisible zones overlap and a tap near the
                        middle could fire the wrong direction. */}
                    <div className="flex shrink-0 gap-3">
                      {/* eslint-disable-next-line helm/no-raw-button -- compact h-8 reorder chevron; Button's ripple needs overflow-hidden, which clips the hit-slop pseudo-element below (mirrors MinimumStandards.tsx) */}
                      <button
                        type="button"
                        onClick={() => handlePriorityChange(priority.key, 'up')}
                        disabled={index === 0}
                        aria-label={`Move ${priority.label} up`}
                        className="relative flex h-8 w-8 items-center justify-center rounded-fw-sm p-0 text-text-tertiary transition-colors hover:bg-grade-plus/10 hover:text-grade-plus active:bg-grade-plus/20 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grade-plus/45 focus-visible:ring-offset-2 before:absolute before:-inset-1.5 before:content-['']"
                      >
                        <IconChevronUp size={16} />
                      </button>
                      {/* eslint-disable-next-line helm/no-raw-button -- compact h-8 reorder chevron; Button's ripple needs overflow-hidden, which clips the hit-slop pseudo-element below (mirrors MinimumStandards.tsx) */}
                      <button
                        type="button"
                        onClick={() => handlePriorityChange(priority.key, 'down')}
                        disabled={index === sortedPriorities.length - 1}
                        aria-label={`Move ${priority.label} down`}
                        className="relative flex h-8 w-8 items-center justify-center rounded-fw-sm p-0 text-text-tertiary transition-colors hover:bg-grade-plus/10 hover:text-grade-plus active:bg-grade-plus/20 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grade-plus/45 focus-visible:ring-offset-2 before:absolute before:-inset-1.5 before:content-['']"
                      >
                        <IconChevronDown size={16} />
                      </button>
                    </div>
                  </li>
                ))}
            </ol>
        </SettingsSection>

        {/* Info Box */}
        <SettingsNotice icon={<IconInfo size={18} />}>
          <p className="font-medium text-text-primary">How this works</p>
          <p className="mt-1 leading-relaxed">
            Your philosophy settings customize the AI insights engine. Higher priorities
            get weighted more heavily in analysis, and thresholds determine when alerts
            are triggered. Changes apply to future insight generation.
          </p>
        </SettingsNotice>

        {/* Save Button */}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => router.push(SETTINGS_PATH)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            isLoading={saving}
            leftIcon={saved && !saving ? <IconCheck size={16} /> : undefined}
          >
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save Philosophy'}
          </Button>
        </div>
      </SettingsShell>
    </LazyMotion>
  );
}
