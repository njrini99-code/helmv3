'use client';

import { motion } from 'framer-motion';
import { IconBell } from '@/components/icons';
import { cn } from '@/lib/utils';
import { Badge, type BadgeTone } from '@/components/ui/badge';

interface ReminderBadgeProps {
  reminderAt: string;
  className?: string;
  size?: 'sm' | 'md';
}

// reminder urgency → color-faithful Badge tone (upcoming=amber, soon=orange,
// imminent=red, past=warm). `imminent` also pulses.
const REMINDER_TONE: Record<'upcoming' | 'soon' | 'imminent' | 'past', BadgeTone> = {
  upcoming: 'amber',
  soon: 'orange',
  imminent: 'red',
  past: 'warm',
};

export function ReminderBadge({ reminderAt, className, size = 'md' }: ReminderBadgeProps) {
  const reminderDate = new Date(reminderAt);
  const now = new Date();
  const diff = reminderDate.getTime() - now.getTime();

  let label: string;
  let variant: 'upcoming' | 'soon' | 'imminent' | 'past';

  if (diff < 0) {
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

  const sizeStyles = {
    sm: 'px-1.5 py-0.5 text-xs gap-1',
    md: 'px-2 py-1 text-xs gap-2',
  };

  const iconSize = size === 'sm' ? 10 : 12;

  return (
    <Badge
      as={motion.span}
      tone={REMINDER_TONE[variant]}
      size="none"
      icon={<IconBell size={iconSize} />}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        sizeStyles[size],
        // `past` keeps its muted warm-500 text (Badge warm-soft is warm-700).
        variant === 'past' && 'text-warm-500',
        variant === 'imminent' && 'animate-pulse',
        className
      )}
      title={`Reminder: ${reminderDate.toLocaleString()}`}
    >
      <span>{label}</span>
    </Badge>
  );
}
