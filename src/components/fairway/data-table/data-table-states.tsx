/**
 * ============================================================================
 * Fairway DataTable — empty + error states (ADDITIVE / Wave 1)
 * ----------------------------------------------------------------------------
 * Honest, calm full-width states rendered in place of body rows (§7.3/§7.4,
 * principle 8 "honest emptiness"). These are intentionally small and local —
 * the app-wide EmptyState primitive is a separate Wave-1 group; the table
 * ships its own minimal versions so it's self-contained, and a consumer can
 * always override via the `emptyState` / `errorState` render props on
 * <DataTable>.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import type { DataTableStateProps } from './types';

/** Shared centered layout for an in-table state cell's content. */
function StateShell({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
  className,
}: DataTableStateProps & { tone?: 'neutral' | 'danger' }) {
  return (
    <div
      className={cn(
        'mx-auto flex max-w-sm flex-col items-center px-6 py-14 text-center',
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className={cn(
            'mb-4 flex size-12 items-center justify-center rounded-full',
            tone === 'danger'
              ? 'bg-fw-danger-bg text-fw-danger'
              : 'bg-surface-sunken text-text-tertiary',
          )}
        >
          {icon}
        </div>
      ) : null}
      <p className="font-fw-display text-h3 text-text-primary">{title}</p>
      {description ? (
        <p className="mt-1.5 text-body-sm text-text-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Empty state — no rows, but the query succeeded. */
export function DataTableEmpty(props: DataTableStateProps) {
  return <StateShell {...props} tone="neutral" />;
}

/** Error state — the data failed to load. Warm, non-alarming, with optional retry. */
export function DataTableError(props: DataTableStateProps) {
  return <StateShell {...props} tone="danger" />;
}
