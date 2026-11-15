'use client';

import { useState, type CSSProperties } from 'react';
import type { Measurement, MeasurementSeries } from '@/lib/coachhelm/v3/chat/provenance';
import type { ResolvedBlock, ValidatedComposition } from '@/lib/coachhelm/v3/chat/visuals/composition';
import { sourceLine } from '../../../../data/coachhelm-chat-thread';
import { useChReducedMotion } from '../../../../lib/reduced-motion';
import { useChPhone } from '../../../../lib/use-phone';
import { Studio, fillComposer, fromBlock } from '../studio';
import { useLightPlace } from '../../../../shell/light';

/**
 * A model-designed visual (`ValidatedComposition`, visuals/composition.ts; docs/architecture/coachhelm-visual-playbook.md):
 * the model chose the blocks, their order, the title and the words; every figure was copied from a read by
 * compile-composition.ts, so nothing here computes or invents one. Each block is drawn by the studio (chat/studio), the
 * one component per kind, so a composed trend and a plain one read the same.
 *
 * The look is the yardage book's (LOOK.md, direction A): the composition is not a card. In an answer's leaf it is that
 * leaf's ruled sections, one per block, each under its own head; the finding (its title and takeaway) is what the answer's
 * lead already says, so it is kept as the section's name and shown only where no lead stands over it (the leaf's
 * stylesheet decides). On a desk, a `split` composition opens as two pages either side of a gutter. Under the blocks: the
 * coverage notes the hidden reads carried, then one provenance line. Never "n="; a sample is said in words.
 *
 * Motion (playbook §3, the Clubhouse CoachHelm chat exception in .claude/rules/clubhouse.md): only a visual that arrives in a
 * live answer moves, decided once when it mounts (`live` is whether its turn was streaming then), never from a busy flag
 * later; a restored thread, reduced motion and Animations off draw it final. The stylesheet moves opacity, transform and the
 * line's path length only, on the D-64 beats (coachhelm-ask-studio.css, `.ch-aks-cv[data-live]`).
 */

/** Playbook §3 offsets: between blocks (capped at six), and from a block to its line. */
const BLOCK_STEP_MS = 80;
const FIGURE_LAG_MS = 140;

/** How much of a page a block takes, to set a spread's two pages level. */
const WEIGHT: Record<ResolvedBlock['type'], number> = { headline: 1, kpis: 2, note: 0.5, split: 3, trend: 2, bands: 2, ranking: 2.5, compare: 3, miss_pattern: 2.5, putt_profile: 2, season_compare: 1.5, hole_strip: 1.5 };

/**
 * A `split` composition as two pages, in the model's order: the break that sets them most level, a note staying with the
 * block it follows. A table of players needs the full width, and fewer than three blocks are one page.
 */
export function pagesOf(blocks: readonly ResolvedBlock[], layout: ValidatedComposition['layout']): number[][] {
  const all = blocks.map((_, i) => i);
  if (layout !== 'split' || blocks.length < 3 || blocks.some((b) => b.type === 'compare')) return [all];
  const total = blocks.reduce((a, b) => a + WEIGHT[b.type], 0);
  let best = 1;
  let gap = Infinity;
  let left = 0;
  for (let at = 1; at < blocks.length; at += 1) {
    left += WEIGHT[blocks[at - 1]!.type];
    if (blocks[at]!.type === 'note') continue;
    const d = Math.abs(total - 2 * left);
    if (d < gap) {
      gap = d;
      best = at;
    }
  }
  return [all.slice(0, best), all.slice(best)];
}

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

/** Whose figures these are: each player or team the composition draws, once. */
function entitiesOf(ms: Measurement[], series: MeasurementSeries[]): Array<{ kind: string; label: string }> {
  const entities = new Map<string, { kind: string; label: string }>();
  for (const e of [...ms.map((m) => m.entity), ...series.map((s) => s.entity)]) entities.set(e.id, e);
  return [...entities.values()];
}

/** The one provenance line: the largest sample in words, the window and when it was computed. */
function provenanceOf(ms: Measurement[], series: MeasurementSeries[], zone: string): string | null {
  const rounds = Math.max(0, ...ms.filter((m) => m.sample_unit === 'rounds').map((m) => m.sample_size), ...series.filter((s) => s.points.every((p) => p.bucket === null)).map((s) => s.points.length));
  const first = ms[0] ?? series[0];
  if (!first) return null;
  const attempts = rounds === 0 ? Math.max(0, ...ms.map((m) => m.sample_size), ...series.map((s) => s.points.reduce((a, p) => a + p.sample_size, 0))) : 0;
  const unit: Measurement['sample_unit'] = rounds > 0 ? 'rounds' : (ms[0]?.sample_unit ?? 'attempts');
  const asOf = [...ms.map((m) => m.as_of), ...series.map((s) => s.as_of)].sort().pop() ?? first.as_of;
  return sourceLine({ sample_size: rounds || attempts, sample_unit: unit, window_start: first.window_start, window_end: first.window_end, as_of: asOf }, zone) || null;
}

export function CoachComposition({ composition, live = false }: { composition: ValidatedComposition; live?: boolean }) {
  const reduced = useChReducedMotion();
  const phone = useChPhone();
  const zone = useLightPlace().timeZone;
  // Whether it arrived in the live answer is decided once, at mount: one restored with the thread never moves, and the answer
  // finishing does not replay or snap anything. Reduced motion is read on every render, so a setting that resolves after
  // hydration (its server snapshot is "off") or is turned on mid-answer still draws the visual final.
  const [arrivedLive] = useState(live);
  const animate = arrivedLive && !reduced;
  const { ms, series } = figuresOf(composition.blocks);
  const who = entitiesOf(ms, series);
  const provenance = provenanceOf(ms, series, zone);
  const pages = pagesOf(composition.blocks, composition.layout);
  const beat = (i: number) => ({ '--ch-b': `${Math.min(i, 6) * BLOCK_STEP_MS}ms` }) as CSSProperties;
  const first = composition.blocks[0]!.type;
  return (
    <section
      className="ch-aks-cv"
      aria-label={composition.title}
      data-live={animate ? '' : undefined}
      data-layout={composition.layout}
      data-artifact={composition.artifactId}
      // What it opens with: a figure hangs from the lead with no rule between them (the leaf's stylesheet reads this).
      data-opens={first === 'headline' ? 'figure' : undefined}
      // The playbook's offset (§3): a line starts once its block has mostly arrived.
      style={{ '--ch-cv-lag': `${FIGURE_LAG_MS}ms` } as CSSProperties}
    >
      <header className="ch-aks-cv__head ch-aks-cv__in" style={beat(0)}>
        <h3 className="ch-aks-cv__title">{composition.title}</h3>
        {composition.lede && <p className="ch-aks-cv__lede">{composition.lede}</p>}
      </header>
      <div className="ch-aks-cv__pages" data-spread={pages.length > 1 ? '' : undefined}>
        {pages.map((page, pi) => (
          <div key={pi} className="ch-aks-cv__page">
            {page.map((i) => {
              const b = composition.blocks[i]!;
              return (
                <div key={i} className="ch-aks-sec ch-aks-cv__in" data-type={b.type} style={beat(i + 1)}>
                  <Studio part={fromBlock(b, who.length > 1)} size={phone ? 'compact' : 'full'} read={composition.artifactId} onAsk={fillComposer} drawIn={animate} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {(composition.coverageNotes.length > 0 || provenance) && (
        <footer className="ch-aks-cv__foot ch-aks-cv__in" style={beat(composition.blocks.length + 1)}>
          {composition.coverageNotes.map((note) => (
            <p key={note} className="ch-aks-cv__cover">
              <b>Partial data</b> {note}
            </p>
          ))}
          {provenance && <p className="ch-aks-src ch-num">{provenance}</p>}
        </footer>
      )}
    </section>
  );
}
