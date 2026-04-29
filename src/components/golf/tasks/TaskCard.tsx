'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconCheck, IconClock, IconUsers, IconChevronDown, IconChevronUp } from '@/components/icons';
import { cn } from '@/lib/utils';
import { fadeUp } from '@/lib/motion';
import { ReminderIcon } from './ReminderBadge';

interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
  reminder_at?: string | null;
  category?: string | null;
  assignments: Array<{
    id: string;
    status: string;
    completed_at: string | null;
    player: {
      first_name: string;
      last_name: string;
    };
  }>;
}

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);

  const completedCount = task.assignments.filter(a => a.status === 'completed').length;
  const totalCount = task.assignments.length;
  const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && completionRate < 100;

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      layout
      className="relative glass-standard rounded-2xl overflow-clip transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]"
    >

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-warm-900 mb-1 line-clamp-2">{task.title}</h3>
            {task.description && (
              <p className="text-sm text-warm-500 line-clamp-2">{task.description}</p>
            )}
          </div>
          {task.status === 'completed' && (
            <div className="flex-shrink-0 px-2.5 py-1 rounded-full bg-primary-100 text-primary-700 text-xs font-medium">
              Completed
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-warm-500 mb-1.5">
            <span className="flex items-center gap-1">
              <IconUsers size={14} />
              {completedCount} of {totalCount} completed
            </span>
            <span className="font-medium">{Math.round(completionRate)}%</span>
          </div>
          <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-300',
                completionRate === 100 ? 'bg-primary-600' : 'bg-primary-500'
              )}
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            {task.due_date && (
              <span className={cn(
                'flex items-center gap-1',
                isOverdue ? 'text-red-600' : 'text-warm-500'
              )}>
                <IconClock size={14} />
                {formatDate(task.due_date)}
              </span>
            )}
            {task.reminder_at && (
              <ReminderIcon reminderAt={task.reminder_at} />
            )}
            {task.category && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-warm-100 text-warm-600">
                {task.category}
              </span>
            )}
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-sm font-medium text-warm-600 hover:text-warm-900 active:scale-95 transition-colors"
          >
            {expanded ? 'Hide' : 'View'} details
            {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          </button>
        </div>

        {/* Expanded Details */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
              style={{ overflow: 'hidden' }}
              className="mt-4 pt-4 border-t border-warm-200"
            >
              <p className="text-xs font-semibold text-warm-400 uppercase tracking-wider mb-3">
                Player Progress
              </p>
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: { staggerChildren: 0.05 }
                  }
                }}
                className="space-y-2"
              >
                {task.assignments.map((assignment, index) => (
                  <motion.div
                    key={assignment.id}
                    variants={{
                      hidden: { opacity: 0, x: -8 },
                      visible: { opacity: 1, x: 0 }
                    }}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-warm-50 transition-colors hover:bg-warm-100 active:bg-warm-200"
                  >
                    <span className="text-sm text-warm-700">
                      {assignment.player.first_name} {assignment.player.last_name}
                    </span>
                    {assignment.status === 'completed' ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: index * 0.05, type: 'spring', stiffness: 500, damping: 25 }}
                        className="flex items-center gap-2 text-primary-600"
                      >
                        <IconCheck size={16} />
                        <span className="text-xs font-medium">Completed</span>
                      </motion.div>
                    ) : (
                      <span className="text-xs text-warm-400 font-medium">Pending</span>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
