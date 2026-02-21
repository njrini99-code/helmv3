'use client';

import { cn } from '@/lib/utils';
import { CheckCircle, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { forwardRef, useState } from 'react';

interface ValidatedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  success?: boolean;
  label?: string;
}

export const ValidatedInput = forwardRef<HTMLInputElement, ValidatedInputProps>(
  ({ error, success, label, className, id, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const inputId = id || label?.toLowerCase().replace(/\s/g, '-');

    return (
      <div className="space-y-1">
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              'block text-sm font-medium transition-colors duration-fast',
              error ? 'text-red-600' : isFocused ? 'text-primary-600' : 'text-warm-700'
            )}
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={cn(
              'w-full px-3 py-2 rounded-lg border bg-white',
              'transition-all duration-fast',
              'placeholder:text-warm-400',
              'focus:outline-none focus:ring-2 focus:ring-offset-0',
              // Default state
              !error && !success && 'border-warm-300 focus:border-primary-500 focus:ring-primary-500/20',
              // Error state
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20 pr-10 animate-shake',
              // Success state
              success && 'border-primary-500 focus:border-primary-500 focus:ring-primary-500/20 pr-10',
              className
            )}
            {...props}
          />

          {/* Validation icon */}
          <AnimatePresence>
            {(error || success) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                {error && <XCircle className="h-5 w-5 text-red-500" />}
                {success && <CheckCircle className="h-5 w-5 text-primary-500" />}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Error message */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              className="text-sm text-red-500"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

ValidatedInput.displayName = 'ValidatedInput';
