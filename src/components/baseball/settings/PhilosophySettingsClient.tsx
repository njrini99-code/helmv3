'use client';

// =============================================================================
// src/components/baseball/settings/PhilosophySettingsClient.tsx
//
// Coaching-philosophy editor. Premium pass: aligned to the Helm settings system
// (shared Header / Card-glass surfaces, cream/green palette, editorial type
// rhythm), reduced-motion-safe entrance motion, accessible range + ranking
// controls, and a friendly save affordance. Business logic + data flow are
// unchanged — same server action, same fields, same swap-ranking behavior.
// =============================================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
// Small, palette-true section header — reuses the Program Settings rhythm so the
// philosophy surface reads as part of the same settings system.
// -----------------------------------------------------------------------------

function SectionHeader({
  icon,
  eyebrow,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <CardHeader>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary-200 bg-primary-50 text-primary-600">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-warm-400">
            {eyebrow}
          </p>
          <h2 className="font-semibold text-warm-900">{title}</h2>
          <p className="text-sm leading-relaxed text-warm-500">{subtitle}</p>
        </div>
      </div>
    </CardHeader>
  );
}

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
        <label htmlFor={id} className="text-sm font-medium text-warm-700">
          {label}
        </label>
        <span className="text-sm font-semibold tabular-nums text-warm-900">{valueText}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 cursor-pointer appearance-none rounded-lg bg-warm-200 accent-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        aria-valuetext={valueText}
      />
      <p className="text-xs leading-relaxed text-warm-500 mt-1.5">{help}</p>
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

  const sectionVariants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 8 },
    show: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.18, delay: reduceMotion ? 0 : i * 0.05 },
    }),
  };

  return (
    <LazyMotion features={domAnimation}>
      <div className="border-b border-warm-200/60 px-6 pb-5 pt-6 lg:px-8 lg:pt-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 font-semibold text-warm-900">Coaching Philosophy</h1>
          <p className="mt-1 text-body-sm text-warm-500">{`${coachName} • how AI insights are tuned`}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<IconArrowLeft size={16} />}
          aria-label="Back to settings"
          onClick={() => router.push('/baseball/dashboard/settings')}
        >
          Settings
        </Button>
      </div>

      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        {/* Welcome message for new users */}
        {isNew && (
          <m.div
            initial={reduceMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card variant="glass" className="border-primary-200 bg-primary-50/50">
              <CardContent className="flex items-start gap-4 p-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary-200 bg-primary-100 text-primary-600">
                  <IconSparkles size={20} />
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-warm-900">Welcome, {coachName}</h3>
                  <p className="text-sm leading-relaxed text-warm-600 mt-1">
                    Set up your coaching philosophy to personalize AI-powered insights.
                    The system learns your priorities and surfaces what matters most to your
                    program.
                  </p>
                </div>
              </CardContent>
            </Card>
          </m.div>
        )}

        {/* Alert Sensitivity */}
        <m.div custom={0} variants={sectionVariants} initial="hidden" animate="show">
          <Card variant="glass">
            <SectionHeader
              icon={<IconActivity size={18} />}
              eyebrow="Cadence"
              title="Alert Sensitivity"
              subtitle="How often should we notify you?"
            />
            <CardContent>
              <div
                className="grid grid-cols-1 sm:grid-cols-3 gap-3"
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
                        'h-auto flex-col items-start p-4 rounded-xl border transition-all',
                        active
                          ? 'border-primary-500 bg-primary-50/70 ring-1 ring-primary-200'
                          : 'border-warm-200 bg-cream-50 hover:border-primary-200',
                      )}
                    >
                      <span
                        className={cn(
                          'font-medium capitalize',
                          active ? 'text-primary-700' : 'text-warm-700',
                        )}
                      >
                        {level}
                      </span>
                      <span className="text-xs leading-relaxed text-warm-500 mt-1">
                        {SENSITIVITY_COPY[level]}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </m.div>

        {/* Threshold Settings */}
        <m.div custom={1} variants={sectionVariants} initial="hidden" animate="show">
          <Card variant="glass">
            <SectionHeader
              icon={<IconTarget size={18} />}
              eyebrow="Tuning"
              title="Alert Thresholds"
              subtitle="Fine-tune when alerts trigger"
            />
            <CardContent className="space-y-6">
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
            </CardContent>
          </Card>
        </m.div>

        {/* Priority Rankings */}
        <m.div custom={2} variants={sectionVariants} initial="hidden" animate="show">
          <Card variant="glass">
            <SectionHeader
              icon={<IconSparkles size={18} />}
              eyebrow="Emphasis"
              title="Development Priorities"
              subtitle="Rank what matters most to your program"
            />
            <CardContent>
              <ol className="space-y-2">
                {sortedPriorities.map((priority, index) => (
                  <li
                    key={priority.key}
                    className="flex items-center gap-3 rounded-xl border border-warm-200 bg-warm-50 p-3"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold tabular-nums text-primary-700"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-warm-900">{priority.label}</p>
                      <p className="text-xs leading-relaxed text-warm-500">{priority.description}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handlePriorityChange(priority.key, 'up')}
                        disabled={index === 0}
                        aria-label={`Move ${priority.label} up`}
                        className="h-8 w-8 rounded-lg p-0 text-warm-400 hover:bg-cream-50 hover:text-warm-700 active:bg-cream-100/75 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <IconChevronUp size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handlePriorityChange(priority.key, 'down')}
                        disabled={index === sortedPriorities.length - 1}
                        aria-label={`Move ${priority.label} down`}
                        className="h-8 w-8 rounded-lg p-0 text-warm-400 hover:bg-cream-50 hover:text-warm-700 active:bg-cream-100/75 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <IconChevronDown size={16} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </m.div>

        {/* Info Box */}
        <div className="flex items-start gap-3 rounded-xl border border-warm-200 bg-warm-50 p-4">
          <IconInfo size={20} className="shrink-0 text-primary-600 mt-0.5" />
          <div className="text-sm text-warm-600">
            <p className="font-medium text-warm-900">How this works</p>
            <p className="mt-1 leading-relaxed">
              Your philosophy settings customize the AI insights engine. Higher priorities
              get weighted more heavily in analysis, and thresholds determine when alerts
              are triggered. Changes apply to future insight generation.
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => router.push('/baseball/dashboard/settings')}>
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
      </div>
    </LazyMotion>
  );
}
