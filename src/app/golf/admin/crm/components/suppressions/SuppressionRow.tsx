'use client';

import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { IconTrash } from '@/components/icons';
import { Button } from '@/components/ui/button';
import type {
  EmailSuppression,
  SuppressionReason,
  SuppressionSource,
} from '@/app/golf/admin/crm/types/foundations';

// ============================================================================
// SuppressionRow — single row of the suppressions admin table.
// ============================================================================

interface SuppressionRowProps {
  row: EmailSuppression;
  onRemove: (id: string) => Promise<void> | void;
}

const REASON_TONE: Record<SuppressionReason, string> = {
  unsubscribed: 'bg-fw-danger-bg text-fw-danger-ink border-fw-danger/25',
  complained: 'bg-fw-danger-bg text-fw-danger-ink border-fw-danger/25',
  hard_bounce: 'bg-fw-warning-bg text-fw-warning-ink border-fw-warning-ring',
  manual: 'bg-surface-sunken text-text-secondary border-border-subtle',
  invalid: 'bg-surface-sunken text-text-secondary border-border-subtle',
};

const REASON_LABEL: Record<SuppressionReason, string> = {
  unsubscribed: 'Unsubscribed',
  hard_bounce: 'Hard bounce',
  complained: 'Complaint',
  manual: 'Manual',
  invalid: 'Invalid',
};

const SOURCE_LABEL: Record<SuppressionSource, string> = {
  resend_webhook: 'Resend webhook',
  admin: 'Admin',
  import: 'Import',
  system: 'System',
};

export function SuppressionRow({ row, onRemove }: SuppressionRowProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rel = useMemo(() => {
    try {
      return formatDistanceToNow(new Date(row.suppressed_at), { addSuffix: true });
    } catch {
      return '';
    }
  }, [row.suppressed_at]);

  const absolute = useMemo(() => {
    try {
      return new Date(row.suppressed_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return row.suppressed_at;
    }
  }, [row.suppressed_at]);

  const handleRemove = async () => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Remove ${row.email} from the suppression list? They will be eligible to receive email again.`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      await onRemove(row.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove suppression');
      setBusy(false);
    }
  };

  return (
    <tr className="border-b border-border-subtle hover:bg-surface-sunken/40 transition-colors">
      <td className="px-4 py-2.5 text-sm text-text-primary font-medium truncate max-w-xs" title={row.email}>
        {row.email}
      </td>
      <td className="px-4 py-2.5">
        <span
          className={cn(
            'inline-flex items-center text-eyebrow font-medium px-2 py-0.5 rounded-full border',
            REASON_TONE[row.reason],
          )}
        >
          {REASON_LABEL[row.reason]}
        </span>
      </td>
      <td className="px-4 py-2.5 text-xs text-text-secondary">
        {SOURCE_LABEL[row.source] ?? row.source}
      </td>
      <td className="px-4 py-2.5 text-xs text-text-tertiary" title={absolute}>
        {rel || absolute}
      </td>
      <td className="px-4 py-2.5 text-right">
        <Button variant="danger"
          type="button"
          onClick={handleRemove}
          disabled={busy}
          className="inline-flex items-center gap-1 text-xs text-fw-danger-ink hover:text-fw-danger-ink hover:bg-fw-danger-bg/50 px-2 py-1 rounded-fw-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <IconTrash size={12} />
          {busy ? 'Removing...' : 'Remove'}
        </Button>
        {error && <p className="mt-1 text-eyebrow text-fw-danger-ink">{error}</p>}
      </td>
    </tr>
  );
}
