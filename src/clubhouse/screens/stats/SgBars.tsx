'use client';

import { changeInk, changeTone, formatSigned, NO_DATA } from '../../lib/format';
import { sgScale, sgShare } from '../../lib/sg';
import { useChartPin } from '../../lib/use-chart-pin';
import { legReadout, type SgLegRow } from './leg-rows';

export type SgBarRow = Pick<SgLegRow, 'label' | 'value'> & Partial<Pick<SgLegRow, 'team' | 'n' | 'se' | 'state' | 'tag' | 'total'>>;

/**
 * Strokes gained by leg on the phone: a bar either side of zero on a scale the data sets (the largest value shown, rounded
 * up, at least 1), so a bar's length is its value. The total sits under the legs on the same scale. Each bar says how sure
 * it is, as the desktop's does (LegBars): a whisker of one standard error, a muted hollow bar for an early read, "Needs N
 * rounds" under the floor. A tap pins a row's reading in the line above; the arrow keys step through them.
 */
export function SgBars({ rows }: { rows: SgBarRow[] }) {
  const pin = useChartPin(rows.length, 'y');
  const scale = sgScale(rows.map((r) => r.value));
  const at = (v: number) => 50 + (v >= 0 ? 1 : -1) * sgShare(v, scale) * 50;
  const readout = (i: number | null) => (i == null ? null : legReadout(rows[i]!));
  const shown = readout(pin.active);
  const spoken = readout(pin.pinned);
  return (
    <div
      className="ch-stm-legs"
      role="group"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the arrow keys can read each leg, as a scroll region is focusable to scroll
      tabIndex={0}
      aria-label="Strokes gained per round by leg. Use the arrow keys to read each leg."
      {...pin.container}
    >
      <p className={'ch-sv-read' + (shown ? ' is-on' : '')} aria-hidden="true">
        {shown ?? 'Tap a leg to see how sure it is.'}
      </p>
      <p className="ch-sr-only" aria-live="polite">
        {spoken}
      </p>
      {rows.map(({ label, value: v, total, se, state, tag }, i) => {
        const muted = state === 'early';
        const lo = v != null && se != null ? at(v - se) : null;
        const hi = v != null && se != null ? at(v + se) : null;
        return (
          <div key={label} className={'ch-stm-leg ch-sv-row' + (total ? ' is-total' : '') + (muted ? ' is-early' : '')} {...pin.item(i)}>
            <span>{label}</span>
            <span className="ch-stm-leg__bar" aria-hidden="true">
              <i className="ch-stm-leg__z" />
              {v != null && (
                <i
                  className={'ch-stm-leg__v ' + changeTone(v, false, 1)}
                  style={{
                    [v >= 0 ? 'left' : 'right']: '50%',
                    width: `${sgShare(v, scale) * 50}%`,
                  }}
                />
              )}
              {lo != null && hi != null && <i className={'ch-sv-whisk' + (lo <= 0 ? ' is-clip-l' : '') + (hi >= 100 ? ' is-clip-r' : '')} style={{ left: `${lo}%`, width: `${hi - lo}%` }} />}
              {v == null && tag && <span className="ch-sv-needs">{tag}</span>}
            </span>
            <b className={'ch-num ' + (muted ? '' : changeInk(v))}>{v == null ? NO_DATA : formatSigned(v)}</b>
          </div>
        );
      })}
    </div>
  );
}
