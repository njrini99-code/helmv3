'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import {
  validatePassword,
  getPasswordStrengthColor,
  getPasswordStrengthText,
  getPasswordStrengthPercentage,
  type PasswordValidationResult,
} from '@/lib/auth/password-validation';
import { cn } from '@/lib/utils';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  showStrengthIndicator?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export function PasswordInput({
  value,
  onChange,
  label = 'Password',
  placeholder = 'Enter password',
  required = false,
  showStrengthIndicator = true,
  autoFocus = false,
  className,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [validation, setValidation] = useState<PasswordValidationResult | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (value) {
      setValidation(validatePassword(value));
    } else {
      setValidation(null);
    }
  }, [value]);

  const showValidation = touched && value.length > 0 && validation;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Label */}
      <label className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* Password Input */}
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          className={cn(
            'w-full px-4 py-2.5 pr-10 rounded-lg border',
            'transition-colors duration-200',
            'text-slate-900 placeholder:text-slate-400',
            'focus:outline-none focus:ring-2',
            showValidation && !validation?.valid
              ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
              : 'border-slate-200 focus:border-green-500 focus:ring-green-100'
          )}
        />

        {/* Toggle Password Visibility */}
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
          tabIndex={-1}
        >
          {showPassword ? (
            <EyeOff className="h-5 w-5" />
          ) : (
            <Eye className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Strength Indicator */}
      {showStrengthIndicator && showValidation && (
        <div className="space-y-2">
          {/* Strength Bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300',
                  getPasswordStrengthColor(validation.strength)
                )}
                style={{
                  width: `${getPasswordStrengthPercentage(validation.score)}%`,
                }}
              />
            </div>
            <span className="text-xs font-medium text-slate-600 min-w-[80px] text-right">
              {getPasswordStrengthText(validation.strength)}
            </span>
          </div>

          {/* Requirements Checklist */}
          <div className="space-y-1">
            {Object.entries({
              'At least 8 characters': validation.requirements.minLength,
              'One uppercase letter': validation.requirements.hasUppercase,
              'One lowercase letter': validation.requirements.hasLowercase,
              'One number': validation.requirements.hasNumber,
              'One special character': validation.requirements.hasSpecialChar,
              'Not a common password': validation.requirements.notCommon,
            }).map(([requirement, met]) => (
              <div key={requirement} className="flex items-center gap-2 text-xs">
                {met ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
                )}
                <span className={met ? 'text-green-700' : 'text-slate-500'}>
                  {requirement}
                </span>
              </div>
            ))}
          </div>

          {/* Feedback Messages */}
          {validation.feedback.length > 0 && !validation.valid && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
              {validation.feedback.map((message, i) => (
                <p key={i} className="text-xs text-red-700">
                  • {message}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
