import type { ChRecordMark } from '../../data/record-marks';

/**
 * P-7 4.5.1: the records a round holds, as up to two quiet chips under the course name ("Season low", "Best at Finley").
 * Plain text in a list, not controls; the badge glyph says the tier (filled, half, hollow) and is hidden from a screen
 * reader. Never medals. Static, no settle (owner call 9; M11 is built only on Nick's word), a just-posted round included. They
 * come with the review's streamed history (routes/round-review.tsx), so they land just after the review's first paint.
 */
export function RecordChips({ marks }: { marks: readonly ChRecordMark[] }) {
  if (!marks.length) return null;
  return (
    <ul className="ch-rv-rec" aria-label="Records">
      {marks.slice(0, 2).map((m) => (
        <li key={m.id} className="ch-rv-rec__chip">
          <i className={`ch-rv-rec__g is-${m.tier}`} aria-hidden="true" />
          {m.label}
        </li>
      ))}
    </ul>
  );
}
