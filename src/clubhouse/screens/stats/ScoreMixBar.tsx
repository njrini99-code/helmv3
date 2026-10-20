'use client';

import { earlyTag, sampleState } from '../../lib/stats-signal';
import { useChartPin } from '../../lib/use-chart-pin';
import { mixReadout, mixRows, perRoundText, type MixCounts, type MixPerRound } from './mix-rows';

/**
 * P005: the scoring mix (stats-visuals spec 4.4, decision Q11). One 100% bar of every scored hole by result, with par in the
 * middle: going out from it, birdie then eagle or better to the left (under par), bogey then double or worse to the right
 * (over par). Red is under par; par, bogey and double are the scorecard's ivory, gray and ink (a bogey is a scorecard fact,
 * not a loss, so it does not turn amber). A segment wide enough (about 30px) prints its share; every share is in the key.
 *
 * A pointer over a segment or a key entry, a tap, or the arrow keys read the result in the line above the bar ("Birdie · 19 of
 * 180 holes · 11% · 1.9 a round", and the triples inside double or worse when known); a tap or a key pins it. Under 30 holes
 * the mix is an early read: muted, with the tag. A result with no holes draws nothing; the main mix's key still reads it as
 * 0%, the compact one (each par's mix) leaves it out.
 */
export function ScoreMixBar({
  counts,
  perRound,
  triple,
  label,
  compact = false,
}: {
  counts: MixCounts;
  /** Holes of each result a round, printed in the key under its share. */
  perRound?: MixPerRound | null;
  /** Triple bogey or worse, a part of double or worse, said in its readout when known. */
  triple?: number | null;
  /** What the mix is of, for the group's name: "Every hole, by result", "Par 3s". */
  label: string;
  compact?: boolean;
}) {
  const all = mixRows(counts, perRound);
  const rows = compact ? all.filter((r) => r.count > 0) : all;
  const pin = useChartPin(rows.length, 'x');
  const holes = all.reduce((a, r) => a + r.count, 0);
  if (holes === 0) return <p className="ch-sv-mix-none">No holes scored yet.</p>;
  const early = sampleState('holes', holes) === 'early';
  const readout = (i: number | null) => (i == null || !rows[i] ? null : mixReadout(rows[i], holes, triple));
  const shown = readout(pin.active);
  const spoken = readout(pin.pinned);
  const summary = all.map((r) => `${r.label} ${r.count} of ${holes}`).join(', ');
  return (
    <div
      className={'ch-sv-mix' + (compact ? ' is-compact' : '') + (early ? ' is-early' : '')}
      role="group"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the arrow keys can read each result, as a scroll region is focusable to scroll
      tabIndex={0}
      aria-label={`${label}, under par to the left and over par to the right: ${summary} holes. Use the arrow keys to read each result.`}
      data-has-active={pin.active != null ? '' : undefined}
      {...pin.container}
    >
      <p className={'ch-sv-read' + (shown ? ' is-on' : '')} aria-hidden="true">
        {shown ?? (compact ? 'Select a result.' : 'Select a result to see how many holes.')}
      </p>
      <p className="ch-sr-only" aria-live="polite">
        {spoken}
      </p>
      <div className="ch-sv-mix-bar" aria-hidden="true">
        {rows.map((r, i) =>
          r.count > 0 ? (
            <span key={r.key} className={`ch-sv-mix-seg is-${r.key}`} style={{ flexGrow: r.count }} {...pin.item(i)}>
              <b className="ch-num">{r.pctText}</b>
            </span>
          ) : null,
        )}
      </div>
      {!compact && (
        <div className="ch-sv-mix-axis" aria-hidden="true">
          <span>Under par</span>
          <span>Over par</span>
        </div>
      )}
      <ul className="ch-sv-mix-key" aria-hidden="true">
        {rows.map((r, i) => (
          <li key={r.key} className={`is-${r.key}`} {...pin.item(i)}>
            <span className="ch-sv-mix-name">
              <i />
              {r.label}
            </span>
            <b className="ch-num">{r.pctText}</b>
            {r.perRound != null && <small className="ch-num">{perRoundText(r.perRound)} a round</small>}
          </li>
        ))}
      </ul>
      {early && <p className="ch-sv-note">{earlyTag(holes, 'hole')}: these shares can still move a lot.</p>}
    </div>
  );
}
