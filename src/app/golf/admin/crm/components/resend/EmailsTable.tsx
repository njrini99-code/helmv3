'use client';

import { useEffect, useState, useTransition, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconX,
  IconMail,
} from '@/components/icons';
import type {
  EmailRow,
  EmailsListFilters,
} from '@/app/golf/actions/resend-activity';
import { getEmailsList } from '@/app/golf/actions/resend-activity';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  deriveStatus,
  STATUS_CONFIG,
  formatRelative,
  formatFullTimestamp,
} from './shared';
import { EmptyState as FairwayEmptyState } from '@/components/fairway';

type StatusFilter = NonNullable<EmailsListFilters['status']>;
type SourceFilter = NonNullable<EmailsListFilters['source']>;

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'opened', label: 'Opened' },
  { id: 'clicked', label: 'Clicked' },
  { id: 'pending', label: 'Pending' },
  { id: 'bounced', label: 'Bounced' },
  { id: 'complained', label: 'Complained' },
];

const SOURCE_OPTIONS: { id: SourceFilter; label: string }[] = [
  { id: 'all', label: 'All sources' },
  { id: 'crm', label: 'CRM' },
  { id: 'transactional', label: 'Transactional' },
];

interface EmailsTableProps {
  onSelectEmail?: (resendMessageId: string) => void;
  selectedMessageId?: string | null;
  since?: string; // ISO timestamp lower bound
}

export function EmailsTable({
  onSelectEmail,
  selectedMessageId,
  since,
}: EmailsTableProps) {
  const prefersReducedMotion = useReducedMotion();
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const [page, setPage] = useState(0);
  const [isPending, startTransition] = useTransition();

  const pageSize = 50;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to first page on filter change
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, status, source, since]);

  const fetchRows = useCallback(() => {
    startTransition(async () => {
      const { rows: data, count: total } = await getEmailsList({
        search: debouncedSearch || undefined,
        status,
        source,
        since,
        limit: pageSize,
        offset: page * pageSize,
      });
      setRows(data);
      setCount(total);
    });
  }, [debouncedSearch, status, source, since, page]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] overflow-hidden">
      {/* Filter bar */}
      <div className="px-6 py-4 border-b border-border-subtle/60 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <IconSearch
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
            />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subject, sender, or recipient..."
              className="w-full pl-9 pr-9 py-2 text-sm bg-surface border border-border-subtle rounded-fw-sm focus:outline-none focus:ring-2 focus:ring-border-focus/30 focus:border-accent-400 placeholder:text-text-tertiary min-h-0"
            />
            {search && (
              <IconButton variant="default"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-surface-sunken text-text-tertiary hover:text-text-secondary"
                aria-label="Clear search"
              >
                <IconX size={12} />
              </IconButton>
            )}
          </div>

          <Select
            value={source}
            onChange={(v) => setSource(v as SourceFilter)}
            options={SOURCE_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
            className="text-sm"
          />

          <span className="text-xs text-text-tertiary tabular-nums ml-auto">
            {count.toLocaleString()} email{count === 1 ? '' : 's'}
          </span>
        </div>

        {/* Status filter chips.
            `variant="ghost"`, NOT `primary`. These are filters, and only ONE is
            ever selected — with `primary` the six unselected chips each kept the
            variant's solid accent fill while the unselected branch below only
            set a text colour, so they rendered dark-green label on dark-green
            ground and could not be read. Only the selected chip looked right,
            because `bg-nav-bg` happened to override the fill. */}
        <div
          role="group"
          aria-label="Filter emails by delivery status"
          className="flex items-center gap-1 flex-wrap"
        >
          {STATUS_TABS.map((t) => (
            <Button variant="ghost"
              key={t.id}
              onClick={() => setStatus(t.id)}
              aria-pressed={status === t.id}
              className={cn(
                'text-xs font-medium px-2.5 py-1 rounded-fw-sm transition-colors',
                status === t.id
                  ? 'bg-nav-bg text-nav-text hover:bg-nav-bg'
                  : 'bg-transparent text-text-secondary hover:bg-surface-sunken'
              )}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="relative">
        {isPending && rows.length > 0 && (
          <div className="absolute inset-0 border border-border-subtle bg-surface-tint z-10 flex items-start justify-center pt-8 pointer-events-none">
            <div className="h-1 w-16 bg-accent-500 rounded-full animate-pulse" />
          </div>
        )}

        {rows.length === 0 ? (
          isPending ? (
            <TableSkeleton />
          ) : (
            <EmptyState hasFilters={Boolean(debouncedSearch) || status !== 'all' || source !== 'all'} />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken/60 text-xs text-text-tertiary uppercase tracking-wide">
                <tr>
                  <th className="text-left px-6 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">To</th>
                  <th className="text-left px-4 py-2 font-medium">Subject</th>
                  <th className="text-left px-4 py-2 font-medium">Source</th>
                  <th className="text-right px-6 py-2 font-medium">Last event</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/60">
                {rows.map((row) => {
                  const status = deriveStatus(row);
                  const cfg = STATUS_CONFIG[status];
                  const isSelected = row.resend_message_id === selectedMessageId;
                  const primaryTo = row.to_addresses?.[0] ?? '—';
                  const moreTo = (row.to_addresses?.length ?? 0) - 1;

                  return (
                    <motion.tr
                      key={row.resend_message_id}
                      initial={prefersReducedMotion ? false : ({ opacity: 0 })}
                      animate={{ opacity: 1 }}
                      className={cn(
                        'group cursor-pointer transition-colors',
                        isSelected
                          ? 'bg-accent-50/60'
                          : 'hover:bg-surface-tint'
                      )}
                      onClick={() => onSelectEmail?.(row.resend_message_id)}
                    >
                      <td className="px-6 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                            cfg.bgColor,
                            cfg.color
                          )}
                        >
                          {cfg.icon}
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-text-primary truncate max-w-[200px]">
                          {primaryTo}
                        </div>
                        {moreTo > 0 && (
                          <div className="text-eyebrow text-text-tertiary">
                            +{moreTo} more
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-text-primary truncate max-w-[360px]">
                          {row.subject || (
                            <span className="text-text-tertiary italic">
                              (no subject)
                            </span>
                          )}
                        </div>
                        {row.open_count + row.click_count > 0 && (
                          <div className="text-eyebrow text-text-tertiary mt-0.5 flex items-center gap-2">
                            {row.open_count > 0 && (
                              <span>{row.open_count} open{row.open_count === 1 ? '' : 's'}</span>
                            )}
                            {row.click_count > 0 && (
                              <span>{row.click_count} click{row.click_count === 1 ? '' : 's'}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'text-eyebrow font-medium px-1.5 py-0.5 rounded uppercase tracking-wide',
                            row.source === 'crm'
                              ? 'bg-surface-sunken text-text-secondary'
                              : row.source === 'transactional'
                                ? 'bg-surface-sunken text-text-secondary'
                                : 'bg-surface-sunken text-text-tertiary'
                          )}
                        >
                          {row.source}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span
                          className="text-text-secondary tabular-nums"
                          title={formatFullTimestamp(row.last_event_at)}
                        >
                          {formatRelative(row.last_event_at)}
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {count > pageSize && (
        <div className="px-6 py-3 border-t border-border-subtle/60 flex items-center justify-between">
          <p className="text-xs text-text-tertiary tabular-nums">
            Showing {page * pageSize + 1}–
            {Math.min((page + 1) * pageSize, count)} of {count.toLocaleString()}
          </p>
          <div className="flex items-center gap-1">
            <IconButton variant="default"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-fw-sm text-text-tertiary hover:text-text-primary hover:bg-surface-sunken disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <IconChevronLeft size={14} />
            </IconButton>
            <span className="text-xs text-text-secondary px-2 tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <IconButton variant="default"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-fw-sm text-text-tertiary hover:text-text-primary hover:bg-surface-sunken disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              <IconChevronRight size={14} />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton / empty
// ---------------------------------------------------------------------------
function TableSkeleton() {
  return (
    <div className="divide-y divide-border-subtle/60">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="px-6 py-3 flex items-center gap-4 animate-pulse">
          <div className="h-5 w-20 bg-surface-sunken rounded-full" />
          <div className="h-4 w-40 bg-surface-sunken rounded" />
          <div className="h-4 flex-1 bg-surface-sunken rounded" />
          <div className="h-4 w-16 bg-surface-sunken rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <FairwayEmptyState
      variant={hasFilters ? 'search' : 'subtle'}
      icon={<IconMail size={20} />}
      title={hasFilters ? 'No emails match your filters' : 'No emails yet'}
      description={
        hasFilters
          ? 'Try broadening your search or clearing filters.'
          : 'Emails tracked by Resend appear here.'
      }
    />
  );
}
