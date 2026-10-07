'use client';

import { AnimatePresence, m } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { ChCoachHome, ChHoleScore } from '../../data/home';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { rebuiltHref } from '../../shell/nav';
import { firstName } from './model';
import { MY_STATS, roundHref } from './player-links';
import { ScoreMark } from '../../ui/ScoreMark';
import { EmptyState } from '../../ui/States';
import { ScrollRegion } from '../../ui/ScrollRegion';
import { chSwap } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { changeTone, formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { GirViz, PuttsViz, SgViz } from './RoundViz';

function Nine({ label, holes }: { label: string; holes: ChHoleScore[] }) {
  const par = holes.every((h) => h.par != null) ? holes.reduce((a, h) => a + (h.par ?? 0), 0) : null;
  const tot = holes.every((h) => h.score != null) ? holes.reduce((a, h) => a + (h.score ?? 0), 0) : null;
  return (
    <div className="ch-h-nine" role="table" aria-label={`${label} nine`}>
      <div className="ch-h-nine__row ch-h-nine__holes" role="row">
        <span role="rowheader">{label}</span>
        {holes.map((h) => (
          <span key={h.n} role="columnheader">{h.n}</span>
        ))}
        <span role="columnheader">Tot</span>
      </div>
      <div className="ch-h-nine__row ch-h-nine__par" role="row">
        <span role="rowheader">Par</span>
        {holes.map((h) => (
          <span key={h.n} role="cell">{h.par ?? NO_DATA}</span>
        ))}
        <span role="cell">{par ?? NO_DATA}</span>
      </div>
      <div className="ch-h-nine__row" role="row">
        <span role="rowheader">
          <span className="ch-sr-only">Score</span>
        </span>
        {holes.map((h) => (
          <span key={h.n} role="cell">
            <ScoreMark score={h.score} par={h.par} size="sm" />
          </span>
        ))}
        <span role="cell" className="ch-h-nine__tot ch-num">{tot ?? NO_DATA}</span>
      </div>
    </div>
  );
}

const statsHref = (id: string) => rebuiltHref(`/golf/dashboard/stats?player=${id}`);

/**
 * `mine`: the player's Home ("My latest round", Player - Home.html): a flag in
 * place of the avatar, and My stats in place of the player's stats.
 */
/** `lead`: what opens the pane above the round (the player's Up next on desktop, so the two columns balance). */
export function LatestRound({ data, mine = false, lead }: { data: ChCoachHome['latestRounds']; mine?: boolean; lead?: ReactNode }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const reduced = useChReducedMotion();
  const { rounds } = data;
  const r = rounds[i];
  const step = (d: 1 | -1) => {
    setDir(d);
    setI((x) => (x + rounds.length + d) % rounds.length);
  };
  const swap = chSwap(dir, reduced);

  return (
    <section className="ch-h-pane" aria-labelledby="ch-round-title">
      {lead}
      <div className="ch-h-pane__head">
        <h2 id="ch-round-title">{mine ? 'My latest round' : 'Latest round'}</h2>
        {rounds.length > 1 && (
          <div className="ch-h-pager ch-well-soft">
            <span className="ch-num" aria-live="polite">
              {i + 1} of {rounds.length}
            </span>
            <IconButton icon={ChevronLeft} label="Previous round" size="sm" feel="select" onClick={() => step(-1)} />
            <IconButton icon={ChevronRight} label="Next round" size="sm" feel="select" onClick={() => step(1)} />
          </div>
        )}
      </div>

      {data.error ? (
        <RefreshNotice
          code="CH-2202"
          title="Recent rounds didn't load."
          body="Posted rounds are safe. Try again, and if it keeps happening the error has already been reported."
        />
      ) : !r ? (
        <EmptyState
          code="CH-2302"
          icon={Flag}
          title="No rounds posted yet this season."
          body={mine ? 'Your newest 18-hole round appears here, hole by hole, as soon as you post it.' : 'The newest 18-hole round appears here as soon as a player posts it.'}
        />
      ) : (
        <div className="ch-h-round-frame">
          {/* Paging rounds slides 12px in the direction of travel (CH-2601). */}
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <m.div
              key={r.id}
              className="ch-h-round"
              initial={reduced ? { opacity: 0 } : swap.initial}
              animate={reduced ? { opacity: 1 } : swap.animate}
              exit={reduced ? { opacity: 0 } : swap.exit}
              transition={swap.transition}
            >
              <div className="ch-h-round__top">
                <div className="ch-h-round__who">
                  {mine ? (
                    <span className="ch-h-flag" aria-hidden="true">
                      <Flag size={16} />
                    </span>
                  ) : (
                    <Avatar name={r.playerName} size={36} />
                  )}
                  <div>
                    <div className="ch-h-round__name">{mine ? (r.meta.split(' · ')[0] ?? r.meta) : r.playerName}</div>
                    <div className="ch-h-round__meta">{mine ? r.meta.split(' · ').slice(1).join(' · ') : r.meta}</div>
                  </div>
                </div>
                <div className="ch-h-round__score">
                  <span className="ch-num">{r.score}</span>
                  <span className={'ch-h-topar ch-num' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')}>{formatToPar(r.toPar)}</span>
                </div>
              </div>

              {r.holes ? (
                <ScrollRegion label={mine ? 'Your scorecard' : `${r.playerName}'s scorecard`} className="ch-h-card ch-scoreboard">
                  <Nine label="Out" holes={r.holes.slice(0, 9)} />
                  <Nine label="In" holes={r.holes.slice(9)} />
                </ScrollRegion>
              ) : (
                <div className="ch-h-card ch-h-card--none ch-well-soft" data-ch-code={data.holesError ? 'CH-2203' : 'CH-2303'}>
                  {data.holesError
                    ? 'Hole-by-hole scores didn’t load for this round. The total above is correct.'
                    : 'Posted as a total. Hole-by-hole scores weren’t recorded for this round.'}
                </div>
              )}

              <div className="ch-h-round__foot">
                <div className="ch-h-round__stats">
                  <span>
                    <em>GIR</em>
                    {r.gir ?? NO_DATA}
                    <GirViz gir={r.gir} />
                  </span>
                  <span>
                    <em>Putts</em>
                    {r.putts ?? NO_DATA}
                    <PuttsViz putts={r.putts} />
                  </span>
                  <span>
                    <em>SG</em>
                    <b className={changeTone(r.sg, false) || undefined}>{formatSigned(r.sg)}</b>
                    <SgViz sg={r.sg} />
                  </span>
                </div>
                {roundHref(r.id, mine ? 'player' : 'coach') ? (
                  // The board's "Open recap": the round's own review.
                  <Button href={roundHref(r.id, mine ? 'player' : 'coach')!} variant="ghost" size="sm" rightIcon={ArrowRight} className="ch-h-round__more">
                    Open recap
                  </Button>
                ) : mine ? (
                  // The review isn't rebuilt for this role; My stats holds every round.
                  <Button href={MY_STATS} variant="ghost" size="sm" rightIcon={ArrowRight} className="ch-h-round__more">
                    My stats
                  </Button>
                ) : (
                  statsHref(r.playerId) && (
                    // The review isn't rebuilt for this role; this opens the player's stats, and says so.
                    <Button href={statsHref(r.playerId)!} variant="ghost" size="sm" rightIcon={ArrowRight} className="ch-h-round__more">
                      {firstName(r.playerName)}&apos;s stats
                    </Button>
                  )
                )}
              </div>
            </m.div>
          </AnimatePresence>
        </div>
      )}

      {/* Coach desktop: the week beside this pane runs longer, so the other recent rounds fill the pane's foot as a
          picker (same rounds as the pager); a tap shows that round above. */}
      {!mine && !lead && !data.error && rounds.length > 1 && (
        <div className="ch-h-rail" role="group" aria-label="Recent rounds">
          <h3 className="ch-h-rail__title">Recent rounds</h3>
          <ul>
            {rounds.map((x, j) => (
              <li key={x.id}>
                <button
                  type="button"
                  className={'ch-h-rail__item' + (j === i ? ' is-on' : '')}
                  aria-pressed={j === i}
                  onClick={() => {
                    if (j === i) return;
                    setDir(j > i ? 1 : -1);
                    setI(j);
                  }}
                >
                  <Avatar name={x.playerName} size={26} />
                  <span className="ch-h-rail__who">
                    <span className="ch-h-rail__name">{x.playerName}</span>
                    <span className="ch-h-rail__meta">{x.meta.split(' · ').slice(0, 2).join(' · ')}</span>
                  </span>
                  <span className="ch-h-rail__score ch-num">{x.score}</span>
                  <span className={'ch-h-rail__par ch-num' + (x.toPar != null && x.toPar < 0 ? ' is-under' : '')}>
                    {formatToPar(x.toPar)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
