/**
 * ============================================================================
 * HubInstruments — the small, static visuals of the CoachHelm overview
 * ----------------------------------------------------------------------------
 * Every instrument renders its final state on mount (no count-up, no draw-on)
 * and is non-interactive, so it can sit anywhere without nesting a control.
 * Colour always follows a `Sense` (better / worse / level) computed in
 * `buildPlayerHubViewModel.ts`, never the raw direction of a stat, and every
 * mark carries its number in text too, so colour is never the only channel.
 *
 *   ScoringWindows   the score-to-par trend over 5 / 12 / 25-round windows
 *   DriverSlopes     prior → recent strokes gained per category (slope chart)
 *   EvidenceRailView you vs team vs Tour on one honest axis
 *   ReadBand         the word band that replaces a confidence percent
 *   NextRoundWindowView  the prediction band, hidden when it is too wide
 *   LeakBars         causes ranked by strokes to gain back
 *   SituationRows    mined scoring patterns ("Tournament rounds")
 * ========================================================================== */

import { cn } from '@/lib/utils';
import {
  fmtSigned,
  type DriverTrendRow,
  type EvidenceRail,
  type LeakRow,
  type NextRoundWindow,
  type ReadQuality,
  type ScoringTrendWindow,
  type Sense,
  type SituationRow,
} from './buildPlayerHubViewModel';

export const SENSE_TEXT: Record<Sense, string> = {
  better: 'text-accent-ink',
  worse: 'text-fw-danger-ink',
  level: 'text-text-secondary',
};

const SENSE_STROKE: Record<Sense, string> = {
  better: 'var(--fw-color-accent-ink)',
  worse: 'var(--fw-color-danger-ink)',
  level: 'var(--fw-color-text-tertiary)',
};

const SENSE_FILL: Record<Sense, string> = {
  better: 'bg-accent-500',
  worse: 'bg-fw-danger',
  level: 'bg-border-strong',
};

/** A small word pill in the sense colour. */
export function SenseWord({ sense, children }: { sense: Sense; children: string }) {
  return (
    <span
      data-slot="sense-word"
      data-sense={sense}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-fw-sans text-caption font-semibold',
        sense === 'better' && 'bg-accent-wash text-accent-ink',
        sense === 'worse' && 'bg-fw-danger-bg text-fw-danger-ink',
        sense === 'level' && 'bg-surface-sunken text-text-secondary',
      )}
    >
      {children}
    </span>
  );
}

/* ── Scoring windows ─────────────────────────────────────────────────────── */

const SCORING_SCALE_STROKES = 5;

export function ScoringWindows({ windows }: { windows: ScoringTrendWindow[] }) {
  // Fixed floor so a half-stroke drift draws as a slight tilt, not a cliff.
  const maxAbs = Math.max(SCORING_SCALE_STROKES, ...windows.map((w) => Math.abs(w.change)));
  return (
    <ul data-slot="scoring-windows" className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-3">
      {windows.map((w) => {
        // Literal score axis: a line that falls means lower scores. A steady
        // window draws flat whatever its residual slope.
        const rise = w.sense === 'level' ? 0 : (w.change / maxAbs) * 12;
        return (
          <li key={w.key} className="flex items-center gap-3 min-[520px]:flex-col min-[520px]:items-start min-[520px]:gap-1.5">
            <svg width="64" height="32" viewBox="0 0 64 32" aria-hidden="true" className="shrink-0">
              <line x1="4" y1="16" x2="60" y2="16" stroke="var(--fw-color-border-subtle)" strokeWidth="1" strokeDasharray="2 3" />
              <line x1="6" y1={16 + rise} x2="58" y2={16 - rise} stroke={SENSE_STROKE[w.sense]} strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="58" cy={16 + rise} r="3" fill={SENSE_STROKE[w.sense]} />
            </svg>
            <div className="min-w-0">
              <p className="font-fw-sans text-caption font-semibold text-text-secondary tabular-nums">Last {w.rounds} rounds</p>
              <p className={cn('font-fw-sans text-body-sm font-medium tabular-nums', SENSE_TEXT[w.sense])}>
                {w.short}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Driver slopes ───────────────────────────────────────────────────────── */

export function DriverSlopes({ rows }: { rows: DriverTrendRow[] }) {
  const values = rows.flatMap((r) => [r.prior, r.recent]);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const y = (v: number) => 26 - ((v - lo) / span) * 22;
  return (
    <ul data-slot="driver-slopes" className="flex flex-col divide-y divide-border-subtle">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="font-fw-sans text-body-sm font-semibold text-text-primary">{r.label}</p>
              <SenseWord sense={r.sense}>{r.word}</SenseWord>
            </div>
            <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">{r.sample}</p>
          </div>
          <svg
            width="88"
            height="30"
            viewBox="0 0 88 30"
            role="img"
            aria-label={`${r.label} strokes gained, ${fmtSigned(r.prior)} before, ${fmtSigned(r.recent)} now`}
            className="shrink-0"
          >
            {/* The dashed line is zero: Tour level. */}
            <line x1="2" y1={y(0)} x2="86" y2={y(0)} stroke="var(--fw-color-border-subtle)" strokeWidth="1" strokeDasharray="2 3" />
            <line x1="10" y1={y(r.prior)} x2="78" y2={y(r.recent)} stroke={SENSE_STROKE[r.sense]} strokeWidth="2" strokeLinecap="round" />
            <circle cx="10" cy={y(r.prior)} r="2.5" fill="var(--fw-color-surface)" stroke={SENSE_STROKE[r.sense]} strokeWidth="1.5" />
            <circle cx="78" cy={y(r.recent)} r="3" fill={SENSE_STROKE[r.sense]} />
          </svg>
          <span className={cn('w-[6.25rem] shrink-0 text-right font-fw-sans text-body-sm font-semibold tabular-nums', SENSE_TEXT[r.sense])}>
            {r.deltaText}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ── Evidence rail ───────────────────────────────────────────────────────── */

export function EvidenceRailView({ rail }: { rail: EvidenceRail }) {
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - rail.min) / (rail.max - rail.min || 1)) * 100));
  return (
    <div data-slot="evidence-rail">
      <div className="relative h-6" aria-hidden="true">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-sunken" />
        {rail.marks.map((m) =>
          m.key === 'you' ? (
            <span
              key={m.key}
              className={cn('absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface', SENSE_FILL[rail.youSense])}
              style={{ left: `${pos(m.value)}%` }}
            />
          ) : (
            <span
              key={m.key}
              className={cn('absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full', m.key === 'tour' ? 'bg-text-primary' : 'bg-text-tertiary')}
              style={{ left: `${pos(m.value)}%` }}
            />
          ),
        )}
      </div>
      {/* Values as a wrapping legend, never squeezed under the marks (NUM-38). */}
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {rail.marks.map((m) => (
          <div key={m.key} className="flex items-baseline gap-1.5">
            <dt className="font-fw-sans text-caption text-text-secondary">{m.label}</dt>
            <dd className={cn('font-fw-sans text-body-sm font-semibold tabular-nums', m.key === 'you' ? SENSE_TEXT[rail.youSense] : 'text-text-primary')}>
              {m.display}
            </dd>
          </div>
        ))}
        <div className="font-fw-sans text-caption text-text-tertiary">{rail.lowerIsBetter ? 'Lower is better' : 'Higher is better'}</div>
      </dl>
    </div>
  );
}

/* ── Read band ───────────────────────────────────────────────────────────── */

export function ReadBand({ read }: { read: ReadQuality }) {
  return (
    <span data-slot="read-band" data-level={read.level} className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="flex items-end gap-0.5">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn('w-1 rounded-full', i <= read.level ? 'bg-text-secondary' : 'bg-border-subtle')}
            style={{ height: `${4 + i * 3}px` }}
          />
        ))}
      </span>
      <span className="font-fw-sans text-caption font-medium text-text-secondary">{read.word}</span>
    </span>
  );
}

/* ── Next round window ───────────────────────────────────────────────────── */

export function NextRoundWindowView({ window: w }: { window: NextRoundWindow }) {
  const lo = w.band ? w.band.low : w.point;
  const hi = w.band ? w.band.high : w.point;
  const pad = Math.max(1, (hi - lo) * 0.35);
  const min = lo - pad;
  const max = hi + pad;
  const pos = (v: number) => ((v - min) / (max - min || 1)) * 100;
  return (
    <div data-slot="next-round-window">
      <p className="font-fw-sans text-caption font-semibold text-text-secondary">Next round</p>
      <p className="mt-1 flex items-baseline gap-1.5 font-fw-display text-h1 font-semibold leading-none tracking-[-0.03em] text-text-primary tabular-nums">
        {w.pointText}
        <span className="font-fw-sans text-body-sm font-medium tracking-normal text-text-secondary">{w.metricLabel}</span>
      </p>
      <div className="relative mt-4 h-5" aria-hidden="true">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border-subtle" />
        {w.band ? (
          <div
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full border border-accent-200 bg-accent-wash"
            style={{ left: `${pos(w.band.low)}%`, width: `${pos(w.band.high) - pos(w.band.low)}%` }}
          />
        ) : null}
        <div className="absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-primary" style={{ left: `${pos(w.point)}%` }} />
      </div>
      {w.band ? (
        <p className="mt-1.5 font-fw-sans text-caption text-text-secondary tabular-nums">
          {w.band.lowText} to {w.band.highText} {w.metricLabel}
        </p>
      ) : null}
      <p className="mt-1 font-fw-sans text-caption text-text-tertiary">{w.caption}</p>
    </div>
  );
}

/* ── Leak bars ───────────────────────────────────────────────────────────── */

export function LeakBars({ rows }: { rows: LeakRow[] }) {
  const max = Math.max(...rows.map((r) => r.gain), 0.01);
  return (
    <ol data-slot="leak-bars" className="flex flex-col gap-4">
      {rows.map((r) => (
        <li key={r.key} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="font-fw-sans text-caption font-semibold text-text-tertiary">{r.theme}</p>
              <p className="font-fw-sans text-body-sm font-medium text-text-primary">{r.title}</p>
            </div>
            <p className="shrink-0 font-fw-sans text-body-sm font-semibold text-fw-danger-ink tabular-nums">{r.gainText}</p>
          </div>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-sunken" aria-hidden="true">
            <div className="h-full rounded-full bg-fw-danger" style={{ width: `${Math.max(4, (r.gain / max) * 100)}%` }} />
          </div>
          {r.tourText ? <p className="mt-1 font-fw-sans text-caption text-text-tertiary tabular-nums">{r.tourText}</p> : null}
        </li>
      ))}
    </ol>
  );
}

/* ── Situations ──────────────────────────────────────────────────────────── */

export function SituationRows({ rows }: { rows: SituationRow[] }) {
  const max = Math.max(0.01, ...rows.map((r) => r.magnitude ?? 0));
  return (
    <ul data-slot="situations" className="flex flex-col divide-y divide-border-subtle">
      {rows.map((r) => (
        <li key={r.key} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 font-fw-sans text-body-sm font-medium text-text-primary">{r.label}</p>
            {r.valueText ? (
              <p className={cn('shrink-0 font-fw-sans text-body-sm font-semibold tabular-nums', r.sense === 'level' ? 'text-text-primary' : SENSE_TEXT[r.sense])}>
                {r.valueText}
              </p>
            ) : null}
          </div>
          <p className="font-fw-sans text-caption text-text-tertiary">{r.detail}</p>
          {r.magnitude !== null ? (
            <div className="mt-1.5 h-1 w-full rounded-full bg-surface-sunken" aria-hidden="true">
              <div
                className={cn('h-full rounded-full', SENSE_FILL[r.sense])}
                style={{ width: `${Math.max(4, (r.magnitude / max) * 100)}%` }}
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
