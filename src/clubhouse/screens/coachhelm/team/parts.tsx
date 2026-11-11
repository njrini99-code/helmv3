'use client';

import { TriangleAlert } from 'lucide-react';
import { createContext, useContext, type ReactNode } from 'react';
import { Avatar } from '../../../ui/Avatar';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { Badge } from '../../../ui/Badge';
import type { ChInsight } from '../../../data/coachhelm-shape';
import type { ChReadWorth, ChTeamPlayer } from '../../../data/coachhelm-team-shape';

/**
 * Each drawn read's worth, from the board's themes part: the cascade's figure, the one the Read page and the Player file print.
 * `pending` while that part is still arriving: a row then holds the chip's place, so nothing moves when the figure lands.
 */
export const ReadWorthContext = createContext<{ byRead: Readonly<Record<string, ChReadWorth>> | null; pending: boolean }>({ byRead: null, pending: false });

export function Coin({ player, small = false }: { player: Pick<ChTeamPlayer, 'id' | 'name' | 'early'>; small?: boolean }) {
  return small ? <Avatar name={player.name} id={player.id} size="xs" dim={!!player.early} /> : <Avatar name={player.name} id={player.id} size="sm" dim={!!player.early} />;
}

export function Chevron() {
  return (
    <svg className="chev" width="8" height="14" viewBox="0 0 8 14" aria-hidden="true">
      <path d="M1.5 1.5 6.5 7l-5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One read row, on a spot or on Course: size chip only with an estimate; the read's own sample; sureness in the app's words (AC-SPOT-07, 12, 13). */
export function ReadRow({ player, read, onOpen }: { player: ChTeamPlayer; read: ChInsight; onOpen: (id: string) => void }) {
  const word = read.evidence.read?.word;
  const { byRead, pending } = useContext(ReadWorthContext);
  const worth = byRead?.[read.id] ?? null;
  return (
    <button type="button" className="rd tapp" data-ch-press-scale=".97" onClick={() => onOpen(read.id)}>
      <Coin player={player} />
      <span>
        <b>
          {player.first}: {read.title}
        </b>
        <span className="ev">
          {read.evidence.sample && <span>{read.evidence.sample}</span>}
          {word && <Badge tone={word === 'Solid read' ? 'positive' : 'neutral'}>{word}</Badge>}
          {read.stale && <Badge>Out of date</Badge>}
          {/* Last in the line, and its place held while it is on its way, so the words before it never move when it lands. */}
          {worth ? (
            <Badge tone="warning">{worth.strokes} a round</Badge>
          ) : (
            pending && (
              <span className="ev__hold" aria-hidden="true">
                <Badge tone="warning">0.0 a round</Badge>
              </span>
            )
          )}
        </span>
      </span>
      <Chevron />
    </button>
  );
}

/** One notice for every part of the board, with its icon tile (TEAM-29). */
export function Notice({ title, body, onRetry }: { title: ReactNode; body?: ReactNode; onRetry?: () => void }) {
  return (
    <div className="notice">
      <span className="ni">
        <Icon icon={TriangleAlert} size={18} />
      </span>
      <div>
        <b>{title}</b>
        {body && <span>{body}</span>}
        {onRetry && (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
