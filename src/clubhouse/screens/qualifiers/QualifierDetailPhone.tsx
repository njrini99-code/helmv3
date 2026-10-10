'use client';

import { BarChart3, Ellipsis, Flag, Lock, LockOpen, MessageSquare, Pencil, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, ViewTransition, type MouseEvent, type ReactNode } from 'react';
import type { ChQDetailCore, ChQDetailSecondary } from '../../data/qualifiers';
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
import { useRefresh } from '../../lib/use-refresh';
import { chTrail } from '../../lib/track';
import { rebuiltHref } from '../../shell/nav';
import { PhoneTop } from '../../shell/phone-chrome';
import { bubbleNote, dayLabel, plural, positionLabel, sampleNote, shortRange, type ChQRound, type ChQRow, type ChQStatus } from './model';
import { Pos, qualifierPeek, StateBadge, StatusPill, ToParPlate } from './parts';
import { PlayerPeek } from '../../ui/PlayerPeek';
import type { LiveFeedView } from './live';
import { useRankSlide } from './rank-slide';
import { Courses, LiveChip, Selections, StaleStandings } from './QualifierSections';
import { NinesSkeleton, Streamed } from './streamed';
import { SerifText } from '../../ui/SerifText';

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
  stale,
  onBack,
  onSelectionClick,
  status,
  feed,
  onAskClose,
  onReopen,
  reopenPending,
}: {
  data: ChQDetailCore;
  /** The standings are the last good ones, because the latest read of them failed. */
  stale: boolean;
  /** The top bar's Back: a step back to the list when the list is the entry before this one, the list's address otherwise. */
  onBack: () => void;
  /** A click inside the actions: Manage selections leaves the note its Back steps back by (return-state.ts). */
  onSelectionClick: (e: MouseEvent<HTMLElement>) => void;
  status: ChQStatus;
  /** The board's Live chip (P009-B2, D3): the desktop's feed, passed in. */
  feed: LiveFeedView;
  onAskClose: () => void;
  /** Runs the reopen and answers once the server has: the sheet that asked stays up until then. */
  onReopen: () => Promise<{ success: boolean }>;
  reopenPending: boolean;
}) {
  const coach = data.role === 'coach';
  const [actions, setActions] = useState(false);
  const [peek, setPeek] = useState<string | null>(null);
  const b = data.board;
  const topScore = Math.max(0, data.squad - data.picks);
  const peeked = peek && b ? (b.rows.find((r) => r.playerId === peek) ?? null) : null;

  // Each figure drawn (owner, 2026-10-07: no bare numbers; decorative, the figure says it): the rounds posted along the
  // rounds due, and the squad's seats, the ones won on score filled and the coach's picks open.
  const due = data.entrants * data.numRounds;
  const facts: Array<[string, string, ReactNode?]> = [
    [
      'Rounds in',
      b ? `${b.submitted}/${due}` : '—',
      b && due > 0 ? (
        <span className="ch-qf-bar">
          <i style={{ width: `${Math.min(100, (b.submitted / due) * 100)}%` }} />
        </span>
      ) : null,
    ],
    [
      'Spots',
      data.picks ? `${topScore}+${data.picks}` : String(data.squad),
      data.squad > 0 && data.squad <= 12 ? (
        <span className="ch-qf-seats">
          {Array.from({ length: data.squad }, (_, i) => (
            <i key={i} className={i < topScore || !data.picks ? 'is-score' : 'is-pick'} />
          ))}
        </span>
      ) : null,
    ],
    ['Deadline', data.deadline ? dayLabel(data.deadline) : '—'],
  ];

  return (
    <main className="ch-qfm" aria-label={data.name}>
      <PhoneTop
        heading={false}
        title="Qualifier"
        back={{
          label: 'Qualifiers',
          onBack,
        }}
        action={coach ? <PhoneIconAction icon={Ellipsis} label="Qualifier actions" onClick={() => setActions(true)} /> : undefined}
      />
      <header className="ch-qfm-head">
        <span className="ch-qfm-head__k">
          <StatusPill status={status} ended={feed.ended} />
          <span className="ch-num">{shortRange(data.startDate, data.endDate)}</span>
        </span>
        <h1>
          <SerifText text={data.name} />
        </h1>
        <p>{[data.entriesError ? null : plural(data.entrants, 'entrant'), data.course].filter(Boolean).join(' · ')}</p>
      </header>

      {coach && (
        <div className="ch-qfm-acts" onClickCapture={onSelectionClick}>
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
        {facts.map(([k, v, viz]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="ch-num">{v}</dd>
            <dd className="ch-qfm-facts__viz" aria-hidden="true">
              {viz}
            </dd>
          </div>
        ))}
      </dl>

      {data.selectionState === 'selected' && (
        <SectionBoundary surface="qualifiers.selections" label="Squad" code="CH-09214">
          <Selections data={data} status={status} topScore={topScore} />
        </SectionBoundary>
      )}

      <SectionBoundary surface="qualifiers.leaderboard" label="The leaderboard" code="CH-09212">
        <Board data={data} status={status} stale={stale} feed={feed} onPeek={setPeek} sheetOpen={!!peeked || actions} />
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
                // The sheet stays up while the server answers, so the wait is shown on the button that asked; a refusal leaves it
                // there to try again, and a landed reopen closes it (the sheet then offers Close, not Reopen).
                void onReopen().then((res) => {
                  if (res.success) setActions(false);
                });
              }}
            >
              {reopenPending ? <span data-ch-code="CH-09406">Reopening</span> : 'Reopen qualifier'}
            </Button>
          )}
        </div>
      </Modal>

      <PlayerRounds data={data} row={peeked} onClose={() => setPeek(null)} />
    </main>
  );
}

/**
 * The leaderboard (board 02, as changed by P009-A1, owner 2026-10-08): one 56pt row a player, Pos, Player, the to-par
 * plate and Thru, under a column header drawn once. The state badge or the sample-size note (C2) is the name's second
 * line; the average is in the player's sheet. Each row is a button whose label reads the row, so the header is drawn
 * for the eye only.
 */
function Board({
  data,
  status,
  stale,
  feed,
  onPeek,
  sheetOpen,
}: {
  data: ChQDetailCore;
  status: ChQStatus;
  stale: boolean;
  feed: LiveFeedView;
  onPeek: (id: string) => void;
  sheetOpen: boolean;
}) {
  const { refresh, refreshing } = useRefresh();
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
  const order = useMemo(() => (b?.rows ?? []).map((r) => r.playerId), [b]);
  // P009-B1: rows slide to new ranks only when a refresh changed them, and never under an open sheet.
  const slide = useRankSlide(order, sheetOpen);

  const head = (
    <div className="ch-qf-panel__head">
      <div>
        <h2 id="ch-qfm-lb">Leaderboard</h2>
      </div>
      {status === 'in_progress' && b && <LiveChip view={feed} />}
    </div>
  );
  if (data.entriesError || data.roundsError || !b) {
    return (
      <section className="ch-qf-panel" aria-labelledby="ch-qfm-lb">
        {head}
        {data.entriesError ? (
          <InlineNotice code="CH-09203" title="The field didn’t load" body="Standings wait until the entrants load, so nobody reads a wrong order." onRetry={refresh} retrying={refreshing} />
        ) : (
          <InlineNotice code="CH-09204" title="Scores didn’t load" body="The field isn’t shown without its scores, so nobody reads a wrong order. The error has been reported." onRetry={refresh} retrying={refreshing} />
        )}
      </section>
    );
  }
  if (!b.rows.length) {
    return (
      <section className="ch-qf-panel" aria-labelledby="ch-qfm-lb">
        {head}
        {stale && <StaleStandings />}
        <EmptyState code="CH-09304" icon={Flag} title="Awaiting first round" body={`${plural(data.entrants, 'player')} entered. Standings appear once a player submits a round.`} />
      </section>
    );
  }
  const canOpen = (r: ChQRow) => coach || r.playerId === data.viewerPlayerId;
  return (
    <section className="ch-qf-panel" aria-labelledby="ch-qfm-lb">
      {head}
      {stale && <StaleStandings />}
      <p className="ch-sr-only" aria-live="polite" data-ch-code="CH-09803">
        {announce}
      </p>
      <div className="ch-qfm-lbhead" aria-hidden="true">
        <span>Pos</span>
        <span>Player</span>
        <span>To par</span>
        <span>Thru</span>
      </div>
      <ol className="ch-qfm-lb">
        {b.rows.map((r, i) => {
          const me = r.playerId === data.viewerPlayerId;
          const note = sampleNote(r, b, data.numRounds);
          const body = (
            <>
              <Pos position={r.position} tied={r.tied} move={r.move} />
              <span className="ch-qfm-lb__n">
                <b>
                  {r.name}
                  {me && <span className="ch-qf-you">You</span>}
                </b>
                {(r.state || note) && (
                  <span className="ch-qfm-lb__sub">
                    <StateBadge state={r.state} />
                    {note && <span className="ch-qf-thin">{note}</span>}
                  </span>
                )}
              </span>
              <ToParPlate value={r.toPar} />
              <span className="ch-qfm-lb__thru ch-num">
                {r.played}/{data.numRounds}
              </span>
            </>
          );
          const label = `${r.name}, ${positionLabel(r)}, ${formatToPar(r.toPar)}, ${r.played} of ${plural(data.numRounds, 'round')}`;
          const slideRow = (
            <ViewTransition name={`ch-rank-${r.playerId}`} update={slide ? 'ch-rank' : 'none'} enter="none" exit="none" share="none" default="none">
              {canOpen(r) ? (
                <button
                  type="button"
                  className={'ch-qfm-lb__row' + (me ? ' is-me' : '')}
                  aria-label={`${label}. Show ${me ? 'your' : 'their'} rounds`}
                  onClick={() => {
                    haptic('select');
                    chTrail('qualifiers open rounds sheet');
                    onPeek(r.playerId);
                  }}
                >
                  {body}
                </button>
              ) : (
                <div className={'ch-qfm-lb__row is-static' + (me ? ' is-me' : '')} role="group" aria-label={label}>
                  {body}
                </div>
              )}
            </ViewTransition>
          );
          return (
            <li key={r.playerId}>
              {i === b.topScore && b.topScore > 0 && <div className="ch-qf-line ch-qfm-line"><span>Top-score line · {b.topScore} qualify on score</span></div>}
              {i === b.squad && b.squad !== b.topScore && <div className="ch-qf-line ch-qf-line--muted ch-qfm-line"><span>Travel cut · top {b.squad}</span></div>}
              {/* P003-C1: a coach's hold peeks at the player; a tap still opens their rounds. Outside the transition,
                  so the slide still names the row itself. */}
              {coach ? <PlayerPeek player={qualifierPeek(r, data.numRounds)}>{slideRow}</PlayerPeek> : slideRow}
            </li>
          );
        })}
        {b.unscored.map((r) => (
          <li key={r.playerId}>
            <div className={'ch-qfm-lb__row is-static is-none' + (r.playerId === data.viewerPlayerId ? ' is-me' : '')}>
              <Pos position={null} tied={false} move={null} />
              <span className="ch-qfm-lb__n">
                <b>{r.name}</b>
                <span className="ch-qfm-lb__sub">No rounds submitted</span>
              </span>
              <span className="ch-qf-dash">—</span>
              <span className="ch-qfm-lb__thru ch-num">0/{data.numRounds}</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="ch-qf-cap">
        Ranked by total to par. Top {b.topScore} qualify on score{data.picks ? `; ${plural(data.picks, 'coach’s pick', 'coach’s picks')}` : ''}.{bubbleNote(data.numRounds, status)}
      </p>
    </section>
  );
}

/** A player's rounds (board 03): a chip per round, then that round's card, Out and In. */
function PlayerRounds({ data, row, onClose }: { data: ChQDetailCore; row: ChQRow | null; onClose: () => void }) {
  const coach = data.role === 'coach';
  const played = row?.rounds ?? [];
  const latest = played.length ? played[played.length - 1]!.number : 1;
  const [n, setN] = useState(latest);
  useEffect(() => setN(latest), [row?.playerId, latest]);
  const rd = played.find((x) => x.number === n) ?? null;
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
              {/* The card and the course name stream in behind the standings: the round's head and total are the standings', so they stay. */}
              <Streamed
                fallback={
                  <PlayerRoundHead round={rd} course={rd.course}>
                    <NinesSkeleton />
                  </PlayerRoundHead>
                }
              >
                {(s) => <PlayerRoundCard round={rd} n={n} s={s} />}
              </Streamed>
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

/** A round in the sheet: its head (course and day, total) over `children`. */
function PlayerRoundHead({ round, course, children }: { round: ChQRound; course: string | null; children: ReactNode }) {
  return (
    <>
      <div className="ch-qfm-rdh ch-num">
        <span>{[course, dayLabel(round.date)].filter(Boolean).join(' · ')}</span>
        <b>{round.total ?? '—'}</b>
      </div>
      {children}
    </>
  );
}

/** The streamed part of a round in the sheet: the course assigned to the round, and its card. */
function PlayerRoundCard({ round, n, s }: { round: ChQRound; n: number; s: ChQDetailSecondary }) {
  const { refresh, refreshing } = useRefresh();
  const course = s.roundCourses.find((c) => c.number === n)?.course ?? round.course ?? null;
  const holes = s.holesError ? null : (s.holes[round.id] ?? []);
  return (
    <PlayerRoundHead round={round} course={course}>
      {s.holesError ? (
        <InlineNotice code="CH-09205" title="Scorecards didn’t load" body="The totals are right; the hole-by-hole card is missing until it loads." onRetry={refresh} retrying={refreshing} />
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
    </PlayerRoundHead>
  );
}
