'use client';

import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// ============================================
// TYPES
// ============================================

export interface PillTab {
  label: string;
  value: string;
  href?: string;
  count?: number;
  icon?: React.ComponentType<{ className?: string }>;
}

interface PillTabsProps {
  tabs: PillTab[];
  activeTab?: string;
  onChange?: (value: string) => void;
  variant?: 'default' | 'compact';
  className?: string;
}

// ============================================
// COMPONENT
// ============================================

export function PillTabs({
  tabs,
  activeTab,
  onChange,
  variant = 'default',
  className,
}: PillTabsProps) {
  const pathname = usePathname();

  // If using href-based tabs, determine active from pathname
  const getIsActive = (tab: PillTab): boolean => {
    if (activeTab !== undefined) {
      return tab.value === activeTab;
    }
    if (tab.href) {
      return pathname === tab.href || pathname.startsWith(tab.href + '/');
    }
    return false;
  };

  const handleClick = (tab: PillTab) => {
    if (onChange && !tab.href) {
      onChange(tab.value);
    }
  };

  const isCompact = variant === 'compact';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5',
        'bg-warm-50 rounded-full p-1.5',
        'border border-warm-200',
        className
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = getIsActive(tab);
        const Icon = tab.icon;

        const baseClasses = cn(
          'inline-flex items-center justify-center gap-2',
          'rounded-full font-medium',
          'transition-all duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
          isCompact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
          isActive
            ? 'bg-white text-warm-900 shadow-sm'
            : 'text-warm-600 hover:text-warm-900 hover:bg-warm-100 active:bg-warm-200'
        );

        const content = (
          <>
            {Icon && <Icon className={isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
            <span>{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={cn(
                  'rounded-full font-semibold',
                  isCompact ? 'px-1.5 text-[10px]' : 'px-2 text-xs',
                  isActive
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-warm-200 text-warm-700'
                )}
              >
                {tab.count > 99 ? '99+' : tab.count}
              </span>
            )}
          </>
        );

        if (tab.href) {
          return (
            <Link
              key={tab.value}
              href={tab.href}
              className={baseClasses}
              role="tab"
              aria-selected={isActive}
            >
              {content}
            </Link>
          );
        }

        return (
          <button
            key={tab.value}
            onClick={() => handleClick(tab)}
            className={baseClasses}
            role="tab"
            aria-selected={isActive}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

// ============================================
// USAGE EXAMPLES
// ============================================

/*
// Example 1: Href-based tabs (for navigation)
<PillTabs
  tabs={[
    { label: 'Overview', value: 'overview', href: '/dashboard/overview' },
    { label: 'Stats', value: 'stats', href: '/dashboard/stats', count: 5 },
    { label: 'Videos', value: 'videos', href: '/dashboard/videos' },
  ]}
/>

// Example 2: State-based tabs (for switching views)
const [activeTab, setActiveTab] = useState('all');

<PillTabs
  tabs={[
    { label: 'All', value: 'all', count: 24 },
    { label: 'Active', value: 'active', count: 12 },
    { label: 'Archived', value: 'archived', count: 12 },
  ]}
  activeTab={activeTab}
  onChange={setActiveTab}
/>

// Example 3: With icons
import { HomeIcon, StatsIcon, VideoIcon } from 'lucide-react';

<PillTabs
  tabs={[
    { label: 'Home', value: 'home', icon: HomeIcon },
    { label: 'Stats', value: 'stats', icon: StatsIcon },
    { label: 'Videos', value: 'videos', icon: VideoIcon },
  ]}
/>

// Example 4: Compact variant
<PillTabs
  variant="compact"
  tabs={[
    { label: 'All', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Done', value: 'done' },
  ]}
/>
*/
