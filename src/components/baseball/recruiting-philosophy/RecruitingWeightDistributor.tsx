'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { RecruitingMetricWeights } from '@/lib/types';
import {
  RECRUITING_METRIC_LABELS,
  RECRUITING_METRIC_DESCRIPTIONS,
  DEFAULT_RECRUITING_WEIGHTS,
} from '@/lib/types';

type MetricKey = keyof RecruitingMetricWeights;

interface MetricInfo {
  key: MetricKey;
  label: string;
  description: string;
  icon: string;
}

const METRICS: MetricInfo[] = [
  {
    key: 'exit_velocity',
    label: RECRUITING_METRIC_LABELS.exit_velocity,
    description: RECRUITING_METRIC_DESCRIPTIONS.exit_velocity,
    icon: '⚡',
  },
  {
    key: 'pitch_velocity',
    label: RECRUITING_METRIC_LABELS.pitch_velocity,
    description: RECRUITING_METRIC_DESCRIPTIONS.pitch_velocity,
    icon: '🎯',
  },
  {
    key: 'sixty_time',
    label: RECRUITING_METRIC_LABELS.sixty_time,
    description: RECRUITING_METRIC_DESCRIPTIONS.sixty_time,
    icon: '🏃',
  },
  {
    key: 'gpa',
    label: RECRUITING_METRIC_LABELS.gpa,
    description: RECRUITING_METRIC_DESCRIPTIONS.gpa,
    icon: '📚',
  },
  {
    key: 'height',
    label: RECRUITING_METRIC_LABELS.height,
    description: RECRUITING_METRIC_DESCRIPTIONS.height,
    icon: '📏',
  },
  {
    key: 'weight',
    label: RECRUITING_METRIC_LABELS.weight,
    description: RECRUITING_METRIC_DESCRIPTIONS.weight,
    icon: '💪',
  },
  {
    key: 'arm_strength',
    label: RECRUITING_METRIC_LABELS.arm_strength,
    description: RECRUITING_METRIC_DESCRIPTIONS.arm_strength,
    icon: '🎾',
  },
];

interface RecruitingWeightDistributorProps {
  values: RecruitingMetricWeights;
  onChange: (values: RecruitingMetricWeights) => void;
  autoBalance?: boolean;
}

export function RecruitingWeightDistributor({
  values,
  onChange,
  autoBalance = true,
}: RecruitingWeightDistributorProps) {
  const [hoveredMetric, setHoveredMetric] = useState<MetricKey | null>(null);

  const total = METRICS.reduce((sum, m) => sum + values[m.key], 0);
  const isValid = total >= 95 && total <= 105; // Allow small rounding differences

  const handleChange = useCallback(
    (key: MetricKey, newValue: number) => {
      const oldValue = values[key];
      const diff = newValue - oldValue;

      if (diff === 0) return;

      if (autoBalance) {
        // Get other keys and their total
        const otherKeys = METRICS.filter((m) => m.key !== key).map((m) => m.key);
        const othersTotal = otherKeys.reduce((sum, k) => sum + values[k], 0);

        // Distribute the difference proportionally
        const newValues = { ...values, [key]: newValue };

        if (othersTotal > 0) {
          let remaining = -diff;
          otherKeys.forEach((k, i) => {
            if (i === otherKeys.length - 1) {
              // Last one gets whatever's left to ensure sum is ~100
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
      } else {
        onChange({ ...values, [key]: newValue });
      }
    },
    [values, onChange, autoBalance]
  );

  const handleReset = useCallback(() => {
    onChange(DEFAULT_RECRUITING_WEIGHTS);
  }, [onChange]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-warm-900">Metric Weights</h3>
          <p className="text-sm text-warm-500 mt-1">
            Adjust how much each attribute matters in your player rankings
          </p>
        </div>
        <button
          onClick={handleReset}
          className="text-sm text-warm-500 hover:text-warm-700 underline"
        >
          Reset to defaults
        </button>
      </div>

      {/* Sliders */}
      <div className="space-y-5">
        {METRICS.map((metric) => (
          <div
            key={metric.key}
            className="group"
            onMouseEnter={() => setHoveredMetric(metric.key)}
            onMouseLeave={() => setHoveredMetric(null)}
          >
            <div className="flex items-center justify-between text-sm mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{metric.icon}</span>
                <span className="font-medium text-warm-700">{metric.label}</span>
              </div>
              <span
                className={cn(
                  'font-semibold tabular-nums w-14 text-right transition-colors',
                  values[metric.key] >= 20
                    ? 'text-primary-600'
                    : values[metric.key] >= 10
                      ? 'text-warm-700'
                      : 'text-warm-400'
                )}
              >
                {values[metric.key]}%
              </span>
            </div>

            {/* Slider track */}
            <div className="relative h-8 rounded-lg overflow-hidden">
              {/* Background */}
              <div className="absolute inset-0 bg-warm-100" />

              {/* Filled portion */}
              <div
                className={cn(
                  'absolute inset-y-0 left-0 transition-all duration-150',
                  values[metric.key] >= 20
                    ? 'bg-gradient-to-r from-primary-400 to-primary-500'
                    : values[metric.key] >= 10
                      ? 'bg-gradient-to-r from-primary-300 to-primary-400'
                      : 'bg-warm-300'
                )}
                style={{ width: `${values[metric.key]}%` }}
              />

              {/* Input */}
              <input
                type="range"
                min={0}
                max={50}
                step={5}
                value={values[metric.key]}
                onChange={(e) => handleChange(metric.key, parseInt(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />

              {/* Thumb indicator */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md border-2 border-primary-500 pointer-events-none transition-all duration-150"
                style={{ left: `calc(${values[metric.key]}% - 8px)` }}
              />
            </div>

            {/* Description tooltip */}
            {hoveredMetric === metric.key && (
              <p className="text-xs text-warm-500 mt-1.5 animate-in fade-in duration-200">
                {metric.description}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Total */}
      <div
        className={cn(
          'flex items-center justify-between pt-4 border-t border-warm-200 text-sm font-semibold',
          isValid ? 'text-primary-600' : 'text-amber-600'
        )}
      >
        <span>Total Weight</span>
        <span className="tabular-nums">{total}%</span>
      </div>

      {!isValid && (
        <p className="text-xs text-amber-600 flex items-center gap-1.5">
          <span>⚠️</span>
          Weights should add up to approximately 100%
        </p>
      )}

      {/* Visual summary */}
      <div className="bg-warm-50 rounded-xl p-4">
        <p className="text-xs font-medium text-warm-500 uppercase tracking-wider mb-3">
          Your Priorities
        </p>
        <div className="flex flex-wrap gap-2">
          {METRICS.filter((m) => values[m.key] >= 15)
            .sort((a, b) => values[b.key] - values[a.key])
            .map((metric) => (
              <span
                key={metric.key}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium',
                  values[metric.key] >= 25
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-warm-100 text-warm-600'
                )}
              >
                {metric.icon} {metric.label}
              </span>
            ))}
          {METRICS.filter((m) => values[m.key] >= 15).length === 0 && (
            <span className="text-sm text-warm-400 italic">
              No strong preferences set
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
