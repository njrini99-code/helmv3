'use client';

/**
 * ============================================================================
 * BriefBand — the Triage Desk's full-width horizontal masthead (Triage Desk
 * spec §1)
 * ----------------------------------------------------------------------------
 * Deliberately a HORIZONTAL band, not a vertical spine — this is the visual
 * differentiator from the Stats tab's left spine + bento. Eyebrow, a
 * plain-language verdict of what needs attention today, tabular count chips,
 * a working "Scan team" Button (real busy state, disabled while running — no
 * separate progress affordance layered on top), and a "last scan <relative
 * time>" caption.
 *
 * LOOK (owner redesign, 2026-09): the shared frosted light surface
 * (`FROSTED_CARD_CLASS`, same as `Spine`) with dark text — it used to be a
 * dark accent-900→800 gradient slab. Green stays an accent: the primary
 * "Scan team" button is the one green fill.
 * ========================================================================== */

import { ScanSearch } from 'lucide-react';
import { Button } from '@/components/fairway';
import { FROSTED_CARD_CLASS } from '@/components/fairway/modules/frosted';
import { cn } from '@/lib/utils';
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
      <span className="font-fw-sans text-h3 font-semibold leading-none tabular-nums text-text-primary">
        {value}
      </span>
      <span className="font-fw-sans text-caption text-text-secondary">{label}</span>
    </div>
  );
}

export function BriefBand({ verdict, counts, lastScanLabel, scanning, onScan }: BriefBandProps) {
  return (
    <div
      data-slot="brief-band"
      className={cn(
        FROSTED_CARD_CLASS,
        'flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6',
      )}
    >
      <div className="flex flex-col gap-2.5">
        <p className="font-fw-sans text-caption font-semibold text-accent-ink">CoachHelm</p>
        <p className="max-w-2xl font-fw-sans text-body-lg text-text-primary">{verdict}</p>
        <div className="flex flex-wrap items-center gap-5 pt-0.5">
          <CountChip label="Urgent" value={counts.urgent} />
          {/* "New this week" removed: it counted `created_at <= 7d`, so it read
              0 on a day 188 rows were recomputed. A confident zero is worse
              than no counter. Restore with `content_generated_at`. */}
          <CountChip label="Players flagged" value={counts.playersFlagged} />
        </div>
      </div>

      <div className="flex flex-col items-start gap-2 sm:items-end">
        <Button
          variant="primary"
          size="md"
          busy={scanning}
          disabled={scanning}
          leftIcon={<ScanSearch className="h-4 w-4" strokeWidth={2} aria-hidden />}
          onClick={onScan}
          aria-label={scanning ? 'Scanning team for new signals' : 'Scan team for new signals'}
        >
          {scanning ? 'Scanning…' : 'Scan team'}
        </Button>
        <p className="font-fw-sans text-caption tabular-nums text-text-secondary">{lastScanLabel}</p>
      </div>
    </div>
  );
}
