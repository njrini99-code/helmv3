'use client';

import { motion } from 'framer-motion';
import { IconBell } from '@/components/icons';
import { cn } from '@/lib/utils';

interface ReminderBadgeProps {
  reminderAt: string;
  className?: string;
  size?: 'sm' | 'md';
}

function ReminderBadge({ reminderAt, className, size = 'md' }: ReminderBadgeProps) {
  const reminderDate = new Date(reminderAt);
  const now = new Date();
  const diff = reminderDate.getTime() - now.getTime();

  // Calculate display
  let label: string;
  let variant: 'upcoming' | 'soon' | 'imminent' | 'past';

  if (diff < 0) {
    // Past due
    label = 'Reminder passed';
    variant = 'past';
  } else {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    const minutes = Math.floor(diff / (1000 * 60));

    if (days >= 2) {
      label = `Reminder in ${days} days`;
      variant = 'upcoming';
    } else if (days >= 1) {
      label = `Reminder in ${days} day`;
      variant = 'upcoming';
    } else if (hours >= 1) {
      label = `Reminder in ${hours}h`;
      variant = hours <= 3 ? 'soon' : 'upcoming';
    } else if (minutes >= 1) {
      label = `Reminder in ${minutes}m`;
      variant = 'imminent';
    } else {
      label = 'Reminder now';
      variant = 'imminent';
    }
  }

  const variantStyles = {
    upcoming: 'bg-amber-50 text-amber-700 border-amber-200',
    soon: 'bg-orange-50 text-orange-700 border-orange-200',
    imminent: 'bg-red-50 text-red-700 border-red-200 animate-pulse',
    past: 'bg-warm-50 text-warm-500 border-warm-200',
  };

  const sizeStyles = {
    sm: 'px-1.5 py-0.5 text-xs gap-1',
    md: 'px-2 py-1 text-xs gap-2',
  };

  const iconSize = size === 'sm' ? 10 : 12;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      title={`Reminder: ${reminderDate.toLocaleString()}`}
    >
      <IconBell size={iconSize} />
      <span>{label}</span>
    </motion.div>
  );
}

// Compact version for use in cards/lists
export function ReminderIcon({ reminderAt, className }: { reminderAt: string; className?: string }) {
  const reminderDate = new Date(reminderAt);
  const now = new Date();
  const diff = reminderDate.getTime() - now.getTime();

  let variant: 'upcoming' | 'soon' | 'imminent' | 'past';

  if (diff < 0) {
    variant = 'past';
  } else {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours > 24) {
      variant = 'upcoming';
    } else if (hours > 3) {
      variant = 'soon';
    } else {
      variant = 'imminent';
    }
  }

  const variantStyles = {
    upcoming: 'text-amber-500',
    soon: 'text-orange-500',
    imminent: 'text-red-500',
    past: 'text-warm-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'inline-flex items-center justify-center',
        variant === 'imminent' && 'animate-pulse',
        className
      )}
      title={`Reminder: ${reminderDate.toLocaleString()}`}
    >
      <IconBell size={14} className={variantStyles[variant]} />
    </motion.div>
  );
}
