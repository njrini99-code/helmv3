import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

// Standalone Textarea (used by baseball + shared features). Kept as a simple
// wrapper so existing baseball code keeps working, but the styling is now
// the same iOS-native shape as the rest of the app: 12px rounding, warm-200
// border, primary-500 focus ring, 16px base font on mobile to avoid zoom.
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id || generatedId;
    const errorId = error ? `${textareaId}-error` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-warm-700 mb-1.5"
          >
            {label}
            {props.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          aria-invalid={!!error || props['aria-invalid']}
          aria-required={props.required || props['aria-required']}
          aria-describedby={errorId || props['aria-describedby']}
          className={cn(
            'w-full px-4 py-3 rounded-xl border bg-white/90 text-warm-900 text-base lg:text-sm',
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
          rows={props.rows ?? 4}
          {...props}
        />
        {error && (
          <p id={errorId} className="mt-1.5 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
