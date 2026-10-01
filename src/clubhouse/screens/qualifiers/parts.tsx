import { CalendarDays, Flag, MapPin } from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { formatToPar } from '../../lib/format';
import { rangeLabel, STATE_LABEL, STATUS_LABEL, type ChQRowState, type ChQStatus } from './model';

/** Live, Upcoming or Completed. Live is a static dot: no pulse (D-33). */
export function StatusPill({ status }: { status: ChQStatus }) {
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

export function Meta({ startDate, endDate, squad, course }: { startDate: string; endDate: string | null; squad: number; course: string | null }) {
  return (
    <div className="ch-qf-meta">
      <span>
        <Icon icon={CalendarDays} size={15} />
        {rangeLabel(startDate, endDate)}
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
