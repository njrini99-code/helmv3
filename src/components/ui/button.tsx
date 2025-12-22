import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  loadingText?: string;
}

// Map common button text to loading states
function getLoadingText(children: React.ReactNode, loadingText?: string): string {
  if (loadingText) return loadingText;
  if (typeof children !== 'string') return 'Loading...';

  const text = children.toLowerCase();
  if (text.includes('save')) return 'Saving...';
  if (text.includes('send')) return 'Sending...';
  if (text.includes('add')) return 'Adding...';
  if (text.includes('create')) return 'Creating...';
  if (text.includes('delete') || text.includes('remove')) return 'Removing...';
  if (text.includes('update')) return 'Updating...';
  if (text.includes('submit')) return 'Submitting...';
  if (text.includes('sign') || text.includes('log')) return 'Please wait...';
  return 'Loading...';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, loadingText, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'btn focus-ring transition-all duration-150 ease-out',
        variant === 'primary' && 'btn-primary',
        variant === 'secondary' && 'btn-secondary',
        variant === 'ghost' && 'btn-ghost',
        variant === 'danger' && 'btn-danger',
        variant === 'success' && 'btn-success',
        size === 'sm' && 'btn-sm',
        size === 'lg' && 'btn-lg',
        loading && 'cursor-wait',
        className
      )}
      {...props}
    >
      {loading ? (
        <>
          <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>{getLoadingText(children, loadingText)}</span>
        </>
      ) : (
        children
      )}
    </button>
  )
);
Button.displayName = 'Button';
