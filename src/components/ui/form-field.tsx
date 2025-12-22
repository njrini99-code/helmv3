'use client';

import { cn } from '@/lib/utils';

interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  required = false,
  error,
  hint,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="block text-sm font-medium text-slate-700 mb-1.5"
        >
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {hint && !error && (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      )}
      {error && (
        <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

// Form section with title and description
interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormSection({
  title,
  description,
  children,
  className,
}: FormSectionProps) {
  return (
    <div className={cn('', className)}>
      <div className="mb-4">
        <h3 className="text-lg font-medium text-slate-900">{title}</h3>
        {description && (
          <p className="text-sm leading-relaxed text-slate-500 mt-1">{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// Form row for horizontal layout
interface FormRowProps {
  children: React.ReactNode;
  className?: string;
}

export function FormRow({ children, className }: FormRowProps) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-4', className)}>
      {children}
    </div>
  );
}

// Form actions (submit, cancel buttons)
interface FormActionsProps {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right' | 'between';
}

export function FormActions({
  children,
  className,
  align = 'right',
}: FormActionsProps) {
  const alignClasses = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
    between: 'justify-between',
  };

  return (
    <div className={cn('flex items-center gap-3 pt-4', alignClasses[align], className)}>
      {children}
    </div>
  );
}

// Inline field (label and input on same row)
interface InlineFieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

export function InlineField({ label, children, className }: InlineFieldProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <span className="text-sm leading-relaxed text-slate-700 flex-shrink-0">{label}</span>
      <div className="flex-1 max-w-xs">{children}</div>
    </div>
  );
}

// Fieldset with legend
interface FieldsetProps {
  legend: string;
  children: React.ReactNode;
  className?: string;
}

export function Fieldset({ legend, children, className }: FieldsetProps) {
  return (
    <fieldset className={cn('border border-slate-200 rounded-xl p-4', className)}>
      <legend className="px-2 text-sm font-medium text-slate-700">{legend}</legend>
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

// Checkbox field
interface CheckboxFieldProps {
  id?: string;
  label: string;
  description?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function CheckboxField({
  id,
  label,
  description,
  checked,
  onChange,
  disabled = false,
  className,
}: CheckboxFieldProps) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 cursor-pointer',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
        className={cn(
          'mt-0.5 w-4 h-4 rounded border-slate-300 text-green-600',
          'focus:ring-green-500 focus:ring-offset-0',
          'disabled:bg-slate-100'
        )}
      />
      <div>
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
    </label>
  );
}

// Radio group
interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

interface RadioGroupProps {
  name: string;
  options: RadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function RadioGroup({
  name,
  options,
  value,
  onChange,
  disabled = false,
  className,
}: RadioGroupProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            'flex items-start gap-3 cursor-pointer p-3 rounded-xl border transition-colors',
            value === option.value
              ? 'border-green-200 bg-green-50'
              : 'border-slate-200 hover:border-slate-300',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={(e) => onChange?.(e.target.value)}
            disabled={disabled}
            className={cn(
              'mt-0.5 w-4 h-4 border-slate-300 text-green-600',
              'focus:ring-green-500 focus:ring-offset-0'
            )}
          />
          <div>
            <span className="text-sm font-medium text-slate-700">{option.label}</span>
            {option.description && (
              <p className="text-xs text-slate-500 mt-0.5">{option.description}</p>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}

// Switch/toggle field
interface SwitchFieldProps {
  id?: string;
  label: string;
  description?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function SwitchField({
  id,
  label,
  description,
  checked = false,
  onChange,
  disabled = false,
  className,
}: SwitchFieldProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div>
        <label htmlFor={id} className="text-sm font-medium text-slate-700 cursor-pointer">
          {label}
        </label>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200',
          'focus:outline-none focus:ring-2 focus:ring-green-500/20',
          checked ? 'bg-green-600' : 'bg-slate-200',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm',
            'transition-transform duration-200 translate-y-0.5',
            checked ? 'translate-x-5' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  );
}
