'use client';

import { LayoutGrid, List, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { ChPlayerRoster, ChTeammate } from '../../data/roster-player';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { InlineNotice } from '../../ui/Notices';
import { Icon } from '../../ui/Icon';
import { Segmented } from '../../ui/Segmented';
import { SearchField } from '../../ui/SearchField';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { haptic } from '../../lib/haptics';
import { NO_DATA } from '../../lib/format';
import { useChPhone } from '../../lib/use-phone';
import { formatHcp } from './format';
import { TeamRosterPhone } from './TeamRosterPhone';
import { sortTeammates, teammateLine, type TeamSort } from './team';
import '../../styles/roster.css';

type View = 'faces' | 'list';
// The same key as the coach's roster: the layout is a preference for this screen on this device.
const VIEW_KEY = 'ch-roster-view';

/**
 * The player's Roster (owner, 2026-10-01: "the same thing as coach except they can't click"): the coach's screen
 * with nothing to open and nothing to do. No card or row is a link or a button, there is no invite, export, join
 * request, player panel or "needs a look", and a teammate shows what Fairway's player roster did (name, class year
 * and handicap), never scores. Search, the layout and the sort only change what this screen lists.
 */
export function TeamRoster({ data }: { data: ChPlayerRoster }) {
  const router = useRouter();
  const phone = useChPhone();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<TeamSort>('name');
  const [view, setView] = useState<View>('faces');

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === 'list' || v === 'faces') setView(v);
    } catch {
      /* private mode: the default view is fine */
    }
  }, []);
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* not persisted; still switches */
    }
  };

  const { players } = data;
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sortTeammates(
      players.filter((p) => p.name.toLowerCase().includes(needle)),
      sort,
    );
  }, [players, q, sort]);

  if (phone) return <TeamRosterPhone data={data} onRetry={() => router.refresh()} />;

  return (
    <main className="ch-rs">
      <header className="ch-rs-head">
        <div>
          <span className="ch-rs-team">
            <span className="ch-rs-team__stack" aria-hidden="true">
              {players.slice(0, 7).map((p) => (
                <Avatar key={p.id} name={p.name} size={30} />
              ))}
            </span>
            <span className="ch-rs-team__name">{[data.teamName, data.season].filter(Boolean).join(' · ')}</span>
          </span>
          <h1 className="ch-display">Your team.</h1>
          {!data.playersError && (
            <p>
              <span className="ch-num">{players.length}</span> {players.length === 1 ? 'player' : 'players'} on the roster.
            </p>
          )}
        </div>
      </header>

      {data.playersError ? (
        <InlineNotice
          code="CH-3210"
          title="The roster didn't load."
          body="Your team is safe. Try again, and if it keeps happening the error has already been reported."
          onRetry={() => router.refresh()}
        />
      ) : players.length === 0 ? (
        <EmptyState size="page" code="CH-3307" icon={Users} title="No one on the roster yet" body="Your teammates appear here once your coach adds them." />
      ) : (
        <>
          <div className="ch-rs-bar">
            <SearchField className="ch-rs-search" value={q} onChange={setQ} placeholder="Search players by name" label="Search players" />
            <div className="ch-rs-bar__r">
              <div className="ch-rs-vt" role="group" aria-label="Layout">
                {(
                  [
                    ['faces', LayoutGrid, 'Team view'],
                    ['list', List, 'List view'],
                  ] as const
                ).map(([v, icon, label]) => (
                  <button
                    key={v}
                    type="button"
                    className="ch-rs-vt__b"
                    aria-pressed={view === v}
                    aria-label={label}
                    onClick={() => {
                      if (view !== v) haptic('select');
                      changeView(v);
                    }}
                  >
                    <Icon icon={icon} size={15} />
                  </button>
                ))}
              </div>
              <Segmented<TeamSort>
                size="sm"
                label="Sort players"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'name', label: 'Name' },
                  { value: 'class', label: 'Class' },
                  { value: 'hcp', label: 'Handicap' },
                ]}
              />
            </div>
          </div>

          <SectionBoundary surface="roster.team" label="The roster" code="CH-3211">
            <TeammateList rows={rows} view={view} q={q} onClearSearch={() => setQ('')} />
          </SectionBoundary>
        </>
      )}
    </main>
  );
}

/** The teammates, as cards or a table: plain text, never a control (CH-3807). Its own component so the boundary contains it. */
function TeammateList({ rows, view, q, onClearSearch }: { rows: ChTeammate[]; view: View; q: string; onClearSearch: () => void }) {
  if (rows.length === 0) {
    return (
      <div className="ch-rs-empty ch-sheet">
        <EmptyState
          compact
          code="CH-3302"
          title={`No players match “${q.trim()}”`}
          action={
            <Button size="sm" onClick={onClearSearch}>
              Show everyone
            </Button>
          }
        />
      </div>
    );
  }
  if (view === 'faces') {
    return (
      <ul className="ch-rs-faces ch-rs-faces--team" aria-label="Players" data-ch-code="CH-3807">
        {rows.map((p) => (
          <li key={p.id} className="ch-rs-face ch-rs-face--static">
            <span className="ch-rs-face__top" />
            <span className="ch-rs-face__av">
              <Avatar name={p.name} size={76} />
            </span>
            <span className="ch-rs-face__name">{p.name}</span>
            <span className="ch-rs-face__meta">{teammateLine(p) || ' '}</span>
            <span className="ch-rs-face__figs ch-rs-face__figs--one">
              <span>
                <b className="ch-num">{formatHcp(p.handicap)}</b>HCP
              </span>
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="ch-rs-list ch-rs-list--team ch-sheet" role="table" aria-label="Roster" data-ch-code="CH-3807">
      <div className="ch-rs-row ch-rs-row--head ch-well-soft" role="row">
        <span role="columnheader">Player</span>
        <span role="columnheader">Class</span>
        <span role="columnheader" className="r">
          HCP
        </span>
      </div>
      {rows.map((p) => (
        <div key={p.id} role="row" className="ch-rs-row">
          <span role="cell" className="ch-rs-who__cell">
            <span className="ch-rs-who ch-rs-who--static">
              <Avatar name={p.name} size={40} />
              <span>
                <b>{p.name}</b>
                {p.isYou && <span className="ch-rs-who__m">You</span>}
              </span>
            </span>
          </span>
          <span role="cell" className="ch-rs-num2">
            {p.classYear ?? NO_DATA}
          </span>
          <span role="cell" className="r ch-num ch-rs-num2">
            {formatHcp(p.handicap)}
          </span>
        </div>
      ))}
    </div>
  );
}
