import type { CSSProperties } from 'react';
import { formatSigned } from '../../lib/format';
import { NoData } from '../../ui/NoData';
import { sgScale } from '../../lib/sg';
import { POOLED_SD } from '../../lib/stats-signal';
import { divergeBar, sgTone, type ShsTone } from './shs-figures';

/** Four mini diverging rows: label, a bar from a centre zero, the signed value. The card is the tap, so no whisker and no pin. */
export function MiniDiverging({ rows, ready = true, fixedScale }: { rows: ReadonlyArray<{ label: string; value: number | null; /** `early` draws the bar hollow and untoned. */ state?: string }>; ready?: boolean; fixedScale?: number }) {
  if (!ready)
    return (
      <div className="ch-shs-mrows is-wait">
        {rows.map((r) => (
          <div className="ch-shs-mrow" key={r.label}>
            <span className="lab">{r.label}</span>
            <span className="val ch-shs-none"><NoData /></span>
          </div>
        ))}
      </div>
    );
  const scale = fixedScale ?? sgScale(rows.map((r) => r.value));
  return (
    <div className="ch-shs-mrows">
      {rows.map((r) => {
        const early = r.state === 'early';
        const tone = early ? 'flat' : sgTone(r.value);
        const bar = r.value == null ? null : divergeBar(r.value, scale);
        return (
          <div className="ch-shs-mrow" key={r.label}>
            <span className="lab">{r.label}</span>
            <span className="ch-shs-rail" aria-hidden="true">
              <span className="ch-shs-zero" />
              {bar && <span className={`ch-shs-bar ch-shs-fill-${tone}${early ? ' is-early' : ''}`} style={{ left: `${bar.left}%`, width: `${bar.width}%`, transformOrigin: `${(r.value ?? 0) >= 0 ? '0' : '100%'} 50%` }} />}
            </span>
            <span className={`val${tone === 'flat' ? '' : ` ch-shs-${tone}`}${r.value == null ? ' ch-shs-none' : ''}`}>{formatSigned(r.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

export interface MiniRailRow {
  label: string;
  /** 0 to 100, null reads "—" with an empty rail. */
  value: number | null;
  /** The Tour's value: draws a tick and tones the fill; with none, the fill is flat and no tick draws. */
  tour?: number | null;
  /** An early read draws its fill hollow. */
  early?: boolean;
}

/** The rail fill's tone: gain at or past the Tour, loss short of it, flat with no Tour figure (04 "Part cards"). */
export function railTone(value: number | null, tour: number | null | undefined): ShsTone {
  if (value == null || tour == null) return 'flat';
  return value >= tour ? 'gain' : 'loss';
}

/** Labelled rails, one shared grid, 0 to 100. A Tour tick draws only when a Tour value is passed. */
export function MiniRails({ rows, caption }: { rows: readonly MiniRailRow[]; caption?: string }) {
  return (
    <>
      <div className="ch-shs-mrails">
        {rows.map((r) => (
          <div className="ch-shs-mr" key={r.label}>
            <span className="l ch-num">{r.label}</span>
            <span className="ch-shs-hrail" aria-hidden="true">
              {r.value != null && <i className={`ch-shs-fill-${railTone(r.value, r.tour)}${r.early ? ' is-early' : ''}`} style={{ width: `${Math.max(0, Math.min(100, r.value))}%` }} />}
              {r.tour != null && <span className="ch-shs-tour" style={{ left: `${Math.max(0, Math.min(100, r.tour))}%` }} />}
            </span>
            <span className={'v ch-num' + (r.value == null ? ' ch-shs-none' : '')}>{r.value == null ? <NoData /> : `${Math.round(r.value)}%`}</span>
          </div>
        ))}
      </div>
      {caption && <div className="ch-shs-mini-cap">{caption}</div>}
    </>
  );
}

export interface HBarRow {
  label: string;
  /** A second line under the label ("12 attempts"). */
  sub?: string | null;
  /** 0 to 100; null reads as no figure, saying `needs` under the label when it has one. */
  value: number | null;
  tour?: number | null;
  /** An early read: hollow, never graded. */
  early?: boolean;
  needs?: string | null;
  /** A second line under the figure ("6 of 10"): what the figure is made of. */
  valueSub?: string | null;
}

/**
 * A detail's rows: label, rail and figure on a shared grid, with the Tour's tick where the Tour publishes one (the page's `.hb`).
 * A percentage is drawn on 0 to 100; a figure in another unit passes the `scale` its rail runs to and the `format` its value reads in.
 */
export function HBars({
  rows,
  tourKey = false,
  scale = 100,
  format = (v: number) => `${Math.round(v)}%`,
  wide = false,
  tickKey = 'Tour average',
  lowerIsBetter = false,
}: {
  rows: readonly HBarRow[];
  tourKey?: boolean;
  scale?: number;
  format?: (v: number) => string;
  /** Wider label and figure columns, for a two-line label or a figure with a unit ("9.7 ft"). */
  wide?: boolean;
  /** What the tick marks, under the rows when `tourKey` is on (the Tour by default; a detail can mark the player's own figure). */
  tickKey?: string;
  /** A distance left, where under the tick is the gain. */
  lowerIsBetter?: boolean;
}) {
  const at = (v: number) => Math.max(0, Math.min(100, (v / (scale || 1)) * 100));
  return (
    <>
      {rows.map((r) => {
        const sub = r.value == null ? (r.needs ?? r.sub) : r.sub;
        return (
          <div className={'ch-shs-hb' + (wide ? ' is-wide' : '')} key={r.label}>
            <span className="l">
              {r.label}
              {sub && <small>{sub}</small>}
            </span>
            <span className="ch-shs-hrail" aria-hidden="true">
              {r.value != null && <i className={`ch-shs-fill-${r.early ? 'flat is-early' : (lowerIsBetter && r.tour != null ? (r.value <= r.tour ? 'gain' : 'loss') : railTone(r.value, r.tour))}`} style={{ width: `${at(r.value)}%` }} />}
              {r.tour != null && <span className="ch-shs-tour" style={{ left: `${at(r.tour)}%` }} />}
            </span>
            <span className={'v ch-num' + (r.value == null ? ' ch-shs-none' : '')}>{r.value == null ? <NoData /> : format(r.value)}
              {r.value != null && r.valueSub && <small>{r.valueSub}</small>}
            </span>
          </div>
        );
      })}
      {tourKey && rows.some((r) => r.tour != null) && (
        <div className="ch-shs-tour-key">
          <i aria-hidden="true" />
          {tickKey}
        </div>
      )}
      {/* An outlined bar is a band with too few tries to grade: say so, or the outline reads as a style. */}
      {rows.some((r) => r.value != null && r.early) && (
        <div className="ch-shs-tour-key ch-shs-early-key">
          <i aria-hidden="true" />
          Outline: too few tries to grade yet
        </div>
      )}
    </>
  );
}

export interface TickerRound {
  id: string;
  score: number;
}

/**
 * The least range the ticker draws its rounds on, in strokes: about two of a round's usual standard deviations
 * (`POOLED_SD.score`, 3.6), so 72 against 73 is a small step on the strip and not the whole of it (CH-09).
 */
export const TICKER_MIN_SPAN = Math.round(2 * POOLED_SD.score);
/** Every round's mark is this tall, in drawing units of 64: a position, not a length. */
const TICKER_MARK = 8;

/**
 * The ticker's marks (stats and charts audit 2026-11-15, CH-09): a round is a mark of one size at its score's height, a lower
 * score higher, on the rounds' own range widened to at least `TICKER_MIN_SPAN`. The best is marked only when it is one round's
 * alone: a run of equal rounds has no best. The old bars were lengths from three strokes under the best round, so 73 drew a third
 * as tall as 72, and every round of a flat run was marked best.
 */
export function tickerBars(rounds: readonly TickerRound[], W = 300, H = 64): Array<{ id: string; x: number; y: number; w: number; h: number; best: boolean }> {
  const n = rounds.length;
  if (!n) return [];
  const gap = n > 12 ? 3 : 5;
  // A lone round is a short mark, not one full-width block (STATS-17).
  const w = Math.min(14, (W - gap * (n - 1)) / n);
  const scores = rounds.map((r) => r.score);
  const best = Math.min(...scores);
  const uniqueBest = n > 1 && scores.filter((s) => s === best).length === 1;
  let lo = best;
  let hi = Math.max(...scores);
  if (hi - lo < TICKER_MIN_SPAN) {
    const mid = (lo + hi) / 2;
    lo = mid - TICKER_MIN_SPAN / 2;
    hi = mid + TICKER_MIN_SPAN / 2;
  }
  const h = Math.min(TICKER_MARK, H);
  return rounds.map((r, i) => ({ id: r.id, x: i * (w + gap), y: ((r.score - lo) / (hi - lo)) * (H - h), w, h, best: uniqueBest && r.score === best }));
}

/** One mark per round, oldest on the left, higher is lower, a unique best in green (and no amber). It reads rounds only. */
export function RoundTicker({ rounds }: { rounds: readonly TickerRound[] }) {
  return (
    <svg className="ch-shs-tick" viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden="true">
      {tickerBars(rounds).map((b) => (
        <rect key={b.id} className={b.best ? 'is-best' : 'is-flat'} x={b.x} y={b.y} width={b.w} height={b.h} rx="2.5" />
      ))}
    </svg>
  );
}

/**
 * The overview's rounds, as what the card counts (look-09, "make it specific to what it is displaying"): one cell per round,
 * oldest first, each holding its score, ten to a row. The rounds at the window's best score are lit in green, unless every round
 * shares it (a run of equal rounds has no best). The Scoring average card above already draws the scores as a line, so this card
 * shows the rounds themselves, not a second chart of them.
 */
export function roundStripBest(scores: readonly number[]): boolean[] {
  if (scores.length < 2) return scores.map(() => false);
  const best = Math.min(...scores);
  const all = scores.every((s) => s === best);
  return scores.map((s) => !all && s === best);
}

export function RoundStrip({ rounds }: { rounds: readonly TickerRound[] }) {
  const lit = roundStripBest(rounds.map((r) => r.score));
  return (
    <ol className="ch-shs-rstrip ch-num" aria-hidden="true" style={{ '--ch-shs-rs-n': Math.min(10, Math.max(1, rounds.length)) } as CSSProperties}>
      {rounds.map((r, i) => (
        <li key={r.id} className={lit[i] ? 'is-best' : undefined}>
          {r.score}
        </li>
      ))}
    </ol>
  );
}

/**
 * A goal's or focus area's bar (look-09, "make it specific to what it is displaying"): a target is a benchmark of its own, so the
 * bar runs from where it started to the target, filled to how far along it is, with the target as the tick at its end. It reads
 * `progressOf` only, so a goal with no baseline draws no bar (the caller writes it as text).
 */
export function GoalBar({ progress, start, target }: { progress: number; start: string; target: string }) {
  const p = Math.max(0, Math.min(100, progress));
  return (
    <span className="ch-shs-gbar" aria-hidden="true">
      <span className="ch-shs-gbar__t">
        <i style={{ width: `${p}%` }} />
      </span>
      <span className="ch-shs-gbar__k ch-num">
        <span>Start {start}</span>
        <span>Target {target}</span>
      </span>
    </span>
  );
}
