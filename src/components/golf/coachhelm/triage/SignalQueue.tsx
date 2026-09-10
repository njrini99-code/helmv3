'use client';

/**
 * ============================================================================
 * SignalQueue — the Signals workspace's queue pane (Triage Desk spec §3)
 * ----------------------------------------------------------------------------
 * Dense rows grouped by player — collapsible groups, a pinned "Team" group
 * first when team-level signals exist, ordered by attention score. Rows are
 * keyboard navigable (Up/Down moves focus + selection across every VISIBLE
 * row, i.e. respecting both the active filter and any collapsed groups).
 *
 * Severity/Category filtering now lives in the workspace `Toolbar` (facelift,
 * 2026-09) — this pane is purely the rows-renderer over whatever `groups` its
 * caller already filtered, and no longer owns a chip row of its own.
 *
 * Windowed rendering: a queue can run into the hundreds of signals across a
 * full roster, and rendering every row unconditionally would put that many
 * DOM nodes on screen at once. Rows render capped to a page at a time (a
 * "Show more" control reveals the next page) — except the row a `?signal=`
 * deep link (or the current selection) points at, which is always kept
 * reachable even past the page boundary, so an honest cap never orphans a
 * valid selection.
 * ========================================================================== */

import { useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, Button, EmptyState, PressTarget } from '@/components/fairway';
import { ScrollArea } from '@/components/fairway/surfaces/scroll-area';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
import { SeverityChip } from './SignalRow';
import { SignalRow } from './SignalRow';

export interface SignalQueueProps {
  /** Already filtered by the active Toolbar facets (worst-first, Team pinned first). */
  groups: SignalGroup[];
  selectedSignalId: string | null;
  onSelectSignal: (id: string) => void;
  signalHref: (id: string) => string;
  /**
   * True when the ENTIRE team queue (unfiltered) is empty — a genuine
   * all-clear, distinct from a Toolbar facet narrowing the visible set to
   * zero. Swaps the honest "no matches" copy for the all-clear state +
   * Scan team CTA (Triage Desk spec — "no signals" state).
   */
  isAllClear?: boolean;
  onScan?: () => void;
  scanning?: boolean;
}

const DEFAULT_PAGE_SIZE = 40;

function groupKey(group: SignalGroup): string {
  return group.playerId ?? '__team__';
}

export function SignalQueue({
  groups,
  selectedSignalId,
  onSelectSignal,
  signalHref,
  isAllClear = false,
  onScan,
  scanning = false,
}: SignalQueueProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [expandedCount, setExpandedCount] = useState(DEFAULT_PAGE_SIZE);

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Reset each render — repopulated below as rows mount, in visible (DOM)
  // order, so arrow-key nav always walks what's actually on screen.
  const rowRefs = useRef<HTMLAnchorElement[]>([]);
  rowRefs.current = [];

  // Flattened, in visible (non-collapsed-group) order — the list the
  // windowing cap and the roving tab stop both operate against.
  const visibleSignals = useMemo(() => {
    const list: { group: SignalGroup; signal: GroupedSignal }[] = [];
    for (const group of groups) {
      if (collapsed.has(groupKey(group))) continue;
      for (const signal of group.signals) list.push({ group, signal });
    }
    return list;
  }, [groups, collapsed]);

  const firstVisibleRowId = visibleSignals[0]?.signal.id ?? null;

  const selectedIndex = selectedSignalId
    ? visibleSignals.findIndex((entry) => entry.signal.id === selectedSignalId)
    : -1;
  // Never orphan a valid selection/deep-link behind the page boundary.
  const cap = selectedIndex >= 0 ? Math.max(expandedCount, selectedIndex + 1) : expandedCount;
  const hiddenCount = Math.max(0, visibleSignals.length - cap);

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

  let shown = 0;

  return (
    <div className="flex flex-col gap-3 min-[940px]:h-full min-[940px]:min-h-0">
      <ScrollArea
        role="listbox"
        aria-label="Signals queue"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="rounded-fw-lg border border-border-subtle bg-surface min-[940px]:h-full min-[940px]:min-h-0"
        viewportClassName="max-h-[70vh] p-2 min-[940px]:max-h-none"
      >
        {groups.length === 0 ? (
          <div className="p-4">
            {isAllClear ? (
              <EmptyState
                variant="subtle"
                title="Nothing needs you right now"
                description="The team is all caught up. Run a scan to check for new signals."
                action={
                  onScan ? (
                    <Button variant="secondary" size="sm" busy={scanning} disabled={scanning} onClick={onScan}>
                      {scanning ? 'Scanning…' : 'Scan team'}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <EmptyState
                variant="subtle"
                title="Nothing here"
                description="No signals match this filter right now."
              />
            )}
          </div>
        ) : (
          groups.map((group) => {
            const key = groupKey(group);
            const isCollapsed = collapsed.has(key);
            let rowsForGroup: GroupedSignal[] = [];
            if (!isCollapsed) {
              const remaining = Math.max(0, cap - shown);
              rowsForGroup = group.signals.slice(0, remaining);
              shown += rowsForGroup.length;
            }
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
                    {rowsForGroup.map((signal) => (
                      <SignalRow
                        key={signal.id}
                        ref={(el) => {
                          if (el) rowRefs.current.push(el);
                        }}
                        signal={signal}
                        selected={signal.id === selectedSignalId}
                        tabbable={selectedSignalId ? signal.id === selectedSignalId : signal.id === firstVisibleRowId}
                        href={signalHref(signal.id)}
                        onSelect={() => onSelectSignal(signal.id)}
                        subjectName={group.playerName}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
        {hiddenCount > 0 ? (
          <div className="p-2">
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              onClick={() => setExpandedCount((n) => n + DEFAULT_PAGE_SIZE)}
            >
              Show {Math.min(hiddenCount, DEFAULT_PAGE_SIZE)} more
            </Button>
          </div>
        ) : null}
      </ScrollArea>
    </div>
  );
}
