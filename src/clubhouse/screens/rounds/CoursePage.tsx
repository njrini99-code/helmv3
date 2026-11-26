'use client';

import Link from 'next/link';
import { useState } from 'react';
import { avgToPar, coachDraft, shortDate, type ChCourseHistory } from '../../data/course-page-shape';
import { MessageSquare } from 'lucide-react';
import { messagesPrefillHref } from '../messages/prefill';
import { Icon } from '../../ui/Icon';
import { formatFixed } from '../../lib/format';
import { Button } from '../../ui/Button';
import { NoData } from '../../ui/NoData';
import { HoleMap, mostToGain } from './HoleMap';
import { CourseArc } from './CourseArc';
import { HowItPlays } from './HowItPlays';
import { RoundsHere } from './RoundsHere';
import { FadeNum, SwapFade } from './course-motion';
import { chScrollIntoView } from '../../lib/smooth-scroll';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { useRouter } from 'next/navigation';
import { haptic } from '../../lib/haptics';
import { Segmented } from '../../ui/Segmented';
import { SectionBoundary, SectionGroup, SectionGroupNotice } from '../../ui/SectionBoundary';

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
  const router = useRouter();
  const reduced = useChReducedMotion();
  // A stretch row picks its first hole and brings the map into view (M13).
  const toHole = (n: number) => {
    haptic('select');
    setHole(n);
    chScrollIntoView(document.getElementById('ch-hmap-h'), reduced);
  };
  const [hole, setHole] = useState<number>(() => initialHole ?? mostToGain(h.holes) ?? 1);
  // The window is the server's (`?w=season`): the page asks again, keeping the player and the hole.
  const setWindow = (w: 'all' | 'season') => {
    haptic('select');
    const q = new URLSearchParams();
    if (playerId) q.set('player', playerId);
    if (w === 'season') q.set('w', 'season');
    q.set('hole', String(hole));
    router.replace(`?${q.toString()}`, { scroll: false });
  };
  // GAP-S-10: each part of the course page is its own section, so one that crashes leaves the rest; two or more are said
  // once under the hero (CH-1210).
  return (
    <SectionGroup>
      <main className="ch-ch" aria-labelledby="ch-ch-title">
        <CourseHero h={h} coach={coach} who={who} playerId={playerId} />
        <SectionGroupNotice />
        <SectionBoundary surface="rounds.course.figures" label="The figures" code="CH-11291">
          <section className="ch-ch-sec" aria-labelledby="ch-ch-fig-h">
            <h2 id="ch-ch-fig-h" className="ch-sr-only">
              Figures
            </h2>
            <div className="ch-ch-fig">
              {h.figures.map((f) => {
                const body = (
                  <>
                    <span className="ch-ch-fig__l">{f.label}</span>
                    <b className="ch-ch-fig__v">
                      {f.value != null ? <FadeNum className="ch-num" text={f.value} /> : <span className="ch-num"><NoData label={f.sub} /></span>}
                    </b>
                    <span className={'ch-ch-fig__s ch-num' + toneOf(f.toPar)}>{f.sub}</span>
                  </>
                );
                return f.roundId ? (
                  <Link data-ctl="CTL-P011-019" prefetch={false} key={f.label} className="ch-ch-fig__c is-link" href={reviewHref(f.roundId)} aria-label={`${f.label}: ${f.value}, ${f.sub}. Open the round`}>
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
        </SectionBoundary>
        {h.lastTime && (
          <SectionBoundary surface="rounds.course.last" label="Last time" code="CH-11291">
            <LastTime t={h.lastTime} who={who} />
          </SectionBoundary>
        )}
        {h.windows && (
          <div className="ch-ch-win">
            <Segmented
              label="Which rounds"
              size="sm"
              value={h.window}
              onChange={setWindow}
              options={[
                { value: 'all', label: 'All time' },
                { value: 'season', label: 'This season' },
              ]}
            />
          </div>
        )}
        {h.holes.length > 0 ? (
          <SectionBoundary surface="rounds.course.holes" label="Hole by hole" code="CH-11291">
            <HoleMap holes={h.holes} selected={hole} onSelect={setHole} coverage={h.coverage} sample={h.holeRounds} />
          </SectionBoundary>
        ) : (
          <section className="ch-ch-sec" aria-labelledby="ch-hmap-h">
            <div className="ch-ch-sec__h">
              <h2 id="ch-hmap-h">Hole by hole</h2>
            </div>
            <div className="ch-ch-plate" data-ch-code="CH-11333">
              <b>{h.holesError ? 'The holes didn’t load' : 'Needs 2 rounds with hole scores'}</b>
              <p>{h.holesError ? 'The rest of your history here is still right. Try again in a moment.' : 'Hole scores come from rounds entered hole by hole.'}</p>
            </div>
          </section>
        )}
        <SectionBoundary surface="rounds.course.plays" label="How it plays" code="CH-11291">
          <HowItPlays data={h.howItPlays} who={who} onHole={toHole} />
        </SectionBoundary>
        {h.arc && (
          <SectionBoundary surface="rounds.course.arc" label="The round here" code="CH-11291">
            <CourseArc arc={h.arc} lines={h.arcLines} selected={hole} onSelect={setHole} />
          </SectionBoundary>
        )}
        <SectionBoundary surface="rounds.course.rounds" label={who ? `${who}’s rounds here` : 'Your rounds here'} code="CH-11291">
          <RoundsHere rounds={h.rounds} cards={h.cards} title={who ? `${who}’s rounds here` : 'Your rounds here'} />
        </SectionBoundary>
      </main>
    </SectionGroup>
  );
}

function CourseHero({ h, coach, who, playerId }: { h: ChCourseHistory; coach: boolean; who: string | null; playerId: string | null }) {
  // P-7 6.4: the coach's way to the player, a prefilled message they send from Messages.
  const message = coach && playerId ? messagesPrefillHref({ players: [playerId], draft: coachDraft(h), title: h.name }) : null;
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
          <b>
            <span className="ch-num">{f.kind === 'average' ? formatFixed(f.value, 1) : f.value}</span>
          </b>
          <span>
            <em>{f.kind === 'average' ? 'Average' : f.nine ? 'Last nine' : 'Last time'}</em>
            <span className="ch-num">{f.kind === 'average' ? (f.toPar == null ? '' : `${avgToPar(f.toPar)} to par`) : shortDate(f.date)}</span>
          </span>
        </div>
        {f.kind === 'average' && f.early != null && <p className="ch-ch-hero__e">Early read · {f.early} rounds</p>}
        {message && (
          <Button data-ctl="CTL-P011-020" variant="secondary" className="ch-ch-hero__go" href={message}>
            <Icon icon={MessageSquare} size={16} />
            Message {who}
          </Button>
        )}
        {!coach && h.courseId && (
          <Button data-ctl="CTL-P011-021" variant="secondary" className="ch-ch-hero__go" href={`/golf/dashboard/rounds/new?course=${h.courseId}`}>
            Start a round here
          </Button>
        )}
      </div>
    </header>
  );
}


function LastTime({ t, who }: { t: NonNullable<ChCourseHistory['lastTime']>; who: string | null }) {
  return (
    <section className="ch-ch-sec" aria-labelledby="ch-ch-last-h">
      <div className="ch-ch-sec__h">
        <h2 id="ch-ch-last-h">Last time here</h2>
      </div>
      <Link data-ctl="CTL-P011-022" className="ch-ch-last__sub ch-num" href={reviewHref(t.id)}>
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
  // M12 (audit 2026-11-15, MOT-15): "Show all" sets the note's height at once and the text fades back in over the quick beat.
  return (
    <div className="ch-ch-note">
      <span className="ch-ch-note__l">{label}</span>
      <SwapFade swap={all} className="ch-ch-note__b">
        <p className={long && !all ? 'is-clamped' : undefined}>{text}</p>
      </SwapFade>
      {long && (
        <button data-ctl="CTL-P011-023" type="button" className="ch-ch-note__more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  );
}
