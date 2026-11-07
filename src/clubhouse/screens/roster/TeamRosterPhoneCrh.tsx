'use client';

import { RotateCw, Users } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChPlayerRoster, ChTeammate } from '../../data/roster-player';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { CrhStateBlock } from '../../ui/CrhStateBlock';
import { GroupList, GroupRow } from '../../ui/GroupList';
import { LargeTitle, LargeTitleContext } from '../../ui/LargeTitle';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { Segmented } from '../../ui/Segmented';
import { Surface } from '../../ui/Surface';
import { PhoneTop } from '../../shell/phone-chrome';
import { formatHcp } from '../../lib/format';
import { TERMS } from '../../lib/glossary';
import { useFlipRows } from './use-flip-rows';
import { RosterTeamCard } from './RosterTeamCard';
import { yearKeyOf, yearLineOf, type RosterClock } from './format';
import { SORT_HCP, sortTeammates, type TeamSort } from './team';

/**
 * The player's phone Roster behind the lane's flag (06 10): the team card with active and class mix only, a sticky sort, then Coaches and
 * Players. Rows are plain text. The player's loader selects no score, average, strokes gained, form, availability or request, so none of
 * those can reach this tree (SHARED-11).
 */
export function TeamRosterPhoneCrh({ data, onRetry }: { data: ChPlayerRoster; onRetry: () => void }) {
  const clock = data.clock;
  const [sort, setSort] = useState<TeamSort>('name');
  const rows = useMemo(() => sortTeammates(data.players, sort), [data.players, sort]);
  const solo = data.players.length === 1 && data.players[0]!.isYou;
  const listRef = useRef<HTMLDivElement>(null);
  const capture = useFlipRows(listRef, sort);
  const choose = useCallback(
    (v: TeamSort) => {
      capture();
      setSort(v);
    },
    [capture],
  );
  return (
    <main className="ch-rsm ch-rsx" data-ch-crh="on" aria-label="Roster">
      <PhoneTop title="Roster" start />
      <div className="ch-rsm-page">
        <header className="ch-rsm-head">
          <LargeTitle as="p" hidden>
            Roster
          </LargeTitle>
          {!data.teamError && <LargeTitleContext>{data.teamName}</LargeTitleContext>}
        </header>

        {data.playersError ? (
          <Surface variant="card" level={2} padded={false} title="Teammates">
            <CrhStateBlock kind="failed" code="CH-3210" title="The roster didn’t load" body="Try again. Nothing was lost.">
              <Button leftIcon={RotateCw} onClick={onRetry}>
                Try again
              </Button>
            </CrhStateBlock>
          </Surface>
        ) : data.players.length === 0 ? (
          <Surface variant="card" level={2} padded={false} title="Teammates">
            <CrhStateBlock code="CH-3307" icon={Users} title="No teammates yet" body="Your coach adds players to the team. They’ll show here." />
          </Surface>
        ) : (
          <>
            <RosterTeamCard viewer="player" season={data.season} players={data.players} clock={clock} />
            {!!data.coaches?.length && (
              <div className="ch-rsx-sec is-tight">
                <Surface variant="card" level={2} padded={false} title="Coaches" actions={<span className="ch-rsx-meta ch-num">{data.coaches.length}</span>}>
                  <GroupList>
                    {data.coaches.map((c) => (
                      <GroupRow key={c.id} className="ch-rsx-prow">
                        <Avatar name={c.name} size="md" />
                        <span className="ch-rsx-row__b">
                          <b>{c.name}</b>
                          <span>{c.role}</span>
                        </span>
                      </GroupRow>
                    ))}
                  </GroupList>
                </Surface>
              </div>
            )}
            {/* Directly above the players it sorts, not riding over the coaches (CRH-30). */}
            {!solo && (
              <div className="ch-stickybar ch-rsx-sort">
                <Segmented<TeamSort>
                  block
                  label="Sort by"
                  value={sort}
                  onChange={choose}
                  options={[
                    { value: 'name', label: 'Name' },
                    { value: 'class', label: 'Class' },
                    { value: SORT_HCP, label: TERMS.handicap.short, aria: `${TERMS.handicap.short}, ${TERMS.handicap.long.toLowerCase()}` },
                  ]}
                />
              </div>
            )}
            <SectionBoundary surface="roster.team" label="The roster" code="CH-3211">
              <div ref={listRef} className="ch-rsx-sec is-tight">
                <Surface
                  variant="card"
                  level={2}
                  padded={false}
                  title="Players"
                  actions={<span className="ch-rsx-meta ch-num">{data.players.length}</span>}
                  footerNote={solo ? <span data-ch-code="CH-3309">You’re the first one here. Teammates show up as they join.</span> : undefined}
                >
                  <GroupList>
                    {rows.map((p) => (
                      <TeammateRowCrh key={p.id} p={p} clock={clock} />
                    ))}
                  </GroupList>
                </Surface>
              </div>
            </SectionBoundary>
          </>
        )}
      </div>
    </main>
  );
}

/** One teammate: year coin, name, year line, a You chip on the viewer's own row, handicap. Text, not a button (06 CP-6.10). */
function TeammateRowCrh({ p, clock }: { p: ChTeammate; clock: RosterClock }) {
  const line = yearLineOf(p.gradYear, clock);
  return (
    <GroupRow twoLine className="ch-rsx-prow">
      <span data-flip={p.id} className="ch-rsx-prow__in">
        <Avatar name={p.name} id={p.id} size="md" year={yearKeyOf(p.gradYear, clock)} />
        <span className="ch-rsx-row__b">
          <b>{p.name}</b>
          <span>
            {p.isYou && <span className="ch-rsx-chip">You</span>}
            {line ?? ' '}
          </span>
        </span>
        <span className="ch-rsm-row__v ch-rsx-row__v">
          <b className="ch-num">{formatHcp(p.handicap)}</b>
          <span>{TERMS.handicap.short}</span>
        </span>
      </span>
    </GroupRow>
  );
}
