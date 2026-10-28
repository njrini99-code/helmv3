import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';
import type { ChPlayerAsks } from '../../data/player-home';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { rebuiltHref } from '../../shell/nav';
import { LinkPending } from '../../shell/LinkPending';
import { plural } from '../../lib/plural';

/** "2 replies · 1 to acknowledge · 1 task due": only the parts that aren't zero. */
export function asksParts(asks: ChPlayerAsks | null | undefined): string[] {
  if (!asks) return [];
  return [
    asks.rsvps ? `${plural(asks.rsvps, 'reply', 'replies')}` : null,
    asks.acks ? `${asks.acks} to acknowledge` : null,
    asks.tasksDue ? `${plural(asks.tasksDue, 'task')} due` : null,
  ].filter((p): p is string => !!p);
}

/**
 * The player's "From your coach" row under Home's hero: what the coach is waiting on, as Team Hub lists it, and the way
 * there. Nothing waiting, a read that failed (`asks` null) or a Hub not rebuilt for players: no row.
 */
export function CoachAsks({ asks }: { asks: ChPlayerAsks | null | undefined }) {
  const parts = asksParts(asks);
  const hub = rebuiltHref('/golf/dashboard/team-hub', 'player');
  if (!parts.length || !hub) return null;
  return (
    <Link href={hub} className="ch-ph-asks">
      <span className="ch-ph-asks__k">From your coach</span>
      {/* Each part keeps to one line, so a wrap never strands its figure ("· 2" / "tasks due"). */}
      <span className="ch-ph-asks__v ch-num">
        {parts.map((p, i) => (
          <Fragment key={p}>
            {i > 0 && ' · '}
            <span className="ch-ph-asks__p">{p}</span>
          </Fragment>
        ))}
      </span>
      <Icon icon={ChevronRight} size={16} />
      <LinkPending />
    </Link>
  );
}

/** The player's own reply on Up next (`ChHomeEvent.mine`, `ChNextEvent.mine`): a positive "You're going", a warning "Reply needed". */
export function MineBadge({ mine }: { mine: 'going' | 'needed' | null | undefined }) {
  if (mine === 'going') return <Badge tone="positive">You’re going</Badge>;
  if (mine === 'needed') return <Badge tone="warning">Reply needed</Badge>;
  return null;
}
