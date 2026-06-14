'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconGlobe } from '@/components/icons';
import type {
  ActivityWindow,
  DomainStats,
} from '@/app/golf/actions/resend-activity';
import { getDomainBreakdown } from '@/app/golf/actions/resend-activity';
import { formatRate, formatCount } from './shared';
import { Button } from '@/components/ui/button';

interface DomainBreakdownProps {
  window: ActivityWindow;
}

type SortKey = 'total' | 'delivered' | 'opened' | 'clicked' | 'bounced';

export function DomainBreakdown({ window }: DomainBreakdownProps) {
  const prefersReducedMotion = useReducedMotion();
  const [rows, setRows] = useState<DomainStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await getDomainBreakdown(window);
      if (cancelled) return;
      setRows(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [window]);

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const maxTotal = Math.max(...rows.map((r) => r.total), 1);

  if (loading) {
    return (
      <div className="glass-standard rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-warm-100/60">
          <div className="h-4 w-40 bg-warm-100 rounded animate-pulse" />
        </div>
        <div className="divide-y divide-warm-100/60">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="px-6 py-3 flex items-center gap-4 animate-pulse"
            >
              <div className="h-4 w-40 bg-warm-100 rounded" />
              <div className="h-2 flex-1 bg-warm-100 rounded" />
              <div className="h-4 w-12 bg-warm-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="glass-standard rounded-2xl py-16 flex flex-col items-center justify-center text-center">
        <div className="p-3 rounded-full bg-warm-100 mb-3">
          <IconGlobe size={20} className="text-warm-400" />
        </div>
        <p className="text-sm font-medium text-warm-700">No domain data yet</p>
        <p className="text-xs text-warm-500 mt-1 max-w-xs">
          Domain stats will appear once emails have been delivered.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-standard rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-warm-100/60">
        <p className="text-sm font-semibold text-warm-900">Recipient domains</p>
        <p className="text-xs text-warm-500 mt-0.5">
          Deliverability and engagement by recipient domain
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-warm-50/50 text-xs text-warm-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-6 py-2 font-medium">Domain</th>
              <SortableTh
                label="Total"
                k="total"
                current={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <SortableTh
                label="Delivery"
                k="delivered"
                current={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <SortableTh
                label="Open rate"
                k="opened"
                current={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <SortableTh
                label="Click rate"
                k="clicked"
                current={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <SortableTh
                label="Bounce"
                k="bounced"
                current={sortKey}
                dir={sortDir}
                onClick={toggleSort}
                align="right"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-100/60">
            {sorted.map((row, i) => {
              const deliveryRate = formatRate(row.delivered, row.total);
              const openRate = formatRate(row.opened, row.delivered);
              const clickRate = formatRate(row.clicked, row.delivered);
              const bounceRate = formatRate(row.bounced, row.total);
              const barPct = (row.total / maxTotal) * 100;
              const bounceAlert = row.total >= 10 && row.bounced / row.total > 0.05;

              return (
                <motion.tr
                  key={row.domain}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={prefersReducedMotion ? { duration: 0 } : ({ delay: i * 0.02, duration: 0.2 })}
                  className="hover:bg-white/70 transition-colors"
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <DomainFavicon domain={row.domain} />
                      <span className="font-medium text-warm-900">
                        {row.domain}
                      </span>
                      {bounceAlert && (
                        <span className="text-eyebrow font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-700 uppercase tracking-wide">
                          High bounce
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 h-1 bg-warm-100 rounded-full overflow-hidden w-48">
                      <div
                        className="h-full bg-primary-400 rounded-full"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-warm-900 font-medium">
                    {formatCount(row.total)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="tabular-nums text-warm-900">{deliveryRate}</div>
                    <div className="text-eyebrow text-warm-500 tabular-nums">
                      {formatCount(row.delivered)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="tabular-nums text-warm-900">{openRate}</div>
                    <div className="text-eyebrow text-warm-500 tabular-nums">
                      {formatCount(row.opened)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="tabular-nums text-warm-900">{clickRate}</div>
                    <div className="text-eyebrow text-warm-500 tabular-nums">
                      {formatCount(row.clicked)}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div
                      className={cn(
                        'tabular-nums font-medium',
                        row.bounced > 0 ? 'text-red-600' : 'text-warm-400'
                      )}
                    >
                      {bounceRate}
                    </div>
                    <div className="text-eyebrow text-warm-500 tabular-nums">
                      {formatCount(row.bounced)}
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable column header
// ---------------------------------------------------------------------------
function SortableTh({
  label,
  k,
  current,
  dir,
  onClick,
  align = 'left',
}: {
  label: string;
  k: SortKey;
  current: SortKey;
  dir: 'asc' | 'desc';
  onClick: (k: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = k === current;
  return (
    <th
      className={cn(
        'py-2 font-medium',
        align === 'right' ? 'text-right pr-6 pl-4' : 'text-left pl-6 pr-4'
      )}
    >
      <Button variant="ghost"
        onClick={() => onClick(k)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-warm-900 transition-colors',
          active && 'text-warm-900'
        )}
      >
        {label}
        <span
          className={cn(
            'text-eyebrow transition-opacity',
            active ? 'opacity-100' : 'opacity-0'
          )}
        >
          {dir === 'desc' ? '▼' : '▲'}
        </span>
      </Button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Domain favicon (Google's free favicon service)
// ---------------------------------------------------------------------------
function DomainFavicon({ domain }: { domain: string }) {
  const [errored, setErrored] = useState(false);

  // Generate a deterministic background color from domain hash for fallback
  const hash = Array.from(domain).reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
  const bgIndex = Math.abs(hash) % 6;
  const bgClasses = [
    'bg-blue-100 text-blue-700',
    'bg-primary-100 text-primary-700',
    'bg-violet-100 text-violet-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
  ];

  if (errored) {
    return (
      <div
        className={cn(
          'w-5 h-5 rounded flex items-center justify-center text-eyebrow font-semibold shrink-0',
          bgClasses[bgIndex]
        )}
      >
        {domain.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt=""
      width={16}
      height={16}
      className="w-4 h-4 rounded-sm shrink-0"
      onError={() => setErrored(true)}
    />
  );
}
