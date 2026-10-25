'use client';

import type { CSSProperties } from 'react';
import { useGlide } from '../../lib/motion-glide';
import { needsText } from '../../lib/stats-signal';
import { useChartPin } from '../../lib/use-chart-pin';
import { LIKELY_RANGE, PUTT_NEEDS, puttBandViews, puttCount, puttRate, puttReadout, puttSummary, type PuttBandInput } from './putt-bands';

const TICKS = [100, 75, 50, 25, 0];

/** The Tour's line, drawn only between neighbouring bands that both have a Tour value (no Tour mark inside 3 feet, none invented). */
function tourRuns(bands: PuttBandInput[]): Array<Array<[number, number]>> {
  const runs: Array<Array<[number, number]>> = [];
  let run: Array<[number, number]> = [];
  bands.forEach((b, i) => {
    if (b.bench == null) {
      if (run.length) runs.push(run);
      run = [];
      return;
    }
    run.push([i + 0.5, 100 - Math.min(100, Math.max(0, b.bench))]);
  });
  if (run.length) runs.push(run);
  return runs.filter((r) => r.length > 1);
}

/**
 * P005: make rate by distance (stats-visuals spec 4.3, decision Q9). The bands in the order they come, on equal spacing (the
 * chart says so), a dot per band on a 0 to 100% axis with a thin Wilson 95% whisker ("likely range", named once in the key),
 * "made/attempts" under each band, and the Tour's thin line behind the dots where the Tour publishes a value (none inside
 * 3 feet). A band of 10 to 29 putts is a hollow early read and never graded; under 10 it draws no dot and says what it needs.
 * Grading against the Tour uses the dot, never the whisker. The same component draws the desktop Overview, Game detail and
 * the phone (`compact`: sized for 390 with each band a 44px or wider target).
 *
 * A pointer over a band, a tap, or the arrow keys read it in the line above the chart; a tap or a key pins it and only then is
 * it announced.
 */
export function PuttBands({ bands, compact = false }: { bands: PuttBandInput[]; compact?: boolean }) {
  const views = puttBandViews(bands);
  const pin = useChartPin(views.length, 'x');
  const runs = tourRuns(bands);
  const early = views.filter((b) => b.state === 'early').map((b) => b.label);
  const hasTour = bands.some((b) => b.bench != null);
  const readout = (i: number | null) => (i == null ? null : puttReadout(views[i]!));
  const shown = readout(pin.active);
  const spoken = readout(pin.pinned);
  // Per band: the Tour tick, the whisker's top and bottom and the dot, gliding together on a new window (B9).
  const drawn = useGlide(
    views.flatMap((b) => [
      b.bench == null ? null : 100 - Math.min(100, Math.max(0, b.bench)),
      b.range ? 100 - b.range.hi : null,
      b.range ? b.range.lo : null,
      b.rate == null ? null : 100 - b.rate,
    ]),
    views.map((b) => b.label).join('|'),
  );
  return (
    <div
      className={'ch-sv-pb' + (compact ? ' is-compact' : '')}
      role="group"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the arrow keys can read each band, as a scroll region is focusable to scroll
      tabIndex={0}
      aria-label={puttSummary(views)}
      {...pin.container}
    >
      <p className={'ch-sv-read' + (shown ? ' is-on' : '')} aria-hidden="true">
        {shown ?? 'Select a band to read its make rate and likely range.'}
      </p>
      <p className="ch-sr-only" aria-live="polite">
        {spoken}
      </p>
      <div className="ch-sv-pb__chart" aria-hidden="true">
        <div className="ch-sv-pb__y">
          {TICKS.map((t) => (
            <span key={t} className="ch-num" style={{ '--ch-pb-at': `${100 - t}%` } as CSSProperties}>
              {t}%
            </span>
          ))}
        </div>
        <div className="ch-sv-pb__cols" style={{ gridTemplateColumns: `repeat(${views.length}, minmax(44px, 1fr))` }}>
          <div className="ch-sv-pb__grid">
            {TICKS.map((t) => (
              <i key={t} style={{ top: `${100 - t}%` }} />
            ))}
          </div>
          {runs.length > 0 && (
            <svg className="ch-sv-pb__tour" viewBox={`0 0 ${views.length} 100`} preserveAspectRatio="none">
              {runs.map((r) => (
                <polyline key={r[0]![0]} points={r.map(([x, y]) => `${x},${y}`).join(' ')} vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
          )}
          {views.map((b, i) => {
            const [tick, top, bottom, dot] = drawn.slice(i * 4, i * 4 + 4);
            return (
              <div key={b.label} className={'ch-sv-pb__col ch-sv-row' + (b.state === 'early' ? ' is-early' : '') + (b.state === 'none' ? ' is-none' : '')} {...pin.item(i)}>
                <div className="ch-sv-pb__mk">
                  <div className="ch-sv-pb__scale">
                    {tick != null && <u className="ch-sv-pb__tick" style={{ top: `${tick}%` }} />}
                    {b.range && top != null && bottom != null && <i className={'ch-sv-pb__whisk' + (b.range.lo <= 0 ? ' is-clip-b' : '') + (b.range.hi >= 100 ? ' is-clip-t' : '')} style={{ top: `${top}%`, bottom: `${bottom}%` }} />}
                    {dot != null && <b className={'ch-sv-pb__dot' + (b.grade ? ` ${b.grade}` : '')} style={{ top: `${dot}%` }} />}
                  </div>
                  {/* The phone's column is about 52px: the short form there, the whole sentence in the readout. */}
                  {b.rate == null && <span className="ch-sv-pb__needs">{compact ? needsText('make') : PUTT_NEEDS}</span>}
                </div>
                <div className="ch-sv-pb__lab">
                  <span>{compact ? b.label.replace(/ ft$/, '') : b.label}</span>
                  <b className={'ch-num' + (b.grade === 'is-gain' ? ' ch-gain' : b.grade === 'is-loss' ? ' ch-loss' : '')}>{puttRate(b)}</b>
                  <small className="ch-num">{puttCount(b)}</small>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="ch-sv-pb__cap" aria-hidden="true">
        Feet from the hole. Bands are evenly spaced, not to scale; under each, putts made/tried.
      </p>
      <p className="ch-sv-pb__key" aria-hidden="true">
        <span>
          <b className="ch-sv-pb__kdot" />
          Make rate
        </span>
        {hasTour && (
          <span>
            <u className="ch-sv-pb__kline" />
            Tour
          </span>
        )}
        <span>
          <i className="ch-sv-pb__kwhisk" />
          {LIKELY_RANGE[0]!.toUpperCase() + LIKELY_RANGE.slice(1)} (95%)
        </span>
      </p>
      {early.length > 0 && (
        <p className="ch-sv-note" aria-hidden="true">
          Hollow dots are early reads, under 30 putts ({early.join(', ')}), and are not graded against the Tour yet.
        </p>
      )}
    </div>
  );
}
