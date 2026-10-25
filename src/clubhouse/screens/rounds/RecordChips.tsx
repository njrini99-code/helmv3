import type { ChRecordMark } from '../../data/record-marks';

/**
 * P-7 4.5.1: the records a round holds, as up to two quiet chips under the course name ("Season low", "Best at Finley").
 * Plain text in a list, not controls; the badge glyph says the tier (filled, half, hollow) and is hidden from a screen
 * reader. Never medals. They settle in only when the round was just posted (M11), with the round card.
 */
export function RecordChips({ marks, settle }: { marks: readonly ChRecordMark[]; settle: boolean }) {
  if (!marks.length) return null;
  return (
    <ul className={'ch-rv-rec' + (settle ? ' is-just' : '')} aria-label="Records">
      {marks.slice(0, 2).map((m) => (
        <li key={m.id} className="ch-rv-rec__chip">
          <i className={`ch-rv-rec__g is-${m.tier}`} aria-hidden="true" />
          {m.label}
        </li>
      ))}
    </ul>
  );
}
