'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChTeamReads, ChTeamReadsLoad, ChTeamReadsPlayer } from '../../../data/coachhelm-team-reads-shape';
import { COACH_BOARD_HREF } from '../../../data/coachhelm-track-record-shape';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { Badge } from '../../../ui/Badge';
import { Icon } from '../../../ui/Icon';
import { LargeTitle } from '../../../ui/LargeTitle';
import { RefreshNotice } from '../../../ui/RefreshNotice';
import { BackLink } from '../../../ui/Section';
import { EmptyState } from '../../../ui/States';
import { Surface } from '../../../ui/Surface';

const LINE = 'What the team shares, said once, and each player’s own read under it.';

/** The page the team reads are drawn in: a pushed screen on the phone (back to CoachHelm), a back link on the desk. */
function Frame({ children }: { children: ReactNode }) {
  const phone = useChPhone();
  const router = useRouter();
  return (
    <main className={'ch-hl ch-htr ch-htrd' + (phone ? ' is-phone' : '')} aria-labelledby="ch-htrd-title" data-canopy={phone ? undefined : ''} data-ch="team-reads">
      {phone && <PhoneTop back={{ label: 'CoachHelm', onBack: () => router.push(COACH_BOARD_HREF) }} title="Team reads" titleId="ch-htrd-title" />}
      <header className="ch-hl-h ch-htr-h" data-canopy-head={phone ? 'tight' : ''}>
        {!phone && <BackLink href={COACH_BOARD_HREF}>CoachHelm</BackLink>}
        {phone ? (
          <LargeTitle as="p" className="ch-hl-h__t">
            Team reads
          </LargeTitle>
        ) : (
          <h1 id="ch-htrd-title" className="ch-hl-h__t">
            Team reads
          </h1>
        )}
        <p>{LINE}</p>
      </header>
      {children}
    </main>
  );
}

/**
 * The coach's team page for CoachHelm reads (P013 `?view=team-reads`, flag `coachhelm_reads_v1`; the route checks the flag).
 * Built for a full roster: the shared part is said once at the top; the players are grouped by the part that costs them
 * the most, the biggest group first and the worst loss first inside it, each with their own line (one level down and the
 * pattern), so no two rows read the same unless the reads truly are; then who improved, and who has no read yet. Each
 * name opens the coach's file on that player.
 */
export function TeamReads({ load }: { load: ChTeamReadsLoad }) {
  if (load.status === 'off') return null;
  if (load.status === 'failed') {
    return (
      <Frame>
        <RefreshNotice code="CH-13215" title="Team reads didn’t load" body="Nothing is lost. Each player’s file still has their read; try again in a moment." />
      </Frame>
    );
  }
  const d = load.data;
  if (d.playersRead === 0 && d.waiting.length === 0) {
    return (
      <Frame>
        <EmptyState size="section" code="CH-13316" title="No reads saved yet" body="CoachHelm saves a read for each player after their next posted round, and every night." />
      </Frame>
    );
  }
  return (
    <Frame>
      <Ready d={d} />
    </Frame>
  );
}

function Ready({ d }: { d: ChTeamReads }) {
  return (
    <div className="ch-htrd-body">
      <Surface id="ch-htrd-team" title="The team" subtitle={`${d.playersRead} of ${d.roster} players have a read`}>
        {d.shared && <p className="ch-htrd-shared">{d.shared}</p>}
        <p className="ch-htrd-note ch-num">{d.sameCard}</p>
      </Surface>
      {d.improved.length > 0 && (
        <Surface id="ch-htrd-up" title="Improved">
          <ul className="ch-htrd-list">
            {d.improved.map((p) => (
              <li key={p.id}>
                <Link href={p.href} prefetch={false} className="ch-htrd-row">
                  <span className="ch-htrd-row__t">
                    <b>{p.name}</b>
                    <small className="ch-num">{p.text}</small>
                  </span>
                  <Icon icon={ChevronRight} size={16} />
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      )}
      {d.groups.map((g) => (
        <Surface key={g.label} id={`ch-htrd-${g.label.toLowerCase().replace(/\W+/g, '-')}`} title={g.label} subtitle={`Costs the most for ${g.players.length} ${g.players.length === 1 ? 'player' : 'players'}`}>
          <ul className="ch-htrd-list">
            {g.players.map((p) => (
              <PlayerRow key={p.id} p={p} />
            ))}
          </ul>
        </Surface>
      ))}
      {d.waiting.length > 0 && (
        <Surface id="ch-htrd-wait" title="No read yet" subtitle={`${d.waiting.length} ${d.waiting.length === 1 ? 'player' : 'players'}`}>
          <ul className="ch-htrd-list is-quiet">
            {d.waiting.map((p) => (
              <li key={p.id}>
                <Link href={p.href} prefetch={false} className="ch-htrd-row">
                  <span className="ch-htrd-row__t">
                    <b>{p.name}</b>
                    <small className="ch-num">{p.text}</small>
                  </span>
                  <Icon icon={ChevronRight} size={16} />
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}

function PlayerRow({ p }: { p: ChTeamReadsPlayer }) {
  return (
    <li data-ch-htrd-player={p.id}>
      <Link href={p.href} prefetch={false} className="ch-htrd-row">
        <span className="ch-htrd-row__t">
          <span className="ch-htrd-row__h">
            <b>{p.name}</b>
            <span className="ch-num">{p.lost}</span>
            <Badge tone={p.certainty === 'Clear' ? 'warning' : 'neutral'}>{p.certainty}</Badge>
          </span>
          <small>{p.distinct}</small>
          {p.exception && <small className="ch-htrd-row__x">{p.exception}</small>}
        </span>
        <Icon icon={ChevronRight} size={16} />
      </Link>
    </li>
  );
}

/** The board's way in, drawn only for a team on CoachHelm reads. */
export function TeamReadsLink({ href }: { href: string }) {
  return (
    <Link href={href} prefetch={false} className="card ch-htrd-in" data-ch="team-reads-link">
      <span className="ch-htrd-row__t">
        <b>Team reads</b>
        <small>What the team shares, said once, and each player’s own read.</small>
      </span>
      <Icon icon={ChevronRight} size={16} />
    </Link>
  );
}
