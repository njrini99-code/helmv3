'use client';

import { cn } from '@/lib/utils';
import type { CoachPhilosophy } from '@/lib/coachhelm/types';

type WeightKey = 'weightHistorical' | 'weightRecentForm' | 'weightTournament' | 'weightQualifying' | 'weightSubjective';

interface WeightItem {
  key: WeightKey;
  label: string;
}

const WEIGHTS: WeightItem[] = [
  { key: 'weightHistorical', label: 'Historical Performance (full season)' },
  { key: 'weightRecentForm', label: 'Recent Form (last 5 rounds)' },
  { key: 'weightTournament', label: 'Tournament Performance' },
  { key: 'weightQualifying', label: 'Qualifying Performance' },
  { key: 'weightSubjective', label: 'My Subjective Input' },
];

interface WeightDistributorProps {
  values: Pick<CoachPhilosophy, WeightKey>;
  onChange: (values: Pick<CoachPhilosophy, WeightKey>) => void;
}

export function WeightDistributor({ values, onChange }: WeightDistributorProps) {
  const total = WEIGHTS.reduce((sum, w) => sum + values[w.key], 0);
  const isValid = total === 100;

  function handleChange(key: WeightKey, newValue: number) {
    const oldValue = values[key];
    const diff = newValue - oldValue;

    if (diff === 0) return;

    // Get other keys and their total
    const otherKeys = WEIGHTS.filter((w) => w.key !== key).map((w) => w.key);
    const othersTotal = otherKeys.reduce((sum, k) => sum + values[k], 0);

    // Distribute the difference proportionally
    const newValues = { ...values, [key]: newValue };

    if (othersTotal > 0) {
      let remaining = -diff;
      otherKeys.forEach((k, i) => {
        if (i === otherKeys.length - 1) {
          // Last one gets whatever's left to ensure sum is 100
          newValues[k] = Math.max(0, values[k] + remaining);
        } else {
          const proportion = values[k] / othersTotal;
          const adjustment = Math.round(-diff * proportion);
          const adjusted = Math.max(0, Math.min(100, values[k] + adjustment));
          remaining -= adjusted - values[k];
          newValues[k] = adjusted;
        }
      });
    }

    onChange(newValues);
  }

  return (
    <div className="space-y-4">
      {WEIGHTS.map((weight) => (
        <div key={weight.key} className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-warm-600">{weight.label}</span>
            <span className="font-semibold text-warm-900 tabular-nums w-12 text-right">
              {values[weight.key]}%
            </span>
          </div>

          {/* Slider */}
          <div className="relative h-6">
            <div className="absolute inset-0 bg-warm-100 rounded-lg overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary-400 to-primary-500 transition-all duration-150"
                style={{ width: `${values[weight.key]}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={values[weight.key]}
              onChange={(e) => handleChange(weight.key, parseInt(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
        </div>
      ))}

      {/* Total */}
      <div
        className={cn(
          'flex items-center justify-between pt-3 border-t border-warm-200 text-sm font-medium',
          isValid ? 'text-primary-600' : 'text-red-500'
        )}
      >
        <span>Total</span>
        <span className="tabular-nums">{total}%</span>
      </div>
      {!isValid && (
        <p className="text-xs text-red-500">Weights must add up to 100%</p>
      )}
    </div>
  );
}
