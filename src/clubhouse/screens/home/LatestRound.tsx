'use client';

import { AnimatePresence, m } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import { useState } from 'react';
import type { ChCoachHome, ChHoleScore } from '../../data/home';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { rebuiltHref } from '../../shell/nav';
import { firstName } from './model';
import { ScoreMark } from '../../ui/ScoreMark';
import { EmptyState } from '../../ui/States';
import { chSwap } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { RefreshNotice } from './RefreshNotice';

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

export function LatestRound({ data }: { data: ChCoachHome['latestRounds'] }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const reduced = useChReducedMotion();
  const { rounds } = data;
  const r = rounds[i];
  const step = (d: 1 | -1) => {
    setDir(d);
    setI((x) => (x + rounds.length + d) % rounds.length);
  };
  const swap = chSwap(dir);

  return (
    <section className="ch-h-pane" aria-labelledby="ch-round-title">
      <div className="ch-h-pane__head">
        <h2 id="ch-round-title">Latest round</h2>
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
          title="Recent rounds didn't load."
          body="Posted rounds are safe. Try again, and if it keeps happening the error has already been reported."
        />
      ) : !r ? (
        <EmptyState icon={Flag} title="No rounds posted yet this season." body="The newest 18-hole round appears here as soon as a player posts it." />
      ) : (
        <div className="ch-h-round-frame">
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
                  <Avatar name={r.playerName} size={36} />
                  <div>
                    <div className="ch-h-round__name">{r.playerName}</div>
                    <div className="ch-h-round__meta">{r.meta}</div>
                  </div>
                </div>
                <div className="ch-h-round__score">
                  <span className="ch-num">{r.score}</span>
                  <span className={'ch-h-topar ch-num' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')}>{formatToPar(r.toPar)}</span>
                </div>
              </div>

              {r.holes ? (
                <div className="ch-h-card ch-well-soft">
                  <Nine label="Out" holes={r.holes.slice(0, 9)} />
                  <Nine label="In" holes={r.holes.slice(9)} />
                </div>
              ) : (
                <div className="ch-h-card ch-h-card--none ch-well-soft">
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
                  </span>
                  <span>
                    <em>Putts</em>
                    {r.putts ?? NO_DATA}
                  </span>
                  <span>
                    <em>SG</em>
                    <b className={r.sg == null ? undefined : r.sg >= 0 ? 'is-gain' : 'is-loss'}>{formatSigned(r.sg)}</b>
                  </span>
                </div>
                {statsHref(r.playerId) && (
                  // No single-round recap is rebuilt yet; this opens the player's stats, and says so.
                  <Button href={statsHref(r.playerId)!} variant="ghost" size="sm" rightIcon={ArrowRight} className="ch-h-round__more">
                    {firstName(r.playerName)}&apos;s stats
                  </Button>
                )}
              </div>
            </m.div>
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
