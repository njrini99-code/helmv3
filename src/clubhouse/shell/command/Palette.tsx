'use client';

import { Command } from 'cmdk';
import { ArrowRight, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { chTrail } from '../../lib/track';
import type { ChNavFeatures, ChRole } from '../nav';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { buildCommands, nearestSection, type ChCmdGroup, type ChCommand, type ChPaletteEvent, type ChPerson, type ChRecent } from './commands';
import { rankCommands } from './rank';
import { Keys } from './Keys';

const HEADINGS: Record<ChCmdGroup, string> = { recent: 'Recent', goto: 'Go to', people: 'People', events: 'Events', actions: 'Actions' };
/** With nothing typed the palette is a launcher: where you were, and everywhere you can go. */
const IDLE: readonly ChCmdGroup[] = ['recent', 'goto'];
/** The one row that is always matched: the nearest section, offered when nothing else matches. */
const NEAREST = '__nearest';
/** Typed, it searches everything but Recent, which would only repeat Go to. */
const SEARCHING: readonly ChCmdGroup[] = ['goto', 'people', 'events', 'actions'];

/**
 * Where a coach's players are (decision 16): read when the palette first opens, so the first search can run before they
 * arrive. `idle` is a player, or nothing asked yet.
 */
export type ChPeopleState = 'idle' | 'loading' | 'ready' | 'failed';
/** The quiet line a search shows while a coach's players are still on their way, or when they didn't come. */
const PEOPLE_LINE: Partial<Record<ChPeopleState, string>> = {
  loading: 'Looking up your players…',
  failed: 'Your players didn’t load. Close this and open it again to try again.',
};

/**
 * The command palette (Cmd or Ctrl K): jump to a section, a player or start an action, from the keyboard. It is the shared
 * Modal (focus returns to whatever opened it, Escape closes it, it sits in the top layer like every Clubhouse dialog) around
 * cmdk's list, which does the matching, the arrows, Home and End, and Enter.
 *
 * It only routes: every row is an address the role's screens already have, so nothing here writes anything and
 * nobody is offered a screen they cannot open (commands.ts).
 */
export function Palette({
  open,
  onClose,
  role,
  features,
  pathname,
  people,
  peopleState = 'idle',
  events = [],
  recent,
  keyword,
}: {
  open: boolean;
  onClose: () => void;
  role: ChRole;
  features?: ChNavFeatures | null;
  pathname: string;
  people: readonly ChPerson[];
  peopleState?: ChPeopleState;
  /** A coach's tournaments and qualifiers, read with the players. */
  events?: readonly ChPaletteEvent[];
  recent: readonly ChRecent[];
  /** Counts the times it has opened, so each opening starts with an empty search. */
  keyword: number;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Search Clubhouse" width={580} initialFocus=".ch-cmd-input">
      <PaletteBody key={keyword} onClose={onClose} role={role} features={features} pathname={pathname} people={people} peopleState={peopleState} events={events} recent={recent} />
    </Modal>
  );
}

function PaletteBody({
  onClose,
  role,
  features,
  pathname,
  people,
  peopleState,
  events,
  recent,
}: {
  onClose: () => void;
  role: ChRole;
  features?: ChNavFeatures | null;
  pathname: string;
  people: readonly ChPerson[];
  peopleState: ChPeopleState;
  events: readonly ChPaletteEvent[];
  recent: readonly ChRecent[];
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const commands = buildCommands({ role, pathname, people, events, recent, features });
  const searching = q.trim().length > 0;
  // Ranked here, not by cmdk, which kept groups in written order: the best match is the first row (rank.ts).
  const groups = rankCommands(commands, q, searching ? SEARCHING : IDLE);
  const noMatches = searching && groups.length === 0;
  const near = noMatches ? nearestSection(q.trim(), role, features) : null;
  // The first row is the lit one, whatever arrives under it (players and events land after the first keystrokes).
  const top = groups[0]?.rows[0]?.id ?? (near ? NEAREST : '');
  const [lit, setLit] = useState(top);
  const [litFor, setLitFor] = useState(top);
  if (litFor !== top) {
    setLitFor(top);
    setLit(top);
  }
  // Only a coach's search waits on players; with nothing typed, People isn't shown at all.
  // A failed seed says nothing once the Roster has published players: the list is there to search.
  const peopleLine = role === 'coach' && searching && !(peopleState === 'failed' && people.length > 0) ? PEOPLE_LINE[peopleState] : undefined;

  // A pick goes somewhere, and navigation is silent (D-70, A14).
  const go = (c: ChCommand) => {
    chTrail('command palette go', { group: c.group });
    onClose();
    router.push(c.href, { scroll: false });
  };

  return (
    <Command
      className="ch-cmd"
      label="Search Clubhouse"
      loop
      shouldFilter={false}
      value={lit}
      onValueChange={setLit}
    >
      <div className="ch-cmd-field">
        <Icon icon={Search} size={16} />
        <Command.Input className="ch-cmd-input" value={q} onValueChange={setQ} placeholder="Search, or jump to a section or player" autoComplete="off" spellCheck={false} />
        <Keys keys={['Esc']} />
      </div>
      <Command.List className="ch-cmd-list">
        {noMatches && <NoResults query={q} near={near} onGo={go} peopleLine={peopleLine} />}
        {groups.map(({ group, rows }) => {
          return (
            <Command.Group key={group} heading={HEADINGS[group]}>
              {rows.map((c) => (
                <Command.Item key={c.id} value={c.id} className="ch-cmd-item" onSelect={() => go(c)}>
                  {c.avatarName ? <Avatar name={c.avatarName} size={22} /> : <Icon icon={c.icon} size={16} />}
                  <span className="ch-cmd-label">{c.label}</span>
                  {c.detail && <span className="ch-cmd-detail">{c.detail}</span>}
                  {c.keys && <Keys keys={c.keys} />}
                </Command.Item>
              ))}
            </Command.Group>
          );
        })}
        {/* Results already showing: the players still on their way are said once, quietly, under them. */}
        {!noMatches && peopleLine && (
          <div className="ch-cmd-empty" role="status">
            <p>{peopleLine}</p>
          </div>
        )}
      </Command.List>
      <div className="ch-cmd-foot" aria-hidden="true">
        <span>
          <Keys keys={['↑', '↓']} /> to move
        </span>
        <span>
          <Keys keys={['↵']} /> to open
        </span>
        <span>
          <Keys keys={['Esc']} /> to close
        </span>
      </div>
    </Command>
  );
}

/**
 * Nothing matched: said calmly, with the nearest section as a row to take (it is the one item, so Enter takes it).
 */
function NoResults({ query, near, onGo, peopleLine }: { query: string; near: ReturnType<typeof nearestSection>; onGo: (c: ChCommand) => void; peopleLine: string | undefined }) {
  const q = query.trim();
  return (
    <>
      <div className="ch-cmd-empty" role="status">
        <p>
          Nothing matches <b>“{q}”</b>.
        </p>
        <p>{near ? `The closest section is ${near.label}.` : 'Try a section, a player or an action.'}</p>
        {/* A coach's players are read as the palette opens (decision 16): while they are on their way, or if they didn't
            come, say so rather than look as if there are none. */}
        {peopleLine && <p>{peopleLine}</p>}
      </div>
      {near && (
        <Command.Item
          value={NEAREST}
          className="ch-cmd-item ch-cmd-near"
          onSelect={() => onGo({ id: `goto:${near.id}`, group: 'goto', label: near.label, href: near.href, icon: near.icon, keywords: [] })}
        >
          <Icon icon={near.icon} size={16} />
          <span className="ch-cmd-label">Go to {near.label}</span>
          <Icon icon={ArrowRight} size={15} />
        </Command.Item>
      )}
    </>
  );
}
