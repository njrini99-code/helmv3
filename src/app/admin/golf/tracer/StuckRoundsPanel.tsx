'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { bridgeFixRoundData } from '@/app/admin/actions/golf-tracer';
import { PanelAllClear } from '../../_components/PanelStates';
import { LocalTime } from '../../_components/LocalTime';
import { formatStuckDuration } from './tracer-shared';
import type { TracerEnrichedData } from '@/app/golf/actions/admin-tracer-data';

type StuckRound = TracerEnrichedData['stuckRounds'][number];

// React #418 fix (same pattern as RelativeTime.tsx/LocalTime.tsx): a fixed,
// non-time-derived constant so the "all clear" placeholder is byte-identical
// on the server render and the client's pre-hydration first pass — reading
// `new Date().toISOString()` directly during render of a 'use client'
// component resolves differently across those two passes, and this is the
// FIRST thing a clean tracer page load renders (most rounds lists are
// empty), so the mismatch would fire on nearly every visit.
const PLACEHOLDER_CHECKED_AT = new Date(0).toISOString();

/**
 * Drill-down + fix for the highest-value case in the tracer's read-only
 * player list: a round stuck in_progress for 1h+. "Resolve" runs the
 * existing `resolve_stuck_round` fix (bridgeFixRoundData) — already gated
 * server-side behind a 24h-stale + minimal-activity guard, so this is a
 * confirm-then-submit UI over a backend that refuses anything risky, not a
 * bare delete button. Mirrors SessionsPanel's two-step revoke pattern
 * (destructive action, one extra click).
 */
export function StuckRoundsPanel({ rounds }: { rounds: readonly StuckRound[] }) {
  const router = useRouter();
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ReadonlyMap<string, { ok: boolean; message: string }>>(new Map());
  const [, startTransition] = useTransition();
  const [checkedAt, setCheckedAt] = useState(PLACEHOLDER_CHECKED_AT);

  useEffect(() => {
    setCheckedAt(new Date().toISOString());
  }, []);

  const visible = rounds.filter((r) => !removedIds.has(r.round_id));

  if (visible.length === 0) {
    return (
      <PanelAllClear
        label={
          rounds.length > 0
            ? 'All stuck rounds resolved'
            : 'No stuck rounds — every in-progress round has moved in the last hour'
        }
        checkedAt={checkedAt}
      />
    );
  }

  function resolve(roundId: string) {
    setConfirmingId(null);
    setPendingId(roundId);
    setFeedback((prev) => {
      if (!prev.has(roundId)) return prev;
      const next = new Map(prev);
      next.delete(roundId);
      return next;
    });
    startTransition(() => {
      void bridgeFixRoundData(roundId, 'resolve_stuck_round')
        .then((result) => {
          if (result.success) {
            setRemovedIds((prev) => new Set([...prev, roundId]));
            router.refresh();
          } else {
            setFeedback((prev) => new Map(prev).set(roundId, { ok: false, message: result.message }));
          }
        })
        .catch((err: unknown) => {
          setFeedback((prev) =>
            new Map(prev).set(roundId, {
              ok: false,
              message: err instanceof Error ? err.message : 'Could not resolve this round — try again.',
            }),
          );
        })
        .finally(() => setPendingId((current) => (current === roundId ? null : current)));
    });
  }

  return (
    <ul className="divide-y divide-warm-200/60">
      {visible.map((r) => {
        const fb = feedback.get(r.round_id);
        const isPending = pendingId === r.round_id;
        return (
          <li key={r.round_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm">
            <AlertTriangle size={15} className="shrink-0 text-fw-warning-ink" aria-hidden />
            <div className="min-w-0 flex-1 basis-full sm:basis-auto">
              <p className="truncate font-medium text-warm-900">
                {r.player_name}
                {r.course_name ? ` — ${r.course_name}` : ''}
              </p>
              <p className="font-fw-mono text-xs tabular-nums text-warm-500">
                hole {r.current_hole ?? '?'}/{r.expected_holes} · {formatStuckDuration(r.hours_stuck)} · last touched{' '}
                <LocalTime iso={r.updated_at} variant="datetime" />
              </p>
              {fb ? <p className="mt-0.5 text-xs text-fw-danger-ink">{fb.message}</p> : null}
            </div>
            {confirmingId === r.round_id ? (
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={() => setConfirmingId(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  busy={isPending}
                  onClick={() => resolve(r.round_id)}
                >
                  Confirm remove
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={<RotateCcw size={13} aria-hidden />}
                onClick={() => setConfirmingId(r.round_id)}
                className={cn(isPending && 'opacity-60')}
                disabled={isPending}
              >
                Resolve
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
