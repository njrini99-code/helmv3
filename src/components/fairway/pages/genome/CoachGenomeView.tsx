'use client';

/**
 * Coach Genome: /golf/dashboard/players/[playerId]/genome.
 *
 * Question: what kind of player is this, skill by skill, against the team or
 * the Tour, and where is the read still thin?
 *
 * Anatomy (375pt first): masthead (name, archetype, one-sentence verdict) →
 * one opaque stage holding the strand with its Team / Tour switch → the ranked
 * ledger → "How they play" (genome tendencies) → focus areas (streamed).
 *
 * One headline number: Form (OD-02, src/lib/golf/form-score.ts), the same
 * score Fingerprint, Team Stats and the print view show. It sits on the
 * masthead meta row with its formula one tap away, and is absent when the
 * player has no countable rounds.
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/fairway/controls/button';
import { fairwayToast } from '@/components/fairway/feedback';
import { createFocusArea } from '@/app/golf/actions/development';
import { BaselineSwitch } from './BaselineSwitch';
import { StrandBand, StrandReadout, StrandTable, useStrandSelection } from './GenomeStrand';
import { TraitLedger, TraitLedgerHead } from './TraitLedger';
import { TraitEvidenceSheet } from './TraitEvidenceSheet';
import {
  type Baseline,
  type StrandSamples,
  type StrandTrait,
  buildVerdict,
  familyOf,
  readLevel,
  readWord,
  summarize,
} from './strand-model';

export interface GenomeForm {
  value: number;
  /** "Early read" below 5 countable rounds, otherwise null. */
  qualityLabel: string | null;
  /** The formula in words with this player's numbers (describeFormFormula). */
  formula: string[];
}

export interface CoachGenomeViewProps {
  playerId: string;
  playerName: string;
  firstName: string;
  traits: StrandTrait[];
  samples: StrandSamples;
  archetype: string | null;
  coachId: string | null;
  form?: GenomeForm | null;
  /** "How they play" (server-rendered). */
  tendencies: React.ReactNode;
  /** Streamed sections below the fold (focus areas). */
  children?: React.ReactNode;
}

export function CoachGenomeView({
  playerId,
  playerName,
  firstName,
  traits,
  samples,
  archetype,
  coachId,
  form = null,
  tendencies,
  children,
}: CoachGenomeViewProps) {
  const router = useRouter();
  const [baseline, setBaseline] = React.useState<Baseline>('team');
  const initial = React.useMemo(() => summarize(traits, 'team').best?.id ?? traits.find((t) => t.value != null)?.id ?? null, [traits]);
  const { selectedId, select } = useStrandSelection(initial);
  const selected = traits.find((t) => t.id === selectedId) ?? null;
  const [evidence, setEvidence] = React.useState<StrandTrait | null>(null);
  const [evidenceOpen, setEvidenceOpen] = React.useState(false);
  const [focusBusy, setFocusBusy] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);

  const verdict = buildVerdict(firstName, traits, baseline);
  const measured = traits.some((t) => t.value != null);
  const overallRead = readLevel(samples.roundsOnFile);
  const tourLabel = traits.find((t) => t.tourLabel === 'LPGA') ? 'LPGA' : 'Tour';

  function openEvidence(t: StrandTrait) {
    select(t.id, 'key');
    setEvidence(t);
    setEvidenceOpen(true);
  }

  async function makeFocus(t: StrandTrait) {
    if (!coachId) return;
    setFocusBusy(true);
    try {
      const res = await createFocusArea({
        player_id: playerId,
        coach_id: coachId,
        area_type: familyOf(t.family).areaType,
        title: t.label,
        description: `From the Genome: ${t.label} ${t.valueText ?? ''}`.trim(),
        target_metric: null,
        current_value: null,
        target_value: null,
      });
      if (res.success) {
        fairwayToast.success(`Focus area created: ${t.label}`);
        setEvidenceOpen(false);
        router.refresh();
      } else {
        fairwayToast.danger(res.error ?? 'Could not create the focus area');
      }
    } catch {
      fairwayToast.danger('Could not create the focus area');
    } finally {
      setFocusBusy(false);
    }
  }

  return (
    <div data-slot="genome-page" className="mx-auto flex w-full max-w-[1120px] flex-col px-4 pb-16 pt-4 md:px-8 md:pt-8">
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="flex flex-col gap-2">
        <h1 className="font-fw-display text-h1 text-text-primary md:text-display">{playerName}</h1>
        {archetype ? <p className="font-fw-sans text-body text-text-secondary">{archetype}</p> : null}
        {verdict ? (
          <p className="mt-1 max-w-[60ch] font-fw-sans text-body-lg text-text-primary">{verdict}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
          <p className="mr-3 font-fw-sans text-caption tabular-nums text-text-tertiary">
            {samples.roundsOnFile != null ? `${samples.roundsOnFile} rounds on file · ${readWord(samples.roundsOnFile)}` : 'No rounds on file'}
          </p>
          {form ? (
            <Button variant="ghost" size="sm" className="mr-3 tabular-nums" onClick={() => setFormOpen((o) => !o)} aria-expanded={formOpen}>
              Form {form.value}
              {form.qualityLabel ? <span className="ml-1 text-text-secondary">· {form.qualityLabel}</span> : null}
            </Button>
          ) : null}
          <nav aria-label={`${firstName}'s other views`} className="flex flex-wrap items-center">
            <QuietLink href={`/golf/dashboard/players/${playerId}/game`}>Fingerprint</QuietLink>
            <QuietLink href={`/golf/dashboard/players/${playerId}/game?tab=scouting`}>Scouting report</QuietLink>
            <QuietLink href={`/golf/dashboard/coachhelm/genome/compare?p1=${playerId}`}>Compare</QuietLink>
          </nav>
        </div>
        {form && formOpen ? (
          <ul className="mt-1 max-w-[60ch] space-y-0.5 font-fw-sans text-caption tabular-nums text-text-secondary">
            {form.formula.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </header>

      {/* ── The stage: the strand ────────────────────────────────── */}
      <section
        aria-labelledby="genome-strand-title"
        data-slot="genome-strand"
        className="mt-8 rounded-card border border-border-subtle bg-surface px-4 pb-4 pt-4 md:mt-10 md:px-6 md:pb-6 md:pt-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="genome-strand-title" className="font-fw-sans text-h3 text-text-primary">
              Skill strand
            </h2>
            <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">
              Up is better than the {baseline === 'team' ? 'team average' : tourLabel}, down is worse.
            </p>
          </div>
          <BaselineSwitch value={baseline} onChange={setBaseline} tourLabel={tourLabel} />
        </div>

        {measured ? (
          <>
            <StrandBand
              className="mt-5"
              traits={traits}
              baseline={baseline}
              selectedId={selectedId}
              onSelect={select}
              ariaLabel={`${firstName}'s skills against the ${baseline === 'team' ? 'team' : tourLabel}`}
            />
            <div className="mt-4 border-t border-border-subtle pt-3">
              <StrandReadout trait={selected} baseline={baseline} onOpenEvidence={openEvidence} />
            </div>
            <p className="mt-2 font-fw-sans text-caption text-text-tertiary">
              {overallRead === 'thin'
                ? `${readWord(samples.roundsOnFile)} rounds. Gaps draw as outlines until the sample firms up.`
                : 'Bar length is scaled per skill; the number is the real gap. Outlines are thin reads.'}
            </p>
            <StrandTable traits={traits} caption={`${playerName}: skills against team and ${tourLabel}`} />
          </>
        ) : (
          <p className="mt-6 font-fw-sans text-body text-text-secondary">
            {samples.roundsOnFile != null && samples.roundsOnFile > 0
              ? `Early read · n=${samples.roundsOnFile}. The strand fills in once ${firstName} has 5 scored rounds on file.`
              : `The strand fills in once ${firstName} has 5 scored rounds on file.`}
          </p>
        )}
      </section>

      {/* ── Ledger ───────────────────────────────────────────────── */}
      {measured ? (
        <section aria-labelledby="genome-ledger" className="mt-12 flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="genome-ledger" className="font-fw-sans text-h3 text-text-primary">
              Every skill, ranked
            </h2>
            <p className="font-fw-sans text-caption text-text-tertiary">
              vs {baseline === 'team' ? 'team average' : tourLabel} · tap for evidence
            </p>
          </div>
          <div>
            <TraitLedgerHead baseline={baseline} tourLabel={tourLabel} />
            <TraitLedger traits={traits} baseline={baseline} selectedId={selectedId} onOpen={openEvidence} />
          </div>
        </section>
      ) : null}

      <div className="mt-12">{tendencies}</div>

      {children ? <div className="mt-12">{children}</div> : null}

      <TraitEvidenceSheet
        trait={evidence}
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
        onMakeFocus={coachId ? makeFocus : undefined}
        focusBusy={focusBusy}
      />
    </div>
  );
}

function QuietLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex h-11 items-center rounded-fw-md px-2 font-fw-sans text-body-sm font-medium text-accent-700 transition-colors duration-150',
        'first:-ml-2 active:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
      )}
    >
      {children}
    </Link>
  );
}
