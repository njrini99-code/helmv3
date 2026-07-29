'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck } from 'lucide-react';
import { Button } from '@/components/fairway';
import { resolveTriageEvents } from '@/app/admin/actions/triage';

/**
 * "Resolve all (filtered)" — the bulk counterpart to TriageQueue's per-row
 * Resolve button, mirroring the "Copy all (filtered)" toolbar action's shape
 * (same population: every eventId across the currently-filtered app-origin
 * incidents, flattened by the caller). Same idempotent/super-admin-gated RPC
 * (resolveTriageEvents → resolve_admin_event, only touches resolved=false
 * rows) — clearing a storm of N grouped incidents no longer needs N clicks.
 *
 * Deliberately NOT optimistic like TriageQueue's per-row hide: a bulk action
 * touching dozens of rows across many incident groups is exactly the case
 * where "trust the server, then refresh" beats guessing at partial success.
 *
 * Two-click confirm (same shape as SessionsPanel's "Revoke → Confirm sign-out
 * everywhere"): `resolve_admin_event` is the console's ONLY writable mutation
 * and it is UPDATE-only — there is no `unresolve` RPC anywhere in the schema,
 * so a mis-set filter chip plus one click was irreversible. The confirm step
 * restates the exact row count being committed.
 */
export function BulkResolveButton({
  eventIds,
  onResolve = resolveTriageEvents,
}: {
  eventIds: string[];
  onResolve?: (eventIds: string[]) => Promise<{ resolvedCount: number }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (eventIds.length === 0) return null;

  function handleConfirm() {
    setError(null);
    startTransition(() => {
      void onResolve(eventIds)
        .then(() => {
          setConfirming(false);
          router.refresh();
        })
        .catch((err: unknown) => {
          setConfirming(false);
          setError(err instanceof Error ? err.message : 'Bulk resolve failed — try again');
        });
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isPending}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            busy={isPending}
            onClick={handleConfirm}
            leftIcon={<CheckCheck size={13} aria-hidden />}
          >
            {`Confirm — resolve ${eventIds.length}`}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setConfirming(true)}
          disabled={isPending}
          leftIcon={<CheckCheck size={13} aria-hidden />}
        >
          {`Resolve all (filtered) · ${eventIds.length}`}
        </Button>
      )}
      {confirming ? (
        <p className="text-xs text-warm-500">This cannot be undone.</p>
      ) : null}
      {error ? <p className="text-xs text-fw-danger-ink">{error}</p> : null}
    </div>
  );
}
