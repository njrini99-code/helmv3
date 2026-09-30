'use client';

import { BarChart3, Ellipsis, Flag, Lock, LockOpen, MessageSquare, Pencil, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChQDetail } from '../../data/qualifiers';
import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { Modal } from '../../ui/Modal';
import { PhoneIconAction } from '../../ui/PhoneBar';
import { Nine } from '../../ui/Nine';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { formatFixed, formatToPar } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { rebuiltHref } from '../../shell/nav';
import { PhoneTop } from '../../shell/phone-chrome';
import { dayLabel, plural, positionLabel, shortRange, type ChQRow, type ChQStatus } from './model';
import { StateBadge, StatusPill, ToPar } from './parts';
import { Courses, Selections } from './QualifierSections';

const LIST = '/golf/dashboard/qualifiers';

/**
 * One qualifier on the phone (docs/clubhouse/phone/qualifiers.md, boards 02,
 * 03 and 05): one column, three facts, the leaderboard as stacked cards, and
 * a sheet with a player's rounds. Close and Reopen sit behind Edit (Q-20);
 * round-by-round stays on desktop, since the sheet has each round. The
 * confirmed squad sits above the leaderboard. Same data, writes and catalog
 * as desktop; the close confirm is the desktop's, passed in.
 */
export function QualifierDetailPhone({
  data,
  status,
  onAskClose,
  onReopen,
  reopenPending,
}: {
  data: ChQDetail;
  status: ChQStatus;
  onAskClose: () => void;
  onReopen: () => void;
  reopenPending: boolean;
}) {
  const router = useRouter();
  const coach = data.role === 'coach';
  const [actions, setActions] = useState(false);
  const [peek, setPeek] = useState<string | null>(null);
  const b = data.board;
  const topScore = Math.max(0, data.squad - data.picks);
  const peeked = peek && b ? (b.rows.find((r) => r.playerId === peek) ?? null) : null;

  const facts: Array<[string, string]> = [
    ['Rounds in', b ? `${b.submitted}/${data.entrants * data.numRounds}` : '—'],
    ['Spots', data.picks ? `${topScore}+${data.picks}` : String(data.squad)],
    ['Deadline', data.deadline ? dayLabel(data.deadline) : '—'],
  ];

  return (
    <main className="ch-qfm" aria-label={data.name}>
      <PhoneTop
        title="Qualifier"
        back={{ label: 'Qualifiers', onBack: () => router.push(LIST) }}
        action={coach ? <PhoneIconAction icon={Ellipsis} label="Qualifier actions" onClick={() => setActions(true)} /> : undefined}
      />
      <header className="ch-qfm-head">
        <span className="ch-qfm-head__k">
          <StatusPill status={status} />
          <span className="ch-num">{shortRange(data.startDate, data.endDate)}</span>
        </span>
        <h1>{data.name}</h1>
        <p>{[data.entriesError ? null : plural(data.entrants, 'entrant'), data.course].filter(Boolean).join(' · ')}</p>
      </header>

      {coach && (
        <div className="ch-qfm-acts">
          {data.selectionState !== 'selected' && (
            <Button leftIcon={Users} href={`${LIST}/${data.id}/selection`}>
              Manage selections
            </Button>
          )}
          <Button variant="ghost" leftIcon={Pencil} onClick={() => setActions(true)}>
            Edit
          </Button>
        </div>
      )}

      {status === 'completed' && (
        <div className="ch-qf-note" data-ch-code="CH-09901">
          <Icon icon={Lock} size={16} />
          <p>
            <b>{coach ? 'Closed to new rounds.' : 'This qualifier is closed.'}</b>
            {coach ? 'Players can’t enter or submit rounds in it, including rounds already started, until you reopen it.' : 'These are the final standings.'}
          </p>
        </div>
      )}

      <dl className="ch-qfm-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="ch-num">{v}</dd>
          </div>
        ))}
      </dl>

      {data.selectionState === 'selected' && (
        <SectionBoundary surface="qualifiers.selections" label="Squad" code="CH-09214">
          <Selections data={data} status={status} topScore={topScore} />
        </SectionBoundary>
      )}

      <SectionBoundary surface="qualifiers.leaderboard" label="The leaderboard" code="CH-09212">
        <Board data={data} status={status} onPeek={setPeek} />
      </SectionBoundary>

      <SectionBoundary surface="qualifiers.courses" label="Course per round" code="CH-09215">
        <Courses data={data} />
      </SectionBoundary>

      {data.rules && (
        <section className="ch-qf-side" aria-labelledby="ch-qfm-rules">
          <div className="ch-qf-panel__head">
            <div>
              <h2 id="ch-qfm-rules">Scoring rules</h2>
            </div>
          </div>
          <p className="ch-qf-why">{data.rules}</p>
        </section>
      )}

      <Modal
        open={actions}
        onClose={() => setActions(false)}
        title={data.name}
        description={status === 'completed' ? 'Closed to new rounds' : status === 'in_progress' ? 'Players are entering rounds' : 'Not started yet'}
      >
        <div className="ch-qfm-sheet">
          <Button leftIcon={Pencil} href={`${LIST}/${data.id}/edit`}>
            Edit details
          </Button>
          {status === 'in_progress' && (
            <Button
              leftIcon={Lock}
              feel="warning"
              onClick={() => {
                setActions(false);
                onAskClose();
              }}
            >
              Close qualifier
            </Button>
          )}
          {status === 'completed' && (
            <Button
              leftIcon={LockOpen}
              disabled={reopenPending}
              onClick={() => {
                setActions(false);
                onReopen();
              }}
            >
              Reopen qualifier
            </Button>
          )}
        </div>
      </Modal>

      <PlayerRounds data={data} row={peeked} onClose={() => setPeek(null)} />
    </main>
  );
}

/** The leaderboard as cards (board 02): position, avatar, name and state, to par; rounds, average and total under it. */
function Board({ data, status, onPeek }: { data: ChQDetail; status: ChQStatus; onPeek: (id: string) => void }) {
  const router = useRouter();
  const coach = data.role === 'coach';
  const b = data.board;
  const [announce, setAnnounce] = useState('');
  const first = useRef(true);
  const submitted = b?.submitted;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (submitted != null) setAnnounce(`Standings updated. ${plural(submitted, 'round')} submitted.`);
  }, [submitted]);

  const head = (
    <div className="ch-qf-panel__head">
      <div>
        <h2 id="ch-qfm-lb">Leaderboard</h2>
      </div>
      {status === 'in_progress' && b && (
        <Badge tone="accent" dot>
          Live
        </Badge>
      )}
    </div>
  );
  if (data.entriesError || data.roundsError || !b) {
    return (
      <section className="ch-qf-panel" aria-labelledby="ch-qfm-lb">
        {head}
        {data.entriesError ? (
          <InlineNotice code="CH-09203" title="The field didn’t load." body="Standings wait until the entrants load, so nobody reads a wrong order." onRetry={() => router.refresh()} />
        ) : (
          <InlineNotice code="CH-09204" title="Scores didn’t load." body="The field isn’t shown without its scores, so nobody reads a wrong order. The error has been reported." onRetry={() => router.refresh()} />
        )}
      </section>
    );
  }
  if (!b.rows.length) {
    return (
      <section className="ch-qf-panel" aria-labelledby="ch-qfm-lb">
        {head}
        <EmptyState code="CH-09304" icon={Flag} title="Awaiting first round." body={`${plural(data.entrants, 'player')} entered. Standings appear once a player submits a round.`} />
      </section>
    );
  }
  const canOpen = (r: ChQRow) => coach || r.playerId === data.viewerPlayerId;
  return (
    <section className="ch-qf-panel" aria-labelledby="ch-qfm-lb">
      {head}
      <p className="ch-sr-only" aria-live="polite" data-ch-code="CH-09803">
        {announce}
      </p>
      <ol className="ch-qfm-lb">
        {b.rows.map((r, i) => {
          const me = r.playerId === data.viewerPlayerId;
          const body = (
            <>
              <span className="ch-qfm-lb__top">
                <span className="ch-qf-pos">{positionLabel(r)}</span>
                <Avatar name={r.name} size={32} />
                <span className="ch-qfm-lb__n">
                  <b>
                    {r.name}
                    {me && <span className="ch-qf-you">You</span>}
                  </b>
                  <StateBadge state={r.state} />
                </span>
                <ToPar value={r.toPar} big />
              </span>
              <span className="ch-qfm-lb__g ch-well-soft ch-num">
                <span>
                  <em>Rounds</em>
                  <b>
                    {r.played}/{data.numRounds}
                  </b>
                </span>
                <span>
                  <em>Avg</em>
                  <b>{r.avg != null ? formatFixed(r.avg) : '—'}</b>
                </span>
                <span>
                  <em>Total</em>
                  <b>{r.total ?? '—'}</b>
                </span>
              </span>
            </>
          );
          return (
            <li key={r.playerId}>
              {i === b.topScore && b.topScore > 0 && <div className="ch-qf-line ch-qfm-line"><span>Top-score line · {b.topScore} qualify on score</span></div>}
              {i === b.squad && b.squad !== b.topScore && <div className="ch-qf-line ch-qf-line--muted ch-qfm-line"><span>Travel cut · top {b.squad}</span></div>}
              {canOpen(r) ? (
                <button
                  type="button"
                  className={'ch-qfm-lb__row' + (me ? ' is-me' : '')}
                  aria-label={`${r.name}, ${positionLabel(r)}, ${formatToPar(r.toPar)}. Show ${me ? 'your' : 'their'} rounds`}
                  onClick={() => {
                    haptic('select');
                    chTrail('qualifiers open rounds sheet');
                    onPeek(r.playerId);
                  }}
                >
                  {body}
                </button>
              ) : (
                <div className={'ch-qfm-lb__row is-static' + (me ? ' is-me' : '')}>{body}</div>
              )}
            </li>
          );
        })}
        {b.unscored.map((r) => (
          <li key={r.playerId}>
            <div className={'ch-qfm-lb__row is-static is-none' + (r.playerId === data.viewerPlayerId ? ' is-me' : '')}>
              <span className="ch-qfm-lb__top">
                <span className="ch-qf-pos">—</span>
                <Avatar name={r.name} size={32} />
                <span className="ch-qfm-lb__n">
                  <b>{r.name}</b>
                  <small>No rounds submitted</small>
                </span>
                <span className="ch-qf-dash">—</span>
              </span>
            </div>
          </li>
        ))}
      </ol>
      <p className="ch-qf-cap">
        Ranked by total to par. Top {b.topScore} qualify on score{data.picks ? `; ${plural(data.picks, 'coach’s pick', 'coach’s picks')}` : ''}.
      </p>
    </section>
  );
}

/** A player's rounds (board 03): a chip per round, then that round's card, Out and In. */
function PlayerRounds({ data, row, onClose }: { data: ChQDetail; row: ChQRow | null; onClose: () => void }) {
  const router = useRouter();
  const coach = data.role === 'coach';
  const played = row?.rounds ?? [];
  const latest = played.length ? played[played.length - 1]!.number : 1;
  const [n, setN] = useState(latest);
  useEffect(() => setN(latest), [row?.playerId, latest]);
  const rd = played.find((x) => x.number === n) ?? null;
  const holes = rd && !data.holesError ? (data.holes[rd.id] ?? []) : null;
  const course = data.roundCourses.find((c) => c.number === n)?.course ?? rd?.course ?? null;
  const messageHref = row && coach ? rebuiltHref(`/golf/dashboard/messages?player=${row.playerId}`, 'coach') : null;
  const statsHref = row ? rebuiltHref(coach ? `/golf/dashboard/stats?player=${row.playerId}` : '/golf/dashboard/stats', data.role) : null;

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      title={row?.name ?? ''}
      description={row ? `${positionLabel(row)} · ${formatToPar(row.toPar)} · ${row.played} of ${plural(data.numRounds, 'round')}` : undefined}
      footer={
        (messageHref || statsHref) && (
          <>
            {messageHref && (
              <Button leftIcon={MessageSquare} href={messageHref}>
                Message
              </Button>
            )}
            {statsHref && (
              <Button leftIcon={BarChart3} href={statsHref}>
                Stats
              </Button>
            )}
          </>
        )
      }
    >
      {row && (
        <div className="ch-qfm-rounds">
          <div className="ch-qfm-chips ch-well" role="group" aria-label="Rounds">
            {Array.from({ length: data.numRounds }, (_, i) => {
              const r = played.find((x) => x.number === i + 1);
              return (
                <button
                  key={i}
                  type="button"
                  className="ch-qfm-chip ch-num"
                  aria-pressed={n === i + 1}
                  disabled={!r}
                  onClick={() => {
                    if (n !== i + 1) haptic('select');
                    setN(i + 1);
                  }}
                >
                  R{i + 1}
                  {r ? ` · ${formatToPar(r.toPar)}` : ''}
                </button>
              );
            })}
          </div>
          {!rd ? (
            <p className="ch-qfm-muted">Round {n} not submitted yet.</p>
          ) : (
            <>
              <div className="ch-qfm-rdh ch-num">
                <span>{[course, dayLabel(rd.date)].filter(Boolean).join(' · ')}</span>
                <b>{rd.total ?? '—'}</b>
              </div>
              {data.holesError ? (
                <InlineNotice code="CH-09205" title="Scorecards didn’t load." body="The totals are right; the hole-by-hole card is missing until it loads." onRetry={() => router.refresh()} />
              ) : holes && holes.length ? (
                <>
                  <Nine holes={holes.filter((h) => h.n <= 9)} label="Out" caption={`Round ${n}, front nine`} />
                  <Nine holes={holes.filter((h) => h.n > 9)} label="In" caption={`Round ${n}, back nine`} />
                </>
              ) : (
                <p className="ch-qfm-muted" data-ch-code="CH-09308">
                  No hole-by-hole card for this round. Only the total was recorded.
                </p>
              )}
              {row.avg != null && (
                <p className="ch-qfm-muted ch-num">
                  Average {formatFixed(row.avg)} over {plural(row.played - row.shortRounds, '18-hole round')}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
