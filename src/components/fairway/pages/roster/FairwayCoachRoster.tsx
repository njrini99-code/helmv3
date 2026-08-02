'use client';

/** Fairway · Roster · FairwayCoachRoster (C2/C3/C4/C5/C9/C10) — coach roster shell. */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';

import { Segmented } from '@/components/fairway/controls/segmented';
import { Button } from '@/components/fairway/controls/button';
import { Chip } from '@/components/fairway/controls/badge';
import { SearchField } from '@/components/fairway/command/search-field';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { ViewHeader } from '@/components/fairway/view-header/view-header';
import type { CoachPlayerIntent } from '@/lib/coachhelm/v3/intent/types';
import type { JoinRequestData } from '@/app/golf/actions/teams';
import { exportRosterCSV } from '@/components/golf/roster/RosterToolbar';
import type { PlayersGridFocusArea, PlayersGridStats, RosterRow } from '@/components/fairway/pages/coachhelm/PlayersGridView';
import {
  RosterHealthHeader,
  computeRosterHealth,
  computeNeedsAttention,
} from '@/components/fairway/pages/coachhelm/RosterHealthHeader';
import { FairwayPlayerCard, type RosterPlayer } from './FairwayPlayerCard';
import { FairwayInvitePlayerButton } from './FairwayInvitePlayerButton';
import { FairwayJoinRequests } from './FairwayJoinRequests';

export interface FairwayCoachRosterProps {
  players: RosterPlayer[];
  teamName: string;
  inviteCode: string | null;
  intents: Record<string, CoachPlayerIntent>;
  joinRequests: JoinRequestData[];
  /**
   * Minimal PlayersGridFocusArea-shaped rows (status + outcome_status) for
   * the ported "Who needs your attention" roster-health header — id/
   * area_type/title are honest placeholders unused by that instrument's
   * coverage/outcome math. See roster/page.tsx.
   */
  focusAreas: PlayersGridFocusArea[];
}

type SortField = 'name' | 'avg' | 'handicap' | 'rounds';
const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'avg', label: 'Avg score' },
  { value: 'handicap', label: 'Handicap' },
  { value: 'rounds', label: 'Rounds' },
] as const;

export function FairwayCoachRoster({ players, teamName, inviteCode, intents, joinRequests, focusAreas }: FairwayCoachRosterProps) {
  const router = useRouter();
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

  // ── "Who needs your attention" roster-health header (Wave 2 port from
  // PlayersGridView) — built from the SAME `players`/`focusAreas` props
  // already on the page, via the extracted pure computations so the Roster
  // list and the Players sub-tab can never disagree on what "needs a look"
  // means. `PlayersGridStats`/`RosterRow` are the same shapes
  // RosterHealthHeader already expects — RosterPlayer already carries every
  // field PlayersGridPlayer requires, so no remapping is needed there. ─────
  const playerStatsForHealth = React.useMemo(() => {
    const rec: Record<string, PlayersGridStats> = {};
    for (const p of players) {
      rec[p.id] = {
        rounds_played: p.rounds_count ?? 0,
        avg_score: p.avg_score ?? null,
        avg_putts: null,
        fairway_pct: null,
        gir_pct: null,
        best_score: null,
        recent_trend: p.recent_trend ?? null,
      };
    }
    return rec;
  }, [players]);

  const rosterRowsForHealth: RosterRow[] = React.useMemo(
    () =>
      players.map((p) => ({
        player: p,
        stats: playerStatsForHealth[p.id],
        activeCount: p.active_focus_areas ?? 0,
        completedCount: 0,
      })),
    [players, playerStatsForHealth],
  );

  const rosterHealth = React.useMemo(
    () => computeRosterHealth(players, focusAreas, playerStatsForHealth),
    [players, focusAreas, playerStatsForHealth],
  );
  const needsAttention = React.useMemo(
    () => computeNeedsAttention(rosterRowsForHealth),
    [rosterRowsForHealth],
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
      {/* Masthead — the one canonical ViewHeader primitive (eyebrow + title +
          description + primary CTA), pixel-identical to every other feature page. */}
      <ViewHeader
        className="mb-6"
        eyebrow="Roster"
        title="Your players."
        description={
          empty
            ? `Build your roster on ${teamName} by inviting players to join.`
            : `${players.length} ${players.length === 1 ? 'player' : 'players'}${activeCount !== players.length ? ` · ${activeCount} active` : ''} on ${teamName}.`
        }
        primaryAction={<FairwayInvitePlayerButton teamName={teamName} joinCode={inviteCode} />}
      />

      {/* Join requests */}
      <FairwayJoinRequests requests={joinRequests} />

      {empty ? (
        <EmptyState
          variant="default"
          title="Build your team"
          description={`Invite players to join ${teamName}. Share the code below or send a join link.`}
          action={
            // The header above already carries the primary "Invite player" CTA —
            // this card repeats the affordance for a reader who lands mid-page,
            // so it renders ghost to avoid two competing primary buttons on one
            // empty state.
            <FairwayInvitePlayerButton teamName={teamName} joinCode={inviteCode} variant="ghost" />
          }
          secondaryAction={inviteCode ? <Chip tone="neutral">Join code · {inviteCode}</Chip> : undefined}
          className="mt-2"
        />
      ) : (
        <>
          {/* "Who needs your attention" roster-health header band (Wave 2 —
              ported from PlayersGridView, formerly orphaned behind the
              hidden ?view=players route). "Add focus area" from a needs-
              attention row has no in-page modal here, so it hands off to the
              canonical prescribe flow scoped to that player. */}
          <div className="mb-6">
            <RosterHealthHeader
              health={rosterHealth}
              needs={needsAttention}
              onAdd={(playerId) =>
                router.push(
                  `/golf/dashboard/intelligence?view=players${playerId ? `&player=${playerId}` : ''}&playersTab=areas`,
                )
              }
            />
          </div>

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
