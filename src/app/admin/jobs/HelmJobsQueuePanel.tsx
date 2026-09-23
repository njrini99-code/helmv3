'use client';

/**
 * Bridge Jobs board — "Jobs queue" section (Database Plan D6).
 * Depth/oldest-age/dead-letter counts per pgmq queue, plus a dead-letter
 * list with redacted payload and a requeue action. Empty state when the
 * facade migration (supabase/migrations/20260906140000_...) is not applied.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { Surface, Inset, Button } from '@/components/fairway';
import { PanelNoData } from '../_components/PanelStates';
import { LocalTime } from '../_components/LocalTime';
import { requeueDeadLetter } from './helm-jobs-actions';
import type { HelmJobsQueueStatus } from '@/lib/admin/data/helm-jobs';

function formatAge(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

export function HelmJobsQueuePanel({ status }: { status: HelmJobsQueueStatus }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Map<string, string>>(new Map());
  const [, startTransition] = useTransition();

  if (!status.available) {
    return (
      <Surface>
        <Inset>
          <h2 className="fw-heading-sm mb-2">Jobs queue</h2>
          <PanelNoData
            label="Queue not active"
            description={
              status.reason === 'migration-not-applied'
                ? 'The pgmq facade migration (HELD) has not been applied yet — see supabase/migrations/HELD.md.'
                : (status.reason ?? 'HELM_QUEUE_ENABLED is off, or the queue has not been used yet.')
            }
          />
        </Inset>
      </Surface>
    );
  }

  function handleRequeue(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const result = await requeueDeadLetter(id);
      setFeedback((prev) => new Map(prev).set(id, result.success ? 'Requeued.' : (result.error ?? 'Failed.')));
      setPendingId(null);
      if (result.success) router.refresh();
    });
  }

  return (
    <Surface>
      <Inset>
        <h2 className="fw-heading-sm mb-4">Jobs queue</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-6">
          {status.depths.map((d) => (
            <div key={d.queue} className="rounded-md border border-fw-border p-3">
              <div className="text-xs uppercase tracking-wide text-fw-text-muted">{d.queue}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{d.queueLength}</div>
              <div className="mt-1 text-xs text-fw-text-muted">
                oldest {formatAge(d.oldestMsgAgeSeconds)} · {d.deadLetterCount} dead-lettered
              </div>
            </div>
          ))}
        </div>

        {status.deadLetters.length === 0 ? (
          <PanelNoData label="No dead letters" description="Every message either succeeded or is still retrying." />
        ) : (
          <div className="space-y-3">
            {status.deadLetters.map((dl) => (
              <div key={dl.id} className="rounded-md border border-fw-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{dl.queue}</div>
                  <div className="text-xs text-fw-text-muted">
                    {dl.attempts} attempts · failed <LocalTime iso={dl.failedAt} />
                  </div>
                </div>
                {dl.error && <div className="mt-1 text-xs text-fw-danger">{dl.error}</div>}
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-fw-surface-muted p-2 text-xs">
                  {JSON.stringify(dl.payload, null, 2)}
                </pre>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pendingId === dl.id}
                    onClick={() => handleRequeue(dl.id)}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Requeue
                  </Button>
                  {feedback.get(dl.id) && <span className="text-xs text-fw-text-muted">{feedback.get(dl.id)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Inset>
    </Surface>
  );
}
