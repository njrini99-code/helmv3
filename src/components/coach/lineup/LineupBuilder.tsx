'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button, IconButton } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { getFullName } from '@/lib/utils';
import { useToast } from '@/components/ui/sonner';
import { IconMoreVertical, IconX, IconCheck, IconSend } from '@/components/icons';

export interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_position: string | null;
  jersey_number: number | null;
  avatar_url: string | null;
}

export interface LineupSlot {
  order: number;
  player: Player | null;
}

interface LineupBuilderProps {
  roster: Player[];
  onSave?: (lineup: LineupSlot[], name: string) => void;
  /** Pre-populate the batting order (Load from Saved Lineups). Read once on mount. */
  initialLineup?: LineupSlot[];
  /** Pre-populate the lineup name. Read once on mount. */
  initialName?: string;
}

const BATTING_ORDER_SIZE = 9;

function emptyLineup(): LineupSlot[] {
  return Array.from({ length: BATTING_ORDER_SIZE }, (_, i) => ({
    order: i + 1,
    player: null,
  }));
}

export function LineupBuilder({ roster, onSave, initialLineup, initialName }: LineupBuilderProps) {
  const { showToast } = useToast();
  const [lineup, setLineup] = useState<LineupSlot[]>(() => {
    if (!initialLineup || initialLineup.length === 0) return emptyLineup();
    // Normalize onto the fixed 9-slot batting order regardless of how many
    // positions the saved lineup had, so a partial lineup still lands in the
    // right slots instead of shifting.
    const base = emptyLineup();
    for (const slot of initialLineup) {
      const idx = base.findIndex((s) => s.order === slot.order);
      if (idx >= 0) base[idx] = slot;
    }
    return base;
  });
  const [lineupName, setLineupName] = useState(initialName ?? '');
  const [draggedPlayer, setDraggedPlayer] = useState<Player | null>(null);
  const [draggedSlotIndex, setDraggedSlotIndex] = useState<number | null>(null);

  // Get players not in lineup
  const availablePlayers = roster.filter(
    (player) => !lineup.some((slot) => slot.player?.id === player.id)
  );

  const handleDragStart = (player: Player, fromSlot?: number) => {
    setDraggedPlayer(player);
    if (fromSlot !== undefined) {
      setDraggedSlotIndex(fromSlot);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (toSlotIndex: number) => {
    if (!draggedPlayer) return;

    const newLineup = [...lineup];
    const toSlot = newLineup[toSlotIndex];
    if (!toSlot) {
      setDraggedPlayer(null);
      setDraggedSlotIndex(null);
      return;
    }

    // Whoever currently occupies the target slot (may be null). When moving a
    // player between two slots we SWAP — the incumbent takes the source slot —
    // instead of nulling the source and dropping the incumbent out of the
    // lineup. When dragging in from the bench, the incumbent simply returns to
    // the available pool (they no longer occupy any slot).
    const displacedPlayer = toSlot.player;

    if (draggedSlotIndex !== null) {
      const fromSlot = newLineup[draggedSlotIndex];
      if (fromSlot) {
        newLineup[draggedSlotIndex] = {
          order: fromSlot.order,
          player: displacedPlayer,
        };
      }
    }

    newLineup[toSlotIndex] = {
      order: toSlot.order,
      player: draggedPlayer,
    };

    setLineup(newLineup);
    setDraggedPlayer(null);
    setDraggedSlotIndex(null);
  };

  const removePlayerFromLineup = (slotIndex: number) => {
    const newLineup = [...lineup];
    const slot = newLineup[slotIndex];
    if (slot) {
      newLineup[slotIndex] = {
        order: slot.order,
        player: null
      };
      setLineup(newLineup);
    }
  };

  const handleSaveLineup = () => {
    if (onSave) {
      onSave(lineup, lineupName);
    }
  };

  /**
   * Share the batting order as plain text — the native OS share sheet when
   * available (mobile), falling back to a clipboard copy + toast. No new
   * route/DB write: there is no shareable public lineup page to link to, so
   * this is the minimal complete "Share" a coach can act on today rather than
   * a control that silently does nothing when clicked (#lineup-share-unwired).
   */
  const handleShareLineup = async () => {
    const filled = lineup.filter((slot): slot is { order: number; player: Player } => slot.player !== null);
    if (filled.length === 0) return;

    const title = lineupName.trim() || 'Lineup';
    const lines = filled.map(
      (slot) =>
        `${slot.order}. ${getFullName(slot.player.first_name, slot.player.last_name)}${
          slot.player.primary_position ? ` (${slot.player.primary_position})` : ''
        }`
    );
    const text = [title, ...lines].join('\n');

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text });
        return;
      } catch (err) {
        // AbortError = the coach dismissed the native share sheet — not a failure.
        if (err instanceof Error && err.name === 'AbortError') return;
        // Otherwise fall through to the clipboard fallback below.
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      showToast('Lineup copied to clipboard', 'success');
    } catch {
      showToast('Could not share the lineup. Please try again.', 'error');
    }
  };

  const filledSlots = lineup.filter((slot) => slot.player !== null).length;

  return (
    <div className="space-y-6">
      {/* Lineup Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-warm-900">Lineup Builder</h2>
              <p className="text-sm text-warm-500 mt-1">
                Drag players into batting order positions
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={filledSlots === BATTING_ORDER_SIZE ? 'success' : 'secondary'}>
                {filledSlots}/{BATTING_ORDER_SIZE} positions filled
              </Badge>
              <Button
                variant="secondary"
                size="sm"
                disabled={filledSlots === 0}
                onClick={handleShareLineup}
              >
                <IconSend size={16} className="mr-2" />
                Share
              </Button>
              <Button
                size="sm"
                disabled={filledSlots === 0}
                onClick={handleSaveLineup}
              >
                <IconCheck size={16} className="mr-2" />
                Save Lineup
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              type="text"
              placeholder="Lineup name (e.g., vs Tigers, Home Game #5)"
              value={lineupName}
              onChange={(e) => setLineupName(e.target.value)}
              className="flex-1"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Batting Order */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="font-medium text-warm-700">Batting Order</h3>
          <div className="space-y-2">
            {lineup.map((slot, index) => (
              // eslint-disable-next-line jsx-a11y/no-static-element-interactions
              <div
                key={slot.order}
                className="bg-cream-50 rounded-2xl border border-warm-200 p-4 transition-all hover:border-primary-200"
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(index)}
              >
                <div className="flex items-center gap-4">
                  {/* Order Number */}
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-warm-100 flex items-center justify-center">
                    <span className="font-semibold text-warm-700">{slot.order}</span>
                  </div>

                  {/* Player or Empty Slot */}
                  {slot.player ? (
                    <>
                      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                      <div
                        className="flex items-center gap-3 flex-1 cursor-move"
                        draggable
                        onDragStart={() => handleDragStart(slot.player!, index)}
                      >
                        <IconMoreVertical size={20} className="text-warm-400" />
                        <Avatar
                          name={getFullName(slot.player.first_name, slot.player.last_name)}
                          src={slot.player.avatar_url || undefined}
                          size="sm"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-warm-900">
                            {getFullName(slot.player.first_name, slot.player.last_name)}
                          </p>
                          <p className="text-xs text-warm-500">
                            {slot.player.primary_position || 'No position'}
                            {slot.player.jersey_number && ` • #${slot.player.jersey_number}`}
                          </p>
                        </div>
                      </div>
                      <IconButton variant="default" aria-label="Close"
                        onClick={() => removePlayerFromLineup(index)}
                        className="p-2 rounded-lg text-warm-400 hover:text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
                      >
                        <IconX size={18} />
                      </IconButton>
                    </>
                  ) : (
                    <div className="flex-1 py-3 px-4 border-2 border-dashed border-warm-200 rounded-lg">
                      <p className="text-sm text-warm-400">Drop player here or select from roster →</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Available Players */}
        <div className="space-y-3">
          <h3 className="font-medium text-warm-700">Available Players</h3>
          <Card>
            <CardContent className="p-4 space-y-2 max-h-[600px] overflow-y-auto">
              {availablePlayers.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-warm-500">All players in lineup</p>
                </div>
              ) : (
                availablePlayers.map((player) => (
                  // eslint-disable-next-line jsx-a11y/no-static-element-interactions
                  <div
                    key={player.id}
                    className="p-3 bg-cream-50 rounded-lg border border-warm-200 cursor-move hover:border-primary-200 hover:shadow-sm transition-all"
                    draggable
                    onDragStart={() => handleDragStart(player)}
                  >
                    <div className="flex items-center gap-3">
                      <IconMoreVertical size={16} className="text-warm-400 flex-shrink-0" />
                      <Avatar
                        name={getFullName(player.first_name, player.last_name)}
                        src={player.avatar_url || undefined}
                        size="xs"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-warm-900 truncate">
                          {getFullName(player.first_name, player.last_name)}
                        </p>
                        <p className="text-xs text-warm-500">
                          {player.primary_position || 'No position'}
                          {player.jersey_number && ` • #${player.jersey_number}`}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
