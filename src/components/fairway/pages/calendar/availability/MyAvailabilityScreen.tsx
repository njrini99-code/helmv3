'use client';

/**
 * ============================================================================
 * Fairway · Calendar · MyAvailabilityScreen — SCREEN-BUILD-PLAN.md §2.7 (S7)
 * ----------------------------------------------------------------------------
 * "My availability" — Busy time | Sources. Busy time is the coach-only
 * `golf_coach_blocked_time` CRUD (`useBlockedTime.ts`, wrapping the EXISTING
 * `getCoachBlockedTime`/`addCoachBlockedTime`/`updateCoachBlockedTime`/
 * `deleteCoachBlockedTime` actions unchanged). A player has no equivalent
 * table (`golf_player_availability_blocks` does not exist — gate G1) and
 * NEVER writes to the coach table; the player's Busy time tab renders
 * `FeatureUnavailable` instead, full stop.
 *
 * Sources is role-agnostic and deliberately thin: the schedule snapshot
 * (`getScheduleWindow`) exposes exactly ONE `verification` per person and one
 * `checkedAt` for the whole snapshot — not a per-source breakdown. Per-source
 * states need a P1 contract addition (gate G6) and are hidden, not guessed;
 * this tab shows only the single "Based on Helm schedules · checked HH:MM"
 * line `SourceStatusList` builds from `snapshot.checkedAt` and the caller's
 * own `verification`.
 *
 * Mobile: one `ModalShell` pane that swaps between the list and the editor
 * (a Back control replaces Close while editing — one overlay, one screen at a
 * time). Desktop (`useMediaQuery('(min-width: 1024px)')`): both panes at
 * once, list on the left, editor on the right, matching the plan's "dedicated
 * inspector panel" composition.
 * ========================================================================== */

import * as React from 'react';
import { ArrowLeft, CalendarClock, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Button,
  Segmented,
  Skeleton,
  EmptyState,
  InlineNotice,
  FeatureUnavailable,
  DiscardChangesModal,
} from '@/components/fairway';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useScheduleWindow } from '@/hooks/golf/use-schedule-window';
import { getScheduleWindow } from '@/app/golf/actions/scheduling';
import type { ScheduleWindowRequest } from '@/lib/calendar/scheduling-contracts';
import { formatDateLabel, formatClock } from '../EventWhenFields';
import { parseRecurrenceRule, describeRecurrenceRule } from '@/lib/golf/recurrence';
import { useBlockedTime, type BlockedTimeInput, type CoachBlockedTimeRow } from './useBlockedTime';
import { useIsOnline } from './useIsOnline';
import { BusyTimeEditor } from './BusyTimeEditor';
import { SourceStatusList, type SourceStatusState } from './SourceStatusList';
import surfaces from '../CalendarSurfaces.module.css';

type Tab = 'busy' | 'sources';
type Selection = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; id: string };

export interface MyAvailabilityScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewerRole: 'coach' | 'player';
  /** The viewer's active team, for the Sources check only. `null` renders an
   *  honest "no team to check yet" instead of a fabricated result. */
  teamId: string | null;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function groupByDay(blocks: CoachBlockedTimeRow[]): Array<[string, CoachBlockedTimeRow[]]> {
  const map = new Map<string, CoachBlockedTimeRow[]>();
  for (const block of blocks) {
    const key = block.start_date;
    const bucket = map.get(key);
    if (bucket) bucket.push(block);
    else map.set(key, [block]);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function MyAvailabilityScreen({ open, onOpenChange, viewerRole, teamId }: MyAvailabilityScreenProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const online = useIsOnline();
  const [tab, setTab] = React.useState<Tab>('busy');
  const [selection, setSelection] = React.useState<Selection>({ kind: 'list' });
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setTab('busy');
      setSelection({ kind: 'list' });
      setPendingDeleteId(null);
    }
  }, [open]);

  const busyEnabled = open && viewerRole === 'coach';
  const { blocks, loading, error, retry, pendingIds, create, update, remove } = useBlockedTime({ enabled: busyEnabled });

  const scheduleRequest = React.useMemo<ScheduleWindowRequest | null>(() => {
    if (!open || tab !== 'sources' || !teamId) return null;
    return { teamId, date: todayIso(), participantIds: [] };
  }, [open, tab, teamId]);
  const { snapshot, loading: sourcesLoading, error: sourcesError, retry: retrySources } = useScheduleWindow(scheduleRequest, getScheduleWindow);
  const self = snapshot?.participants.find((p) => p.isViewer);
  const sourceState: SourceStatusState = !teamId
    ? { kind: 'no-team' }
    : sourcesLoading
      ? { kind: 'loading' }
      : sourcesError
        ? { kind: 'error', message: sourcesError }
        : snapshot && self
          ? { kind: 'ready', verification: self.verification, checkedAt: snapshot.checkedAt }
          : { kind: 'error', message: 'Could not verify your schedule.' };

  const editingBlock = selection.kind === 'edit' ? blocks.find((b) => b.id === selection.id) ?? null : null;
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  async function handleSave(data: BlockedTimeInput) {
    setSubmitError(null);
    const result = selection.kind === 'edit' ? await update(selection.id, data) : await create(data);
    if (result.success) setSelection({ kind: 'list' });
    else setSubmitError(result.error);
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    const result = await remove(id);
    if (result.success) setSelection({ kind: 'list' });
    else setSubmitError(result.error);
  }

  const savingId = selection.kind === 'edit' ? selection.id : 'new';
  const isSaving = pendingIds.has(savingId);
  const isDeleting = pendingDeleteId !== null && pendingIds.has(pendingDeleteId);

  const showEditor = selection.kind !== 'list';
  const groups = React.useMemo(() => groupByDay(blocks), [blocks]);

  function renderBusyList() {
    if (viewerRole === 'player') {
      return (
        <div className="min-h-[22rem]">
          <FeatureUnavailable
            title="Personal busy time"
            message="Personal busy time is coming soon — your classes already count toward your schedule."
          />
        </div>
      );
    }
    if (loading && blocks.length === 0) {
      return (
        <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading your busy time">
          <Skeleton className="h-16 rounded-fw-md" />
          <Skeleton className="h-16 rounded-fw-md" />
          <Skeleton className="h-16 rounded-fw-md" />
        </div>
      );
    }
    if (error) {
      return (
        <div className="p-4">
          <InlineNotice tone="danger" title="Couldn&rsquo;t load your busy time" action={<Button variant="secondary" size="sm" onClick={retry}>Retry</Button>}>
            {error}
          </InlineNotice>
        </div>
      );
    }
    if (blocks.length === 0) {
      return (
        <div className="p-4">
          <EmptyState
            icon={CalendarClock}
            title="No busy time added"
            description="Add personal blocks so schedule comparisons account for your time honestly."
            action={
              !online ? undefined : (
                <Button variant="primary" size="sm" onClick={() => setSelection({ kind: 'new' })}>
                  Add busy time
                </Button>
              )
            }
          />
        </div>
      );
    }
    return (
      <ul className="space-y-4 p-4">
        {groups.map(([day, dayBlocks]) => (
          <li key={day}>
            <p className="mb-1.5 font-fw-sans text-caption font-medium uppercase tracking-[0.06em] text-text-tertiary">
              {formatDateLabel(day)}
            </p>
            <ul className="space-y-1.5">
              {dayBlocks.map((block, index) => {
                const rule = parseRecurrenceRule(block.recurrence_rule);
                const rowPending = pendingIds.has(block.id);
                return (
                  <li key={block.id} className={cn(index < 8 && surfaces.enter)} style={index < 8 ? { animationDelay: `${index * 30}ms` } : undefined}>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setSelection({ kind: 'edit', id: block.id })}
                      disabled={rowPending}
                      className={cn(
                        'flex h-auto w-full min-h-11 items-center justify-between gap-3 rounded-fw-md border border-border-subtle bg-surface px-3 py-2.5 text-left font-normal',
                        surfaces.press,
                        'hover:border-border-strong disabled:opacity-60',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-fw-sans text-body-sm font-medium text-text-primary">
                          {block.title || 'Busy'}
                        </span>
                        <span className="block font-fw-sans text-caption text-text-secondary">
                          {block.all_day
                            ? 'All day'
                            : block.start_time
                              ? `${formatClock(block.start_time)}${block.end_time ? ` – ${formatClock(block.end_time)}` : ''}`
                              : 'All day'}
                          {rule ? ` · ${describeRecurrenceRule(rule)}` : ''}
                        </span>
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    );
  }

  function renderEditor() {
    if (viewerRole === 'player') return null;
    return (
      <BusyTimeEditor
        initial={editingBlock}
        saving={isSaving}
        deleting={isDeleting}
        submitError={submitError}
        disabled={!online}
        onSave={handleSave}
        onCancel={() => { setSubmitError(null); setSelection({ kind: 'list' }); }}
        onDelete={editingBlock ? () => setPendingDeleteId(editingBlock.id) : undefined}
      />
    );
  }

  // When the list is genuinely empty, `EmptyState`'s own "Add busy time" CTA
  // IS the screen's one primary action — a second copy in the header would
  // violate the plan's one-primary-action rule by putting two identical
  // buttons on screen at once.
  const listIsEmpty = viewerRole === 'coach' && !loading && !error && blocks.length === 0;
  const canAdd = viewerRole === 'coach' && tab === 'busy' && online && !listIsEmpty;

  return (
    <>
      <ModalShell
        open={open}
        onOpenChange={onOpenChange}
        title="My availability"
        hideTitle
        hideClose
        size="full"
        className={cn(
          'flex h-[min(88dvh,720px)] !w-[calc(100vw-1rem)] flex-col overflow-hidden p-0 sm:!w-[min(90vw,860px)]',
          surfaces.panel,
        )}
      >
        <header className={cn('relative z-10 flex shrink-0 items-center gap-3 border-b px-4 py-4 sm:px-6', surfaces.chrome)}>
          {!isDesktop && showEditor ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label="Back to my availability"
              onClick={() => { setSubmitError(null); setSelection({ kind: 'list' }); }}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="font-fw-display text-body-lg font-semibold text-text-primary">My availability</h2>
          </div>
          {!isDesktop && showEditor ? null : (
            <Segmented<Tab>
              aria-label="My availability sections"
              size="sm"
              options={[
                { value: 'busy', label: 'Busy time' },
                { value: 'sources', label: 'Sources' },
              ]}
              value={tab}
              onValueChange={setTab}
            />
          )}
          {canAdd && (isDesktop || !showEditor) ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="h-4 w-4" aria-hidden />}
              onClick={() => { setSubmitError(null); setSelection({ kind: 'new' }); }}
            >
              Add busy time
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" aria-label="Close" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </header>

        {!online ? (
          <div className="shrink-0 px-4 pt-3 sm:px-6">
            <InlineNotice tone="warning" title="You&rsquo;re offline">
              Showing your last loaded busy time. Reconnect to add, edit, or delete.
            </InlineNotice>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === 'sources' ? (
            <div className="h-full overflow-y-auto p-4 sm:p-6">
              <p className="mb-3 font-fw-sans text-body-sm text-text-secondary">
                How completely Helm could check your schedule when other people compare availability with you.
              </p>
              <SourceStatusList state={sourceState} onRetry={retrySources} />
            </div>
          ) : isDesktop ? (
            <div className="grid h-full grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-h-0 overflow-y-auto border-r border-border-subtle">{renderBusyList()}</div>
              <div className={cn('min-h-0 overflow-hidden', surfaces.inspector)}>
                {viewerRole === 'coach' && showEditor ? (
                  renderEditor()
                ) : viewerRole === 'coach' ? (
                  <div className="flex h-full items-center justify-center p-6 text-center">
                    <p className="font-fw-sans text-body-sm text-text-tertiary">
                      Select a busy time block to edit, or add a new one.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto">{showEditor ? renderEditor() : renderBusyList()}</div>
          )}
        </div>
      </ModalShell>

      <DiscardChangesModal
        open={pendingDeleteId !== null}
        onStay={() => setPendingDeleteId(null)}
        onDiscard={handleConfirmDelete}
        itemLabel="busy time block"
      />
    </>
  );
}
