'use client';

// =============================================================================
// src/components/lifting/exercises/ExerciseLibraryClient.tsx
//
// Helm Lifting Lab — exercise library. Shows all org exercises (active + archived),
// lets coaches create, edit, and archive them. Cream/green palette; glass cards;
// skeleton-loaded state; honest empty state; framer-motion entry animations.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconPlus, IconSearch, IconDumbbell, IconEdit, IconTrash, IconCheck, IconX,
} from '@/components/icons';
import {
  createExercise,
  updateExercise,
  archiveExercise,
  restoreExercise,
} from '@/app/lifting/actions/programs';
import type {
  HelmLiftingExerciseRow,
  HelmLiftingExerciseCategory,
  HelmLiftingPrimaryPattern,
  HelmLiftingBodyRegion,
  HelmLiftingUnit,
} from '@/lib/types/helm-lifting-data';

// -----------------------------------------------------------------------------
// Vocabulary
// -----------------------------------------------------------------------------

const CATEGORY_OPTIONS: Array<{ value: HelmLiftingExerciseCategory; label: string }> = [
  { value: 'warmup', label: 'Warmup' },
  { value: 'power', label: 'Power' },
  { value: 'strength', label: 'Strength' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'arm_care', label: 'Arm care' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'conditioning', label: 'Conditioning' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'test', label: 'Test' },
];

const PATTERN_OPTIONS: Array<{ value: HelmLiftingPrimaryPattern; label: string }> = [
  { value: 'squat', label: 'Squat' },
  { value: 'hinge', label: 'Hinge' },
  { value: 'push', label: 'Push' },
  { value: 'pull', label: 'Pull' },
  { value: 'carry', label: 'Carry' },
  { value: 'rotate', label: 'Rotate' },
  { value: 'anti_rotate', label: 'Anti-rotate' },
  { value: 'sprint', label: 'Sprint' },
  { value: 'jump', label: 'Jump' },
  { value: 'throw', label: 'Throw' },
  { value: 'shoulder', label: 'Shoulder' },
  { value: 'elbow', label: 'Elbow' },
  { value: 'hip', label: 'Hip' },
  { value: 'ankle', label: 'Ankle' },
];

const REGION_OPTIONS: Array<{ value: HelmLiftingBodyRegion; label: string }> = [
  { value: 'lower', label: 'Lower body' },
  { value: 'upper', label: 'Upper body' },
  { value: 'trunk', label: 'Trunk / Core' },
  { value: 'arm', label: 'Arm' },
  { value: 'full_body', label: 'Full body' },
];

const UNIT_OPTIONS: Array<{ value: HelmLiftingUnit; label: string }> = [
  { value: 'lb', label: 'lbs' },
  { value: 'kg', label: 'kg' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'seconds', label: 'Seconds' },
  { value: 'yards', label: 'Yards' },
  { value: 'reps', label: 'Reps' },
  { value: 'mph', label: 'MPH' },
  { value: 'watts', label: 'Watts' },
  { value: 'mps', label: 'M/s' },
];

const CATEGORY_PILL: Record<string, string> = {
  power: 'bg-amber-50 text-amber-700 border-amber-200',
  strength: 'bg-primary-50 text-primary-700 border-primary-200',
  arm_care: 'bg-rose-50 text-rose-700 border-rose-200',
  conditioning: 'bg-sky-50 text-sky-700 border-sky-200',
  warmup: 'bg-green-50 text-green-700 border-green-200',
  mobility: 'bg-violet-50 text-violet-700 border-violet-200',
  accessory: 'bg-warm-50 text-warm-700 border-warm-200',
  recovery: 'bg-teal-50 text-teal-700 border-teal-200',
  test: 'bg-warm-100 text-warm-500 border-warm-200',
};

const CATEGORY_LABEL = Object.fromEntries(CATEGORY_OPTIONS.map((o) => [o.value, o.label]));

// -----------------------------------------------------------------------------
// Form state helpers
// -----------------------------------------------------------------------------

interface ExerciseFormState {
  name: string;
  category: HelmLiftingExerciseCategory;
  primaryPattern: HelmLiftingPrimaryPattern | '';
  bodyRegion: HelmLiftingBodyRegion | '';
  equipment: string;
  unilateral: boolean;
  defaultUnit: HelmLiftingUnit;
  instructions: string;
}

const BLANK_FORM: ExerciseFormState = {
  name: '',
  category: 'strength',
  primaryPattern: '',
  bodyRegion: '',
  equipment: '',
  unilateral: false,
  defaultUnit: 'lb',
  instructions: '',
};

function formFromRow(row: HelmLiftingExerciseRow): ExerciseFormState {
  return {
    name: row.name,
    category: row.category,
    primaryPattern: row.primary_pattern ?? '',
    bodyRegion: row.body_region ?? '',
    equipment: row.equipment ?? '',
    unilateral: row.unilateral,
    defaultUnit: row.default_unit,
    instructions: row.instructions ?? '',
  };
}

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

interface Props {
  exercises: HelmLiftingExerciseRow[];
  orgId: string;
  canEdit: boolean;
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

function CategoryPill({ category }: { category: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${CATEGORY_PILL[category] ?? 'bg-warm-50 text-warm-500 border-warm-200'}`}>
      {CATEGORY_LABEL[category] ?? category}
    </span>
  );
}

// -----------------------------------------------------------------------------
// ExerciseForm — shared create + edit form
// -----------------------------------------------------------------------------

interface ExerciseFormProps {
  form: ExerciseFormState;
  onChange: (f: ExerciseFormState) => void;
  error: string | null;
  isPending: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}

function ExerciseForm({ form, onChange, error, isPending, onSubmit, onCancel, submitLabel }: ExerciseFormProps) {
  const set = <K extends keyof ExerciseFormState>(key: K, value: ExerciseFormState[K]) =>
    onChange({ ...form, [key]: value });

  return (
    <div className="space-y-4 p-1">
      <div>
        <label className="block text-sm font-medium text-warm-700 mb-1">Name <span className="text-red-500">*</span></label>
        <Input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Back Squat"
          autoFocus
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">Category</label>
          <NativeSelect
            value={form.category}
            onChange={(e) => set('category', e.target.value as HelmLiftingExerciseCategory)}
          >
            {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </NativeSelect>
        </div>
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">Default unit</label>
          <NativeSelect
            value={form.defaultUnit}
            onChange={(e) => set('defaultUnit', e.target.value as HelmLiftingUnit)}
          >
            {UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </NativeSelect>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">Movement pattern</label>
          <NativeSelect
            value={form.primaryPattern}
            onChange={(e) => set('primaryPattern', e.target.value as HelmLiftingPrimaryPattern | '')}
          >
            <option value="">None</option>
            {PATTERN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </NativeSelect>
        </div>
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">Body region</label>
          <NativeSelect
            value={form.bodyRegion}
            onChange={(e) => set('bodyRegion', e.target.value as HelmLiftingBodyRegion | '')}
          >
            <option value="">None</option>
            {REGION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </NativeSelect>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">Equipment</label>
          <Input
            value={form.equipment}
            onChange={(e) => set('equipment', e.target.value)}
            placeholder="e.g. Barbell, Dumbbell…"
          />
        </div>
        <div className="flex items-end pb-0.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.unilateral}
              onChange={(e) => set('unilateral', e.target.checked)}
              className="h-4 w-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-warm-700">Unilateral</span>
          </label>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-warm-700 mb-1">Instructions</label>
        <Textarea
          value={form.instructions}
          onChange={(e) => set('instructions', e.target.value)}
          placeholder="Optional coaching cues or setup notes…"
          rows={2}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel} disabled={isPending}>Cancel</Button>
        <Button onClick={onSubmit} disabled={isPending || !form.name.trim()}>
          {isPending ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------------

export function ExerciseLibraryClient({ exercises: initial, orgId: _orgId, canEdit }: Props) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<ExerciseFormState>(BLANK_FORM);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit modal
  const [editingRow, setEditingRow] = useState<HelmLiftingExerciseRow | null>(null);
  const [editForm, setEditForm] = useState<ExerciseFormState>(BLANK_FORM);
  const [editError, setEditError] = useState<string | null>(null);

  // Archive confirm
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // ---- Filtering ----
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return initial.filter((ex) => {
      if (!showArchived && !ex.is_active) return false;
      if (showArchived && ex.is_active) return false;
      if (categoryFilter && ex.category !== categoryFilter) return false;
      if (q && !ex.name.toLowerCase().includes(q) && !(ex.equipment ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [initial, search, categoryFilter, showArchived]);

  const activeCount = initial.filter((e) => e.is_active).length;
  const archivedCount = initial.filter((e) => !e.is_active).length;

  // ---- Handlers ----
  function handleCreate() {
    if (!createForm.name.trim()) { setCreateError('Name is required.'); return; }
    setCreateError(null);
    startTransition(async () => {
      const result = await createExercise({
        name: createForm.name.trim(),
        category: createForm.category,
        primaryPattern: createForm.primaryPattern || null,
        bodyRegion: createForm.bodyRegion || null,
        equipment: createForm.equipment.trim() || null,
        unilateral: createForm.unilateral,
        defaultUnit: createForm.defaultUnit,
        instructions: createForm.instructions.trim() || null,
      });
      if (result.success) {
        setShowCreate(false);
        setCreateForm(BLANK_FORM);
        router.refresh();
      } else {
        setCreateError(result.error ?? 'Failed to create exercise.');
      }
    });
  }

  function openEdit(row: HelmLiftingExerciseRow) {
    setEditingRow(row);
    setEditForm(formFromRow(row));
    setEditError(null);
  }

  function handleEdit() {
    if (!editingRow || !editForm.name.trim()) { setEditError('Name is required.'); return; }
    setEditError(null);
    startTransition(async () => {
      const result = await updateExercise({
        exerciseId: editingRow.id,
        name: editForm.name.trim(),
        category: editForm.category,
        primaryPattern: editForm.primaryPattern || null,
        bodyRegion: editForm.bodyRegion || null,
        equipment: editForm.equipment.trim() || null,
        unilateral: editForm.unilateral,
        defaultUnit: editForm.defaultUnit,
        instructions: editForm.instructions.trim() || null,
      });
      if (result.success) {
        setEditingRow(null);
        router.refresh();
      } else {
        setEditError(result.error ?? 'Failed to update exercise.');
      }
    });
  }

  function handleArchive(id: string) {
    setArchiveError(null);
    startTransition(async () => {
      const result = await archiveExercise({ exerciseId: id });
      if (result.success) {
        setArchivingId(null);
        router.refresh();
      } else {
        setArchiveError(result.error ?? 'Failed to archive exercise.');
      }
    });
  }

  function handleRestore(id: string) {
    startTransition(async () => {
      await restoreExercise({ exerciseId: id });
      router.refresh();
    });
  }

  // ---- Render ----
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-warm-900">Exercise Library</h1>
          <p className="mt-0.5 text-sm text-warm-500">
            {activeCount} exercise{activeCount !== 1 ? 's' : ''} in this org
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => { setCreateForm(BLANK_FORM); setCreateError(null); setShowCreate(true); }}
            className="gap-1.5 shrink-0"
          >
            <IconPlus size={15} /> New exercise
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-xs">
          <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exercises…"
            className="pl-8"
          />
        </div>
        <NativeSelect
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-44"
        >
          <option value="">All categories</option>
          {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </NativeSelect>
        {archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className={`text-sm rounded-full border px-3 py-1 transition-colors ${showArchived ? 'bg-warm-200 border-warm-300 text-warm-700' : 'border-warm-100 text-warm-400 hover:text-warm-600'}`}
          >
            {showArchived ? `Showing archived (${archivedCount})` : `View archived (${archivedCount})`}
          </button>
        )}
      </div>

      {/* List */}
      {initial.length === 0 ? (
        <EmptyState
          icon={<IconDumbbell size={28} className="text-warm-300" />}
          title="No exercises yet"
          description={canEdit ? 'Create your first exercise to build out the library.' : 'No exercises have been created yet.'}
          action={
            canEdit ? (
              <Button
                onClick={() => { setCreateForm(BLANK_FORM); setCreateError(null); setShowCreate(true); }}
                className="gap-1.5"
              >
                <IconPlus size={15} /> New exercise
              </Button>
            ) : undefined
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={showArchived ? 'No archived exercises' : 'No matching exercises'}
          description={search || categoryFilter ? 'Try adjusting your filters.' : 'Nothing to show here.'}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((ex, idx) => (
            <motion.div
              key={ex.id}
              layout
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: Math.min(idx * 0.03, 0.3) }}
            >
              <Card variant="overlay" className={`overflow-hidden h-full ${!ex.is_active ? 'opacity-60' : ''}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-warm-900 text-sm leading-snug line-clamp-2">
                      {ex.name}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      {canEdit && ex.is_active && (
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => openEdit(ex)}
                          className="p-1 rounded-lg text-warm-400 hover:text-warm-700 hover:bg-warm-100 transition-colors"
                        >
                          <IconEdit size={14} />
                        </button>
                      )}
                      {canEdit && ex.is_active && (
                        <button
                          type="button"
                          title="Archive"
                          onClick={() => { setArchivingId(ex.id); setArchiveError(null); }}
                          className="p-1 rounded-lg text-warm-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <IconTrash size={14} />
                        </button>
                      )}
                      {canEdit && !ex.is_active && (
                        <button
                          type="button"
                          title="Restore"
                          onClick={() => handleRestore(ex.id)}
                          disabled={isPending}
                          className="p-1 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                        >
                          <IconCheck size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <CategoryPill category={ex.category} />
                    {ex.primary_pattern && (
                      <span className="inline-flex items-center rounded-full border border-warm-100 bg-warm-50 px-2 py-0.5 text-[10px] text-warm-500">
                        {ex.primary_pattern.replace('_', ' ')}
                      </span>
                    )}
                    {ex.unilateral && (
                      <span className="inline-flex items-center rounded-full border border-warm-100 bg-warm-50 px-2 py-0.5 text-[10px] text-warm-500">
                        Unilateral
                      </span>
                    )}
                  </div>

                  {ex.equipment && (
                    <p className="text-xs text-warm-400 truncate">{ex.equipment}</p>
                  )}

                  {!ex.is_active && (
                    <p className="text-[11px] text-warm-400 italic">Archived</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {canEdit && (
        <Modal
          open={showCreate}
          onClose={() => { setShowCreate(false); setCreateError(null); }}
          title="New exercise"
        >
          <ExerciseForm
            form={createForm}
            onChange={setCreateForm}
            error={createError}
            isPending={isPending}
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
            submitLabel="Create exercise"
          />
        </Modal>
      )}

      {/* Edit modal */}
      {canEdit && (
        <Modal
          open={!!editingRow}
          onClose={() => { setEditingRow(null); setEditError(null); }}
          title="Edit exercise"
        >
          <ExerciseForm
            form={editForm}
            onChange={setEditForm}
            error={editError}
            isPending={isPending}
            onSubmit={handleEdit}
            onCancel={() => setEditingRow(null)}
            submitLabel="Save changes"
          />
        </Modal>
      )}

      {/* Archive confirm modal */}
      {canEdit && (
        <Modal
          open={!!archivingId}
          onClose={() => { setArchivingId(null); setArchiveError(null); }}
          title="Archive exercise?"
        >
          <div className="space-y-4 p-1">
            <p className="text-sm text-warm-600">
              This exercise will be hidden from the library and exercise picker. It won't be removed
              from existing programs or sessions. You can restore it at any time.
            </p>
            {archiveError && <p className="text-sm text-red-600">{archiveError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setArchivingId(null)} disabled={isPending}>
                <IconX size={14} className="mr-1" /> Cancel
              </Button>
              <Button
                variant="ghost"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => archivingId && handleArchive(archivingId)}
                disabled={isPending}
              >
                <IconTrash size={14} className="mr-1" />
                {isPending ? 'Archiving…' : 'Archive'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
