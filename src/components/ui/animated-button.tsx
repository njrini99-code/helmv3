'use client';

import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ReactNode, forwardRef } from 'react';

interface AnimatedButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const AnimatedButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  ({ children, variant = 'primary', size = 'md', isLoading, className, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        className={cn(
          'relative inline-flex items-center justify-center font-medium rounded-xl transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          size === 'sm' && 'px-3 py-1.5 text-sm',
          size === 'md' && 'px-4 py-2.5 text-sm',
          size === 'lg' && 'px-6 py-3 text-base',
          variant === 'primary' && 'bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-500',
          variant === 'secondary' && 'bg-slate-100 text-slate-900 hover:bg-slate-200 focus-visible:ring-slate-500',
          variant === 'ghost' && 'text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-500',
          className
        )}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring' as const, stiffness: 400, damping: 20 }}
        {...props}
      >
        {isLoading ? (
          <motion.div
            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
        ) : (
          children
        )}
      </motion.button>
    );
  }
);

AnimatedButton.displayName = 'AnimatedButton';
