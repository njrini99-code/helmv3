'use client';

import { Avatar } from '../../../ui/Avatar';
import { Badge } from '../../../ui/Badge';
import type { ChInsight } from '../../../data/coachhelm-shape';
import type { ChTeamPlayer } from '../../../data/coachhelm-team-shape';

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
  return (
    <button type="button" className="rd tapp" data-ch-press-scale=".97" onClick={() => onOpen(read.id)}>
      <Coin player={player} />
      <span>
        <b>
          {player.first}: {read.title}
        </b>
        <span className="ev">
          {read.stakes && <Badge tone="warning">{read.stakes} a round</Badge>}
          {read.evidence.sample && <span>{read.evidence.sample}</span>}
          {word && <Badge tone={word === 'Solid read' ? 'positive' : 'neutral'}>{word}</Badge>}
          {read.stale && <Badge>Out of date</Badge>}
        </span>
      </span>
      <Chevron />
    </button>
  );
}
