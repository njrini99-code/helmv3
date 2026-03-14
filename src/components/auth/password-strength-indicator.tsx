'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

interface StrengthResult {
  score: number; // 0-4
  label: string;
  color: string;
  bgColor: string;
  checks: {
    label: string;
    met: boolean;
  }[];
}

function evaluatePassword(password: string): StrengthResult {
  const checks = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Contains uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Contains lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Contains a number', met: /[0-9]/.test(password) },
    { label: 'Contains special character', met: /[^A-Za-z0-9]/.test(password) },
  ];

  const metCount = checks.filter((c) => c.met).length;

  let score: number;
  let label: string;
  let color: string;
  let bgColor: string;

  if (password.length === 0) {
    score = 0;
    label = '';
    color = 'bg-warm-200';
    bgColor = 'bg-warm-100';
  } else if (metCount <= 1) {
    score = 1;
    label = 'Weak';
    color = 'bg-red-500';
    bgColor = 'bg-red-50';
  } else if (metCount <= 2) {
    score = 2;
    label = 'Fair';
    color = 'bg-amber-500';
    bgColor = 'bg-amber-50';
  } else if (metCount <= 3) {
    score = 3;
    label = 'Good';
    color = 'bg-primary-400';
    bgColor = 'bg-primary-50';
  } else {
    score = 4;
    label = 'Strong';
    color = 'bg-primary-600';
    bgColor = 'bg-primary-50';
  }

  return { score, label, color, bgColor, checks };
}

export function PasswordStrengthIndicator({ password, className }: PasswordStrengthIndicatorProps) {
  const strength = useMemo(() => evaluatePassword(password), [password]);

  if (password.length === 0) {
    return (
      <div className={cn('space-y-2', className)}>
        <p className="text-xs text-warm-400">Must be at least 8 characters</p>
      </div>
    );
  }

  const labelColors: Record<string, string> = {
    Weak: 'text-red-600',
    Fair: 'text-amber-600',
    Good: 'text-primary-500',
    Strong: 'text-primary-700',
  };

  return (
    <div className={cn('space-y-2', className)} role="status" aria-live="polite">
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-1">
          {[1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className={cn(
                'h-1 flex-1 rounded-full transition-all duration-300',
                level <= strength.score ? strength.color : 'bg-warm-200'
              )}
            />
          ))}
        </div>
        {strength.label && (
          <span className={cn('text-xs font-medium', labelColors[strength.label])}>
            {strength.label}
          </span>
        )}
      </div>

      {/* Requirements checklist */}
      <div className="space-y-1">
        {strength.checks.map((check) => (
          <div key={check.label} className="flex items-center gap-1.5">
            {check.met ? (
              <svg className="w-3 h-3 text-primary-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-3 h-3 text-warm-300 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
            <span className={cn('text-xs', check.met ? 'text-warm-600' : 'text-warm-400')}>
              {check.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
