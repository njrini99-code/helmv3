import { formatSigned, NO_DATA } from '../../lib/format';
import { sgScale, sgShare } from '../../lib/sg';

export type LegBarRow = {
  label: string;
  /** What the leg measures, in a line: strokes gained is only readable when the reader knows which shots it counts. */
  means: string;
  value: number | null;
  /** The team's value for the same leg (a coach's view); null draws no mark. */
  team?: number | null;
};

/**
 * P005: strokes gained by leg as aligned bars from one zero (the baseline the figures are measured against): a gain
 * grows to the right in green, a loss to the left in gold, every leg on the same scale (the widest value or team mark,
 * rounded up) so bars compare by length. The team's mark sits on the same rail, and each leg says which shots it counts.
 */
export function LegBars({ rows, baseline, teamName }: { rows: LegBarRow[]; baseline: string; teamName?: string | null }) {
  const scale = sgScale(rows.flatMap((r) => [r.value, r.team]));
  const at = (v: number) => `${50 + (v >= 0 ? 1 : -1) * sgShare(v, scale) * 50}%`;
  const summary = rows.map((r) => `${r.label} ${r.value == null ? 'no data' : formatSigned(r.value)}`).join(', ');
  return (
    <div className="ch-lb" role="img" aria-label={`Strokes gained per round by leg: ${summary}`}>
      <div className="ch-lb__axis" aria-hidden="true">
        <span>Losing strokes</span>
        <span>{baseline}</span>
        <span>Gaining strokes</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="ch-lb__r" aria-hidden="true">
          <div className="ch-lb__who">
            <b>{r.label}</b>
            <span>{r.means}</span>
          </div>
          <div className="ch-lb__rail">
            {r.value != null && <i className={'ch-lb__bar ' + (r.value >= 0 ? 'is-gain' : 'is-loss')} style={r.value >= 0 ? { left: '50%', width: `${sgShare(r.value, scale) * 50}%` } : { right: '50%', width: `${sgShare(r.value, scale) * 50}%` }} />}
            {r.team != null && <u className="ch-lb__team" style={{ left: at(r.team) }} title={`${teamName ?? 'Team'} ${formatSigned(r.team)}`} />}
          </div>
          <span className={'ch-lb__v ch-num ' + (r.value == null ? '' : r.value >= 0 ? 'ch-gain' : 'ch-loss')}>{r.value == null ? NO_DATA : formatSigned(r.value)}</span>
        </div>
      ))}
      {rows.some((r) => r.team != null) && (
        <p className="ch-lb__key" aria-hidden="true">
          <u /> {teamName ?? 'Team'} average
        </p>
      )}
    </div>
  );
}
