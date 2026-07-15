'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { RecruitingMetricWeights, RecruitingMinimumStandards } from '@/lib/types';
import { GRAD_YEARS } from '@/lib/types';
import {
  RecruitingWeightDistributor,
  PositionPriorityRanker,
  MinimumStandards,
} from '@/components/baseball/recruiting-philosophy';
import { saveRecruitingPhilosophy } from '@/app/baseball/actions/recruiting-philosophy';
import { IconCheck, IconSave, IconMapPin, IconGraduationCap } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { PaperCard } from '@/components/baseball/living-annual';

// Mobile compose fix (settings-os finding, minor): the 50 STATES used to
// render as one flat flex-wrap wall of pills -- a desktop tag-cloud dumped
// onto a phone screen. Grouping by the standard US Census 4-region split
// turns it into curated, scannable clusters instead. Exhaustive over
// `STATES` (Census South additionally covers DC/PR in the full definition,
// neither of which appear in this 50-state list).
const STATE_REGIONS: { label: string; states: readonly string[] }[] = [
  { label: 'Northeast', states: ['CT', 'ME', 'MA', 'NH', 'NJ', 'NY', 'PA', 'RI', 'VT'] },
  { label: 'Midwest', states: ['IL', 'IN', 'IA', 'KS', 'MI', 'MN', 'MO', 'NE', 'ND', 'OH', 'SD', 'WI'] },
  { label: 'South', states: ['AL', 'AR', 'DE', 'FL', 'GA', 'KY', 'LA', 'MD', 'MS', 'NC', 'OK', 'SC', 'TN', 'TX', 'VA', 'WV'] },
  { label: 'West', states: ['AK', 'AZ', 'CA', 'CO', 'HI', 'ID', 'MT', 'NV', 'NM', 'OR', 'UT', 'WA', 'WY'] },
];

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
      <PaperCard
        className={cn(
          'p-6',
          activeSection !== 'weights' && 'hidden lg:block'
        )}
      >
        <RecruitingWeightDistributor values={weights} onChange={setWeights} />
      </PaperCard>

      {/* Position Priorities */}
      <PaperCard
        className={cn(
          'p-6',
          activeSection !== 'positions' && 'hidden lg:block'
        )}
      >
        <PositionPriorityRanker priorities={positions} onChange={setPositions} />
      </PaperCard>

      {/* Minimum Standards */}
      <PaperCard
        className={cn(
          'p-6',
          activeSection !== 'standards' && 'hidden lg:block'
        )}
      >
        <MinimumStandards values={standards} onChange={setStandards} />
      </PaperCard>

      {/* Geographic Preferences */}
      <PaperCard
        className={cn(
          'p-6',
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

          {/* Regioned instead of one flat 50-pill wall -- see STATE_REGIONS
              comment above. Each region is its own labeled cluster so this
              reads as composed content on a phone, not a dumped tag-cloud. */}
          <div className="space-y-3">
            {STATE_REGIONS.map((region) => (
              <div key={region.label}>
                <p className="text-xs font-semibold uppercase tracking-wider text-warm-400 mb-1.5">
                  {region.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {region.states.map((state) => (
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
              </div>
            ))}
          </div>

          {preferredStates.length > 0 && (
            <p className="text-sm text-primary-600">
              {preferredStates.length} state{preferredStates.length !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>
      </PaperCard>

      {/* Target Grad Years */}
      <PaperCard
        className={cn(
          'p-6',
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
      </PaperCard>

      {/* Save button - sticky on mobile. `bottom-4` alone stuck this ~16px
          above the viewport edge -- inside the opaque, unconditionally-
          rendered FairwayBottomNav's 56px+safe-area footprint, so the save
          bar sat behind the tab bar and was untappable. Adding
          `--golf-mobile-bottom-nav-offset` (globals.css; zeroes out at md,
          where there's no bottom nav to clear) mirrors the Messages sticky
          footer's fix for the same bug. */}
      <div className="sticky bottom-[calc(1rem+var(--golf-mobile-bottom-nav-offset,0px))] z-[var(--fw-z-sticky)]">
        <PaperCard className="border-warm-200 p-4 shadow-lg">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-warm-600">
              {saved ? (
                <span className="text-primary-600 flex items-center gap-1">
                  <IconCheck size={16} />
                  Preferences saved!
                </span>
              ) : error ? (
                <span className="text-destructive">{error}</span>
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
        </PaperCard>
      </div>
    </div>
  );
}
