'use client';

import { useState } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  IconX,
  IconCheck,
  IconChevronRight,
  IconMessage,
  IconUser,
  IconTrendingDown,
  IconTrendingUp,
  IconWarning,
  IconInfo,
  IconAlertCircle,
  IconSparkles,
} from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';

// Alert level types matching the AI system
export type AlertLevel = 'critical' | 'warning' | 'info' | 'suggestion';

export interface CoachAlert {
  id: string;
  playerId: string;
  playerName: string;
  playerAvatarUrl?: string | null;
  level: AlertLevel;
  title: string;
  message: string;
  callToAction?: string;
  createdAt: string;
  acknowledgedAt?: string | null;
  insightType?: string;
  metadata?: Record<string, unknown>;
}

interface AlertCardProps {
  alert: CoachAlert;
  compact?: boolean;
  onDismiss?: () => void;
  onAcknowledge?: () => void;
}

const levelConfig: Record<AlertLevel, {
  bg: string;
  border: string;
  icon: React.ReactNode;
  iconBg: string;
  accent: string;
  label: string;
}> = {
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: <IconAlertCircle size={16} className="text-red-600" />,
    iconBg: 'bg-red-100',
    accent: 'bg-red-500',
    label: 'Critical',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: <IconWarning size={16} className="text-amber-600" />,
    iconBg: 'bg-amber-100',
    accent: 'bg-amber-500',
    label: 'Warning',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: <IconInfo size={16} className="text-blue-600" />,
    iconBg: 'bg-blue-100',
    accent: 'bg-blue-500',
    label: 'Info',
  },
  suggestion: {
    bg: 'bg-primary-50',
    border: 'border-primary-200',
    icon: <IconSparkles size={16} className="text-primary-600" />,
    iconBg: 'bg-primary-100',
    accent: 'bg-primary-500',
    label: 'Suggestion',
  },
};

export function AlertCard({
  alert,
  compact = false,
  onDismiss,
  onAcknowledge,
}: AlertCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragX, setDragX] = useState(0);

  const config = levelConfig[alert.level];

  // Format relative time
  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Handle swipe to dismiss
  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    if (Math.abs(info.offset.x) > 100 && onDismiss) {
      onDismiss();
    } else {
      setDragX(0);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        x: dragX,
      }}
      exit={{
        opacity: 0,
        scale: 0.9,
        x: dragX > 0 ? 200 : -200,
        transition: { duration: 0.2 },
      }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.1}
      onDragStart={() => setIsDragging(true)}
      onDrag={(_, info) => setDragX(info.offset.x)}
      onDragEnd={handleDragEnd}
      className={cn(
        'relative rounded-xl border overflow-hidden cursor-grab active:cursor-grabbing',
        config.bg,
        config.border,
        isDragging && 'z-10',
        alert.acknowledgedAt && 'opacity-60'
      )}
    >
      {/* Left accent bar */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-1', config.accent)} />

      {/* Swipe hint background */}
      <div
        className={cn(
          'absolute inset-0 flex items-center px-4',
          dragX > 50 ? 'justify-start bg-primary-100' : dragX < -50 ? 'justify-end bg-red-100' : 'hidden'
        )}
        aria-hidden="true"
      >
        {dragX > 50 && <IconCheck size={24} className="text-primary-600" />}
        {dragX < -50 && <IconX size={24} className="text-red-500" />}
      </div>

      {/* Main content */}
      <div className={cn(
        'relative bg-inherit p-3 pl-4',
        isDragging && 'select-none'
      )}>
        <div className="flex items-start gap-3">
          {/* Player Avatar */}
          <Avatar
            src={alert.playerAvatarUrl}
            name={alert.playerName}
            size="sm"
          />

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header Row */}
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-semibold text-sm text-warm-900 truncate">
                {alert.playerName}
              </span>
              <div className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded-full',
                config.iconBg
              )}>
                {config.icon}
                <span className="sr-only">{config.label} alert</span>
              </div>
              <span className="text-xs text-warm-400 ml-auto whitespace-nowrap">
                {formatRelativeTime(alert.createdAt)}
              </span>
            </div>

            {/* Message */}
            <p className={cn(
              'text-sm text-warm-700',
              compact && !isExpanded && 'line-clamp-1'
            )}>
              {alert.message}
            </p>

            {/* Expanded Content */}
            <AnimatePresence>
              {isExpanded && alert.callToAction && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
                  className="mt-2 pt-2 border-t border-white/50"
                >
                  <p className="text-xs text-warm-500 mb-2">
                    Suggested action:
                  </p>
                  <p className="text-sm text-warm-700 font-medium">
                    {alert.callToAction}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions Row */}
            {!compact && (
              <div className="flex items-center gap-2 mt-2">
                <a
                  href={`/golf/dashboard/roster/${alert.playerId}`}
                  className={cn(
                    'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg',
                    'text-warm-600 hover:text-warm-800 hover:bg-white/50',
                    'transition-colors'
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <IconUser size={12} />
                  View Player
                </a>
                <a
                  href={`/golf/dashboard/messages?player=${alert.playerId}`}
                  className={cn(
                    'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg',
                    'text-warm-600 hover:text-warm-800 hover:bg-white/50',
                    'transition-colors'
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <IconMessage size={12} />
                  Message
                </a>

                {onAcknowledge && !alert.acknowledgedAt && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAcknowledge();
                    }}
                    className={cn(
                      'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg ml-auto',
                      'text-primary-600 hover:text-primary-700 hover:bg-primary-100',
                      'transition-colors'
                    )}
                  >
                    <IconCheck size={12} />
                    Got It
                  </button>
                )}

                {onDismiss && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss();
                    }}
                    aria-label="Dismiss alert"
                    className={cn(
                      'p-1 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-white/50',
                      'transition-colors',
                      !onAcknowledge || alert.acknowledgedAt ? 'ml-auto' : ''
                    )}
                  >
                    <IconX size={14} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Compact mode expand button */}
          {compact && alert.callToAction && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? 'Collapse alert details' : 'Expand alert details'}
              aria-expanded={isExpanded}
              className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-white/50 transition-colors"
            >
              <motion.div
                animate={{ rotate: isExpanded ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <IconChevronRight size={16} />
              </motion.div>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Trend indicator component for alert messages
export function TrendIndicator({ direction }: { direction: 'up' | 'down' }) {
  return direction === 'up' ? (
    <span>
      <IconTrendingUp size={14} className="text-primary-600" />
      <span className="sr-only">Trending up</span>
    </span>
  ) : (
    <span>
      <IconTrendingDown size={14} className="text-red-500" />
      <span className="sr-only">Trending down</span>
    </span>
  );
}
