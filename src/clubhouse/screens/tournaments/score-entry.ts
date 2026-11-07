/**
 * The Enter score sheet's rules, pure. The form holds text; `validateScore` turns it into the `enterTournamentScore`
 * input or says what is wrong, field by field, with the same limits the action enforces (a total of 20 to 200, a nine
 * of 10 to 100, a hole of 0 to 18, a note of 280). No React.
 */
import type { TourScoreInput } from '@/app/golf/actions/tournaments';
import type { ChTourPlayerRound, ScoreStatus } from './types';

export interface ScoreForm {
  total: string;
  front: string;
  back: string;
  status: ScoreStatus;
  wdAfterHole: string;
  note: string;
}

export type ScoreErrors = Partial<Record<'total' | 'front' | 'back' | 'wdAfterHole' | 'note', string>>;

export const STATUS_OPTIONS: ReadonlyArray<{ value: ScoreStatus; label: string }> = [
  { value: 'ok', label: 'Played' },
  { value: 'wd', label: 'Withdrew' },
  { value: 'dq_pending', label: 'Disqualification under review' },
  { value: 'dq', label: 'Disqualified' },
];

export const STATUS_WORDS: Record<ScoreStatus, string> = { ok: 'Played', wd: 'Withdrew', dq: 'Disqualified', dq_pending: 'DQ under review' };

export function emptyForm(): ScoreForm {
  return { total: '', front: '', back: '', status: 'ok', wdAfterHole: '', note: '' };
}

/** The form for a player’s saved score (an empty one for a player with none). */
export function formOf(p: Pick<ChTourPlayerRound, 'total' | 'status'> | null | undefined): ScoreForm {
  return { ...emptyForm(), total: p?.total != null ? String(p.total) : '', status: p?.status ?? 'ok' };
}

const whole = (s: string): number | null => {
  const t = s.trim();
  return /^\d{1,3}$/.test(t) ? Number(t) : null;
};

export function validateScore(f: ScoreForm): { ok: true; input: TourScoreInput; clears: boolean } | { ok: false; errors: ScoreErrors } {
  const errors: ScoreErrors = {};
  const total = f.total.trim() ? whole(f.total) : null;
  const front = f.front.trim() ? whole(f.front) : null;
  const back = f.back.trim() ? whole(f.back) : null;
  if (f.total.trim() && (total == null || total < 20 || total > 200)) errors.total = 'Enter the round total, from 20 to 200.';
  if (f.status === 'ok' && !f.total.trim() && (f.front.trim() || f.back.trim())) errors.total = 'Enter the round total as well.';
  if (f.front.trim() && (front == null || front < 10 || front > 100)) errors.front = 'The front nine is from 10 to 100.';
  if (f.back.trim() && (back == null || back < 10 || back > 100)) errors.back = 'The back nine is from 10 to 100.';
  if (!errors.total && !errors.front && !errors.back && total != null && front != null && back != null && front + back !== total) errors.total = `The nines add to ${front + back}, not ${total}.`;
  const hole = f.wdAfterHole.trim() ? whole(f.wdAfterHole) : null;
  if (f.status === 'wd' && f.wdAfterHole.trim() && (hole == null || hole > 18)) errors.wdAfterHole = 'Use a hole from 0 to 18.';
  if (f.note.length > 280) errors.note = 'Keep the note to 280 characters.';
  if (Object.keys(errors).length) return { ok: false, errors };
  const clears = f.status === 'ok' && total == null;
  return {
    ok: true,
    clears,
    input: {
      total,
      front,
      back,
      status: f.status,
      wdAfterHole: f.status === 'wd' ? hole : null,
      note: f.note.trim() || null,
    },
  };
}
