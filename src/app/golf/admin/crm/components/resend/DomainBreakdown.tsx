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
import { EmptyState, Surface } from '@/components/fairway';

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
      <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] overflow-hidden">
        <div className="px-6 py-4 border-b border-border-subtle/60">
          <div className="h-4 w-40 bg-surface-sunken rounded animate-pulse" />
        </div>
        <div className="divide-y divide-border-subtle/60">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="px-6 py-3 flex items-center gap-4 animate-pulse"
            >
              <div className="h-4 w-40 bg-surface-sunken rounded" />
              <div className="h-2 flex-1 bg-surface-sunken rounded" />
              <div className="h-4 w-12 bg-surface-sunken rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Surface padding="none">
        <EmptyState
          variant="subtle"
          icon={<IconGlobe size={20} />}
          title="No domain data yet"
          description="Domain stats appear once emails have been delivered."
        />
      </Surface>
    );
  }

  return (
    <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border-subtle/60">
        <p className="text-sm font-semibold text-text-primary">Recipient domains</p>
        <p className="text-xs text-text-tertiary mt-0.5">
          Deliverability and engagement by recipient domain
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken/60 text-xs text-text-tertiary uppercase tracking-wide">
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
          <tbody className="divide-y divide-border-subtle/60">
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
                  className="hover:bg-surface-tint transition-colors"
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <DomainFavicon domain={row.domain} />
                      <span className="font-medium text-text-primary">
                        {row.domain}
                      </span>
                      {bounceAlert && (
                        <span className="text-eyebrow font-semibold px-1.5 py-0.5 rounded bg-fw-danger-bg text-fw-danger-ink uppercase tracking-wide">
                          High bounce
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 h-1 bg-surface-sunken rounded-full overflow-hidden w-48">
                      <div
                        className="h-full bg-accent-500 rounded-full"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-primary font-medium">
                    {formatCount(row.total)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="tabular-nums text-text-primary">{deliveryRate}</div>
                    <div className="text-eyebrow text-text-tertiary tabular-nums">
                      {formatCount(row.delivered)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="tabular-nums text-text-primary">{openRate}</div>
                    <div className="text-eyebrow text-text-tertiary tabular-nums">
                      {formatCount(row.opened)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="tabular-nums text-text-primary">{clickRate}</div>
                    <div className="text-eyebrow text-text-tertiary tabular-nums">
                      {formatCount(row.clicked)}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div
                      className={cn(
                        'tabular-nums font-medium',
                        row.bounced > 0 ? 'text-fw-danger-ink' : 'text-text-tertiary'
                      )}
                    >
                      {bounceRate}
                    </div>
                    <div className="text-eyebrow text-text-tertiary tabular-nums">
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
          'inline-flex items-center gap-1 hover:text-text-primary transition-colors',
          active && 'text-text-primary'
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
    'bg-surface-sunken text-text-secondary',
    'bg-accent-100 text-accent-700',
    'bg-accent-100 text-fw-success-ink',
    'bg-fw-warning-bg text-fw-warning-ink',
    'bg-fw-danger-bg text-fw-danger-ink',
    'bg-surface-sunken text-text-secondary',
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
      className="w-4 h-4 rounded-fw-sm shrink-0"
      onError={() => setErrored(true)}
    />
  );
}
