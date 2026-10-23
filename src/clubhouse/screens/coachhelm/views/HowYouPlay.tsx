'use client';

import { ChevronDown, Lock } from 'lucide-react';
import { useId } from 'react';
import type { ChGameLoad, ChMeasure } from '../../../data/coachhelm-profile-shape';
import { PLAYER_VOICE, STANDING_GAME_ID, type ChViewVoice } from '../../../data/coachhelm-views-shape';
import { Icon } from '../../../ui/Icon';
import { RefreshNotice } from '../../../ui/RefreshNotice';

/** The section's own words for whose page it is: the player's, or a coach's about the player by first name (spec A). */
function wordsFor(voice: ChViewVoice) {
  if (voice.role !== 'coach') {
    return {
      title: 'How you play',
      line: 'The shape of your game, on the measures the stats above do not cover. Each sits on its own scale; none is a grade.',
      rest: 'The rest fill in as you post more; none is estimated in the meantime.',
      empty: 'CoachHelm reads how you play from the rounds you post. Each measure has its own minimum, so they fill in one at a time.',
      failed: { title: 'How you play didn’t load', body: 'The stats above are not affected. Try again in a moment.' },
    };
  }
  const f = voice.first;
  return {
    title: `How ${f} plays`,
    line: `The shape of ${f}’s game, on the measures the stats above do not cover. Each sits on its own scale; none is a grade.`,
    rest: `The rest fill in as ${f} posts more; none is estimated in the meantime.`,
    empty: `CoachHelm reads how ${f} plays from the rounds ${f} posts. Each measure has its own minimum, so they fill in one at a time.`,
    failed: { title: `How ${f} plays didn’t load`, body: 'The stats above are not affected. Try again in a moment.' },
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

/** One measure: its word, its figure on its own scale, what it means, the read in words, and how it is measured; or what it still needs. */
export function Measure({ m }: { m: ChMeasure }) {
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

/**
 * Standing's "How you play" (P013, CH-13915): what the Game profile showed that Standing does not, folded into Standing as its own
 * section (design call, Nav: "Game profile folds into Standing"). The persona's sentence on the shape of the game, the window it
 * reads, then the measures Standing has no row for, read ones as full cards and the rest as compact tiles that say what each still
 * needs. What the Game profile also drew is not repeated: its "What CoachHelm sees" board is the Board's, and the ladder's
 * "Because" opens the same reads; scrambling, par 3s and pressure are Standing's own rows (`STANDING_DRAWS`).
 *
 * `?view=profile`, Game profile's old address, lands here (CH-13913): the section's id is `STANDING_GAME_ID`. Its read is its own: a
 * failed one says so in place (CH-13260) and the rest of Standing stands.
 */
export function HowYouPlay({ load, voice = PLAYER_VOICE }: { load: ChGameLoad; voice?: ChViewVoice }) {
  const w = wordsFor(voice);
  const head = (
    <div className="ch-hg-sec__h">
      <h2 id="ch-hg-game-t">{w.title}</h2>
      <p>{w.line}</p>
    </div>
  );
  if (load.status === 'failed') {
    return (
      <section id={STANDING_GAME_ID} className="ch-hg-sec ch-hg-game" aria-labelledby="ch-hg-game-t" data-ch-code="CH-13915">
        {head}
        <RefreshNotice code="CH-13260" title={w.failed.title} body={w.failed.body} />
      </section>
    );
  }
  const g = load.data;
  const ready = g.measures.filter((m) => !m.locked);
  const locked = g.measures.filter((m) => m.locked);
  const meta = [`Last ${g.windowDays} days`, g.rounds != null ? `${g.rounds} ${g.rounds === 1 ? 'round' : 'rounds'}` : null, g.refreshed ? `Refreshed ${g.refreshed.replace(' ', ' ')}` : null].filter(Boolean);
  return (
    <section id={STANDING_GAME_ID} className="ch-hg-sec ch-hg-game" aria-labelledby="ch-hg-game-t" data-ch-code="CH-13915">
      {head}
      {g.state !== 'empty' && (
        <div className="ch-hg-lede">
          {/* A no-break space before each dot, so a wrapped line never starts with one. */}
          {g.courseProfile && <p className="ch-hg-lede__s">{g.courseProfile.replaceAll(' · ', ' · ')}</p>}
          <p className="ch-hg-lede__k ch-num">{meta.join(' · ')}</p>
        </div>
      )}
      {g.state === 'empty' && (
        <p className="ch-hg-early" role="note" data-ch-code="CH-13360">
          <b>Starts with a few rounds.</b> {w.empty} Nothing is estimated before then.
        </p>
      )}
      {g.state === 'partial' && (
        <p className="ch-hg-early" role="note" data-ch-code="CH-13361">
          <b className="ch-num">
            {g.ready} of {g.measures.length}
          </b>{' '}
          measures have enough rounds so far. {w.rest}
        </p>
      )}
      {ready.length > 0 && (
        <ol className="ch-hg-grid">
          {ready.map((m) => (
            <Measure key={m.id} m={m} />
          ))}
        </ol>
      )}
      {locked.length > 0 && (
        <>
          {/* The split is only news when both halves are there. */}
          {ready.length > 0 && (
            <h3 className="ch-hg-grp is-locked">
              Still filling in <span className="ch-num">{locked.length}</span>
            </h3>
          )}
          <ol className="ch-hg-grid is-locked">
            {locked.map((m) => (
              <Measure key={m.id} m={m} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
