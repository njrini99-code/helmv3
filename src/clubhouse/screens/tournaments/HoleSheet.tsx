'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveTournamentHole } from '@/app/golf/actions/tournaments-holes';
import { haptic } from '../../lib/haptics';
import { useAction } from '../../lib/use-action';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { formatToPar } from './format';
import { ToPar } from './parts';
import '../../styles/tournaments-live.css';

/** One hole of the course and what the player has on it so far. */
export interface SheetHole {
  n: number;
  par: number;
  strokes: number | null;
}

/** The strokes offered on a hole: two under par to four over, never below one. */
export function strokeChoices(par: number): number[] {
  const lo = Math.max(1, par - 2);
  return Array.from({ length: par + 4 - lo + 1 }, (_, i) => lo + i);
}

/** "Birdie", "Par", "Double bogey": the words for strokes against par, so the chip never leans on colour. */
export function scoreName(strokes: number, par: number): string {
  const d = strokes - par;
  if (strokes === 1 && par > 1) return 'Hole in one';
  return d <= -3 ? 'Albatross' : d === -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double bogey' : `${d} over par`;
}

/** The hole to be on next: the first unscored one after `from`, else the first unscored, else `from`. */
export function nextHole(holes: readonly SheetHole[], from: number): number {
  const after = holes.find((h) => h.n > from && h.strokes == null);
  return (after ?? holes.find((h) => h.strokes == null))?.n ?? from;
}

/** Holes played and to par over the holes scored. */
export function cardLine(holes: readonly SheetHole[]): { thru: number; toPar: number | null } {
  const done = holes.filter((h) => h.strokes != null);
  return { thru: done.length, toPar: done.length ? done.reduce((s, h) => s + (h.strokes! - h.par), 0) : null };
}

/**
 * Hole-by-hole scoring for one player in one tournament round (owner answer B). Tap a hole, tap the strokes: each tap is
 * saved at once through `saveTournamentHole`, which writes the player's `golf_holes` row on their `golf_rounds` row, the
 * same rows Fairway's round tracker keeps, and links it to the tournament round. A coach scores any player; a player
 * scores themselves. The next unscored hole opens after each save. A failed save keeps the sheet and the score on the
 * screen as it was and says why (CH-16072).
 */
export function HoleSheet({
  open,
  onClose,
  name,
  roundEventId,
  playerId,
  date,
  holes,
  roundLabel,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  roundEventId: string;
  playerId: string;
  date: string;
  holes: readonly SheetHole[];
  roundLabel: string;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Map<number, number | null>>(() => new Map(holes.map((h) => [h.n, h.strokes])));
  const merged = holes.map((h) => ({ ...h, strokes: scores.get(h.n) ?? null }));
  const [cur, setCur] = useState(() => nextHole(merged, 0));
  const hole = merged.find((h) => h.n === cur) ?? merged[0];
  const line = cardLine(merged);

  const write = useAction<[number, number, number | null], unknown>(
    'tournaments.hole',
    async (n, par, strokes) => {
      const res = await saveTournamentHole({ roundEventId, playerId, date, hole: n, par, strokes });
      if (res.success) {
        setScores((m) => new Map(m).set(n, strokes));
        haptic('select');
        if (strokes != null) setCur(nextHole(merged.map((h) => (h.n === n ? { ...h, strokes } : h)), n));
      }
      return res;
    },
    (n) => ({ done: '', failed: `Couldn’t save hole ${n}`, hint: 'The score is as it was. Try again.', code: 'CH-16072' }),
    (result, c) => (result.success ? c : { ...c, hint: result.error ?? c.hint }),
  );

  const close = () => {
    onClose();
    router.refresh();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      width={480}
      title={`${name}, ${roundLabel}`}
      description={line.thru ? `Through ${line.thru} of ${holes.length}.` : `${holes.length} holes. Tap a hole, then the strokes.`}
      footer={
        <Button variant="primary" onClick={close}>
          Done
        </Button>
      }
    >
      {hole && (
        <div className="ch-tour-live-hs" data-ch-hole-sheet="">
          <div className="ch-tour-live-hs__strip" role="group" aria-label="Holes">
            {merged.map((h) => (
              <button
                key={h.n}
                type="button"
                className={'ch-tour-live-hs__h' + (h.n === cur ? ' is-cur' : '') + (h.strokes != null ? ' is-done' : '')}
                aria-pressed={h.n === cur}
                aria-label={`Hole ${h.n}, par ${h.par}${h.strokes != null ? `, ${h.strokes}` : ', not scored'}`}
                onClick={() => setCur(h.n)}
              >
                <span className="ch-num">{h.n}</span>
                <span className="ch-num">{h.strokes ?? '·'}</span>
              </button>
            ))}
          </div>
          <div className="ch-tour-live-hs__now">
            <b>
              Hole <span className="ch-num">{hole.n}</span>
            </b>
            <span className="ch-tour-live-muted">
              Par <span className="ch-num">{hole.par}</span>
              {line.toPar != null && (
                <>
                  {' · '}
                  <ToPar value={line.toPar} /> through <span className="ch-num">{line.thru}</span>
                </>
              )}
            </span>
          </div>
          <div className="ch-tour-live-hs__choices" role="group" aria-label={`Strokes on hole ${hole.n}`}>
            {strokeChoices(hole.par).map((s) => (
              <button
                key={s}
                type="button"
                className={'ch-tour-live-hs__c' + (hole.strokes === s ? ' is-on' : '')}
                aria-pressed={hole.strokes === s}
                disabled={write.pending}
                onClick={() => void write.run(hole.n, hole.par, s)}
              >
                <span className="ch-num">{s}</span>
                <span className="ch-tour-live-hs__w">{scoreName(s, hole.par)}</span>
              </button>
            ))}
          </div>
          {hole.strokes != null && (
            <Button variant="ghost" size="sm" disabled={write.pending} onClick={() => void write.run(hole.n, hole.par, null)}>
              Clear hole {hole.n} ({formatToPar(hole.strokes - hole.par)})
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
