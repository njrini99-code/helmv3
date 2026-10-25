'use client';

import { changeInk, changeTone, formatSigned } from '../../lib/format';
import { useGlide } from '../../lib/motion-glide';
import { sgScale, sgShare } from '../../lib/sg';
import { useChartPin } from '../../lib/use-chart-pin';
import { legReadout, type SgLegRow } from './leg-rows';
import { ChartTable } from '../../ui/charts/ChartTable';
import { NoData } from '../../ui/NoData';

export type LegBarRow = Pick<SgLegRow, 'label' | 'value'> & Partial<Pick<SgLegRow, 'team' | 'n' | 'se' | 'state' | 'tag'>> & { means: string };

const tone = (v: number) => changeTone(v, false, 1);

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
export function LegBars({ rows, baseline, teamName, onOpen }: { rows: LegBarRow[]; baseline: string; teamName?: string | null; onOpen?: (label: string) => void }) {
  const pin = useChartPin(rows.length, 'y');
  const scale = sgScale(rows.flatMap((r) => [r.value, r.team]));
  const at = (v: number) => 50 + (v >= 0 ? 1 : -1) * sgShare(v, scale) * 50;
  const summary = rows.map((r) => `${r.label} ${r.value == null ? 'no data' : formatSigned(r.value)}`).join(', ');
  const early = rows.filter((r) => r.state === 'early').map((r) => r.label);
  const readout = (i: number | null) => (i == null ? null : legReadout(rows[i]!, teamName));
  const shown = readout(pin.active);
  const spoken = readout(pin.pinned);
  const pinnedRow = pin.pinned != null ? rows[pin.pinned] : null;
  // Per leg: the bar's signed half-rail share, its whisker's ends and the team mark, gliding together on a new window (B9).
  const drawn = useGlide(
    rows.flatMap((r) => [
      r.value == null ? null : (r.value >= 0 ? 1 : -1) * sgShare(r.value, scale) * 50,
      r.value != null && r.se != null ? at(r.value - r.se) : null,
      r.value != null && r.se != null ? at(r.value + r.se) : null,
      r.team == null ? null : at(r.team),
    ]),
    rows.map((r) => r.label).join('|'),
  );
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
        {shown ?? 'Select a leg to see its likely range.'}
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
        const [bar, lo, hi, team] = drawn.slice(i * 4, i * 4 + 4);
        return (
          <div key={r.label} className={'ch-lb__r ch-sv-row' + (muted ? ' is-early' : '')} aria-hidden="true" {...pin.item(i)}>
            <div className="ch-lb__who">
              <b>{r.label}</b>
              <span>{r.means}</span>
            </div>
            <div className="ch-lb__rail">
              {r.value != null && bar != null && <i className={'ch-lb__bar ' + tone(r.value)} style={bar >= 0 ? { left: '50%', width: `${bar}%` } : { right: '50%', width: `${-bar}%` }} />}
              {lo != null && hi != null && <i className={'ch-sv-whisk' + (lo <= 0 ? ' is-clip-l' : '') + (hi >= 100 ? ' is-clip-r' : '')} style={{ left: `${lo}%`, width: `${hi - lo}%` }} />}
              {r.team != null && team != null && <u className="ch-lb__team" style={{ left: `${team}%` }} title={`${teamName ?? 'Team'} ${formatSigned(r.team)}`} />}
              {r.value == null && r.tag && <span className="ch-sv-needs">{r.tag}</span>}
            </div>
            <span className={'ch-lb__v ch-num ' + (muted ? '' : changeInk(r.value))}>{r.value == null ? <NoData /> : formatSigned(r.value)}</span>
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
      {/* Q12: a pinned leg offers its Game detail section (never while scrubbing, so the target holds still). Inside the chart's box, or the press that takes it would unpin the leg first. */}
      {onOpen && pinnedRow && pinnedRow.value != null && (
        <button type="button" className="ch-lb__open" onClick={() => onOpen(pinnedRow.label)}>
          See {pinnedRow.label.toLowerCase()} in game detail
        </button>
      )}
      {/* The legs, for a screen reader that asks for them after the summary (AX-17). */}
      <ChartTable
        caption="Strokes gained per round by leg"
        columns={['Leg', 'Strokes gained', 'Likely range', ...(rows.some((r) => r.team != null) ? [`${teamName ?? 'Team'} average`] : [])]}
        rows={rows.map((r) => [
          r.label,
          r.value == null ? (r.tag ?? 'No data') : formatSigned(r.value) + (r.state === 'early' && r.tag ? ` (${r.tag})` : ''),
          r.value != null && r.se != null ? `${formatSigned(r.value - r.se)} to ${formatSigned(r.value + r.se)}` : '',
          ...(rows.some((x) => x.team != null) ? [r.team == null ? '' : formatSigned(r.team)] : []),
        ])}
      />
    </div>
  );
}
