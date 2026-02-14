'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconActivity, IconWarning } from '@/components/icons';

// ============================================
// TYPES
// ============================================

interface LiveEventCounterProps {
  /** Total number of events */
  total: number;
  /** Number of error events */
  errors: number;
  /** Number of critical events */
  critical: number;
  /** Whether connected to realtime */
  isConnected: boolean;
  /** Connection state */
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  /** Click handler */
  onClick?: () => void;
  /** Additional class names */
  className?: string;
}

// ============================================
// COMPONENT
// ============================================

export function LiveEventCounter({
  total,
  errors,
  critical,
  isConnected: _isConnected, // Available for future use
  connectionState,
  onClick,
  className,
}: LiveEventCounterProps) {
  const hasIssues = errors > 0 || critical > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200',
        'bg-white/50 hover:bg-white/70 border border-white/20',
        hasIssues && 'border-amber-200/50',
        critical > 0 && 'border-red-200/50 bg-red-50/50',
        className
      )}
    >
      {/* Live indicator */}
      <div className="relative flex items-center gap-1.5">
        {connectionState === 'connected' ? (
          <>
            <div className="relative">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-75" />
            </div>
            <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider">
              Live
            </span>
          </>
        ) : connectionState === 'connecting' ? (
          <>
            <motion.div
              className="w-2 h-2 rounded-full bg-amber-500"
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <span className="text-[10px] font-medium text-amber-600 uppercase tracking-wider">
              Connecting
            </span>
          </>
        ) : (
          <>
            <div className="w-2 h-2 rounded-full bg-warm-300" />
            <span className="text-[10px] font-medium text-warm-500 uppercase tracking-wider">
              Offline
            </span>
          </>
        )}
      </div>

      {/* Separator */}
      <div className="w-px h-4 bg-warm-200" />

      {/* Event counts */}
      <div className="flex items-center gap-3">
        {/* Total events */}
        <div className="flex items-center gap-1">
          <IconActivity size={14} className="text-warm-400" />
          <AnimatePresence mode="popLayout">
            <motion.span
              key={total}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="text-warm-700 font-semibold tabular-nums"
            >
              {total}
            </motion.span>
          </AnimatePresence>
        </div>

        {/* Error count (if any) */}
        {errors > 0 && (
          <div className="flex items-center gap-1">
            <IconWarning
              size={14}
              className={critical > 0 ? 'text-red-500' : 'text-amber-500'}
            />
            <AnimatePresence mode="popLayout">
              <motion.span
                key={errors}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className={cn(
                  'font-semibold tabular-nums',
                  critical > 0 ? 'text-red-600' : 'text-amber-600'
                )}
              >
                {errors}
              </motion.span>
            </AnimatePresence>
            {critical > 0 && (
              <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium animate-pulse">
                {critical} critical
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

// ============================================
// MINI VARIANT (for sidebar)
// ============================================

interface LiveEventCounterMiniProps {
  errors: number;
  critical: number;
  isConnected: boolean;
  className?: string;
}

export function LiveEventCounterMini({
  errors,
  critical,
  isConnected,
  className,
}: LiveEventCounterMiniProps) {
  const hasIssues = errors > 0 || critical > 0;

  if (!hasIssues && isConnected) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="text-[10px] text-emerald-600">All clear</span>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <div className="w-1.5 h-1.5 rounded-full bg-warm-300" />
        <span className="text-[10px] text-warm-400">Offline</span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <motion.div
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          critical > 0 ? 'bg-red-500' : 'bg-amber-500'
        )}
        animate={critical > 0 ? { scale: [1, 1.2, 1] } : {}}
        transition={{ duration: 1, repeat: Infinity }}
      />
      <span
        className={cn(
          'text-[10px] font-medium tabular-nums',
          critical > 0 ? 'text-red-600' : 'text-amber-600'
        )}
      >
        {errors} error{errors !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

// ============================================
// BADGE VARIANT (for nav items)
// ============================================

interface LiveEventBadgeProps {
  count: number;
  variant?: 'error' | 'warning' | 'info';
  className?: string;
  pulse?: boolean;
}

export function LiveEventBadge({
  count,
  variant = 'error',
  className,
  pulse = false,
}: LiveEventBadgeProps) {
  if (count === 0) return null;

  const variantStyles = {
    error: 'bg-red-500 text-white',
    warning: 'bg-amber-500 text-white',
    info: 'bg-blue-500 text-white',
  };

  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className={cn(
        'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold rounded-full tabular-nums',
        variantStyles[variant],
        pulse && 'animate-pulse',
        className
      )}
    >
      {count > 99 ? '99+' : count}
    </motion.span>
  );
}
