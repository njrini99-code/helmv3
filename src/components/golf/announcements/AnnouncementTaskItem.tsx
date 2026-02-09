'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
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

  const isOverdue = dueDate && !isCompleted && new Date(dueDate) < new Date();

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
          ? 'bg-green-50/50 border border-green-200/60'
          : 'bg-white border border-warm-200 hover:border-warm-300 hover:shadow-sm cursor-pointer'
      )}
    >
      {/* Checkbox */}
      <div className="pt-0.5 flex-shrink-0">
        <motion.div
          className={cn(
            'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors',
            isCompleted
              ? 'bg-green-500 border-green-500'
              : 'border-warm-300 hover:border-green-400'
          )}
          animate={isCompleted ? { scale: [1, 1.2, 1] } : {}}
          transition={{ duration: 0.3 }}
        >
          {isCompleted && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 500, damping: 15 }}
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
          isCompleted ? 'text-green-700 line-through' : 'text-warm-900'
        )}>
          {title}
        </p>
        {description && (
          <p className={cn(
            'text-xs mt-0.5',
            isCompleted ? 'text-green-600/60' : 'text-warm-500'
          )}>
            {description}
          </p>
        )}
        {dueDate && (
          <div className={cn(
            'flex items-center gap-1 mt-1',
            isOverdue ? 'text-red-500' : isCompleted ? 'text-green-500' : 'text-warm-400'
          )}>
            <IconCalendar size={10} />
            <span className="text-xs font-medium">
              {isOverdue ? 'Overdue - ' : ''}
              {new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex-shrink-0 pt-0.5">
          <div className="animate-spin h-4 w-4 border-2 border-green-500 border-t-transparent rounded-full" />
        </div>
      )}
    </motion.button>
  );
}
