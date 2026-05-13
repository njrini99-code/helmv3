'use client';

import { motion } from 'framer-motion';
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
    value: 'high' as const,
    label: 'High',
    description: 'Important',
    color: 'text-amber-600',
    bg: 'bg-amber-50/50',
    border: 'border-amber-200',
    activeBg: 'bg-amber-50',
    activeBorder: 'border-amber-400',
    dot: 'bg-amber-400',
  },
  {
    value: 'urgent' as const,
    label: 'Urgent',
    description: 'Immediate',
    color: 'text-red-600',
    bg: 'bg-red-50/50',
    border: 'border-red-200',
    activeBg: 'bg-red-50',
    activeBorder: 'border-red-400',
    dot: 'bg-red-400',
  },
];

interface UrgencyPickerProps {
  value: 'low' | 'normal' | 'high' | 'urgent';
  onChange: (value: 'low' | 'normal' | 'high' | 'urgent') => void;
}

export function UrgencyPicker({ value, onChange }: UrgencyPickerProps) {
  return (
    <div>
      <label className="text-sm font-medium text-warm-700 block mb-2">
        Urgency Level
      </label>
      <div className="grid grid-cols-4 gap-2">
        {urgencyOptions.map((opt) => {
          const isActive = value === opt.value;
          return (
            <motion.button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
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
