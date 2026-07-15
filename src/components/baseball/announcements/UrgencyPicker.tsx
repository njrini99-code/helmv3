'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

const urgencyOptions = [
  {
    value: 'low' as const,
    label: 'Low',
    description: 'General info',
    color: 'text-warm-600',
    bg: 'bg-warm-50',
    border: 'border-warm-200',
    activeBg: 'bg-warm-100',
    activeBorder: 'border-warm-400',
    dot: 'bg-warm-400',
  },
  {
    value: 'normal' as const,
    label: 'Normal',
    description: 'Standard update',
    color: 'text-primary-600',
    bg: 'bg-primary-50/50',
    border: 'border-primary-200',
    activeBg: 'bg-primary-50',
    activeBorder: 'border-primary-400',
    dot: 'bg-primary-400',
  },
  {
    // Warning-weight: pursuit ink at "soft" intensity (mirrors <InkBadge variant="soft">).
    value: 'high' as const,
    label: 'High',
    description: 'Important',
    color: 'text-pursuit',
    bg: 'bg-pursuit/5',
    border: 'border-pursuit/25',
    activeBg: 'bg-pursuit/10',
    activeBorder: 'border-pursuit/40',
    // Soft-weight dot — one rung below 'urgent' on the clay ramp so the
    // at-a-glance dot cue stays distinct between the two severities.
    dot: 'bg-pursuit/55',
  },
  {
    // Error-weight: pursuit ink at "solid" intensity (mirrors <InkBadge variant="solid">) —
    // deliberately more saturated than 'high' so the two stay visually distinct.
    value: 'urgent' as const,
    label: 'Urgent',
    description: 'Immediate',
    color: 'text-pursuit',
    bg: 'bg-pursuit/10',
    border: 'border-pursuit/35',
    activeBg: 'bg-pursuit/20',
    activeBorder: 'border-pursuit/60',
    dot: 'bg-pursuit',
  },
];

interface UrgencyPickerProps {
  value: 'low' | 'normal' | 'high' | 'urgent';
  onChange: (value: 'low' | 'normal' | 'high' | 'urgent') => void;
}

export function UrgencyPicker({ value, onChange }: UrgencyPickerProps) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <div>
      <p className="text-sm font-medium text-warm-700 block mb-2">
        Urgency Level
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {urgencyOptions.map((opt) => {
          const isActive = value === opt.value;
          return (
            <motion.button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              whileHover={prefersReducedMotion ? undefined : ({ scale: 1.02 })}
              whileTap={prefersReducedMotion ? undefined : ({ scale: 0.97 })}
              className={cn(
                'relative p-3 rounded-xl border-2 text-left transition-all',
                isActive
                  ? `${opt.activeBg} ${opt.activeBorder} shadow-sm`
                  : `${opt.bg} border-transparent hover:${opt.border}`
              )}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <div className={cn('w-2 h-2 rounded-full', opt.dot)} />
                <span className={cn('text-sm font-semibold', opt.color)}>
                  {opt.label}
                </span>
              </div>
              <p className="text-xs text-warm-500 leading-tight">
                {opt.description}
              </p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
