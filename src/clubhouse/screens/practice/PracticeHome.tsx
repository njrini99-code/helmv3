'use client';

import { ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ChPracticeHome, ChPracticeRow, ChPracticeState, ChPracticeTile } from '../../data/practice-home-shape';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop } from '../../shell/phone-chrome';
import { PhoneIconAction } from '../../ui/PhoneBar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { LargeTitle } from '../../ui/LargeTitle';
import { EmptyState } from '../../ui/States';
import { NewPlanSheet } from './NewPlanSheet';

const CHIP: Record<ChPracticeState, string> = { 'No plan': 'is-none', Draft: 'is-draft', Published: 'is-live', Updated: 'is-live', Done: 'is-done' };

export function StateChip({ state }: { state: ChPracticeState }) {
  return <span className={`ch-prc-chip ${CHIP[state]}`}>{state}</span>;
}

/** This week: seven tiles, Monday to Sunday in the team's zone. A tile with a plan opens it; one without starts New plan on that practice. */
export function WeekStrip({ week, onPlan }: { week: ChPracticeTile[]; onPlan?: (eventId: string) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  // A phone's strip scrolls: today starts in view, without moving the page.
  useEffect(() => {
    const box = strip.current;
    const today = box?.querySelector<HTMLElement>('.is-today');
    if (box && today && box.scrollWidth > box.clientWidth) box.scrollLeft = Math.max(0, today.offsetLeft - box.offsetLeft - 16);
  }, []);
  return (
    <div ref={strip} className="ch-prc-week" role="list" aria-label="This week">
      {week.map((t) => (
        <div key={t.key} role="listitem" className={'ch-prc-tile' + (t.today ? ' is-today' : '')}>
          <span className="ch-prc-tile__d ch-num">
            {t.day} <b>{t.date}</b>
          </span>
          {t.items.length === 0 && <span className="ch-prc-tile__none">No practice</span>}
          {t.items.map((it, i) =>
            it.href ? (
              <Link key={i} className="ch-prc-tile__it" href={it.href}>
                <span className="ch-num">{it.time}</span>
                <StateChip state={it.state} />
              </Link>
            ) : it.eventId && onPlan ? (
              <button key={i} type="button" className="ch-prc-tile__it" onClick={() => onPlan(it.eventId!)}>
                <span className="ch-num">{it.time}</span>
                <StateChip state={it.state} />
              </button>
            ) : (
              <span key={i} className="ch-prc-tile__it">
                <span className="ch-num">{it.time}</span>
                <StateChip state={it.state} />
              </span>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

export function PlanRows({ rows, label }: { rows: ChPracticeRow[]; label: string }) {
  return (
    <ul className="ch-prc-rows" aria-label={label}>
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={r.href} className="ch-prc-row">
            <span className="ch-prc-row__m">
              <span className="ch-prc-row__top">
                <b>{r.title}</b>
                <StateChip state={r.state} />
              </span>
              <span className="ch-prc-row__w ch-num">
                {r.day} · {r.time}
              </span>
              {r.line && <span className="ch-prc-row__l ch-num">{r.line}</span>}
              {r.edits && <span className="ch-prc-row__e">Edits not published</span>}
            </span>
            <Icon icon={ChevronRight} size={16} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Practice, the coach's tab (S-PRC.home): the week, what's up next, and every plan. New plan is the page's one primary action; on a phone it is the
 * bar's plus. With no plan ever made, one card with the ways to start (S-PRC.home-first-run), and no empty headers.
 */
export function PracticeHome({ data, askOn, openNew = false, previewSheet = false }: { data: ChPracticeHome; askOn: boolean; openNew?: boolean; previewSheet?: boolean }) {
  const phone = useChPhone();
  const [sheet, setSheet] = useState<{ event: string | null } | null>(openNew ? { event: null } : null);
  const [pastOpen, setPastOpen] = useState(false);
  const [pastShown, setPastShown] = useState(20);
  const newPlan = () => setSheet({ event: null });
  return (
    <main className={'ch-page ch-prc' + (phone ? ' is-phone' : '')} data-ch="practice" aria-labelledby="ch-prc-title">
      {phone && <PhoneTop start title="Practice" action={<PhoneIconAction icon={Plus} label="New plan" onClick={newPlan} />} />}
      <header className="ch-prc-h">
        <div>
          <LargeTitle id="ch-prc-title">Practice</LargeTitle>
          {data.weekLine && <p className="ch-prc-h__line ch-num">{data.weekLine}</p>}
        </div>
        {!phone && (
          <div className="ch-prc-h__a">
            {askOn && <Button href="/golf/dashboard/practice/format">Plan format</Button>}
            <Button variant="primary" leftIcon={Plus} onClick={newPlan}>
              New plan
            </Button>
          </div>
        )}
      </header>

      <section aria-label="This week">
        <WeekStrip week={data.week} onPlan={(event) => setSheet({ event })} />
      </section>

      {data.firstRun ? (
        <section className="ch-prc-card ch-prc-first" data-ch-code="CH-13396">
          <h2>Plan your first practice</h2>
          <p>Add blocks yourself{askOn ? ', or let CoachHelm draft it from your team’s data' : ''}. Players see it when you publish.</p>
          {data.open.length ? (
            <Button variant="primary" onClick={newPlan}>
              New plan
            </Button>
          ) : (
            <Button variant="primary" href="/golf/dashboard/calendar">
              Add a practice
            </Button>
          )}
        </section>
      ) : (
        <>
          {data.upNext ? (
            <section className="ch-prc-card ch-prc-next" aria-label="Up next">
              <span className="ch-prc-next__k">Up next</span>
              <h2>{data.upNext.title}</h2>
              <p className="ch-num">{data.upNext.when}</p>
              {data.upNext.rows.length > 0 ? (
                <ol className="ch-prc-next__rows">
                  {data.upNext.rows.map((r, i) => (
                    <li key={i}>
                      <span className="ch-num">{r.time}</span>
                      <b>{r.title}</b>
                      {r.place && <span>{r.place}</span>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="ch-prc-next__none">No plan yet</p>
              )}
              <div className="ch-prc-next__a">
                {data.upNext.planHref && <Button href={data.upNext.planHref}>Open plan</Button>}
                {data.upNext.editHref && <Button variant={data.upNext.planHref ? 'secondary' : 'primary'} href={data.upNext.editHref}>Edit</Button>}
                {data.upNext.eventId && (
                  <Button variant="primary" onClick={() => setSheet({ event: data.upNext!.eventId })}>
                    Build plan
                  </Button>
                )}
              </div>
            </section>
          ) : (
            <EmptyState shape="week" title="No practices this week" body="Add one on the calendar, then plan it here." action={<Button href="/golf/dashboard/calendar">Go to Calendar</Button>} code="CH-13396" />
          )}
          {data.drafts.length > 0 && (
            <section className="ch-prc-sec" aria-labelledby="ch-prc-drafts">
              <h2 id="ch-prc-drafts">Drafts</h2>
              <PlanRows rows={data.drafts} label="Drafts" />
            </section>
          )}
          {data.published.length > 0 && (
            <section className="ch-prc-sec" aria-labelledby="ch-prc-pub">
              <h2 id="ch-prc-pub">Published</h2>
              <PlanRows rows={data.published} label="Published" />
            </section>
          )}
          {data.past.length > 0 && (
            <section className="ch-prc-sec">
              <button type="button" className="ch-prc-past" aria-expanded={pastOpen} onClick={() => setPastOpen((v) => !v)}>
                Past plans ({data.past.length})
                <Icon icon={ChevronRight} size={16} />
              </button>
              {pastOpen && <PlanRows rows={data.past.slice(0, pastShown)} label="Past plans" />}
              {pastOpen && data.past.length > pastShown && <Button onClick={() => setPastShown((n) => n + 20)}>Show more</Button>}
            </section>
          )}
        </>
      )}
      {phone && askOn && (
        <Link href="/golf/dashboard/practice/format" className="ch-prc-past ch-prc-formatlink">
          Plan format
          <Icon icon={ChevronRight} size={16} />
        </Link>
      )}
      <NewPlanSheet key={sheet?.event ?? 'new'} open={!!sheet} onClose={() => setSheet(null)} events={data.open} copies={data.copies} roster={data.roster} askOn={askOn} initialEvent={sheet?.event} preview={previewSheet} />
    </main>
  );
}
