'use client';

// =============================================================================
// src/components/baseball/practice-planner/TimeRailBuilder.tsx
//
// Packet: practice-intel
//
// The V7 "5-min time-rail builder". A vertical rail rendered at a fixed
// pixels-per-minute scale where each block occupies its [start, start+duration]
// minutes. Coaches reposition + resize blocks by:
//   * DRAG     — pointer drag the block body (move) or its bottom edge (resize),
//                snapping to the 5-minute rail.
//   * KEYBOARD — focus a block and use Arrow keys (the accessible ALTERNATIVE
//                the spec requires): Up/Down move ±5 min, Shift+Up/Down resize
//                ±5 min. Announced via aria-live.
//
// Live validation (V7 "overlap/owner/conflict warnings, publish validation")
// runs through the SAME validatePracticeForPublish used server-side, so what the
// coach sees on the rail is exactly what the publish gate enforces.
//
// Design: GolfHelm cream/green primitives. No golf labels. framer-motion via the
// parent's LazyMotion. Reduced-motion respected. No new palette.
// =============================================================================

import { useCallback, useMemo, useRef, useState } from 'react';
import { GripVertical, AlertTriangle, UserX, Ruler, Eye, EyeOff } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  validatePracticeForPublish,
  type PracticeValidationResult,
} from '@/lib/baseball/practice-validation';

// One draft block on the rail. Mirrors the editor's DraftBlock superset.
export interface RailBlock {
  key: string;
  startOffsetMin: number;
  durationMin: number;
  activity: string;
  coachOwnerId?: string | null;
  coachOwnerName?: string | null;
  groupLabel?: string | null;
  stationType?: string | null;
  isMeasured?: boolean;
  measurementTarget?: string | null;
  visibility?: 'staff_only' | 'player_visible' | 'restricted';
}

interface TimeRailBuilderProps {
  blocks: RailBlock[];
  /** Patch a single block (move/resize/edit). */
  onChange: (key: string, patch: Partial<RailBlock>) => void;
  /** Select a block to edit its details in the side editor. */
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Surface the live validation to the parent so it can gate Publish. */
  onValidation?: (result: PracticeValidationResult) => void;
}

const RAIL_STEP = 5; // minutes per snap
const PX_PER_MIN = 3.2; // rail scale
const MIN_DURATION = 5;

function fmtClock(mins: number): string {
  const h = Math.floor(mins / 60);
  const mm = String(mins % 60).padStart(2, '0');
  return `${h}:${mm}`;
}

function snap(min: number): number {
  return Math.max(0, Math.round(min / RAIL_STEP) * RAIL_STEP);
}

export function TimeRailBuilder({
  blocks,
  onChange,
  selectedKey,
  onSelect,
  onValidation,
}: TimeRailBuilderProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [announce, setAnnounce] = useState('');
  const dragState = useRef<{
    key: string;
    mode: 'move' | 'resize';
    startY: number;
    startOffset: number;
    startDuration: number;
  } | null>(null);

  const totalMinutes = useMemo(
    () => blocks.reduce((max, b) => Math.max(max, b.startOffsetMin + b.durationMin), 0),
    [blocks],
  );
  // Render at least 90 min of rail so there's room to drop the last block lower.
  const railMinutes = Math.max(totalMinutes + 30, 90);

  // ---- Live validation (same fn as the server publish gate) -----------------
  const validation = useMemo(() => {
    const result = validatePracticeForPublish(
      blocks.map((b) => ({
        startOffsetMin: b.startOffsetMin,
        durationMin: b.durationMin,
        activity: b.activity,
        coachOwnerId: b.coachOwnerId,
        isMeasured: b.isMeasured,
        measurementTarget: b.measurementTarget,
      })),
    );
    onValidation?.(result);
    return result;
  }, [blocks, onValidation]);

  // Map a block index -> the issue codes touching it (for inline highlight).
  const issuesByIndex = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const issue of [...validation.errors, ...validation.warnings]) {
      for (const idx of issue.blockKeys ?? []) {
        if (!map.has(idx)) map.set(idx, new Set());
        map.get(idx)!.add(issue.code);
      }
    }
    return map;
  }, [validation]);

  // ---- Pointer drag (move + resize), snapped to the 5-min rail ---------------
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, block: RailBlock, mode: 'move' | 'resize') => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      dragState.current = {
        key: block.key,
        mode,
        startY: e.clientY,
        startOffset: block.startOffsetMin,
        startDuration: block.durationMin,
      };
      onSelect(block.key);
    },
    [onSelect],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const st = dragState.current;
      if (!st) return;
      const deltaMin = (e.clientY - st.startY) / PX_PER_MIN;
      if (st.mode === 'move') {
        const next = snap(st.startOffset + deltaMin);
        onChange(st.key, { startOffsetMin: next });
      } else {
        const next = Math.max(MIN_DURATION, snap(st.startDuration + deltaMin));
        onChange(st.key, { durationMin: next });
      }
    },
    [onChange],
  );

  const handlePointerUp = useCallback(() => {
    dragState.current = null;
  }, []);

  // ---- Keyboard alternative (accessible) -------------------------------------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, block: RailBlock) => {
      let handled = true;
      if (e.key === 'ArrowUp' && !e.shiftKey) {
        const next = snap(block.startOffsetMin - RAIL_STEP);
        onChange(block.key, { startOffsetMin: next });
        setAnnounce(`${block.activity || 'Block'} moved to ${fmtClock(next)}`);
      } else if (e.key === 'ArrowDown' && !e.shiftKey) {
        const next = snap(block.startOffsetMin + RAIL_STEP);
        onChange(block.key, { startOffsetMin: next });
        setAnnounce(`${block.activity || 'Block'} moved to ${fmtClock(next)}`);
      } else if (e.key === 'ArrowUp' && e.shiftKey) {
        const next = Math.max(MIN_DURATION, snap(block.durationMin - RAIL_STEP));
        onChange(block.key, { durationMin: next });
        setAnnounce(`${block.activity || 'Block'} duration ${next} minutes`);
      } else if (e.key === 'ArrowDown' && e.shiftKey) {
        const next = Math.max(MIN_DURATION, snap(block.durationMin + RAIL_STEP));
        onChange(block.key, { durationMin: next });
        setAnnounce(`${block.activity || 'Block'} duration ${next} minutes`);
      } else if (e.key === 'Enter' || e.key === ' ') {
        onSelect(block.key);
      } else {
        handled = false;
      }
      if (handled) e.preventDefault();
    },
    [onChange, onSelect],
  );

  // 5-minute gridlines, labeled every 15 min.
  const gridlines = useMemo(() => {
    const lines: number[] = [];
    for (let m = 0; m <= railMinutes; m += RAIL_STEP) lines.push(m);
    return lines;
  }, [railMinutes]);

  return (
    <div className="space-y-3">
      {/* Validation summary band */}
      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {validation.errors.length > 0 && (
            <Badge tone="red" appearance="soft" size="sm" icon={<AlertTriangle className="h-3 w-3" />}>
              {validation.errors.length} blocking{' '}
              {validation.errors.length === 1 ? 'issue' : 'issues'}
            </Badge>
          )}
          {validation.warnings.length > 0 && (
            <Badge tone="warning" appearance="soft" size="sm" icon={<AlertTriangle className="h-3 w-3" />}>
              {validation.warnings.length}{' '}
              {validation.warnings.length === 1 ? 'warning' : 'warnings'}
            </Badge>
          )}
          {validation.ok && (
            <span className="text-xs text-warm-500">Ready to publish.</span>
          )}
        </div>
      )}

      <div
        ref={railRef}
        className="relative rounded-2xl border border-warm-200 bg-cream-50/60 p-3"
        style={{ height: railMinutes * PX_PER_MIN + 24 }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Time gutter + gridlines */}
        <div className="absolute inset-y-3 left-0 w-12">
          {gridlines.map((m) =>
            m % 15 === 0 ? (
              <div
                key={m}
                className="absolute left-0 -translate-y-1/2 text-[10px] tabular-nums text-warm-400"
                style={{ top: m * PX_PER_MIN }}
              >
                {fmtClock(m)}
              </div>
            ) : null,
          )}
        </div>
        <div className="absolute inset-y-3 left-12 right-3">
          {gridlines.map((m) => (
            <div
              key={m}
              className={cn(
                'absolute left-0 right-0 border-t',
                m % 15 === 0 ? 'border-warm-200/80' : 'border-warm-100/60',
              )}
              style={{ top: m * PX_PER_MIN }}
            />
          ))}

          {/* Blocks */}
          {blocks.map((b, idx) => {
            const codes = issuesByIndex.get(idx) ?? new Set<string>();
            const hasError = codes.has('overlap') || codes.has('missing_headline') || codes.has('zero_duration');
            const hasOwnerWarn = codes.has('owner_conflict') || codes.has('unassigned_owner');
            const selected = selectedKey === b.key;
            const staffOnly = b.visibility === 'staff_only';
            return (
              <div
                key={b.key}
                role="button"
                tabIndex={0}
                aria-label={`${b.activity || 'Untitled block'}, ${fmtClock(b.startOffsetMin)} to ${fmtClock(
                  b.startOffsetMin + b.durationMin,
                )}. Arrow keys move; Shift plus arrows resize.`}
                onKeyDown={(e) => handleKeyDown(e, b)}
                onClick={() => onSelect(b.key)}
                className={cn(
                  'absolute left-0 right-0 overflow-hidden rounded-xl border px-2.5 py-1.5 text-left transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
                  selected
                    ? 'border-primary-400 bg-primary-50/90 shadow-card'
                    : 'border-warm-200 bg-white/85 hover:bg-white',
                  hasError && 'border-red-400 bg-red-50/80',
                )}
                style={{
                  top: b.startOffsetMin * PX_PER_MIN,
                  height: Math.max(b.durationMin * PX_PER_MIN - 4, 18),
                }}
              >
                <div className="flex items-start gap-1.5">
                  <span
                    className="mt-0.5 cursor-grab touch-none text-warm-400 active:cursor-grabbing"
                    onPointerDown={(e) => handlePointerDown(e, b, 'move')}
                    aria-hidden
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-semibold text-warm-900">
                        {b.activity || 'Untitled block'}
                      </span>
                      {staffOnly ? (
                        <EyeOff className="h-3 w-3 shrink-0 text-warm-400" aria-label="Staff only" />
                      ) : (
                        <Eye className="h-3 w-3 shrink-0 text-primary-500" aria-label="Player visible" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-warm-500">
                      <span className="tabular-nums">
                        {fmtClock(b.startOffsetMin)}–{fmtClock(b.startOffsetMin + b.durationMin)} ·{' '}
                        {b.durationMin}m
                      </span>
                      {b.groupLabel && <span>{b.groupLabel}</span>}
                      {b.coachOwnerName && <span>{b.coachOwnerName}</span>}
                      {b.isMeasured && (
                        <span className="inline-flex items-center gap-0.5 text-primary-600">
                          <Ruler className="h-2.5 w-2.5" /> measured
                        </span>
                      )}
                    </div>
                    {hasOwnerWarn && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-amber-600">
                        <UserX className="h-2.5 w-2.5" />
                        {codes.has('owner_conflict') ? 'Owner double-booked' : 'No owner'}
                      </span>
                    )}
                    {codes.has('overlap') && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-red-600">
                        <AlertTriangle className="h-2.5 w-2.5" /> Overlaps another block
                      </span>
                    )}
                  </div>
                </div>

                {/* Resize handle (bottom edge) */}
                <span
                  className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize touch-none"
                  onPointerDown={(e) => handlePointerDown(e, b, 'resize')}
                  aria-hidden
                />
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-warm-400">
        Drag a block to move it, drag its bottom edge to resize. Or focus a block and use the arrow
        keys (Shift + arrows to resize). The rail snaps to 5-minute steps.
      </p>

      {/* Screen-reader announcements for keyboard moves */}
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
    </div>
  );
}
