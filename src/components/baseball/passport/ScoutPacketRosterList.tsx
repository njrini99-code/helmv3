'use client';

// =============================================================================
// src/components/baseball/passport/ScoutPacketRosterList.tsx
//
// V5 Scout Packet — the Showcase "event roster -> scout packet" list, composed
// from the "Living Annual" kit (War Room lane, clay `ink="pursuit"`). A coach
// scans the roster, sees each player's exposure + live-link status at a glance,
// and jumps straight into managing a player's packet.
//
// Honest density: exposure + live-link count are the two facts that decide a
// player's recruiting-share readiness, so they lead each row via the same
// honest 3-state chip as before (now an `<InkBadge>`). No fabricated status —
// `<PacketSeal>` (the wax "ISSUED" ceremony) only ever renders on a row that
// genuinely has a live share link; it never marks a merely-exposed or
// internal-only player as issued.
// =============================================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { IconSearch, IconShieldCheck, IconLock, IconChevronRight } from '@/components/icons';
import type { ScoutPacketRosterEntry } from '@/app/baseball/actions/scout-packet';
import { Button } from '@/components/fairway';
import { Input } from '@/components/ui/input';
import {
  PaperCard,
  HairlineRule,
  Eyebrow,
  InkBadge,
  PacketSeal,
  EditorsLetter,
  EmptyIssue,
  Reveal,
  HoverReveal,
  pressableClass,
} from '@/components/baseball/living-annual';

interface Props {
  entries: ScoutPacketRosterEntry[];
}

type Filter = 'all' | 'exposed' | 'shared';

export function ScoutPacketRosterList({ entries }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter === 'exposed' && !e.exposed) return false;
      if (filter === 'shared' && e.liveLinkCount === 0) return false;
      if (q && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, query, filter]);

  const exposedCount = entries.filter((e) => e.exposed).length;
  const sharedCount = entries.filter((e) => e.liveLinkCount > 0).length;

  const isFiltered = filter !== 'all' || query.trim().length > 0;

  return (
    <div>
      {/* Summary chips — filter tabs, clay ink for the active state */}
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter scout packets">
        {(
          [
            { key: 'all', label: `All · ${entries.length}` },
            { key: 'exposed', label: `Exposed · ${exposedCount}` },
            { key: 'shared', label: `Shared · ${sharedCount}` },
          ] as Array<{ key: Filter; label: string }>
        ).map((f) => (
          <Button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            variant={filter === f.key ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <IconSearch
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        <label htmlFor="scout-packet-search" className="sr-only">
          Search players
        </label>
        <Input
          id="scout-packet-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players"
          className="w-full rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] py-2.5 pl-9 pr-3 font-annual text-body-sm text-text-primary placeholder:text-text-tertiary focus:border-pursuit focus:outline-none focus:ring-2 focus:ring-pursuit/20"
        />
      </div>

      {filtered.length === 0 ? (
        entries.length === 0 ? (
          <EmptyIssue
            variant="roster"
            ink="pursuit"
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href="/baseball/dashboard/roster">Go to Roster</Link>
              </Button>
            }
          />
        ) : (
          <EditorsLetter
            ink="pursuit"
            title="No players match this filter."
            body="Try a different filter or clear your search."
          />
        )
      ) : (
        <PaperCard className="overflow-hidden p-0">
          <ul>
            {filtered.map((e, idx) => (
              <li key={e.playerId}>
                <Reveal staggerIndex={Math.min(idx, 10)}>
                  <Link
                    href={`/baseball/dashboard/players/${e.playerId}/scout-packet`}
                    className={pressableClass({ ink: 'pursuit', className: 'block' })}
                  >
                    <HoverReveal
                      className="flex items-center gap-3 px-4 py-3"
                      revealClassName="flex w-4 shrink-0 justify-center"
                      reveal={<IconChevronRight size={16} className="text-pursuit" aria-hidden />}
                    >
                      {e.liveLinkCount > 0 ? (
                        <PacketSeal size="sm" className="shrink-0" />
                      ) : (
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-fw-md ${
                            e.exposed ? 'bg-pursuit/10 text-pursuit' : 'bg-[color:var(--hairline)]/40 text-text-tertiary'
                          }`}
                        >
                          {e.exposed ? <IconShieldCheck size={16} /> : <IconLock size={16} />}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-annual text-body-lg font-medium text-text-primary">
                          {e.name}
                        </p>
                        <Eyebrow ink="muted">
                          {[e.position, e.gradYear ? `Class of ${e.gradYear}` : null]
                            .filter(Boolean)
                            .join(' · ') || 'No position on file'}
                        </Eyebrow>
                      </div>
                      <div className="shrink-0">
                        {e.liveLinkCount > 0 ? (
                          <InkBadge label={`${e.liveLinkCount} LIVE`} tone="sodium" />
                        ) : e.exposed ? (
                          <InkBadge label="Ready to share" tone="pursuit" />
                        ) : (
                          <InkBadge label="Internal" tone="neutral" />
                        )}
                      </div>
                    </HoverReveal>
                  </Link>
                  <HairlineRule ink="hairline" />
                </Reveal>
              </li>
            ))}
          </ul>
        </PaperCard>
      )}

      {isFiltered && filtered.length > 0 && filtered.length < entries.length ? (
        <p className="mt-3 text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
          Showing {filtered.length} of {entries.length}
        </p>
      ) : null}
    </div>
  );
}
