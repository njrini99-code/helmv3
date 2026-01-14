'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { RecruitingMinimumStandards } from '@/lib/types';
import { AlertTriangle, Check } from 'lucide-react';

interface MinimumStandardsProps {
  values: RecruitingMinimumStandards;
  onChange: (values: RecruitingMinimumStandards) => void;
}

interface StandardConfig {
  key: keyof RecruitingMinimumStandards;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  isMaximum?: boolean; // true = lower is better (like 60 time)
  placeholder: string;
}

const STANDARDS: StandardConfig[] = [
  {
    key: 'min_gpa',
    label: 'Minimum GPA',
    description: 'Players below this GPA will be penalized in matching',
    min: 2.0,
    max: 4.0,
    step: 0.1,
    format: (v) => v.toFixed(2),
    placeholder: 'e.g., 3.0',
  },
  {
    key: 'min_exit_velocity',
    label: 'Minimum Exit Velocity',
    description: 'Minimum bat speed requirement (mph)',
    min: 70,
    max: 115,
    step: 1,
    format: (v) => `${v} mph`,
    placeholder: 'e.g., 85',
  },
  {
    key: 'min_pitch_velocity',
    label: 'Minimum Pitch Velocity',
    description: 'Minimum arm velocity for pitchers (mph)',
    min: 60,
    max: 100,
    step: 1,
    format: (v) => `${v} mph`,
    placeholder: 'e.g., 80',
  },
  {
    key: 'max_sixty_time',
    label: 'Maximum 60-Yard Time',
    description: 'Maximum acceptable 60-yard dash time (seconds)',
    min: 6.0,
    max: 8.5,
    step: 0.05,
    format: (v) => `${v.toFixed(2)}s`,
    isMaximum: true,
    placeholder: 'e.g., 7.0',
  },
];

export function MinimumStandards({ values, onChange }: MinimumStandardsProps) {
  const [enabledStandards, setEnabledStandards] = useState<Set<keyof RecruitingMinimumStandards>>(
    () => {
      const enabled = new Set<keyof RecruitingMinimumStandards>();
      STANDARDS.forEach((s) => {
        if (values[s.key] !== null) {
          enabled.add(s.key);
        }
      });
      return enabled;
    }
  );

  const toggleStandard = useCallback(
    (key: keyof RecruitingMinimumStandards, config: StandardConfig) => {
      const newEnabled = new Set(enabledStandards);
      if (newEnabled.has(key)) {
        newEnabled.delete(key);
        onChange({ ...values, [key]: null });
      } else {
        newEnabled.add(key);
        // Set a reasonable default when enabling
        const defaultValue = config.key === 'min_gpa' ? 3.0 :
                            config.key === 'min_exit_velocity' ? 85 :
                            config.key === 'min_pitch_velocity' ? 80 :
                            7.0;
        onChange({ ...values, [key]: defaultValue });
      }
      setEnabledStandards(newEnabled);
    },
    [enabledStandards, values, onChange]
  );

  const handleValueChange = useCallback(
    (key: keyof RecruitingMinimumStandards, value: string) => {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        onChange({ ...values, [key]: parsed });
      }
    },
    [values, onChange]
  );

  const handleClearAll = useCallback(() => {
    setEnabledStandards(new Set());
    onChange({
      min_gpa: null,
      min_exit_velocity: null,
      min_pitch_velocity: null,
      max_sixty_time: null,
    });
  }, [onChange]);

  const activeCount = enabledStandards.size;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Minimum Standards</h3>
          <p className="text-sm text-slate-500 mt-1">
            Set hard requirements. Players below these thresholds are penalized.
          </p>
        </div>
        {activeCount > 0 && (
          <button
            onClick={handleClearAll}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Warning banner */}
      {activeCount > 0 && (
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {activeCount} minimum standard{activeCount > 1 ? 's' : ''} active
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Players not meeting these requirements will have their match score capped at 40%
            </p>
          </div>
        </div>
      )}

      {/* Standards list */}
      <div className="space-y-3">
        {STANDARDS.map((config) => {
          const isEnabled = enabledStandards.has(config.key);
          const currentValue = values[config.key];

          return (
            <div
              key={config.key}
              className={cn(
                'p-4 rounded-xl border transition-all',
                isEnabled
                  ? 'bg-white border-green-200'
                  : 'bg-slate-50 border-slate-200'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Toggle */}
                <button
                  onClick={() => toggleStandard(config.key, config)}
                  className={cn(
                    'w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors',
                    isEnabled
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-slate-300 hover:border-slate-400'
                  )}
                >
                  {isEnabled && <Check className="w-4 h-4" />}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'font-medium',
                        isEnabled ? 'text-slate-900' : 'text-slate-500'
                      )}
                    >
                      {config.label}
                    </span>

                    {/* Value input */}
                    {isEnabled && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={config.min}
                          max={config.max}
                          step={config.step}
                          value={currentValue ?? ''}
                          onChange={(e) => handleValueChange(config.key, e.target.value)}
                          className="w-24 px-3 py-1.5 text-right text-sm font-medium border border-slate-200 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-colors"
                          placeholder={config.placeholder}
                        />
                      </div>
                    )}
                  </div>

                  <p
                    className={cn(
                      'text-sm mt-1',
                      isEnabled ? 'text-slate-600' : 'text-slate-400'
                    )}
                  >
                    {config.description}
                  </p>

                  {/* Preview bar */}
                  {isEnabled && currentValue !== null && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                        <span>{config.format(config.min)}</span>
                        <span className="font-medium text-green-600">
                          {config.isMaximum ? '≤' : '≥'} {config.format(currentValue)}
                        </span>
                        <span>{config.format(config.max)}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            config.isMaximum ? 'bg-green-500' : 'bg-green-500'
                          )}
                          style={{
                            width: config.isMaximum
                              ? `${((config.max - currentValue) / (config.max - config.min)) * 100}%`
                              : `${((currentValue - config.min) / (config.max - config.min)) * 100}%`,
                            marginLeft: config.isMaximum ? 'auto' : '0',
                            marginRight: config.isMaximum ? '0' : 'auto',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {activeCount === 0 && (
        <div className="bg-slate-50 rounded-xl p-4 text-center">
          <p className="text-sm text-slate-500">
            No minimum standards set. All players will be ranked purely by weighted metrics.
          </p>
        </div>
      )}
    </div>
  );
}
