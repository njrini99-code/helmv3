'use client';

import { useMemo, useState } from 'react';
import type { ChPlayerRoster, ChTeammate } from '../../data/roster-player';
import { Avatar } from '../../ui/Avatar';
import { EmptyState } from '../../ui/States';
import { InlineNotice } from '../../ui/Notices';
import { Segmented } from '../../ui/Segmented';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { PhoneTop } from '../../shell/phone-chrome';
import { formatHcp } from '../../lib/format';
import { sortTeammates, teammateLine, type TeamSort } from './team';
import { TERMS } from '../../lib/glossary';

/**
 * The player's phone Roster: the coach's phone list (docs/clubhouse/phone/roster.md) as plain text. The top bar
 * has the back link and no action; a row is not a button, so nothing on this screen opens or does anything. The
 * sort is the only control. Same page structure as RosterPhone, so the phone chrome behaves the same.
 */
export function TeamRosterPhone({ data, onRetry }: { data: ChPlayerRoster; onRetry: () => void }) {
  const [sort, setSort] = useState<TeamSort>('name');
  const rows = useMemo(() => sortTeammates(data.players, sort), [data.players, sort]);
  // A roster of one (CH-3309): the player themselves, on a new team. Nothing to sort.
  const solo = data.players.length === 1 && data.players[0]!.isYou;

  return (
    <main className="ch-rsm" aria-label="Roster">
      <PhoneTop title="Roster" start />
      <div className="ch-rsm-page">
        <header className="ch-rsm-head">
          {!data.playersError && (
            <span className="ch-rsm-kicker">
              {data.teamName}
              {/* With nobody on the roster the count is 0: the team's name says enough (wave 10). */}
              {data.players.length > 0 && (
                <>
                  {' '}
                  · <span className="ch-num">{data.players.length}</span> {data.players.length === 1 ? 'player' : 'players'}
                </>
              )}
            </span>
          )}
          {/* The top bar carries the page's heading; this is the design's large title. */}
          <p className="ch-rsm-title" aria-hidden="true">
            Roster
          </p>
        </header>

        <TeamCoachesPhone coaches={data.coaches} />

        {data.playersError ? (
          <InlineNotice
            code="CH-3210"
            title="The roster didn’t load"
            body="Your team is safe. Try again."
            onRetry={onRetry}
          />
        ) : data.players.length === 0 ? (
          <EmptyState size="page" code="CH-3307" shape="people" title="No one on the roster yet" body="Teammates show up here as they join with the team code." />
        ) : (
          <>
            {!solo && (
              <div className="ch-rsm-sort">
                <span>Sort by</span>
                <Segmented<TeamSort> redraws
                  size="sm"
                  label="Sort players"
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: 'name', label: 'Name' },
                    { value: 'class', label: 'Class' },
                    { value: 'hcp', label: TERMS.handicap.short, aria: `${TERMS.handicap.short}, ${TERMS.handicap.long.toLowerCase()}` },
                  ]}
                />
              </div>
            )}
            <SectionBoundary surface="roster.team" label="The roster" code="CH-3211">
              <ul className="ch-rsm-panel ch-rsm-list" aria-label="Players" data-ch-code="CH-3807">
                {rows.map((p) => (
                  <li key={p.id}>
                    <TeammateRow p={p} />
                  </li>
                ))}
              </ul>
            </SectionBoundary>
            {solo && (
              <p className="ch-rs-solo" data-ch-code="CH-3309">
                You’re the first one here. Teammates show up as they join.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/** The team's coaches above the players (wave 7): name and role, plain rows. Left out when the staff didn't load or there is none. */
function TeamCoachesPhone({ coaches }: { coaches: ChPlayerRoster['coaches'] }) {
  if (!coaches?.length) return null;
  return (
    <>
      <h2 className="ch-rsm-sec is-first" id="ch-rsm-coaches">
        Coaches
      </h2>
      <ul className="ch-rsm-panel ch-rsm-list" aria-labelledby="ch-rsm-coaches" data-ch-code="CH-3808">
        {coaches.map((c) => (
          <li key={c.id}>
            <div className="ch-rsm-row ch-rsm-row--static">
              <Avatar name={c.name} size="lg" />
              <span className="ch-rsm-row__b">
                <b>{c.name}</b>
                <span>{c.role}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <h2 className="ch-rsm-sec" id="ch-rsm-players">
        Players
      </h2>
    </>
  );
}

/** One teammate: avatar, name, class, handicap. A plain row, not a button (CH-3807). */
function TeammateRow({ p }: { p: ChTeammate }) {
  return (
    <div className="ch-rsm-row ch-rsm-row--static">
      <Avatar name={p.name} size="lg" />
      <span className="ch-rsm-row__b">
        <b>{p.name}</b>
        <span>{teammateLine(p) || ' '}</span>
      </span>
      <span className="ch-rsm-row__v">
        <b className="ch-num">{formatHcp(p.handicap)}</b>
        <span>{TERMS.handicap.short}</span>
      </span>
    </div>
  );
}
