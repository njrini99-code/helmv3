'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconPlus, IconBookmark, IconX } from '@/components/icons';
import {
  listSegments,
  deleteSegment,
  updateSegment,
} from '@/app/golf/actions/crm-foundations';
import type { CrmSegment, SegmentDefinition } from '@/app/golf/admin/crm/types/foundations';
import type { Filters } from '../CoachFilters';
import { SegmentBadge } from './SegmentBadge';
import { SaveSegmentDialog } from './SaveSegmentDialog';
import { Button, IconButton } from '@/components/ui/button';

// ============================================================================
// SavedSegmentsRail — pill list in sidebar. Each pill applies its filter
// definition to the active CRM filter state on click.
// ============================================================================

// ----------------------------------------------------------------------------
// DEFAULT_FILTERS — the "no filters applied" Filters value. Mirrors the
// literal inside CoachFilters.tsx's clearFilters() field-for-field; if that
// literal changes, this MUST change in lockstep (same contract as
// SegmentDefinition mirroring Filters — see foundations.ts header comment).
// Kept local rather than imported because CoachFilters.tsx does not export
// it today — integrator note: exporting a shared DEFAULT_FILTERS constant
// from CoachFilters.tsx and having clearFilters() reuse it would remove this
// duplication (out of scope here — not on this fix's file list).
// ----------------------------------------------------------------------------
export const DEFAULT_FILTERS: Filters = {
  status: 'all',
  division: 'all',
  conference: 'all',
  program: 'all',
  priority: 'all',
  search: '',
  followUpDue: false,
  starred: false,
  hasNotes: false,
  noContact30Days: false,
  primaryOnly: false,
  queueStatus: 'all',
  overdueFollowUp: false,
  noNextStep: false,
};

// ----------------------------------------------------------------------------
// applySegmentDefinition — REPLACE, not merge. Starts from DEFAULT_FILTERS
// and overlays only what the saved segment actually defines, so a facet
// that was active before applying the segment (but absent from the saved
// definition) is cleared instead of leaking through. Exported so the
// save->apply round trip is unit-testable; see
// SaveSegmentDialog.round-trip.test.ts.
// ----------------------------------------------------------------------------
export function applySegmentDefinition(definition: SegmentDefinition): Filters {
  return {
    ...DEFAULT_FILTERS,
    ...definition,
  };
}

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
      setFilters(() => applySegmentDefinition(segment.definition));
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
      <div className="px-3 py-2 border-t border-nav-text/10">
        <IconButton variant="default"
          onClick={() => setDialogOpen(true)}
          aria-label="Save current filters as segment"
          className="w-full flex items-center justify-center p-2.5 rounded-fw-sm text-nav-text-dim hover:bg-nav-surface hover:text-nav-text transition-all duration-200"
        >
          <IconBookmark size={16} />
        </IconButton>
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
    <div className="px-3 py-2 border-t border-nav-text/10">
      <div className="flex items-center justify-between px-3 mb-2">
        <span className="text-eyebrow font-semibold uppercase tracking-wider text-nav-text-dim">
          Segments
        </span>
        <IconButton variant="default"
          onClick={() => setDialogOpen(true)}
          aria-label="Save current filters as segment"
          className="p-1 rounded-fw-sm text-nav-text-dim hover:text-nav-text hover:bg-nav-surface transition-colors"
          title="Save current filters as segment"
        >
          <IconPlus size={14} />
        </IconButton>
      </div>

      {loading && (
        <div className="px-3 py-2 space-y-1">
          {[0, 1].map((i) => (
            <div key={i} className="h-7 rounded-fw-sm bg-nav-surface skeleton-shimmer" />
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="px-3 text-eyebrow text-fw-danger/80">{error}</p>
      )}

      {!loading && !error && ordered.length === 0 && (
        <p className="px-3 py-2 text-eyebrow text-nav-text-dim">
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
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only wrapper prevents context menu from closing when clicking menu items
          <div
            ref={contextRef}
            className="fixed z-modal min-w-[180px] py-1 rounded-fw-md bg-elevated shadow-raise"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <Button variant="ghost"
              type="button"
              onClick={() => handleTogglePin(segment)}
              className="w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-sunken transition-colors flex items-center gap-2"
            >
              <IconBookmark size={14} className="text-text-tertiary" />
              {segment.pin_order === null || segment.pin_order === undefined
                ? 'Pin to rail'
                : 'Unpin from rail'}
            </Button>
            <Button variant="danger"
              type="button"
              onClick={() => handleDelete(segment)}
              className={cn(
                'w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2',
                'text-fw-danger-ink hover:bg-fw-danger-bg/50',
              )}
            >
              <IconX size={14} />
              Delete segment
            </Button>
          </div>
        );
      })()}
    </div>
  );
}
