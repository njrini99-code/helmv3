'use client';

import { cn } from '@/lib/utils';

type AdminTab = 'overview' | 'people' | 'system' | 'intelligence' | 'tracer';

interface CrossTabLinkProps {
  tab: AdminTab;
  label: string;
  filter?: string;
  className?: string;
  onNavigateTab?: (tab: AdminTab, filter?: string) => void;
}

export function CrossTabLink({
  tab,
  label,
  filter,
  className,
  onNavigateTab,
}: CrossTabLinkProps) {
  return (
    <button
      type="button"
      onClick={() => onNavigateTab?.(tab, filter)}
      className={cn(
        'inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700',
        'underline underline-offset-2 decoration-primary-300 hover:decoration-primary-500',
        'transition-colors duration-150 cursor-pointer',
        className
      )}
    >
      {label}
      <svg
        className="w-3.5 h-3.5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
        />
      </svg>
    </button>
  );
}
