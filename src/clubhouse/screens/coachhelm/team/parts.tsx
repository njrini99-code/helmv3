'use client';

import { initials } from '../../../lib/names';
import type { ChInsight } from '../../../data/coachhelm-shape';
import type { ChTeamPlayer } from '../../../data/coachhelm-team-shape';
import { coinColor } from './TeamHole';

export function Coin({ player, small = false }: { player: Pick<ChTeamPlayer, 'id' | 'name' | 'early'>; small?: boolean }) {
  return (
    <span className={'coin' + (small ? ' sm' : '') + (player.early ? ' early' : '')} style={{ ['--c' as string]: coinColor(player.id) }} aria-hidden="true">
      {initials(player.name)}
    </span>
  );
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
          {read.stakes && <span className="chipk l">{read.stakes} a round</span>}
          {read.evidence.sample && <span>{read.evidence.sample}</span>}
          {word && <span className={'chipk' + (word === 'Solid read' ? ' g' : '')}>{word}</span>}
          {read.stale && <span className="chipk">Out of date</span>}
        </span>
      </span>
      <Chevron />
    </button>
  );
}
