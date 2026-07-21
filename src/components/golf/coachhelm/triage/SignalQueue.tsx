'use client';

/**
 * ============================================================================
 * SignalQueue — the triage master pane (Triage Desk spec §3)
 * ----------------------------------------------------------------------------
 * Filter chips (All / Urgent / New / Patterns / per-category) above a queue
 * grouped by player — collapsible groups, a pinned "Team" group first when
 * team-level signals exist, ordered by attention score. Rows are keyboard
 * navigable (Up/Down moves focus + selection across every VISIBLE row, i.e.
 * respecting both the active filter and any collapsed groups).
 * ========================================================================== */

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, EmptyState, PressTarget } from '@/components/fairway';
import type { SignalGroup } from '@/lib/coachhelm/signal-grouping';
import { SeverityChip } from './SignalRow';
import { SignalRow } from './SignalRow';
import {
  BASE_QUEUE_FILTERS,
  countForFilter,
  formatCategoryLabel,
  type QueueFilterKey,
} from './buildTriageViewModel';

export interface SignalQueueProps {
  /** Already filtered by the active chip (worst-first, Team pinned first). */
  groups: SignalGroup[];
  /** The FULL, unfiltered group list — chip trailing counts read against it
   *  so switching filters never shows a stale count from the prior chip. */
  allGroups: SignalGroup[];
  categories: string[];
  filter: QueueFilterKey;
  filterHref: (filter: QueueFilterKey) => string;
  selectedSignalId: string | null;
  onSelectSignal: (id: string) => void;
  signalHref: (id: string) => string;
}

function groupKey(group: SignalGroup): string {
  return group.playerId ?? '__team__';
}

export function SignalQueue({
  groups,
  allGroups,
  categories,
  filter,
  filterHref,
  selectedSignalId,
  onSelectSignal,
  signalHref,
}: SignalQueueProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const chips = useMemo(
    () => [
      ...BASE_QUEUE_FILTERS,
      ...categories.map((category) => ({
        key: `category:${category}` as QueueFilterKey,
        label: formatCategoryLabel(category),
      })),
    ],
    [categories],
  );

  // Reset each render — repopulated below as rows mount, in visible (DOM)
  // order, so arrow-key nav always walks what's actually on screen.
  const rowRefs = useRef<HTMLAnchorElement[]>([]);
  rowRefs.current = [];

  // The roving tab stop when nothing is selected yet (first load, before a
  // URL `signal`/mouse pick) — the first row that will actually render,
  // respecting collapsed groups, so Tab always reaches exactly one row.
  const firstVisibleRowId = useMemo(() => {
    for (const group of groups) {
      if (collapsed.has(groupKey(group))) continue;
      const first = group.signals[0];
      if (first) return first.id;
    }
    return null;
  }, [groups, collapsed]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const rows = rowRefs.current;
    if (rows.length === 0) return;
    const activeIndex = rows.findIndex((el) => el === document.activeElement);
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = activeIndex === -1 ? 0 : Math.min(Math.max(activeIndex + delta, 0), rows.length - 1);
    const next = rows[nextIndex];
    if (!next) return;
    next.focus();
    const id = next.dataset.signalId;
    if (id) onSelectSignal(id);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={filterHref(chip.key)}
            replace
            scroll={false}
            aria-current={filter === chip.key ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-[30px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3',
              'font-fw-sans text-caption font-medium outline-none transition-colors',
              'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2',
              filter === chip.key
                ? 'border-accent-500 bg-accent-50 text-accent-700'
                : 'border-border-subtle bg-surface text-text-secondary hover:bg-surface-tint hover:text-text-primary',
            )}
          >
            <span>{chip.label}</span>
            <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-surface-sunken px-1 font-fw-mono text-eyebrow tabular-nums">
              {countForFilter(allGroups, chip.key)}
            </span>
          </Link>
        ))}
      </div>

      <div
        role="listbox"
        aria-label="Signals queue"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto rounded-fw-lg border border-border-subtle bg-surface p-2"
      >
        {groups.length === 0 ? (
          <div className="p-4">
            <EmptyState
              variant="subtle"
              title="Nothing here"
              description="No signals match this filter right now."
            />
          </div>
        ) : (
          groups.map((group) => {
            const key = groupKey(group);
            const isCollapsed = collapsed.has(key);
            return (
              <div key={key}>
                <PressTarget
                  onClick={() => toggleCollapsed(key)}
                  aria-expanded={!isCollapsed}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-fw-sm px-2 py-2',
                    'font-fw-sans text-body-sm font-semibold text-text-primary hover:bg-surface-sunken',
                  )}
                >
                  <span className="truncate">{group.playerName}</span>
                  <span className="flex flex-shrink-0 items-center gap-2">
                    <Badge tone="neutral" size="sm" numeric>
                      {group.signals.length}
                    </Badge>
                    <SeverityChip severity={group.worstSeverity} />
                    <ChevronDown
                      className={cn('h-4 w-4 text-text-tertiary transition-transform', isCollapsed && '-rotate-90')}
                      aria-hidden="true"
                    />
                  </span>
                </PressTarget>
                {!isCollapsed ? (
                  <div className="flex flex-col gap-0.5 pb-1">
                    {group.signals.map((signal) => (
                      <SignalRow
                        key={signal.id}
                        ref={(el) => {
                          if (el) rowRefs.current.push(el);
                        }}
                        signal={signal}
                        selected={signal.id === selectedSignalId}
                        tabbable={selectedSignalId ? signal.id === selectedSignalId : signal.id === firstVisibleRowId}
                        href={signalHref(signal.id)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
