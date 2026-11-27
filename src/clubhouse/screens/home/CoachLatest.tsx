'use client';

import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { ChCoachHome } from '../../data/home';
import type { ChYearKey } from '../../lib/class-year';
import { changeTone, formatSigned, formatToPar } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { rebuiltHref } from '../../shell/nav';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { FigureRow } from '../../ui/Ledger';
import { Nine } from '../../ui/Nine';
import { NoData } from '../../ui/NoData';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { EmptyState } from '../../ui/States';
import { firstName } from './model';
import { roundHref } from './player-links';
import { GirViz, PuttsViz, SgViz } from './RoundViz';
import { Card } from '../../ui/Card';

/** `changeTone`'s class as FigureRow's tone: a strokes gained that rounds to zero stays plain. */
const figureTone = (t: string) => (t === 'is-gain' ? 'gain' : t === 'is-loss' ? 'loss' : undefined);

/**
 * The team's latest rounds on the coach's phone, in Player Home's "Your latest round" card (lay-01, owner 15 Nov 2026):
 * paged through the newest rounds the page loaded, each with its player, its scorecard inline, its three figures and the
 * way to the round's recap. The same `latestRounds` read the list drew before.
 */
export function CoachLatest({ data, covered, years }: { data: ChCoachHome['latestRounds']; covered: boolean; years?: Record<string, ChYearKey> }) {
  const [i, setI] = useState(0);
  const rounds = data.error ? [] : data.rounds;
  const r = rounds[Math.min(i, Math.max(0, rounds.length - 1))];
  const go = (d: 1 | -1) => {
    haptic('select');
    setI((x) => (x + d + rounds.length) % rounds.length);
  };
  const recap = r ? roundHref(r.id, 'coach') : null;
  const stats = r ? rebuiltHref(`/golf/dashboard/stats?player=${r.playerId}`) : null;
  return (
    <section className="ch-hm-sec ch-hm-sec--stat" aria-labelledby="ch-ph-tm-latest">
      <div className="ch-hm-sec__h ch-ph-sec__h">
        <h2 id="ch-ph-tm-latest">Latest rounds</h2>
        {rounds.length > 1 && (
          <span className="ch-ph-pg">
            <button data-ctl="CTL-P002-004" type="button" aria-label="Previous round" onClick={() => go(-1)} data-ch-press="">
              <Icon icon={ChevronLeft} size={18} />
            </button>
            <span className="ch-num" aria-live="polite">
              {i + 1} of {rounds.length}
            </span>
            <button data-ctl="CTL-P002-005" type="button" aria-label="Next round" onClick={() => go(1)} data-ch-press="">
              <Icon icon={ChevronRight} size={18} />
            </button>
          </span>
        )}
      </div>
      {data.error ? (
        <RefreshNotice code="CH-2202" title="Recent rounds didn’t load" body="Posted rounds are safe. Try again." covered={covered} />
      ) : !r ? (
        <EmptyState code="CH-2302" shape="rows" shapeCount={2} title="No rounds posted yet this season." body="The newest 18-hole round appears here as soon as a player posts it." />
      ) : (
        <Card kind="list" as="div" className="ch-ph-card">
          <div className="ch-ph-rd">
            <Avatar name={r.playerName} id={r.playerId} size="md" year={years?.[r.playerId] ?? null} />
            <span className="ch-ph-rd__b">
              <b>{r.playerName}</b>
              <span>{r.meta}</span>
            </span>
            <span className={'ch-hm-score ch-num' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')}>
              <b>{r.score}</b>
              <em>{formatToPar(r.toPar)}</em>
            </span>
          </div>
          {r.holes ? (
            <div className="ch-ph-nines ch-scoreboard">
              <Nine label="Out" holes={r.holes.filter((h) => h.n <= 9)} caption="Front nine" />
              <Nine label="In" holes={r.holes.filter((h) => h.n > 9)} caption="Back nine" />
            </div>
          ) : (
            <p className="ch-hm-muted" data-ch-code={data.holesError ? 'CH-2203' : 'CH-2303'}>
              {data.holesError ? 'Hole-by-hole scores didn’t load for this round. The total is right.' : 'Posted as a total. Hole-by-hole scores weren’t recorded for this round.'}
            </p>
          )}
          <FigureRow
            items={[
              { label: 'GIR', value: r.gir ?? <NoData />, note: <GirViz gir={r.gir} /> },
              { label: 'Putts', value: r.putts ?? <NoData />, note: <PuttsViz putts={r.putts} /> },
              { label: 'SG', value: formatSigned(r.sg), tone: figureTone(changeTone(r.sg, false)), note: <SgViz sg={r.sg} /> },
            ]}
          />
          {/* The round's own review; the player's stats where the review isn't rebuilt for coaches. */}
          {(recap || stats) && (
            <Button data-ctl="CTL-P002-006" variant="ghost" rightIcon={ArrowRight} href={(recap ?? stats)!} ahead={!!recap} className="ch-ph-card__more ch-btn--flush-end">
              {recap ? 'Open recap' : `${firstName(r.playerName)}’s stats`}
            </Button>
          )}
        </Card>
      )}
    </section>
  );
}
