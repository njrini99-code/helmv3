'use client';

// =============================================================================
// CompareClient — the coach's recruit side-by-side comparison surface,
// migrated onto "The Living Annual" kit (Lane 2 · THE WAR ROOM, clay ink —
// spec §6 P3 #10 "Decision Room / Compare Overlay"). PRESENTATION ONLY: the
// URL-driven player-id state, the player fetch/search effects, and add/remove
// handlers are unchanged — only the page chrome (masthead, skeleton, empty
// state) moved to the kit. `PlayerComparison` renders the actual comparison
// table and is out of scope for this pass.
// =============================================================================

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { PageLoading } from '@/components/ui/loading';
import { Skeleton } from '@/components/ui/skeleton';
import { ReadModelStateNotice } from '@/components/baseball/ReadModelStateNotice';
import { PlayerComparison } from '@/components/features/player-comparison';
import { IconSearch, IconPlus, IconX, IconUsers } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import { cn, getFullName } from '@/lib/utils';
import { SectionMasthead, PaperCard, InkBadge, EditorsLetter, Eyebrow } from '@/components/baseball/living-annual';
import type { Player } from '@/lib/types';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

// Debounce hook for search (mirrors the local useDebounce in DiscoverClient)
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

function CompareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  // Debounce the search box so every keystroke doesn't fire a query; the input
  // itself stays fully responsive since `searchQuery` updates immediately.
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  // Stale-response guard: only the most recently issued search may paint results.
  const searchRequestRef = useRef(0);

  // Get player IDs from URL, deduped but preserving first-occurrence order
  const playerIds = Array.from(
    new Set(searchParams.get('players')?.split(',').filter(Boolean) || [])
  );

  useEffect(() => {
    async function fetchPlayers() {
      if (playerIds.length === 0) {
        setPlayers([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);
      try {
        const { data, error } = await supabase
          .from('baseball_players')
          .select('*')
          .in('id', playerIds);

        if (error) throw error;

        // Supabase/Postgres does not guarantee `.in()` results match the
        // order of the id list, so re-sort fetched players to match the
        // URL's player order (falling back to omitting any id not found).
        const byId = new Map((data || []).map((player) => [player.id, player]));
        const ordered = playerIds
          .map((id) => byId.get(id))
          .filter((player): player is Player => Boolean(player));
        setPlayers(ordered);
      } catch {
        setPlayers([]);
        setLoadError('Player comparison data could not be loaded.');
      } finally {
        setLoading(false);
      }
    }

    fetchPlayers();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `supabase` is stable (module-scope) and `playerIds` is recomputed each render from `searchParams`; adding it would loop.
  }, [searchParams]);

  const MAX_PLAYERS = 4;
  const canAddMore = playerIds.length < MAX_PLAYERS;

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  // Fires only after the debounced value settles (300ms after the last
  // keystroke). Guarded by `searchRequestRef` so an older, slower search that
  // resolves after a newer one can't overwrite it with stale results.
  useEffect(() => {
    const query = debouncedSearchQuery;

    if (!query || query.length < 2) {
      // Bump the ref even though nothing async is in flight here -- a slower
      // in-flight request from a PRIOR keystroke could otherwise resolve
      // after this clear and overwrite it with stale results.
      ++searchRequestRef.current;
      setSearchResults([]);
      return;
    }

    if (!canAddMore) {
      ++searchRequestRef.current;
      setSearchResults([]);
      return;
    }

    const requestId = ++searchRequestRef.current;
    setSearching(true);

    (async () => {
      try {
        let queryBuilder = supabase
          .from('baseball_players')
          .select('*')
          .eq('recruiting_activated', true)
          .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,high_school_name.ilike.%${query}%`)
          .limit(10);

        // Only add NOT IN filter if there are playerIds
        if (playerIds.length > 0) {
          queryBuilder = queryBuilder.not('id', 'in', `(${playerIds.join(',')})`);
        }

        const { data, error } = await queryBuilder;

        if (error) throw error;
        if (searchRequestRef.current !== requestId) return; // stale — a newer search is in flight
        setSearchResults(data || []);
      } catch (error) {
        console.error('Error searching players:', error);
        if (searchRequestRef.current !== requestId) return;
        setSearchResults([]);
      } finally {
        if (searchRequestRef.current === requestId) {
          setSearching(false);
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `supabase` is stable (module-scope); `playerIds` is recomputed fresh from `searchParams` every render (see the fetchPlayers effect above), so listing it here would re-run this on every render. Adding a player already clears `searchQuery`/`searchResults` directly via `addPlayer`, so re-running on `playerIds` alone isn't needed.
  }, [debouncedSearchQuery, canAddMore]);

  const addPlayer = (player: Player) => {
    const newIds = [...playerIds, player.id];
    router.push(`/baseball/dashboard/compare?players=${newIds.join(',')}`);
    setSearchQuery('');
    setSearchResults([]);
  };

  const removePlayer = (playerId: string) => {
    const newIds = playerIds.filter(id => id !== playerId);
    if (newIds.length > 0) {
      router.push(`/baseball/dashboard/compare?players=${newIds.join(',')}`);
    } else {
      router.push('/baseball/dashboard/compare');
    }
  };

  if (loading && playerIds.length > 0) {
    return (
      <div className={cn(PAGE_SHELL, 'space-y-6')}>
        <SectionMasthead eyebrow="THE WAR ROOM · DECISION ROOM" title="Compare Players" ink="pursuit" />
        {/* Skeleton for search area */}
        <PaperCard className="p-5">
          <Skeleton variant="text" width={160} height={16} className="mb-3" />
          <Skeleton variant="text" width="100%" height={40} />
        </PaperCard>
        {/* Skeleton for comparison */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {playerIds.map((id) => (
            <PaperCard key={id} className="p-6">
              <Skeleton variant="circular" width={64} height={64} className="mx-auto mb-3" />
              <Skeleton variant="text" width="75%" className="mx-auto mb-2" />
              <Skeleton variant="text" width="50%" className="mx-auto mb-4" />
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} variant="text" width="100%" height={12} />
                ))}
              </div>
            </PaperCard>
          ))}
        </div>
      </div>
    );
  }

  if (loadError && playerIds.length > 0) {
    return (
      <div className={PAGE_SHELL}>
        <SectionMasthead eyebrow="THE WAR ROOM · DECISION ROOM" title="Compare Players" ink="pursuit" />
        <div className="mt-6">
          <ReadModelStateNotice
            state="error"
            title="Comparison unavailable"
            onRetry={() => router.refresh()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(PAGE_SHELL, 'space-y-6')}>
      <SectionMasthead eyebrow="THE WAR ROOM · DECISION ROOM" title="Compare Players" ink="pursuit">
        <p className="max-w-prose font-annual text-body-sm text-text-secondary">
          {players.length > 0 ? `Comparing ${players.length} players` : 'Select players to compare'}
        </p>
      </SectionMasthead>

      {/* Add Players Section */}
      <PaperCard className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="mb-2 flex items-center justify-between">
              <Eyebrow ink="pursuit">Add Players to Compare</Eyebrow>
              <InkBadge
                label={`${playerIds.length} / ${MAX_PLAYERS} PLAYERS`}
                tone={playerIds.length >= MAX_PLAYERS ? 'pursuit' : 'neutral'}
                variant={playerIds.length >= MAX_PLAYERS ? 'solid' : 'soft'}
              />
            </div>
            <div className="relative">
              <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <Input
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder={canAddMore ? "Search players by name or school..." : "Maximum 4 players reached"}
                className="pl-9"
                disabled={!canAddMore}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />
            </div>
            {!canAddMore && (
              <p className="mt-2 font-annual text-body-sm text-text-tertiary">
                Remove a player to add another. Maximum of 4 players can be compared at once.
              </p>
            )}

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="mt-2 max-h-64 divide-y divide-[color:var(--hairline)] overflow-y-auto rounded-fw-md border border-[color:var(--hairline)]">
                {searchResults.map((player) => {
                  const name = getFullName(player.first_name, player.last_name);
                  return (
                    <Button variant="ghost"
                      key={player.id}
                      onClick={() => addPlayer(player)}
                      className="flex w-full items-center gap-3 rounded-none p-3 text-left hover:bg-[color:var(--paper-canvas)]"
                    >
                      <Avatar name={name} src={player.avatar_url} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-annual text-sm font-medium text-text-primary">{name}</p>
                        <p className="truncate font-annual text-body-sm text-text-tertiary">
                          {player.primary_position} • {player.grad_year} • {player.high_school_name}
                        </p>
                      </div>
                      <IconPlus size={16} className="text-pursuit" />
                    </Button>
                  );
                })}
              </div>
            )}

            {searching && (
              <p className="mt-2 font-annual text-body-sm text-text-tertiary">Searching...</p>
            )}
          </div>

          {/* Selected Players */}
          <div className="flex flex-wrap gap-2">
            {players.map((player) => {
              const name = getFullName(player.first_name, player.last_name);
              return (
                <div
                  key={player.id}
                  className="flex items-center gap-2 rounded-full border border-[color:var(--hairline)] bg-[var(--paper)] px-3 py-1.5"
                >
                  <Avatar name={name} src={player.avatar_url} size="xs" />
                  <span className="font-annual text-sm font-medium text-text-primary">{name}</span>
                  <IconButton variant="ghost"
                    onClick={() => removePlayer(player.id)}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full hover:bg-[color:var(--paper-canvas)]"
                    aria-label={`Remove ${name} from comparison`}
                  >
                    <IconX size={14} className="text-text-tertiary" />
                  </IconButton>
                </div>
              );
            })}
          </div>
        </div>
      </PaperCard>

      {/* Comparison Table */}
      {players.length < 2 ? (
        <EditorsLetter
          ink="pursuit"
          title={players.length === 0 ? 'No players selected' : 'Add one more player'}
          body={
            players.length === 0
              ? 'Search and add at least 2 players above to start comparing them side by side.'
              : 'Add at least one more player to start comparing.'
          }
          action={
            players.length === 0 ? (
              <Button onClick={() => router.push('/baseball/dashboard/discover')}>
                <IconUsers size={18} className="mr-2" />
                Browse Players
              </Button>
            ) : undefined
          }
        />
      ) : (
        <PlayerComparison
          players={players}
          onRemovePlayer={removePlayer}
        />
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={
      <div className={PAGE_SHELL}>
        <SectionMasthead eyebrow="THE WAR ROOM · DECISION ROOM" title="Compare Players" ink="pursuit" />
        <div className="mt-6">
          <PageLoading />
        </div>
      </div>
    }>
      <CompareContent />
    </Suspense>
  );
}
