/** The narrowest an axis gets: this many points of a rate, or this share of the largest value of anything else. */
const RATE_MIN_SPAN = 20;
const MIN_SPAN_SHARE = 0.12;

/**
 * A stat against what it is compared with, on one small axis: the player's mark, the team's tick and the Tour's tick,
 * with a bar from the reference to the player that is green when they are better and gold when they are not (which way
 * is better is the stat's own: fewer putts, a lower score). The axis is the data's own range, padded; a rate
 * stays inside 0 to 100 and a signed figure (strokes gained) is centred on zero, so a mark's place means the same on every row.
 * Decorative: the figures beside it say the numbers.
 */
export function RefAxis({
  you,
  team,
  tour,
  lowerIsBetter,
  rate = false,
  signed = false,
}: {
  you: number | null;
  team?: number | null;
  tour?: number | null;
  lowerIsBetter: boolean;
  rate?: boolean;
  signed?: boolean;
}) {
  const refs = [team, tour].filter((v): v is number => v != null);
  if (you == null || refs.length === 0) return null;
  const all = [you, ...refs];
  let lo: number;
  let hi: number;
  if (signed) {
    const m = Math.max(1, ...all.map((v) => Math.abs(v))) * 1.15;
    lo = -m;
    hi = m;
  } else {
    // The axis is the data's range with room either side, and never narrower than MIN_SPAN of what is measured: two close
    // values (63% and 62%) sit close, not far apart because the axis was cut to fit them.
    const mn = Math.min(...all);
    const mx = Math.max(...all);
    const span = Math.max((mx - mn) * 1.5, rate ? RATE_MIN_SPAN : Math.max(Math.abs(mx) * MIN_SPAN_SHARE, 0.5));
    const mid = (mx + mn) / 2;
    lo = mid - span / 2;
    hi = mid + span / 2;
    if (rate) {
      // A share cannot leave 0 to 100: slide the window back inside rather than squash it.
      if (lo < 0) {
        hi -= lo;
        lo = 0;
      }
      if (hi > 100) {
        lo -= hi - 100;
        hi = 100;
      }
      lo = Math.max(0, lo);
    }
  }
  const at = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  // Better or worse than the nearest comparison the viewer has: the team's where there is one, else the Tour's.
  const base = team ?? tour!;
  const better = lowerIsBetter ? you <= base : you >= base;
  const a = Math.min(((you - lo) / (hi - lo)) * 100, ((base - lo) / (hi - lo)) * 100);
  const b = Math.max(((you - lo) / (hi - lo)) * 100, ((base - lo) / (hi - lo)) * 100);
  return (
    <span className={'ch-ra ' + (better ? 'is-good' : 'is-bad')} aria-hidden="true">
      <i className="ch-ra__seg" style={{ left: `${Math.max(0, a)}%`, width: `${Math.max(0, Math.min(100, b) - Math.max(0, a))}%` }} />
      {signed && <i className="ch-ra__zero" style={{ left: at(0) }} />}
      {team != null && <u className="ch-ra__tick is-team" style={{ left: at(team) }} />}
      {tour != null && <u className="ch-ra__tick is-tour" style={{ left: at(tour) }} />}
      <b className="ch-ra__dot" style={{ left: at(you) }} />
    </span>
  );
}
