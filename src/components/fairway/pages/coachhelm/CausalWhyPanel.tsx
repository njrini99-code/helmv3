'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · CausalWhyPanel — "why your scores move" browsing panel
 * ----------------------------------------------------------------------------
 * Surfaces the GENUINE causal-engine output stored in `golf_causal_relationships`
 * (real Pearson / temporal / dose-response analysis over real rounds) as a calm,
 * flat-matte browsing panel for BOTH the player ("Why your scores move") and the
 * coach ("Why their scores move"). Pure presentation over the already-deduped,
 * already-ranked `CausalRelationshipRow[]` from
 * `@/app/golf/actions/causal-relationships` — it does NOT fetch, mutate, sort, or
 * dedupe (the read action owns all of that).
 *
 * Each relationship reads as: a plain-English `cause → effect` headline, the
 * engine's `mechanism` sentence, and a compact strip of readouts — strength,
 * confidence (as %), intervention potential, plus a "dose-responsive" badge when
 * the engine confirmed dose-response.
 *
 * HONEST-EMPTY: when the array is empty (player has <10 rounds, or no relationship
 * cleared the engine's bar — e.g. Tyler Passmore), render a calm EmptyState.
 * Never fabricate a relationship.
 *
 * Data semantics mirror the legacy `CausalRelationshipView.tsx`, but this is a
 * GROUND-UP flat-matte build — it does NOT import that component (legacy glass).
 * Fairway tokens ONLY (Surface / Inset / Badge / StatusPill, text-text-*,
 * font-fw-*, rounded-card, bg-accent-*). No confounders affordance — that column
 * is always `[]`.
 * ========================================================================== */

import { ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Surface,
  Inset,
  Badge,
  StatusPill,
  EmptyState,
} from '@/components/fairway';
import type { CausalRelationshipRow } from '@/app/golf/actions/causal-relationships';

/* ───────────────────────────────────────────────────────────────────────────
 * Plain-English labels for the thin-but-genuine content model
 * (effects: 'scoring'; causes: gir, putting, driving_accuracy,
 * practice_frequency, greens_in_regulation). Unknown values fall back to a
 * humanized form of the raw token so nothing renders blank.
 * ────────────────────────────────────────────────────────────────────────── */

const CAUSE_LABELS: Record<string, string> = {
  gir: 'Greens in regulation',
  greens_in_regulation: 'Greens in regulation',
  putting: 'Putting',
  driving_accuracy: 'Driving accuracy',
  practice_frequency: 'Practice frequency',
};

const EFFECT_LABELS: Record<string, string> = {
  scoring: 'Scoring',
};

/** Humanize an unknown snake_case token ("driving_accuracy" → "Driving accuracy"). */
function humanize(token: string): string {
  const spaced = token.replace(/_/g, ' ').trim();
  if (!spaced) return token;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function causeLabel(row: CausalRelationshipRow): string {
  return CAUSE_LABELS[row.cause] ?? humanize(row.cause);
}

function effectLabel(row: CausalRelationshipRow): string {
  return EFFECT_LABELS[row.effect] ?? humanize(row.effect);
}

/** Relationship-type → plain-English tone + label (direct | mediated seen in data). */
const TYPE_LABELS: Record<string, string> = {
  direct: 'Direct',
  mediated: 'Mediated',
  moderated: 'Moderated',
  bidirectional: 'Two-way',
};

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Props
 * ────────────────────────────────────────────────────────────────────────── */

export interface CausalWhyPanelProps {
  /** Already deduped + ranked by the read action. Empty ⇒ honest EmptyState. */
  relationships: CausalRelationshipRow[];
  /** Section title. Defaults to the player voice. */
  title?: string;
  className?: string;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function CausalWhyPanel({
  relationships,
  title = 'Why your scores move',
  className,
}: CausalWhyPanelProps) {
  return (
    <section className={cn('flex flex-col gap-4', className)} aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 font-fw-display text-h3 font-medium text-text-primary">
          <Sparkles className="h-5 w-5 text-accent-600" aria-hidden />
          {title}
        </h2>
        {relationships.length > 0 ? (
          <span className="font-fw-sans text-body-sm font-normal text-text-tertiary">
            {relationships.length}{' '}
            {relationships.length === 1 ? 'relationship' : 'relationships'}
          </span>
        ) : null}
      </div>

      {relationships.length === 0 ? (
        /* HONEST-EMPTY — never fabricate. Calm, low-density. */
        <Surface padding="lg">
          <EmptyState
            variant="subtle"
            icon={Sparkles}
            title="Not enough rounds yet to map what's driving scores"
            description="Once there are enough completed rounds, the engine surfaces the factors that actually move scoring — and how much each one matters."
          />
        </Surface>
      ) : (
        <div className="flex flex-col gap-4">
          {relationships.map((rel) => (
            <CausalRelationshipRowCard key={rel.id} rel={rel} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * One relationship — flat matte card: cause → effect headline, mechanism
 * sentence, and a readout strip (strength · confidence · intervention).
 * ────────────────────────────────────────────────────────────────────────── */

function CausalRelationshipRowCard({ rel }: { rel: CausalRelationshipRow }) {
  const typeLabel = TYPE_LABELS[rel.relationship_type] ?? humanize(rel.relationship_type);

  return (
    <Surface padding="md" className="flex flex-col gap-4">
      {/* Headline: cause → effect, with the relationship-type badge. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span className="font-fw-display text-body-lg font-medium text-text-primary">
          {causeLabel(rel)}
        </span>
        <ArrowRight className="h-4 w-4 flex-shrink-0 text-accent-600" aria-hidden />
        <span className="font-fw-display text-body-lg font-medium text-text-primary">
          {effectLabel(rel)}
        </span>
        <Badge tone="neutral" variant="outline" size="sm" className="ml-1">
          {typeLabel}
        </Badge>
        {rel.dose_response ? (
          <StatusPill tone="accent" size="sm">
            Dose-responsive
          </StatusPill>
        ) : null}
      </div>

      {/* The engine's mechanism sentence — "how this works", plain English. */}
      {rel.mechanism ? (
        <p className="font-fw-sans text-body text-text-secondary leading-6">
          {rel.mechanism}
        </p>
      ) : null}

      {/* Readout strip — strength · confidence · intervention potential. */}
      <Inset padding="sm" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CausalReadout
          label="Effect strength"
          value={pct(rel.strength)}
          hint="How strongly the two move together"
        />
        <CausalReadout
          label="Confidence"
          value={pct(rel.confidence)}
          hint="How sure the engine is it's causal"
        />
        <CausalReadout
          label="You can change this"
          value={pct(rel.intervention_potential)}
          hint="How much practice can shift it"
        />
      </Inset>
    </Surface>
  );
}

function CausalReadout({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-fw-sans text-eyebrow uppercase tracking-wide text-text-tertiary">
        {label}
      </span>
      <span className="font-fw-mono text-body-lg font-semibold tabular-nums text-text-primary">
        {value}
      </span>
      <span className="font-fw-sans text-caption text-text-tertiary">{hint}</span>
    </div>
  );
}
