'use client';

import { ArrowUpRight, X } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { MISS_DIRECTIONS, type MissDirection } from '@/lib/coachhelm/v3/chat/miss-directions';
import type { MissPatternBlock, MissShotsBlock } from '@/lib/coachhelm/v3/chat/visuals/composition';
import { weekdayMonthDay } from '../../../../lib/dates';
import { formatFixed } from '../../../../lib/format';
import { Button } from '../../../../ui/Button';
import { Icon } from '../../../../ui/Icon';
import { Modal } from '../../../../ui/Modal';
import { plural } from '../cards/facts';
import { useMissCompassGate } from './compass-gate';

/**
 * The Miss Compass (CoachHelm Studio Phase 1): where the approach misses finished, by direction, as eight labelled cells around
 * the pin, never as positions on a green (shots store a direction and a distance, not a point). Each cell says its count and its
 * share of the shots with a direction logged; the shots with none are counted apart. Choosing a direction is local: no model
 * call, no request. It opens the shots behind it (newest round first, at most the read's cap with the true count said), each
 * opening its round, and "Ask about these shots" sends the next question with that selection (`shots:<direction>`), which the
 * server checks against the read it stored. Drawn only where Ask's page turns it on (the team flag); `MissPattern` otherwise.
 * In the studio's look (coachhelm-ask-studio.css): rules, not boxes; fills only inside the drawing; and it draws in place, so
 * nothing moves when a direction is chosen, with or without reduced motion.
 */

/** Compass order, long at the top as on the old drawing: [row][column]; the middle is the pin. */
const GRID: ReadonlyArray<ReadonlyArray<MissDirection | null>> = [
  ['long_left', 'long', 'long_right'],
  ['left', null, 'right'],
  ['short_left', 'short', 'short_right'],
];
const AT: Record<MissDirection, [number, number]> = Object.fromEntries(GRID.flatMap((row, r) => row.map((d, c) => [d, [r, c]] as const).filter(([d]) => d !== null))) as Record<MissDirection, [number, number]>;
const MOVE: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

export const saidDirection = (d: string): string => d.replace('_', ' ');
const Said = (d: string) => saidDirection(d).replace(/^./, (c) => c.toUpperCase());
const yards = (ft: number | null) => (ft == null ? null : `${Math.round(ft / 3)} yd`);
const feet = (ft: number | null) => (ft == null ? null : `${formatFixed(ft, ft < 10 ? 1 : 0)} ft`);

/** A round's page, where the coach's own access to it is checked (the Rounds route and its RLS). */
export const shotRoundHref = (roundId: string): string => `/golf/dashboard/rounds/${encodeURIComponent(roundId)}`;

export function MissCompass({ block, shots, compact }: { block: MissPatternBlock; shots: MissShotsBlock; compact: boolean }) {
  const gate = useMissCompassGate();
  const counts = new Map(block.wedges.map((w) => [w.direction, w.count] as const));
  const count = (d: MissDirection) => counts.get(d) ?? 0;
  const directed = MISS_DIRECTIONS.reduce((a, d) => a + count(d), 0);
  const most = Math.max(0, ...MISS_DIRECTIONS.map(count));
  const share = (d: MissDirection) => (directed ? Math.round((count(d) / directed) * 100) : 0);
  const [picked, setPicked] = useState<MissDirection | null>(null);
  const [focus, setFocus] = useState<MissDirection | null>(null);
  const cells = useRef(new Map<MissDirection, HTMLButtonElement | null>());
  const id = useId();
  const open = MISS_DIRECTIONS.filter((d) => count(d) > 0);
  // One stop in the tab order: the chosen direction, else the one with the most misses.
  const tabStop = picked ?? focus ?? open.slice().sort((a, b) => count(b) - count(a))[0] ?? null;

  const choose = (d: MissDirection) => {
    setPicked(d);
    setFocus(d);
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, from: MissDirection) => {
    const step = MOVE[e.key];
    if (!step) return;
    e.preventDefault();
    // Walk the compass that way to the next direction with misses; at the edge it stays.
    let [r, c] = AT[from];
    for (;;) {
      r += step[0];
      c += step[1];
      if (r < 0 || r > 2 || c < 0 || c > 2) return;
      const next = GRID[r]![c];
      if (next && count(next) > 0) {
        choose(next);
        cells.current.get(next)?.focus();
        return;
      }
    }
  };

  const cell = (d: MissDirection) => {
    const n = count(d);
    const on = picked === d;
    return (
      <button
        key={d}
        ref={(el) => {
          cells.current.set(d, el);
        }}
        type="button"
        role="radio"
        aria-checked={on}
        aria-label={`${Said(d)}, ${plural(n, 'shot')}${n ? `, ${share(d)}%` : ''}`}
        tabIndex={d === tabStop ? 0 : -1}
        className={'ch-aks-compass__dir' + (n === most && n > 0 ? ' is-most' : '') + (on ? ' is-on' : '')}
        data-dir={d}
        data-ch-press=""
        disabled={n === 0}
        onClick={() => choose(d)}
        onKeyDown={(e) => onKey(e, d)}
      >
        <span className="ch-aks-compass__word">{Said(d)}</span>
        <b className="ch-aks-compass__n ch-num">{n}</b>
        <small className="ch-aks-compass__share ch-num">{n ? `${share(d)}%` : 'none'}</small>
        {/* Its count against the commonest, as a ruled length: drawn in place, never grown. */}
        <svg className="ch-aks-compass__bar" viewBox="0 0 100 3" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <rect width={most ? Math.round((n / most) * 1000) / 10 : 0} height="3" />
        </svg>
      </button>
    );
  };

  const kept = picked ? shots.directions[picked] : undefined;
  const askAbout = gate.askAbout;
  // On a phone the sheet would sit over the answer as it arrives: a sent ask closes it. On a desk the drawer stays where it is.
  const onAsk =
    askAbout && picked && kept
      ? () => {
          const sent = askAbout(`Ask about the ${plural(kept.count, 'shot')} that missed ${saidDirection(picked)}`, { evidence_ref: shots.ref, key: `shots:${picked}` });
          if (sent && compact) setPicked(null);
          return sent;
        }
      : undefined;
  const drawer = picked && kept ? <ShotList direction={picked} count={kept.count} rows={kept.shots} cap={shots.cap} headId={`${id}-h`} onAsk={onAsk} onClose={() => setPicked(null)} /> : null;

  return (
    <figure className="ch-aks-compass" data-size={compact ? 'compact' : 'full'}>
      <div className="ch-aks-compass__rose" role="radiogroup" aria-label={`Where the misses finished, by direction: ${plural(directed, 'shot')} with a direction logged`}>
        {GRID.map((row, r) =>
          row.map((d, c) =>
            d ? (
              cell(d)
            ) : (
              <span key={`pin-${r}-${c}`} className="ch-aks-compass__pin" aria-hidden="true">
                <svg viewBox="0 0 8 8" focusable="false">
                  <circle cx="4" cy="4" r="4" />
                </svg>
                <span className="ch-num">{block.total}</span>
                <small>shots</small>
              </span>
            ),
          ),
        )}
      </div>
      <figcaption className="ch-num">
        {plural(block.total, 'shot')} · {block.inside_15} inside 15 ft · {block.inside_25} inside 25 ft
        {block.no_direction ? ` · ${block.no_direction} with no direction logged, not in the shares` : ''}. Directions, not places on the green.
      </figcaption>
      {compact ? (
        <Modal open={!!drawer} onClose={() => setPicked(null)} title={picked ? `${plural(kept?.count ?? 0, 'shot')} missed ${saidDirection(picked)}` : 'Shots'} detent={0.62} className="ch-aks-compass__sheet">
          {drawer}
        </Modal>
      ) : (
        drawer
      )}
    </figure>
  );
}

/** The shots behind one direction: date, course, from and left, lie; each row opens its round. */
function ShotList({ direction, count, rows, cap, headId, onAsk, onClose }: { direction: MissDirection; count: number; rows: MissShotsBlock['directions'][string]['shots']; cap: number; headId: string; onAsk?: () => boolean; onClose: () => void }): ReactNode {
  const capped = count > rows.length;
  return (
    <section className="ch-aks-compass__drawer" aria-labelledby={headId} data-dir={direction}>
      <header>
        <h4 id={headId}>
          {plural(count, 'shot')} missed {saidDirection(direction)}
        </h4>
        <button type="button" className="ch-aks-compass__close" aria-label="Close the shots" data-ch-press="" onClick={onClose}>
          <Icon icon={X} size={16} />
        </button>
      </header>
      {capped && <p className="ch-aks-compass__capped">The newest {Math.min(rows.length, cap)} of {count}, by round.</p>}
      <ul className="ch-aks-compass__shots">
        {rows.map((s) => {
          const said = [s.from_ft != null && `from ${yards(s.from_ft)}`, s.left_ft != null && `left ${feet(s.left_ft)}`, s.lie_before && `from the ${s.lie_before.replace(/_/g, ' ')}`].filter(Boolean).join(' · ');
          const when = s.round_date ? weekdayMonthDay(s.round_date) : 'Undated round';
          return (
            <li key={s.id}>
              <a className="ch-aks-compass__shot" href={shotRoundHref(s.round_id)} aria-label={`Open the round: ${when}${s.course ? `, ${s.course}` : ''}${said ? `, ${said}` : ''}`} data-ch-press="">
                <span className="ch-aks-compass__when">
                  <b>{when}</b>
                  {s.course && <small>{s.course}</small>}
                </span>
                <span className="ch-aks-compass__said ch-num">{said}</span>
                <Icon icon={ArrowUpRight} size={16} />
              </a>
            </li>
          );
        })}
      </ul>
      {onAsk && (
        <div className="ch-aks-compass__ask">
          <Button variant="secondary" onClick={() => onAsk()}>
            Ask about these shots
          </Button>
        </div>
      )}
    </section>
  );
}
