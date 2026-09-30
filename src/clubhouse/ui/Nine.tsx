import { NO_DATA } from '../lib/format';
import { ScoreMark } from './ScoreMark';

export interface ChNineHole {
  n: number;
  par: number | null;
  score: number | null;
}

/**
 * One nine of a scorecard in a phone sheet (the foundation's `MNine`,
 * design/handoff/m-shell.jsx): hole numbers, par and score marks, with the
 * nine's totals. A table with a caption, so VoiceOver reads it by cell.
 */
export function Nine({ label, holes, caption }: { label: 'Out' | 'In'; holes: ChNineHole[]; caption: string }) {
  if (!holes.length) return null;
  const sum = (k: 'par' | 'score') => (holes.every((h) => h[k] != null) ? holes.reduce((a, h) => a + (h[k] as number), 0) : null);
  return (
    <table className="ch-nine ch-num">
      <caption className="ch-sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{label}</th>
          {holes.map((h) => (
            <th key={h.n} scope="col">
              {h.n}
            </th>
          ))}
          <th scope="col">Tot</th>
        </tr>
      </thead>
      <tbody>
        <tr className="is-par">
          <th scope="row">Par</th>
          {holes.map((h) => (
            <td key={h.n}>{h.par ?? NO_DATA}</td>
          ))}
          <td>{sum('par') ?? NO_DATA}</td>
        </tr>
        <tr>
          <th scope="row">Score</th>
          {holes.map((h) => (
            <td key={h.n}>
              <ScoreMark score={h.score} par={h.par} size="sm" />
            </td>
          ))}
          <td>
            <b>{sum('score') ?? NO_DATA}</b>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
