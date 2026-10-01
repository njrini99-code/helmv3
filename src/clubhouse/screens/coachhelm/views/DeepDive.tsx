'use client';

import { AnimatePresence } from 'framer-motion';
import { ChevronRight, Compass, Flag, Play, Target } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import type { ChDeepDive, ChDeepInsight, ChDiveRound, ChDiveTheme, ChDiveTone } from '../../../data/coachhelm-dive-shape';
import { PLAYER_HELM_DEVELOPMENT_HREF, type ChViewLoad } from '../../../data/coachhelm-views-shape';
import { haptic } from '../../../lib/haptics';
import { useChPhone } from '../../../lib/use-phone';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { rebuiltHref } from '../../../shell/nav';
import { PhoneScreen } from '../../../shell/PhoneScreen';
import { usePhoneStackHistory } from '../../../shell/phone-chrome';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { InlineNotice } from '../../../ui/Notices';
import { PhoneBar } from '../../../ui/PhoneBar';
import { SectionBoundary } from '../../../ui/SectionBoundary';
import { EmptyState } from '../../../ui/States';
import { BoardPartial, Evidence } from '../parts';
import { coachHelmLinks } from '../PlayerBoard';
import { HelmOff, PlayerHelmFrame } from './Frame';

const LINE = 'Every read CoachHelm has made on your game: what it measured, the rounds behind it, how it has moved, and where it goes in your plan.';

const developmentHref = () => rebuiltHref(PLAYER_HELM_DEVELOPMENT_HREF, 'player');

/** To par per 18 holes, oldest to newest: a line that rises as the scores come down. Decoration; the caption and the label say every number. */
function Strip({ values }: { values: number[] }) {
  const w = 240;
  const h = 56;
  const pad = 7;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => pad + (i * (w - pad * 2)) / (values.length - 1);
  // Lower is better, so a lower score is drawn higher.
  const y = (v: number) => (hi === lo ? h / 2 : pad + ((v - lo) / (hi - lo)) * (h - pad * 2));
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const last = values.length - 1;
  return (
    <svg className="ch-hd-strip__svg" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {lo <= 0 && hi >= 0 && hi !== lo && <line className="ch-hd-strip__par" x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} />}
      <polyline className="ch-hd-strip__line" points={pts.join(' ')} />
      {values.map((v, i) => (
        <circle key={i} className={'ch-hd-strip__dot' + (i === last ? ' is-last' : '')} cx={x(i)} cy={y(v)} r={i === last ? 4 : 2.6} />
      ))}
    </svg>
  );
}

const paint = (t: ChDiveTone) => 'is-' + t;

function Section({ id, title, aside, children, code }: { id: string; title: string; aside?: string; children: React.ReactNode; code?: string }) {
  return (
    <section className="ch-hd-sec" aria-labelledby={id} data-ch-code={code}>
      <div className="ch-hd-sec__h">
        <h3 id={id}>{title}</h3>
        {aside && <span className="ch-num">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Trend({ i, theme, themesFailed, onRetry }: { i: ChDeepInsight; theme: ChDiveTheme | undefined; themesFailed: boolean; onRetry: () => void }) {
  const strip = i.rounds.strip;
  const first = strip[0];
  const last = strip[strip.length - 1];
  const stripTone: ChDiveTone = first == null || last == null || Math.round(first) === Math.round(last) ? 'plain' : last < first ? 'good' : 'warn';
  const toPar = (v: number) => (Math.round(v) === 0 ? 'E' : (v > 0 ? '+' : '−') + Math.abs(Math.round(v)));
  const trend = theme?.trend ?? null;
  const any = !!(i.movement || i.outcome || trend || strip.length > 0);
  return (
    <Section id={`${i.base.id}-trend`} title="How it has moved">
      {themesFailed && <InlineNotice code="CH-13283" title="Your category trends didn’t load" body="The rest of this read is below. The trend for the category is missing for now. Try again in a moment." onRetry={onRetry} />}
      {any ? (
        <ul className="ch-hd-tr">
          {i.movement && (
            <li className={paint(i.movement.tone)}>
              <span className="ch-hd-tr__k">Since it was first seen</span>
              <b className="ch-num">{i.movement.text}</b>
            </li>
          )}
          {i.outcome && (
            <li className={paint(i.outcome.tone)}>
              <span className="ch-hd-tr__k">Result</span>
              <b>
                {i.outcome.word}
                {i.outcome.when ? <span className="ch-num"> · measured {i.outcome.when}</span> : null}
              </b>
            </li>
          )}
          {trend && (
            <li className={paint(trend.tone)}>
              <span className="ch-hd-tr__k">{theme?.label} overall</span>
              <b>{trend.word}</b>
              <span className="ch-hd-tr__t ch-num">{trend.text}</span>
            </li>
          )}
          {strip.length > 0 && first != null && last != null && (
            <li className={'ch-hd-strip ' + paint(stripTone)}>
              <span className="ch-hd-tr__k">Your scores in the rounds below</span>
              <Strip values={strip} />
              <span className="ch-hd-strip__c ch-num">
                {toPar(first)} to {toPar(last)} <em>oldest to newest, to par per 18 holes</em>
              </span>
            </li>
          )}
        </ul>
      ) : (
        !themesFailed && (
          <p className="ch-hd-none" data-ch-code="CH-13383">
            No trend yet. A read needs a few more rounds behind it before it can say which way it is moving, and this one will show it when it can.
          </p>
        )
      )}
    </Section>
  );
}

function Rounds({ i, failed, onRetry }: { i: ChDeepInsight; failed: boolean; onRetry: () => void }) {
  const { total, list } = i.rounds;
  const aside = total > 0 ? (list.length > 0 && total > list.length ? `Newest ${list.length} of ${total}` : `${total} ${total === 1 ? 'round' : 'rounds'}`) : undefined;
  return (
    <Section id={`${i.base.id}-rounds`} title="The rounds behind it" aside={aside}>
      {failed && total > 0 ? (
        <InlineNotice code="CH-13281" title="The rounds behind this read didn’t load" body="The read itself is above and is not affected. Try again in a moment." onRetry={onRetry} />
      ) : list.length > 0 ? (
        <ol className="ch-hd-rounds">
          {list.map((r) => (
            <RoundRow key={r.id} r={r} />
          ))}
        </ol>
      ) : (
        <p className="ch-hd-none" data-ch-code="CH-13382">
          {total > 0
            ? `This read was made from ${total} ${total === 1 ? 'round' : 'rounds'}, but none of them can be listed here. They may be rounds you have since removed.`
            : 'This read does not name the rounds it was made from. It uses your stats over the window above, so there is no list to show.'}
        </p>
      )}
    </Section>
  );
}

function RoundRow({ r }: { r: ChDiveRound }) {
  const tone = r.toPar == null ? 'none' : r.toPar === 'E' ? 'even' : r.toPar.startsWith('−') ? 'under' : 'over';
  const body = (
    <>
      <span className="ch-hd-r__d ch-num">{r.date}</span>
      <span className="ch-hd-r__c">
        {r.course ?? 'Round'}
        {r.nine && <em>9 holes</em>}
      </span>
      <span className="ch-hd-r__s ch-num">{r.score}</span>
      <span className={'ch-hd-r__p ch-num is-' + tone}>{r.toPar ?? '—'}</span>
    </>
  );
  return (
    <li>
      {r.href ? (
        <Link className="ch-hd-r is-link" href={r.href} onClick={() => haptic('select')} aria-label={`Review the round on ${r.date}${r.course ? ` at ${r.course}` : ''}`}>
          {body}
          <Icon icon={ChevronRight} size={15} />
        </Link>
      ) : (
        <div className="ch-hd-r">{body}</div>
      )}
    </li>
  );
}

function Why({ i }: { i: ChDeepInsight }) {
  const d = i.diagnosis;
  if (!d && !i.base.why) return null;
  return (
    <Section id={`${i.base.id}-why`} title="Why CoachHelm thinks so">
      {d && (
        <div className="ch-hd-dx">
          {/* A hypothesis is inferred from where you stand against others, never a thing CoachHelm saw: it is marked so it is not read as fact. */}
          <span className={'ch-hd-dx__lvl is-' + d.level} data-ch-code="CH-13982">
            {d.level === 'observed' ? 'Measured in your shots' : 'Likely, not measured'}
          </span>
          <p className="ch-hd-dx__c">{d.cause}</p>
          {d.drivers.length > 0 && (
            <dl className="ch-hd-dx__d">
              {d.drivers.map((x) => (
                <div key={x.label}>
                  <dt>{x.label}</dt>
                  <dd className="ch-num">
                    {x.value}
                    {x.n != null && <em> · {x.n} counted</em>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {d.reason && <p className="ch-hd-dx__r">{d.reason}</p>}
        </div>
      )}
      {i.base.why && (
        <div className="ch-hd-full">
          {d && <span className="ch-hd-full__k">The full write-up</span>}
          <p className="ch-hd-why">{i.base.why}</p>
        </div>
      )}
    </Section>
  );
}

function Plan({ i, failed, onRetry }: { i: ChDeepInsight; failed: boolean; onRetry: () => void }) {
  const href = developmentHref();
  const { focus, goal } = i.plan;
  const row = (kind: 'focus' | 'goal', icon: typeof Target, label: string, title: string, word: string, line: string | null, live: boolean) => {
    const body = (
      <>
        <span className="ch-hd-plan__ic" aria-hidden="true">
          <Icon icon={icon} size={16} />
        </span>
        <span className="ch-hd-plan__b">
          <em>{label}</em>
          <b>{title}</b>
          {line && <span className="ch-num">{line}</span>}
        </span>
        <span className={'ch-hd-plan__w' + (live ? ' is-live' : '')}>{word}</span>
        {href && <Icon icon={ChevronRight} size={15} />}
      </>
    );
    return <li key={kind}>{href ? <Link className="ch-hd-plan__i is-link" href={href} onClick={() => haptic('select')}>{body}</Link> : <div className="ch-hd-plan__i">{body}</div>}</li>;
  };
  return (
    <Section id={`${i.base.id}-plan`} title="Where this goes">
      {failed ? (
        <InlineNotice code="CH-13282" title="Your focus areas and goals didn’t load" body="Whether this read is part of one is missing for now. The read is not affected. Try again in a moment." onRetry={onRetry} />
      ) : focus || goal ? (
        <ul className="ch-hd-plan">
          {focus && row('focus', Target, focus.fromThis ? 'Focus area made from this' : 'Focus area on the same stat', focus.title, focus.word, null, focus.live)}
          {goal && row('goal', Flag, goal.fromThis ? 'Goal made from this' : 'Goal on the same stat', goal.title, goal.word, goal.line, goal.word === 'Active')}
        </ul>
      ) : (
        <div className="ch-hd-none" data-ch-code="CH-13384">
          <p>This read is not part of a focus area or a goal yet. Development is where you turn one into a plan.</p>
          {href && (
            <Button variant="secondary" size="sm" href={href} rightIcon={Compass} feel="select">
              Open Development
            </Button>
          )}
        </div>
      )}
    </Section>
  );
}

/** One read in full. Re-mounted per insight (key), so each opens at its top. */
function Dossier({ i, d, onRetry }: { i: ChDeepInsight; d: ChDeepDive; onRetry: () => void }) {
  const b = i.base;
  const tone: ChDiveTone = b.kind === 'strength' ? 'good' : 'warn';
  return (
    <article className="ch-hd-dos" aria-labelledby={`${b.id}-t`}>
      <header className="ch-hd-dos__h">
        <div className="ch-hl-focus__k">
          <span>{b.category}</span>
          <span className={'ch-hl-pri is-' + i.stance.cls}>{i.stance.word}</span>
        </div>
        <h2 id={`${b.id}-t`}>{b.title}</h2>
        {b.lede && <p className="ch-hl-lede">{b.lede}</p>}
        {/* A read from before the newest round is never drawn as current (CH-13903). */}
        {b.stale && (
          <p className="ch-hl-stale" role="note" data-ch-code="CH-13903">
            A round played {b.stale.newestRound} isn’t in this read yet, so it may not match the rounds posted since.
          </p>
        )}
      </header>

      <Section id={`${b.id}-meas`} title="What was measured">
        <div className={'ch-hd-meas ' + paint(tone)}>
          <div className="ch-hd-meas__v">
            <b className="ch-num">{i.measured.value}</b>
            <span>{i.measured.label}</span>
          </div>
          {i.measured.span && <p className="ch-hd-meas__s ch-num">{i.measured.span}</p>}
          {i.closes && (
            <p className="ch-hd-meas__w">
              Closing the gap to {i.closes.anchor === 'team' ? 'your team’s average' : `the ${d.tour}`} is worth about <b className="ch-num">{i.closes.strokes} strokes</b> a round.
            </p>
          )}
        </div>
        <Evidence ev={{ ...b.evidence, label: '' }} />
      </Section>

      <Trend i={i} theme={d.themes[i.cat]} themesFailed={d.themesFailed} onRetry={onRetry} />
      <Rounds i={i} failed={d.roundsFailed} onRetry={onRetry} />
      <Why i={i} />

      {b.week && (
        <div className="ch-hl-drill">
          <span className="ch-hl-drill__k">
            <Icon icon={Target} size={14} />
            This week
          </span>
          {b.week.title && (
            <p className="ch-hl-drill__t">
              <b>{b.week.title}</b>
              {b.week.meta && <em> · {b.week.meta}</em>}
            </p>
          )}
          {b.week.text && <p>{b.week.text}</p>}
        </div>
      )}

      <Plan i={i} failed={d.plansFailed} onRetry={onRetry} />
    </article>
  );
}

/** A read in the list: its category and stance, its title and its number, in the stance's colour. Picking one is a selection haptic (CH-13780). */
function Item({ i, on, onPick }: { i: ChDeepInsight; on: boolean; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        className={'ch-hd-it is-' + i.stance.cls + (on ? ' is-on' : '')}
        aria-current={on ? 'true' : undefined}
        onClick={() => {
          haptic('select');
          onPick();
        }}
      >
        <span className="ch-hd-it__d" aria-hidden="true" />
        <span className="ch-hd-it__b">
          <em>
            {i.base.category}
            <span> · {i.stance.word}</span>
          </em>
          <b>{i.base.title}</b>
        </span>
        <span className="ch-hd-it__v ch-num">{i.base.value}</span>
        <Icon icon={ChevronRight} size={15} />
      </button>
    </li>
  );
}

function Group({ id, title, note, items, pickedId, onPick }: { id: string; title: string; note: string; items: ChDeepInsight[]; pickedId: string | null; onPick: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <section className="ch-hd-grp" aria-labelledby={id}>
      <div className="ch-hd-grp__h">
        <h3 id={id}>{title}</h3>
        <span className="ch-num">{items.length}</span>
      </div>
      <p>{note}</p>
      <ul>
        {items.map((i) => (
          <Item key={i.base.id} i={i} on={i.base.id === pickedId} onPick={() => onPick(i.base.id)} />
        ))}
      </ul>
    </section>
  );
}

function Hero({ d }: { d: ChDeepDive }) {
  const { insights, needs, working, inPlan } = d.counts;
  return (
    <section className="ch-hd-hero" aria-labelledby="ch-hd-hero-t">
      <div className="ch-hd-hero__main">
        <span className="ch-hd-hero__k">What CoachHelm has found</span>
        <h2 id="ch-hd-hero-t">
          CoachHelm has <span className="ch-hd-hero__n ch-num">{insights}</span> {insights === 1 ? 'read' : 'reads'} on your game.
        </h2>
        <p className="ch-hd-hero__sub">Open one to see what was measured, the rounds it was made from, how it has moved and where it goes in your plan. A read from before your newest round says so.</p>
      </div>
      <dl className="ch-hd-hero__f">
        <div className="is-needs">
          <dt>Need work</dt>
          <dd className="ch-num">{needs}</dd>
        </div>
        <div className="is-working">
          <dt>Working</dt>
          <dd className="ch-num">{working}</dd>
        </div>
        <div className="is-plan">
          <dt>In your plan</dt>
          {/* Plans that did not load are not "none": a dash, never a zero. */}
          <dd className="ch-num">{d.plansFailed ? '—' : inPlan}</dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * The player's Deep dive (P013, `?view=deep-dive`): the insights the Board draws, each in full. Desktop is a list beside the read; the
 * phone is the list, and a read is a pushed screen that the iOS back swipe pops (CH-13980). `initialId` is the read `?insight=` names,
 * used only if it is one of this player's own (CH-13981). Their own and read-only: there is no coach control, no dismiss and no assign.
 * Each part beside the insights (rounds, plans, category trends) says in place when it did not load; none takes the page down.
 */
export function DeepDive({ load, initialId = null }: { load: ChViewLoad<ChDeepDive>; initialId?: string | null }) {
  const router = useRouter();
  const phone = useChPhone();
  const reduced = useChReducedMotion();
  const refresh = () => router.refresh();
  const startHref = coachHelmLinks.startRound();
  const dossier = useRef<HTMLDivElement>(null);
  const list = load.status === 'ready' ? load.data.list : [];
  const [picked, setPicked] = useState<string | null>(initialId && list.some((i) => i.base.id === initialId) ? initialId : null);
  const open = picked ? list.find((i) => i.base.id === picked) : undefined;
  // On desktop a read is always showing: the one picked, else the first. On the phone nothing is open until one is.
  const shown = open ?? list[0];

  // The open read is a history entry, so the iOS edge swipe and the browser's back close it instead of leaving the page.
  const popTo = useCallback((level: number) => level < 1 && setPicked(null), []);
  usePhoneStackHistory(phone && open ? 1 : 0, popTo);

  const pick = (id: string) => {
    setPicked(id);
    // A narrow desktop stacks the read under the list: bring it into view.
    if (!phone) dossier.current?.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  };

  if (load.status === 'off') {
    return (
      <PlayerHelmFrame view="deep-dive" line={LINE} off>
        <HelmOff reason={load.reason} />
      </PlayerHelmFrame>
    );
  }
  if (load.status === 'failed') {
    return (
      <PlayerHelmFrame view="deep-dive" line={LINE}>
        <InlineNotice code="CH-13280" title="Your insights didn’t load" body="Nothing is lost. Your insights are still saved; try again in a moment." onRetry={refresh} />
      </PlayerHelmFrame>
    );
  }
  const d = load.data;
  if (list.length === 0) {
    const none = d.rounds === 0;
    return (
      <PlayerHelmFrame view="deep-dive" line={LINE}>
        <EmptyState
          code={none ? 'CH-13380' : 'CH-13381'}
          icon={Compass}
          title={none ? 'Your Deep dive starts with a round' : 'No insight to open yet'}
          body={
            none
              ? 'CoachHelm reads your rounds for patterns worth your time, and each one lands here with its evidence. Post a round and the first reads follow.'
              : `CoachHelm writes an insight when a pattern in your rounds is clear enough to stand behind. None is yet${d.rounds ? `, from the ${d.rounds} ${d.rounds === 1 ? 'round' : 'rounds'} you have posted` : ''}. It checks again as you post more.`
          }
          action={
            startHref ? (
              <Button variant="primary" leftIcon={Play} href={startHref.href}>
                {startHref.label}
              </Button>
            ) : undefined
          }
        />
      </PlayerHelmFrame>
    );
  }

  const needs = list.filter((i) => i.base.kind === 'finding');
  const working = list.filter((i) => i.base.kind === 'strength');
  const groups = (
    <>
      <Group id="ch-hd-needs" title="Needs work" note="Where CoachHelm sees the most to gain, in the order it ranks them." items={needs} pickedId={phone ? null : shown?.base.id ?? null} onPick={pick} />
      <Group id="ch-hd-working" title="Working" note="What you do better than the comparison. Keep doing it." items={working} pickedId={phone ? null : shown?.base.id ?? null} onPick={pick} />
    </>
  );

  return (
    <PlayerHelmFrame
      view="deep-dive"
      line={LINE}
      covered={phone && !!open}
      after={
        phone ? (
          <AnimatePresence>
            {open && (
              <PhoneScreen key={open.base.id} labelledBy="ch-hd-screen-t" className="ch-hd-screen" code="CH-13980">
                <PhoneBar back={{ label: 'Deep dive', onBack: () => setPicked(null) }} title={open.base.category} titleId="ch-hd-screen-t" />
                <div className="ch-hd-scroll">
                  <SectionBoundary surface="coachhelm.deep-dive.read" label="This read" code="CH-13204">
                    <Dossier i={open} d={d} onRetry={refresh} />
                  </SectionBoundary>
                </div>
              </PhoneScreen>
            )}
          </AnimatePresence>
        ) : undefined
      }
    >
      <SectionBoundary surface="coachhelm.deep-dive" label="Your deep dive" code="CH-13204">
        {/* CH-13208: a read beside the insights failed (the Tour's values, the drills, which are Assigned, how current each is). */}
        {d.missing && <BoardPartial missing={d.missing} what="page" onRetry={refresh} />}
        <Hero d={d} />
        <div className="ch-hd">
          <nav className="ch-hd-rail" aria-label="Your insights" data-ch-code="CH-13890">
            {groups}
          </nav>
          {!phone && shown && (
            <div className="ch-hd-main" ref={dossier}>
              <Dossier key={shown.base.id} i={shown} d={d} onRetry={refresh} />
            </div>
          )}
        </div>
      </SectionBoundary>
    </PlayerHelmFrame>
  );
}
