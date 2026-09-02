'use client';

import { useState, useTransition } from 'react';
import { Check, CheckCheck, CircleCheck } from 'lucide-react';
import { Button } from '@/components/fairway';
import { resolveErrorFingerprint } from '../actions/resolve-error';

/**
 * Marks an error fingerprint resolved.
 *
 * admin_events has always carried resolved/resolved_at/resolved_by and this
 * surface has always READ them — the empty state one level up even says
 * "Either every event has been resolved or this fingerprint no longer matches
 * any admin_events row." Nothing could ever write them, so a defect fixed and
 * deployed weeks ago sat here beside one that broke five minutes ago, with no
 * way to tell them apart.
 *
 * The action is a server action imported directly (not passed across the RSC
 * boundary as a function prop — this repo was burned by exactly that; see
 * CopyReportButton's note). resolveErrorFingerprint itself now resolves
 * through the same user-scoped resolve_admin_event() RPC BulkResolveButton
 * uses (unified 2026-08-25 — see that action's comment), so this button and
 * BulkResolveButton share one write path.
 *
 * Two-click confirm (same shape as BulkResolveButton's "Resolve all
 * (filtered)"): resolveErrorFingerprint can flip every open event for a
 * fingerprint in one click, there is no `unresolve` RPC live in production,
 * and unlike the bulk button this one has no filtered-count context to show
 * before acting — a single mis-click was irreversible with nothing to
 * confirm first. The fingerprint itself is already on screen (this button
 * always renders beside the "fingerprint {fingerprint}" page heading), so the
 * confirm step restates only the irreversibility, not the identifier.
 *
 * Deliberately reports what actually happened, including the boring case:
 * "already resolved" when the update matched no open rows. Claiming a
 * successful resolve for a no-op would be the same class of confident-but-
 * unearned statement this whole surface exists to expose.
 */
export function ResolveErrorButton({ fingerprint }: { fingerprint: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function handleConfirm() {
    setResult(null);
    startTransition(async () => {
      try {
        const r = await resolveErrorFingerprint(fingerprint);
        setConfirming(false);
        if (!r.success) {
          setResult(r.error);
          return;
        }
        setResult(
          r.resolvedCount === 0
            ? 'Already resolved'
            : `Resolved ${r.resolvedCount} event${r.resolvedCount === 1 ? '' : 's'}`,
        );
      } catch {
        // requireSuperAdmin throws for a non-admin; say so rather than
        // silently doing nothing.
        setConfirming(false);
        setResult('Not permitted');
      }
    });
  }

  const resolvedAlready = result?.startsWith('Resolved') || result === 'Already resolved';

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="md"
            busy={pending}
            onClick={handleConfirm}
            leftIcon={<CheckCheck size={14} aria-hidden />}
          >
            Confirm — mark resolved
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => setConfirming(true)}
          disabled={pending}
          aria-label="Mark this error resolved"
        >
          {resolvedAlready ? (
            <Check aria-hidden className="size-4" />
          ) : (
            <CircleCheck aria-hidden className="size-4" />
          )}
          Mark resolved
        </Button>
      )}
      {confirming ? <p className="text-xs text-warm-500">This cannot be undone.</p> : null}
      {result ? (
        <span className="text-sm text-text-secondary" role="status">
          {result}
        </span>
      ) : null}
    </div>
  );
}
