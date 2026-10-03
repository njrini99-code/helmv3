'use client';

import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Flag, MessageSquare, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ChPlayerHome } from '../../data/player-home';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { Nine } from '../../ui/Nine';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { changeTone, formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useNow } from '../../lib/use-now';
import { usePhoneHero } from '../../shell/phone-chrome';
import { Countdown } from './Countdown';
import { Today, UpNext, WeekStrip } from './HomePhone';
import { PlayerGame } from './PlayerGame';
import { messageCoachHref, MY_STATS, postRoundHref, roundHref } from './player-links';

/**
 * The player's phone Home (v2, design/handoff/Player - Home - Mobile.html,
 * m-player-home.jsx): the green hero with the day, the greeting, the brief,
 * Up next with its countdown, and Message coach / Post a round; then the week
 * with today's timeline, the latest round (paged, its card inline), scoring
 * and the parts of the game. Same loader and catalog as desktop.
 */
export function PlayerHomePhone({ data, now: frozen }: { data: ChPlayerHome; now?: string }) {
  usePhoneHero(true);
  const ticking = useNow();
  const now = useMemo(() => (frozen ? new Date(frozen) : ticking), [frozen, ticking]);
  const nothingAhead = !data.week.error && !data.next && data.week.days.every((d) => d.eventCount === 0);
  const post = postRoundHref();

  return (
    <main className="ch-hm" aria-label="Home">
      <header className="ch-hm-hero">
        <span className="ch-hm-hero__date">{data.todayLabel}</span>
        <h1>{data.greeting}</h1>
        {data.brief && (
          <p className="ch-hm-hero__brief">
            <Icon icon={Sparkles} size={14} />
            {data.brief}
          </p>
        )}
        <SectionBoundary surface="home.upNext" label="Up next" code="CH-2213">
          {data.week.error ? (
            <div className="ch-hm-next is-static">
              <RefreshNotice code="CH-2201" title="This week's schedule didn't load." body="Your events are safe. This is a display problem, and trying again usually clears it." />
            </div>
          ) : data.next ? (
            <UpNext e={data.next} now={now} kicker="Up next">
              {!data.next.allDay && <Countdown to={data.next.startIso} frozen={frozen} />}
            </UpNext>
          ) : (
            <div className="ch-hm-next is-static" data-ch-code="CH-2309">
              <span className="ch-hm-next__k">
                <span className="ch-hm-next__type">
                  <Icon icon={CalendarDays} size={13} />
                  Up next
                </span>
              </span>
              <div className="ch-hm-none">
                <span className="ch-hm-none__ic">
                  <Icon icon={CalendarDays} size={22} />
                </span>
                <span>
                  <h2>No events scheduled</h2>
                  <p>Your coach&apos;s practices and events will show here with a countdown.</p>
                </span>
              </div>
            </div>
          )}
        </SectionBoundary>
        <div className="ch-ph-acts">
          <Link href={messageCoachHref(data.coachUserId)} className="ch-ph-act" onClick={() => haptic('press')}>
            <Icon icon={MessageSquare} size={16} />
            Message coach
          </Link>
          {post && (
            <Link href={post} className="ch-ph-act is-primary" onClick={() => haptic('press')}>
              <Icon icon={Plus} size={16} />
              Post a round
            </Link>
          )}
        </div>
      </header>

      <div className="ch-hm-body">
        {!data.week.error && !nothingAhead ? (
          <SectionBoundary surface="home.week" label="This week" code="CH-2205">
            {/* The board's Today is a small label inside This week, not a section of its own. */}
            <WeekStrip days={data.week.days} note={data.weekNote} majorIcon={Flag}>
              <SectionBoundary surface="home.today" label="Today" code="CH-2214">
                <Today inline list={data.today} now={now} failed={false} quiet={false} canPlan={false} />
              </SectionBoundary>
            </WeekStrip>
          </SectionBoundary>
        ) : (
          <SectionBoundary surface="home.today" label="Today" code="CH-2214">
            <Today list={data.today} now={now} failed={data.week.error} quiet={nothingAhead} canPlan={false} />
          </SectionBoundary>
        )}
        <SectionBoundary surface="home.latestRound" label="Your latest round" code="CH-2206">
          <Latest data={data.latest} />
        </SectionBoundary>
        <SectionBoundary surface="home.game" label="Your scoring" code="CH-2217">
          <PlayerGame data={data} phone />
        </SectionBoundary>
      </div>
    </main>
  );
}

/** My latest round (board "Latest"): paged through the last three, the card inline. */
function Latest({ data }: { data: ChPlayerHome['latest'] }) {
  const [i, setI] = useState(0);
  const r = data.rounds[i];
  const go = (d: 1 | -1) => {
    haptic('select');
    setI((x) => (x + d + data.rounds.length) % data.rounds.length);
  };
  const [course, ...rest] = (r?.meta ?? '').split(' · ');
  return (
    <section className="ch-hm-sec" aria-labelledby="ch-ph-latest">
      <div className="ch-hm-sec__h ch-ph-sec__h">
        <h2 id="ch-ph-latest">My latest round</h2>
        {data.rounds.length > 1 && (
          <span className="ch-ph-pg">
            <button type="button" aria-label="Previous round" onClick={() => go(-1)}>
              <Icon icon={ChevronLeft} size={18} />
            </button>
            <span className="ch-num" aria-live="polite">
              {i + 1} of {data.rounds.length}
            </span>
            <button type="button" aria-label="Next round" onClick={() => go(1)}>
              <Icon icon={ChevronRight} size={18} />
            </button>
          </span>
        )}
      </div>
      {data.error ? (
        <RefreshNotice code="CH-2202" title="Recent rounds didn't load." body="Posted rounds are safe. Try again; the error has been reported." />
      ) : !r ? (
        <EmptyState compact code="CH-2302" icon={Flag} title="No rounds posted yet this season." body="Your newest 18-hole round appears here, hole by hole, as soon as you post it." />
      ) : (
        <div className="ch-ph-card">
          <div className="ch-ph-rd">
            <span className="ch-h-flag" aria-hidden="true">
              <Flag size={16} />
            </span>
            <span className="ch-ph-rd__b">
              <b>{course}</b>
              <span>{rest.join(' · ')}</span>
            </span>
            <span className={'ch-hm-score ch-num' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')}>
              <b>{r.score}</b>
              <em>{formatToPar(r.toPar)}</em>
            </span>
          </div>
          {r.holes ? (
            <div className="ch-ph-nines">
              <Nine label="Out" holes={r.holes.filter((h) => h.n <= 9)} caption="Front nine" />
              <Nine label="In" holes={r.holes.filter((h) => h.n > 9)} caption="Back nine" />
            </div>
          ) : (
            <p className="ch-hm-muted" data-ch-code={data.holesError ? 'CH-2203' : 'CH-2303'}>
              {data.holesError ? 'Hole-by-hole scores didn’t load for this round. The total is right.' : 'Posted as a total. Hole-by-hole scores weren’t recorded for this round.'}
            </p>
          )}
          <dl className="ch-ph-strip">
            <div>
              <dt>GIR</dt>
              <dd className="ch-num">{r.gir ?? NO_DATA}</dd>
            </div>
            <div>
              <dt>Putts</dt>
              <dd className="ch-num">{r.putts ?? NO_DATA}</dd>
            </div>
            <div>
              <dt>SG</dt>
              <dd className={'ch-num ' + changeTone(r.sg, false)}>{formatSigned(r.sg)}</dd>
            </div>
          </dl>
          {/* The board's "Open recap": the round's own review; My stats when it isn't rebuilt. */}
          <Button size="lg" rightIcon={ArrowRight} href={roundHref(r.id, 'player') ?? MY_STATS} className="ch-ph-card__more">
            {roundHref(r.id, 'player') ? 'Open recap' : 'My stats'}
          </Button>
        </div>
      )}
    </section>
  );
}
