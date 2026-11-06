'use client';

import Link from 'next/link';
import type { ChPlayerPracticeHome } from '../../data/practice-home-shape';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop } from '../../shell/phone-chrome';
import { Button } from '../../ui/Button';
import { LargeTitle } from '../../ui/LargeTitle';
import { EmptyState } from '../../ui/States';
import { PlanRows, WeekStrip } from './PracticeHome';

/** Practice, the player's tab (S-PRC.ply-home): their own next path, the week's published plans and past ones. Never a draft, a Why or another group's stops: it reads live versions only. */
export function PlayerPracticeHome({ data }: { data: ChPlayerPracticeHome }) {
  const phone = useChPhone();
  const none = !data.next && !data.upcoming.length && !data.past.length;
  return (
    <main className={'ch-page ch-prc' + (phone ? ' is-phone' : '')} data-ch="practice" aria-labelledby="ch-prc-title">
      {phone && <PhoneTop start title="Practice" />}
      <header className="ch-prc-h">
        <LargeTitle id="ch-prc-title">Practice</LargeTitle>
      </header>
      {data.next && (
        <section className="ch-prc-card ch-prc-next" aria-label="Next practice">
          <span className="ch-prc-next__k">{data.next.context}</span>
          <h2>
            <Link href={data.next.planHref}>{data.next.title}</Link>
          </h2>
          <p className="ch-num">{data.next.when}</p>
          {data.next.stops.length > 0 && (
            <ol className="ch-prc-next__rows">
              {data.next.stops.map((s, i) => (
                <li key={i} className={s.now ? 'is-now' : undefined} aria-current={s.now ? 'step' : undefined}>
                  <span className="ch-num">{s.time}</span>
                  <b>{s.place}</b>
                  {s.line && <span>{s.line}</span>}
                </li>
              ))}
            </ol>
          )}
          <div className="ch-prc-next__a">
            <Button variant="primary" href={data.next.planHref}>
              Open plan
            </Button>
          </div>
        </section>
      )}
      {none ? (
        <EmptyState size="page" title="No plan yet" body="Your coach hasn’t published a plan for this practice yet." code="CH-17302" />
      ) : (
        <section aria-label="This week">
          <WeekStrip week={data.week} />
        </section>
      )}
      {data.upcoming.length > 0 && (
        <section className="ch-prc-sec" aria-labelledby="ch-prc-up">
          <h2 id="ch-prc-up">Coming up</h2>
          <PlanRows rows={data.upcoming} label="Coming up" />
        </section>
      )}
      {data.past.length > 0 && (
        <section className="ch-prc-sec" aria-labelledby="ch-prc-past">
          <h2 id="ch-prc-past">Past plans</h2>
          <PlanRows rows={data.past.slice(0, 20)} label="Past plans" />
        </section>
      )}
    </main>
  );
}
