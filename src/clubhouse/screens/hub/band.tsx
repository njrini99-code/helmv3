'use client';

import { Pencil } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { ChHubTrip } from '../../data/hub';
import type { ChHubTab } from '../../lib/hub-tabs';
import { Button } from '../../ui/Button';
import { useHScroll } from '../../ui/use-hscroll';
import { useChReducedMotion } from '../../lib/reduced-motion';
import type { Band, BandFact, StripItem, TaskFigures } from './hub-summary';

/**
 * Team Hub's three summary surfaces (hub-summary.ts decides what they say; this draws it):
 * the strip under the title (what the team is waiting on, one line), Home's band (the one thing the page leads with,
 * on the page's one dark surface) and the coach's task board (how far the team's tasks have got).
 */

/**
 * The strip: figures that open the tab they count. A figure with no tab is plain text. It is one line that scrolls
 * sideways when the figures outgrow it (the clipped edge fades), so its height never depends on what it says and the
 * loading skeleton can hold it.
 */
export function HubStrip({ items, onOpen }: { items: StripItem[]; onOpen: (tab: ChHubTab) => void }) {
  const edges = useHScroll<HTMLUListElement>();
  if (!items.length) return null;
  return (
    <ul ref={edges} className="ch-hscroll ch-hb-strip" aria-label="Team at a glance">
      {items.map((s) => {
        const tab = s.tab;
        const body = (
          <>
            {s.before}
            {s.n != null && <b className="ch-num">{s.n}</b>}
            {s.after}
          </>
        );
        return (
          <li key={s.key} className={s.warn ? 'is-warn' : undefined}>
            {tab ? (
              <button type="button" onClick={() => onOpen(tab)}>
                {body}
              </button>
            ) : (
              <span>{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const isFigure = (f: BandFact) => !!f.value && /^\d+$/.test(f.value);

/** Home's band, desktop only: a trip about to leave, else the next event, else the next trip, else a quiet page that says so. */
export function HubBand({ band, onEditTrip }: { band: Band; onEditTrip: (t: ChHubTrip) => void }) {
  const reduced = useChReducedMotion();
  const act = band.action;
  return (
    <section className="ch-hb-band" data-band={band.kind} aria-labelledby="ch-hb-band-title">
      <div className="ch-hb-band__main">
        <span className="ch-hb-band__k ch-num">{band.eyebrow}</span>
        <h2 id="ch-hb-band-title">{band.title}</h2>
        {band.body && <p>{band.body}</p>}
        {act?.kind === 'link' && (
          <Button variant="primary" href={act.href}>
            {act.label}
          </Button>
        )}
        {act?.kind === 'jump' && (
          <Button
            variant="primary"
            onClick={() => document.getElementById(act.target)?.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })}
          >
            {act.label}
          </Button>
        )}
        {act?.kind === 'edit-trip' && (
          <Button variant="primary" leftIcon={Pencil} onClick={() => onEditTrip(act.trip)}>
            {act.label}
          </Button>
        )}
      </div>
      {band.facts.length > 0 && (
        <dl className="ch-hb-band__f">
          {band.facts.map((f) => (
            <div key={f.label} className={[isFigure(f) && 'is-figure', f.warn && 'is-warn'].filter(Boolean).join(' ') || undefined}>
              <dt>{f.label}</dt>
              <dd className="ch-num">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** The coach's Tasks board: completions across every assignment, what is late, and a track for how far the team has got. */
export function TaskBoard({ figures }: { figures: TaskFigures }) {
  const total = figures.done + figures.left;
  const pct = total ? figures.done / total : 0;
  return (
    <section className="ch-hb-board" aria-label="Task progress">
      <dl className="ch-hb-board__f">
        <div>
          <dt>done</dt>
          <dd className="ch-num">{figures.done}</dd>
        </div>
        <div>
          <dt>left</dt>
          <dd className="ch-num">{figures.left}</dd>
        </div>
        <div className={figures.overdue > 0 ? 'is-warn' : undefined}>
          <dt>overdue</dt>
          <dd className="ch-num">{figures.overdue}</dd>
        </div>
      </dl>
      <div className="ch-hb-board__t" role="img" aria-label={`${figures.done} of ${total} done`}>
        <i style={{ '--ch-hb-p': pct } as CSSProperties} />
      </div>
      <p className="ch-num">
        {total === 0
          ? 'Nothing assigned yet.'
          : figures.untouched > 0
            ? `${figures.untouched} overdue ${figures.untouched === 1 ? 'task has' : 'tasks have'} no one done yet.`
            : `${figures.done} of ${total} done across the team.`}
      </p>
    </section>
  );
}
