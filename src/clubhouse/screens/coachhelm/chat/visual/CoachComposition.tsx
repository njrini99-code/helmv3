'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Measurement, MeasurementSeries } from '@/lib/coachhelm/v3/chat/provenance';
import type { ResolvedBlock, ValidatedComposition } from '@/lib/coachhelm/v3/chat/visuals/composition';
import {
  bucketBlock,
  formatValue,
  measurementTable,
  rankRows,
  sampleWords,
  shortMetric,
  sourceLine,
  teamTable,
  trendBlock,
  type AskTable,
  type EvidenceTile,
} from '../../../../data/coachhelm-chat-thread';
import { changeTone } from '../../../../lib/format';
import { useChReducedMotion } from '../../../../lib/reduced-motion';
import { DataTable, Drawing, Ranking, TableToggle, TeamTable, Tiles, Trend } from '../Evidence';

/**
 * A model-designed visual (`ValidatedComposition`, visuals/composition.ts; docs/architecture/coachhelm-visual-playbook.md):
 * the model chose the blocks, their order, the title and the words; every figure was copied from a read by
 * compile-composition.ts, so nothing here computes or invents one. Each block reuses the thread's own evidence pieces, so a
 * composed trend and a plain one read the same.
 *
 * Card anatomy (playbook §2): whose figures (caption) → the finding as a title → the takeaway → the blocks, the one that
 * answers first → the coverage notes the hidden reads carried → one provenance line at the foot. Never "n="; the sample is
 * said in words.
 *
 * Motion (playbook §3, the Clubhouse CoachHelm chat exception in .claude/rules/clubhouse.md): only a visual that arrives in a
 * live answer moves, decided once when it mounts (`live` is whether its turn was streaming then), never from a busy flag
 * later; a restored thread, reduced motion and Animations off draw it final. The stylesheet moves opacity, transform and the
 * line's path length only, on the D-64 beats (coachhelm-thread.css, `.ch-th-cv[data-live]`).
 */

/** Playbook §3 offsets: between blocks (capped at six), from a block to its figure, and between bars. */
const BLOCK_STEP_MS = 80;
const FIGURE_LAG_MS = 140;
const BAR_STEP_MS = 50;

const NOTE_WORD = { measured: 'Measured', association: 'Pattern', hypothesis: 'Hypothesis' } as const;

/** Blocks that read best at full width whatever the layout. */
const FULL_WIDTH = new Set<ResolvedBlock['type']>(['headline', 'note', 'compare', 'kpis']);

/** Every measurement and series a composition draws, for its caption and its provenance line. */
function figuresOf(blocks: ResolvedBlock[]): { ms: Measurement[]; series: MeasurementSeries[] } {
  const ms: Measurement[] = [];
  const series: MeasurementSeries[] = [];
  for (const b of blocks) {
    if (b.type === 'headline') ms.push(b.measurement);
    else if (b.type === 'kpis' || b.type === 'ranking' || b.type === 'split' || b.type === 'compare') ms.push(...b.measurements);
    else if (b.type === 'trend' || b.type === 'bands') series.push(b.series);
  }
  return { ms, series };
}

/** Whose figures these are: one player or the team by name, else how many players. */
function entityOf(ms: Measurement[], series: MeasurementSeries[]): string | null {
  const entities = new Map<string, { kind: string; label: string }>();
  for (const e of [...ms.map((m) => m.entity), ...series.map((s) => s.entity)]) entities.set(e.id, e);
  const all = [...entities.values()];
  if (all.length === 0) return null;
  if (all.length === 1) return all[0]!.label;
  const players = all.filter((e) => e.kind === 'player');
  return players.length === all.length ? `${players.length} players` : (all.find((e) => e.kind === 'team')?.label ?? null);
}

/** The one provenance line: the largest sample in words, the window and when it was computed. */
function provenanceOf(ms: Measurement[], series: MeasurementSeries[]): string | null {
  const rounds = Math.max(0, ...ms.filter((m) => m.sample_unit === 'rounds').map((m) => m.sample_size), ...series.filter((s) => s.points.every((p) => p.bucket === null)).map((s) => s.points.length));
  const first = ms[0] ?? series[0];
  if (!first) return null;
  const attempts = rounds === 0 ? Math.max(0, ...ms.map((m) => m.sample_size), ...series.map((s) => s.points.reduce((a, p) => a + p.sample_size, 0))) : 0;
  const unit: Measurement['sample_unit'] = rounds > 0 ? 'rounds' : (ms[0]?.sample_unit ?? 'attempts');
  const asOf = [...ms.map((m) => m.as_of), ...series.map((s) => s.as_of)].sort().pop() ?? first.as_of;
  return sourceLine({ sample_size: rounds || attempts, sample_unit: unit, window_start: first.window_start, window_end: first.window_end, as_of: asOf }) || null;
}

/** The headline's verdict, by the metric's own direction: strokes gained against the baseline, anything else against its benchmark. */
function verdictOf(m: Measurement): { tone: 'good' | 'loss'; words: string } | null {
  if (m.value === null) return null;
  if (m.unit === 'strokes') {
    const t = changeTone(m.value, false, 1);
    return t === 'is-gain' ? { tone: 'good', words: 'Gains on the baseline' } : t === 'is-loss' ? { tone: 'loss', words: 'Loses to the baseline' } : null;
  }
  const b = m.benchmark && !m.benchmark.omitted_for_cohort ? m.benchmark : null;
  if (!b || !m.direction || m.value === b.value) return null;
  const better = m.direction === 'higher_better' ? m.value > b.value : m.value < b.value;
  return better ? { tone: 'good', words: `Better than ${b.source}` } : { tone: 'loss', words: `Behind ${b.source}` };
}

function Headline({ block }: { block: Extract<ResolvedBlock, { type: 'headline' }> }) {
  const m = block.measurement;
  const verdict = verdictOf(m);
  const reference =
    m.denominator !== null && m.unit === 'percent' && m.value !== null
      ? `${Math.round((m.value / 100) * m.denominator)} of ${m.denominator}`
      : m.sample_size > 0
        ? sampleWords(m.sample_size, m.sample_unit)
        : null;
  return (
    <div className="ch-th-cv__hero">
      <div className="ch-th-cv__hero-words">
        <p className="ch-th-cv__hero-label">{block.label ?? m.metric_label}</p>
        <p className="ch-th-cv__hero-sub">{[block.label ? m.metric_label : null, reference].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="ch-th-cv__hero-fig">
        <b className="ch-th-cv__hero-n ch-num">{formatValue(m.value, m.unit, m)}</b>
        {verdict && (
          <span className="ch-th-cv__chip" data-tone={verdict.tone}>
            {verdict.words}
          </span>
        )}
      </div>
    </div>
  );
}

/** Strokes gained either side of zero, as the thread's legs: green above the baseline, amber below, an even leg drawn as no bar. */
function Split({ ms }: { ms: Measurement[] }) {
  const rows = ms.filter((m): m is Measurement & { value: number } => m.value !== null);
  const max = Math.max(0.5, ...rows.map((m) => Math.abs(m.value)));
  return (
    <div className="ch-th-legs" role="list" aria-label="Strokes gained by part of the game">
      {rows.map((m, i) => {
        const tone = changeTone(m.value, false, 1);
        const label = m.metric_label.replace(/^strokes gained[:\s-]*/i, '').trim() || m.metric_label;
        return (
          <div key={m.metric_id + m.entity.id} className="ch-th-leg" role="listitem" data-sign={tone === 'is-gain' ? 'gain' : tone === 'is-loss' ? 'loss' : undefined} style={{ '--ch-i': i } as CSSProperties}>
            <span className="ch-th-leg__label">{label.charAt(0).toUpperCase() + label.slice(1)}</span>
            <span className="ch-th-leg__track" aria-hidden="true">
              {tone && <span style={{ width: `${(Math.abs(m.value) / max) * 50}%` }} />}
            </span>
            <span className="ch-th-leg__val">{formatValue(m.value, m.unit)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** A figure block: its own small heading and the quiet "View as table", then the drawing or its table. */
function FigureBlock({ title, table, children }: { title: string; table: AskTable | null; children: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div className="ch-th-cv__fig">
      <div className="ch-th-cv__fig-head">
        <p className="ch-th-cv__fig-title">{title}</p>
        {table && <TableToggle pressed={asTable} onToggle={() => setAsTable((v) => !v)} />}
      </div>
      {asTable && table ? <DataTable table={table} /> : children}
    </div>
  );
}

function Block({ block, drawIn }: { block: ResolvedBlock; drawIn: boolean }) {
  switch (block.type) {
    case 'headline':
      return <Headline block={block} />;
    case 'note':
      return (
        <p className="ch-th-cv__note" data-kind={block.kind}>
          <span className="ch-th-cv__kind">{NOTE_WORD[block.kind]}</span> {block.text}
        </p>
      );
    case 'kpis': {
      const tiles: EvidenceTile[] = block.measurements.map((m) => {
        const t = m.unit === 'strokes' ? changeTone(m.value, false, 1) : '';
        return { label: m.metric_label, value: formatValue(m.value, m.unit, m), sub: m.sample_size > 0 ? sampleWords(m.sample_size, m.sample_unit) : null, tone: t === 'is-loss' ? 'loss' : t === 'is-gain' ? 'gain' : 'plain' };
      });
      return (
        <FigureBlock title={block.measurements[0]?.entity.label ?? 'Figures'} table={measurementTable(block.measurements, 'Figures')}>
          <Tiles tiles={tiles} />
        </FigureBlock>
      );
    }
    case 'trend': {
      const t = trendBlock(block.series);
      const shown = block.reference === 'none' ? { ...t, reference: null } : t;
      return (
        <FigureBlock title={block.series.metric_label} table={t.table}>
          <Trend block={shown} drawIn={drawIn} />
        </FigureBlock>
      );
    }
    case 'bands': {
      const b = bucketBlock(block.series, block.highlight);
      return (
        <FigureBlock title={b.title} table={b.table}>
          <Drawing block={b} />
        </FigureBlock>
      );
    }
    case 'ranking': {
      const first = block.measurements[0]!;
      const { rows, signed } = rankRows(block.measurements, block.order, block.highlight);
      return (
        <FigureBlock title={first.metric_label} table={{ caption: first.metric_label, columns: ['Rank', 'Player', shortMetric(first.metric_label), 'Sample'], rows: rows.map((r) => [String(r.rank), r.label, r.display, r.of ?? 'No sample']) }}>
          <Ranking rows={rows} signed={signed} label={first.metric_label} highlight={block.highlight} />
        </FigureBlock>
      );
    }
    case 'split':
      return (
        <FigureBlock title="Strokes gained by part of the game" table={measurementTable(block.measurements, 'Strokes gained by part of the game')}>
          <Split ms={block.measurements} />
        </FigureBlock>
      );
    case 'compare': {
      const team = teamTable(block.measurements);
      return (
        <FigureBlock title={`${team.players.length} players`} table={null}>
          <TeamTable team={team} label={`${team.players.length} players`} />
        </FigureBlock>
      );
    }
  }
}

export function CoachComposition({ composition, live = false }: { composition: ValidatedComposition; live?: boolean }) {
  const reduced = useChReducedMotion();
  // Whether it arrived in the live answer is decided once, at mount: one restored with the thread never moves, and the answer
  // finishing does not replay or snap anything. Reduced motion is read on every render, so a setting that resolves after
  // hydration (its server snapshot is "off") or is turned on mid-answer still draws the visual final.
  const [arrivedLive] = useState(live);
  const animate = arrivedLive && !reduced;
  const split = composition.layout === 'split';
  const { ms, series } = figuresOf(composition.blocks);
  const entity = entityOf(ms, series);
  const provenance = provenanceOf(ms, series);
  // In a two-up grid, a half-width block left alone at the end of a run takes the full row instead of leaving a hole.
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
  const beat = (i: number) => ({ '--ch-b': `${Math.min(i, 6) * BLOCK_STEP_MS}ms` }) as CSSProperties;
  return (
    <section
      className="ch-th-cv"
      aria-label={composition.title}
      data-live={animate ? '' : undefined}
      data-layout={composition.layout}
      data-artifact={composition.artifactId}
      // The playbook's offsets (§3): a figure starts once its block has mostly arrived; bars follow one another.
      style={{ '--ch-cv-lag': `${FIGURE_LAG_MS}ms`, '--ch-cv-step': `${BAR_STEP_MS}ms` } as CSSProperties}
    >
      <header className="ch-th-cv__head ch-th-cv__in" style={beat(0)}>
        {entity && <p className="ch-th-cv__entity">{entity}</p>}
        <h3 className="ch-th-cv__title">{composition.title}</h3>
        {composition.lede && <p className="ch-th-cv__lede">{composition.lede}</p>}
      </header>
      <div className="ch-th-cv__grid">
        {composition.blocks.map((b, i) => (
          <div key={i} className="ch-th-cv__block ch-th-cv__in" data-type={b.type} data-wide={!split || FULL_WIDTH.has(b.type) || spans.has(i) ? '' : undefined} style={beat(i + 1)}>
            <Block block={b} drawIn={animate} />
          </div>
        ))}
      </div>
      {composition.coverageNotes.map((note) => (
        <p key={note} className="ch-th-cv__cover">
          <b>Partial data</b> {note}
        </p>
      ))}
      {provenance && <p className="ch-th-fig__src ch-th-cv__src">{provenance}</p>}
    </section>
  );
}
