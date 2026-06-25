'use client';

// =============================================================================
// src/components/baseball/passport/ScoutPacketRosterList.tsx
//
// V5 Scout Packet — the Showcase "event roster -> scout packet" list. A coach
// scans the roster, sees each player's exposure + live-link status at a glance,
// and jumps straight into managing a player's packet. This is the entry point
// the V5 Showcase variant calls for ("scout packet export · event roster").
//
// Honest density: exposure + live-link count are the two facts that decide a
// player's recruiting-share readiness, so they lead each row. No fabricated
// status. Cream/green primitives; no golf labels.
// =============================================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';

import {
  IconSearch,
  IconShieldCheck,
  IconLock,
  IconArrowRight,
  IconCheckCircle2,
} from '@/components/icons';
import type { ScoutPacketRosterEntry } from '@/app/baseball/actions/scout-packet';

interface Props {
  entries: ScoutPacketRosterEntry[];
}

type Filter = 'all' | 'exposed' | 'shared';

export function ScoutPacketRosterList({ entries }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const reduceMotion = useReducedMotion();

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

  return (
    <LazyMotion features={domAnimation} strict>
    <div>
      {/* Summary chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { key: 'all', label: `All · ${entries.length}` },
            { key: 'exposed', label: `Exposed · ${exposedCount}` },
            { key: 'shared', label: `Shared · ${sharedCount}` },
          ] as Array<{ key: Filter; label: string }>
        ).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-primary-600 text-white'
                : 'bg-cream-50 text-warm-600 ring-1 ring-warm-200 hover:bg-warm-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <IconSearch
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-warm-400"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players"
          className="w-full rounded-xl border border-warm-200 bg-cream-50 py-2.5 pl-9 pr-3 text-sm text-warm-900 placeholder:text-warm-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
      </div>

      {filtered.length === 0 ? (
        <m.p
          initial={reduceMotion ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl border border-dashed border-warm-200 bg-warm-50 px-4 py-6 text-center text-sm text-warm-500"
        >
          {entries.length === 0
            ? 'No players on the roster yet.'
            : 'No players match this filter.'}
        </m.p>
      ) : (
        <ul className="divide-y divide-warm-100 overflow-hidden rounded-2xl border border-warm-200 bg-cream-50 shadow-card">
          {filtered.map((e, idx) => (
            <m.li
              key={e.playerId}
              initial={reduceMotion ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18, delay: reduceMotion ? 0 : idx * 0.03 }}
            >
              <Link
                href={`/baseball/dashboard/players/${e.playerId}/scout-packet`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-cream-50"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    e.exposed ? 'bg-primary-50 text-primary-600' : 'bg-warm-100 text-warm-400'
                  }`}
                >
                  {e.exposed ? <IconShieldCheck size={16} /> : <IconLock size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-warm-900">{e.name}</p>
                  <p className="text-eyebrow text-warm-400">
                    {[e.position, e.gradYear ? `Class of ${e.gradYear}` : null]
                      .filter(Boolean)
                      .join(' · ') || 'No position on file'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {e.liveLinkCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-eyebrow font-semibold text-primary-700">
                      <IconCheckCircle2 size={11} />
                      {e.liveLinkCount} live
                    </span>
                  ) : e.exposed ? (
                    <span className="rounded-full bg-warm-100 px-2.5 py-1 text-eyebrow font-medium text-warm-500">
                      Ready to share
                    </span>
                  ) : (
                    <span className="rounded-full bg-warm-100 px-2.5 py-1 text-eyebrow font-medium text-warm-500">
                      Internal
                    </span>
                  )}
                  <IconArrowRight size={16} className="text-warm-300" />
                </div>
              </Link>
            </m.li>
          ))}
        </ul>
      )}
    </div>
    </LazyMotion>
  );
}
