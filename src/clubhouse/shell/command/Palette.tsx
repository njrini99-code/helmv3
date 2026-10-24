'use client';

import { Command, defaultFilter } from 'cmdk';
import { ArrowRight, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { chTrail } from '../../lib/track';
import type { ChRole } from '../nav';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { buildCommands, nearestSection, type ChCmdGroup, type ChCommand, type ChPerson, type ChRecent } from './commands';
import { Keys } from './Keys';

const HEADINGS: Record<ChCmdGroup, string> = { recent: 'Recent', goto: 'Go to', people: 'People', actions: 'Actions' };
/** With nothing typed the palette is a launcher: where you were, and everywhere you can go. */
const IDLE: readonly ChCmdGroup[] = ['recent', 'goto'];
/** The one row that is always matched: the nearest section, offered when nothing else matches. */
const NEAREST = '__nearest';
/** What cmdk matches a row on: its name first, then its other words. */
const textOf = (c: ChCommand) => [c.label, ...c.keywords].join(' ');
/** Typed, it searches everything but Recent, which would only repeat Go to. */
const SEARCHING: readonly ChCmdGroup[] = ['goto', 'people', 'actions'];

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
  pathname,
  people,
  recent,
  keyword,
}: {
  open: boolean;
  onClose: () => void;
  role: ChRole;
  pathname: string;
  people: readonly ChPerson[];
  recent: readonly ChRecent[];
  /** Counts the times it has opened, so each opening starts with an empty search. */
  keyword: number;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Search Clubhouse" width={580} initialFocus=".ch-cmd-input">
      <PaletteBody key={keyword} onClose={onClose} role={role} pathname={pathname} people={people} recent={recent} />
    </Modal>
  );
}

function PaletteBody({ onClose, role, pathname, people, recent }: { onClose: () => void; role: ChRole; pathname: string; people: readonly ChPerson[]; recent: readonly ChRecent[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const commands = buildCommands({ role, pathname, people, recent });
  const searching = q.trim().length > 0;
  const shown = searching ? SEARCHING : IDLE;
  // Worked out here, not read from cmdk's list: the nearest-section row is itself an item, and a list is never "empty" with it in.
  const noMatches = searching && !commands.some((c) => shown.includes(c.group) && defaultFilter(textOf(c), q.trim()) > 0);

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
      // cmdk scores `keywords` as the text, so each row is found by its name first and its other words after.
      filter={(value, search, keywords) => (value === NEAREST ? 1 : defaultFilter(keywords?.join(' ') ?? value, search))}
    >
      <div className="ch-cmd-field">
        <Icon icon={Search} size={16} />
        <Command.Input className="ch-cmd-input" value={q} onValueChange={setQ} placeholder="Search, or jump to a section or player" autoComplete="off" spellCheck={false} />
        <Keys keys={['Esc']} />
      </div>
      <Command.List className="ch-cmd-list">
        {noMatches && <NoResults query={q} role={role} onGo={go} peopleKnown={people.length > 0} />}
        {shown.map((group) => {
          const rows = commands.filter((c) => c.group === group);
          if (!rows.length) return null;
          return (
            <Command.Group key={group} heading={HEADINGS[group]}>
              {rows.map((c) => (
                <Command.Item key={c.id} value={c.id} keywords={[c.label, ...c.keywords]} className="ch-cmd-item" onSelect={() => go(c)}>
                  {c.avatarName ? <Avatar name={c.avatarName} size={22} /> : <Icon icon={c.icon} size={16} />}
                  <span className="ch-cmd-label">{c.label}</span>
                  {c.detail && <span className="ch-cmd-detail">{c.detail}</span>}
                  {c.keys && <Keys keys={c.keys} />}
                </Command.Item>
              ))}
            </Command.Group>
          );
        })}
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
function NoResults({ query, role, onGo, peopleKnown }: { query: string; role: ChRole; onGo: (c: ChCommand) => void; peopleKnown: boolean }) {
  const q = query.trim();
  const near = nearestSection(q, role);
  return (
    <>
      <div className="ch-cmd-empty" role="status">
        <p>
          Nothing matches <b>“{q}”</b>.
        </p>
        <p>{near ? `The closest section is ${near.label}.` : 'Try a section, a player or an action.'}</p>
        {/* A coach's players come from the roster they have opened (people.ts): say so rather than look as if there are none. */}
        {role === 'coach' && !peopleKnown && <p>Players appear here once you have opened the Roster.</p>}
      </div>
      {near && (
        <Command.Item
          value={NEAREST}
          keywords={[q]}
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
