'use client';

import type { CSSProperties } from 'react';
import type { ChHubTab } from '../../lib/hub-tabs';
import { useHScroll } from '../../ui/use-hscroll';
import { pluralWord } from '../../lib/plural';
import { untouchedLine, type StripItem, type TaskFigures } from './hub-summary';

/**
 * Team Hub's two summary surfaces (hub-summary.ts decides what they say; this draws it): the strip under the title
 * (what the team is waiting on, one line) and the coach's task board (how far the team's tasks have got). Home's
 * widgets are in widgets.tsx.
 */

/**
 * The strip: what the team owes, as figures that open the tab they count (W20: at most three, a number over its words,
 * never a sentence of links). Each figure's name is its sentence ("1 task overdue"), which is also how a screen reader
 * hears the tabs' figures. On a desktop the row scrolls sideways if it outgrows the page (the clipped edge fades); on a
 * phone it wraps (hub.css): a second sideways scroller over the tabs cut a figure mid-word at the screen's edge.
 */
export function HubStrip({ items, onOpen }: { items: StripItem[]; onOpen: (tab: ChHubTab) => void }) {
  const edges = useHScroll<HTMLUListElement>();
  if (!items.length) return null;
  return (
    <ul ref={edges} className="ch-hscroll ch-hb-strip" aria-label="Team at a glance">
      {items.map((s) => (
        <li key={s.key} className={s.warn ? 'is-warn' : undefined}>
          <button type="button" onClick={() => onOpen(s.tab)}>
            {/* The space is its own text node: the column ignores it, and the name reads "1 task overdue", not "1task". */}
            <b className="ch-num">{s.n}</b> <span>{s.after.trimStart()}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The coach's Tasks board, in two labelled units: the figures count tasks (as the strip and the tab's badge do), and the
 * track counts assignments, one task for one player, so "3 open" never sits beside a per-player "10 left".
 */
export function TaskBoard({ figures }: { figures: TaskFigures }) {
  const total = figures.done + figures.left;
  const pct = total ? figures.done / total : 0;
  return (
    <section className="ch-hb-board" aria-label="Task progress">
      <dl className="ch-hb-board__f">
        <div>
          <dt>open {pluralWord(figures.open, 'task', 'tasks')}</dt>
          <dd className="ch-num">{figures.open}</dd>
        </div>
        <div className={figures.overdue > 0 ? 'is-warn' : undefined}>
          <dt>overdue</dt>
          <dd className="ch-num">{figures.overdue}</dd>
        </div>
        <div>
          <dt>complete</dt>
          <dd className="ch-num">{figures.complete}</dd>
        </div>
      </dl>
      <div className="ch-hb-board__m">
        <div className="ch-hb-board__l">
          <span>Player assignments</span>
          <b className="ch-num">{total === 0 ? 'None yet' : `${figures.done} of ${total} done`}</b>
        </div>
        <div className="ch-hb-board__t" role="img" aria-label={`${figures.done} of ${total} player assignments done`}>
          <i style={{ '--ch-hb-p': pct } as CSSProperties} />
        </div>
        <p className="ch-num">{total === 0 ? 'Nothing assigned yet.' : (untouchedLine(figures) ?? 'One assignment is one task for one player.')}</p>
      </div>
    </section>
  );
}
