'use client';

/** Fairway · Roster · FairwayCoachRoster (C2/C3/C4/C5/C9/C10) — coach roster shell. */

import * as React from 'react';
import { Download } from 'lucide-react';

import { Segmented } from '@/components/fairway/controls/segmented';
import { Button } from '@/components/fairway/controls/button';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Chip } from '@/components/fairway/controls/badge';
import { SearchField } from '@/components/fairway/command/search-field';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import type { CoachPlayerIntent } from '@/lib/coachhelm/v3/intent/types';
import type { JoinRequestData } from '@/app/golf/actions/teams';
import { exportRosterCSV } from '@/components/golf/roster/RosterToolbar';
import { FairwayPlayerCard, type RosterPlayer } from './FairwayPlayerCard';
import { FairwayInvitePlayerButton } from './FairwayInvitePlayerButton';
import { FairwayJoinRequests } from './FairwayJoinRequests';

export interface FairwayCoachRosterProps {
  players: RosterPlayer[];
  teamName: string;
  inviteCode: string | null;
  intents: Record<string, CoachPlayerIntent>;
  joinRequests: JoinRequestData[];
}

type SortField = 'name' | 'avg' | 'handicap' | 'rounds';
const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'avg', label: 'Avg score' },
  { value: 'handicap', label: 'Handicap' },
  { value: 'rounds', label: 'Rounds' },
] as const;

export function FairwayCoachRoster({ players, teamName, inviteCode, intents, joinRequests }: FairwayCoachRosterProps) {
  const [sort, setSort] = React.useState<SortField>('name');
  const [query, setQuery] = React.useState('');

  // P253 — name search/filter. A roster is a list surface, so a coach overseeing
  // a large dev squad needs a way to find a player beyond scrolling (Nielsen
  // #6/#7). Case-insensitive match across first + last name.
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) =>
      `${p.first_name ?? ''} ${p.last_name ?? ''}`.toLowerCase().includes(q),
    );
  }, [players, query]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sort) {
        case 'avg':
          return (a.avg_score || Infinity) - (b.avg_score || Infinity);
        case 'handicap':
          return (a.handicap ?? Infinity) - (b.handicap ?? Infinity);
        case 'rounds':
          return (b.rounds_count ?? 0) - (a.rounds_count ?? 0);
        default:
          return `${a.last_name ?? ''}`.localeCompare(`${b.last_name ?? ''}`);
      }
    });
    return arr;
  }, [filtered, sort]);

  const activeCount = players.filter((p) => p.status === 'active' || p.status === null).length;
  const empty = players.length === 0;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.18em] text-accent-700">Roster</p>
          <h1 className="mt-1 font-fw-display text-h1 font-semibold tracking-[-0.02em] text-text-primary">Your players.</h1>
          <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary">
            {empty
              ? `Build your roster on ${teamName} by inviting players to join.`
              : `${players.length} ${players.length === 1 ? 'player' : 'players'}${activeCount !== players.length ? ` · ${activeCount} active` : ''} on ${teamName}.`}
          </p>
        </div>
        <FairwayInvitePlayerButton teamName={teamName} joinCode={inviteCode} />
      </div>

      {/* Join requests */}
      <FairwayJoinRequests requests={joinRequests} />

      {empty ? (
        <Surface elevation="border" padding="lg" className="mt-2 text-center">
          <h2 className="font-fw-display text-h3 font-semibold text-text-primary">Build your team</h2>
          <p className="mx-auto mt-2 max-w-sm font-fw-sans text-body-sm text-text-tertiary">
            Invite players to join {teamName}. Share the code below or send a join link.
          </p>
          <div className="mt-5 flex flex-col items-center gap-3">
            <FairwayInvitePlayerButton teamName={teamName} joinCode={inviteCode} />
            {inviteCode ? <Chip tone="neutral">Join code · {inviteCode}</Chip> : null}
          </div>
        </Surface>
      ) : (
        <>
          {/* Search (P253) — find a player by name without scrolling. */}
          <div className="mb-3 mt-2 max-w-md">
            <SearchField
              size="sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClear={() => setQuery('')}
              placeholder="Search players by name"
              aria-label="Search players"
            />
          </div>

          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            {/* P249 — the Segmented pill is a fixed inline-flex strip that can
                exceed a ~360px viewport with four labels. Wrap it in a
                horizontally scrollable rail (negative-margin gutter so the scroll
                area reaches the page edge) so all four sort options stay
                reachable without forcing horizontal scroll on the whole page. */}
            <div className="-mx-4 max-w-full overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Segmented<SortField>
                size="sm"
                aria-label="Sort players"
                value={sort}
                onValueChange={setSort}
                options={SORT_OPTIONS as unknown as { value: SortField; label: string }[]}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={() => exportRosterCSV(sorted as unknown as Parameters<typeof exportRosterCSV>[0])}
            >
              Export
            </Button>
          </div>

          {/* Grid */}
          {sorted.length === 0 ? (
            <EmptyState
              variant="search"
              title="No players match your search"
              description={`No players on ${teamName} match “${query.trim()}”.`}
              action={
                <Button variant="secondary" size="sm" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
              {sorted.map((p) => (
                <FairwayPlayerCard key={p.id} player={p} intent={intents[p.id] ?? null} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default FairwayCoachRoster;
