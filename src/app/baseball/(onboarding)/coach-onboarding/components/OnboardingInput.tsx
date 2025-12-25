'use client';

import { InputHTMLAttributes, forwardRef, ReactNode } from 'react';
import { motion } from 'framer-motion';

interface OnboardingInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  badge?: ReactNode;
  icon?: ReactNode;
}

export const OnboardingInput = forwardRef<HTMLInputElement, OnboardingInputProps>(
  ({ label, error, badge, icon, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm font-medium text-onboarding-text-secondary font-sf-pro">
              {label}
            </label>
            {badge}
          </div>
        )}
        <div className="relative">
          <input
            ref={ref}
            className={`
              w-full h-[52px] px-4 rounded-lg border transition-all duration-200
              text-base text-onboarding-text-primary placeholder:text-onboarding-text-muted font-sf-pro
              ${error
                ? 'border-red-500 focus:border-red-500 focus:ring-4 focus:ring-red-100'
                : 'border-onboarding-border-light focus:border-onboarding-kelly-green focus:ring-4 focus:ring-onboarding-kelly-green-muted'
              }
              ${icon ? 'pr-12' : ''}
              disabled:bg-onboarding-warm-white disabled:cursor-not-allowed
              ${className}
            `}
            {...props}
          />
          {icon && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-onboarding-text-muted">
              {icon}
            </div>
          )}
        </div>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1.5 text-sm text-red-600"
          >
            {error}
          </motion.p>
        )}
      </div>
    );
  }
);

OnboardingInput.displayName = 'OnboardingInput';
