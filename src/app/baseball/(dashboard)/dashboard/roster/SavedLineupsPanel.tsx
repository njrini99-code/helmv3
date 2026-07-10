'use client';

/**
 * ============================================================================
 * SavedLineupsPanel — the Lineup tab's missing "view/edit/delete" surface.
 * ----------------------------------------------------------------------------
 * saveLineup/updateLineup/deleteLineup/getTeamLineups (src/app/baseball/
 * actions/lineups.ts) were all fully built and reachable from NOWHERE in the
 * UI — a coach could save a lineup, get a success toast, and had no way to
 * ever see it again (write-only from the product's perspective). This panel
 * is the minimal reachable list: fetch on mount/refresh, Load an existing
 * lineup into the builder (via `onEdit`, which the Lineup tab wires to
 * LineupBuilder's `initialLineup`/`editingLineupId` props), or Delete it.
 *
 * Styled to match its direct sibling in the same tab, LineupBuilder.tsx
 * (plain `@/components/ui` Card/Button, warm/cream tokens) rather than the
 * surrounding page's Fairway/Living-Annual kit — this tab predates that
 * migration and the two pieces should read as one surface, not two.
 * ========================================================================== */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button, IconButton } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { IconTrash } from '@/components/icons';
import { getFullName } from '@/lib/utils';
import { useToast } from '@/components/ui/sonner';
import { getTeamLineups, deleteLineup } from '@/app/baseball/actions/lineups';

export interface SavedLineupSlot {
  order: number;
  playerId: string;
}

export interface SavedLineupSummary {
  id: string;
  name: string;
  positions: SavedLineupSlot[];
  playerNames: string[];
}

interface RawLineupPosition {
  batting_order: number;
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

interface RawLineupRow {
  id: string;
  name: string | null;
  baseball_lineup_positions: RawLineupPosition[] | null;
}

interface SavedLineupsPanelProps {
  teamId: string | null;
  /** Bump to force a refetch (e.g. right after a successful save). */
  refreshKey: number;
  /** The lineup id currently loaded into the builder, if any — highlights that row. */
  editingLineupId: string | null;
  onEdit: (lineup: { id: string; name: string; positions: SavedLineupSlot[] }) => void;
}

export function SavedLineupsPanel({ teamId, refreshKey, editingLineupId, onEdit }: SavedLineupsPanelProps) {
  const { showToast } = useToast();
  const [lineups, setLineups] = useState<SavedLineupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(false);

    getTeamLineups(teamId)
      .then((rows) => {
        if (cancelled) return;
        const mapped: SavedLineupSummary[] = ((rows ?? []) as unknown as RawLineupRow[]).map((row) => {
          const positions = (row.baseball_lineup_positions ?? [])
            .slice()
            .sort((a, b) => a.batting_order - b.batting_order);
          return {
            id: row.id,
            name: row.name ?? 'Untitled Lineup',
            positions: positions
              .filter((p) => p.player?.id)
              .map((p) => ({ order: p.batting_order, playerId: p.player!.id })),
            playerNames: positions
              .map((p) => (p.player ? getFullName(p.player.first_name, p.player.last_name) : ''))
              .filter(Boolean),
          };
        });
        setLineups(mapped);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teamId, refreshKey]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const result = await deleteLineup(id);
      if (result.success) {
        setLineups((prev) => prev.filter((l) => l.id !== id));
        showToast('Lineup deleted', 'success');
        setConfirmId(null);
      } else {
        // Leave the confirm dialog open on failure so the coach can retry
        // without re-selecting delete (matches RosterRowMenu's remove flow).
        showToast(result.error || 'Failed to delete lineup', 'error');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to delete lineup', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  const confirmTarget = lineups.find((l) => l.id === confirmId) ?? null;

  return (
    <Card>
      <CardHeader>
        <h3 className="font-medium text-warm-700">Saved Lineups</h3>
        <p className="mt-1 text-sm text-warm-500">Load a past lineup to edit it, or start a new one below.</p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-warm-500">Loading saved lineups…</p>
        ) : loadError ? (
          <p className="text-sm text-warm-500">Couldn&apos;t load saved lineups. Refresh the page to try again.</p>
        ) : lineups.length === 0 ? (
          <p className="text-sm text-warm-500">No saved lineups yet — build one below and save it.</p>
        ) : (
          <ul className="space-y-2">
            {lineups.map((lineup) => {
              const isEditing = editingLineupId === lineup.id;
              return (
                <li
                  key={lineup.id}
                  className={`flex items-center justify-between gap-3 rounded-2xl border p-3 transition-colors ${
                    isEditing ? 'border-primary-400 bg-primary-50/50' : 'border-warm-200 bg-cream-50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-warm-900">{lineup.name}</p>
                    <p className="truncate text-xs text-warm-500">
                      {lineup.playerNames.length > 0
                        ? lineup.playerNames.slice(0, 3).join(', ') +
                          (lineup.playerNames.length > 3 ? ` +${lineup.playerNames.length - 3} more` : '')
                        : 'No players set'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant={isEditing ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => onEdit({ id: lineup.id, name: lineup.name, positions: lineup.positions })}
                    >
                      {isEditing ? 'Editing' : 'Load'}
                    </Button>
                    <IconButton
                      variant="default"
                      aria-label={`Delete ${lineup.name}`}
                      disabled={deletingId === lineup.id}
                      onClick={() => setConfirmId(lineup.id)}
                      className="rounded-lg p-2 text-warm-400 transition-colors hover:bg-[var(--notice-error-ink)]/10 hover:text-[color:var(--notice-error-ink)]"
                    >
                      <IconTrash size={16} />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete lineup?"
        message={`Delete "${confirmTarget?.name ?? 'this lineup'}"? This can't be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deletingId !== null}
        onConfirm={() => confirmId && handleDelete(confirmId)}
        onCancel={() => setConfirmId(null)}
      />
    </Card>
  );
}
