'use client';

import { formatSigned, NO_DATA } from '../../lib/format';
import { sgScale, sgShare } from '../../lib/sg';
import { useChartPin } from '../../lib/use-chart-pin';
import { legReadout, type SgLegRow } from './leg-rows';

export type LegBarRow = Pick<SgLegRow, 'label' | 'value'> & Partial<Pick<SgLegRow, 'team' | 'n' | 'se' | 'state' | 'tag'>> & { means: string };

const tone = (v: number) => (v >= 0 ? 'is-gain' : 'is-loss');

/**
 * P005: strokes gained by leg as aligned bars from one zero (the baseline the figures are measured against): a gain
 * grows to the right in green, a loss to the left in gold, every leg on the same scale (the widest value or team mark,
 * rounded up) so bars compare by length. The team's mark sits on the same rail, and each leg says which shots it counts.
 *
 * Each bar carries how sure it is (stats-visuals decisions Q3 and Q7): a thin whisker of one standard error, labeled
 * "likely range" in the readout; a leg between its show and early floors is drawn hollow and muted, with no gain or loss
 * color; a leg under its show floor says what it needs instead of drawing a bar. A pointer over a row, a tap, or the arrow
 * keys read it in the line above the rows; a tap or a key pins it.
 */
export function LegBars({ rows, baseline, teamName }: { rows: LegBarRow[]; baseline: string; teamName?: string | null }) {
  const pin = useChartPin(rows.length, 'y');
  const scale = sgScale(rows.flatMap((r) => [r.value, r.team]));
  const at = (v: number) => 50 + (v >= 0 ? 1 : -1) * sgShare(v, scale) * 50;
  const summary = rows.map((r) => `${r.label} ${r.value == null ? 'no data' : formatSigned(r.value)}`).join(', ');
  const early = rows.filter((r) => r.state === 'early').map((r) => r.label);
  const readout = (i: number | null) => (i == null ? null : legReadout(rows[i]!, teamName));
  const shown = readout(pin.active);
  const spoken = readout(pin.pinned);
  return (
    <div
      className="ch-lb"
      role="group"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the arrow keys can read each leg, as a scroll region is focusable to scroll
      tabIndex={0}
      aria-label={`Strokes gained per round by leg: ${summary}. Use the arrow keys to read each leg.`}
      {...pin.container}
    >
      <p className={'ch-sv-read' + (shown ? ' is-on' : '')} aria-hidden="true">
        {shown ?? 'Select a leg to see how sure its figure is.'}
      </p>
      <p className="ch-sr-only" aria-live="polite">
        {spoken}
      </p>
      <div className="ch-lb__axis" aria-hidden="true">
        <span>Losing strokes</span>
        <span>{baseline}</span>
        <span>Gaining strokes</span>
      </div>
      {rows.map((r, i) => {
        const muted = r.state === 'early';
        const lo = r.value != null && r.se != null ? at(r.value - r.se) : null;
        const hi = r.value != null && r.se != null ? at(r.value + r.se) : null;
        return (
          <div key={r.label} className={'ch-lb__r ch-sv-row' + (muted ? ' is-early' : '')} aria-hidden="true" {...pin.item(i)}>
            <div className="ch-lb__who">
              <b>{r.label}</b>
              <span>{r.means}</span>
            </div>
            <div className="ch-lb__rail">
              {r.value != null && <i className={'ch-lb__bar ' + tone(r.value)} style={r.value >= 0 ? { left: '50%', width: `${sgShare(r.value, scale) * 50}%` } : { right: '50%', width: `${sgShare(r.value, scale) * 50}%` }} />}
              {lo != null && hi != null && <i className={'ch-sv-whisk' + (lo <= 0 ? ' is-clip-l' : '') + (hi >= 100 ? ' is-clip-r' : '')} style={{ left: `${lo}%`, width: `${hi - lo}%` }} />}
              {r.team != null && <u className="ch-lb__team" style={{ left: `${at(r.team)}%` }} title={`${teamName ?? 'Team'} ${formatSigned(r.team)}`} />}
              {r.value == null && r.tag && <span className="ch-sv-needs">{r.tag}</span>}
            </div>
            <span className={'ch-lb__v ch-num ' + (r.value == null || muted ? '' : r.value >= 0 ? 'ch-gain' : 'ch-loss')}>{r.value == null ? NO_DATA : formatSigned(r.value)}</span>
          </div>
        );
      })}
      {early.length > 0 && (
        <p className="ch-sv-note" aria-hidden="true">
          Muted bars are early reads ({early.join(', ')}) and can still move a lot.
        </p>
      )}
      {rows.some((r) => r.team != null) && (
        <p className="ch-lb__key" aria-hidden="true">
          <u /> {teamName ?? 'Team'} average
        </p>
      )}
    </div>
  );
}
