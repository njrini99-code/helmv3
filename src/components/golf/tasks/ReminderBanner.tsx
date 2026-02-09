'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { getUpcomingReminders } from '@/app/golf/actions/task-reminders';
import type { TaskReminderWithTask } from '@/lib/types/golf';

interface ReminderBannerProps {
  userId: string;
  onViewTask?: (taskId: string) => void;
  className?: string;
}

export function ReminderBanner({
  userId,
  onViewTask,
  className,
}: ReminderBannerProps) {
  const [reminders, setReminders] = useState<TaskReminderWithTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);

  // Fetch upcoming reminders
  useEffect(() => {
    const fetchReminders = async () => {
      setLoading(true);
      const { data } = await getUpcomingReminders(userId, 5);
      setReminders(data || []);
      setLoading(false);
    };

    fetchReminders();
    // Refresh every 5 minutes
    const interval = setInterval(fetchReminders, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [userId]);

  // Filter out dismissed reminders
  const visibleReminders = reminders.filter((r) => !dismissedIds.has(r.id));

  // Dismiss a reminder
  const handleDismiss = (reminderId: string) => {
    setDismissedIds((prev) => new Set([...prev, reminderId]));
    if (currentIndex >= visibleReminders.length - 1) {
      setCurrentIndex(Math.max(0, currentIndex - 1));
    }
  };

  // Navigate reminders
  const handlePrevious = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(visibleReminders.length - 1, prev + 1));
  };

  // Format time until reminder
  const formatTimeUntil = (scheduledFor: string): string => {
    const now = new Date();
    const scheduled = new Date(scheduledFor);
    const diffMs = scheduled.getTime() - now.getTime();
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 0) {
      return 'Past due';
    } else if (diffMinutes < 60) {
      return `In ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
    } else if (diffHours < 24) {
      return `In ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    } else if (diffDays < 7) {
      return `In ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    } else {
      return scheduled.toLocaleDateString();
    }
  };

  // Don't render if no reminders or loading
  if (loading || visibleReminders.length === 0) {
    return null;
  }

  const currentReminder = visibleReminders[currentIndex];
  if (!currentReminder || !currentReminder.task) {
    return null;
  }

  return (
    <div
      className={cn(
        'bg-primary-50 border border-primary-100 rounded-xl p-4',
        className
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary-600"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-primary-900">
                Upcoming Reminder
              </p>
              <p className="text-xs text-primary-600 mt-0.5">
                {formatTimeUntil(currentReminder.scheduled_for)}
              </p>
            </div>

            {/* Dismiss button */}
            <button
              onClick={() => handleDismiss(currentReminder.id)}
              className="p-1 text-primary-400 hover:text-primary-600 rounded-lg hover:bg-primary-100 transition-colors"
              aria-label="Dismiss reminder"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Task info */}
          <div className="mt-2 p-3 bg-white rounded-lg border border-primary-100">
            <p className="font-medium text-gray-900 text-sm">
              {currentReminder.task.title}
            </p>
            {currentReminder.task.description && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                {currentReminder.task.description}
              </p>
            )}
            {currentReminder.task.due_date && (
              <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                Due: {new Date(currentReminder.task.due_date).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={() => onViewTask?.(currentReminder.task.id)}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
            >
              View Task
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>

            {/* Navigation */}
            {visibleReminders.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrevious}
                  disabled={currentIndex === 0}
                  className="p-1.5 text-primary-500 hover:bg-primary-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Previous reminder"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <span className="text-xs text-primary-600 min-w-[40px] text-center">
                  {currentIndex + 1} / {visibleReminders.length}
                </span>
                <button
                  onClick={handleNext}
                  disabled={currentIndex >= visibleReminders.length - 1}
                  className="p-1.5 text-primary-500 hover:bg-primary-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Next reminder"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact reminder indicator for header/nav
 */
export function ReminderIndicator({
  userId,
  onClick,
  className,
}: {
  userId: string;
  onClick?: () => void;
  className?: string;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      const { data } = await getUpcomingReminders(userId, 10);
      setCount(data?.length || 0);
    };

    fetchCount();
    const interval = setInterval(fetchCount, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [userId]);

  if (count === 0) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors',
        className
      )}
      aria-label={`${count} upcoming reminders`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary-600 text-white text-xs font-medium rounded-full flex items-center justify-center">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}

export default ReminderBanner;
