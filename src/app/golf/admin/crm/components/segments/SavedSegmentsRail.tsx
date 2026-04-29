'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconPlus, IconBookmark, IconX } from '@/components/icons';
import {
  listSegments,
  deleteSegment,
  updateSegment,
} from '@/app/golf/actions/crm-foundations';
import type { CrmSegment } from '@/app/golf/admin/crm/types/foundations';
import type { Filters } from '../CoachFilters';
import { SegmentBadge } from './SegmentBadge';
import { SaveSegmentDialog } from './SaveSegmentDialog';

// ============================================================================
// SavedSegmentsRail — pill list in sidebar. Each pill applies its filter
// definition to the active CRM filter state on click.
// ============================================================================

interface SavedSegmentsRailProps {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  /** Optional pre-loaded segment counts (e.g. from a parent useMemo). */
  counts?: Record<string, number>;
  collapsed?: boolean;
}

export function SavedSegmentsRail({
  filters,
  setFilters,
  counts,
  collapsed = false,
}: SavedSegmentsRailProps) {
  const [segments, setSegments] = useState<CrmSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const contextRef = useRef<HTMLDivElement | null>(null);

  // Initial load.
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listSegments();
      setSegments(rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load segments';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Sort: pinned first (asc), then most-recent created.
  const ordered = useMemo(() => {
    return [...segments].sort((a, b) => {
      const ap = a.pin_order;
      const bp = b.pin_order;
      const aPinned = ap !== null && ap !== undefined;
      const bPinned = bp !== null && bp !== undefined;
      if (aPinned && bPinned) return (ap as number) - (bp as number);
      if (aPinned) return -1;
      if (bPinned) return 1;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
  }, [segments]);

  const handleApply = useCallback(
    (segment: CrmSegment) => {
      setActiveId(segment.id);
      setFilters((current) => ({
        ...current,
        ...segment.definition,
      }));
    },
    [setFilters],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, segmentId: string) => {
      e.preventDefault();
      setContextMenu({ id: segmentId, x: e.clientX, y: e.clientY });
    },
    [],
  );

  // Close context menu on any outside click / scroll / escape.
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('click', close);
    document.addEventListener('scroll', close, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('scroll', close, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const handleTogglePin = async (segment: CrmSegment) => {
    setContextMenu(null);
    try {
      const newPin = segment.pin_order === null || segment.pin_order === undefined ? 0 : null;
      const updated = await updateSegment(segment.id, { pin_order: newPin });
      setSegments((prev) => prev.map((s) => (s.id === segment.id ? updated : s)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update segment';
      setError(msg);
    }
  };

  const handleDelete = async (segment: CrmSegment) => {
    setContextMenu(null);
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Delete segment "${segment.name}"?`);
      if (!ok) return;
    }
    try {
      await deleteSegment(segment.id);
      setSegments((prev) => prev.filter((s) => s.id !== segment.id));
      if (activeId === segment.id) setActiveId(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete segment';
      setError(msg);
    }
  };

  const handleCreated = (created: CrmSegment) => {
    setSegments((prev) => [created, ...prev]);
  };

  if (collapsed) {
    return (
      <div className="px-3 py-2 border-t border-white/10">
        <button
          onClick={() => setDialogOpen(true)}
          aria-label="Save current filters as segment"
          className="w-full flex items-center justify-center p-2.5 rounded-[10px] text-warm-400 hover:bg-white/5 hover:text-white transition-all duration-200"
        >
          <IconBookmark size={16} />
        </button>
        <SaveSegmentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          filters={filters}
          onCreated={handleCreated}
        />
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-t border-white/10">
      <div className="flex items-center justify-between px-3 mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-warm-500">
          Segments
        </span>
        <button
          onClick={() => setDialogOpen(true)}
          aria-label="Save current filters as segment"
          className="p-1 rounded-md text-warm-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Save current filters as segment"
        >
          <IconPlus size={14} />
        </button>
      </div>

      {loading && (
        <div className="px-3 py-2 space-y-1">
          {[0, 1].map((i) => (
            <div key={i} className="h-7 rounded-[10px] bg-white/5 skeleton-shimmer" />
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="px-3 text-[11px] text-red-400">{error}</p>
      )}

      {!loading && !error && ordered.length === 0 && (
        <p className="px-3 py-2 text-[11px] text-warm-500">
          No segments yet — apply filters and click <IconBookmark size={10} className="inline" /> to save one.
        </p>
      )}

      {!loading && !error && ordered.length > 0 && (
        <div className="space-y-0.5 max-h-[260px] overflow-y-auto scrollbar-hide">
          {ordered.map((segment) => (
            <SegmentBadge
              key={segment.id}
              segment={segment}
              count={counts?.[segment.id]}
              isActive={activeId === segment.id}
              onClick={() => handleApply(segment)}
              onContextMenu={(e) => handleContextMenu(e, segment.id)}
            />
          ))}
        </div>
      )}

      <SaveSegmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        filters={filters}
        onCreated={handleCreated}
      />

      {/* Context menu */}
      {contextMenu && (() => {
        const segment = segments.find((s) => s.id === contextMenu.id);
        if (!segment) return null;
        return (
          <div
            ref={contextRef}
            className="fixed z-[60] min-w-[180px] py-1 rounded-xl bg-white shadow-2xl border border-warm-200/60"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => handleTogglePin(segment)}
              className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 transition-colors flex items-center gap-2"
            >
              <IconBookmark size={14} className="text-warm-400" />
              {segment.pin_order === null || segment.pin_order === undefined
                ? 'Pin to rail'
                : 'Unpin from rail'}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(segment)}
              className={cn(
                'w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2',
                'text-red-600 hover:bg-red-50',
              )}
            >
              <IconX size={14} />
              Delete segment
            </button>
          </div>
        );
      })()}
    </div>
  );
}
