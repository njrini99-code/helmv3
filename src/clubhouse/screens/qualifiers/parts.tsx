import { CalendarDays, ChevronDown, ChevronUp, Flag, MapPin } from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { formatToPar } from '../../lib/format';
import type { ChPlayerPeek } from '../../ui/PlayerPeek';
import { endedLabel, lineGapText, positionLabel, rangeLabel, shortRange, viewerOutcomeText, viewerVsLines, yearOf, STATE_LABEL, STATUS_LABEL, type ChQBoard, type ChQMixedRound, type ChQRow, type ChQRowState, type ChQStatus, type ChQViewerSelection } from './model';
import { firstName } from '../../lib/names';
import { plural, pluralWord } from '../../lib/plural';

/**
 * Live, Upcoming or Concluded (the list's own word for a finished one). Live is a static dot: no pulse (D-33). A live
 * qualifier past its last day is "Waiting on n rounds" (or "Past last day"), never Live (P009-D3, F-0068): no dot, since nothing about it is
 * live.
 */
export function StatusPill({ status, ended = null }: { status: ChQStatus; ended?: { outstanding: number | null } | null }) {
  if (ended) {
    return (
      <span className="ch-qf-status">
        <Badge tone="neutral">{endedLabel(ended)}</Badge>
      </span>
    );
  }
  const s = STATUS_LABEL[status];
  return (
    <span className="ch-qf-status">
      <Badge tone={s.tone} dot>
        {s.label}
      </Badge>
    </span>
  );
}

export function StateBadge({ state }: { state: ChQRowState }) {
  if (!state) return null;
  const s = STATE_LABEL[state];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Score to par. Red only under par. */
export function ToPar({ value, big = false }: { value: number | null; big?: boolean }) {
  return <span className={'ch-qf-tp' + (value != null && value < 0 ? ' is-under' : '') + (big ? ' is-big' : '')}>{formatToPar(value)}</span>;
}

/**
 * To par on a hand-hung plate (P009-A1): a fixed-aspect ivory plate with the numeral in the condensed cell role.
 * Red only under par; even and over par are ink. `size` is the board's (desktop, phone) or the list's live card.
 */
export function ToParPlate({ value, size = 'board' }: { value: number | null; size?: 'board' | 'card' }) {
  return (
    <span className={'ch-qf-plate' + (size === 'card' ? ' is-card' : '') + (value != null && value < 0 ? ' is-under' : '') + (value == null ? ' is-none' : '')}>
      {formatToPar(value)}
    </span>
  );
}

/**
 * A board position: "T3" for a tie, its T set small and raised; under it, the quiet movement since the previous round
 * (an up chevron and "2" gained in green, a down chevron and "1" lost in amber; SVG, never a triangle glyph). The
 * words are read, the glyph is not. Nothing here animates.
 */
export function Pos({ position, tied, move }: { position: number | string | null; tied: boolean; move: number | null }) {
  const n = typeof position === 'string' ? position.replace(/^T/, '') : position;
  return (
    <span className="ch-qf-pos">
      <span className="ch-qf-pos__n">
        {n == null ? (
          '—'
        ) : (
          <>
            {tied && <span className="ch-qf-pos__t">T</span>}
            {n}
          </>
        )}
      </span>
      {move ? (
        <span className={'ch-qf-move ' + (move > 0 ? 'is-gain' : 'is-loss')}>
          <span aria-hidden="true">
            <Icon icon={move > 0 ? ChevronUp : ChevronDown} size={12} />
            {Math.abs(move)}
          </span>
          <span className="ch-sr-only">
            , {move > 0 ? 'up' : 'down'} {Math.abs(move)} since the last round
          </span>
        </span>
      ) : null}
    </span>
  );
}

export function Meta({
  startDate,
  endDate,
  squad,
  course,
  today,
}: {
  startDate: string;
  endDate: string | null;
  squad: number;
  course: string | null;
  /** The loader's day (P009-D11): a range inside its year drops the year ("Sep 22 – Oct 1"). Left out, the year stays. */
  today?: string;
}) {
  const thisYear = !!today && yearOf(startDate) === yearOf(today) && (!endDate || yearOf(endDate) === yearOf(today));
  return (
    <div className="ch-qf-meta">
      <span>
        <Icon icon={CalendarDays} size={15} />
        {thisYear ? shortRange(startDate, endDate) : rangeLabel(startDate, endDate)}
      </span>
      <span>
        <Icon icon={Flag} size={15} />
        {squad} {pluralWord(squad, 'spot')}
      </span>
      {course && (
        <span className="ch-qf-meta__w">
          <Icon icon={MapPin} size={15} />
          {course}
        </span>
      )}
    </div>
  );
}

/** The player peek (P003-C1) from a leaderboard row: what the board already holds, no reads of its own. Coaches only. */
export function qualifierPeek(r: ChQRow, numRounds: number): ChPlayerPeek {
  return {
    id: r.playerId,
    name: r.name,
    sub: [r.classYear, `${r.played} of ${plural(numRounds, 'round')} in`].filter(Boolean).join(' \u00b7 '),
    avg: r.avg,
  };
}

/**
 * Thru as dots (owner, 2026-10-16): one per scheduled round, green for each one played. A long qualifier (more than
 * eight rounds) keeps the figure, since a row of dots that long stops being countable at a glance.
 */
export function ThruDots({ played, total }: { played: number; total: number }) {
  const label = `${played} of ${plural(total, 'round')}`;
  if (total > 8) {
    return (
      <span role="img" className="ch-num" aria-label={label}>
        {played}/{total}
      </span>
    );
  }
  return (
    <span className="ch-qf-dots" role="img" aria-label={label}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < played ? 'is-on' : undefined} />
      ))}
    </span>
  );
}

/**
 * "You vs the line" (row 74): the viewer's own row (place, to par, rounds in) kept at the top of the board, so it is in
 * view however long the field, and how far it sits from the top-score line and the travel cut; once the squad is
 * confirmed, the outcome instead (viewerVsLines). Nothing for a coach (no row of their own) or when the board draws no line.
 */
export function ViewerLineCard({
  board,
  viewerId,
  numRounds,
  selection,
}: {
  board: Pick<ChQBoard, 'rows' | 'topScore' | 'squad'>;
  viewerId: string | null | undefined;
  numRounds: number;
  selection: ChQViewerSelection;
}) {
  const v = viewerVsLines(board, viewerId, selection);
  if (!v) return null;
  const { me, gaps, outcome } = v;
  const said = outcome ? viewerOutcomeText(outcome) : null;
  return (
    <section className="ch-qf-you-line" aria-labelledby="ch-qf-you-line-h" data-ch-code="CH-09908">
      <h3 id="ch-qf-you-line-h">You vs the line</h3>
      <p className="ch-qf-you-line__me ch-num">
        {/* The place is named, as the board's Pos column names it, so the line never opens on a bare number (Round 3). */}
        <b>Place {positionLabel(me)}</b>
        <ToParPlate value={me.toPar} size="card" />
        <span>
          {me.played} of {plural(numRounds, 'round')}
        </span>
      </p>
      <ul>
        {said && (
          <li className={outcome === 'not_selected' ? 'is-outside' : 'is-inside'}>
            <b>{said.label}</b> {said.text}
          </li>
        )}
        {gaps.map((g) => (
          <li key={g.line} className={g.tie || g.picks ? 'is-tie' : g.inside ? 'is-inside' : 'is-outside'}>
            <b>{g.label}</b> {lineGapText(g, me, numRounds, firstName)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** CH-09909: a round whose cards mix 9 and 18 holes. The board still adds them to par; the coach decides whether to fix a card. */
export function MixedRounds({ mixed }: { mixed: readonly ChQMixedRound[] }) {
  const first = mixed[0]!;
  const title = mixed.length === 1 ? `Round ${first.number} mixes 9- and 18-hole cards` : `${plural(mixed.length, 'round')} mix 9- and 18-hole cards`;
  const body =
    mixed.length === 1
      ? `${plural(first.nine, 'player')} played 9 holes and ${plural(first.full, 'player')} played 18. The standings add them to par as they are; check those cards if the round was meant to be one length.`
      : `Rounds ${mixed.map((m) => m.number).join(', ')} each have 9- and 18-hole cards. The standings add them to par as they are; check those cards if each round was meant to be one length.`;
  return <InlineNotice code="CH-09909" title={title} body={body} />;
}
