'use client';

/**
 * ============================================================================
 * BriefBand — the Triage Desk's full-width horizontal masthead (Triage Desk
 * spec §1)
 * ----------------------------------------------------------------------------
 * Deliberately a HORIZONTAL band, not a vertical spine — this is the visual
 * differentiator from the Stats tab's left green rail + bento. Eyebrow, a
 * plain-language verdict of what needs attention today, three mono count
 * chips, a working "Scan team" Button (real busy state, disabled while
 * running — no separate progress affordance layered on top), and a
 * "last scan <relative time>" mono caption.
 * ========================================================================== */

import { Sparkles } from 'lucide-react';
import { Button } from '@/components/fairway';
import type { BriefCounts } from './buildTriageViewModel';

export interface BriefBandProps {
  verdict: string;
  counts: BriefCounts;
  lastScanLabel: string;
  scanning: boolean;
  onScan: () => void;
}

function CountChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-fw-mono text-h3 font-semibold leading-none tabular-nums text-text-on-accent">
        {value}
      </span>
      <span className="font-fw-sans text-caption uppercase tracking-wide text-accent-300">{label}</span>
    </div>
  );
}

export function BriefBand({ verdict, counts, lastScanLabel, scanning, onScan }: BriefBandProps) {
  return (
    <div
      data-slot="brief-band"
      className="flex flex-col gap-4 rounded-fw-lg border border-accent-700 bg-gradient-to-r from-accent-900 via-accent-800 to-accent-800 p-5 shadow-raise sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex flex-col gap-2.5">
        <p className="font-fw-display text-eyebrow uppercase tracking-[0.13em] text-accent-300">CoachHelm</p>
        <p className="max-w-2xl font-fw-sans text-body-lg text-text-on-accent">{verdict}</p>
        <div className="flex flex-wrap items-center gap-5 pt-0.5">
          <CountChip label="Urgent" value={counts.urgent} />
          <CountChip label="New this week" value={counts.newThisWeek} />
          <CountChip label="Players flagged" value={counts.playersFlagged} />
        </div>
      </div>

      <div className="flex flex-col items-start gap-2 sm:items-end">
        <Button
          variant="primary"
          size="md"
          busy={scanning}
          disabled={scanning}
          leftIcon={<Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />}
          onClick={onScan}
          aria-label={scanning ? 'Scanning team for new signals' : 'Scan team for new signals'}
        >
          {scanning ? 'Scanning…' : 'Scan team'}
        </Button>
        <p className="font-fw-mono text-caption tabular-nums text-accent-300">{lastScanLabel}</p>
      </div>
    </div>
  );
}
