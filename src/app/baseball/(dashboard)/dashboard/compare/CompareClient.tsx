'use client';

// =============================================================================
// CompareClient — the coach's recruit side-by-side comparison surface,
// migrated onto "The Living Annual" kit (Lane 2 · THE WAR ROOM, clay ink —
// spec §6 P3 #10 "Decision Room / Compare Overlay"). PRESENTATION ONLY: the
// URL-driven player-id state and add/remove handler shapes are unchanged —
// only the page chrome (masthead, skeleton, empty state) moved to the kit.
// `PlayerComparison` renders the actual comparison table and is out of
// scope for this pass.
// EXCEPTION (P0 fix): the player fetch/search effects no longer query
// `baseball_players` directly from the client — they call the gated
// `getComparablePlayers`/`searchRecruitablePlayers`/`canAddPlayerToCompare`
// server actions (./actions.ts) instead. The old direct queries had no
// privacy/recruitability filtering at all — a private, college, or
// off-territory player's full profile (and a bookmarkable
// `/compare?players=<id>` URL for one) had zero eligibility check.
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
import { useToast } from '@/components/ui/sonner';
import { cn, getFullName } from '@/lib/utils';
import { SectionMasthead, PaperCard, InkBadge, EditorsLetter, Eyebrow } from '@/components/baseball/living-annual';
import { searchRecruitablePlayers, getComparablePlayers, canAddPlayerToCompare } from './actions';
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
  const { showToast } = useToast();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingPlayerId, setAddingPlayerId] = useState<string | null>(null);
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
        // Server-gated (P0 fix): getComparablePlayers re-applies the same
        // recruitability checks as the search below (private/college/
        // off-territory/own-roster excluded) so a bookmarked
        // `/compare?players=<id>` URL can't bypass them and pull in a
        // player's full profile with zero eligibility check.
        const data = await getComparablePlayers(playerIds);

        // Supabase/Postgres does not guarantee `.in()` results match the
        // order of the id list, so re-sort fetched players to match the
        // URL's player order (falling back to omitting any id not found,
        // including ids the recruitability gate excluded).
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `playerIds` is recomputed each render from `searchParams`; adding it would loop.
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
        // Server-gated (P0 fix): searchRecruitablePlayers excludes private
        // profiles, college players, off-territory players, and the
        // coach's own roster — the raw client-side query here previously
        // applied none of those checks (only `recruiting_activated`).
        const data = await searchRecruitablePlayers(query, playerIds);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `playerIds` is recomputed fresh from `searchParams` every render (see the fetchPlayers effect above), so listing it here would re-run this on every render. Adding a player already clears `searchQuery`/`searchResults` directly via `addPlayer`, so re-running on `playerIds` alone isn't needed.
  }, [debouncedSearchQuery, canAddMore]);

  const addPlayer = async (player: Player) => {
    // Defense-in-depth (P0 fix): the search results above are already
    // recruitability-filtered, but this stops an ineligible id from ever
    // landing in the `?players=` URL — mirroring Watchlist's addToWatchlist
    // server-side gate — instead of relying on it silently vanishing from
    // render once getComparablePlayers re-validates on the next fetch.
    setAddingPlayerId(player.id);
    try {
      const { allowed } = await canAddPlayerToCompare(player.id);
      if (!allowed) {
        showToast('This player is not available for recruiting', 'error');
        return;
      }
      const newIds = [...playerIds, player.id];
      router.push(`/baseball/dashboard/compare?players=${newIds.join(',')}`);
      setSearchQuery('');
      setSearchResults([]);
    } catch {
      showToast('Failed to add player', 'error');
    } finally {
      setAddingPlayerId(null);
    }
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
        {/* Stacks on phone: search + already-selected chips fighting for the
            same ~250-290px row at <sm squeezes the search input toward
            unusable the moment a 3rd/4th player is added. `min-w-0` lets the
            search column actually shrink to the flex-col row's full width
            instead of clamping to its content's intrinsic width. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
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
                  const isAddingThis = addingPlayerId === player.id;
                  return (
                    <Button variant="ghost"
                      key={player.id}
                      onClick={() => addPlayer(player)}
                      disabled={addingPlayerId !== null}
                      className="flex w-full items-center gap-3 rounded-none p-3 text-left hover:bg-[color:var(--paper-canvas)]"
                    >
                      <Avatar name={name} src={player.avatar_url} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-annual text-sm font-medium text-text-primary">{name}</p>
                        <p className="truncate font-annual text-body-sm text-text-tertiary">
                          {player.primary_position} • {player.grad_year} • {player.high_school_name}
                        </p>
                      </div>
                      {isAddingThis ? (
                        <span className="font-annual text-body-sm text-text-tertiary">Adding…</span>
                      ) : (
                        <IconPlus size={16} className="text-pursuit" />
                      )}
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
