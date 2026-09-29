import Link from 'next/link';
import { Users } from 'lucide-react';
import type { ChCoachHome, ChLeaderRow } from '../../data/home';
import { Avatar } from '../../ui/Avatar';
import { EmptyState } from '../../ui/States';
import { formatFixed, formatSigned, formatToPar } from '../../lib/format';
import { rebuiltHref } from '../../shell/nav';
import { FormLine } from './FormLine';
import { RefreshNotice } from './RefreshNotice';

const STATUS: Record<ChLeaderRow['status'], string> = {
  improving: 'Improving',
  steady: 'Steady',
  slipping: 'Slipping',
  early: 'Early read',
};

function Row({ p, pos }: { p: ChLeaderRow; pos: number }) {
  const href = rebuiltHref(`/golf/dashboard/stats?player=${p.playerId}`);
  const cells = (
    <>
      <span className="ch-h-lb__pos ch-num">{pos}</span>
      <span className="ch-h-lb__who">
        <Avatar name={p.name} size={28} />
        <span>
          <span className="ch-h-lb__name">{p.name}</span>
          <span className="ch-h-lb__meta">{[p.classYear, STATUS[p.status]].filter(Boolean).join(' · ')}</span>
        </span>
      </span>
      <span className="ch-h-lb__trend">
        <FormLine data={p.trend} label={`${p.name}, last ${p.trend.length} rounds: ${p.trend.join(', ')}`} />
      </span>
      <span className="r ch-num ch-h-lb__num">{formatFixed(p.avg)}</span>
      <span className={'r ch-num ch-h-lb__num' + (p.toPar != null && p.toPar < 0 ? ' is-under' : '')}>{formatToPar(p.toPar, 1)}</span>
      <span
        className={
          'r ch-num ch-h-lb__sg' + (p.sgPerRound == null ? ' is-early' : p.sgPerRound >= 0 ? ' is-gain' : ' is-loss')
        }
        title={p.sgPerRound == null ? 'Strokes gained appears after three rounds' : undefined}
      >
        {p.sgPerRound == null ? 'Early read' : formatSigned(p.sgPerRound)}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className="ch-h-lb__row is-link" role="row">
      {cells}
    </Link>
  ) : (
    <div className="ch-h-lb__row" role="row">
      {cells}
    </div>
  );
}

export function Leaderboard({ data }: { data: ChCoachHome['leaderboard'] }) {
  const rosterHref = rebuiltHref('/golf/dashboard/roster');
  return (
    <section aria-labelledby="ch-lb-title">
      <div className="ch-h-sec">
        <div>
          <h2 id="ch-lb-title">Leaderboard</h2>
          {!data.error && data.scorecards > 0 && (
            <span>
              Season scoring average &middot; 18-hole rounds &middot; <span className="ch-num">{data.scorecards}</span>{' '}
              {data.scorecards === 1 ? 'scorecard' : 'scorecards'}
            </span>
          )}
        </div>
        {rosterHref && (
          <Link href={rosterHref} className="ch-btn ch-btn--ghost ch-btn--sm">
            Full roster
          </Link>
        )}
      </div>

      {data.error ? (
        <RefreshNotice
          title="The leaderboard didn't load."
          body="Scores are safe. Try again, and if it keeps happening the error has already been reported."
        />
      ) : data.rosterSize === 0 ? (
        <div className="ch-h-lb ch-sheet">
          <EmptyState
            icon={Users}
            title="No players on the roster yet."
            body="Share your team's join code from Roster, and players appear here once you approve them."
          />
        </div>
      ) : data.rows.length === 0 ? (
        <div className="ch-h-lb ch-sheet">
          <EmptyState
            icon={Users}
            title="No 18-hole rounds this season yet."
            body={`${data.rosterSize} ${data.rosterSize === 1 ? 'player is' : 'players are'} on the roster. The leaderboard fills in as rounds are posted.`}
          />
        </div>
      ) : (
        <div className="ch-h-lb ch-sheet" role="table" aria-labelledby="ch-lb-title">
          <div className="ch-h-lb__row ch-h-lb__head ch-well-soft" role="row">
            <span role="columnheader">
              <span className="ch-sr-only">Position</span>
            </span>
            <span role="columnheader">Player</span>
            <span role="columnheader">Last 7 rounds</span>
            <span role="columnheader" className="r">Avg</span>
            <span role="columnheader" className="r">To par</span>
            <span role="columnheader" className="r">SG / rd</span>
          </div>
          {data.rows.map((p, i) => (
            <Row key={p.playerId} p={p} pos={i + 1} />
          ))}
        </div>
      )}
    </section>
  );
}
