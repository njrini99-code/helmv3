'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ChCourseHistory } from '../../data/course-page-shape';
import { formatFixed, formatToPar } from '../../lib/format';
import { Button } from '../../ui/Button';
import { NoData } from '../../ui/NoData';
import { RoundRow } from './parts';

/**
 * P-7 4.2 to 4.4: one player's history at one course. The hero is the one green card; everything under it is flush under
 * the double rule (the owner's "phone too cardy"). Numbers draw at their final state: nothing counts up. Later sections
 * (the hole map, how it plays, the average arc, compare) join under the figures.
 */

const reviewHref = (id: string) => `/golf/dashboard/rounds/${id}`;
const toneOf = (toPar: number | null | undefined) => (toPar == null || toPar === 0 ? '' : toPar < 0 ? ' is-under' : ' is-over');

export function CoursePage({ history: h, playerName, playerId, initialHole }: { history: ChCourseHistory; playerName: string | null; playerId: string | null; initialHole: number | null }) {
  const coach = playerId != null;
  const who = coach ? (playerName ?? 'This player') : null;
  void initialHole;
  return (
    <main className="ch-ch" aria-labelledby="ch-ch-title">
      <CourseHero h={h} coach={coach} />
      <section className="ch-ch-sec" aria-labelledby="ch-ch-fig-h">
        <h2 id="ch-ch-fig-h" className="ch-sr-only">
          Figures
        </h2>
        <div className="ch-ch-fig">
          {h.figures.map((f) => {
            const body = (
              <>
                <span className="ch-ch-fig__l">{f.label}</span>
                <b className="ch-ch-fig__v ch-num">{f.value ?? <NoData label={f.sub} />}</b>
                <span className={'ch-ch-fig__s ch-num' + toneOf(f.toPar)}>{f.sub}</span>
              </>
            );
            return f.roundId ? (
              <Link key={f.label} className="ch-ch-fig__c is-link" href={reviewHref(f.roundId)} aria-label={`${f.label}: ${f.value}, ${f.sub}. Open the round`}>
                {body}
              </Link>
            ) : (
              <div key={f.label} className="ch-ch-fig__c">
                {body}
              </div>
            );
          })}
        </div>
      </section>
      {h.lastTime && <LastTime t={h.lastTime} who={who} />}
      <section className="ch-ch-sec" aria-labelledby="ch-ch-rounds-h">
        <div className="ch-ch-sec__h">
          <h2 id="ch-ch-rounds-h">{who ? `${who}’s rounds here` : 'Your rounds here'}</h2>
        </div>
        <div className="ch-rd-book">
          {h.rounds.map((r) => (
            <RoundRow key={r.id} r={r} href={reviewHref(r.id)} />
          ))}
        </div>
      </section>
    </main>
  );
}

function CourseHero({ h, coach }: { h: ChCourseHistory; coach: boolean }) {
  const f = h.hero.figure;
  return (
    <header className="ch-ch-hero">
      <div className="ch-ch-hero__l">
        <span className="ch-ch-hero__k">{h.hero.kicker}</span>
        <h1 id="ch-ch-title">{h.name}</h1>
        {h.hero.place && <p className="ch-ch-hero__p">{h.hero.place}</p>}
      </div>
      <div className="ch-ch-hero__r">
        <div className="ch-ch-hero__f">
          <b className="ch-num">{f.kind === 'average' ? formatFixed(f.value, 1) : f.value}</b>
          <span>
            <em>{f.kind === 'average' ? 'Average' : f.nine ? 'Last nine' : 'Last time'}</em>
            <span className="ch-num">{f.kind === 'average' ? (f.toPar == null ? '' : `${formatToPar(Math.round(f.toPar * 10) / 10)} to par`) : shortDay(f.date)}</span>
          </span>
        </div>
        {f.kind === 'average' && f.early != null && <p className="ch-ch-hero__e">Early read · {f.early} rounds</p>}
        {!coach && h.courseId && (
          <Button variant="secondary" className="ch-ch-hero__go" href={`/golf/dashboard/rounds/new?course=${h.courseId}`}>
            Start a round here
          </Button>
        )}
      </div>
    </header>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const shortDay = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

function LastTime({ t, who }: { t: NonNullable<ChCourseHistory['lastTime']>; who: string | null }) {
  return (
    <section className="ch-ch-sec" aria-labelledby="ch-ch-last-h">
      <div className="ch-ch-sec__h">
        <h2 id="ch-ch-last-h">Last time here</h2>
      </div>
      <Link className="ch-ch-last__sub ch-num" href={reviewHref(t.id)}>
        {t.line}
      </Link>
      {t.note && <NotePlate label={who ? `${who}’s note` : 'Your note'} text={t.note} />}
      {t.coachNote && <NotePlate label="Coach’s note" text={t.coachNote} />}
    </section>
  );
}

function NotePlate({ label, text }: { label: string; text: string }) {
  const [all, setAll] = useState(false);
  const long = text.length > 220;
  return (
    <div className="ch-ch-note">
      <span className="ch-ch-note__l">{label}</span>
      <p className={long && !all ? 'is-clamped' : undefined}>{text}</p>
      {long && (
        <button type="button" className="ch-ch-note__more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  );
}
