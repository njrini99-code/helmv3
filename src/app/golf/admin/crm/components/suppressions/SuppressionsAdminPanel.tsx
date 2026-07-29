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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  CRM_CHOICE_GROUP_CLASS,
  CRM_PRIMARY_ACTION_CLASS,
  crmChoiceClass,
} from '../../page-contracts';

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
          <span className="w-10 h-10 rounded-fw-md bg-fw-danger-bg flex items-center justify-center flex-shrink-0">
            <IconShield size={18} className="text-fw-danger-ink" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-text-primary">
              Email suppressions
            </h2>
            <p className="text-sm text-text-tertiary mt-0.5 max-w-2xl">
              Addresses on this list will not receive any email from the
              platform. Suppressions are added automatically by Resend webhooks
              and can also be managed manually here.
            </p>
          </div>
        </div>
      </header>

      {/* Add form */}
      <section className="rounded-card border border-border-subtle bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <IconPlus size={14} className="text-accent-700" />
          Add suppression
        </h2>
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
          <div className="relative">
            <IconMail
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none z-10"
            />
            <Input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@example.com"
              className="min-h-11 pl-9 pr-3 py-2 text-sm"
            />
          </div>
          <Select
            options={ADD_REASON_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
            value={newReason}
            onChange={(value) => setNewReason(value as SuppressionReason)}
          />
          <Button
            variant="primary"
            type="submit"
            disabled={adding || !newEmail.trim()}
            className={CRM_PRIMARY_ACTION_CLASS}
          >
            {adding ? 'Adding...' : 'Add'}
          </Button>
        </form>
        {addError && (
          <p className="mt-2 text-xs text-fw-danger-ink bg-fw-danger-bg border border-fw-danger/25 rounded-fw-sm px-3 py-2">
            {addError}
          </p>
        )}
      </section>

      {/* Filter row */}
      <section className="rounded-card border border-border-subtle bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border-subtle">
          <div className={CRM_CHOICE_GROUP_CLASS}>
            {REASON_FILTERS.map((opt) => {
              const isActive = filter === opt.value;
              const count = counts[opt.value] ?? 0;
              return (
                <Button
                  variant="ghost"
                  key={opt.value}
                  type="button"
                  onClick={() => setFilter(opt.value)}
                  aria-pressed={isActive}
                  className={crmChoiceClass(isActive)}
                >
                  {opt.label}
                  <span
                    className={cn(
                      'tabular-nums text-eyebrow',
                      isActive ? 'text-accent-700' : 'text-text-tertiary',
                    )}
                  >
                    {count}
                  </span>
                </Button>
              );
            })}
          </div>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emails..."
            className="min-h-11 w-full px-3 py-1.5 text-xs sm:w-56"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded-fw-sm bg-surface-sunken/70 skeleton-shimmer" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4">
            <p className="text-sm text-fw-danger-ink bg-fw-danger-bg border border-fw-danger/25 rounded-fw-sm px-3 py-2">
              {error}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="w-10 h-10 rounded-fw-md bg-surface-sunken flex items-center justify-center mx-auto mb-2">
              <IconMail size={18} className="text-text-tertiary" />
            </div>
            <p className="text-sm font-medium text-text-secondary">
              {rows.length === 0 ? 'No suppressions yet' : 'No matches'}
            </p>
            <p className="text-xs text-text-tertiary mt-1">
              {rows.length === 0
                ? 'Resend webhooks will populate this list automatically.'
                : 'Try a different reason filter or search query.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-eyebrow font-semibold uppercase tracking-wider text-text-tertiary border-b border-border-subtle">
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
