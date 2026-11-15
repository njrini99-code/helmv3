'use client';

import { ClipboardList } from 'lucide-react';
import type { ChPlayerPracticeHome } from '../../data/practice-home-shape';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop } from '../../shell/phone-chrome';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { LargeTitle } from '../../ui/LargeTitle';
import { EmptyState } from '../../ui/States';
import { wholeFacts } from './facts';
import { PlanRows, WeekStrip } from './PracticeHome';

/** How many of the player's stops the home card shows before "Open plan": the one on now, the next, and one more. */
const HOME_STOPS = 3;

/**
 * Practice, the player's tab (S-PRC.ply-home): their own next practice drawn as their plan page draws it (one card, one drawing: `.ch-cpv .art`),
 * then the week's published plans and past ones. Never a draft, a Why or another group's stops: it reads live versions only.
 */
export function PlayerPracticeHome({ data }: { data: ChPlayerPracticeHome }) {
  const phone = useChPhone();
  const none = !data.next && !data.upcoming.length && !data.past.length;
  const next = data.next;
  // Start at the stop that is on now (or next), so the card is about this minute, not 2:00.
  const at = next ? Math.max(0, next.stops.findIndex((s) => s.now || s.next)) : 0;
  const stops = next ? next.stops.slice(at, at + HOME_STOPS) : [];
  return (
    <main className={'ch-page ch-prc ch-prc--ply' + (phone ? ' is-phone' : '')} data-ch="practice" aria-labelledby="ch-prc-title">
      {phone && <PhoneTop start title="Practice" />}
      <header className="ch-prc-h">
        <div>
          <LargeTitle id="ch-prc-title">Practice</LargeTitle>
          {next && <p className="ch-prc-h__line">{next.context}</p>}
        </div>
      </header>
      {next && (
        <div className="ch-cpv ch-cpv-ply ch-prc-today">
          <section className="art" aria-label="Next practice">
            <header className="art-h">
              <span className="tile">
                <Icon icon={ClipboardList} size={18} />
              </span>
              <div className="hd">
                <span className="t">{next.title}</span>
                <span className="m ch-num">{wholeFacts(next.when)}</span>
              </div>
            </header>
            {next.focus && <div className="focus">{next.focus}</div>}
            {next.group && (
              <div className="grpl">
                <span className="avs" aria-hidden="true">
                  {[...(next.group.me ? [next.group.me] : []), ...next.group.mates].slice(0, 3).map((m) => (
                    <Avatar key={m} name={m} size="xs" />
                  ))}
                </span>
                <span>
                  <b>Group {next.group.name}</b>
                  {next.group.mates.length > 0 && ` · with ${next.group.mates.join(' and ')}`}
                </span>
              </div>
            )}
          </section>
          {stops.length > 0 && (
            <section className="art" aria-label="Your stops">
              {stops.map((s) => (
                <div className="stop" key={s.time + s.place} aria-current={s.now ? 'step' : undefined}>
                  <span className="tm ch-num">{s.time}</span>
                  <div>
                    <div className="pl">{s.place}</div>
                    {s.line && <div className="dr">{wholeFacts(s.line)}</div>}
                  </div>
                  {s.now ? <span className="now">Now</span> : s.next ? <span className="nx">Next</span> : <span />}
                </div>
              ))}
            </section>
          )}
          <Button variant="primary" href={next.planHref} className="ch-prc-today__go">
            {next.stops.length > stops.length ? `Open plan · ${next.stops.length} stops` : 'Open plan'}
          </Button>
        </div>
      )}
      {none ? (
        <EmptyState size="page" title="No plan yet" body="Your coach hasn’t published a plan for this practice yet." code="CH-13397" />
      ) : (
        <section className="ch-prc-sec" aria-labelledby="ch-prc-wk">
          <h2 id="ch-prc-wk">This week</h2>
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
