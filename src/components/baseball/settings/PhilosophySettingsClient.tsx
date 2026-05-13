'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import {
  IconArrowLeft,
  IconSparkles,
  IconTarget,
  IconActivity,
  IconCheck,
  IconInfo,
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
  { key: 'priority_hitting', label: 'Hitting/Average', description: 'Contact and batting average focus' },
  { key: 'priority_power', label: 'Power', description: 'Home runs and extra-base hits' },
  { key: 'priority_plate_discipline', label: 'Plate Discipline', description: 'Walks, strikeout rate, pitch selection' },
  { key: 'priority_speed', label: 'Speed/Baserunning', description: 'Stolen bases, baserunning ability' },
  { key: 'priority_defense', label: 'Defense', description: 'Fielding and defensive metrics' },
] as const;

export function PhilosophySettingsClient({
  coachId,
  coachName,
  philosophy,
  isNew,
}: PhilosophySettingsClientProps) {
  const router = useRouter();
  const { addToast } = useToast();
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

  return (
    <div className="min-h-dvh bg-[#FFFEFA]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/baseball/dashboard/settings"
            className="p-2 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200 transition-colors"
          >
            <IconArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-warm-900">Coaching Philosophy</h1>
            <p className="text-warm-500 mt-1">Configure how AI insights are generated for your team</p>
          </div>
        </div>

        {/* Welcome message for new users */}
        {isNew && (
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl p-6 mb-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                <IconSparkles size={20} className="text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-purple-800">Welcome, {coachName}!</h3>
                <p className="text-sm text-purple-700 mt-1">
                  Set up your coaching philosophy to personalize AI-powered insights.
                  The system will learn your priorities and alert you to what matters most.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {/* Alert Sensitivity */}
          <div className="glass-standard rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <IconActivity size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-warm-900">Alert Sensitivity</h3>
                <p className="text-sm text-warm-500">How often should we notify you?</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {(['conservative', 'balanced', 'aggressive'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setAlertSensitivity(level)}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    alertSensitivity === level
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-warm-200 hover:border-warm-300'
                  }`}
                >
                  <p className={`font-medium capitalize ${
                    alertSensitivity === level ? 'text-primary-700' : 'text-warm-700'
                  }`}>
                    {level}
                  </p>
                  <p className="text-xs text-warm-500 mt-1">
                    {level === 'conservative' && 'Only critical issues'}
                    {level === 'balanced' && 'Important changes'}
                    {level === 'aggressive' && 'All notable changes'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Threshold Settings */}
          <div className="glass-standard rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <IconTarget size={20} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-warm-900">Alert Thresholds</h3>
                <p className="text-sm text-warm-500">Fine-tune when alerts trigger</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Decline Threshold */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-warm-700">
                    Decline Alert Threshold
                  </label>
                  <span className="text-sm font-semibold text-warm-900">
                    {declineThreshold.toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="0.5"
                  value={declineThreshold}
                  onChange={(e) => setDeclineThreshold(parseFloat(e.target.value))}
                  className="w-full h-2 bg-warm-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <p className="text-xs text-warm-500 mt-1">
                  Alert when a player&apos;s performance drops by this percentage
                </p>
              </div>

              {/* Pressure Gap Threshold */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-warm-700">
                    Pressure Gap Threshold
                  </label>
                  <span className="text-sm font-semibold text-warm-900">
                    {pressureGapThreshold.toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="0.5"
                  value={pressureGapThreshold}
                  onChange={(e) => setPressureGapThreshold(parseFloat(e.target.value))}
                  className="w-full h-2 bg-warm-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <p className="text-xs text-warm-500 mt-1">
                  Alert when game vs practice performance differs by this amount
                </p>
              </div>

              {/* Bubble Zone Range */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-warm-700">
                    Bubble Zone Range
                  </label>
                  <span className="text-sm font-semibold text-warm-900">
                    ±{bubbleZoneRange.toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.5"
                  value={bubbleZoneRange}
                  onChange={(e) => setBubbleZoneRange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-warm-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <p className="text-xs text-warm-500 mt-1">
                  Range around team average to consider a player &quot;on the bubble&quot;
                </p>
              </div>
            </div>
          </div>

          {/* Priority Rankings */}
          <div className="glass-standard rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                <IconSparkles size={20} className="text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-warm-900">Development Priorities</h3>
                <p className="text-sm text-warm-500">Rank what matters most to your program</p>
              </div>
            </div>

            <div className="space-y-2">
              {sortedPriorities.map((priority, index) => (
                <div
                  key={priority.key}
                  className="flex items-center gap-3 p-3 bg-warm-50 rounded-xl"
                >
                  <span className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 font-semibold text-sm flex items-center justify-center">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium text-warm-900">{priority.label}</p>
                    <p className="text-xs text-warm-500">{priority.description}</p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handlePriorityChange(priority.key, 'up')}
                      disabled={index === 0}
                      className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-white active:bg-cream-100/75 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => handlePriorityChange(priority.key, 'down')}
                      disabled={index === sortedPriorities.length - 1}
                      className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-white active:bg-cream-100/75 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <IconInfo size={20} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700">
              <p className="font-medium">How this works</p>
              <p className="mt-1">
                Your philosophy settings customize the AI insights engine. Higher priorities
                get weighted more heavily in analysis, and thresholds determine when alerts
                are triggered. Changes apply to future insight generation.
              </p>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-3">
            <Link href="/baseball/dashboard/settings">
              <Button variant="secondary">Cancel</Button>
            </Link>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Saving...
                </>
              ) : saved ? (
                <>
                  <IconCheck size={16} />
                  Saved!
                </>
              ) : (
                'Save Philosophy'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
