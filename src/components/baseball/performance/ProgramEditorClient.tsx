'use client';

// =============================================================================
// src/components/baseball/performance/ProgramEditorClient.tsx
//
// V11 Program editor (spec L200-228 + Packet E). Wires the full orphaned authoring
// layer to the deep, already-built server actions in lifting-v11.ts:
//   createLiftProgram* / updateLiftProgram / addLiftWeek / duplicateLiftWeek /
//   deleteLiftWeek / addLiftDay / updateLiftDay / duplicateLiftDay / deleteLiftDay /
//   addLiftSection / updateLiftSection / reorderLiftSections / deleteLiftSection /
//   addLiftPrescription / updateLiftPrescription / reorderLiftPrescriptions /
//   deleteLiftPrescription / saveProgramAsTemplate / publishLiftDay.
//   (*createLiftProgram is called from the list; the rest are wired here.)
//
// IA: the editor is composed for the coach's primary task — author a day's work
// fast. Left rail = macrocycle tree (weeks -> days, the navigation spine). Right =
// the SELECTED day's section/prescription editor (the dense work surface). One
// prominent primary action per context (Assign & publish on a day).
//
// Drag-drop reorder for sections + prescriptions, with a keyboard alternative
// (Move up / Move down buttons) so reordering never requires a mouse (a11y).
//
// Cream/green GolfHelm palette only. Every write goes through a withBaseballAction
// server action (capability-enforced server-side) + RLS; this client only offers
// affordances. No destructive bulk writes — deletes are explicit single-node.
// =============================================================================

import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconPlus, IconTrash, IconCopy, IconChevronDown, IconChevronUp,
  IconClock, IconClipboardList,
} from '@/components/icons';
import {
  updateLiftProgram,
  addLiftWeek, duplicateLiftWeek, deleteLiftWeek,
  addLiftDay, updateLiftDay, duplicateLiftDay, deleteLiftDay,
  addLiftSection, updateLiftSection, reorderLiftSections, deleteLiftSection,
  addLiftPrescription, updateLiftPrescription, reorderLiftPrescriptions, deleteLiftPrescription,
  saveProgramAsTemplate, publishLiftDay,
} from '@/app/baseball/actions/lifting-v11';
import { updateProgramBlockOrder } from '@/app/baseball/actions/program-settings';
import type {
  LiftProgramTree, LiftWeekNode, LiftDayNode, LiftSectionNode,
  LiftPrescriptionNode, AssignContext,
} from '@/lib/baseball/read-models/lift-programs';
import type {
  BaseballLiftProgramPhase, BaseballLiftProgramGoal, BaseballLiftProgramStatus,
  BaseballLiftDayType, BaseballLiftBaseballContext, BaseballLiftSectionType,
  BaseballLiftPrescriptionType, BaseballLiftAssignmentTargetType,
} from '@/lib/types/baseball-lifting-v11';

// -----------------------------------------------------------------------------
// Vocabularies (mirror the migration CHECK constraints + action schemas)
// -----------------------------------------------------------------------------

const PHASE_OPTIONS: Array<{ value: BaseballLiftProgramPhase; label: string }> = [
  { value: 'fall', label: 'Fall' }, { value: 'winter', label: 'Winter' },
  { value: 'preseason', label: 'Preseason' }, { value: 'in_season', label: 'In-season' },
  { value: 'postseason', label: 'Postseason' }, { value: 'summer', label: 'Summer' },
  { value: 'return_to_play', label: 'Return to play' }, { value: 'testing', label: 'Testing' },
];
const GOAL_OPTIONS: Array<{ value: BaseballLiftProgramGoal; label: string }> = [
  { value: 'strength', label: 'Strength' }, { value: 'power', label: 'Power' },
  { value: 'hypertrophy', label: 'Hypertrophy' }, { value: 'speed', label: 'Speed' },
  { value: 'maintenance', label: 'Maintenance' }, { value: 'recovery', label: 'Recovery' },
  { value: 'arm_care', label: 'Arm care' }, { value: 'testing', label: 'Testing' },
];
const STATUS_OPTIONS: Array<{ value: BaseballLiftProgramStatus; label: string }> = [
  { value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];
const DAY_TYPE_OPTIONS: Array<{ value: BaseballLiftDayType; label: string }> = [
  { value: 'lower', label: 'Lower' }, { value: 'upper', label: 'Upper' },
  { value: 'full_body', label: 'Full body' }, { value: 'recovery', label: 'Recovery' },
  { value: 'arm_care', label: 'Arm care' }, { value: 'conditioning', label: 'Conditioning' },
  { value: 'testing', label: 'Testing' }, { value: 'custom', label: 'Custom' },
];
const BASEBALL_CONTEXT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'No baseball context' },
  { value: 'pre_game', label: 'Pre-game' }, { value: 'post_game', label: 'Post-game' },
  { value: 'bullpen_day', label: 'Bullpen day' }, { value: 'starter_plus_1', label: 'Starter +1' },
  { value: 'starter_plus_2', label: 'Starter +2' }, { value: 'travel_day', label: 'Travel day' },
  { value: 'off_day', label: 'Off day' }, { value: 'practice_day', label: 'Practice day' },
];
const SECTION_TYPE_OPTIONS: Array<{ value: BaseballLiftSectionType; label: string }> = [
  { value: 'warmup', label: 'Warmup' }, { value: 'movement_prep', label: 'Movement prep' },
  { value: 'power', label: 'Power' }, { value: 'main_strength', label: 'Main strength' },
  { value: 'accessory', label: 'Accessory' }, { value: 'arm_care', label: 'Arm care' },
  { value: 'mobility', label: 'Mobility' }, { value: 'conditioning', label: 'Conditioning' },
];
const PRESCRIPTION_TYPE_OPTIONS: Array<{ value: BaseballLiftPrescriptionType; label: string }> = [
  { value: 'fixed', label: 'Fixed load' }, { value: 'percent_1rm', label: '% of 1RM' },
  { value: 'rpe', label: 'RPE target' }, { value: 'velocity', label: 'Velocity' },
  { value: 'coach_load', label: 'Coach assigns' }, { value: 'player_select', label: 'Player selects' },
];

const DAY_TYPE_LABEL = Object.fromEntries(DAY_TYPE_OPTIONS.map((o) => [o.value, o.label]));
const SECTION_TYPE_LABEL = Object.fromEntries(SECTION_TYPE_OPTIONS.map((o) => [o.value, o.label]));
const BASEBALL_CONTEXT_LABEL = Object.fromEntries(
  BASEBALL_CONTEXT_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
);

/** Swap two indices in a copy of the array (typesafe under noUncheckedIndexedAccess). */
function swapped<T>(arr: readonly T[], a: number, b: number): T[] {
  const next = [...arr];
  const tmp = next[a]!;
  next[a] = next[b]!;
  next[b] = tmp;
  return next;
}

function GripDots() {
  return (
    <span className="grid grid-cols-2 gap-0.5 text-warm-300" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} className="h-1 w-1 rounded-full bg-current" />
      ))}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Editor root
// -----------------------------------------------------------------------------

interface Props {
  tree: LiftProgramTree;
  assign: AssignContext;
}

export function ProgramEditorClient({ tree, assign }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const prefersReducedMotion = useReducedMotion();

  // Selected day in the editor (defaults to the first day of the first week).
  const firstDayId = tree.weeks[0]?.days[0]?.id ?? null;
  const [selectedDayId, setSelectedDayId] = useState<string | null>(firstDayId);

  const selectedDay = useMemo<{ week: LiftWeekNode; day: LiftDayNode } | null>(() => {
    for (const w of tree.weeks) {
      const d = w.days.find((x) => x.id === selectedDayId);
      if (d) return { week: w, day: d };
    }
    return null;
  }, [tree.weeks, selectedDayId]);

  // Wrap a server action: refresh on success, surface a friendly error otherwise.
  const run = useCallback(
    (fn: () => Promise<{ success: boolean; error?: string; id?: string }>, onOk?: (id?: string) => void) => {
      setError(null);
      startTransition(async () => {
        try {
          const res = await fn();
          if (res.success) {
            onOk?.(res.id);
            router.refresh();
          } else {
            setError(res.error ?? 'Something went wrong.');
          }
        } catch {
          setError('Something went wrong. Please try again.');
        }
      });
    },
    [router],
  );

  return (
    <motion.div
      className="space-y-5"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <ProgramHeader
        tree={tree}
        pending={pending}
        onSave={(patch, onOk) => run(() => updateLiftProgram({ programId: tree.program.id, ...patch }), onOk)}
        onSaveTemplate={(name) =>
          run(
            () => saveProgramAsTemplate({ programId: tree.program.id, name: name || null }),
            () => setNotice('Saved a reusable template copy.'),
          )
        }
      />

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" aria-live="polite" className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-2 text-sm text-primary-700">
          {notice}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
        {/* Macrocycle spine */}
        <WeekRail
          weeks={tree.weeks}
          selectedDayId={selectedDayId}
          pending={pending}
          onSelectDay={setSelectedDayId}
          onAddWeek={() =>
            run(() =>
              addLiftWeek({
                programId: tree.program.id,
                weekNumber: (tree.weeks.at(-1)?.week_number ?? 0) + 1,
                name: `Week ${(tree.weeks.at(-1)?.week_number ?? 0) + 1}`,
              }),
            )
          }
          onDuplicateWeek={(weekId) => run(() => duplicateLiftWeek({ weekId }))}
          onDeleteWeek={(weekId) => run(() => deleteLiftWeek({ id: weekId }))}
          onAddDay={(week) =>
            run(
              () =>
                addLiftDay({
                  weekId: week.id,
                  dayNumber: nextDayNumber(week),
                  name: `Day ${nextDayNumber(week)}`,
                }),
              () => undefined,
            )
          }
          onDuplicateDay={(dayId) => run(() => duplicateLiftDay({ dayId }), (id) => id && setSelectedDayId(id))}
          onDeleteDay={(dayId) =>
            run(() => deleteLiftDay({ id: dayId }), () => {
              if (dayId === selectedDayId) setSelectedDayId(null);
            })
          }
        />

        {/* Day work surface */}
        <div>
          {selectedDay ? (
            <DayEditor
              key={selectedDay.day.id}
              week={selectedDay.week}
              day={selectedDay.day}
              assign={assign}
              programId={tree.program.id}
              programName={tree.program.name}
              pending={pending}
              run={run}
            />
          ) : (
            <Card>
              <CardContent className="py-12">
                <EmptyState
                  icon={<IconClipboardList size={40} />}
                  title={tree.weeks.length === 0 ? 'Add your first week' : 'Pick a day to edit'}
                  description={
                    tree.weeks.length === 0
                      ? 'A program is built from weeks and lift days. Add a week to begin.'
                      : 'Select a day from the left, or add a day to a week, to start building sections and exercises.'
                  }
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function nextDayNumber(week: LiftWeekNode): number {
  const used = new Set(week.days.map((d) => d.day_number));
  let n = 1;
  while (used.has(n) && n < 7) n++;
  return n;
}

// -----------------------------------------------------------------------------
// Program header (editable meta + save-as-template)
// -----------------------------------------------------------------------------

function ProgramHeader({
  tree, pending, onSave, onSaveTemplate,
}: {
  tree: LiftProgramTree;
  pending: boolean;
  onSave: (patch: Record<string, unknown>, onOk?: () => void) => void;
  onSaveTemplate: (name: string) => void;
}) {
  const p = tree.program;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const [description, setDescription] = useState(p.description ?? '');
  const [phase, setPhase] = useState(p.phase);
  const [goal, setGoal] = useState(p.goal);
  const [status, setStatus] = useState(p.status);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState(`${p.name} (template)`);

  return (
    <Card>
      <CardContent className="space-y-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-warm-400">
          <Link href="/baseball/dashboard/performance" className="rounded transition-colors hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">Performance</Link>
          <span aria-hidden>/</span>
          <Link href="/baseball/dashboard/performance/programs" className="rounded transition-colors hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">Programs</Link>
          <span aria-hidden>/</span>
          <span className="text-warm-600" aria-current="page">{p.name}</span>
        </nav>

        {editing ? (
          <div className="space-y-3">
            <Input label="Program name" value={name} onChange={(e) => setName(e.target.value)} />
            <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            <div className="grid grid-cols-3 gap-3">
              <Select label="Phase" options={PHASE_OPTIONS} value={phase} onChange={(v) => setPhase(v as BaseballLiftProgramPhase)} />
              <Select label="Goal" options={GOAL_OPTIONS} value={goal} onChange={(v) => setGoal(v as BaseballLiftProgramGoal)} />
              <Select label="Status" options={STATUS_OPTIONS} value={status} onChange={(v) => setStatus(v as BaseballLiftProgramStatus)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>Cancel</Button>
              <Button
                variant="primary"
                isLoading={pending}
                onClick={() =>
                  onSave(
                    { name: name.trim(), description: description.trim() || null, phase, goal, status },
                    () => setEditing(false),
                  )
                }
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-eyebrow uppercase text-primary-700">Program</p>
              <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-warm-900">{p.name}</h1>
              {p.description && <p className="mt-0.5 max-w-xl text-sm text-warm-500">{p.description}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-warm-500">
                <span className="font-medium text-warm-700">{PHASE_OPTIONS.find((o) => o.value === p.phase)?.label}</span>
                <span aria-hidden>·</span>
                <span>{GOAL_OPTIONS.find((o) => o.value === p.goal)?.label}</span>
                <span aria-hidden>·</span>
                <span className="capitalize">{p.status}</span>
                {p.is_template && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    Template
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setTplOpen(true)} disabled={pending}>
                Save as template
              </Button>
              <Button variant="outline" onClick={() => setEditing(true)} disabled={pending}>
                Edit details
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <Modal isOpen={tplOpen} onClose={() => setTplOpen(false)} title="Save as template">
        <div className="space-y-4">
          <p className="text-sm text-warm-500">
            Creates a reusable copy of this program (all weeks, days, sections, and exercises) flagged as a template. The original is unchanged.
          </p>
          <Input label="Template name" value={tplName} onChange={(e) => setTplName(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTplOpen(false)} disabled={pending}>Cancel</Button>
            <Button variant="primary" isLoading={pending} onClick={() => { onSaveTemplate(tplName.trim()); setTplOpen(false); }}>
              Save template
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Week rail (macrocycle spine: weeks -> days)
// -----------------------------------------------------------------------------

function WeekRail({
  weeks, selectedDayId, pending,
  onSelectDay, onAddWeek, onDuplicateWeek, onDeleteWeek, onAddDay, onDuplicateDay, onDeleteDay,
}: {
  weeks: LiftWeekNode[];
  selectedDayId: string | null;
  pending: boolean;
  onSelectDay: (id: string) => void;
  onAddWeek: () => void;
  onDuplicateWeek: (weekId: string) => void;
  onDeleteWeek: (weekId: string) => void;
  onAddDay: (week: LiftWeekNode) => void;
  onDuplicateDay: (dayId: string) => void;
  onDeleteDay: (dayId: string) => void;
}) {
  const [confirmWeek, setConfirmWeek] = useState<LiftWeekNode | null>(null);
  const [confirmDay, setConfirmDay] = useState<LiftDayNode | null>(null);

  return (
    <Card className="h-fit">
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-400">Macrocycle</h2>
          <Button variant="ghost" size="sm" leftIcon={<IconPlus size={14} />} onClick={onAddWeek} disabled={pending}>
            Week
          </Button>
        </div>

        {weeks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-warm-200 px-3 py-4 text-center text-xs text-warm-400">
            No weeks yet. Add a week to start building.
          </p>
        ) : (
          <ul className="space-y-3">
            {weeks.map((w) => (
              <li key={w.id} className="rounded-xl border border-warm-100 bg-white/50 p-2">
                <div className="flex items-center justify-between gap-1 px-1">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-warm-800">
                      {w.name ?? `Week ${w.week_number}`}
                      {w.deload && <span className="ml-1 text-[11px] font-medium text-amber-600">deload</span>}
                    </div>
                    {w.theme && <div className="truncate text-[11px] text-warm-400">{w.theme}</div>}
                  </div>
                  <div className="flex shrink-0">
                    <button
                      type="button"
                      title="Duplicate week"
                      aria-label={`Duplicate ${w.name ?? `week ${w.week_number}`}`}
                      className="rounded-md p-1 text-warm-400 transition-colors hover:bg-warm-50 hover:text-warm-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50"
                      onClick={() => onDuplicateWeek(w.id)}
                      disabled={pending}
                    >
                      <IconCopy size={14} />
                    </button>
                    <button
                      type="button"
                      title="Delete week"
                      aria-label={`Delete ${w.name ?? `week ${w.week_number}`}`}
                      className="rounded-md p-1 text-warm-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:opacity-50"
                      onClick={() => setConfirmWeek(w)}
                      disabled={pending}
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </div>

                <ul className="mt-1 space-y-1">
                  {w.days.map((d) => {
                    const active = d.id === selectedDayId;
                    return (
                      <li key={d.id} className="group flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onSelectDay(d.id)}
                          aria-current={active ? 'true' : undefined}
                          className={`flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                            active
                              ? 'bg-primary-50 font-medium text-primary-700'
                              : 'text-warm-600 hover:bg-warm-50'
                          }`}
                        >
                          {d.name ?? `Day ${d.day_number}`}
                          <span className="ml-1 text-[11px] text-warm-400">{DAY_TYPE_LABEL[d.day_type]}</span>
                        </button>
                        <button
                          type="button"
                          title="Duplicate day"
                          aria-label={`Duplicate ${d.name ?? `day ${d.day_number}`}`}
                          className="rounded-md p-1 text-warm-300 opacity-0 transition-colors hover:bg-warm-50 hover:text-warm-700 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 group-hover:opacity-100 disabled:opacity-50"
                          onClick={() => onDuplicateDay(d.id)}
                          disabled={pending}
                        >
                          <IconCopy size={13} />
                        </button>
                        <button
                          type="button"
                          title="Delete day"
                          aria-label={`Delete ${d.name ?? `day ${d.day_number}`}`}
                          className="rounded-md p-1 text-warm-300 opacity-0 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 group-hover:opacity-100 disabled:opacity-50"
                          onClick={() => setConfirmDay(d)}
                          disabled={pending}
                        >
                          <IconTrash size={13} />
                        </button>
                      </li>
                    );
                  })}
                  <li>
                    <button
                      type="button"
                      onClick={() => onAddDay(w)}
                      disabled={pending || w.days.length >= 7}
                      className="w-full rounded-lg border border-dashed border-warm-200 px-2 py-1.5 text-left text-xs font-medium text-warm-500 transition-colors hover:border-primary-200 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50"
                    >
                      + Add day{w.days.length >= 7 ? ' (max 7)' : ''}
                    </button>
                  </li>
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmWeek !== null}
        onCancel={() => setConfirmWeek(null)}
        onConfirm={() => { if (confirmWeek) onDeleteWeek(confirmWeek.id); setConfirmWeek(null); }}
        title="Delete week?"
        message={`This removes ${confirmWeek?.name ?? 'this week'} and all of its days, sections, and exercises. Published sessions already on the board are not affected.`}
        confirmLabel="Delete week"
        variant="danger"
      />
      <ConfirmDialog
        open={confirmDay !== null}
        onCancel={() => setConfirmDay(null)}
        onConfirm={() => { if (confirmDay) onDeleteDay(confirmDay.id); setConfirmDay(null); }}
        title="Delete day?"
        message={`This removes ${confirmDay?.name ?? 'this day'} and its sections and exercises. Published sessions already on the board are not affected.`}
        confirmLabel="Delete day"
        variant="danger"
      />
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Day editor (sections + prescriptions + assign/publish)
// -----------------------------------------------------------------------------

type RunFn = (
  fn: () => Promise<{ success: boolean; error?: string; id?: string }>,
  onOk?: (id?: string) => void,
) => void;

function DayEditor({
  week, day, assign, programId, programName, pending, run,
}: {
  week: LiftWeekNode;
  day: LiftDayNode;
  assign: AssignContext;
  programId: string;
  programName: string;
  pending: boolean;
  run: RunFn;
}) {
  const [editingMeta, setEditingMeta] = useState(false);
  const [name, setName] = useState(day.name ?? '');
  const [dayType, setDayType] = useState(day.day_type);
  const [ctx, setCtx] = useState<string>(day.baseball_context ?? '');
  const [est, setEst] = useState<string>(day.estimated_minutes != null ? String(day.estimated_minutes) : '');
  const [assignOpen, setAssignOpen] = useState(false);

  // Section-level drag-to-reorder. We track the dragged section id in a ref so
  // the onDrop handler can compute the new ordered array and call the server action.
  const sectionDragId = useRef<string | null>(null);

  function onDropSection(targetId: string) {
    const ids = day.sections.map((s) => s.id);
    const from = ids.indexOf(sectionDragId.current ?? '');
    const to = ids.indexOf(targetId);
    sectionDragId.current = null;
    if (from < 0 || to < 0 || from === to) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    // W5c: call the new update_program_block_order action from program-settings.ts.
    run(() => updateProgramBlockOrder({ orderedIds: next }));
  }

  const totalExercises = day.sections.reduce((n, s) => n + s.prescriptions.length, 0);

  return (
    <div className="space-y-4">
      {/* Day header */}
      <Card>
        <CardContent>
          {editingMeta ? (
            <div className="space-y-3">
              <Input label="Day name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Day ${day.day_number}`} />
              <div className="grid grid-cols-3 gap-3">
                <Select label="Day type" options={DAY_TYPE_OPTIONS} value={dayType} onChange={(v) => setDayType(v as BaseballLiftDayType)} />
                <Select label="Baseball context" options={BASEBALL_CONTEXT_OPTIONS} value={ctx} onChange={setCtx} />
                <Input label="Est. minutes" type="number" inputMode="numeric" value={est} onChange={(e) => setEst(e.target.value)} placeholder="60" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditingMeta(false)} disabled={pending}>Cancel</Button>
                <Button
                  variant="primary"
                  isLoading={pending}
                  onClick={() =>
                    run(
                      () =>
                        updateLiftDay({
                          dayId: day.id,
                          name: name.trim() || null,
                          dayType,
                          baseballContext: (ctx || null) as BaseballLiftBaseballContext | null,
                          estimatedMinutes: est.trim() === '' ? null : Number(est),
                        }),
                      () => setEditingMeta(false),
                    )
                  }
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-warm-400">{week.name ?? `Week ${week.week_number}`}</p>
                <h2 className="text-xl font-semibold text-warm-900">{day.name ?? `Day ${day.day_number}`}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-warm-500">
                  <span className="font-medium text-warm-700">{DAY_TYPE_LABEL[day.day_type]}</span>
                  {day.baseball_context && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="rounded-full bg-cream-100 px-2 py-0.5 text-[11px] text-warm-600">
                        {BASEBALL_CONTEXT_LABEL[day.baseball_context] ?? day.baseball_context}
                      </span>
                    </>
                  )}
                  {day.estimated_minutes != null && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="inline-flex items-center gap-1"><IconClock size={12} />{day.estimated_minutes} min</span>
                    </>
                  )}
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{totalExercises} exercise{totalExercises === 1 ? '' : 's'}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditingMeta(true)} disabled={pending}>Day settings</Button>
                <Button
                  variant="primary"
                  onClick={() => setAssignOpen(true)}
                  disabled={pending || totalExercises === 0}
                  title={totalExercises === 0 ? 'Add at least one exercise before publishing' : undefined}
                >
                  Assign &amp; publish
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sections */}
      {day.sections.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={<IconClipboardList size={40} />}
              title="No sections yet"
              description="A lift day is organized into sections (warmup, power, main strength, accessory, arm care…). Add a section, then add exercises to it."
              action={{
                label: 'Add a section',
                onClick: () =>
                  run(() => addLiftSection({ liftDayId: day.id, name: 'Main strength', sectionType: 'main_strength', sectionOrder: 0 })),
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {day.sections.map((s, i) => (
            <div
              key={s.id}
              draggable={!pending}
              onDragStart={() => { sectionDragId.current = s.id; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDropSection(s.id)}
              className="transition-opacity"
            >
              <SectionEditor
                section={s}
                index={i}
                count={day.sections.length}
                sectionsOrder={day.sections.map((x) => x.id)}
                exercises={assign.exercises}
                pending={pending}
                run={run}
              />
            </div>
          ))}
        </div>
      )}

      {day.sections.length > 0 && (
        <Button
          variant="secondary"
          leftIcon={<IconPlus size={16} />}
          onClick={() =>
            run(() =>
              addLiftSection({
                liftDayId: day.id,
                name: 'New section',
                sectionType: 'accessory',
                sectionOrder: day.sections.length,
              }),
            )
          }
          disabled={pending}
        >
          Add section
        </Button>
      )}

      {assignOpen && (
        <AssignPublishDialog
          day={day}
          programId={programId}
          programName={programName}
          assign={assign}
          pending={pending}
          onClose={() => setAssignOpen(false)}
          run={run}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Section editor (header + reorder + prescriptions list w/ drag-drop)
// -----------------------------------------------------------------------------

function SectionEditor({
  section, index, count, sectionsOrder, exercises, pending, run,
}: {
  section: LiftSectionNode;
  index: number;
  count: number;
  sectionsOrder: string[];
  exercises: AssignContext['exercises'];
  pending: boolean;
  run: RunFn;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(section.name);
  const [type, setType] = useState(section.section_type);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const dragId = useRef<string | null>(null);

  function moveSection(dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= sectionsOrder.length) return;
    run(() => reorderLiftSections({ orderedIds: swapped(sectionsOrder, index, j) }));
  }

  // Drag-drop for prescriptions inside this section.
  function onDropPrescription(targetId: string) {
    const ids = section.prescriptions.map((p) => p.id);
    const from = ids.indexOf(dragId.current ?? '');
    const to = ids.indexOf(targetId);
    dragId.current = null;
    if (from < 0 || to < 0 || from === to) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    run(() => reorderLiftPrescriptions({ orderedIds: next }));
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Section name" value={name} onChange={(e) => setName(e.target.value)} />
              <Select label="Type" options={SECTION_TYPE_OPTIONS} value={type} onChange={(v) => setType(v as BaseballLiftSectionType)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>Cancel</Button>
              <Button
                variant="primary"
                isLoading={pending}
                onClick={() => run(() => updateLiftSection({ sectionId: section.id, name: name.trim(), sectionType: type }), () => setEditing(false))}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-warm-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-warm-500">
                {SECTION_TYPE_LABEL[section.section_type]}
              </span>
              <h3 className="text-base font-semibold text-warm-900">{section.name}</h3>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button" title="Move section up" aria-label="Move section up"
                className="rounded-md p-1 text-warm-400 transition-colors hover:bg-warm-50 hover:text-warm-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-30"
                onClick={() => moveSection(-1)} disabled={pending || index === 0}
              >
                <IconChevronUp size={15} />
              </button>
              <button
                type="button" title="Move section down" aria-label="Move section down"
                className="rounded-md p-1 text-warm-400 transition-colors hover:bg-warm-50 hover:text-warm-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-30"
                onClick={() => moveSection(1)} disabled={pending || index === count - 1}
              >
                <IconChevronDown size={15} />
              </button>
              <button
                type="button" title="Edit section" aria-label="Edit section"
                className="rounded-md px-2 py-1 text-xs font-medium text-warm-500 transition-colors hover:bg-warm-50 hover:text-warm-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                onClick={() => setEditing(true)} disabled={pending}
              >
                Edit
              </button>
              <button
                type="button" title="Delete section" aria-label="Delete section"
                className="rounded-md p-1 text-warm-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:opacity-50"
                onClick={() => setConfirmDelete(true)} disabled={pending}
              >
                <IconTrash size={15} />
              </button>
            </div>
          </div>
        )}

        {section.instructions && <p className="text-xs text-warm-500">{section.instructions}</p>}

        {/* Prescriptions */}
        {section.prescriptions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-warm-200 px-3 py-3 text-center text-xs text-warm-400">
            No exercises in this section yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {section.prescriptions.map((p, pi) => (
              <li
                key={p.id}
                draggable={!pending}
                onDragStart={() => { dragId.current = p.id; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDropPrescription(p.id)}
              >
                <PrescriptionRow
                  prescription={p}
                  index={pi}
                  count={section.prescriptions.length}
                  orderedIds={section.prescriptions.map((x) => x.id)}
                  exercises={exercises}
                  pending={pending}
                  run={run}
                />
              </li>
            ))}
          </ul>
        )}

        <Button variant="ghost" size="sm" leftIcon={<IconPlus size={14} />} onClick={() => setAddOpen(true)} disabled={pending}>
          Add exercise
        </Button>
      </CardContent>

      {addOpen && (
        <PrescriptionDialog
          mode="add"
          sectionId={section.id}
          nextOrder={section.prescriptions.length}
          exercises={exercises}
          pending={pending}
          onClose={() => setAddOpen(false)}
          run={run}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => { run(() => deleteLiftSection({ id: section.id })); setConfirmDelete(false); }}
        title="Delete section?"
        message={`This removes "${section.name}" and its ${section.prescriptions.length} exercise${section.prescriptions.length === 1 ? '' : 's'}.`}
        confirmLabel="Delete section"
        variant="danger"
      />
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Prescription row (read view + reorder + edit/delete)
// -----------------------------------------------------------------------------

function prescriptionSummary(p: LiftPrescriptionNode): string {
  const parts: string[] = [];
  if (p.sets != null && p.reps != null) parts.push(`${p.sets}×${p.reps}`);
  else if (p.sets != null) parts.push(`${p.sets} sets`);
  else if (p.reps != null) parts.push(`${p.reps} reps`);
  switch (p.prescription_type) {
    case 'percent_1rm': if (p.percent_1rm != null) parts.push(`${p.percent_1rm}% 1RM`); break;
    case 'rpe': if (p.target_rpe != null) parts.push(`RPE ${p.target_rpe}`); break;
    case 'velocity':
      if (p.target_velocity_min != null || p.target_velocity_max != null)
        parts.push(`${p.target_velocity_min ?? '?'}–${p.target_velocity_max ?? '?'} m/s`);
      break;
    case 'fixed': if (p.load_value != null) parts.push(`${p.load_value}${p.load_unit ?? 'lb'}`); break;
    case 'coach_load': parts.push('coach load'); break;
    case 'player_select': parts.push('player picks load'); break;
  }
  if (p.tempo) parts.push(`tempo ${p.tempo}`);
  if (p.rest_seconds != null) parts.push(`${p.rest_seconds}s rest`);
  return parts.join(' · ');
}

function PrescriptionRow({
  prescription: p, index, count, orderedIds, exercises, pending, run,
}: {
  prescription: LiftPrescriptionNode;
  index: number;
  count: number;
  orderedIds: string[];
  exercises: AssignContext['exercises'];
  pending: boolean;
  run: RunFn;
}) {
  const [editOpen, setEditOpen] = useState(false);

  function move(dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= count) return;
    run(() => reorderLiftPrescriptions({ orderedIds: swapped(orderedIds, index, j) }));
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-warm-100 bg-white/60 px-2 py-1.5">
      <span className="cursor-grab" title="Drag to reorder"><GripDots /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-warm-800">
            {p.exercise_name ?? 'Unassigned exercise'}
          </span>
        </div>
        <div className="truncate text-xs text-warm-500">{prescriptionSummary(p) || '—'}</div>
        {p.coaching_note && <div className="truncate text-[11px] text-warm-400">“{p.coaching_note}”</div>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button type="button" title="Move up" aria-label="Move exercise up"
          className="rounded-md p-1 text-warm-400 transition-colors hover:bg-warm-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-30"
          onClick={() => move(-1)} disabled={pending || index === 0}>
          <IconChevronUp size={14} />
        </button>
        <button type="button" title="Move down" aria-label="Move exercise down"
          className="rounded-md p-1 text-warm-400 transition-colors hover:bg-warm-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-30"
          onClick={() => move(1)} disabled={pending || index === count - 1}>
          <IconChevronDown size={14} />
        </button>
        <button type="button" aria-label="Edit exercise" className="rounded-md px-2 py-1 text-xs font-medium text-warm-500 transition-colors hover:bg-warm-50 hover:text-warm-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          onClick={() => setEditOpen(true)} disabled={pending}>
          Edit
        </button>
        <button type="button" title="Delete exercise" aria-label="Delete exercise"
          className="rounded-md p-1 text-warm-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:opacity-50"
          onClick={() => run(() => deleteLiftPrescription({ id: p.id }))} disabled={pending}>
          <IconTrash size={14} />
        </button>
      </div>

      {editOpen && (
        <PrescriptionDialog
          mode="edit"
          prescription={p}
          exercises={exercises}
          pending={pending}
          onClose={() => setEditOpen(false)}
          run={run}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Prescription add/edit dialog
// -----------------------------------------------------------------------------

interface PrescriptionDialogBase {
  exercises: AssignContext['exercises'];
  pending: boolean;
  onClose: () => void;
  run: RunFn;
}
type PrescriptionDialogProps =
  | (PrescriptionDialogBase & { mode: 'add'; sectionId: string; nextOrder: number })
  | (PrescriptionDialogBase & { mode: 'edit'; prescription: LiftPrescriptionNode });

function PrescriptionDialog(props: PrescriptionDialogProps) {
  const { exercises, pending, onClose, run } = props;
  const existing = props.mode === 'edit' ? props.prescription : null;

  const [exerciseId, setExerciseId] = useState<string>(existing?.exercise_id ?? '');
  const [type, setType] = useState<BaseballLiftPrescriptionType>(existing?.prescription_type ?? 'fixed');
  const [sets, setSets] = useState(existing?.sets != null ? String(existing.sets) : '');
  const [reps, setReps] = useState(existing?.reps != null ? String(existing.reps) : '');
  const [loadValue, setLoadValue] = useState(existing?.load_value != null ? String(existing.load_value) : '');
  const [loadUnit, setLoadUnit] = useState(existing?.load_unit ?? 'lb');
  const [percent, setPercent] = useState(existing?.percent_1rm != null ? String(existing.percent_1rm) : '');
  const [rpe, setRpe] = useState(existing?.target_rpe != null ? String(existing.target_rpe) : '');
  const [velMin, setVelMin] = useState(existing?.target_velocity_min != null ? String(existing.target_velocity_min) : '');
  const [velMax, setVelMax] = useState(existing?.target_velocity_max != null ? String(existing.target_velocity_max) : '');
  const [rest, setRest] = useState(existing?.rest_seconds != null ? String(existing.rest_seconds) : '');
  const [tempo, setTempo] = useState(existing?.tempo ?? '');
  const [note, setNote] = useState(existing?.coaching_note ?? '');

  const exerciseOptions = useMemo(
    () => [
      { value: '', label: 'Unassigned (placeholder)' },
      ...exercises.map((e) => ({ value: e.id, label: e.name })),
    ],
    [exercises],
  );

  const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

  function submit() {
    const common = {
      exerciseId: exerciseId || null,
      prescriptionType: type,
      sets: numOrNull(sets) as number | null,
      reps: numOrNull(reps) as number | null,
      loadValue: type === 'fixed' ? (numOrNull(loadValue) as number | null) : null,
      loadUnit: loadUnit || null,
      percent1rm: type === 'percent_1rm' ? (numOrNull(percent) as number | null) : null,
      targetRpe: type === 'rpe' ? (numOrNull(rpe) as number | null) : null,
      targetVelocityMin: type === 'velocity' ? (numOrNull(velMin) as number | null) : null,
      targetVelocityMax: type === 'velocity' ? (numOrNull(velMax) as number | null) : null,
      restSeconds: numOrNull(rest) as number | null,
      tempo: tempo.trim() || null,
      coachingNote: note.trim() || null,
    };
    if (props.mode === 'add') {
      run(
        () => addLiftPrescription({ sectionId: props.sectionId, orderIndex: props.nextOrder, ...common }),
        () => onClose(),
      );
    } else {
      run(
        () => updateLiftPrescription({ prescriptionId: props.prescription.id, ...common }),
        () => onClose(),
      );
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={props.mode === 'add' ? 'Add exercise' : 'Edit exercise'}>
      <div className="space-y-4">
        <Select label="Exercise" options={exerciseOptions} value={exerciseId} onChange={setExerciseId} searchable />
        <Select
          label="How is load prescribed?"
          options={PRESCRIPTION_TYPE_OPTIONS}
          value={type}
          onChange={(v) => setType(v as BaseballLiftPrescriptionType)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Sets" type="number" inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} />
          <Input label="Reps" type="number" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
        </div>

        {/* Load fields are conditional on prescription_type (no contradictory inputs). */}
        {type === 'fixed' && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Load" type="number" inputMode="decimal" value={loadValue} onChange={(e) => setLoadValue(e.target.value)} />
            <Input label="Unit" value={loadUnit} onChange={(e) => setLoadUnit(e.target.value)} placeholder="lb" />
          </div>
        )}
        {type === 'percent_1rm' && (
          <Input label="% of 1RM" type="number" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} hint="Materialized against the athlete's training max at publish time." />
        )}
        {type === 'rpe' && (
          <Input label="Target RPE (0–10)" type="number" inputMode="decimal" value={rpe} onChange={(e) => setRpe(e.target.value)} />
        )}
        {type === 'velocity' && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Velocity min (m/s)" type="number" inputMode="decimal" value={velMin} onChange={(e) => setVelMin(e.target.value)} />
            <Input label="Velocity max (m/s)" type="number" inputMode="decimal" value={velMax} onChange={(e) => setVelMax(e.target.value)} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Rest (seconds)" type="number" inputMode="numeric" value={rest} onChange={(e) => setRest(e.target.value)} />
          <Input label="Tempo" value={tempo} onChange={(e) => setTempo(e.target.value)} placeholder="e.g. 31X1" />
        </div>
        <Textarea label="Coaching cue (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Brace, drive through the floor…" />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" isLoading={pending} onClick={submit}>
            {props.mode === 'add' ? 'Add to section' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Assign + publish dialog (materializes sessions onto the weight-room board)
// -----------------------------------------------------------------------------

function AssignPublishDialog({
  day, programId, programName, assign, pending, onClose, run,
}: {
  day: LiftDayNode;
  programId: string;
  programName: string;
  assign: AssignContext;
  pending: boolean;
  onClose: () => void;
  run: RunFn;
}) {
  const [target, setTarget] = useState<BaseballLiftAssignmentTargetType>(
    assign.groups.length > 0 ? 'group' : 'team',
  );
  const [groupId, setGroupId] = useState<string>(assign.groups[0]?.id ?? '');
  const [playerId, setPlayerId] = useState<string>(assign.roster[0]?.id ?? '');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [calendar, setCalendar] = useState(true);

  // Resolve the player ids the publish will materialize for (preview before save).
  const resolvedPlayerIds = useMemo<string[]>(() => {
    if (target === 'team') return assign.roster.map((p) => p.id);
    if (target === 'group') return assign.groups.find((g) => g.id === groupId)?.member_ids ?? [];
    return playerId ? [playerId] : [];
  }, [target, groupId, playerId, assign]);

  const title = `${programName} — ${day.name ?? `Day ${day.day_number}`}`;
  const canPublish = resolvedPlayerIds.length > 0;

  function publish() {
    run(
      () =>
        publishLiftDay({
          programId,
          liftDayId: day.id,
          scheduledDate: date,
          playerIds: resolvedPlayerIds,
          assignmentType: target,
          groupId: target === 'group' ? groupId : null,
          createCalendarEvent: calendar,
          title,
        }),
      () => onClose(),
    );
  }

  return (
    <Modal isOpen onClose={onClose} title="Assign & publish lift">
      <div className="space-y-4">
        <p className="text-sm text-warm-500">
          Publishing materializes one session per athlete with a frozen snapshot of today&apos;s prescriptions, and puts them on the weight-room board for the selected date.
        </p>

        <Select
          label="Assign to"
          options={[
            { value: 'team', label: 'Whole team' },
            { value: 'group', label: 'Strength group', disabled: assign.groups.length === 0 },
            { value: 'player', label: 'Individual athlete' },
          ]}
          value={target}
          onChange={(v) => setTarget(v as BaseballLiftAssignmentTargetType)}
        />

        {target === 'group' && (
          assign.groups.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              No strength groups exist yet. Create one from Performance → Groups.
            </p>
          ) : (
            <Select
              label="Group"
              options={assign.groups.map((g) => ({ value: g.id, label: `${g.name} (${g.member_ids.length})` }))}
              value={groupId}
              onChange={setGroupId}
            />
          )
        )}
        {target === 'player' && (
          <Select
            label="Athlete"
            options={assign.roster.map((p) => ({ value: p.id, label: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Player' }))}
            value={playerId}
            onChange={setPlayerId}
            searchable
          />
        )}

        <Input label="Scheduled date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

        <label className="flex items-center gap-2 text-sm text-warm-700">
          <input type="checkbox" checked={calendar} onChange={(e) => setCalendar(e.target.checked)} className="h-4 w-4 rounded border-warm-300 text-primary-600" />
          Add a Lift event to the team calendar
        </label>

        <div className="rounded-lg border border-warm-100 bg-cream-100/50 px-3 py-2 text-xs text-warm-600">
          {resolvedPlayerIds.length === 0
            ? 'No athletes resolved for this target — nothing would be published.'
            : `Will publish to ${resolvedPlayerIds.length} athlete${resolvedPlayerIds.length === 1 ? '' : 's'}.`}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" isLoading={pending} onClick={publish} disabled={!canPublish}>
            Publish lift
          </Button>
        </div>
      </div>
    </Modal>
  );
}
