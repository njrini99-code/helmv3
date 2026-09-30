'use client';

import { UserPlus, Users } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { ChRoster, ChRosterPlayer } from '../../data/roster';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { FormLine } from '../../ui/FormLine';
import { InlineNotice } from '../../ui/Notices';
import { Segmented } from '../../ui/Segmented';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { formatFixed } from '../../lib/format';
import { RosterRequests } from './RosterRequests';
import { RosterProfile } from './RosterProfile';
import { formatHcp, rowNote } from './format';
import type { ChJoinRequestsState } from './useJoinRequests';

type PhoneSort = 'avg' | 'sg' | 'name';

const lastName = (n: string) => n.split(' ').slice(-1)[0] ?? n;
/** Ascending, with missing values last. */
const nullsLast = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b);

function sortPlayers(list: ChRosterPlayer[], sort: PhoneSort): ChRosterPlayer[] {
  return [...list].sort((a, b) =>
    sort === 'name'
      ? lastName(a.name).localeCompare(lastName(b.name))
      : sort === 'sg'
        ? nullsLast(a.sgPerRound == null ? null : -a.sgPerRound, b.sgPerRound == null ? null : -b.sgPerRound)
        : nullsLast(a.avg, b.avg),
  );
}

/**
 * The phone Roster (owner design, docs/clubhouse/phone/roster.md): a sorted
 * list of active players, then Inactive, and a pushed profile when the URL has
 * `?player=`. Same data, actions and catalog as desktop.
 *
 * The top bar's invite action, the join requests banner and sheet, and the
 * profile's action sheet come with the phone foundation. Until then the
 * header keeps Invite players and the requests keep their inline card.
 */
export function RosterPhone({
  data,
  players,
  jr,
  openId,
  onOpen,
  onInvite,
  onRemove,
  onRetry,
  children,
}: {
  data: ChRoster;
  players: ChRosterPlayer[];
  jr: ChJoinRequestsState;
  openId: string | null;
  onOpen: (id: string) => void;
  onInvite: () => void;
  onRemove: (p: ChRosterPlayer) => void;
  onRetry: () => void;
  /** The dialogs (invite, remove confirm), shared with desktop. */
  children?: ReactNode;
}) {
  const [sort, setSort] = useState<PhoneSort>('avg');
  const open = openId ? players.find((p) => p.id === openId) : undefined;
  const active = useMemo(() => sortPlayers(players.filter((p) => p.status === 'active'), sort), [players, sort]);
  const inactive = useMemo(() => sortPlayers(players.filter((p) => p.status === 'inactive'), sort), [players, sort]);

  return (
    <main className="ch-rsm" aria-label={open ? open.name : 'Roster'}>
      {open ? (
        <SectionBoundary surface="roster.peek" label="The player panel" code="CH-3206">
          <RosterProfile p={open} notesLocked={data.notesError} statsError={data.statsError} onRemove={onRemove} />
        </SectionBoundary>
      ) : (
        <>
          <header className="ch-rsm-head">
            <div className="ch-rsm-head__t">
              {!data.playersError && (
                <span className="ch-rsm-kicker">
                  {data.teamName} · <span className="ch-num">{players.filter((p) => p.status === 'active').length}</span> active
                </span>
              )}
              <h1>Roster</h1>
            </div>
            <Button size="sm" leftIcon={UserPlus} onClick={onInvite}>
              Invite players
            </Button>
          </header>

          <SectionBoundary surface="roster.requests" label="Join requests" code="CH-3204">
            <RosterRequests teamName={data.teamName} jr={jr} error={data.requestsError} onRetry={onRetry} />
          </SectionBoundary>

          {data.statsError && (
            <InlineNotice
              code="CH-3202"
              title="Season stats didn't load."
              body="The roster is complete, but averages, form and strokes gained are missing until the rounds load. The error has been reported."
              onRetry={onRetry}
            />
          )}

          {data.playersError ? (
            <InlineNotice
              code="CH-3201"
              title="The roster didn't load."
              body="Your players are safe. Try again, and if it keeps happening the error has already been reported."
              onRetry={onRetry}
            />
          ) : players.length === 0 ? (
            <div className="ch-rsm-panel">
              <EmptyState
                code="CH-3301"
                icon={Users}
                title="No players on the roster yet."
                body="Share your join code and approve requests as they arrive. Players appear here once approved."
                action={
                  <Button variant="primary" leftIcon={UserPlus} onClick={onInvite}>
                    Invite players
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <div className="ch-rsm-sort">
                <span>Sort by</span>
                <Segmented<PhoneSort>
                  size="sm"
                  label="Sort players"
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: 'avg', label: 'Avg', aria: 'Scoring average' },
                    { value: 'sg', label: 'SG', aria: 'Strokes gained' },
                    { value: 'name', label: 'Name' },
                  ]}
                />
              </div>
              <SectionBoundary surface="roster.list" label="The roster" code="CH-3205">
                <RosterPhoneList active={active} inactive={inactive} statsError={data.statsError} onOpen={onOpen} />
              </SectionBoundary>
            </>
          )}
        </>
      )}
      {children}
    </main>
  );
}

function RosterPhoneList({
  active,
  inactive,
  statsError,
  onOpen,
}: {
  active: ChRosterPlayer[];
  inactive: ChRosterPlayer[];
  statsError: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      {active.length > 0 && (
        <ul className="ch-rsm-panel ch-rsm-list" aria-label="Active players">
          {active.map((p) => (
            <li key={p.id}>
              <RosterPhoneRow p={p} statsError={statsError} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
      {inactive.length > 0 && (
        <>
          <h2 className="ch-rsm-sec" id="ch-rsm-inactive">
            Inactive
          </h2>
          <ul className="ch-rsm-panel ch-rsm-list" aria-labelledby="ch-rsm-inactive">
            {inactive.map((p) => (
              <li key={p.id}>
                <RosterPhoneRow p={p} statsError={statsError} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** One player: avatar, name, class and note, a form spark from three rounds (D-57), average and handicap. */
export function RosterPhoneRow({ p, statsError, onOpen }: { p: ChRosterPlayer; statsError: boolean; onOpen: (id: string) => void }) {
  const note = rowNote(p, statsError);
  const label = [
    p.name,
    p.classYear,
    p.status === 'inactive' ? 'inactive' : null,
    note?.text,
    p.avg != null ? `average ${formatFixed(p.avg)}` : null,
    p.handicap != null ? `handicap ${formatHcp(p.handicap)}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <button type="button" className="ch-rsm-row" aria-label={label} data-ch-code="CH-3806" onClick={() => onOpen(p.id)}>
      <Avatar name={p.name} size={40} />
      <span className="ch-rsm-row__b">
        <b>{p.name}</b>
        <span className={note?.tone ? `is-${note.tone}` : undefined}>{[p.classYear, note?.text].filter(Boolean).join(' · ') || ' '}</span>
      </span>
      {p.trend.length >= 3 && (
        <span className="ch-rsm-row__spark" aria-hidden="true">
          <FormLine data={p.trend} width={48} height={20} earlyBelow={3} bare label={`${p.name} form`} />
        </span>
      )}
      <span className="ch-rsm-row__v">
        <b className="ch-num">{formatFixed(p.avg)}</b>
        <span className="ch-num">{formatHcp(p.handicap)} hcp</span>
      </span>
    </button>
  );
}
