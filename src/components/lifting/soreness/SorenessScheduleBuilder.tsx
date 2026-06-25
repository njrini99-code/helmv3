'use client';

// =============================================================================
// src/components/lifting/soreness/SorenessScheduleBuilder.tsx
//
// Coach modal for creating / editing a soreness check schedule.
// Spec §4: Title, Assign to, Frequency, Due Window, Body Focus,
// Visibility, Instructions, Publish. Presets for common patterns.
// =============================================================================

import { useState, useCallback, useTransition } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

import {
  createSorenessCheckSchedule,
  updateSorenessCheckSchedule,
} from '@/app/lifting/actions/soreness';
import type {
  SorenessCheckSchedule,
  AssignmentType,
  FrequencyType,
  BodyFocus,
  SorenessVisibility,
} from '@/lib/types/helm-lifting-checkins';
import { IconX, IconCheck, IconCalendar, IconClock } from '@/components/icons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  orgId: string;
  sport: 'baseball' | 'golf';
  teamId?: string | null;
  /** If provided, the modal opens in edit mode. */
  existing?: SorenessCheckSchedule;
  onClose: () => void;
  onSaved: (scheduleId: string) => void;
}

interface FormState {
  title: string;
  assignmentType: AssignmentType;
  frequencyType: FrequencyType;
  daysOfWeek: number[];
  startDate: string;
  endDate: string;
  dueWindowStart: string;
  dueWindowEnd: string;
  bodyFocus: BodyFocus;
  visibility: SorenessVisibility;
  instructions: string;
  publishImmediately: boolean;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

type Preset = {
  label: string;
  apply: (f: FormState) => Partial<FormState>;
};

const PRESETS: Preset[] = [
  {
    label: 'Pitcher Daily Arm',
    apply: () => ({
      title: 'Pitcher Daily Arm Care Check',
      assignmentType: 'group',
      frequencyType: 'daily',
      dueWindowEnd: '10:00',
      bodyFocus: 'throwing_arm',
    }),
  },
  {
    label: 'Monday Full Body',
    apply: () => ({
      title: 'Weekly Full Body Check',
      assignmentType: 'team',
      frequencyType: 'weekly',
      daysOfWeek: [1],
      bodyFocus: 'full_body',
    }),
  },
  {
    label: 'Post-Game Recovery',
    apply: () => ({
      title: 'Post-Game Recovery Check',
      assignmentType: 'team',
      frequencyType: 'once',
      bodyFocus: 'full_body',
    }),
  },
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function initialState(existing?: SorenessCheckSchedule): FormState {
  if (existing) {
    return {
      title: existing.title,
      assignmentType: existing.assignment_type,
      frequencyType: existing.frequency_type,
      daysOfWeek: existing.days_of_week ?? [],
      startDate: existing.start_date,
      endDate: existing.end_date ?? '',
      dueWindowStart: existing.due_window_start ?? '',
      dueWindowEnd: existing.due_window_end ?? '',
      bodyFocus: existing.body_focus,
      visibility: existing.visibility,
      instructions: existing.instructions ?? '',
      publishImmediately: existing.status === 'published',
    };
  }
  return {
    title: '',
    assignmentType: 'team',
    frequencyType: 'daily',
    daysOfWeek: [],
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    dueWindowStart: '',
    dueWindowEnd: '',
    bodyFocus: 'full_body',
    visibility: 'performance_staff',
    instructions: '',
    publishImmediately: false,
  };
}

export function SorenessScheduleBuilder({
  orgId, sport, teamId, existing, onClose, onSaved,
}: Props) {
  const prefersReducedMotion = useReducedMotion();
  const [form, setForm] = useState<FormState>(() => initialState(existing));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  }, []);

  const applyPreset = useCallback(
    (p: Preset) => setForm((prev) => ({ ...prev, ...p.apply(prev) })),
    [],
  );

  const toggleDay = useCallback((d: number) => {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(d)
        ? prev.daysOfWeek.filter((x) => x !== d)
        : [...prev.daysOfWeek, d],
    }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setError(null);

    startTransition(async () => {
      try {
        if (existing) {
          const res = await updateSorenessCheckSchedule({
            orgId,
            scheduleId: existing.id,
            title: form.title,
            assignmentType: form.assignmentType,
            frequencyType: form.frequencyType,
            daysOfWeek: form.daysOfWeek.length > 0 ? form.daysOfWeek : null,
            startDate: form.startDate || undefined,
            endDate: form.endDate || null,
            dueWindowStart: form.dueWindowStart || null,
            dueWindowEnd: form.dueWindowEnd || null,
            bodyFocus: form.bodyFocus,
            visibility: form.visibility,
            instructions: form.instructions || null,
            status: form.publishImmediately ? 'published' : 'draft',
          });
          if (!res.success && res.error) { setError(res.error); return; }
          onSaved(existing.id);
        } else {
          const res = await createSorenessCheckSchedule({
            orgId,
            sport,
            teamId: teamId ?? null,
            title: form.title,
            assignmentType: form.assignmentType,
            frequencyType: form.frequencyType,
            daysOfWeek: form.daysOfWeek.length > 0 ? form.daysOfWeek : null,
            startDate: form.startDate,
            endDate: form.endDate || null,
            dueWindowStart: form.dueWindowStart || null,
            dueWindowEnd: form.dueWindowEnd || null,
            bodyFocus: form.bodyFocus,
            visibility: form.visibility,
            instructions: form.instructions || null,
            publishImmediately: form.publishImmediately,
          });
          if (!res.success && res.error) { setError(res.error); return; }
          if (res.scheduleId) onSaved(res.scheduleId);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save schedule.');
      }
    });
  }, [form, existing, orgId, sport, teamId, onSaved]);

  return (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          key="backdrop"
          className="fixed inset-0 z-40 bg-warm-900/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
          onClick={onClose}
          aria-hidden
        />

        {/* Modal */}
        <motion.div
          key="modal"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white/95 backdrop-blur-xl border border-white/30 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Schedule Soreness Check"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-warm-100 px-6 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary-600">
                  Soreness Check
                </p>
                <h2 className="text-lg font-semibold text-warm-900">
                  {existing ? 'Edit Schedule' : 'New Schedule'}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-warm-100 text-warm-500 hover:bg-warm-200 transition-colors"
                aria-label="Close"
              >
                <IconX size={16} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Presets */}
              {!existing && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-warm-500">
                    Quick presets
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                      <button
                        key={p.label}
                        onClick={() => applyPreset(p)}
                        className="rounded-full border border-warm-200 bg-warm-50 px-3 py-1.5 text-xs font-medium text-warm-700 hover:bg-warm-100 transition-colors"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-warm-800" htmlFor="sch-title">
                  Title
                </label>
                <input
                  id="sch-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="e.g. Pitcher Daily Arm Care Check"
                  maxLength={200}
                  className="w-full rounded-xl border border-warm-200 bg-warm-50 px-4 py-2.5 text-sm text-warm-900 placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>

              {/* Assign to */}
              <div>
                <p className="mb-1.5 text-sm font-medium text-warm-800">Assign to</p>
                <div className="flex gap-2">
                  {(['team', 'group', 'athlete'] as AssignmentType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => set('assignmentType', t)}
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium capitalize transition-all ${
                        form.assignmentType === t
                          ? 'border-primary-400 bg-primary-50 text-primary-800'
                          : 'border-warm-200 bg-warm-50 text-warm-600 hover:bg-warm-100'
                      }`}
                    >
                      {t === 'athlete' ? 'Individual' : t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Frequency */}
              <div>
                <p className="mb-1.5 text-sm font-medium text-warm-800">Frequency</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(['once', 'daily', 'weekly', 'custom'] as FrequencyType[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => set('frequencyType', f)}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium capitalize transition-all ${
                        form.frequencyType === f
                          ? 'border-primary-400 bg-primary-50 text-primary-800'
                          : 'border-warm-200 bg-warm-50 text-warm-600 hover:bg-warm-100'
                      }`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day of week picker for weekly/custom */}
              {(form.frequencyType === 'weekly' || form.frequencyType === 'custom') && (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-warm-800">Days</p>
                  <div className="flex gap-1.5">
                    {DAY_LABELS.map((label, i) => (
                      <button
                        key={i}
                        onClick={() => toggleDay(i)}
                        className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-all ${
                          form.daysOfWeek.includes(i)
                            ? 'border-primary-400 bg-primary-50 text-primary-800'
                            : 'border-warm-200 bg-warm-50 text-warm-500'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Start date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-warm-800" htmlFor="sch-start">
                    <IconCalendar size={13} className="inline mr-1" />
                    Start date
                  </label>
                  <input
                    id="sch-start"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => set('startDate', e.target.value)}
                    className="w-full rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5 text-sm text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-warm-800" htmlFor="sch-end">
                    <IconCalendar size={13} className="inline mr-1" />
                    End date <span className="font-normal text-warm-400">(optional)</span>
                  </label>
                  <input
                    id="sch-end"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => set('endDate', e.target.value)}
                    className="w-full rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5 text-sm text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  />
                </div>
              </div>

              {/* Due window */}
              <div>
                <p className="mb-1.5 text-sm font-medium text-warm-800">
                  <IconClock size={13} className="inline mr-1" />
                  Due window <span className="font-normal text-warm-400">(optional)</span>
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={form.dueWindowStart}
                    onChange={(e) => set('dueWindowStart', e.target.value)}
                    aria-label="Window start time"
                    className="flex-1 rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5 text-sm text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  />
                  <span className="text-warm-400 text-sm">to</span>
                  <input
                    type="time"
                    value={form.dueWindowEnd}
                    onChange={(e) => set('dueWindowEnd', e.target.value)}
                    aria-label="Window end time"
                    className="flex-1 rounded-xl border border-warm-200 bg-warm-50 px-3 py-2.5 text-sm text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  />
                </div>
              </div>

              {/* Body focus */}
              <div>
                <p className="mb-1.5 text-sm font-medium text-warm-800">Body focus</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['full_body', 'throwing_arm', 'lower_body', 'custom'] as BodyFocus[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => set('bodyFocus', f)}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium transition-all text-left ${
                        form.bodyFocus === f
                          ? 'border-primary-400 bg-primary-50 text-primary-800'
                          : 'border-warm-200 bg-warm-50 text-warm-600 hover:bg-warm-100'
                      }`}
                    >
                      {f === 'full_body' ? 'Full Body' :
                       f === 'throwing_arm' ? 'Throwing Arm' :
                       f === 'lower_body' ? 'Lower Body' : 'Custom'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Visibility */}
              <div>
                <p className="mb-1.5 text-sm font-medium text-warm-800">Visibility</p>
                <div className="space-y-1.5">
                  {([
                    ['performance_staff', 'Performance staff'],
                    ['staff', 'All staff'],
                    ['head_coach_only', 'Head coach only'],
                  ] as Array<[SorenessVisibility, string]>).map(([v, label]) => (
                    <label key={v} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="visibility"
                        value={v}
                        checked={form.visibility === v}
                        onChange={() => set('visibility', v)}
                        className="accent-primary-600"
                      />
                      <span className="text-sm text-warm-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Instructions */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-warm-800" htmlFor="sch-instructions">
                  Instructions <span className="font-normal text-warm-400">(optional)</span>
                </label>
                <textarea
                  id="sch-instructions"
                  value={form.instructions}
                  onChange={(e) => set('instructions', e.target.value)}
                  rows={2}
                  maxLength={1000}
                  placeholder="e.g. Mark anything above normal soreness."
                  className="w-full resize-none rounded-xl border border-warm-200 bg-warm-50 px-4 py-2.5 text-sm text-warm-900 placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>

              {/* Publish toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.publishImmediately}
                  onChange={(e) => set('publishImmediately', e.target.checked)}
                  className="accent-primary-600 h-4 w-4"
                />
                <span className="text-sm text-warm-700">Publish immediately</span>
              </label>

              {/* Error */}
              {error && (
                <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-2xl border border-warm-200 bg-warm-50 py-3.5 text-sm font-semibold text-warm-600 hover:bg-warm-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="flex-[2] flex items-center justify-center gap-2 rounded-2xl bg-primary-600 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 transition-all disabled:opacity-60"
                >
                  {isPending ? (
                    <>Saving…</>
                  ) : (
                    <>
                      <IconCheck size={16} />
                      {form.publishImmediately ? 'Publish Check' : 'Save Draft'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  );
}
