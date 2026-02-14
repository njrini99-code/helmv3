'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertSeverity = 'error' | 'warning' | 'info';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  autoDismissMs?: number;
}

export interface AlertBannerProps {
  alerts: Alert[];
  onDismiss: (id: string) => void;
  maxVisible?: number;
}

// ---------------------------------------------------------------------------
// Severity Config
// ---------------------------------------------------------------------------

const severityConfig: Record<AlertSeverity, {
  icon: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  iconBg: string;
  buttonBg: string;
  buttonHover: string;
}> = {
  error: {
    icon: '🚨',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-800',
    iconBg: 'bg-red-100',
    buttonBg: 'bg-red-600',
    buttonHover: 'hover:bg-red-700',
  },
  warning: {
    icon: '⚠️',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    textColor: 'text-amber-800',
    iconBg: 'bg-amber-100',
    buttonBg: 'bg-amber-600',
    buttonHover: 'hover:bg-amber-700',
  },
  info: {
    icon: 'ℹ️',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-800',
    iconBg: 'bg-blue-100',
    buttonBg: 'bg-blue-600',
    buttonHover: 'hover:bg-blue-700',
  },
};

// ---------------------------------------------------------------------------
// Single Alert Item
// ---------------------------------------------------------------------------

function AlertItem({
  alert,
  onDismiss,
}: {
  alert: Alert;
  onDismiss: () => void;
}) {
  const config = severityConfig[alert.severity];

  // Auto-dismiss timer
  useEffect(() => {
    if (!alert.autoDismissMs) return;
    
    const timer = setTimeout(() => {
      onDismiss();
    }, alert.autoDismissMs);

    return () => clearTimeout(timer);
  }, [alert.autoDismissMs, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cn(
        'flex items-start gap-3 p-4 rounded-2xl border shadow-lg',
        config.bgColor,
        config.borderColor
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xl',
          config.iconBg
        )}
      >
        {config.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-0.5">
        <p className={cn('text-sm font-semibold', config.textColor)}>
          {alert.title}
        </p>
        {alert.message && (
          <p className={cn('text-sm mt-0.5 opacity-80', config.textColor)}>
            {alert.message}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-2">
        {alert.actionLabel && alert.onAction && (
          <button
            onClick={alert.onAction}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors',
              config.buttonBg,
              config.buttonHover
            )}
          >
            {alert.actionLabel}
          </button>
        )}
        
        <button
          onClick={onDismiss}
          className={cn(
            'p-1.5 rounded-lg transition-colors',
            'hover:bg-black/5',
            config.textColor
          )}
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Auto-dismiss progress bar */}
      {alert.autoDismissMs && (
        <motion.div
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: alert.autoDismissMs / 1000, ease: 'linear' }}
          className={cn(
            'absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl origin-left',
            config.buttonBg,
            'opacity-30'
          )}
        />
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// AlertBanner Component
// ---------------------------------------------------------------------------

export function AlertBanner({
  alerts,
  onDismiss,
  maxVisible = 5,
}: AlertBannerProps) {
  // Sort by severity (error > warning > info)
  const sortedAlerts = [...alerts].sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  const visibleAlerts = sortedAlerts.slice(0, maxVisible);
  const hiddenCount = sortedAlerts.length - maxVisible;

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {visibleAlerts.map((alert) => (
          <AlertItem
            key={alert.id}
            alert={alert}
            onDismiss={() => onDismiss(alert.id)}
          />
        ))}
      </AnimatePresence>

      {hiddenCount > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-sm text-warm-500"
        >
          +{hiddenCount} more alert{hiddenCount !== 1 ? 's' : ''}
        </motion.div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hook for managing alerts
// ---------------------------------------------------------------------------

export function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const addAlert = useCallback((alert: Omit<Alert, 'id'>) => {
    const id = `alert-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setAlerts((prev) => [...prev, { ...alert, id }]);
    return id;
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAllAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  return {
    alerts,
    addAlert,
    dismissAlert,
    clearAllAlerts,
  };
}

export default AlertBanner;
