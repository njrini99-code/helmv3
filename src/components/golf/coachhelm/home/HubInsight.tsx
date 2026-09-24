'use client';

/**
 * ============================================================================
 * HubInsight — one CoachHelm insight as a first-class unit (audit HUB-04)
 * ----------------------------------------------------------------------------
 * Takeaway first (the claim is the heading), then the cause chain the engine
 * already stores on the insight (what we see → what it is worth → why, with a
 * "Measured" or "Likely" marker so a hypothesis never reads as fact), the
 * evidence rail (you vs team vs Tour on one axis), the sample and a live
 * "data through" line that says when the player has played since (NUM-12),
 * the movement since the insight was first seen, and the prescribed drill.
 *
 * Actions: one secondary "See the evidence" per unit; the lead unit adds
 * Helpful / Dismiss as ghost buttons. The page's one primary action (Log a
 * round) lives in the masthead, so nothing here is filled green.
 * ========================================================================== */

import { Button } from '@/components/fairway';
import { FROSTED_CARD_CLASS } from '@/components/fairway/modules/frosted';
import { IconClock } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { InsightUnit } from './buildPlayerHubViewModel';
import { EvidenceRailView, ReadBand, SenseWord } from './HubInstruments';

export interface HubInsightProps {
  unit: InsightUnit;
  lead?: boolean;
  onOpen: () => void;
  onRate?: (rating: 'helpful' | 'dismissed') => void;
}

export function HubInsight({ unit, lead = false, onOpen, onRate }: HubInsightProps) {
  const headingId = `hub-insight-${unit.id}`;
  const meta = [unit.sample, unit.dataThrough, unit.predatesLastRound ? 'Built before your last round' : null].filter(Boolean);

  return (
    <article
      data-slot="hub-insight"
      data-lead={lead ? 'true' : undefined}
      aria-labelledby={headingId}
      className={cn(lead ? cn(FROSTED_CARD_CLASS, 'p-5 sm:p-6') : 'py-1')}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="font-fw-sans text-caption font-semibold text-text-secondary">{unit.category}</p>
        {unit.read ? <ReadBand read={unit.read} /> : null}
        {unit.movement ? (
          <span className="inline-flex items-center gap-1.5">
            <SenseWord sense={unit.movement.sense}>{unit.movement.word}</SenseWord>
            <span className="font-fw-sans text-caption text-text-secondary tabular-nums">{unit.movement.text}</span>
          </span>
        ) : null}
      </div>

      <h3
        id={headingId}
        className={cn(
          'mt-2 font-fw-display font-semibold text-text-primary',
          lead ? 'text-h2' : 'text-h3',
        )}
      >
        {unit.claim}
      </h3>

      {unit.chain.length > 0 ? (
        <ol data-slot="cause-chain" className="mt-4 flex flex-col gap-3 border-l-2 border-border-subtle pl-4">
          {unit.chain.map((step) => (
            <li key={step.key} className="relative">
              <span
                aria-hidden="true"
                className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-border-strong bg-surface"
              />
              <p className="flex flex-wrap items-center gap-2 font-fw-sans text-caption font-semibold text-text-tertiary">
                {step.label}
                {step.marker ? (
                  <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-caption font-medium text-text-secondary">
                    {step.marker}
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 font-fw-sans text-body-sm text-text-primary tabular-nums">{step.text}</p>
            </li>
          ))}
        </ol>
      ) : unit.body ? (
        <p className="mt-3 font-fw-sans text-body-sm text-text-secondary">{unit.body}</p>
      ) : null}

      {unit.rail ? (
        <div className="mt-4">
          <EvidenceRailView rail={unit.rail} />
        </div>
      ) : null}

      {meta.length > 0 ? (
        <p className="mt-3 font-fw-sans text-caption text-text-tertiary tabular-nums">{meta.join(' · ')}</p>
      ) : null}

      {unit.drill ? (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-fw-md border border-accent-200 bg-accent-50 px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="font-fw-sans text-caption font-semibold text-accent-ink">Drill</p>
            <p className="font-fw-sans text-body-sm text-text-primary">{unit.drill.title}</p>
          </div>
          {unit.drill.minutes !== null ? (
            <p className="inline-flex shrink-0 items-center gap-1 font-fw-sans text-caption font-medium text-accent-ink tabular-nums">
              <IconClock size={12} aria-hidden /> {unit.drill.minutes} min
            </p>
          ) : null}
        </div>
      ) : unit.action ? (
        <p className="mt-4 font-fw-sans text-body-sm text-text-secondary">
          <span className="font-semibold text-text-primary">Next step: </span>
          {unit.action}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onOpen}>
          See the evidence
        </Button>
        {lead && onRate ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => onRate('helpful')}>
              Helpful
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onRate('dismissed')}>
              Dismiss
            </Button>
          </>
        ) : null}
      </div>
    </article>
  );
}
