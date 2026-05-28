'use client';

import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconCheck, IconCalendar } from '@/components/icons';
import { completeAnnouncementTask } from '@/app/golf/actions/announcements';

interface AnnouncementTaskItemProps {
  taskId: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  isCompleted: boolean;
  onCompleted?: () => void;
}

export function AnnouncementTaskItem({
  taskId,
  title,
  description,
  dueDate,
  isCompleted: initialCompleted,
  onCompleted,
}: AnnouncementTaskItemProps) {
  const prefersReducedMotion = useReducedMotion();
  const [isCompleted, setIsCompleted] = useState(initialCompleted);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    if (isCompleted || loading) return;

    // Optimistic update
    setIsCompleted(true);
    setLoading(true);

    const result = await completeAnnouncementTask(taskId);
    if (!result.success) {
      setIsCompleted(false);
    } else {
      onCompleted?.();
    }
    setLoading(false);
  }

  // Defer time-dependent check to client to avoid hydration mismatch
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); }, []);
  const isOverdue = now && dueDate && !isCompleted && new Date(dueDate) < now;

  return (
    <motion.button
      type="button"
      onClick={handleToggle}
      disabled={isCompleted || loading}
      whileHover={!isCompleted ? { scale: 1.01, x: 2 } : {}}
      whileTap={!isCompleted ? { scale: 0.98 } : {}}
      className={cn(
        'w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all',
        isCompleted
          ? 'bg-primary-50/50 border border-primary-200/60'
          : 'bg-white border border-warm-200 hover:border-warm-300 hover:shadow-sm cursor-pointer'
      )}
    >
      {/* Checkbox */}
      <div className="pt-0.5 flex-shrink-0">
        <motion.div
          className={cn(
            'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors',
            isCompleted
              ? 'bg-primary-500 border-primary-500'
              : 'border-warm-300 hover:border-primary-400'
          )}
          animate={isCompleted ? { scale: [1, 1.2, 1] } : {}}
          transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.3 })}
        >
          {isCompleted && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.1, type: 'spring', stiffness: 500, damping: 15 })}
            >
              <IconCheck size={12} className="text-white" />
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-medium transition-colors',
          isCompleted ? 'text-primary-700 line-through' : 'text-warm-900'
        )}>
          {title}
        </p>
        {description && (
          <p className={cn(
            'text-xs mt-0.5',
            isCompleted ? 'text-primary-600/60' : 'text-warm-500'
          )}>
            {description}
          </p>
        )}
        {dueDate && (
          <div className={cn(
            'flex items-center gap-1 mt-1',
            isOverdue ? 'text-red-500' : isCompleted ? 'text-primary-500' : 'text-warm-400'
          )}>
            <IconCalendar size={10} />
            <span className="text-xs font-medium" suppressHydrationWarning>
              {isOverdue ? 'Overdue - ' : ''}
              {new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex-shrink-0 pt-0.5">
          <span className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-primary-500 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 rounded-full bg-primary-500 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 rounded-full bg-primary-500 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      )}
    </motion.button>
  );
}
