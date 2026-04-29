'use client';

import { forwardRef, useState, useId, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  success?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onRightIconClick?: () => void;
  variant?: 'default' | 'glass';
  clearable?: boolean;
  onClear?: () => void;
}

// Map input type to sensible iOS keyboard / autocomplete defaults.
// Consumers can still override via explicit props — we merge props LAST so
// caller values always win. This gets ~90% of iOS keyboard polish for free.
function getIOSDefaults(type?: string): Partial<React.InputHTMLAttributes<HTMLInputElement>> {
  switch (type) {
    case 'email':
      return {
        inputMode: 'email',
        autoComplete: 'email',
        autoCapitalize: 'none',
        autoCorrect: 'off',
        spellCheck: false,
        enterKeyHint: 'next',
      };
    case 'tel':
      return {
        inputMode: 'tel',
        autoComplete: 'tel',
        autoCorrect: 'off',
        enterKeyHint: 'next',
      };
    case 'url':
      return {
        inputMode: 'url',
        autoCapitalize: 'none',
        autoCorrect: 'off',
        spellCheck: false,
        enterKeyHint: 'go',
      };
    case 'search':
      return {
        inputMode: 'search',
        autoCorrect: 'off',
        autoCapitalize: 'none',
        enterKeyHint: 'search',
      };
    case 'number':
      return {
        inputMode: 'decimal',
        autoComplete: 'off',
        enterKeyHint: 'next',
      };
    case 'password':
      return {
        autoCapitalize: 'none',
        autoCorrect: 'off',
        spellCheck: false,
        enterKeyHint: 'go',
      };
    default:
      return {};
  }
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, success, hint, leftIcon, rightIcon, onRightIconClick, type, id, variant = 'default', clearable = false, onClear, value, onChange, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const generatedId = useId();
    const inputId = id || generatedId;
    const isPassword = type === 'password';
    const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

    const hasValue = value !== undefined && value !== '';

    // iOS keyboard defaults from type — caller props override via spread order below.
    const iosDefaults = getIOSDefaults(type);

    const errorId = error ? `${inputId}-error` : undefined;
    const hintId = hint && !error && !success ? `${inputId}-hint` : undefined;
    const describedBy = props['aria-describedby'] || errorId || hintId;

    const handleClear = useCallback(() => {
      if (onClear) {
        onClear();
      } else if (onChange) {
        const syntheticEvent = {
          target: { value: '' },
          currentTarget: { value: '' },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(syntheticEvent);
      }
    }, [onClear, onChange]);

    // iOS-native input: 48pt tap target, 12px rounding, subtle warm border,
    // 16px base font (lg:text-sm desktop), primary-500 ring on focus.
    const baseStyles = cn(
      'w-full min-h-[48px] px-4 py-3 rounded-xl text-warm-900 text-base lg:text-sm',
      'placeholder:text-warm-400',
      'transition-all duration-200',
      'focus:outline-none',
      'disabled:opacity-50 disabled:cursor-not-allowed',
    );

    const variants = {
      default: cn(
        'bg-cream-50/92 border border-warm-200',
        error
          ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
          : success
          ? 'border-primary-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/25'
          : 'hover:border-warm-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30'
      ),
      glass: cn(
        'bg-cream-100/68 backdrop-blur-sm border border-warm-200/45',
        error
          ? 'focus:bg-cream-100/82 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
          : 'focus:bg-cream-100/82 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30'
      ),
    };

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className={cn(
            'block text-sm font-medium mb-1.5 transition-colors duration-200',
            isFocused ? 'text-warm-900' : 'text-warm-700',
          )}>
            {label}
            {props.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}
        <div className="relative group">
          {leftIcon && (
            <div className={cn(
              'absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200',
              isFocused ? 'text-warm-600' : 'text-warm-400',
            )}>
              {leftIcon}
            </div>
          )}
          <input
            {...iosDefaults}
            {...props}
            ref={ref}
            id={inputId}
            type={inputType}
            value={value}
            onChange={onChange}
            aria-invalid={!!error || props['aria-invalid']}
            aria-required={props.required || props['aria-required']}
            aria-describedby={describedBy}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
            className={cn(
              baseStyles,
              variants[variant],
              leftIcon && 'pl-11',
              (rightIcon || isPassword || (clearable && hasValue)) && 'pr-11',
              className
            )}
          />
          {/* Clear button */}
          {clearable && hasValue && !isPassword && !rightIcon && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear input"
              className={cn(
                'absolute right-1 top-1/2 -translate-y-1/2',
                'min-w-[44px] min-h-[44px] flex items-center justify-center',
                'text-warm-400 hover:text-warm-600 active:text-warm-600',
                'transition-all duration-150',
                'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100',
              )}
            >
              <span className="w-5 h-5 rounded-full bg-warm-100 hover:bg-warm-200 flex items-center justify-center">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
            </button>
          )}
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className={cn(
                'absolute right-1 top-1/2 -translate-y-1/2',
                'min-w-[44px] min-h-[44px] flex items-center justify-center',
                'text-warm-400 hover:text-warm-600',
                'transition-colors duration-200',
              )}
            >
              {showPassword ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          )}
          {rightIcon && !isPassword && (
            <div
              className={cn(
                'absolute right-4 top-1/2 -translate-y-1/2 transition-colors duration-200',
                isFocused ? 'text-warm-600' : 'text-warm-400',
                onRightIconClick && 'cursor-pointer hover:text-warm-700'
              )}
              onClick={onRightIconClick}
            >
              {rightIcon}
            </div>
          )}
        </div>
        {hint && !error && !success && (
          <p id={hintId} className="mt-1.5 text-xs text-warm-500">{hint}</p>
        )}
        {error && (
          <p id={errorId} className="mt-1.5 text-xs text-red-600 flex items-center gap-1 animate-fade-in">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
        )}
        {success && !error && (
          <p className="mt-1.5 text-xs text-primary-600 flex items-center gap-1 animate-fade-in">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {success}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  showCharCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, showCharCount = false, maxLength, value, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const generatedId = useId();
    const textareaId = id || generatedId;

    const charCount = typeof value === 'string' ? value.length : 0;
    const isNearLimit = maxLength ? charCount > maxLength * 0.9 : false;
    const isOverLimit = maxLength ? charCount > maxLength : false;

    const errorId = error ? `${textareaId}-error` : undefined;
    const hintId = hint && !error ? `${textareaId}-hint` : undefined;
    const describedBy = props['aria-describedby'] || errorId || hintId;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className={cn(
            'block text-sm font-medium mb-1.5 transition-colors duration-200',
            isFocused ? 'text-warm-900' : 'text-warm-700',
          )}>
            {label}
            {props.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}
        <textarea
          {...props}
          ref={ref}
          id={textareaId}
          value={value}
          maxLength={maxLength}
          aria-invalid={!!error || props['aria-invalid']}
          aria-required={props.required || props['aria-required']}
          aria-describedby={describedBy}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          className={cn(
            'w-full px-4 py-3 rounded-xl border bg-cream-50/92 text-warm-900 text-base lg:text-sm',
            'placeholder:text-warm-400',
            'transition-all duration-200 resize-none',
            'focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-500/30',
            'hover:border-warm-300',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
              : 'border-warm-200',
            className
          )}
        />
        <div className="flex items-center justify-between mt-1.5">
          <div>
            {hint && !error && (
              <p id={hintId} className="text-xs text-warm-500">{hint}</p>
            )}
            {error && (
              <p id={errorId} className="text-xs text-red-600 flex items-center gap-1 animate-fade-in">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </p>
            )}
          </div>
          {showCharCount && maxLength && (
            <p className={cn(
              'text-xs tabular-nums transition-colors duration-200',
              isOverLimit ? 'text-red-500 font-medium' : isNearLimit ? 'text-amber-500' : 'text-warm-400'
            )}>
              {charCount}/{maxLength}
            </p>
          )}
        </div>
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
