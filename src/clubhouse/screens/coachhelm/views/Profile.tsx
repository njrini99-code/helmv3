'use client';

import Link from 'next/link';
import { ArrowRight, ChevronDown, ChevronRight, Lock, Plus } from 'lucide-react';
import { useId } from 'react';
import type { ChMeasure, ChProfile } from '../../../data/coachhelm-profile-shape';
import { helmViewHref, PLAYER_HELM_HREF, PLAYER_VOICE, type ChViewLoad, type ChViewVoice } from '../../../data/coachhelm-views-shape';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { RefreshNotice } from '../../../ui/RefreshNotice';
import { SectionBoundary } from '../../../ui/SectionBoundary';
import { EmptyState } from '../../../ui/States';
import { coachHelmLinks } from '../PlayerBoard';
import { HelmOff, PlayerHelmFrame } from './Frame';
import { KeepReading } from './KeepReading';

const LINE = 'What CoachHelm reads in your rounds, and the shape of your game.';

/**
 * The page's own words for whose page it is (spec A): the player's, as they always were, or a coach's about the player by first name.
 * The engine's words go through `speak` in the loader; these are the screen's.
 */
function wordsFor(voice: ChViewVoice) {
  if (voice.role !== 'coach') {
    return {
      shape: 'The shape of your game',
      soFar: 'What your rounds say so far',
      rest: 'The rest fill in as you post more; none is estimated in the meantime.',
      failed: { title: 'Your game profile didn’t load', body: 'Nothing is lost. Your profile is still saved; try again in a moment.' },
      empty: {
        title: 'Your game profile starts with a few rounds',
        body: 'CoachHelm reads how you play from the rounds you post. Each measure has its own minimum, so they fill in one at a time. Nothing is estimated before then.',
      },
      label: 'Your game profile',
    };
  }
  const f = voice.first;
  return {
    shape: `The shape of ${f}’s game`,
    soFar: `What ${f}’s rounds say so far`,
    rest: `The rest fill in as ${f} posts more; none is estimated in the meantime.`,
    failed: { title: `${f}’s game profile didn’t load`, body: 'Nothing is lost. The profile is still saved; try again in a moment.' },
    empty: {
      title: `${f}’s game profile starts with a few rounds`,
      body: `CoachHelm reads how ${f} plays from the rounds ${f} posts. Each measure has its own minimum, so they fill in one at a time. Nothing is estimated before then.`,
    },
    label: `${f}’s game profile`,
  };
}

/**
 * A measure on its own scale. The track is decoration (the figure and the words carry every number); a gap from its "no
 * difference" mark is filled in the stance's colour so how far it sits from even reads at a glance, and a share fills from the
 * left. Nothing here is a 0 to 100 score.
 */
function Scale({ m }: { m: ChMeasure }) {
  const sc = m.scale;
  if (!sc || m.pos == null) return null;
  const anchor = sc.anchor == null ? 0 : ((sc.anchor - sc.min) / (sc.max - sc.min)) * 100;
  const from = Math.min(anchor, m.pos);
  const to = Math.max(anchor, m.pos);
  return (
    <div className={'ch-hg-sc is-' + m.tone}>
      <div className="ch-hg-sc__t" aria-hidden="true">
        <i className="ch-hg-sc__f" style={{ left: `${from}%`, width: `${to - from}%` }} />
        {sc.anchor != null && <i className="ch-hg-sc__a" style={{ left: `${anchor}%` }} />}
        <i className="ch-hg-sc__d" style={{ left: `${m.pos}%` }} />
      </div>
      <div className="ch-hg-sc__e" aria-hidden="true">
        <span>{sc.low}</span>
        <span>{sc.high}</span>
      </div>
    </div>
  );
}

function Measure({ m }: { m: ChMeasure }) {
  const id = useId();
  const tone = m.tone;
  return (
    <li className={'ch-hg-m is-' + tone + (m.locked ? ' is-locked' : '')} aria-labelledby={`${id}-t`}>
      <div className="ch-hg-m__k">
        <span>{m.category}</span>
        {m.stance && <span className={'ch-hg-tag is-' + tone}>{m.stance === 'strength' ? 'Strength' : 'Worth watching'}</span>}
      </div>
      <h3 id={`${id}-t`}>{m.label}</h3>
      {m.locked ? (
        <>
          <p className="ch-hg-m__lock">
            <Icon icon={Lock} size={13} />
            Needs more rounds
          </p>
          {m.meaning && <p className="ch-hg-m__mean">{m.meaning}</p>}
          {m.floor && <p className="ch-hg-m__floor">Reads from {m.floor.charAt(0).toLowerCase() + m.floor.slice(1)}</p>}
        </>
      ) : (
        <>
          {m.headline && <p className="ch-hg-m__word">{m.headline}</p>}
          {m.figure && (
            <p className="ch-hg-m__fig">
              <b className="ch-num">{m.figure}</b>
              {m.figureNote && <span>{m.figureNote}</span>}
            </p>
          )}
          <Scale m={m} />
          {m.bound && <p className="ch-hg-m__edge">{m.bound}</p>}
          {m.meaning && <p className="ch-hg-m__mean">{m.meaning}</p>}
          <div className="ch-hg-m__f">
            {/* Confidence is the word only (design call D8 cuts the three-bar meter). */}
            <span>{m.read ? m.read.word : 'No read yet'}</span>
          </div>
          {(m.measured || m.floor) && (
            <details className="ch-hg-m__how">
              <summary>
                <span>How it is measured</span>
                <Icon icon={ChevronDown} size={15} />
              </summary>
              {m.measured && <p>{m.measured}</p>}
              {m.floor && <p>{m.floor}</p>}
            </details>
          )}
        </>
      )}
    </li>
  );
}

/** Deep dive opened on one insight. */
const diveHref = (id: string) => `${PLAYER_HELM_HREF['deep-dive']}&insight=${encodeURIComponent(id)}`;

/**
 * What CoachHelm sees (owner, 2026-10-16: "make it based on actual CoachHelm output"): the player's own insights, ranked as
 * the Board ranks them, split into what is working and what is costing strokes. Each row is the insight's title and
 * headline number, and opens its evidence in Deep dive. Nothing here is written for the page: it is the engine's text.
 */
function Sees({ sees }: { sees: NonNullable<ChProfile['sees']> }) {
  if (sees.error) {
    return <RefreshNotice code="CH-13261" title="What CoachHelm sees didn’t load" body="Your measures below are still right; try again in a moment." />;
  }
  const live = sees.list.filter((i) => !i.stale);
  if (!live.length) return null;
  const groups = [
    { key: 'warn', title: 'Costing you', rows: live.filter((i) => !i.strength).slice(0, 4) },
    { key: 'good', title: 'What’s working', rows: live.filter((i) => i.strength).slice(0, 4) },
  ].filter((g) => g.rows.length > 0);
  const top = live[0]!;
  const meta = [top.evidence.sample, top.evidence.window, top.evidence.asOf].filter(Boolean).join(' · ');
  return (
    <section className="ch-hg-sees ch-scoreboard" aria-labelledby="ch-hg-sees-t">
      <div className="ch-hg-hero__k">
        <span>What CoachHelm sees</span>
        {meta && <span className="ch-num">{meta}</span>}
      </div>
      <h2 id="ch-hg-sees-t">{top.title}</h2>
      {top.lede && <p className="ch-hg-sees__lede">{top.lede}</p>}
      <div className="ch-hg-sees__cols">
        {groups.map((g) => (
          <section key={g.key} aria-label={g.title} className={'ch-hg-sees__c is-' + g.key}>
            <h3>{g.title}</h3>
            <ul>
              {g.rows.map((i) => (
                <li key={i.id}>
                  {/* A client navigation, as every other link between the views: a plain anchor reloaded the whole app. */}
                  <Link href={diveHref(i.id)} className="ch-hg-sees__r">
                    <span className="ch-hg-sees__b">
                      <small>{i.category}</small>
                      <b>{i.title}</b>
                    </span>
                    {i.value && <span className="ch-hg-sees__v ch-num">{i.value}</span>}
                    <Icon icon={ChevronRight} size={15} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

/**
 * A coach's one line under the hero (spec A), in place of the player's two-column list: how many of the player's current reads are
 * costing strokes and how many are working, and the way to all of them in the Deep dive.
 */
function SeenRow({ seen, voice }: { seen: NonNullable<ChProfile['seen']>; voice: ChViewVoice }) {
  if (seen.error) return <RefreshNotice code="CH-13261" title="What CoachHelm sees didn’t load" body="The measures below are still right; try again in a moment." />;
  const { costing, working } = seen;
  if (costing === 0 && working === 0) return null;
  const reads = (n: number) => (n === 1 ? 'read' : 'reads');
  const said = costing > 0 ? `${costing} ${reads(costing)} costing strokes${working > 0 ? ` and ${working} working` : ''}` : `${working} ${reads(working)} working`;
  return (
    <Link className="ch-hv-link ch-hv-seen" href={helmViewHref('deep-dive', voice)}>
      <b className="ch-num">CoachHelm sees {said}</b>
      <strong className="ch-hv-seen__go">
        Deep dive
        <Icon icon={ArrowRight} size={16} />
      </strong>
    </Link>
  );
}

function Hero({ p, voice = PLAYER_VOICE }: { p: ChProfile; voice?: ChViewVoice }) {
  const w = wordsFor(voice);
  const meta = [`Last ${p.windowDays} days`, p.rounds != null ? `${p.rounds} ${p.rounds === 1 ? 'round' : 'rounds'}` : null, p.refreshed ? `Refreshed ${p.refreshed.replace(' ', '\u00a0')}` : null].filter(Boolean);
  const none = p.strengths.length === 0 && p.watchouts.length === 0;
  return (
    // The shape of the game on the team board's green (owner, 2026-10-16: "more green"), with how much of it is read so far.
    <section className={'ch-hg-hero' + (p.sees?.list.some((i) => !i.stale) ? ' is-second' : ' ch-scoreboard')} aria-labelledby="ch-hg-hero-t">
      <div className="ch-hg-hero__k">
        <span>{w.shape}</span>
        {/* A no-break space before each dot, so a wrapped line never starts with one. */}
        <span className="ch-num">{meta.join('\u00a0· ')}</span>
      </div>
      {/* A no-break space before each dot, so a wrapped line never starts with one. */}
      <h2 id="ch-hg-hero-t">{p.courseProfile?.replaceAll(' · ', '\u00a0· ') ?? w.soFar}</h2>
      {none ? (
        <p className="ch-hg-hero__none">Nothing stands out yet. A strength or a watch-out shows once a measure is clearly high or low, with enough rounds behind it.</p>
      ) : (
        <div className="ch-hg-stand">
          {[
            { key: 'good', title: 'Strong', rows: p.strengths },
            { key: 'warn', title: 'Worth watching', rows: p.watchouts },
          ]
            .filter((g) => g.rows.length > 0)
            .map((g) => (
              <section key={g.key} aria-label={g.title} className={'ch-hg-stand__c is-' + g.key}>
                <h3>{g.title}</h3>
                <ul>
                  {g.rows.map((r) => (
                    <li key={r.id}>
                      <span className="ch-hg-stand__d" aria-hidden="true" />
                      <span className="ch-hg-stand__b">
                        <b>{r.label}</b>
                        {r.word && <em>{r.word}</em>}
                      </span>
                      {r.figure && <span className="ch-hg-stand__v ch-num">{r.figure}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
      {p.state === 'partial' && (
        <div className="ch-hg-ready">
          <span className="ch-hg-ready__dots" aria-hidden="true">
            {[...p.measures]
              .sort((a, b) => Number(a.locked) - Number(b.locked))
              .map((m) => (
                <i key={m.id} className={m.locked ? undefined : 'is-on'} />
              ))}
          </span>
          <p className="ch-hg-early" role="note" data-ch-code="CH-13361">
            <b className="ch-num">
              {p.ready} of {p.measures.length}
            </b>{' '}
            measures have enough rounds so far. {w.rest}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * The player's Game profile (P013, `?view=profile`): the genome the Fairway page reads, as the shape of their game in words, then
 * every measure with its value, what it means, how sure the read is and how it is measured. The player's own and read-only: the
 * one thing it asks for is more rounds.
 *
 * `voice`: a coach's Game profile of one player (spec A) is the same page about the player by first name, with one line of what
 * CoachHelm sees in place of the two-column list, no Start a round, and its ways on to the player's other two views.
 */
export function Profile({ load, voice = PLAYER_VOICE }: { load: ChViewLoad<ChProfile>; voice?: ChViewVoice }) {
  const coach = voice.role === 'coach' ? voice : null;
  const startHref = coach ? null : coachHelmLinks.startRound();
  const w = wordsFor(voice);

  if (load.status === 'off') {
    return (
      <PlayerHelmFrame view="profile" line={LINE} off voice={voice}>
        <HelmOff reason={load.reason} voice={voice} />
      </PlayerHelmFrame>
    );
  }
  if (load.status === 'failed') {
    return (
      <PlayerHelmFrame view="profile" line={LINE} voice={voice}>
        <RefreshNotice code="CH-13260" title={w.failed.title} body={w.failed.body} />
      </PlayerHelmFrame>
    );
  }
  const p = load.data;
  const ready = p.measures.filter((m) => !m.locked);
  const locked = p.measures.filter((m) => m.locked);
  return (
    <PlayerHelmFrame view="profile" line={LINE} voice={voice}>
      {p.state === 'empty' ? (
        <>
          <EmptyState
            code="CH-13360"
            shape="rows"
            title={w.empty.title}
            body={w.empty.body}
            action={
              startHref ? (
                <Button variant="primary" leftIcon={Plus} href={startHref.href}>
                  {startHref.label}
                </Button>
              ) : undefined
            }
          />
          <section className="ch-hg-sec" aria-labelledby="ch-hg-all">
            <h2 id="ch-hg-all">What it will read</h2>
            {/* Every measure is still locked: the compact tiles the loaded view uses for "Still filling in", not seven full cards. */}
            <ol className="ch-hg-grid is-locked">
              {p.measures.map((m) => (
                <Measure key={m.id} m={m} />
              ))}
            </ol>
          </section>
        </>
      ) : (
        <SectionBoundary surface="coachhelm.profile" label={w.label} code="CH-13204">
          {!coach && p.sees && <Sees sees={p.sees} />}
          <Hero p={p} voice={voice} />
          {coach && p.seen && <SeenRow seen={p.seen} voice={voice} />}
          <section className="ch-hg-sec" aria-labelledby="ch-hg-all">
            <div className="ch-hg-sec__h">
              <h2 id="ch-hg-all">Every measure</h2>
              <p>Each marker sits on its own scale. These are not grades, and a thin read can move a lot with one round.</p>
            </div>
            {/* What is read, then what is still filling in (owner, 2026-10-16: the cards were "unorganized"): the read
                measures as full cards, the locked ones as compact tiles that say what each still needs. */}
            {ready.length > 0 && (
              <>
                {/* The split is only news when both halves are there: with nothing still filling in, a lone "With a read"
                    under "Every measure" read as a tab with nothing beside it (2026-10-19). */}
                {locked.length > 0 && (
                  <h3 className="ch-hg-grp">
                    With a read <span className="ch-num">{ready.length}</span>
                  </h3>
                )}
                <ol className="ch-hg-grid">
                  {ready.map((m) => (
                    <Measure key={m.id} m={m} />
                  ))}
                </ol>
              </>
            )}
            {locked.length > 0 && (
              <>
                <h3 className="ch-hg-grp is-locked">
                  Still filling in <span className="ch-num">{locked.length}</span>
                </h3>
                <ol className="ch-hg-grid is-locked">
                  {locked.map((m) => (
                    <Measure key={m.id} m={m} />
                  ))}
                </ol>
              </>
            )}
            <div className="ch-hg-tail">
              {coach ? (
                <KeepReading
                  id="ch-hg-next-t"
                  title={`Also for ${coach.first}`}
                  line={`This is the shape of ${coach.first}’s game. The next two say where it stands and what to work on.`}
                  items={[
                    { href: helmViewHref('standing', voice), title: 'Standing', note: 'Against the Tour and the team, in strokes a round' },
                    { href: helmViewHref('deep-dive', voice), title: 'Deep dive', note: 'Every read, with its evidence, to assign from' },
                  ]}
                />
              ) : (
                <KeepReading
                  id="ch-hg-next-t"
                  line="This is the shape of your game. The next two say where it puts you and what to do about it."
                  items={[
                    { href: PLAYER_HELM_HREF.standing, title: 'Standing', note: 'Against the Tour and your team' },
                    { href: PLAYER_HELM_HREF['deep-dive'], title: 'Deep dive', note: 'The insights behind it, with their evidence' },
                  ]}
                />
              )}
            </div>
          </section>
        </SectionBoundary>
      )}
    </PlayerHelmFrame>
  );
}
