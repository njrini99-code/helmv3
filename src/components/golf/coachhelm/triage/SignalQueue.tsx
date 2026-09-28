'use client';

/**
 * ============================================================================
 * SignalQueue — The Lab's master pane
 * ----------------------------------------------------------------------------
 * Filter chips (All / Urgent / Patterns / per-category) above a queue grouped
 * by player: collapsible groups, the Team group pinned first when roster
 * roll-ups exist, then players by attention score. Rows are keyboard
 * navigable (Up/Down moves focus + selection across every VISIBLE row,
 * respecting both the active filter and any collapsed groups).
 *
 * Chrome: the deep-green card plinth every CoachHelm card uses. The active
 * chip is the solid green pill with a cream label (the same "selected"
 * language as the Segmented toggle), never a green wash with green text.
 * On a phone the chips scroll sideways in one row rather than stacking into
 * a wall above the list.
 * ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, EmptyState, PressTarget } from '@/components/fairway';
import { useScrollFade } from '@/lib/fairway/use-scroll-fade';
import type { SignalGroup } from '@/lib/coachhelm/signal-grouping';
import { SeverityChip, SignalRow } from './SignalRow';
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
  onSelectFilter: (filter: QueueFilterKey) => void;
  selectedSignalId: string | null;
  onSelectSignal: (id: string) => void;
  signalHref: (id: string) => string;
  /**
   * The signal the coach just closed (Back from its dossier). Its row is
   * scrolled back into view and briefly highlighted, so returning to the
   * queue lands where they left it (MOT-19).
   */
  returnSignalId?: string | null;
  /** Player portraits for the group headers; a missing id falls back to
   *  initials. */
  avatarByPlayerId?: Readonly<Record<string, string | null>>;
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
  onSelectFilter,
  selectedSignalId,
  onSelectSignal,
  signalHref,
  returnSignalId = null,
  avatarByPlayerId,
}: SignalQueueProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const queueRef = useRef<HTMLElement>(null);
  const { ref: chipsRef, fadeStyle: chipsFade } = useScrollFade<HTMLElement>('x');

  useEffect(() => {
    if (!returnSignalId) return;
    const row = queueRef.current?.querySelector<HTMLElement>(`[data-signal-id="${CSS.escape(returnSignalId)}"]`);
    if (!row) return;
    row.scrollIntoView?.({ block: 'center' });
    row.dataset.returned = 'true';
    const timer = window.setTimeout(() => {
      delete row.dataset.returned;
    }, 900);
    return () => {
      window.clearTimeout(timer);
      delete row.dataset.returned;
    };
  }, [returnSignalId]);

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

  // The roving tab stop when nothing is selected yet: the first row that will
  // actually render, respecting collapsed groups.
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
    <section
      ref={queueRef}
      aria-label="Signal queue"
      className="flex flex-col overflow-hidden rounded-fw-lg border border-border-subtle bg-surface shadow-soft min-[940px]:h-full min-[940px]:min-h-0"
    >
      <div className="fw-plinth-green flex items-center justify-between gap-3 px-4 py-3 min-[940px]:shrink-0">
        <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">Signals</h2>
        <span className="font-fw-sans text-body-sm text-text-secondary">Worst first</span>
      </div>

      <nav
        ref={chipsRef}
        aria-label="Filter signals"
        style={chipsFade}
        className={cn(
          'flex gap-2 overflow-x-auto border-b border-border-subtle px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          'min-[940px]:shrink-0 min-[940px]:flex-wrap min-[940px]:overflow-visible',
        )}
      >
        {chips.map((chip) => {
          const active = filter === chip.key;
          return (
            <Link
              key={chip.key}
              href={filterHref(chip.key)}
              replace
              scroll={false}
              onClick={(event) => {
                if (
                  event.defaultPrevented ||
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                event.preventDefault();
                onSelectFilter(chip.key);
              }}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 [@media(pointer:coarse)]:min-h-[44px]',
                'font-fw-sans text-caption font-medium outline-none',
                'transition-[background-color,border-color,color] [transition-duration:var(--fw-dur-fast)]',
                'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                active
                  ? 'border-accent-fill bg-accent-fill text-text-on-accent-fill'
                  : 'border-border-subtle bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary',
              )}
            >
              <span>{chip.label}</span>
              <span className={cn('tabular-nums', active ? 'text-text-on-accent-fill' : 'text-text-tertiary')}>
                {countForFilter(allGroups, chip.key)}
              </span>
            </Link>
          );
        })}
      </nav>

      <div
        role="listbox"
        aria-label="Signals queue"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="flex flex-col gap-1 p-2 outline-none min-[940px]:min-h-0 min-[940px]:flex-1 min-[940px]:overflow-y-auto"
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
            const headerId = `signal-group-${key}`;
            // A listbox's children are options or groups: each player is a
            // named group of signal options, not a bare button (A11Y-R4).
            return (
              <div key={key} role="group" aria-labelledby={headerId} className="pb-1">
                <PressTarget
                  id={headerId}
                  onClick={() => toggleCollapsed(key)}
                  aria-expanded={!isCollapsed}
                  className="flex min-h-[48px] w-full items-center gap-2.5 rounded-fw-md px-2 py-1.5 text-left hover:bg-surface-sunken"
                >
                  {group.playerId ? (
                    <Avatar
                      src={avatarByPlayerId?.[group.playerId] ?? null}
                      name={group.playerName}
                      size="sm"
                      decorative
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface-sunken text-text-secondary"
                    >
                      <Users className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm font-semibold text-text-primary">
                    {group.playerName}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
                      {group.signals.length}
                    </span>
                    <SeverityChip severity={group.worstSeverity} />
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 text-text-tertiary transition-transform [transition-duration:var(--fw-dur-fast)]',
                        isCollapsed && '-rotate-90',
                      )}
                      aria-hidden="true"
                    />
                  </span>
                </PressTarget>
                {!isCollapsed ? (
                  <div className="flex flex-col gap-0.5 pl-2">
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
      </div>
    </section>
  );
}
