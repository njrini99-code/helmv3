'use client';

import { useState, useTransition } from 'react';
import { Check, CircleCheck } from 'lucide-react';
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
 * CopyReportButton's note).
 *
 * Deliberately reports what actually happened, including the boring case:
 * "already resolved" when the update matched no open rows. Claiming a
 * successful resolve for a no-op would be the same class of confident-but-
 * unearned statement this whole surface exists to expose.
 */
export function ResolveErrorButton({ fingerprint }: { fingerprint: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function onClick() {
    setResult(null);
    startTransition(async () => {
      try {
        const r = await resolveErrorFingerprint(fingerprint);
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
        setResult('Not permitted');
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="md"
        onClick={onClick}
        disabled={pending}
        aria-label="Mark this error resolved"
      >
        {result?.startsWith('Resolved') || result === 'Already resolved' ? (
          <Check aria-hidden className="size-4" />
        ) : (
          <CircleCheck aria-hidden className="size-4" />
        )}
        {pending ? 'Resolving…' : 'Mark resolved'}
      </Button>
      {result ? (
        <span className="text-sm text-text-secondary" role="status">
          {result}
        </span>
      ) : null}
    </div>
  );
}
