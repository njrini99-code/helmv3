/**
 * A round's three figures drawn (owner, 2026-10-06: no bare numbers), each against a reference the round itself
 * gives: greens hit out of the greens played, putts against two on every green (36), and strokes gained from zero.
 * Decorative; the figure beside each says it in words.
 */

/** "14/18": that many greens, lit out of the round's greens. */
export function GirViz({ gir }: { gir: string | null }) {
  const m = gir?.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  const hit = Number(m[1]);
  const of = Number(m[2]);
  if (!of || of > 18) return null;
  return (
    <span className="ch-rviz ch-rviz--gir" aria-hidden="true">
      {Array.from({ length: of }, (_, i) => (
        <i key={i} className={i < hit ? 'is-hit' : undefined} />
      ))}
    </span>
  );
}

/** Putts on a track to 40, ticked at 36 (two putts on every green). */
export function PuttsViz({ putts }: { putts: number | null }) {
  if (putts == null) return null;
  return (
    <span className="ch-rviz ch-rviz--putts" aria-hidden="true">
      <i className={putts <= 36 ? 'is-good' : 'is-over'} style={{ width: `${Math.min(100, (putts / 40) * 100)}%` }} />
      <b style={{ left: '90%' }} />
    </span>
  );
}

/** Strokes gained as a bar from a zero tick, three strokes to an end. */
export function SgViz({ sg }: { sg: number | null }) {
  if (sg == null) return null;
  const w = Math.min(50, (Math.abs(sg) / 3) * 50);
  return (
    <span className="ch-rviz ch-rviz--sg" aria-hidden="true">
      <i className={sg >= 0 ? 'is-gain' : 'is-loss'} style={sg >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} />
    </span>
  );
}
