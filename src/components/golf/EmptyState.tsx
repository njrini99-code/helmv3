'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  IconUsers, IconCalendar, IconChart, IconMessage, IconGolf,
  IconFlag, IconBook, IconAirplane, IconPlus, IconSearch
} from '@/components/icons';

type EmptyStateType = 
  | 'roster'
  | 'rounds'
  | 'calendar'
  | 'messages'
  | 'stats'
  | 'qualifiers'
  | 'announcements'
  | 'travel'
  | 'search'
  | 'generic';

interface EmptyStateConfig {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

const emptyStateConfigs: Record<EmptyStateType, EmptyStateConfig> = {
  roster: {
    icon: <IconUsers size={40} />,
    title: 'No Players Yet',
    description: 'Start building your team by adding players to your roster.',
    action: {
      label: 'Add First Player',
      href: '/golf/dashboard/roster',
    },
  },
  rounds: {
    icon: <IconGolf size={40} />,
    title: 'No Rounds Recorded',
    description: 'Track your performance by submitting your first round.',
    action: {
      label: 'Submit Round',
      href: '/golf/dashboard/rounds/new',
    },
  },
  calendar: {
    icon: <IconCalendar size={40} />,
    title: 'No Upcoming Events',
    description: 'Your calendar is clear. Schedule practices, tournaments, or team meetings.',
    action: {
      label: 'Create Event',
      href: '/golf/dashboard/calendar',
    },
  },
  messages: {
    icon: <IconMessage size={40} />,
    title: 'No Conversations',
    description: 'Start communicating with your team members.',
    action: {
      label: 'New Message',
    },
  },
  stats: {
    icon: <IconChart size={40} />,
    title: 'No Stats Available',
    description: 'Stats will appear here once rounds are recorded.',
    action: {
      label: 'Submit a Round',
      href: '/golf/dashboard/rounds/new',
    },
  },
  qualifiers: {
    icon: <IconFlag size={40} />,
    title: 'No Qualifiers',
    description: 'Create a qualifier to determine your tournament lineup.',
    action: {
      label: 'Create Qualifier',
      href: '/golf/dashboard/qualifiers/new',
    },
  },
  announcements: {
    icon: <IconBook size={40} />,
    title: 'No Announcements',
    description: 'Keep your team informed with important updates.',
    action: {
      label: 'Post Announcement',
      href: '/golf/dashboard/announcements/new',
    },
  },
  travel: {
    icon: <IconAirplane size={40} />,
    title: 'No Travel Plans',
    description: 'Plan your next trip and share itineraries with your team.',
    action: {
      label: 'Create Itinerary',
      href: '/golf/dashboard/travel/new',
    },
  },
  search: {
    icon: <IconSearch size={40} />,
    title: 'No Results Found',
    description: 'Try adjusting your search terms or filters.',
  },
  generic: {
    icon: <IconGolf size={40} />,
    title: 'Nothing Here Yet',
    description: 'Check back later or create something new.',
  },
};

interface EmptyStateProps {
  type: EmptyStateType;
  title?: string;
  description?: string;
  action?: EmptyStateConfig['action'];
  secondaryAction?: EmptyStateConfig['secondaryAction'];
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  type,
  title,
  description,
  action,
  secondaryAction,
  className,
  compact = false,
}: EmptyStateProps) {
  const config = emptyStateConfigs[type];
  const finalTitle = title || config.title;
  const finalDescription = description || config.description;
  const finalAction = action || config.action;
  const finalSecondaryAction = secondaryAction || config.secondaryAction;

  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center',
      compact ? 'py-8' : 'py-16',
      className
    )}>
      {/* Animated Icon Container */}
      <div className={cn(
        'rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4',
        'animate-pulse-subtle',
        compact ? 'w-16 h-16' : 'w-20 h-20'
      )}>
        {config.icon}
      </div>

      {/* Title */}
      <h3 className={cn(
        'font-semibold text-slate-900 mb-2',
        compact ? 'text-base' : 'text-lg'
      )}>
        {finalTitle}
      </h3>

      {/* Description */}
      <p className={cn(
        'text-slate-500 max-w-sm mb-6',
        compact ? 'text-sm' : 'text-base'
      )}>
        {finalDescription}
      </p>

      {/* Actions */}
      {(finalAction || finalSecondaryAction) && (
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {finalAction && (
            finalAction.href ? (
              <Link href={finalAction.href}>
                <Button variant="primary" size={compact ? 'sm' : 'md'}>
                  <IconPlus size={16} className="mr-1.5" />
                  {finalAction.label}
                </Button>
              </Link>
            ) : (
              <Button 
                variant="primary" 
                size={compact ? 'sm' : 'md'}
                onClick={finalAction.onClick}
              >
                <IconPlus size={16} className="mr-1.5" />
                {finalAction.label}
              </Button>
            )
          )}
          {finalSecondaryAction && (
            finalSecondaryAction.href ? (
              <Link href={finalSecondaryAction.href}>
                <Button variant="secondary" size={compact ? 'sm' : 'md'}>
                  {finalSecondaryAction.label}
                </Button>
              </Link>
            ) : (
              <Button 
                variant="secondary" 
                size={compact ? 'sm' : 'md'}
                onClick={finalSecondaryAction.onClick}
              >
                {finalSecondaryAction.label}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// Card wrapper for empty states
interface EmptyStateCardProps extends EmptyStateProps {
  glass?: boolean;
}

export function EmptyStateCard({ glass = false, ...props }: EmptyStateCardProps) {
  return (
    <div className={cn(
      'rounded-xl border',
      glass 
        ? 'bg-white/70 backdrop-blur-sm border-white/20' 
        : 'bg-white border-slate-200'
    )}>
      <EmptyState {...props} />
    </div>
  );
}
