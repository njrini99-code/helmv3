'use client';

// =============================================================================
// src/components/baseball/staff-decision-room/StaffDecisionRoomFairway.tsx
//
// StaffDecisionRoomFairway — the Staff Decision Room migrated to "The Living
// Annual" kit (P4.23; spec: docs/baseball/design-system-living-annual.md §5
// "THE WAR ROOM · clay ink · coach recruiting" — Decision Room lives in this
// lane — and §6 P3 #10 "Decision Room"). Built sequentially as three panes:
//
//   1. AGENDA PANE   — masthead + stat strip + meeting mode (agenda list +
//                       source-backed detail/action pane). [this commit]
//   2. LEDGER PANE    — practice effectiveness, action-outcome ledger,
//                       players/import rails, wins, availability, attendance/
//                       lift, tasks/conflicts, shared intelligence, and the
//                       Decision Ledger itself.
//   3. CEREMONY       — the decision-made payoff: resolving an item or
//                       recording a decision note briefly presses a
//                       `<CommitSeal>` ("DECIDED") over the detail pane before
//                       the item leaves the agenda — the emotional beat of
//                       "the coach edits the magazine" made physical (spec §9
//                       north-star #2, adapted from a recruiting commit to a
//                       staff decision).
//
// PRESENTATION ONLY. Receives the SAME `data` read model and the SAME
// root-level state/handlers `StaffDecisionRoomClient` already owns (agenda
// selection, the "new agenda item" form, export, refresh, the outcome
// re-measure sweep — the last two land on this component in the ledger-pane
// commit). Every mutation this file calls directly (mark discussed/resolve/
// reopen/record a decision note/convert a signal to a task, note, or
// practice block) is the EXACT SAME server action the pre-migration client
// called — `actions/signals.ts` is imported read-only for
// `convertSignalToAction`, never edited.
//
// Ink: this whole surface renders in `ink="pursuit"` (clay) per the IA spec —
// Decision Room is a War Room surface, not a Pressbox one.
// =============================================================================

import { useState, useTransition, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import {
  IconBolt,
  IconAlertCircle,
  IconCheck,
  IconCheckCheck,
  IconClipboardList,
  IconNote,
  IconArrowRight,
  IconChevronRight,
  IconDownload,
  IconX,
  IconCalendar,
  IconPlus,
} from '@/components/icons';
import { cn } from '@/lib/utils';

import {
  markMeetingItemDiscussed,
  resolveMeetingItem,
  reopenMeetingItem,
  recordDecisionNote,
  convertSignalToPracticeBlock,
  type DecisionRoomData,
  type DecisionRoomAgendaItem,
} from '@/app/baseball/actions/decision-room';
import { convertSignalToAction } from '@/app/baseball/actions/signals';

import {
  SectionMasthead,
  RuledStatLine,
  Eyebrow,
  InkBadge,
  PaperCard,
  EditorsLetter,
  Reveal,
  HoverReveal,
  pressableClass,
} from '@/components/baseball/living-annual';

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

export interface StaffDecisionRoomFairwayProps {
  data: DecisionRoomData;
  selected: DecisionRoomAgendaItem | null;
  selectedKey: string | null;
  onSelectAgendaItem: (key: string) => void;

  newItemOpen: boolean;
  newItemTitle: string;
  newItemDetail: string;
  creatingItem: boolean;
  onToggleNewItem: () => void;
  onNewItemTitleChange: (v: string) => void;
  onNewItemDetailChange: (v: string) => void;
  onSubmitNewItem: () => void;

  onExportSummary: () => void;
  onRefresh: () => void;

  sweeping: boolean;
  onReMeasureOutcomes: () => void;
}

// -----------------------------------------------------------------------------
// utils
// -----------------------------------------------------------------------------

function severityBadge(severity: DecisionRoomAgendaItem['severityHint']) {
  if (!severity) return null;
  if (severity === 'critical') return <InkBadge label={severity} tone="pursuit" variant="solid" />;
  if (severity === 'warning') return <InkBadge label={severity} tone="pursuit" variant="soft" />;
  return <InkBadge label={severity} tone="neutral" variant="soft" />;
}

// =============================================================================
// Root
// =============================================================================

export function StaffDecisionRoomFairway({
  data,
  selected,
  selectedKey,
  onSelectAgendaItem,
  newItemOpen,
  newItemTitle,
  newItemDetail,
  creatingItem,
  onToggleNewItem,
  onNewItemTitleChange,
  onNewItemDetailChange,
  onSubmitNewItem,
  onExportSummary,
  onRefresh,
}: StaffDecisionRoomFairwayProps) {
  const exportDisabled =
    data.agenda.length === 0 &&
    data.ledger.length === 0 &&
    data.recentGameResults.length === 0 &&
    data.availabilityConcerns.length === 0 &&
    data.openTasks.length === 0;

  const mastheadActions = (
    <Button
      variant="secondary"
      size="sm"
      leftIcon={<IconDownload size={15} />}
      onClick={onExportSummary}
      disabled={exportDisabled}
    >
      Export summary
    </Button>
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <SectionMasthead
        eyebrow="THE WAR ROOM · STAFF MEETING"
        title="Decision Room"
        ink="pursuit"
        actions={mastheadActions}
      >
        <p className="max-w-prose font-annual text-body-lg text-text-secondary">
          Run your staff meeting from source-backed signals — discuss, decide, and
          turn each into an action. Coaches only.
        </p>
      </SectionMasthead>

      {/* ── Stat strip — the room's table of contents, clay-ruled ─────────── */}
      <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3 lg:grid-cols-6">
        <RuledStatLine label="Open agenda" value={data.openAgendaCount} ink="pursuit" size="row" emphasis />
        <RuledStatLine label="Decisions made" value={data.decisionCount} ink="pursuit" size="row" />
        <RuledStatLine label="Active staff" value={data.staffCount} ink="pursuit" size="row" />
        <RuledStatLine label="Open insights" value={data.openInsightCount} ink="pursuit" size="row" />
        <RuledStatLine label="Availability" value={data.availabilityConcerns.length} ink="pursuit" size="row" />
        <RuledStatLine label="Conflicts" value={data.conflicts.length} ink="pursuit" size="row" />
      </div>

      {/* ============================== AGENDA PANE ======================= */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Eyebrow ink="pursuit" as="h2">
            Meeting mode · Staff action queue
          </Eyebrow>
          <div className="flex items-center gap-3">
            <span className="text-eyebrow uppercase tracking-[0.14em] tabular-nums text-text-tertiary">
              {data.openAgendaCount} open
            </span>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={newItemOpen ? <IconX size={13} /> : <IconPlus size={13} />}
              onClick={onToggleNewItem}
              aria-label={newItemOpen ? 'Cancel new item' : 'Add agenda item'}
            >
              {newItemOpen ? 'Cancel' : 'New item'}
            </Button>
          </div>
        </div>

        {newItemOpen ? (
          <Reveal className="mb-5">
            <PaperCard className="p-5">
              <Eyebrow ink="pursuit" className="mb-3">
                New agenda item
              </Eyebrow>
              <div className="space-y-2">
                <Input
                  placeholder="Title — e.g. 'Discuss pitching rotation changes'"
                  value={newItemTitle}
                  onChange={(e) => onNewItemTitleChange(e.target.value)}
                  disabled={creatingItem}
                  className="bg-[var(--paper)]"
                  maxLength={200}
                />
                <Textarea
                  placeholder="Optional detail or context (visible in meeting view)"
                  value={newItemDetail}
                  onChange={(e) => onNewItemDetailChange(e.target.value)}
                  disabled={creatingItem}
                  className="min-h-[72px] bg-[var(--paper)] text-sm"
                  maxLength={1000}
                />
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onToggleNewItem} disabled={creatingItem}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={creatingItem}
                  disabled={creatingItem || newItemTitle.trim().length === 0}
                  onClick={onSubmitNewItem}
                >
                  Add to agenda
                </Button>
              </div>
            </PaperCard>
          </Reveal>
        ) : null}

        {data.agenda.length === 0 ? (
          <EditorsLetter
            ink="pursuit"
            title="Nothing on the agenda."
            body="Open, unresolved signals and items you raise show up here as source-backed agenda items. Resolve them in a meeting and they thread into the Decision Ledger below."
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Agenda list (left) */}
            <div className="lg:col-span-2">
              <div className="flex flex-col gap-2">
                {data.agenda.map((item, idx) => {
                  const key = `${item.kind}-${item.id}`;
                  const active = selectedKey ? key === selectedKey : idx === 0;
                  return (
                    <Reveal key={key} staggerIndex={Math.min(idx, 10)}>
                      <AgendaListRow item={item} active={active} onSelect={() => onSelectAgendaItem(key)} />
                    </Reveal>
                  );
                })}
              </div>
            </div>

            {/* Detail + action bar (right) */}
            <div className="lg:col-span-3">
              {selected ? (
                <Reveal key={`${selected.kind}-${selected.id}`}>
                  <AgendaDetailPane item={selected} onDone={onRefresh} />
                </Reveal>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// =============================================================================
// Agenda pane pieces
// =============================================================================

function AgendaListRow({
  item,
  active,
  onSelect,
}: {
  item: DecisionRoomAgendaItem;
  active: boolean;
  onSelect: () => void;
}) {
  const isMeetingItem = item.kind === 'meeting_item';
  const discussed = item.status === 'discussed';

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onSelect}
      onKeyDown={handleKey}
      className={cn(
        'rounded-fw-md border text-left',
        pressableClass({ ink: 'pursuit' }),
        active
          ? 'border-pursuit bg-pursuit/[0.06]'
          : 'border-[color:var(--hairline)] bg-[var(--paper)]',
      )}
    >
      <HoverReveal
        className="flex w-full items-start gap-3 px-3 py-3"
        revealClassName="mt-1 flex w-4 shrink-0 justify-center"
        reveal={<IconChevronRight size={16} className="text-pursuit" aria-hidden />}
      >
        <div
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-fw-sm',
            item.severityHint === 'critical'
              ? 'bg-pursuit-deep/10 text-pursuit-deep'
              : isMeetingItem
                ? 'bg-pursuit/10 text-pursuit'
                : 'bg-[color:var(--hairline)]/60 text-text-tertiary',
          )}
        >
          {isMeetingItem ? <IconBolt size={15} /> : <IconAlertCircle size={15} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-annual text-body-lg text-text-primary">{item.title}</p>
            {discussed && <InkBadge label="Discussed" tone="neutral" variant="soft" />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {severityBadge(item.severityHint)}
            {item.playerName && (
              <span className="truncate text-eyebrow text-text-tertiary">{item.playerName}</span>
            )}
            <span className="text-eyebrow tabular-nums text-text-tertiary">
              · {item.sourceRefCount} src
            </span>
          </div>
        </div>
      </HoverReveal>
    </div>
  );
}

function AgendaDetailPane({ item, onDone }: { item: DecisionRoomAgendaItem; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'idle' | 'resolve' | 'note' | 'task' | 'practice'>('idle');
  const [text, setText] = useState('');
  const isMeetingItem = item.kind === 'meeting_item';
  const discussed = item.status === 'discussed';

  function run(fn: () => Promise<{ success: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.success) {
          toast.success(okMsg);
          setMode('idle');
          setText('');
          onDone();
        } else {
          toast.error('Could not complete that', res.error);
        }
      } catch {
        toast.error('Something went wrong', 'Please try again.');
      }
    });
  }

  // Raise an open signal onto the agenda (materialize a meeting item) so the
  // staff can decide on it — reuses the signal→action engine.
  function raiseToAgenda() {
    if (!item.sourceSignalId) return;
    run(
      () =>
        convertSignalToAction({
          signalId: item.sourceSignalId as string,
          actions: [
            { actionType: 'meeting_item', title: item.title, detail: item.detail, visibility: 'staff_only' },
          ],
        }),
      'Raised to the agenda',
    );
  }

  function markDiscussed() {
    if (!isMeetingItem) return;
    run(() => markMeetingItemDiscussed(item.id), 'Marked discussed');
  }

  function reopen() {
    if (!isMeetingItem) return;
    run(() => reopenMeetingItem(item.id), 'Reopened');
  }

  function submitResolve() {
    if (!isMeetingItem) return;
    run(() => resolveMeetingItem({ itemId: item.id, resolution: text }), 'Resolved');
  }

  function submitNote() {
    run(
      () =>
        recordDecisionNote({
          title: `Decision: ${item.title}`,
          note: text,
          subjectTable: isMeetingItem ? 'baseball_meeting_items' : 'baseball_signals',
          subjectId: item.id,
          sourceSignalId: item.sourceSignalId,
          playerId: item.playerId,
        }),
      'Decision recorded',
    );
  }

  function submitTask() {
    if (!item.sourceSignalId) return;
    run(
      () =>
        convertSignalToAction({
          signalId: item.sourceSignalId as string,
          actions: [
            {
              actionType: 'player_task',
              title: item.title,
              detail: text || item.detail,
              assigneePlayerId: item.playerId ?? undefined,
              visibility: item.playerId ? 'player_only' : 'staff_only',
            },
          ],
        }),
      'Task created',
    );
  }

  function convertNote() {
    if (!item.sourceSignalId || !item.playerId) return;
    run(
      () =>
        convertSignalToAction({
          signalId: item.sourceSignalId as string,
          actions: [
            {
              actionType: 'player_note',
              title: item.title,
              detail: item.detail,
              assigneePlayerId: item.playerId ?? undefined,
              visibility: 'staff_only',
            },
          ],
        }),
      'Player note created',
    );
  }

  // [W6f] Convert the signal linked to this agenda item into a practice block.
  // Requires the caller to hold `can_manage_practice` (checked server-side in
  // `convertSignalToPracticeBlock`). A descriptive title seeds from the agenda
  // item; the coach may optionally add a coaching note in the textarea.
  function submitPracticeBlock() {
    if (!item.sourceSignalId) return;
    run(
      () =>
        convertSignalToPracticeBlock({
          signalId: item.sourceSignalId as string,
          title: item.title,
          detail: text.trim() || item.detail,
        }),
      'Practice block created',
    );
  }

  return (
    <PaperCard registrationTick className="relative p-6 lg:sticky lg:top-4">
      {/* Header */}
      <div className="mb-4 flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-fw-sm',
            item.severityHint === 'critical'
              ? 'bg-pursuit-deep/10 text-pursuit-deep'
              : 'bg-pursuit/10 text-pursuit',
          )}
        >
          {isMeetingItem ? <IconBolt size={18} /> : <IconAlertCircle size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-annual text-h2 font-semibold leading-tight text-text-primary">{item.title}</h3>
            {severityBadge(item.severityHint)}
            {isMeetingItem ? (
              <InkBadge label="On agenda" tone="pursuit" variant="soft" />
            ) : (
              <InkBadge label="Open signal" tone="neutral" variant="soft" />
            )}
            {discussed && <InkBadge label="Discussed" tone="neutral" variant="soft" />}
          </div>
          {item.playerName && (
            <p className="mt-1 text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
              Subject: {item.playerName}
            </p>
          )}
        </div>
      </div>

      {item.detail && (
        <p className="mb-5 max-w-prose font-annual text-body-lg leading-relaxed text-text-secondary">
          {item.detail}
        </p>
      )}

      {/* Source-backed evidence. `sourceRefs` may arrive null/undefined if a
          row's jsonb column is absent — guard so a missing evidence array
          renders the "no structured sources" note instead of throwing. */}
      <div className="mb-5">
        <Eyebrow ink="pursuit" className="mb-2">
          Evidence · {item.sourceRefCount} source{item.sourceRefCount === 1 ? '' : 's'}
        </Eyebrow>
        {(item.sourceRefs ?? []).length === 0 ? (
          <p className="rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper-canvas)] p-3 font-annual text-body-sm text-text-tertiary">
            No structured sources attached. Decide with caution — this item is not
            backed by cited data.
          </p>
        ) : (
          <PaperCard grain={false} className="divide-y divide-[color:var(--hairline)] p-0">
            {(item.sourceRefs ?? []).map((ref, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="truncate font-annual text-body-sm capitalize text-text-secondary">
                  {ref.label}
                </span>
                {ref.detail && (
                  <span className="shrink-0 font-annual text-microbadge tabular-nums text-text-tertiary">
                    {ref.detail}
                  </span>
                )}
              </div>
            ))}
          </PaperCard>
        )}
      </div>

      {/* Inline text capture for resolve / note / task / practice */}
      {mode !== 'idle' && (
        <div className="mb-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={
              mode === 'resolve'
                ? 'What did the staff decide? (resolution note)'
                : mode === 'task'
                  ? 'Task detail for the player (optional)'
                  : mode === 'practice'
                    ? 'Coaching focus or context for the practice block (optional)'
                    : 'Record the decision…'
            }
            className="w-full bg-[var(--paper)]"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<IconX size={14} />}
              onClick={() => {
                setMode('idle');
                setText('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={pending}
              leftIcon={<IconCheck size={14} />}
              onClick={
                mode === 'resolve'
                  ? submitResolve
                  : mode === 'task'
                    ? submitTask
                    : mode === 'practice'
                      ? submitPracticeBlock
                      : submitNote
              }
            >
              {mode === 'resolve'
                ? 'Resolve item'
                : mode === 'task'
                  ? 'Create task'
                  : mode === 'practice'
                    ? 'Create practice block'
                    : 'Record decision'}
            </Button>
          </div>
        </div>
      )}

      {/* ---- ACTION BAR ---- */}
      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2 border-t border-[color:var(--hairline)] pt-4">
          {isMeetingItem && !discussed && (
            <Button variant="secondary" size="sm" isLoading={pending} leftIcon={<IconCheckCheck size={14} />} onClick={markDiscussed}>
              Mark discussed
            </Button>
          )}
          {isMeetingItem && (
            <Button variant="success" size="sm" leftIcon={<IconCheck size={14} />} onClick={() => setMode('resolve')}>
              Resolve
            </Button>
          )}
          {isMeetingItem && discussed && (
            <Button variant="ghost" size="sm" onClick={reopen} isLoading={pending}>
              Reopen
            </Button>
          )}
          {!isMeetingItem && (
            <Button variant="secondary" size="sm" isLoading={pending} leftIcon={<IconArrowRight size={14} />} onClick={raiseToAgenda}>
              Raise to agenda
            </Button>
          )}
          <Button variant="outline" size="sm" leftIcon={<IconClipboardList size={14} />} onClick={() => setMode('task')}>
            Create task
          </Button>
          {/* [W6f] Convert to practice block — only available when the item
              links to a source signal (required to materialise a block). The
              coach can add a coaching note in the textarea before confirming.
              Capability gate (can_manage_practice) is enforced server-side. */}
          {item.sourceSignalId && (
            <Button variant="outline" size="sm" leftIcon={<IconCalendar size={14} />} onClick={() => setMode('practice')}>
              Practice block
            </Button>
          )}
          {item.playerId && (
            <Button variant="outline" size="sm" isLoading={pending} leftIcon={<IconNote size={14} />} onClick={convertNote}>
              Player note
            </Button>
          )}
          <Button variant="ghost" size="sm" leftIcon={<IconNote size={14} />} onClick={() => setMode('note')}>
            Decision note
          </Button>
        </div>
      )}
    </PaperCard>
  );
}

export default StaffDecisionRoomFairway;
