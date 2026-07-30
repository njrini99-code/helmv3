'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  IconUsers, IconCalendar, IconChart, IconMessage, IconGolf,
  IconFlag, IconBook, IconAirplane, IconPlus, IconSearch, IconVideo,
  IconClipboardList,
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
  // 'watchlist' and 'pipeline' were REMOVED with the recruiting sunset
  // (2026-07-29, product-modules.ts). Both had zero call sites and both shipped
  // an action button linking to /baseball/dashboard/discover, a route the sunset
  // closes — so restoring either would have put a dead-end CTA on screen. The
  // camps preset is kept: it carries no href, so it is inert rather than wrong,
  // and the camps route itself comes back with the module.
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
    title: 'Your roster is empty',
    description: 'Add your first player to start building the lineup.',
    action: {
      label: 'Add First Player',
    },
  },
  rounds: {
    icon: <IconGolf size={40} />,
    title: 'No rounds on the card',
    description: 'Post your first round to start tracking your game.',
    action: {
      label: 'Submit Round',
      href: '/golf/dashboard/rounds/new',
    },
  },
  calendar: {
    icon: <IconCalendar size={40} />,
    title: 'Nothing on the schedule',
    description: 'Add a practice, tournament, or team meeting to fill the calendar.',
    action: {
      label: 'Create Event',
    },
  },
  messages: {
    icon: <IconMessage size={40} />,
    title: 'No conversations yet',
    description: 'Start a thread to keep the team in the loop.',
    action: {
      label: 'New Message',
    },
  },
  stats: {
    icon: <IconChart size={40} />,
    title: 'No stats to show yet',
    description: 'Post a round and your numbers will start building here.',
    action: {
      label: 'Submit a Round',
      href: '/golf/dashboard/rounds/new',
    },
  },
  qualifiers: {
    icon: <IconFlag size={40} />,
    title: 'No qualifiers running',
    description: 'Set up a qualifier to settle who earns the travel lineup.',
    action: {
      label: 'Create Qualifier',
    },
  },
  announcements: {
    icon: <IconBook size={40} />,
    title: 'No announcements posted',
    description: 'Post an update to keep the team on the same page.',
    action: {
      label: 'Post Announcement',
    },
  },
  travel: {
    icon: <IconAirplane size={40} />,
    title: 'No trips planned',
    description: 'Build an itinerary so the team knows where and when to show up.',
    action: {
      label: 'Create Itinerary',
    },
  },
  search: {
    icon: <IconSearch size={40} />,
    title: 'No matches found',
    description: 'Tweak your search or clear a filter to widen the results.',
  },
  camps: {
    icon: <IconCalendar size={40} />,
    title: 'No camps on the calendar',
    description: 'Check back soon — upcoming camps and showcases will land here.',
  },
  videos: {
    icon: <IconVideo size={40} />,
    title: 'No film on file',
    description: 'Upload a highlight clip to put your swing in front of coaches.',
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
  // Use !== undefined check so that explicit null can disable defaults
  const finalIcon = customIcon ?? config?.icon;
  const finalTitle = customTitle ?? config?.title;
  const finalDescription = customDescription ?? config?.description;
  const finalAction = customAction !== undefined ? customAction : config?.action;
  const finalSecondaryAction = customSecondaryAction !== undefined ? customSecondaryAction : config?.secondaryAction;

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
        <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-warm-100 flex items-center justify-center text-warm-400">
          {finalIcon}
        </div>
        <p className="text-sm leading-relaxed text-warm-500">{finalDescription}</p>
        {finalAction && <div className="mt-3">{renderAction(finalAction)}</div>}
      </div>
    );
  }

  // ============================================================================
  // Compact Variant
  // ============================================================================
  if (variant === 'compact') {
    return (
      <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}>
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center text-primary-600/80 mb-5">
          {finalIcon}
        </div>
        <h3 className="text-base font-semibold text-warm-900 tracking-tight mb-2">{finalTitle}</h3>
        <p className="text-sm leading-relaxed text-warm-500 max-w-sm mb-6">{finalDescription}</p>
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
      <div className="p-10 text-center animate-fade-in">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center text-primary-600/80">
          {finalIcon}
        </div>
        <h3 className="text-[17px] font-semibold text-warm-900 tracking-tight mb-2">{finalTitle}</h3>
        <p className="text-sm leading-relaxed text-warm-500 mb-7 max-w-md mx-auto">{finalDescription}</p>
        {suggestion && (
          <p className="text-xs text-warm-400 mb-4">{suggestion}</p>
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
        <div className={cn('relative glass-standard rounded-2xl overflow-clip transition-all duration-300', className)}>
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
      <div className={cn('bg-white rounded-2xl border border-warm-200/70 shadow-sm overflow-clip', className)}>
        {cardContent}
      </div>
    );
  }

  // ============================================================================
  // Default Variant (iOS-native: large soft tinted circle, generous spacing)
  // ============================================================================
  return (
    <div className={cn('text-center py-20 px-6 animate-fade-in', className)}>
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary-100/60 to-primary-200/50" />
        <div className="relative w-full h-full rounded-full flex items-center justify-center text-primary-600/80">
          {finalIcon}
        </div>
      </div>
      <h3 className="text-[17px] font-semibold text-warm-900 tracking-tight mb-2">{finalTitle}</h3>
      <p className="text-sm leading-relaxed text-warm-500 mb-7 max-w-sm mx-auto">{finalDescription}</p>
      {suggestion && (
        <p className="text-xs text-warm-400 mb-5">
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
    <div className="text-center py-20 px-6 animate-fade-in">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-warm-100 to-warm-50 flex items-center justify-center">
        <IconSearch size={32} className="text-warm-400" />
      </div>
      <h3 className="text-[17px] font-semibold text-warm-900 tracking-tight mb-2">
        No results found
      </h3>
      <p className="text-sm leading-relaxed text-warm-500 mb-4 max-w-sm mx-auto">
        {query ? (
          <>No matches for &quot;{query}&quot;</>
        ) : (
          <>No items match your current filters</>
        )}
      </p>
      {filters && filters.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {filters.map((filter, i) => (
            <span key={i} className="px-2 py-1 text-xs bg-warm-100 text-warm-600 rounded-full">
              {filter}
            </span>
          ))}
        </div>
      )}
      {onClearFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="text-sm leading-relaxed text-warm-600 hover:text-warm-900 underline underline-offset-2"
        >
          Clear all filters
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Legacy Compatibility Exports
// ============================================================================

// Card wrapper (now just uses variant="card")
export type EmptyStateCardProps = EmptyStateProps;

export function EmptyStateCard(props: EmptyStateCardProps) {
  return <EmptyState {...props} variant="card" glass />;
}
