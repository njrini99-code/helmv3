'use client';

/**
 * ============================================================================
 * BriefBand: the Signals view's summary card
 * ----------------------------------------------------------------------------
 * Summary first (owner direction 2026-09-25), in the same shape as the root
 * map's `RootSummary`: one light card with
 *
 *   - the key number: signals open in the queue (the same count the "All"
 *     chip below carries, so the two never disagree)
 *   - one plain-language verdict of what needs attention today
 *   - ONE visual: the queue split by severity, in proportion
 *   - "Scan team" plus the "last scan" caption. It is a secondary action:
 *     the queue and its dossier own the screen's primary action.
 *
 * It renders only on the Signals view. The Team roots view opens on its own
 * summary card, so the band no longer sits above every view.
 * ========================================================================== */

import { Sparkles } from 'lucide-react';
import { Button, Eyebrow } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { SignalSeverity } from '@/lib/coachhelm/signal-grouping';
import type { BriefCounts } from './buildTriageViewModel';

export type SeverityMix = Record<SignalSeverity, number>;

export interface BriefBandProps {
  verdict: string;
  counts: BriefCounts;
  lastScanLabel: string;
  scanning: boolean;
  onScan: () => void;
  /** Open signals by severity. When omitted the card shows no bar. */
  mix?: SeverityMix;
}

const SEVERITY_ORDER: readonly SignalSeverity[] = ['urgent', 'high', 'medium', 'low'];
const SEVERITY_LABEL: Record<SignalSeverity, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Watch',
};
/** One warm ramp: urgent reads darkest, watch lightest (same stepping the
 *  root map's summary bar uses for its areas). */
const SEVERITY_FILL: Record<SignalSeverity, string> = {
  urgent: 'var(--fw-color-danger)',
  high: 'var(--fw-color-warning)',
  medium: 'color-mix(in oklch, var(--fw-color-accent-500) 70%, var(--fw-color-surface))',
  low: 'color-mix(in oklch, var(--fw-color-accent-500) 30%, var(--fw-color-surface))',
};

export function BriefBand({ verdict, counts, lastScanLabel, scanning, onScan, mix }: BriefBandProps) {
  const total = mix ? SEVERITY_ORDER.reduce((n, s) => n + mix[s], 0) : null;
  const playerWord = counts.playersFlagged === 1 ? 'player' : 'players';

  return (
    <section
      data-slot="brief-band"
      aria-label="Signals summary"
      className="flex flex-col gap-5 rounded-fw-lg border border-border-subtle bg-surface p-5 md:p-6"
    >
      <div className="flex flex-col gap-1">
        <Eyebrow as="p">
          Open signals · {counts.playersFlagged} {playerWord} flagged
        </Eyebrow>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          {total !== null ? (
            <p className="font-fw-mono text-display tabular-nums text-text-primary" data-slot="brief-total">
              {total}
            </p>
          ) : null}
          <p className="text-caption text-text-secondary">
            <span
              className={cn(
                'font-fw-mono tabular-nums',
                counts.urgent > 0 ? 'text-fw-danger-ink' : 'text-text-primary',
              )}
            >
              {counts.urgent}
            </span>{' '}
            urgent
          </p>
        </div>
        <p className="text-body text-text-secondary">{verdict}</p>
      </div>

      {mix && total ? (
        <div className="flex flex-col gap-2">
          <div
            role="img"
            aria-label={`Open signals by severity: ${SEVERITY_ORDER.map((s) => `${SEVERITY_LABEL[s]} ${mix[s]}`).join(', ')}.`}
            className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
            data-slot="brief-severity-bar"
          >
            {SEVERITY_ORDER.map((s) =>
              mix[s] > 0 ? (
                <span
                  key={s}
                  className="h-full min-w-1.5 motion-safe:transition-[width] motion-safe:duration-500"
                  style={{ width: `${(mix[s] / total) * 100}%`, background: SEVERITY_FILL[s] }}
                />
              ) : null,
            )}
          </div>
          <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary">
            {SEVERITY_ORDER.map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SEVERITY_FILL[s] }} />
                {SEVERITY_LABEL[s]} <span className="font-fw-mono tabular-nums text-text-primary">{mix[s]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle pt-4">
        <Button
          variant="secondary"
          size="md"
          busy={scanning}
          disabled={scanning}
          leftIcon={<Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />}
          onClick={onScan}
          aria-label={scanning ? 'Scanning team for new signals' : 'Scan team for new signals'}
          className="min-h-11"
        >
          {scanning ? 'Scanning…' : 'Scan team'}
        </Button>
        <p className="font-fw-mono text-caption tabular-nums text-text-tertiary">{lastScanLabel}</p>
      </div>
    </section>
  );
}
