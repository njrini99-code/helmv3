'use client';

// =============================================================================
// src/components/lifting/programs/ProgramEditorClient.tsx
//
// Helm Lifting Lab — program editor. Native Lab UI consuming HelmLifting* types.
// Left rail = macrocycle tree (weeks → days) with add/duplicate/delete affordances.
// Right = selected day editor (sections → prescriptions) with inline editing,
// "+ Add exercise" (ExercisePicker), drag-reorder (keyboard move-up/down), and
// section/prescription delete. Primary action: Publish day to athletes.
//
// All mutations call the actions from src/app/lifting/actions/programs.ts.
// The "Add week" empty-state CTA replaces the old placeholder text.
// =============================================================================

import { useMemo, useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  IconClock, IconClipboardList, IconDumbbell, IconPlus, IconTrash,
  IconEdit, IconCopy, IconChevronUp, IconChevronDown, IconX,
} from '@/components/icons';
import {
  updateProgram, publishProgram, deleteProgram,
  addLiftWeek, addLiftDay, addLiftSection, addLiftPrescription,
  updateLiftPrescription, updateLiftSection, updateLiftDay,
  reorderLiftSections, reorderLiftPrescriptions,
  duplicateLiftDay, duplicateLiftWeek,
  deleteLiftWeek, deleteLiftDay, deleteLiftSection, deleteLiftPrescription,
} from '@/app/lifting/actions/programs';
import { ExercisePicker } from '@/components/lifting/exercises/ExercisePicker';
import type {
  HelmLiftingProgramRow,
  HelmLiftingWeekRow,
  HelmLiftingDayRow,
  HelmLiftingSectionRow,
  HelmLiftingPrescriptionRow,
  HelmLiftingGroupRow,
  HelmLiftingProgramPhase,
  HelmLiftingProgramStatus,
  HelmLiftingDayType,
  HelmLiftingSectionType,
} from '@/lib/types/helm-lifting-data';
import type { HelmLiftingAthleteRow } from '@/lib/types/helm-lifting';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface LiftProgramTree {
  program: HelmLiftingProgramRow;
  weeks: Array<
    HelmLiftingWeekRow & {
      days: Array<
        HelmLiftingDayRow & {
          sections: Array<HelmLiftingSectionRow & { prescriptions: HelmLiftingPrescriptionRow[] }>;
        }
      >;
    }
  >;
  exerciseNameMap: Record<string, string>;
}

interface AssignContext {
  athletes: Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport'>>;
  groups: Array<Pick<HelmLiftingGroupRow, 'id' | 'name' | 'group_type'>>;
}

interface Props {
  programTree: LiftProgramTree;
  assignContext: AssignContext;
  orgId: string;
  canEdit: boolean;
  loading?: boolean;
  /** Base route for this caller's programs list, e.g. '/lifting/dashboard/programs'
   * or '/baseball/dashboard/performance/programs'. Used for the "← Programs" back
   * link and the post-delete redirect so this component never hardcodes an app. */
  basePath: string;
}

function ProgramEditorSkeleton() {
  return (
    <div className="flex h-full min-h-[700px]">
      {/* Left rail skeleton */}
      <aside className="w-72 shrink-0 border-r border-warm-100 bg-warm-50/50 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-14 rounded-lg" />
        </div>
        <div className="rounded-xl glass-standard border border-white/20 p-3 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24 rounded-full" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, wi) => (
            <div key={wi} className="rounded-xl border border-warm-100 glass-standard overflow-hidden">
              <div className="px-3 py-2 flex items-center justify-between bg-warm-50/50">
                <Skeleton className="h-3.5 w-28" />
              </div>
              <div className="pb-1 pl-2 space-y-1">
                {Array.from({ length: 3 }).map((_, di) => (
                  <Skeleton key={di} className="h-6 w-full rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>
      {/* Right pane skeleton */}
      <main className="flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/20 glass-standard overflow-hidden">
            <div className="border-b border-warm-100 px-5 py-3 flex items-center justify-between bg-warm-50/50">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3 py-2">
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-8" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Vocabulary constants
// -----------------------------------------------------------------------------

const PHASE_OPTIONS: Array<{ value: HelmLiftingProgramPhase; label: string }> = [
  { value: 'fall', label: 'Fall' }, { value: 'winter', label: 'Winter' },
  { value: 'preseason', label: 'Preseason' }, { value: 'in_season', label: 'In-season' },
  { value: 'postseason', label: 'Postseason' }, { value: 'summer', label: 'Summer' },
  { value: 'return_to_play', label: 'Return to play' }, { value: 'testing', label: 'Testing' },
];

const STATUS_OPTIONS: Array<{ value: HelmLiftingProgramStatus; label: string }> = [
  { value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

const DAY_TYPE_OPTIONS: Array<{ value: HelmLiftingDayType; label: string }> = [
  { value: 'lower', label: 'Lower' }, { value: 'upper', label: 'Upper' },
  { value: 'full_body', label: 'Full body' }, { value: 'recovery', label: 'Recovery' },
  { value: 'arm_care', label: 'Arm care' }, { value: 'conditioning', label: 'Conditioning' },
  { value: 'testing', label: 'Testing' }, { value: 'custom', label: 'Custom' },
];

const SECTION_TYPE_OPTIONS: Array<{ value: HelmLiftingSectionType; label: string }> = [
  { value: 'warmup', label: 'Warmup' }, { value: 'movement_prep', label: 'Movement prep' },
  { value: 'power', label: 'Power' }, { value: 'main_strength', label: 'Main strength' },
  { value: 'accessory', label: 'Accessory' }, { value: 'arm_care', label: 'Arm care' },
  { value: 'mobility', label: 'Mobility' }, { value: 'conditioning', label: 'Conditioning' },
];

const DAY_TYPE_LABEL = Object.fromEntries(DAY_TYPE_OPTIONS.map((o) => [o.value, o.label]));
const SECTION_TYPE_LABEL = Object.fromEntries(SECTION_TYPE_OPTIONS.map((o) => [o.value, o.label]));

const STATUS_META: Record<HelmLiftingProgramStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-primary-50 text-primary-700 border-primary-200' },
  draft: { label: 'Draft', cls: 'bg-warm-50 text-warm-700 border-warm-200' },
  archived: { label: 'Archived', cls: 'bg-warm-100 text-warm-500 border-warm-200' },
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// Optimistically move an item up/down in an array and return new order.
function moveItem<T extends { id: string }>(arr: T[], id: string, direction: 'up' | 'down'): T[] {
  const idx = arr.findIndex((x) => x.id === id);
  if (idx < 0) return arr;
  const next = direction === 'up' ? idx - 1 : idx + 1;
  if (next < 0 || next >= arr.length) return arr;
  const out = [...arr] as T[];
  const a = out[idx]!;
  const b = out[next]!;
  out[idx] = b;
  out[next] = a;
  return out;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ProgramEditorClient({ programTree, assignContext, orgId, canEdit, loading = false, basePath }: Props) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();
  const { program, weeks, exerciseNameMap } = programTree;

  // Selected day for the right pane.
  const [selectedDayId, setSelectedDayId] = useState<string | null>(
    weeks[0]?.days[0]?.id ?? null,
  );

  // ---- Publish modal ----
  const [showPublish, setShowPublish] = useState(false);
  const [publishTargetType, setPublishTargetType] = useState<'team' | 'group' | 'player'>('team');
  const [publishGroupId, setPublishGroupId] = useState('');
  const [publishAthleteId, setPublishAthleteId] = useState('');
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<string | null>(null);

  // ---- Program meta edit ----
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaName, setMetaName] = useState(program.name);
  const [metaPhase, setMetaPhase] = useState<HelmLiftingProgramPhase>(program.phase);
  const [metaStatus, setMetaStatus] = useState<HelmLiftingProgramStatus>(program.status);
  const [metaError, setMetaError] = useState<string | null>(null);

  // ---- Add week modal ----
  const [showAddWeek, setShowAddWeek] = useState(false);
  const [weekName, setWeekName] = useState('');
  const [weekTheme, setWeekTheme] = useState('');
  const [weekDeload, setWeekDeload] = useState(false);
  const [addWeekError, setAddWeekError] = useState<string | null>(null);

  // ---- Add day modal ----
  const [addDayWeekId, setAddDayWeekId] = useState<string | null>(null);
  const [dayName, setDayName] = useState('');
  const [dayType, setDayType] = useState<HelmLiftingDayType>('full_body');
  const [dayMinutes, setDayMinutes] = useState('');
  const [addDayError, setAddDayError] = useState<string | null>(null);

  // ---- Edit day modal ----
  const [editingDay, setEditingDay] = useState<HelmLiftingDayRow | null>(null);
  const [editDayName, setEditDayName] = useState('');
  const [editDayType, setEditDayType] = useState<HelmLiftingDayType>('full_body');
  const [editDayMinutes, setEditDayMinutes] = useState('');
  const [editDayError, setEditDayError] = useState<string | null>(null);

  // ---- Add section modal ----
  const [addSectionDayId, setAddSectionDayId] = useState<string | null>(null);
  const [sectionName, setSectionName] = useState('');
  const [sectionType, setSectionType] = useState<HelmLiftingSectionType>('main_strength');
  const [addSectionError, setAddSectionError] = useState<string | null>(null);

  // ---- Edit section ----
  const [editingSection, setEditingSection] = useState<HelmLiftingSectionRow | null>(null);
  const [editSectionName, setEditSectionName] = useState('');
  const [editSectionType, setEditSectionType] = useState<HelmLiftingSectionType>('main_strength');
  const [editSectionError, setEditSectionError] = useState<string | null>(null);

  // ---- ExercisePicker ----
  const [pickerSectionId, setPickerSectionId] = useState<string | null>(null);

  // ---- Inline prescription edit ----
  const [editingPresc, setEditingPresc] = useState<HelmLiftingPrescriptionRow | null>(null);
  const [editSets, setEditSets] = useState('');
  const [editReps, setEditReps] = useState('');
  const [editLoad, setEditLoad] = useState('');
  const [editLoadUnit, setEditLoadUnit] = useState('');
  const [editRpe, setEditRpe] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editPrescError, setEditPrescError] = useState<string | null>(null);

  // ---- Delete confirms ----
  const [deletingWeekId, setDeletingWeekId] = useState<string | null>(null);
  const [deletingDayId, setDeletingDayId] = useState<string | null>(null);
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(null);

  // ---- Action error banner ----
  const [actionError, setActionError] = useState<string | null>(null);

  // Derive selected day from tree.
  const selectedDay = useMemo(() => {
    if (!selectedDayId) return null;
    for (const w of weeks) {
      const day = w.days.find((d) => d.id === selectedDayId);
      if (day) return day;
    }
    return null;
  }, [selectedDayId, weeks]);

  // Refresh helper (triggers server rerender)
  const refresh = useCallback(() => router.refresh(), [router]);

  if (loading) return <ProgramEditorSkeleton />;

  // ---- Program meta ----
  function handleSaveMeta() {
    if (!metaName.trim()) { setMetaError('Name is required.'); return; }
    setMetaError(null);
    startTransition(async () => {
      const result = await updateProgram({
        orgId,
        programId: program.id,
        name: metaName.trim(),
        phase: metaPhase,
        status: metaStatus,
      });
      if (result.success) {
        setEditingMeta(false);
        refresh();
      } else {
        setMetaError(result.error ?? 'Failed to save.');
      }
    });
  }

  // ---- Add week ----
  function handleAddWeek() {
    setAddWeekError(null);
    const nextNum = (weeks.reduce((m, w) => Math.max(m, w.week_number), 0)) + 1;
    startTransition(async () => {
      const result = await addLiftWeek({
        programId: program.id,
        weekNumber: nextNum,
        name: weekName.trim() || null,
        theme: weekTheme.trim() || null,
        deload: weekDeload,
      });
      if (result.success) {
        setShowAddWeek(false);
        setWeekName(''); setWeekTheme(''); setWeekDeload(false);
        refresh();
      } else {
        setAddWeekError(result.error ?? 'Failed to add week.');
      }
    });
  }

  // ---- Delete week ----
  function handleDeleteWeek(weekId: string) {
    startTransition(async () => {
      const result = await deleteLiftWeek({ id: weekId });
      if (result.success) {
        setDeletingWeekId(null);
        if (selectedDay && weeks.find((w) => w.id === weekId)?.days.some((d) => d.id === selectedDayId)) {
          setSelectedDayId(null);
        }
        refresh();
      } else {
        setActionError(result.error ?? 'Failed to delete week.');
        setDeletingWeekId(null);
      }
    });
  }

  // ---- Duplicate week ----
  function handleDuplicateWeek(weekId: string) {
    startTransition(async () => {
      const result = await duplicateLiftWeek({ weekId });
      if (!result.success) setActionError(result.error ?? 'Failed to duplicate week.');
      refresh();
    });
  }

  // ---- Add day ----
  function handleAddDay() {
    if (!addDayWeekId) return;
    setAddDayError(null);
    const week = weeks.find((w) => w.id === addDayWeekId);
    const nextDay = (week?.days.reduce((m, d) => Math.max(m, d.day_number), 0) ?? 0) + 1;
    startTransition(async () => {
      const result = await addLiftDay({
        weekId: addDayWeekId,
        dayNumber: nextDay,
        name: dayName.trim() || null,
        dayType,
        estimatedMinutes: dayMinutes ? parseInt(dayMinutes, 10) : null,
      });
      if (result.success) {
        setAddDayWeekId(null);
        setDayName(''); setDayType('full_body'); setDayMinutes('');
        if (result.id) setSelectedDayId(result.id);
        refresh();
      } else {
        setAddDayError(result.error ?? 'Failed to add day.');
      }
    });
  }

  // ---- Edit day ----
  function openEditDay(day: HelmLiftingDayRow) {
    setEditingDay(day);
    setEditDayName(day.name ?? '');
    setEditDayType(day.day_type as HelmLiftingDayType);
    setEditDayMinutes(day.estimated_minutes?.toString() ?? '');
    setEditDayError(null);
  }

  function handleEditDay() {
    if (!editingDay) return;
    setEditDayError(null);
    startTransition(async () => {
      const result = await updateLiftDay({
        dayId: editingDay.id,
        name: editDayName.trim() || null,
        dayType: editDayType,
        estimatedMinutes: editDayMinutes ? parseInt(editDayMinutes, 10) : null,
      });
      if (result.success) {
        setEditingDay(null);
        refresh();
      } else {
        setEditDayError(result.error ?? 'Failed to update day.');
      }
    });
  }

  // ---- Delete day ----
  function handleDeleteDay(dayId: string) {
    startTransition(async () => {
      const result = await deleteLiftDay({ id: dayId });
      if (result.success) {
        setDeletingDayId(null);
        if (selectedDayId === dayId) setSelectedDayId(null);
        refresh();
      } else {
        setActionError(result.error ?? 'Failed to delete day.');
        setDeletingDayId(null);
      }
    });
  }

  // ---- Duplicate day ----
  function handleDuplicateDay(dayId: string) {
    startTransition(async () => {
      const result = await duplicateLiftDay({ dayId });
      if (result.success) {
        if (result.id) setSelectedDayId(result.id);
        refresh();
      } else {
        setActionError(result.error ?? 'Failed to duplicate day.');
      }
    });
  }

  // ---- Add section ----
  function handleAddSection() {
    if (!addSectionDayId) return;
    setAddSectionError(null);
    const day = selectedDay;
    const nextOrder = day?.sections.length ?? 0;
    startTransition(async () => {
      const result = await addLiftSection({
        liftDayId: addSectionDayId,
        name: (sectionName.trim() || SECTION_TYPE_LABEL[sectionType]) ?? 'Section',
        sectionType,
        sectionOrder: nextOrder,
      });
      if (result.success) {
        setAddSectionDayId(null);
        setSectionName(''); setSectionType('main_strength');
        refresh();
      } else {
        setAddSectionError(result.error ?? 'Failed to add section.');
      }
    });
  }

  // ---- Edit section ----
  function openEditSection(section: HelmLiftingSectionRow) {
    setEditingSection(section);
    setEditSectionName(section.name);
    setEditSectionType(section.section_type as HelmLiftingSectionType);
    setEditSectionError(null);
  }

  function handleEditSection() {
    if (!editingSection) return;
    setEditSectionError(null);
    startTransition(async () => {
      const result = await updateLiftSection({
        sectionId: editingSection.id,
        name: editSectionName.trim() || undefined,
        sectionType: editSectionType,
      });
      if (result.success) {
        setEditingSection(null);
        refresh();
      } else {
        setEditSectionError(result.error ?? 'Failed to update section.');
      }
    });
  }

  // ---- Delete section ----
  function handleDeleteSection(sectionId: string) {
    startTransition(async () => {
      const result = await deleteLiftSection({ id: sectionId });
      if (result.success) {
        setDeletingSectionId(null);
        refresh();
      } else {
        setActionError(result.error ?? 'Failed to delete section.');
        setDeletingSectionId(null);
      }
    });
  }

  // ---- Reorder sections ----
  function handleMoveSectionUp(section: HelmLiftingSectionRow) {
    if (!selectedDay) return;
    const newOrder = moveItem(selectedDay.sections, section.id, 'up');
    startTransition(async () => {
      await reorderLiftSections({ orderedIds: newOrder.map((s) => s.id) });
      refresh();
    });
  }

  function handleMoveSectionDown(section: HelmLiftingSectionRow) {
    if (!selectedDay) return;
    const newOrder = moveItem(selectedDay.sections, section.id, 'down');
    startTransition(async () => {
      await reorderLiftSections({ orderedIds: newOrder.map((s) => s.id) });
      refresh();
    });
  }

  // ---- Add prescription via ExercisePicker ----
  function handleExercisePicked(exerciseId: string, _exerciseName: string) {
    if (!pickerSectionId) return;
    const section = selectedDay?.sections.find((s) => s.id === pickerSectionId);
    const nextOrder = section?.prescriptions.length ?? 0;
    startTransition(async () => {
      await addLiftPrescription({
        sectionId: pickerSectionId,
        exerciseId,
        orderIndex: nextOrder,
        sets: 3,
        reps: 8,
      });
      setPickerSectionId(null);
      refresh();
    });
  }

  // ---- Inline edit prescription ----
  function openEditPresc(presc: HelmLiftingPrescriptionRow) {
    setEditingPresc(presc);
    setEditSets(presc.sets?.toString() ?? '');
    setEditReps(presc.reps?.toString() ?? '');
    setEditLoad(presc.load_value?.toString() ?? '');
    setEditLoadUnit(presc.load_unit ?? 'lb');
    setEditRpe(presc.target_rpe?.toString() ?? '');
    setEditNote(presc.coaching_note ?? '');
    setEditPrescError(null);
  }

  function handleSavePresc() {
    if (!editingPresc) return;
    setEditPrescError(null);
    startTransition(async () => {
      const result = await updateLiftPrescription({
        prescriptionId: editingPresc.id,
        sets: editSets ? parseInt(editSets, 10) : null,
        reps: editReps ? parseInt(editReps, 10) : null,
        loadValue: editLoad ? parseFloat(editLoad) : null,
        loadUnit: editLoadUnit.trim() || null,
        targetRpe: editRpe ? parseFloat(editRpe) : null,
        coachingNote: editNote.trim() || null,
      });
      if (result.success) {
        setEditingPresc(null);
        refresh();
      } else {
        setEditPrescError(result.error ?? 'Failed to save.');
      }
    });
  }

  // ---- Reorder prescriptions ----
  function handleMovePrescUp(presc: HelmLiftingPrescriptionRow, section: HelmLiftingSectionRow & { prescriptions: HelmLiftingPrescriptionRow[] }) {
    const newOrder = moveItem(section.prescriptions, presc.id, 'up');
    startTransition(async () => {
      await reorderLiftPrescriptions({ orderedIds: newOrder.map((p) => p.id) });
      refresh();
    });
  }

  function handleMovePrescDown(presc: HelmLiftingPrescriptionRow, section: HelmLiftingSectionRow & { prescriptions: HelmLiftingPrescriptionRow[] }) {
    const newOrder = moveItem(section.prescriptions, presc.id, 'down');
    startTransition(async () => {
      await reorderLiftPrescriptions({ orderedIds: newOrder.map((p) => p.id) });
      refresh();
    });
  }

  // ---- Delete prescription ----
  function handleDeletePresc(id: string) {
    startTransition(async () => {
      const result = await deleteLiftPrescription({ id });
      if (!result.success) setActionError(result.error ?? 'Failed to delete exercise.');
      refresh();
    });
  }

  // ---- Publish ----
  function handlePublish() {
    setPublishError(null);
    startTransition(async () => {
      const result = await publishProgram({
        orgId,
        programId: program.id,
        targetGroupId: publishTargetType === 'group' ? publishGroupId || null : null,
        targetAthleteId: publishTargetType === 'player' ? publishAthleteId || null : null,
      });
      if (result.success) {
        setPublishResult(`Published ${result.count ?? 0} session${result.count !== 1 ? 's' : ''}.`);
        refresh();
      } else {
        setPublishError(result.error ?? 'Publish failed.');
      }
    });
  }

  // ---- Delete program ----
  function handleDelete() {
    startTransition(async () => {
      const result = await deleteProgram({ orgId, programId: program.id });
      if (result.success) {
        router.push(basePath);
      }
    });
  }

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="flex h-full min-h-[700px]">
      {/* ---- Left rail — macrocycle tree ---- */}
      <aside className="w-72 shrink-0 border-r border-warm-100 bg-warm-50/50 p-4 overflow-y-auto">
        {/* Nav + edit meta */}
        <div className="mb-4 flex items-center justify-between">
          <Link href={basePath} className="text-xs text-warm-400 hover:text-warm-700 transition-colors">
            ← Programs
          </Link>
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => setEditingMeta(true)}>
              Edit
            </Button>
          )}
        </div>

        {/* Program meta chip */}
        <div className="mb-4 rounded-xl glass-standard border border-white/20 p-3">
          <p className="font-semibold text-warm-900 text-sm line-clamp-2">{program.name}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-micro font-medium ${STATUS_META[program.status].cls}`}>
              {STATUS_META[program.status].label}
            </span>
            <span className="text-eyebrow text-warm-400">{program.phase}</span>
          </div>
        </div>

        {/* Week/day tree */}
        {weeks.length === 0 ? (
          <EmptyState
            icon={<IconClipboardList size={20} className="text-warm-300" />}
            title="No weeks yet"
            description="Build your program by adding weeks below."
            action={
              canEdit ? (
                <Button
                  size="sm"
                  onClick={() => { setWeekName(''); setWeekTheme(''); setWeekDeload(false); setAddWeekError(null); setShowAddWeek(true); }}
                >
                  <IconPlus size={13} className="mr-1" /> Add week
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-2">
            {weeks.map((week) => (
              <div key={week.id} className="rounded-xl border border-warm-100 glass-standard overflow-hidden">
                {/* Week header */}
                <div className="px-3 py-2 flex items-center justify-between gap-1 group">
                  <span className="text-xs font-semibold text-warm-500 truncate">
                    Week {week.week_number}{week.name ? ` — ${week.name}` : ''}
                    {week.deload ? <span className="ml-1 text-warning">(Deload)</span> : null}
                  </span>
                  {canEdit && (
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        type="button"
                        variant="ghost"
                        title="Duplicate week"
                        onClick={() => handleDuplicateWeek(week.id)}
                        disabled={isPending}
                        className="p-1 rounded text-warm-400 hover:text-warm-700 transition-colors"
                      >
                        <IconCopy size={11} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        title="Delete week"
                        onClick={() => setDeletingWeekId(week.id)}
                        className="p-1 rounded text-warm-400 hover:text-destructive transition-colors"
                      >
                        <IconTrash size={11} />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Days */}
                <div className="pb-1">
                  {week.days.map((day) => (
                    <div key={day.id} className="group/day flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setSelectedDayId(day.id)}
                        className={`flex-1 px-4 py-1.5 text-left text-xs transition-colors whitespace-normal ${
                          selectedDayId === day.id
                            ? 'bg-primary-50 text-primary-700 font-medium'
                            : 'text-warm-600 hover:bg-warm-50'
                        }`}
                      >
                        D{day.day_number} — {day.name ?? DAY_TYPE_LABEL[day.day_type] ?? day.day_type}
                        {day.estimated_minutes ? (
                          <span className="ml-1.5 text-micro text-warm-400">
                            <IconClock size={10} className="inline mr-0.5" />{day.estimated_minutes}m
                          </span>
                        ) : null}
                      </Button>
                      {canEdit && (
                        <div className="flex items-center gap-0.5 pr-1.5 opacity-0 group-hover/day:opacity-100 transition-opacity">
                          <Button
                            type="button"
                            variant="ghost"
                            title="Duplicate day"
                            onClick={() => handleDuplicateDay(day.id)}
                            disabled={isPending}
                            className="p-0.5 rounded text-warm-300 hover:text-warm-600 transition-colors"
                          >
                            <IconCopy size={10} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            title="Delete day"
                            onClick={() => setDeletingDayId(day.id)}
                            className="p-0.5 rounded text-warm-300 hover:text-destructive transition-colors"
                          >
                            <IconTrash size={10} />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Add day button */}
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setAddDayWeekId(week.id);
                        setDayName(''); setDayType('full_body'); setDayMinutes('');
                        setAddDayError(null);
                      }}
                      className="w-full px-4 py-1 text-left text-eyebrow text-warm-400 hover:text-primary-600 hover:bg-primary-50/50 transition-colors flex items-center gap-1 whitespace-normal"
                    >
                      <IconPlus size={10} /> Add day
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add week CTA */}
        {canEdit && weeks.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => { setWeekName(''); setWeekTheme(''); setWeekDeload(false); setAddWeekError(null); setShowAddWeek(true); }}
            className="mt-3 w-full flex items-center justify-center gap-1 rounded-xl border border-dashed border-warm-200 py-2 text-xs text-warm-400 hover:text-primary-600 hover:border-primary-300 transition-colors"
          >
            <IconPlus size={12} /> Add week
          </Button>
        )}

        {/* Publish */}
        {canEdit && (
          <div className="mt-4">
            <Button
              className="w-full"
              onClick={() => { setShowPublish(true); setPublishResult(null); setPublishError(null); }}
              disabled={isPending || weeks.length === 0}
            >
              Publish program
            </Button>
          </div>
        )}

        {/* Action error */}
        {actionError && (
          <p className="mt-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{actionError}</p>
        )}
      </aside>

      {/* ---- Right pane — day editor ---- */}
      <main className="flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait">
        {!selectedDay ? (
          <motion.div
            key="no-day-selected"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <EmptyState
              icon={<IconDumbbell size={32} className="text-warm-300" />}
              title="Select a day"
              description={weeks.length === 0
                ? 'Add a week first, then select a day to edit its exercises.'
                : 'Pick a day from the left rail to view and edit its exercises.'}
            />
          </motion.div>
        ) : (
          <motion.div
            key={selectedDay.id}
            initial={prefersReducedMotion ? false : { opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="space-y-4"
          >
            {/* Day header */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-warm-900">
                  Day {selectedDay.day_number}
                  {selectedDay.name ? ` — ${selectedDay.name}` : ''}
                </h2>
                <p className="text-sm text-warm-500">
                  {DAY_TYPE_LABEL[selectedDay.day_type] ?? selectedDay.day_type}
                  {selectedDay.estimated_minutes ? ` · ${selectedDay.estimated_minutes} min` : ''}
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEditDay(selectedDay)}
                  >
                    <IconEdit size={14} className="mr-1" /> Edit day
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAddSectionDayId(selectedDay.id);
                      setSectionName(''); setSectionType('main_strength');
                      setAddSectionError(null);
                    }}
                  >
                    <IconPlus size={14} className="mr-1" /> Add section
                  </Button>
                </div>
              )}
            </div>

            {/* Sections */}
            {selectedDay.sections.length === 0 ? (
              <EmptyState
                title="No sections"
                description="Add a section to start building this day's exercises."
                action={
                  canEdit ? (
                    <Button
                      onClick={() => {
                        setAddSectionDayId(selectedDay.id);
                        setSectionName(''); setSectionType('main_strength');
                        setAddSectionError(null);
                      }}
                    >
                      <IconPlus size={14} className="mr-1" /> Add section
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="space-y-4">
                {selectedDay.sections.map((section, sIdx) => (
                  <Card key={section.id} variant="overlay" className="overflow-hidden">
                    <CardContent className="p-0">
                      {/* Section header */}
                      <div className="border-b border-warm-100 px-5 py-3 flex items-center justify-between bg-warm-50/50">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-warm-800 text-sm">{section.name}</span>
                          <span className="text-xs text-warm-400">
                            {SECTION_TYPE_LABEL[section.section_type] ?? section.section_type}
                          </span>
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              title="Move section up"
                              onClick={() => handleMoveSectionUp(section)}
                              disabled={isPending || sIdx === 0}
                              className="p-1 rounded text-warm-300 hover:text-warm-700 disabled:opacity-30 transition-colors"
                            >
                              <IconChevronUp size={14} />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              title="Move section down"
                              onClick={() => handleMoveSectionDown(section)}
                              disabled={isPending || sIdx === selectedDay.sections.length - 1}
                              className="p-1 rounded text-warm-300 hover:text-warm-700 disabled:opacity-30 transition-colors"
                            >
                              <IconChevronDown size={14} />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              title="Edit section"
                              onClick={() => openEditSection(section)}
                              className="p-1 rounded text-warm-400 hover:text-warm-700 transition-colors"
                            >
                              <IconEdit size={14} />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              title="Delete section"
                              onClick={() => setDeletingSectionId(section.id)}
                              className="p-1 rounded text-warm-400 hover:text-destructive transition-colors"
                            >
                              <IconTrash size={14} />
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Prescriptions */}
                      {section.prescriptions.length === 0 ? (
                        <div className="px-5 py-3 text-sm text-warm-400 italic">No exercises — add one below.</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-warm-50 text-xs text-warm-400">
                              <th className="py-2 pl-5 text-left font-medium">Exercise</th>
                              <th className="py-2 px-2 text-center font-medium">Sets</th>
                              <th className="py-2 px-2 text-center font-medium">Reps</th>
                              <th className="py-2 px-2 text-center font-medium">Load</th>
                              <th className="py-2 px-2 text-center font-medium">RPE</th>
                              {canEdit && <th className="py-2 pr-3 text-center font-medium w-20">Actions</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-warm-50">
                            {section.prescriptions.map((presc, pIdx) => (
                              <tr key={presc.id} className="hover:bg-warm-50/50 transition-colors group/row">
                                <td className="py-2.5 pl-5 text-warm-800">
                                  {presc.exercise_id
                                    ? (exerciseNameMap[presc.exercise_id] ?? 'Unknown exercise')
                                    : <span className="text-warm-400 italic">No exercise</span>}
                                  {presc.coaching_note && (
                                    <p className="text-eyebrow text-warm-400 mt-0.5 line-clamp-1">{presc.coaching_note}</p>
                                  )}
                                </td>
                                <td className="py-2.5 px-2 text-center text-warm-600">{presc.sets ?? '—'}</td>
                                <td className="py-2.5 px-2 text-center text-warm-600">{presc.reps ?? '—'}</td>
                                <td className="py-2.5 px-2 text-center text-warm-600">
                                  {presc.load_value != null
                                    ? `${presc.load_value}${presc.load_unit ? ` ${presc.load_unit}` : ''}`
                                    : '—'}
                                </td>
                                <td className="py-2.5 px-2 text-center text-warm-600">{presc.target_rpe ?? '—'}</td>
                                {canEdit && (
                                  <td className="py-2.5 pr-3">
                                    <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        title="Move up"
                                        onClick={() => handleMovePrescUp(presc, section)}
                                        disabled={isPending || pIdx === 0}
                                        className="p-0.5 rounded text-warm-300 hover:text-warm-600 disabled:opacity-30 transition-colors"
                                      >
                                        <IconChevronUp size={12} />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        title="Move down"
                                        onClick={() => handleMovePrescDown(presc, section)}
                                        disabled={isPending || pIdx === section.prescriptions.length - 1}
                                        className="p-0.5 rounded text-warm-300 hover:text-warm-600 disabled:opacity-30 transition-colors"
                                      >
                                        <IconChevronDown size={12} />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        title="Edit"
                                        onClick={() => openEditPresc(presc)}
                                        className="p-0.5 rounded text-warm-300 hover:text-warm-600 transition-colors"
                                      >
                                        <IconEdit size={12} />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        title="Remove"
                                        onClick={() => handleDeletePresc(presc.id)}
                                        disabled={isPending}
                                        className="p-0.5 rounded text-warm-300 hover:text-destructive transition-colors"
                                      >
                                        <IconX size={12} />
                                      </Button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {/* Add exercise button */}
                      {canEdit && (
                        <div className="px-5 py-2 border-t border-warm-50">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setPickerSectionId(section.id)}
                            className="flex items-center gap-1.5 text-xs text-warm-400 hover:text-primary-600 transition-colors"
                          >
                            <IconPlus size={12} /> Add exercise
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {/* Add section (bottom CTA) */}
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setAddSectionDayId(selectedDay.id);
                      setSectionName(''); setSectionType('main_strength');
                      setAddSectionError(null);
                    }}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-warm-200 py-3 text-sm text-warm-400 hover:text-primary-600 hover:border-primary-300 transition-colors"
                  >
                    <IconPlus size={14} /> Add section
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        )}
        </AnimatePresence>
      </main>

      {/* ================================================================ */}
      {/* MODALS                                                           */}
      {/* ================================================================ */}

      {/* Edit program meta */}
      {canEdit && (
        <Modal open={editingMeta} onClose={() => setEditingMeta(false)} title="Edit program">
          <div className="space-y-4 p-1">
            <div>
              <Input label="Name" value={metaName} onChange={(e) => setMetaName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <NativeSelect label="Phase" value={metaPhase} onChange={(e) => setMetaPhase(e.target.value as HelmLiftingProgramPhase)}>
                  {PHASE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
              </div>
              <div>
                <NativeSelect label="Status" value={metaStatus} onChange={(e) => setMetaStatus(e.target.value as HelmLiftingProgramStatus)}>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
              </div>
            </div>
            {metaError && <p className="text-sm text-destructive">{metaError}</p>}
            <div className="flex items-center justify-between pt-2">
              {program.status === 'draft' && (
                <Button variant="ghost" className="text-destructive hover:text-destructive/90" onClick={handleDelete} disabled={isPending}>
                  Delete program
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="ghost" onClick={() => setEditingMeta(false)}>Cancel</Button>
                <Button onClick={handleSaveMeta} disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Add week */}
      {canEdit && (
        <Modal open={showAddWeek} onClose={() => setShowAddWeek(false)} title="Add week">
          <div className="space-y-4 p-1">
            <div>
              <Input label="Week label (optional)" value={weekName} onChange={(e) => setWeekName(e.target.value)} placeholder="e.g. Heavy Load" />
            </div>
            <div>
              <Input label="Theme (optional)" value={weekTheme} onChange={(e) => setWeekTheme(e.target.value)} placeholder="e.g. Strength emphasis" />
            </div>
            <label htmlFor="week-deload" className="flex items-center gap-2 cursor-pointer">
              <Input
                id="week-deload"
                type="checkbox"
                checked={weekDeload}
                onChange={(e) => setWeekDeload(e.target.checked)}
                className="h-4 w-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-warm-700">Deload week</span>
            </label>
            {addWeekError && <p className="text-sm text-destructive">{addWeekError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowAddWeek(false)}>Cancel</Button>
              <Button onClick={handleAddWeek} disabled={isPending}>{isPending ? 'Adding…' : 'Add week'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add day */}
      {canEdit && (
        <Modal open={!!addDayWeekId} onClose={() => setAddDayWeekId(null)} title="Add day">
          <div className="space-y-4 p-1">
            <div>
              <Input label="Day name (optional)" value={dayName} onChange={(e) => setDayName(e.target.value)} placeholder="e.g. Upper A" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <NativeSelect label="Day type" value={dayType} onChange={(e) => setDayType(e.target.value as HelmLiftingDayType)}>
                  {DAY_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
              </div>
              <div>
                <Input
                  label="Est. minutes"
                  type="number"
                  min={0}
                  max={300}
                  value={dayMinutes}
                  onChange={(e) => setDayMinutes(e.target.value)}
                  placeholder="60"
                />
              </div>
            </div>
            {addDayError && <p className="text-sm text-destructive">{addDayError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setAddDayWeekId(null)}>Cancel</Button>
              <Button onClick={handleAddDay} disabled={isPending}>{isPending ? 'Adding…' : 'Add day'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit day */}
      {canEdit && (
        <Modal open={!!editingDay} onClose={() => setEditingDay(null)} title="Edit day">
          <div className="space-y-4 p-1">
            <div>
              <Input label="Day name" value={editDayName} onChange={(e) => setEditDayName(e.target.value)} placeholder="e.g. Upper A" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <NativeSelect label="Day type" value={editDayType} onChange={(e) => setEditDayType(e.target.value as HelmLiftingDayType)}>
                  {DAY_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
              </div>
              <div>
                <Input
                  label="Est. minutes"
                  type="number"
                  min={0}
                  max={300}
                  value={editDayMinutes}
                  onChange={(e) => setEditDayMinutes(e.target.value)}
                  placeholder="60"
                />
              </div>
            </div>
            {editDayError && <p className="text-sm text-destructive">{editDayError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditingDay(null)}>Cancel</Button>
              <Button onClick={handleEditDay} disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add section */}
      {canEdit && (
        <Modal open={!!addSectionDayId} onClose={() => setAddSectionDayId(null)} title="Add section">
          <div className="space-y-4 p-1">
            <div>
              <NativeSelect label="Section type" value={sectionType} onChange={(e) => setSectionType(e.target.value as HelmLiftingSectionType)}>
                {SECTION_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </NativeSelect>
            </div>
            <div>
              <Input label="Name (optional override)" value={sectionName} onChange={(e) => setSectionName(e.target.value)} placeholder="Leave blank to use type label" />
            </div>
            {addSectionError && <p className="text-sm text-destructive">{addSectionError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setAddSectionDayId(null)}>Cancel</Button>
              <Button onClick={handleAddSection} disabled={isPending}>{isPending ? 'Adding…' : 'Add section'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit section */}
      {canEdit && (
        <Modal open={!!editingSection} onClose={() => setEditingSection(null)} title="Edit section">
          <div className="space-y-4 p-1">
            <div>
              <Input label="Name" value={editSectionName} onChange={(e) => setEditSectionName(e.target.value)} />
            </div>
            <div>
              <NativeSelect label="Section type" value={editSectionType} onChange={(e) => setEditSectionType(e.target.value as HelmLiftingSectionType)}>
                {SECTION_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </NativeSelect>
            </div>
            {editSectionError && <p className="text-sm text-destructive">{editSectionError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditingSection(null)}>Cancel</Button>
              <Button onClick={handleEditSection} disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit prescription */}
      {canEdit && (
        <Modal open={!!editingPresc} onClose={() => setEditingPresc(null)} title="Edit prescription">
          <div className="space-y-4 p-1">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Input label="Sets" type="number" min={0} max={50} value={editSets} onChange={(e) => setEditSets(e.target.value)} placeholder="3" />
              </div>
              <div>
                <Input label="Reps" type="number" min={0} max={500} value={editReps} onChange={(e) => setEditReps(e.target.value)} placeholder="8" />
              </div>
              <div>
                <Input label="RPE" type="number" min={0} max={10} step={0.5} value={editRpe} onChange={(e) => setEditRpe(e.target.value)} placeholder="7" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input label="Load" type="number" min={0} value={editLoad} onChange={(e) => setEditLoad(e.target.value)} placeholder="135" />
              </div>
              <div>
                <Input label="Unit" value={editLoadUnit} onChange={(e) => setEditLoadUnit(e.target.value)} placeholder="lb" />
              </div>
            </div>
            <div>
              <Input label="Coaching note" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="e.g. Control the eccentric" />
            </div>
            {editPrescError && <p className="text-sm text-destructive">{editPrescError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditingPresc(null)}>Cancel</Button>
              <Button onClick={handleSavePresc} disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete week confirm */}
      {canEdit && (
        <Modal open={!!deletingWeekId} onClose={() => setDeletingWeekId(null)} title="Delete week?">
          <div className="space-y-4 p-1">
            <p className="text-sm text-warm-600">All days, sections, and prescriptions in this week will be permanently deleted. This cannot be undone.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setDeletingWeekId(null)}>Cancel</Button>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                onClick={() => deletingWeekId && handleDeleteWeek(deletingWeekId)}
                disabled={isPending}
              >
                {isPending ? 'Deleting…' : 'Delete week'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete day confirm */}
      {canEdit && (
        <Modal open={!!deletingDayId} onClose={() => setDeletingDayId(null)} title="Delete day?">
          <div className="space-y-4 p-1">
            <p className="text-sm text-warm-600">All sections and prescriptions in this day will be permanently deleted.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setDeletingDayId(null)}>Cancel</Button>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                onClick={() => deletingDayId && handleDeleteDay(deletingDayId)}
                disabled={isPending}
              >
                {isPending ? 'Deleting…' : 'Delete day'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete section confirm */}
      {canEdit && (
        <Modal open={!!deletingSectionId} onClose={() => setDeletingSectionId(null)} title="Delete section?">
          <div className="space-y-4 p-1">
            <p className="text-sm text-warm-600">All exercise prescriptions in this section will be deleted.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setDeletingSectionId(null)}>Cancel</Button>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                onClick={() => deletingSectionId && handleDeleteSection(deletingSectionId)}
                disabled={isPending}
              >
                {isPending ? 'Deleting…' : 'Delete section'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Publish modal */}
      {canEdit && (
        <Modal open={showPublish} onClose={() => setShowPublish(false)} title="Publish program">
          <div className="space-y-4 p-1">
            {publishResult ? (
              <div className="rounded-xl bg-primary-50 border border-primary-100 p-4 text-center">
                <p className="text-primary-700 font-medium">{publishResult}</p>
                <Button className="mt-3" onClick={() => setShowPublish(false)}>Done</Button>
              </div>
            ) : (
              <>
                <div>
                  <NativeSelect label="Assign to" value={publishTargetType} onChange={(e) => setPublishTargetType(e.target.value as 'team' | 'group' | 'player')}>
                    <option value="team">Whole team (all active athletes)</option>
                    <option value="group">A strength group</option>
                    <option value="player">A single athlete</option>
                  </NativeSelect>
                </div>
                {publishTargetType === 'group' && (
                  <div>
                    <NativeSelect label="Group" value={publishGroupId} onChange={(e) => setPublishGroupId(e.target.value)}>
                      <option value="">Select group…</option>
                      {assignContext.groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </NativeSelect>
                  </div>
                )}
                {publishTargetType === 'player' && (
                  <div>
                    <NativeSelect label="Athlete" value={publishAthleteId} onChange={(e) => setPublishAthleteId(e.target.value)}>
                      <option value="">Select athlete…</option>
                      {assignContext.athletes.map((a) => (
                        <option key={a.id} value={a.id}>
                          {[a.first_name, a.last_name].filter(Boolean).join(' ') || 'Unnamed'}
                          {a.position ? ` · ${a.position}` : ''}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                )}
                {publishError && <p className="text-sm text-destructive">{publishError}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setShowPublish(false)}>Cancel</Button>
                  <Button onClick={handlePublish} disabled={isPending}>
                    {isPending ? 'Publishing…' : 'Publish'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* Exercise picker */}
      {canEdit && (
        <ExercisePicker
          open={!!pickerSectionId}
          onClose={() => setPickerSectionId(null)}
          onSelect={handleExercisePicked}
          orgId={orgId}
          sport={program.sport as 'baseball' | 'golf'}
        />
      )}
    </div>
  );
}
