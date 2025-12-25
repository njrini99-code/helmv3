'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface OnboardingButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  isLoading?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}

export function OnboardingButton({
  children,
  variant = 'primary',
  isLoading = false,
  fullWidth = true,
  disabled,
  className = '',
  onClick,
  type = 'button',
}: OnboardingButtonProps) {
  const baseClasses = 'h-[52px] px-6 rounded-[10px] font-semibold text-base transition-all duration-200 disabled:cursor-not-allowed font-sf-pro';

  const variantClasses = {
    primary: 'bg-onboarding-kelly-green text-white hover:bg-onboarding-kelly-green-hover hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(22,155,69,0.25)] active:translate-y-0 active:shadow-[0_1px_2px_rgba(22,155,69,0.2)] disabled:bg-onboarding-border-medium disabled:hover:translate-y-0 disabled:hover:shadow-none',
    secondary: 'bg-white text-onboarding-text-secondary border border-onboarding-border-light hover:border-onboarding-kelly-green hover:shadow-[0_0_0_3px_rgba(22,155,69,0.1)]',
    ghost: 'text-onboarding-text-secondary hover:text-onboarding-text-primary hover:bg-gray-100',
  };

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <motion.button
      type={type}
      className={`${baseClasses} ${variantClasses[variant]} ${widthClass} ${className}`}
      disabled={disabled || isLoading}
      onClick={onClick}
      whileHover={disabled || isLoading ? {} : { scale: variant === 'primary' ? 1 : 1.01 }}
      whileTap={disabled || isLoading ? {} : { scale: 0.98 }}
    >
      {isLoading ? (
        <div className="flex items-center justify-center">
          <motion.div
            className="h-5 w-5 border-2 border-white border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
        </div>
      ) : (
        children
      )}
    </motion.button>
  );
}
