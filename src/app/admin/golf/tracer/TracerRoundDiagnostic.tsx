'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { bridgeFixRoundData, bridgeGetTracerRoundDiagnostic } from '@/app/admin/actions/golf-tracer';
import type { TracerRoundDiagnosticData } from '@/app/golf/actions/admin-tracer-data';
import { PanelStale } from '../../_components/PanelStates';
import { TracerIncidentRow } from './TracerIncidentRow';

type FixType =
  | 'recalculate_round_totals'
  | 'recalculate_round_gir'
  | 'refresh_player_stats_cache'
  | 'recalculate_strokes_gained'
  | 'resolve_stuck_round';

/** The 4 non-destructive recalculation fixes — always safe to offer once
 *  hole data exists (each guards its own preconditions server-side and
 *  reports back a real message rather than silently no-opping). */
const RECALC_ACTIONS: { type: Exclude<FixType, 'resolve_stuck_round'>; label: string; needsHoles: boolean }[] = [
  { type: 'recalculate_round_totals', label: 'Recalculate totals', needsHoles: true },
  { type: 'recalculate_round_gir', label: 'Recalculate GIR', needsHoles: true },
  { type: 'recalculate_strokes_gained', label: 'Recalculate strokes gained', needsHoles: true },
  { type: 'refresh_player_stats_cache', label: 'Refresh player stats cache', needsHoles: false },
];

/**
 * The drill-down + fix UI the tracer page's own banner used to admit was
 * missing: fetches `bridgeGetTracerRoundDiagnostic` on mount, renders the
 * data-quality picture for one round, and wires every `bridgeFixRoundData`
 * fix type to a real button. Mounted lazily (only once a round row is
 * expanded), so the fetch never blocks the player/rounds list above it.
 */
export function TracerRoundDiagnostic({
  roundId,
  playerId,
  roundStatus,
}: {
  roundId: string;
  playerId: string;
  roundStatus: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<TracerRoundDiagnosticData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fixResult, setFixResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pendingFix, setPendingFix] = useState<FixType | null>(null);
  const [confirmingResolve, setConfirmingResolve] = useState(false);
  const [, startTransition] = useTransition();

  const load = useCallback((onCancelled: () => boolean = () => false) => {
    setLoading(true);
    setLoadError(null);
    bridgeGetTracerRoundDiagnostic(roundId)
      .then((result) => {
        if (!onCancelled()) setData(result);
      })
      .catch((err: unknown) => {
        if (!onCancelled()) setLoadError(err instanceof Error ? err.message : 'Failed to load round diagnostic.');
      })
      .finally(() => {
        if (!onCancelled()) setLoading(false);
      });
  }, [roundId]);

  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  function runFix(fixType: FixType) {
    setConfirmingResolve(false);
    setPendingFix(fixType);
    setFixResult(null);
    startTransition(() => {
      void bridgeFixRoundData(roundId, fixType, playerId)
        .then((result) => {
          setFixResult({ ok: result.success, message: result.message });
          if (result.success) {
            router.refresh();
            // Round data changed under the fix — re-pull so the numbers on
            // screen match what was just written, without a full page reload.
            void bridgeGetTracerRoundDiagnostic(roundId).then(setData).catch(() => undefined);
          }
        })
        .catch((err: unknown) => {
          setFixResult({ ok: false, message: err instanceof Error ? err.message : 'Fix failed — try again.' });
        })
        .finally(() => setPendingFix((current) => (current === fixType ? null : current)));
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-warm-500">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        Loading round diagnostic…
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <PanelStale
        label="Round diagnostic"
        error={loadError ?? 'No data returned'}
        action={
          <Button type="button" variant="secondary" size="sm" onClick={() => load()}>
            Try again
          </Button>
        }
      />
    );
  }

  const hasHoles = data.holes.length > 0;
  const scoredHoles = data.holes.filter((h) => h.score != null).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat label="Holes" value={String(data.holes.length)} />
        <Stat label="Scored" value={`${scoredHoles}/${data.holes.length || 0}`} />
        <Stat label="Shots" value={String(data.shots.length)} />
        <Stat label="Tracer errors" value={String(data.errors.length)} danger={data.errors.length > 0} />
      </div>

      {data.errors.length > 0 ? (
        <ul className="divide-y divide-warm-200/60">
          {data.errors.map((incident) => (
            <TracerIncidentRow key={incident.id} incident={incident} />
          ))}
        </ul>
      ) : null}

      <div>
        <p className="mb-2 text-eyebrow font-semibold uppercase tracking-widest text-warm-500">Data-quality fixes</p>
        <div className="flex flex-wrap gap-2">
          {RECALC_ACTIONS.filter((a) => !a.needsHoles || hasHoles).map((action) => (
            <Button
              key={action.type}
              type="button"
              variant="secondary"
              size="sm"
              busy={pendingFix === action.type}
              // Only one fix may be in flight against this round at a time —
              // without this, clicking a DIFFERENT recalc button (or "Resolve
              // as stuck…") while one is already running races two mutations
              // against the same round's data (`busy` alone only disables the
              // button it's set on, not its siblings).
              disabled={pendingFix !== null && pendingFix !== action.type}
              onClick={() => runFix(action.type)}
            >
              {action.label}
            </Button>
          ))}
          {roundStatus === 'in_progress' ? (
            confirmingResolve ? (
              <span className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pendingFix !== null}
                  onClick={() => setConfirmingResolve(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  busy={pendingFix === 'resolve_stuck_round'}
                  disabled={pendingFix !== null && pendingFix !== 'resolve_stuck_round'}
                  onClick={() => runFix('resolve_stuck_round')}
                >
                  Confirm remove round
                </Button>
              </span>
            ) : (
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={pendingFix !== null}
                onClick={() => setConfirmingResolve(true)}
              >
                Resolve as stuck…
              </Button>
            )
          ) : null}
        </div>
        {fixResult ? (
          <p className={cn('mt-2 text-xs', fixResult.ok ? 'text-fw-success-ink' : 'text-fw-danger-ink')}>{fixResult.message}</p>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-sunken px-2.5 py-2">
      <p className="text-eyebrow uppercase tracking-wider text-warm-400">{label}</p>
      <p className={cn('font-fw-mono text-sm font-semibold tabular-nums', danger ? 'text-fw-danger-ink' : 'text-warm-900')}>
        {value}
      </p>
    </div>
  );
}
