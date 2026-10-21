'use client';

import { AnimatePresence } from 'motion/react';
import { ChevronRight, Compass, Flag, Plus, Target } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { clearedShown, DIVE_AREAS, type ChDeepDive, type ChDeepInsight, type ChDiveCleared, type ChDiveRound, type ChDiveTheme, type ChDiveTone, type ChDiveWhere } from '../../../data/coachhelm-dive-shape';
import { meaningfulReason, readLines, writeUpFor } from '../../../data/coachhelm-read-shape';
import { PLAYER_HELM_DEVELOPMENT_HREF, type ChViewLoad } from '../../../data/coachhelm-views-shape';
import { haptic } from '../../../lib/haptics';
import { useChSessionState } from '../../../lib/session-state';
import { useChPhone } from '../../../lib/use-phone';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { rebuiltHref } from '../../../shell/nav';
import { PhoneScreen } from '../../../shell/PhoneScreen';
import { usePhoneStackHistory } from '../../../shell/phone-chrome';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { PageRefreshNotice, RefreshNotice } from '../../../ui/RefreshNotice';
import { PhoneBar } from '../../../ui/PhoneBar';
import { SectionBoundary } from '../../../ui/SectionBoundary';
import { EmptyState } from '../../../ui/States';
import { BoardPartial, Evidence } from '../parts';
import { coachHelmLinks } from '../PlayerBoard';
import { useHydrated } from '../use-hydrated';
import { HelmOff, PlayerHelmFrame } from './Frame';
import { SerifText } from '../../../ui/SerifText';
import { EngineState, WhyAudit } from '../EngineState';
import { CorrectionChips, ReadLater } from '../Corrections';

/** A sentence ends in its stop: a generator's line without one gets a full stop (P013 D6). */
export const sentence = (t: string): string => (/[.!?…”"’)]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);

/**
 * The write-up without the drill, when the read's Next line draws it (P013 D6): a sentence that opens with the drill's first three words is
 * the drill again. Nothing else is touched; with no drill, or no such sentence, the write-up is as written.
 */
export function withoutDrill(why: string, drill: string | null | undefined): string | null {
  const head = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s-]/g, '').split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
  const key = drill ? head(drill) : '';
  if (!key) return why;
  const kept = why.split(/(?<=[.!?])\s+/).filter((s) => head(s) !== key);
  return kept.join(' ').trim() || null;
}

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

function Trend({ i, theme, themesFailed, covered = false }: { i: ChDeepInsight; theme: ChDiveTheme | undefined; themesFailed: boolean; covered?: boolean }) {
  const strip = i.rounds.strip;
  const first = strip[0];
  const last = strip[strip.length - 1];
  const stripTone: ChDiveTone = first == null || last == null || Math.round(first) === Math.round(last) ? 'plain' : last < first ? 'good' : 'warn';
  const toPar = (v: number) => (Math.round(v) === 0 ? 'E' : (v > 0 ? '+' : '−') + Math.abs(Math.round(v)));
  const trend = theme?.trend ?? null;
  const any = !!(i.movement || i.outcome || trend || strip.length > 0);
  return (
    <Section id={`${i.base.id}-trend`} title="How it has moved">
      {themesFailed && <RefreshNotice code="CH-13283" title="Your category trends didn’t load" body="The rest of this read is below. The trend for the category is missing for now. Try again in a moment." covered={covered} />}
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
          <EmptyState
            compact
            code="CH-13383"
            title="No trend yet"
            body="A read needs a few more rounds behind it before it can say which way it is moving, and this one will show it when it can."
          />
        )
      )}
    </Section>
  );
}

function Rounds({ i, failed, covered = false }: { i: ChDeepInsight; failed: boolean; covered?: boolean }) {
  const { total, list } = i.rounds;
  const aside = total > 0 ? (list.length > 0 && total > list.length ? `Newest ${list.length} of ${total}` : `${total} ${total === 1 ? 'round' : 'rounds'}`) : undefined;
  return (
    <Section id={`${i.base.id}-rounds`} title="The rounds behind it" aside={aside}>
      {failed && total > 0 ? (
        <RefreshNotice code="CH-13281" title="The rounds behind this read didn’t load" body="The read itself is above and is not affected. Try again in a moment." covered={covered} />
      ) : list.length > 0 ? (
        <ol className="ch-hd-rounds">
          {list.map((r) => (
            <RoundRow key={r.id} r={r} />
          ))}
        </ol>
      ) : (
        <EmptyState
          compact
          code="CH-13382"
          title={total > 0 ? 'None of the rounds can be listed' : 'No rounds are named'}
          body={
            total > 0
              ? `This read was made from ${total} ${total === 1 ? 'round' : 'rounds'}, but none of them can be listed here. They may be rounds you have since removed.`
              : 'This read does not name the rounds it was made from. It uses your stats over the window above, so there is no list to show.'
          }
        />
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
  // The cause and its basis are the read's Why line, above (an inferred one is never the player's). Here: what it counted, why the
  // read is as sure as it is (not the generators' stock "sample adequate"), and the generator's own words in full (its first
  // sentence too, which the read's What line now says in numbers).
  const drivers = i.diagnosis?.drivers ?? [];
  const reason = meaningfulReason(i.diagnosis?.reason);
  // A cause this viewer is not shown is not said here either: its sentences leave the write-up with it.
  const told = writeUpFor([i.base.lede, i.base.why].filter(Boolean).join(' '), i.read.why.level !== null);
  const why = told ? withoutDrill(told, i.base.week?.text) : null;
  const box = drivers.length > 0 || !!reason;
  if (!box && !why) return null;
  return (
    <Section id={`${i.base.id}-why`} title="Why CoachHelm thinks so">
      {box && (
        <div className="ch-hd-dx">
          {drivers.length > 0 && (
            <dl className="ch-hd-dx__d">
              {drivers.map((x) => (
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
          {reason && <p className="ch-hd-dx__r">{sentence(reason)}</p>}
        </div>
      )}
      {why && (
        <div className="ch-hd-full">
          {box && <span className="ch-hd-full__k">The full write-up</span>}
          <p className="ch-hd-why">{why}</p>
        </div>
      )}
    </Section>
  );
}

/**
 * Where it happened (chs-38): up to five holes the counted path was recorded on, each with its round's day and course, the hole and
 * the path in shot-type words. Drawn only when the read's evidence stores a counted sequence with example holes this player still
 * has; otherwise the section is left out, never an empty state.
 */
function Where({ id, where }: { id: string; where: ChDiveWhere | null }) {
  if (!where || where.holes.length === 0) return null;
  return (
    <Section id={`${id}-where`} title="Where it happened" aside={where.counted ?? undefined} code="CH-13996">
      <ol className="ch-hd-where">
        {where.holes.map((h) => {
          const body = (
            <>
              <span className="ch-hd-where__d ch-num">{h.date}</span>
              <span className="ch-hd-where__b">
                <b>
                  {h.course ?? 'Round'} <span className="ch-num">· hole {h.hole}</span>
                </b>
                <span>{h.what}</span>
              </span>
            </>
          );
          return (
            <li key={h.key}>
              {h.href ? (
                <Link className="ch-hd-where__i is-link" href={h.href} onClick={() => haptic('select')} aria-label={`Review the round on ${h.date}${h.course ? ` at ${h.course}` : ''}, hole ${h.hole}: ${h.what}`}>
                  {body}
                  <Icon icon={ChevronRight} size={15} />
                </Link>
              ) : (
                <div className="ch-hd-where__i">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

/**
 * The read in four lines (P013, the Read): What (the number, its sample, the comparison by name, strokes a round only when the
 * row estimates them, the confidence word), Why (the cause with its basis and counts, or not traced yet), Next (the drill or the
 * row's own action, never the generator's placeholder) and When (the newest round in it, and Out of date when a newer one is not).
 * A hypothesis is marked so it is never read as fact (CH-13982); a read from before the newest round says so (CH-13903).
 */
function Read({ i, tour }: { i: ChDeepInsight; tour: string }) {
  const r = i.read;
  const what = readLines(r, tour).what;
  const n = r.next;
  const cause = i.base.engine?.cause;
  return (
    <dl className="ch-hd-read">
      <div>
        <dt>What</dt>
        <dd className="ch-num">{what}</dd>
      </div>
      <div>
        <dt>Why</dt>
        {cause ? (
          // With the root-cause flag on, the cause state the engine stored says the Why: a counted path, or exactly why it is not
          // traced (a count-down or a data gap). An inferred cause is never the player's (Q3), so theirs reads as not traced.
          <dd className={cause.state === 'counted' ? undefined : 'is-none'} data-ch-code="CH-13993">
            {cause.word}: {cause.line}
          </dd>
        ) : (
          <dd className={r.why.level ? undefined : 'is-none'}>
            {r.why.basis && (
              <span className={'ch-hd-dx__lvl ch-hd-read__lvl is-' + r.why.level} data-ch-code="CH-13982">
                {r.why.basis}
              </span>
            )}
            {r.why.basis && ' '}
            {r.why.text}
          </dd>
        )}
      </div>
      <div>
        <dt>Next</dt>
        <dd className={n.none ? 'is-none' : undefined}>
          {n.drill && (
            <span className="ch-hd-read__drill">
              <Icon icon={Target} size={14} />
              <b>{n.drill}</b>
              {n.meta && <em className="ch-num"> · {n.meta}</em>}
            </span>
          )}
          {n.drill && n.text && ' '}
          {n.text ? sentence(n.text) : n.none}
        </dd>
      </div>
      <div>
        <dt>When</dt>
        <dd className="ch-num">
          {r.when.through ? sentence(r.when.through) : !r.when.stale && '—'}
          {r.when.through && r.when.stale && ' '}
          {r.when.stale && (
            <span className="ch-hd-read__stale" role="note" data-ch-code="CH-13903">
              {r.when.stale}
            </span>
          )}
        </dd>
      </div>
    </dl>
  );
}

function Plan({ i, failed, covered = false }: { i: ChDeepInsight; failed: boolean; covered?: boolean }) {
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
        <RefreshNotice code="CH-13282" title="Your focus areas and goals didn’t load" body="Whether this read is part of one is missing for now. The read is not affected. Try again in a moment." covered={covered} />
      ) : focus || goal ? (
        <ul className="ch-hd-plan">
          {focus && row('focus', Target, focus.fromThis ? 'Focus area made from this' : 'Focus area on the same stat', focus.title, focus.word, null, focus.live)}
          {goal && row('goal', Flag, goal.fromThis ? 'Goal made from this' : 'Goal on the same stat', goal.title, goal.word, goal.line, goal.word === 'Active')}
        </ul>
      ) : (
        <EmptyState
          compact
          code="CH-13384"
          title="No plan yet"
          body="This read is not part of a focus area or a goal yet. Development is where you turn one into a plan."
          action={
            href ? (
              <Button variant="secondary" size="sm" href={href} rightIcon={Compass} feel="select">
                Open Development
              </Button>
            ) : undefined
          }
        />
      )}
    </Section>
  );
}

/** One read in full. Re-mounted per insight (key), so each opens at its top. */
function Dossier({ i, d }: { i: ChDeepInsight; d: ChDeepDive }) {
  const b = i.base;
  const tone: ChDiveTone = b.kind === 'strength' ? 'good' : 'warn';
  // The read's parts that did not load, as its notices draw them: two or more are said once, under the read's head, with one
  // Try again (CH-1209), and each part keeps only its title where it would be (states audit, 2026-10-08).
  const failed = [
    d.themesFailed && 'your category trends',
    d.roundsFailed && i.rounds.total > 0 && 'the rounds behind this read',
    d.plansFailed && 'your focus areas and goals',
  ].filter((x): x is string => !!x);
  const covered = failed.length > 1;
  const cx = b.engine?.corrections;
  // Show later is the coach's, so a player's own read is never held back here; the state is kept for a coach-drawn dossier.
  const [held, setHeld] = useState<number | null>(cx?.laterRounds ?? null);
  if (held != null && cx) {
    return (
      <article className="ch-hd-dos" aria-labelledby={`${b.id}-t`}>
        <header className="ch-hd-dos__h">
          <div className="ch-hl-focus__k">
            <span>{b.category}</span>
          </div>
          <h2 id={`${b.id}-t`}>
            <SerifText text={b.title} />
          </h2>
        </header>
        <ReadLater rounds={held} />
        <CorrectionChips c={cx} held={held} onHeld={setHeld} />
      </article>
    );
  }
  return (
    <article className="ch-hd-dos" aria-labelledby={`${b.id}-t`}>
      <header className="ch-hd-dos__h">
        <div className="ch-hl-focus__k">
          <span>{b.category}</span>
          <span className={'ch-hl-pri is-' + i.stance.cls}>{i.stance.word}</span>
        </div>
        <h2 id={`${b.id}-t`}>
          <SerifText text={b.title} />
        </h2>
        {/* The four lines are what is read first; the parts below are their evidence. */}
        <Read i={i} tour={d.tour} />
      </header>
      {/* What the engine now knows, flush under the read (each part only with its flag on; the cause is the Why line above), and
          "Why do you think so?", the read's audit lines. */}
      <EngineState engine={i.base.engine && { ...i.base.engine, cause: undefined }} />
      <WhyAudit lines={i.base.engine?.audit} />
      {/* The correction chips, under the audit (03 §7.2), only when the loader put them on the read. */}
      {cx && <CorrectionChips c={cx} held={held} onHeld={setHeld} />}
      <PageRefreshNotice parts={failed} />

      <Section id={`${b.id}-meas`} title="What was measured">
        <div className={'ch-hd-meas ' + paint(tone)}>
          <div className="ch-hd-meas__v">
            <b className="ch-num">{i.measured.value}</b>
            <span>{i.measured.label}</span>
          </div>
          {i.measured.span && <p className="ch-hd-meas__s ch-num">{i.measured.span}</p>}
        </div>
        <Evidence ev={{ ...b.evidence, label: '' }} />
      </Section>

      <Trend i={i} theme={d.themes[i.cat]} themesFailed={d.themesFailed} covered={covered} />
      <Rounds i={i} failed={d.roundsFailed} covered={covered} />
      <Why i={i} />
      <Where id={b.id} where={i.where} />

      <Plan i={i} failed={d.plansFailed} covered={covered} />
    </article>
  );
}

/**
 * A read on the ledger: its stance dot, its title, its stance and firmness words, and its number. Picking one is a selection haptic
 * (CH-13780). An out-of-date read keeps its row, its firmness word greyed (design call, States).
 */
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
          <b>{i.base.title}</b>
          <em>
            <span>{i.stance.word}</span>
            {i.firmness && <span className="ch-hd-it__f"> · {i.firmness}</span>}
          </em>
        </span>
        <span className="ch-hd-it__v ch-num">
          {i.base.value}
          {i.base.value && i.base.valueUnit && (
            <>
              {' '}
              <small>{i.base.valueUnit}</small>
            </>
          )}
        </span>
        <Icon icon={ChevronRight} size={15} />
      </button>
    </li>
  );
}

/** A cleared read, kept in its area as one line (D6): "Cleared Oct 12", what it was about, and the recheck's numbers. */
function ClearedRow({ c }: { c: ChDiveCleared }) {
  return (
    <li className="ch-hd-cl">
      <span className="ch-hd-it__d" aria-hidden="true" />
      <span className="ch-hd-cl__b">
        <b>{c.title}</b>
        <em>{c.word}</em>
        {c.line && <span className="ch-num">{c.line}</span>}
      </span>
    </li>
  );
}

/**
 * The read ledger (chs-35; design call "Player Deep dive"): one flush list grouped by area, in the order a hole is played, each read
 * in the page's own order within its area. Cleared reads stay in their area; the newest three are shown, then "N more cleared".
 */
function Ledger({ list, cleared = [], pickedId, onPick }: { list: readonly ChDeepInsight[]; cleared?: readonly ChDiveCleared[]; pickedId: string | null; onPick: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const shown = clearedShown(cleared, all);
  const more = cleared.length - shown.size;
  const areas = DIVE_AREAS.map((a) => ({ ...a, reads: list.filter((i) => i.area === a.id), done: cleared.filter((c) => c.area === a.id && shown.has(c.id)) })).filter((a) => a.reads.length > 0 || a.done.length > 0);
  return (
    <>
      {areas.map((a) => (
        <section key={a.id} className="ch-hd-grp" aria-labelledby={`ch-hd-area-${a.id}`}>
          <div className="ch-hd-grp__h">
            <h3 id={`ch-hd-area-${a.id}`}>{a.label}</h3>
            {a.reads.length > 0 && <span className="ch-num">{a.reads.length}</span>}
          </div>
          <ul>
            {a.reads.map((i) => (
              <Item key={i.base.id} i={i} on={i.base.id === pickedId} onPick={() => onPick(i.base.id)} />
            ))}
            {a.done.map((c) => (
              <ClearedRow key={c.id} c={c} />
            ))}
          </ul>
        </section>
      ))}
      {more > 0 && (
        <button type="button" className="ch-hd-more" onClick={() => setAll(true)} data-ch-code="CH-13992">
          <span className="ch-num">{more}</span> more cleared
        </button>
      )}
    </>
  );
}

/** "CoachHelm has 5 reads on your game, 2 of them in your plan." One sentence; plans that did not load leave the plan clause out, never a zero. */
export function heroLine(d: Pick<ChDeepDive, 'counts' | 'plansFailed'>): string {
  const { insights, inPlan } = d.counts;
  const head = `CoachHelm has ${insights} ${insights === 1 ? 'read' : 'reads'} on your game`;
  if (d.plansFailed || inPlan === 0) return `${head}.`;
  if (insights === 1) return `${head}, and it is in your plan.`;
  return `${head}, ${inPlan === insights ? 'all' : inPlan} of them in your plan.`;
}

function Hero({ d }: { d: ChDeepDive }) {
  return (
    <section className="ch-hd-hero" aria-labelledby="ch-hd-hero-t">
      <h2 id="ch-hd-hero-t" className="ch-num">
        {heroLine(d)}
      </h2>
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
  const phone = useChPhone();
  const reduced = useChReducedMotion();
  const startHref = coachHelmLinks.startRound();
  const dossier = useRef<HTMLDivElement>(null);
  const list = load.status === 'ready' ? load.data.list : [];
  // The read the player opened is kept for this tab with the shell's session state, so a way back to the page (Back, another view and
  // back) returns to it (owner rule 8). `?insight=` is only ever read, from the props the route made from it: nothing here writes the
  // address. A read it names wins over a kept one, as a link must, and is looked up every render, so a first load that failed or came
  // back empty, then answered by Try again, still opens on it.
  const hydrated = useHydrated();
  const [stored, setKept] = useChSessionState<string | null>('coachhelm.dive.insight', null);
  const kept = hydrated ? stored : null;
  const [byHand, setByHand] = useState(false);
  const [seenInitial, setSeenInitial] = useState(initialId);
  if (initialId !== seenInitial) {
    setSeenInitial(initialId);
    setByHand(false);
  }
  const named = !byHand && initialId && list.some((i) => i.base.id === initialId) ? initialId : null;
  const picked = named ?? kept;
  const choose = useCallback(
    (id: string | null) => {
      setKept(id);
      setByHand(true);
    },
    [setKept],
  );
  const open = picked ? list.find((i) => i.base.id === picked) : undefined;
  // The read the player had open is no longer on the page (a refresh took it away): what shows is another read, and it says so.
  const gone = picked !== null && !open;
  // On desktop a read is always showing: the one picked, else the first. On the phone nothing is open until one is.
  const shown = open ?? list[0];

  // The open read is a history entry, so the iOS edge swipe and the browser's back close it instead of leaving the page.
  const popTo = useCallback((level: number) => level < 1 && choose(null), [choose]);
  usePhoneStackHistory(phone && open ? 1 : 0, popTo);

  const pick = (id: string) => {
    choose(id);
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
        <RefreshNotice code="CH-13280" title="Your insights didn’t load" body="Nothing is lost. Your insights are still saved; try again in a moment." />
      </PlayerHelmFrame>
    );
  }
  const d = load.data;
  if (list.length === 0) {
    const none = d.rounds === 0;
    return (
      <PlayerHelmFrame view="deep-dive" line={LINE}>
        {/* The whole view is empty: on the phone it is the page's empty state, centred on the parchment like the Board's first run
            (the Mobile clubhouse pass, 2026-10-08); desktop keeps the line on the Ledger. */}
        <EmptyState
          code={none ? 'CH-13380' : 'CH-13381'}
          size={phone ? 'page' : 'section'}
          icon={Compass}
          title={none ? 'Your Deep dive starts with a round' : 'No insight to open yet'}
          body={
            none
              ? 'CoachHelm reads your rounds for patterns worth your time, and each one lands here with its evidence. Post a round and the first reads follow.'
              : `CoachHelm writes an insight when a pattern in your rounds is clear enough to stand behind. None is yet${d.rounds ? `, from the ${d.rounds} ${d.rounds === 1 ? 'round' : 'rounds'} you have posted` : ''}. It checks again as you post more.`
          }
          action={
            startHref ? (
              <Button variant="primary" leftIcon={Plus} href={startHref.href}>
                {startHref.label}
              </Button>
            ) : undefined
          }
        />
        {/* CH-13992: a read cleared at its last check stays listed in its area for two more, even when no open read is left. */}
        {d.cleared && d.cleared.length > 0 && (
          <nav className="ch-hd-rail" aria-label="Cleared reads" data-ch-code="CH-13890">
            <Ledger list={[]} cleared={d.cleared} pickedId={null} onPick={() => {}} />
          </nav>
        )}
      </PlayerHelmFrame>
    );
  }

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
                <PhoneBar back={{ label: 'Deep dive', onBack: () => choose(null) }} title={open.base.category} titleId="ch-hd-screen-t" />
                <div className="ch-hd-scroll">
                  <SectionBoundary surface="coachhelm.deep-dive.read" label="This read" code="CH-13204">
                    <Dossier i={open} d={d} />
                  </SectionBoundary>
                </div>
              </PhoneScreen>
            )}
          </AnimatePresence>
        ) : undefined
      }
    >
      <SectionBoundary surface="coachhelm.deep-dive" label="Your deep dive" code="CH-13204">
        {gone && (
          <p className="ch-hl-note" role="status" data-ch-code="CH-13910">
            The read you had open is no longer on your Deep dive, so {phone ? 'none is open' : 'this is your first read'}.
          </p>
        )}
        {/* CH-13208: a read beside the insights failed (the Tour's values, the drills, which are Assigned, how current each is). */}
        {d.missing && <BoardPartial missing={d.missing} what="page" />}
        <Hero d={d} />
        <div className="ch-hd">
          <nav className="ch-hd-rail" aria-label="Your insights" data-ch-code="CH-13890">
            <Ledger list={list} cleared={d.cleared} pickedId={phone ? null : shown?.base.id ?? null} onPick={pick} />
          </nav>
          {!phone && shown && (
            <div className="ch-hd-main" ref={dossier}>
              <Dossier key={shown.base.id} i={shown} d={d} />
            </div>
          )}
        </div>
      </SectionBoundary>
    </PlayerHelmFrame>
  );
}
