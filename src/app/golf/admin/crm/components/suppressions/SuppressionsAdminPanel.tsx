'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  IconMail,
  IconPlus,
  IconShield,
} from '@/components/icons';
import {
  addSuppression,
  getSuppressions,
  removeSuppression,
} from '@/app/golf/actions/crm-foundations';
import type {
  EmailSuppression,
  SuppressionReason,
} from '@/app/golf/admin/crm/types/foundations';
import { SuppressionRow } from './SuppressionRow';

// ============================================================================
// SuppressionsAdminPanel — full-page admin surface for managing the
// crm_email_suppressions table.
// ============================================================================

const REASON_FILTERS: ReadonlyArray<{ value: SuppressionReason | 'all'; label: string }> = [
  { value: 'all', label: 'All reasons' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
  { value: 'hard_bounce', label: 'Hard bounce' },
  { value: 'complained', label: 'Complaint' },
  { value: 'manual', label: 'Manual' },
  { value: 'invalid', label: 'Invalid' },
];

const ADD_REASON_OPTIONS: ReadonlyArray<{ value: SuppressionReason; label: string }> = [
  { value: 'manual', label: 'Manual (admin)' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
  { value: 'hard_bounce', label: 'Hard bounce' },
  { value: 'complained', label: 'Complaint' },
  { value: 'invalid', label: 'Invalid' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SuppressionsAdminPanel() {
  const [rows, setRows] = useState<EmailSuppression[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SuppressionReason | 'all'>('all');
  const [search, setSearch] = useState('');

  // Add form
  const [newEmail, setNewEmail] = useState('');
  const [newReason, setNewReason] = useState<SuppressionReason>('manual');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getSuppressions();
      setRows(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suppressions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.reason !== filter) return false;
      if (q && !r.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) {
      c[r.reason] = (c[r.reason] ?? 0) + 1;
    }
    return c;
  }, [rows]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) {
      setAddError('Email is required');
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setAddError('Enter a valid email address');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const created = await addSuppression({ email, reason: newReason });
      setRows((prev) => [created, ...prev]);
      setNewEmail('');
      setNewReason('manual');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add suppression');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    await removeSuppression(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <IconShield size={18} className="text-red-600" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-warm-900">
              Email suppressions
            </h1>
            <p className="text-sm text-warm-500 mt-0.5 max-w-2xl">
              Addresses on this list will not receive any email from the
              platform. Suppressions are added automatically by Resend webhooks
              and can also be managed manually here.
            </p>
          </div>
        </div>
      </header>

      {/* Add form */}
      <section className="rounded-2xl border border-warm-200/60 bg-white p-4">
        <h2 className="text-sm font-semibold text-warm-900 mb-3 flex items-center gap-2">
          <IconPlus size={14} className="text-primary-600" />
          Add suppression
        </h2>
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
          <div className="relative">
            <IconMail
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 pointer-events-none"
            />
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
            />
          </div>
          <select
            value={newReason}
            onChange={(e) => setNewReason(e.target.value as SuppressionReason)}
            className="px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
          >
            {ADD_REASON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={adding || !newEmail.trim()}
            className={cn(
              'px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-colors',
              'bg-primary-600 text-white hover:bg-primary-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {adding ? 'Adding...' : 'Add'}
          </button>
        </form>
        {addError && (
          <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {addError}
          </p>
        )}
      </section>

      {/* Filter row */}
      <section className="rounded-2xl border border-warm-200/60 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-warm-100">
          <div className="flex items-center gap-1.5 flex-wrap">
            {REASON_FILTERS.map((opt) => {
              const isActive = filter === opt.value;
              const count = counts[opt.value] ?? 0;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    'inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors',
                    isActive
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-warm-700 border-warm-200/80 hover:border-warm-300',
                  )}
                >
                  {opt.label}
                  <span
                    className={cn(
                      'tabular-nums text-eyebrow',
                      isActive ? 'text-white/80' : 'text-warm-400',
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emails..."
            className="px-3 py-1.5 text-xs rounded-lg bg-white border border-warm-200/80 text-warm-900 placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 w-56"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-warm-50/60 skeleton-shimmer" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4">
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center mx-auto mb-2">
              <IconMail size={18} className="text-warm-400" />
            </div>
            <p className="text-sm font-medium text-warm-700">
              {rows.length === 0 ? 'No suppressions yet' : 'No matches'}
            </p>
            <p className="text-xs text-warm-500 mt-1">
              {rows.length === 0
                ? 'Resend webhooks will populate this list automatically.'
                : 'Try a different reason filter or search query.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-eyebrow font-semibold uppercase tracking-wider text-warm-500 border-b border-warm-100">
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Reason</th>
                  <th className="px-4 py-2.5">Source</th>
                  <th className="px-4 py-2.5">Suppressed</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <SuppressionRow
                    key={row.id}
                    row={row}
                    onRemove={handleRemove}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
