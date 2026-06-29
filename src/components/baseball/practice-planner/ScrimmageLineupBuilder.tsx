'use client';

/* eslint-disable helm/no-raw-button -- lineup/field builder controls are custom spatial controls pending primitive migration. */

// =============================================================================
// src/components/baseball/practice-planner/ScrimmageLineupBuilder.tsx
//
// Packet: practice-intel
//
// The V7 "Scrimmage Lineup Builder": a drag/drop field view with labeled
// defensive positions (P,C,1B,2B,3B,SS,LF,CF,RF,DH,bench,bullpen), an
// alongside batting-order table, handedness indicators, availability/conflict
// badges, and the V7 scrimmage modes. Conflicts (duplicate field position,
// duplicate batting order, double-booked player) are surfaced live with badges
// using the SAME validateScrimmageForPublish run on the server publish gate.
//
// Reuses the GolfHelm diamond aesthetic via the existing BaseballDiamond SVG +
// POSITION_COORDS (cream/green, no new palette, no golf labels). Drag uses native
// HTML5 DnD; a tap/keyboard fallback assigns the selected player to a tapped slot
// (accessible alternative).
//
// Honesty: an unavailable / limited player carries an availability badge so a
// coach never places someone into a slot blind. Availability comes from the
// passed roster (no medical inference, no private data shown).
// =============================================================================

import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, X, GripVertical } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { BaseballDiamond, POSITION_COORDS } from '@/components/baseball/position-planner/BaseballDiamond';
import {
  validateScrimmageForPublish,
  type LineupSlotInput,
  type LineupValidationResult,
} from '@/lib/baseball/practice-validation';
import {
  FIELD_POSITIONS,
  type BaseballScrimmageMode,
  type BaseballScrimmageSide,
  type BaseballDefensivePosition,
} from '@/lib/types/baseball-practice-deep';

// A roster player available to place. availability is operational, not medical.
export interface ScrimmageRosterPlayer {
  id: string;
  name: string;
  bats: string | null; // 'L' | 'R' | 'S'
  throws: string | null; // 'L' | 'R'
  primaryPosition: string | null;
  /** Operational availability flag (available | limited | unavailable). */
  availability?: 'available' | 'limited' | 'unavailable';
}

interface ScrimmageLineupBuilderProps {
  mode: BaseballScrimmageMode;
  roster: ScrimmageRosterPlayer[];
  slots: LineupSlotInput[];
  onChange: (slots: LineupSlotInput[]) => void;
  onValidation?: (result: LineupValidationResult) => void;
}

// The diamond positions we render as drop targets (field + DH). bench/bullpen are
// rendered as separate holding rows, not on the field.
const FIELD_DROP_POSITIONS: BaseballDefensivePosition[] = [
  'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF',
];

const SIDE_LABEL: Record<BaseballScrimmageSide, string> = { blue: 'Blue', white: 'White' };

export function ScrimmageLineupBuilder({
  mode,
  roster,
  slots,
  onChange,
  onValidation,
}: ScrimmageLineupBuilderProps) {
  const isIntrasquad = mode === 'intrasquad';
  const [activeSide, setActiveSide] = useState<BaseballScrimmageSide | null>(
    isIntrasquad ? 'blue' : null,
  );
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [dragPlayerId, setDragPlayerId] = useState<string | null>(null);

  const rosterById = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);

  // ---- Live validation (same fn as the server publish gate) -----------------
  const validation = useMemo(() => {
    const result = validateScrimmageForPublish(mode, slots);
    onValidation?.(result);
    return result;
  }, [mode, slots, onValidation]);

  // Conflict lookups keyed by side+position / side+order for badge rendering.
  const conflicts = useMemo(() => {
    const dupPos = new Set<string>();
    const dupOrder = new Set<string>();
    const dupPlayer = new Set<string>();
    const sides: (BaseballScrimmageSide | null)[] = isIntrasquad ? ['blue', 'white'] : [null];
    for (const side of sides) {
      const ss = slots.filter((s) => (s.side ?? null) === (side ?? null));
      const posC = new Map<string, number>();
      const ordC = new Map<number, number>();
      const plC = new Map<string, number>();
      for (const s of ss) {
        if (s.defensivePosition && FIELD_POSITIONS.includes(s.defensivePosition)) {
          posC.set(s.defensivePosition, (posC.get(s.defensivePosition) ?? 0) + 1);
        }
        if (s.battingOrder != null) ordC.set(s.battingOrder, (ordC.get(s.battingOrder) ?? 0) + 1);
        plC.set(s.playerId, (plC.get(s.playerId) ?? 0) + 1);
      }
      for (const [pos, n] of posC) if (n > 1) dupPos.add(`${side ?? ''}:${pos}`);
      for (const [ord, n] of ordC) if (n > 1) dupOrder.add(`${side ?? ''}:${ord}`);
      for (const [pl, n] of plC) if (n > 1) dupPlayer.add(`${side ?? ''}:${pl}`);
    }
    return { dupPos, dupOrder, dupPlayer };
  }, [slots, isIntrasquad]);

  const sideOf = useCallback(
    (): BaseballScrimmageSide | null => (isIntrasquad ? activeSide : null),
    [isIntrasquad, activeSide],
  );

  const slotFor = (position: BaseballDefensivePosition) =>
    slots.find((s) => s.defensivePosition === position && (s.side ?? null) === (sideOf() ?? null));

  // Assigned players for the current side (for the roster "placed" state).
  const assignedIds = useMemo(
    () =>
      new Set(slots.filter((s) => (s.side ?? null) === (sideOf() ?? null)).map((s) => s.playerId)),
    [slots, sideOf],
  );

  // ---- Mutations -------------------------------------------------------------
  const assignToPosition = (playerId: string, position: BaseballDefensivePosition) => {
    const side = sideOf();
    // Remove any existing slot this player holds on this side, and any slot
    // currently occupying this position on this side (we replace, not duplicate).
    const next = slots.filter(
      (s) =>
        !(
          (s.side ?? null) === (side ?? null) &&
          (s.playerId === playerId || s.defensivePosition === position)
        ),
    );
    // Preserve a prior batting order if the player had one.
    const prior = slots.find((s) => s.playerId === playerId && (s.side ?? null) === (side ?? null));
    next.push({
      playerId,
      side,
      defensivePosition: position,
      battingOrder: prior?.battingOrder ?? null,
      inningStart: prior?.inningStart ?? null,
      inningEnd: prior?.inningEnd ?? null,
      note: prior?.note ?? null,
    });
    onChange(next);
    setSelectedPlayerId(null);
  };

  const removeSlot = (playerId: string) => {
    const side = sideOf();
    onChange(
      slots.filter((s) => !(s.playerId === playerId && (s.side ?? null) === (side ?? null))),
    );
  };

  const setBattingOrder = (playerId: string, order: number | null) => {
    const side = sideOf();
    onChange(
      slots.map((s) =>
        s.playerId === playerId && (s.side ?? null) === (side ?? null)
          ? { ...s, battingOrder: order }
          : s,
      ),
    );
  };

  // Current-side ordered lineup table.
  const tableSlots = useMemo(
    () =>
      slots
        .filter((s) => (s.side ?? null) === (sideOf() ?? null))
        .sort((a, b) => (a.battingOrder ?? 99) - (b.battingOrder ?? 99)),
    [slots, sideOf],
  );

  return (
    <div className="space-y-4">
      {/* Side toggle (intrasquad) + validation summary */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isIntrasquad ? (
          <div className="inline-flex rounded-lg border border-warm-200 bg-cream-50 p-0.5">
            {(['blue', 'white'] as BaseballScrimmageSide[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setActiveSide(s)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  activeSide === s ? 'bg-primary-500 text-white' : 'text-warm-600 hover:bg-white',
                )}
              >
                Team {SIDE_LABEL[s]}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-xs font-medium text-warm-500">
            {mode.replace(/_/g, ' ')} lineup
          </span>
        )}

        <div className="flex items-center gap-2">
          {validation.errors.length > 0 && (
            <Badge tone="red" appearance="soft" size="sm" icon={<AlertTriangle className="h-3 w-3" />}>
              {validation.errors.length} conflict{validation.errors.length === 1 ? '' : 's'}
            </Badge>
          )}
          {validation.warnings.length > 0 && (
            <Badge tone="warning" appearance="soft" size="sm">
              {validation.warnings.length} warning{validation.warnings.length === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- Field view ---- */}
        <div>
          {mode !== 'bullpen_live' ? (
            <BaseballDiamond>
              {FIELD_DROP_POSITIONS.map((position) => {
                const coords = POSITION_COORDS[position];
                if (!coords) return null;
                const slot = slotFor(position);
                const player = slot ? rosterById.get(slot.playerId) : null;
                const dupKey = `${sideOf() ?? ''}:${position}`;
                const conflict = conflicts.dupPos.has(dupKey);
                return (
                  <div
                    key={position}
                    style={{
                      position: 'absolute',
                      left: `${coords.x}%`,
                      top: `${coords.y}%`,
                      transform: 'translate(-50%, -50%)',
                      zIndex: 20,
                    }}
                    className="pointer-events-auto"
                    onDragOver={(e) => {
                      if (dragPlayerId) e.preventDefault();
                    }}
                    onDrop={() => {
                      if (dragPlayerId) assignToPosition(dragPlayerId, position);
                      setDragPlayerId(null);
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedPlayerId) assignToPosition(selectedPlayerId, position);
                        else if (slot) removeSlot(slot.playerId);
                      }}
                      aria-label={
                        player
                          ? `${coords.label}: ${player.name}. Tap to clear.`
                          : `${coords.label}: empty${selectedPlayerId ? '. Tap to place selected player.' : ''}`
                      }
                      className={cn(
                        'flex min-w-[52px] flex-col items-center rounded-lg border px-1.5 py-1 text-center shadow-sm transition-colors',
                        conflict
                          ? 'border-red-400 bg-red-50'
                          : player
                            ? 'border-primary-300 bg-white'
                            : 'border-dashed border-warm-300 bg-white/70 hover:bg-white',
                      )}
                    >
                      <span className="text-caption font-bold uppercase tracking-wide text-warm-500">
                        {position}
                      </span>
                      {player ? (
                        <span className="max-w-[64px] truncate text-caption font-semibold text-warm-900">
                          {player.name}
                        </span>
                      ) : (
                        <span className="text-caption text-warm-400">—</span>
                      )}
                      {player && (player.bats || player.throws) && (
                        <span className="text-caption text-warm-400">
                          {player.bats ? `B:${player.bats}` : ''} {player.throws ? `T:${player.throws}` : ''}
                        </span>
                      )}
                      {conflict && <AlertTriangle className="h-3 w-3 text-red-500" />}
                    </button>
                  </div>
                );
              })}
            </BaseballDiamond>
          ) : (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-warm-200 bg-cream-50/60 p-8 text-center text-sm text-warm-500">
              Bullpen live: assign a pitcher, catcher, and hitter from the roster — no field defense.
            </div>
          )}

          {/* Bench / bullpen / DH holding rows */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(['DH', 'bench', 'bullpen'] as BaseballDefensivePosition[]).map((pos) => {
              const held = slots.filter(
                (s) => s.defensivePosition === pos && (s.side ?? null) === (sideOf() ?? null),
              );
              return (
                <div
                  key={pos}
                  onDragOver={(e) => dragPlayerId && e.preventDefault()}
                  onDrop={() => {
                    if (dragPlayerId) assignToPosition(dragPlayerId, pos);
                    setDragPlayerId(null);
                  }}
                  className="rounded-lg border border-dashed border-warm-200 bg-cream-50/60 p-2"
                >
                  <div className="mb-1 text-caption font-bold uppercase tracking-wide text-warm-400">
                    {pos}
                  </div>
                  {held.length === 0 ? (
                    <p className="text-caption text-warm-400">Drop here</p>
                  ) : (
                    <ul className="space-y-1">
                      {held.map((s) => (
                        <li key={s.playerId} className="flex items-center justify-between gap-1">
                          <span className="truncate text-caption text-warm-800">
                            {rosterById.get(s.playerId)?.name ?? 'Player'}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeSlot(s.playerId)}
                            aria-label="Remove"
                            className="text-warm-400 hover:text-red-500"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ---- Roster + batting-order table ---- */}
        <div className="space-y-4">
          {/* Roster to drag/tap from */}
          <div className="rounded-xl border border-warm-200 bg-white/85 p-3">
            <div className="mb-2 text-xs font-semibold text-warm-700">
              Roster {selectedPlayerId ? '· tap a position to place' : '· drag or tap to select'}
            </div>
            <ul className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
              {roster.map((p) => {
                const placed = assignedIds.has(p.id);
                const selected = selectedPlayerId === p.id;
                const unavail = p.availability === 'unavailable';
                const limited = p.availability === 'limited';
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      draggable
                      onDragStart={() => setDragPlayerId(p.id)}
                      onDragEnd={() => setDragPlayerId(null)}
                      onClick={() => setSelectedPlayerId(selected ? null : p.id)}
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-left text-xs transition-colors',
                        selected
                          ? 'border-primary-400 bg-primary-50'
                          : placed
                            ? 'border-warm-200 bg-cream-100/70 text-warm-500'
                            : 'border-warm-200 bg-white hover:bg-cream-50',
                      )}
                    >
                      <GripVertical className="h-3 w-3 shrink-0 text-warm-300" />
                      <span className="min-w-0 flex-1 truncate font-medium text-warm-900">
                        {p.name}
                      </span>
                      {p.primaryPosition && (
                        <span className="shrink-0 text-caption text-warm-400">{p.primaryPosition}</span>
                      )}
                      {unavail && (
                        <Badge tone="red" appearance="soft" size="sm">
                          Out
                        </Badge>
                      )}
                      {limited && (
                        <Badge tone="warning" appearance="soft" size="sm">
                          Ltd
                        </Badge>
                      )}
                    </button>
                  </li>
                );
              })}
              {roster.length === 0 && (
                <li className="col-span-full text-xs text-warm-400">No players on the roster.</li>
              )}
            </ul>
          </div>

          {/* Batting-order table */}
          <div className="rounded-xl border border-warm-200 bg-white/85 p-3">
            <div className="mb-2 text-xs font-semibold text-warm-700">
              Batting order {isIntrasquad ? `· Team ${activeSide ? SIDE_LABEL[activeSide] : ''}` : ''}
            </div>
            {tableSlots.length === 0 ? (
              <p className="text-xs text-warm-400">Assign players on the field, then set their order.</p>
            ) : (
              <ul className="space-y-1">
                {tableSlots.map((s) => {
                  const p = rosterById.get(s.playerId);
                  const orderDup =
                    s.battingOrder != null &&
                    conflicts.dupOrder.has(`${sideOf() ?? ''}:${s.battingOrder}`);
                  return (
                    <li
                      key={s.playerId}
                      className="flex items-center gap-2 rounded-lg border border-warm-100 bg-cream-50/50 px-2 py-1"
                    >
                      <select
                        value={s.battingOrder ?? ''}
                        onChange={(e) =>
                          setBattingOrder(s.playerId, e.target.value ? Number(e.target.value) : null)
                        }
                        aria-label={`Batting order for ${p?.name ?? 'player'}`}
                        className={cn(
                          'w-12 rounded border px-1 py-0.5 text-xs tabular-nums',
                          orderDup ? 'border-red-400 bg-red-50' : 'border-warm-200',
                        )}
                      >
                        <option value="">—</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-warm-900">
                        {p?.name ?? 'Player'}
                      </span>
                      {s.defensivePosition && (
                        <span className="shrink-0 text-caption font-semibold text-warm-500">
                          {s.defensivePosition}
                        </span>
                      )}
                      {p?.bats && <span className="shrink-0 text-caption text-warm-400">B:{p.bats}</span>}
                      {orderDup && <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
