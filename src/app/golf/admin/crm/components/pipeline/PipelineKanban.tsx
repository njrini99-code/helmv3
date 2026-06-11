'use client';

import { useMemo, useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { Coach, CoachStatus } from '../../crm-config';
import type { CoachEngagement } from '../../types/foundations';
import { PipelineColumn } from './PipelineColumn';
import { PipelineCard } from './PipelineCard';
import { WinLossDialog, type WinLossSubmission } from './WinLossDialog';
import { Button } from '@/components/ui/button';

// ============================================================================
// PipelineKanban — DnD-based kanban for the 7 coach_status values.
// Last 3 statuses (won / lost / nurture) are "Closed" and trigger the
// WinLossDialog on drop, which writes both a status update + a contact_log
// note carrying the reason.
// ============================================================================

interface PipelineKanbanProps {
  coaches: Coach[];
  engagementMap?: Record<string, CoachEngagement>;
  onCoachClick?: (coach: Coach) => void;
  /**
   * Optional override called when a card is dropped into a status column.
   * If provided, the kanban will not mutate Supabase directly — the parent
   * is expected to persist + return a Promise that resolves once done.
   */
  onStatusChange?: (coachId: string, newStatus: CoachStatus) => Promise<void> | void;
}

interface ColumnSpec {
  status: CoachStatus;
  label: string;
  description: string;
  headerBg: string;
  headerText: string;
  countBg: string;
  countText: string;
  dotColor: string;
  /** Whether this column is in the "Closed" cluster — triggers WinLossDialog. */
  promptsReason: boolean;
}

const COLUMNS: ColumnSpec[] = [
  {
    status: 'new_lead',
    label: 'New Lead',
    description: 'Unworked prospects',
    headerBg: 'bg-warm-100/80',
    headerText: 'text-warm-700',
    countBg: 'bg-warm-200/80',
    countText: 'text-warm-700',
    dotColor: 'bg-warm-400',
    promptsReason: false,
  },
  {
    status: 'contacted',
    label: 'Contacted',
    description: 'First outreach sent',
    headerBg: 'bg-blue-50/80',
    headerText: 'text-blue-700',
    countBg: 'bg-blue-100',
    countText: 'text-blue-700',
    dotColor: 'bg-blue-400',
    promptsReason: false,
  },
  {
    status: 'engaged',
    label: 'Engaged',
    description: 'Two-way conversation',
    headerBg: 'bg-violet-50/80',
    headerText: 'text-violet-700',
    countBg: 'bg-violet-100',
    countText: 'text-violet-700',
    dotColor: 'bg-violet-400',
    promptsReason: false,
  },
  {
    status: 'proposal',
    label: 'Proposal',
    description: 'Pitch / pricing in flight',
    headerBg: 'bg-amber-50/80',
    headerText: 'text-amber-700',
    countBg: 'bg-amber-100',
    countText: 'text-amber-700',
    dotColor: 'bg-amber-400',
    promptsReason: false,
  },
  {
    status: 'won',
    label: 'Customer',
    description: 'Closed-won',
    headerBg: 'bg-primary-50/80',
    headerText: 'text-primary-700',
    countBg: 'bg-primary-100',
    countText: 'text-primary-700',
    dotColor: 'bg-primary-500',
    promptsReason: true,
  },
  {
    status: 'lost',
    label: 'Lost',
    description: 'Closed-lost',
    headerBg: 'bg-red-50/80',
    headerText: 'text-red-700',
    countBg: 'bg-red-100',
    countText: 'text-red-700',
    dotColor: 'bg-red-400',
    promptsReason: true,
  },
  {
    status: 'nurture',
    label: 'Nurture',
    description: 'Long-term touchpoints',
    headerBg: 'bg-emerald-50/80',
    headerText: 'text-emerald-700',
    countBg: 'bg-emerald-100',
    countText: 'text-emerald-700',
    dotColor: 'bg-emerald-500',
    promptsReason: true,
  },
];

export function PipelineKanban({
  coaches,
  engagementMap = {},
  onCoachClick,
  onStatusChange,
}: PipelineKanbanProps) {
  const [activeCoachId, setActiveCoachId] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<{ coach: Coach; status: CoachStatus } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Optimistic status overrides keyed by coach id, applied on top of the
  // parent-supplied coaches array so the UI updates instantly on drop. The
  // parent is expected to refetch + supersede via fresh `coaches` props.
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, CoachStatus>>({});

  const supabase = createClient();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Group coaches by their (optionally optimistic) status. ──
  const coachesByStatus = useMemo(() => {
    const groups: Record<CoachStatus, Coach[]> = {
      new_lead: [],
      contacted: [],
      engaged: [],
      proposal: [],
      won: [],
      lost: [],
      nurture: [],
    };
    for (const c of coaches) {
      const status = optimisticStatus[c.id] ?? c.status;
      // is_archived is filtered upstream — kanban only shows active coaches.
      if (c.is_archived) continue;
      const bucket = groups[status];
      if (bucket) bucket.push(c);
    }
    // Stable sort: starred first, then priority desc, then name asc.
    for (const key of Object.keys(groups) as CoachStatus[]) {
      groups[key].sort((a, b) => {
        if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.name.localeCompare(b.name);
      });
    }
    return groups;
  }, [coaches, optimisticStatus]);

  const findCoach = useCallback(
    (id: string): Coach | undefined => coaches.find((c) => c.id === id),
    [coaches],
  );

  // ── Persistence ──
  const persistStatus = useCallback(
    async (coachId: string, newStatus: CoachStatus) => {
      // Caller-supplied override takes precedence.
      if (onStatusChange) {
        await onStatusChange(coachId, newStatus);
        return;
      }
      const { error: updErr } = await supabase
        .from('crm_coaches')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', coachId);
      if (updErr) throw new Error(updErr.message);
    },
    [onStatusChange, supabase],
  );

  const persistWinLossNote = useCallback(
    async (coachId: string, submission: WinLossSubmission) => {
      // crm_contact_log has contact_type='note' as the catch-all bucket; we
      // stash the structured reason in the notes body since contact_log has
      // no dedicated reason column. Phase 4 automations may surface this.
      const noteBody =
        `[${submission.status.toUpperCase()}] reason=${submission.reason}` +
        (submission.notes ? `\n\n${submission.notes}` : '');
      const { error: insErr } = await supabase.from('crm_contact_log').insert({
        coach_id: coachId,
        contact_type: 'note',
        notes: noteBody,
      });
      if (insErr) throw new Error(insErr.message);
    },
    [supabase],
  );

  // ── DnD handlers ──
  const handleDragStart = (event: DragStartEvent) => {
    setActiveCoachId(String(event.active.id));
    setError(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveCoachId(null);
    const { active, over } = event;
    if (!over) return;

    const coachId = String(active.id);
    const coach = findCoach(coachId);
    if (!coach) return;

    const newStatus = String(over.id) as CoachStatus;
    const currentStatus = optimisticStatus[coachId] ?? coach.status;
    if (newStatus === currentStatus) return;

    // Verify newStatus is one of the known column statuses.
    const column = COLUMNS.find((c) => c.status === newStatus);
    if (!column) return;

    // Closed columns require a reason — defer status change to dialog submit.
    if (column.promptsReason) {
      setPendingClose({ coach, status: newStatus });
      return;
    }

    // Optimistic update + persist.
    setOptimisticStatus((prev) => ({ ...prev, [coachId]: newStatus }));
    try {
      await persistStatus(coachId, newStatus);
    } catch (err) {
      // Rollback on failure.
      setOptimisticStatus((prev) => {
        const next = { ...prev };
        delete next[coachId];
        return next;
      });
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      setError(msg);
    }
  };

  const handleWinLossSubmit = async (submission: WinLossSubmission) => {
    if (!pendingClose) return;
    const { coach } = pendingClose;
    setOptimisticStatus((prev) => ({ ...prev, [coach.id]: submission.status }));
    try {
      await persistStatus(coach.id, submission.status);
      await persistWinLossNote(coach.id, submission);
      setPendingClose(null);
    } catch (err) {
      // Rollback on failure.
      setOptimisticStatus((prev) => {
        const next = { ...prev };
        delete next[coach.id];
        return next;
      });
      const msg = err instanceof Error ? err.message : 'Failed to close deal';
      setError(msg);
      throw err; // bubble to dialog so it shows inline error
    }
  };

  const activeCoach = activeCoachId ? findCoach(activeCoachId) : undefined;

  return (
    <>
      {error && (
        <div className="mb-3 px-4 py-2.5 rounded-xl bg-red-50 border border-red-100 flex items-center justify-between gap-3">
          <p className="text-xs text-red-700">{error}</p>
          <Button variant="danger"
            type="button"
            onClick={() => setError(null)}
            className="text-xs text-red-600 hover:text-red-800 font-semibold"
          >
            Dismiss
          </Button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className={cn(
            'flex flex-nowrap gap-4 overflow-x-auto pb-3 snap-x snap-mandatory',
            'lg:snap-none',
          )}
        >
          {COLUMNS.map((col) => (
            <PipelineColumn
              key={col.status}
              status={col.status}
              label={col.label}
              description={col.description}
              headerBg={col.headerBg}
              headerText={col.headerText}
              countBg={col.countBg}
              countText={col.countText}
              dotColor={col.dotColor}
              promptsReason={col.promptsReason}
              coaches={coachesByStatus[col.status]}
              engagementMap={engagementMap}
              onCoachClick={onCoachClick}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeCoach ? (
            <PipelineCard
              coach={activeCoach}
              engagement={engagementMap[activeCoach.id]}
              isOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {pendingClose && (
        <WinLossDialog
          coach={pendingClose.coach}
          newStatus={pendingClose.status}
          onClose={() => setPendingClose(null)}
          onSubmit={handleWinLossSubmit}
        />
      )}
    </>
  );
}
