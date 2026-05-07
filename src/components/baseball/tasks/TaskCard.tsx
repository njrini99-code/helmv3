'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconCheck, IconClock, IconUsers, IconChevronDown, IconChevronUp, IconTrash } from '@/components/icons';
import { cn } from '@/lib/utils';
import { fadeUp } from '@/lib/motion';
import { ReminderBadge } from './ReminderBadge';
import { completeTask, uncompleteTask, deleteTask } from '@/app/baseball/actions/tasks';
import { useToast } from '@/components/ui/sonner';

const categoryColors: Record<string, string> = {
  general: 'bg-slate-100 text-slate-600',
  conditioning: 'bg-red-100 text-red-700',
  academic: 'bg-amber-100 text-amber-700',
  administrative: 'bg-blue-100 text-blue-700',
  practice: 'bg-primary-100 text-primary-700',
  game_prep: 'bg-purple-100 text-purple-700',
};

const priorityColors: Record<string, string> = {
  high: 'bg-red-500',
  normal: 'bg-primary-500',
  low: 'bg-slate-400',
};

interface Assignment {
  id: string;
  player_id: string;
  status: string;
  completed_at: string | null;
  player_first_name: string;
  player_last_name: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  priority: string | null;
  category: string | null;
  created_at: string;
  reminder_at?: string | null;
  assignments: Assignment[];
}

interface TaskCardProps {
  task: Task;
  isCoach: boolean;
  currentPlayerId?: string | null;
  onRefresh: () => void;
}

export function TaskCard({ task, isCoach, currentPlayerId, onRefresh }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { showToast } = useToast();

  const completedCount = task.assignments.filter(a => a.status === 'completed').length;
  const totalCount = task.assignments.length;
  const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && completionRate < 100;

  // For player view: check if current player has completed this task
  const playerAssignment = currentPlayerId
    ? task.assignments.find(a => a.player_id === currentPlayerId)
    : null;
  const isCompletedByPlayer = playerAssignment?.status === 'completed';

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatCategoryLabel(cat: string) {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  async function handleToggleComplete() {
    if (!currentPlayerId || !playerAssignment) return;
    setCompleting(true);
    try {
      if (isCompletedByPlayer) {
        const result = await uncompleteTask(task.id, currentPlayerId);
        if (result.success) {
          showToast('Task marked as pending', 'success');
          onRefresh();
        } else {
          showToast(result.error || 'Failed to update task', 'error');
        }
      } else {
        const result = await completeTask(task.id, currentPlayerId);
        if (result.success) {
          showToast('Task completed!', 'success');
          onRefresh();
        } else {
          showToast(result.error || 'Failed to complete task', 'error');
        }
      }
    } catch {
      showToast('An error occurred', 'error');
    } finally {
      setCompleting(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this task?')) return;
    setDeleting(true);
    try {
      const result = await deleteTask(task.id);
      if (result.success) {
        showToast('Task deleted', 'success');
        onRefresh();
      } else {
        showToast(result.error || 'Failed to delete task', 'error');
      }
    } catch {
      showToast('An error occurred', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      layout
      className="relative glass-standard rounded-2xl overflow-clip transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3 flex-1">
            {/* Player checkbox */}
            {!isCoach && playerAssignment && (
              <button
                onClick={handleToggleComplete}
                disabled={completing}
                className={cn(
                  'mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all',
                  isCompletedByPlayer
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'border-slate-300 hover:border-primary-500'
                )}
              >
                {isCompletedByPlayer && <IconCheck size={12} />}
              </button>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {/* Priority dot */}
                {task.priority && (
                  <span
                    className={cn('w-2 h-2 rounded-full flex-shrink-0', priorityColors[task.priority] || priorityColors.normal)}
                    title={`${task.priority} priority`}
                  />
                )}
                <h3 className={cn(
                  'font-semibold text-slate-900',
                  isCompletedByPlayer && 'line-through text-slate-400'
                )}>
                  {task.title}
                </h3>
              </div>
              {task.description && (
                <p className="text-sm text-slate-500 line-clamp-2">{task.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-3">
            {completionRate === 100 && (
              <span className="px-2.5 py-1 rounded-full bg-primary-100 text-primary-700 text-xs font-medium">
                Completed
              </span>
            )}
            {isCoach && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 active:bg-red-100 transition-colors"
                title="Delete task"
              >
                <IconTrash size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar (coach view) */}
        {isCoach && totalCount > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span className="flex items-center gap-1">
                <IconUsers size={14} />
                {completedCount} of {totalCount} completed
              </span>
              <span className="font-medium">{Math.round(completionRate)}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300',
                  completionRate === 100 ? 'bg-primary-600' : 'bg-primary-500'
                )}
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            {task.due_date && (
              <span className={cn(
                'flex items-center gap-1',
                isOverdue ? 'text-red-600' : 'text-slate-500'
              )}>
                <IconClock size={14} />
                {formatDate(task.due_date)}
              </span>
            )}
            {task.reminder_at && (
              <ReminderBadge reminderAt={task.reminder_at} size="sm" />
            )}
            {task.category && (
              <span className={cn(
                'px-2 py-0.5 rounded text-xs font-medium',
                categoryColors[task.category] || categoryColors.general
              )}>
                {formatCategoryLabel(task.category)}
              </span>
            )}
          </div>

          {isCoach && totalCount > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              {expanded ? 'Hide' : 'View'} details
              {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            </button>
          )}
        </div>

        {/* Expanded Details (coach only) */}
        <AnimatePresence>
          {expanded && isCoach && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4 pt-4 border-t border-slate-200"
            >
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Player Progress
              </p>
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: { staggerChildren: 0.05 },
                  },
                }}
                className="space-y-2"
              >
                {task.assignments.map((assignment, index) => (
                  <motion.div
                    key={assignment.id}
                    variants={{
                      hidden: { opacity: 0, x: -8 },
                      visible: { opacity: 1, x: 0 },
                    }}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 transition-colors hover:bg-slate-100 active:bg-slate-200"
                  >
                    <span className="text-sm text-slate-700">
                      {assignment.player_first_name} {assignment.player_last_name}
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
                      <span className="text-xs text-slate-400 font-medium">Pending</span>
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
