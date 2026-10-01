'use client';

import { ChevronDown, Dna, Lock, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import type { ChMeasure, ChProfile } from '../../../data/coachhelm-profile-shape';
import { PLAYER_HELM_HREF, type ChViewLoad } from '../../../data/coachhelm-views-shape';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { InlineNotice } from '../../../ui/Notices';
import { SectionBoundary } from '../../../ui/SectionBoundary';
import { EmptyState } from '../../../ui/States';
import { ReadMeter } from '../parts';
import { coachHelmLinks } from '../PlayerBoard';
import { HelmOff, PlayerHelmFrame } from './Frame';
import { KeepReading } from './KeepReading';

const LINE = 'How you play, read from the rounds you posted in the last 90 days.';

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
            {m.read ? <ReadMeter read={m.read} /> : <span>No read yet</span>}
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

function Hero({ p }: { p: ChProfile }) {
  const meta = [`Last ${p.windowDays} days`, p.rounds != null ? `${p.rounds} ${p.rounds === 1 ? 'round' : 'rounds'}` : null, p.refreshed ? `Refreshed ${p.refreshed}` : null].filter(Boolean);
  const none = p.strengths.length === 0 && p.watchouts.length === 0;
  return (
    <section className="ch-hg-hero" aria-labelledby="ch-hg-hero-t">
      <div className="ch-hg-hero__k">
        <span>Your game</span>
        <span className="ch-num">{meta.join(' · ')}</span>
      </div>
      <h2 id="ch-hg-hero-t">{p.courseProfile ?? 'What your rounds say so far'}</h2>
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
    </section>
  );
}

/**
 * The player's Game profile (P013, `?view=profile`): the genome the Fairway page reads, as the shape of their game in words, then
 * every measure with its value, what it means, how sure the read is and how it is measured. The player's own and read-only: the
 * one thing it asks for is more rounds.
 */
export function Profile({ load }: { load: ChViewLoad<ChProfile> }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const startHref = coachHelmLinks.startRound();

  if (load.status === 'off') {
    return (
      <PlayerHelmFrame view="profile" line={LINE} off>
        <HelmOff reason={load.reason} />
      </PlayerHelmFrame>
    );
  }
  if (load.status === 'failed') {
    return (
      <PlayerHelmFrame view="profile" line={LINE}>
        <InlineNotice code="CH-13260" title="Your game profile didn’t load" body="Nothing is lost. Your profile is still saved; try again in a moment." onRetry={refresh} />
      </PlayerHelmFrame>
    );
  }
  const p = load.data;
  return (
    <PlayerHelmFrame view="profile" line={LINE}>
      {p.state === 'empty' ? (
        <>
          <EmptyState
            code="CH-13360"
            icon={Dna}
            title="Your game profile starts with a few rounds"
            body="CoachHelm reads how you play from the rounds you post. Each measure has its own minimum, so they fill in one at a time. Nothing is estimated before then."
            action={
              startHref ? (
                <Button variant="primary" leftIcon={Play} href={startHref.href}>
                  {startHref.label}
                </Button>
              ) : undefined
            }
          />
          <section className="ch-hg-sec" aria-labelledby="ch-hg-all">
            <h2 id="ch-hg-all">What it will read</h2>
            <ol className="ch-hg-grid">
              {p.measures.map((m) => (
                <Measure key={m.id} m={m} />
              ))}
            </ol>
          </section>
        </>
      ) : (
        <SectionBoundary surface="coachhelm.profile" label="Your game profile" code="CH-13204">
          {p.state === 'partial' && (
            <p className="ch-hg-early" role="note" data-ch-code="CH-13361">
              <b className="ch-num">
                {p.ready} of {p.measures.length}
              </b>{' '}
              measures have enough rounds so far. The rest fill in as you post more; none is estimated in the meantime.
            </p>
          )}
          <Hero p={p} />
          <section className="ch-hg-sec" aria-labelledby="ch-hg-all">
            <div className="ch-hg-sec__h">
              <h2 id="ch-hg-all">Every measure</h2>
              <p>Each marker sits on its own scale. These are not grades, and a thin read can move a lot with one round.</p>
            </div>
            <ol className="ch-hg-grid">
              {p.measures.map((m) => (
                <Measure key={m.id} m={m} />
              ))}
              <li className="ch-hg-tail">
                <KeepReading
                  id="ch-hg-next-t"
                  line="This is the shape of your game. The next two say where it puts you and what to do about it."
                  items={[
                    { href: PLAYER_HELM_HREF.standing, title: 'Standing', note: 'Against the Tour and your team' },
                    { href: PLAYER_HELM_HREF['deep-dive'], title: 'Deep dive', note: 'The insights behind it, with their evidence' },
                  ]}
                />
              </li>
            </ol>
          </section>
        </SectionBoundary>
      )}
    </PlayerHelmFrame>
  );
}
