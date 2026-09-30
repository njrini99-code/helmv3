'use client';

import { haptic } from '../../../lib/haptics';
import { editedCount, holesForRound, MAX_HOLE_YARDS, parOf, PARS, yardsOf, type ChSetupHole } from './shape';

/**
 * The round's scorecard (board `HoleConfig`): par and yardage per hole, from
 * the tee picked, editable for this round only. With a 9-hole round on an
 * 18-hole card, Front 9 / Back 9 picks the nine. Edited holes are marked.
 * CH-11107: a yardage out of bounds is marked on its hole (empty ones are
 * named by the Start hint instead, so a blank card isn't all red).
 */
export function HoleConfig({
  holes,
  baseline,
  count,
  nine,
  onHoles,
  onNine,
}: {
  holes: ChSetupHole[];
  baseline: ChSetupHole[] | null;
  count: 9 | 18;
  nine: 'front' | 'back';
  onHoles: (holes: ChSetupHole[]) => void;
  onNine: (nine: 'front' | 'back') => void;
}) {
  const list = holesForRound(holes, count, nine);
  const set = (n: number, patch: Partial<ChSetupHole>) => onHoles(holes.map((h) => (h.n === n ? { ...h, ...patch } : h)));
  const edited = editedCount(holes, baseline);
  const figs: Array<[string, string | number]> = [
    ['Holes', list.length],
    ['Par', parOf(list)],
    ['Yards', yardsOf(list).toLocaleString('en-US')],
    ...(count === 18 && list.length === 18
      ? ([
          ['Out', parOf(list.slice(0, 9))],
          ['In', parOf(list.slice(9))],
        ] as Array<[string, number]>)
      : []),
  ];
  return (
    <section className="ch-rs-card ch-rs-hc" aria-label="Scorecard">
      <div className="ch-rs-card__h">
        <div>
          <h3>Scorecard</h3>
          <span>
            {edited
              ? `${edited} hole${edited === 1 ? '' : 's'} edited for this round`
              : baseline
                ? 'From the tee you picked · edits apply to this round only'
                : 'Enter each hole’s par and yardage from the scorecard'}
          </span>
        </div>
        {count === 9 && holes.length === 18 && (
          <div className="ch-rs-seg ch-rs-seg--sm" role="radiogroup" aria-label="Which nine">
            {(
              [
                ['front', 'Front 9'],
                ['back', 'Back 9'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={nine === v}
                onClick={() => {
                  haptic('select');
                  onNine(v);
                }}
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </div>
      <dl className="ch-rs-hc__sum">
        {figs.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="ch-rs-hc__grid">
        {list.map((h) => {
          const b = baseline?.[h.n - 1];
          const changed = !!b && (b.par !== h.par || b.yards !== h.yards);
          const y = parseInt(h.yards, 10);
          const bad = !!h.yards.trim() && (!Number.isFinite(y) || y < 1 || y > MAX_HOLE_YARDS);
          return (
            <div key={h.n} className={'ch-rs-hole' + (changed ? ' is-edited' : '')}>
              <span className="ch-rs-hole__n" aria-hidden="true">
                {h.n}
              </span>
              <div className="ch-rs-par" role="radiogroup" aria-label={`Hole ${h.n} par`}>
                {PARS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={h.par === p}
                    className={p === 6 ? 'is-rare' : undefined}
                    onClick={() => {
                      haptic('select');
                      set(h.n, { par: p });
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <label className="ch-rs-yds">
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  value={h.yards}
                  aria-label={`Hole ${h.n} yardage`}
                  aria-invalid={bad || undefined}
                  data-ch-code={bad ? 'CH-11107' : undefined}
                  onChange={(e) => set(h.n, { yards: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                />
                <em>yds</em>
              </label>
            </div>
          );
        })}
      </div>
    </section>
  );
}
