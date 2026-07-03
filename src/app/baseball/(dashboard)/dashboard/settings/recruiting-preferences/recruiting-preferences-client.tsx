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
import { IconCheck, IconSave, IconMapPin, IconGraduationCap } from '@/components/icons';
import { Button } from '@/components/ui/button';

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
          <Button variant="primary"
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
              activeSection === section.id
                ? 'bg-primary-500 text-white'
                : 'bg-cream-100 text-warm-600 hover:bg-cream-50 active:bg-cream-100'
            )}
          >
            <span>{section.icon}</span>
            <span>{section.label}</span>
          </Button>
        ))}
      </div>

      {/* Metric Weights */}
      <div
        className={cn(
          'glass-standard rounded-2xl p-6',
          activeSection !== 'weights' && 'hidden lg:block'
        )}
      >
        <RecruitingWeightDistributor values={weights} onChange={setWeights} />
      </div>

      {/* Position Priorities */}
      <div
        className={cn(
          'glass-standard rounded-2xl p-6',
          activeSection !== 'positions' && 'hidden lg:block'
        )}
      >
        <PositionPriorityRanker priorities={positions} onChange={setPositions} />
      </div>

      {/* Minimum Standards */}
      <div
        className={cn(
          'glass-standard rounded-2xl p-6',
          activeSection !== 'standards' && 'hidden lg:block'
        )}
      >
        <MinimumStandards values={standards} onChange={setStandards} />
      </div>

      {/* Geographic Preferences */}
      <div
        className={cn(
          'glass-standard rounded-2xl p-6',
          activeSection !== 'geography' && 'hidden lg:block'
        )}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-warm-900 flex items-center gap-2">
                <IconMapPin size={20} className="text-primary-600" />
                Geographic Preferences
              </h3>
              <p className="text-sm text-warm-500 mt-1">
                Players from these states get a +5 point bonus
              </p>
            </div>
            {preferredStates.length > 0 && (
              <Button variant="ghost"
                onClick={() => setPreferredStates([])}
                className="text-sm text-warm-500 hover:text-warm-700 underline"
              >
                Clear all
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {STATES.map((state) => (
              <Button variant="primary"
                key={state}
                onClick={() => toggleState(state)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  preferredStates.includes(state)
                    ? 'bg-primary-500 text-white'
                    : 'bg-warm-100 text-warm-600 hover:bg-warm-200 active:bg-warm-300'
                )}
              >
                {state}
              </Button>
            ))}
          </div>

          {preferredStates.length > 0 && (
            <p className="text-sm text-primary-600">
              {preferredStates.length} state{preferredStates.length !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>
      </div>

      {/* Target Grad Years */}
      <div
        className={cn(
          'glass-standard rounded-2xl p-6',
          activeSection !== 'gradyears' && 'hidden lg:block'
        )}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-warm-900 flex items-center gap-2">
                <IconGraduationCap size={20} className="text-primary-600" />
                Target Graduation Years
              </h3>
              <p className="text-sm text-warm-500 mt-1">
                Focus your Discover feed on specific graduating classes
              </p>
            </div>
            {targetGradYears.length > 0 && (
              <Button variant="ghost"
                onClick={() => setTargetGradYears([])}
                className="text-sm text-warm-500 hover:text-warm-700 underline"
              >
                Clear all
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {GRAD_YEARS.map((year) => (
              <Button variant="primary"
                key={year}
                onClick={() => toggleGradYear(year)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  targetGradYears.includes(year)
                    ? 'bg-primary-500 text-white'
                    : 'bg-warm-100 text-warm-600 hover:bg-warm-200 active:bg-warm-300'
                )}
              >
                Class of {year}
              </Button>
            ))}
          </div>

          {targetGradYears.length === 0 && (
            <p className="text-sm text-warm-500 italic">
              No filter applied - all graduation years will be shown
            </p>
          )}
        </div>
      </div>

      {/* Save button - sticky on mobile */}
      <div className="sticky bottom-4 z-10">
        <div className="glass-standard rounded-2xl border-warm-200 p-4 shadow-lg">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-warm-600">
              {saved ? (
                <span className="text-primary-600 flex items-center gap-1">
                  <IconCheck size={16} />
                  Preferences saved!
                </span>
              ) : error ? (
                <span className="text-red-600">{error}</span>
              ) : (
                'Changes will affect your Discover rankings'
              )}
            </div>

            <Button variant="primary"
              onClick={handleSave}
              disabled={isPending}
              className={cn(
                'flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all',
                isPending
                  ? 'bg-warm-100 text-warm-400 cursor-not-allowed'
                  : 'bg-primary-500 hover:bg-primary-600 text-white shadow-sm'
              )}
            >
              <IconSave size={16} />
              {isPending ? 'Saving...' : 'Save Preferences'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
