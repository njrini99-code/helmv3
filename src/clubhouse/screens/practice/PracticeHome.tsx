'use client';

import type { PlanBodyV2 } from '@/lib/coachhelm/v3/practice-plan/model';
import { PracticeTabs } from './PracticeTabs';
import { ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ChPracticeHome, ChPracticeRow, ChPracticeState, ChPracticeTile } from '../../data/practice-home-shape';
import { pluralWord } from '../../lib/plural';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop } from '../../shell/phone-chrome';
import { PhoneIconAction } from '../../ui/PhoneBar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { LargeTitle } from '../../ui/LargeTitle';
import { EmptyState } from '../../ui/States';
import { Badge, type BadgeTone } from '../../ui/Badge';
import { DayLegend, DayStrip, type DaySeg } from './DayStrip';
import { wholeFacts } from './facts';
import { NewPlanSheet, type NewPlanStart } from './NewPlanSheet';

/** The state's word and tone. A past plan reads "Ended" (05 S-PRC.past); the tone never carries the meaning alone. */
const STATE: Record<ChPracticeState, { word: string; tone: BadgeTone; dot?: boolean }> = {
  'No plan': { word: 'No plan', tone: 'neutral' },
  Draft: { word: 'Draft', tone: 'neutral', dot: true },
  Published: { word: 'Published', tone: 'positive' },
  Updated: { word: 'Updated', tone: 'positive' },
  Done: { word: 'Ended', tone: 'neutral' },
};

export function StateChip({ state }: { state: ChPracticeState }) {
  const s = STATE[state];
  return (
    <Badge tone={s.tone} dot={s.dot}>
      {s.word}
    </Badge>
  );
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
        <div key={t.key} role="listitem" className={'ch-prc-tile' + (t.today ? ' is-today' : '') + (t.items.length ? '' : ' is-off')} aria-current={t.today ? 'date' : undefined}>
          <span className="ch-prc-tile__d ch-num">
            <span>{t.day}</span>
            <b className="ch-num">{t.date}</b>
          </span>
          {t.items.length === 0 && <span className="ch-prc-tile__none">No practice</span>}
          {t.items.map((it, i) => {
            const inner = (
              <>
                <span className="ch-num">{it.time}</span>
                <StateChip state={it.state} />
              </>
            );
            return it.href ? (
              <Link key={i} className="ch-prc-tile__it" href={it.href}>
                {inner}
              </Link>
            ) : it.eventId && onPlan ? (
              <button key={i} type="button" className="ch-prc-tile__it" onClick={() => onPlan(it.eventId!)}>
                {inner}
              </button>
            ) : (
              <span key={i} className="ch-prc-tile__it">
                {inner}
              </span>
            );
          })}
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
          <Link href={r.href} className="ch-prc-row" data-ch-press=".97">
            <span className="ch-prc-row__m">
              <span className="ch-prc-row__top">
                <b>{r.title}</b>
                <StateChip state={r.state} />
              </span>
              <span className="ch-prc-row__w ch-num">
                {wholeFacts(`${r.day} · ${r.time}`)}
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

const UP_NEXT_ROWS = 4;

/**
 * Practice, the coach's tab (S-PRC.home): the week, what's up next, and every plan. New plan is the page's one primary action; on a phone it is the
 * bar's plus. With no plan ever made, one card with the ways to start (S-PRC.home-first-run), and no empty headers.
 */
export function PracticeHome({ data, openNew = false, previewSheet = false, template = null, newEvent = null }: { newEvent?: string | null; template?: { name: string; body: PlanBodyV2 } | null; data: ChPracticeHome; openNew?: boolean; previewSheet?: boolean }) {
  const phone = useChPhone();
  const [sheet, setSheet] = useState<{ event: string | null; start?: NewPlanStart } | null>(openNew ? { event: newEvent } : null);
  const [pastOpen, setPastOpen] = useState(false);
  const [pastShown, setPastShown] = useState(20);
  const newPlan = (start?: NewPlanStart) => setSheet({ event: null, start });
  const up = data.upNext;
  // The day to scale: each block as wide as its minutes. A plan read without lengths draws no strip rather than a guessed one.
  // Coloured by kind of work as the builder's is, when the plan was read with its drills; else a stretch a row, plain.
  const segs: DaySeg[] = up?.day ? up.day.map((d, i) => ({ id: String(i), ...d })) : up && up.rows.every((r) => typeof r.min === 'number') ? up.rows.map((r, i) => ({ id: String(i), min: r.min ?? 0 })) : [];
  // The plan Up next draws is not listed again under Drafts: its name, day and blocks are already on the page, with the key that opens it.
  const drafts = up?.editHref ? data.drafts.filter((r) => r.href !== up.editHref) : data.drafts;
  const listed = !data.firstRun && drafts.length + data.published.length + data.past.length > 0;
  const more = up ? Math.max(0, up.rows.length - UP_NEXT_ROWS) : 0;
  return (
    <main className={'ch-page ch-prc' + (phone ? ' is-phone' : '')} data-ch="practice" aria-labelledby="ch-prc-title">
      {phone && <PhoneTop start title="Practice" action={<PhoneIconAction icon={Plus} label="New plan" onClick={() => newPlan()} />} />}
      <header className="ch-prc-h">
        <div>
          <LargeTitle id="ch-prc-title">Practice</LargeTitle>
          {data.weekLine && <p className="ch-prc-h__line ch-num">{data.weekLine}</p>}
        </div>
        {!phone && (
          <div className="ch-prc-h__a">
            <Button href="/golf/dashboard/practice/format">Plan format</Button>
            <Button variant="primary" leftIcon={Plus} onClick={() => newPlan()}>
              New plan
            </Button>
          </div>
        )}
      </header>

      <section aria-label="This week">
        <WeekStrip week={data.week} onPlan={(event) => setSheet({ event })} />
      </section>

      {/* On a Mac the tabs sit over both columns: Up next, with the plans beside it. On a phone they sit over the plans, under Up next. */}
      {!phone && <PracticeTabs active="plans" />}
      <div className={'ch-prc-home' + (listed ? ' has-plans' : '')}>
      {data.firstRun ? (
        <section className="ch-prc-card ch-prc-first" data-ch-code="CH-13396" aria-labelledby="ch-prc-first">
          <h2 id="ch-prc-first">Plan your first practice</h2>
          <p>Build it block by block, start from a template, or let CoachHelm draft it from your team’s data. Players see a plan only when you publish it.</p>
          {data.open.length ? (
            <ul className="ch-prc-starts">
              <li>
                <button type="button" className="ch-prc-start" data-ch-press=".97" onClick={() => newPlan('ask')}>
                  <span>
                    <b>Ask CoachHelm</b>
                    <span>It drafts from your team’s data. You keep what you like.</span>
                  </span>
                  <Icon icon={ChevronRight} size={16} />
                </button>
              </li>
              <li>
                <Link className="ch-prc-start" data-ch-press=".97" href="/golf/dashboard/practice/templates">
                  <span>
                    <b>Start from a template</b>
                    <span>Six starters from GolfHelm, ready to change.</span>
                  </span>
                  <Icon icon={ChevronRight} size={16} />
                </Link>
              </li>
              <li>
                <button type="button" className="ch-prc-start" data-ch-press=".97" onClick={() => newPlan('blank')}>
                  <span>
                    <b>Blank</b>
                    <span>Add blocks yourself.</span>
                  </span>
                  <Icon icon={ChevronRight} size={16} />
                </button>
              </li>
            </ul>
          ) : (
            <div className="ch-prc-first__a">
              <p>There is no practice on the calendar in the next two weeks to plan.</p>
              <Button variant="primary" href="/golf/dashboard/calendar">
                Add a practice
              </Button>
            </div>
          )}
        </section>
      ) : (
        <>
          {up ? (
            <section className="ch-prc-card ch-prc-next" aria-labelledby="ch-prc-next">
              <div className="ch-prc-next__k">
                <span>Up next</span>
                {up.state ? <StateChip state={up.state} /> : <StateChip state="No plan" />}
              </div>
              <h2 id="ch-prc-next">{up.title}</h2>
              <p className="ch-prc-next__w ch-num">{wholeFacts(up.when)}</p>
              {up.rows.length > 0 ? (
                <>
                  <DayStrip segs={segs} />
                  <DayLegend segs={segs} />
                  <ol className="ch-prc-next__rows">
                    {up.rows.slice(0, UP_NEXT_ROWS).map((r, i) => (
                      <li key={i}>
                        <span className="ch-num">{r.time}</span>
                        <b>{r.title}</b>
                        {r.place && <span>{r.place}</span>}
                      </li>
                    ))}
                  </ol>
                  {more > 0 && <p className="ch-prc-next__more ch-num">and {more} more {pluralWord(more, 'block')}</p>}
                </>
              ) : (
                <p className="ch-prc-next__none">{up.eventId ? 'No plan for this practice yet.' : 'This plan has no blocks yet.'}</p>
              )}
              <div className="ch-prc-next__a">
                {up.planHref && <Button href={up.planHref}>Open plan</Button>}
                {up.editHref && (
                  <Button variant={up.planHref ? 'secondary' : 'primary'} href={up.editHref}>
                    {up.planHref ? 'Edit' : 'Keep building'}
                  </Button>
                )}
                {up.eventId && (
                  <Button variant="primary" onClick={() => setSheet({ event: up.eventId })}>
                    Build plan
                  </Button>
                )}
              </div>
            </section>
          ) : (
            // The week's tiles already say there is no practice on each day: this says only what to do about it.
            <EmptyState shape="week" title="Add a practice on the calendar" body="Then plan it here." action={<Button href="/golf/dashboard/calendar">Go to Calendar</Button>} code="CH-13396" />
          )}
        </>
      )}

      {phone && <PracticeTabs active="plans" />}

      {listed && (
        <div className="ch-prc-home__plans">
          {drafts.length > 0 && (
            <section className="ch-prc-sec" aria-labelledby="ch-prc-drafts">
              <h2 id="ch-prc-drafts">Drafts</h2>
              <PlanRows rows={drafts} label="Drafts" />
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
              <button type="button" className="ch-prc-open ch-num" aria-expanded={pastOpen} onClick={() => setPastOpen((v) => !v)}>
                Past plans ({data.past.length})
                <Icon icon={ChevronRight} size={16} />
              </button>
              {pastOpen && <PlanRows rows={data.past.slice(0, pastShown)} label="Past plans" />}
              {pastOpen && data.past.length > pastShown && <Button onClick={() => setPastShown((n) => n + 20)}>Show more</Button>}
            </section>
          )}
        </div>
      )}
      </div>
      {phone && (
        <Link href="/golf/dashboard/practice/format" className="ch-prc-open">
          Plan format
          <Icon icon={ChevronRight} size={16} />
        </Link>
      )}
      <NewPlanSheet key={`${sheet?.event ?? 'new'}:${sheet?.start ?? ''}`} template={template} open={!!sheet} onClose={() => setSheet(null)} events={data.open} copies={data.copies} roster={data.roster} initialEvent={sheet?.event} initialStart={sheet?.start} preview={previewSheet} />
    </main>
  );
}
