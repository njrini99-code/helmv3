'use client';

// =============================================================================
// src/components/lifting/programs/ProgramEditorClient.tsx
//
// Helm Lifting Lab — program editor. Native Lab UI consuming HelmLifting* types.
// Left rail = macrocycle tree (weeks → days). Right = selected day editor
// (sections → prescriptions). Primary action: Publish day to athletes.
// Cream/green palette; keyboard-accessible reorder (Move up / Move down).
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconClock, IconClipboardList, IconDumbbell,
} from '@/components/icons';
import {
  updateProgram, publishProgram, deleteProgram,
} from '@/app/lifting/actions/programs';
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
// Types (imported from the page for co-location)
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

const STATUS_META: Record<HelmLiftingProgramStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-primary-50 text-primary-700 border-primary-200' },
  draft: { label: 'Draft', cls: 'bg-warm-50 text-warm-700 border-warm-200' },
  archived: { label: 'Archived', cls: 'bg-warm-100 text-warm-500 border-warm-200' },
};

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ProgramEditorClient({ programTree, assignContext, orgId, canEdit }: Props) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();
  const { program, weeks, exerciseNameMap } = programTree;

  // Selected day for the right pane.
  const [selectedDayId, setSelectedDayId] = useState<string | null>(
    weeks[0]?.days[0]?.id ?? null,
  );

  // Publish modal state.
  const [showPublish, setShowPublish] = useState(false);
  const [publishTargetType, setPublishTargetType] = useState<'team' | 'group' | 'player'>('team');
  const [publishGroupId, setPublishGroupId] = useState('');
  const [publishAthleteId, setPublishAthleteId] = useState('');
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<string | null>(null);

  // Update program metadata.
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaName, setMetaName] = useState(program.name);
  const [metaPhase, setMetaPhase] = useState<HelmLiftingProgramPhase>(program.phase);
  const [metaStatus, setMetaStatus] = useState<HelmLiftingProgramStatus>(program.status);
  const [metaError, setMetaError] = useState<string | null>(null);

  const selectedDay = useMemo(() => {
    if (!selectedDayId) return null;
    for (const w of weeks) {
      const day = w.days.find((d) => d.id === selectedDayId);
      if (day) return day;
    }
    return null;
  }, [selectedDayId, weeks]);

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
        router.refresh();
      } else {
        setMetaError(result.error ?? 'Failed to save.');
      }
    });
  }

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
        router.refresh();
      } else {
        setPublishError(result.error ?? 'Publish failed.');
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteProgram({ orgId, programId: program.id });
      if (result.success) {
        router.push('/lifting/dashboard/programs');
      }
    });
  }

  return (
    <div className="flex h-full min-h-[700px]">
      {/* Left rail — macrocycle tree */}
      <aside className="w-72 shrink-0 border-r border-warm-100 bg-warm-50/50 p-4 overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/lifting/dashboard/programs" className="text-xs text-warm-400 hover:text-warm-700 transition-colors">
            ← Programs
          </Link>
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => setEditingMeta(true)}>
              Edit
            </Button>
          )}
        </div>

        {/* Program meta */}
        <div className="mb-4 rounded-xl bg-white/70 border border-white/20 p-3">
          <p className="font-semibold text-warm-900 text-sm line-clamp-2">{program.name}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_META[program.status].cls}`}>
              {STATUS_META[program.status].label}
            </span>
            <span className="text-[11px] text-warm-400">{program.phase}</span>
          </div>
        </div>

        {/* Week/day tree */}
        {weeks.length === 0 ? (
          <EmptyState
            icon={<IconClipboardList size={20} className="text-warm-300" />}
            title="No weeks yet"
            description="Add weeks to build your program."
          />
        ) : (
          <div className="space-y-2">
            {weeks.map((week) => (
              <div key={week.id} className="rounded-xl border border-warm-100 bg-white/70 overflow-hidden">
                <div className="px-3 py-2 text-xs font-semibold text-warm-500">
                  Week {week.week_number}{week.name ? ` — ${week.name}` : ''}{week.deload ? ' (Deload)' : ''}
                </div>
                <div className="pb-2">
                  {week.days.map((day) => (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => setSelectedDayId(day.id)}
                      className={`w-full px-4 py-1.5 text-left text-xs transition-colors ${
                        selectedDayId === day.id
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-warm-600 hover:bg-warm-50'
                      }`}
                    >
                      D{day.day_number} — {day.name ?? DAY_TYPE_OPTIONS.find((o) => o.value === day.day_type)?.label ?? day.day_type}
                      {day.estimated_minutes ? (
                        <span className="ml-1.5 text-[10px] text-warm-400">
                          <IconClock size={10} className="inline mr-0.5" />{day.estimated_minutes}m
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Publish program */}
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
      </aside>

      {/* Right pane — day editor */}
      <main className="flex-1 overflow-y-auto p-6">
        {!selectedDay ? (
          <EmptyState
            icon={<IconDumbbell size={28} className="text-warm-300" />}
            title="Select a day"
            description="Pick a day from the left rail to view and edit its exercises."
          />
        ) : (
          <motion.div
            key={selectedDay.id}
            initial={prefersReducedMotion ? false : { opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-warm-900">
                  Day {selectedDay.day_number}
                  {selectedDay.name ? ` — ${selectedDay.name}` : ''}
                </h2>
                <p className="text-sm text-warm-500">
                  {DAY_TYPE_OPTIONS.find((o) => o.value === selectedDay.day_type)?.label ?? selectedDay.day_type}
                  {selectedDay.estimated_minutes ? ` · ${selectedDay.estimated_minutes} min` : ''}
                </p>
              </div>
            </div>

            {selectedDay.sections.length === 0 ? (
              <EmptyState
                title="No sections"
                description="This day has no sections yet. Add sections via the program builder."
              />
            ) : (
              <div className="space-y-4">
                {selectedDay.sections.map((section) => (
                  <Card key={section.id} variant="overlay" className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="border-b border-warm-100 px-5 py-3 flex items-center justify-between bg-warm-50/50">
                        <div>
                          <span className="font-medium text-warm-800 text-sm">{section.name}</span>
                          <span className="ml-2 text-xs text-warm-400">
                            {SECTION_TYPE_OPTIONS.find((o) => o.value === section.section_type)?.label ?? section.section_type}
                          </span>
                        </div>
                      </div>

                      {/* Prescriptions */}
                      {section.prescriptions.length === 0 ? (
                        <div className="px-5 py-4 text-sm text-warm-400 italic">No exercises in this section.</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-warm-50 text-xs text-warm-400">
                              <th className="py-2 pl-5 text-left font-medium">Exercise</th>
                              <th className="py-2 px-3 text-center font-medium">Sets</th>
                              <th className="py-2 px-3 text-center font-medium">Reps</th>
                              <th className="py-2 px-3 text-center font-medium">Load</th>
                              <th className="py-2 pr-5 text-center font-medium">RPE</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-warm-50">
                            {section.prescriptions.map((presc) => (
                              <tr key={presc.id} className="hover:bg-warm-50/50 transition-colors">
                                <td className="py-2.5 pl-5 text-warm-800">
                                  {presc.exercise_id
                                    ? (exerciseNameMap[presc.exercise_id] ?? 'Unknown exercise')
                                    : <span className="text-warm-400 italic">No exercise</span>}
                                  {presc.coaching_note && (
                                    <p className="text-[11px] text-warm-400 mt-0.5 line-clamp-1">{presc.coaching_note}</p>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center text-warm-600">{presc.sets ?? '—'}</td>
                                <td className="py-2.5 px-3 text-center text-warm-600">{presc.reps ?? '—'}</td>
                                <td className="py-2.5 px-3 text-center text-warm-600">
                                  {presc.load_value != null ? `${presc.load_value}${presc.load_unit ? ` ${presc.load_unit}` : ''}` : '—'}
                                </td>
                                <td className="py-2.5 pr-5 text-center text-warm-600">{presc.target_rpe ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </main>

      {/* Edit meta modal */}
      {canEdit && (
        <Modal open={editingMeta} onClose={() => setEditingMeta(false)} title="Edit program">
          <div className="space-y-4 p-1">
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1">Name</label>
              <Input value={metaName} onChange={(e) => setMetaName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-1">Phase</label>
                <NativeSelect value={metaPhase} onChange={(e) => setMetaPhase(e.target.value as HelmLiftingProgramPhase)}>
                  {PHASE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-1">Status</label>
                <NativeSelect value={metaStatus} onChange={(e) => setMetaStatus(e.target.value as HelmLiftingProgramStatus)}>
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
              </div>
            </div>
            {metaError && <p className="text-sm text-red-600">{metaError}</p>}
            <div className="flex items-center justify-between pt-2">
              {program.status === 'draft' && (
                <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={handleDelete} disabled={isPending}>
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
                  <label className="block text-sm font-medium text-warm-700 mb-1">Assign to</label>
                  <NativeSelect value={publishTargetType} onChange={(e) => setPublishTargetType(e.target.value as 'team' | 'group' | 'player')}>
                    <option value="team">Whole team (all active athletes)</option>
                    <option value="group">A strength group</option>
                    <option value="player">A single athlete</option>
                  </NativeSelect>
                </div>
                {publishTargetType === 'group' && (
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">Group</label>
                    <NativeSelect value={publishGroupId} onChange={(e) => setPublishGroupId(e.target.value)}>
                      <option value="">Select group…</option>
                      {assignContext.groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </NativeSelect>
                  </div>
                )}
                {publishTargetType === 'player' && (
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1">Athlete</label>
                    <NativeSelect value={publishAthleteId} onChange={(e) => setPublishAthleteId(e.target.value)}>
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
                {publishError && <p className="text-sm text-red-600">{publishError}</p>}
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
    </div>
  );
}
