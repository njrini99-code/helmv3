'use client';

/**
 * A proper roster picker for compare: a sheet with a search field and one
 * 44pt radio row per player. The player already in the other slot is shown
 * but not selectable. Choosing commits a selection haptic and closes.
 */

import * as React from 'react';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { cn } from '@/lib/utils';
import { fwHaptic } from '@/lib/fairway/haptics';

export interface PickerPlayer {
  id: string;
  name: string;
}

export interface PlayerPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  roster: readonly PickerPlayer[];
  selectedId: string | null;
  /** The player in the other slot: listed, not selectable. */
  takenId: string | null;
  onPick: (id: string) => void;
}

export function PlayerPickerSheet({ open, onOpenChange, title, roster, selectedId, takenId, onPick }: PlayerPickerSheetProps) {
  const [query, setQuery] = React.useState('');
  const q = query.trim().toLowerCase();
  const list = React.useMemo(
    () =>
      [...roster]
        .sort((x, y) => x.name.localeCompare(y.name))
        .filter((p) => (q ? p.name.toLowerCase().includes(q) : true)),
    [roster, q],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} data-slot="genome-player-picker">
      <div className="flex flex-col gap-3 pb-2">
        <label className="sr-only" htmlFor="genome-picker-search">
          Search players
        </label>
        {/* eslint-disable-next-line helm/no-raw-input -- sheet-local search field on the Fairway sunken-field style; no form, no validation */}
        <input
          id="genome-picker-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          enterKeyHint="search"
          autoComplete="off"
          className="h-11 w-full rounded-fw-md border border-border-subtle bg-surface-sunken px-3 font-fw-sans text-body text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none"
        />
        <div role="radiogroup" aria-label={title} className="flex flex-col border-t border-border-subtle">
          {list.length === 0 ? (
            <p className="py-4 font-fw-sans text-body-sm text-text-tertiary">No player matches &ldquo;{query}&rdquo;.</p>
          ) : (
            list.map((p) => {
              const selected = p.id === selectedId;
              const taken = p.id === takenId;
              return (
                // eslint-disable-next-line helm/no-raw-button -- a full-width radio row in the roster list
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={taken}
                  onClick={() => {
                    if (!selected) fwHaptic('selection');
                    onPick(p.id);
                  }}
                  className={cn(
                    'flex min-h-12 items-center justify-between gap-3 border-b border-border-subtle px-1 text-left transition-colors duration-150',
                    'active:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus',
                    taken && 'opacity-50',
                  )}
                >
                  <span className="font-fw-sans text-body text-text-primary">{p.name}</span>
                  <span className="font-fw-sans text-body-sm text-text-tertiary">
                    {taken ? 'In the other slot' : selected ? <CheckGlyph /> : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </Sheet>
  );
}

function CheckGlyph() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" className="text-accent-700">
      <path d="M3.5 9.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
