'use client';

import { AnimatePresence, m } from 'motion/react';
import { ChevronRight, GraduationCap } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { haptic } from '../../lib/haptics';
import { CH_POP, chTween } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { CAL_HH, dayNum, dowOf, fmtHour, monthName, rangeLabel, type ChCalEvent, type ChCalPerson, type ChClassGroup } from './model';

const W = 340;

/**
 * "ACCT 201-001: Introduction to Accounting" → ["ACCT 201", "Introduction to Accounting"]. Registrar titles come in
 * many shapes; a subject code and number lead when there is one, the course name follows the colon, and anything
 * else is shown as it came.
 */
export function courseParts(title: string): [string | null, string] {
  const code = title.match(/^([A-Z]{2,5})\s?-?(\d{3}[A-Z]?)\b/);
  const name = title.includes(':') ? title.slice(title.indexOf(':') + 1).trim() : title;
  if (code) return [`${code[1]} ${code[2]}`, name === title ? title.slice(code[0].length).replace(/^[\s\-\d]+/, '').trim() || title : name];
  return [null, name];
}

/**
 * P006: players' classes that start in the same half hour, one block in the week: the title says Class, the words
 * under it who, and the slate deepens with how many (2–3, 4–6, 7 and up). A press opens the class card: the slot in a
 * slate band, then a row a player with their course; a row opens that class in the inspector.
 */
export function ClassGroupBlock({
  g,
  lane,
  lanes,
  selId,
  people,
  onSelect,
  from,
  to,
}: {
  g: ChClassGroup;
  lane: number;
  lanes: number;
  selId: string | null;
  people: Map<string, ChCalPerson>;
  onSelect: (id: string) => void;
  from: number;
  to: number;
}) {
  const id = useId();
  const reduced = useChReducedMotion();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  const card = useRef<HTMLDivElement | null>(null);

  const start = Math.max(g.start, from);
  const end = Math.min(g.end, to);
  const top = (start - from) * CAL_HH;
  const h = Math.max((end - start) * CAL_HH - 2, 20);
  const step = lanes > 1 ? Math.min(46, 70 / (lanes - 1)) : 0;
  const left = step * lane;
  const nameOf = (e: ChCalEvent) => (e.owner ? people.get(e.owner)?.name : null) ?? e.title;
  const names = [...new Set(g.items.map((e) => nameOf(e).split(' ')[0]!))];
  const more = names.length - 1;
  const sel = g.items.some((e) => e.id === selId);
  const short = h < 40;
  // Lines under the title: padding 12, title 16, a gap of 2, then 15 a line.
  const lines = short ? 0 : Math.min(2, Math.floor((h - 30) / 15));
  const fill = names.length >= 7 ? 3 : names.length >= 4 ? 2 : 1;

  const close = useCallback((focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const ch = card.current?.offsetHeight ?? 320;
      // Beside the block, on the side with room; level with its top, kept on screen.
      const right = r.right + 8 + W <= window.innerWidth - 8;
      const l = right ? r.right + 8 : Math.max(8, r.left - 8 - W);
      const maxHeight = window.innerHeight - 16;
      const t = Math.max(8, Math.min(r.top, window.innerHeight - 8 - Math.min(ch, maxHeight)));
      setPos({ left: l, top: t, maxHeight });
    };
    place();
    const onScroll = (e: Event) => {
      if (card.current && e.target instanceof Node && card.current.contains(e.target)) return;
      close(false);
    };
    window.addEventListener('resize', place);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!card.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    document.addEventListener('mousedown', onDown);
    const frame = requestAnimationFrame(() => card.current?.querySelector<HTMLElement>('.ch-cg__row')?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, close]);

  const onKey = (e: React.KeyboardEvent) => {
    const rows = Array.from(card.current?.querySelectorAll<HTMLElement>('.ch-cg__row') ?? []);
    const i = rows.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      rows[(i + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  const sorted = [...g.items].sort((a, b) => nameOf(a).localeCompare(nameOf(b)) || a.start! - b.start!);

  return (
    <>
      <button
        ref={btn}
        type="button"
        data-print-visible
        className={`ch-ev ch-ev--class ch-ev--group ch-ev--fill-${fill}${short ? ' ch-ev--short' : ''}${lanes > 1 ? ' ch-ev--lane' : ''}${sel || open ? ' is-sel' : ''}`}
        style={{ top, height: h, left: `calc(${left}% + 3px)`, width: `calc(${100 - left}% - 6px)`, zIndex: lanes > 1 ? lane + 1 : undefined }}
        aria-label={`Class: ${names.length} players, ${fmtHour(g.start)} to ${fmtHour(g.until)}. ${names.join(', ')}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          haptic('select');
          setOpen((o) => !o);
        }}
      >
        <span className="ch-ev__t">Class</span>
        {lines >= 2 && <span className="ch-ev__who">{names[0]}</span>}
        {lines >= 2 && more > 0 && <span className="ch-ev__who">{more} more</span>}
        {lines === 1 && <span className="ch-ev__who">{more > 0 ? `${names[0]} +${more}` : names[0]}</span>}
      </button>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <m.div
                ref={card}
                id={id}
                role="dialog"
                aria-label={`Class, ${dowOf(g.date)} ${dayNum(g.date)} ${monthName(g.date)}`}
                className="ch-cg"
                data-ui="clubhouse"
                style={{ left: pos?.left ?? -9999, top: pos?.top, maxHeight: pos?.maxHeight, width: W }}
                initial={reduced ? { opacity: 0 } : CH_POP.initial}
                animate={reduced ? { opacity: 1 } : CH_POP.animate}
                exit={reduced ? { opacity: 0 } : CH_POP.exit}
                transition={chTween('quick', reduced)}
                onKeyDown={onKey}
              >
                <header className="ch-cg__head">
                  <span className="ch-cg__glyph" aria-hidden="true">
                    <Icon icon={GraduationCap} size={16} />
                  </span>
                  <span className="ch-cg__title">
                    <b>Class</b>
                    <span className="ch-num">
                      {dowOf(g.date)} {dayNum(g.date)} {monthName(g.date)} · {fmtHour(g.start)} – {fmtHour(g.until)}
                    </span>
                  </span>
                  <span className="ch-cg__count ch-num">{names.length}</span>
                </header>
                <div className="ch-cg__list">
                  {sorted.map((e) => {
                    const [code, course] = courseParts(e.title);
                    const who = nameOf(e);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        className={'ch-cg__row' + (e.id === selId ? ' is-sel' : '')}
                        onClick={() => {
                          haptic('select');
                          close(false);
                          onSelect(e.id);
                        }}
                      >
                        <Avatar name={who} size={30} />
                        <span className="ch-cg__who">
                          <b>{who}</b>
                          <span>
                            {code && <em className="ch-cg__code">{code}</em>}
                            {e.busyOnly ? 'In class' : course}
                          </span>
                        </span>
                        {(e.start !== g.start || e.end !== g.until) && <span className="ch-cg__time ch-num">{rangeLabel(e)}</span>}
                        <Icon icon={ChevronRight} size={14} />
                      </button>
                    );
                  })}
                </div>
              </m.div>
            )}
          </AnimatePresence>,
          btn.current?.closest('dialog[open]') ?? document.querySelector('.ch-root') ?? document.body,
        )}
    </>
  );
}
