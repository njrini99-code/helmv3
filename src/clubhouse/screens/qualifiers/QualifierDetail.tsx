'use client';

import { ChevronDown, ChevronLeft, ChevronUp, Lock, LockOpen, Flag, Pencil, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ChQDetailCore, ChQDetailSecondary } from '../../data/qualifiers';
import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { Modal } from '../../ui/Modal';
import { ScoreMark } from '../../ui/ScoreMark';
import { ScrollRegion } from '../../ui/ScrollRegion';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { normalise, useAction } from '../../lib/use-action';
import { haptic } from '../../lib/haptics';
import { useLastGood } from '../../lib/use-last-good';
import { useRefresh } from '../../lib/use-refresh';
import { chTrail } from '../../lib/track';
import { formatFixed } from '../../lib/format';
import { dayLabel, plural, positionLabel, shortRange, yearOf, type ChQBoard, type ChQHole, type ChQRound, type ChQRow, type ChQStatus } from './model';
import { StateBadge, StatusPill, ToPar } from './parts';
import { useLiveStandings } from './live';
import { Courses, Selections, StaleStandings } from './QualifierSections';
import { QualifierDetailPhone } from './QualifierDetailPhone';
import { useBackToList } from './list-state';
import { CardBodySkeleton, ParLineSkeleton, SecondaryProvider, Streamed, fulfilled, secondaryOf, settled, type ChQDetailView } from './streamed';
import { useChPhone } from '../../lib/use-phone';
import { LIVE_WRITES, type ChQWrites } from './writes';
import '../../styles/qualifiers.css';

const LIST = '/golf/dashboard/qualifiers';

/**
 * One qualifier. Coaches run it: edit, close and reopen, every scorecard and
 * the round-by-round table. Players read it: their row is marked, only their
 * own scorecards open, and they see the squad once it is confirmed (D-30).
 */
export function QualifierDetail({
  data: fresh,
  secondary,
  writes = LIVE_WRITES,
  live = true,
}: {
  data: ChQDetailView;
  /** The courses and the scorecards, streaming in behind the standings. A fixture or a test may give them inside `data` instead. */
  secondary?: PromiseLike<ChQDetailSecondary>;
  writes?: ChQWrites;
  live?: boolean;
}) {
  const router = useRouter();
  // Back goes to the list as it was left (its filter and search), and the list restores its scroll for the return.
  const back = useBackToList();
  // A live refresh whose rounds or entries read fails would replace good standings with an error: draw the last good ones of this
  // qualifier instead, with the courses and cards that came with them, and say they may be out of date (owner rule 2). A first load
  // that fails is still the error.
  const whole = useMemo(() => ({ data: fresh, source: settled(secondary ?? fulfilled(secondaryOf(fresh))) }), [fresh, secondary]);
  const { value: shown, stale } = useLastGood(fresh.id, whole, (w) => w.data.board !== null);
  const data = shown.data;
  const coach = data.role === 'coach';
  const [status, setStatus] = useState<ChQStatus>(data.status);
  const [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => setStatus(data.status), [data.status]);
  useLiveStandings(data.id, live && status === 'in_progress');

  // What follows a landed write is part of the action, not of the button that started it, so the toast's Retry
  // (which runs the action again) finishes the job too: the pill changes, the question closes, the page re-reads.
  const close = useAction(
    'qualifiers.close',
    async () => {
      const res = await writes.setStatus(data.id, 'completed');
      if (normalise(res).success) {
        setStatus('completed');
        setConfirmClose(false);
        router.refresh();
      }
      return res;
    },
    {
      done: 'Qualifier closed · no new rounds accepted',
      failed: `Couldn’t close ${data.name}`,
      hint: 'It is still open, and players can still enter rounds. Try again.',
      code: 'CH-09003',
    },
  );
  const reopen = useAction(
    'qualifiers.reopen',
    async () => {
      const res = await writes.setStatus(data.id, 'in_progress');
      if (normalise(res).success) {
        setStatus('in_progress');
        router.refresh();
      }
      return res;
    },
    {
      done: 'Qualifier reopened · players can enter rounds',
      failed: `Couldn’t reopen ${data.name}`,
      hint: 'It is still closed. Try again.',
      code: 'CH-09004',
    },
  );

  const b = data.board;
  const topScore = Math.max(0, data.squad - data.picks);
  const phone = useChPhone();
  const reopenNow = () => reopen.run();

  const closeConfirm = (
    <Modal
      code="CH-09501"
      open={confirmClose}
      onClose={() => setConfirmClose(false)}
      width={460}
      icon={Lock}
      title="Close this qualifier?"
      description={`Players won’t be able to enter or submit rounds in ${data.name}, including rounds already started, until you reopen it. It moves to Concluded.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => setConfirmClose(false)}>
            Keep it open
          </Button>
          <Button
            variant="primary"
            disabled={close.pending}
            feel={null}
            onClick={() => void close.run()}
          >
            {close.pending ? <span data-ch-code="CH-09405">Closing</span> : 'Close qualifier'}
          </Button>
        </>
      }
    />
  );

  if (phone) {
    return (
      <SecondaryProvider value={shown.source}>
        <QualifierDetailPhone
          data={data}
          stale={stale}
          back={back}
          status={status}
          onAskClose={() => {
            chTrail('qualifiers close ask');
            setConfirmClose(true);
          }}
          onReopen={reopenNow}
          reopenPending={reopen.pending}
        />
        {closeConfirm}
      </SecondaryProvider>
    );
  }

  return (
    <SecondaryProvider value={shown.source}>
      <main className="ch-qf ch-qf--detail">
        <div className="ch-qf-back" onClickCapture={back.markReturn}>
          <Button size="sm" variant="ghost" leftIcon={ChevronLeft} href={back.href}>
            Qualifiers
          </Button>
        </div>
        <header className="ch-qf-head">
          <div>
            <span className="ch-qf-eyebrow">
              <StatusPill status={status} />
              <span>Qualifier</span>
            </span>
            <h1>{data.name}</h1>
            {data.description && <p>{data.description}</p>}
          </div>
          {coach && (
            <div className="ch-qf-head__act">
              {data.selectionState !== 'selected' && (
                <Button leftIcon={Users} href={`${LIST}/${data.id}/selection`}>
                  Manage selections
                </Button>
              )}
              <Button leftIcon={Pencil} href={`${LIST}/${data.id}/edit`}>
                Edit qualifier
              </Button>
              {status === 'in_progress' && (
                <Button
                  variant="ghost"
                  leftIcon={Lock}
                  feel="warning"
                  onClick={() => {
                    chTrail('qualifiers close ask');
                    setConfirmClose(true);
                  }}
                >
                  Close qualifier
                </Button>
              )}
              {status === 'completed' && (
                <Button
                  variant="ghost"
                  leftIcon={LockOpen}
                  disabled={reopen.pending}
                  onClick={() => void reopenNow()}
                >
                  {reopen.pending ? <span data-ch-code="CH-09406">Reopening</span> : 'Reopen qualifier'}
                </Button>
              )}
            </div>
          )}
        </header>

        {status === 'completed' && (
          <div className="ch-qf-note" data-ch-code="CH-09901">
            <Icon icon={Lock} size={16} />
            <p>
              <b>{coach ? 'Closed to new rounds.' : 'This qualifier is closed.'}</b>
              {coach
                ? 'Players can’t enter or submit rounds in it, including rounds already started, until you reopen it.'
                : 'Rounds can’t be entered or submitted in it. These are the final standings.'}
            </p>
          </div>
        )}

        <Facts data={data} topScore={topScore} />

        <div className="ch-qf-body">
          <div className="ch-qf-col">
            <SectionBoundary surface="qualifiers.leaderboard" label="The leaderboard" code="CH-09212">
              <Leaderboard data={data} status={status} stale={stale} />
            </SectionBoundary>
            {coach && b && b.rows.length > 0 && (
              <SectionBoundary surface="qualifiers.rounds" label="Round-by-round scores" code="CH-09213">
                <RoundByRound board={b} numRounds={data.numRounds} />
              </SectionBoundary>
            )}
          </div>
          <div className="ch-qf-col">
            <SectionBoundary surface="qualifiers.selections" label="Selections" code="CH-09214">
              <Selections data={data} status={status} topScore={topScore} />
            </SectionBoundary>
            <SectionBoundary surface="qualifiers.courses" label="Course per round" code="CH-09215">
              <Courses data={data} />
            </SectionBoundary>
            {data.rules && (
              <section className="ch-qf-side" aria-labelledby="ch-qf-rules">
                <div className="ch-qf-panel__head">
                  <div>
                    <h2 id="ch-qf-rules">Scoring rules</h2>
                    {coach && <p>Shown to players</p>}
                  </div>
                </div>
                <p className="ch-qf-why" style={{ marginTop: 0 }}>
                  {data.rules}
                </p>
              </section>
            )}
          </div>
        </div>

        {closeConfirm}
      </main>
    </SecondaryProvider>
  );
}

/** The Par line of the Course fact: the tee's par, or "Par by round" when the rounds differ; empty until it is known to be neither. */
function parLine(s: ChQDetailSecondary): string {
  return s.par != null ? `Par ${s.par}` : s.roundCourses.some((c) => c.par != null) ? 'Par by round' : '';
}

function Facts({ data, topScore }: { data: ChQDetailCore; topScore: number }) {
  const facts: Array<[string, string, ReactNode]> = [
    // A date never splits from its day; the range wraps at the dash (D-33: the fact wraps, never truncates).
    ['Dates', shortRange(data.startDate, data.endDate).replace(/ (?=\d)/g, '\u00a0'), `${yearOf(data.startDate)} · ${plural(data.numRounds, 'round')}`],
    ['Entry deadline', data.deadline ? dayLabel(data.deadline) : '—', data.deadline ? yearOf(data.deadline) : 'Not set'],
    ['Entrants', data.entriesError ? '—' : String(data.entrants), 'players'],
    ['Rounds submitted', data.board ? String(data.board.submitted) : '—', data.entriesError ? '' : `of ${data.entrants * data.numRounds}`],
    // The par comes from the tees, which stream in behind the page: the line holds its place until they do.
    ['Course', data.course ?? '—', <Streamed key="par" fallback={<ParLineSkeleton />}>{(s) => parLine(s) || ' '}</Streamed>],
    ['Spots', String(data.squad), `${topScore} on score · ${plural(data.picks, 'pick')}`],
  ];
  return (
    <dl className="ch-qf-facts">
      {facts.map(([k, v, s]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
          <dd className="ch-qf-facts__sub">{typeof s === 'string' ? s || ' ' : s}</dd>
        </div>
      ))}
    </dl>
  );
}

const LB_COLS = '44px minmax(0, 1fr) 56px 56px 60px 104px 28px';

function Leaderboard({ data, status, stale }: { data: ChQDetailCore; status: ChQStatus; stale: boolean }) {
  const { refresh, refreshing } = useRefresh();
  const [open, setOpen] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const b = data.board;
  const coach = data.role === 'coach';
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
        <h2 id="ch-qf-lb">Leaderboard</h2>
        {b && <p className="ch-num">Ranked by total to par · {plural(b.submitted, 'round')} submitted</p>}
      </div>
      {status === 'in_progress' && b && (
        <Badge tone="accent" dot>
          Updates as rounds are signed
        </Badge>
      )}
    </div>
  );

  if (data.entriesError || data.roundsError || !b) {
    return (
      <section className="ch-qf-panel" aria-labelledby="ch-qf-lb">
        {head}
        {data.entriesError ? (
          <InlineNotice code="CH-09203" title="The field didn’t load." body="Standings wait until the entrants load, so nobody reads a wrong order." onRetry={refresh} retrying={refreshing} />
        ) : (
          <InlineNotice
            code="CH-09204"
            title="Scores didn’t load."
            body="The field isn’t shown without its scores, so nobody reads a wrong order. The error has been reported."
            onRetry={refresh}
            retrying={refreshing}
          />
        )}
      </section>
    );
  }
  if (!b.rows.length) {
    return (
      <section className="ch-qf-panel" aria-labelledby="ch-qf-lb">
        {head}
        <EmptyState
          code="CH-09304"
          icon={Flag}
          title="Awaiting first round."
          body={`${plural(data.entrants, 'player')} entered. Standings appear once a player submits a round.`}
        />
      </section>
    );
  }

  const toggle = (row: ChQRow) => {
    const next = open === row.playerId ? null : row.playerId;
    if (next) chTrail('qualifiers open scorecards');
    haptic('select');
    setOpen(next);
  };
  const canOpen = (row: ChQRow) => coach || row.playerId === data.viewerPlayerId;

  return (
    <section className="ch-qf-panel" aria-labelledby="ch-qf-lb">
      {head}
      {stale && <StaleStandings />}
      <p className="ch-sr-only" aria-live="polite" data-ch-code="CH-09803">
        {announce}
      </p>
      <div className="ch-qf-table" role="table" aria-labelledby="ch-qf-lb">
        <div role="rowgroup">
          <div className="ch-qf-row ch-qf-row--head" role="row" style={{ gridTemplateColumns: LB_COLS }}>
            <span role="columnheader">Pos</span>
            <span role="columnheader">Player</span>
            <span role="columnheader" className="r">
              Rounds
            </span>
            <span role="columnheader" className="r">
              Total
            </span>
            <span role="columnheader" className="r">
              To par
            </span>
            <span role="columnheader" className="r">
              Status
            </span>
            <span role="columnheader">
              <span className="ch-sr-only">Scorecards</span>
            </span>
          </div>
        </div>
        <div role="rowgroup">
          {b.rows.map((r, i) => {
            const isOpen = open === r.playerId;
            const me = r.playerId === data.viewerPlayerId;
            const openable = canOpen(r);
            return (
              <div key={r.playerId}>
                {i === b.topScore && b.topScore > 0 && <CutLine text={`Top-score line · ${b.topScore} qualify on score`} />}
                {i === b.squad && b.squad !== b.topScore && <CutLine muted text={`Travel cut · top ${b.squad} make the trip`} />}
                {/* The row is a mouse target too; the keyboard path is the scorecards button in its last cell. */}
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus */}
                <div
                  className={'ch-qf-row' + (openable ? ' ch-qf-rowbtn' : '') + (isOpen ? ' is-open' : '') + (me ? ' is-me' : '')}
                  role="row"
                  style={{ gridTemplateColumns: LB_COLS }}
                  onClick={openable ? () => toggle(r) : undefined}
                >
                  <span role="cell" className="ch-qf-pos">
                    {positionLabel(r)}
                  </span>
                  <span role="rowheader" className="ch-qf-who">
                    <Avatar name={r.name} size={32} />
                    <span>
                      <b>
                        {r.name}
                        {me && <span className="ch-qf-you">You</span>}
                      </b>
                      {r.classYear && <small>{r.classYear}</small>}
                    </span>
                  </span>
                  <span role="cell" className="r ch-qf-num">
                    {r.played}/{data.numRounds}
                  </span>
                  <span role="cell" className="r ch-qf-num">
                    {r.total ?? '—'}
                  </span>
                  <span role="cell" className="r">
                    <ToPar value={r.toPar} big />
                  </span>
                  <span role="cell" className="r">
                    <StateBadge state={r.state} />
                  </span>
                  <span role="cell">
                    {openable && (
                      <button
                        type="button"
                        className="ch-qf-open"
                        aria-expanded={isOpen}
                        aria-controls={`ch-qf-tray-${r.playerId}`}
                        aria-label={`${isOpen ? 'Hide' : 'Show'} ${me ? 'your' : `${r.name}’s`} scorecards`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(r);
                        }}
                      >
                        <Icon icon={isOpen ? ChevronUp : ChevronDown} size={15} />
                      </button>
                    )}
                  </span>
                </div>
                {isOpen && (
                  <div role="row" id={`ch-qf-tray-${r.playerId}`}>
                    <div role="cell" className="ch-qf-tray">
                      <Tray row={r} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {b.unscored.map((r) => (
            <div key={r.playerId} className={'ch-qf-row is-none' + (r.playerId === data.viewerPlayerId ? ' is-me' : '')} role="row" style={{ gridTemplateColumns: LB_COLS }}>
              <span role="cell" className="ch-qf-pos">
                —
              </span>
              <span role="rowheader" className="ch-qf-who">
                <Avatar name={r.name} size={32} />
                <span>
                  <b>
                    {r.name}
                    {r.playerId === data.viewerPlayerId && <span className="ch-qf-you">You</span>}
                  </b>
                  <small>No rounds yet</small>
                </span>
              </span>
              <span role="cell" className="r ch-qf-num">
                0/{data.numRounds}
              </span>
              <span role="cell" className="r ch-qf-dash">
                —
              </span>
              <span role="cell" className="r ch-qf-dash">
                —
              </span>
              <span role="cell" />
              <span role="cell" />
            </div>
          ))}
        </div>
      </div>
      <p className="ch-qf-cap">
        Ranked by total to par, then total strokes, then more rounds played. Top {b.topScore} qualify on score
        {data.picks ? `; ${plural(data.picks, 'coach’s pick', 'coach’s picks')}` : ''}.{data.rules ? ` ${data.rules}` : ''}
      </p>
    </section>
  );
}

function CutLine({ text, muted = false }: { text: string; muted?: boolean }) {
  return (
    <div role="row">
      <span role="cell" className={'ch-qf-line' + (muted ? ' ch-qf-line--muted' : '')}>
        <span>{text}</span>
      </span>
    </div>
  );
}

function Tray({ row }: { row: ChQRow }) {
  return (
    <>
      <p className="ch-qf-tray__avg">
        {row.avg != null ? `Average ${formatFixed(row.avg)} over ${plural(row.played - row.shortRounds, '18-hole round')}` : 'No 18-hole round to average yet'}
        {row.shortRounds > 0 && ` · ${plural(row.shortRounds, 'shorter round')} left out of the average`}
      </p>
      {/* The cards stream in behind the standings: until they do each round shows its own head over a card-sized placeholder. */}
      <Streamed
        fallback={row.rounds.map((rd, i) => (
          <ScorecardShell key={rd.id} round={rd} code={i === 0 ? 'CH-09410' : undefined}>
            <CardBodySkeleton />
          </ScorecardShell>
        ))}
      >
        {(s) => <TrayCards row={row} s={s} />}
      </Streamed>
    </>
  );
}

function TrayCards({ row, s }: { row: ChQRow; s: ChQDetailSecondary }) {
  const { refresh, refreshing } = useRefresh();
  return (
    <>
      {s.holesError && (
        <InlineNotice code="CH-09205" title="Scorecards didn’t load." body="The totals above are right; the hole-by-hole cards are missing until they load." onRetry={refresh} retrying={refreshing} />
      )}
      {row.rounds.map((rd) => (
        <Scorecard key={rd.id} round={rd} holes={s.holesError ? undefined : (s.holes[rd.id] ?? [])} />
      ))}
    </>
  );
}

/** One round's card frame: its head (the round, the course and day, the total: all in the standings) over `children`. */
function ScorecardShell({ round, code, children }: { round: ChQRound; code?: string; children: ReactNode }) {
  const meta = [round.course, dayLabel(round.date)].filter(Boolean).join(' · ');
  return (
    <div className="ch-qf-sc" data-ch-code={code}>
      <div className="ch-qf-sc__h">
        <b>Round {round.number}</b>
        <span className="ch-num">
          {meta}
          {round.total != null && ` · ${round.total}`}
        </span>
      </div>
      {children}
    </div>
  );
}

/** One round's card: hole, par and score, with Out, In and total. */
function Scorecard({ round, holes }: { round: ChQRound; holes: ChQHole[] | undefined }) {
  const meta = [round.course, dayLabel(round.date)].filter(Boolean).join(' · ');
  if (holes === undefined) return null;
  const front = holes.filter((h) => h.n <= 9);
  const back = holes.filter((h) => h.n > 9);
  const sum = (list: ChQHole[], k: 'par' | 'score') => (list.every((h) => h[k] != null) ? list.reduce((s, h) => s + (h[k] as number), 0) : null);
  return (
    <ScorecardShell round={round}>
      {holes.length === 0 ? (
        <p className="ch-qf-sc__none" data-ch-code="CH-09308">
          No hole-by-hole card for this round. Only the total was recorded.
        </p>
      ) : (
        <ScrollRegion label={`Round ${round.number} scorecard`}>
          <table className="ch-qf-strip">
            <caption className="ch-sr-only">
              Round {round.number} scorecard{meta ? `, ${meta}` : ''}
            </caption>
            <thead>
              <tr>
                <th scope="col">Hole</th>
                {front.map((h) => (
                  <th key={h.n} scope="col">
                    {h.n}
                  </th>
                ))}
                {front.length > 0 && back.length > 0 && (
                  <th scope="col" className="is-sum">
                    Out
                  </th>
                )}
                {back.map((h) => (
                  <th key={h.n} scope="col">
                    {h.n}
                  </th>
                ))}
                {back.length > 0 && front.length > 0 && (
                  <th scope="col" className="is-sum">
                    In
                  </th>
                )}
                <th scope="col" className="is-sum">
                  Tot
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="is-par">
                <th scope="row">Par</th>
                {front.map((h) => (
                  <td key={h.n}>{h.par}</td>
                ))}
                {front.length > 0 && back.length > 0 && <td className="is-sum">{sum(front, 'par') ?? '—'}</td>}
                {back.map((h) => (
                  <td key={h.n}>{h.par}</td>
                ))}
                {back.length > 0 && front.length > 0 && <td className="is-sum">{sum(back, 'par') ?? '—'}</td>}
                <td className="is-sum">{sum(holes, 'par') ?? '—'}</td>
              </tr>
              <tr>
                <th scope="row">Score</th>
                {front.map((h) => (
                  <td key={h.n}>
                    <ScoreMark score={h.score} par={h.par} size="sm" />
                  </td>
                ))}
                {front.length > 0 && back.length > 0 && <td className="is-sum">{sum(front, 'score') ?? '—'}</td>}
                {back.map((h) => (
                  <td key={h.n}>
                    <ScoreMark score={h.score} par={h.par} size="sm" />
                  </td>
                ))}
                {back.length > 0 && front.length > 0 && <td className="is-sum">{sum(back, 'score') ?? '—'}</td>}
                <td className="is-sum">{sum(holes, 'score') ?? round.total ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </ScrollRegion>
      )}
    </ScorecardShell>
  );
}

/** A round's column title; the course it is on is its tooltip, which streams in with the rest of the courses. */
function RoundHead({ n }: { n: number }) {
  return <Streamed fallback={`R${n}`}>{(s) => <span title={s.roundCourses.find((c) => c.number === n)?.course ?? undefined}>R{n}</span>}</Streamed>;
}

function RoundByRound({ board, numRounds }: { board: ChQBoard; numRounds: number }) {
  const cols = `36px minmax(120px, 1fr) ${Array.from({ length: numRounds }, () => '52px').join(' ')} 56px 60px`;
  const minWidth = 36 + 120 + numRounds * 52 + 56 + 60 + (numRounds + 4) * 12 + 24;
  return (
    <section className="ch-qf-panel" aria-labelledby="ch-qf-rbr">
      <div className="ch-qf-panel__head">
        <div>
          <h2 id="ch-qf-rbr">Round-by-round scores</h2>
          <p>Gross strokes · coach only</p>
        </div>
      </div>
      <ScrollRegion label="Round-by-round scores" className="ch-qf-table">
        <div role="table" aria-labelledby="ch-qf-rbr" style={{ minWidth }}>
          <div role="rowgroup">
            <div className="ch-qf-row ch-qf-row--head" role="row" style={{ gridTemplateColumns: cols }}>
              <span role="columnheader">#</span>
              <span role="columnheader">Player</span>
              {Array.from({ length: numRounds }, (_, i) => (
                <span key={i} role="columnheader" className="r">
                  <RoundHead n={i + 1} />
                </span>
              ))}
              <span role="columnheader" className="r">
                Total
              </span>
              <span role="columnheader" className="r">
                To par
              </span>
            </div>
          </div>
          <div role="rowgroup">
            {board.rows.map((r) => (
              <div key={r.playerId} className="ch-qf-row ch-qf-row--flat" role="row" style={{ gridTemplateColumns: cols }}>
                <span role="cell" className="ch-qf-pos">
                  {positionLabel(r)}
                </span>
                <span role="rowheader" className="ch-qf-who">
                  <b>{r.name}</b>
                </span>
                {Array.from({ length: numRounds }, (_, i) => {
                  const rd = r.rounds.find((x) => x.number === i + 1);
                  return (
                    <span key={i} role="cell" className="r ch-qf-num">
                      {rd?.total != null ? <span className={rd.toPar != null && rd.toPar < 0 ? 'is-under' : undefined}>{rd.total}</span> : <span className="ch-qf-dash">—</span>}
                    </span>
                  );
                })}
                <span role="cell" className="r ch-qf-num">
                  <b>{r.total ?? '—'}</b>
                </span>
                <span role="cell" className="r">
                  <ToPar value={r.toPar} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </ScrollRegion>
    </section>
  );
}
