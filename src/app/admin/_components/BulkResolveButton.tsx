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

  if (eventIds.length === 0) return null;

  function handleClick() {
    setError(null);
    startTransition(() => {
      void onResolve(eventIds)
        .then(() => {
          router.refresh();
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Bulk resolve failed — try again');
        });
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
        leftIcon={<CheckCheck size={13} aria-hidden />}
      >
        {isPending ? 'Resolving…' : `Resolve all (filtered) · ${eventIds.length}`}
      </Button>
      {error ? <p className="text-xs text-fw-danger-ink">{error}</p> : null}
    </div>
  );
}
