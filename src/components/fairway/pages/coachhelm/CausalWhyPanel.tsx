'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · CausalWhyPanel — "what moves together" browsing panel
 * ----------------------------------------------------------------------------
 * The component keeps its historical name; its content is CORRELATION, not
 * causation (owner decision "honest correlation", 2026-09-28, deep audit rows
 * 33/34). Pure presentation over the already-gated, deduped, ranked
 * `CausalRelationshipRow[]` from `@/app/golf/actions/causal-relationships`: it
 * does not fetch, mutate, sort or dedupe.
 *
 * Each relationship reads as "X moves with Y" (or "moves opposite to", from
 * the stored SIGN of r), a sentence stating the direction, the sample size, a
 * caveat that a pattern is not proof of cause, the engine's hedged mechanism
 * note, and readouts: link strength (|r|), confidence (1 - FDR q: how unlikely
 * the pattern is to be chance) and rounds.
 *
 * LINKED PATTERNS: rows whose metrics connect are joined by
 * `composeCausalChains` only when every hop passed the gate, no hop is score
 * arithmetic and the hop signs compose consistently. A linked pattern is a lead
 * to check, never a root cause, and the card says so.
 *
 * HONEST-EMPTY: when the array is empty (fewer than 15 rounds, nothing passed
 * the gate, or the player has not played in 60 days), render a calm
 * EmptyState. Never fabricate a relationship.
 *
 * Fairway tokens ONLY (Surface / Inset / Badge, text-text-*, font-fw-*).
 * ========================================================================== */

import { confidenceLabel } from '@/lib/coachhelm/confidence-label';
import { useMemo } from 'react';
import { ArrowLeftRight, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
// Imported from each module's own leaf path, not the top `@/components/fairway`
// barrel — this file sits under pages/coachhelm/ (re-exported from that
// barrel via pages/coachhelm/index.ts), so importing the barrel back here
// created an import cycle, flagged by npm run check:cycles.
import { Surface, Inset } from '@/components/fairway/surfaces';
import { Badge } from '@/components/fairway/controls';
import { EmptyState } from '@/components/fairway/feedback';
import {
  composeCausalChains,
  type CausalChain,
} from '@/lib/coachhelm/v3/causality/chains';
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
  scoring: 'Score to par',
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

/** "moves with" for a positive correlation, "moves opposite to" for a negative one. */
function linkVerb(sign: number): string {
  return sign < 0 ? 'moves opposite to' : 'moves with';
}

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
  title = 'What moves together in your rounds',
  className,
}: CausalWhyPanelProps) {
  // Pure, deterministic, and over the SAME array rendered below — see header.
  const chains = useMemo(() => composeCausalChains(relationships), [relationships]);

  return (
    <section className={cn('flex flex-col gap-4', className)} aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 font-fw-display text-h3 font-medium text-text-primary">
          <Lightbulb className="h-5 w-5 text-accent-ink" aria-hidden />
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
            icon={Lightbulb}
            title="No stats move together clearly enough yet"
            description="With at least 15 recent completed rounds, the engine shows which stats rise and fall together, and only when the pattern is unlikely to be chance. A pattern is not proof that one causes the other."
          />
        </Surface>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Linked patterns first. Absent for most players; renders nothing
              at all rather than an empty section. */}
          {chains.map((chain) => (
            <CausalChainCard key={chain.metrics.join('>')} chain={chain} />
          ))}
          {relationships.map((rel) => (
            <CausalRelationshipRowCard key={rel.id} rel={rel} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * One linked pattern — the joined path with each link's sign, and the
 * honesty line that keeps it a lead rather than a proof.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Node labels come from the hop rows' own `cause`/`effect` fields, so the chain
 * speaks the exact vocabulary the individual cards do.
 */
function chainNodeLabels(chain: CausalChain): string[] {
  const first = chain.hops[0];
  if (!first) return [];
  return [causeLabel(first), ...chain.hops.map((hop) => effectLabel(hop))];
}

function CausalChainCard({ chain }: { chain: CausalChain }) {
  const nodes = chainNodeLabels(chain);
  const first = nodes[0] ?? '';
  const last = nodes[nodes.length - 1] ?? '';

  return (
    <Surface
      padding="md"
      className="flex flex-col gap-4"
      role="group"
      aria-label={`Linked pattern: ${first} to ${last}`}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <Badge tone="neutral" variant="outline" size="sm">
          Linked pattern
        </Badge>
        <span className="font-fw-sans text-body-sm font-normal text-text-tertiary">
          {chain.hops.length} links
        </span>
      </div>

      {/* The path: every node in order, each link labelled with its sign. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        {nodes.map((node, i) => (
          <span key={node} className="flex items-center gap-x-2.5">
            {i > 0 ? (
              <span className="font-fw-sans text-body-sm text-text-tertiary">
                {linkVerb(chain.hopSigns[i - 1] ?? 1)}
              </span>
            ) : null}
            <span className="font-fw-display text-body-lg font-medium text-text-primary">
              {node}
            </span>
          </span>
        ))}
      </div>

      <p className="font-fw-sans text-body text-text-secondary leading-6">
        If these links hold, {first.toLowerCase()} {linkVerb(chain.sign)}{' '}
        {last.toLowerCase()}. Each link was detected separately in this
        player&apos;s rounds. It is a pattern to check, not a cause: the engine
        did not test the path end to end.
      </p>

      {/* A chain is only as trustworthy as its thinnest link, so both readouts
          report the weakest hop rather than an average or a product. */}
      <Inset padding="sm" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CausalReadout
          label="Confidence"
          value={confidenceLabel(chain.confidence) ?? '—'}
          hint="The least certain link"
        />
        <CausalReadout
          label="Link strength"
          value={pct(chain.strength)}
          hint="The loosest link"
        />
      </Inset>
    </Surface>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * One relationship — "X moves with Y", the direction in words, sample size,
 * the not-a-cause caveat, the hedged mechanism note, and readouts.
 * ────────────────────────────────────────────────────────────────────────── */

function CausalRelationshipRowCard({ rel }: { rel: CausalRelationshipRow }) {
  const sign = (rel.correlation ?? 0) < 0 ? -1 : 1;
  const cause = causeLabel(rel);
  const effect = effectLabel(rel);
  const n = rel.sample_n;

  return (
    <Surface padding="md" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span className="font-fw-display text-body-lg font-medium text-text-primary">
          {cause}
        </span>
        <ArrowLeftRight className="h-4 w-4 flex-shrink-0 text-accent-ink" aria-hidden />
        <span className="font-fw-sans text-body-sm text-text-tertiary">
          {linkVerb(sign)}
        </span>
        <span className="font-fw-display text-body-lg font-medium text-text-primary">
          {effect}
        </span>
      </div>

      <p className="font-fw-sans text-body text-text-secondary leading-6">
        In rounds with more {cause.toLowerCase()}, {effect.toLowerCase()} tends to be{' '}
        {sign < 0 ? 'lower' : 'higher'}
        {n != null ? ` (${n} rounds)` : ''}. This is a pattern in these rounds, not
        proof that one causes the other.
      </p>

      {rel.mechanism ? (
        <p className="font-fw-sans text-body-sm text-text-tertiary leading-6">
          {rel.mechanism}
        </p>
      ) : null}

      <Inset padding="sm" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CausalReadout
          label="Link strength"
          value={pct(rel.strength)}
          hint="How closely the two move together"
        />
        <CausalReadout
          label="Confidence"
          value={confidenceLabel(rel.confidence, n) ?? '—'}
          hint="How unlikely the pattern is to be chance"
        />
        <CausalReadout
          label="Rounds"
          value={n != null ? String(n) : '—'}
          hint="Rounds with both stats recorded"
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
      <span className="font-fw-sans text-caption text-text-tertiary">
        {label}
      </span>
      <span className="font-fw-mono text-body-lg font-semibold tabular-nums text-text-primary">
        {value}
      </span>
      <span className="font-fw-sans text-caption text-text-tertiary">{hint}</span>
    </div>
  );
}
