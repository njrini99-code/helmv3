'use client';

/**
 * ============================================================================
 * CoachHelm · chat · model-designed visuals
 * ----------------------------------------------------------------------------
 * Draws a `ValidatedComposition` (the model's design, with every figure copied
 * from a read by `compile-composition.ts`) and the fixed `sg_anatomy` scene.
 * The blocks reuse the evidence renderers, so a composed trend and a plain one
 * look the same; what the model adds is the choice, the order, the emphasis
 * and the words around them.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { InlineNotice } from '@/components/fairway/feedback';
import type { ResolvedBlock, ValidatedComposition } from '@/lib/coachhelm/v3/chat/visuals/composition';
import type { ValidatedVisualArtifact } from '@/lib/coachhelm/v3/chat/visuals/schema';
import { DivergingRows, EvidenceCard, Headline } from './EvidenceFigures';
import { EvidenceReveal } from './EvidenceMotion';
import {
  BucketChart,
  ComparisonTable,
  formatValue,
  MetricPanel,
  RankingList,
  StrokesGainedFigure,
  strokesGainedCategories,
  TrendChart,
} from './EvidenceVisuals';

const NOTE_KIND: Record<'measured' | 'association' | 'hypothesis', { label: string; className: string }> = {
  measured: { label: 'Measured', className: 'bg-accent-wash text-accent-ink' },
  association: { label: 'Pattern', className: 'bg-surface-sunken text-text-secondary' },
  hypothesis: { label: 'Hypothesis', className: 'bg-fw-warning-bg text-fw-warning-ink' },
};

/** One sentence of interpretation, labelled for what kind of claim it is. */
function NoteRow({ kind, text }: { kind: keyof typeof NOTE_KIND; text: string }) {
  const k = NOTE_KIND[kind];
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={cn(
          'mt-0.5 shrink-0 rounded-fw-sm px-1.5 py-0.5 font-fw-sans text-caption font-semibold',
          k.className,
        )}
      >
        {k.label}
      </span>
      <p className="font-fw-sans text-body text-text-primary">{text}</p>
    </div>
  );
}

/** The one figure the answer turns on. */
function HeadlineBlock({ block }: { block: Extract<ResolvedBlock, { type: 'headline' }> }) {
  const m = block.measurement;
  const reference =
    m.denominator !== null && m.unit === 'percent' && m.value !== null
      ? `${Math.round((m.value / 100) * m.denominator)} of ${m.denominator}`
      : m.benchmark && !m.benchmark.omitted_for_cohort
        ? `${m.benchmark.source} ${formatValue(m.benchmark.value, m.unit)}`
        : null;
  const caption = [
    block.label ? m.metric_label : null,
    reference,
    m.sample_size > 0 ? `${m.sample_size} ${m.sample_unit}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  // The one number the answer turns on, as a hero strip rather than a card of
  // empty space: label and context on the left, the figure large on the right.
  return (
    <section
      data-slot="evidence-card"
      aria-label={`${block.label ?? m.metric_label} for ${m.entity.label}: ${formatValue(m.value, m.unit)}`}
      className="flex items-center justify-between gap-4 rounded-card border border-border-subtle bg-surface px-4 py-4 sm:px-5"
    >
      <div className="min-w-0">
        <p className="font-fw-sans text-caption text-text-tertiary">{m.entity.label}</p>
        <p className="font-fw-sans text-body font-semibold text-text-primary">
          {block.label ?? m.metric_label}
        </p>
        {caption && <p className="mt-0.5 font-fw-sans text-caption text-text-secondary">{caption}</p>}
      </div>
      <p className="shrink-0 font-fw-sans text-display tabular-nums text-text-primary">
        {formatValue(m.value, m.unit)}
      </p>
    </section>
  );
}

function BlockView({ block, hasHeadline }: { block: ResolvedBlock; hasHeadline: boolean }) {
  switch (block.type) {
    case 'headline':
      return <HeadlineBlock block={block} />;
    case 'kpis':
      return <MetricPanel measurements={block.measurements} />;
    case 'trend':
      return (
        <TrendChart
          series={block.series}
          reference={block.reference === 'benchmark' ? 'benchmark' : block.reference}
        />
      );
    case 'bands':
      return <BucketChart series={block.series} highlight={block.highlight} />;
    case 'ranking':
      return (
        <RankingList measurements={block.measurements} order={block.order} highlight={block.highlight} />
      );
    case 'split': {
      const sg = strokesGainedCategories(block.measurements);
      return sg ? (
        <StrokesGainedFigure sg={sg} showHeadline={!hasHeadline} />
      ) : (
        <MetricPanel measurements={block.measurements} />
      );
    }
    case 'compare':
      return <ComparisonTable measurements={block.measurements} />;
    case 'note':
      return <NoteRow kind={block.kind} text={block.text} />;
  }
}

/** Blocks that read best at full width whatever the layout. */
const FULL_WIDTH = new Set<ResolvedBlock['type']>(['headline', 'note', 'compare', 'kpis']);

/**
 * A composition: the model's title and lede, then its blocks in its order.
 * `split` sets figure blocks two-up from `md`; a phone always stacks.
 */
export function CompositionVisual({ composition }: { composition: ValidatedComposition }) {
  const split = composition.layout === 'split';
  const hasHeadline = composition.blocks.some((b) => b.type === 'headline');
  // In a two-up grid, a half-width block left alone at the end of a run takes
  // the full row instead of leaving an empty cell beside it.
  const spans = new Set<number>();
  if (split) {
    let run: number[] = [];
    const close = () => {
      if (run.length % 2 === 1) spans.add(run[run.length - 1]!);
      run = [];
    };
    composition.blocks.forEach((b, i) => (FULL_WIDTH.has(b.type) ? close() : run.push(i)));
    close();
  }
  return (
    <section aria-label={composition.title} data-slot="evidence-composition" className="flex flex-col gap-3">
      <EvidenceReveal index={0}>
        <header className="flex flex-col gap-1">
          <h3 className="font-fw-sans text-h3 text-text-primary">{composition.title}</h3>
          {composition.lede && (
            <p className="font-fw-sans text-body text-text-secondary">{composition.lede}</p>
          )}
        </header>
      </EvidenceReveal>
      <div className={cn('grid grid-cols-1 gap-3', split && 'md:grid-cols-2')}>
        {composition.blocks.map((block, i) => (
          <EvidenceReveal
            key={i}
            index={i + 1}
            className={cn(
              split && (FULL_WIDTH.has(block.type) || spans.has(i)) && 'md:col-span-2',
              'min-w-0',
            )}
          >
            <BlockView block={block} hasHeadline={hasHeadline} />
          </EvidenceReveal>
        ))}
      </div>
      {composition.coverageNotes.map((note) => (
        <InlineNotice key={note} tone="info" title="Partial data">
          {note}
        </InlineNotice>
      ))}
    </section>
  );
}

/** The fixed strokes-gained scene, drawn with the same diverging rows as a composed split. */
export function SgAnatomyVisual({ artifact }: { artifact: ValidatedVisualArtifact }) {
  const fmt = (v: number) => formatValue(v, 'strokes');
  const worst = [...artifact.legs].sort((a, b) => a.value - b.value)[0]!;
  const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const notes = artifact.annotations;
  return (
    <EvidenceReveal index={0} className="flex flex-col gap-3">
      <EvidenceCard
        overline={artifact.entity.label}
        title={artifact.title}
        headline={
          <Headline value={fmt(worst.value)} caption={`Largest loss: ${worst.label.toLowerCase()}`} />
        }
        provenance={[
          artifact.legs[0] ? `${artifact.legs[0].sampleSize} ${artifact.legs[0].sampleUnit}` : null,
          artifact.total ? `total ${fmt(artifact.total.value)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        ariaLabel={`${artifact.title}: ${artifact.legs.map((l) => `${l.label} ${fmt(l.value)}`).join(', ')}.`}
        tableData={{
          columns: [
            { key: 'category', label: 'Category' },
            { key: 'value', label: 'Strokes gained', numeric: true },
          ],
          rows: artifact.legs.map((l) => ({ category: label(l.label), value: fmt(l.value) })),
        }}
      >
        <DivergingRows
          rows={artifact.legs.map((l) => ({ key: l.metricId, label: label(l.label), value: l.value }))}
          format={fmt}
        />
      </EvidenceCard>
      {notes.map((n) => (
        <NoteRow key={`${n.metricId}-${n.label}`} kind={n.kind} text={n.label} />
      ))}
    </EvidenceReveal>
  );
}
