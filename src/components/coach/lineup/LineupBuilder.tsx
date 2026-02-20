'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { getFullName } from '@/lib/utils';
import { IconMoreVertical, IconX, IconCheck, IconSend } from '@/components/icons';

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_position: string | null;
  jersey_number: number | null;
  avatar_url: string | null;
}

interface LineupSlot {
  order: number;
  player: Player | null;
}

interface LineupBuilderProps {
  roster: Player[];
  onSave?: (lineup: LineupSlot[], name: string) => void;
}

const BATTING_ORDER_SIZE = 9;

export function LineupBuilder({ roster, onSave }: LineupBuilderProps) {
  const [lineup, setLineup] = useState<LineupSlot[]>(
    Array.from({ length: BATTING_ORDER_SIZE }, (_, i) => ({
      order: i + 1,
      player: null,
    }))
  );
  const [lineupName, setLineupName] = useState('');
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

    // If dragging from a slot, clear that slot
    if (draggedSlotIndex !== null) {
      const slot = newLineup[draggedSlotIndex];
      if (slot) {
        newLineup[draggedSlotIndex] = {
          order: slot.order,
          player: null
        };
      }
    }

    // Place player in new slot
    const toSlot = newLineup[toSlotIndex];
    if (toSlot) {
      newLineup[toSlotIndex] = {
        order: toSlot.order,
        player: draggedPlayer
      };
    }

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

  const filledSlots = lineup.filter((slot) => slot.player !== null).length;

  return (
    <div className="space-y-6">
      {/* Lineup Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Lineup Builder</h2>
              <p className="text-sm text-slate-500 mt-1">
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
          <h3 className="font-medium text-slate-700">Batting Order</h3>
          <div className="space-y-2">
            {lineup.map((slot, index) => (
              <div
                key={slot.order}
                className="bg-white rounded-2xl border border-slate-200 p-4 transition-all hover:border-green-200"
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(index)}
              >
                <div className="flex items-center gap-4">
                  {/* Order Number */}
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                    <span className="font-semibold text-slate-700">{slot.order}</span>
                  </div>

                  {/* Player or Empty Slot */}
                  {slot.player ? (
                    <>
                      <div
                        className="flex items-center gap-3 flex-1 cursor-move"
                        draggable
                        onDragStart={() => handleDragStart(slot.player!, index)}
                      >
                        <IconMoreVertical size={20} className="text-slate-400" />
                        <Avatar
                          name={getFullName(slot.player.first_name, slot.player.last_name)}
                          src={slot.player.avatar_url || undefined}
                          size="sm"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-slate-900">
                            {getFullName(slot.player.first_name, slot.player.last_name)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {slot.player.primary_position || 'No position'}
                            {slot.player.jersey_number && ` • #${slot.player.jersey_number}`}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => removePlayerFromLineup(index)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors"
                      >
                        <IconX size={18} />
                      </button>
                    </>
                  ) : (
                    <div className="flex-1 py-3 px-4 border-2 border-dashed border-slate-200 rounded-lg">
                      <p className="text-sm text-slate-400">Drop player here or select from roster →</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Available Players */}
        <div className="space-y-3">
          <h3 className="font-medium text-slate-700">Available Players</h3>
          <Card>
            <CardContent className="p-4 space-y-2 max-h-[600px] overflow-y-auto">
              {availablePlayers.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-500">All players in lineup</p>
                </div>
              ) : (
                availablePlayers.map((player) => (
                  <div
                    key={player.id}
                    className="p-3 bg-white rounded-lg border border-slate-200 cursor-move hover:border-green-200 hover:shadow-sm transition-all"
                    draggable
                    onDragStart={() => handleDragStart(player)}
                  >
                    <div className="flex items-center gap-3">
                      <IconMoreVertical size={16} className="text-slate-400 flex-shrink-0" />
                      <Avatar
                        name={getFullName(player.first_name, player.last_name)}
                        src={player.avatar_url || undefined}
                        size="xs"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-slate-900 truncate">
                          {getFullName(player.first_name, player.last_name)}
                        </p>
                        <p className="text-xs text-slate-500">
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
