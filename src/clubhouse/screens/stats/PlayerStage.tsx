import { EmptyState } from '../../ui/States';
import { formatSigned, formatToPar, NO_DATA } from '../../lib/format';

export type StageRound = { label: string; score: number; toPar: number | null; holes: number };

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * P005: the player's scoring form as a ribbon, flush on the page (no panel, no headline figure; the page head already
 * has the figures). Each recent round is one column: a bar from the player's own average, rising when the round beat it
 * and hanging when it did not (lower scores read higher, P005-D1), all on one scale, with the score at its tip and the
 * date and to-par under it. Everything is worked out from the rounds handed in: the average, the bars, the newer half
 * against the older.
 */
export function PlayerStage({ rounds, first, coach, teamAvg, meta, note }: { rounds: StageRound[]; first: string; coach: boolean; teamAvg: number | null; meta: string; note?: string }) {
  const n = rounds.length;
  if (n === 0) {
    return (
      <section className="ch-fm" aria-label="Scoring form">
        <EmptyState compact code="CH-5302" title="No rounds in this window." />
      </section>
    );
  }
  const scores = rounds.map((r) => r.score);
  const avg = mean(scores);
  const best = rounds.reduce((a, b) => (b.score < a.score ? b : a));
  const widest = Math.max(...scores.map((s) => Math.abs(s - avg)), 0.5);
  return (
    <section className="ch-fm" aria-label="Scoring form">
      <header className="ch-fm__head">
        <div>
          <h2>Scoring form</h2>
          <p>{note ?? `${first}’s rounds against their own average.`}</p>
        </div>
        <dl className="ch-fm__facts">
          <div>
            <dt>Average</dt>
            <dd className="ch-num">{avg.toFixed(1)}</dd>
          </div>
          {coach && teamAvg != null && (
            <div>
              <dt>Team</dt>
              <dd className="ch-num">{teamAvg.toFixed(1)}</dd>
            </div>
          )}
          <div>
            <dt>Best</dt>
            <dd className="ch-num">
              {best.score}
              <em>{best.label}</em>
            </dd>
          </div>
        </dl>
      </header>
      <ol className="ch-fm__bars" style={{ ['--ch-n' as string]: n }}>
        {rounds.map((r, i) => {
          const dev = r.score - avg;
          const better = dev < 0;
          return (
            <li
              key={i}
              className={'ch-fm__c' + (better ? ' is-up' : dev > 0 ? ' is-down' : '') + (i === n - 1 ? ' is-last' : '')}
              style={{ ['--ch-bar' as string]: `${(Math.abs(dev) / widest) * 100}%` }}
              aria-label={`${r.label}: ${r.score}, ${formatToPar(r.toPar)}, ${dev === 0 ? 'at' : `${formatSigned(dev, 1)} against`} the average`}
            >
              <span className="ch-fm__plot" aria-hidden="true">
                <i className="ch-fm__bar" />
                <b className="ch-fm__score ch-num">{r.score}</b>
              </span>
              <span className="ch-fm__d" aria-hidden="true">
                {r.label}
              </span>
              <span className={'ch-fm__tp ch-num' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')} aria-hidden="true">
                {r.toPar == null ? NO_DATA : formatToPar(r.toPar)}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="ch-fm__key" aria-hidden="true">
        <span className="is-up">Better than average</span>
        <span className="is-down">Worse</span>
        <span>{meta} · lower is better</span>
      </p>
    </section>
  );
}
