'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  IconUsers, IconCalendar, IconChart, IconMessage, IconGolf,
  IconFlag, IconBook, IconAirplane, IconPlus, IconSearch, IconVideo,
  IconStar, IconTarget, IconClipboardList,
} from '@/components/icons';

// ============================================================================
// Type Definitions
// ============================================================================

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
  | 'watchlist'
  | 'pipeline'
  | 'camps'
  | 'videos'
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

// ============================================================================
// Predefined Configurations
// ============================================================================

const emptyStateConfigs: Record<EmptyStateType, EmptyStateConfig> = {
  roster: {
    icon: <IconUsers size={40} />,
    title: 'No Players Yet',
    description: 'Start building your team by adding players to your roster.',
    action: {
      label: 'Add First Player',
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
    },
  },
  announcements: {
    icon: <IconBook size={40} />,
    title: 'No Announcements',
    description: 'Keep your team informed with important updates.',
    action: {
      label: 'Post Announcement',
    },
  },
  travel: {
    icon: <IconAirplane size={40} />,
    title: 'No Travel Plans',
    description: 'Plan your next trip and share itineraries with your team.',
    action: {
      label: 'Create Itinerary',
    },
  },
  search: {
    icon: <IconSearch size={40} />,
    title: 'No Results Found',
    description: 'Try adjusting your search terms or filters.',
  },
  watchlist: {
    icon: <IconStar size={40} />,
    title: 'No Players in Watchlist',
    description: 'Start building your recruiting pipeline by adding players to watch.',
    action: {
      label: 'Discover Players',
      href: '/baseball/dashboard/discover',
    },
  },
  pipeline: {
    icon: <IconTarget size={40} />,
    title: 'Empty Pipeline',
    description: 'Add recruits to your pipeline to track their recruiting status.',
    action: {
      label: 'Find Recruits',
      href: '/baseball/dashboard/discover',
    },
  },
  camps: {
    icon: <IconCalendar size={40} />,
    title: 'No Camps Available',
    description: 'Check back soon for upcoming camps and showcases.',
  },
  videos: {
    icon: <IconVideo size={40} />,
    title: 'No Videos Yet',
    description: 'Upload your first highlight video to showcase your skills.',
    action: {
      label: 'Upload Video',
    },
  },
  generic: {
    icon: <IconClipboardList size={40} />,
    title: 'Nothing Here Yet',
    description: 'Check back later or create something new.',
  },
};

// ============================================================================
// Main Component
// ============================================================================

export interface EmptyStateProps {
  // Type-driven approach (uses predefined config)
  type?: EmptyStateType;

  // Manual approach (override everything)
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode | {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  suggestion?: string;

  // Styling
  className?: string;
  variant?: 'default' | 'card' | 'minimal' | 'compact';
  glass?: boolean;
}

export function EmptyState({
  type,
  icon: customIcon,
  title: customTitle,
  description: customDescription,
  action: customAction,
  secondaryAction: customSecondaryAction,
  suggestion,
  className,
  variant = 'default',
  glass = false,
}: EmptyStateProps) {
  // Get config from type if provided
  const config = type ? emptyStateConfigs[type] : null;

  // Final values (custom props override config)
  const finalIcon = customIcon ?? config?.icon;
  const finalTitle = customTitle ?? config?.title;
  const finalDescription = customDescription ?? config?.description;
  const finalAction = customAction ?? config?.action;
  const finalSecondaryAction = customSecondaryAction ?? config?.secondaryAction;

  // Render action button helper
  const renderAction = (actionConfig: { label: string; href?: string; onClick?: () => void } | React.ReactNode, isPrimary = true) => {
    if (!actionConfig) return null;

    // If it's a React node, render directly
    if (React.isValidElement(actionConfig)) {
      return actionConfig;
    }

    // Otherwise treat as action config
    const config = actionConfig as { label: string; href?: string; onClick?: () => void };
    const buttonSize = variant === 'minimal' || variant === 'compact' ? 'sm' : 'md';
    const buttonVariant = isPrimary ? 'primary' : 'secondary';

    if (config.href) {
      return (
        <Link href={config.href}>
          <Button variant={buttonVariant} size={buttonSize}>
            {isPrimary && <IconPlus size={16} className="mr-1.5" />}
            {config.label}
          </Button>
        </Link>
      );
    }

    return (
      <Button variant={buttonVariant} size={buttonSize} onClick={config.onClick}>
        {isPrimary && <IconPlus size={16} className="mr-1.5" />}
        {config.label}
      </Button>
    );
  };

  // ============================================================================
  // Minimal Variant
  // ============================================================================
  if (variant === 'minimal') {
    return (
      <div className={cn('text-center py-8 px-4 animate-fade-in', className)}>
        <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
          {finalIcon}
        </div>
        <p className="text-sm leading-relaxed text-slate-500">{finalDescription}</p>
        {finalAction && <div className="mt-3">{renderAction(finalAction)}</div>}
      </div>
    );
  }

  // ============================================================================
  // Compact Variant
  // ============================================================================
  if (variant === 'compact') {
    return (
      <div className={cn('flex flex-col items-center justify-center text-center py-8', className)}>
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4 animate-pulse-subtle">
          {finalIcon}
        </div>
        <h3 className="text-base font-semibold text-slate-900 mb-2">{finalTitle}</h3>
        <p className="text-sm text-slate-500 max-w-sm mb-6">{finalDescription}</p>
        {(finalAction || finalSecondaryAction) && (
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {finalAction && renderAction(finalAction, true)}
            {finalSecondaryAction && renderAction(finalSecondaryAction, false)}
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // Card Variant
  // ============================================================================
  if (variant === 'card') {
    const cardContent = (
      <div className="p-8 text-center animate-fade-in">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center text-green-600">
          {finalIcon}
        </div>
        <h3 className="text-lg font-semibold text-slate-900 tracking-tight mb-2">{finalTitle}</h3>
        <p className="text-sm leading-relaxed text-slate-500 mb-6 max-w-md mx-auto">{finalDescription}</p>
        {suggestion && (
          <p className="text-xs text-slate-400 mb-4">{suggestion}</p>
        )}
        {(finalAction || finalSecondaryAction) && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {finalAction && renderAction(finalAction, true)}
            {finalSecondaryAction && renderAction(finalSecondaryAction, false)}
          </div>
        )}
      </div>
    );

    if (glass) {
      return (
        <div className={cn('relative glass-standard rounded-2xl overflow-hidden transition-all duration-300', className)}>
          <div
            className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
            }}
          />
          {cardContent}
        </div>
      );
    }

    return (
      <div className={cn('bg-white rounded-2xl border border-slate-200 shadow-sm', className)}>
        {cardContent}
      </div>
    );
  }

  // ============================================================================
  // Default Variant
  // ============================================================================
  return (
    <div className={cn('text-center py-16 px-4 animate-fade-in', className)}>
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-green-100/50 to-emerald-100/50 animate-pulse" />
        <div className="relative w-full h-full rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
          {finalIcon}
        </div>
      </div>
      <h3 className="text-lg font-semibold text-slate-900 tracking-tight mb-2">{finalTitle}</h3>
      <p className="text-sm leading-relaxed text-slate-500 mb-6 max-w-sm mx-auto">{finalDescription}</p>
      {suggestion && (
        <p className="text-xs text-slate-400 mb-4">
          {suggestion}
        </p>
      )}
      {(finalAction || finalSecondaryAction) && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {finalAction && renderAction(finalAction, true)}
          {finalSecondaryAction && renderAction(finalSecondaryAction, false)}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Search Empty State (Specialized)
// ============================================================================

export interface SearchEmptyStateProps {
  query?: string;
  filters?: string[];
  onClearFilters?: () => void;
}

export function SearchEmptyState({ query, filters, onClearFilters }: SearchEmptyStateProps) {
  return (
    <div className="text-center py-16 px-4 animate-fade-in">
      <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-slate-100 flex items-center justify-center">
        <IconSearch size={32} className="text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 tracking-tight mb-2">
        No results found
      </h3>
      <p className="text-sm leading-relaxed text-slate-500 mb-4 max-w-sm mx-auto">
        {query ? (
          <>No matches for &quot;{query}&quot;</>
        ) : (
          <>No items match your current filters</>
        )}
      </p>
      {filters && filters.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {filters.map((filter, i) => (
            <span key={i} className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded-full">
              {filter}
            </span>
          ))}
        </div>
      )}
      {onClearFilters && (
        <button
          onClick={onClearFilters}
          className="text-sm leading-relaxed text-slate-600 hover:text-slate-900 underline underline-offset-2"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Legacy Compatibility Exports
// ============================================================================

// Card wrapper (now just uses variant="card")
export interface EmptyStateCardProps extends EmptyStateProps {}

export function EmptyStateCard(props: EmptyStateCardProps) {
  return <EmptyState {...props} variant="card" glass />;
}
