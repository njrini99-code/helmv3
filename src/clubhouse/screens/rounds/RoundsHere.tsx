'use client';

import { AnimatePresence, m } from 'motion/react';
import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { ChCompareCard } from '../../data/compare-rounds';
import { compareRounds } from '../../data/compare-rounds';
import { shortDate } from '../../data/course-page-shape';
import type { ChLibraryRound } from '../../data/rounds-shape';
import { haptic } from '../../lib/haptics';
import { chSpring } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { flowGeometry } from './RoundZones';
import { RoundRow } from './parts';

/**
 * P-7 4.2.7: the player's rounds at the course, newest first, each opening its review; and Compare, which picks two
 * 18-hole rounds with every hole and lays them over each other (CH-11530). A round that can't be compared says why.
 * M9: the compare bar rises from the bottom edge on the smooth spring and leaves the same way; the row circles fade in
 * (CSS, rounds.css). Reduced motion and Animations off show the bar at once, without the translate.
 */

const reviewHref = (id: string) => `/golf/dashboard/rounds/${id}`;

export function RoundsHere({ rounds, cards, title }: { rounds: ChLibraryRound[]; cards: Record<string, ChCompareCard>; title: string }) {
  const [comparing, setComparing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const reduced = useChReducedMotion();
  const canCompare = Object.keys(cards).length >= 2;
  const toggle = (id: string) => {
    haptic('select');
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? [p[1]!, id] : [...p, id]));
  };
  const stop = () => {
    setComparing(false);
    setPicked([]);
    setOpen(false);
  };
  // Older first reads as "then and now"; the sheet names the newer one first.
  const pair = picked.length === 2 ? ([...picked].map((id) => cards[id]!).sort((a, b) => (a.date < b.date ? 1 : -1)) as [ChCompareCard, ChCompareCard]) : null;
  return (
    <section className="ch-ch-sec" aria-labelledby="ch-ch-rounds-h">
      <div className="ch-ch-sec__h">
        <h2 id="ch-ch-rounds-h">{title}</h2>
        {canCompare && (
          <button type="button" className="ch-ch-textbtn" onClick={() => (comparing ? stop() : setComparing(true))}>
            {comparing ? 'Cancel' : 'Compare'}
          </button>
        )}
      </div>
      {comparing ? (
        <ul className="ch-cmp-list">
          {rounds.map((r) => {
            const ok = !!cards[r.id];
            const on = picked.includes(r.id);
            const why = ok ? null : r.holes === 9 ? 'nine holes' : 'no hole scores';
            return (
              <li key={r.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-disabled={!ok}
                  className={'ch-cmp-row' + (on ? ' is-on' : '') + (ok ? '' : ' is-off')}
                  aria-label={ok ? `Compare ${shortDate(r.date)}, ${r.score}` : `${shortDate(r.date)}, ${r.score}. Can’t compare: ${why}`}
                  onClick={() => ok && toggle(r.id)}
                >
                  <span className="ch-cmp-row__c" aria-hidden="true">
                    {on && <Icon icon={Check} size={14} />}
                  </span>
                  <span className="ch-cmp-row__d ch-num">{shortDate(r.date)}</span>
                  <span className="ch-cmp-row__t">{r.tee ?? `${r.holes} holes`}</span>
                  <b className="ch-num">{r.score}</b>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="ch-rd-book">
          {rounds.map((r) => (
            <RoundRow key={r.id} r={r} href={reviewHref(r.id)} />
          ))}
        </div>
      )}
      <AnimatePresence>
        {comparing && (
          <m.div
            key="bar"
            className="ch-cmp-bar"
            role="region"
            aria-label="Compare"
            initial={reduced ? false : { transform: 'translateY(100%)' }}
            animate={{ transform: 'translateY(0%)' }}
            exit={reduced ? undefined : { transform: 'translateY(100%)' }}
            transition={chSpring('smooth', reduced)}
          >
            <span className="ch-sr-only" aria-live="polite">
              {picked.length === 2 ? '2 chosen' : `${picked.length} of 2 chosen`}
            </span>
            {pair ? (
              <Button
                variant="primary"
                onClick={() => {
                  setOpen(true);
                }}
              >
                Compare {shortDate(pair[0].date)} and {shortDate(pair[1].date)}
              </Button>
            ) : (
              <span className="ch-cmp-bar__t">Choose two rounds</span>
            )}
          </m.div>
        )}
      </AnimatePresence>
      {pair && <CompareSheet open={open} onClose={() => setOpen(false)} a={pair[0]} b={pair[1]} />}
    </section>
  );
}

function CompareSheet({ open, onClose, a, b }: { open: boolean; onClose: () => void; a: ChCompareCard; b: ChCompareCard }) {
  const c = useMemo(() => compareRounds(a, b), [a, b]);
  const W = 720;
  const all = [...c.cumA, ...c.cumB, 0];
  const lo = Math.min(...all) - 1;
  const hi = Math.max(...all) + 1;
  const { x, y } = flowGeometry({ x0: 40, x1: 700, top: 16, height: 150, holes: 18, lo, hi });
  const line = (v: number[]) => v.map((p, i) => `${x(i + 1)},${y(p)}`).join(' ');
  return (
    <Modal open={open} onClose={onClose} title={`${shortDate(a.date)} vs ${shortDate(b.date)}`} width={720} code="CH-11530">
      <div className="ch-cmp">
        <div className="ch-carc">
          <svg viewBox={`0 0 ${W} 190`} className="ch-carc__svg" role="img" aria-label={c.summary}>
            <line x1={40} x2={700} y1={y(0)} y2={y(0)} stroke="var(--ch-stage-rule)" />
            <polyline points={line(c.cumA)} fill="none" stroke="var(--ch-stage-line)" strokeWidth={2} />
            <polyline points={line(c.cumB)} fill="none" stroke="var(--ch-stage-gold)" strokeWidth={2} strokeDasharray="4 3" />
          </svg>
        </div>
        <p className="ch-cmp__sum">{c.summary}.</p>
        <div className="ch-cmp__strip" role="list" aria-label="Hole by hole">
          {c.cells.map((cell) => (
            <span
              key={cell.n}
              role="listitem"
              className={'ch-cmp__cell is-' + cell.better}
              aria-label={`Hole ${cell.n}: ${cell.a} and ${cell.b}${cell.better === 'level' ? ', level' : `, ${shortDate(cell.better === 'a' ? a.date : b.date)} better`}`}
            >
              <em className="ch-num">{cell.n}</em>
              <b className="ch-num">
                {cell.a} · {cell.b}
              </b>
            </span>
          ))}
        </div>
        <ul className="ch-cmp__legend">
          <li>
            <i className="is-a" aria-hidden="true" />
            {shortDate(a.date)}, {a.score} · better holes tinted red
          </li>
          <li>
            <i className="is-b" aria-hidden="true" />
            {shortDate(b.date)}, {b.score} · better holes tinted amber
          </li>
        </ul>
      </div>
    </Modal>
  );
}
