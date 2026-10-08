import { CalendarDays, Flag, MapPin } from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { formatToPar } from '../../lib/format';
import { endedLabel, rangeLabel, shortRange, yearOf, STATE_LABEL, STATUS_LABEL, type ChQRowState, type ChQStatus } from './model';

/**
 * Live, Upcoming or Completed. Live is a static dot: no pulse (D-33). A live qualifier past its last day is "Ended · n
 * rounds outstanding", never Live (P009-D3): no dot, since nothing about it is live.
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
 * ("▲2" gained in green, "▼1" lost in amber). The words are read, the glyph is not. Nothing here animates.
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
            {move > 0 ? '▲' : '▼'}
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
        {squad} {squad === 1 ? 'spot' : 'spots'}
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
