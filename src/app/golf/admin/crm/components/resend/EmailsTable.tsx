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
    <div className="glass-standard rounded-2xl overflow-hidden">
      {/* Filter bar */}
      <div className="px-6 py-4 border-b border-warm-100/60 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <IconSearch
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 pointer-events-none"
            />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subject, sender, or recipient..."
              className="w-full pl-9 pr-9 py-2 text-sm bg-cream-50 border border-warm-200/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 placeholder:text-warm-400 min-h-0"
            />
            {search && (
              <IconButton variant="default"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-warm-100 text-warm-400 hover:text-warm-700"
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

          <span className="text-xs text-warm-500 tabular-nums ml-auto">
            {count.toLocaleString()} email{count === 1 ? '' : 's'}
          </span>
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_TABS.map((t) => (
            <Button variant="primary"
              key={t.id}
              onClick={() => setStatus(t.id)}
              className={cn(
                'text-xs font-medium px-2.5 py-1 rounded-md transition-colors',
                status === t.id
                  ? 'bg-warm-900 text-white'
                  : 'text-warm-600 hover:bg-warm-100'
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
          <div className="absolute inset-0 glass-subtle z-10 flex items-start justify-center pt-8 pointer-events-none">
            <div className="h-1 w-16 bg-primary-500 rounded-full animate-pulse" />
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
              <thead className="bg-warm-50/50 text-xs text-warm-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-6 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">To</th>
                  <th className="text-left px-4 py-2 font-medium">Subject</th>
                  <th className="text-left px-4 py-2 font-medium">Source</th>
                  <th className="text-right px-6 py-2 font-medium">Last event</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-100/60">
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
                          ? 'bg-primary-50/60'
                          : 'hover:bg-cream-100'
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
                        <div className="text-warm-900 truncate max-w-[200px]">
                          {primaryTo}
                        </div>
                        {moreTo > 0 && (
                          <div className="text-eyebrow text-warm-500">
                            +{moreTo} more
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-warm-900 truncate max-w-[360px]">
                          {row.subject || (
                            <span className="text-warm-400 italic">
                              (no subject)
                            </span>
                          )}
                        </div>
                        {row.open_count + row.click_count > 0 && (
                          <div className="text-eyebrow text-warm-500 mt-0.5 flex items-center gap-2">
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
                              ? 'bg-blue-50 text-blue-700'
                              : row.source === 'transactional'
                                ? 'bg-warm-100 text-warm-700'
                                : 'bg-warm-50 text-warm-500'
                          )}
                        >
                          {row.source}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span
                          className="text-warm-600 tabular-nums"
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
        <div className="px-6 py-3 border-t border-warm-100/60 flex items-center justify-between">
          <p className="text-xs text-warm-500 tabular-nums">
            Showing {page * pageSize + 1}–
            {Math.min((page + 1) * pageSize, count)} of {count.toLocaleString()}
          </p>
          <div className="flex items-center gap-1">
            <IconButton variant="default"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-md text-warm-500 hover:text-warm-900 hover:bg-warm-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <IconChevronLeft size={14} />
            </IconButton>
            <span className="text-xs text-warm-600 px-2 tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <IconButton variant="default"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-md text-warm-500 hover:text-warm-900 hover:bg-warm-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
    <div className="divide-y divide-warm-100/60">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="px-6 py-3 flex items-center gap-4 animate-pulse">
          <div className="h-5 w-20 bg-warm-100 rounded-full" />
          <div className="h-4 w-40 bg-warm-100 rounded" />
          <div className="h-4 flex-1 bg-warm-100 rounded" />
          <div className="h-4 w-16 bg-warm-100 rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="py-16 flex flex-col items-center justify-center text-center">
      <div className="p-3 rounded-full bg-warm-100 mb-3">
        <IconMail size={20} className="text-warm-400" />
      </div>
      <p className="text-sm font-medium text-warm-700">
        {hasFilters ? 'No emails match your filters' : 'No emails yet'}
      </p>
      <p className="text-xs text-warm-500 mt-1 max-w-xs">
        {hasFilters
          ? 'Try broadening your search or clearing filters.'
          : 'Emails tracked by Resend will appear here.'}
      </p>
    </div>
  );
}
