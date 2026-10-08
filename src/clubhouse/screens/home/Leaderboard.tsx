import Link from 'next/link';
import { ArrowRight, Users } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import { QUIET_DAYS } from './model';
import type { ChCoachHome, ChLatestRound, ChLeaderRow } from '../../data/home';
import { Avatar } from '../../ui/Avatar';
import { EmptyState } from '../../ui/States';
import { changeTone, formatFixed, formatSigned, formatToPar } from '../../lib/format';
import { rebuiltHref } from '../../shell/nav';
import { LinkPending } from '../../shell/LinkPending';
import { FormLine } from '../../ui/FormLine';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { PlayerPeek, type ChPlayerPeek } from '../../ui/PlayerPeek';

const STATUS: Record<ChLeaderRow['status'], string> = {
  improving: 'Improving',
  steady: 'Steady',
  slipping: 'Slipping',
  early: 'Early read',
};

/** "No rounds 9 days" outranks the form word when a player has gone quiet. */
function statusText(p: ChLeaderRow): string {
  if (p.quietDays != null && p.quietDays >= QUIET_DAYS) return `No rounds ${p.quietDays} days`;
  return STATUS[p.status];
}

/** The player peek (P003-C1) from what Home already holds: the row, and the player's newest round if it is in the latest few. */
export function leaderPeek(p: ChLeaderRow, rounds: ChLatestRound[] = []): ChPlayerPeek {
  const last = rounds.find((r) => r.playerId === p.playerId);
  const quiet = p.quietDays != null && p.quietDays >= QUIET_DAYS;
  return {
    id: p.playerId,
    name: p.name,
    sub: p.classYear,
    lastRound: last ? { score: last.score, toPar: last.toPar, label: last.meta.split(' \u00b7 ').slice(0, 2).join(' \u00b7 ') } : null,
    avg: p.avg,
    trend: p.trend,
    reason: quiet ? `No round in ${p.quietDays} days` : p.status === 'slipping' ? 'Scoring is creeping up' : null,
  };
}

/**
 * Each row's place (P002 D4). Players on the same season average, as shown to a tenth, share a place with a T ("T2"),
 * and the next place counts them all (1, T2, T2, 4). An early read (under three 18-hole rounds; the loader sorts them
 * last) has no place yet: "—".
 */
export function leaderPlaces(rows: Pick<ChLeaderRow, 'avg' | 'status'>[]): Array<{ label: string; place: number | null }> {
  const key = (r: Pick<ChLeaderRow, 'avg'>) => Math.round(r.avg * 10);
  return rows.map((r, i) => {
    if (r.status === 'early') return { label: '—', place: null };
    const first = rows.findIndex((o) => o.status !== 'early' && key(o) === key(r));
    const tied = rows.some((o, j) => j !== i && o.status !== 'early' && key(o) === key(r));
    return { label: `${tied ? 'T' : ''}${first + 1}`, place: first + 1 };
  });
}

function Row({ p, pos, rounds }: { p: ChLeaderRow; pos: { label: string; place: number | null }; rounds?: ChLatestRound[] }) {
  const href = rebuiltHref(`/golf/dashboard/stats?player=${p.playerId}`);
  const top = pos.place != null && pos.place <= 3;
  // P002 D3: the row is a table row (a div); the link is the player's name, stretched over the row by its ::after.
  const name = href ? (
    <Link href={href} className="ch-h-lb__go">
      <span className="ch-h-lb__name">{p.name}</span>
      <LinkPending />
    </Link>
  ) : (
    <span className="ch-h-lb__name">{p.name}</span>
  );
  const cells = (
    <>
      <span className={'ch-h-lb__pos ch-num' + (top ? ' is-top' : '') + (pos.place === 1 ? ' is-lead' : '') + (pos.label.startsWith('T') ? ' is-tie' : '')} role="cell">
        {pos.label}
      </span>
      <span className="ch-h-lb__who" role="cell">
        <Avatar name={p.name} size={28} />
        <span>
          {name}
          <span className="ch-h-lb__meta">
            {p.classYear && <>{p.classYear} &middot; </>}
            <span className={'ch-h-lb__status is-' + (p.quietDays != null && p.quietDays >= QUIET_DAYS ? 'quiet' : p.status)}>{statusText(p)}</span>
          </span>
        </span>
      </span>
      <span className="ch-h-lb__trend" role="cell">
        <FormLine data={p.trend} label={`${p.name}, last ${p.trend.length} rounds: ${p.trend.join(', ')}`} />
      </span>
      <span className="r ch-num ch-h-lb__num" role="cell">{formatFixed(p.avg)}</span>
      <span className={'r ch-num ch-h-lb__num' + (p.toPar != null && p.toPar < 0 ? ' is-under' : '')} role="cell">
        {formatToPar(p.toPar, 1)}
      </span>
      <span
        role="cell"
        data-ch-code={p.sgPerRound == null ? 'CH-2306' : undefined}
        className={
          'r ch-num ch-h-lb__sg' + (p.sgPerRound == null ? ' is-early' : ' ' + changeTone(p.sgPerRound, false)).trimEnd()
        }
        title={p.sgPerRound == null ? 'Strokes gained appears after three rounds' : undefined}
      >
        {p.sgPerRound == null ? 'Early read' : formatSigned(p.sgPerRound)}
      </span>
    </>
  );
  // CH-2602: on desktop the row takes the Ledger tint on hover (quick) as its chevron slides in (base), and a press
  // deepens the tint (press). It never lifts or scales.
  return (
    <PlayerPeek player={leaderPeek(p, rounds)}>
      <div className={'ch-h-lb__row' + (href ? ' is-link' : '')} role="row">
        {cells}
      </div>
    </PlayerPeek>
  );
}

/** `covered`: the page's notice (CH-1209) carries the one Try again, so a failed read keeps only its notice's title. */
export function Leaderboard({ data, covered = false, rounds }: { data: ChCoachHome['leaderboard']; covered?: boolean; /** The latest rounds, for each player's peek. */ rounds?: ChLatestRound[] }) {
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
            <span>Full roster</span>
            <Icon icon={ArrowRight} size={14} />
          </Link>
        )}
      </div>

      {data.error ? (
        <RefreshNotice
          code="CH-2204"
          title="The leaderboard didn’t load"
          body="Scores are safe. Try again, and if it keeps happening the error has already been reported."
          covered={covered}
        />
      ) : data.rosterSize === 0 ? (
        <div className="ch-h-lb ch-sheet">
          <EmptyState
            code="CH-2304"
            icon={Users}
            title="No players on the roster yet."
            body="Share your team’s join code from Roster, and players appear here once you approve them."
          />
        </div>
      ) : data.rows.length === 0 ? (
        <div className="ch-h-lb ch-sheet">
          <EmptyState
            code="CH-2305"
            icon={Users}
            title="No 18-hole rounds this season yet."
            body={`${data.rosterSize} ${data.rosterSize === 1 ? 'player is' : 'players are'} on the roster. The leaderboard fills in as rounds are posted.`}
          />
        </div>
      ) : (
        <div className="ch-h-lb ch-sheet" role="table" aria-labelledby="ch-lb-title">
          <div className="ch-h-lb__row ch-h-lb__head" role="row">
            <span role="columnheader">
              <span className="ch-sr-only">Position</span>
            </span>
            <span role="columnheader">Player</span>
            <span role="columnheader">Last 7 rounds</span>
            <span role="columnheader" className="r">Avg</span>
            <span role="columnheader" className="r">To par</span>
            <span role="columnheader" className="r">SG / rd</span>
          </div>
          {(() => {
            const places = leaderPlaces(data.rows);
            return data.rows.map((p, i) => <Row key={p.playerId} p={p} pos={places[i]!} rounds={rounds} />);
          })()}
        </div>
      )}
    </section>
  );
}
