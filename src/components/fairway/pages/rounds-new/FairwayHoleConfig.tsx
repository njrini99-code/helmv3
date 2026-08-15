'use client';

/**
 * ============================================================================
 * Fairway · Rounds-new · FairwayHoleConfig — hole-by-hole par/yardage editor
 * ----------------------------------------------------------------------------
 * The Fairway re-skin of the legacy HoleConfigurationForm (the Holes step of
 * New Round). Validation + the onSave/onBack contract are kept VERBATIM (par
 * 3-6, yardage>0); only presentation + seeding change.
 *
 * SEEDING — a real BASELINE, not a blank form:
 *   • `initialHoles` (a Cloud Course tee, a saved course, or any prior config)
 *     is the editable baseline for THIS round. It is sliced/padded to the
 *     requested `holesPerRound` so a 9-hole round off an 18-hole tee, or a tee
 *     with missing holes, still seeds a complete, editable hole set.
 *   • Only when there is NO baseline at all do we fall back to the standard
 *     par/yardage template (verbatim from legacy).
 *   • Edits are LOCAL to this component's state — they flow out via onSave into
 *     the round only. The shared catalog course/tee is never mutated here.
 *
 * DESIGN: floating shadow cards on the canvas (the parent drops its wrapping
 * Surface so we never card-in-card), matching the Setup step:
 *   • a baseline banner (when seeded from a cloud/saved course) making it clear
 *     these are starting values you can tune for today's round;
 *   • a summary card (Total Par / Yards / Holes stat tiles);
 *   • a grid card with a sunken Inset header bar + alternating hole rows + a
 *     front/back Segmented (with live OUT/IN sub-totals) + OUT/IN/TOTAL footer;
 *   • a green-stamped par selector — the SELECTED par is accent-500 (green =
 *     active/selection, honoring green-as-structure; NOT a per-par-type color);
 *   • recessed yardage well + Back + Save action dock.
 * Presentation only; flag-off path still uses the legacy HoleConfigurationForm.
 * ========================================================================== */

import { useState } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { ChevronLeft, Flag } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Button } from '@/components/fairway/controls/button';
import { Segmented } from '@/components/fairway/controls/segmented';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { Input } from '@/components/fairway/forms/Input';
import type { HoleConfig } from '@/lib/types/golf-course';

interface FairwayHoleConfigProps {
  initialHoles?: HoleConfig[];
  onSave: (holes: HoleConfig[]) => void;
  onBack: () => void;
  courseName: string;
  holesPerRound?: 9 | 18;
  /** When the initialHoles came from a Cloud Course / saved course tee, show a
   *  short banner clarifying these are an editable baseline for this round. */
  baselineLabel?: string;
}

// Default par/yardage template — ONLY used when there is no baseline to seed
// from (verbatim from legacy).
const DEFAULT_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const DEFAULT_YARDAGES = [
  380, 420, 165, 520, 400, 385, 175, 410, 545, 395, 430, 155, 510, 375, 415, 185, 390, 535,
];

/**
 * Build the seeded, editable hole set for THIS round. A provided baseline is
 * sliced/padded to `holesPerRound` (renumbered 1..N) so a partial cloud tee or
 * a 9-off-18 selection always yields a complete set; otherwise fall back to the
 * standard template. Pure — no mutation of the incoming baseline.
 */
function seedHoles(initialHoles: HoleConfig[] | undefined, holesPerRound: 9 | 18): HoleConfig[] {
  return Array.from({ length: holesPerRound }, (_, i) => {
    const seed = initialHoles?.[i];
    return {
      holeNumber: i + 1,
      par: seed?.par && seed.par > 0 ? seed.par : DEFAULT_PARS[i]!,
      yardage: seed?.yardage && seed.yardage > 0 ? seed.yardage : DEFAULT_YARDAGES[i]!,
    };
  });
}

export function FairwayHoleConfig({
  initialHoles,
  onSave,
  onBack,
  courseName,
  holesPerRound = 18,
  baselineLabel,
}: FairwayHoleConfigProps) {
  const prefersReducedMotion = useReducedMotion();
  const enter = (i: number) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, delay: 0.05 * i, ease: [0.16, 1, 0.3, 1] as const },
        };

  const [holes, setHoles] = useState<HoleConfig[]>(() => seedHoles(initialHoles, holesPerRound));

  const [activeTab, setActiveTab] = useState<'front' | 'back'>('front');
  const [validationError, setValidationError] = useState<string | null>(null);

  const is9Hole = holesPerRound === 9;

  const frontNine = holes.slice(0, 9);
  const backNine = is9Hole ? [] : holes.slice(9, 18);
  const frontPar = frontNine.reduce((sum, h) => sum + h.par, 0);
  const backPar = backNine.reduce((sum, h) => sum + h.par, 0);
  const frontYards = frontNine.reduce((sum, h) => sum + h.yardage, 0);
  const backYards = backNine.reduce((sum, h) => sum + h.yardage, 0);
  const totalPar = frontPar + backPar;
  const totalYards = frontYards + backYards;

  function updateHole(holeNumber: number, field: 'par' | 'yardage', value: number) {
    setHoles((prev) => prev.map((h) => (h.holeNumber === holeNumber ? { ...h, [field]: value } : h)));
    if (validationError) setValidationError(null);
  }

  function handleSubmit() {
    const isValid = holes.every((h) => h.par >= 3 && h.par <= 6 && h.yardage > 0);
    if (!isValid) {
      setValidationError('Please ensure all holes have valid par (3-6) and yardage values');
      return;
    }
    setValidationError(null);
    onSave(holes);
  }

  const displayHoles = is9Hole ? holes : activeTab === 'front' ? frontNine : backNine;
  const footerLabel = is9Hole ? 'TOTAL' : activeTab === 'front' ? 'OUT' : 'IN';
  const footerPar = is9Hole ? totalPar : activeTab === 'front' ? frontPar : backPar;
  const footerYards = is9Hole ? totalYards : activeTab === 'front' ? frontYards : backYards;

  const stat = (label: string, value: string, accent = false) => (
    <div className="rounded-fw-md bg-surface-sunken px-3 py-3 text-center">
      <div
        className={cn(
          'font-fw-mono text-h3 tabular-nums tracking-[-0.02em]',
          accent ? 'text-accent-700' : 'text-text-primary',
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 font-fw-sans text-eyebrow font-medium uppercase tracking-[0.1em] text-text-tertiary">
        {label}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Baseline banner — only when we seeded from a real course/tee, so the
          player knows these values are an editable starting point for today. */}
      {baselineLabel && (
        <m.div {...enter(0)}>
          <div className="flex items-start gap-3 rounded-fw-md border border-accent-500/30 bg-accent-50 px-4 py-3">
            <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-accent-500/15 text-accent-700">
              <Flag className="h-3.5 w-3.5" aria-hidden />
            </span>
            <p className="font-fw-sans text-body-sm text-text-secondary">
              <span className="font-medium text-text-primary">Baseline from {baselineLabel}.</span>{' '}
              Tune any hole for the way it played today — your edits apply to this round only.
            </p>
          </div>
        </m.div>
      )}

      {/* Summary */}
      <m.div {...enter(baselineLabel ? 1 : 0)}>
        <Surface elevation="shadow" padding="lg">
          <div
            className="grid grid-cols-3 gap-3"
            aria-label={courseName ? `Scorecard summary for ${courseName}` : 'Scorecard summary'}
          >
            {stat('Total Par', String(totalPar), true)}
            {stat('Total Yards', totalYards.toLocaleString('en-US'))}
            {stat('Holes', String(holesPerRound))}
          </div>
        </Surface>
      </m.div>

      {/* Hole grid */}
      <m.div {...enter(baselineLabel ? 2 : 1)}>
        <Surface elevation="shadow" padding="lg" className="flex flex-col gap-4">
          {!is9Hole && (
            <Segmented<'front' | 'back'>
              size="md"
              aria-label="Nine selection"
              value={activeTab}
              onValueChange={setActiveTab}
              options={[
                { value: 'front', label: `Front 9 · ${frontPar}` },
                { value: 'back', label: `Back 9 · ${backPar}` },
              ]}
            />
          )}

          <div className="overflow-hidden rounded-fw-md border border-border-subtle">
            {/* Header bar (sunken well) */}
            <div className="grid grid-cols-[52px_1fr_104px] items-center bg-surface-sunken">
              <div className="px-3 py-2.5 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.1em] text-text-tertiary">
                Hole
              </div>
              <div className="px-3 py-2.5 text-center font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.1em] text-text-tertiary">
                Par
              </div>
              <div className="px-3 py-2.5 text-center font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.1em] text-text-tertiary">
                Yards
              </div>
            </div>

            {/* Hole rows */}
            {displayHoles.map((hole, idx) => (
              <div
                key={hole.holeNumber}
                className={cn(
                  'grid grid-cols-[52px_1fr_104px] items-center border-t border-border-subtle',
                  idx % 2 === 1 && 'bg-surface-sunken/40',
                )}
              >
                <div className="px-3 py-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-sunken font-fw-mono text-body-sm font-medium tabular-nums text-text-secondary ring-1 ring-border-subtle">
                    {hole.holeNumber}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-1.5 px-2 py-2">
                  {[3, 4, 5].map((par) => {
                    const selected = hole.par === par;
                    return (
                      // eslint-disable-next-line helm/no-raw-button -- custom par-selector chip (aria-pressed segmented control), not a design-system Button
                      <button
                        key={par}
                        type="button"
                        aria-label={`Hole ${hole.holeNumber} par ${par}`}
                        aria-pressed={selected}
                        onClick={() => updateHole(hole.holeNumber, 'par', par)}
                        className={cn(
                          'h-9 w-9 rounded-fw-md font-fw-mono text-body-sm font-semibold tabular-nums transition-colors',
                          selected
                            ? 'bg-accent-750 text-text-on-accent shadow-flat'
                            : 'border border-border-subtle bg-surface text-text-secondary hover:bg-surface-tint',
                        )}
                      >
                        {par}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-center px-2 py-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={hole.yardage}
                    onChange={(e) => updateHole(hole.holeNumber, 'yardage', parseInt(e.target.value) || 0)}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    className="w-[84px] rounded-fw-md border border-border-subtle bg-surface-sunken px-2 py-2 text-center font-fw-mono text-body-sm font-medium tabular-nums text-text-primary outline-none transition-colors focus:border-accent-500 focus:bg-surface focus:ring-2 focus:ring-accent-500/25"
                    min="50"
                    max="700"
                    aria-label={`Hole ${hole.holeNumber} yardage`}
                  />
                </div>
              </div>
            ))}

            {/* Total footer */}
            <div className="grid grid-cols-[52px_1fr_104px] items-center border-t border-border-strong bg-accent-50">
              <div className="px-3 py-3 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.1em] text-accent-700">
                {footerLabel}
              </div>
              <div className="px-3 py-3 text-center font-fw-mono text-body-sm font-semibold tabular-nums text-accent-700">
                {footerPar}
              </div>
              <div className="px-3 py-3 text-center font-fw-mono text-body-sm font-semibold tabular-nums text-accent-700">
                {footerYards.toLocaleString('en-US')}
              </div>
            </div>
          </div>
        </Surface>
      </m.div>

      {validationError && (
        <InlineNotice tone="danger" title="Check your hole values">
          {validationError}
        </InlineNotice>
      )}

      {/* Action dock */}
      <m.div {...enter(baselineLabel ? 3 : 2)} className="flex gap-3 pt-1">
        <Button variant="secondary" type="button" onClick={onBack} leftIcon={<ChevronLeft className="h-4 w-4" />} className="flex-1">
          Back
        </Button>
        <Button variant="primary" type="button" onClick={handleSubmit} className="flex-[2]">
          Start round →
        </Button>
      </m.div>
    </div>
  );
}
