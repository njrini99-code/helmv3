'use client';

import { useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
  className?: string;
  icon?: React.ReactNode;
}

const alertStyles = {
  success: {
    bg: 'bg-primary-50',
    border: 'border-primary-200',
    icon: 'text-primary-600',
    title: 'text-primary-800',
    text: 'text-primary-700',
    dismissHover: 'hover:bg-primary-100',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-600',
    title: 'text-red-800',
    text: 'text-red-700',
    dismissHover: 'hover:bg-red-100',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-600',
    title: 'text-amber-800',
    text: 'text-amber-700',
    dismissHover: 'hover:bg-amber-100',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'text-blue-600',
    title: 'text-blue-800',
    text: 'text-blue-700',
    dismissHover: 'hover:bg-blue-100',
  },
};

const alertIcons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

export function Alert({ type, title, description, action, onDismiss, className, icon }: AlertProps) {
  const styles = alertStyles[type];
  const DefaultIcon = alertIcons[type];
  const [isDismissing, setIsDismissing] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsDismissing(true);
    setTimeout(() => onDismiss?.(), 200);
  }, [onDismiss]);

  return (
    <div
      role="alert"
      className={cn(
        styles.bg, styles.border,
        'border rounded-[14px]',
        'p-4',
        'flex items-start gap-3',
        'animate-fade-in',
        'transition-all duration-200',
        isDismissing && 'opacity-0 scale-95 -translate-y-1',
        className,
      )}
    >
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
        styles.bg,
      )}>
        {icon || <DefaultIcon className={cn('w-5 h-5', styles.icon)} />}
      </div>

      <div className="flex-1 min-w-0">
        <p className={cn('font-semibold text-sm', styles.title)}>{title}</p>
        {description && (
          <p className={cn('text-sm mt-1', styles.text)}>{description}</p>
        )}
        {action && (
          <button
            onClick={action.onClick}
            className={cn(
              'text-sm font-medium mt-2 transition-all duration-150',
              'hover:underline active:scale-95',
              styles.icon,
            )}
          >
            {action.label}
          </button>
        )}
      </div>

      {onDismiss && (
        <button
          onClick={handleDismiss}
          aria-label="Dismiss alert"
          className={cn(
            'w-8 h-8 flex-shrink-0',
            'rounded-lg',
            'flex items-center justify-center',
            'transition-all duration-150',
            'active:scale-90',
            styles.icon,
            styles.dismissHover,
          )}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
