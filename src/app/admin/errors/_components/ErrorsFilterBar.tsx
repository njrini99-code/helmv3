'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, X } from 'lucide-react';
import { FilterPill } from '@/components/fairway';
import { cn } from '@/lib/utils';

/**
 * The Incidents page's filters, grouped and labelled.
 *
 * This replaced a single flat row of twenty-odd pills reading `sport: golf`,
 * `kind: integrity_ok`, `window: 168` — the URL parameter names, rendered as
 * chrome. An operator had to know the query string to use the page. Each
 * group now says what it narrows and offers an explicit "All" so the resting
 * state is visible, not implied by the absence of a highlight.
 *
 * COLLAPSED BY DEFAULT, OPEN WHEN SOMETHING IS ACTIVE. Five rows of pills is
 * exactly the top-of-screen chrome the mobile rules cut; the incident list is
 * what the page is for. The summary line always shows what is active and how
 * to clear it, so a filter can never be forgotten inside a closed panel.
 *
 * Every option carries a server-computed href — the page owns the URL shape,
 * and a filter state is a bookmarkable, shareable thing. The pills push those
 * hrefs through the router so the rest of the page re-renders in place.
 */

export interface FilterOption {
  value: string;
  label: string;
  href: string;
  selected: boolean;
  /** Hover text explaining what the option means, when a label cannot. */
  description?: string;
}

export interface FilterGroup {
  param: string;
  label: string;
  /** One line under the label saying what this group narrows. */
  hint: string;
  options: readonly FilterOption[];
}

export interface ActiveFilter {
  param: string;
  label: string;
  value: string;
  clearHref: string;
}

export function ErrorsFilterBar({
  groups,
  active,
  clearAllHref,
}: {
  groups: readonly FilterGroup[];
  active: readonly ActiveFilter[];
  clearAllHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(active.length > 0);

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group rounded-fw-md border border-warm-200 bg-surface"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1.5 text-body-sm font-semibold text-warm-900">
          <ChevronRight size={14} aria-hidden className="transition-transform group-open:rotate-90 motion-reduce:transition-none" />
          Filters
        </span>
        <span className="font-fw-mono text-caption tabular-nums text-warm-500">
          {active.length === 0 ? 'none active' : `${active.length} active`}
        </span>
        {active.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
            {active.map((filter) => (
              <Link
                key={`${filter.param}:${filter.value}`}
                href={filter.clearHref}
                onClick={(event) => event.stopPropagation()}
                aria-label={`Clear ${filter.label}: ${filter.value}`}
                className="inline-flex min-h-8 items-center gap-1 rounded-full bg-warm-900 px-2.5 text-caption text-warm-50 hover:bg-warm-800"
              >
                <span className="text-warm-300">{filter.label}</span>
                <span className="font-medium">{filter.value}</span>
                <X size={11} aria-hidden />
              </Link>
            ))}
            <Link
              href={clearAllHref}
              onClick={(event) => event.stopPropagation()}
              className="text-caption text-accent-700 underline"
            >
              Clear all
            </Link>
          </span>
        ) : null}
      </summary>

      <div className="space-y-3 border-t border-warm-200 px-3 py-3">
        {groups.map((group) => (
          <div key={group.param} className="grid gap-1.5 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-4" role="group" aria-label={group.label}>
            <div className="min-w-0">
              <p className="text-body-sm font-medium text-warm-800">{group.label}</p>
              <p className="text-caption leading-4 text-warm-500">{group.hint}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {group.options.map((option) => (
                <FilterPill
                  key={option.value}
                  size="sm"
                  showCheck={false}
                  selected={option.selected}
                  title={option.description}
                  onClick={() => router.push(option.href)}
                  className={cn(option.selected && 'font-semibold')}
                >
                  {option.label}
                </FilterPill>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
