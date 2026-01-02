'use client';

import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}

const alertStyles = {
  success: {
    bg: 'bg-primary-50',
    border: 'border-primary-200',
    icon: 'text-primary-600',
    title: 'text-primary-800',
    text: 'text-primary-700',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-600',
    title: 'text-red-800',
    text: 'text-red-700',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-600',
    title: 'text-amber-800',
    text: 'text-amber-700',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'text-blue-600',
    title: 'text-blue-800',
    text: 'text-blue-700',
  },
};

const alertIcons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

export function Alert({ type, title, description, action, onDismiss }: AlertProps) {
  const styles = alertStyles[type];
  const Icon = alertIcons[type];

  return (
    <div className={`
      ${styles.bg} ${styles.border}
      border rounded-[14px]
      p-4
      flex items-start gap-3
    `}>
      <Icon className={`w-5 h-5 flex-shrink-0 ${styles.icon}`} />

      <div className="flex-1">
        <p className={`font-semibold text-sm ${styles.title}`}>{title}</p>
        {description && (
          <p className={`text-sm mt-1 ${styles.text}`}>{description}</p>
        )}
        {action && (
          <button
            onClick={action.onClick}
            className={`text-sm font-medium ${styles.icon} hover:underline mt-2`}
          >
            {action.label}
          </button>
        )}
      </div>

      {onDismiss && (
        <button
          onClick={onDismiss}
          className={`
            w-6 h-6 flex-shrink-0
            rounded-md
            flex items-center justify-center
            ${styles.icon} hover:${styles.bg}
            transition-colors duration-150
          `}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
