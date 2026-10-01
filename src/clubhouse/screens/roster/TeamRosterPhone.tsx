'use client';

import { Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ChPlayerRoster, ChTeammate } from '../../data/roster-player';
import { Avatar } from '../../ui/Avatar';
import { EmptyState } from '../../ui/States';
import { InlineNotice } from '../../ui/Notices';
import { Segmented } from '../../ui/Segmented';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { PhoneTop, useBackFromMore } from '../../shell/phone-chrome';
import { formatHcp } from './format';
import { sortTeammates, teammateLine, type TeamSort } from './team';

/**
 * The player's phone Roster: the coach's phone list (docs/clubhouse/phone/roster.md) as plain text. The top bar
 * has the back link and no action; a row is not a button, so nothing on this screen opens or does anything. The
 * sort is the only control. Same page structure as RosterPhone, so the phone chrome behaves the same.
 */
export function TeamRosterPhone({ data, onRetry }: { data: ChPlayerRoster; onRetry: () => void }) {
  const backFromMore = useBackFromMore();
  const [sort, setSort] = useState<TeamSort>('name');
  const rows = useMemo(() => sortTeammates(data.players, sort), [data.players, sort]);

  return (
    <main className="ch-rsm" aria-label="Roster">
      <PhoneTop title="Roster" back={{ label: 'More', onBack: backFromMore }} />
      <div className="ch-rsm-page">
        <header className="ch-rsm-head">
          {!data.playersError && (
            <span className="ch-rsm-kicker">
              {data.teamName} · <span className="ch-num">{data.players.length}</span> {data.players.length === 1 ? 'player' : 'players'}
            </span>
          )}
          {/* The top bar carries the page's heading; this is the design's large title. */}
          <p className="ch-rsm-title" aria-hidden="true">
            Roster
          </p>
        </header>

        {data.playersError ? (
          <InlineNotice
            code="CH-3210"
            title="The roster didn't load."
            body="Your team is safe. Try again, and if it keeps happening the error has already been reported."
            onRetry={onRetry}
          />
        ) : data.players.length === 0 ? (
          <EmptyState size="page" code="CH-3307" icon={Users} title="No one on the roster yet" body="Your teammates appear here once your coach adds them." />
        ) : (
          <>
            <div className="ch-rsm-sort">
              <span>Sort by</span>
              <Segmented<TeamSort>
                size="sm"
                label="Sort players"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'name', label: 'Name' },
                  { value: 'class', label: 'Class' },
                  { value: 'hcp', label: 'HCP', aria: 'HCP, handicap' },
                ]}
              />
            </div>
            <SectionBoundary surface="roster.team" label="The roster" code="CH-3211">
              <ul className="ch-rsm-panel ch-rsm-list" aria-label="Players" data-ch-code="CH-3807">
                {rows.map((p) => (
                  <li key={p.id}>
                    <TeammateRow p={p} />
                  </li>
                ))}
              </ul>
            </SectionBoundary>
          </>
        )}
      </div>
    </main>
  );
}

/** One teammate: avatar, name, class, handicap. A plain row, not a button (CH-3807). */
function TeammateRow({ p }: { p: ChTeammate }) {
  return (
    <div className="ch-rsm-row ch-rsm-row--static">
      <Avatar name={p.name} size={40} />
      <span className="ch-rsm-row__b">
        <b>{p.name}</b>
        <span>{teammateLine(p) || ' '}</span>
      </span>
      <span className="ch-rsm-row__v">
        <b className="ch-num">{formatHcp(p.handicap)}</b>
        <span>hcp</span>
      </span>
    </div>
  );
}
