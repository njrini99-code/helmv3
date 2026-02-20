'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { RecruitingMetricWeights, RecruitingMinimumStandards } from '@/lib/types';
import { STATES, GRAD_YEARS } from '@/lib/types';
import {
  RecruitingWeightDistributor,
  PositionPriorityRanker,
  MinimumStandards,
} from '@/components/baseball/recruiting-philosophy';
import { saveRecruitingPhilosophy } from '@/app/baseball/actions/recruiting-philosophy';
import { Check, Loader2, Save, MapPin, GraduationCap } from 'lucide-react';

interface RecruitingPreferencesClientProps {
  coachId: string;
  initialWeights: RecruitingMetricWeights;
  initialStandards: RecruitingMinimumStandards;
  initialPositions: string[];
  initialStates: string[];
  initialGradYears: number[];
}

export function RecruitingPreferencesClient({
   
  coachId: _coachId, // Reserved for future use (match score preview)
  initialWeights,
  initialStandards,
  initialPositions,
  initialStates,
  initialGradYears,
}: RecruitingPreferencesClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [weights, setWeights] = useState<RecruitingMetricWeights>(initialWeights);
  const [standards, setStandards] = useState<RecruitingMinimumStandards>(initialStandards);
  const [positions, setPositions] = useState<string[]>(initialPositions);
  const [preferredStates, setPreferredStates] = useState<string[]>(initialStates);
  const [targetGradYears, setTargetGradYears] = useState<number[]>(initialGradYears);

  // Active section for mobile
  const [activeSection, setActiveSection] = useState<string>('weights');

  const handleSave = useCallback(() => {
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await saveRecruitingPhilosophy({
        weight_exit_velocity: weights.exit_velocity,
        weight_pitch_velocity: weights.pitch_velocity,
        weight_sixty_time: weights.sixty_time,
        weight_gpa: weights.gpa,
        weight_height: weights.height,
        weight_weight: weights.weight,
        weight_arm_strength: weights.arm_strength,
        position_priorities: positions,
        min_gpa: standards.min_gpa,
        min_exit_velocity: standards.min_exit_velocity,
        min_pitch_velocity: standards.min_pitch_velocity,
        max_sixty_time: standards.max_sixty_time,
        preferred_states: preferredStates,
        target_grad_years: targetGradYears,
      });

      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        router.refresh();
      }
    });
  }, [weights, standards, positions, preferredStates, targetGradYears, router]);

  const toggleState = useCallback((state: string) => {
    setPreferredStates((prev) =>
      prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state]
    );
  }, []);

  const toggleGradYear = useCallback((year: number) => {
    setTargetGradYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]
    );
  }, []);

  const sections = [
    { id: 'weights', label: 'Metric Weights', icon: '⚖️' },
    { id: 'positions', label: 'Position Priorities', icon: '⚾' },
    { id: 'standards', label: 'Minimum Standards', icon: '📏' },
    { id: 'geography', label: 'Geographic Preferences', icon: '🗺️' },
    { id: 'gradyears', label: 'Target Classes', icon: '🎓' },
  ];

  return (
    <div className="space-y-6">
      {/* Section navigation (mobile) */}
      <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 -mx-2 px-2">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
              activeSection === section.id
                ? 'bg-green-500 text-white'
                : 'bg-white/70 text-slate-600 hover:bg-white active:bg-white/70'
            )}
          >
            <span>{section.icon}</span>
            <span>{section.label}</span>
          </button>
        ))}
      </div>

      {/* Metric Weights */}
      <div
        className={cn(
          'bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-sm',
          activeSection !== 'weights' && 'hidden lg:block'
        )}
      >
        <RecruitingWeightDistributor values={weights} onChange={setWeights} />
      </div>

      {/* Position Priorities */}
      <div
        className={cn(
          'bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-sm',
          activeSection !== 'positions' && 'hidden lg:block'
        )}
      >
        <PositionPriorityRanker priorities={positions} onChange={setPositions} />
      </div>

      {/* Minimum Standards */}
      <div
        className={cn(
          'bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-sm',
          activeSection !== 'standards' && 'hidden lg:block'
        )}
      >
        <MinimumStandards values={standards} onChange={setStandards} />
      </div>

      {/* Geographic Preferences */}
      <div
        className={cn(
          'bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-sm',
          activeSection !== 'geography' && 'hidden lg:block'
        )}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-green-600" />
                Geographic Preferences
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Players from these states get a +5 point bonus
              </p>
            </div>
            {preferredStates.length > 0 && (
              <button
                onClick={() => setPreferredStates([])}
                className="text-sm text-slate-500 hover:text-slate-700 underline"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {STATES.map((state) => (
              <button
                key={state}
                onClick={() => toggleState(state)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  preferredStates.includes(state)
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300'
                )}
              >
                {state}
              </button>
            ))}
          </div>

          {preferredStates.length > 0 && (
            <p className="text-sm text-green-600">
              {preferredStates.length} state{preferredStates.length !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>
      </div>

      {/* Target Grad Years */}
      <div
        className={cn(
          'bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-sm',
          activeSection !== 'gradyears' && 'hidden lg:block'
        )}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-green-600" />
                Target Graduation Years
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Focus your Discover feed on specific graduating classes
              </p>
            </div>
            {targetGradYears.length > 0 && (
              <button
                onClick={() => setTargetGradYears([])}
                className="text-sm text-slate-500 hover:text-slate-700 underline"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {GRAD_YEARS.map((year) => (
              <button
                key={year}
                onClick={() => toggleGradYear(year)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  targetGradYears.includes(year)
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300'
                )}
              >
                Class of {year}
              </button>
            ))}
          </div>

          {targetGradYears.length === 0 && (
            <p className="text-sm text-slate-500 italic">
              No filter applied - all graduation years will be shown
            </p>
          )}
        </div>
      </div>

      {/* Save button - sticky on mobile */}
      <div className="sticky bottom-4 z-10">
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200 p-4 shadow-lg">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-slate-600">
              {saved ? (
                <span className="text-green-600 flex items-center gap-1">
                  <Check className="w-4 h-4" />
                  Preferences saved!
                </span>
              ) : error ? (
                <span className="text-red-600">{error}</span>
              ) : (
                'Changes will affect your Discover rankings'
              )}
            </div>

            <button
              onClick={handleSave}
              disabled={isPending}
              className={cn(
                'flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all',
                isPending
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-green-500 hover:bg-green-600 text-white shadow-sm'
              )}
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Preferences
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
