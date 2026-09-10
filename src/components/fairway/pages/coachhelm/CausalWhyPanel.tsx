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
 * ROOT-CAUSE CHAINS: above that list, any two rows that connect (one's effect is
 * the next one's cause) are joined by `composeCausalChains` into a single chain
 * card. This is the one derivation the panel does, and it is done HERE rather
 * than in the read action deliberately — composing from the array the panel
 * already holds means a chain can only ever cite hops the coach can also see
 * listed individually below it. It adds no claim: every hop is a row the engine
 * detected and confirmed on its own, the chain's confidence is its WEAKEST hop,
 * and the card says so. Nothing renders when nothing connects — which is most
 * players, since almost every stored row ends at `score_to_par`.
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

import { useCallback, useMemo, useState } from 'react';
import { ArrowRight, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fwHaptic } from '@/lib/fairway/haptics';
// Imported from each module's own leaf path, not the top `@/components/fairway`
// barrel — this file sits under pages/coachhelm/ (re-exported from that
// barrel via pages/coachhelm/index.ts), so importing the barrel back here
// created an import cycle, flagged by npm run check:cycles.
import { Surface, Inset } from '@/components/fairway/surfaces';
import { InsetGroup } from '@/components/fairway/surfaces/inset-group';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { Badge, StatusPill } from '@/components/fairway/controls';
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

/** What the phone detail Sheet is showing: one chain or one relationship. */
type CausalDetail =
  | { kind: 'chain'; chain: CausalChain }
  | { kind: 'rel'; rel: CausalRelationshipRow };

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
  // Pure, deterministic, and over the SAME array rendered below — see header.
  const chains = useMemo(() => composeCausalChains(relationships), [relationships]);

  // Phone detail Sheet (player-development.mobile.md #2). `detail` is kept
  // through the close animation; `detailOpen` drives the sheet.
  const [detail, setDetail] = useState<CausalDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const openDetail = useCallback((next: CausalDetail) => {
    fwHaptic('selection');
    setDetail(next);
    setDetailOpen(true);
  }, []);

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
        <>
          {/* Phone: ONE matte group of seam rows (path · type and readouts),
              each opening the full reading in a Sheet. CSS-gated below `md`
              so the coach board (md and up) is untouched and the first
              paint never flips. */}
          <InsetGroup variant="matte" className="md:hidden">
            {chains.map((chain) => (
              <CausalChainRow
                key={chain.metrics.join('>')}
                chain={chain}
                onOpen={() => openDetail({ kind: 'chain', chain })}
              />
            ))}
            {relationships.map((rel) => (
              <CausalRelationshipRow
                key={rel.id}
                rel={rel}
                onOpen={() => openDetail({ kind: 'rel', rel })}
              />
            ))}
          </InsetGroup>
          <div className="hidden flex-col gap-4 md:flex">
            {/* Chains first — the deepest one is the closest thing to a root
                cause the engine can state. Absent for most players; renders
                nothing at all rather than an empty section. */}
            {chains.map((chain) => (
              <CausalChainCard key={chain.metrics.join('>')} chain={chain} />
            ))}
            {relationships.map((rel) => (
              <CausalRelationshipRowCard key={rel.id} rel={rel} />
            ))}
          </div>
          <CausalDetailSheet
            detail={detail}
            open={detailOpen}
            onClose={() => setDetailOpen(false)}
          />
        </>
      )}
    </section>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * PathLine — the nodes of a relationship or chain in order, joined by the
 * accent arrow glyph (an icon, never a text arrow; "to" for screen readers).
 * ────────────────────────────────────────────────────────────────────────── */

function PathLine({ nodes, className }: { nodes: string[]; className?: string }) {
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5', className)}>
      {nodes.map((node, i) => (
        <span key={`${node}-${i}`} className="inline-flex items-center gap-x-1.5">
          {i > 0 ? (
            <>
              <span className="sr-only"> to </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-accent-600" aria-hidden />
            </>
          ) : null}
          <span>{node}</span>
        </span>
      ))}
    </span>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Phone rows — one seam row per chain or relationship; the detail is a Sheet.
 * ────────────────────────────────────────────────────────────────────────── */

function CausalChainRow({ chain, onOpen }: { chain: CausalChain; onOpen: () => void }) {
  const nodes = chainNodeLabels(chain);
  return (
    <InsetGroup.Row
      as="button"
      align="start"
      trailing={<ChevronRight aria-hidden />}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <PathLine nodes={nodes} className="font-fw-sans text-body-sm font-medium text-text-primary" />
      <span className="mt-0.5 block font-fw-sans text-caption text-text-tertiary">
        Root-cause chain · {chain.hops.length} steps · weakest link {pct(chain.confidence)} confidence
      </span>
    </InsetGroup.Row>
  );
}

function CausalRelationshipRow({
  rel,
  onOpen,
}: {
  rel: CausalRelationshipRow;
  onOpen: () => void;
}) {
  const typeLabel = TYPE_LABELS[rel.relationship_type] ?? humanize(rel.relationship_type);
  return (
    <InsetGroup.Row
      as="button"
      align="start"
      trailing={<ChevronRight aria-hidden />}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <PathLine
        nodes={[causeLabel(rel), effectLabel(rel)]}
        className="font-fw-sans text-body-sm font-medium text-text-primary"
      />
      <span className="mt-0.5 block font-fw-sans text-caption text-text-tertiary">
        {typeLabel}
        {rel.dose_response ? ' · dose-responsive' : ''} · {pct(rel.strength)} strength ·{' '}
        {pct(rel.confidence)} confidence
      </span>
    </InsetGroup.Row>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Phone detail Sheet — the same reading the desktop card gives: the path,
 * the mechanism sentence, and the readouts as label · value rows.
 * ────────────────────────────────────────────────────────────────────────── */

function ReadoutRow({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <InsetGroup.Row
      align="start"
      trailing={
        <span className="font-fw-mono text-body font-semibold tabular-nums text-text-primary">
          {value}
        </span>
      }
    >
      <span className="block font-fw-sans text-body-sm font-medium text-text-primary">{label}</span>
      <span className="block font-fw-sans text-caption text-text-tertiary">{hint}</span>
    </InsetGroup.Row>
  );
}

function CausalDetailSheet({
  detail,
  open,
  onClose,
}: {
  detail: CausalDetail | null;
  open: boolean;
  onClose: () => void;
}) {
  let title = 'Relationship';
  let description: string | undefined;
  if (detail?.kind === 'chain') {
    const nodes = chainNodeLabels(detail.chain);
    title = `${nodes[0] ?? ''} to ${nodes[nodes.length - 1] ?? ''}`;
    description = `Root-cause chain, ${detail.chain.hops.length} steps`;
  } else if (detail?.kind === 'rel') {
    const typeLabel =
      TYPE_LABELS[detail.rel.relationship_type] ?? humanize(detail.rel.relationship_type);
    title = `${causeLabel(detail.rel)} to ${effectLabel(detail.rel)}`;
    description = detail.rel.dose_response ? `${typeLabel}, dose-responsive` : typeLabel;
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      description={description}
    >
      <Sheet.Body className="flex flex-col gap-4">
        {detail?.kind === 'chain' ? (
          <>
            <PathLine
              nodes={chainNodeLabels(detail.chain)}
              className="font-fw-display text-body-lg font-medium text-text-primary"
            />
            <p className="font-fw-sans text-body leading-6 text-text-secondary">
              Each step was detected separately over this player&apos;s own rounds.
              Read the chain as the lead to check first. The engine did not test
              the path end to end.
            </p>
            <InsetGroup>
              <ReadoutRow
                label="Weakest link: confidence"
                value={pct(detail.chain.confidence)}
                hint="The least certain step in the chain"
              />
              <ReadoutRow
                label="Weakest link: strength"
                value={pct(detail.chain.strength)}
                hint="The loosest step in the chain"
              />
            </InsetGroup>
          </>
        ) : detail?.kind === 'rel' ? (
          <>
            {detail.rel.mechanism ? (
              <p className="font-fw-sans text-body leading-6 text-text-secondary">
                {detail.rel.mechanism}
              </p>
            ) : null}
            <InsetGroup>
              <ReadoutRow
                label="Effect strength"
                value={pct(detail.rel.strength)}
                hint="How strongly the two move together"
              />
              <ReadoutRow
                label="Confidence"
                value={pct(detail.rel.confidence)}
                hint="How sure the engine is it's causal"
              />
              <ReadoutRow
                label="You can change this"
                value={pct(detail.rel.intervention_potential)}
                hint="How much practice can shift it"
              />
            </InsetGroup>
          </>
        ) : null}
      </Sheet.Body>
    </Sheet>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * One chain — the joined path, and the honesty line that keeps it a lead
 * rather than a proof. The per-hop mechanism sentences are deliberately NOT
 * repeated here; each hop keeps its own card below.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Node labels come from the hop rows' own `cause`/`effect` fields, so the chain
 * speaks the exact vocabulary the individual cards do — no second label map to
 * drift. `metrics` drives the composition; these drive the reading.
 */
function chainNodeLabels(chain: CausalChain): string[] {
  const first = chain.hops[0];
  if (!first) return [];
  return [causeLabel(first), ...chain.hops.map((hop) => effectLabel(hop))];
}

function CausalChainCard({ chain }: { chain: CausalChain }) {
  const nodes = chainNodeLabels(chain);
  const endpoints = `${nodes[0] ?? ''} to ${nodes[nodes.length - 1] ?? ''}`;

  return (
    <Surface
      padding="md"
      className="flex flex-col gap-4"
      role="group"
      aria-label={`Root-cause chain: ${endpoints}`}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <Badge tone="accent" variant="outline" size="sm">
          Root-cause chain
        </Badge>
        <span className="font-fw-sans text-body-sm font-normal text-text-tertiary">
          {chain.hops.length} steps
        </span>
      </div>

      {/* The path itself: every node in order, the shared metric named once. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        {nodes.map((node, i) => (
          <span key={node} className="flex items-center gap-x-2.5">
            {i > 0 ? (
              <ArrowRight
                className="h-4 w-4 flex-shrink-0 text-accent-600"
                aria-hidden
              />
            ) : null}
            <span className="font-fw-display text-body-lg font-medium text-text-primary">
              {node}
            </span>
          </span>
        ))}
      </div>

      <p className="font-fw-sans text-body text-text-secondary leading-6">
        Each step was detected separately over this player&apos;s own rounds.
        Read the chain as the lead to check first. The engine did not test the
        path end to end.
      </p>

      {/* A chain is only as trustworthy as its thinnest link, so both readouts
          report the weakest hop rather than an average or a product. */}
      <Inset padding="sm" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CausalReadout
          label="Weakest link: confidence"
          value={pct(chain.confidence)}
          hint="The least certain step in the chain"
        />
        <CausalReadout
          label="Weakest link: strength"
          value={pct(chain.strength)}
          hint="The loosest step in the chain"
        />
      </Inset>
    </Surface>
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
